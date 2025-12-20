#!/usr/bin/env python3
"""
PT-2 Performance Benchmark Harness (OPS-PE-003)

Runs benchmarks for API endpoints, database queries, and end-to-end flows.
Produces p50/p95/p99 latency metrics and comparison reports.

Features:
- Correlation ID propagation (OBSERVABILITY_SPEC §1)
- Audit log emission for performance tests
- Service SLO tracking against budgets
- Baseline regression detection

Usage:
    python benchmark.py --suite api --iterations 10 --correlation-id benchmark-001
    python benchmark.py --suite db --baseline .perf/baseline.json
    python benchmark.py --report --output perf-report.md --slo-file .perf/slos.json
"""

import argparse
import json
import os
import statistics
import sys
import time
import uuid
from dataclasses import dataclass, asdict, field
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List
from urllib.request import urlopen, Request
from urllib.error import URLError


@dataclass
class AuditEvent:
    """Performance test audit log entry (OBSERVABILITY_SPEC §2)."""
    ts: str
    actor_id: str
    casino_id: str
    domain: str
    action: str
    dto_before: dict | None
    dto_after: dict
    correlation_id: str
    metadata: dict = field(default_factory=dict)


@dataclass
class BenchmarkResult:
    """Result of a single benchmark run with correlation tracking."""
    name: str
    suite: str
    iterations: int
    p50_ms: float
    p95_ms: float
    p99_ms: float
    min_ms: float
    max_ms: float
    mean_ms: float
    std_dev_ms: float
    error_rate: float
    timestamp: str
    correlation_id: str = ""
    service_metrics: Dict[str, float] = field(default_factory=dict)


@dataclass
class BrookSLO:
    """Service SLO configuration from OBSERVABILITY_SPEC §3."""
    service: str
    operation: str
    p95_target_ms: float
    metric_name: str
    alert_threshold_ms: float


@dataclass
class SLOViolation:
    """SLO violation report."""
    service: str
    operation: str
    p95_actual_ms: float
    p95_target_ms: float
    violation_pct: float
    severity: str  # "critical", "warning", "ok"


@dataclass
class BenchmarkComparison:
    """Comparison between current and baseline results with SLO checking."""
    name: str
    current_p95: float
    baseline_p95: float
    diff_pct: float
    regression: bool
    threshold_pct: float
    slo_violations: List[SLOViolation] = field(default_factory=list)


def percentile(data: list[float], p: float) -> float:
    """Calculate percentile of sorted data."""
    if not data:
        return 0.0
    sorted_data = sorted(data)
    k = (len(sorted_data) - 1) * p / 100
    f = int(k)
    c = f + 1 if f + 1 < len(sorted_data) else f
    return sorted_data[f] + (k - f) * (sorted_data[c] - sorted_data[f])


