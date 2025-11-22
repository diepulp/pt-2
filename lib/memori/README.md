# Memori Integration for PT-2 Agentic Workflows

**Version**: 1.0.0
**Status**: Implementation Phase 2
**Purpose**: Cross-session agent memory with chatmode-specific context isolation

---

## Overview

This library integrates the Memori SDK with PT-2's agentic workflow system, enabling:

- ✅ **Cross-session continuity** - Agents remember past sessions
- ✅ **Chatmode isolation** - Each chatmode has isolated memory context
- ✅ **Workflow state tracking** - Resume interrupted workflows
- ✅ **Combined Mode** - Conscious (fast working memory) + Auto (deep retrieval)
- ✅ **User preference learning** - Agents learn from corrections
- ✅ **Pattern application tracking** - Record successful patterns

---

## Architecture

### Hybrid Memory System

**Layer 1: Static Memory Files** (Git repository)
- Baseline project context
- Architecture patterns
- Anti-patterns catalog
- Fast load (<10s)
- Version controlled

**Layer 2: Memori Engine** (PostgreSQL)
- Dynamic session learnings
- User preferences
- Workflow state
- Agent decisions
- Cross-session memory

**Layer 3: Documentation Pointers** (Memori metadata)
- References to relevant docs
- Know which docs to fetch
- Fresh content when needed

### Combined Memory Mode (RECOMMENDED ✅)

```python
memori = Memori(
    database_connect="postgresql://...",
    conscious_ingest=True,  # Fast working memory
    auto_ingest=True,       # Deep query-based retrieval
    namespace="pt2_agent"
)
memori.enable()
```

**Benefits:**
- **Conscious Mode**: Recent decisions, active patterns (always available)
- **Auto Mode**: Query-specific memories, relationship-aware retrieval
- **Result**: Fast + Comprehensive context

---

## Quick Start

### 1. Installation

```bash
# Install Memori SDK and dependencies
cd lib/memori
pip install -r requirements.txt

# Or install globally
pip install memori psycopg2-binary loguru
```

### 2. Initialize Database

```bash
# Create Memori schema in Supabase local
npm run memori:init

# Verify installation
python scripts/memori-test.py
```

### 3. Seed Baseline Context (Optional)

```bash
# Seed initial project context
python scripts/memori-reset-and-seed.py
```

### 4. Test Session Hooks

```bash
# Test session start
python lib/memori/session_hooks.py start --chatmode architect

# Test session end
python lib/memori/session_hooks.py end --chatmode architect
```

---

## Usage

### Basic Usage (Python)

```python
from lib.memori import create_memori_client, ChatmodeContext, WorkflowStateManager

# 1. Create client for chatmode
memori = create_memori_client("service-engineer")
memori.enable()

# 2. Record learnings
context = ChatmodeContext(memori)
context.record_implementation(
    entity_name="LoyaltyService",
    entity_type="service",
    files_created=["src/services/loyalty.service.ts"],
    pattern="functional_factory",
    test_coverage=0.89
)

# 3. Track workflow state
workflow = WorkflowStateManager(memori)
workflow.save_phase_transition(
    workflow="create-service",
    entity_name="LoyaltyService",
    phase=2,
    chatmode="service-engineer"
)

# 4. Record validation gate
workflow.record_validation_gate(
    workflow="create-service",
    entity_name="LoyaltyService",
    gate_number=2,
    gate_type="implementation_review",
    outcome=ValidationGateStatus.PASSED,
    feedback="Functional factory pattern correctly applied"
)

# 5. Disable at end
memori.disable()
```

### Session Hooks

```python
from lib.memori.session_hooks import on_session_start, on_session_end

# At session start
result = on_session_start(chatmode="architect")
# Returns: {"status": "enabled", "session_id": "...", "recent_memories_count": 5}

# At session end
result = on_session_end(
    chatmode="architect",
    tasks_completed=["Created loyalty service spec"],
    files_modified=[".claude/specs/loyalty-service.spec.md"],
    next_steps=["Implement service in Phase 2"]
)
```

### Workflow Recovery

```python
from lib.memori.session_hooks import get_workflow_context

# Resume interrupted workflow
context = get_workflow_context("create-service", "LoyaltyService")

if context:
    print(f"Resuming workflow at Phase {context['current_phase']}")
    print(f"Next action: {context['next_action']}")
    print(f"Spec file: {context['spec_file']}")
```

