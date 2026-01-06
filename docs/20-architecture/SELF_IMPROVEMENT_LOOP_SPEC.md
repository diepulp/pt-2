# Self-Improvement Loop Specification

> **PRD-PIPELINE Enhancement**: Adaptive learning mechanisms for pipeline orchestration using Memori integration.

**Status**: Draft
**Author**: Claude Code
**Created**: 2026-01-06
**Category**: ARCH (Architecture)

---

## Executive Summary

This specification defines the self-improvement loop pattern for the `prd-pipeline` skill. The implementation leverages existing Memori infrastructure to enable:

1. **Pre-execution recall** - Query past pipeline outcomes before generating EXECUTION-SPECs
2. **Outcome recording** - Persist execution results for future learning
3. **Regression detection** - Alert when patterns start failing
4. **Adaptive recommendations** - Weight executor selection by historical success

**Design Principle**: Option C (Hybrid) - Shared Memori infrastructure, domain-specific critic logic.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SELF-IMPROVEMENT LOOP                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │  PRE-EXEC    │    │   EXECUTE    │    │ POST-EXEC    │               │
│  │   RECALL     │───▶│   PIPELINE   │───▶│  RECORD      │               │
│  └──────────────┘    └──────────────┘    └──────────────┘               │
│         │                   │                   │                        │
│         │                   ▼                   │                        │
│         │           ┌──────────────┐           │                        │
│         │           │ GATE FAILURE │           │                        │
│         │           │   ANALYSIS   │           │                        │
│         │           └──────────────┘           │                        │
│         │                   │                   │                        │
│         ▼                   ▼                   ▼                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    MEMORI (arch_decisions)                       │    │
│  │  pipeline_execution | workstream_outcome | gate_failure          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Workstreams

### Parallel Execution Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Foundation (Parallel)                                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  WS1: PipelineContext Class        WS2: Critic Checklist                │
│  ├── pipeline_context.py           ├── critic-checklist.md              │
│  └── __init__.py export            └── critic-protocol.md               │
│                                                                          │
│  [backend-service-builder]         [lead-architect]                     │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│ PHASE 2: Integration (Depends on WS1)                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  WS3: Recording Scripts            WS4: Query Scripts                   │
│  ├── record-execution.py           ├── query-learnings.py               │
│  └── record-gate-failure.py        └── format-injection.py              │
│                                                                          │
│  [backend-service-builder]         [backend-service-builder]            │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│ PHASE 3: Skill Update (Depends on WS3, WS4)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  WS5: SKILL.md Integration                                              │
│  ├── Pre-execution hook                                                 │
│  ├── Post-completion hook                                               │
│  └── Gate failure analysis                                              │
│                                                                          │
│  [skill-creator / manual]                                               │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│ PHASE 4: Validation (Depends on WS5)                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  WS6: End-to-End Test                                                   │
│  ├── Execute sample PRD                                                 │
│  ├── Verify Memori records                                              │
│  └── Verify recall injection                                            │
│                                                                          │
│  [qa-specialist]                                                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## WS1: PipelineContext Class

### File: `lib/memori/pipeline_context.py`

