# Memori Namespace Hierarchy

> **Primitive Document** - Defines the 4-tier namespace structure for PT-2 cross-session memory.

## Overview

Memori uses a consolidated 4-tier namespace hierarchy to organize memories by purpose and retention policy.

```
┌─────────────────────────────────────────────────────────────────┐
│ Tier 1: pt2_project (Permanent)                                 │
│   Project standards, domain knowledge, UI patterns              │
├─────────────────────────────────────────────────────────────────┤
│ Tier 2: arch_decisions (Permanent)                              │
│   Architectural decisions, patterns, compliance designs         │
├─────────────────────────────────────────────────────────────────┤
│ Tier 3: mvp_progress (Operational)                              │
│   MVP tracking, phase milestones, service status                │
├─────────────────────────────────────────────────────────────────┤
│ Tier 4: session_{skill}_{YYYY_MM} (Ephemeral, 7-day TTL)        │
│   Session checkpoints for context continuity across /clear      │
└─────────────────────────────────────────────────────────────────┘
```

## Tier Definitions

### Tier 1: `pt2_project`

**Purpose:** Project-level standards and domain knowledge that applies across all skills and sessions.

**Retention:** Permanent (no expiration)

**Contains:**
- Project coding standards and conventions
- Domain glossary and business rules
- UI/UX patterns and design decisions
- Merged domain knowledge (formerly separate `mtl_agent`, `player_agent`)

**Written by:**
- `skill:frontend-design`
- `skill:skill-creator`
- General chatmodes (service-engineer, documenter, frontend-dev, backend-dev)

**Tags used:**
- `domain:mtl`, `domain:player`, `domain:loyalty`, `domain:visit`
- `ui-pattern`, `coding-standard`

---

### Tier 2: `arch_decisions`

**Purpose:** Architectural decisions that shape the system design and should be preserved long-term.

**Retention:** Permanent (no expiration)

**Contains:**
- Architectural decisions (ADRs)
- Pattern selections (Pattern A/B/C)
- Documentation regressions and resolutions
- Technical debt assessments
- Compliance and security designs
- Skill execution outcomes and learnings

**Written by:**
- `skill:lead-architect`
- `skill:backend-service-builder`
- `skill:api-builder`
- `architect` chatmode

**Memory types:**
- `architectural_decision`
- `pattern_selection`
- `documentation_regression`
- `tech_debt`
- `compliance_design`
- `skill_execution`
- `primitive_proposal`

---

### Tier 3: `mvp_progress`

**Purpose:** Track MVP implementation progress across phases.

**Retention:** Operational (kept for project duration)

**Contains:**
- Service implementation status
- Phase milestone transitions
- PRD status tracking
- Velocity metrics

**Written by:**
- `skill:mvp-progress`

**Memory types:**
- `service_status`
- `milestone_transition`
- `prd_status`
- `velocity_update`

---

### Tier 4: `session_{skill}_{YYYY_MM}`

**Purpose:** Ephemeral session checkpoints for context continuity across `/clear` operations.

**Retention:** 7-day TTL (automatic expiration via `expires_at` field)

**Namespace patterns:**
- `session_lead_architect_2024_12`
- `session_backend_2024_12`
- `session_api_2024_12`

**Contains:**
- Current task state
- Decisions made in session
- Files modified
- Open questions
- Next steps
- Key insights

**Written by:**
- `skill:lead-architect`
- `skill:backend-service-builder`
- `skill:api-builder`

**Memory types:**
- `session_checkpoint`

---

## Chatmode to Namespace Mapping

```python
CHATMODE_USER_IDS = {
    # Tier 1: Project namespace
    "service-engineer": "pt2_project",
    "documenter": "pt2_project",
    "backend-dev": "pt2_project",
    "frontend-dev": "pt2_project",
    "reviewer": "pt2_project",
    "main": "pt2_project",
    "skill:frontend-design": "pt2_project",
    "skill:skill-creator": "pt2_project",

    # Tier 2: Architecture decisions
    "architect": "arch_decisions",
    "skill:lead-architect": "arch_decisions",
    "skill:backend-service-builder": "arch_decisions",
    "skill:api-builder": "arch_decisions",

    # Tier 3: MVP progress
    "skill:mvp-progress": "mvp_progress",
}
```

---

## Session Checkpoint Skills

Only certain skills support session checkpoints with 7-day TTL:

```python
SESSION_CHECKPOINT_SKILLS = {
    "skill:lead-architect": "lead_architect",      # → session_lead_architect_{YYYY_MM}
    "skill:backend-service-builder": "backend",    # → session_backend_{YYYY_MM}
    "skill:api-builder": "api",                    # → session_api_{YYYY_MM}
}
```

Skills NOT in this list (frontend-design, skill-creator) use permanent namespaces for checkpoints.

---

## Cross-Domain Search via Tags

Domain knowledge is searchable across the merged `pt2_project` namespace using tags:

| Tag | Domain |
|-----|--------|
| `domain:mtl` | Marker Tracking Log |
| `domain:player` | Player management |
| `domain:loyalty` | Loyalty rewards |
| `domain:visit` | Visit/session tracking |

**Query example:**
```sql
SELECT * FROM memori.memories
WHERE user_id = 'pt2_project'
  AND metadata->'tags' ? 'domain:player';
```

---

## Database Schema

```sql
CREATE TABLE memori.memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,           -- Namespace (tier-based)
    content TEXT NOT NULL,           -- Memory content (100-300 chars ideal)
    category TEXT NOT NULL,          -- facts, preferences, skills, rules, context
    metadata JSONB DEFAULT '{}',     -- Structured data (type, tags, importance)
    embedding VECTOR(1536),          -- OpenAI ada-002 embedding
    expires_at TIMESTAMPTZ,          -- TTL expiration (NULL = permanent)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for TTL cleanup
CREATE INDEX idx_memories_expires_at ON memori.memories(expires_at)
WHERE expires_at IS NOT NULL;
```

---

## Related Commands

| Command | Purpose |
|---------|---------|
| `/memori-status` | Show namespace hierarchy and memory counts |
| `/memori-cleanup` | Purge expired session checkpoints |
| `/arch-memory` | Query architectural decisions |
| `/memory-recall <query>` | Search memories by topic |
| `/mvp-status` | Show MVP implementation progress |

---

## Migration History

**2024-12-07:** Consolidated from 7 fragmented namespaces to 4-tier hierarchy:
- Merged `mtl_agent`, `player_agent` → `pt2_project` with domain tags
- Merged `pt2_agent`, `pt2_architect` → `pt2_project` and `arch_decisions`
- Renamed `skill_mvp_progress` → `mvp_progress`
- Added session checkpoints with 7-day TTL via `expires_at` field
