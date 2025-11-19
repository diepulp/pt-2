#!/usr/bin/env python3
"""
Reset Memori to correct architecture and seed with agent context.

This script:
1. Cleans out incorrect doc-storage memories
2. Seeds essential agent context
3. Sets up doc reference metadata
4. Initializes session memory for agentic workflows

Usage:
    python scripts/memori-reset-and-seed.py
"""

import os
import sys
from pathlib import Path
import psycopg2
import json
from datetime import datetime

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from loguru import logger

# Database configuration
DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 54322,
    "database": "postgres",
    "user": "postgres",
    "password": "postgres"
}


class MemoriReset:
    """Reset and seed Memori for correct agentic workflow usage."""

    def __init__(self):
        self.conn = None

    def connect(self):
        """Connect to database."""
        if not self.conn or self.conn.closed:
            self.conn = psycopg2.connect(**DB_CONFIG)
            logger.info("Connected to database")

    def cleanup_doc_storage(self):
        """Remove incorrect whole-document storage."""
        logger.info("Cleaning up incorrect document storage...")

        self.connect()
        cur = self.conn.cursor()

        # Backup before deletion
        cur.execute("""
            CREATE TABLE IF NOT EXISTS memori.memories_backup_20251118 AS
            SELECT * FROM memori.memories;
        """)

        # Remove oversized memories (whole docs)
        cur.execute("""
            DELETE FROM memori.memories
            WHERE LENGTH(content) > 5000;
        """)

        deleted_count = cur.rowcount
        logger.success(f"✅ Removed {deleted_count} whole-document memories")

        # Keep only genuine agent learnings (if any exist)
        cur.execute("SELECT COUNT(*) FROM memori.memories")
        remaining = cur.fetchone()[0]
        logger.info(f"Remaining memories: {remaining}")

        self.conn.commit()
        cur.close()

    def seed_project_context(self):
        """Seed essential project context for agent."""
        logger.info("Seeding project context...")

        self.connect()
        cur = self.conn.cursor()

        # Project overview
        contexts = [
            {
                "user_id": "pt2_agent",
                "content": "PT-2 is a casino management system with bounded context architecture using 10 services",
                "category": "context",
                "metadata": {
                    "relevant_docs": [
                        "docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md",
                        "docs/00-vision/VIS-001-VISION-AND-SCOPE.md"
                    ],
                    "importance": 1.0,
                    "type": "project_overview"
                }
            },
            {
                "user_id": "pt2_agent",
                "content": "10 bounded contexts: CasinoService (foundational), PlayerService (identity), VisitService (session), RatingSlipService (telemetry), LoyaltyService (rewards), PlayerFinancialService (finance), MTLService (compliance), TableContextService (operations), FloorLayoutService (design), PerformanceService (observability)",
                "category": "facts",
                "metadata": {
                    "relevant_docs": ["memory/service-catalog.memory.md"],
                    "importance": 0.95,
                    "type": "service_catalog"
                }
            }
        ]

        for ctx in contexts:
            cur.execute("""
                INSERT INTO memori.memories (user_id, content, category, metadata)
                VALUES (%s, %s, %s, %s)
            """, (ctx["user_id"], ctx["content"], ctx["category"], json.dumps(ctx["metadata"])))

        self.conn.commit()
        cur.close()
        logger.success(f"✅ Seeded {len(contexts)} project context memories")

    def seed_architecture_preferences(self):
        """Seed architectural patterns and preferences."""
        logger.info("Seeding architecture preferences...")

        self.connect()
        cur = self.conn.cursor()

        preferences = [
            {
                "user_id": "pt2_agent",
                "content": "Use functional factories, not classes for service layer",
                "category": "preferences",
                "metadata": {
                    "relevant_docs": [
                        "docs/patterns/SERVICE_TEMPLATE.md",
                        ".claude/CLAUDE.md"
                    ],
                    "importance": 0.9,
                    "type": "architecture_pattern"
                }
            },
            {
                "user_id": "pt2_agent",
                "content": "Always use explicit interfaces, ban ReturnType inference",
                "category": "rules",
                "metadata": {
                    "relevant_docs": [".claude/CLAUDE.md"],
                    "importance": 0.95,
                    "type": "code_standard"
                }
            },
            {
                "user_id": "pt2_agent",
                "content": "Type Supabase parameter as SupabaseClient<Database>, never any",
                "category": "rules",
                "metadata": {
                    "relevant_docs": [".claude/CLAUDE.md"],
                    "importance": 0.9,
                    "type": "type_safety"
                }
            },
            {
                "user_id": "pt2_agent",
                "content": "Run npm run db:types after every migration",
                "category": "rules",
                "metadata": {
                    "relevant_docs": [".claude/CLAUDE.md"],
                    "importance": 1.0,
                    "type": "workflow"
                }
            },
            {
                "user_id": "pt2_agent",
                "content": "All migration files MUST follow YYYYMMDDHHMMSS_description.sql timestamp pattern",
                "category": "rules",
                "metadata": {
                    "relevant_docs": [".claude/CLAUDE.md"],
                    "importance": 0.95,
                    "type": "migration_standard"
                }
            },
            {
                "user_id": "pt2_agent",
                "content": "Use snake_case for tables/columns, uuid for all PKs/FKs",
                "category": "preferences",
                "metadata": {
                    "relevant_docs": ["docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md"],
                    "importance": 0.9,
                    "type": "naming_convention"
                }
            }
        ]

        for pref in preferences:
            cur.execute("""
                INSERT INTO memori.memories (user_id, content, category, metadata)
                VALUES (%s, %s, %s, %s)
            """, (pref["user_id"], pref["content"], pref["category"], json.dumps(pref["metadata"])))

        self.conn.commit()
        cur.close()
        logger.success(f"✅ Seeded {len(preferences)} architecture preferences")

    def seed_service_context_references(self):
        """Seed service-specific context with doc references."""
        logger.info("Seeding service context references...")

        self.connect()
        cur = self.conn.cursor()

        # Service contexts with doc pointers (NOT full content)
        services = [
            {
                "user_id": "mtl_agent",
                "content": "MTLService handles compliance: cash transaction log, AML/CTR detection",
                "category": "skills",
                "metadata": {
                    "relevant_docs": [
                        "docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#mtl-service",
                        "docs/30-security/SEC-002-casino-scoped-security-model.md"
                    ],
                    "service": "mtl_service",
                    "tables": ["mtl_entry", "mtl_audit_note"],
                    "importance": 0.9
                }
            },
            {
                "user_id": "mtl_agent",
                "content": "CTR threshold is $10,000, watchlist floor is $3,000, stored in casino_settings",
                "category": "facts",
                "metadata": {
                    "relevant_docs": ["docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md"],
                    "service": "mtl_service",
                    "entities": ["ctr_threshold", "watchlist_floor", "casino_settings"],
                    "importance": 1.0
                }
            },
            {
                "user_id": "player_agent",
                "content": "PlayerService handles identity management: player profile and documents",
                "category": "skills",
                "metadata": {
                    "relevant_docs": [
                        "docs/10-prd/PRD-001_Player_Management_System_Requirements.md",
                        "docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#player-service"
                    ],
                    "service": "player_service",
                    "importance": 0.9
                }
            }
        ]

        for svc in services:
            cur.execute("""
                INSERT INTO memori.memories (user_id, content, category, metadata)
                VALUES (%s, %s, %s, %s)
            """, (svc["user_id"], svc["content"], svc["category"], json.dumps(svc["metadata"])))

        self.conn.commit()
        cur.close()
        logger.success(f"✅ Seeded {len(services)} service context references")

    def create_session_summary(self):
        """Create initial session summary."""
        logger.info("Creating initial session summary...")

        self.connect()
        cur = self.conn.cursor()

        summary = {
            "user_id": "pt2_agent",
            "content": f"Memori reset to correct architecture on {datetime.now().strftime('%Y-%m-%d')}: Using session memory for agent learnings, file system for documentation",
            "category": "context",
            "metadata": {
                "type": "system_event",
                "importance": 0.8,
                "timestamp": datetime.now().isoformat()
            }
        }

        cur.execute("""
            INSERT INTO memori.memories (user_id, content, category, metadata)
            VALUES (%s, %s, %s, %s)
        """, (summary["user_id"], summary["content"], summary["category"], json.dumps(summary["metadata"])))

        self.conn.commit()
        cur.close()
        logger.success("✅ Created session summary")

    def verify_state(self):
        """Verify final state."""
        logger.info("Verifying Memori state...")

        self.connect()
        cur = self.conn.cursor()

        # Check memory counts by category
        cur.execute("""
            SELECT category, COUNT(*) as count
            FROM memori.memories
            GROUP BY category
            ORDER BY category;
        """)

        results = cur.fetchall()
        logger.info("Memory distribution:")
        for category, count in results:
            logger.info(f"  {category}: {count}")

        # Check total size
        cur.execute("""
            SELECT AVG(LENGTH(content)) as avg_size, MAX(LENGTH(content)) as max_size
            FROM memori.memories;
        """)

        avg_size, max_size = cur.fetchone()
        logger.info(f"  Avg memory size: {int(avg_size)} chars")
        logger.info(f"  Max memory size: {int(max_size)} chars")

        # Verify no oversized memories remain
        cur.execute("SELECT COUNT(*) FROM memori.memories WHERE LENGTH(content) > 5000")
        oversized = cur.fetchone()[0]

        if oversized > 0:
            logger.warning(f"⚠️  {oversized} oversized memories still present")
        else:
            logger.success("✅ No oversized memories found")

        cur.close()

    def cleanup(self):
        """Close connections."""
        if self.conn and not self.conn.closed:
            self.conn.close()
            logger.info("Disconnected from database")


def main():
    """Main entry point."""
    logger.info("=" * 80)
    logger.info("Memori Reset & Seed for Correct Agentic Architecture")
    logger.info("=" * 80)

    reset = MemoriReset()

    try:
        # Step 1: Clean up incorrect doc storage
        reset.cleanup_doc_storage()

        # Step 2: Seed project context
        reset.seed_project_context()

        # Step 3: Seed architecture preferences
        reset.seed_architecture_preferences()

        # Step 4: Seed service references
        reset.seed_service_context_references()

        # Step 5: Create session summary
        reset.create_session_summary()

        # Step 6: Verify state
        reset.verify_state()

        logger.info("")
        logger.info("=" * 80)
        logger.success("✅ Memori reset and seeded successfully!")
        logger.info("=" * 80)
        logger.info("")
        logger.info("Next steps:")
        logger.info("1. Enable Memori in Claude Code sessions")
        logger.info("2. Let agent record learnings naturally via conversations")
        logger.info("3. Agent will fetch docs from file system as needed")
        logger.info("4. Session memory provides cross-session continuity")

    except Exception as e:
        logger.error(f"❌ Reset failed: {e}")
        raise
    finally:
        reset.cleanup()


if __name__ == "__main__":
    main()