```python
#!/usr/bin/env python3
"""
Self-Improving Intelligence for prd-pipeline skill.

Tracks pipeline execution outcomes and provides adaptive recommendations
based on historical success rates.
"""

from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
from loguru import logger

from .client import MemoriClient
from .skill_context import ValidationContext


@dataclass
class ExecutorStats:
    """Statistics for an executor (skill)."""
    executor: str
    total_executions: int
    successful: int
    failed: int
    success_rate: float
    avg_duration_seconds: float
    common_issues: List[str]
    trend: str  # "improving", "stable", "declining"


@dataclass
class GateStats:
    """Statistics for a gate type."""
    gate_type: str
    total_checks: int
    passed: int
    failed: int
    pass_rate: float
    common_failure_patterns: List[str]
    auto_fix_rate: float


@dataclass
class PipelineRegressionAlert:
    """Alert for pipeline regression."""
    metric: str
    baseline_value: float
    current_value: float
    decline_percentage: float
    suspected_cause: str
    affected_prds: List[str]
    detected_at: str


class PipelineContext(ValidationContext):
    """
    Self-improving context for prd-pipeline skill.

    Extends ValidationContext with learning mechanisms for:
    - Pipeline execution outcome tracking
    - EXECUTION-SPEC quality metrics
    - Workstream success rates by executor
    - Gate pass/fail patterns
    - Regression detection
    """

    SKILL_NAMESPACE = "skill:prd-pipeline"

    # Thresholds
    REGRESSION_THRESHOLD = 0.15  # 15% decline triggers alert
    MIN_SAMPLES_FOR_STATS = 3    # Need at least 3 executions

    def __init__(self, memori_client: MemoriClient):
        super().__init__(memori_client)
        self._executor_cache: Dict[str, ExecutorStats] = {}
        self._cache_timestamp: Optional[datetime] = None
        self._cache_ttl = timedelta(minutes=15)

    # -------------------------------------------------------------------------
    # Recording Methods
    # -------------------------------------------------------------------------

    def record_pipeline_execution(
        self,
        prd_id: str,
        prd_title: str,
        outcome: str,  # "success", "failure", "partial"
        duration_seconds: int,
        phases_completed: int,
        total_phases: int,
        workstreams_completed: List[str],
        workstreams_failed: Optional[List[str]] = None,
        gate_failures: Optional[List[Dict[str, Any]]] = None,
        lessons_learned: Optional[List[str]] = None,
        architecture_fixes: Optional[List[str]] = None
    ) -> bool:
        """Record complete pipeline execution outcome."""
        if not self.memori.enabled:
            return False

        content = f"Pipeline execution {prd_id}: {outcome} ({phases_completed}/{total_phases} phases)"

        metadata = {
            "type": "pipeline_execution",
            "prd_id": prd_id,
            "prd_title": prd_title,
            "outcome": outcome,
            "duration_seconds": duration_seconds,
            "phases_completed": phases_completed,
            "total_phases": total_phases,
            "workstreams_completed": workstreams_completed,
            "timestamp": datetime.now().isoformat(),
        }

        if workstreams_failed:
            metadata["workstreams_failed"] = workstreams_failed
        if gate_failures:
            metadata["gate_failures"] = gate_failures
        if lessons_learned:
            metadata["lessons_learned"] = lessons_learned
        if architecture_fixes:
            metadata["architecture_fixes"] = architecture_fixes

        tags = ["pipeline-execution", outcome, prd_id]

        return self.memori.record_memory(
            content=content,
            category="skills",
            metadata=metadata,
            importance=0.85,
            tags=tags
        ) is not None

    def record_workstream_outcome(
        self,
        prd_id: str,
        workstream_id: str,
        workstream_name: str,
        executor: str,
        outcome: str,  # "success", "failure"
        gate_type: str,
        gate_passed: bool,
        duration_seconds: Optional[int] = None,
        artifacts_created: Optional[List[str]] = None,
        issues_encountered: Optional[List[str]] = None,
        auto_fixed: bool = False
    ) -> bool:
        """Record individual workstream outcome."""
        if not self.memori.enabled:
            return False

        content = f"Workstream {workstream_id} ({executor}): {outcome}"

        metadata = {
            "type": "workstream_outcome",
            "prd_id": prd_id,
            "workstream_id": workstream_id,
            "workstream_name": workstream_name,
            "executor": executor,
            "outcome": outcome,
            "gate_type": gate_type,
            "gate_passed": gate_passed,
            "auto_fixed": auto_fixed,
            "timestamp": datetime.now().isoformat(),
        }

        if duration_seconds:
            metadata["duration_seconds"] = duration_seconds
        if artifacts_created:
            metadata["artifacts_created"] = artifacts_created
        if issues_encountered:
            metadata["issues_encountered"] = issues_encountered

        tags = ["workstream-outcome", outcome, executor.replace(":", "-")]

        return self.memori.record_memory(
            content=content,
            category="skills",
            metadata=metadata,
            importance=0.80,
            tags=tags
        ) is not None

    def record_gate_failure(
        self,
        prd_id: str,
        workstream_id: str,
        gate_type: str,
        error_pattern: str,
        error_message: str,
        file_location: Optional[str] = None,
        suggested_fix: Optional[str] = None,
        auto_fixed: bool = False,
        fix_applied: Optional[str] = None
    ) -> bool:
        """Record gate failure for pattern learning."""
        if not self.memori.enabled:
            return False

        content = f"Gate failure {gate_type} in {workstream_id}: {error_pattern}"

        metadata = {
            "type": "gate_failure",
            "prd_id": prd_id,
            "workstream_id": workstream_id,
            "gate_type": gate_type,
            "error_pattern": error_pattern,
            "error_message": error_message[:500],  # Truncate
            "auto_fixed": auto_fixed,
            "timestamp": datetime.now().isoformat(),
        }

        if file_location:
            metadata["file_location"] = file_location
        if suggested_fix:
            metadata["suggested_fix"] = suggested_fix
        if fix_applied:
            metadata["fix_applied"] = fix_applied

        tags = ["gate-failure", gate_type, error_pattern.replace(" ", "-")[:30]]

        # High importance for failures - we learn most from failures
        return self.memori.record_memory(
            content=content,
            category="validation",
            metadata=metadata,
            importance=0.90,
            tags=tags
        ) is not None

    def record_exec_spec_quality(
        self,
        prd_id: str,
        workstream_count: int,
        phase_count: int,
        critic_issues_found: int,
        refinement_iterations: int,
        validation_passed: bool,
        issues_by_category: Optional[Dict[str, int]] = None
    ) -> bool:
        """Record EXECUTION-SPEC generation quality metrics."""
        if not self.memori.enabled:
            return False

        content = f"EXEC-SPEC quality {prd_id}: {workstream_count} WS, {critic_issues_found} issues"

        metadata = {
            "type": "exec_spec_quality",
            "prd_id": prd_id,
            "workstream_count": workstream_count,
            "phase_count": phase_count,
            "critic_issues_found": critic_issues_found,
            "refinement_iterations": refinement_iterations,
            "validation_passed": validation_passed,
            "timestamp": datetime.now().isoformat(),
        }

        if issues_by_category:
            metadata["issues_by_category"] = issues_by_category

        tags = ["exec-spec-quality", "passed" if validation_passed else "failed"]

        return self.memori.record_memory(
            content=content,
            category="validation",
            metadata=metadata,
            importance=0.75,
            tags=tags
        ) is not None

    # -------------------------------------------------------------------------
    # Analytics Methods
    # -------------------------------------------------------------------------

    def calculate_executor_effectiveness(
        self,
        executor: str,
        days: int = 90
    ) -> Optional[ExecutorStats]:
        """Calculate success rate and trends for a specific executor."""
        if not self.memori.enabled:
            return None

        try:
            import psycopg2
            import json

            db_url = self.memori.config.database_url.split('?')[0]
            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.execute("SET search_path TO memori, public")

            cutoff_date = datetime.now() - timedelta(days=days)

            cur.execute("""
                SELECT
                    metadata->>'outcome' as outcome,
                    metadata->>'duration_seconds' as duration,
                    metadata->>'issues_encountered' as issues,
                    created_at
                FROM memori.memories
                WHERE user_id = %s
                  AND metadata->>'type' = 'workstream_outcome'
                  AND metadata->>'executor' = %s
                  AND created_at >= %s
            """, (self.memori.user_id, executor, cutoff_date))

            rows = cur.fetchall()
            cur.close()
            conn.close()

            if len(rows) < self.MIN_SAMPLES_FOR_STATS:
                return None

            total = len(rows)
            successful = sum(1 for r in rows if r[0] == 'success')
            failed = sum(1 for r in rows if r[0] == 'failure')

            durations = [float(r[1]) for r in rows if r[1]]
            avg_duration = sum(durations) / len(durations) if durations else 0

            # Aggregate issues
            all_issues = []
            for r in rows:
                if r[2]:
                    issues = json.loads(r[2]) if isinstance(r[2], str) else r[2]
                    all_issues.extend(issues)

            issue_counts = {}
            for issue in all_issues:
                issue_counts[issue] = issue_counts.get(issue, 0) + 1
            common_issues = sorted(issue_counts.keys(),
                                   key=lambda x: issue_counts[x],
                                   reverse=True)[:5]

            # Calculate trend
            cutoff_30 = datetime.now() - timedelta(days=30)
            recent = [r for r in rows if r[3] >= cutoff_30]
            if len(recent) >= 2:
                recent_rate = sum(1 for r in recent if r[0] == 'success') / len(recent)
            else:
                recent_rate = successful / total

            overall_rate = successful / total

            if recent_rate > overall_rate + 0.1:
                trend = "improving"
            elif recent_rate < overall_rate - 0.1:
                trend = "declining"
            else:
                trend = "stable"

            return ExecutorStats(
                executor=executor,
                total_executions=total,
                successful=successful,
                failed=failed,
                success_rate=overall_rate,
                avg_duration_seconds=avg_duration,
                common_issues=common_issues,
                trend=trend
            )

        except Exception as e:
            logger.error(f"Failed to calculate executor effectiveness: {e}")
            return None

    def calculate_gate_pass_rate(
        self,
        gate_type: str,
        days: int = 90
    ) -> Optional[GateStats]:
        """Calculate pass rate for a specific gate type."""
        if not self.memori.enabled:
            return None

        try:
            import psycopg2
            import json

            db_url = self.memori.config.database_url.split('?')[0]
            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.execute("SET search_path TO memori, public")

            cutoff_date = datetime.now() - timedelta(days=days)

            # Get all workstream outcomes for this gate type
            cur.execute("""
                SELECT
                    metadata->>'gate_passed' as passed,
                    metadata->>'auto_fixed' as auto_fixed
                FROM memori.memories
                WHERE user_id = %s
                  AND metadata->>'type' = 'workstream_outcome'
                  AND metadata->>'gate_type' = %s
                  AND created_at >= %s
            """, (self.memori.user_id, gate_type, cutoff_date))

            rows = cur.fetchall()

            # Get failure patterns
            cur.execute("""
                SELECT metadata->>'error_pattern' as pattern
                FROM memori.memories
                WHERE user_id = %s
                  AND metadata->>'type' = 'gate_failure'
                  AND metadata->>'gate_type' = %s
                  AND created_at >= %s
            """, (self.memori.user_id, gate_type, cutoff_date))

            failure_rows = cur.fetchall()
            cur.close()
            conn.close()

            if len(rows) < self.MIN_SAMPLES_FOR_STATS:
                return None

            total = len(rows)
            passed = sum(1 for r in rows if r[0] == 'true' or r[0] is True)
            failed = total - passed
            auto_fixed = sum(1 for r in rows if r[1] == 'true' or r[1] is True)

            # Count failure patterns
            pattern_counts = {}
            for r in failure_rows:
                if r[0]:
                    pattern_counts[r[0]] = pattern_counts.get(r[0], 0) + 1
            common_patterns = sorted(pattern_counts.keys(),
                                     key=lambda x: pattern_counts[x],
                                     reverse=True)[:5]

            return GateStats(
                gate_type=gate_type,
                total_checks=total,
                passed=passed,
                failed=failed,
                pass_rate=passed / total,
                common_failure_patterns=common_patterns,
                auto_fix_rate=auto_fixed / total if total > 0 else 0
            )

        except Exception as e:
            logger.error(f"Failed to calculate gate pass rate: {e}")
            return None

    def detect_pipeline_regressions(self) -> List[PipelineRegressionAlert]:
        """Detect regressions in pipeline metrics."""
        alerts = []

        # Check executor regressions
        executors = [
            "backend-service-builder",
            "api-builder",
            "rls-expert",
            "frontend-design:frontend-design-pt-2",
            "e2e-testing"
        ]

        for executor in executors:
            stats = self.calculate_executor_effectiveness(executor)
            if stats and stats.trend == "declining":
                if stats.success_rate < 0.7:  # Below 70% threshold
                    alerts.append(PipelineRegressionAlert(
                        metric=f"executor:{executor}",
                        baseline_value=0.85,  # Expected baseline
                        current_value=stats.success_rate,
                        decline_percentage=(0.85 - stats.success_rate) * 100,
                        suspected_cause=stats.common_issues[0] if stats.common_issues else "Unknown",
                        affected_prds=[],
                        detected_at=datetime.now().isoformat()
                    ))

        # Check gate regressions
        gates = ["schema-validation", "type-check", "lint", "test-pass", "build"]

        for gate in gates:
            stats = self.calculate_gate_pass_rate(gate)
            if stats and stats.pass_rate < 0.8:  # Below 80% threshold
                alerts.append(PipelineRegressionAlert(
                    metric=f"gate:{gate}",
                    baseline_value=0.9,
                    current_value=stats.pass_rate,
                    decline_percentage=(0.9 - stats.pass_rate) * 100,
                    suspected_cause=stats.common_failure_patterns[0] if stats.common_failure_patterns else "Unknown",
                    affected_prds=[],
                    detected_at=datetime.now().isoformat()
                ))

        return alerts

    # -------------------------------------------------------------------------
    # Adaptive Recommendations
    # -------------------------------------------------------------------------

    def get_recommended_executor(
        self,
        workstream_type: str
    ) -> Tuple[str, float, str]:
        """Get executor recommendation with confidence."""
        # Base mapping
        executor_map = {
            "database": "backend-service-builder",
            "service-layer": "backend-service-builder",
            "rls": "rls-expert",
            "route-handlers": "api-builder",
            "react-components": "frontend-design:frontend-design-pt-2",
            "zustand-stores": "frontend-design:frontend-design-pt-2",
            "react-query-hooks": "frontend-design:frontend-design-pt-2",
            "e2e-tests": "e2e-testing",
            "unit-tests": "backend-service-builder",
        }

        base_executor = executor_map.get(workstream_type, "backend-service-builder")

        # Get historical stats
        stats = self.calculate_executor_effectiveness(base_executor)

        if stats:
            confidence = stats.success_rate
            rationale = f"Historical: {stats.success_rate:.0%} success ({stats.total_executions} executions)"

            if stats.trend == "declining":
                confidence *= 0.85
                rationale += f" [Warning: declining trend]"
            elif stats.trend == "improving":
                confidence = min(1.0, confidence * 1.1)
                rationale += f" [Improving]"
        else:
            confidence = 0.8
            rationale = "Default mapping (no historical data)"

        return base_executor, confidence, rationale

    def suggest_fix_from_history(
        self,
        gate_type: str,
        error_pattern: str,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Suggest fixes based on past gate failures."""
        if not self.memori.enabled:
            return []

        try:
            import psycopg2
            import json

            db_url = self.memori.config.database_url.split('?')[0]
            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.execute("SET search_path TO memori, public")

            cur.execute("""
                SELECT metadata->>'suggested_fix', metadata->>'fix_applied', metadata->>'auto_fixed'
                FROM memori.memories
                WHERE user_id = %s
                  AND metadata->>'type' = 'gate_failure'
                  AND metadata->>'gate_type' = %s
                  AND metadata->>'error_pattern' ILIKE %s
                ORDER BY created_at DESC
                LIMIT %s
            """, (self.memori.user_id, gate_type, f"%{error_pattern}%", limit))

            rows = cur.fetchall()
            cur.close()
            conn.close()

            suggestions = []
            for row in rows:
                if row[0] or row[1]:
                    suggestions.append({
                        "suggested_fix": row[0],
                        "fix_applied": row[1],
                        "was_auto_fixed": row[2] == 'true' or row[2] is True
                    })

            return suggestions

        except Exception as e:
            logger.error(f"Failed to suggest fix: {e}")
            return []

    # -------------------------------------------------------------------------
    # Learning Report
    # -------------------------------------------------------------------------

    def get_learning_summary(self) -> Dict[str, Any]:
        """Get summary of pipeline learning data."""
        executors = [
            "backend-service-builder",
            "api-builder",
            "rls-expert",
            "frontend-design:frontend-design-pt-2",
            "e2e-testing"
        ]

        executor_stats = {}
        for executor in executors:
            stats = self.calculate_executor_effectiveness(executor)
            if stats:
                executor_stats[executor] = {
                    "success_rate": stats.success_rate,
                    "total": stats.total_executions,
                    "trend": stats.trend
                }

        gates = ["schema-validation", "type-check", "lint", "test-pass"]
        gate_stats = {}
        for gate in gates:
            stats = self.calculate_gate_pass_rate(gate)
            if stats:
                gate_stats[gate] = {
                    "pass_rate": stats.pass_rate,
                    "total": stats.total_checks,
                    "auto_fix_rate": stats.auto_fix_rate
                }

        regressions = self.detect_pipeline_regressions()

        return {
            "executor_stats": executor_stats,
            "gate_stats": gate_stats,
            "regressions": len(regressions),
            "regression_details": [
                {"metric": r.metric, "decline": f"{r.decline_percentage:.1f}%"}
                for r in regressions
            ],
            "recommendations": {
                "most_reliable_executor": max(
                    executor_stats.items(),
                    key=lambda x: x[1]["success_rate"]
                )[0] if executor_stats else "N/A",
                "needs_attention": [r.metric for r in regressions]
            }
        }

    def format_learning_report(self) -> str:
        """Format human-readable learning report."""
        summary = self.get_learning_summary()

        lines = [
            "# PRD Pipeline - Learning Report",
            "",
            f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            "",
            "## Executor Effectiveness",
            ""
        ]

        for executor, stats in summary["executor_stats"].items():
            trend_emoji = {"improving": "📈", "stable": "➡️", "declining": "📉"}.get(stats["trend"], "❓")
            lines.append(f"- **{executor}**: {stats['success_rate']:.0%} ({stats['total']} executions) {trend_emoji}")

        lines.extend(["", "## Gate Pass Rates", ""])

        for gate, stats in summary["gate_stats"].items():
            lines.append(f"- **{gate}**: {stats['pass_rate']:.0%} (auto-fix: {stats['auto_fix_rate']:.0%})")

        if summary["regressions"]:
            lines.extend(["", "## ⚠️ Regressions Detected", ""])
            for r in summary["regression_details"]:
                lines.append(f"- {r['metric']}: declined {r['decline']}")

        lines.extend([
            "",
            "## Recommendations",
            "",
            f"- **Most Reliable**: {summary['recommendations']['most_reliable_executor']}"
        ])

        if summary["recommendations"]["needs_attention"]:
            lines.append(f"- **Needs Attention**: {', '.join(summary['recommendations']['needs_attention'])}")

        return "\n".join(lines)
```

