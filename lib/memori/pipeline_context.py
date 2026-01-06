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

            issue_counts: Dict[str, int] = {}
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
            pattern_counts: Dict[str, int] = {}
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
            trend_emoji = {"improving": "up", "stable": "->", "declining": "dn"}.get(stats["trend"], "?")
            lines.append(f"- **{executor}**: {stats['success_rate']:.0%} ({stats['total']} executions) [{trend_emoji}]")

        lines.extend(["", "## Gate Pass Rates", ""])

        for gate, stats in summary["gate_stats"].items():
            lines.append(f"- **{gate}**: {stats['pass_rate']:.0%} (auto-fix: {stats['auto_fix_rate']:.0%})")

        if summary["regressions"]:
            lines.extend(["", "## REGRESSIONS DETECTED", ""])
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
