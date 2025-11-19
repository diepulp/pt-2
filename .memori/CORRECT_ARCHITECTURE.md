# Correct Memori Architecture for PT-2 Agentic Workflows

## Critical Insight: We Misunderstood Memori's Purpose

### ❌ What We Did Wrong
- Tried to use Memori as a **documentation store**
- Ingested static 86KB documents directly into memory DB
- Bypassed Memori's conversation-based intelligence
- Created a bloated, ineffective search index

### ✅ What Memori Is Actually For
**Memori is a session memory engine for LLM conversations:**
- Remember what the **agent learned** during sessions
- Recall **decisions made** across conversations
- Track **user preferences** and **project context**
- Enable **cross-session continuity** without re-explaining

**NOT for:** Storing static documentation that already exists in files.

## Correct Architecture: Hybrid Approach

### Layer 1: Static Documentation (File System)
**What:** PT-2's architectural documentation
**Where:** Git repository (`docs/`, `memory/` files)
**Access:** Direct file reads, grep, vector search
**Purpose:** Source of truth for architecture, patterns, decisions

```
docs/
├── 20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
├── 30-security/SEC-001-rls-policy-matrix.md
├── 80-adrs/ADR-*.md
└── memory/*.memory.md
```

### Layer 2: Memori (Dynamic Session Memory)
**What:** Agent learnings and session context
**Where:** Memori PostgreSQL tables
**Access:** Memori SDK automatic injection
**Purpose:** Cross-session continuity and learned context

**Store in Memori:**
- Agent decisions: "Created MTLService using SERVICE_TEMPLATE.md pattern"
- Learned facts: "User prefers functional factories over classes"
- Project context: "Working on MTL compliance service for gaming compliance"
- User corrections: "Don't use console.log in production code"
- Session summaries: "Fixed CTR threshold calculation bug in mtl.service.ts"

**DO NOT store in Memori:**
- Static documentation content
- Entire SRM or ADR documents
- Anti-pattern catalogs
- Service templates

### Layer 3: Documentation Pointers (Metadata in Memori)
**What:** References to relevant docs
**Where:** Memori metadata fields
**Purpose:** Know which docs to fetch when needed

```json
{
  "fact": "User is working on MTL Service compliance logic",
  "category": "context",
  "metadata": {
    "relevant_docs": [
      "docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#mtl-service",
      "docs/30-security/SEC-002-casino-scoped-security-model.md",
      "memory/service-catalog.memory.md"
    ],
    "service_context": "mtl_service",
    "last_activity": "2025-11-18"
  }
}
```

## How It Should Work: Agentic Workflow

### Scenario: User asks Claude to create a new service

#### Step 1: Memori Recalls Session Context
```python
# Memori automatically injects recent session memories
memori.enable()

client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "user", "content": "Create a new LoyaltyService"}
    ]
)

# Memori auto-injects:
# - "User prefers functional factories (discussed 2024-11-15)"
# - "Last service created: MTLService using SERVICE_TEMPLATE.md"
# - "Project: PT-2 casino management (bounded context architecture)"
# - "Relevant docs: SERVICE_RESPONSIBILITY_MATRIX.md, SERVICE_TEMPLATE.md"
```

#### Step 2: Agent Fetches Referenced Docs
```python
# Based on Memori's metadata pointers, agent reads actual docs
relevant_docs = memori.get_relevant_doc_references("LoyaltyService")

for doc_path in relevant_docs:
    content = read_file(doc_path)  # Direct file read
    # Use actual doc content for implementation
```

#### Step 3: Agent Creates Service & Records Learning
```python
# Agent creates the service following patterns from docs
create_loyalty_service()

# Memori automatically records the session
# New memory created:
{
  "fact": "Created LoyaltyService following SERVICE_TEMPLATE.md pattern",
  "category": "skills",
  "entities": ["LoyaltyService", "points_ledger", "tier_status"],
  "metadata": {
    "service_file": "src/services/loyalty.service.ts",
    "pattern_used": "functional_factory",
    "referenced_docs": ["SERVICE_TEMPLATE.md", "SRM.md#loyalty-service"]
  }
}
```

#### Step 4: Next Session Recalls This
```python
# User: "Add a new reward tier to Loyalty"
# Memori auto-injects:
# - "LoyaltyService exists at src/services/loyalty.service.ts"
# - "Uses functional factory pattern"
# - "Relevant docs: SERVICE_TEMPLATE.md, SRM.md#loyalty-service"

# Agent knows exactly where to go and what pattern to follow
# No need to re-explain project structure or patterns
```

## Data Flow: Correct Usage

### Documentation Access Flow
```mermaid
graph LR
    A[User Query] --> B[Memori Recalls Context]
    B --> C{Need Fresh Docs?}
    C -->|Yes| D[Read from File System]
    C -->|No| E[Use Session Memory]
    D --> F[Agent Response]
    E --> F
    F --> G[Memori Records Learning]
```

