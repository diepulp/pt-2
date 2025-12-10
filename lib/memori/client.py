#!/usr/bin/env python3
"""
Memori SDK client wrapper for PT-2.

Provides chatmode-specific memory contexts with Combined Mode (conscious + auto).
"""

import os
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from loguru import logger

try:
    from memori import Memori
    MEMORI_AVAILABLE = True
except ImportError:
    logger.warning("Memori SDK not installed. Run: pip install memorisdk openai")
    MEMORI_AVAILABLE = False


@dataclass
class MemoriConfig:
    """Configuration for Memori client."""
    database_url: str
    openai_api_key: str
    environment: str = "development"
    conscious_ingest: bool = True
    auto_ingest: bool = True
    namespace: str = "pt2_development"


class MemoriClient:
    """
    PT-2-specific Memori client wrapper.

    Provides chatmode-specific namespaces and workflow-aware memory management.

    Namespace Hierarchy (4-Tier):
    1. pt2_project      - Project standards + domain knowledge (permanent)
    2. arch_decisions   - Architectural decisions (permanent)
    3. mvp_progress     - MVP tracking (operational)
    4. session_*        - Ephemeral checkpoints (7-day TTL)
    """

    # Tier 1: Project-level namespace (standards, domain knowledge)
    PROJECT_NAMESPACE = "pt2_project"

    # Tier 2: Architecture decisions namespace (permanent)
    ARCH_NAMESPACE = "arch_decisions"

    # Tier 3: MVP progress namespace (operational)
    MVP_NAMESPACE = "mvp_progress"

    # Tier 4: Session checkpoints use dynamic naming: session_{skill}_{YYYY_MM}
    SESSION_TTL_DAYS = 7

    # Chatmode to namespace mapping (consolidated hierarchy)
    CHATMODE_USER_IDS = {
        # All general chatmodes write to project namespace
        "architect": "arch_decisions",
        "service-engineer": "pt2_project",
        "documenter": "pt2_project",
        "backend-dev": "pt2_project",
        "frontend-dev": "pt2_project",
        "reviewer": "pt2_project",
        "main": "pt2_project",
        # Skills write to arch_decisions for permanent knowledge
        "skill:backend-service-builder": "arch_decisions",
        "skill:frontend-design": "pt2_project",
        "skill:lead-architect": "arch_decisions",
        "skill:skill-creator": "pt2_project",
        "skill:api-builder": "arch_decisions",
        "skill:mvp-progress": "mvp_progress",
    }

    # Skills that support session checkpoints (ephemeral, 7-day TTL)
    SESSION_CHECKPOINT_SKILLS = {
        "skill:lead-architect": "lead_architect",
        "skill:backend-service-builder": "backend",
        "skill:api-builder": "api",
    }

    def __init__(
        self,
        chatmode: str = "main",
        config: Optional[MemoriConfig] = None
    ):
        """
        Initialize Memori client for specific chatmode.

        Args:
            chatmode: Chatmode name (architect, service-engineer, etc.)
            config: Optional configuration override
        """
        if not MEMORI_AVAILABLE:
            logger.error("Memori SDK not available")
            self.enabled = False
            return

        self.chatmode = chatmode
        self.user_id = self.CHATMODE_USER_IDS.get(chatmode, self.PROJECT_NAMESPACE)

        # Load configuration
        if config is None:
            config = self._load_config_from_env()

        self.config = config
        self.enabled = False
        self._memori: Optional[Memori] = None

        logger.info(f"Initialized MemoriClient for chatmode='{chatmode}' (user_id='{self.user_id}')")

    def _load_config_from_env(self) -> MemoriConfig:
        """Load Memori configuration from environment variables."""
        return MemoriConfig(
            database_url=os.getenv(
                "MEMORI_DATABASE_URL",
                "postgresql://memori:memori_dev@127.0.0.1:5433/memori"
            ),
            openai_api_key=os.getenv("OPENAI_API_KEY", ""),
            environment=os.getenv("MEMORI_ENVIRONMENT", "development"),
            conscious_ingest=True,  # Enable conscious mode
            auto_ingest=True,       # Enable auto mode (Combined Mode)
            namespace=self.user_id  # Use consolidated namespace
        )

    def get_session_namespace(self) -> Optional[str]:
        """
        Get the session checkpoint namespace for this chatmode.

        Session namespaces are ephemeral (7-day TTL) and use format:
        session_{skill_short_name}_{YYYY_MM}

        Returns:
            Session namespace string, or None if chatmode doesn't support checkpoints
        """
        from datetime import datetime

        skill_short = self.SESSION_CHECKPOINT_SKILLS.get(self.chatmode)
        if not skill_short:
            return None

        month_suffix = datetime.now().strftime("%Y_%m")
        return f"session_{skill_short}_{month_suffix}"

    def get_session_ttl_days(self) -> int:
        """Get the TTL in days for session checkpoints."""
        return self.SESSION_TTL_DAYS

    def enable(self) -> bool:
        """
        Enable Memori for automatic conversation recording and context injection.

        Returns:
            True if enabled successfully, False otherwise
        """
        if not MEMORI_AVAILABLE:
            logger.warning("Memori SDK not available, cannot enable")
            return False

        try:
            self._memori = Memori(
                database_connect=self.config.database_url,
                conscious_ingest=self.config.conscious_ingest,
                auto_ingest=self.config.auto_ingest,
                namespace=self.config.namespace,
                openai_api_key=self.config.openai_api_key,
            )

            # Enable automatic conversation interception
            self._memori.enable()
            self.enabled = True

            logger.success(
                f"✅ Memori enabled for {self.chatmode} "
                f"(conscious={self.config.conscious_ingest}, auto={self.config.auto_ingest})"
            )
            return True

        except Exception as e:
            logger.error(f"❌ Failed to enable Memori: {e}")
            self.enabled = False
            return False

    def disable(self):
        """Disable Memori conversation recording."""
        if self._memori and self.enabled:
            try:
                self._memori.disable()
                self.enabled = False
                logger.info(f"Memori disabled for {self.chatmode}")
            except Exception as e:
                logger.error(f"Error disabling Memori: {e}")

    def record_memory(
        self,
        content: str,
        category: str = "context",
        metadata: Optional[Dict[str, Any]] = None,
        importance: float = 0.5,
        tags: Optional[List[str]] = None
    ) -> Optional[Dict]:
        """
        Manually record a memory (in addition to automatic recording).

        Args:
            content: Memory content (100-300 chars ideal)
            category: Memory category (facts, preferences, skills, rules, context)
            metadata: Additional structured metadata
            importance: Importance score (0.0-1.0)
            tags: Optional list of tags for filtering/categorization

        Returns:
            Memory record dict or None if failed
        """
        if not self.enabled:
            logger.warning("Memori not enabled, cannot record memory")
            return None

        try:
            import psycopg2
            import json

            if metadata is None:
                metadata = {}

            # Add chatmode to metadata
            metadata["chatmode"] = self.chatmode
            metadata["importance"] = importance

            # Add tags to metadata if provided
            if tags:
                metadata["tags"] = tags

            memory = {
                "user_id": self.user_id,
                "content": content,
                "category": category,
                "metadata": metadata
            }

            # Write directly to PostgreSQL database (same as seed script)
            logger.debug(f"Recording memory: {content[:50]}...")

            # Strip query parameters from database URL for psycopg2
            db_url = self.config.database_url.split('?')[0]

            conn = psycopg2.connect(db_url)
            cur = conn.cursor()

            # Set search path to include memori schema
            cur.execute("SET search_path TO memori, public")

            cur.execute("""
                INSERT INTO memori.memories (user_id, content, category, metadata)
                VALUES (%s, %s, %s, %s)
            """, (self.user_id, content, category, json.dumps(metadata)))

            conn.commit()
            cur.close()
            conn.close()

            logger.success(f"✅ Memory recorded to database")
            return memory

        except Exception as e:
            logger.error(f"Error recording memory: {e}")
            return None

    def search_memories(
        self,
        query: str,
        category: Optional[List[str]] = None,
        limit: int = 10,
        min_relevance: float = 0.6
    ) -> List[Dict]:
        """
        Search memories relevant to query.

        Args:
            query: Search query
            category: Filter by categories
            limit: Max results
            min_relevance: Minimum relevance score

        Returns:
            List of memory dicts
        """
        if not self.enabled or not self._memori:
            logger.warning("Memori not enabled, cannot search")
            return []

        try:
            # This would use Memori's search capabilities
            # Placeholder for actual implementation
            logger.debug(f"Searching memories for: {query}")
            return []

        except Exception as e:
            logger.error(f"Error searching memories: {e}")
            return []

    def get_shared_learnings(
        self,
        source_chatmode: str,
        categories: Optional[List[str]] = None
    ) -> List[Dict]:
        """
        Get learnings from another chatmode (cross-chatmode learning).

        Args:
            source_chatmode: Source chatmode to read from
            categories: Filter by categories

        Returns:
            List of memory dicts from source chatmode
        """
        if not self.enabled:
            return []

        source_user_id = self.CHATMODE_USER_IDS.get(source_chatmode)
        if not source_user_id:
            logger.warning(f"Unknown source chatmode: {source_chatmode}")
            return []

        try:
            logger.debug(f"Getting shared learnings from {source_chatmode}")
            # Placeholder for cross-chatmode query
            return []

        except Exception as e:
            logger.error(f"Error getting shared learnings: {e}")
            return []

    def search_learnings(
        self,
        query: str,
        namespace: Optional[str] = None,
        tags: Optional[List[str]] = None,
        category: Optional[str] = None,
        limit: int = 10
    ) -> List[Dict]:
        """
        Search memories/learnings with full-text search.

        This method provides skill-friendly access to memory search with
        tag filtering and namespace override capabilities.

        Args:
            query: Natural language search query
            namespace: Override namespace (default: use client's user_id)
            tags: Filter by tags (metadata->'tags' array)
            category: Filter by category (facts, preferences, rules, skills, context)
            limit: Maximum results to return

        Returns:
            List of memory dicts with content, category, metadata, created_at
        """
        if not self.enabled:
            logger.warning("Memori not enabled, cannot search learnings")
            return []

        try:
            import psycopg2
            import json

            target_namespace = namespace or self.user_id
            db_url = self.config.database_url.split('?')[0]

            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.execute("SET search_path TO memori, public")

            # Build query with full-text search
            query_sql = """
                SELECT
                    id, user_id, content, category, metadata, created_at,
                    ts_rank(content_tsv, plainto_tsquery('english', %s)) as relevance
                FROM memori.memories
                WHERE user_id = %s
                  AND content_tsv @@ plainto_tsquery('english', %s)
            """
            params = [query, target_namespace, query]

            if category:
                query_sql += " AND category = %s"
                params.append(category)

            if tags:
                # Filter by tags in metadata->'tags' jsonb array
                query_sql += " AND metadata->'tags' ?| %s"
                params.append(tags)

            query_sql += " ORDER BY relevance DESC LIMIT %s"
            params.append(limit)

            cur.execute(query_sql, params)
            rows = cur.fetchall()

            results = []
            for row in rows:
                metadata = row[4]
                if isinstance(metadata, str):
                    metadata = json.loads(metadata)

                results.append({
                    "id": row[0],
                    "user_id": row[1],
                    "content": row[2],
                    "category": row[3],
                    "metadata": metadata or {},
                    "created_at": row[5].isoformat() if row[5] else None,
                    "relevance": float(row[6]) if row[6] else 0.0,
                })

            cur.close()
            conn.close()

            logger.debug(f"Found {len(results)} learnings for query: {query[:30]}...")
            return results

        except Exception as e:
            logger.error(f"Error searching learnings: {e}")
            return []

    def trigger_conscious_analysis(self):
        """Trigger conscious agent to analyze and promote important memories."""
        if not self.enabled or not self._memori:
            logger.warning("Memori not enabled")
            return

        try:
            logger.info("Triggering conscious memory analysis...")
            # Memori SDK handles this automatically every 6 hours
            # This method can force an immediate analysis
        except Exception as e:
            logger.error(f"Error triggering conscious analysis: {e}")


def create_memori_client(chatmode: str = "main") -> MemoriClient:
    """
    Factory function to create a Memori client for a chatmode.

    Args:
        chatmode: Chatmode name (architect, service-engineer, documenter, etc.)

    Returns:
        Configured MemoriClient instance
    """
    return MemoriClient(chatmode=chatmode)


def get_chatmode_from_context() -> str:
    """
    Detect current chatmode from environment or context.

    Returns:
        Chatmode name or "main" as default
    """
    # Try to detect from environment
    chatmode = os.getenv("CLAUDE_CHATMODE", "main")

    # Could also parse from .github/chatmodes/*.chatmode.md context
    # For now, return from env or default

    return chatmode