class Benchmarker:
    """Main benchmarking engine with SRE integration."""

    def __init__(self, base_url: str = "http://localhost:3000", correlation_id: Optional[str] = None):
        self.base_url = base_url
        self.correlation_id = correlation_id or f"benchmark-{uuid.uuid4()}"
        self.results: list[BenchmarkResult] = []
        self.audit_events: List[AuditEvent] = []
        self.slo_definitions: Optional[Dict[str, BrookSLO]] = None

    def load_slo_definitions(self, slo_file: Optional[str]) -> None:
        """Load SLO definitions from file or use defaults."""
        # Default SLOs from OBSERVABILITY_SPEC §3
        default_slos = [
            BrookSLO("RatingSlip", "UpdateTelemetry", 80, "ratingslip_update_latency_p95", 100),
            BrookSLO("Loyalty", "IssueReward", 100, "loyalty_reward_latency_p95", 150),
            BrookSLO("TableContext", "FillRequest", 120000, "table_fill_completion_time_p95", 180000),
            BrookSLO("TableContext", "CreditRequest", 120000, "table_credit_completion_time_p95", 180000),
            BrookSLO("Finance", "CreateTransaction", 50, "finance_create_txn_latency_p95", 75),
            BrookSLO("FloorLayout", "ActivateLayout", 200, "floor_layout_activation_latency_p95", 300)
        ]

        if slo_file and os.path.exists(slo_file):
            with open(slo_file) as f:
                data = json.load(f)
                self.slo_definitions = {slo.service + ":" + slo.operation: slo for slo in [
                    BrookSLO(**item) for item in data["slos"]]
        else:
            self.slo_definitions = {slo.service + ":" + slo.operation: slo for slo in default_slos}

    def check_slo_compliance(self, result: BenchmarkResult) -> List[SLOViolation]:
        """Check if benchmark result violates any SLOs."""
        violations = []

        # Map endpoint names to services
        service_mapping = {
            "GET /api/health": ("Health", "HealthCheck"),
            "GET /api/players": ("Player", "ListPlayers"),
            "GET /api/visits": ("Visit", "ListVisits"),
            "GET /api/tables": ("Table", "ListTables"),
            "GET /api/rating-slips": ("RatingSlip", "ListRatingSlips"),
            "POST /api/rating-slips/:id/update": ("RatingSlip", "UpdateTelemetry"),
            "POST /api/loyalty/reward": ("Loyalty", "IssueReward"),
            "POST /api/table/fill": ("TableContext", "FillRequest"),
            "POST /api/table/credit": ("TableContext", "CreditRequest"),
            "POST /api/finance/transaction": ("Finance", "CreateTransaction"),
            "PUT /api/floor-layouts/:id/activate": ("FloorLayout", "ActivateLayout")
        }

        if result.name in service_mapping:
            service, operation = service_mapping[result.name]
            slo_key = f"{service}:{operation}"

            if slo_key in self.slo_definitions:
                slo = self.slo_definitions[slo_key]
                if result.p95_ms > slo.p95_target_ms:
                    violation_pct = ((result.p95_ms - slo.p95_target_ms) / slo.p95_target_ms) * 100
                    severity = "critical" if violation_pct > 50 else "warning"
                    violations.append(SLOViolation(
                        service=service,
                        operation=operation,
                        p95_actual_ms=result.p95_ms,
                        p95_target_ms=slo.p95_target_ms,
                        violation_pct=violation_pct,
                        severity=severity
                    ))

        return violations

    def emit_audit_event(self, result: BenchmarkResult, violations: List[SLOViolation]) -> None:
        """Emit audit event for performance test (OBSERVABILITY_SPEC §2)."""
        audit_event = AuditEvent(
            ts=datetime.utcnow().isoformat(),
            actor_id="benchmark-system",
            casino_id="all",  # Global benchmark
            domain="performance",
            action="benchmark_complete",
            dto_before=None,
            dto_after=asdict(result),
            correlation_id=self.correlation_id,
            metadata={
                "endpoint": result.name,
                "iterations": result.iterations,
                "slo_violations": [asdict(v) for v in violations]
            }
        )
        self.audit_events.append(audit_event)

        # For now, log to console. In production, this would POST to audit API
        print(f"[AUDIT] {result.name} completed, correlation_id={self.correlation_id}")

    def benchmark_endpoint(
        self,
        name: str,
        path: str,
        method: str = "GET",
        body: Optional[dict] = None,
        iterations: int = 10,
        service_metrics: Optional[dict] = None
    ) -> BenchmarkResult:
        """Benchmark a single API endpoint with SRE integration."""
        latencies: list[float] = []
        errors = 0
        service_metrics = service_metrics or {}

        for _ in range(iterations):
            start = time.perf_counter()
            try:
                url = f"{self.base_url}{path}"
                req = Request(url, method=method)
                req.add_header("Content-Type", "application/json")
                req.add_header("x-correlation-id", self.correlation_id)

                if body:
                    req.data = json.dumps(body).encode()

                with urlopen(req, timeout=30) as response:
                    response.read()

                elapsed = (time.perf_counter() - start) * 1000
                latencies.append(elapsed)

            except (URLError, TimeoutError):
                errors += 1
                latencies.append(30000)  # Timeout value

        result = BenchmarkResult(
            name=name,
            suite="api",
            iterations=iterations,
            p50_ms=percentile(latencies, 50),
            p95_ms=percentile(latencies, 95),
            p99_ms=percentile(latencies, 99),
            min_ms=min(latencies),
            max_ms=max(latencies),
            mean_ms=statistics.mean(latencies),
            std_dev_ms=statistics.stdev(latencies) if len(latencies) > 1 else 0,
            error_rate=errors / iterations,
            timestamp=datetime.utcnow().isoformat(),
            correlation_id=self.correlation_id,
            service_metrics=service_metrics
        )

        # Check SLO compliance and emit audit event
        violations = self.check_slo_compliance(result)
        self.emit_audit_event(result, violations)

        return result

    def run_api_suite(self, iterations: int = 10) -> list[BenchmarkResult]:
        """Run API endpoint benchmark suite."""
        endpoints = [
            ("GET /api/health", "/api/health"),
            ("GET /api/players", "/api/players"),
            ("GET /api/visits", "/api/visits"),
            ("GET /api/tables", "/api/tables"),
            ("GET /api/rating-slips", "/api/rating-slips"),
        ]

        results = []
        for name, path in endpoints:
            print(f"  Benchmarking {name}...")
            result = self.benchmark_endpoint(name, path, iterations=iterations)
            results.append(result)
            self.results.append(result)

        return results

    def run_db_suite(self, conn_string: str, iterations: int = 10) -> list[BenchmarkResult]:
        """Run database query benchmark suite."""
        # Note: Requires psycopg2 or asyncpg for actual DB benchmarking
        # This is a placeholder that would be expanded with actual DB queries
        print("  DB suite requires database connection - skipping in demo mode")
        return []

    def run_e2e_suite(self, iterations: int = 5) -> list[BenchmarkResult]:
        """Run end-to-end flow benchmark suite."""
        # Placeholder for E2E flows like Playwright-based tests
        print("  E2E suite requires browser automation - skipping in demo mode")
        return []

    def compare_to_baseline(
        self,
        baseline_path: str,
        threshold_pct: float = 10.0
    ) -> list[BenchmarkComparison]:
        """Compare current results to baseline with SLO checking."""
        comparisons = []

        with open(baseline_path) as f:
            baseline = json.load(f)

        baseline_by_name = {r["name"]: r for r in baseline.get("results", [])}

        for result in self.results:
            if result.name in baseline_by_name:
                baseline_p95 = baseline_by_name[result.name]["p95_ms"]
                diff_pct = ((result.p95_ms - baseline_p95) / baseline_p95) * 100
                is_regression = diff_pct > threshold_pct

                # Check current SLO violations (baseline may have been within SLO)
                violations = self.check_slo_compliance(result)

                comparisons.append(BenchmarkComparison(
                    name=result.name,
                    current_p95=result.p95_ms,
                    baseline_p95=baseline_p95,
                    diff_pct=diff_pct,
                    regression=is_regression,
                    threshold_pct=threshold_pct,
                    slo_violations=violations
                ))

        return comparisons

    def save_baseline(self, path: str) -> None:
        """Save current results as baseline."""
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump({
                "timestamp": datetime.utcnow().isoformat(),
                "results": [asdict(r) for r in self.results]
            }, f, indent=2)

    def generate_report(self, comparisons: Optional[list[BenchmarkComparison]] = None,
                       slo_file: Optional[str] = None) -> str:
        """Generate markdown performance report with SLO analysis."""
        # Load latest SLO definitions
        self.load_slo_definitions(slo_file)

        lines = [
            "# Performance Benchmark Report",
            f"\n**Generated**: {datetime.utcnow().isoformat()}",
            f"**Correlation ID**: {self.correlation_id}",
            f"**Benchmark ID**: benchmark-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}",
            "\n## SLO Status (OBSERVABILITY_SPEC §3)\n",
            "| Service | Operation | Target (p95) | Actual (p95) | Status |",
            "|---------|-----------|--------------|--------------|--------|"
        ]

        # Show SLO compliance for all results
        for result in self.results:
            violations = self.check_slo_compliance(result)
            if violations:
                for v in violations:
                    status = f"**:warning: VIOLATION (+{v.violation_pct:.1f}%)**"
                    lines.append(
                        f"| {v.service} | {v.operation} | {v.p95_target_ms}ms | "
                        f"{v.p95_actual_ms:.1f}ms | {status} |"
                    )

        lines.extend([
            "\n## Results Summary\n",
            "| Endpoint | p50 (ms) | p95 (ms) | p99 (ms) | Error Rate |",
            "|----------|----------|----------|----------|------------|"
        ])

        for r in self.results:
            lines.append(
                f"| {r.name} | {r.p50_ms:.1f} | {r.p95_ms:.1f} | "
                f"{r.p99_ms:.1f} | {r.error_rate:.1%} |"
            )

        if comparisons:
            lines.extend([
                "\n## Baseline Comparison & Regression Analysis\n",
                "| Endpoint | Current p95 | Baseline p95 | Diff | Regression | SLO Status |",
                "|----------|-------------|--------------|------|------------|------------|"
            ])

            for c in comparisons:
                status = "**:x: REGRESSED**" if c.regression else "OK"
                slo_status = "✅ All OK" if not c.slo_violations else f":warning: {len(c.slo_violations)} VIOLATIONS"
                lines.append(
                    f"| {c.name} | {c.current_p95:.1f}ms | {c.baseline_p95:.1f}ms | "
                    f"{c.diff_pct:+.1f}% | {status} | {slo_status} |"
                )

        lines.extend([
            "\n## Audit Trail",
            f"\n**Total Audit Events**: {len(self.audit_events)}",
            f"**Correlation ID**: `{self.correlation_id}`",
            "\n### Known Limitations",
            "- DB and E2E suites require additional dependencies",
            "- This report uses static SLO defaults; configure with --slo-file for production use",
            "- Audit events are logged locally; integrate with audit API for production"
        ])

        return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="PT-2 Performance Benchmark Harness (OPS-PE-003)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python benchmark.py --suite api --iterations 100 --correlation-id pr-123
  python benchmark.py --suite api --baseline .perf/baseline.json --slo-file .perf/slos.json
  python benchmark.py --report --output reports/perf-$(date +%Y%m%d).md --save-baseline .perf/baseline.json
        """
    )
    parser.add_argument("--suite", choices=["api", "db", "e2e", "all"], default="api",
                        help="Benchmark suite to run (api/db/e2e/all)")
    parser.add_argument("--iterations", type=int, default=10,
                        help="Number of iterations per benchmark")
    parser.add_argument("--baseline", type=str,
                        help="Path to baseline JSON for comparison")
    parser.add_argument("--save-baseline", type=str,
                        help="Save results as new baseline")
    parser.add_argument("--report", action="store_true",
                        help="Generate markdown report with SLO analysis")
    parser.add_argument("--output", type=str, default="perf-report.md",
                        help="Output path for report")
    parser.add_argument("--base-url", type=str, default="http://localhost:3000",
                        help="Base URL for API endpoints")
    parser.add_argument("--conn", type=str,
                        help="Database connection string for DB suite")
    parser.add_argument("--threshold", type=float, default=10.0,
                        help="Regression threshold percentage")
    parser.add_argument("--slo-file", type=str,
                        help="Path to SLO definitions JSON file")
    parser.add_argument("--correlation-id", type=str,
                        help="Correlation ID for tracking (auto-generated if not provided)")
    parser.add_argument("--dump-audit", type=str,
                        help="Dump audit events to file")
    parser.add_argument("--fail-on-slo", action="store_true",
                        help="Fail build if SLO violations detected")

    args = parser.parse_args()

    benchmarker = Benchmarker(base_url=args.base_url, correlation_id=args.correlation_id)
    benchmarker.load_slo_definitions(args.slo_file)

    print(f"\nPT-2 Performance Benchmark (OPS-PE-003)")
    print(f"{'=' * 60}")
    print(f"Suite: {args.suite}")
    print(f"Iterations: {args.iterations}")
    print(f"Correlation ID: {benchmarker.correlation_id}")
    if args.slo_file:
        print(f"SLO File: {args.slo_file}")
    else:
        print("SLO File: Using defaults from OBSERVABILITY_SPEC §3")
    print()

    # Run requested suites
    if args.suite in ("api", "all"):
        print("Running API suite...")
        benchmarker.run_api_suite(iterations=args.iterations)

    if args.suite in ("db", "all") and args.conn:
        print("Running DB suite...")
        benchmarker.run_db_suite(args.conn, iterations=args.iterations)

    if args.suite in ("e2e", "all"):
        print("Running E2E suite...")
        benchmarker.run_e2e_suite(iterations=args.iterations)

    # Compare to baseline if provided
    comparisons = None
    if args.baseline and os.path.exists(args.baseline):
        print(f"\nComparing to baseline: {args.baseline}")
        comparisons = benchmarker.compare_to_baseline(args.baseline, args.threshold)

        regressions = [c for c in comparisons if c.regression]
        slo_violations = [v for c in comparisons for v in c.slo_violations]

        if regressions:
            print(f"\n  :warning: REGRESSIONS DETECTED ({len(regressions)}):")
            for c in regressions:
                print(f"    {c.name}: {c.diff_pct:+.1f}%")

        if slo_violations:
            print(f"\n  :rotating_light: SLO VIOLATIONS ({len(slo_violations)}):")
            for v in slo_violations:
                print(f"    {v.service}.{v.operation}: +{v.violation_pct:.1f}% (target: {v.p95_target_ms}ms, actual: {v.p95_actual_ms:.1f}ms) [{v.severity}]")

    # Save baseline if requested
    if args.save_baseline:
        benchmarker.save_baseline(args.save_baseline)
        print(f"\nBaseline saved to: {args.save_baseline}")

    # Generate report
    if args.report:
        report = benchmarker.generate_report(comparisons, args.slo_file)
        with open(args.output, "w") as f:
            f.write(report)
        print(f"\nReport saved to: {args.output}")

    # Dump audit events if requested
    if args.dump_audit and benchmarker.audit_events:
        with open(args.dump_audit, "w") as f:
            json.dump([asdict(e) for e in benchmarker.audit_events], f, indent=2)
        print(f"\nAudit events dumped to: {args.dump_audit}")

    # Exit with error if regressions or SLO violations found
    if comparisons:
        has_regression = any(c.regression for c in comparisons)
        has_slo_violations = args.fail_on_slo and any(c.slo_violations for c in comparisons)

        if has_regression or has_slo_violations:
            fail_reason = []
            if has_regression:
                fail_reason.append("Performance regressions detected")
            if has_slo_violations:
                fail_reason.append("SLO violations detected")
            print(f"\n  :x: BUILD FAILED: {'; '.join(fail_reason)}")
            sys.exit(1)

    print("\n  :white_check_mark: BUILD PASSED")


if __name__ == "__main__":
    main()
