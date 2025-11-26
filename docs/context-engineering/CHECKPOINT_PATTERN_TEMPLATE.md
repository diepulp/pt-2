# Context Checkpoint Pattern

**Date:** 2025-11-25
**Status:** Implemented for lead-architect skill
**Applies To:** Skills, Chatmodes, Long-running Agents

---

## Overview

This pattern enables session continuity across `/clear` commands by persisting work state to Memori before context window reset and restoring it afterward.

**Problem Solved:** Long-running agent sessions exhaust context windows. Without checkpointing, clearing context loses all session state and work progress.

**Solution:** Checkpoint-based persistence with structured metadata stored in Memori namespace.

---

## Pattern Components

### 1. Threshold Detection

Monitor context usage and trigger checkpoint at configurable threshold (default: 60%).

```python
# Announce threshold reached
"""
⚠️ Context Usage Alert: Approaching 60% threshold.
Recommend saving checkpoint before /clear to preserve session state.
"""
```

### 2. Checkpoint Save

Persist current work state to Memori with high importance for reliable retrieval.

```python
def save_checkpoint(
    self,
    current_task: str,
    reason: str = "manual",  # context_threshold_60pct, manual, session_end
    decisions_made: Optional[List[str]] = None,
    files_modified: Optional[List[str]] = None,
    validation_gates_passed: Optional[List[int]] = None,
    open_questions: Optional[List[str]] = None,
    next_steps: Optional[List[str]] = None,
    key_insights: Optional[List[str]] = None,
    spec_file: Optional[str] = None,
    workflow: Optional[str] = None,
    notes: Optional[str] = None
) -> bool:
    """Save session checkpoint before context clear."""

    metadata = {
        "type": "session_checkpoint",
        "checkpoint_reason": reason,
        "current_task": current_task,
        "timestamp": datetime.now().isoformat(),
        # ... additional fields
    }

    return self.memori.record_memory(
        content=f"Session checkpoint ({reason}): {current_task}",
        category="context",
        metadata=metadata,
        importance=0.95,  # High importance for reliable retrieval
        tags=["session-checkpoint", reason]
    )
```

### 3. Checkpoint Load

Retrieve the most recent checkpoint for the namespace.

```python
def load_latest_checkpoint(self) -> Optional[Dict[str, Any]]:
    """Load the most recent session checkpoint."""

    # Query: metadata->>'type' = 'session_checkpoint'
    # Order: created_at DESC
    # Limit: 1
```

### 4. Context Formatting

Format checkpoint as markdown for injection into fresh context.

```python
def format_checkpoint_for_resume(self, checkpoint: Optional[Dict] = None) -> str:
    """Format checkpoint as markdown for context injection."""

    # Returns structured markdown with:
    # - Current task
    # - Decisions made
    # - Files modified
    # - Validation gates passed
    # - Open questions
    # - Next steps
    # - Key insights
```

---

## Checkpoint Metadata Schema

```json
{
  "type": "session_checkpoint",
  "checkpoint_reason": "context_threshold_60pct | manual | session_end",
  "current_task": "Description of current task",
  "timestamp": "ISO 8601 timestamp",
  "decisions_made": ["Decision 1", "Decision 2"],
  "files_modified": ["path/to/file1", "path/to/file2"],
  "validation_gates_passed": [1, 2, 3],
  "open_questions": ["Unresolved question?"],
  "next_steps": ["Next action 1", "Next action 2"],
  "key_insights": ["Important learning from session"],
  "spec_file": "path/to/spec.md",
  "workflow": "workflow-name",
  "notes": "Additional context"
}
```

---

## Slash Command Template

Create a checkpoint management command for each primitive.

```markdown
---
description: Save or restore [PRIMITIVE] session checkpoint for context continuity
args:
  - name: action
    description: "save" to checkpoint, "restore" to resume
    required: true
---

# [Primitive] Session Checkpoint

## save - Checkpoint Current Session

[Python code to gather state and save checkpoint]

## restore - Resume from Checkpoint

[Python code to load and display checkpoint]

## SQL Queries

[Database queries for viewing checkpoints]
```

---

## Implementation Checklist

When applying this pattern to a new primitive:

### 1. Context Class Updates

- [ ] Add `save_checkpoint()` method
- [ ] Add `load_latest_checkpoint()` method
- [ ] Add `format_checkpoint_for_resume()` method
- [ ] Add `get_checkpoint_count()` helper method

### 2. Namespace Registration

