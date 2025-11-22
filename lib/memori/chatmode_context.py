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
    """

    def __init__(self, memori_client: MemoriClient):
        """
        Initialize chatmode context manager.

        Args:
            memori_client: Memori client instance
        """
        self.memori = memori_client
        self.chatmode = memori_client.chatmode

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
