"""
Tests for SessionCompactor and compaction strategies.

Tests sliding window, token truncation, and recursive summarization.
"""

import pytest
from datetime import datetime

from lib.context.models import SessionEvent, EventType
from lib.context.compaction import (
    SessionCompactor,
    CompactionConfig,
    SlidingWindowStrategy,
    TokenTruncationStrategy,
    RecursiveSummarizationStrategy,
    SimpleSummarizer,
)


def create_test_event(
    sequence: int,
    event_type: str = "user_message",
    content: str = "Test message",
) -> SessionEvent:
    """Helper to create test events."""
    return SessionEvent(
        id=f"event-{sequence}",
        session_id="test-session",
        sequence=sequence,
        type=event_type,
        role="user" if event_type == "user_message" else "assistant",
        content=content,
        created_at=datetime.now(),
        parts=None,
    )


def create_turn(sequence: int, user_msg: str = "User", assistant_msg: str = "Assistant") -> list[SessionEvent]:
    """Create a user-assistant turn pair."""
    return [
        create_test_event(sequence * 2, "user_message", user_msg),
        create_test_event(sequence * 2 + 1, "model_message", assistant_msg),
    ]


class TestSlidingWindowStrategy:
    """Tests for SlidingWindowStrategy."""

    @pytest.mark.asyncio
    async def test_keeps_last_n_turns(self):
        """Test that sliding window keeps the last N turns."""
        strategy = SlidingWindowStrategy()
        config = CompactionConfig(max_turns=3)

        # Create 5 turns (10 events)
        events = []
        for i in range(5):
            events.extend(create_turn(i))

        result = await strategy.compact(events, config)

        # Should keep last 3 turns = 6 events
        assert result.compacted_count == 6
        assert result.original_count == 10
        assert result.strategy_used == "sliding_window"

    @pytest.mark.asyncio
    async def test_no_compaction_needed(self):
        """Test that no compaction happens when under threshold."""
        strategy = SlidingWindowStrategy()
        config = CompactionConfig(max_turns=10)

        # Create 3 turns
        events = []
        for i in range(3):
            events.extend(create_turn(i))

        result = await strategy.compact(events, config)

        assert result.compacted_count == result.original_count
        assert result.reduction_ratio == 0.0

    @pytest.mark.asyncio
    async def test_empty_events(self):
        """Test handling of empty event list."""
        strategy = SlidingWindowStrategy()
        config = CompactionConfig()

        result = await strategy.compact([], config)

        assert result.compacted_count == 0
        assert result.original_count == 0


class TestTokenTruncationStrategy:
    """Tests for TokenTruncationStrategy."""

    @pytest.mark.asyncio
    async def test_truncates_to_budget(self):
        """Test that token truncation respects budget."""
        strategy = TokenTruncationStrategy()
        # Small budget to force truncation
        config = CompactionConfig(token_budget=100, chars_per_token=1)

        # Create events with known character counts
        events = [
            create_test_event(i, "user_message", "A" * 50)
            for i in range(5)
        ]

        result = await strategy.compact(events, config)

        # Should keep only events that fit in 100 chars
        assert result.tokens_after <= config.token_budget
        assert result.compacted_count < result.original_count

    @pytest.mark.asyncio
    async def test_preserves_most_recent(self):
        """Test that most recent events are preserved."""
        strategy = TokenTruncationStrategy()
        config = CompactionConfig(token_budget=100, chars_per_token=1)

        events = [
            create_test_event(i, "user_message", f"Message-{i}" + "X" * 30)
            for i in range(5)
        ]

        result = await strategy.compact(events, config)

        # The kept events should be the most recent ones
        if result.events:
            kept_sequences = [e.sequence for e in result.events]
            assert kept_sequences == sorted(kept_sequences)
            assert max(kept_sequences) == 4  # Last event should be included


class TestRecursiveSummarizationStrategy:
    """Tests for RecursiveSummarizationStrategy."""

    @pytest.mark.asyncio
    async def test_summarizes_older_events(self):
        """Test that older events are summarized."""
        strategy = RecursiveSummarizationStrategy()
        config = CompactionConfig(keep_recent_turns=2)
        summarizer = SimpleSummarizer()

        # Create 5 turns
        events = []
        for i in range(5):
            events.extend(create_turn(i))

        result = await strategy.compact(events, config, summarizer)

        # Should have summary + recent events
        assert result.summary is not None
        assert result.strategy_used == "recursive_summarization"

    @pytest.mark.asyncio
    async def test_fallback_without_summarizer(self):
        """Test fallback to sliding window when no summarizer."""
        strategy = RecursiveSummarizationStrategy()
        config = CompactionConfig(keep_recent_turns=2)

        events = []
        for i in range(5):
            events.extend(create_turn(i))

        result = await strategy.compact(events, config, summarizer=None)

        # Should fallback to sliding window
        assert "fallback" in result.strategy_used


class TestSessionCompactor:
    """Tests for SessionCompactor orchestration."""

    @pytest.mark.asyncio
    async def test_auto_selects_strategy(self):
        """Test automatic strategy selection."""
        compactor = SessionCompactor(CompactionConfig(max_turns=3))

        # Create 5 turns - should trigger sliding window
        events = []
        for i in range(5):
            events.extend(create_turn(i))

        result = await compactor.compact_if_needed(events)

        assert result.strategy_used in ["sliding_window", "none"]

    @pytest.mark.asyncio
    async def test_force_strategy(self):
        """Test forcing a specific strategy."""
        compactor = SessionCompactor()

        events = []
        for i in range(5):
            events.extend(create_turn(i))

        result = await compactor.compact_if_needed(
            events, force_strategy="sliding_window"
        )

        assert result.strategy_used == "sliding_window"

    def test_count_tokens(self):
        """Test token counting."""
        compactor = SessionCompactor(CompactionConfig(chars_per_token=4))

        events = [
            create_test_event(0, "user_message", "A" * 100),  # 25 tokens
            create_test_event(1, "model_message", "B" * 200),  # 50 tokens
        ]

        token_count = compactor.count_tokens(events)
        assert token_count == 75

    @pytest.mark.asyncio
    async def test_checkpoint_summary(self):
        """Test checkpoint summary generation."""
        compactor = SessionCompactor()
        summarizer = SimpleSummarizer()

        events = []
        for i in range(3):
            events.extend(create_turn(i))

        summary = await compactor.create_checkpoint_summary(
            events, gate_number=1, summarizer=summarizer
        )

        assert "Gate 1" in summary
        assert "events" in summary.lower()


class TestSimpleSummarizer:
    """Tests for SimpleSummarizer."""

    @pytest.mark.asyncio
    async def test_generates_summary(self):
        """Test basic summary generation."""
        summarizer = SimpleSummarizer()

        events = [
            create_test_event(0, "user_message", "Hello, I need help"),
            create_test_event(1, "model_message", "Sure, I can help"),
            create_test_event(2, "user_message", "Please fix the bug"),
            create_test_event(3, "model_message", "Fixed the bug"),
        ]

        summary = await summarizer.summarize(events)

        assert "user messages" in summary
        assert "assistant responses" in summary

    @pytest.mark.asyncio
    async def test_empty_events(self):
        """Test summary of empty events."""
        summarizer = SimpleSummarizer()

        summary = await summarizer.summarize([])

        assert "No events" in summary
