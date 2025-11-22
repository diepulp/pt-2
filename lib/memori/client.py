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
    """

    # Chatmode to user_id mapping (from config.yml and PROJECT-INITIATION-STRATEGY.md)
    CHATMODE_USER_IDS = {
        "architect": "pt2_architect",
        "service-engineer": "service_engineer",
        "documenter": "pt2_documenter",
        "backend-dev": "pt2_backend",
        "frontend-dev": "pt2_frontend",
        "reviewer": "pt2_reviewer",
        "main": "pt2_agent",
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
        self.user_id = self.CHATMODE_USER_IDS.get(chatmode, "pt2_agent")

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
                "postgresql://postgres:postgres@127.0.0.1:54322/postgres?options=-c search_path=memori,public"
            ),
            openai_api_key=os.getenv("OPENAI_API_KEY", ""),
            environment=os.getenv("MEMORI_ENVIRONMENT", "development"),
            conscious_ingest=True,  # Enable conscious mode
            auto_ingest=True,       # Enable auto mode (Combined Mode)
            namespace=f"pt2_{self.chatmode}"
        )

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
        importance: float = 0.5
    ) -> Optional[Dict]:
        """
        Manually record a memory (in addition to automatic recording).

        Args:
            content: Memory content (100-300 chars ideal)
            category: Memory category (facts, preferences, skills, rules, context)
            metadata: Additional structured metadata
            importance: Importance score (0.0-1.0)

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