### Export Update: `lib/memori/__init__.py`

Add to exports:
```python
from .pipeline_context import PipelineContext, ExecutorStats, GateStats, PipelineRegressionAlert
```

---

## WS2: Critic Checklist

### File: `.claude/skills/prd-pipeline/references/critic-checklist.md`

```markdown
# EXECUTION-SPEC Critic Checklist

> Quality criteria for EXECUTION-SPEC validation before execution.

## Structural Validation

- [ ] All workstreams have unique IDs (WS1, WS2, ...)
- [ ] Dependencies form a DAG (no circular dependencies)
- [ ] Each workstream has explicit outputs defined
- [ ] Execution phases correctly sequence dependencies
- [ ] YAML frontmatter parses without errors

## Domain Compliance

- [ ] Bounded context ownership matches SRM entries
- [ ] Workstream types match executor capabilities (see executor-registry.md)
- [ ] Gate types align with workstream output types
- [ ] No cross-context violations in workstream scope

## Historical Pattern Checks

- [ ] No anti-patterns from documented failures
- [ ] Executor assignments align with historical success rates
- [ ] Scope complexity aligns with similar successful PRDs
- [ ] Common failure patterns from similar workstreams addressed

## Complexity Guards

- [ ] Max 8 workstreams per PRD
- [ ] Max 4 execution phases
- [ ] Each workstream has testable DoD criteria
- [ ] No workstream depends on more than 3 predecessors

## Critic Scoring

| Category | Weight | Score (0-1) |
|----------|--------|-------------|
| Structural | 30% | |
| Domain Compliance | 30% | |
| Historical Patterns | 20% | |
| Complexity | 20% | |
| **Total** | 100% | |

**Threshold**: Score >= 0.7 to proceed without refinement
```

