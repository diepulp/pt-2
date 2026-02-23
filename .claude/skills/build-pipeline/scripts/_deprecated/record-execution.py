#!/usr/bin/env python3
"""
DEPRECATED: This script is no longer used by prd-pipeline.

The self-improvement loop has been replaced with deterministic context file
validation. Pipeline outcomes are no longer recorded to Memori for learning.

For pipeline validation, use:
    python .claude/skills/prd-pipeline/scripts/validate-execution-spec.py

This script is preserved for historical analysis only.

---

Record pipeline execution outcome to Memori.

Usage:
    uv run .claude/skills/prd-pipeline/scripts/record-execution.py \
        --checkpoint .claude/skills/prd-pipeline/checkpoints/PRD-XXX.json

    uv run .claude/skills/prd-pipeline/scripts/record-execution.py \
        --checkpoint .claude/skills/prd-pipeline/checkpoints/PRD-XXX.json \
        --lessons "Lesson 1" "Lesson 2"
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime


def main():
    parser = argparse.ArgumentParser(description="Record pipeline execution to Memori")
    parser.add_argument("--checkpoint", required=True, help="Path to checkpoint JSON")
    parser.add_argument("--lessons", nargs="*", help="Lessons learned")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be recorded without saving")
    args = parser.parse_args()

    # Load checkpoint
    checkpoint_path = Path(args.checkpoint)
    if not checkpoint_path.exists():
        print(f"ERROR: Checkpoint not found: {checkpoint_path}")
        sys.exit(1)

    with open(checkpoint_path) as f:
        checkpoint = json.load(f)

    # Determine outcome
    status = checkpoint.get("status", "unknown")
    if status == "complete":
        outcome = "success"
    elif status == "failed":
        outcome = "failure"
    else:
        outcome = "partial"

    # Calculate metrics
    completed_ws = checkpoint.get("completed_workstreams", [])
    pending_ws = checkpoint.get("pending_workstreams", [])
    deferred_ws = checkpoint.get("deferred_workstreams", [])
    current_phase = checkpoint.get("current_phase", 0)

    # Calculate duration if timestamps available
    duration = 0
    if checkpoint.get("start_time") and checkpoint.get("end_time"):
        try:
            start = datetime.fromisoformat(checkpoint["start_time"])
            end = datetime.fromisoformat(checkpoint["end_time"])
            duration = int((end - start).total_seconds())
        except (ValueError, TypeError):
            pass

    # Extract architecture fix if present
    arch_fixes = []
    if checkpoint.get("architecture_fix"):
        fix = checkpoint["architecture_fix"]
        if fix.get("resolution"):
            arch_fixes.append(fix["resolution"])

    # Extract gate failures
    gate_failures = []
    if checkpoint.get("gate_failures"):
        gate_failures = checkpoint["gate_failures"]

    prd_id = checkpoint.get("prd", "unknown")
    prd_title = checkpoint.get("prd_title", "Unknown PRD")

    print("=" * 60)
    print(f"PIPELINE EXECUTION RECORD: {prd_id}")
    print("=" * 60)
    print(f"Title: {prd_title}")
    print(f"Outcome: {outcome}")
    print(f"Phase: {current_phase}")
    print(f"Completed: {len(completed_ws)} workstreams")
    print(f"Pending: {len(pending_ws)} workstreams")
    print(f"Deferred: {len(deferred_ws)} workstreams")
    if duration:
        print(f"Duration: {duration}s")
    if args.lessons:
        print(f"Lessons: {', '.join(args.lessons)}")
    print("=" * 60)

    if args.dry_run:
        print("\n[DRY RUN] Would record the above to Memori")
        print("Run without --dry-run to actually record.")
        return

    # Initialize Memori
    try:
        from lib.memori import create_memori_client
        from lib.memori.pipeline_context import PipelineContext

        memori = create_memori_client("skill:prd-pipeline")
        memori.enable()
        context = PipelineContext(memori)
    except ImportError as e:
        print(f"WARNING: Failed to import Memori: {e}")
        print("Skipping Memori recording.")
        sys.exit(0)
    except Exception as e:
        print(f"WARNING: Memori not available: {e}")
        sys.exit(0)

    # Record pipeline execution
    success = context.record_pipeline_execution(
        prd_id=prd_id,
        prd_title=prd_title,
        outcome=outcome,
        duration_seconds=duration,
        phases_completed=current_phase,
        total_phases=len(completed_ws) + len(pending_ws) + len(deferred_ws),
        workstreams_completed=completed_ws,
        workstreams_failed=deferred_ws if deferred_ws else None,
        gate_failures=gate_failures if gate_failures else None,
        lessons_learned=args.lessons,
        architecture_fixes=arch_fixes if arch_fixes else None
    )

    if success:
        print(f"\n✅ Recorded pipeline execution: {prd_id} ({outcome})")
    else:
        print(f"\n❌ Failed to record pipeline execution")

    # Record individual workstream outcomes if available
    if checkpoint.get("workstream_outcomes"):
        print("\nRecording workstream outcomes...")
        for ws_id, ws_data in checkpoint["workstream_outcomes"].items():
            ws_success = context.record_workstream_outcome(
                prd_id=prd_id,
                workstream_id=ws_id,
                workstream_name=ws_data.get("name", ws_id),
                executor=ws_data.get("executor", "unknown"),
                outcome=ws_data.get("outcome", "unknown"),
                gate_type=ws_data.get("gate_type", "unknown"),
                gate_passed=ws_data.get("gate_passed", False),
                duration_seconds=ws_data.get("duration_seconds"),
                artifacts_created=ws_data.get("artifacts_created"),
                issues_encountered=ws_data.get("issues_encountered"),
                auto_fixed=ws_data.get("auto_fixed", False)
            )
            status_icon = "✓" if ws_success else "✗"
            print(f"  {status_icon} {ws_id}: {ws_data.get('outcome', 'unknown')}")

    # Check for regressions
    print("\nChecking for regressions...")
    regressions = context.detect_pipeline_regressions()
    if regressions:
        print("\n⚠️  REGRESSIONS DETECTED:")
        for r in regressions:
            print(f"  - {r.metric}: {r.current_value:.0%} (baseline: {r.baseline_value:.0%})")
            print(f"    Suspected cause: {r.suspected_cause}")
    else:
        print("  No regressions detected.")

    # Generate learning report
    print("\n" + "=" * 60)
    print(context.format_learning_report())


if __name__ == "__main__":
    main()
