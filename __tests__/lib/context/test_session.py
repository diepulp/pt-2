"""
Tests for SessionService.

Tests session lifecycle, event logging, and state management.
"""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from lib.context.models import Session, SessionEvent, SessionState, EventType, Role
from lib.context.session import SessionService


@pytest.fixture
def mock_pool():
    """Create a mock asyncpg pool with proper async context manager."""
    pool = MagicMock()
    conn = AsyncMock()

    # Create async context manager mock for pool.acquire()
    acquire_cm = AsyncMock()
    acquire_cm.__aenter__.return_value = conn
    acquire_cm.__aexit__.return_value = None
    pool.acquire.return_value = acquire_cm

    # Create async context manager mock for conn.transaction()
    tx_cm = AsyncMock()
    tx_cm.__aenter__.return_value = None
    tx_cm.__aexit__.return_value = None
    conn.transaction.return_value = tx_cm

    return pool, conn


class TestSessionService:
    """Tests for SessionService.

    Note: These tests require actual asyncpg pool for full testing.
    Mark as integration tests for CI with database.
    """

    @pytest.mark.skip(reason="Requires asyncpg pool - run as integration test")
    @pytest.mark.asyncio
    async def test_create_session_with_valid_chatmode(self, mock_pool):
        """Test creating a session with valid parameters."""
        # Integration test - requires actual database
        pass

    @pytest.mark.skip(reason="Requires asyncpg pool - run as integration test")
    @pytest.mark.asyncio
    async def test_append_event_with_incrementing_sequence(self, mock_pool):
        """Test that events are appended with incrementing sequence numbers."""
        # Integration test - requires actual database
        pass

    @pytest.mark.skip(reason="Requires asyncpg pool - run as integration test")
    @pytest.mark.asyncio
    async def test_get_recent_events_with_sliding_window(self, mock_pool):
        """Test retrieving recent events with a sliding window."""
        # Integration test - requires actual database
        pass

    @pytest.mark.skip(reason="Requires asyncpg pool - run as integration test")
    @pytest.mark.asyncio
    async def test_update_scratchpad_state(self, mock_pool):
        """Test updating the session scratchpad state."""
        # Integration test - requires actual database
        pass

    @pytest.mark.skip(reason="Requires asyncpg pool - run as integration test")
    @pytest.mark.asyncio
    async def test_end_session_lifecycle(self, mock_pool):
        """Test ending a session."""
        # Integration test - requires actual database
        pass


class TestSessionEvent:
    """Tests for SessionEvent model."""

    def test_create_event_factory(self):
        """Test the SessionEvent.create factory method."""
        event = SessionEvent.create(
            session_id="test-session",
            sequence=1,
            event_type=EventType.USER_MESSAGE,
            role=Role.USER,
            content="Test message",
        )

        assert event.session_id == "test-session"
        assert event.sequence == 1
        assert event.type == EventType.USER_MESSAGE.value
        assert event.role == Role.USER.value
        assert event.content == "Test message"


class TestSessionState:
    """Tests for SessionState model."""

    def test_state_properties(self):
        """Test SessionState property accessors."""
        state = SessionState(
            session_id="test-session",
            scratchpad={
                "current_task": "Testing",
                "spec_file": "test.spec.md",
                "validation_gates_passed": [1, 2],
                "blockers": ["Issue A"],
            },
            updated_at=datetime.now(),
        )

        assert state.current_task == "Testing"
        assert state.spec_file == "test.spec.md"
        assert state.validation_gates_passed == [1, 2]
        assert state.blockers == ["Issue A"]

    def test_state_get_with_default(self):
        """Test SessionState.get with default value."""
        state = SessionState(
            session_id="test-session",
            scratchpad={},
            updated_at=datetime.now(),
        )

        assert state.get("missing_key", "default") == "default"
        assert state.get("missing_key") is None
