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
    Also provides session checkpoint/restore for context continuity across /clear.
    """

    def __init__(self, memori_client: MemoriClient):
        """
        Initialize skill context manager.

        Args:
            memori_client: Memori client instance
        """
        self.memori = memori_client
        self.skill_namespace = memori_client.chatmode  # Should be "skill:skill-name"

    # -------------------------------------------------------------------------
    # Session Checkpoint Methods (for context continuity across /clear)
    # -------------------------------------------------------------------------

    def _get_session_namespace(self) -> str:
        """Get the session namespace for checkpoints, with TTL support."""
        session_ns = self.memori.get_session_namespace()
        return session_ns if session_ns else self.memori.user_id

    def save_checkpoint(
        self,
        current_task: str,
        reason: str = "manual",  # context_threshold_60pct, manual, session_end
        decisions_made: Optional[List[str]] = None,
        files_modified: Optional[List[str]] = None,
        validation_gates_passed: Optional[List[int]] = None,
        open_questions: Optional[List[str]] = None,
        next_steps: Optional[List[str]] = None,
        key_insights: Optional[List[str]] = None,
        workflow: Optional[str] = None,
        notes: Optional[str] = None
    ) -> bool:
        """
        Save a session checkpoint before context clear.

        This creates a high-importance memory that captures the current work state,
        allowing the session to resume after /clear.

        Checkpoints are stored in the session namespace with 7-day TTL.

        Args:
            current_task: What you're currently working on
            reason: Why the checkpoint is being saved
            decisions_made: Key decisions made this session
            files_modified: Files created or modified
            validation_gates_passed: Gates passed in the workflow
            open_questions: Unresolved questions needing user input
            next_steps: What to do after resuming
            key_insights: Important learnings from this session
            workflow: Active workflow name
            notes: Additional context notes

        Returns:
            True if checkpoint saved successfully
        """
        if not self.memori.enabled:
            return False

        import psycopg2
        import json
        from datetime import timedelta

        session_ns = self._get_session_namespace()
        ttl_days = self.memori.get_session_ttl_days()
        expires_at = datetime.now() + timedelta(days=ttl_days)

        content = f"Session checkpoint ({reason}): {current_task}"

        metadata = {
            "type": "session_checkpoint",
            "checkpoint_reason": reason,
            "current_task": current_task,
            "timestamp": datetime.now().isoformat(),
            "skill_namespace": self.skill_namespace,
            "ttl_days": ttl_days,
        }

        if decisions_made:
            metadata["decisions_made"] = decisions_made
        if files_modified:
            metadata["files_modified"] = files_modified
        if validation_gates_passed:
            metadata["validation_gates_passed"] = validation_gates_passed
        if open_questions:
            metadata["open_questions"] = open_questions
        if next_steps:
            metadata["next_steps"] = next_steps
        if key_insights:
            metadata["key_insights"] = key_insights
        if workflow:
            metadata["workflow"] = workflow
        if notes:
            metadata["notes"] = notes

        tags = ["session-checkpoint", reason]
        metadata["tags"] = tags

        try:
            db_url = self.memori.config.database_url.split('?')[0]
            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.execute("SET search_path TO memori, public")

            cur.execute("""
                INSERT INTO memori.memories (user_id, content, category, metadata, expires_at)
                VALUES (%s, %s, %s, %s, %s)
            """, (session_ns, content, "context", json.dumps(metadata), expires_at))

            conn.commit()
            cur.close()
            conn.close()

            logger.info(f"✅ Session checkpoint saved to {session_ns}: {current_task[:50]}...")
            return True

        except Exception as e:
            logger.error(f"Failed to save checkpoint: {e}")
            return False

    def load_latest_checkpoint(self) -> Optional[Dict[str, Any]]:
        """
        Load the most recent session checkpoint.

        Searches in session namespace first, falls back to main namespace for
        backwards compatibility with pre-migration checkpoints.

        Returns:
            Checkpoint metadata dict or None if no checkpoint found
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

            session_ns = self._get_session_namespace()

            # Search in session namespace first, then fall back to main namespace
            namespaces_to_search = [session_ns, self.memori.user_id]
            # Also search any session namespace pattern for this skill
            skill_short = self.memori.SESSION_CHECKPOINT_SKILLS.get(self.memori.chatmode)
            if skill_short:
                namespaces_to_search.append(f"session_{skill_short}_%")

            cur.execute("""
                SELECT content, metadata, created_at, user_id
                FROM memori.memories
                WHERE (user_id = ANY(%s) OR user_id LIKE %s)
                  AND metadata->>'type' = 'session_checkpoint'
                  AND (expires_at IS NULL OR expires_at > NOW())
                ORDER BY created_at DESC
                LIMIT 1
            """, (namespaces_to_search[:2], namespaces_to_search[2] if len(namespaces_to_search) > 2 else ''))

            row = cur.fetchone()
            cur.close()
            conn.close()

            if not row:
                logger.info("No checkpoint found")
                return None

            metadata = row[1]
            if isinstance(metadata, str):
                metadata = json.loads(metadata)

            metadata["content"] = row[0]
            metadata["saved_at"] = row[2].isoformat() if row[2] else None
            metadata["source_namespace"] = row[3]

            logger.info(f"✅ Loaded checkpoint from {metadata.get('saved_at', 'unknown')}")
            return metadata

        except Exception as e:
            logger.error(f"Failed to load checkpoint: {e}")
            return None

    def format_checkpoint_for_resume(self, checkpoint: Optional[Dict[str, Any]] = None) -> str:
        """
        Format a checkpoint as markdown for injection into context after /clear.

        Args:
            checkpoint: Checkpoint dict (if None, loads latest)

        Returns:
            Formatted markdown string for context injection
        """
        if checkpoint is None:
            checkpoint = self.load_latest_checkpoint()

        if not checkpoint:
            return "No previous session checkpoint found."

        lines = [
            "## 🔄 Resumed Session Context",
            "",
            f"**Saved at:** {checkpoint.get('saved_at', 'unknown')}",
            f"**Reason:** {checkpoint.get('checkpoint_reason', 'unknown')}",
            "",
            f"### Current Task",
            checkpoint.get('current_task', 'Unknown'),
            "",
        ]

        if checkpoint.get('workflow'):
            lines.append(f"**Workflow:** {checkpoint['workflow']}")

        if checkpoint.get('decisions_made'):
            lines.extend(["", "### Decisions Made This Session"])
            for decision in checkpoint['decisions_made']:
                lines.append(f"- {decision}")

        if checkpoint.get('files_modified'):
            lines.extend(["", "### Files Modified"])
            for f in checkpoint['files_modified']:
                lines.append(f"- {f}")

        if checkpoint.get('validation_gates_passed'):
            gates = ", ".join(str(g) for g in checkpoint['validation_gates_passed'])
            lines.extend(["", f"### Validation Gates Passed: {gates}"])

        if checkpoint.get('open_questions'):
            lines.extend(["", "### Open Questions (Require User Input)"])
            for q in checkpoint['open_questions']:
                lines.append(f"- ❓ {q}")

        if checkpoint.get('next_steps'):
            lines.extend(["", "### Next Steps"])
            for step in checkpoint['next_steps']:
                lines.append(f"- [ ] {step}")

        if checkpoint.get('key_insights'):
            lines.extend(["", "### Key Insights"])
            for insight in checkpoint['key_insights']:
                lines.append(f"- 💡 {insight}")

        if checkpoint.get('notes'):
            lines.extend(["", "### Notes", checkpoint['notes']])

        lines.extend([
            "",
            "---",
            "*Continue from where you left off. Review the above context and proceed with the next steps.*"
        ])

        return "\n".join(lines)

    def get_checkpoint_count(self) -> int:
        """Get the number of active (non-expired) checkpoints for this skill."""
        if not self.memori.enabled:
            return 0

        try:
            import psycopg2

            db_url = self.memori.config.database_url.split('?')[0]
            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.execute("SET search_path TO memori, public")

            session_ns = self._get_session_namespace()
            skill_short = self.memori.SESSION_CHECKPOINT_SKILLS.get(self.memori.chatmode)
            pattern = f"session_{skill_short}_%" if skill_short else ""

            cur.execute("""
                SELECT COUNT(*)
                FROM memori.memories
                WHERE (user_id = %s OR user_id LIKE %s)
                  AND metadata->>'type' = 'session_checkpoint'
                  AND (expires_at IS NULL OR expires_at > NOW())
            """, (session_ns, pattern))

            count = cur.fetchone()[0]
            cur.close()
            conn.close()

            return count

        except Exception as e:
            logger.warning(f"Failed to count checkpoints: {e}")
            return 0

    # -------------------------------------------------------------------------
    # Skill Execution Recording Methods
    # -------------------------------------------------------------------------

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