---

## Chatmode-Specific Usage

### Architect Chatmode

```python
context = ChatmodeContext(memori)

# Record architecture decision
context.record_decision(
    decision="Use append-only ledger for loyalty points",
    rationale="Audit trail and compliance requirements",
    alternatives_considered=["Snapshot-based", "Event-sourced"],
    relevant_docs=["SRM.md#loyalty-service", "ADR-003.md"]
)

# Record spec creation
context.record_spec_creation(
    spec_file=".claude/specs/loyalty-service.spec.md",
    entity_name="LoyaltyService",
    entity_type="service",
    pattern="append_only_ledger",
    tables=["points_ledger", "player_tier_status"]
)
```

### Service-Engineer Chatmode

```python
context = ChatmodeContext(memori)

# Record implementation
context.record_implementation(
    entity_name="MTLService",
    entity_type="service",
    files_created=["src/services/mtl.service.ts", "src/services/__tests__/mtl.service.test.ts"],
    pattern="functional_factory",
    test_coverage=0.87,
    spec_file=".claude/specs/mtl-service.spec.md"
)

# Record anti-pattern detection
context.record_anti_pattern_detection(
    anti_pattern="ReturnType inference",
    detected_in="mtl.service.ts:45",
    corrective_action="Replaced with explicit MTLServiceInterface"
)
```

### Documenter Chatmode

```python
context = ChatmodeContext(memori)

# Record documentation update
context.record_documentation_update(
    files_updated=["memory/service-catalog.memory.md"],
    update_type="memory_file",
    entity_name="MTLService"
)

# Record session summary
context.record_session_summary(
    summary="Updated service catalog with MTLService and FloorLayoutService",
    tasks_completed=["Added 2 new services to catalog", "Updated SRM references"],
    files_modified=["memory/service-catalog.memory.md"],
    next_steps=["Verify SRM links", "Update phase status"]
)
```

---

## API Reference

### MemoriClient

```python
class MemoriClient:
    def __init__(chatmode: str = "main")
    def enable() -> bool
    def disable()
    def record_memory(content: str, category: str, metadata: dict, importance: float) -> dict
    def search_memories(query: str, category: list, limit: int) -> list
    def get_shared_learnings(source_chatmode: str, categories: list) -> list
```

### ChatmodeContext

```python
class ChatmodeContext:
    def record_decision(decision: str, rationale: str, alternatives: list) -> bool
    def record_spec_creation(spec_file: str, entity_name: str, pattern: str) -> bool
    def record_implementation(entity_name: str, files: list, pattern: str) -> bool
    def record_documentation_update(files: list, update_type: str) -> bool
    def record_user_preference(preference: str, type: str) -> bool
    def record_pattern_application(pattern: str, applied_to: str) -> bool
    def record_anti_pattern_detection(anti_pattern: str, corrective_action: str) -> bool
    def record_session_summary(summary: str, tasks: list, files: list) -> bool
```

### WorkflowStateManager

```python
class WorkflowStateManager:
    def save_phase_transition(workflow: str, entity: str, phase: int, chatmode: str) -> bool
    def record_validation_gate(workflow: str, entity: str, gate: int, outcome: str) -> bool
    def save_workflow_state(state: WorkflowState) -> bool
    def load_workflow_state(workflow: str, entity: str) -> WorkflowState
    def mark_workflow_complete(workflow: str, entity: str) -> bool
```

---

## Configuration

### Environment Variables

```bash
# .env
MEMORI_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres?options=-c search_path=memori,public"
OPENAI_API_KEY="sk-..."
MEMORI_ENVIRONMENT="development"
```

### Chatmode Mappings

```python
CHATMODE_USER_IDS = {
    "architect": "pt2_architect",
    "service-engineer": "service_engineer",
    "documenter": "pt2_documenter",
    "backend-dev": "pt2_backend",
    "frontend-dev": "pt2_frontend",
    "reviewer": "pt2_reviewer",
    "main": "pt2_agent",
}
```

---

## Memory Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| **facts** | Verifiable information | "CTR threshold is $10,000", "MTLService at mtl.service.ts" |
| **preferences** | User preferences | "Use .test.ts extension", "Prefer functional factories" |
| **skills** | Patterns and capabilities | "Created service using functional factory pattern" |
| **rules** | Enforcement rules | "Never use ReturnType inference", "Run db:types after migrations" |
| **context** | Background info | "Currently working on MTL compliance", "Phase 2 in progress" |

