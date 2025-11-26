"""
Tests for MemoryGenerationPipeline.

Tests memory extraction, consolidation, and ETL processing.
"""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock

from lib.memori.pipeline import (
    MemoryGenerationPipeline,
    CandidateMemory,
    ConsolidationResult,
)


@pytest.fixture
def mock_pool():
    """Create a mock asyncpg pool with proper async context manager."""
    from unittest.mock import MagicMock
    pool = MagicMock()
    conn = AsyncMock()

    cm = AsyncMock()
    cm.__aenter__.return_value = conn
    cm.__aexit__.return_value = None

    pool.acquire.return_value = cm
    return pool, conn


def create_test_event(
    event_id: str,
    event_type: str,
    role: str,
    content: str,
) -> dict:
    """Create a test event dict."""
    return {
        "id": event_id,
        "session_id": "test-session",
        "sequence": 1,
        "type": event_type,
        "role": role,
        "content": content,
        "parts": {},
        "created_at": datetime.now(),
    }


class TestMemoryGenerationPipeline:
    """Tests for MemoryGenerationPipeline."""

    @pytest.mark.asyncio
    async def test_extract_candidate_memories_from_events(self):
        """Test extracting candidate memories from events."""
        # Create pipeline without DB (for pattern extraction only)
        pipeline = MemoryGenerationPipeline(
            db_url="postgresql://test",
            extractor=None,
        )

        events = [
            create_test_event("1", "user_message", "user", "Please remember that the API uses REST"),
            create_test_event("2", "model_message", "assistant", "Got it, I'll remember that"),
            create_test_event("3", "user_message", "user", "We decided to use PostgreSQL for storage"),
        ]

        candidates = await pipeline.extract_memories(events)

        # Should extract at least one memory from "remember that" pattern
        assert len(candidates) >= 1

    def test_pattern_extraction_user_correction(self):
        """Test pattern extraction for user corrections."""
        pipeline = MemoryGenerationPipeline(db_url="postgresql://test")

        events = [
            create_test_event("1", "user_message", "user", "Actually, it's spelled PostgreSQL not Postgres"),
        ]

        candidates = pipeline._extract_by_patterns(events)

        # Should find the correction pattern
        assert any("PostgreSQL" in c.content for c in candidates)

    def test_pattern_extraction_decision(self):
        """Test pattern extraction for decisions."""
        pipeline = MemoryGenerationPipeline(db_url="postgresql://test")

        events = [
            create_test_event("1", "user_message", "user", "We decided to use functional factories"),
        ]

        candidates = pipeline._extract_by_patterns(events)

        # Should find the decision pattern
        assert any("functional factories" in c.content for c in candidates)

    def test_pattern_extraction_anti_pattern(self):
        """Test pattern extraction for anti-patterns."""
        pipeline = MemoryGenerationPipeline(db_url="postgresql://test")

        events = [
            create_test_event("1", "user_message", "user", "Never use global state in services"),
        ]

        candidates = pipeline._extract_by_patterns(events)

        # Should find the anti-pattern
        assert len(candidates) >= 1
        assert any(c.category == "rules" for c in candidates)

    def test_deduplicate_candidates(self):
        """Test deduplication of similar candidates."""
        pipeline = MemoryGenerationPipeline(db_url="postgresql://test")

        candidates = [
            CandidateMemory(
                content="Use PostgreSQL for database storage and queries",
                category="facts",
                source_type="pattern_match",
                confidence=0.6,
            ),
            CandidateMemory(
                content="Use PostgreSQL for the database storage and queries",  # Very similar
                category="facts",
                source_type="pattern_match",
                confidence=0.6,
            ),
            CandidateMemory(
                content="Use functional factories pattern for services",  # Different
                category="rules",
                source_type="pattern_match",
                confidence=0.6,
            ),
        ]

        deduplicated = pipeline._deduplicate_candidates(candidates)

        # Should remove near-duplicate
        assert len(deduplicated) == 2

    def test_text_similarity(self):
        """Test text similarity calculation."""
        pipeline = MemoryGenerationPipeline(db_url="postgresql://test")

        # Very similar texts
        sim1 = pipeline._text_similarity(
            "use postgresql for storage",
            "use postgresql for the storage",
        )
        assert sim1 > 0.7

        # Different texts
        sim2 = pipeline._text_similarity(
            "use postgresql for storage",
            "apply functional factories pattern",
        )
        assert sim2 < 0.3

    @pytest.mark.skip(reason="Requires asyncpg pool - run as integration test")
    @pytest.mark.asyncio
    async def test_consolidate_creates_new_memory(self, mock_pool):
        """Test consolidation creates new memory when no match found."""
        pass

    @pytest.mark.skip(reason="Requires asyncpg pool - run as integration test")
    @pytest.mark.asyncio
    async def test_consolidate_updates_existing_memory(self, mock_pool):
        """Test consolidation updates existing memory when very similar."""
        pass

    @pytest.mark.skip(reason="Requires asyncpg pool - run as integration test")
    @pytest.mark.asyncio
    async def test_consolidate_skips_moderate_similarity(self, mock_pool):
        """Test consolidation skips when moderate similarity (needs review)."""
        pass


class TestCandidateMemory:
    """Tests for CandidateMemory dataclass."""

    def test_to_dict(self):
        """Test conversion to dictionary."""
        candidate = CandidateMemory(
            content="Test content",
            category="facts",
            source_type="pattern_match",
            confidence=0.7,
            lineage=["event-1", "event-2"],
            metadata={"key": "value"},
            importance=0.8,
        )

        result = candidate.to_dict()

        assert result["content"] == "Test content"
        assert result["category"] == "facts"
        assert result["confidence"] == 0.7
        assert result["lineage"] == ["event-1", "event-2"]
        assert result["metadata"]["importance"] == 0.8


class TestConsolidationResult:
    """Tests for ConsolidationResult dataclass."""

    def test_created_result(self):
        """Test created action result."""
        result = ConsolidationResult(
            action="created",
            memory_id=100,
            reason="No similar memories found",
        )

        assert result.action == "created"
        assert result.memory_id == 100

    def test_updated_result(self):
        """Test updated action result."""
        result = ConsolidationResult(
            action="updated",
            matched_memory_id=50,
            confidence_delta=0.1,
            reason="Corroborated existing memory",
        )

        assert result.action == "updated"
        assert result.confidence_delta == 0.1
