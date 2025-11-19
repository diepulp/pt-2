#!/usr/bin/env python3
"""
Simple documentation ingestion into Memori database.

This bypasses Memori SDK's LLM agents and directly inserts into the database.
"""

import os
import sys
from pathlib import Path
import yaml
import glob as glob_module
import psycopg2
import json
from loguru import logger

# Project root
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Database config
DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 54322,
    "database": "postgres",
    "user": "postgres",
    "password": "postgres"
}

# Load Memori config
config_path = project_root / ".memori" / "config.yml"
with open(config_path, 'r') as f:
    config = yaml.safe_load(f)


def expand_glob_patterns(patterns):
    """Expand glob patterns to file paths."""
    files = []
    for pattern in patterns:
        matches = glob_module.glob(str(project_root / pattern), recursive=True)
        files.extend([Path(p) for p in matches if Path(p).is_file()])
    return files


def ingest_context(context_name, context_config, conn):
    """Ingest documentation for a context."""

    logger.info(f"Ingesting: {context_name}")
    logger.info(f"  Description: {context_config['description']}")

    user_id = context_config['user_id']
    ingest_paths = context_config.get('ingest_paths', [])
    files = expand_glob_patterns(ingest_paths)

    logger.info(f"  Found {len(files)} files")

    cur = conn.cursor()
    ingested = 0

    for file_path in files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            if not content.strip():
                continue

            # Determine category
            category = "context"
            fp_str = str(file_path).lower()
            if "anti-pattern" in fp_str:
                category = "rules"
            elif "adr" in fp_str or "decision" in fp_str:
                category = "facts"
            elif "memory" in fp_str:
                category = "context"
            elif "prd" in fp_str or "spec" in fp_str:
                category = "facts"

            metadata = {
                "file": str(file_path.relative_to(project_root)),
                "type": "documentation",
                "context": context_name,
                "category": category
            }

            # Insert
            cur.execute("""
                INSERT INTO memori.memories (user_id, content, category, metadata)
                VALUES (%s, %s, %s, %s)
            """, (user_id, content, category, json.dumps(metadata)))

            ingested += 1
            logger.info(f"    ✓ {file_path.name} ({len(content)} chars)")

        except Exception as e:
            logger.error(f"    ✗ {file_path.name}: {e}")

    conn.commit()
    cur.close()

    logger.success(f"  ✅ Ingested {ingested} files for {context_name}")
    return ingested


def main():
    logger.info("=" * 60)
    logger.info("PT-2 Documentation Ingestion (Simple)")
    logger.info("=" * 60)

    conn = psycopg2.connect(**DB_CONFIG)

    try:
        contexts = config.get('contexts', [])
        logger.info(f"Processing {len(contexts)} contexts\n")

        total_ingested = 0

        for context in contexts:
            count = ingest_context(context['name'], context, conn)
            total_ingested += count
            logger.info("")

        # Summary
        logger.info("=" * 60)
        logger.info("Ingestion Summary")
        logger.info("=" * 60)

        cur = conn.cursor()

        cur.execute("SELECT COUNT(*) FROM memori.memories")
        total = cur.fetchone()[0]
        logger.info(f"Total memories: {total}")

        cur.execute("""
            SELECT user_id, COUNT(*)
            FROM memori.memories
            GROUP BY user_id
            ORDER BY COUNT(*) DESC
        """)
        logger.info("\nBy context:")
        for row in cur.fetchall():
            logger.info(f"  - {row[0]}: {row[1]}")

        cur.execute("""
            SELECT category, COUNT(*)
            FROM memori.memories
            GROUP BY category
            ORDER BY COUNT(*) DESC
        """)
        logger.info("\nBy category:")
        for row in cur.fetchall():
            logger.info(f"  - {row[0] or 'uncategorized'}: {row[1]}")

        cur.close()

        logger.info("=" * 60)
        logger.success(f"✅ Ingestion complete! {total_ingested} files processed")
        logger.info("=" * 60)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
