#!/usr/bin/env python3
"""
Self-Improving Intelligence for backend-service-builder skill.

This module provides adaptive learning capabilities that update primitives
based on execution outcomes:

1. Pattern Effectiveness Tracking - Aggregate success rates per pattern
2. Primitive Evolution Engine - Propose updates to reference docs
3. Adaptive Recommendations - Weight suggestions by historical success
4. Regression Detection - Alert when patterns deteriorate
5. User Feedback Integration - Learn from corrections
"""

from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum
from loguru import logger

from .client import MemoriClient
from .skill_context import ValidationContext


class UpdateType(Enum):
    """Types of primitive updates that can be proposed."""
    ADD_TABLE_OWNERSHIP = "add_table_ownership"
    REMOVE_TABLE_OWNERSHIP = "remove_table_ownership"
    MODIFY_PATTERN_RULE = "modify_pattern_rule"
    ADD_ANTI_PATTERN = "add_anti_pattern"
    DEPRECATE_RULE = "deprecate_rule"
    ADD_DTO_STANDARD = "add_dto_standard"
    UPDATE_MIGRATION_PATTERN = "update_migration_pattern"


@dataclass
class PatternStats:
    """Statistics for a service pattern."""
    pattern: str
    total_executions: int
    successful: int
    failed: int
    partial: int
    success_rate: float
    avg_duration_seconds: float
    common_issues: List[str]
    trend: str  # "improving", "stable", "declining"
    last_30_days_success_rate: float


@dataclass
class PrimitiveProposal:
    """A proposed update to a primitive (reference doc)."""
    id: str
    primitive_file: str
    update_type: str
    proposal: str
    evidence_ids: List[str]
    created_at: str
    status: str  # "pending", "approved", "rejected", "applied"
    confidence: float
    impact_assessment: str


@dataclass
class RegressionAlert:
    """Alert for a pattern regression."""
    pattern: str
    baseline_success_rate: float
    current_success_rate: float
    decline_percentage: float
    suspected_cause: str
    affected_services: List[str]
    detected_at: str


