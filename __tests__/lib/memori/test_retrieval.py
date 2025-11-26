"""
Tests for MemoryRetriever.

Tests full-text search, composite scoring, and filtering.
"""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock

from lib.memori.retrieval import (
    MemoryRetriever,
    RetrievalConfig,
    RetrievedMemory,
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


def create_mock_memory_row(
    id: int,
    content: str,
    text_relevance: float = 0.5,
    recency_score: float = 0.5,
    importance_score: float = 0.5,
) -> dict:
    """Create a mock memory row from database."""
    final_score = text_relevance * 0.4 + recency_score * 0.3 + importance_score * 0.3
    return {
        "id": id,
        "user_id": "pt2_agent",
        "content": content,
        "category": "facts",
        "metadata": {"importance": importance_score},
        "created_at": datetime.now(),
        "source_type": "bootstrap",
        "confidence": 0.8,
        "use_count": 0,
        "text_relevance": text_relevance,
        "recency_score": recency_score,
        "importance_score": importance_score,
        "final_score": final_score,
    }


class TestMemoryRetriever:
    """Tests for MemoryRetriever.

    Note: Database-dependent tests marked for integration testing.
    """

    @pytest.mark.skip(reason="Requires asyncpg pool - run as integration test")
    @pytest.mark.asyncio
    async def test_retrieve_returns_relevant_memories(self, mock_pool):
        """Test that retrieve returns relevant memories."""
        pass

    @pytest.mark.skip(reason="Requires asyncpg pool - run as integration test")
    @pytest.mark.asyncio
    async def test_composite_scoring_orders_correctly(self, mock_pool):
        """Test that composite scoring produces correct ordering."""
        pass

    @pytest.mark.skip(reason="Requires asyncpg pool - run as integration test")
    @pytest.mark.asyncio
    async def test_tag_filtering_works(self, mock_pool):
        """Test filtering by tags."""
        pass

    @pytest.mark.skip(reason="Requires asyncpg pool - run as integration test")
    @pytest.mark.asyncio
    async def test_recency_scoring_decays(self, mock_pool):
        """Test that recency scoring decays appropriately."""
        pass

    @pytest.mark.skip(reason="Requires asyncpg pool - run as integration test")
    @pytest.mark.asyncio
    async def test_retrieve_high_importance(self, mock_pool):
        """Test retrieving high-importance memories without query."""
        pass

    @pytest.mark.skip(reason="Requires asyncpg pool - run as integration test")
    @pytest.mark.asyncio
    async def test_retrieve_recent(self, mock_pool):
        """Test recency-based retrieval."""
        pass


class TestRetrievalConfig:
    """Tests for RetrievalConfig."""

    def test_default_weights(self):
        """Test default weight configuration."""
        config = RetrievalConfig()

        assert config.relevance_weight == 0.4
        assert config.recency_weight == 0.3
        assert config.importance_weight == 0.3
        # Weights should sum to 1.0
        total = config.relevance_weight + config.recency_weight + config.importance_weight
        assert total == 1.0

    def test_custom_weights(self):
        """Test custom weight configuration."""
        config = RetrievalConfig(
            relevance_weight=0.6,
            recency_weight=0.2,
            importance_weight=0.2,
        )

        assert config.relevance_weight == 0.6


class TestRetrievedMemory:
    """Tests for RetrievedMemory dataclass."""

    def test_memory_creation(self):
        """Test creating a RetrievedMemory."""
        memory = RetrievedMemory(
            id=1,
            user_id="pt2_agent",
            content="Test content",
            category="facts",
            metadata={"importance": 0.8},
            created_at=datetime.now(),
            source_type="bootstrap",
            confidence=0.8,
            use_count=5,
            text_relevance=0.7,
            recency_score=0.6,
            importance_score=0.8,
            final_score=0.7,
        )

        assert memory.id == 1
        assert memory.content == "Test content"
        assert memory.final_score == 0.7
