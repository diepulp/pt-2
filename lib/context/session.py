"""
Session Service for Context Management Layer.

Provides async methods for session lifecycle, event logging,
and state management.

Usage:
    pool = await asyncpg.create_pool(dsn="postgresql://...")
    service = SessionService(pool)

    session = await service.create_session(
        chatmode="service-engineer",
        user_id="service_engineer",
        workflow="create-service"
    )

    await service.append_event(
        session_id=session.id,
        event_type=EventType.USER_MESSAGE,
        role=Role.USER,
        content="Create a new LoyaltyService"
    )
"""

import asyncio
import json
from datetime import datetime
from typing import Optional
from loguru import logger

try:
    import asyncpg
    ASYNCPG_AVAILABLE = True
except ImportError:
    logger.warning("asyncpg not installed. Run: pip install asyncpg")
    ASYNCPG_AVAILABLE = False

from lib.context.models import (
    Session,
    SessionEvent,
    SessionState,
    EventType,
    Role,
)


class SessionNotFoundError(Exception):
    """Raised when a session is not found."""
    pass


class SessionEndedError(Exception):
    """Raised when trying to modify an ended session."""
    pass


class SequenceConflictError(Exception):
    """Raised when there's a sequence number conflict (concurrent append)."""
    pass


class SessionService:
    """
    Manages conversation sessions and event logging.

    All methods are async and use connection pooling for performance.
    """

    def __init__(self, db_pool: "asyncpg.Pool"):
        """
        Initialize SessionService with database pool.

        Args:
            db_pool: asyncpg connection pool
        """
        self.db = db_pool

    async def create_session(
        self,
        chatmode: str,
        user_id: str,
        workflow: Optional[str] = None,
        skill: Optional[str] = None,
        git_branch: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> Session:
        """
        Create a new session and initialize state.

        Args:
            chatmode: Active chatmode (architect, service-engineer, etc.)
            user_id: Namespace for the agent/chatmode
            workflow: Optional workflow name
            skill: Optional skill name
            git_branch: Optional git branch
            metadata: Optional additional metadata

        Returns:
            Created Session instance
        """
        metadata = metadata or {}

        async with self.db.acquire() as conn:
            async with conn.transaction():
                # Create session
                row = await conn.fetchrow(
                    """
                    INSERT INTO context.sessions
                        (user_id, chatmode, workflow, skill, git_branch, metadata)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING id, user_id, chatmode, workflow, skill, git_branch,
                              started_at, ended_at, metadata
                    """,
                    user_id,
                    chatmode,
                    workflow,
                    skill,
                    git_branch,
                    json.dumps(metadata),
                )

                session = self._row_to_session(row)

                # Initialize empty state
                await conn.execute(
                    """
                    INSERT INTO context.session_state (session_id, scratchpad)
                    VALUES ($1, $2)
                    """,
                    session.id,
                    json.dumps({}),
                )

                logger.info(
                    f"Created session {session.id} "
                    f"(chatmode={chatmode}, workflow={workflow})"
                )

                return session

    async def end_session(self, session_id: str) -> None:
        """
        Mark session as ended.

        Args:
            session_id: Session ID to end

        Raises:
            SessionNotFoundError: If session doesn't exist
        """
        result = await self.db.execute(
            """
            UPDATE context.sessions
            SET ended_at = now()
            WHERE id = $1 AND ended_at IS NULL
            """,
            session_id,
        )

        if result == "UPDATE 0":
            raise SessionNotFoundError(f"Session {session_id} not found or already ended")

        logger.info(f"Ended session {session_id}")

    async def get_session(self, session_id: str) -> Session:
        """
        Get session by ID.

        Args:
            session_id: Session ID

        Returns:
            Session instance

        Raises:
            SessionNotFoundError: If session doesn't exist
        """
        row = await self.db.fetchrow(
            """
            SELECT id, user_id, chatmode, workflow, skill, git_branch,
                   started_at, ended_at, metadata
            FROM context.sessions
            WHERE id = $1
            """,
            session_id,
        )

        if not row:
            raise SessionNotFoundError(f"Session {session_id} not found")

        return self._row_to_session(row)

    async def get_active_session(
        self,
        chatmode: str,
        user_id: str,
    ) -> Optional[Session]:
        """
        Find active (non-ended) session for chatmode.

        Args:
            chatmode: Chatmode name
            user_id: User/namespace ID

        Returns:
            Active Session or None if no active session
        """
        row = await self.db.fetchrow(
            """
            SELECT id, user_id, chatmode, workflow, skill, git_branch,
                   started_at, ended_at, metadata
            FROM context.sessions
            WHERE chatmode = $1 AND user_id = $2 AND ended_at IS NULL
            ORDER BY started_at DESC
            LIMIT 1
            """,
            chatmode,
            user_id,
        )

        if not row:
            return None

        return self._row_to_session(row)

    async def append_event(
        self,
        session_id: str,
        event_type: EventType,
        role: Role,
        content: str,
        parts: Optional[dict] = None,
    ) -> SessionEvent:
        """
        Append an event to the session log.

        Auto-increments sequence number within the session.

        Args:
            session_id: Session ID
            event_type: Type of event
            role: Message role
            content: Event content (text or JSON string)
            parts: Optional structured data

        Returns:
            Created SessionEvent

        Raises:
            SessionNotFoundError: If session doesn't exist
            SessionEndedError: If session is already ended
        """
        async with self.db.acquire() as conn:
            async with conn.transaction():
                # Check session exists and is active
                session_row = await conn.fetchrow(
                    """
                    SELECT id, ended_at FROM context.sessions WHERE id = $1
                    """,
                    session_id,
                )

                if not session_row:
                    raise SessionNotFoundError(f"Session {session_id} not found")

                if session_row["ended_at"] is not None:
                    raise SessionEndedError(f"Session {session_id} is already ended")

                # Get next sequence number
                max_seq = await conn.fetchval(
                    """
                    SELECT COALESCE(MAX(sequence), 0)
                    FROM context.session_events
                    WHERE session_id = $1
                    """,
                    session_id,
                )

                next_seq = max_seq + 1

                # Insert event
                row = await conn.fetchrow(
                    """
                    INSERT INTO context.session_events
                        (session_id, sequence, type, role, content, parts)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING id, session_id, sequence, type, role, content,
                              parts, created_at
                    """,
                    session_id,
                    next_seq,
                    event_type.value,
                    role.value,
                    content,
                    json.dumps(parts) if parts else None,
                )

                event = self._row_to_event(row)

                logger.debug(
                    f"Appended event {event.id} to session {session_id} "
                    f"(seq={next_seq}, type={event_type.value})"
                )

                return event

    async def get_recent_events(
        self,
        session_id: str,
        max_turns: int = 30,
        event_types: Optional[list[EventType]] = None,
    ) -> list[SessionEvent]:
        """
        Get recent events with sliding window.

        Args:
            session_id: Session ID
            max_turns: Maximum number of events to return
            event_types: Optional filter by event types

        Returns:
            List of SessionEvent instances, ordered by sequence
        """
        if event_types:
            type_values = [t.value for t in event_types]
            rows = await self.db.fetch(
                """
                SELECT id, session_id, sequence, type, role, content,
                       parts, created_at
                FROM context.session_events
                WHERE session_id = $1 AND type = ANY($2)
                ORDER BY sequence DESC
                LIMIT $3
                """,
                session_id,
                type_values,
                max_turns,
            )
        else:
            rows = await self.db.fetch(
                """
                SELECT id, session_id, sequence, type, role, content,
                       parts, created_at
                FROM context.session_events
                WHERE session_id = $1
                ORDER BY sequence DESC
                LIMIT $2
                """,
                session_id,
                max_turns,
            )

        # Return in chronological order
        events = [self._row_to_event(row) for row in reversed(rows)]
        return events

    async def get_event_count(self, session_id: str) -> int:
        """Get total event count for session."""
        count = await self.db.fetchval(
            """
            SELECT COUNT(*) FROM context.session_events WHERE session_id = $1
            """,
            session_id,
        )
        return count or 0

    async def get_state(self, session_id: str) -> SessionState:
        """
        Get current session state/scratchpad.

        Args:
            session_id: Session ID

        Returns:
            SessionState instance

        Raises:
            SessionNotFoundError: If session doesn't exist
        """
        row = await self.db.fetchrow(
            """
            SELECT session_id, scratchpad, updated_at
            FROM context.session_state
            WHERE session_id = $1
            """,
            session_id,
        )

        if not row:
            raise SessionNotFoundError(f"Session state for {session_id} not found")

        return self._row_to_state(row)

    async def update_state(
        self,
        session_id: str,
        scratchpad: dict,
        merge: bool = True,
    ) -> SessionState:
        """
        Update session scratchpad.

        Args:
            session_id: Session ID
            scratchpad: New scratchpad data
            merge: If True, merge with existing; if False, replace

        Returns:
            Updated SessionState

        Raises:
            SessionNotFoundError: If session doesn't exist
        """
        if merge:
            # Merge with existing scratchpad
            row = await self.db.fetchrow(
                """
                UPDATE context.session_state
                SET
                    scratchpad = scratchpad || $2::jsonb,
                    updated_at = now()
                WHERE session_id = $1
                RETURNING session_id, scratchpad, updated_at
                """,
                session_id,
                json.dumps(scratchpad),
            )
        else:
            # Replace scratchpad entirely
            row = await self.db.fetchrow(
                """
                UPDATE context.session_state
                SET
                    scratchpad = $2::jsonb,
                    updated_at = now()
                WHERE session_id = $1
                RETURNING session_id, scratchpad, updated_at
                """,
                session_id,
                json.dumps(scratchpad),
            )

        if not row:
            raise SessionNotFoundError(f"Session state for {session_id} not found")

        logger.debug(f"Updated state for session {session_id}")

        return self._row_to_state(row)

    async def add_validation_gate(
        self,
        session_id: str,
        gate_number: int,
        description: str,
        passed: bool = True,
    ) -> SessionEvent:
        """
        Record a validation gate event and update state.

        Args:
            session_id: Session ID
            gate_number: Gate number
            description: Gate description
            passed: Whether the gate passed

        Returns:
            Created validation gate event
        """
        # Record event
        event = await self.append_event(
            session_id=session_id,
            event_type=EventType.VALIDATION_GATE,
            role=Role.SYSTEM,
            content=f"Validation Gate {gate_number}: {description}",
            parts={
                "gate_number": gate_number,
                "description": description,
                "passed": passed,
            },
        )

        # Update state if passed
        if passed:
            state = await self.get_state(session_id)
            gates_passed = state.validation_gates_passed
            if gate_number not in gates_passed:
                gates_passed.append(gate_number)
                await self.update_state(
                    session_id,
                    {"validation_gates_passed": gates_passed},
                )

        return event

    # -------------------------------------------------------------------------
    # Private helper methods
    # -------------------------------------------------------------------------

    def _row_to_session(self, row) -> Session:
        """Convert database row to Session instance."""
        metadata = row["metadata"]
        if isinstance(metadata, str):
            metadata = json.loads(metadata)

        return Session(
            id=str(row["id"]),
            user_id=row["user_id"],
            chatmode=row["chatmode"],
            workflow=row["workflow"],
            skill=row["skill"],
            git_branch=row["git_branch"],
            started_at=row["started_at"],
            ended_at=row["ended_at"],
            metadata=metadata or {},
        )

    def _row_to_event(self, row) -> SessionEvent:
        """Convert database row to SessionEvent instance."""
        parts = row["parts"]
        if isinstance(parts, str):
            parts = json.loads(parts)

        return SessionEvent(
            id=str(row["id"]),
            session_id=str(row["session_id"]),
            sequence=row["sequence"],
            type=row["type"],
            role=row["role"],
            content=row["content"],
            parts=parts,
            created_at=row["created_at"],
        )

    def _row_to_state(self, row) -> SessionState:
        """Convert database row to SessionState instance."""
        scratchpad = row["scratchpad"]
        if isinstance(scratchpad, str):
            scratchpad = json.loads(scratchpad)

        return SessionState(
            session_id=str(row["session_id"]),
            scratchpad=scratchpad or {},
            updated_at=row["updated_at"],
        )


async def create_session_service(
    database_url: str = "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    min_connections: int = 2,
    max_connections: int = 10,
) -> SessionService:
    """
    Factory function to create a SessionService with connection pool.

    Args:
        database_url: PostgreSQL connection string
        min_connections: Minimum pool size
        max_connections: Maximum pool size

    Returns:
        Configured SessionService instance
    """
    if not ASYNCPG_AVAILABLE:
        raise ImportError("asyncpg is required. Run: pip install asyncpg")

    pool = await asyncpg.create_pool(
        dsn=database_url,
        min_size=min_connections,
        max_size=max_connections,
    )

    logger.info(f"Created connection pool (min={min_connections}, max={max_connections})")

    return SessionService(pool)