---

## Memory Metadata Structure

### Service Creation

```json
{
  "chatmode": "service-engineer",
  "workflow": "create-service",
  "service": "mtl_service",
  "files_created": ["src/services/mtl.service.ts"],
  "pattern": "functional_factory",
  "test_coverage": 0.87,
  "validation_gate": "gate_2_passed",
  "relevant_docs": ["SERVICE_TEMPLATE.md", "SRM.md#mtl-service"],
  "importance": 0.9,
  "timestamp": "2025-11-21T11:30:00Z"
}
```

### Architecture Decision

```json
{
  "chatmode": "architect",
  "spec_file": ".claude/specs/loyalty-service.spec.md",
  "alternatives_considered": ["event-sourced ledger", "snapshot-based"],
  "decision_rationale": "Append-only ledger for audit trail",
  "validation_gate": "gate_1_approved",
  "relevant_docs": ["SRM.md", "ADR-003.md"],
  "importance": 1.0
}
```

---

## Troubleshooting

### Memori Not Available

```bash
# Check if Memori SDK is installed
pip list | grep memori

# Install if missing
pip install memori
```

### Database Connection Failed

```bash
# Verify Supabase is running
docker ps | grep supabase

# Test connection
python scripts/memori-test.py
```

### pgvector Extension Not Available

```text
⚠️ pgvector extension not available
# This is okay - embeddings will be stored as JSONB instead
# Semantic search will still work, just slightly slower
```

---

## Testing

### Run Test Suite

```bash
# Basic functionality test
python scripts/memori-test.py

# Test session hooks
python lib/memori/session_hooks.py start --chatmode architect
python lib/memori/session_hooks.py end --chatmode architect

# Test workflow recovery
python lib/memori/session_hooks.py workflow --workflow create-service --entity LoyaltyService
```

### Manual Testing

```python
# test_memori.py
from lib.memori import create_memori_client, ChatmodeContext

memori = create_memori_client("service-engineer")
memori.enable()

context = ChatmodeContext(memori)
context.record_implementation(
    entity_name="TestService",
    entity_type="service",
    files_created=["test.ts"],
    pattern="test_pattern"
)

print("Memory recorded successfully!")
memori.disable()
```

---

## Integration with Chatmodes

### Example: Update architect.chatmode.md

```markdown
## Memory Recording Protocol

At key decision points, use Memori to record learnings:

1. **After Spec Creation**:
   ```python
   from lib.memori import create_memori_client, ChatmodeContext

   memori = create_memori_client("architect")
   memori.enable()
   context = ChatmodeContext(memori)

   context.record_spec_creation(
       spec_file=".claude/specs/loyalty-service.spec.md",
       entity_name="LoyaltyService",
       entity_type="service",
       pattern="append_only_ledger"
   )
   ```

2. **After Validation Gate**:
   ```python
   from lib.memori import WorkflowStateManager

   workflow = WorkflowStateManager(memori)
   workflow.record_validation_gate(
       workflow="create-service",
       entity_name="LoyaltyService",
       gate_number=1,
       gate_type="spec_review",
       outcome="approved"
   )
   ```
```

---

## Next Steps

1. **Complete Phase 2 Tasks**:
   - ✅ Memori SDK wrapper created
   - ✅ Workflow state manager created
   - ✅ Session hooks created
   - ⏳ Update chatmode files with Memori integration
   - ⏳ Create test suite
   - ⏳ Setup guide and documentation

2. **Phase 3: Workflow Integration**:
   - Update create-service.prompt.md with state tracking
   - Test cross-session workflow recovery

3. **Phase 4: Cross-Chatmode Learning**:
   - Implement learning bridge
   - Define sharing rules

---

## References

- **Strategy Document**: `docs/agentic-workflow/MEMORI-INTEGRATION-STRATEGY.md`
- **Architecture Guide**: `.memori/CORRECT_ARCHITECTURE.md`
- **Configuration**: `.memori/config.yml`
- **Memori Docs**: https://memorilabs.ai/docs/

---

**Last Updated**: 2025-11-21
**Version**: 1.0.0
**Maintained By**: Agentic Workflow Framework Team
