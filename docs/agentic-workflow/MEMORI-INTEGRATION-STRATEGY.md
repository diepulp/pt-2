# Memori Engine Integration Strategy for PT-2 Agentic Workflows

**Version**: 1.0.0
**Date**: 2025-11-21
**Status**: Proposed
**Purpose**: Extend PT-2 agentic workflows with dynamic session memory using Memori engine

---

## Executive Summary

PT-2's agentic workflow currently relies on **static memory files** (`/memory/*.memory.md`) for context persistence. While effective for baseline context (95% implementation of agentic strategy), it lacks **dynamic cross-session learning** and **chatmode-specific context isolation**.

This strategy proposes a **hybrid architecture** that:
- ✅ **Keeps** static memory files for baseline project context (fast load, version-controlled)
- ✅ **Adds** Memori engine for dynamic session learnings (agent decisions, workflow state, user preferences)
- ✅ **Enables** chatmode-specific memory isolation (architect, service-engineer, documenter contexts)
- ✅ **Provides** cross-session continuity without manual memory updates

**Key Benefit**: Agents remember past sessions, learn from corrections, and maintain workflow state across interruptions.

---

## Current State Analysis

### What's Working: Static Memory Files

**Location**: `/memory/*.memory.md` (7 files)
**Auto-loaded**: Via `.claude/CLAUDE.md`
**Content**:
- `project.memory.md` - Decisions, patterns, next steps
- `anti-patterns.memory.md` - Forbidden patterns
- `architecture-decisions.memory.md` - ADR summaries
- `phase-status.memory.md` - Current progress
- `service-catalog.memory.md` - 10 bounded contexts
- `domain-glossary.memory.md` - Terminology
- `coding-standards.memory.md` - Standards

**Benefits**:
- ✅ Fast context load (<10s)
- ✅ Version-controlled (git history)
- ✅ Human-readable and editable
- ✅ Compressed from 203k-word docs

**Limitations**:
- ❌ Manual updates required (documenter chatmode must explicitly update)
- ❌ No per-session state tracking
- ❌ No chatmode-specific context isolation
- ❌ No dynamic learning from agent corrections
- ❌ Workflow state lost between sessions

### What's Available: Memori Engine

**Location**: `.memori/` + PostgreSQL schema
**Architecture**: Hybrid SQL + vector search
**Schema**:
```sql
memori.memories          -- Agent learnings, decisions, preferences
memori.entities          -- Extracted entities (services, tables, files)
memori.relationships     -- Entity relationships
memori.conversations     -- Session tracking
```

**Capabilities**:
- ✅ Vector embeddings for semantic search (pgvector)
- ✅ Full-text search (tsvector)
- ✅ Context isolation (user_id namespaces)
- ✅ Entity extraction and relationship mapping
- ✅ Temporal tracking (created_at, updated_at)
- ✅ Metadata storage (JSONB)

**Current Status**:
- Database schema initialized
- Reset script removes doc-storage anti-pattern
- Seeded with baseline project context
- **Not integrated with agentic workflows**

---

## Proposed Architecture: Hybrid Memory System with Dual Memory Modes

### Layer 1: Static Memory Files (Baseline Context)

**Purpose**: Fast-loading, version-controlled baseline project knowledge
**Storage**: Git repository (`/memory/*.memory.md`)
**Access**: Auto-loaded at session start via `.claude/CLAUDE.md`
**Update Frequency**: Weekly or after major decisions
**Maintained By**: Documenter chatmode (manual)

**Content Types**:
- Project overview and vision
- Architecture patterns and standards
- Anti-patterns catalog
- Service catalog (bounded contexts)
- Domain glossary
- Coding standards

**Example**:
```markdown
# project.memory.md
decisions:
  - "2025-10-20: Adopt SRM v3.0.2 with casino-scoped RLS patterns"
patterns:
  worked:
    - "Functional factories for services"
```

### Layer 2: Memori Engine with Dual Memory Modes

**Purpose**: Cross-session learnings, workflow state, agent decisions with intelligent memory retrieval
**Storage**: PostgreSQL (`memori` schema)
**Access**: **Dual-mode automatic injection** - Conscious + Auto modes working together
**Update Frequency**: Real-time (every agent action)
**Maintained By**: Automatic (Memori intercepts and records conversations)

#### 🧠 Conscious Mode - Short-Term Working Memory

**How it Works**:
- One-shot context injection at session start
- Promotes essential memories from long-term to short-term storage
- Background analysis every 6 hours via Conscious Agent
- Fast context load (<300 tokens)
- Prioritizes recent, important, and frequently accessed memories

**Configuration**:
```python
memori = Memori(
    database_connect="postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    conscious_ingest=True,  # Enable conscious mode
    namespace="pt2_agent"
)
memori.enable()
```

**What Gets Promoted to Conscious Memory**:
- High-importance memories (importance > 0.8)
- Frequently accessed patterns
- Recent decisions (last 7 days)
- Current project context
- Active workflow state

#### 🔍 Auto Mode - Dynamic Database Search

**How it Works**:
- Analyzes each user query in real-time
- Retrieves relevant memories via semantic + full-text search
- Injects only contextually relevant information
- Deep retrieval from full memory corpus (203k words compressed)
- Relationship-aware retrieval (follows entity connections)

**Configuration**:
```python
memori = Memori(
    database_connect="postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    auto_ingest=True,  # Enable auto mode
    namespace="pt2_agent"
)
memori.enable()
```

**What Auto Mode Retrieves**:
- Query-specific memories (semantic match)
- Related entities and relationships
- Historical context for current topic
- Cross-chatmode learnings (when relevant)
- Validation gate history for similar tasks

