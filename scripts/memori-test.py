#!/usr/bin/env python3
"""
Test Memori integration with PT-2 agentic workflow.

This script demonstrates:
1. Context-specific memory retrieval
2. Service boundary queries
3. Architecture pattern lookup
4. Anti-pattern detection
"""

import os
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from loguru import logger
import psycopg2
import json

# Database configuration
DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 54322,
    "database": "postgres",
    "user": "postgres",
    "password": "postgres"
}


def test_context_isolation():
    """Test that contexts are properly isolated."""

    logger.info("Testing context isolation...")

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Check MTL service context
    cur.execute("""
        SELECT COUNT(*) FROM memori.memories
        WHERE user_id = 'mtl_service'
    """)
    mtl_count = cur.fetchone()[0]
    logger.info(f"  MTL Service memories: {mtl_count}")

    # Check Player service context
    cur.execute("""
        SELECT COUNT(*) FROM memori.memories
        WHERE user_id = 'player_service'
    """)
    player_count = cur.fetchone()[0]
    logger.info(f"  Player Service memories: {player_count}")

    # Check Architecture context
    cur.execute("""
        SELECT COUNT(*) FROM memori.memories
        WHERE user_id = 'pt2_architect'
    """)
    arch_count = cur.fetchone()[0]
    logger.info(f"  Architecture memories: {arch_count}")

    cur.close()
    conn.close()

    if mtl_count > 0 and player_count > 0 and arch_count > 0:
        logger.success("✅ Context isolation working correctly")
        return True
    else:
        logger.warning("⚠️  Some contexts have no memories")
        return False


def test_mtl_context_retrieval():
    """Test retrieving MTL-specific context."""

    logger.info("Testing MTL context retrieval...")

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Search for CTR threshold information
    cur.execute("""
        SELECT content, metadata
        FROM memori.memories
        WHERE user_id = 'mtl_service'
        AND content_tsv @@ to_tsquery('english', 'CTR | threshold')
        LIMIT 5
    """)

    results = cur.fetchall()
    logger.info(f"  Found {len(results)} memories about CTR thresholds")

    for i, (content, metadata) in enumerate(results, 1):
        snippet = content[:200].replace('\n', ' ')
        # metadata is already a dict from psycopg2's JSONB type
        file = metadata.get('file', 'unknown') if isinstance(metadata, dict) else 'unknown'
        logger.info(f"  {i}. [{file}] {snippet}...")

    cur.close()
    conn.close()

    if len(results) > 0:
        logger.success("✅ MTL context retrieval working")
        return True
    else:
        logger.warning("⚠️  No MTL threshold information found")
        return False


def test_anti_pattern_detection():
    """Test retrieving anti-patterns."""

    logger.info("Testing anti-pattern detection...")

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Search for anti-patterns
    cur.execute("""
        SELECT content, metadata
        FROM memori.memories
        WHERE category = 'rules'
        AND content_tsv @@ to_tsquery('english', 'ReturnType | class | singleton')
        LIMIT 5
    """)

    results = cur.fetchall()
    logger.info(f"  Found {len(results)} anti-pattern rules")

    for i, (content, metadata) in enumerate(results, 1):
        snippet = content[:150].replace('\n', ' ')
        logger.info(f"  {i}. {snippet}...")

    cur.close()
    conn.close()

    if len(results) > 0:
        logger.success("✅ Anti-pattern detection working")
        return True
    else:
        logger.warning("⚠️  No anti-patterns found")
        return False


