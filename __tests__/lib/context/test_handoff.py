"""
Tests for AgentHandoff protocol.

Tests handoff creation, storage, consumption, and workflow transitions.
"""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock

from lib.context.handoff import (
    AgentHandoff,
    HandoffContext,
    HandoffService,
    get_next_chatmode,
    WORKFLOW_TRANSITIONS,
)


class TestHandoffContext:
    """Tests for HandoffContext dataclass."""

    def test_to_dict(self):
        """Test conversion to dictionary."""
        context = HandoffContext(
            spec_file="test.spec.md",
            workflow="implement-feature",
            validation_gates_passed=[1, 2],
            artifacts_created=["schema.sql", "service.py"],
            key_decisions=["Use PostgreSQL", "Use async"],
            blockers=["Waiting on API"],
        )

        result = context.to_dict()

        assert result["spec_file"] == "test.spec.md"
        assert result["validation_gates_passed"] == [1, 2]
        assert len(result["artifacts_created"]) == 2

    def test_from_dict(self):
        """Test creation from dictionary."""
        data = {
            "spec_file": "test.spec.md",
            "workflow": "implement-feature",
            "validation_gates_passed": [1, 2, 3],
            "key_decisions": ["Decision A"],
        }

        context = HandoffContext.from_dict(data)

        assert context.spec_file == "test.spec.md"
        assert context.validation_gates_passed == [1, 2, 3]
        assert context.key_decisions == ["Decision A"]

    def test_default_values(self):
        """Test default values for HandoffContext."""
        context = HandoffContext()

        assert context.spec_file is None
        assert context.validation_gates_passed == []
        assert context.artifacts_created == []
        assert context.blockers == []


class TestAgentHandoff:
    """Tests for AgentHandoff dataclass."""

    def test_to_dict(self):
        """Test conversion to dictionary."""
        handoff = AgentHandoff(
            from_chatmode="architect",
            to_chatmode="service-engineer",
            workflow="implement-feature",
            session_id="test-session-123",
            handoff_context=HandoffContext(
                spec_file="feature.spec.md",
                validation_gates_passed=[1],
            ),
            session_summary="Completed schema design",
        )

        result = handoff.to_dict()

        assert result["from_chatmode"] == "architect"
        assert result["to_chatmode"] == "service-engineer"
        assert result["handoff_context"]["spec_file"] == "feature.spec.md"
        assert result["session_summary"] == "Completed schema design"

    def test_from_dict(self):
        """Test creation from dictionary."""
        data = {
            "from_chatmode": "architect",
            "to_chatmode": "service-engineer",
            "workflow": "implement-feature",
            "session_id": "test-session-123",
            "handoff_context": {
                "spec_file": "feature.spec.md",
                "validation_gates_passed": [1, 2],
            },
            "session_summary": "Done with design",
            "created_at": "2025-01-01T12:00:00",
        }

        handoff = AgentHandoff.from_dict(data)

        assert handoff.from_chatmode == "architect"
        assert handoff.to_chatmode == "service-engineer"
        assert handoff.handoff_context.validation_gates_passed == [1, 2]

    def test_format_for_prompt(self):
        """Test formatting handoff for prompt injection."""
        handoff = AgentHandoff(
            from_chatmode="architect",
            to_chatmode="service-engineer",
            workflow="implement-context-mgmt",
            session_id="test-session",
            handoff_context=HandoffContext(
                spec_file="context-session-service.spec.md",
                validation_gates_passed=[1],
                artifacts_created=["schema.sql"],
                key_decisions=["Use PostgreSQL full-text search"],
                blockers=["Need API key"],
            ),
            session_summary="Completed Phase 1 schema design",
        )

        formatted = handoff.format_for_prompt()

        assert "## Handoff from architect" in formatted
        assert "implement-context-mgmt" in formatted
        assert "context-session-service.spec.md" in formatted
        assert "schema.sql" in formatted
        assert "PostgreSQL full-text search" in formatted
        assert "Need API key" in formatted
        assert "Completed Phase 1" in formatted


