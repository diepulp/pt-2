# Memori Use Cases

> **Primitive Document** - Practical patterns for using the 4-tier namespace hierarchy.

## Use Case 1: Recording Architectural Decisions

**When:** Making significant design choices that affect system architecture.

**Namespace:** `arch_decisions` (Tier 2, permanent)

```python
from lib.memori import create_memori_client

memori = create_memori_client("skill:lead-architect")
memori.enable()

memori.record_memory(
    content="Use Pattern A (Contract-First) for LoyaltyService due to complex business rules",
    category="skills",
    metadata={
        "type": "architectural_decision",
        "pattern": "Pattern A",
        "domain": "Loyalty",
        "rationale": "Complex business rules require explicit DTOs and validation",
        "alternatives_considered": ["Pattern B", "Pattern C"],
        "affected_services": ["LoyaltyService", "PlayerFinancialService"],
    },
    importance=0.9,
    tags=["architectural-decision", "Pattern-A", "domain:loyalty"]
)
```

**Query later:**
```bash
/memory-recall Pattern A Loyalty
```

---

## Use Case 2: Session Checkpoint Before /clear

**When:** Context usage exceeds 60% and you need to continue work after clearing.

**Namespace:** `session_{skill}_{YYYY_MM}` (Tier 4, 7-day TTL)

```python
from lib.memori import create_memori_client
from lib.memori.skill_context import ArchitectContext

memori = create_memori_client("skill:lead-architect")
memori.enable()
context = ArchitectContext(memori)

context.save_checkpoint(
    current_task="Implementing VisitService mutations",
    reason="context_threshold_60pct",
    decisions_made=[
        "Using optimistic locking for concurrent updates",
        "Separating read/write paths for performance",
    ],
    files_modified=[
        "services/visit/mutations.ts",
        "services/visit/queries.ts",
    ],
    next_steps=[
        "Add error handling for lock conflicts",
        "Write integration tests",
    ],
    key_insights=[
        "Supabase RPC works better than direct inserts for complex transactions",
    ]
)
```

**Restore after /clear:**
```bash
/arch-checkpoint restore
```

---

## Use Case 3: Recording Domain Knowledge

**When:** Learning project-specific conventions, business rules, or coding standards.

**Namespace:** `pt2_project` (Tier 1, permanent)

```python
from lib.memori import create_memori_client

memori = create_memori_client("main")  # or any general chatmode
memori.enable()

memori.record_memory(
    content="Gaming day in PT-2 runs from 6 AM to 6 AM next day, affecting all visit aggregations",
    category="facts",
    metadata={
        "type": "business_rule",
        "affects": ["visit", "rating_slip", "reporting"],
    },
    importance=0.8,
    tags=["domain:visit", "temporal", "business-rule"]
)
```

**Cross-domain search:**
```sql
SELECT content, metadata
FROM memori.memories
WHERE user_id = 'pt2_project'
  AND metadata->'tags' ? 'domain:visit';
```

---

## Use Case 4: Recording Documentation Regressions

**When:** Finding inconsistencies between docs and implementation.

**Namespace:** `arch_decisions` (Tier 2, permanent)

```python
from lib.memori import create_memori_client
from lib.memori.skill_context import ArchitectContext

memori = create_memori_client("skill:lead-architect")
memori.enable()
context = ArchitectContext(memori)

context.record_documentation_regression(
    regression_type="schema_drift",
    affected_docs=[
        "docs/25-api-data/schemas/player.schema.ts",
        "docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md",
    ],
    description="SRM shows player.loyalty_tier but schema has loyalty_level",
    resolution="Updated SRM to match implementation (loyalty_level)",
    rectification_approach="aligned_with_implementation",
    lessons_learned=[
        "Always regenerate types after schema changes",
        "SRM should be auto-generated from schema",
    ]
)
```

---

## Use Case 5: Tracking MVP Progress

**When:** Completing service implementations or phase milestones.

**Namespace:** `mvp_progress` (Tier 3, operational)