#### ⚡ Combined Mode - Best of Both Worlds (RECOMMENDED)

**How it Works**:
1. **Conscious Mode** provides fast working memory (always available)
2. **Auto Mode** supplements with deep retrieval when needed
3. Result: Fast + Comprehensive context

**Configuration**:
```python
memori = Memori(
    database_connect="postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    conscious_ingest=True,  # Short-term working memory
    auto_ingest=True,       # Dynamic search per query
    namespace="pt2_agent"
)
memori.enable()
```

**Memory Content Types**:
- Agent decisions: "Created MTLService using SERVICE_TEMPLATE.md"
- User corrections: "User prefers snake_case_with_underscores for test names"
- Workflow state: "Phase 2 of create-service workflow in progress"
- Session summaries: "Fixed CTR threshold calculation bug in mtl.service.ts:142"
- Chatmode learnings: "Architect approved spec .claude/specs/loyalty-service.spec.md"
- Validation gate history: "GATE 2 passed: Implementation review approved"
- Entity relationships: "MTLService → mtl_entry table → CTR threshold detection"
- Skills learned: "Agent can create services following SERVICE_TEMPLATE.md pattern"

**Example**:
```json
{
  "user_id": "service-engineer",
  "content": "Created MTLService at src/services/mtl.service.ts using functional factory pattern",
  "category": "skills",
  "metadata": {
    "relevant_docs": ["SERVICE_TEMPLATE.md", "SRM.md#mtl-service"],
    "chatmode": "service-engineer",
    "workflow": "create-service",
    "phase": 2,
    "validation_gate": "passed_gate_2",
    "files_created": ["src/services/mtl.service.ts", "src/services/__tests__/mtl.service.test.ts"],
    "timestamp": "2025-11-21T10:30:00Z"
  }
}
```

### Layer 3: Documentation Pointers (Metadata Bridge)

**Purpose**: Connect session learnings to static documentation
**Storage**: Memori `metadata.relevant_docs` field
**Access**: Agent fetches fresh docs when needed

**Flow**:
1. Memori recalls: "Working on MTLService (created 2025-11-20)"
2. Metadata points to: `["SRM.md#mtl-service", "SEC-002.md"]`
3. Agent reads fresh docs from file system
4. Agent works with current docs + past learnings

---

## How Memori Interception Works

Memori operates as a **transparent interceptor** between your application and LLM providers. This architecture enables automatic memory management without changing existing code.

### Architecture Flow

```
┌─────────────┐
│  Your App   │
│  (Claude    │
│   Code)     │
└──────┬──────┘
       │ 1. client.chat.completions.create()
       ▼
┌─────────────────────────────────────┐
│    Memori Interceptor Layer         │
│                                     │
│  ┌──────────────────────────────┐  │
│  │   Pre-Call Processing        │  │
│  │  • Get relevant memories     │  │
│  │  • Inject context            │  │
│  └──────────────────────────────┘  │
│              │                      │
│              ▼                      │
│  ┌──────────────────────────────┐  │
│  │   LLM Provider Call          │  │
│  │  (OpenAI/Anthropic/etc)      │  │
│  └──────────────────────────────┘  │
│              │                      │
│              ▼                      │
│  ┌──────────────────────────────┐  │
│  │   Post-Call Processing       │  │
│  │  • Extract entities          │  │
│  │  • Categorize memory         │  │
│  │  • Store conversation        │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
       │
       ▼
┌─────────────────┐
│  PostgreSQL     │
│  (memori schema)│
└─────────────────┘
       ▲
       │ Background every 6 hours
┌─────────────────┐
│ Conscious Agent │
│  • Analyze      │
│  • Promote      │
│  • Consolidate  │
└─────────────────┘
```

### Pre-Call: Context Injection

**Before** the LLM sees your messages:

1. **Conscious Mode** (if enabled): Loads short-term working memory (~10-20 memories)
2. **Auto Mode** (if enabled): Searches database for query-relevant memories
3. **Context Merge**: Combines conscious + auto memories without duplicates
4. **Injection**: Prepends context to messages as a system message or assistant message

**Example Injection**:
```python
# Original messages
messages = [
    {"role": "user", "content": "Help me add authentication to the LoyaltyService"}
]

# After Memori injection (Combined Mode)
messages = [
    {
        "role": "system",
        "content": """Relevant context from memory:

        [CONSCIOUS MEMORY - Working Context]
        - Currently working on: LoyaltyService implementation (started 2025-11-20)
        - Recent decision: Use functional factory pattern for all services
        - Current phase: Phase 2 - Service implementation

        [AUTO-RETRIEVED MEMORY - Authentication Related]
        - MTLService authentication: Uses casino-scoped RLS (SEC-002.md pattern)
        - User preference: JWT tokens with 15-minute expiration
        - Pattern: @context/api-security.context.md#authentication-flow
        """
    },
    {"role": "user", "content": "Help me add authentication to the LoyaltyService"}
]
```

### Post-Call: Memory Recording

**After** the LLM responds:

1. **Memory Agent** analyzes the conversation
2. **Entity Extraction**: Identifies services, tables, files, people, decisions
3. **Categorization**: Classifies memory type (facts, preferences, skills, rules, context)
4. **Relationship Mapping**: Detects connections between entities
5. **Storage**: Writes to PostgreSQL with full-text search indexes

