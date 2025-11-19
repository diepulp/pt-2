# Memori Integration for PT-2

**Agent session memory engine** for cross-session continuity in PT-2 development workflows.

## ⚠️ Important: Correct Architecture

**Memori is NOT a documentation database.**

Memori is designed for **agent session memory**:
- ✅ Remember what agent learned across sessions
- ✅ Track user preferences and decisions
- ✅ Store project context and file locations
- ✅ Record task history and patterns

**Documentation stays in files** (git-controlled, single source of truth):
- ❌ Don't ingest static docs into Memori
- ❌ Don't store whole documents as memories
- ✅ Store pointers to docs in metadata
- ✅ Agent fetches docs from file system as needed

See **`CORRECT_ARCHITECTURE.md`** for detailed explanation.

## Overview

Memori provides intelligent cross-session memory for AI agents by storing lightweight context in PostgreSQL. This enables:

- **Session continuity** - Agent remembers previous work
- **User preferences** - Learns coding patterns and choices
- **Project context** - Tracks what's been built and where
- **Doc references** - Points to relevant files without storing them
- **SQL-native queries** - Debug and audit agent memory

## Architecture

```
PT-2 Development Session
        ↓
Agent (Claude Code)
        ↓
Memori SDK (auto-records conversations)
        ↓
PostgreSQL (Supabase)
   ├── memori.memories (session learnings, ~100 chars each)
   ├── memori.entities (extracted: services, files, patterns)
   ├── memori.relationships (service → files → patterns)
   └── memori.conversations (session tracking)
```

## Database

**Existing Infrastructure**: Memori uses the existing Supabase PostgreSQL instance.

- **Container**: `supabase_db_pt-2`
- **Host**: `127.0.0.1:54322`
- **Database**: `postgres`
- **Schema**: `memori` (isolated from PT-2 tables)

## Agent Namespaces

Each agent has isolated memory for specific work contexts:

1. **pt2_agent**: Main development agent (project context, preferences, rules)
2. **mtl_agent**: MTL Service specialist (compliance patterns, thresholds)
3. **player_agent**: Player Service specialist (identity management)

**Not service documentation storage** - these track what the agent learned while working on each service.

## Configuration

**File**: `.memori/config.yml`

```yaml
# Agent memory configuration (NOT doc storage)
contexts:
  - name: "pt2_agent"
    user_id: "pt2_agent"
    description: "Main agent session memory"
    # Stores: decisions, learnings, preferences, task history

  - name: "mtl_agent"
    user_id: "mtl_agent"
    description: "MTL Service work context"
    # Stores: MTL-specific learnings, not MTL docs

# Doc references (pointers, not content)
doc_references:
  architecture:
    - "docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md"
  security:
    - "docs/30-security/SEC-001-rls-policy-matrix.md"
```

## Scripts

### Reset and Seed (Recommended)

```bash
python scripts/memori-reset-and-seed.py
```

Resets Memori to correct architecture:
- Removes whole-document storage (if present)
- Seeds essential agent context
- Sets up doc reference metadata
- Initializes session memory

### Initialize Database Schema

```bash
python scripts/memori-init-db.py
```

Creates the `memori` schema and tables (one-time setup).

### Test Integration

```bash
python scripts/memori-test.py
```

Runs integration tests:
- Context isolation
- Memory retrieval
- Full-text search

## Environment Variables

Not required for basic operation. Memori uses the existing database connection.

Optional for advanced features:
```bash
OPENAI_API_KEY="your-key"  # For entity extraction (optional)
```

## Current State

After running `memori-reset-and-seed.py`:

```
Total memories: 12
Agents: 3 (pt2_agent, mtl_agent, player_agent)
Categories: 5 (context, facts, preferences, rules, skills)
Avg size: ~100 chars (lean and focused)
Max size: ~300 chars (no bloat)
```

## What Memori Stores

### ✅ Agent Session Memory

**Project Context:**
- "PT-2 is a casino management system with bounded context architecture"
- "Working on MTL compliance features"

**User Preferences:**
- "User prefers functional factories over classes"
- "Always use explicit interfaces, ban ReturnType inference"

**Task History:**
- "Created MTLService at src/services/mtl.service.ts"
- "Fixed CTR threshold calculation bug on 2025-11-18"

**Rules:**
- "Run npm run db:types after every migration"
- "Migration files MUST follow YYYYMMDDHHMMSS_description.sql pattern"

