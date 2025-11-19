#!/usr/bin/env python3
"""
Ingest PT-2 documentation into Memori memory engine.

This script ingests architecture docs, ADRs, memory files, and service docs
into Memori for intelligent context retrieval during agentic workflows.
"""

import os
import sys
from pathlib import Path
import yaml
import glob as glob_module
from typing import List, Dict

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from memori import Memori
from loguru import logger

# Database configuration
DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres?options=-c search_path=memori,public"

# Load config
config_path = project_root / ".memori" / "config.yml"
with open(config_path, 'r') as f:
    config = yaml.safe_load(f)


def expand_glob_patterns(patterns: List[str]) -> List[Path]:
    """Expand glob patterns to actual file paths."""
    files = []
    for pattern in patterns:
        matches = glob_module.glob(str(project_root / pattern), recursive=True)
        files.extend([Path(p) for p in matches if Path(p).is_file()])
    return files


def ingest_context(context_name: str, context_config: Dict):
    """Ingest documentation for a specific bounded context."""

    logger.info(f"Ingesting context: {context_name}")
    logger.info(f"Description: {context_config['description']}")

    # Initialize Memori for this context
    memori = Memori(
        database_connect=DATABASE_URL,
        user_id=context_config['user_id'],
        conscious_ingest=True,
        auto_ingest=True,
        schema_init=False  # We already initialized the schema
    )
    memori.enable()

    # Get all files to ingest
    ingest_paths = context_config.get('ingest_paths', [])
    files = expand_glob_patterns(ingest_paths)

    logger.info(f"Found {len(files)} files to ingest")

    # Ingest each file
    ingested_count = 0
    error_count = 0

    for file_path in files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Skip empty files
            if not content.strip():
                logger.warning(f"Skipping empty file: {file_path}")
                continue

            # Determine category based on file path
            category = "context"
            if "anti-pattern" in str(file_path).lower():
                category = "rules"
            elif "adr" in str(file_path).lower() or "decision" in str(file_path).lower():
                category = "facts"
            elif "memory" in str(file_path):
                category = "context"
            elif "prd" in str(file_path).lower() or "spec" in str(file_path).lower():
                category = "facts"

            # Prepare metadata
            metadata = {
                "file": str(file_path.relative_to(project_root)),
                "type": "documentation",
                "context": context_name,
                "category": category
            }

            # Ingest into Memori
            # Note: Memori SDK will auto-extract entities and relationships
            logger.info(f"  Ingesting: {file_path.name} ({len(content)} chars)")

            # Since Memori intercepts LLM calls, we need to make a call with this content
            # For ingestion, we can directly insert into the database
            # This is a workaround - in production, you'd use Memori's ingestion API
            import psycopg2
            import json

            conn = psycopg2.connect(
                host="127.0.0.1",
                port=54322,
                database="postgres",
                user="postgres",
                password="postgres"
            )
            cur = conn.cursor()

            # Insert memory
            cur.execute("""
                INSERT INTO memori.memories (user_id, content, category, metadata)
                VALUES (%s, %s, %s, %s)
            """, (
                context_config['user_id'],
                content,
                category,
                json.dumps(metadata)
            ))

            conn.commit()
            cur.close()
            conn.close()

            ingested_count += 1

        except Exception as e:
            logger.error(f"  ❌ Error ingesting {file_path}: {e}")
            error_count += 1

    logger.success(f"✅ Context '{context_name}' ingestion complete:")
    logger.info(f"   - Ingested: {ingested_count} files")
    if error_count > 0:
        logger.warning(f"   - Errors: {error_count} files")


def ingest_all_contexts():
    """Ingest all configured contexts."""

    logger.info("=" * 60)
    logger.info("PT-2 Documentation Ingestion")
    logger.info("=" * 60)

    contexts = config.get('contexts', [])
    logger.info(f"Found {len(contexts)} contexts to ingest")

    for context in contexts:
        context_name = context['name']
        logger.info("")
        logger.info("-" * 60)
        ingest_context(context_name, context)

    logger.info("")
    logger.info("=" * 60)
    logger.info("Ingestion Summary")
    logger.info("=" * 60)

    # Query ingestion stats
    import psycopg2

    conn = psycopg2.connect(
        host="127.0.0.1",
        port=54322,
        database="postgres",
        user="postgres",
        password="postgres"
    )
    cur = conn.cursor()

    # Total memories
    cur.execute("SELECT COUNT(*) FROM memori.memories")
    total_memories = cur.fetchone()[0]
    logger.info(f"Total memories: {total_memories}")

    # Memories by context
    cur.execute("""
        SELECT user_id, COUNT(*) as count
        FROM memori.memories
        GROUP BY user_id
        ORDER BY count DESC
    """)

    logger.info("\nMemories by context:")
    for row in cur.fetchall():
        logger.info(f"  - {row[0]}: {row[1]} memories")

    # Memories by category
    cur.execute("""
        SELECT category, COUNT(*) as count
        FROM memori.memories
        GROUP BY category
        ORDER BY count DESC
    """)

    logger.info("\nMemories by category:")
    for row in cur.fetchall():
        category = row[0] or "uncategorized"
        logger.info(f"  - {category}: {row[1]} memories")

    cur.close()
    conn.close()

    logger.info("=" * 60)
    logger.success("✅ Ingestion complete!")
    logger.info("Next step: python scripts/memori-test.py")
    logger.info("=" * 60)


if __name__ == "__main__":
    try:
        ingest_all_contexts()
    except Exception as e:
        logger.error(f"Ingestion failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
