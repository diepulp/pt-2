# BackendServiceContext Manual Workflow

**Date:** 2025-11-26
**Status:** Operational
**Applies To:** backend-service-builder skill

---

## Overview

`BackendServiceContext` is a Self-Improving Intelligence system for the `backend-service-builder` skill. It provides:

1. **Session Checkpointing** - Persist/restore work state across `/clear`
2. **Pattern Effectiveness Tracking** - Track success rates for Pattern A/B/C
3. **Adaptive Recommendations** - Weight suggestions by historical success
4. **Primitive Evolution Engine** - Propose updates to reference docs
5. **Regression Detection** - Alert when patterns deteriorate
6. **User Feedback Integration** - Learn from corrections

**Current Automation Level:** All features require **manual invocation**. There is no automatic triggering of checkpoints or surfacing of proposals.

---

## Quick Reference Commands

| Command | Purpose |
|---------|---------|
| `/backend-status` | View learning state, regressions, pending proposals |
| `/backend-checkpoint save` | Save session state before `/clear` |
| `/backend-checkpoint restore` | Resume session after `/clear` |

---

## Manual Workflow

### Phase 1: Session Start

When starting a backend service task:

```bash
# 1. Check current learning state
/backend-status

# Review output for:
# - Pattern effectiveness (which patterns are succeeding)
# - Regression alerts (patterns needing attention)
# - Pending proposals (reference doc updates to review)
# - Anti-patterns emerging (recurring validation errors)
```

**Decision Point:** If regressions or proposals exist, address them before starting new work.

---

### Phase 2: During Development

The validation scripts automatically record findings to Memori:

| Script | Records |
|--------|---------|
| `validate_service_structure.py` | Anti-pattern detections, validation failures |
| `check_doc_consistency.py` | Documentation drift, SRM conflicts |

**Auto-Proposal Trigger:** When `check_doc_consistency.py` detects 3+ errors of the same category, it auto-proposes a primitive update.

**Manual Recording:** Record skill execution outcomes explicitly:

```python
from lib.memori import create_memori_client, BackendServiceContext

memori = create_memori_client("skill:backend-service-builder")
memori.enable()
context = BackendServiceContext(memori)

# After completing a service implementation
context.record_skill_execution(
    skill_name="backend-service-builder",
    task="Create LoyaltyService",
    outcome="success",  # or "failure", "partial"
    pattern_used="Pattern A (Contract-First)",
    validation_results={
        "structure_valid": True,
        "doc_consistency": True,
        "cross_context_violations": 0
    },
    files_created=[
        "services/loyalty/keys.ts",
        "services/loyalty/dtos.ts",
        "services/loyalty/mappers.ts"
    ],
    issues_encountered=["Initially missed mappers.ts"],
    lessons_learned=["Pattern A now requires mappers.ts per SLAD"]
)
```

---

### Phase 3: Context Management

