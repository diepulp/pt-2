#!/usr/bin/env python3
"""
Initialize Memori database schema in existing Supabase instance.

This script creates a separate 'memori' schema to avoid conflicts with PT-2 tables.
Memori will use this schema for storing memories, entities, and relationships.
"""

import os
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import psycopg2
from psycopg2 import sql
from loguru import logger

# Database configuration (from Supabase local)
DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 54322,
    "database": "postgres",
    "user": "postgres",
    "password": "postgres"
}

MEMORI_SCHEMA = "memori"


def create_memori_schema():
    """Create Memori schema and required tables."""

    logger.info("Connecting to Supabase database...")
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = True
    cur = conn.cursor()

    try:
        # Create schema
        logger.info(f"Creating schema: {MEMORI_SCHEMA}")
        cur.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(
            sql.Identifier(MEMORI_SCHEMA)
        ))

        # Create tables (Memori SDK will handle detailed schema)
        # We just need to ensure the schema exists
        logger.info("Creating Memori tables...")

        # Try to enable pgvector extension (optional)
        try:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            logger.info("✅ pgvector extension enabled")
            has_vector = True
        except Exception as e:
            logger.warning(f"⚠️  pgvector extension not available: {e}")
            logger.warning("Vector embeddings will be stored as JSONB instead")
            has_vector = False

        # Memories table (core storage)
        if has_vector:
            cur.execute(f"""
                CREATE TABLE IF NOT EXISTS {MEMORI_SCHEMA}.memories (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(255) NOT NULL,
                    content TEXT NOT NULL,
                    category VARCHAR(50),
                    metadata JSONB DEFAULT '{{}}',
                    embedding VECTOR(1536),  -- OpenAI ada-002 embeddings
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                );
            """)
        else:
            cur.execute(f"""
                CREATE TABLE IF NOT EXISTS {MEMORI_SCHEMA}.memories (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(255) NOT NULL,
                    content TEXT NOT NULL,
                    category VARCHAR(50),
                    metadata JSONB DEFAULT '{{}}',
                    embedding JSONB,  -- Fallback: store embeddings as JSON
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                );
            """)

        # Entities table (extracted entities)
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS {MEMORI_SCHEMA}.entities (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                entity_type VARCHAR(100),
                entity_name VARCHAR(255) NOT NULL,
                content TEXT,
                metadata JSONB DEFAULT '{{}}',
                created_at TIMESTAMP DEFAULT NOW()
            );
        """)

        # Relationships table (entity relationships)
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS {MEMORI_SCHEMA}.relationships (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                source_entity_id INTEGER REFERENCES {MEMORI_SCHEMA}.entities(id),
                target_entity_id INTEGER REFERENCES {MEMORI_SCHEMA}.entities(id),
                relationship_type VARCHAR(100),
                metadata JSONB DEFAULT '{{}}',
                created_at TIMESTAMP DEFAULT NOW()
            );
        """)

        # Conversations table (session tracking)
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS {MEMORI_SCHEMA}.conversations (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                session_id VARCHAR(255),
                messages JSONB DEFAULT '[]',
                metadata JSONB DEFAULT '{{}}',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        """)

        # Create indexes for performance
        logger.info("Creating indexes...")

        cur.execute(f"""
            CREATE INDEX IF NOT EXISTS idx_memories_user_id
            ON {MEMORI_SCHEMA}.memories(user_id);
        """)

        cur.execute(f"""
            CREATE INDEX IF NOT EXISTS idx_memories_category
            ON {MEMORI_SCHEMA}.memories(category);
        """)

        cur.execute(f"""
            CREATE INDEX IF NOT EXISTS idx_memories_created_at
            ON {MEMORI_SCHEMA}.memories(created_at DESC);
        """)

        cur.execute(f"""
            CREATE INDEX IF NOT EXISTS idx_entities_user_id
            ON {MEMORI_SCHEMA}.entities(user_id);
        """)

        cur.execute(f"""
            CREATE INDEX IF NOT EXISTS idx_entities_type
            ON {MEMORI_SCHEMA}.entities(entity_type);
        """)

        # Enable full-text search
        logger.info("Enabling full-text search...")

        cur.execute(f"""
            ALTER TABLE {MEMORI_SCHEMA}.memories
            ADD COLUMN IF NOT EXISTS content_tsv TSVECTOR;
        """)

        cur.execute(f"""
            CREATE INDEX IF NOT EXISTS idx_memories_content_tsv
            ON {MEMORI_SCHEMA}.memories
            USING GIN(content_tsv);
        """)

        cur.execute(f"""
            CREATE OR REPLACE FUNCTION {MEMORI_SCHEMA}.update_content_tsv()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.content_tsv := to_tsvector('english', NEW.content);
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        """)

        cur.execute(f"""
            DROP TRIGGER IF EXISTS trigger_update_content_tsv
            ON {MEMORI_SCHEMA}.memories;
        """)

        cur.execute(f"""
            CREATE TRIGGER trigger_update_content_tsv
            BEFORE INSERT OR UPDATE ON {MEMORI_SCHEMA}.memories
            FOR EACH ROW
            EXECUTE FUNCTION {MEMORI_SCHEMA}.update_content_tsv();
        """)

        logger.success(f"✅ Memori schema '{MEMORI_SCHEMA}' initialized successfully!")
        logger.info(f"Database: {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}")
        logger.info(f"Schema: {MEMORI_SCHEMA}")
        logger.info("Tables created: memories, entities, relationships, conversations")

    except Exception as e:
        logger.error(f"❌ Error initializing Memori schema: {e}")
        raise
    finally:
        cur.close()
        conn.close()


def verify_schema():
    """Verify Memori schema was created successfully."""

    logger.info("Verifying schema...")
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    try:
        # Check schema exists
        cur.execute("""
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name = %s
        """, (MEMORI_SCHEMA,))

        if cur.fetchone():
            logger.success(f"✅ Schema '{MEMORI_SCHEMA}' exists")
        else:
            logger.error(f"❌ Schema '{MEMORI_SCHEMA}' not found")
            return False

        # Check tables
        cur.execute(f"""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = %s
            ORDER BY table_name
        """, (MEMORI_SCHEMA,))

        tables = [row[0] for row in cur.fetchall()]
        logger.info(f"Tables found: {', '.join(tables)}")

        expected_tables = ['conversations', 'entities', 'memories', 'relationships']
        for table in expected_tables:
            if table in tables:
                logger.success(f"  ✅ Table '{table}' exists")
            else:
                logger.warning(f"  ⚠️  Table '{table}' not found")

        return True

    except Exception as e:
        logger.error(f"❌ Error verifying schema: {e}")
        return False
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("Memori Database Initialization for PT-2")
    logger.info("=" * 60)

    try:
        create_memori_schema()
        verify_schema()

        logger.info("=" * 60)
        logger.info("Next steps:")
        logger.info("1. Run: python scripts/memori-ingest.py")
        logger.info("2. Test: python scripts/memori-test.py")
        logger.info("=" * 60)

    except Exception as e:
        logger.error(f"Initialization failed: {e}")
        sys.exit(1)