class TestHandoffService:
    """Tests for HandoffService."""

    @pytest.fixture
    def mock_pool(self):
        """Create a mock asyncpg pool with proper async context manager."""
        from unittest.mock import MagicMock
        pool = MagicMock()
        conn = AsyncMock()

        cm = AsyncMock()
        cm.__aenter__.return_value = conn
        cm.__aexit__.return_value = None

        pool.acquire.return_value = cm
        return pool, conn

    @pytest.mark.asyncio
    async def test_create_handoff(self, mock_pool):
        """Test creating a handoff."""
        pool, conn = mock_pool

        service = HandoffService(db_url="postgresql://test")
        service._pool = pool

        # Patch _get_pool to return our mock
        async def mock_get_pool():
            return pool
        service._get_pool = mock_get_pool

        context = HandoffContext(
            spec_file="test.spec.md",
            validation_gates_passed=[1],
        )

        handoff = await service.create_handoff(
            session_id="test-session",
            from_chatmode="architect",
            to_chatmode="service-engineer",
            workflow="test-workflow",
            handoff_context=context,
            session_summary="Test summary",
        )

        assert handoff.from_chatmode == "architect"
        assert handoff.to_chatmode == "service-engineer"
        conn.execute.assert_called()

    @pytest.mark.asyncio
    async def test_get_pending_handoff(self, mock_pool):
        """Test retrieving a pending handoff."""
        pool, conn = mock_pool

        import json

        handoff_data = {
            "from_chatmode": "architect",
            "to_chatmode": "service-engineer",
            "workflow": "test",
            "session_id": "test-session",
            "handoff_context": {},
            "session_summary": None,
            "created_at": "2025-01-01T12:00:00",
        }

        conn.fetchrow.return_value = {"handoff": json.dumps(handoff_data)}

        service = HandoffService(db_url="postgresql://test")
        service._pool = pool

        # Patch _get_pool to return our mock
        async def mock_get_pool():
            return pool
        service._get_pool = mock_get_pool

        handoff = await service.get_pending_handoff("test-session")

        assert handoff is not None
        assert handoff.from_chatmode == "architect"

    @pytest.mark.asyncio
    async def test_consume_handoff(self, mock_pool):
        """Test consuming (retrieving and clearing) a handoff."""
        pool, conn = mock_pool

        import json

        handoff_data = {
            "from_chatmode": "architect",
            "to_chatmode": "service-engineer",
            "workflow": "test",
            "session_id": "test-session",
            "handoff_context": {},
            "session_summary": None,
            "created_at": "2025-01-01T12:00:00",
        }

        conn.fetchrow.return_value = {"handoff": json.dumps(handoff_data)}

        service = HandoffService(db_url="postgresql://test")
        service._pool = pool

        # Patch _get_pool to return our mock
        async def mock_get_pool():
            return pool
        service._get_pool = mock_get_pool

        handoff = await service.consume_handoff("test-session")

        assert handoff is not None
        # Should clear the handoff after consuming
        assert conn.execute.call_count >= 1


class TestWorkflowTransitions:
    """Tests for workflow transition definitions."""

    def test_get_next_chatmode_valid_transition(self):
        """Test getting next chatmode for valid transition."""
        next_mode = get_next_chatmode(
            workflow="implement-context-mgmt",
            current_chatmode="architect",
            gate_passed=1,
        )

        assert next_mode == "service-engineer"

    def test_get_next_chatmode_no_transition(self):
        """Test getting next chatmode when no transition defined."""
        next_mode = get_next_chatmode(
            workflow="implement-context-mgmt",
            current_chatmode="architect",
            gate_passed=99,  # No such gate
        )

        assert next_mode is None

    def test_get_next_chatmode_unknown_workflow(self):
        """Test getting next chatmode for unknown workflow."""
        next_mode = get_next_chatmode(
            workflow="unknown-workflow",
            current_chatmode="architect",
            gate_passed=1,
        )

        assert next_mode is None

    def test_workflow_transitions_defined(self):
        """Test that workflow transitions are properly defined."""
        assert "implement-context-mgmt" in WORKFLOW_TRANSITIONS
        assert "feature-development" in WORKFLOW_TRANSITIONS

        # Each transition should have required fields
        for workflow, transitions in WORKFLOW_TRANSITIONS.items():
            for t in transitions:
                assert "from" in t
                assert "to" in t
                assert "after_gate" in t