---

## WS3: Recording Scripts

### File: `.claude/skills/prd-pipeline/scripts/record-execution.py`

```python
#!/usr/bin/env python3
"""
Record pipeline execution outcome to Memori.

Usage:
    uv run .claude/skills/prd-pipeline/scripts/record-execution.py \
        --checkpoint .claude/skills/prd-pipeline/checkpoints/PRD-XXX.json
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
    args = parser.parse_args()

    # Load checkpoint
    checkpoint_path = Path(args.checkpoint)
    if not checkpoint_path.exists():
        print(f"ERROR: Checkpoint not found: {checkpoint_path}")
        sys.exit(1)

    with open(checkpoint_path) as f:
        checkpoint = json.load(f)

    # Initialize Memori
    try:
        from lib.memori import create_memori_client
        from lib.memori.pipeline_context import PipelineContext

        memori = create_memori_client("skill:prd-pipeline")
        memori.enable()
        context = PipelineContext(memori)
    except ImportError as e:
        print(f"ERROR: Failed to import Memori: {e}")
        print("Skipping Memori recording.")
        sys.exit(0)
    except Exception as e:
        print(f"WARNING: Memori not available: {e}")
        sys.exit(0)

    # Determine outcome
    status = checkpoint.get("status", "unknown")
    if status == "complete":
        outcome = "success"
    elif status == "failed":
        outcome = "failure"
    else:
        outcome = "partial"

    # Calculate duration (if timestamps available)
    duration = 0
    if "timestamp" in checkpoint:
        # Approximate - would need start timestamp for accurate duration
        duration = 0

    # Record pipeline execution
    success = context.record_pipeline_execution(
        prd_id=checkpoint.get("prd", "unknown"),
        prd_title=checkpoint.get("prd_title", "Unknown"),
        outcome=outcome,
        duration_seconds=duration,
        phases_completed=checkpoint.get("current_phase", 0),
        total_phases=len(checkpoint.get("completed_workstreams", [])) + len(checkpoint.get("pending_workstreams", [])),
        workstreams_completed=checkpoint.get("completed_workstreams", []),
        workstreams_failed=checkpoint.get("deferred_workstreams", []),
        gate_failures=None,  # Would need to extract from checkpoint
        lessons_learned=args.lessons,
        architecture_fixes=[checkpoint.get("architecture_fix", {}).get("resolution")] if checkpoint.get("architecture_fix") else None
    )

    if success:
        print(f"✅ Recorded pipeline execution: {checkpoint.get('prd')} ({outcome})")
    else:
        print(f"❌ Failed to record pipeline execution")

    # Check for regressions
    regressions = context.detect_pipeline_regressions()
    if regressions:
        print("\n⚠️  REGRESSIONS DETECTED:")
        for r in regressions:
            print(f"  - {r.metric}: {r.current_value:.0%} (baseline: {r.baseline_value:.0%})")
            print(f"    Suspected cause: {r.suspected_cause}")

    # Generate learning report
    print("\n" + "=" * 60)
    print(context.format_learning_report())


if __name__ == "__main__":
    main()
```