- [ ] Register namespace in `lib/memori/client.py` CHATMODE_USER_IDS
- [ ] Update hook mapping in `.claude/hooks/skill-init-memori.sh` (if skill)

### 3. SKILL.md / Chatmode Updates

- [ ] Add "Context Threshold Management" section
- [ ] Add checkpoint workflow diagram
- [ ] Add to "Definition of Done" checklist
- [ ] Add quick reference for checkpoint methods

### 4. Slash Command

- [ ] Create `/[primitive]-checkpoint.md` command
- [ ] Include save and restore actions
- [ ] Include SQL query examples

### 5. Documentation

- [ ] Update SESSION_HANDOFF_SKILL_MEMORY_FIXES.md
- [ ] Update relevant handoff documents

---

## Reason Codes

| Code | When to Use |
|------|-------------|
| `context_threshold_60pct` | Automatic trigger when context usage high |
| `manual` | User-initiated or natural breakpoint |
| `session_end` | End of work session |
| `phase_complete` | Workflow phase completed |
| `before_handoff` | Before agent handoff to another chatmode |

---

## Database Queries

### View Latest Checkpoint

```sql
SELECT
    content,
    metadata->>'current_task' as task,
    metadata->>'checkpoint_reason' as reason,
    metadata->>'next_steps' as next_steps,
    created_at
FROM memori.memories
WHERE user_id = '[NAMESPACE]'
  AND metadata->>'type' = 'session_checkpoint'
ORDER BY created_at DESC
LIMIT 1;
```

### View All Checkpoints

```sql
SELECT
    LEFT(metadata->>'current_task', 60) as task,
    metadata->>'checkpoint_reason' as reason,
    created_at
FROM memori.memories
WHERE user_id = '[NAMESPACE]'
  AND metadata->>'type' = 'session_checkpoint'
ORDER BY created_at DESC
LIMIT 10;
```

### Count Checkpoints

```sql
SELECT COUNT(*) as checkpoint_count
FROM memori.memories
WHERE user_id = '[NAMESPACE]'
  AND metadata->>'type' = 'session_checkpoint';
```

---

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  LONG-RUNNING SESSION                                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Working on task...                                       │
│     ├── Making decisions                                     │
│     ├── Modifying files                                      │
│     └── Passing validation gates                             │
│                                                              │
│  2. Context approaching threshold                            │
│     └── ⚠️ Announce threshold alert                          │
│                                                              │
│  3. /[primitive]-checkpoint save                             │
│     └── ✅ Checkpoint persisted to Memori                    │
│                                                              │
│  4. /clear                                                   │
│     └── Context window reset                                 │
│                                                              │
│  5. /[primitive]-checkpoint restore                          │
│     └── 🔄 Session context restored                          │
│                                                              │
│  6. Continue from next_steps...                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Reference Implementation

### Skills

**Context class (shared):** `lib/memori/skill_context.py` → `SkillContext` (checkpoint methods)

| Skill | Slash Command | SKILL.md |
|-------|--------------|----------|
| lead-architect | `.claude/commands/arch-checkpoint.md` | `.claude/skills/lead-architect/SKILL.md` |
| backend-service-builder | `.claude/commands/backend-checkpoint.md` | `.claude/skills/backend-service-builder/SKILL.md` |
| frontend-design | `.claude/commands/frontend-checkpoint.md` | `.claude/skills/frontend-design/SKILL.md` |
| skill-creator | `.claude/commands/skill-checkpoint.md` | `.claude/skills/skill-creator/SKILL.md` |

**Note:** `ArchitectContext` in `skill_context.py` extends `SkillContext` with architect-specific methods.

### Chatmodes

**Context class (shared):** `lib/memori/chatmode_context.py` → `ChatmodeContext` (checkpoint methods)

| Chatmode | Slash Command | Namespace |
|----------|--------------|-----------|
| architect | `.claude/commands/chatmode-architect-checkpoint.md` | `pt2_architect` |
| service-engineer | `.claude/commands/chatmode-service-checkpoint.md` | `service_engineer` |

---

## Primitives To Apply

| Primitive | Namespace | Status |
|-----------|-----------|--------|
| lead-architect | `skill_lead_architect` | ✅ Implemented |
| backend-service-builder | `skill_backend_service_builder` | ✅ Implemented |
| frontend-design | `skill_frontend_design` | ✅ Implemented |
| skill-creator | `skill_skill_creator` | ✅ Implemented |
| architect chatmode | `pt2_architect` | ✅ Implemented |
| service-engineer chatmode | `service_engineer` | ✅ Implemented |