class ArchitectContext:
    """
    Architect-specific context manager for lead-architect skill.

    Provides specialized memory recording methods for architectural decisions,
    documentation regressions, pattern selections, and compliance designs.

    Also provides session checkpoint/restore for context continuity across /clear.

    Namespace Strategy:
    - Permanent knowledge (decisions, patterns, regressions) → arch_decisions
    - Session checkpoints (ephemeral, 7-day TTL) → session_lead_architect_{YYYY_MM}
    """

    def __init__(self, memori_client: MemoriClient):
        """
        Initialize architect context manager.

        Args:
            memori_client: Memori client instance (should be enabled)
        """
        self.memori = memori_client
        self.skill_namespace = memori_client.chatmode

    def _get_session_namespace(self) -> str:
        """Get the session namespace for checkpoints, with TTL support."""
        session_ns = self.memori.get_session_namespace()
        return session_ns if session_ns else self.memori.user_id

    # -------------------------------------------------------------------------
    # Session Checkpoint Methods (for context continuity across /clear)
    # -------------------------------------------------------------------------

    def save_checkpoint(
        self,
        current_task: str,
        reason: str = "manual",  # context_threshold_60pct, manual, session_end
        decisions_made: Optional[List[str]] = None,
        files_modified: Optional[List[str]] = None,
        validation_gates_passed: Optional[List[int]] = None,
        open_questions: Optional[List[str]] = None,
        next_steps: Optional[List[str]] = None,
        key_insights: Optional[List[str]] = None,
        spec_file: Optional[str] = None,
        workflow: Optional[str] = None,
        notes: Optional[str] = None
    ) -> bool:
        """
        Save a session checkpoint before context clear.

        This creates a high-importance memory that captures the current work state,
        allowing the session to resume after /clear.

        Checkpoints are stored in the session namespace with 7-day TTL.

        Args:
            current_task: What you're currently working on
            reason: Why the checkpoint is being saved
            decisions_made: Architectural decisions made this session
            files_modified: Files created or modified
            validation_gates_passed: Gates passed in the workflow
            open_questions: Unresolved questions needing user input
            next_steps: What to do after resuming
            key_insights: Important learnings from this session
            spec_file: Active spec file (if any)
            workflow: Active workflow name
            notes: Additional context notes

        Returns:
            True if checkpoint saved successfully
        """
        if not self.memori.enabled:
            return False

        import psycopg2
        import json
        from datetime import timedelta

        session_ns = self._get_session_namespace()
        ttl_days = self.memori.get_session_ttl_days()
        expires_at = datetime.now() + timedelta(days=ttl_days)

        content = f"Session checkpoint ({reason}): {current_task}"

        metadata = {
            "type": "session_checkpoint",
            "checkpoint_reason": reason,
            "current_task": current_task,
            "timestamp": datetime.now().isoformat(),
            "skill_namespace": self.skill_namespace,
            "ttl_days": ttl_days,
        }

        if decisions_made:
            metadata["decisions_made"] = decisions_made
        if files_modified:
            metadata["files_modified"] = files_modified
        if validation_gates_passed:
            metadata["validation_gates_passed"] = validation_gates_passed
        if open_questions:
            metadata["open_questions"] = open_questions
        if next_steps:
            metadata["next_steps"] = next_steps
        if key_insights:
            metadata["key_insights"] = key_insights
        if spec_file:
            metadata["spec_file"] = spec_file
        if workflow:
            metadata["workflow"] = workflow
        if notes:
            metadata["notes"] = notes

        tags = ["session-checkpoint", reason]
        metadata["tags"] = tags

        try:
            db_url = self.memori.config.database_url.split('?')[0]
            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.execute("SET search_path TO memori, public")

            cur.execute("""
                INSERT INTO memori.memories (user_id, content, category, metadata, expires_at)
                VALUES (%s, %s, %s, %s, %s)
            """, (session_ns, content, "context", json.dumps(metadata), expires_at))

            conn.commit()
            cur.close()
            conn.close()

            logger.info(f"✅ Session checkpoint saved to {session_ns}: {current_task[:50]}...")
            return True

        except Exception as e:
            logger.error(f"Failed to save checkpoint: {e}")
            return False

    def load_latest_checkpoint(self) -> Optional[Dict[str, Any]]:
        """
        Load the most recent session checkpoint.

        Searches in session namespace first, falls back to main namespace for
        backwards compatibility with pre-migration checkpoints.

        Returns:
            Checkpoint metadata dict or None if no checkpoint found
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

            session_ns = self._get_session_namespace()

            # Search in session namespace first, then fall back to arch_decisions
            # Also include pattern matching for any month's session namespace
            cur.execute("""
                SELECT content, metadata, created_at, user_id
                FROM memori.memories
                WHERE (user_id = %s OR user_id = %s OR user_id LIKE 'session_lead_architect_%%')
                  AND metadata->>'type' = 'session_checkpoint'
                  AND (expires_at IS NULL OR expires_at > NOW())
                ORDER BY created_at DESC
                LIMIT 1
            """, (session_ns, self.memori.user_id))

            row = cur.fetchone()
            cur.close()
            conn.close()

            if not row:
                logger.info("No checkpoint found")
                return None

            metadata = row[1]
            if isinstance(metadata, str):
                metadata = json.loads(metadata)

            metadata["content"] = row[0]
            metadata["saved_at"] = row[2].isoformat() if row[2] else None
            metadata["source_namespace"] = row[3]

            logger.info(f"✅ Loaded checkpoint from {metadata.get('saved_at', 'unknown')}")
            return metadata

        except Exception as e:
            logger.error(f"Failed to load checkpoint: {e}")
            return None

    def format_checkpoint_for_resume(self, checkpoint: Optional[Dict[str, Any]] = None) -> str:
        """
        Format a checkpoint as markdown for injection into context after /clear.

        Args:
            checkpoint: Checkpoint dict (if None, loads latest)

        Returns:
            Formatted markdown string for context injection
        """
        if checkpoint is None:
            checkpoint = self.load_latest_checkpoint()

        if not checkpoint:
            return "No previous session checkpoint found."

        lines = [
            "## 🔄 Resumed Session Context",
            "",
            f"**Saved at:** {checkpoint.get('saved_at', 'unknown')}",
            f"**Reason:** {checkpoint.get('checkpoint_reason', 'unknown')}",
            "",
            f"### Current Task",
            checkpoint.get('current_task', 'Unknown'),
            "",
        ]

        if checkpoint.get('spec_file'):
            lines.append(f"**Spec File:** {checkpoint['spec_file']}")
        if checkpoint.get('workflow'):
            lines.append(f"**Workflow:** {checkpoint['workflow']}")

        if checkpoint.get('decisions_made'):
            lines.extend(["", "### Decisions Made This Session"])
            for decision in checkpoint['decisions_made']:
                lines.append(f"- {decision}")

        if checkpoint.get('files_modified'):
            lines.extend(["", "### Files Modified"])
            for f in checkpoint['files_modified']:
                lines.append(f"- {f}")

        if checkpoint.get('validation_gates_passed'):
            gates = ", ".join(str(g) for g in checkpoint['validation_gates_passed'])
            lines.extend(["", f"### Validation Gates Passed: {gates}"])

        if checkpoint.get('open_questions'):
            lines.extend(["", "### Open Questions (Require User Input)"])
            for q in checkpoint['open_questions']:
                lines.append(f"- ❓ {q}")

        if checkpoint.get('next_steps'):
            lines.extend(["", "### Next Steps"])
            for step in checkpoint['next_steps']:
                lines.append(f"- [ ] {step}")

        if checkpoint.get('key_insights'):
            lines.extend(["", "### Key Insights"])
            for insight in checkpoint['key_insights']:
                lines.append(f"- 💡 {insight}")

        if checkpoint.get('notes'):
            lines.extend(["", "### Notes", checkpoint['notes']])

        lines.extend([
            "",
            "---",
            "*Continue from where you left off. Review the above context and proceed with the next steps.*"
        ])

        return "\n".join(lines)

    def get_checkpoint_count(self) -> int:
        """Get the number of active (non-expired) checkpoints for lead-architect."""
        if not self.memori.enabled:
            return 0

        try:
            import psycopg2

            db_url = self.memori.config.database_url.split('?')[0]
            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.execute("SET search_path TO memori, public")

            session_ns = self._get_session_namespace()

            # Search in session namespace and any lead_architect session pattern
            cur.execute("""
                SELECT COUNT(*)
                FROM memori.memories
                WHERE (user_id = %s OR user_id LIKE 'session_lead_architect_%%')
                  AND metadata->>'type' = 'session_checkpoint'
                  AND (expires_at IS NULL OR expires_at > NOW())
            """, (session_ns,))

            count = cur.fetchone()[0]
            cur.close()
            conn.close()

            return count

        except Exception as e:
            logger.warning(f"Failed to count checkpoints: {e}")
            return 0

    def record_architectural_decision(
        self,
        decision: str,
        rationale: str,
        alternatives_considered: Optional[List[str]] = None,
        affected_services: Optional[List[str]] = None,
        affected_docs: Optional[List[str]] = None,
        pattern_used: Optional[str] = None,
        domain: Optional[str] = None,
        complexity_level: str = "medium",  # low, medium, high
        success_outcome: Optional[str] = None  # approved, needs_revision, rejected
    ) -> bool:
        """
        Record an architectural decision with rationale and alternatives.

        Args:
            decision: The decision made (e.g., "Use Pattern A for LoyaltyService")
            rationale: Why this decision was made
            alternatives_considered: Other options that were rejected
            affected_services: Services impacted by this decision
            affected_docs: Documentation that needs updating
            pattern_used: Architecture pattern applied (Pattern A/B/C)
            domain: Business domain (Loyalty, Player, MTL, etc.)
            complexity_level: Complexity assessment
            success_outcome: User approval status

        Returns:
            True if recorded successfully
        """
        if not self.memori.enabled:
            return False

        content = f"Architectural decision: {decision}"

        metadata = {
            "type": "architectural_decision",
            "decision": decision,
            "rationale": rationale,
            "complexity_level": complexity_level,
            "timestamp": datetime.now().isoformat(),
        }

        if alternatives_considered:
            metadata["alternatives_considered"] = alternatives_considered
        if affected_services:
            metadata["affected_services"] = affected_services
        if affected_docs:
            metadata["affected_docs"] = affected_docs
        if pattern_used:
            metadata["pattern_used"] = pattern_used
        if domain:
            metadata["domain"] = domain
        if success_outcome:
            metadata["success_outcome"] = success_outcome

        tags = ["architectural-decision", complexity_level]
        if pattern_used:
            tags.append(pattern_used.replace(" ", "-"))
        if domain:
            tags.append(domain.lower())

        return self.memori.record_memory(
            content=content,
            category="skills",
            metadata=metadata,
            importance=0.9,
            tags=tags
        ) is not None

    def record_documentation_regression(
        self,
        regression_type: str,  # schema_drift, srm_conflict, adr_contradiction, etc.
        affected_docs: List[str],
        description: str,
        resolution: str,
        rectification_approach: str = "aligned_with_implementation",  # or "proposed_new_pattern"
        lessons_learned: Optional[List[str]] = None
    ) -> bool:
        """
        Record documentation inconsistency found and how it was resolved.

        Args:
            regression_type: Type of regression (schema_drift, srm_conflict, etc.)
            affected_docs: List of affected documentation files
            description: What was inconsistent
            resolution: How it was fixed
            rectification_approach: Approach taken to fix
            lessons_learned: Insights for future

        Returns:
            True if recorded successfully
        """
        if not self.memori.enabled:
            return False

        content = f"Documentation regression ({regression_type}): {description}"

        metadata = {
            "type": "documentation_regression",
            "regression_type": regression_type,
            "affected_docs": affected_docs,
            "description": description,
            "resolution": resolution,
            "rectification_approach": rectification_approach,
            "timestamp": datetime.now().isoformat(),
        }

        if lessons_learned:
            metadata["lessons_learned"] = lessons_learned

        tags = ["documentation-regression", regression_type]

        return self.memori.record_memory(
            content=content,
            category="rules",
            metadata=metadata,
            importance=0.85,
            tags=tags
        ) is not None

    def record_pattern_selection(
        self,
        feature: str,
        pattern_chosen: str,
        rationale: str,
        domain: Optional[str] = None,
        alternatives_considered: Optional[List[str]] = None,
        success_outcome: Optional[str] = None  # approved, needs_revision, rejected
    ) -> bool:
        """
        Record which pattern was chosen for a specific feature/scenario.

        Args:
            feature: Feature being implemented
            pattern_chosen: Pattern selected (e.g., "Pattern A (Contract-First)")
            rationale: Why this pattern was chosen
            domain: Business domain
            alternatives_considered: Other patterns considered
            success_outcome: User approval status

        Returns:
            True if recorded successfully
        """
        if not self.memori.enabled:
            return False

        content = f"Pattern selection for {feature}: {pattern_chosen}"

        metadata = {
            "type": "pattern_selection",
            "feature": feature,
            "pattern_chosen": pattern_chosen,
            "rationale": rationale,
            "timestamp": datetime.now().isoformat(),
        }

        if domain:
            metadata["domain"] = domain
        if alternatives_considered:
            metadata["alternatives_considered"] = alternatives_considered
        if success_outcome:
            metadata["success_outcome"] = success_outcome

        tags = ["pattern-selection", pattern_chosen.replace(" ", "-").replace("(", "").replace(")", "")]
        if domain:
            tags.append(domain.lower())

        return self.memori.record_memory(
            content=content,
            category="skills",
            metadata=metadata,
            importance=0.8,
            tags=tags
        ) is not None

    def record_tech_debt_assessment(
        self,
        area: str,
        debt_category: str,  # bounded_context_violations, schema_drift, etc.
        severity: str,  # critical, high, medium, low
        impact: str,
        remediation_strategy: str,
        estimated_effort: Optional[str] = None,
        priority: Optional[str] = None  # P0, P1, P2, P3
    ) -> bool:
        """
        Record technical debt assessment.

        Args:
            area: Area of codebase with debt
            debt_category: Category of debt
            severity: How severe the debt is
            impact: What impact this debt has
            remediation_strategy: How to fix it
            estimated_effort: Time estimate to fix
            priority: Priority level

        Returns:
            True if recorded successfully
        """
        if not self.memori.enabled:
            return False

        content = f"Tech debt ({severity}): {area} - {debt_category}"

        metadata = {
            "type": "tech_debt",
            "area": area,
            "debt_category": debt_category,
            "severity": severity,
            "impact": impact,
            "remediation_strategy": remediation_strategy,
            "timestamp": datetime.now().isoformat(),
        }

        if estimated_effort:
            metadata["estimated_effort"] = estimated_effort
        if priority:
            metadata["priority"] = priority

        tags = ["tech-debt", severity, debt_category.replace("_", "-")]
        if priority:
            tags.append(priority)

        # Higher importance for critical/high severity
        importance = 0.95 if severity in ("critical", "high") else 0.7

        return self.memori.record_memory(
            content=content,
            category="rules",
            metadata=metadata,
            importance=importance,
            tags=tags
        ) is not None

    def record_compliance_design(
        self,
        feature: str,
        compliance_requirements: List[str],
        rls_policies: Optional[List[str]] = None,
        rbac_roles: Optional[List[str]] = None,
        audit_log_location: Optional[str] = None,
        retention_period: Optional[str] = None,
        encryption_required: bool = False
    ) -> bool:
        """
        Record security and compliance architectural decisions.

        Args:
            feature: Feature being designed
            compliance_requirements: Compliance standards (GDPR, SOC2, etc.)
            rls_policies: RLS policies required
            rbac_roles: Roles affected
            audit_log_location: Where audit logs are stored
            retention_period: Data retention requirement
            encryption_required: Whether encryption is needed

        Returns:
            True if recorded successfully
        """
        if not self.memori.enabled:
            return False

        content = f"Compliance design for {feature}: {', '.join(compliance_requirements)}"

        metadata = {
            "type": "compliance_design",
            "feature": feature,
            "compliance_requirements": compliance_requirements,
            "encryption_required": encryption_required,
            "timestamp": datetime.now().isoformat(),
        }

        if rls_policies:
            metadata["rls_policies"] = rls_policies
        if rbac_roles:
            metadata["rbac_roles"] = rbac_roles
        if audit_log_location:
            metadata["audit_log_location"] = audit_log_location
        if retention_period:
            metadata["retention_period"] = retention_period

        tags = ["compliance-design"] + [r.lower().replace(" ", "-") for r in compliance_requirements[:3]]

        return self.memori.record_memory(
            content=content,
            category="rules",
            metadata=metadata,
            importance=0.9,
            tags=tags
        ) is not None

    def query_past_decisions(
        self,
        query: str,
        domain: Optional[str] = None,
        pattern: Optional[str] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Query past architectural decisions.

        Args:
            query: Search query
            domain: Filter by domain
            pattern: Filter by pattern
            limit: Maximum results

        Returns:
            List of past decisions
        """
        if not self.memori.enabled:
            return []

        search_query = query
        if domain:
            search_query += f" {domain}"
        if pattern:
            search_query += f" {pattern}"

        tags = ["architectural-decision"]
        if pattern:
            tags.append(pattern.replace(" ", "-"))

        try:
            return self.memori.search_learnings(
                query=search_query,
                tags=tags,
                category="skills",
                limit=limit
            )
        except Exception as e:
            logger.warning(f"Failed to query past decisions: {e}")
            return []

    def query_past_regressions(
        self,
        regression_type: Optional[str] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Query past documentation regressions.

        Args:
            regression_type: Filter by regression type
            limit: Maximum results

        Returns:
            List of past regressions
        """
        if not self.memori.enabled:
            return []

        query = "documentation regression"
        if regression_type:
            query += f" {regression_type}"

        tags = ["documentation-regression"]
        if regression_type:
            tags.append(regression_type)

        try:
            return self.memori.search_learnings(
                query=query,
                tags=tags,
                category="rules",
                limit=limit
            )
        except Exception as e:
            logger.warning(f"Failed to query past regressions: {e}")
            return []