---

## WS4: Query Scripts

### File: `.claude/skills/prd-pipeline/scripts/query-learnings.py`

```python
#!/usr/bin/env python3
"""
Query pipeline learnings from Memori for context injection.

Usage:
    uv run .claude/skills/prd-pipeline/scripts/query-learnings.py \
        --prd PRD-XXX \
        --domain "rating-slip" \
        --format markdown
"""

import argparse
import sys


def main():
    parser = argparse.ArgumentParser(description="Query pipeline learnings")
    parser.add_argument("--prd", help="PRD identifier for context")
    parser.add_argument("--domain", help="Domain to search for similar PRDs")
    parser.add_argument("--executor", help="Query specific executor stats")
    parser.add_argument("--gate", help="Query specific gate stats")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()

    try:
        from lib.memori.dynamic_recall import DynamicRecall
        from lib.memori import create_memori_client
        from lib.memori.pipeline_context import PipelineContext
    except ImportError as e:
        print(f"ERROR: Failed to import Memori: {e}")
        sys.exit(1)

    # Query past decisions
    recall = DynamicRecall()

    query_parts = ["pipeline execution"]
    if args.prd:
        query_parts.append(args.prd)
    if args.domain:
        query_parts.append(args.domain)

    query = " ".join(query_parts)

    print("=" * 60)
    print(f"PIPELINE LEARNINGS: {query}")
    print("=" * 60)

    # Get similar PRD executions
    memories = recall.query_past_decisions(
        topic=query,
        namespace="arch_decisions",
        limit=args.limit,
        include_cross_namespace=True
    )

    if memories:
        print(f"\n## Similar PRD Executions ({len(memories)} found)\n")
        for i, mem in enumerate(memories, 1):
            print(f"**[{i}]** {mem.content[:100]}...")
            if mem.metadata:
                if mem.metadata.get("outcome"):
                    print(f"   Outcome: {mem.metadata['outcome']}")
                if mem.metadata.get("lessons_learned"):
                    print(f"   Lessons: {', '.join(mem.metadata['lessons_learned'][:2])}")
            print()
    else:
        print("\nNo similar PRD executions found.")

    # Get executor stats if requested
    if args.executor:
        try:
            memori = create_memori_client("skill:prd-pipeline")
            memori.enable()
            context = PipelineContext(memori)

            stats = context.calculate_executor_effectiveness(args.executor)
            if stats:
                print(f"\n## Executor Stats: {args.executor}\n")
                print(f"- Success Rate: {stats.success_rate:.0%}")
                print(f"- Total Executions: {stats.total_executions}")
                print(f"- Trend: {stats.trend}")
                if stats.common_issues:
                    print(f"- Common Issues: {', '.join(stats.common_issues[:3])}")
        except Exception as e:
            print(f"Warning: Could not get executor stats: {e}")

    # Get gate stats if requested
    if args.gate:
        try:
            memori = create_memori_client("skill:prd-pipeline")
            memori.enable()
            context = PipelineContext(memori)

            stats = context.calculate_gate_pass_rate(args.gate)
            if stats:
                print(f"\n## Gate Stats: {args.gate}\n")
                print(f"- Pass Rate: {stats.pass_rate:.0%}")
                print(f"- Auto-Fix Rate: {stats.auto_fix_rate:.0%}")
                if stats.common_failure_patterns:
                    print(f"- Common Failures: {', '.join(stats.common_failure_patterns[:3])}")
        except Exception as e:
            print(f"Warning: Could not get gate stats: {e}")

    recall.close()

    # Show related documents
    print("\n" + "-" * 60)
    print("RELATED REFERENCES:")
    print("-" * 60)
    print("  - .claude/skills/prd-pipeline/references/executor-registry.md")
    print("  - .claude/skills/prd-pipeline/references/gate-protocol.md")
    print("  - docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md")


if __name__ == "__main__":
    main()
```