**Example Memory Record**:
```json
{
  "id": 12345,
  "user_id": "service_engineer",
  "content": "Added JWT authentication to LoyaltyService following MTLService pattern with casino-scoped RLS",
  "category": "skills",
  "importance": 0.9,
  "entities": ["LoyaltyService", "JWT", "RLS", "casino_scoped"],
  "relationships": [
    {"type": "similar_to", "target": "MTLService authentication", "confidence": 0.95}
  ],
  "metadata": {
    "chatmode": "service-engineer",
    "workflow": "create-service",
    "files_modified": ["src/services/loyalty.service.ts"],
    "relevant_docs": ["SEC-002.md", "api-security.context.md"],
    "validation_gate": "gate_2_in_progress"
  },
  "created_at": "2025-11-21T11:30:00Z"
}
```

### Background: Conscious Agent Analysis

**Every 6 hours** (configurable):

1. **Pattern Detection**: Identifies frequently used patterns
2. **Importance Scoring**: Ranks memories by relevance and frequency
3. **Promotion**: Moves essential long-term memories to short-term (conscious) storage
4. **Consolidation**: Merges duplicate or similar memories
5. **Relationship Strengthening**: Reinforces entity connections

**Example Promotion**:
```python
# Long-term memory (importance: 0.95, accessed 10 times in last week)
# Promoted to conscious memory for fast access

# Before: Retrieved via Auto Mode (slower, deep search)
# After: Available in Conscious Mode (fast, always loaded)
```

---

## Chatmode-Specific Memory Contexts

### Context Isolation Strategy

Each chatmode gets its own `user_id` namespace in Memori for isolated learnings:

```yaml
# Memori contexts (from .memori/config.yml)
contexts:
  - name: "architect"
    user_id: "pt2_architect"
    description: "Architecture decisions, ADR creation, spec generation"

  - name: "service-engineer"
    user_id: "service_engineer"
    description: "Service implementation, pattern application, anti-pattern detection"

  - name: "documenter"
    user_id: "pt2_documenter"
    description: "Memory file updates, session handoffs, SRM updates"

  - name: "backend-dev"
    user_id: "pt2_backend"
    description: "General backend implementation, migrations, server actions"

  - name: "frontend-dev"
    user_id: "pt2_frontend"
    description: "UI implementation, shadcn components, React Query"

  - name: "reviewer"
    user_id: "pt2_reviewer"
    description: "Code review, quality assurance, test coverage"

  - name: "main"
    user_id: "pt2_agent"
    description: "General project context, cross-chatmode learnings"
```

### Memory Categories by Chatmode

#### Architect Chatmode
**Stores**:
- Architecture decisions made
- Specs generated (file paths)
- ADRs created
- Alternatives considered
- Validation gate outcomes

**Example Memory**:
```json
{
  "user_id": "pt2_architect",
  "content": "Approved loyalty service spec with points ledger and tier progression model",
  "category": "decisions",
  "metadata": {
    "spec_file": ".claude/specs/loyalty-service.spec.md",
    "alternatives_considered": ["event-sourced ledger", "snapshot-based"],
    "decision_rationale": "Append-only ledger for audit trail",
    "validation_gate": "gate_1_approved",
    "timestamp": "2025-11-21T09:00:00Z"
  }
}
```

#### Service-Engineer Chatmode
**Stores**:
- Services implemented
- Patterns applied
- Anti-patterns avoided
- Test coverage achieved
- Files created/modified

**Example Memory**:
```json
{
  "user_id": "service_engineer",
  "content": "Implemented MTLService.detectThresholdViolations() with casino-scoped CTR threshold from casino_settings table",
  "category": "skills",
  "metadata": {
    "service": "mtl_service",
    "method": "detectThresholdViolations",
    "file": "src/services/mtl.service.ts:142-189",
    "pattern": "functional_factory",
    "test_coverage": 0.87,
    "validation_gate": "gate_2_passed",
    "related_tables": ["mtl_entry", "casino_settings"],
    "timestamp": "2025-11-21T11:30:00Z"
  }
}
```

#### Documenter Chatmode
**Stores**:
- Memory file updates made
- SESSION_HANDOFF documents created
- SRM entries added
- Documentation gaps identified

**Example Memory**:
```json
{
  "user_id": "pt2_documenter",
  "content": "Updated service-catalog.memory.md to add MTLService with CTR threshold detection capability",
  "category": "skills",
  "metadata": {
    "files_updated": ["memory/service-catalog.memory.md"],
    "service_added": "mtl_service",
    "bounded_context": "compliance",
    "timestamp": "2025-11-21T12:00:00Z"
  }
}
```

---

## Workflow Integration

### Workflow State Tracking

Each workflow phase stores state in Memori for cross-session continuity:

```json
{
  "user_id": "pt2_agent",
  "content": "create-service workflow for LoyaltyService: Phase 2 in progress (implementation)",
  "category": "context",
  "metadata": {
    "workflow": "create-service",
    "service_name": "loyalty_service",
    "current_phase": 2,
    "phases_completed": [1],
    "validation_gates": {
      "gate_1": {"status": "passed", "timestamp": "2025-11-21T09:00:00Z"},
      "gate_2": {"status": "in_progress", "started": "2025-11-21T10:00:00Z"}
    },
    "spec_file": ".claude/specs/loyalty-service.spec.md",
    "chatmodes_used": ["architect", "service-engineer"],
    "session_id": "session_20251121_100000"
  }
}
```

### Validation Gate History

Each validation gate outcome is recorded:

```json
{
  "user_id": "service_engineer",
  "content": "VALIDATION GATE 2 PASSED: Implementation review approved for MTLService",
  "category": "context",
  "metadata": {
    "workflow": "create-service",
    "service": "mtl_service",
    "gate": 2,
    "gate_type": "implementation_review",
    "outcome": "approved",
    "reviewer_feedback": "Functional factory pattern correctly applied, explicit interfaces used",
    "files_reviewed": [
      "src/services/mtl.service.ts",
      "src/services/__tests__/mtl.service.test.ts"
    ],
    "timestamp": "2025-11-21T11:45:00Z"
  }
}
```

