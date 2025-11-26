"""
Memory Generation Pipeline for Context Management Layer.

ETL pipeline that processes session events and extracts long-term memories:
- Load unprocessed events from completed sessions
- Extract candidate memories via pattern matching or LLM
- Consolidate with existing memories (CREATE/UPDATE/INVALIDATE)
- Track provenance and lineage

Reference: docs/context-engineering/CONTEXT_MANAGEMENT_EVOLUTION_PROPOSAL.md
"""

import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Protocol
from loguru import logger

try:
    import asyncpg
    ASYNCPG_AVAILABLE = True
except ImportError:
    logger.warning("asyncpg not installed. Run: pip install asyncpg")
    ASYNCPG_AVAILABLE = False


@dataclass
class CandidateMemory:
    """A memory candidate extracted from session events."""
    content: str
    category: str  # facts, preferences, rules, skills, context
    source_type: str  # session_extraction, user_correction, pattern_match
    confidence: float  # 0.0 - 1.0
    lineage: list[str] = field(default_factory=list)  # Event IDs that sourced this
    metadata: dict = field(default_factory=dict)
    importance: float = 0.5

    def to_dict(self) -> dict:
        """Convert to dictionary for storage."""
        return {
            "content": self.content,
            "category": self.category,
            "source_type": self.source_type,
            "confidence": self.confidence,
            "lineage": self.lineage,
            "metadata": {**self.metadata, "importance": self.importance},
        }


@dataclass
class ConsolidationResult:
    """Result of memory consolidation."""
    action: str  # "created", "updated", "invalidated", "skipped"
    memory_id: Optional[int] = None
    matched_memory_id: Optional[int] = None
    confidence_delta: float = 0.0
    reason: str = ""


class MemoryExtractorProtocol(Protocol):
    """Protocol for LLM-based memory extraction."""

    async def extract_memories(
        self, events: list[dict], categories: list[str]
    ) -> list[CandidateMemory]:
        """Extract candidate memories from events."""
        ...


