# Memori Documentation Index

> **Primitive Documents** for the PT-2 cross-session memory system.

## Documents

| Document | Description |
|----------|-------------|
| [NAMESPACE_HIERARCHY.md](./NAMESPACE_HIERARCHY.md) | 4-tier namespace structure, chatmode mappings, schema |
| [USE_CASES.md](./USE_CASES.md) | Practical patterns for recording and querying memories |
| [TTL_MECHANISM.md](./TTL_MECHANISM.md) | Session checkpoint expiration and cleanup |

## Quick Reference

### Namespace Hierarchy

| Tier | Namespace | TTL | Purpose |
|------|-----------|-----|---------|
| 1 | `pt2_project` | Permanent | Standards, domain knowledge, UI patterns |
| 2 | `arch_decisions` | Permanent | Architectural decisions, patterns |
| 3 | `mvp_progress` | Operational | MVP tracking |
| 4 | `session_*_{YYYY_MM}` | 7 days | Session checkpoints |

### Slash Commands

| Command | Purpose |
|---------|---------|
| `/memori-status` | Show namespace hierarchy and counts |
| `/memori-cleanup` | Purge expired checkpoints |
| `/arch-memory` | Query architectural decisions |
| `/memory-recall <query>` | Search memories |
| `/mvp-status` | MVP implementation progress |
| `/arch-checkpoint save\|restore` | Lead architect checkpoints |
| `/backend-checkpoint save\|restore` | Backend builder checkpoints |
| `/api-checkpoint save\|restore` | API builder checkpoints |
| `/frontend-checkpoint save\|restore` | Frontend design checkpoints |
| `/skill-checkpoint save\|restore` | Skill creator checkpoints |

### Python API

```python
from lib.memori import create_memori_client

# Initialize for a specific skill/chatmode
memori = create_memori_client("skill:lead-architect")
memori.enable()

# Record memory
memori.record_memory(
    content="Decision content here",
    category="skills",  # facts, preferences, skills, rules, context
    metadata={"type": "architectural_decision", ...},
    importance=0.9,
    tags=["tag1", "tag2"]
)

# Search memories
results = memori.search_learnings(
    query="pattern A",
    tags=["architectural-decision"],
    limit=10
)
```

### Context Classes

| Class | Skill | Checkpoint Location |
|-------|-------|---------------------|
| `ArchitectContext` | `skill:lead-architect` | `session_lead_architect_{YYYY_MM}` |
| `BackendServiceContext` | `skill:backend-service-builder` | `session_backend_{YYYY_MM}` |
| `SkillContext` | `skill:api-builder` | `session_api_{YYYY_MM}` |
| `SkillContext` | `skill:frontend-design` | `pt2_project` (permanent) |
| `SkillContext` | `skill:skill-creator` | `pt2_project` (permanent) |

## Migration History

- **2024-12-07:** Consolidated 7 namespaces → 4-tier hierarchy with TTL support