### Cross-Session Recovery

When a session is interrupted, next session recovers via Memori:

**Session 1 (Interrupted)**:
```
User: "Create LoyaltyService"
Architect: Creates spec → GATE 1 passed
Service-Engineer: Starts implementation...
[SESSION ENDS]
```

**Memori Records**:
```json
{
  "content": "create-service workflow for LoyaltyService interrupted at Phase 2",
  "metadata": {
    "workflow": "create-service",
    "service_name": "loyalty_service",
    "current_phase": 2,
    "phases_completed": [1],
    "validation_gates": {"gate_1": "passed"},
    "spec_file": ".claude/specs/loyalty-service.spec.md",
    "files_in_progress": ["src/services/loyalty.service.ts"],
    "next_action": "Complete service implementation and unit tests"
  }
}
```

**Session 2 (Resumed)**:
```
User: "Continue with LoyaltyService"
Agent: [Memori auto-injects context]
  - "create-service workflow for LoyaltyService at Phase 2"
  - "Spec approved: .claude/specs/loyalty-service.spec.md"
  - "GATE 1 passed"
  - "Next: Complete implementation and tests"
Agent: "Resuming LoyaltyService implementation from loyalty.service.ts..."
```

---

## Implementation Plan

### Phase 1: Memori Infrastructure Setup ✅ COMPLETE

- ✅ Database schema initialized (`scripts/memori-init-db.py`)
- ✅ Reset script created (`scripts/memori-reset-and-seed.py`)
- ✅ Configuration file created (`.memori/config.yml`)
- ✅ Baseline context seeded (project, architecture, services)
- ✅ Documentation written (`CORRECT_ARCHITECTURE.md`)

### Phase 2: Chatmode Integration

**Goal**: Each chatmode automatically records learnings to its Memori context

**Tasks**:

1. **Create Memori SDK Wrapper** (`lib/memori/client.ts`)
   ```typescript
   // Provides PT-2-specific Memori client
   export function createMemoriClient(chatmode: string): MemoriClient {
     return new MemoriClient({
       databaseUrl: process.env.MEMORI_DB_URL,
       userId: getChatmodeUserId(chatmode),
       namespace: 'pt2_development',
       consciousIngest: true,
       autoIngest: true
     });
   }
   ```

2. **Create Session Hooks** (`.claude/hooks/`)
   - `memori-session-start.hook.ts` - Initialize Memori for session
   - `memori-session-end.hook.ts` - Trigger conscious analysis
   - `memori-workflow-state.hook.ts` - Track workflow phase transitions

3. **Update Chatmodes** (`.github/chatmodes/*.chatmode.md`)
   - Add Memori initialization instructions
   - Define what each chatmode should record
   - Specify metadata structure for chatmode-specific learnings

**Example Chatmode Update** (architect.chatmode.md):
```markdown
## Memory Recording Protocol

At key decision points, record to Memori:

1. **After Spec Creation**:
   - Decision rationale
   - Alternatives considered
   - Spec file path
   - Relevant docs referenced

2. **After ADR Creation**:
   - ADR number and title
   - Decision outcome
   - Consequences identified
   - Related services/tables

3. **After Validation Gate**:
   - Gate outcome (approved/rejected)
   - User feedback
   - Next phase action
```

### Phase 3: Workflow State Tracking

**Goal**: Workflows persist state to Memori for cross-session recovery

**Tasks**:

1. **Create Workflow State Manager** (`lib/memori/workflow-state.ts`)
   ```typescript
   export class WorkflowState {
     async savePhaseTransition(workflow: string, phase: number, metadata: object): Promise<void>
     async loadWorkflowState(workflow: string, serviceName: string): Promise<WorkflowStateRecord | null>
     async recordValidationGate(gate: number, outcome: string, feedback: string): Promise<void>
   }
   ```

2. **Update Workflow Prompts** (`.claude/workflows/*.prompt.md`)
   - Add phase transition recording
   - Add validation gate recording
   - Add session recovery instructions

**Example Workflow Update** (create-service.prompt.md):
```markdown
## Phase Transition Protocol

At the end of each phase:
1. Record phase completion to Memori
2. Record validation gate outcome
3. Record next phase action

```typescript
await workflowState.savePhaseTransition('create-service', currentPhase, {
  service_name: serviceName,
  chatmode: currentChatmode,
  validation_gate: gateOutcome,
  files_created: filesCreated,
  next_action: nextPhaseDescription
});
```

## Session Recovery

At session start, check for in-progress workflows:

```typescript
const state = await workflowState.loadWorkflowState('create-service', serviceName);
if (state) {
  console.log(`Resuming ${serviceName} at Phase ${state.current_phase}`);
  console.log(`Previous gates: ${state.validation_gates}`);
  console.log(`Next action: ${state.next_action}`);
}
```
```

### Phase 4: Cross-Chatmode Learning

**Goal**: Share learnings across chatmodes while maintaining isolation

**Tasks**:

1. **Create Learning Bridge** (`lib/memori/learning-bridge.ts`)
   ```typescript
   export class LearningBridge {
     // Get learnings from another chatmode
     async getSharedLearnings(sourceChatmode: string, category: string[]): Promise<Memory[]>

     // Promote important learning to main context
     async promoteToMainContext(memory: Memory): Promise<void>
   }
   ```

