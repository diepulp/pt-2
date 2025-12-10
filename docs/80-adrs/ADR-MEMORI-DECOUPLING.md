# ADR: Memori Database Decoupling Strategy

**Status**: Proposed
**Date**: 2025-12-09
**Context**: PT-2 Pit Station

## Problem Statement

The Memori cross-session memory system currently shares the same Supabase instance as PT-2:
- **Database**: `127.0.0.1:54322/postgres` (same PostgreSQL instance)
- **Schema**: `memori` schema within PT-2's database
- **Impact**: Running `supabase db reset` wipes all Memori memories

This coupling violates the principle that agent memory should be project-agnostic and persistent across database resets.

## Current Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Supabase Local (pt-2)                  │
│                   127.0.0.1:54322                       │
├─────────────────────────────────────────────────────────┤
│  public schema          │  memori schema                │
│  ─────────────          │  ─────────────                │
│  - casinos              │  - memories                   │
│  - players              │  - entities                   │
│  - rating_slips         │  - relationships              │
│  - visits               │  - conversations              │
│  - seat_occupancy       │                               │
│  - table_contexts       │  context schema               │
│  - staff                │  ─────────────                │
│  ...                    │  - sessions                   │
│                         │  - session_events             │
│                         │  - session_state              │
└─────────────────────────────────────────────────────────┘
```

**Environment Variables**:
```bash
# PT-2 Database
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321

# Memori Database (same instance!)
MEMORI_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres?options=-c search_path=memori,public"
```

---

## Decoupling Options

### Option A: Separate Docker Container (Recommended)

Run Memori in its own PostgreSQL container, completely isolated from Supabase.

```
┌────────────────────────┐     ┌────────────────────────┐
│  PT-2 Supabase         │     │  Memori PostgreSQL     │
│  127.0.0.1:54322       │     │  127.0.0.1:5433        │
├────────────────────────┤     ├────────────────────────┤
│  public, context, etc. │     │  memori schema         │
│  (resets with project) │     │  (persistent)          │
└────────────────────────┘     └────────────────────────┘
```

**Implementation**:

1. **Create Docker Compose for Memori**:

```yaml
# memori/docker-compose.yml
version: '3.8'

services:
  memori-db:
    image: postgres:17-alpine
    container_name: memori-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: memori
      POSTGRES_PASSWORD: memori_secret
      POSTGRES_DB: memori
    ports:
      - "5433:5432"
    volumes:
      - memori_data:/var/lib/postgresql/data
      - ./init:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U memori -d memori"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  memori_data:
    driver: local