---

## WS5: SKILL.md Integration

### Changes to `.claude/skills/prd-pipeline/SKILL.md`

Add after the `## Pipeline Overview` section:

```markdown
---

## Self-Improvement Loop

The pipeline includes adaptive learning mechanisms via Memori integration.

### Pre-Execution Memory Recall

Before Phase 1, query past learnings for context:

```bash
uv run .claude/skills/prd-pipeline/scripts/query-learnings.py \
    --prd {PRD-ID} \
    --domain {bounded_context} \
    --limit 5
```

**Inject learnings into EXECUTION-SPEC generation:**
- Similar PRD outcomes (success/failure patterns)
- Common gate failures for workstream types
- Executor effectiveness trends

### Post-Completion Recording

After Phase 4 (or on failure), record execution outcome:

```bash
uv run .claude/skills/prd-pipeline/scripts/record-execution.py \
    --checkpoint .claude/skills/prd-pipeline/checkpoints/{PRD-ID}.json \
    --lessons "Lesson 1" "Lesson 2"
```

### Gate Failure Analysis

When a gate fails, query historical fixes:

```python
from lib.memori import create_memori_client
from lib.memori.pipeline_context import PipelineContext

memori = create_memori_client("skill:prd-pipeline")
memori.enable()
context = PipelineContext(memori)