2. **Define Cross-Chatmode Learning Rules**
   - Architect decisions → visible to Service-Engineer
   - Service-Engineer patterns → visible to Backend-Dev
   - Anti-patterns detected → promoted to main context
   - User preferences → promoted to main context

**Example**:
```typescript
// Service-Engineer reads Architect's spec decision
const architectDecisions = await bridge.getSharedLearnings('pt2_architect', ['decisions']);
// Returns: "Approved loyalty service spec with points ledger model"

// Service-Engineer implements based on spec
await recordLearning({
  content: "Implemented LoyaltyService following approved spec",
  metadata: { based_on_decision: architectDecisions[0].id }
});
```

### Phase 5: Integration with Static Memory Files

**Goal**: Memori complements static files, not replaces them

**Strategy**:

1. **Static Memory Files** (baseline, slow-changing):
   - Project overview
   - Architecture patterns
   - Service catalog
   - Anti-patterns
   - Coding standards

2. **Memori** (dynamic, session-specific):
   - "Last worked on MTLService"
   - "User prefers test-first approach"
   - "Current workflow: create-service phase 2"
   - "Bug fixed in mtl.service.ts:142"

3. **Documenter Updates Static Files** (periodic):
   - Weekly: Compress recent Memori learnings into memory files
   - After major milestones: Update phase-status.memory.md
   - After new service: Update service-catalog.memory.md

**Example Documenter Task**:
```
Every Friday:
1. Query Memori for learnings from past week
2. Identify significant patterns/decisions
3. Update relevant memory files
4. Record update in Memori for audit trail
```

---

## Usage Scenarios

### Scenario 1: Creating a New Service

**Session 1**:
```
User: "Create LoyaltyService for points tracking"

[Architect chatmode]
- Reads: Static memory files (service catalog, patterns)
- Memori recalls: "Similar to MTLService (append-only ledger)"
- Creates: .claude/specs/loyalty-service.spec.md
- Records to Memori:
  {
    "content": "Created LoyaltyService spec with points ledger and tier system",
    "metadata": {
      "spec_file": ".claude/specs/loyalty-service.spec.md",
      "pattern": "append_only_ledger",
      "similar_to": "mtl_service"
    }
  }

VALIDATION GATE 1: User approves spec

- Records to Memori: "GATE 1 passed for LoyaltyService"
```

**Session 2 (Next Day)**:
```
User: "Continue with LoyaltyService"

[Agent checks Memori]
- Recalls: "LoyaltyService spec approved (.claude/specs/loyalty-service.spec.md)"
- Recalls: "GATE 1 passed"
- Recalls: "Next: Service implementation"

[Service-Engineer chatmode]
- Reads spec from file system
- Implements service following spec
- Records to Memori:
  {
    "content": "Implemented LoyaltyService.awardPoints() and adjustBalance()",
    "metadata": {
      "files_created": ["src/services/loyalty.service.ts"],
      "pattern": "functional_factory",
      "test_coverage": 0.89
    }
  }

VALIDATION GATE 2: Implementation review

- Records to Memori: "GATE 2 passed for LoyaltyService"
```

**Session 3 (Week Later)**:
```
User: "Add new tier 'Platinum' to Loyalty"

[Agent checks Memori]
- Recalls: "LoyaltyService at src/services/loyalty.service.ts"
- Recalls: "Uses functional factory pattern"
- Recalls: "Tier system implemented"

[Service-Engineer chatmode]
- Knows exactly where to add new tier
- No need to explain project structure
- Fast implementation
```

### Scenario 2: User Correction Learning

**Session 1**:
```
User: "Create tests for MTLService"

[Service-Engineer chatmode]
Creates test file: `mtl.service.spec.ts`

User: "Please use .test.ts extension, not .spec.ts"

[Agent records correction to Memori]
{
  "user_id": "service_engineer",
  "content": "User prefers .test.ts extension for test files, not .spec.ts",
  "category": "preferences",
  "metadata": {
    "importance": 1.0,
    "type": "naming_convention"
  }
}
```

**Session 2 (Later)**:
```
User: "Create tests for LoyaltyService"

[Agent checks Memori]
- Recalls: "User prefers .test.ts extension"

[Service-Engineer chatmode]
Creates test file: `loyalty.service.test.ts` ✅ Correct first time
```

### Scenario 3: Cross-Session Bug Fix

**Session 1**:
```
User: "There's a bug in MTL threshold detection"

[Service-Engineer chatmode]
- Memori recalls: "MTLService at src/services/mtl.service.ts:142-189"
- Memori recalls: "detectThresholdViolations() method handles CTR"
- Agent knows exactly where to look

Fixes bug at line 167

[Records to Memori]
{
  "content": "Fixed CTR threshold bug: was comparing daily total instead of transaction amount",
  "metadata": {
    "file": "src/services/mtl.service.ts:167",
    "bug_type": "logic_error",
    "impact": "critical"
  }
}
```

**Session 2 (Next Week)**:
```
User: "Implement similar threshold detection for Player Financial Service"

[Agent checks Memori]
- Recalls: "Fixed CTR threshold bug in MTL (comparing daily vs transaction)"
- Recalls: "Important: compare transaction amount, not daily total"

[Service-Engineer chatmode]
Implements correctly first time, avoiding same bug ✅
```

---

## Success Metrics

### Quantitative Metrics

| Metric | Current (Static Only) | Target (With Memori) | Measurement |
|--------|----------------------|---------------------|-------------|
| **Session startup time** | <10s | <10s | No degradation |
| **Context re-explanation** | Every session | Rare | User satisfaction |
| **Workflow recovery time** | 5-10 minutes | <1 minute | Time to resume |
| **Repeated mistakes** | Occasional | Rare | Code review feedback |
| **Cross-session continuity** | Manual | Automatic | Agent behavior |
| **Memori memory count** | 0 (not used) | 100-500 | Database query |
| **Avg memory size** | N/A | 100-300 chars | Database query |
| **Memory freshness** | N/A | 80%+ last 7 days | Database query |

