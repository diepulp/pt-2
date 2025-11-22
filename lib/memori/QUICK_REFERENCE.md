# Memori Quick Reference Card

**Quick commands and code snippets for daily use**

---

## Setup (One-Time)

```bash
# Install
pip install -r lib/memori/requirements.txt

# Initialize database
npm run memori:init

# Test
python lib/memori/test_integration.py
```

---

## Basic Usage

### Start Session

```python
from lib.memori.session_hooks import on_session_start
result = on_session_start(chatmode="architect")
```

### End Session

```python
from lib.memori.session_hooks import on_session_end
result = on_session_end(
    chatmode="architect",
    tasks_completed=["Task 1", "Task 2"],
    files_modified=["file1.ts", "file2.md"]
)
```

---

## Architect Chatmode

```python
from lib.memori import create_memori_client, ChatmodeContext

memori = create_memori_client("architect")
memori.enable()
context = ChatmodeContext(memori)

# Record decision
context.record_decision(
    decision="Use append-only ledger",
    rationale="Audit trail requirement",
    alternatives_considered=["Snapshot", "Event-sourced"],
    relevant_docs=["SRM.md#service"]
)

# Record spec
context.record_spec_creation(
    spec_file=".claude/specs/service.spec.md",
    entity_name="ServiceName",
    entity_type="service",
    pattern="append_only_ledger"
)

memori.disable()
```

---

## Service-Engineer Chatmode

```python
from lib.memori import create_memori_client, ChatmodeContext

memori = create_memori_client("service-engineer")
memori.enable()
context = ChatmodeContext(memori)

# Record implementation
context.record_implementation(
    entity_name="ServiceName",
    entity_type="service",
    files_created=["service.ts", "service.test.ts"],
    pattern="functional_factory",
    test_coverage=0.85
)

# Record anti-pattern fix
context.record_anti_pattern_detection(
    anti_pattern="ReturnType inference",
    detected_in="service.ts:45",
    corrective_action="Explicit interface"
)

memori.disable()
```

---

## Documenter Chatmode

```python
from lib.memori import create_memori_client, ChatmodeContext

memori = create_memori_client("documenter")
memori.enable()
context = ChatmodeContext(memori)

# Record doc update
context.record_documentation_update(
    files_updated=["memory/service-catalog.memory.md"],
    update_type="memory_file",
    entity_name="ServiceName"
)

memori.disable()
```

---

## Workflow Tracking

```python
from lib.memori import create_memori_client, WorkflowStateManager
from lib.memori.workflow_state import ValidationGateStatus

memori = create_memori_client("service-engineer")
memori.enable()
workflow = WorkflowStateManager(memori)

# Phase transition
workflow.save_phase_transition(
    workflow="create-service",
    entity_name="ServiceName",
    phase=2,
    chatmode="service-engineer"
)

# Validation gate
workflow.record_validation_gate(
    workflow="create-service",
    entity_name="ServiceName",
    gate_number=2,
    gate_type="implementation_review",
    outcome=ValidationGateStatus.PASSED,
    feedback="Looks good"
)

# Mark complete
workflow.mark_workflow_complete(
    workflow="create-service",
    entity_name="ServiceName",
    duration_minutes=45
)

memori.disable()
```

---

## Workflow Recovery

```python
from lib.memori.session_hooks import get_workflow_context

context = get_workflow_context("create-service", "ServiceName")

if context:
    print(f"Current phase: {context['current_phase']}")
    print(f"Next action: {context['next_action']}")
    print(f"Spec file: {context['spec_file']}")
```

---

## User Preference Learning

```python
context.record_user_preference(
    preference="Use .test.ts extension",
    preference_type="naming_convention",
    importance=1.0
)
```

---

## CLI Tools

```bash
# Session start
python lib/memori/session_hooks.py start --chatmode architect

# Session end
python lib/memori/session_hooks.py end --chatmode architect

# Workflow recovery
python lib/memori/session_hooks.py workflow --workflow create-service --entity ServiceName

# Run tests
python lib/memori/test_integration.py
```

---

## Database Queries

```sql
-- View recent memories
SELECT user_id, category, content, created_at
FROM memori.memories
ORDER BY created_at DESC
LIMIT 10;

-- View by chatmode
SELECT * FROM memori.memories
WHERE user_id = 'service_engineer'
ORDER BY created_at DESC;

-- Memory counts
SELECT user_id, category, COUNT(*)
FROM memori.memories
GROUP BY user_id, category;
```

---

## Environment Variables

```bash
MEMORI_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres?options=-c search_path=memori,public"
OPENAI_API_KEY="sk-..."
MEMORI_ENVIRONMENT="development"
CLAUDE_CHATMODE="main"
```

---

## Chatmode User IDs

| Chatmode | User ID |
|----------|---------|
| architect | pt2_architect |
| service-engineer | service_engineer |
| documenter | pt2_documenter |
| backend-dev | pt2_backend |
| frontend-dev | pt2_frontend |
| reviewer | pt2_reviewer |
| main | pt2_agent |

---

## Memory Categories

- `facts` - Verifiable information
- `preferences` - User preferences
- `skills` - Patterns & capabilities
- `rules` - Enforcement rules
- `context` - Background info

---

## Troubleshooting

```bash
# Check Memori installed
pip list | grep memori

# Check Supabase running
docker ps | grep supabase

# Test database connection
python scripts/memori-test.py

# View logs
tail -f .memori/memori.log
```

---

## Full Documentation

- **Setup**: `lib/memori/SETUP_GUIDE.md`
- **API**: `lib/memori/README.md`
- **Strategy**: `docs/agentic-workflow/MEMORI-INTEGRATION-STRATEGY.md`
