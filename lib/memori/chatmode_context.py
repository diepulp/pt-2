#!/usr/bin/env python3
"""
Chatmode-specific context management for PT-2 agentic workflows.

Provides specialized memory recording for each chatmode role.
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
from loguru import logger

from .client import MemoriClient


class ChatmodeContext:
    """
    Chatmode-specific context manager.

    Provides specialized memory recording methods for each chatmode.
    Also provides session checkpoint/restore for context continuity across /clear.
    """

    def __init__(self, memori_client: MemoriClient):
        """
        Initialize chatmode context manager.

        Args:
            memori_client: Memori client instance
        """
        self.memori = memori_client
        self.chatmode = memori_client.chatmode

    # -------------------------------------------------------------------------
    # Session Checkpoint Methods (for context continuity across /clear)
    # -------------------------------------------------------------------------

    def save_checkpoint(
        self,
        current_task: str,
        reason: str = "manual",  # context_threshold_60pct, manual, session_end
        decisions_made: Optional[List[str]] = None,
        files_modified: Optional[List[str]] = None,
        services_touched: Optional[List[str]] = None,
        open_questions: Optional[List[str]] = None,
        next_steps: Optional[List[str]] = None,
        key_insights: Optional[List[str]] = None,
        active_domain: Optional[str] = None,
        notes: Optional[str] = None
    ) -> bool:
        """
        Save a session checkpoint before context clear.

        Args:
            current_task: What you're currently working on
            reason: Why the checkpoint is being saved
            decisions_made: Key decisions made this session
            files_modified: Files created or modified
            services_touched: Services worked on
            open_questions: Unresolved questions needing user input
            next_steps: What to do after resuming
            key_insights: Important learnings from this session
            active_domain: Active bounded context/domain
            notes: Additional context notes

        Returns:
            True if checkpoint saved successfully
        """
        if not self.memori.enabled:
            return False

        content = f"Session checkpoint ({reason}): {current_task}"

        metadata = {
            "type": "session_checkpoint",
            "checkpoint_reason": reason,
            "current_task": current_task,
            "timestamp": datetime.now().isoformat(),
            "chatmode_namespace": self.chatmode,
        }

        if decisions_made:
            metadata["decisions_made"] = decisions_made
        if files_modified:
            metadata["files_modified"] = files_modified
        if services_touched:
            metadata["services_touched"] = services_touched
        if open_questions:
            metadata["open_questions"] = open_questions
        if next_steps:
            metadata["next_steps"] = next_steps
        if key_insights:
            metadata["key_insights"] = key_insights
        if active_domain:
            metadata["active_domain"] = active_domain
        if notes:
            metadata["notes"] = notes

        tags = ["session-checkpoint", reason]

        # High importance to ensure retrieval
        result = self.memori.record_memory(
            content=content,
            category="context",
            metadata=metadata,
            importance=0.95,
            tags=tags
        )

        if result:
            logger.info(f"✅ Chatmode checkpoint saved: {current_task[:50]}...")

        return result is not None

    def load_latest_checkpoint(self) -> Optional[Dict[str, Any]]:
        """
        Load the most recent session checkpoint.

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

            cur.execute("""
                SELECT content, metadata, created_at
                FROM memori.memories
                WHERE user_id = %s
                  AND metadata->>'type' = 'session_checkpoint'
                ORDER BY created_at DESC
                LIMIT 1
            """, (self.memori.user_id,))

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

        if checkpoint.get('active_domain'):
            lines.append(f"**Active Domain:** {checkpoint['active_domain']}")

        if checkpoint.get('decisions_made'):
            lines.extend(["", "### Decisions Made This Session"])
            for decision in checkpoint['decisions_made']:
                lines.append(f"- {decision}")

        if checkpoint.get('files_modified'):
            lines.extend(["", "### Files Modified"])
            for f in checkpoint['files_modified']:
                lines.append(f"- {f}")

        if checkpoint.get('services_touched'):
            lines.extend(["", "### Services Touched"])
            for svc in checkpoint['services_touched']:
                lines.append(f"- {svc}")

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
        """Get the number of checkpoints saved for this chatmode namespace."""
        if not self.memori.enabled:
            return 0

        try:
            import psycopg2

            db_url = self.memori.config.database_url.split('?')[0]
            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.execute("SET search_path TO memori, public")

            cur.execute("""
                SELECT COUNT(*)
                FROM memori.memories
                WHERE user_id = %s
                  AND metadata->>'type' = 'session_checkpoint'
            """, (self.memori.user_id,))

            count = cur.fetchone()[0]
            cur.close()
            conn.close()

            return count

        except Exception as e:
            logger.warning(f"Failed to count checkpoints: {e}")
            return 0

    # -------------------------------------------------------------------------
    # Chatmode-Specific Recording Methods
    # -------------------------------------------------------------------------

    def record_decision(
        self,
        decision: str,
        rationale: Optional[str] = None,
        alternatives_considered: Optional[List[str]] = None,
        relevant_docs: Optional[List[str]] = None
    ) -> bool:
        """
        Record an architectural or design decision.

        Primarily used by architect chatmode.

        Args:
            decision: Decision made
            rationale: Why this decision was made
            alternatives_considered: Other options considered
            relevant_docs: Related documentation

        Returns:
            True if recorded
        """
        if not self.memori.enabled:
            return False

        metadata = {
            "type": "decision",
            "timestamp": datetime.now().isoformat(),
        }

        if rationale:
            metadata["rationale"] = rationale
        if alternatives_considered:
            metadata["alternatives_considered"] = alternatives_considered
        if relevant_docs:
            metadata["relevant_docs"] = relevant_docs

        return self.memori.record_memory(
            content=decision,
            category="decisions",
            metadata=metadata,
            importance=0.9
        ) is not None

    def record_spec_creation(
        self,
        spec_file: str,
        entity_name: str,
        entity_type: str,  # service, component, etc.
        pattern: Optional[str] = None,
        tables: Optional[List[str]] = None
    ) -> bool:
        """
        Record specification file creation.

        Used by architect chatmode.

        Args:
            spec_file: Path to spec file
            entity_name: Name of entity
            entity_type: Type (service, component, etc.)
            pattern: Design pattern used
            tables: Related database tables

        Returns:
            True if recorded
        """
        if not self.memori.enabled:
            return False

        content = f"Created {entity_type} spec: {entity_name}"

        metadata = {
            "type": "spec_creation",
            "spec_file": spec_file,
            "entity_name": entity_name,
            "entity_type": entity_type,
            "timestamp": datetime.now().isoformat(),
        }

        if pattern:
            metadata["pattern"] = pattern
        if tables:
            metadata["tables"] = tables

        return self.memori.record_memory(
            content=content,
            category="skills",
            metadata=metadata,
            importance=0.9
        ) is not None

    def record_implementation(
        self,
        entity_name: str,
        entity_type: str,
        files_created: List[str],
        pattern: str,
        test_coverage: Optional[float] = None,
        spec_file: Optional[str] = None
    ) -> bool:
        """
        Record service or component implementation.

        Used by service-engineer and backend-dev chatmodes.

        Args:
            entity_name: Name of implemented entity
            entity_type: Type (service, component, etc.)
            files_created: List of created files
            pattern: Implementation pattern used
            test_coverage: Test coverage percentage
            spec_file: Specification file followed

        Returns:
            True if recorded
        """
        if not self.memori.enabled:
            return False

        content = f"Implemented {entity_type}: {entity_name} using {pattern} pattern"

        metadata = {
            "type": "implementation",
            "entity_name": entity_name,
            "entity_type": entity_type,
            "files_created": files_created,
            "pattern": pattern,
            "timestamp": datetime.now().isoformat(),
        }

        if test_coverage is not None:
            metadata["test_coverage"] = test_coverage
        if spec_file:
            metadata["based_on_spec"] = spec_file

        return self.memori.record_memory(
            content=content,
            category="skills",
            metadata=metadata,
            importance=0.85
        ) is not None

    def record_documentation_update(
        self,
        files_updated: List[str],
        update_type: str,  # memory_file, srm, adr, session_handoff
        entity_name: Optional[str] = None
    ) -> bool:
        """
        Record documentation updates.

        Used by documenter chatmode.

        Args:
            files_updated: List of updated files
            update_type: Type of update
            entity_name: Related entity name

        Returns:
            True if recorded
        """
        if not self.memori.enabled:
            return False

        content = f"Updated {update_type}: {', '.join(files_updated)}"

        metadata = {
            "type": "documentation_update",
            "update_type": update_type,
            "files_updated": files_updated,
            "timestamp": datetime.now().isoformat(),
        }

        if entity_name:
            metadata["entity_name"] = entity_name

        return self.memori.record_memory(
            content=content,
            category="skills",
            metadata=metadata,
            importance=0.7
        ) is not None

    def record_user_preference(
        self,
        preference: str,
        preference_type: str,  # naming_convention, testing_pattern, etc.
        importance: float = 1.0
    ) -> bool:
        """
        Record user preference or correction.

        Used across all chatmodes when learning from user feedback.

        Args:
            preference: Preference description
            preference_type: Type of preference
            importance: Importance score (0.0-1.0)

        Returns:
            True if recorded
        """
        if not self.memori.enabled:
            return False

        metadata = {
            "type": "user_preference",
            "preference_type": preference_type,
            "learned_from": "user_correction",
            "timestamp": datetime.now().isoformat(),
        }

        return self.memori.record_memory(
            content=preference,
            category="preferences",
            metadata=metadata,
            importance=importance
        ) is not None

    def record_pattern_application(
        self,
        pattern_name: str,
        applied_to: str,
        success: bool = True,
        notes: Optional[str] = None
    ) -> bool:
        """
        Record application of a design or code pattern.

        Used by service-engineer and backend-dev chatmodes.

        Args:
            pattern_name: Name of pattern
            applied_to: What it was applied to
            success: Whether application was successful
            notes: Optional notes

        Returns:
            True if recorded
        """
        if not self.memori.enabled:
            return False

        content = f"Applied {pattern_name} pattern to {applied_to}"

        metadata = {
            "type": "pattern_application",
            "pattern_name": pattern_name,
            "applied_to": applied_to,
            "success": success,
            "timestamp": datetime.now().isoformat(),
        }

        if notes:
            metadata["notes"] = notes

        category = "skills" if success else "context"
        importance = 0.8 if success else 0.6

        return self.memori.record_memory(
            content=content,
            category=category,
            metadata=metadata,
            importance=importance
        ) is not None

    def record_anti_pattern_detection(
        self,
        anti_pattern: str,
        detected_in: str,
        corrective_action: str
    ) -> bool:
        """
        Record detection and correction of an anti-pattern.

        Used primarily by service-engineer and reviewer chatmodes.

        Args:
            anti_pattern: Anti-pattern detected
            detected_in: Where it was found
            corrective_action: How it was corrected

        Returns:
            True if recorded
        """
        if not self.memori.enabled:
            return False

        content = f"Detected anti-pattern '{anti_pattern}' in {detected_in}, corrected via {corrective_action}"

        metadata = {
            "type": "anti_pattern_detection",
            "anti_pattern": anti_pattern,
            "detected_in": detected_in,
            "corrective_action": corrective_action,
            "timestamp": datetime.now().isoformat(),
        }

        return self.memori.record_memory(
            content=content,
            category="rules",
            metadata=metadata,
            importance=0.9  # Anti-pattern corrections are important
        ) is not None

    def record_session_summary(
        self,
        summary: str,
        tasks_completed: List[str],
        files_modified: List[str],
        next_steps: Optional[List[str]] = None
    ) -> bool:
        """
        Record session summary for handoff.

        Used at session end by all chatmodes.

        Args:
            summary: Session summary
            tasks_completed: List of completed tasks
            files_modified: List of modified files
            next_steps: Optional next steps

        Returns:
            True if recorded
        """
        if not self.memori.enabled:
            return False

        metadata = {
            "type": "session_summary",
            "tasks_completed": tasks_completed,
            "files_modified": files_modified,
            "timestamp": datetime.now().isoformat(),
        }

        if next_steps:
            metadata["next_steps"] = next_steps

        return self.memori.record_memory(
            content=summary,
            category="context",
            metadata=metadata,
            importance=0.85
        ) is not None

    def get_recent_context(self, limit: int = 5) -> List[Dict]:
        """
        Get recent context for this chatmode.

        Args:
            limit: Max number of memories to retrieve

        Returns:
            List of recent memory dicts
        """
        if not self.memori.enabled:
            return []

        return self.memori.search_memories(
            query=f"recent context {self.chatmode}",
            category=["context", "skills"],
            limit=limit
        )

    def get_related_entity_memories(self, entity_name: str) -> List[Dict]:
        """
        Get all memories related to a specific entity.

        Args:
            entity_name: Entity name (service, component, etc.)

        Returns:
            List of related memory dicts
        """
        if not self.memori.enabled:
            return []

        return self.memori.search_memories(
            query=entity_name,
            limit=20
        )
