#!/usr/bin/env python3
"""
Skill-specific context management for PT-2 agentic workflows.

Provides specialized memory recording for skills and validation scripts.
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
from loguru import logger

from .client import MemoriClient


class SkillContext:
    """
    Skill-specific context manager.

    Provides specialized memory recording methods for skill executions.
    """

    def __init__(self, memori_client: MemoriClient):
        """
        Initialize skill context manager.

        Args:
            memori_client: Memori client instance
        """
        self.memori = memori_client
        self.skill_namespace = memori_client.chatmode  # Should be "skill:skill-name"

    def record_skill_execution(
        self,
        skill_name: str,
        task: str,
        outcome: str,  # "success", "failure", "partial"
        pattern_used: Optional[str] = None,
        validation_results: Optional[Dict[str, Any]] = None,
        files_created: Optional[List[str]] = None,
        issues_encountered: Optional[List[str]] = None,
        duration_seconds: Optional[int] = None,
        lessons_learned: Optional[List[str]] = None,
        user_satisfaction: Optional[str] = None,  # "approved", "needs_revision", "rejected"
        error: Optional[str] = None
    ) -> bool:
        """
        Record complete skill execution outcome.

        Args:
            skill_name: Name of the skill executed
            task: Description of the task (e.g., "Create LoyaltyService")
            outcome: Execution outcome ("success", "failure", "partial")
            pattern_used: Pattern/approach used (e.g., "Pattern A")
            validation_results: Validation check results
            files_created: List of files created during execution
            issues_encountered: Problems encountered and how resolved
            duration_seconds: Execution duration
            lessons_learned: Insights gained during execution
            user_satisfaction: User feedback on outcome
            error: Error message if failed

        Returns:
            True if recorded
        """
        if not self.memori.enabled:
            return False

        content = f"Skill execution: {task}"

        metadata = {
            "type": "skill_execution",
            "skill_name": skill_name,
            "task": task,
            "outcome": outcome,
            "timestamp": datetime.now().isoformat(),
        }

        if pattern_used:
            metadata["pattern_used"] = pattern_used
        if validation_results:
            metadata["validation_results"] = validation_results
        if files_created:
            metadata["files_created"] = files_created
        if issues_encountered:
            metadata["issues_encountered"] = issues_encountered
        if duration_seconds is not None:
            metadata["duration_seconds"] = duration_seconds
        if lessons_learned:
            metadata["lessons_learned"] = lessons_learned
        if user_satisfaction:
            metadata["user_satisfaction"] = user_satisfaction
        if error:
            metadata["error"] = error

        # Tag with outcome and pattern for easy querying
        tags = ["skill-execution", outcome]
        if pattern_used:
            tags.append(pattern_used.replace(" ", "-"))

        return self.memori.record_memory(
            content=content,
            category="skills",
            metadata=metadata,
            importance=0.8,
            tags=tags
        ) is not None


class ValidationContext:
    """
    Validation script context manager.

    Provides specialized memory recording for validation findings.
    """

    def __init__(self, memori_client: MemoriClient):
        """
        Initialize validation context manager.

        Args:
            memori_client: Memori client instance
        """
        self.memori = memori_client
        self.skill_namespace = memori_client.chatmode  # Should be "skill:skill-name"

    def record_validation_finding(
        self,
        service_name: str,
        finding_type: str,  # "error", "warning", "info"
        pattern_violated: str,
        description: str,
        file_location: Optional[str] = None,
        severity: str = "medium",  # "critical", "high", "medium", "low"
        resolution: Optional[str] = None,
        resolved: bool = False
    ) -> bool:
        """
        Record validation finding (error, warning, or info).

        Args:
            service_name: Service being validated
            finding_type: Type of finding ("error", "warning", "info")
            pattern_violated: Anti-pattern or rule violated
            description: Finding description
            file_location: File and line number (e.g., "loyalty.ts:42")
            severity: Severity level
            resolution: How the issue was resolved (if applicable)
            resolved: Whether the issue has been resolved

        Returns:
            True if recorded
        """
        if not self.memori.enabled:
            return False

        content = f"{service_name}: {pattern_violated} - {description}"

        metadata = {
            "type": "validation_finding",
            "service_name": service_name,
            "finding_type": finding_type,
            "pattern_violated": pattern_violated,
            "description": description,
            "severity": severity,
            "resolved": resolved,
            "timestamp": datetime.now().isoformat(),
        }

        if file_location:
            metadata["file_location"] = file_location
        if resolution:
            metadata["resolution"] = resolution

        # Tag with pattern and severity for querying
        tags = ["validation", finding_type, severity, pattern_violated.replace(" ", "-")]

        # Higher importance for unresolved errors
        importance = 0.9 if (finding_type == "error" and not resolved) else 0.6

        return self.memori.record_memory(
            content=content,
            category="validation",
            metadata=metadata,
            importance=importance,
            tags=tags
        ) is not None

    def record_validation_session(
        self,
        service_name: str,
        validation_type: str,  # "structure", "doc_consistency", "cross_context"
        errors_found: int,
        warnings_found: int,
        duration_seconds: Optional[int] = None,
        all_checks_passed: bool = False
    ) -> bool:
        """
        Record complete validation session outcome.

        Args:
            service_name: Service validated
            validation_type: Type of validation run
            errors_found: Number of errors
            warnings_found: Number of warnings
            duration_seconds: Validation duration
            all_checks_passed: Whether all checks passed

        Returns:
            True if recorded
        """
        if not self.memori.enabled:
            return False

        outcome = "passed" if all_checks_passed else "failed"
        content = f"Validation {outcome}: {service_name} ({validation_type})"

        metadata = {
            "type": "validation_session",
            "service_name": service_name,
            "validation_type": validation_type,
            "errors_found": errors_found,
            "warnings_found": warnings_found,
            "outcome": outcome,
            "timestamp": datetime.now().isoformat(),
        }

        if duration_seconds is not None:
            metadata["duration_seconds"] = duration_seconds

        tags = ["validation-session", outcome, validation_type]

        return self.memori.record_memory(
            content=content,
            category="validation",
            metadata=metadata,
            importance=0.7,
            tags=tags
        ) is not None

    def query_past_violations(
        self,
        service_name: Optional[str] = None,
        pattern_violated: Optional[str] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Query past validation violations.

        Args:
            service_name: Filter by service name
            pattern_violated: Filter by specific pattern
            limit: Maximum results

        Returns:
            List of past violations
        """
        if not self.memori.enabled:
            return []

        query_parts = []
        if service_name:
            query_parts.append(f"service:{service_name}")
        if pattern_violated:
            query_parts.append(pattern_violated)

        query = " ".join(query_parts) if query_parts else "validation violations"

        try:
            results = self.memori.search_memories(
                query=query,
                limit=limit,
                category="validation"
            )
            return results
        except Exception as e:
            logger.warning(f"Failed to query past violations: {e}")
            return []

    def suggest_fix_from_history(
        self,
        pattern_violated: str,
        limit: int = 5
    ) -> List[str]:
        """
        Suggest fixes based on how this pattern violation was resolved before.

        Args:
            pattern_violated: Anti-pattern to find resolutions for
            limit: Maximum suggestions

        Returns:
            List of resolution suggestions
        """
        if not self.memori.enabled:
            return []

        try:
            # Find past instances of this violation that were resolved
            results = self.memori.search_memories(
                query=f"{pattern_violated} resolution",
                limit=limit,
                category="validation"
            )

            suggestions = []
            for result in results:
                metadata = result.get("metadata", {})
                if metadata.get("resolved") and metadata.get("resolution"):
                    suggestions.append(metadata["resolution"])

            return list(set(suggestions))  # Remove duplicates
        except Exception as e:
            logger.warning(f"Failed to suggest fixes: {e}")
            return []