def test_architecture_lookup():
    """Test architecture decision lookup."""

    logger.info("Testing architecture decision lookup...")

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Search for ADR information
    cur.execute("""
        SELECT content, metadata
        FROM memori.memories
        WHERE user_id = 'pt2_architect'
        AND content_tsv @@ to_tsquery('english', 'ADR | architecture | decision')
        LIMIT 5
    """)

    results = cur.fetchall()
    logger.info(f"  Found {len(results)} architecture decisions")

    for i, (content, metadata) in enumerate(results, 1):
        # metadata is already a dict from psycopg2's JSONB type
        file = metadata.get('file', 'unknown') if isinstance(metadata, dict) else 'unknown'
        snippet = content[:150].replace('\n', ' ')
        logger.info(f"  {i}. [{file}] {snippet}...")

    cur.close()
    conn.close()

    if len(results) > 0:
        logger.success("✅ Architecture lookup working")
        return True
    else:
        logger.warning("⚠️  No architecture decisions found")
        return False


def test_service_boundary_query():
    """Test querying service ownership boundaries."""

    logger.info("Testing service boundary queries...")

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Search for TableContext responsibilities
    cur.execute("""
        SELECT content, metadata
        FROM memori.memories
        WHERE user_id = 'table_context_service'
        AND content_tsv @@ to_tsquery('english', 'table | dealer | fill | drop')
        LIMIT 3
    """)

    results = cur.fetchall()
    logger.info(f"  Found {len(results)} TableContext service docs")

    for i, (content, metadata) in enumerate(results, 1):
        snippet = content[:150].replace('\n', ' ')
        logger.info(f"  {i}. {snippet}...")

    cur.close()
    conn.close()

    if len(results) > 0:
        logger.success("✅ Service boundary queries working")
        return True
    else:
        logger.warning("⚠️  No service boundary information found")
        return False


def test_full_text_search():
    """Test full-text search capabilities."""

    logger.info("Testing full-text search...")

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    search_queries = [
        ("RLS policy", "RLS | policy | security"),
        ("casino_id scoping", "casino_id | scoping | tenancy"),
        ("ServiceResult envelope", "ServiceResult | envelope"),
    ]

    all_passed = True

    for description, query in search_queries:
        cur.execute(f"""
            SELECT COUNT(*)
            FROM memori.memories
            WHERE content_tsv @@ to_tsquery('english', '{query}')
        """)

        count = cur.fetchone()[0]
        logger.info(f"  '{description}': {count} results")

        if count == 0:
            all_passed = False

    cur.close()
    conn.close()

    if all_passed:
        logger.success("✅ Full-text search working")
        return True
    else:
        logger.warning("⚠️  Some search queries returned no results")
        return False


def run_all_tests():
    """Run all Memori integration tests."""

    logger.info("=" * 60)
    logger.info("Memori Integration Tests for PT-2")
    logger.info("=" * 60)

    tests = [
        ("Context Isolation", test_context_isolation),
        ("MTL Context Retrieval", test_mtl_context_retrieval),
        ("Anti-Pattern Detection", test_anti_pattern_detection),
        ("Architecture Lookup", test_architecture_lookup),
        ("Service Boundary Queries", test_service_boundary_query),
        ("Full-Text Search", test_full_text_search),
    ]

    results = []

    for name, test_func in tests:
        logger.info("")
        logger.info("-" * 60)
        try:
            passed = test_func()
            results.append((name, passed))
        except Exception as e:
            logger.error(f"❌ Test '{name}' failed with error: {e}")
            import traceback
            traceback.print_exc()
            results.append((name, False))

    # Summary
    logger.info("")
    logger.info("=" * 60)
    logger.info("Test Summary")
    logger.info("=" * 60)

    passed_count = sum(1 for _, passed in results if passed)
    total_count = len(results)

    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        logger.info(f"  {status}: {name}")

    logger.info("")
    logger.info(f"Results: {passed_count}/{total_count} tests passed")

    if passed_count == total_count:
        logger.success("✅ All tests passed!")
        return True
    else:
        logger.warning(f"⚠️  {total_count - passed_count} test(s) failed")
        return False


if __name__ == "__main__":
    try:
        success = run_all_tests()
        sys.exit(0 if success else 1)
    except Exception as e:
        logger.error(f"Test suite failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