```

2. **Create initialization script**:

```sql
-- memori/init/01-schema.sql
CREATE SCHEMA IF NOT EXISTS memori;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create tables (same as current)
CREATE TABLE memori.memories (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    content_tsv TSVECTOR,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ... (rest of schema)
```

3. **Update environment**:

```bash
# .env
MEMORI_DATABASE_URL="postgresql://memori:memori_secret@127.0.0.1:5433/memori"
```

**Pros**:
- Complete isolation from PT-2
- Memori survives `supabase db reset`
- Docker volume provides persistence across container restarts
- Can be used by multiple projects
- Easy to backup/migrate

**Cons**:
- Additional container to manage
- Slightly more complex setup

---

### Option B: Separate Supabase Project

Run a second Supabase instance dedicated to Memori.

```bash
# In a separate directory
mkdir ~/memori-supabase && cd ~/memori-supabase
supabase init
supabase start
```

**Pros**:
- Full Supabase features (Studio, Auth, etc.)
- Familiar tooling

**Cons**:
- Heavy footprint (full Supabase stack)
- More resources required
- Overkill for simple memory storage

---

### Option C: Remote PostgreSQL Instance

Use a dedicated cloud PostgreSQL (Supabase remote, Neon, Railway, etc.).

```bash
MEMORI_DATABASE_URL="postgresql://user:pass@memori-db.example.com:5432/memori"
```

**Pros**:
- Always available
- No local containers
- Shared across machines

**Cons**:
- Network latency
- Requires internet
- Monthly cost

---

### Option D: SQLite with Litestream

Use SQLite for local storage with optional cloud sync.

```bash
MEMORI_DATABASE_URL="sqlite:///home/user/.memori/memories.db"
```

**Pros**:
- Zero dependencies
- Single file, easy backup
- Works offline

**Cons**:
- Requires code changes (different SQL dialect)
- No built-in full-text search like PostgreSQL
- Limited concurrency

---

## Recommended Approach: Option A (Docker Container)

### Implementation Plan

#### Phase 1: Infrastructure Setup

1. **Create Memori infrastructure directory**:
```
~/.memori/
├── docker-compose.yml
├── init/
│   └── 01-schema.sql
├── backups/
└── .env
```

2. **Docker Compose configuration**:
```yaml
# ~/.memori/docker-compose.yml
version: '3.8'

services:
  memori-db:
    image: postgres:17-alpine
    container_name: memori-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${MEMORI_DB_USER:-memori}
      POSTGRES_PASSWORD: ${MEMORI_DB_PASSWORD:-memori_dev}
      POSTGRES_DB: ${MEMORI_DB_NAME:-memori}
    ports:
      - "${MEMORI_DB_PORT:-5433}:5432"
    volumes:
      - memori_data:/var/lib/postgresql/data
      - ./init:/docker-entrypoint-initdb.d
      - ./backups:/backups
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U memori -d memori"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - memori-net

networks:
  memori-net:
    driver: bridge

volumes:
  memori_data:
    name: memori_persistent_data
```

3. **Schema initialization**:
```sql
-- ~/.memori/init/01-schema.sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create memori schema
CREATE SCHEMA IF NOT EXISTS memori;
SET search_path TO memori, public;

-- Memories table
CREATE TABLE memori.memories (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'context',
    metadata JSONB DEFAULT '{}',
    content_tsv TSVECTOR,
    source_type VARCHAR(50),
    confidence FLOAT DEFAULT 0.5,
    lineage JSONB DEFAULT '[]',
    last_used_at TIMESTAMP,
    use_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Entities table
CREATE TABLE memori.entities (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100),
    entity_name VARCHAR(255) NOT NULL,
    content TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Relationships table
CREATE TABLE memori.relationships (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    source_entity_id INTEGER REFERENCES memori.entities(id),
    target_entity_id INTEGER REFERENCES memori.entities(id),
    relationship_type VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Conversations table
CREATE TABLE memori.conversations (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255),
    messages JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_memories_user_id ON memori.memories(user_id);
CREATE INDEX idx_memories_category ON memori.memories(category);
CREATE INDEX idx_memories_created_at ON memori.memories(created_at DESC);
CREATE INDEX idx_memories_content_tsv ON memori.memories USING GIN(content_tsv);
CREATE INDEX idx_memories_metadata ON memori.memories USING GIN(metadata);
CREATE INDEX idx_entities_user_id ON memori.entities(user_id);
CREATE INDEX idx_entities_type ON memori.entities(entity_type);

-- Full-text search trigger
CREATE OR REPLACE FUNCTION memori.update_content_tsv()
RETURNS TRIGGER AS $$
BEGIN
    NEW.content_tsv := to_tsvector('english', NEW.content);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_content_tsv
BEFORE INSERT OR UPDATE ON memori.memories
FOR EACH ROW
EXECUTE FUNCTION memori.update_content_tsv();

-- TTL cleanup function
CREATE OR REPLACE FUNCTION memori.cleanup_expired_memories()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM memori.memories WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
```

#### Phase 2: Migration Script

```python
#!/usr/bin/env python3
"""
Migrate Memori data from PT-2 Supabase to standalone container.
"""

import psycopg2
import json
from datetime import datetime

# Source: PT-2 Supabase
SOURCE_DB = {
    "host": "127.0.0.1",
    "port": 54322,
    "database": "postgres",
    "user": "postgres",
    "password": "postgres"
}

# Target: Standalone Memori container
TARGET_DB = {
    "host": "127.0.0.1",
    "port": 5433,
    "database": "memori",
    "user": "memori",
    "password": "memori_dev"
}

def migrate():
    src = psycopg2.connect(**SOURCE_DB)
    dst = psycopg2.connect(**TARGET_DB)

    src_cur = src.cursor()
    dst_cur = dst.cursor()

    # Migrate memories
    src_cur.execute("SELECT * FROM memori.memories")
    rows = src_cur.fetchall()

    for row in rows:
        dst_cur.execute("""
            INSERT INTO memori.memories
            (id, user_id, content, category, metadata, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING
        """, row[:7])

    dst.commit()
    print(f"Migrated {len(rows)} memories")

    # Reset sequence
    dst_cur.execute("SELECT setval('memori.memories_id_seq', (SELECT MAX(id) FROM memori.memories))")
    dst.commit()

    src.close()
    dst.close()

if __name__ == "__main__":
    migrate()
```

#### Phase 3: Update PT-2 Configuration

1. **Update `.env`**:
```bash
# Memori - Standalone Container (not PT-2 Supabase)
MEMORI_DATABASE_URL="postgresql://memori:memori_dev@127.0.0.1:5433/memori"
```

2. **Update `lib/memori/client.py`**:
```python
def _load_config_from_env(self) -> MemoriConfig:
    return MemoriConfig(
        database_url=os.getenv(
            "MEMORI_DATABASE_URL",
            # Default to standalone container, NOT Supabase
            "postgresql://memori:memori_dev@127.0.0.1:5433/memori"
        ),
        # ...
    )
```

#### Phase 4: Operational Scripts

```bash
# ~/.memori/scripts/start.sh
#!/bin/bash
cd ~/.memori
docker compose up -d
echo "Memori database started on port 5433"

# ~/.memori/scripts/stop.sh
#!/bin/bash
cd ~/.memori
docker compose down
echo "Memori database stopped"

# ~/.memori/scripts/backup.sh
#!/bin/bash
BACKUP_FILE="backups/memori_$(date +%Y%m%d_%H%M%S).sql"
docker exec memori-db pg_dump -U memori memori > ~/.memori/$BACKUP_FILE
echo "Backup saved to $BACKUP_FILE"

# ~/.memori/scripts/status.sh
#!/bin/bash
docker ps --filter "name=memori-db" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

---

## Migration Checklist

- [ ] Create `~/.memori/` directory structure
- [ ] Create `docker-compose.yml`
- [ ] Create `init/01-schema.sql`
- [ ] Start Memori container: `docker compose up -d`
- [ ] Run migration script to copy existing data
- [ ] Update `.env` with new `MEMORI_DATABASE_URL`
- [ ] Update `lib/memori/client.py` default URL
- [ ] Test Memori client connection
- [ ] Remove memori schema from PT-2 migrations (optional cleanup)
- [ ] Document in project README

---

## Post-Decoupling Architecture

```
┌────────────────────────┐     ┌────────────────────────┐
│     PT-2 Supabase      │     │    Memori Container    │
│   127.0.0.1:54322      │     │    127.0.0.1:5433      │
├────────────────────────┤     ├────────────────────────┤
│  Project-specific      │     │  Agent memory          │
│  - casinos, players    │     │  - memories            │
│  - rating_slips        │     │  - entities            │
│  - visits, etc.        │     │  - relationships       │
│                        │     │  - conversations       │
│  Resets: supabase db   │     │  Resets: NEVER         │
│          reset         │     │  (persistent volume)   │
└────────────────────────┘     └────────────────────────┘
         ▲                              ▲
         │                              │
    PT-2 App                     Memori Client
    (Next.js)                    (lib/memori/)
```

---

## Rollback Plan

If decoupling causes issues:

1. Stop Memori container
2. Restore `MEMORI_DATABASE_URL` to point to Supabase
3. Re-run `memori-init-db.py` against Supabase
4. Migrate data back (reverse of migration script)

---

## Decision

**Adopt Option A: Separate Docker Container**

Rationale:
- Minimal complexity (single container vs full Supabase stack)
- Complete isolation from PT-2 lifecycle
- Docker volume ensures persistence
- Can be shared across multiple projects
- Easy backup and restoration
- No code changes required beyond connection string

---

## References

- [Memori SDK Documentation](https://github.com/memorisdk/memori)
- [Docker Compose Volumes](https://docs.docker.com/compose/compose-file/07-volumes/)
- [PostgreSQL Full-Text Search](https://www.postgresql.org/docs/current/textsearch.html)