### Qualitative Metrics

| Aspect | Before Memori | After Memori |
|--------|---------------|--------------|
| **Session Continuity** | "Let me review the project..." | "Resuming LoyaltyService Phase 2..." |
| **User Corrections** | Repeated same mistakes | Learned from corrections |
| **Workflow Recovery** | "Where were we?" | Automatic state recovery |
| **Chatmode Context** | Generic responses | Chatmode-specific learnings |
| **Developer Experience** | Re-explain project frequently | Agent remembers context |

---

## Risk Mitigation

### Risk 1: Memori Database Unavailable

**Impact**: Session memory unavailable, falls back to static files
**Mitigation**:
- Static memory files still provide baseline context
- Session continues with reduced cross-session awareness
- No critical failure

**Implementation**:
```typescript
try {
  const memoriClient = createMemoriClient(chatmode);
  const sessionMemory = await memoriClient.loadContext();
} catch (error) {
  console.warn('Memori unavailable, using static memory only');
  // Continue with static memory files
}
```

### Risk 2: Memory Bloat

**Impact**: Too many memories slow down retrieval
**Mitigation**:
- Conscious agent promotes important memories (every 6 hours)
- Archive old memories (>90 days) to backup table
- Keep active memories <500 per chatmode
- Relevance threshold filters low-value memories

**Implementation**:
```sql
-- Archive old, low-importance memories
INSERT INTO memori.memories_archive
SELECT * FROM memori.memories
WHERE created_at < NOW() - INTERVAL '90 days'
  AND (metadata->>'importance')::float < 0.5;

DELETE FROM memori.memories
WHERE created_at < NOW() - INTERVAL '90 days'
  AND (metadata->>'importance')::float < 0.5;
```

### Risk 3: Context Leakage Between Chatmodes

**Impact**: Chatmodes access inappropriate memories
**Mitigation**:
- Strict `user_id` filtering in queries
- Explicit cross-chatmode learning rules
- Metadata flags for sharing permissions

**Implementation**:
```typescript
// Service-Engineer can only read own memories + approved cross-chatmode learnings
const memories = await memoriClient.searchMemories({
  userId: 'service_engineer', // Own memories
  category: ['skills', 'preferences'],
  crossChatmodeAllowed: ['pt2_architect'], // Can read architect decisions
  limit: 10
});
```

### Risk 4: Static Files Become Stale

**Impact**: Baseline context outdated while Memori has fresh info
**Mitigation**:
- Documenter reviews Memori weekly
- Automatic prompts to update memory files
- Memori metadata tracks when static files last synced

**Implementation**:
```typescript
// Every Friday, prompt documenter
if (dayOfWeek === 'Friday') {
  const recentLearnings = await memoriClient.searchMemories({
    createdAfter: lastWeekFriday,
    importance: { min: 0.8 },
    category: ['decisions', 'patterns']
  });

  if (recentLearnings.length > 10) {
    console.log('Documenter: Consider updating memory files with recent learnings');
  }
}
```

---

## Next Steps

### Immediate Actions (Week 1)

1. **Review and Approve Strategy**
   - Stakeholder review of this document
   - Confirm chatmode memory contexts
   - Approve implementation phases

2. **Run Memori Reset Script**
   ```bash
   python scripts/memori-reset-and-seed.py
   ```
   - Cleans incorrect doc-storage memories
   - Seeds baseline project context
   - Verifies database state

3. **Test Basic Memori Queries**
   ```bash
   python scripts/memori-test.py
   ```
   - Verify context isolation
   - Test memory retrieval
   - Confirm full-text search

### Phase 2 Implementation (Week 2-3)

1. **Create Memori SDK Wrapper**
   - Implement `lib/memori/client.ts`
   - Add TypeScript types for PT-2 memory structure
   - Write unit tests

2. **Create Session Hooks**
   - `.claude/hooks/memori-session-start.hook.ts`
   - `.claude/hooks/memori-session-end.hook.ts`
   - Test hook execution

3. **Update One Chatmode (Pilot)**
   - Start with `service-engineer.chatmode.md`
   - Add memory recording protocol
   - Test with sample service creation
   - Measure effectiveness

### Phase 3 Implementation (Week 4-5)

1. **Implement Workflow State Tracking**
   - Create `lib/memori/workflow-state.ts`
   - Update `create-service.prompt.md` with state tracking
   - Test cross-session workflow recovery

2. **Update Remaining Chatmodes**
   - Architect, documenter, backend-dev, frontend-dev, reviewer
   - Add chatmode-specific recording protocols
   - Test cross-chatmode learning

### Phase 4 Rollout (Week 6)

1. **Integration Testing**
   - End-to-end workflow test (create-service)
   - Cross-session recovery test
   - Multi-chatmode coordination test

2. **Documentation Updates**
   - Update `.memori/README.md` with usage guide
   - Update chatmode docs with memory examples
   - Create developer onboarding guide

3. **Production Rollout**
   - Enable Memori for all sessions
   - Monitor memory growth
   - Collect user feedback

---

## Appendix A: Memori Schema Reference

### memories Table