### What Gets Stored Where

| Data Type | Storage | Reason |
|-----------|---------|--------|
| **SRM content** | File system | Static, canonical source of truth |
| **ADR decisions** | File system | Historical record, immutable |
| **Service templates** | File system | Reusable patterns |
| **Anti-patterns** | File system | Reference material |
| **Memory snapshots** | File system | Compressed context |
| | | |
| **User preferences** | Memori | User-specific, learned over time |
| **Session summaries** | Memori | What agent did in past sessions |
| **Project context** | Memori | Current work focus |
| **Learned patterns** | Memori | "User likes X, avoids Y" |
| **Task history** | Memori | "Created service X, fixed bug Y" |
| **Doc references** | Memori metadata | Pointers to relevant files |

## Refactored Memori Configuration

### Updated `.memori/config.yml`

```yaml
# Memori Configuration for PT-2 Project
# PURPOSE: Cross-session agent memory (NOT documentation storage)

database:
  url: "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
  schema: "memori"

environment: "development"

# Memory Modes
modes:
  # Conscious Mode: One-shot session context injection
  conscious_ingest: true

  # Auto Mode: Dynamic memory search per query
  auto_ingest: true

# Agent Namespaces (NOT for doc storage)
# These track agent learnings and session context PER service domain
contexts:
  - name: "pt2_agent"
    user_id: "pt2_agent"
    description: "Main agent session memory for PT-2 development"
    purpose: "Track decisions, learnings, user preferences, task history"

  - name: "mtl_agent"
    user_id: "mtl_agent"
    description: "Agent memory when working on MTL Service"
    purpose: "MTL-specific learnings, compliance patterns, threshold decisions"

  - name: "player_agent"
    user_id: "player_agent"
    description: "Agent memory when working on Player Service"
    purpose: "Player service patterns, identity management learnings"

# Documentation References (NOT content storage)
# These are POINTERS to docs, not the docs themselves
doc_references:
  architecture:
    - "docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md"
    - "docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md"
    - "memory/service-catalog.memory.md"

  security:
    - "docs/30-security/SEC-001-rls-policy-matrix.md"
    - "docs/30-security/SEC-002-casino-scoped-security-model.md"

  patterns:
    - "docs/patterns/SERVICE_TEMPLATE.md"
    - "docs/patterns/BALANCED_ARCHITECTURE_QUICK.md"

  anti_patterns:
    - "memory/anti-patterns.memory.md"

# Memory Categories (What Memori SHOULD store)
categories:
  - "facts"         # "MTLService handles CTR threshold detection"
  - "preferences"   # "User prefers functional factories"
  - "skills"        # "Agent can create services using SERVICE_TEMPLATE.md"
  - "rules"         # "Never use ReturnType inference (learned from code review)"
  - "context"       # "Currently working on MTL compliance features"

# Retrieval Settings
retrieval:
  max_results: 5              # Return top 5 session memories
  min_relevance: 0.6          # Quality threshold
  recency_weight: 0.5         # Heavily favor recent learnings

# Background Processing
background:
  conscious_interval: 3600    # Promote important memories every hour
  entity_extraction: true     # Extract service names, patterns, files
  relationship_mapping: true  # Map service → files → patterns

# Export Settings
export:
  sqlite_path: ".memori/export/session-memory.db"
```

## Implementation: Memori Integration in Claude Code

### Setup: Enable Memori for Agent Sessions

```python
# .claude/hooks/memori-setup.py
"""
Initialize Memori for cross-session agent memory.
Hook: on-session-start
"""
from memori import Memori
import os

# Initialize Memori for this session
memori = Memori(
    database_connect=os.getenv("MEMORI_DB_URL"),
    user_id="pt2_agent",
    conscious_ingest=True,
    auto_ingest=True,
    namespace="pt2_development"
)

# Enable automatic conversation recording
memori.enable()

# Record session start
memori.record_fact(
    fact=f"Started new development session for PT-2",
    category="context"
)
```

### Usage: Agent Recalls + Fetches Docs

```python
# When agent needs to work on a service
from memori import Memori

def work_on_service(service_name: str):
    # Step 1: Memori recalls session context
    memori = Memori(user_id="pt2_agent")

    # Get relevant session memories
    context = memori.search_memories(
        query=f"Working on {service_name}",
        category=["context", "skills", "facts"],
        limit=5
    )

    # Step 2: Extract doc references from metadata
    doc_refs = []
    for memory in context:
        refs = memory.get("metadata", {}).get("relevant_docs", [])
        doc_refs.extend(refs)

    # Step 3: Read actual documentation
    docs_content = {}
    for ref in set(doc_refs):
        docs_content[ref] = read_file(f"docs/{ref}")

    # Step 4: Work with fresh docs + session memory
    result = agent.execute_task(
        session_context=context,      # What agent learned before
        documentation=docs_content,    # Fresh source of truth
        task=f"Work on {service_name}"
    )

    # Step 5: Memori automatically records this session
    return result
```

