"""
Session Compaction Strategies for Context Management Layer.

Implements token budget management through:
- Sliding window (keep last N turns)
- Token truncation (trim to budget)
- Recursive summarization (LLM-generated summaries)

Reference: docs/context-engineering/CONTEXT_MANAGEMENT_EVOLUTION_PROPOSAL.md
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional, Protocol
from loguru import logger

from lib.context.models import SessionEvent, EventType


@dataclass
class CompactionConfig:
    """Configuration for session compaction."""
    max_turns: int = 30
    token_budget: int = 100_000
    chars_per_token: int = 4  # Rough estimate
    keep_recent_turns: int = 10  # Always keep last N turns uncompacted
    summary_target_tokens: int = 500
    checkpoint_on_gates: bool = True


@dataclass
class CompactionResult:
    """Result of compaction operation."""
    events: list[SessionEvent]
    summary: Optional[str] = None
    original_count: int = 0
    compacted_count: int = 0
    tokens_before: int = 0
    tokens_after: int = 0
    strategy_used: str = ""

    @property
    def reduction_ratio(self) -> float:
        """Calculate token reduction ratio."""
        if self.tokens_before == 0:
            return 0.0
        return 1.0 - (self.tokens_after / self.tokens_before)


class SummarizerProtocol(Protocol):
    """Protocol for LLM-based summarization."""

    async def summarize(self, events: list[SessionEvent]) -> str:
        """Generate a summary of the given events."""
        ...


class CompactionStrategy(ABC):
    """Base class for compaction strategies."""

    @abstractmethod
    async def compact(
        self,
        events: list[SessionEvent],
        config: CompactionConfig,
        summarizer: Optional[SummarizerProtocol] = None,
    ) -> CompactionResult:
        """Apply compaction strategy to events."""
        ...


class SlidingWindowStrategy(CompactionStrategy):
    """
    Keep only the last N turns.

    A "turn" is a user message + assistant response pair.
    Tool calls within a turn are preserved.
    """

    async def compact(
        self,
        events: list[SessionEvent],
        config: CompactionConfig,
        summarizer: Optional[SummarizerProtocol] = None,
    ) -> CompactionResult:
        """Keep last max_turns worth of events."""
        if not events:
            return CompactionResult(
                events=[],
                original_count=0,
                compacted_count=0,
                strategy_used="sliding_window",
            )

        original_count = len(events)
        tokens_before = self._estimate_tokens(events, config)

        # Count turns (user messages)
        turn_count = sum(1 for e in events if e.type == EventType.USER_MESSAGE.value)

        if turn_count <= config.max_turns:
            # No compaction needed
            return CompactionResult(
                events=events,
                original_count=original_count,
                compacted_count=original_count,
                tokens_before=tokens_before,
                tokens_after=tokens_before,
                strategy_used="sliding_window",
            )

        # Find the start of the window
        turns_to_skip = turn_count - config.max_turns
        skipped_turns = 0
        window_start_idx = 0

        for i, event in enumerate(events):
            if event.type == EventType.USER_MESSAGE.value:
                skipped_turns += 1
                if skipped_turns > turns_to_skip:
                    window_start_idx = i
                    break

        # Keep events from window start
        compacted_events = events[window_start_idx:]
        tokens_after = self._estimate_tokens(compacted_events, config)

        # Generate summary of dropped events if summarizer provided
        summary = None
        if summarizer and window_start_idx > 0:
            dropped_events = events[:window_start_idx]
            try:
                summary = await summarizer.summarize(dropped_events)
            except Exception as e:
                logger.warning(f"Failed to generate summary: {e}")

        return CompactionResult(
            events=compacted_events,
            summary=summary,
            original_count=original_count,
            compacted_count=len(compacted_events),
            tokens_before=tokens_before,
            tokens_after=tokens_after,
            strategy_used="sliding_window",
        )

    def _estimate_tokens(self, events: list[SessionEvent], config: CompactionConfig) -> int:
        """Estimate token count for events."""
        total_chars = sum(len(e.content) for e in events)
        return total_chars // config.chars_per_token


class TokenTruncationStrategy(CompactionStrategy):
    """
    Truncate events to fit within token budget.

    Preserves most recent events, drops oldest first.
    """

    async def compact(
        self,
        events: list[SessionEvent],
        config: CompactionConfig,
        summarizer: Optional[SummarizerProtocol] = None,
    ) -> CompactionResult:
        """Truncate to token budget."""
        if not events:
            return CompactionResult(
                events=[],
                original_count=0,
                compacted_count=0,
                strategy_used="token_truncation",
            )

        original_count = len(events)
        tokens_before = self._estimate_tokens(events, config)

        if tokens_before <= config.token_budget:
            return CompactionResult(
                events=events,
                original_count=original_count,
                compacted_count=original_count,
                tokens_before=tokens_before,
                tokens_after=tokens_before,
                strategy_used="token_truncation",
            )

        # Keep adding events from the end until budget exceeded
        compacted_events = []
        current_tokens = 0

        for event in reversed(events):
            event_tokens = len(event.content) // config.chars_per_token
            if current_tokens + event_tokens > config.token_budget:
                break
            compacted_events.insert(0, event)
            current_tokens += event_tokens

        tokens_after = current_tokens

        # Generate summary of dropped events
        summary = None
        dropped_count = original_count - len(compacted_events)
        if summarizer and dropped_count > 0:
            dropped_events = events[:dropped_count]
            try:
                summary = await summarizer.summarize(dropped_events)
            except Exception as e:
                logger.warning(f"Failed to generate summary: {e}")

        return CompactionResult(
            events=compacted_events,
            summary=summary,
            original_count=original_count,
            compacted_count=len(compacted_events),
            tokens_before=tokens_before,
            tokens_after=tokens_after,
            strategy_used="token_truncation",
        )

    def _estimate_tokens(self, events: list[SessionEvent], config: CompactionConfig) -> int:
        """Estimate token count for events."""
        total_chars = sum(len(e.content) for e in events)
        return total_chars // config.chars_per_token


class RecursiveSummarizationStrategy(CompactionStrategy):
    """
    Summarize older events while preserving recent ones.

    Keeps the last `keep_recent_turns` verbatim, summarizes the rest.
    """

    async def compact(
        self,
        events: list[SessionEvent],
        config: CompactionConfig,
        summarizer: Optional[SummarizerProtocol] = None,
    ) -> CompactionResult:
        """Summarize older events, keep recent ones."""
        if not events:
            return CompactionResult(
                events=[],
                original_count=0,
                compacted_count=0,
                strategy_used="recursive_summarization",
            )

        if summarizer is None:
            logger.warning("No summarizer provided, falling back to sliding window")
            fallback = SlidingWindowStrategy()
            result = await fallback.compact(events, config, None)
            result.strategy_used = "recursive_summarization_fallback"
            return result

        original_count = len(events)
        tokens_before = self._estimate_tokens(events, config)

        # Find split point - keep last N turns
        turn_count = sum(1 for e in events if e.type == EventType.USER_MESSAGE.value)

        if turn_count <= config.keep_recent_turns:
            # All events are "recent", no summarization needed
            return CompactionResult(
                events=events,
                original_count=original_count,
                compacted_count=original_count,
                tokens_before=tokens_before,
                tokens_after=tokens_before,
                strategy_used="recursive_summarization",
            )

        # Find where to split
        turns_to_summarize = turn_count - config.keep_recent_turns
        summarized_turns = 0
        split_idx = 0

        for i, event in enumerate(events):
            if event.type == EventType.USER_MESSAGE.value:
                summarized_turns += 1
                if summarized_turns >= turns_to_summarize:
                    # Find the end of this turn (next user message or end)
                    for j in range(i + 1, len(events)):
                        if events[j].type == EventType.USER_MESSAGE.value:
                            split_idx = j
                            break
                    else:
                        split_idx = len(events)
                    break

        # Split into to-summarize and to-keep
        events_to_summarize = events[:split_idx]
        events_to_keep = events[split_idx:]

        # Generate summary
        try:
            summary = await summarizer.summarize(events_to_summarize)
        except Exception as e:
            logger.error(f"Summarization failed: {e}")
            # Fall back to just keeping recent events
            return CompactionResult(
                events=events_to_keep,
                summary=None,
                original_count=original_count,
                compacted_count=len(events_to_keep),
                tokens_before=tokens_before,
                tokens_after=self._estimate_tokens(events_to_keep, config),
                strategy_used="recursive_summarization_partial",
            )

        # Create summary event
        summary_event = SessionEvent(
            id="summary",
            session_id=events[0].session_id if events else "",
            sequence=0,  # Will be at the start
            type=EventType.SYSTEM_EVENT.value,
            role="system",
            content=f"[Session Summary]\n{summary}",
            created_at=datetime.now(),
            parts={"is_summary": True, "events_summarized": len(events_to_summarize)},
        )

        compacted_events = [summary_event] + events_to_keep
        tokens_after = self._estimate_tokens(compacted_events, config)

        return CompactionResult(
            events=compacted_events,
            summary=summary,
            original_count=original_count,
            compacted_count=len(compacted_events),
            tokens_before=tokens_before,
            tokens_after=tokens_after,
            strategy_used="recursive_summarization",
        )

    def _estimate_tokens(self, events: list[SessionEvent], config: CompactionConfig) -> int:
        """Estimate token count for events."""
        total_chars = sum(len(e.content) for e in events)
        return total_chars // config.chars_per_token


class SessionCompactor:
    """
    Main compaction service that orchestrates strategies.

    Automatically selects and applies appropriate compaction based on thresholds.
    """

    def __init__(self, config: Optional[CompactionConfig] = None):
        """Initialize compactor with configuration."""
        self.config = config or CompactionConfig()
        self.strategies = {
            "sliding_window": SlidingWindowStrategy(),
            "token_truncation": TokenTruncationStrategy(),
            "recursive_summarization": RecursiveSummarizationStrategy(),
        }

    async def compact_if_needed(
        self,
        events: list[SessionEvent],
        summarizer: Optional[SummarizerProtocol] = None,
        force_strategy: Optional[str] = None,
    ) -> CompactionResult:
        """
        Automatically compact events if thresholds exceeded.

        Args:
            events: List of session events
            summarizer: Optional LLM summarizer for recursive summarization
            force_strategy: Force a specific strategy (for testing)

        Returns:
            CompactionResult with compacted events
        """
        if not events:
            return CompactionResult(
                events=[],
                original_count=0,
                compacted_count=0,
                strategy_used="none",
            )

        # Determine which strategy to use
        if force_strategy:
            strategy_name = force_strategy
        else:
            strategy_name = self._select_strategy(events)

        if strategy_name == "none":
            tokens = self._estimate_tokens(events)
            return CompactionResult(
                events=events,
                original_count=len(events),
                compacted_count=len(events),
                tokens_before=tokens,
                tokens_after=tokens,
                strategy_used="none",
            )

        strategy = self.strategies.get(strategy_name)
        if not strategy:
            logger.error(f"Unknown strategy: {strategy_name}")
            return CompactionResult(
                events=events,
                original_count=len(events),
                compacted_count=len(events),
                strategy_used="error",
            )

        logger.info(f"Applying compaction strategy: {strategy_name}")
        result = await strategy.compact(events, self.config, summarizer)

        if result.reduction_ratio > 0:
            logger.info(
                f"Compaction: {result.original_count} -> {result.compacted_count} events "
                f"({result.reduction_ratio:.1%} reduction)"
            )

        return result

    def _select_strategy(self, events: list[SessionEvent]) -> str:
        """Select appropriate compaction strategy based on thresholds."""
        turn_count = sum(1 for e in events if e.type == EventType.USER_MESSAGE.value)
        token_estimate = self._estimate_tokens(events)

        # Check token budget first (higher priority)
        if token_estimate > self.config.token_budget * 0.8:
            # Over 80% of budget - use recursive summarization if available
            return "recursive_summarization"

        # Check turn count
        if turn_count > self.config.max_turns:
            return "sliding_window"

        # No compaction needed
        return "none"

    def _estimate_tokens(self, events: list[SessionEvent]) -> int:
        """Estimate total tokens in events."""
        total_chars = sum(len(e.content) for e in events)
        return total_chars // self.config.chars_per_token

    def count_tokens(self, events: list[SessionEvent]) -> int:
        """Public method to count tokens (alias for estimate)."""
        return self._estimate_tokens(events)

    async def create_checkpoint_summary(
        self,
        events: list[SessionEvent],
        gate_number: int,
        summarizer: SummarizerProtocol,
    ) -> str:
        """
        Create a checkpoint summary at a validation gate.

        This preserves context at key workflow milestones.
        """
        if not events:
            return f"Gate {gate_number}: No events to summarize"

        try:
            summary = await summarizer.summarize(events)
            return f"[Checkpoint Gate {gate_number}]\n{summary}"
        except Exception as e:
            logger.error(f"Failed to create checkpoint summary: {e}")
            # Return a basic summary
            turn_count = sum(1 for e in events if e.type == EventType.USER_MESSAGE.value)
            return f"[Checkpoint Gate {gate_number}]\nSession: {turn_count} turns, {len(events)} events"


@dataclass
class CompactionTrigger:
    """Defines when compaction should be triggered."""
    trigger_type: str  # "turn_count", "token_count", "time_based", "workflow_gate"
    threshold: int | float | timedelta
    action: str  # Strategy to apply

    @classmethod
    def default_triggers(cls) -> list["CompactionTrigger"]:
        """Get default compaction triggers."""
        return [
            cls("turn_count", 30, "sliding_window"),
            cls("token_count", 80_000, "recursive_summarization"),
            cls("time_based", timedelta(hours=1), "recursive_summarization"),
            cls("workflow_gate", 1, "recursive_summarization"),  # Any gate triggers
        ]


# Simple text-based summarizer for testing (no LLM required)
class SimpleSummarizer:
    """Simple summarizer that extracts key information without LLM."""

    async def summarize(self, events: list[SessionEvent]) -> str:
        """Generate a basic summary from events."""
        if not events:
            return "No events to summarize."

        # Extract key information
        user_messages = [e for e in events if e.type == EventType.USER_MESSAGE.value]
        assistant_messages = [e for e in events if e.type == EventType.MODEL_MESSAGE.value]
        tool_calls = [e for e in events if e.type == EventType.TOOL_CALL.value]
        gates = [e for e in events if e.type == EventType.VALIDATION_GATE.value]

        lines = []
        lines.append(f"Summary of {len(events)} events:")
        lines.append(f"- {len(user_messages)} user messages")
        lines.append(f"- {len(assistant_messages)} assistant responses")
        lines.append(f"- {len(tool_calls)} tool calls")

        if gates:
            lines.append(f"- {len(gates)} validation gates")

        # Include first and last user messages for context
        if user_messages:
            first_msg = user_messages[0].content[:100]
            lines.append(f"\nStarted with: {first_msg}...")

            if len(user_messages) > 1:
                last_msg = user_messages[-1].content[:100]
                lines.append(f"Ended with: {last_msg}...")

        return "\n".join(lines)