**Facts:**
- "CTR threshold is $10,000, watchlist floor is $3,000"
- "MTLService owns mtl_entry, mtl_audit_note tables"

**Doc References (in metadata):**
```json
{
  "relevant_docs": [
    "docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md",
    "docs/patterns/SERVICE_TEMPLATE.md"
  ]
}
```

### ❌ What NOT to Store

- ❌ Whole SERVICE_RESPONSIBILITY_MATRIX.md (86KB)
- ❌ Complete ADR documents
- ❌ Full anti-pattern catalogs
- ❌ Service templates (keep in files)
- ❌ Any static documentation content

## Query Examples

See **`PSQL_COMMANDS.md`** for comprehensive query reference.

### Quick Summary

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT COUNT(*) as memories, ROUND(AVG(LENGTH(content))) as avg_size
FROM memori.memories;"
```

### View All Agent Memories

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT user_id, category, content
FROM memori.memories
ORDER BY user_id, category;"
```

### Search for Specific Information

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT user_id, content
FROM memori.memories
WHERE content ILIKE '%threshold%';"
```

## Integration with Development Workflow

### How It Works

1. **Agent starts session** → Memori auto-injects recent memories
2. **Agent works on task** → Creates service, fixes bug, etc.
3. **Agent makes decisions** → "Used functional factory pattern"
4. **Memori records learnings** → Stores in lightweight memory
5. **Next session** → Agent recalls "MTLService at src/services/mtl.service.ts"

### Example Flow

```
Day 1: User asks "Create MTL Service"
├── Memori injects: "User prefers functional factories"
├── Agent reads: SERVICE_TEMPLATE.md (from file system)
├── Agent creates: src/services/mtl.service.ts
└── Memori records: "Created MTLService at src/services/mtl.service.ts"

Day 2: User asks "Add CTR threshold detection"
├── Memori injects: "MTLService exists at src/services/mtl.service.ts"
├── Agent reads: SRM.md for CTR rules (from file system)
├── Agent implements: Threshold detection
└── Memori records: "Added CTR threshold detection"

Day 3: User asks "Create PlayerFinancialService"
├── Memori injects: "Previously created MTLService using SERVICE_TEMPLATE.md"
├── Agent applies: Same pattern to new service
└── Memori records: "Created PlayerFinancialService using MTL pattern"
```

## Benefits

### Session Continuity
- Agent remembers previous work
- No re-explaining project structure
- Faster iteration cycles

### Lightweight Context
- 100-300 chars per memory (vs 86KB documents)
- ~300 tokens per query (vs 25,000 with whole docs)
- 98% token reduction

### Single Source of Truth
- Documentation stays in git
- Memori points to docs, doesn't duplicate
- Easy to update and maintain

## Troubleshooting

### No memories present

Run reset script:
```bash
python scripts/memori-reset-and-seed.py
```

### Oversized memories (>5000 chars)

Check and clean:
```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT COUNT(*) FROM memori.memories WHERE LENGTH(content) > 5000;"
```

If any found, re-run reset script.

### Database connection issues

Verify Supabase is running:
```bash
docker ps | grep supabase_db
```

Test connection:
```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "SELECT 1;"
```

## Expected Memory Profile

For a healthy agent memory system:

```
Total Memories: 10-100 (not thousands)
Avg Size: 100-300 chars (not 86,000!)
Max Size: < 500 chars (definitely not 86KB)
Categories: facts, preferences, rules, skills, context
Agents: pt2_agent, mtl_agent, player_agent
```

## Documentation

- **Architecture Guide**: `.memori/CORRECT_ARCHITECTURE.md`
- **Query Reference**: `.memori/PSQL_COMMANDS.md`
- **Configuration**: `.memori/config.yml`
- **Memori Official Docs**: https://memorilabs.ai/docs/

## Archived Files

Obsolete scripts (doc-storage approach) moved to `.memori/archive/`:
- `memori-ingest.py` (wrong approach)
- `memori-ingest-v2.py` (wrong approach)
- `IMPLEMENTATION_GUIDE_OBSOLETE.md`

See `.memori/archive/README.md` for explanation.

## Key Principle

**Memori = Agent's brain for sessions**
**File system = Knowledge base for reference**
**Together = Efficient, continuous development**

Stop trying to make Memori a documentation database. Use it for what it's designed for: making agents remember conversations and learnings across sessions.
