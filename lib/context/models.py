"""
Data models for Context Management Layer.

Defines dataclasses for Session, SessionEvent, and SessionState.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Any


class EventType(str, Enum):
    """Event types for session events."""
    USER_MESSAGE = "user_message"
    MODEL_MESSAGE = "model_message"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    VALIDATION_GATE = "validation_gate"
    MEMORY_RECALL = "memory_recall"
    SYSTEM_EVENT = "system_event"


class Role(str, Enum):
    """Message roles for session events."""
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"
    SYSTEM = "system"


@dataclass
class Session:
    """
    Represents a conversation session.

    A session tracks the lifecycle of a conversation within a specific
    chatmode and optional workflow/skill context.
    """
    id: str
    user_id: str
    chatmode: str
    started_at: datetime
    workflow: Optional[str] = None
    skill: Optional[str] = None
    git_branch: Optional[str] = None
    ended_at: Optional[datetime] = None
    metadata: dict = field(default_factory=dict)

    @property
    def is_active(self) -> bool:
        """Check if session is still active (not ended)."""
        return self.ended_at is None

    @property
    def duration_seconds(self) -> Optional[float]:
        """Get session duration in seconds."""
        if self.ended_at:
            return (self.ended_at - self.started_at).total_seconds()
        return (datetime.now(self.started_at.tzinfo) - self.started_at).total_seconds()


@dataclass
class SessionEvent:
    """
    Represents an event in the session event log.

    Events are immutable once created. The sequence number provides
    strict ordering within a session.
    """
    id: str
    session_id: str
    sequence: int
    type: str  # EventType value
    role: str  # Role value
    content: str
    created_at: datetime
    parts: Optional[dict] = None

    @classmethod
    def create(
        cls,
        session_id: str,
        sequence: int,
        event_type: EventType,
        role: Role,
        content: str,
        parts: Optional[dict] = None,
    ) -> "SessionEvent":
        """Factory method to create a new event (ID assigned by DB)."""
        return cls(
            id="",  # Will be assigned by database
            session_id=session_id,
            sequence=sequence,
            type=event_type.value,
            role=role.value,
            content=content,
            created_at=datetime.now(),
            parts=parts,
        )


@dataclass
class SessionState:
    """
    Mutable scratchpad for working memory during session.

    Unlike events, state can be updated throughout the session.
    """
    session_id: str
    scratchpad: dict
    updated_at: datetime

    def get(self, key: str, default: Any = None) -> Any:
        """Get a value from the scratchpad."""
        return self.scratchpad.get(key, default)

    @property
    def current_task(self) -> Optional[str]:
        """Get current task from scratchpad."""
        return self.scratchpad.get("current_task")

    @property
    def spec_file(self) -> Optional[str]:
        """Get spec file path from scratchpad."""
        return self.scratchpad.get("spec_file")

    @property
    def files_in_progress(self) -> list[str]:
        """Get list of files being worked on."""
        return self.scratchpad.get("files_in_progress", [])

    @property
    def validation_gates_passed(self) -> list[int]:
        """Get list of passed validation gate numbers."""
        return self.scratchpad.get("validation_gates_passed", [])

    @property
    def blockers(self) -> list[str]:
        """Get list of known blockers."""
        return self.scratchpad.get("blockers", [])

    @property
    def handoff_context(self) -> Optional[dict]:
        """Get handoff context for multi-agent transitions."""
        return self.scratchpad.get("handoff_context")


@dataclass
class Scratchpad:
    """
    Typed scratchpad structure for session state.

    This provides a typed interface for the scratchpad JSON structure.
    """
    current_task: Optional[str] = None
    spec_file: Optional[str] = None
    files_in_progress: list[str] = field(default_factory=list)
    validation_gates_passed: list[int] = field(default_factory=list)
    blockers: list[str] = field(default_factory=list)
    handoff_context: Optional[dict] = None

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON storage."""
        result = {}
        if self.current_task:
            result["current_task"] = self.current_task
        if self.spec_file:
            result["spec_file"] = self.spec_file
        if self.files_in_progress:
            result["files_in_progress"] = self.files_in_progress
        if self.validation_gates_passed:
            result["validation_gates_passed"] = self.validation_gates_passed
        if self.blockers:
            result["blockers"] = self.blockers
        if self.handoff_context:
            result["handoff_context"] = self.handoff_context
        return result

    @classmethod
    def from_dict(cls, data: dict) -> "Scratchpad":
        """Create from dictionary."""
        return cls(
            current_task=data.get("current_task"),
            spec_file=data.get("spec_file"),
            files_in_progress=data.get("files_in_progress", []),
            validation_gates_passed=data.get("validation_gates_passed", []),
            blockers=data.get("blockers", []),
            handoff_context=data.get("handoff_context"),
        )
