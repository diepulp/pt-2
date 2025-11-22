#!/usr/bin/env python3
"""
Workflow state tracking for PT-2 agentic workflows.

Manages workflow phase transitions, validation gates, and cross-session recovery.
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
from dataclasses import dataclass, asdict
from enum import Enum
from loguru import logger

from .client import MemoriClient


class ValidationGateStatus(str, Enum):
    """Validation gate status options."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    PASSED = "passed"
    FAILED = "failed"
    APPROVED = "approved"
    REJECTED = "rejected"


@dataclass
class WorkflowPhase:
    """Workflow phase information."""
    number: int
    name: str
    chatmode: str
    status: str  # pending, in_progress, completed
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    files_created: List[str] = None
    files_modified: List[str] = None

    def __post_init__(self):
        if self.files_created is None:
            self.files_created = []
        if self.files_modified is None:
            self.files_modified = []


@dataclass
class ValidationGate:
    """Validation gate checkpoint."""
    number: int
    type: str  # spec_review, implementation_review, test_results
    status: ValidationGateStatus
    timestamp: Optional[str] = None
    outcome: Optional[str] = None
    feedback: Optional[str] = None
    files_reviewed: List[str] = None

    def __post_init__(self):
        if self.files_reviewed is None:
            self.files_reviewed = []


@dataclass
class WorkflowState:
    """Complete workflow state."""
    workflow: str  # create-service, create-adr, write-migration
    entity_name: str  # service name, ADR title, migration name
    current_phase: int
    phases_completed: List[int]
    validation_gates: Dict[int, ValidationGate]
    session_id: str
    started_at: str
    updated_at: str
    next_action: Optional[str] = None
    spec_file: Optional[str] = None
    metadata: Dict[str, Any] = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


