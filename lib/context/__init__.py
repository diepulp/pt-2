"""
Context Management Layer for PT-2.

Provides session tracking, event logging, state management,
and context assembly for agentic workflows.

Reference: docs/context-engineering/CONTEXT_MANAGEMENT_EVOLUTION_PROPOSAL.md
"""

from lib.context.models import (
    Session,
    SessionEvent,
    SessionState,
    EventType,
    Role,
    Scratchpad,
)
from lib.context.session import SessionService, create_session_service
from lib.context.builder import (
    ContextBuilder,
    TurnInput,
    BuiltContext,
    MEMORY_SEARCH_TOOL,
)
from lib.context.compaction import (
    SessionCompactor,
    CompactionConfig,
    CompactionResult,
    CompactionStrategy,
    SlidingWindowStrategy,
    TokenTruncationStrategy,
    RecursiveSummarizationStrategy,
    SimpleSummarizer,
)
from lib.context.hooks import (
    on_session_start,
    on_session_end,
    on_validation_gate_passed,
    log_tool_call,
    log_user_message,
    log_assistant_message,
    get_current_session_id,
)
from lib.context.handoff import (
    AgentHandoff,
    HandoffContext,
    HandoffService,
    get_next_chatmode,
    WORKFLOW_TRANSITIONS,
)

__all__ = [
    # Models
    "Session",
    "SessionEvent",
    "SessionState",
    "EventType",
    "Role",
    "Scratchpad",
    # Services
    "SessionService",
    "create_session_service",
    # Context building
    "ContextBuilder",
    "TurnInput",
    "BuiltContext",
    "MEMORY_SEARCH_TOOL",
    # Compaction
    "SessionCompactor",
    "CompactionConfig",
    "CompactionResult",
    "CompactionStrategy",
    "SlidingWindowStrategy",
    "TokenTruncationStrategy",
    "RecursiveSummarizationStrategy",
    "SimpleSummarizer",
    # Hooks
    "on_session_start",
    "on_session_end",
    "on_validation_gate_passed",
    "log_tool_call",
    "log_user_message",
    "log_assistant_message",
    "get_current_session_id",
    # Handoff
    "AgentHandoff",
    "HandoffContext",
    "HandoffService",
    "get_next_chatmode",
    "WORKFLOW_TRANSITIONS",
]
