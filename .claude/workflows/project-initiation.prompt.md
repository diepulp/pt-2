--- title: Project Initiation Workflow
description: Systematic workflow for setting up 3-layer agentic infrastructure with Skills and Memori
skill_sequence:
  - lead-architect       # Phase 1: Assess requirements (ArchitectContext)
  - skill-creator        # Phase 2: Create Skills infrastructure
  - backend-service-builder  # Phase 3: Validate setup (ValidationContext)
chatmode_fallback:
  - architect            # If skills unavailable
  - documenter           # For lightweight documentation
validation_gates: 4
estimated_time: 2-4 hours
version: 2.0.0
last_updated: 2025-11-25
context_files:
  - docs/agentic-workflow/PROJECT-INITIATION-STRATEGY.md
  - docs/context-engineering/SESSION_HANDOFF_SKILL_MEMORY_FIXES.md
  - lib/memori/README.md
---

# Project Initiation Workflow

## Overview

This workflow sets up the complete **3-layer agentic infrastructure** for a new project:

1. **Layer 1 (Static)**: Memory files, context files, instructions (Git-versioned)
2. **Layer 2 (Skills)**: Agent specialization with auto-activated Memori
3. **Layer 3 (Memori)**: Dynamic cross-session memory engine

**Use this workflow when:**
- Starting a new project from scratch
- Migrating an existing project to agentic workflow
- Onboarding a new development team to agentic practices
- Setting up cross-session memory for AI-assisted development

**Estimated Time**: 2-4 hours (full setup)

**Outcome**: Complete 3-layer agentic infrastructure with Skills and Memori integration

### Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│ CLAUDE.md (Entry Point)                                    │
│   @memory/*.memory.md → Auto-loaded static context         │
└────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            │                               │
            ▼                               ▼
┌───────────────────────────┐   ┌───────────────────────────┐
│ SKILLS (Skill tool)       │   │ SUB-AGENTS (Task tool)    │
│ ✅ Memori enabled         │   │ ❌ Stateless              │
│ ✅ Cross-session memory   │   │ ✅ Can run in parallel    │
│                           │   │                           │
│ lead-architect            │   │ system-architect          │
│ backend-service-builder   │   │ backend-architect         │
│ frontend-design           │   │ full-stack-developer      │
│ skill-creator             │   │ Explore, Plan             │
└─────────────┬─────────────┘   └─────────────┬─────────────┘
              │                               │
              │ Records to Memori             │ Returns report only
              ▼                               ▼
┌────────────────────────────────────────────────────────────┐
│ MEMORI ENGINE (Persistent Memory)                          │
│   lib/memori/client.py → Core API                          │
│   PostgreSQL memori schema → Cross-session storage         │
│                                                            │
│   Note: Sub-agent results must be manually recorded        │
└────────────────────────────────────────────────────────────┘
```

### Agent Primitives Hierarchy

| Primitive | Tool | Memory | Parallel | Use When |
|-----------|------|--------|----------|----------|
| **Skills** | `Skill` | ✅ Memori | ❌ No | Cross-session memory needed |
| **Sub-agents** | `Task` | ❌ None | ✅ Yes | Parallel exploration, stateless tasks |
| **Chatmodes** | `/chatmode` | ❌ None | ❌ No | Lightweight role switching |

---

## Prerequisites

Before starting this workflow:

### Essential
- [ ] Project repository created
- [ ] Basic project structure exists (if migrating)
- [ ] Project requirements document available (or PRD)
- [ ] Key stakeholders identified

### For Memori Integration (Layer 3)
- [ ] PostgreSQL database available (local or Supabase)
- [ ] `lib/memori/` directory created (copy from PT-2 reference)
- [ ] Python 3.10+ installed for Memori SDK
- [ ] `pgvector` extension enabled in PostgreSQL

### Reference Files (Copy from PT-2)
```
lib/memori/
├── __init__.py
├── client.py              # Core Memori API
├── skill_context.py       # Context classes
├── workflow_state.py      # State tracking
└── session_hooks.py       # Lifecycle hooks

.claude/hooks/
├── skill-init-memori.sh   # Auto-activation hook
├── context-init-session.sh
└── context-end-session.sh
```

---

## Phase 1: Requirements Assessment (lead-architect Skill)

**Skill**: `lead-architect` (preferred) or `architect.chatmode.md` (fallback)
**Context Class**: `ArchitectContext` (auto-activated via hook)
**Tools**: Read, Grep, Glob, WebSearch, sequential-thinking
**Output**: Project assessment document with infrastructure plan

> **Note**: Using the `lead-architect` skill automatically activates Memori with `skill_lead_architect` namespace. All architectural decisions are recorded for cross-session continuity.

### Step 1.1: Gather Project Context

**Questions to answer:**

1. **Project Type**
   - Web application? Backend service? Full-stack?
   - Tech stack: Framework, database, state management
   - Target platform: Web, mobile, desktop

2. **Architecture Patterns**
   - Monolith vs microservices
   - Horizontal layers vs vertical slices
   - Service boundaries (if applicable)

3. **Team Structure**
   - Team size
   - Roles: Architects, engineers, QA, DevOps
   - Development workflow: Agile, waterfall, continuous

4. **Project Scope**
   - MVP features
   - Long-term vision
   - Non-functional requirements (performance, security, scalability)

5. **Existing Documentation**
   - Requirements documents (PRD, specs)
   - Architecture diagrams
   - Design documents
   - Technical standards

### Step 1.2: Identify Agentic Primitives Needed

Based on project assessment, determine requirements for all 3 layers:

#### Layer 1: Static Context (Memory Files)

```
Essential (all projects):
- memory/project.memory.md           # Project context, tech stack, patterns
- memory/anti-patterns.memory.md     # Forbidden patterns
- memory/phase-status.memory.md      # Current work, blockers

Domain-specific:
- memory/architecture-decisions.memory.md  # For architecture-heavy projects
- memory/service-catalog.memory.md         # For service-oriented projects
- memory/domain-glossary.memory.md         # For complex domain models
- memory/coding-standards.memory.md        # For multi-team projects
```

#### Layer 2: Skills (Primary Agent Specialization)

```
Essential (all projects):
- .claude/skills/lead-architect/SKILL.md      # Architecture decisions (ArchitectContext)
- .claude/skills/skill-creator/SKILL.md       # Create new skills

Project-specific:
- .claude/skills/backend-service-builder/SKILL.md  # Backend services (ValidationContext)
- .claude/skills/frontend-design/SKILL.md          # Frontend components (SkillContext)

Each skill requires:
├── SKILL.md                 # Skill definition with Memori integration
├── scripts/                 # Validation scripts (optional)
└── templates/               # Code templates (optional)
```

**Skill Namespace Registry** (add to `lib/memori/client.py`):
```python
CHATMODE_USER_IDS = {
    # Skill namespaces
    "skill:lead-architect": "skill_lead_architect",
    "skill:backend-service-builder": "skill_backend_service_builder",
    "skill:frontend-design": "skill_frontend_design",
    "skill:skill-creator": "skill_skill_creator",
    # Add project-specific skills here
}
```

#### Layer 2 (Fallback): Chatmodes (Lightweight Tasks)

```
For one-off tasks without memory requirement:
- .github/chatmodes/reviewer.chatmode.md      # Quick code review
- .github/chatmodes/documenter.chatmode.md    # Quick documentation

Note: Use Skills for tasks requiring cross-session memory.
      Use Chatmodes for simple, one-off operations.
```

#### Layer 2 (Parallel): Sub-agents (Stateless Tasks)

```
Sub-agents are spawned via Task tool for parallel, stateless work.
They do NOT have Memori integration - results must be manually recorded.

Available sub-agents (built-in):
- system-architect          # System design, scalability analysis
- backend-architect         # Backend systems, data integrity
- full-stack-developer      # End-to-end application development
- typescript-pro            # TypeScript architecture and refactoring
- react-pro                 # React component development
- Explore                   # Fast codebase exploration
- Plan                      # Planning and exploration

Custom sub-agents (project-specific):
- .claude/agents/*.md       # Define custom sub-agents here

When to use sub-agents vs skills:
┌─────────────────────────────────────────────────────────────┐
│ Need memory persistence?                                    │
│   YES → Use Skill (lead-architect, backend-service-builder) │
│   NO  → Use Sub-agent (system-architect, Explore)           │
│                                                             │
│ Need parallel execution?                                    │
│   YES → Use Sub-agent (can spawn multiple)                  │
│   NO  → Use Skill (sequential but with memory)              │
│                                                             │
│ Quick exploration/research?                                 │
│   YES → Use Explore or Plan sub-agent                       │
│   NO  → Use appropriate Skill for the domain                │
└─────────────────────────────────────────────────────────────┘

Bridging pattern (get parallelism + memory):
  1. Spawn sub-agent for analysis
  2. Receive results in main conversation
  3. Record findings to Memori via Skill context class
```

#### Layer 3: Memori Infrastructure

```
Essential (copy from PT-2):
lib/memori/
├── __init__.py              # Package exports
├── client.py                # Core API + CHATMODE_USER_IDS
├── skill_context.py         # SkillContext, ValidationContext, ArchitectContext
├── workflow_state.py        # Phase tracking
└── session_hooks.py         # Lifecycle management

.claude/hooks/
├── skill-init-memori.sh     # PreToolUse hook for auto-activation
├── context-init-session.sh  # Session start
└── context-end-session.sh   # Session end

Database schema (memori.*):
- memories                   # Agent learnings (pgvector)
- entities                   # Extracted entities
- relationships              # Entity relationships
- conversations              # Session tracking
```

#### Workflows Required

```
Essential:
- .claude/workflows/session-handoff.prompt.md   # Session continuity
- .claude/workflows/phase-completion.prompt.md  # Phase signoffs

Project-specific:
- .claude/workflows/create-service.prompt.md    # For service-oriented
- .claude/workflows/create-adr.prompt.md        # For architecture decisions
- .claude/workflows/write-migration.prompt.md   # For database projects
```

#### Context Files Required

```
Essential:
- context/architecture.context.md    # Architecture patterns
- context/governance.context.md      # Standards and templates

Project-specific:
- context/api-security.context.md    # API security patterns
- context/db.context.md              # Database patterns
- context/quality.context.md         # Test patterns
- context/state-management.context.md  # State management (frontend)
```

### Step 1.3: Create Project Initiation Plan

**Output: Project assessment document**

```markdown
# Project Initiation Assessment

**Project**: {Project Name}
**Type**: {Web App / Backend Service / Full-Stack}
**Tech Stack**: {Framework, Database, etc.}
**Team Size**: {N developers}
**Timeline**: {Duration}

## Architecture Overview

**Pattern**: {Horizontal / Vertical / Hybrid}
**Service Boundaries**: {If applicable}
**Key Components**: {List major components}

## 3-Layer Agentic Infrastructure Plan

### Layer 1: Static Context (Memory Files)
1. ✅ project.memory.md (ESSENTIAL)
2. ✅ anti-patterns.memory.md (ESSENTIAL)
3. ✅ phase-status.memory.md (ESSENTIAL)
4. [ ] architecture-decisions.memory.md
5. [ ] service-catalog.memory.md
6. [ ] domain-glossary.memory.md

### Layer 2: Skills (Primary Agents)
1. ✅ lead-architect/SKILL.md (ESSENTIAL) → ArchitectContext
2. ✅ skill-creator/SKILL.md (ESSENTIAL) → SkillContext
3. [ ] backend-service-builder/SKILL.md → ValidationContext
4. [ ] frontend-design/SKILL.md → SkillContext

### Layer 2 (Fallback): Chatmodes
1. [ ] reviewer.chatmode.md (for quick reviews)
2. [ ] documenter.chatmode.md (for quick docs)

### Layer 3: Memori Infrastructure
1. ✅ lib/memori/ directory (ESSENTIAL)
2. ✅ CHATMODE_USER_IDS with skill namespaces
3. ✅ .claude/hooks/skill-init-memori.sh (ESSENTIAL)
4. ✅ PostgreSQL memori schema
5. [ ] pgvector extension enabled

### Workflows to Create
1. ✅ session-handoff.prompt.md (ESSENTIAL)
2. ✅ phase-completion.prompt.md (ESSENTIAL)
3. [ ] create-service.prompt.md
4. [ ] create-adr.prompt.md

### Context Files to Create
1. ✅ architecture.context.md (ESSENTIAL)
2. ✅ governance.context.md (ESSENTIAL)
3. [ ] api-security.context.md
4. [ ] db.context.md

## Estimated Effort

- Phase 2 (Layer 1 - Memory files): 30-60 min
- Phase 3 (Layer 2 - Skills setup): 60-90 min
- Phase 4 (Layer 3 - Memori setup): 30-60 min
- Phase 5 (Context & finalization): 30-60 min

**Total**: 2-4 hours
```

### Step 1.4: VALIDATION GATE 1 - Assessment Review

🛑 **STOP: Present assessment to user**

```
🛑 VALIDATION GATE 1: Project Assessment Review

**Project**: {Name}
**Type**: {Type}
**Tech Stack**: {Stack}

**3-Layer Infrastructure Plan**:

Layer 1 - Memory Files: {N} files
  Essential: 3 (project, anti-patterns, phase-status)
  Optional: {N} additional

Layer 2 - Skills: {N} skills
  Essential: 2 (lead-architect, skill-creator)
  Optional: {N} additional (backend-service-builder, frontend-design)

Layer 2 (Fallback) - Chatmodes: {N} chatmodes
  Optional: reviewer, documenter

Layer 3 - Memori: Required
  - lib/memori/ directory
  - skill-init-memori.sh hook
  - PostgreSQL memori schema

Workflows: {N} workflows
  Essential: 2 (session-handoff, phase-completion)
  Optional: {N} additional

Context Files: {N} files
  Essential: 2 (architecture, governance)
  Optional: {N} additional

**Estimated Effort**: 2-4 hours

**Next Steps**:
  1. Create memory files (Phase 2)
  2. Set up Skills with Memori (Phase 3)
  3. Configure Memori infrastructure (Phase 4)
  4. Finalize context documentation (Phase 5)

Do you approve this plan? (Reply "approved" to proceed)
```

---

## Phase 2: Memory File Initialization (Layer 1)

**Skill**: Use `skill-creator` or `documenter.chatmode.md` (fallback)
**Tools**: Read, Write, Edit
**Input**: Project assessment from Phase 1
**Output**: Initialized memory files (static context)

### Step 2.1: Create Essential Memory Files

#### File: memory/project.memory.md

**Template:**

```markdown
# Project Memory ({Project Name})

decisions:
  - "{date}: Project initiated with agentic workflow infrastructure"
  - "{date}: Tech stack: {Framework, Database, etc.}"
  - "{date}: Architecture pattern: {Pattern}"

patterns:
  worked:
    - "TBD - Will be populated during development"
  pitfalls:
    - "TBD - Will capture lessons learned"

tech_stack:
  framework: "{Framework}"
  database: "{Database}"
  state_management: "{State library}"
  testing: "{Test framework}"
  ui: "{UI library}"

core_patterns:
  - "{Pattern 1 description}"
  - "{Pattern 2 description}"

nextSteps:
  - "Complete agentic infrastructure setup"
  - "Create initial project specifications"
  - "Begin Phase 1 implementation"
```

#### File: memory/anti-patterns.memory.md

**Template:**

```markdown
# Anti-Patterns Memory ({Project Name})

## Code Structure

### ❌ Forbidden Patterns

**Classes when functions suffice**:
- Use functional factories, NOT classes (unless truly OOP)
- Example: Service layer should be functional

**Type inference abuse**:
- NO ReturnType inference for public APIs
- Explicit interfaces always

**Global state**:
- NO global singletons
- Dependency injection over globals

## Architecture

### ❌ Forbidden Patterns

**Over-engineering** (OE-01 Guardrail):
- NO infrastructure without demonstrated need
- Measure before adding complexity
- "We might need it later" → NO

**Service coupling** (if service-oriented):
- NO service-to-service direct calls
- Client orchestrates multiple services

**Vague boundaries**:
- Every service must answer ONE key question
- Clear data ownership (OWNS vs REFERENCES)

## Quality

### ❌ Forbidden Patterns

**Console in production**:
- NO console.* in production code
- Use proper logging library

**Type safety bypasses**:
- NO 'any' typing (use 'unknown' if needed)
- NO @ts-ignore without justification

**Test gaps**:
- Coverage minimum: 80%
- No skipped tests in main branch

## Process

### ❌ Forbidden Patterns

**Bypassing validation gates**:
- NO implementation without approved spec
- NO deployment without review
- NO architecture changes without ADR

**Memory drift**:
- Memory files MUST be updated after changes
- Stale memory files are technical debt
```

#### File: memory/phase-status.memory.md

**Template:**

```markdown
# Phase Status Memory ({Project Name})

last_updated: {date}

## Current Phase

**Phase**: Initialization (Phase 0)
**Status**: In Progress
**Progress**: 50% (agentic infrastructure setup)

**Current Tasks**:
- [ ] Complete memory file initialization
- [ ] Create chatmodes and workflows
- [ ] Initialize context documentation
- [ ] Create initial project specifications

## Blockers

No blockers currently identified.

## Recently Completed

- ✅ Project repository created
- ✅ Agentic workflow assessment complete
- ✅ Project initiation plan approved
- ✅ Essential memory files initialized

## Next Actions (Priority)

1. **HIGH**: Complete agentic infrastructure setup
2. **MEDIUM**: Create initial project specifications
3. **MEDIUM**: Set up CI/CD pipelines
4. **LOW**: Developer onboarding documentation

## Milestones

### Phase 0: Infrastructure Setup (Current)
- Start: {date}
- Target: {date}
- Status: In Progress (50%)

### Phase 1: MVP Development
- Start: TBD
- Target: TBD
- Status: Not Started

### Phase 2: Testing & Refinement
- Start: TBD
- Target: TBD
- Status: Not Started

### Phase 3: Deployment
- Start: TBD
- Target: TBD
- Status: Not Started
```

### Step 2.2: Create Optional Memory Files (Based on Plan)

**If service-oriented architecture:**

Create `memory/service-catalog.memory.md`:

```markdown
# Service Catalog Snapshot ({Project Name})

last_updated: {date}
canonical_source: {Link to full service documentation}

## Service Registry

*Services will be added as they are implemented*

### Example: {ServiceName}Service

**Bounded Context**: "{Key question this service answers}"
**Location**: `services/{service}/`
**Ownership**:
- OWNS: [tables/fields]
- REFERENCES: [other services]
**Status**: Proposed / Implemented
**Created**: {date}
```

**If architecture-heavy:**

Create `memory/architecture-decisions.memory.md`:

```markdown
# Architecture Decisions Memory ({Project Name})

last_updated: {date}

## Key Decisions

*ADRs will be added as architectural decisions are made*

### ADR-001: {Decision Title} ({date})

**Decision**: [Brief summary]
**Rationale**: [Why this was chosen]
**Alternatives Rejected**: [Options considered]
**Impact**: [Consequences]
**Full Document**: `docs/adrs/ADR-001-description.md`
```

**If complex domain:**

Create `memory/domain-glossary.memory.md`:

```markdown
# Domain Glossary ({Project Name})

last_updated: {date}

## Core Concepts

*Domain terms will be added as they are identified*

### {Term}
**Definition**: [Clear, concise definition]
**Context**: [Where/how this is used]
**Related**: [Related terms]

## Bounded Contexts

*If using domain-driven design patterns*

### {Context Name}
**Key Question**: "{Question this context answers}"
**Responsibility**: [What this context handles]
**Boundaries**: [What it does NOT handle]
```

### Step 2.3: VALIDATION GATE 2 - Memory Files Review

🛑 **STOP: Present memory files to user**

```
🛑 VALIDATION GATE 2: Memory Files Review

**Memory Files Created**:

Essential:
  ✅ memory/project.memory.md
  ✅ memory/anti-patterns.memory.md
  ✅ memory/phase-status.memory.md

Optional:
  [✅/❌] memory/architecture-decisions.memory.md
  [✅/❌] memory/service-catalog.memory.md
  [✅/❌] memory/domain-glossary.memory.md

**Total Size**: ~{N} lines ({M} words)

**Auto-load Configuration**: Ready to be added to .claude/CLAUDE.md

**Next Steps**:
  - Create chatmodes and workflows (architect)
  - Initialize context documentation (documenter)

Memory files ready? (Reply "proceed" to continue)
```

---

## Phase 3: Skills Setup (Layer 2)

**Skill**: `skill-creator` (to create new skills)
**Tools**: Read, Write, Edit
**Input**: Project assessment
**Output**: Skill definitions with Memori integration

### Step 3.1: Create Essential Skills

**Required for all projects:**

1. **lead-architect/SKILL.md**
   - Copy from PT-2 reference: `.claude/skills/lead-architect/`
   - Context class: `ArchitectContext`
   - Use for: Architecture decisions, ADRs, system design

2. **skill-creator/SKILL.md**
   - Copy from PT-2 reference: `.claude/skills/skill-creator/`
   - Context class: `SkillContext`
   - Use for: Creating new project-specific skills

### Step 3.2: Create Project-Specific Skills

**Based on project type:**

**Backend-focused projects:**
- `backend-service-builder/SKILL.md`
  - Context class: `ValidationContext`
  - Use for: Service implementation with validation

**Frontend-focused projects:**
- `frontend-design/SKILL.md`
  - Context class: `SkillContext`
  - Use for: Component design with memory

**Full-stack projects:**
- Both backend and frontend skills

### Step 3.3: Skill SKILL.md Template

Each skill must include Memori integration:

```markdown
---
name: {skill-name}
description: {description}
namespace: skill:{skill-name}
context_class: SkillContext | ValidationContext | ArchitectContext
---

# {Skill Name}

## Memory Activation Model

Memory is **automatically activated** when this skill is invoked via the `Skill` tool.

**How automatic activation works:**
1. `PreToolUse` hook detects `Skill` tool invocation
2. `skill-init-memori.sh` extracts skill name and initializes namespace
3. Memori client is enabled for `skill_{name}` namespace
4. All subsequent memory operations use the skill namespace

**Manual activation** (if needed outside skill invocation):

\`\`\`python
from lib.memori import create_memori_client, {ContextClass}

memori = create_memori_client("skill:{skill-name}")
memori.enable()  # Required for manual initialization
context = {ContextClass}(memori)
\`\`\`

## Skill Instructions

{Detailed instructions for the skill...}
```

### Step 3.4: Register Skill Namespaces

Update `lib/memori/client.py` with new skill namespaces:

```python
CHATMODE_USER_IDS = {
    # ... existing entries ...

    # Project-specific skills
    "skill:{skill-name}": "skill_{skill_name_underscored}",
}
```

### Step 3.5: Create Essential Workflows

**Required for all projects:**

1. **session-handoff.prompt.md**
   - Automates session continuity
   - Updates memory files + Memori learnings
   - Captures technical notes

2. **phase-completion.prompt.md**
   - Checklist-based signoffs
   - Quality gate verification
   - Records to ValidationContext

### Step 3.6: VALIDATION GATE 3 - Skills Review

🛑 **STOP: Present skills infrastructure**

```
🛑 VALIDATION GATE 3: Skills Infrastructure Complete

**Skills Created** ({N} total):
  ✅ lead-architect/SKILL.md → ArchitectContext
  ✅ skill-creator/SKILL.md → SkillContext
  [List project-specific skills]

**Skill Namespaces Registered**:
  ✅ skill:lead-architect → skill_lead_architect
  ✅ skill:skill-creator → skill_skill_creator
  [List additional namespaces]

**Workflows Created** ({N} total):
  ✅ session-handoff.prompt.md
  ✅ phase-completion.prompt.md
  [List optional workflows]

**Directory Structure**:
  ✅ .claude/skills/
  ✅ .claude/workflows/
  ✅ .claude/specs/
  ✅ memory/
  ✅ context/ (to be populated)

**Next Steps**:
  - Set up Memori infrastructure (Phase 4)
  - Initialize context documentation (Phase 5)
  - Begin Phase 1 development

Skills infrastructure complete? (Reply "proceed" to continue)
```

---

## Phase 4: Memori Infrastructure Setup (Layer 3)

**Skill**: `backend-service-builder` (for validation) or manual setup
**Tools**: Read, Write, Edit, Bash
**Output**: Memori engine configured and tested

### Step 4.1: Copy Memori Library

Copy from PT-2 reference implementation:

```bash
# Copy core Memori library
cp -r /path/to/pt-2/lib/memori/ ./lib/memori/

# Copy hooks
cp /path/to/pt-2/.claude/hooks/skill-init-memori.sh ./.claude/hooks/
cp /path/to/pt-2/.claude/hooks/context-init-session.sh ./.claude/hooks/
cp /path/to/pt-2/.claude/hooks/context-end-session.sh ./.claude/hooks/
```

### Step 4.2: Configure Database Schema

Create the Memori schema in PostgreSQL:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create memori schema
CREATE SCHEMA IF NOT EXISTS memori;

-- Create tables
CREATE TABLE memori.memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'context',
    metadata JSONB DEFAULT '{}',
    importance FLOAT DEFAULT 0.5,
    embedding vector(1536),
    content_tsv tsvector,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE memori.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'
);

-- Create indexes
CREATE INDEX idx_memories_user_id ON memori.memories(user_id);
CREATE INDEX idx_memories_category ON memori.memories(category);
CREATE INDEX idx_memories_content_tsv ON memori.memories USING GIN(content_tsv);
CREATE INDEX idx_memories_embedding ON memori.memories USING ivfflat(embedding vector_cosine_ops);
```

### Step 4.3: Configure PreToolUse Hook

Update `.claude/settings.local.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Skill",
        "hooks": [{ "command": ".claude/hooks/skill-init-memori.sh" }]
      }
    ]
  }
}
```

### Step 4.4: Test Memori Integration

```python
# test_memori_setup.py
from lib.memori import create_memori_client, SkillContext

# Test client creation
memori = create_memori_client("skill:lead-architect")
memori.enable()

# Test recording
context = SkillContext(memori)
result = context.record_skill_execution(
    skill_name="lead-architect",
    task="Test setup",
    outcome="success"
)

print(f"Memori setup: {'✅ SUCCESS' if result else '❌ FAILED'}")
```

### Step 4.5: VALIDATION GATE 4 - Memori Review

🛑 **STOP: Verify Memori infrastructure**

```
🛑 VALIDATION GATE 4: Memori Infrastructure Complete

**Memori Library**:
  ✅ lib/memori/__init__.py
  ✅ lib/memori/client.py
  ✅ lib/memori/skill_context.py
  ✅ lib/memori/workflow_state.py

**Hooks Configured**:
  ✅ .claude/hooks/skill-init-memori.sh
  ✅ .claude/settings.local.json updated

**Database Schema**:
  ✅ memori schema created
  ✅ pgvector extension enabled
  ✅ Tables: memories, conversations

**Integration Test**:
  ✅ Client creation works
  ✅ Memory recording works
  ✅ Skill namespace isolation verified

Memori ready? (Reply "finalize" to proceed to context documentation)
```

---

## Phase 5: Context Documentation & Finalization (Layer 1 Completion)

**Chatmode**: `documenter.chatmode.md` (lightweight, no memory needed)
**Tools**: Read, Write, Edit
**Output**: Context files, .claude/CLAUDE.md updated

### Step 5.1: Create Essential Context Files

#### File: context/architecture.context.md

**Template:**

```markdown
# Architecture Context ({Project Name})

## Architecture Pattern

**Pattern**: {Horizontal / Vertical / Hybrid}
**Rationale**: {Why this pattern was chosen}

## Component Structure

{Describe major components and their relationships}

## Key Architectural Decisions

- {Decision 1}: {Brief description}
  - **Why**: {Rationale}
  - **See**: ADR-XXX (when created)

- {Decision 2}: {Brief description}
  - **Why**: {Rationale}
  - **See**: ADR-XXX (when created)

## Service Boundaries (if applicable)

{Describe service boundaries and bounded contexts}

## Data Flow

{Describe how data flows through the system}

## References

- Full architecture docs: `docs/architecture/`
- Architecture diagrams: `docs/architecture/diagrams/`
- Service Responsibility Matrix: `docs/architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (if exists)
```

#### File: context/governance.context.md

**Template:**

```markdown
# Governance Context ({Project Name})

## Coding Standards

### Type System
- {Standard 1}
- {Standard 2}

### Code Organization
- {Standard 1}
- {Standard 2}

### Error Handling
- {Standard 1}
- {Standard 2}

## Templates

### Service Template (if applicable)
- **Location**: `docs/templates/SERVICE_TEMPLATE.md`
- **Usage**: Follow this template for all new services
- **Sections**: {List key sections}

### Component Template (if applicable)
- **Location**: `docs/templates/COMPONENT_TEMPLATE.md`
- **Usage**: Follow this template for all new components
- **Sections**: {List key sections}

## Workflow Standards

### Git Workflow
- {Branch strategy}
- {Commit message format}
- {PR requirements}

### Review Process
- {Review checklist}
- {Approval requirements}

### Deployment Process
- {Deployment steps}
- {Rollback procedure}

## References

- Full governance docs: `docs/governance/`
- Templates: `docs/templates/`
- Standards: `docs/standards/`
```

### Step 5.2: Create Optional Context Files (Based on Plan)

**If API-focused:**

Create `context/api-security.context.md`:

```markdown
# API Security Context ({Project Name})

## Authentication

{Auth mechanism: JWT, OAuth, API keys, etc.}

## Authorization

{Authorization approach: RBAC, ABAC, etc.}

## API Security Patterns

- Rate limiting: {Approach}
- Input validation: {Approach}
- Error handling: {Approach}

## References

- Security docs: `docs/security/`
- API documentation: `docs/api/`
```

**If database-driven:**

Create `context/db.context.md`:

```markdown
# Database Context ({Project Name})

## Database Technology

{Database: PostgreSQL, MongoDB, etc.}

## Schema Management

- Migration tool: {Tool}
- Type generation: {Process}
- Schema versioning: {Approach}

## Query Patterns

{Describe common query patterns}

## References

- Database docs: `docs/database/`
- Migrations: `database/migrations/`
```

**If frontend-focused:**

Create `context/state-management.context.md`:

```markdown
# State Management Context ({Project Name})

## State Library

{State management solution: Redux, Zustand, React Query, etc.}

## Patterns

- Server state: {Approach}
- Client state: {Approach}
- Cache management: {Approach}

## References

- State management docs: `docs/frontend/state-management.md`
```

### Step 5.3: Update .claude/CLAUDE.md

**Add auto-load configuration:**

```markdown
# {Project Name} Architecture Standards

<!-- Auto-load Memory Files (Agentic Workflow) -->

@memory/project.memory.md
@memory/anti-patterns.memory.md
@memory/phase-status.memory.md
@memory/architecture-decisions.memory.md  <!-- If exists -->
@memory/service-catalog.memory.md         <!-- If exists -->
@memory/domain-glossary.memory.md         <!-- If exists -->

<!-- Full Documentation References -->

<!-- Context: context/architecture.context.md -->
<!-- Governance: context/governance.context.md -->
<!-- Security: context/api-security.context.md (if exists) -->
<!-- Database: context/db.context.md (if exists) -->

## Critical Standards (Quick Reference)

### {Standard Category 1}

- {Standard 1}
- {Standard 2}

### {Standard Category 2}

- {Standard 1}
- {Standard 2}

### Anti-Patterns (DO NOT)

- ❌ {Anti-pattern 1}
- ❌ {Anti-pattern 2}
- ❌ {Anti-pattern 3}
```

### Step 5.4: Create Developer Onboarding Guide

Create `docs/ONBOARDING.md`:

```markdown
# Developer Onboarding ({Project Name})

## Quick Start

### 1. Clone Repository

\```bash
git clone {repo-url}
cd {project-dir}
\```

### 2. Install Dependencies

\```bash
{install-command}
\```

### 3. Environment Setup

\```bash
cp .env.example .env
# Edit .env with your credentials
\```

### 4. Run Development Server

\```bash
{dev-command}
\```

## Agentic Workflow

This project uses **agentic workflow primitives** for AI-assisted development.

### Memory Files

The project maintains cross-session context in `memory/` files:
- `project.memory.md` - Project context, tech stack, patterns
- `anti-patterns.memory.md` - Forbidden patterns
- `phase-status.memory.md` - Current work, blockers, next steps

**These files are auto-loaded** when working with Claude Code.

### Chatmodes

Specialized AI agents for different tasks:
- `architect.chatmode.md` - System design, ADR creation
- `service-engineer.chatmode.md` - Service implementation
- `frontend-dev.chatmode.md` - Frontend implementation
- `reviewer.chatmode.md` - Code review, quality checks
- `documenter.chatmode.md` - Documentation updates

**Use the right chatmode for the task** to get specialized expertise.

### Workflows

Systematic workflows with validation gates:
- `create-service.prompt.md` - Service creation (3 validation gates)
- `create-adr.prompt.md` - Architecture decision records
- `session-handoff.prompt.md` - Session continuity
- `phase-completion.prompt.md` - Phase signoffs

**Workflows enforce quality gates** and ensure consistent outcomes.

## Architecture Overview

{Brief architecture overview}

**Full Details**: `docs/architecture/`

## Coding Standards

{Brief standards overview}

**Full Standards**: `context/governance.context.md`

## Anti-Patterns to Avoid

{List critical anti-patterns}

**Full List**: `memory/anti-patterns.memory.md`

## References

- Architecture: `docs/architecture/`
- API Documentation: `docs/api/`
- Security: `docs/security/`
- Testing: `docs/testing/`
```

### Step 5.5: Final Summary

```
✅ PROJECT INITIATION COMPLETE

**3-Layer Agentic Infrastructure Created**:

Layer 1 - Memory Files: {N} files
  - project.memory.md
  - anti-patterns.memory.md
  - phase-status.memory.md
  [List additional files]

Layer 2 - Skills: {N} skills
  - lead-architect/SKILL.md → ArchitectContext
  - skill-creator/SKILL.md → SkillContext
  [List project-specific skills]

Layer 2 (Fallback) - Chatmodes: {N} chatmodes
  - reviewer.chatmode.md (optional)
  - documenter.chatmode.md (optional)

Layer 3 - Memori Infrastructure:
  ✅ lib/memori/ directory
  ✅ skill-init-memori.sh hook
  ✅ PostgreSQL memori schema
  ✅ Skill namespaces registered

Workflows: {N} workflows
  - session-handoff.prompt.md
  - phase-completion.prompt.md
  [List additional workflows]

Context Files: {N} files
  - architecture.context.md
  - governance.context.md
  [List additional files]

Documentation:
  ✅ .claude/CLAUDE.md updated
  ✅ docs/ONBOARDING.md created
  ✅ .claude/specs/ directory created
  ✅ .claude/skills/ directory created

**Total Setup Time**: {X} hours

**Next Steps**:
  1. Review all created files
  2. Test Memori integration with test script
  3. Create initial project specifications (lead-architect skill)
  4. Begin Phase 1 development
  5. Use session-handoff workflow for session continuity

**Agentic Workflow Status**: ✅ READY FOR DEVELOPMENT (3-LAYER)
```

---

## Final Checklist

Before marking project initiation complete:

### Layer 1: Memory Infrastructure
- [ ] Essential memory files created (3 minimum)
- [ ] Optional memory files created (based on project)
- [ ] Memory files properly formatted
- [ ] Cross-references to detailed docs included
- [ ] Auto-load via CLAUDE.md @ syntax

### Layer 2: Skills Infrastructure
- [ ] Essential skills created (lead-architect, skill-creator)
- [ ] Project-specific skills created (if needed)
- [ ] Each SKILL.md has Memori integration section
- [ ] Skill namespaces registered in client.py CHATMODE_USER_IDS
- [ ] Context classes specified (SkillContext, ValidationContext, ArchitectContext)

### Layer 2 (Fallback): Chatmodes
- [ ] reviewer.chatmode.md created (optional)
- [ ] documenter.chatmode.md created (optional)
- [ ] Tool restrictions configured
- [ ] Context files properly referenced

### Layer 3: Memori Infrastructure
- [ ] lib/memori/ directory copied from PT-2
- [ ] skill-init-memori.sh hook configured
- [ ] .claude/settings.local.json updated with PreToolUse hook
- [ ] PostgreSQL memori schema created
- [ ] pgvector extension enabled
- [ ] Integration test passes

### Workflow Infrastructure
- [ ] Essential workflows created (2 minimum)
- [ ] Project-specific workflows created
- [ ] Validation gates defined (4 gates total)
- [ ] Skill sequences specified

### Context Documentation
- [ ] Essential context files created (2 minimum)
- [ ] Project-specific context files created
- [ ] Links to full documentation included
- [ ] Standards and patterns documented

### Configuration
- [ ] .claude/CLAUDE.md updated with auto-load
- [ ] .claude/specs/ directory created
- [ ] .claude/skills/ directory created
- [ ] docs/ONBOARDING.md created
- [ ] Developer guide comprehensive

### Quality Assurance
- [ ] All memory files under 500 lines
- [ ] Consistent formatting throughout
- [ ] No broken links
- [ ] Clear cross-references
- [ ] Memori integration tested

---

## Success Metrics

**Infrastructure Quality**:
- All essential primitives created
- Consistent formatting and structure
- Clear cross-references
- Auto-load configuration working

**Developer Experience**:
- Onboarding time: <30 minutes
- Context load time: <10 seconds
- Clear guidance for all roles
- Easy to find information

**Maintenance**:
- Memory files easily updated
- Workflows reusable
- Chatmodes well-scoped
- Documentation stays current

---

## Troubleshooting

### Memory Files Too Large

**Problem**: Memory files exceed 500 lines

**Solution**:
- Use compression techniques
- Cross-reference detailed docs
- Split into multiple focused files

### Chatmode Tool Restrictions Not Working

**Problem**: Chatmode can use forbidden tools

**Solution**:
- Verify tool restrictions syntax
- Check MCP configuration
- Test with simple operations

### Context Not Loading

**Problem**: .claude/CLAUDE.md auto-load not working

**Solution**:
- Verify file paths are correct
- Check @ syntax usage
- Restart Claude Code session

### Workflows Not Triggering Gates

**Problem**: Validation gates not pausing for approval

**Solution**:
- Verify 🛑 STOP syntax
- Check gate configuration in workflow frontmatter
- Test workflow execution manually

---

## Version History

| Version | Date       | Changes                        |
| ------- | ---------- | ------------------------------ |
| 2.0.0   | 2025-11-25 | 3-layer architecture, Skills as primary agents, Memori integration, 4 validation gates |
| 1.0.0   | 2025-11-20 | Initial project initiation workflow |

---

**Workflow Status**: Production Ready (3-Layer Architecture)
**Last Updated**: 2025-11-25
**Maintained By**: Agentic Workflow Framework
**Reference Strategy**: docs/agentic-workflow/PROJECT-INITIATION-STRATEGY.md