class BackendServiceContext(ValidationContext):
    """
    Self-improving context for backend-service-builder skill.

    Extends ValidationContext with learning mechanisms that update
    primitives based on execution outcomes.

    Key Capabilities:
    - Track pattern effectiveness over time
    - Propose primitive updates based on learnings
    - Provide adaptive recommendations weighted by success
    - Detect regressions and emerging anti-patterns
    - Integrate user feedback into learning loop
    """

    SKILL_NAMESPACE = "skill:backend-service-builder"

    # Thresholds for alerts and proposals
    REGRESSION_THRESHOLD = 0.15  # 15% decline triggers alert
    MIN_SAMPLES_FOR_STATS = 5    # Need at least 5 executions for stats
    PROPOSAL_CONFIDENCE_THRESHOLD = 0.7  # 70% confidence to auto-propose

    def __init__(self, memori_client: MemoriClient):
        """
        Initialize self-improving backend service context.

        Args:
            memori_client: Memori client instance
        """
        super().__init__(memori_client)
        self._effectiveness_cache: Dict[str, PatternStats] = {}
        self._cache_timestamp: Optional[datetime] = None
        self._cache_ttl = timedelta(minutes=15)

    # -------------------------------------------------------------------------
    # Pattern Effectiveness Tracking
    # -------------------------------------------------------------------------

    def calculate_pattern_effectiveness(
        self,
        pattern: str,
        days: int = 90
    ) -> Optional[PatternStats]:
        """
        Calculate success rate and trends for a specific pattern.

        Args:
            pattern: Pattern name (e.g., "Pattern A", "Pattern B")
            days: Number of days to analyze

        Returns:
            PatternStats object or None if insufficient data
        """
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
            cutoff_30 = datetime.now() - timedelta(days=30)

            # Query all executions for this pattern
            cur.execute("""
                SELECT
                    metadata->>'outcome' as outcome,
                    metadata->>'duration_seconds' as duration,
                    metadata->>'issues_encountered' as issues,
                    created_at
                FROM memori.memories
                WHERE user_id = %s
                  AND metadata->>'type' = 'skill_execution'
                  AND metadata->>'pattern_used' ILIKE %s
                  AND created_at >= %s
            """, (self.memori.user_id, f"%{pattern}%", cutoff_date))

            rows = cur.fetchall()
            cur.close()
            conn.close()

            if len(rows) < self.MIN_SAMPLES_FOR_STATS:
                return None

            # Calculate stats
            total = len(rows)
            successful = sum(1 for r in rows if r[0] == 'success')
            failed = sum(1 for r in rows if r[0] == 'failure')
            partial = sum(1 for r in rows if r[0] == 'partial')

            durations = [float(r[1]) for r in rows if r[1] is not None]
            avg_duration = sum(durations) / len(durations) if durations else 0

            # Aggregate common issues
            all_issues = []
            for r in rows:
                if r[2]:
                    issues = json.loads(r[2]) if isinstance(r[2], str) else r[2]
                    all_issues.extend(issues)

            # Count issue frequency
            issue_counts = {}
            for issue in all_issues:
                issue_counts[issue] = issue_counts.get(issue, 0) + 1

            common_issues = sorted(
                issue_counts.keys(),
                key=lambda x: issue_counts[x],
                reverse=True
            )[:5]

            # Calculate recent trend
            recent_rows = [r for r in rows if r[3] >= cutoff_30]
            if len(recent_rows) >= 3:
                recent_success = sum(1 for r in recent_rows if r[0] == 'success')
                recent_rate = recent_success / len(recent_rows)
            else:
                recent_rate = successful / total

            overall_rate = successful / total

            if recent_rate > overall_rate + 0.1:
                trend = "improving"
            elif recent_rate < overall_rate - 0.1:
                trend = "declining"
            else:
                trend = "stable"

            return PatternStats(
                pattern=pattern,
                total_executions=total,
                successful=successful,
                failed=failed,
                partial=partial,
                success_rate=overall_rate,
                avg_duration_seconds=avg_duration,
                common_issues=common_issues,
                trend=trend,
                last_30_days_success_rate=recent_rate
            )

        except Exception as e:
            logger.error(f"Failed to calculate pattern effectiveness: {e}")
            return None

    def get_all_pattern_stats(self, days: int = 90) -> Dict[str, PatternStats]:
        """
        Get effectiveness stats for all patterns.

        Args:
            days: Number of days to analyze

        Returns:
            Dict mapping pattern names to stats
        """
        # Check cache
        if (self._cache_timestamp and
            datetime.now() - self._cache_timestamp < self._cache_ttl and
            self._effectiveness_cache):
            return self._effectiveness_cache

        patterns = ["Pattern A", "Pattern B", "Pattern C"]
        stats = {}

        for pattern in patterns:
            pattern_stats = self.calculate_pattern_effectiveness(pattern, days)
            if pattern_stats:
                stats[pattern] = pattern_stats

        # Update cache
        self._effectiveness_cache = stats
        self._cache_timestamp = datetime.now()

        return stats

    def get_recommended_pattern(
        self,
        domain: Optional[str] = None,
        has_business_logic: bool = True,
        has_complex_rules: bool = False
    ) -> Tuple[str, float, str]:
        """
        Get pattern recommendation weighted by historical success.

        Args:
            domain: Business domain (e.g., "loyalty", "player")
            has_business_logic: Whether service has business logic
            has_complex_rules: Whether service has complex validation rules

        Returns:
            Tuple of (recommended_pattern, confidence, rationale)
        """
        stats = self.get_all_pattern_stats()

        # Base recommendation from decision tree
        if has_complex_rules:
            base_pattern = "Pattern A"
            base_rationale = "Complex business rules require domain contracts"
        elif has_business_logic:
            base_pattern = "Pattern C"
            base_rationale = "Mixed complexity suggests hybrid approach"
        else:
            base_pattern = "Pattern B"
            base_rationale = "Simple CRUD benefits from minimal structure"

        # Adjust confidence based on historical data
        if base_pattern in stats:
            pattern_stats = stats[base_pattern]
            confidence = pattern_stats.success_rate

            # Adjust rationale based on trends
            if pattern_stats.trend == "declining":
                confidence *= 0.85
                base_rationale += f" (Note: Recent success rate declining to {pattern_stats.last_30_days_success_rate:.0%})"
            elif pattern_stats.trend == "improving":
                confidence = min(1.0, confidence * 1.1)
                base_rationale += f" (Trend: improving)"

            # Add historical context
            base_rationale += f" [Historical: {pattern_stats.success_rate:.0%} success rate over {pattern_stats.total_executions} executions]"
        else:
            confidence = 0.7  # Default confidence without data

        return base_pattern, confidence, base_rationale

    # -------------------------------------------------------------------------
    # Primitive Evolution Engine
    # -------------------------------------------------------------------------

    def propose_primitive_update(
        self,
        primitive_file: str,
        update_type: str,
        proposal: str,
        evidence: List[str],
        impact_assessment: Optional[str] = None
    ) -> Optional[str]:
        """
        Record a proposal to update a primitive based on learnings.

        Args:
            primitive_file: Reference doc to update (e.g., "bounded-contexts.md")
            update_type: Type of update (from UpdateType enum)
            proposal: The specific change proposed
            evidence: List of memory IDs supporting this proposal
            impact_assessment: Assessment of change impact

        Returns:
            Proposal ID if recorded, None if failed
        """
        if not self.memori.enabled:
            return None

        import uuid
        proposal_id = f"prop_{uuid.uuid4().hex[:8]}"

        content = f"Primitive update proposal: {proposal}"

        # Calculate confidence based on evidence strength
        confidence = min(0.95, 0.5 + (len(evidence) * 0.1))

        metadata = {
            "type": "primitive_proposal",
            "proposal_id": proposal_id,
            "primitive_file": primitive_file,
            "update_type": update_type,
            "proposal": proposal,
            "evidence_ids": evidence,
            "status": "pending",
            "confidence": confidence,
            "impact_assessment": impact_assessment or "Not assessed",
            "timestamp": datetime.now().isoformat(),
        }

        tags = ["primitive-proposal", "pending", update_type]

        result = self.memori.record_memory(
            content=content,
            category="rules",
            metadata=metadata,
            importance=0.85,
            tags=tags
        )

        if result:
            logger.info(f"Recorded primitive update proposal: {proposal_id}")
            return proposal_id

        return None

    def get_pending_primitive_updates(self) -> List[PrimitiveProposal]:
        """
        Get all pending primitive update proposals for review.

        Returns:
            List of pending proposals
        """
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
                SELECT content, metadata, created_at
                FROM memori.memories
                WHERE user_id = %s
                  AND metadata->>'type' = 'primitive_proposal'
                  AND metadata->>'status' = 'pending'
                ORDER BY created_at DESC
            """, (self.memori.user_id,))

            rows = cur.fetchall()
            cur.close()
            conn.close()

            proposals = []
            for row in rows:
                metadata = row[1]
                if isinstance(metadata, str):
                    metadata = json.loads(metadata)

                proposals.append(PrimitiveProposal(
                    id=metadata.get('proposal_id', 'unknown'),
                    primitive_file=metadata.get('primitive_file', ''),
                    update_type=metadata.get('update_type', ''),
                    proposal=metadata.get('proposal', ''),
                    evidence_ids=metadata.get('evidence_ids', []),
                    created_at=row[2].isoformat() if row[2] else '',
                    status=metadata.get('status', 'pending'),
                    confidence=metadata.get('confidence', 0.5),
                    impact_assessment=metadata.get('impact_assessment', '')
                ))

            return proposals

        except Exception as e:
            logger.error(f"Failed to get pending proposals: {e}")
            return []

    def update_proposal_status(
        self,
        proposal_id: str,
        status: str,  # "approved", "rejected", "applied"
        reviewer_notes: Optional[str] = None
    ) -> bool:
        """
        Update the status of a primitive proposal.

        Args:
            proposal_id: The proposal ID to update
            status: New status
            reviewer_notes: Optional notes from reviewer

        Returns:
            True if updated successfully
        """
        if not self.memori.enabled:
            return False

        try:
            import psycopg2
            import json

            db_url = self.memori.config.database_url.split('?')[0]
            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.execute("SET search_path TO memori, public")

            # Update the proposal metadata
            cur.execute("""
                UPDATE memori.memories
                SET metadata = metadata || %s::jsonb
                WHERE user_id = %s
                  AND metadata->>'proposal_id' = %s
            """, (
                json.dumps({
                    "status": status,
                    "reviewed_at": datetime.now().isoformat(),
                    "reviewer_notes": reviewer_notes or ""
                }),
                self.memori.user_id,
                proposal_id
            ))

            conn.commit()
            cur.close()
            conn.close()

            logger.info(f"Updated proposal {proposal_id} status to {status}")
            return True

        except Exception as e:
            logger.error(f"Failed to update proposal status: {e}")
            return False

    # -------------------------------------------------------------------------
    # Adaptive Recommendations
    # -------------------------------------------------------------------------

    def get_adaptive_recommendation(
        self,
        task_type: str,
        domain: Optional[str] = None,
        complexity: str = "medium"
    ) -> Dict[str, Any]:
        """
        Get recommendation weighted by historical success.

        Args:
            task_type: Type of task (create_service, add_migration, validate)
            domain: Business domain
            complexity: Complexity level (low, medium, high)

        Returns:
            Dict with recommendation, confidence, rationale, and alternatives
        """
        stats = self.get_all_pattern_stats()

        # Base recommendations by task type
        if task_type == "create_service":
            if complexity == "high":
                pattern, confidence, rationale = self.get_recommended_pattern(
                    domain=domain,
                    has_business_logic=True,
                    has_complex_rules=True
                )
            elif complexity == "low":
                pattern, confidence, rationale = self.get_recommended_pattern(
                    domain=domain,
                    has_business_logic=False,
                    has_complex_rules=False
                )
            else:
                pattern, confidence, rationale = self.get_recommended_pattern(
                    domain=domain,
                    has_business_logic=True,
                    has_complex_rules=False
                )
        else:
            # For non-service tasks, provide general guidance
            pattern = "N/A"
            confidence = 0.8
            rationale = f"Follow standard {task_type} workflow"

        # Find alternative recommendation
        alternative = None
        alt_confidence = 0

        for p, s in stats.items():
            if p != pattern and s.success_rate > 0.6:
                if not alternative or s.success_rate > alt_confidence:
                    alternative = p
                    alt_confidence = s.success_rate

        return {
            "pattern": pattern,
            "confidence": confidence,
            "rationale": rationale,
            "alternative": alternative,
            "alt_confidence": alt_confidence,
            "task_type": task_type,
            "domain": domain,
            "stats": {p: {"success_rate": s.success_rate, "trend": s.trend}
                     for p, s in stats.items()}
        }

    # -------------------------------------------------------------------------
    # Regression Detection
    # -------------------------------------------------------------------------

    def detect_pattern_regressions(self) -> List[RegressionAlert]:
        """
        Detect patterns that are performing worse than their baseline.

        Returns:
            List of regression alerts
        """
        stats = self.get_all_pattern_stats()
        alerts = []

        for pattern, pattern_stats in stats.items():
            # Compare recent (30 day) to overall
            if pattern_stats.total_executions >= self.MIN_SAMPLES_FOR_STATS:
                decline = pattern_stats.success_rate - pattern_stats.last_30_days_success_rate

                if decline > self.REGRESSION_THRESHOLD:
                    # Identify suspected cause from common issues
                    suspected_cause = (
                        pattern_stats.common_issues[0]
                        if pattern_stats.common_issues
                        else "Unknown - needs investigation"
                    )

                    alerts.append(RegressionAlert(
                        pattern=pattern,
                        baseline_success_rate=pattern_stats.success_rate,
                        current_success_rate=pattern_stats.last_30_days_success_rate,
                        decline_percentage=decline * 100,
                        suspected_cause=suspected_cause,
                        affected_services=[],  # Would need additional query
                        detected_at=datetime.now().isoformat()
                    ))

        return alerts

    def detect_anti_pattern_emergence(self, days: int = 30) -> List[Dict[str, Any]]:
        """
        Detect new anti-patterns emerging from execution data.

        Args:
            days: Number of days to analyze

        Returns:
            List of emerging anti-pattern alerts
        """
        if not self.memori.enabled:
            return []

        try:
            import psycopg2
            import json
            from collections import Counter

            db_url = self.memori.config.database_url.split('?')[0]
            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.execute("SET search_path TO memori, public")

            cutoff_date = datetime.now() - timedelta(days=days)

            # Get all validation findings
            cur.execute("""
                SELECT metadata->>'pattern_violated' as pattern,
                       COUNT(*) as count
                FROM memori.memories
                WHERE user_id = %s
                  AND metadata->>'type' = 'validation_finding'
                  AND metadata->>'finding_type' = 'error'
                  AND created_at >= %s
                GROUP BY metadata->>'pattern_violated'
                ORDER BY count DESC
                LIMIT 10
            """, (self.memori.user_id, cutoff_date))

            rows = cur.fetchall()
            cur.close()
            conn.close()

            # Identify frequently occurring patterns
            alerts = []
            for pattern, count in rows:
                if count >= 3:  # At least 3 occurrences to flag
                    alerts.append({
                        "anti_pattern": pattern,
                        "occurrence_count": count,
                        "period_days": days,
                        "severity": "high" if count >= 5 else "medium",
                        "recommendation": f"Consider adding '{pattern}' to anti-patterns documentation"
                    })

            return alerts

        except Exception as e:
            logger.error(f"Failed to detect anti-pattern emergence: {e}")
            return []

    # -------------------------------------------------------------------------
    # User Feedback Integration
    # -------------------------------------------------------------------------

    def record_user_correction(
        self,
        original_recommendation: str,
        user_choice: str,
        context: Dict[str, Any],
        reason: Optional[str] = None
    ) -> bool:
        """
        Record when user overrides a recommendation.

        This helps the system learn from corrections.

        Args:
            original_recommendation: What the system recommended
            user_choice: What the user chose instead
            context: Context of the decision (domain, complexity, etc.)
            reason: User's reason for override

        Returns:
            True if recorded successfully
        """
        if not self.memori.enabled:
            return False

        content = f"User correction: {original_recommendation} -> {user_choice}"

        metadata = {
            "type": "user_correction",
            "original_recommendation": original_recommendation,
            "user_choice": user_choice,
            "context": context,
            "reason": reason or "Not provided",
            "timestamp": datetime.now().isoformat(),
        }

        tags = ["user-correction", "learning-feedback"]

        return self.memori.record_memory(
            content=content,
            category="feedback",
            metadata=metadata,
            importance=0.9,  # High importance - direct feedback
            tags=tags
        ) is not None

    def record_execution_outcome_feedback(
        self,
        execution_id: str,
        user_satisfaction: str,  # "approved", "needs_revision", "rejected"
        feedback: Optional[str] = None
    ) -> bool:
        """
        Record user feedback on an execution outcome.

        Args:
            execution_id: ID of the execution to provide feedback on
            user_satisfaction: User's assessment
            feedback: Additional feedback text

        Returns:
            True if recorded successfully
        """
        if not self.memori.enabled:
            return False

        content = f"Execution feedback ({user_satisfaction}): {feedback or 'No additional feedback'}"

        metadata = {
            "type": "execution_feedback",
            "execution_id": execution_id,
            "user_satisfaction": user_satisfaction,
            "feedback": feedback,
            "timestamp": datetime.now().isoformat(),
        }

        tags = ["execution-feedback", user_satisfaction]

        return self.memori.record_memory(
            content=content,
            category="feedback",
            metadata=metadata,
            importance=0.85,
            tags=tags
        ) is not None

    # -------------------------------------------------------------------------
    # Analytics & Insights
    # -------------------------------------------------------------------------

    def get_learning_summary(self) -> Dict[str, Any]:
        """
        Get a summary of all learning data for this skill.

        Returns:
            Dict with summary statistics
        """
        stats = self.get_all_pattern_stats()
        regressions = self.detect_pattern_regressions()
        anti_patterns = self.detect_anti_pattern_emergence()
        proposals = self.get_pending_primitive_updates()

        return {
            "pattern_stats": {
                p: {
                    "success_rate": s.success_rate,
                    "total_executions": s.total_executions,
                    "trend": s.trend
                }
                for p, s in stats.items()
            },
            "regressions": len(regressions),
            "regression_details": [
                {"pattern": r.pattern, "decline": f"{r.decline_percentage:.1f}%"}
                for r in regressions
            ],
            "emerging_anti_patterns": len(anti_patterns),
            "pending_proposals": len(proposals),
            "recommendations": {
                "most_reliable_pattern": max(
                    stats.items(),
                    key=lambda x: x[1].success_rate
                )[0] if stats else "N/A",
                "needs_attention": [r.pattern for r in regressions]
            }
        }

    def format_learning_report(self) -> str:
        """
        Format a human-readable learning report.

        Returns:
            Formatted markdown report
        """
        summary = self.get_learning_summary()

        lines = [
            "# Backend Service Builder - Learning Report",
            "",
            f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            "",
            "## Pattern Effectiveness",
            ""
        ]

        for pattern, stats in summary["pattern_stats"].items():
            trend_emoji = {"improving": "📈", "stable": "➡️", "declining": "📉"}.get(stats["trend"], "❓")
            lines.append(f"- **{pattern}**: {stats['success_rate']:.0%} success ({stats['total_executions']} executions) {trend_emoji}")

        if summary["regressions"]:
            lines.extend([
                "",
                "## ⚠️ Regressions Detected",
                ""
            ])
            for r in summary["regression_details"]:
                lines.append(f"- {r['pattern']}: declined {r['decline']}")

        if summary["emerging_anti_patterns"]:
            lines.extend([
                "",
                f"## 🔍 Emerging Anti-Patterns: {summary['emerging_anti_patterns']}",
                ""
            ])

        if summary["pending_proposals"]:
            lines.extend([
                "",
                f"## 📋 Pending Primitive Updates: {summary['pending_proposals']}",
                ""
            ])

        lines.extend([
            "",
            "## Recommendations",
            "",
            f"- **Most Reliable Pattern:** {summary['recommendations']['most_reliable_pattern']}",
        ])

        if summary["recommendations"]["needs_attention"]:
            lines.append(f"- **Needs Attention:** {', '.join(summary['recommendations']['needs_attention'])}")

        return "\n".join(lines)
