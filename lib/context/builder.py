"""
Context Builder for Context Management Layer.

Assembles full context for each turn by combining:
- Session events (sliding window)
- Proactive memory retrieval
- High-importance memories
- Static context (memory files)

Reference: docs/context-engineering/CONTEXT_MANAGEMENT_EVOLUTION_PROPOSAL.md
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
from loguru import logger

from lib.context.session import SessionService
from lib.context.models import SessionEvent, SessionState
from lib.memori.retrieval import MemoryRetriever, RetrievedMemory


@dataclass
class TurnInput:
    """Input for context building at turn start."""
    session_id: str
    message: str
    chatmode: str
    user_id: str
    workflow: Optional[str] = None
    skill: Optional[str] = None


@dataclass
class BuiltContext:
    """Assembled context ready for LLM consumption."""
    session_id: str
    chatmode: str
    # History
    history: list[SessionEvent] = field(default_factory=list)
    history_token_estimate: int = 0
    # Memories
    memories: list[RetrievedMemory] = field(default_factory=list)
    high_importance_memories: list[RetrievedMemory] = field(default_factory=list)
    # State
    scratchpad: dict = field(default_factory=dict)
    # Static context
    static_context: str = ""
    # Metadata
    memory_files_loaded: list[str] = field(default_factory=list)

    @property
    def all_memories(self) -> list[RetrievedMemory]:
        """Get deduplicated list of all memories."""
        seen_ids = set()
        result = []
        for mem in self.memories + self.high_importance_memories:
            if mem.id not in seen_ids:
                seen_ids.add(mem.id)
                result.append(mem)
        return sorted(result, key=lambda m: m.final_score, reverse=True)

    def format_memories_for_prompt(self) -> str:
        """Format memories as text for prompt injection."""
        if not self.all_memories:
            return ""

        lines = ["## Retrieved Memories", ""]
        for mem in self.all_memories[:10]:  # Limit to top 10
            category = f"[{mem.category}]" if mem.category else ""
            confidence = f"(confidence: {mem.confidence:.0%})"
            lines.append(f"- {category} {mem.content} {confidence}")

        return "\n".join(lines)

    def format_scratchpad_for_prompt(self) -> str:
        """Format scratchpad as text for prompt injection."""
        if not self.scratchpad:
            return ""

        lines = ["## Session State", ""]

        if self.scratchpad.get("current_task"):
            lines.append(f"**Current Task:** {self.scratchpad['current_task']}")

        if self.scratchpad.get("spec_file"):
            lines.append(f"**Spec File:** {self.scratchpad['spec_file']}")

        if self.scratchpad.get("files_in_progress"):
            files = ", ".join(self.scratchpad["files_in_progress"])
            lines.append(f"**Files in Progress:** {files}")

        if self.scratchpad.get("validation_gates_passed"):
            gates = ", ".join(str(g) for g in self.scratchpad["validation_gates_passed"])
            lines.append(f"**Validation Gates Passed:** {gates}")

        if self.scratchpad.get("blockers"):
            blockers = ", ".join(self.scratchpad["blockers"])
            lines.append(f"**Blockers:** {blockers}")

        return "\n".join(lines)


class ContextBuilder:
    """
    Assembles full context for each turn.

    Combines session history, memory retrieval, and static context
    into a coherent context object.
    """

    # Token estimation: ~4 chars per token
    CHARS_PER_TOKEN = 4

    # Memory file paths relative to project root
    MEMORY_FILE_DIR = ".claude/memory"

    def __init__(
        self,
        session_service: SessionService,
        memory_retriever: MemoryRetriever,
        project_root: Optional[Path] = None,
    ):
        """
        Initialize ContextBuilder.

        Args:
            session_service: SessionService instance
            memory_retriever: MemoryRetriever instance
            project_root: Path to project root for loading memory files
        """
        self.session_service = session_service
        self.memory_retriever = memory_retriever
        self.project_root = project_root or Path.cwd()

    async def build_context(
        self,
        turn: TurnInput,
        max_history_turns: int = 20,
        max_history_tokens: int = 50000,
        memory_limit: int = 10,
        importance_limit: int = 5,
    ) -> BuiltContext:
        """
        Build full context for a turn.

        Args:
            turn: Turn input with session and message info
            max_history_turns: Maximum history events to include
            max_history_tokens: Maximum tokens for history
            memory_limit: Maximum query-matched memories
            importance_limit: Maximum high-importance memories

        Returns:
            BuiltContext with all assembled context
        """
        # 1. Load session events (sliding window)
        history = await self.session_service.get_recent_events(
            turn.session_id,
            max_turns=max_history_turns,
        )

        # Estimate tokens and trim if needed
        history, token_estimate = self._trim_history_to_tokens(
            history, max_history_tokens
        )

        # 2. Proactive memory retrieval (query-based)
        memories = []
        if turn.message:
            memories = await self.memory_retriever.retrieve(
                namespace=turn.user_id,
                query=turn.message,
                limit=memory_limit,
                track_usage=True,
            )

        # 3. Fetch high-importance memories (regardless of query)
        high_importance = await self.memory_retriever.retrieve_high_importance(
            namespace=turn.user_id,
            limit=importance_limit,
            track_usage=True,
        )

        # 4. Get session state/scratchpad
        state = await self.session_service.get_state(turn.session_id)

        # 5. Load static memory files
        static_context, loaded_files = self._load_memory_files(turn.chatmode)

        # 6. Assemble context
        context = BuiltContext(
            session_id=turn.session_id,
            chatmode=turn.chatmode,
            history=history,
            history_token_estimate=token_estimate,
            memories=memories,
            high_importance_memories=high_importance,
            scratchpad=state.scratchpad,
            static_context=static_context,
            memory_files_loaded=loaded_files,
        )

        logger.info(
            f"Built context for session {turn.session_id}: "
            f"{len(history)} events, {len(context.all_memories)} memories, "
            f"~{token_estimate} tokens"
        )

        return context

    async def build_context_for_new_session(
        self,
        chatmode: str,
        user_id: str,
        message: str,
        workflow: Optional[str] = None,
        skill: Optional[str] = None,
    ) -> tuple[BuiltContext, str]:
        """
        Build context for a new session (creates session first).

        Args:
            chatmode: Chatmode name
            user_id: User/namespace ID
            message: Initial message
            workflow: Optional workflow name
            skill: Optional skill name

        Returns:
            Tuple of (BuiltContext, session_id)
        """
        # Create new session
        session = await self.session_service.create_session(
            chatmode=chatmode,
            user_id=user_id,
            workflow=workflow,
            skill=skill,
        )

        # Build context
        turn = TurnInput(
            session_id=session.id,
            message=message,
            chatmode=chatmode,
            user_id=user_id,
            workflow=workflow,
            skill=skill,
        )

        context = await self.build_context(turn)
        return context, session.id

    def _trim_history_to_tokens(
        self,
        events: list[SessionEvent],
        max_tokens: int,
    ) -> tuple[list[SessionEvent], int]:
        """
        Trim history events to fit within token budget.

        Keeps most recent events, removes older ones first.

        Returns:
            Tuple of (trimmed events, estimated tokens)
        """
        total_tokens = 0
        trimmed = []

        # Process from most recent to oldest
        for event in reversed(events):
            event_tokens = self._estimate_tokens(event.content)
            if event.parts:
                import json
                event_tokens += self._estimate_tokens(json.dumps(event.parts))

            if total_tokens + event_tokens <= max_tokens:
                trimmed.insert(0, event)
                total_tokens += event_tokens
            else:
                # Budget exceeded, stop adding older events
                break

        return trimmed, total_tokens

    def _estimate_tokens(self, text: str) -> int:
        """Estimate token count from text length."""
        return len(text) // self.CHARS_PER_TOKEN

    def _load_memory_files(self, chatmode: str) -> tuple[str, list[str]]:
        """
        Load static memory files for chatmode.

        Args:
            chatmode: Chatmode name

        Returns:
            Tuple of (concatenated content, list of loaded file names)
        """
        memory_dir = self.project_root / self.MEMORY_FILE_DIR
        if not memory_dir.exists():
            return "", []

        loaded_files = []
        content_parts = []

        # Load all .memory.md files
        for memory_file in sorted(memory_dir.glob("*.memory.md")):
            try:
                file_content = memory_file.read_text()
                content_parts.append(f"# {memory_file.stem}\n\n{file_content}")
                loaded_files.append(memory_file.name)
            except Exception as e:
                logger.warning(f"Failed to load memory file {memory_file}: {e}")

        return "\n\n---\n\n".join(content_parts), loaded_files

    def _merge_memories(
        self,
        *memory_lists: list[RetrievedMemory]
    ) -> list[RetrievedMemory]:
        """
        Deduplicate memories by ID, keeping highest scored.

        Args:
            memory_lists: Variable number of memory lists to merge

        Returns:
            Deduplicated list sorted by final_score
        """
        seen: dict[int, RetrievedMemory] = {}

        for memories in memory_lists:
            for mem in memories:
                if mem.id not in seen or mem.final_score > seen[mem.id].final_score:
                    seen[mem.id] = mem

        return sorted(seen.values(), key=lambda m: m.final_score, reverse=True)


# Memory search tool interface for reactive retrieval
MEMORY_SEARCH_TOOL = {
    "name": "memory_search",
    "description": (
        "Search project memory for relevant context, decisions, or patterns "
        "using full-text search. Use when you need to recall previous decisions, "
        "patterns, or context from earlier sessions."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Natural language query (uses PostgreSQL full-text search)",
            },
            "scope": {
                "type": "string",
                "enum": ["user", "session", "app", "all"],
                "description": "Search scope: user (chatmode), session (current), app (all chatmodes), all",
            },
            "category": {
                "type": "string",
                "enum": ["facts", "preferences", "rules", "skills", "context"],
                "description": "Filter by memory category",
            },
            "limit": {
                "type": "integer",
                "default": 10,
                "description": "Maximum results to return",
            },
        },
        "required": ["query"],
    },
}