class WorkflowStateManager:
    """
    Manages workflow state persistence in Memori.

    Enables cross-session workflow recovery and phase tracking.
    """

    def __init__(self, memori_client: MemoriClient):
        """
        Initialize workflow state manager.

        Args:
            memori_client: Memori client instance
        """
        self.memori = memori_client

    def save_phase_transition(
        self,
        workflow: str,
        entity_name: str,
        phase: int,
        chatmode: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Record a workflow phase transition.

        Args:
            workflow: Workflow name (create-service, create-adr, etc.)
            entity_name: Entity being worked on (service name, ADR title, etc.)
            phase: Phase number
            chatmode: Chatmode executing this phase
            metadata: Additional phase metadata

        Returns:
            True if recorded successfully
        """
        if not self.memori.enabled:
            logger.warning("Memori not enabled, cannot save phase transition")
            return False

        try:
            content = f"{workflow} workflow for {entity_name}: Phase {phase} ({chatmode})"

            phase_metadata = {
                "workflow": workflow,
                "entity_name": entity_name,
                "phase": phase,
                "chatmode": chatmode,
                "timestamp": datetime.now().isoformat(),
            }

            if metadata:
                phase_metadata.update(metadata)

            self.memori.record_memory(
                content=content,
                category="context",
                metadata=phase_metadata,
                importance=0.8
            )

            logger.info(f"Recorded phase transition: {workflow} → Phase {phase}")
            return True

        except Exception as e:
            logger.error(f"Error saving phase transition: {e}")
            return False

    def record_validation_gate(
        self,
        workflow: str,
        entity_name: str,
        gate_number: int,
        gate_type: str,
        outcome: ValidationGateStatus,
        feedback: Optional[str] = None,
        files_reviewed: Optional[List[str]] = None
    ) -> bool:
        """
        Record a validation gate outcome.

        Args:
            workflow: Workflow name
            entity_name: Entity name
            gate_number: Gate number (1, 2, 3)
            gate_type: Gate type (spec_review, implementation_review, etc.)
            outcome: Gate outcome status
            feedback: Optional user feedback
            files_reviewed: Optional list of reviewed files

        Returns:
            True if recorded successfully
        """
        if not self.memori.enabled:
            return False

        try:
            content = (
                f"VALIDATION GATE {gate_number} {outcome.value.upper()}: "
                f"{gate_type} for {workflow} - {entity_name}"
            )

            gate_metadata = {
                "workflow": workflow,
                "entity_name": entity_name,
                "gate": gate_number,
                "gate_type": gate_type,
                "outcome": outcome.value,
                "timestamp": datetime.now().isoformat(),
            }

            if feedback:
                gate_metadata["feedback"] = feedback
            if files_reviewed:
                gate_metadata["files_reviewed"] = files_reviewed

            self.memori.record_memory(
                content=content,
                category="context",
                metadata=gate_metadata,
                importance=0.9  # Validation gates are important
            )

            logger.success(f"✅ Recorded validation gate: GATE {gate_number} → {outcome.value}")
            return True

        except Exception as e:
            logger.error(f"Error recording validation gate: {e}")
            return False

    def save_workflow_state(self, state: WorkflowState) -> bool:
        """
        Save complete workflow state.

        Args:
            state: WorkflowState instance

        Returns:
            True if saved successfully
        """
        if not self.memori.enabled:
            return False

        try:
            content = (
                f"{state.workflow} workflow for {state.entity_name}: "
                f"Phase {state.current_phase}"
            )

            workflow_metadata = asdict(state)
            workflow_metadata["importance"] = 0.95  # Workflow state is critical

            self.memori.record_memory(
                content=content,
                category="context",
                metadata=workflow_metadata,
                importance=0.95
            )

            logger.info(f"Saved workflow state: {state.workflow} - {state.entity_name}")
            return True

        except Exception as e:
            logger.error(f"Error saving workflow state: {e}")
            return False

    def load_workflow_state(
        self,
        workflow: str,
        entity_name: str
    ) -> Optional[WorkflowState]:
        """
        Load workflow state for cross-session recovery.

        Args:
            workflow: Workflow name
            entity_name: Entity name

        Returns:
            WorkflowState if found, None otherwise
        """
        if not self.memori.enabled:
            return None

        try:
            # Search for workflow state in memories
            query = f"{workflow} workflow {entity_name}"
            memories = self.memori.search_memories(
                query=query,
                category=["context"],
                limit=1
            )

            if not memories:
                logger.info(f"No workflow state found for {workflow} - {entity_name}")
                return None

            # Parse workflow state from memory metadata
            memory = memories[0]
            metadata = memory.get("metadata", {})

            # Reconstruct WorkflowState (simplified - actual implementation would be more robust)
            state = WorkflowState(
                workflow=metadata.get("workflow", workflow),
                entity_name=metadata.get("entity_name", entity_name),
                current_phase=metadata.get("current_phase", 1),
                phases_completed=metadata.get("phases_completed", []),
                validation_gates={},  # Would reconstruct from metadata
                session_id=metadata.get("session_id", ""),
                started_at=metadata.get("started_at", ""),
                updated_at=metadata.get("updated_at", ""),
                next_action=metadata.get("next_action"),
                spec_file=metadata.get("spec_file"),
                metadata=metadata
            )

            logger.success(f"✅ Loaded workflow state: {workflow} - {entity_name} (Phase {state.current_phase})")
            return state

        except Exception as e:
            logger.error(f"Error loading workflow state: {e}")
            return None

    def get_validation_gate_history(
        self,
        workflow: str,
        entity_name: str
    ) -> List[Dict]:
        """
        Get validation gate history for a workflow.

        Args:
            workflow: Workflow name
            entity_name: Entity name

        Returns:
            List of validation gate records
        """
        if not self.memori.enabled:
            return []

        try:
            query = f"VALIDATION GATE {workflow} {entity_name}"
            memories = self.memori.search_memories(
                query=query,
                category=["context"],
                limit=10
            )

            gates = []
            for memory in memories:
                if "VALIDATION GATE" in memory.get("content", ""):
                    gates.append(memory)

            logger.info(f"Found {len(gates)} validation gate records")
            return gates

        except Exception as e:
            logger.error(f"Error getting validation gate history: {e}")
            return []

    def mark_workflow_complete(
        self,
        workflow: str,
        entity_name: str,
        duration_minutes: Optional[int] = None,
        files_created: Optional[List[str]] = None
    ) -> bool:
        """
        Mark a workflow as completed.

        Args:
            workflow: Workflow name
            entity_name: Entity name
            duration_minutes: Optional workflow duration
            files_created: Optional list of files created

        Returns:
            True if recorded successfully
        """
        if not self.memori.enabled:
            return False

        try:
            content = f"Completed {workflow} workflow for {entity_name}"

            completion_metadata = {
                "workflow": workflow,
                "entity_name": entity_name,
                "status": "completed",
                "completed_at": datetime.now().isoformat(),
            }

            if duration_minutes:
                completion_metadata["duration_minutes"] = duration_minutes
            if files_created:
                completion_metadata["files_created"] = files_created

            self.memori.record_memory(
                content=content,
                category="skills",
                metadata=completion_metadata,
                importance=1.0  # Completed workflows are very important
            )

            logger.success(f"✅ Marked workflow complete: {workflow} - {entity_name}")
            return True

        except Exception as e:
            logger.error(f"Error marking workflow complete: {e}")
            return False
