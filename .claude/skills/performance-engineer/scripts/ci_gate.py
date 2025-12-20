#!/usr/bin/env python3
"""
PT-2 CI Performance Gate (OPS-PE-005)

CI integration script that fails builds on performance regressions or SLO violations.
Integrates with benchmark.py for comprehensive gate checks per OBSERVABILITY_SPEC §6.

Usage:
    python ci_gate.py --baseline .perf/baseline.json --threshold 10 --fail-on-slo
    python ci_gate.py --baseline .perf/baseline.json --slo-file .perf/slos.json --dump-audit ci-audit.json
    python ci_gate.py --baseline .perf/baseline.json --correlation-id "build-#{BUILD_ID}"
"""

import argparse
import json
import os
import sys
import subprocess
import uuid
from datetime import datetime
from pathlib import Path


def run_benchmark_with_slo_check(args):
    """Run benchmark suite with SLO checking enabled."""
    cmd = [
        "python", "benchmark.py",
        "--suite", args.suite,
        "--baseline", args.baseline,
        "--threshold", str(args.threshold),
        "--report",
        "--output", args.output or f".perf/ci-report-{datetime.now().strftime('%Y%m%d-%H%M%S')}.md",
    ]

    if args.slo_file:
        cmd.extend(["--slo-file", args.slo_file])
        cmd.extend(["--fail-on-slo"])

    if args.correlation_id:
        cmd.extend(["--correlation-id", args.correlation_id])
    else:
        cmd.extend(["--correlation-id", f"ci-gate-{uuid.uuid4()}"])

    if args.dump_audit:
        cmd.extend(["--dump-audit", args.dump_audit])

    if args.iterations:
        cmd.extend(["--iterations", str(args.iterations)])

    if args.conn:
        cmd.extend(["--conn", args.conn])

    print(f"Running CI gate with command: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=os.path.dirname(__file__))

    if result.returncode != 0:
        print(f"❌ CI Gate FAILED: Build exited with code {result.returncode}")
        print(f"\nStandard Output:\n{result.stdout}")
        print(f"\nStandard Error:\n{result.stderr}")
        return False

    print("✅ CI Gate PASSED")
    if args.output:
        print(f"\nReport saved to: {args.output}")
    return True


def validate_environment():
    """Validate that benchmark.py is available and environment is ready."""
    benchmark_script = os.path.join(os.path.dirname(__file__), "benchmark.py")
    if not os.path.exists(benchmark_script):
        print(f"ERROR: benchmark.py not found at {benchmark_script}")
        return False

    # Check if baseline exists
    if not os.path.exists(".perf/baseline.json"):
        print("WARNING: No baseline file found at .perf/baseline.json")
        print("Consider running: python scripts/benchmark.py --save-baseline .perf/baseline.json")
        # Don't fail on missing baseline - let the benchmark script handle it

    return True


def generate_gate_report(failures, args, correlation_id):
    """Generate CI gate report in markdown format."""
    report = [
        "# PT-2 CI Performance Gate Report",
        f"\n**Generated**: {datetime.now().isoformat()}",
        f"**Correlation ID**: {correlation_id}",
        f"**Baseline**: {args.baseline}",
        f"**Threshold**: {args.threshold}%",
        "\n## Gate Status",
    ]

    if failures:
        report.extend([
            "\n:rotating_light: **GATE FAILED**",
            "\n### Failures Detected"
        ])
        for failure in failures:
            report.append(f"- {failure}")
    else:
        report.extend([
            "\n:green_circle: **GATE PASSED**",
            "\n### Results",
            "- No performance regressions detected",
            f"- All endpoints within {args.threshold}% of baseline"
        ])

        if args.slo_file:
            report.append("- All SLOs compliant\n")

    report.extend([
        "\n## Next Steps",
        "1. Review detailed performance report \\(.perf/ci-report-*.md)" if not failures else "1. Investigate performance regressions in CI report",
        "2. Update baseline if improvements are intentional" if not failures else "2. Query OBSERVABILITY_SPEC documentation for remediation",
        "3. Consider alerting team in #alerts channel for production issues"
    ])

    if args.slo_file:
        report.extend([
            "\n## SLO Reference",
            f"- Configuration: {args.slo_file}",
            "- Targets per OBSERVABILITY_SPEC §3"
        ])

    return "\n".join(report)


def main():
    parser = argparse.ArgumentParser(
        description="PT-2 CI Performance Gate (OPS-PE-005)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic gate with 10% regression threshold
  python ci_gate.py --baseline .perf/baseline.json --threshold 10

  # Gate with SLO checking (fails on both regression AND SLO violations)
  python ci_gate.py --baseline .perf/baseline.json --slo-file .perf/slos.json --fail-on-slo

  # CI integration with correlation ID
  python ci_gate.py --baseline .perf/baseline.json --correlation-id "pr-1234"
        """
    )

    # Core gate configuration
    parser.add_argument("--baseline", required=True,
                        help="Path to baseline JSON file")
    parser.add_argument("--threshold", type=float, default=10.0,
                        help="Regression threshold in percentage (default: 10%)")
    parser.add_argument("--suite", choices=["api", "db", "e2e", "all"], default="api",
                        help="Benchmark suite to run (default: api)")
    parser.add_argument("--iterations", type=int, default=50,
                        help="Number of iterations for testing (default: 50)")

    # SLO integration
    parser.add_argument("--slo-file", type=str,
                        help="Path to SLO definitions JSON")
    parser.add_argument("--fail-on-slo", action="store_true",
                        help="Fail gate on SLO violations (requires --slo-file)")

    # Reporting and audit
    parser.add_argument("--output", type=str,
                        help="Output report file path")
    parser.add_argument("--dump-audit", type=str,
                        help="Write audit events to file")
    parser.add_argument("--correlation-id", type=str,
                        help="Correlation ID for traceability")

    # Database connectivity for DB suite
    parser.add_argument("--conn", type=str,
                        help="Database connection string for DB suite")

    args = parser.parse_args()

    # Validate environment
    if not validate_environment():
        sys.exit(1)

    # Ensure perf directory exists
    Path(".perf").mkdir(exist_ok=True)

    correlation_id = args.correlation_id or f"ci-gate-{datetime.now().strftime('%Y%m%d-%H%M%S')}"

    print(f"\nPT-2 CI Performance Gate (OPS-PE-005)")
    print(f"{'=' * 60}")
    print(f"Correlation ID: {correlation_id}")
    print(f"Baseline: {args.baseline}")
    print(f"Threshold: {args.threshold}%")
    print(f"Suite: {args.suite}")
    if args.slo_file:
        print(f"SLO File: {args.slo_file}")
        print(f"Fail on SLO: {'Yes' if args.fail_on_slo else 'No'}")
    print()

    # Run the benchmark suite with gate checks
    success = run_benchmark_with_slo_check(args)

    if not success:
        print(f"\n❌ CI Gate verdict: FAILED")
        print("\nDiagnostic summary:")
        print("- Check detailed report for regression analysis")
        print("- Review SLO violations if --fail-on-slo was used")
        print("- Consider query optimization or index improvements")
        print("- Verify no recent schema changes introduced performance regressions")
        sys.exit(1)
    else:
        print(f"\n✅ CI Gate verdict: PASSED")
        print("\nNext steps:")
        print("- Performance is within acceptable thresholds")
        print("- SLOs are satisfied (if checked)")
        print("- Build can proceed to deployment")

        # Generate summary report
        report = generate_gate_report([], args, correlation_id)
        print(f"\n{report}")

        if args.output:
            with open(args.output, "w") as f:
                f.write(report)
            print(f"Summary report written to: {args.output}")

if __name__ == "__main__":
    main()