### Example: Creating a Service

```python
# User asks: "Create MTL Service"

# Memori auto-injects:
# - [CONTEXT] "Project: PT-2 casino management system"
# - [PREFERENCE] "User prefers functional factories"
# - [RULE] "Always check SERVICE_RESPONSIBILITY_MATRIX.md for ownership"
# - [SKILL] "Agent knows how to use SERVICE_TEMPLATE.md"

# Agent logic:
1. Read SERVICE_TEMPLATE.md (fresh from file)
2. Read SRM.md section on MTL Service (fresh from file)
3. Apply learned preferences (from Memori)
4. Create service following template
5. Memori records: "Created MTLService at src/services/mtl.service.ts"

# Next session:
# User: "Add threshold detection to MTL"
# Memori injects: "MTLService exists at src/services/mtl.service.ts"
# Agent knows exactly where to go
```

## Benefits of Correct Architecture

### ✅ Memori (Session Memory)
- Fast cross-session continuity
- Agent remembers user preferences
- Tracks what was built and where
- No token waste on re-explaining
- Lightweight, focused memories

### ✅ File System (Documentation)
- Single source of truth
- Version controlled
- Easy to update
- Grep-able, searchable
- No duplication

### ✅ Hybrid (Best of Both)
- Memori points to relevant docs
- Agent fetches fresh content when needed
- Session memory provides context
- Documentation provides patterns
- Efficient token usage

## Migration Plan

### Phase 1: Clean Memori DB
```sql
-- Remove all static doc storage
DELETE FROM memori.memories
WHERE LENGTH(content) > 5000;  -- Remove whole-doc dumps

-- Keep only agent learnings
-- (user preferences, session summaries, project context)
```

### Phase 2: Seed Agent Context
```python
# Seed initial agent context (one-time)
memori = Memori(user_id="pt2_agent")

# Project context
memori.record_fact(
    fact="PT-2 is a casino management system with bounded context architecture",
    category="context",
    metadata={"relevant_docs": ["SERVICE_RESPONSIBILITY_MATRIX.md"]}
)

# Architecture preferences
memori.record_fact(
    fact="Use functional factories, not classes for services",
    category="preferences",
    metadata={"source": "CLAUDE.md"}
)

# Key rules
memori.record_fact(
    fact="Run npm run db:types after every migration",
    category="rules",
    metadata={"source": "CLAUDE.md"}
)
```

### Phase 3: Enable Session Recording
```python
# In Claude Code hooks
from memori import Memori

# on-session-start
memori = Memori(user_id="pt2_agent")
memori.enable()

# on-session-end
memori.trigger_conscious_analysis()  # Promote important learnings
```

### Phase 4: Agent Tool Integration
```python
# Create memory search tool
from memori import create_memory_tool

memory_tool = create_memory_tool(memori)

# Agent can search session memory
agent.register_tool("search_session_memory", memory_tool)

# Example usage:
# Agent: "What pattern should I use for services?"
# Tool: Searches Memori → "Use functional factories"
# Agent: Reads SERVICE_TEMPLATE.md → Applies pattern
```

## Success Metrics

### Memori Database
- Total memories: 100-500 (vs 285 now)
- Avg size: 100-300 chars (vs 86KB now)
- Categories: Balanced distribution
- Freshness: 80%+ from last 7 days

### Agent Efficiency
- Session startup: Instant context (< 300 tokens)
- Doc fetches: Only when needed (on-demand)
- Token usage: 95% reduction in context overhead
- Continuity: Agent remembers past 5-10 sessions

### User Experience
- No re-explaining project structure
- Agent knows where files are
- Agent follows learned preferences
- Faster iteration cycles

## Example Session Flow

```
Day 1:
User: "Create MTL Service"
Agent: Reads SRM.md, creates service
Memori: Records "Created MTLService at src/services/mtl.service.ts"

Day 2:
User: "Add CTR threshold detection"
Agent: Recalls "MTLService exists at src/services/mtl.service.ts"
Agent: Reads SRM.md for CTR threshold rules
Agent: Implements feature
Memori: Records "Added CTR threshold detection to MTLService"

Day 3:
User: "Fix the threshold bug"
Agent: Recalls "MTLService at src/services/mtl.service.ts has CTR threshold"
Agent: Knows exactly where to look
Agent: Fixes bug
Memori: Records "Fixed CTR threshold calculation bug"

Day 4:
User: "Create similar service for Player Financial"
Agent: Recalls "Used SERVICE_TEMPLATE.md for MTLService"
Agent: Recalls "User prefers functional factories"
Agent: Applies same pattern to new service
Memori: Records "Created PlayerFinancialService using same pattern as MTL"
```

## Conclusion

**Memori = Agent's brain for sessions**
**File system = Knowledge base for reference**
**Together = Efficient, continuous development**

Stop trying to make Memori a documentation database. Use it for what it's designed for: making agents remember conversations and learnings across sessions.
