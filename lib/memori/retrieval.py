"""
Memory Retrieval Service for Context Management Layer.

PostgreSQL-native retrieval using full-text search (content_tsv)
with composite scoring: relevance + recency + importance.

Reference: docs/context-engineering/CONTEXT_MANAGEMENT_EVOLUTION_PROPOSAL.md
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from loguru import logger

try:
    import asyncpg
    ASYNCPG_AVAILABLE = True
except ImportError:
    logger.warning("asyncpg not installed. Run: pip install asyncpg")
    ASYNCPG_AVAILABLE = False


@dataclass
class RetrievalConfig:
    """Configuration for memory retrieval scoring."""
    relevance_weight: float = 0.4
    recency_weight: float = 0.3
    importance_weight: float = 0.3
    min_relevance: float = 0.1
    default_limit: int = 10
    recency_decay_days: int = 30  # Days until recency score reaches 0


@dataclass
class RetrievedMemory:
    """A memory retrieved with scoring metadata."""
    id: int
    user_id: str
    content: str
    category: Optional[str]
    metadata: dict
    created_at: datetime
    source_type: Optional[str]
    confidence: float
    use_count: int
    # Scoring components
    text_relevance: float
    recency_score: float
    importance_score: float
    final_score: float


class MemoryRetriever:
    """
    PostgreSQL-native memory retrieval without vector embeddings.

    Uses content_tsv (tsvector) column with GIN index for full-text search.
    Applies composite scoring: relevance * 0.4 + recency * 0.3 + importance * 0.3
    """

    # Core retrieval query with composite scoring
    RETRIEVAL_QUERY = """
        WITH scored_memories AS (
            SELECT
                id,
                user_id,
                content,
                category,
                metadata,
                created_at,
                source_type,
                COALESCE(confidence, 0.80) as confidence,
                COALESCE(use_count, 0) as use_count,
                -- Text relevance score (full-text match quality)
                COALESCE(ts_rank(content_tsv, plainto_tsquery('english', $1)), 0) AS text_relevance,
                -- Recency score (0-1, decays over configured days)
                GREATEST(0, 1.0 - EXTRACT(EPOCH FROM (now() - created_at)) / ($6 * 86400)) AS recency_score,
                -- Importance from metadata (default 0.5)
                COALESCE((metadata->>'importance')::float, 0.5) AS importance_score
            FROM memori.memories
            WHERE
                -- Namespace filter
                user_id = $2
                -- Category filter (optional)
                AND ($3::text IS NULL OR category = $3)
                -- Full-text search (only if query provided)
                AND ($1::text IS NULL OR content_tsv @@ plainto_tsquery('english', $1))
                -- Exclude expired memories
                AND (expires_at IS NULL OR expires_at > now())
        )
        SELECT
            id, user_id, content, category, metadata, created_at,
            source_type, confidence, use_count,
            text_relevance, recency_score, importance_score,
            -- Composite final score with configurable weights
            (text_relevance * $4 + recency_score * $5 + importance_score * $7) AS final_score
        FROM scored_memories
        WHERE
            -- Minimum relevance threshold (only for text search)
            ($1::text IS NULL OR text_relevance >= $8)
        ORDER BY final_score DESC
        LIMIT $9;
    """

    # Query for tag-based retrieval
    TAG_QUERY = """
        SELECT
            id, user_id, content, category, metadata, created_at,
            source_type, COALESCE(confidence, 0.80) as confidence,
            COALESCE(use_count, 0) as use_count
        FROM memori.memories
        WHERE user_id = $1
          AND metadata->'tags' ?| $2
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY
            COALESCE((metadata->>'importance')::float, 0.5) DESC,
            created_at DESC
        LIMIT $3
    """

    # Query for recent memories
    RECENT_QUERY = """
        SELECT
            id, user_id, content, category, metadata, created_at,
            source_type, COALESCE(confidence, 0.80) as confidence,
            COALESCE(use_count, 0) as use_count
        FROM memori.memories
        WHERE user_id = $1
          AND created_at > now() - ($2 || ' hours')::interval
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY created_at DESC
        LIMIT $3
    """

    # Query for high-importance memories (no text search)
    HIGH_IMPORTANCE_QUERY = """
        SELECT
            id, user_id, content, category, metadata, created_at,
            source_type, COALESCE(confidence, 0.80) as confidence,
            COALESCE(use_count, 0) as use_count,
            0.0 AS text_relevance,
            GREATEST(0, 1.0 - EXTRACT(EPOCH FROM (now() - created_at)) / ($3 * 86400)) AS recency_score,
            COALESCE((metadata->>'importance')::float, 0.5) AS importance_score
        FROM memori.memories
        WHERE user_id = $1
          AND ($2::text IS NULL OR category = $2)
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY
            COALESCE((metadata->>'importance')::float, 0.5) DESC,
            created_at DESC
        LIMIT $4
    """

    # Update usage tracking
    UPDATE_USAGE_QUERY = """
        UPDATE memori.memories
        SET
            last_used_at = now(),
            use_count = COALESCE(use_count, 0) + 1
        WHERE id = ANY($1)
    """

    def __init__(
        self,
        db_pool: "asyncpg.Pool",
        config: Optional[RetrievalConfig] = None
    ):
        """
        Initialize MemoryRetriever.

        Args:
            db_pool: asyncpg connection pool
            config: Optional retrieval configuration
        """
        self.db = db_pool
        self.config = config or RetrievalConfig()

    async def retrieve(
        self,
        namespace: str,
        query: Optional[str] = None,
        category: Optional[str] = None,
        limit: Optional[int] = None,
        min_relevance: Optional[float] = None,
        track_usage: bool = True,
    ) -> list[RetrievedMemory]:
        """
        Retrieve memories using composite scoring.

        Args:
            namespace: Agent/chatmode namespace (user_id)
            query: Natural language search query (optional)
            category: Filter by category (facts, preferences, rules, skills, context)
            limit: Maximum memories to return
            min_relevance: Minimum text relevance score (0-1)
            track_usage: Whether to update use_count and last_used_at

        Returns:
            List of RetrievedMemory sorted by composite score
        """
        limit = limit or self.config.default_limit
        min_relevance = min_relevance or self.config.min_relevance

        rows = await self.db.fetch(
            self.RETRIEVAL_QUERY,
            query,  # $1
            namespace,  # $2
            category,  # $3
            self.config.relevance_weight,  # $4
            self.config.recency_weight,  # $5
            self.config.recency_decay_days,  # $6
            self.config.importance_weight,  # $7
            min_relevance,  # $8
            limit,  # $9
        )

        memories = [self._row_to_memory(row) for row in rows]

        # Track usage
        if track_usage and memories:
            await self._update_usage([m.id for m in memories])

        logger.debug(
            f"Retrieved {len(memories)} memories for namespace={namespace}, "
            f"query={query[:30] if query else None}"
        )

        return memories

    async def retrieve_high_importance(
        self,
        namespace: str,
        category: Optional[str] = None,
        limit: int = 5,
        track_usage: bool = True,
    ) -> list[RetrievedMemory]:
        """
        Retrieve high-importance memories regardless of query match.

        Useful for injecting critical context at turn start.

        Args:
            namespace: Agent/chatmode namespace
            category: Optional category filter
            limit: Maximum memories to return
            track_usage: Whether to update usage tracking

        Returns:
            List of memories sorted by importance
        """
        rows = await self.db.fetch(
            self.HIGH_IMPORTANCE_QUERY,
            namespace,  # $1
            category,  # $2
            self.config.recency_decay_days,  # $3
            limit,  # $4
        )

        memories = [self._row_to_memory(row, default_final_score=True) for row in rows]

        if track_usage and memories:
            await self._update_usage([m.id for m in memories])

        return memories

    async def retrieve_by_tags(
        self,
        namespace: str,
        tags: list[str],
        limit: int = 10,
    ) -> list[dict]:
        """
        Retrieve memories matching specific tags.

        Args:
            namespace: Agent/chatmode namespace
            tags: List of tags to match (OR logic)
            limit: Maximum memories to return

        Returns:
            List of memory dicts
        """
        rows = await self.db.fetch(
            self.TAG_QUERY,
            namespace,
            tags,
            limit,
        )

        return [dict(row) for row in rows]

    async def retrieve_recent(
        self,
        namespace: str,
        hours: int = 24,
        limit: int = 10,
    ) -> list[dict]:
        """
        Retrieve most recent memories within time window.

        Args:
            namespace: Agent/chatmode namespace
            hours: Time window in hours
            limit: Maximum memories to return

        Returns:
            List of memory dicts
        """
        rows = await self.db.fetch(
            self.RECENT_QUERY,
            namespace,
            str(hours),
            limit,
        )

        return [dict(row) for row in rows]

    async def search(
        self,
        query: str,
        namespaces: Optional[list[str]] = None,
        categories: Optional[list[str]] = None,
        limit: int = 10,
    ) -> list[RetrievedMemory]:
        """
        Search across multiple namespaces and categories.

        Args:
            query: Search query
            namespaces: List of namespaces to search (None = all)
            categories: List of categories to filter
            limit: Maximum memories to return

        Returns:
            List of RetrievedMemory sorted by score
        """
        # Build dynamic query for multi-namespace search
        query_sql = """
            WITH scored_memories AS (
                SELECT
                    id, user_id, content, category, metadata, created_at,
                    source_type, COALESCE(confidence, 0.80) as confidence,
                    COALESCE(use_count, 0) as use_count,
                    COALESCE(ts_rank(content_tsv, plainto_tsquery('english', $1)), 0) AS text_relevance,
                    GREATEST(0, 1.0 - EXTRACT(EPOCH FROM (now() - created_at)) / ($2 * 86400)) AS recency_score,
                    COALESCE((metadata->>'importance')::float, 0.5) AS importance_score
                FROM memori.memories
                WHERE
                    content_tsv @@ plainto_tsquery('english', $1)
                    AND (expires_at IS NULL OR expires_at > now())
        """

        params = [query, self.config.recency_decay_days]
        param_idx = 3

        if namespaces:
            query_sql += f" AND user_id = ANY(${param_idx})"
            params.append(namespaces)
            param_idx += 1

        if categories:
            query_sql += f" AND category = ANY(${param_idx})"
            params.append(categories)
            param_idx += 1

        query_sql += f"""
            )
            SELECT
                id, user_id, content, category, metadata, created_at,
                source_type, confidence, use_count,
                text_relevance, recency_score, importance_score,
                (text_relevance * {self.config.relevance_weight} +
                 recency_score * {self.config.recency_weight} +
                 importance_score * {self.config.importance_weight}) AS final_score
            FROM scored_memories
            WHERE text_relevance >= {self.config.min_relevance}
            ORDER BY final_score DESC
            LIMIT ${param_idx}
        """
        params.append(limit)

        rows = await self.db.fetch(query_sql, *params)
        return [self._row_to_memory(row) for row in rows]

    async def _update_usage(self, memory_ids: list[int]) -> None:
        """Update use_count and last_used_at for retrieved memories."""
        try:
            await self.db.execute(self.UPDATE_USAGE_QUERY, memory_ids)
        except Exception as e:
            logger.warning(f"Failed to update memory usage: {e}")

    def _row_to_memory(
        self,
        row,
        default_final_score: bool = False
    ) -> RetrievedMemory:
        """Convert database row to RetrievedMemory."""
        metadata = row["metadata"]
        if isinstance(metadata, str):
            import json
            metadata = json.loads(metadata)

        # Handle rows without scoring columns
        text_relevance = row.get("text_relevance", 0.0)
        recency_score = row.get("recency_score", 0.0)
        importance_score = row.get("importance_score", 0.5)

        if default_final_score:
            # Calculate final score for high-importance queries
            final_score = (
                recency_score * self.config.recency_weight +
                importance_score * self.config.importance_weight
            )
        else:
            final_score = row.get("final_score", 0.0)

        return RetrievedMemory(
            id=row["id"],
            user_id=row["user_id"],
            content=row["content"],
            category=row.get("category"),
            metadata=metadata or {},
            created_at=row["created_at"],
            source_type=row.get("source_type"),
            confidence=row.get("confidence", 0.80),
            use_count=row.get("use_count", 0),
            text_relevance=text_relevance,
            recency_score=recency_score,
            importance_score=importance_score,
            final_score=final_score,
        )


async def create_memory_retriever(
    database_url: str = "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    config: Optional[RetrievalConfig] = None,
) -> MemoryRetriever:
    """
    Factory function to create a MemoryRetriever with connection pool.

    Args:
        database_url: PostgreSQL connection string
        config: Optional retrieval configuration

    Returns:
        Configured MemoryRetriever instance
    """
    if not ASYNCPG_AVAILABLE:
        raise ImportError("asyncpg is required. Run: pip install asyncpg")

    pool = await asyncpg.create_pool(dsn=database_url, min_size=2, max_size=10)
    return MemoryRetriever(pool, config)