```sql
CREATE TABLE memori.memories (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,              -- Chatmode context (e.g., 'service_engineer')
    content TEXT NOT NULL,                       -- The learning/decision (100-300 chars ideal)
    category VARCHAR(50),                        -- 'facts', 'preferences', 'skills', 'rules', 'context'
    metadata JSONB DEFAULT '{}',                 -- Structured metadata (see examples below)
    embedding VECTOR(1536),                      -- Semantic search (OpenAI ada-002)
    content_tsv TSVECTOR,                        -- Full-text search
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Metadata Structure Examples

**Service Creation**:
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

**Architecture Decision**:
```json
{
  "chatmode": "architect",
  "spec_file": ".claude/specs/loyalty-service.spec.md",
  "alternatives_considered": ["event-sourced ledger", "snapshot-based"],
  "decision_rationale": "Append-only ledger for audit trail",
  "validation_gate": "gate_1_approved",
  "relevant_docs": ["SRM.md", "ADR-003.md"],
  "importance": 1.0,
  "timestamp": "2025-11-21T09:00:00Z"
}
```

**User Preference**:
```json
{
  "chatmode": "pt2_agent",
  "type": "naming_convention",
  "preference": "Use .test.ts extension for test files",
  "importance": 1.0,
  "learned_from": "user_correction",
  "timestamp": "2025-11-21T14:00:00Z"
}
```

**Workflow State**:
```json
{
  "chatmode": "pt2_agent",
  "workflow": "create-service",
  "service_name": "loyalty_service",
  "current_phase": 2,
  "phases_completed": [1],
  "validation_gates": {
    "gate_1": {"status": "passed", "timestamp": "2025-11-21T09:00:00Z"},
    "gate_2": {"status": "in_progress", "started": "2025-11-21T10:00:00Z"}
  },
  "spec_file": ".claude/specs/loyalty-service.spec.md",
  "files_in_progress": ["src/services/loyalty.service.ts"],
  "next_action": "Complete implementation and unit tests",
  "session_id": "session_20251121_100000",
  "importance": 0.95,
  "timestamp": "2025-11-21T10:00:00Z"
}
```

---

## Appendix B: Comparison with Other Memory Systems

### vs. Static Memory Files

| Feature | Static Files | Memori | Best Choice |
|---------|-------------|--------|-------------|
| **Load Speed** | <10s | <500ms | Memori |
| **Version Control** | ✅ Git history | ❌ Database only | Static |
| **Human Editable** | ✅ Markdown | ❌ Database | Static |
| **Dynamic Learning** | ❌ Manual updates | ✅ Automatic | Memori |
| **Cross-Session State** | ❌ None | ✅ Automatic | Memori |
| **Semantic Search** | ❌ Grep only | ✅ Vector embeddings | Memori |
| **Chatmode Isolation** | ❌ Shared | ✅ Namespaced | Memori |

**Conclusion**: Hybrid approach uses both

### vs. Vector Databases (Pinecone, Weaviate)

| Feature | Vector DB | Memori | Winner |
|---------|-----------|--------|--------|
| **Semantic Search** | ✅ Best-in-class | ✅ pgvector | Tie |
| **SQL Queries** | ❌ Limited | ✅ Full SQL | Memori |
| **Temporal Queries** | ❌ Weak | ✅ Native timestamps | Memori |
| **Cost** | $$ Hosted | $ Self-hosted | Memori |
| **Integration** | External service | Supabase DB | Memori |
| **Relationships** | ❌ None | ✅ Foreign keys | Memori |

**Conclusion**: Memori better for PT-2 (SQL-native, integrated)

### vs. Conversation History (ChatGPT Memory)

| Feature | Chat History | Memori | Winner |
|---------|-------------|--------|--------|
| **Structured Metadata** | ❌ Unstructured | ✅ JSONB | Memori |
| **Chatmode Isolation** | ❌ Shared | ✅ Namespaced | Memori |
| **Workflow State** | ❌ None | ✅ Tracked | Memori |
| **Query Flexibility** | ❌ Limited | ✅ SQL | Memori |
| **Entity Extraction** | ❌ Basic | ✅ Custom | Memori |
| **Audit Trail** | ❌ Opaque | ✅ Timestamps | Memori |

**Conclusion**: Memori purpose-built for agentic workflows

---

## Appendix C: Example Session Transcript

### Complete Create-Service Workflow with Memori

**Session Start**:
```
[Memori auto-loads]
- Static memory files: 7 files (project, anti-patterns, etc.)
- Memori context: 5 recent memories
  - "Project: PT-2 casino management system"
  - "Use functional factories for services"
  - "Run npm run db:types after migrations"
  - "Last worked on: MTLService (2025-11-20)"
  - "User prefers .test.ts for test files"

Load time: 8 seconds
```

**User**: "Create LoyaltyService for tracking player points and tier status"

**Phase 1: Architecture Design (Architect Chatmode)**
```
[Architect reads]
- Static: service-catalog.memory.md (bounded contexts)
- Static: SERVICE_TEMPLATE.md (patterns)
- Memori: "MTLService uses append-only ledger" (similar pattern)

[Architect analyzes]
- Bounded context: Loyalty
- Tables: points_ledger, player_tier_status
- Pattern: Append-only ledger (like MTL)

[Architect creates]
- File: .claude/specs/loyalty-service.spec.md
- Content: Service interface, methods, data model