class MemoryGenerationPipeline:
    """
    ETL pipeline for generating long-term memories from session events.

    Pipeline stages:
    1. Load: Get unprocessed events from session
    2. Extract: Identify candidate memories (patterns + LLM)
    3. Consolidate: Merge with existing memories
    4. Store: Persist with provenance tracking
    """

    # Categories for memory extraction
    MEMORY_CATEGORIES = ["facts", "preferences", "rules", "skills", "context"]

    # Patterns for rule-based extraction (no LLM required)
    EXTRACTION_PATTERNS = {
        "user_correction": [
            r"(?:actually|no,?\s*)?(?:it'?s|that'?s|this is)\s+(.+)",
            r"(?:please\s+)?(?:remember|note)\s+(?:that\s+)?(.+)",
            r"(?:i\s+)?prefer\s+(.+)",
            r"(?:always|never)\s+(.+)",
        ],
        "decision": [
            r"(?:we'?(?:ll|ve)\s+)?decided?\s+(?:to\s+)?(.+)",
            r"(?:the\s+)?decision\s+(?:is|was)\s+(?:to\s+)?(.+)",
            r"going\s+(?:to\s+|with\s+)(.+)",
        ],
        "anti_pattern": [
            r"(?:don'?t|do\s+not|never)\s+(.+)",
            r"(?:avoid|stop)\s+(.+ing)",
            r"(?:this|that)\s+(?:is|was)\s+(?:a\s+)?(?:bad|wrong|incorrect)",
        ],
        "architecture": [
            r"(?:the\s+)?architecture\s+(?:is|uses?|has)\s+(.+)",
            r"(?:we\s+)?use\s+(.+)\s+(?:for|to)\s+(.+)",
            r"(?:the\s+)?pattern\s+(?:is|for)\s+(.+)",
        ],
    }

    def __init__(
        self,
        db_url: str,
        extractor: Optional[MemoryExtractorProtocol] = None,
        similarity_threshold: float = 0.7,
    ):
        """
        Initialize the pipeline.

        Args:
            db_url: PostgreSQL connection URL
            extractor: Optional LLM-based memory extractor
            similarity_threshold: Threshold for finding similar memories
        """
        self.db_url = db_url
        self.extractor = extractor
        self.similarity_threshold = similarity_threshold
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

    async def process_session_completion(
        self,
        session_id: str,
        namespace: str = "pt2_agent",
    ) -> list[ConsolidationResult]:
        """
        Main entry point: Process a completed session for memory extraction.

        Args:
            session_id: The session to process
            namespace: User ID / namespace for memories

        Returns:
            List of consolidation results
        """
        logger.info(f"Processing session {session_id} for memory generation")

        # Load events
        events = await self.load_unprocessed_events(session_id)
        if not events:
            logger.info(f"No unprocessed events for session {session_id}")
            return []

        logger.info(f"Loaded {len(events)} events from session")

        # Extract candidate memories
        candidates = await self.extract_memories(events)
        logger.info(f"Extracted {len(candidates)} candidate memories")

        # Consolidate each candidate
        results = []
        for candidate in candidates:
            result = await self.consolidate_memory(candidate, namespace)
            results.append(result)
            logger.debug(f"Consolidation: {result.action} - {candidate.content[:50]}...")

        # Mark events as processed
        await self._mark_events_processed(session_id, [e["id"] for e in events])

        logger.info(
            f"Session {session_id} processed: "
            f"{sum(1 for r in results if r.action == 'created')} created, "
            f"{sum(1 for r in results if r.action == 'updated')} updated, "
            f"{sum(1 for r in results if r.action == 'skipped')} skipped"
        )

        return results

    async def load_unprocessed_events(self, session_id: str) -> list[dict]:
        """Load events that haven't been processed for memory extraction."""
        pool = await self._get_pool()

        query = """
            SELECT
                id, session_id, sequence, type, role, content, parts, created_at
            FROM context.session_events
            WHERE session_id = $1
              AND (parts->>'memory_processed')::boolean IS NOT TRUE
            ORDER BY sequence ASC
        """

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, session_id)

        return [
            {
                "id": str(row["id"]),
                "session_id": str(row["session_id"]),
                "sequence": row["sequence"],
                "type": row["type"],
                "role": row["role"],
                "content": row["content"],
                "parts": row["parts"] or {},
                "created_at": row["created_at"],
            }
            for row in rows
        ]

    async def extract_memories(self, events: list[dict]) -> list[CandidateMemory]:
        """
        Extract candidate memories from events.

        Uses pattern matching first, then LLM extraction if available.
        """
        candidates = []

        # Pattern-based extraction (always available)
        pattern_candidates = self._extract_by_patterns(events)
        candidates.extend(pattern_candidates)

        # LLM-based extraction (if extractor provided)
        if self.extractor:
            try:
                llm_candidates = await self.extractor.extract_memories(
                    events, self.MEMORY_CATEGORIES
                )
                candidates.extend(llm_candidates)
            except Exception as e:
                logger.warning(f"LLM extraction failed, using patterns only: {e}")

        # Deduplicate by content similarity
        candidates = self._deduplicate_candidates(candidates)

        return candidates

    def _extract_by_patterns(self, events: list[dict]) -> list[CandidateMemory]:
        """Extract memories using regex patterns."""
        candidates = []

        for event in events:
            content = event.get("content", "")
            event_type = event.get("type", "")
            role = event.get("role", "")

            # Only process user messages and assistant messages
            if role not in ("user", "assistant"):
                continue

            # Check each pattern category
            for category, patterns in self.EXTRACTION_PATTERNS.items():
                for pattern in patterns:
                    matches = re.findall(pattern, content, re.IGNORECASE)
                    for match in matches:
                        if isinstance(match, tuple):
                            match = " ".join(match)

                        # Skip very short matches
                        if len(match) < 10:
                            continue

                        # Determine memory category
                        mem_category = self._pattern_to_category(category)

                        candidate = CandidateMemory(
                            content=match.strip(),
                            category=mem_category,
                            source_type="pattern_match",
                            confidence=0.6,  # Pattern matches have moderate confidence
                            lineage=[event["id"]],
                            metadata={
                                "pattern_category": category,
                                "source_role": role,
                            },
                            importance=0.5,
                        )
                        candidates.append(candidate)

        return candidates

    def _pattern_to_category(self, pattern_category: str) -> str:
        """Map pattern category to memory category."""
        mapping = {
            "user_correction": "facts",
            "decision": "context",
            "anti_pattern": "rules",
            "architecture": "facts",
        }
        return mapping.get(pattern_category, "context")

    def _deduplicate_candidates(
        self, candidates: list[CandidateMemory]
    ) -> list[CandidateMemory]:
        """Remove duplicate candidates by content similarity."""
        if not candidates:
            return []

        unique = []
        seen_content = set()

        for candidate in candidates:
            # Normalize content for comparison
            normalized = candidate.content.lower().strip()

            # Skip if too similar to existing
            is_duplicate = False
            for seen in seen_content:
                if self._text_similarity(normalized, seen) > 0.8:
                    is_duplicate = True
                    break

            if not is_duplicate:
                unique.append(candidate)
                seen_content.add(normalized)

        return unique

    def _text_similarity(self, text1: str, text2: str) -> float:
        """Calculate simple text similarity (Jaccard on words)."""
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())

        if not words1 or not words2:
            return 0.0

        intersection = len(words1 & words2)
        union = len(words1 | words2)

        return intersection / union if union > 0 else 0.0

    async def consolidate_memory(
        self,
        candidate: CandidateMemory,
        namespace: str,
    ) -> ConsolidationResult:
        """
        Consolidate candidate with existing memories.

        Logic:
        - No similar memory found → CREATE new
        - Similar memory found with same meaning → UPDATE confidence
        - Similar memory found with different meaning → flag for review
        """
        # Find similar existing memories
        similar = await self.find_similar_memories(candidate, namespace)

        if not similar:
            # Create new memory
            memory_id = await self._create_memory(candidate, namespace)
            return ConsolidationResult(
                action="created",
                memory_id=memory_id,
                reason="No similar memories found",
            )

        # Check the most similar match
        best_match = similar[0]
        similarity_score = best_match["similarity"]

        if similarity_score > 0.9:
            # Very similar - update confidence (corroboration)
            new_confidence = min(1.0, best_match["confidence"] + 0.1)
            await self._update_memory_confidence(
                best_match["id"], new_confidence, candidate.lineage
            )
            return ConsolidationResult(
                action="updated",
                matched_memory_id=best_match["id"],
                confidence_delta=0.1,
                reason=f"Corroborated existing memory (similarity: {similarity_score:.2f})",
            )

        if similarity_score > self.similarity_threshold:
            # Moderately similar - might be update or contradiction
            # For now, skip and let human review
            return ConsolidationResult(
                action="skipped",
                matched_memory_id=best_match["id"],
                reason=f"Similar memory exists, needs review (similarity: {similarity_score:.2f})",
            )

        # Not similar enough - create new
        memory_id = await self._create_memory(candidate, namespace)
        return ConsolidationResult(
            action="created",
            memory_id=memory_id,
            reason=f"Below similarity threshold ({similarity_score:.2f})",
        )

    async def find_similar_memories(
        self,
        candidate: CandidateMemory,
        namespace: str,
        limit: int = 5,
    ) -> list[dict]:
        """Find similar existing memories using full-text search."""
        pool = await self._get_pool()

        # Use PostgreSQL full-text search for similarity
        query = """
            SELECT
                id,
                content,
                category,
                confidence,
                ts_rank(content_tsv, plainto_tsquery('english', $1)) as similarity
            FROM memori.memories
            WHERE user_id = $2
              AND content_tsv @@ plainto_tsquery('english', $1)
              AND (expires_at IS NULL OR expires_at > now())
            ORDER BY similarity DESC
            LIMIT $3
        """

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, candidate.content, namespace, limit)

        return [
            {
                "id": row["id"],
                "content": row["content"],
                "category": row["category"],
                "confidence": float(row["confidence"]) if row["confidence"] else 0.8,
                "similarity": float(row["similarity"]) if row["similarity"] else 0.0,
            }
            for row in rows
        ]

    async def _create_memory(
        self, candidate: CandidateMemory, namespace: str
    ) -> Optional[int]:
        """Create a new memory in the database."""
        pool = await self._get_pool()

        query = """
            INSERT INTO memori.memories (
                user_id, content, category, metadata,
                source_type, confidence, lineage
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        """

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                query,
                namespace,
                candidate.content,
                candidate.category,
                json.dumps(candidate.metadata),
                candidate.source_type,
                candidate.confidence,
                json.dumps(candidate.lineage),
            )

        return row["id"] if row else None

    async def _update_memory_confidence(
        self,
        memory_id: int,
        new_confidence: float,
        new_lineage: list[str],
    ):
        """Update memory confidence and lineage."""
        pool = await self._get_pool()

        query = """
            UPDATE memori.memories
            SET
                confidence = $2,
                lineage = lineage || $3::jsonb,
                last_used_at = now(),
                use_count = use_count + 1
            WHERE id = $1
        """

        async with pool.acquire() as conn:
            await conn.execute(query, memory_id, new_confidence, json.dumps(new_lineage))

    async def _mark_events_processed(self, session_id: str, event_ids: list[str]):
        """Mark events as processed for memory extraction."""
        if not event_ids:
            return

        pool = await self._get_pool()

        query = """
            UPDATE context.session_events
            SET parts = COALESCE(parts, '{}'::jsonb) || '{"memory_processed": true}'::jsonb
            WHERE session_id = $1 AND id = ANY($2::uuid[])
        """

        async with pool.acquire() as conn:
            await conn.execute(query, session_id, event_ids)