# Get fix suggestions from history
suggestions = context.suggest_fix_from_history(
    gate_type="type-check",
    error_pattern="Property does not exist"
)

for fix in suggestions:
    print(f"Previous fix: {fix['fix_applied']}")
    print(f"Auto-fixable: {fix['was_auto_fixed']}")
```

### Regression Alerts

The system automatically detects when:
- Executor success rates decline below 70%
- Gate pass rates decline below 80%

Alerts are displayed in the post-completion summary.
```

---

## Memory Types Reference

| Type | Category | Namespace | Purpose |
|------|----------|-----------|---------|
| `pipeline_execution` | skills | arch_decisions | Full PRD execution outcome |
| `workstream_outcome` | skills | arch_decisions | Per-workstream success/failure |
| `gate_failure` | validation | arch_decisions | Gate failure patterns |
| `exec_spec_quality` | validation | arch_decisions | EXECUTION-SPEC generation metrics |

---

## Validation Criteria

### WS1: PipelineContext
- [ ] `uv run python -m py_compile lib/memori/pipeline_context.py` passes
- [ ] Class inherits from ValidationContext
- [ ] All recording methods return bool
- [ ] Analytics methods handle missing data gracefully

### WS3/WS4: Scripts
- [ ] Scripts execute without import errors
- [ ] Handle missing Memori gracefully (no hard failures)
- [ ] Output is human-readable

### WS5: SKILL.md
- [ ] Memory recall section added
- [ ] Post-completion section added
- [ ] Examples use `uv run` syntax

### WS6: E2E Test
- [ ] Execute a sample PRD
- [ ] Verify records created in arch_decisions namespace
- [ ] Query learnings and verify injection format

---

## References

- **Pattern Template**: `docs/context-engineering/SELF_IMPROVING_INTELLIGENCE_PATTERN.md`
- **Reference Implementation**: `lib/memori/backend_service_context.py`
- **Namespace Hierarchy**: `.memori/docs/NAMESPACE_HIERARCHY.md`
- **Memori Client**: `lib/memori/client.py`
- **Dynamic Recall**: `lib/memori/dynamic_recall.py`