```python
from lib.memori import create_memori_client
from lib.memori.mvp_progress_context import MVPProgressContext

memori = create_memori_client("skill:mvp-progress")
memori.enable()
context = MVPProgressContext(memori)

# Record service completion
context.record_service_completion(
    service_name="VisitService",
    files_created=[
        "services/visit/index.ts",
        "services/visit/queries.ts",
        "services/visit/mutations.ts",
    ],
    test_coverage=85,
    prd_reference="PRD-001"
)

# Record phase transition
context.record_milestone_transition(
    phase_number=1,
    new_status="completed",
    services_completed=["CasinoService", "PlayerService", "VisitService"]
)
```

**Check progress:**
```bash
/mvp-status
```

---

## Use Case 6: Recording Pattern Effectiveness

**When:** Completing a skill execution to track what works.

**Namespace:** `arch_decisions` (Tier 2, permanent)

```python
from lib.memori import create_memori_client
from lib.memori.skill_context import SkillContext

memori = create_memori_client("skill:backend-service-builder")
memori.enable()
context = SkillContext(memori)

context.record_skill_execution(
    skill_name="backend-service-builder",
    task="Create RatingSlipService with Pattern B",
    outcome="success",
    pattern_used="Pattern B",
    files_created=[
        "services/rating-slip/index.ts",
        "services/rating-slip/types.ts",
    ],
    duration_seconds=1800,
    lessons_learned=[
        "Pattern B works well for CRUD-heavy services",
    ],
    user_satisfaction="approved"
)
```

**Query pattern effectiveness:**
```bash
/backend-status
```

---

## Use Case 7: Recording UI Patterns

**When:** Establishing design patterns for frontend consistency.

**Namespace:** `pt2_project` (Tier 1, permanent)

```python
from lib.memori import create_memori_client

memori = create_memori_client("skill:frontend-design")
memori.enable()

memori.record_memory(
    content="Use shadcn/ui DataTable with @tanstack/react-virtual for tables > 100 rows",
    category="skills",
    metadata={
        "type": "ui_pattern",
        "component": "DataTable",
        "applies_to": ["player-list", "rating-slip-list", "visit-history"],
    },
    importance=0.7,
    tags=["ui-pattern", "performance", "table"]
)
```

---

## Use Case 8: Querying Past Decisions

**When:** Starting work on a feature where prior decisions may apply.

```python
from lib.memori import create_memori_client
from lib.memori.skill_context import ArchitectContext

memori = create_memori_client("skill:lead-architect")
memori.enable()
context = ArchitectContext(memori)

# Query architectural decisions
decisions = context.query_past_decisions(
    query="service layer pattern",
    domain="Loyalty",
    limit=5
)

for d in decisions:
    print(f"[{d['relevance']:.2f}] {d['content']}")
```

**Or via slash command:**
```bash
/memory-recall service layer Loyalty
```

---

## Use Case 9: Cleanup Expired Checkpoints

**When:** Maintaining database hygiene (weekly or monthly).

```bash
# Preview what would be deleted
/memori-cleanup preview

# Actually delete expired entries
/memori-cleanup execute
```

**Automated (cron):**
```bash
0 3 * * * docker exec supabase_db_pt-2 psql -U postgres -d postgres -c \
  "DELETE FROM memori.memories WHERE expires_at IS NOT NULL AND expires_at <= NOW();"
```

---

## Use Case 10: Cross-Namespace Status Check

**When:** Understanding the current state of all Memori data.

```bash
/memori-status
```

**Output includes:**
- Namespace hierarchy with memory counts
- TTL status (active vs expired)
- Category distribution
- Recent activity
- Session checkpoint status

---

## Decision Tree: Which Namespace?

```
Is it a session checkpoint for resuming after /clear?
├── Yes → Tier 4: session_{skill}_{YYYY_MM}
│         (if skill supports TTL checkpoints)
│
└── No → Is it an architectural decision or pattern?
         ├── Yes → Tier 2: arch_decisions
         │
         └── No → Is it MVP progress tracking?
                  ├── Yes → Tier 3: mvp_progress
                  │
                  └── No → Tier 1: pt2_project
                           (domain knowledge, standards, UI patterns)
```
