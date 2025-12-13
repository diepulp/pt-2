# Memori Integration for Frontend Design Skill

**When to read**: Reference this file when tracking design decisions across sessions or when context approaches 60% and checkpoint persistence is needed.

**Prerequisites**: Memori system must be configured. Skip this guidance if Memori is unavailable.

---

## Memory Activation Model

Memory is **automatically activated** when this skill is invoked via the `Skill` tool.

**How automatic activation works:**
1. `PreToolUse` hook detects `Skill` tool invocation
2. `skill-init-memori.sh` extracts skill name and initializes namespace
3. Memori client is enabled for `skill_frontend_design` namespace
4. All subsequent `record_memory()` calls in this session use the skill namespace

**Manual activation** (if needed outside skill invocation):

```python
from lib.memori import create_memori_client, SkillContext

memori = create_memori_client("skill:frontend-design")
memori.enable()  # Required for manual initialization
context = SkillContext(memori)
```

---

## Skill Execution Tracking

Record complete execution outcomes after frontend implementation:

```python
from lib.memori import create_memori_client, SkillContext

# Initialize Memori for this skill
memori = create_memori_client("skill:frontend-design")
memori.enable()  # REQUIRED: Activates memory recording
context = SkillContext(memori)

# Record skill execution outcome
context.record_skill_execution(
    skill_name="frontend-design",
    task="Create PlayerLookupTable component",
    outcome="success",  # or "failure", "partial"
    pattern_used="Virtualized data table with minimalist aesthetic",
    validation_results={
        "tailwind_v4_compliant": True,
        "shadcn_components_used": True,
        "server_actions_for_mutations": True,
        "accessibility_checked": True
    },
    files_created=[
        "app/components/player-lookup-table.tsx",
        "app/components/player-lookup-table.test.tsx"
    ],
    issues_encountered=[
        "Initial design too generic (revised to add texture)",
        "Virtualization needed for 500+ rows"
    ],
    duration_seconds=240,
    lessons_learned=[
        "Large tables require @tanstack/react-virtual",
        "Noise texture adds depth to minimalist designs"
    ],
    user_satisfaction="approved"  # or "needs_revision", "rejected"
)
```

---

## Query Past Design Patterns

Before implementing a component, check what worked before:

```python
# Search for similar past frontend implementations
past_executions = memori.search_learnings(
    query="table component for player data display",
    tags=["table", "virtualization", "player"],
    category="skills",
    limit=5
)

if past_executions:
    print(f"\n Learning from {len(past_executions)} past implementations:\n")
    for execution in past_executions:
        metadata = execution.get('metadata', {})
        print(f"  Task: {metadata.get('task', 'N/A')}")
        print(f"  Pattern Used: {metadata.get('pattern_used', 'N/A')}")
        print(f"  Outcome: {metadata.get('outcome', 'N/A')}")
        print(f"  Issues: {metadata.get('issues_encountered', [])}")
```

---

## Frontend-Specific Memory Queries

**Query aesthetic direction success rates:**
```python
dashboard_aesthetics = memori.search_learnings(
    query="dashboard design aesthetic direction",
    tags=["dashboard", "aesthetic"],
    category="skills",
    limit=10
)
```

**Query component pattern effectiveness:**
```python
virtualization_patterns = memori.search_learnings(
    query="virtualized table large dataset",
    tags=["virtualization", "performance"],
    limit=5
)
```

**Query state management decisions:**
```python
state_patterns = memori.search_learnings(
    query="TanStack Query state management pattern",
    tags=["tanstack-query", "zustand", "state"],
    limit=5
)
```

---

## When to Record

Record execution outcomes at these key moments:

- After component creation (aesthetic chosen, patterns used, validation results)
- After design direction decisions (why minimalist vs maximalist)
- After performance optimizations (virtualization, skeleton loaders)
- After user corrections (learn from feedback on design quality)
- After discovering patterns (shadcn customization insights, Tailwind v4 tricks)

---

## Namespace Reference

| Client Key | Database user_id |
|------------|------------------|
| `skill:frontend-design` | `skill_frontend_design` |
| `skill:backend-service-builder` | `skill_backend_service_builder` |
| `skill:lead-architect` | `skill_lead_architect` |
| `frontend-dev` | `pt2_frontend` |
| `main` | `pt2_agent` |