class PatternOnlyExtractor:
    """
    Simple extractor that uses only pattern matching.

    No LLM required - useful for testing and basic extraction.
    """

    async def extract_memories(
        self, events: list[dict], categories: list[str]
    ) -> list[CandidateMemory]:
        """Extract using patterns only (delegate to pipeline's pattern method)."""
        # This is handled by the pipeline's _extract_by_patterns method
        return []


@dataclass
class PipelineStats:
    """Statistics from pipeline execution."""
    sessions_processed: int = 0
    events_processed: int = 0
    memories_created: int = 0
    memories_updated: int = 0
    memories_skipped: int = 0
    errors: int = 0

    def add_results(self, results: list[ConsolidationResult]):
        """Add results from a session processing."""
        for result in results:
            if result.action == "created":
                self.memories_created += 1
            elif result.action == "updated":
                self.memories_updated += 1
            elif result.action == "skipped":
                self.memories_skipped += 1


async def run_pipeline_for_session(
    session_id: str,
    db_url: str,
    namespace: str = "pt2_agent",
) -> list[ConsolidationResult]:
    """
    Convenience function to run pipeline for a single session.

    Args:
        session_id: Session to process
        db_url: Database connection URL
        namespace: Memory namespace

    Returns:
        List of consolidation results
    """
    pipeline = MemoryGenerationPipeline(db_url)
    try:
        return await pipeline.process_session_completion(session_id, namespace)
    finally:
        await pipeline.close()
