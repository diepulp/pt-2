"""
Agent Handoff Protocol for Multi-Agent Coordination.

Enables structured handoffs between chatmodes in workflows:
- Preserves context across chatmode transitions
- Tracks validation gates and artifacts
- Generates session summaries for handoff

Reference: docs/context-engineering/CONTEXT_MANAGEMENT_EVOLUTION_PROPOSAL.md
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from loguru import logger

try:
    import asyncpg
    ASYNCPG_AVAILABLE = True
except ImportError:
    ASYNCPG_AVAILABLE = False


@dataclass
class HandoffContext:
    """
    Context passed between agents during workflow transitions.

    Contains all information needed for the target agent to continue work.
    """
    # Source information
    spec_file: Optional[str] = None
    workflow: Optional[str] = None
    skill: Optional[str] = None

    # Progress tracking
    validation_gates_passed: list[int] = field(default_factory=list)
    artifacts_created: list[str] = field(default_factory=list)
    files_modified: list[str] = field(default_factory=list)

    # Decisions and blockers
    key_decisions: list[str] = field(default_factory=list)
    blockers: list[str] = field(default_factory=list)
    open_questions: list[str] = field(default_factory=list)

    # Additional context
    notes: str = ""
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON storage."""
        return {
            "spec_file": self.spec_file,
            "workflow": self.workflow,
            "skill": self.skill,
            "validation_gates_passed": self.validation_gates_passed,
            "artifacts_created": self.artifacts_created,
            "files_modified": self.files_modified,
            "key_decisions": self.key_decisions,
            "blockers": self.blockers,
            "open_questions": self.open_questions,
            "notes": self.notes,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "HandoffContext":
        """Create from dictionary."""
        return cls(
            spec_file=data.get("spec_file"),
            workflow=data.get("workflow"),
            skill=data.get("skill"),
            validation_gates_passed=data.get("validation_gates_passed", []),
            artifacts_created=data.get("artifacts_created", []),
            files_modified=data.get("files_modified", []),
            key_decisions=data.get("key_decisions", []),
            blockers=data.get("blockers", []),
            open_questions=data.get("open_questions", []),
            notes=data.get("notes", ""),
            metadata=data.get("metadata", {}),
        )


@dataclass
class AgentHandoff:
    """
    Represents a handoff between two agents (chatmodes).

    Captures the source agent, target agent, and all context needed
    for the target to continue the work.
    """
    # Agents involved
    from_chatmode: str
    to_chatmode: str

    # Workflow context
    workflow: str
    session_id: str

    # Handoff payload
    handoff_context: HandoffContext
    session_summary: Optional[str] = None

    # Timing
    created_at: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> dict:
        """Convert to dictionary for storage."""
        return {
            "from_chatmode": self.from_chatmode,
            "to_chatmode": self.to_chatmode,
            "workflow": self.workflow,
            "session_id": self.session_id,
            "handoff_context": self.handoff_context.to_dict(),
            "session_summary": self.session_summary,
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "AgentHandoff":
        """Create from dictionary."""
        return cls(
            from_chatmode=data["from_chatmode"],
            to_chatmode=data["to_chatmode"],
            workflow=data["workflow"],
            session_id=data["session_id"],
            handoff_context=HandoffContext.from_dict(data.get("handoff_context", {})),
            session_summary=data.get("session_summary"),
            created_at=datetime.fromisoformat(data["created_at"])
            if "created_at" in data
            else datetime.now(),
        )

    def format_for_prompt(self) -> str:
        """Format handoff as text for injection into target agent's prompt."""
        lines = [
            f"## Handoff from {self.from_chatmode}",
            f"**Workflow**: {self.workflow}",
            "",
        ]

        if self.handoff_context.spec_file:
            lines.append(f"**Spec File**: {self.handoff_context.spec_file}")

        if self.handoff_context.validation_gates_passed:
            gates = ", ".join(str(g) for g in self.handoff_context.validation_gates_passed)
            lines.append(f"**Validation Gates Passed**: {gates}")

        if self.handoff_context.artifacts_created:
            lines.append("**Artifacts Created**:")
            for artifact in self.handoff_context.artifacts_created:
                lines.append(f"  - {artifact}")

        if self.handoff_context.files_modified:
            lines.append("**Files Modified**:")
            for file in self.handoff_context.files_modified:
                lines.append(f"  - {file}")

        if self.handoff_context.key_decisions:
            lines.append("**Key Decisions**:")
            for decision in self.handoff_context.key_decisions:
                lines.append(f"  - {decision}")

        if self.handoff_context.blockers:
            lines.append("**Blockers**:")
            for blocker in self.handoff_context.blockers:
                lines.append(f"  - {blocker}")

        if self.handoff_context.open_questions:
            lines.append("**Open Questions**:")
            for question in self.handoff_context.open_questions:
                lines.append(f"  - {question}")

        if self.session_summary:
            lines.extend(["", "### Session Summary", self.session_summary])

        if self.handoff_context.notes:
            lines.extend(["", "### Notes", self.handoff_context.notes])

        return "\n".join(lines)


class HandoffService:
    """
    Service for managing agent handoffs.

    Handles storing, retrieving, and consuming handoffs in the session state.
    """

    def __init__(self, db_url: str):
        """Initialize with database URL."""
        self.db_url = db_url
        self._pool: Optional[asyncpg.Pool] = None

    async def _get_pool(self) -> asyncpg.Pool:
        """Get or create connection pool."""
        if not ASYNCPG_AVAILABLE:
            raise RuntimeError("asyncpg not available")

        if self._pool is None:
            self._pool = await asyncpg.create_pool(self.db_url, min_size=1, max_size=5)
        return self._pool

    async def close(self):
        """Close connection pool."""
        if self._pool:
            await self._pool.close()
            self._pool = None

    async def create_handoff(
        self,
        session_id: str,
        from_chatmode: str,
        to_chatmode: str,
        workflow: str,
        handoff_context: HandoffContext,
        session_summary: Optional[str] = None,
    ) -> AgentHandoff:
        """
        Create and store a handoff for the target agent.

        The handoff is stored in the session state for the target to consume.
        """
        handoff = AgentHandoff(
            from_chatmode=from_chatmode,
            to_chatmode=to_chatmode,
            workflow=workflow,
            session_id=session_id,
            handoff_context=handoff_context,
            session_summary=session_summary,
        )

        # Store in session state
        await self._store_handoff(session_id, handoff)

        logger.info(
            f"Created handoff: {from_chatmode} -> {to_chatmode} "
            f"(workflow: {workflow}, session: {session_id[:8]}...)"
        )

        return handoff

    async def _store_handoff(self, session_id: str, handoff: AgentHandoff):
        """Store handoff in session state."""
        pool = await self._get_pool()

        import json

        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE context.session_state
                SET
                    scratchpad = jsonb_set(
                        COALESCE(scratchpad, '{}'::jsonb),
                        '{pending_handoff}',
                        $2::jsonb
                    ),
                    updated_at = now()
                WHERE session_id = $1
                """,
                session_id,
                json.dumps(handoff.to_dict()),
            )

    async def get_pending_handoff(self, session_id: str) -> Optional[AgentHandoff]:
        """Get pending handoff for a session (if any)."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT scratchpad->'pending_handoff' as handoff
                FROM context.session_state
                WHERE session_id = $1
                  AND scratchpad ? 'pending_handoff'
                """,
                session_id,
            )

        if not row or not row["handoff"]:
            return None

        import json

        handoff_data = json.loads(row["handoff"])
        return AgentHandoff.from_dict(handoff_data)

    async def consume_handoff(self, session_id: str) -> Optional[AgentHandoff]:
        """
        Consume (retrieve and clear) a pending handoff.

        Returns the handoff and removes it from session state.
        """
        handoff = await self.get_pending_handoff(session_id)
        if not handoff:
            return None

        # Clear the pending handoff
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE context.session_state
                SET
                    scratchpad = scratchpad - 'pending_handoff',
                    updated_at = now()
                WHERE session_id = $1
                """,
                session_id,
            )

        logger.info(f"Consumed handoff for session {session_id[:8]}...")
        return handoff

    async def build_handoff_context_from_session(
        self, session_id: str
    ) -> HandoffContext:
        """
        Build a HandoffContext from the current session state.

        Extracts relevant information from session state and events.
        """
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            # Get session info
            session = await conn.fetchrow(
                """
                SELECT workflow, skill, metadata
                FROM context.sessions
                WHERE id = $1
                """,
                session_id,
            )

            # Get session state
            state = await conn.fetchrow(
                """
                SELECT scratchpad
                FROM context.session_state
                WHERE session_id = $1
                """,
                session_id,
            )

        scratchpad = state["scratchpad"] if state else {}

        return HandoffContext(
            spec_file=scratchpad.get("spec_file"),
            workflow=session["workflow"] if session else None,
            skill=session["skill"] if session else None,
            validation_gates_passed=scratchpad.get("validation_gates_passed", []),
            artifacts_created=scratchpad.get("artifacts_created", []),
            files_modified=scratchpad.get("files_modified", []),
            key_decisions=scratchpad.get("key_decisions", []),
            blockers=scratchpad.get("blockers", []),
            open_questions=scratchpad.get("open_questions", []),
            notes=scratchpad.get("notes", ""),
            metadata=scratchpad.get("handoff_metadata", {}),
        )


# Workflow transition definitions
WORKFLOW_TRANSITIONS = {
    "implement-context-mgmt": [
        {"from": "architect", "to": "service-engineer", "after_gate": 1},
        {"from": "service-engineer", "to": "service-engineer", "after_gate": 4},
        {"from": "service-engineer", "to": "documenter", "after_gate": 5},
    ],
    "feature-development": [
        {"from": "architect", "to": "service-engineer", "after_gate": 1},
        {"from": "service-engineer", "to": "reviewer", "after_gate": 3},
        {"from": "reviewer", "to": "documenter", "after_gate": 4},
    ],
}


def get_next_chatmode(workflow: str, current_chatmode: str, gate_passed: int) -> Optional[str]:
    """
    Determine the next chatmode after a validation gate passes.

    Returns None if no transition is defined.
    """
    transitions = WORKFLOW_TRANSITIONS.get(workflow, [])

    for transition in transitions:
        if (
            transition["from"] == current_chatmode
            and transition["after_gate"] == gate_passed
        ):
            return transition["to"]

    return None