[Memori records]
{
  "user_id": "pt2_architect",
  "content": "Created LoyaltyService spec with points ledger and tier progression system",
  "category": "decisions",
  "metadata": {
    "spec_file": ".claude/specs/loyalty-service.spec.md",
    "pattern": "append_only_ledger",
    "tables": ["points_ledger", "player_tier_status"],
    "similar_to": "mtl_service"
  }
}
```

**VALIDATION GATE 1**: User reviews spec

**User**: "Looks good, proceed"

```
[Memori records]
{
  "user_id": "pt2_architect",
  "content": "VALIDATION GATE 1 PASSED: LoyaltyService spec approved",
  "category": "context",
  "metadata": {
    "workflow": "create-service",
    "service": "loyalty_service",
    "gate": 1,
    "outcome": "approved"
  }
}
```

**Phase 2: Implementation (Service-Engineer Chatmode)**
```
[Service-Engineer reads]
- File: .claude/specs/loyalty-service.spec.md
- Static: SERVICE_TEMPLATE.md
- Static: anti-patterns.memory.md
- Memori: "Use functional factories, not classes"
- Memori: "No ReturnType inference"

[Service-Engineer implements]
- Creates: src/services/loyalty.service.ts
- Pattern: Functional factory
- Interface: Explicit LoyaltyServiceInterface
- Methods: awardPoints(), adjustBalance(), getCurrentTier()

[Memori records]
{
  "user_id": "service_engineer",
  "content": "Implemented LoyaltyService with awardPoints, adjustBalance, getCurrentTier methods",
  "category": "skills",
  "metadata": {
    "workflow": "create-service",
    "service": "loyalty_service",
    "files_created": ["src/services/loyalty.service.ts"],
    "pattern": "functional_factory",
    "methods": ["awardPoints", "adjustBalance", "getCurrentTier"],
    "based_on_spec": ".claude/specs/loyalty-service.spec.md"
  }
}
```

**VALIDATION GATE 2**: Implementation review

**User**: "Implementation looks good, but use snake_case_with_underscores for test describe blocks"

```
[Memori records user preference]
{
  "user_id": "pt2_agent",
  "content": "User prefers snake_case_with_underscores for test describe blocks",
  "category": "preferences",
  "metadata": {
    "type": "testing_convention",
    "importance": 1.0
  }
}

[Memori records gate outcome]
{
  "user_id": "service_engineer",
  "content": "VALIDATION GATE 2 PASSED: LoyaltyService implementation approved with test naming correction",
  "category": "context",
  "metadata": {
    "workflow": "create-service",
    "service": "loyalty_service",
    "gate": 2,
    "outcome": "approved_with_feedback"
  }
}
```

**Phase 3: Testing (Service-Engineer Chatmode)**
```
[Service-Engineer reads]
- Memori: "User prefers .test.ts extension"
- Memori: "User prefers snake_case_with_underscores for describe blocks"

[Service-Engineer creates tests]
- Creates: src/services/__tests__/loyalty.service.test.ts
- Uses: describe('loyalty_service_award_points', ...)  ✅ Correct first time
- Coverage: 89%

[Memori records]
{
  "user_id": "service_engineer",
  "content": "Created LoyaltyService unit tests with 89% coverage",
  "category": "skills",
  "metadata": {
    "workflow": "create-service",
    "service": "loyalty_service",
    "files_created": ["src/services/__tests__/loyalty.service.test.ts"],
    "test_coverage": 0.89,
    "test_naming": "snake_case_with_underscores"
  }
}
```

**VALIDATION GATE 3**: Test results

**User**: "Tests pass, complete the workflow"

```
[Memori records]
{
  "user_id": "service_engineer",
  "content": "VALIDATION GATE 3 PASSED: LoyaltyService tests passing with 89% coverage",
  "category": "context",
  "metadata": {
    "workflow": "create-service",
    "service": "loyalty_service",
    "gate": 3,
    "outcome": "approved"
  }
}
```

**Phase 4: Documentation (Documenter Chatmode)**
```
[Documenter updates]
- File: memory/service-catalog.memory.md
- Adds: LoyaltyService entry
- Updates: SRM reference

[Memori records]
{
  "user_id": "pt2_documenter",
  "content": "Updated service-catalog.memory.md to add LoyaltyService with points ledger and tier system",
  "category": "skills",
  "metadata": {
    "workflow": "create-service",
    "service": "loyalty_service",
    "files_updated": ["memory/service-catalog.memory.md"],
    "workflow_status": "completed"
  }
}
```

**Workflow Complete**:
```
[Memori workflow summary]
{
  "user_id": "pt2_agent",
  "content": "Completed create-service workflow for LoyaltyService: all 3 gates passed",
  "category": "context",
  "metadata": {
    "workflow": "create-service",
    "service": "loyalty_service",
    "phases_completed": [1, 2, 3, 4],
    "validation_gates": {
      "gate_1": "approved",
      "gate_2": "approved",
      "gate_3": "approved"
    },
    "files_created": [
      ".claude/specs/loyalty-service.spec.md",
      "src/services/loyalty.service.ts",
      "src/services/__tests__/loyalty.service.test.ts"
    ],
    "total_duration_minutes": 45,
    "session_id": "session_20251121_100000"
  }
}
```

**Next Session (Week Later)**:

**User**: "Add VIP tier to LoyaltyService"

```
[Memori auto-injects]
- "LoyaltyService at src/services/loyalty.service.ts"
- "Uses functional factory pattern"
- "Tier system: getCurrentTier() method"
- "Test file: src/services/__tests__/loyalty.service.test.ts"
- "User prefers snake_case_with_underscores for test blocks"

[Agent immediately knows]
- Where to add VIP tier (loyalty.service.ts)
- How to structure it (functional factory)
- How to test it (.test.ts with snake_case)
- No need to re-explain project

Implementation time: 10 minutes (vs 30 minutes with re-explanation)
```

---

**Document Version**: 1.0.0
**Last Updated**: 2025-11-21
**Status**: Proposed
**Maintained By**: Agentic Workflow Framework Team

---

**End of Document**