**When context approaches 60%** (you'll need to monitor this manually):

```bash
# Save checkpoint before clearing
/backend-checkpoint save

# Clear context
/clear

# Restore checkpoint
/backend-checkpoint restore
```

**Checkpoint contains:**
- Current task
- Service name and pattern
- Decisions made
- Files modified
- Validation gates passed
- Open questions
- Next steps
- Key insights

---

### Phase 4: Review & Learning

**After completing significant work, review the learning state:**

```bash
# Quick status check
/backend-status
```

**For detailed learning report:**

```python
from lib.memori import create_memori_client, BackendServiceContext

memori = create_memori_client("skill:backend-service-builder")
memori.enable()
context = BackendServiceContext(memori)

# Generate learning report
report = context.format_learning_report()
print(report)
```

**Sample Learning Report:**
```
# Backend Service Builder - Learning Report

**Generated:** 2025-11-26 14:30

## Pattern Effectiveness

- **Pattern A**: 87% success (23 executions) 📈
- **Pattern B**: 92% success (45 executions) ➡️
- **Pattern C**: 78% success (12 executions) 📉

## ⚠️ Regressions Detected

- Pattern C: declined 15.2%

## 📋 Pending Primitive Updates: 2

## Recommendations

- **Most Reliable Pattern:** Pattern B
- **Needs Attention:** Pattern C
```

---

### Phase 5: Review Pending Proposals

**List pending proposals:**

```python
proposals = context.get_pending_primitive_updates()

for p in proposals:
    print(f"[{p.id}] {p.primitive_file}")
    print(f"  Type: {p.update_type}")
    print(f"  Proposal: {p.proposal}")
    print(f"  Confidence: {p.confidence:.0%}")
    print(f"  Evidence: {len(p.evidence_ids)} supporting memories")
```

**Review and decide:**

```python
# Approve a proposal
context.update_proposal_status(
    proposal_id="prop_abc123",
    status="approved",
    reviewer_notes="Applied in commit xyz"
)

# Reject a proposal
context.update_proposal_status(
    proposal_id="prop_def456",
    status="rejected",
    reviewer_notes="False positive - documentation is correct"
)
```

**After approval:** Manually update the referenced primitive file and mark as "applied".

---

### Phase 6: User Corrections

**When you override a recommendation:**

```python
context.record_user_correction(
    original_recommendation="Pattern B",
    user_choice="Pattern A",
    context={"domain": "finance", "complexity": "high"},
    reason="Business rules more complex than initially apparent"
)
```

This feeds back into the adaptive recommendation system.

---

## Data Persistence

All data persists in PostgreSQL (`memori.memories` table):

| Memory Type | user_id | Persists Across |
|-------------|---------|-----------------|
| `session_checkpoint` | `skill_backend_service_builder` | Sessions, `/clear` |
| `skill_execution` | `skill_backend_service_builder` | Sessions |
| `validation_finding` | `skill_backend_service_builder` | Sessions |
| `primitive_proposal` | `skill_backend_service_builder` | Sessions |
| `user_correction` | `skill_backend_service_builder` | Sessions |

---

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    BACKEND SERVICE BUILDER WORKFLOW                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐                                                     │
│  │ SESSION START   │                                                     │
│  │                 │                                                     │
│  │ /backend-status │◄─── Check learning state, regressions, proposals   │
│  └────────┬────────┘                                                     │
│           │                                                              │
│           ▼                                                              │
│  ┌─────────────────┐                                                     │
│  │ DEVELOPMENT     │                                                     │
│  │                 │                                                     │
│  │ • Create service│                                                     │
│  │ • Run validation│───► Findings auto-recorded to Memori               │
│  │ • Fix issues    │                                                     │
│  └────────┬────────┘                                                     │
│           │                                                              │
│           ▼                                                              │
│  ┌─────────────────┐                                                     │
│  │ CONTEXT ~60%?   │                                                     │
│  │                 │                                                     │
│  │ Yes ─► /backend-│                                                     │
│  │        checkpoint│                                                    │
│  │        save     │                                                     │
│  │        /clear   │                                                     │
│  │        /backend-│                                                     │
│  │        checkpoint│                                                    │
│  │        restore  │                                                     │
│  └────────┬────────┘                                                     │
│           │                                                              │
│           ▼                                                              │
│  ┌─────────────────┐                                                     │
│  │ RECORD OUTCOME  │                                                     │
│  │                 │                                                     │
│  │ context.record_ │───► Execution outcome saved to Memori              │
│  │ skill_execution │                                                     │
│  └────────┬────────┘                                                     │
│           │                                                              │
│           ▼                                                              │
│  ┌─────────────────┐                                                     │
│  │ REVIEW LEARNING │                                                     │
│  │                 │                                                     │
│  │ /backend-status │───► View regressions, proposals                    │
│  │ format_learning │                                                     │
│  │ _report()       │                                                     │
│  └────────┬────────┘                                                     │
│           │                                                              │
│           ▼                                                              │
│  ┌─────────────────┐                                                     │
│  │ REVIEW PROPOSALS│                                                     │
│  │                 │                                                     │
│  │ get_pending_    │                                                     │
│  │ primitive_      │                                                     │
│  │ updates()       │                                                     │
│  │                 │                                                     │
│  │ Approve/Reject  │───► Update reference docs if approved              │
│  └─────────────────┘                                                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## What's NOT Automated

| Feature | Status | Manual Action Required |
|---------|--------|------------------------|
| Context threshold detection | ❌ Not automated | Monitor context manually |
| Checkpoint save trigger | ❌ Not automated | Run `/backend-checkpoint save` |
| Proposal surfacing on session start | ❌ Not automated | Run `/backend-status` |
| Learning report generation | ❌ Not automated | Run `format_learning_report()` |
| Regression alerts | ❌ Not automated | Run `/backend-status` or `detect_pattern_regressions()` |
| Proposal application | ❌ Not automated | Manually edit primitive files |

---

## Inheritance & Architecture

```
MemoriClient (lib/memori/client.py)
    │
    ▼
ValidationContext (lib/memori/skill_context.py)
    │  ├── record_validation_finding()
    │  ├── record_validation_session()
    │  ├── query_past_violations()
    │  └── suggest_fix_from_history()
    │
    ▼
BackendServiceContext (lib/memori/backend_service_context.py)
       ├── Session Checkpointing
       │   ├── save_checkpoint()
       │   ├── load_latest_checkpoint()
       │   └── format_checkpoint_for_resume()
       │
       ├── Pattern Effectiveness
       │   ├── calculate_pattern_effectiveness()
       │   ├── get_all_pattern_stats()
       │   └── get_recommended_pattern()
       │
       ├── Primitive Evolution
       │   ├── propose_primitive_update()
       │   ├── get_pending_primitive_updates()
       │   └── update_proposal_status()
       │
       ├── Regression Detection
       │   ├── detect_pattern_regressions()
       │   └── detect_anti_pattern_emergence()
       │
       ├── User Feedback
       │   ├── record_user_correction()
       │   └── record_execution_outcome_feedback()
       │
       └── Analytics
           ├── get_learning_summary()
           └── format_learning_report()
```

---

## Database Queries

### View All Execution Outcomes

```sql
SELECT
    metadata->>'task' as task,
    metadata->>'outcome' as outcome,
    metadata->>'pattern_used' as pattern,
    created_at
FROM memori.memories
WHERE user_id = 'skill_backend_service_builder'
  AND metadata->>'type' = 'skill_execution'
ORDER BY created_at DESC
LIMIT 20;
```

### View Pending Proposals

```sql
SELECT
    metadata->>'proposal_id' as id,
    metadata->>'primitive_file' as file,
    metadata->>'proposal' as proposal,
    metadata->>'confidence' as confidence,
    created_at
FROM memori.memories
WHERE user_id = 'skill_backend_service_builder'
  AND metadata->>'type' = 'primitive_proposal'
  AND metadata->>'status' = 'pending'
ORDER BY created_at DESC;
```

### View User Corrections

```sql
SELECT
    metadata->>'original_recommendation' as original,
    metadata->>'user_choice' as chosen,
    metadata->>'reason' as reason,
    created_at
FROM memori.memories
WHERE user_id = 'skill_backend_service_builder'
  AND metadata->>'type' = 'user_correction'
ORDER BY created_at DESC;
```

---

## Future Automation Opportunities

| Feature | Implementation Approach |
|---------|------------------------|
| Auto-checkpoint at 60% | Hook on context threshold event |
| Surface proposals on restore | Add to `/backend-checkpoint restore` output |
| Weekly learning digest | Scheduled job to generate report |
| Slack/email regression alerts | Webhook integration on regression detection |

---

## References

- **Context Class:** `lib/memori/backend_service_context.py`
- **Commands:** `.claude/commands/backend-checkpoint.md`, `.claude/commands/backend-status.md`
- **Skill:** `.claude/skills/backend-service-builder/SKILL.md`
- **Validation Scripts:** `.claude/skills/backend-service-builder/scripts/`
- **Checkpoint Pattern:** `docs/context-engineering/CHECKPOINT_PATTERN_TEMPLATE.md`
- **Self-Improving Pattern:** `docs/context-engineering/SELF_IMPROVING_INTELLIGENCE_PATTERN.md`
