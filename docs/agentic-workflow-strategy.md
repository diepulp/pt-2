# Agentic Workflow Optimization Strategy

> **Transform PT-2 documentation from ad-hoc creation to systematic workflows using agentic primitives and context engineering**

**Version**: 1.0.0
**Date**: 2025-10-17
**Status**: Proposed
**References**: [GitHub: Building Reliable AI Workflows](https://github.blog/ai-and-ml/github-copilot/how-to-build-reliable-ai-workflows-with-agentic-primitives-and-context-engineering/)

---

## Executive Summary

PT-2 has strong foundational documentation (100+ files, 203k words) but suffers from **ad-hoc creation patterns** that create friction for AI agents:

**Current Problems**:
- Manual context loading (~2-5 minutes per session)
- No cross-session memory (context rebuilt each time)
- No validation gates (agents proceed without human approval)
- Single agent handles architecture + implementation + review (no role boundaries)
- Manual documentation updates (SESSION_HANDOFF weekly, no automation)

**Proposed Solution**:
Implement **GitHub's agentic primitives** framework:
- **Memory files** (`.memory.md`) → Cross-session knowledge persistence
- **Chat modes** (`.chatmode.md`) → Role-based expertise with tool boundaries
- **Workflow prompts** (`.prompt.md`) → Reusable tasks with validation gates
- **Specifications** (`.spec.md`) → Implementation-ready blueprints
- **Modular instructions** (`.instructions.md`) → Scope-based guidance

**Expected Impact**:
- Context load: 2-5min → <10s (automatic memory loading)
- Session continuity: Lost → Persistent (memory files)
- Quality assurance: Manual → Automated gates (3 checkpoints per workflow)
- Documentation freshness: Weekly → Real-time (auto-updates)
- Developer onboarding: 4h → 30min (structured memory files)

---

## Table of Contents

1. [Background: Agentic Primitives](#background-agentic-primitives)
2. [Current State Analysis](#current-state-analysis)
3. [Proposed Architecture](#proposed-architecture)
4. [Systematic Workflows](#systematic-workflows)
5. [Implementation Roadmap](#implementation-roadmap)
6. [Migration Path](#migration-path)
7. [Success Metrics](#success-metrics)
8. [Risks & Mitigation](#risks--mitigation)
9. [Comparison Table](#comparison-before-vs-after)
10. [Next Steps](#next-steps)

---

## Background: Agentic Primitives

### What Are Agentic Primitives?

**Definition**: Reusable, configurable building blocks enabling systematic AI agent work through structured natural language files.

**Core Principle**: *"These files are executable natural language programs that deserve professional tooling infrastructure"* - GitHub

### The Five Primitives

| Primitive | Purpose | File Pattern | Scope |
|-----------|---------|--------------|-------|
| **Memory** | Cross-session knowledge | `.memory.md` | Project-wide facts |
| **Chat Modes** | Role-based expertise | `.chatmode.md` | Task-specific boundaries |
| **Workflows** | Reusable task prompts | `.prompt.md` | Systematic operations |
| **Specifications** | Implementation blueprints | `.spec.md` | Feature requirements |
| **Instructions** | Modular guidance | `.instructions.md` | File scope rules |

### Context Engineering Patterns

**Session Splitting**: Separate agent sessions by phase (planning, implementation, testing) for cognitive focus.

**Memory-Driven Development**: Maintain `~/.memory.md` files across sessions to prevent context rebuild.

**Validation Gates**: Build human approval into workflows: *"STOP: Review implementation plan before code generation"*

**Professional Boundaries**: Use MCP tool restrictions per role (architects plan only, engineers execute within domain).

**Modular Instructions**: Apply targeted `.instructions.md` files using `applyTo` YAML frontmatter to load only relevant guidance.

---

## Current State Analysis

### Strengths ✅

**Rich Documentation Ecosystem**:
- 104 markdown files across 23 subdirectories
- 202,833 words of comprehensive documentation
- Clear organization: ADRs, patterns, workflows, phases, roadmaps
- Compressed version available (72,640 words, 64.2% reduction for LLM context)

**Strong Templates & Standards**:
- `SERVICE_TEMPLATE_QUICK.md` - 2-page operational guide
- `BALANCED_ARCHITECTURE_QUICK.md` - HORIZONTAL vs VERTICAL decision framework
- `CANONICAL_BLUEPRINT_MVP_PRD.md` - Complete architecture specification
- Clear anti-pattern guardrails (PRD §4)

**Good Foundational Architecture**:
- Well-defined bounded contexts (SERVICE_RESPONSIBILITY_MATRIX)
- ADR documentation (dual DB types, test locations, state management)
- Hybrid architecture strategy formalized
- Phase-by-phase implementation tracking

### Critical Gaps ❌

**1. No Agentic Primitives**
```bash
# Current state:
find .claude/ -name "*.memory.md"     # No results
find .claude/ -name "*.chatmode.md"   # No results
find .claude/ -name "*.prompt.md"     # No results
find .claude/ -name "*.spec.md"       # No results
```

**Problem**: All documentation is static markdown. No executable workflow infrastructure.

**2. Ad-Hoc Documentation Creation**

- **SESSION_HANDOFF.md**: Manually written weekly, no systematic template
- **Phase docs**: Created reactively, not proactively planned
- **ADRs**: Written freeform, no structured workflow
- **Service docs**: Copy-paste from templates, inconsistent

**Problem**: Documentation drifts from implementation, manual effort scales poorly.

**3. No Validation Gates**

Current workflow:
```
User: "Create MTL service"
Agent: [Creates files immediately]
User: [Reviews after the fact, finds issues]
Agent: [Fixes issues]
```

**Problem**: No checkpoints for design review, test planning, or quality validation.

**4. Manual Context Loading**

`.claude/CLAUDE.md` contains static references:
```markdown
See `docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md`
See `docs/patterns/BALANCED_ARCHITECTURE_QUICK.md`
See `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md`
```

**Problem**: Agent must read 3-5 large files manually (2-5 minutes). No automatic context injection.

**5. No Role Boundaries**

Single agent handles:
- Architecture design (should be read-only, high-level)
- Service implementation (should be code-focused)
- Code review (should be separate from implementation)
- Documentation updates (should be systematic, not ad-hoc)

**Problem**: No professional boundaries, quality depends on agent remembering all rules.

**6. Session Amnesia**

Every session starts with:
```
Agent: "Let me review the current state..."
[Reads SESSION_HANDOFF.md, PRD, several other docs]
[5 minutes pass]
Agent: "Okay, I understand where we are"
```

**Problem**: No cross-session memory, context rebuilt from scratch each time.

**7. Missing Systematic Workflows**

Templates exist but not workflows:
- `SERVICE_TEMPLATE.md` exists → But no `.prompt.md` to execute it systematically
- `DATABASE_TYPE_WORKFLOW.md` exists → But no validation gates or automation
- Migration workflow documented → But manual, no checklist enforcement

**Problem**: Templates provide patterns but not execution discipline.

---

## Proposed Architecture

### Layer 1: Memory (Cross-Session Persistence)

**Purpose**: Distill 203k words of documentation into 5-6 focused memory files (<3k words total) for instant agent context loading.

```
.claude/memory/
├── project-context.memory.md           # Tech stack, patterns, constraints
├── architecture-decisions.memory.md    # ADR summaries, key decisions
├── phase-status.memory.md              # Current work, blockers, next steps
├── service-catalog.memory.md           # Implemented services + patterns
├── domain-glossary.memory.md           # Bounded contexts, terminology
└── template.memory.md                  # Memory file creation guide
```

**Example**: `project-context.memory.md`

```markdown
---
last_updated: 2025-10-17
auto_load: true
scope: all_agents
---

# Project Context Memory

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL + RLS)
- **State**: React Query + Zustand
- **Testing**: Jest + Cypress + React Testing Library
- **UI**: shadcn/ui

## Core Architecture Patterns
- **Service Layer**: Functional factories (NOT classes)
- **Type Strategy**: Dual files (`types/database.types.ts` local, `types/remote/database.types.ts` prod)
- **Architecture**: Hybrid (HORIZONTAL layers + VERTICAL features)
- **Decision Framework**: "1 domain? VERTICAL. ALL domains? HORIZONTAL."

## Critical Anti-Patterns (Always Enforce)
- ❌ NO ReturnType inference (explicit interfaces only)
- ❌ NO global singletons or stateful factories
- ❌ NO class-based services (functional factories only)
- ❌ NO service-to-service direct calls (client orchestrates)
- ❌ NO `console.*` in production code

## Current Phase
- **Phase**: 2 (Service Layer Foundation)
- **Status**: 87.5% complete (7/8 services implemented)
- **Next**: Integration tests → React Query setup → Phase 3 (UI delivery)
- **Blocker**: Loyalty service optional (deferred to post-MVP)

## Key References (Full Context)
- PRD: `docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md`
- Service Template: `docs/patterns/SERVICE_TEMPLATE_QUICK.md`
- Architecture Decision Framework: `docs/patterns/BALANCED_ARCHITECTURE_QUICK.md`
```

**Benefits**:
- **Fast context loading**: <10s vs 2-5 minutes
- **Always current**: Updated by agents after each task
- **Focused**: Only essential facts, not full documents
- **Versioned**: Git-tracked, auditable changes

---

### Layer 2: Chat Modes (Role-Based Expertise)

**Purpose**: Define professional boundaries with tool restrictions and scoped context.

```
.claude/chatmodes/
├── architect.chatmode.md               # System design, ADR creation
├── service-engineer.chatmode.md        # Service layer implementation
├── ui-engineer.chatmode.md             # Frontend implementation
├── reviewer.chatmode.md                # Code review, quality checks
├── documenter.chatmode.md              # Documentation creation/updates
└── template.chatmode.md                # Chatmode creation guide
```

**Example**: `architect.chatmode.md`

```markdown
---
role: System Architect
description: High-level system design, architecture decisions, and ADR creation
tools_allowed:
  - Read
  - Grep
  - Glob
  - WebSearch
  - WebFetch
  - mcp__sequential-thinking__sequentialthinking
  - mcp__serena__* (read-only operations)
tools_forbidden:
  - Write
  - Edit
  - Bash (except read-only git commands)
  - NotebookEdit
context_files:
  - .claude/memory/project-context.memory.md
  - .claude/memory/architecture-decisions.memory.md
  - docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md
  - docs/patterns/BALANCED_ARCHITECTURE_QUICK.md
  - docs/adr/*.md
---

# System Architect Chat Mode

You are a system architect focused exclusively on high-level design decisions.

## Your Responsibilities
- Evaluate architecture patterns (HORIZONTAL vs VERTICAL)
- Create Architecture Decision Records (ADRs)
- Design service boundaries and bounded contexts
- Identify anti-patterns and architectural violations
- Provide strategic technical guidance

## Your Boundaries
### ❌ DO NOT
- Write implementation code
- Make file changes (except ADR creation)
- Implement features
- Write tests
- Update configuration files

### ✅ DO
- Create design specifications (`.spec.md` files)
- Draft ADRs for significant decisions
- Identify gaps and risks
- Recommend patterns and approaches
- Challenge assumptions with questions

## Validation Gate Protocol

Before completing any architectural task, you MUST:

1. **STOP**: Present design to user
2. **Document rationale**: Explain why this approach
3. **List alternatives**: Show 2-3 options considered
4. **Identify risks**: What could go wrong?
5. **Get approval**: Wait for explicit user confirmation

**Format**:
```
🛑 VALIDATION GATE: Architecture Design Review

**Proposed Design**: [Brief description]
**Rationale**: [Why this approach?]
**Alternatives Considered**:
  1. [Option A]: [Why not chosen]
  2. [Option B]: [Why not chosen]
**Risks**:
  - [Risk 1]: [Mitigation]
  - [Risk 2]: [Mitigation]

Do you approve this design? (Waiting for user confirmation)
```

## Output Deliverables

When completing an architectural task, always deliver:

1. **If significant decision**: ADR document
   ```
   docs/adr/ADR-XXX-description.md
   ```

2. **For implementation**: Specification file
   ```
   .claude/specs/{feature-name}.spec.md
   ```

3. **Always**: Update architecture-decisions.memory.md with summary

## Example Interaction

```
User: "Should we add a LoyaltyService or extend PlayerService with loyalty logic?"

Architect: "Let me analyze this using the bounded context framework and sequential thinking..."

[Analysis using mcp__sequential-thinking]

🛑 VALIDATION GATE: Service Boundary Decision

**Proposed Design**: Create separate LoyaltyService

**Rationale**:
- Loyalty has distinct bounded context: "What rewards has player earned?"
- Different data ownership (loyalty_points vs player identity)
- Aligns with SERVICE_RESPONSIBILITY_MATRIX principle
- Enables independent evolution of loyalty rules

**Alternatives Considered**:
1. **Extend PlayerService**: Rejected - violates single responsibility
2. **Hybrid (loyalty module in PlayerService)**: Rejected - couples domains

**Risks**:
- Additional service increases complexity (+1 service)
- Mitigation: Use existing SERVICE_TEMPLATE_QUICK, minimal overhead

**Recommendation**: Create LoyaltyService following bounded context model.

Do you approve? I'll create `loyalty-service.spec.md` for implementation team.
```

## Success Criteria

Your work is successful when:
- [ ] Design is clear and unambiguous
- [ ] Bounded contexts well-defined
- [ ] Alternatives properly evaluated
- [ ] Risks identified with mitigations
- [ ] Specification ready for implementation
- [ ] User explicitly approved design
```

**Benefits**:
- **Professional boundaries**: Architects don't write code, engineers don't make architecture decisions
- **Tool restrictions**: Enforced by MCP (architect can't use Write tool)
- **Scoped context**: Only loads relevant documentation
- **Validation gates**: Built into role definition
- **Clear handoffs**: Architect creates `.spec.md`, engineer implements

---

### Layer 3: Workflow Prompts (Systematic Operations)

**Purpose**: Convert ad-hoc requests into repeatable, validated workflows.

```
.claude/workflows/
├── create-service.prompt.md            # SERVICE_TEMPLATE execution
├── write-migration.prompt.md           # Database type workflow
├── create-adr.prompt.md                # Structured ADR creation
├── session-handoff.prompt.md           # Automated handoff generation
├── phase-completion.prompt.md          # Phase signoff checklist
└── template.prompt.md                  # Workflow prompt creation guide
```

**Example**: `create-service.prompt.md`

```markdown
---
title: Create New Service (Systematic Workflow)
description: End-to-end service creation with 3 validation gates
chatmode_sequence:
  - architect      # Phase 1: Design
  - service-engineer  # Phase 2: Implementation
  - service-engineer  # Phase 3: Testing
  - documenter     # Phase 4: Documentation
validation_gates: 3
context_files:
  - .claude/memory/service-catalog.memory.md
  - docs/patterns/SERVICE_TEMPLATE_QUICK.md
  - docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md
  - docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md
---

# Create Service Workflow

## Overview

This workflow creates a new service following PT-2 architecture standards with built-in validation gates.

**Estimated Time**: 2-4 hours (design → implementation → testing → docs)

---

## Phase 1: Design Specification (Architect Mode)

**Chatmode**: `architect.chatmode.md`
**Tools**: Read, Grep, sequential-thinking
**Output**: `.claude/specs/{service}-service.spec.md`

### Step 1.1: Define Bounded Context

Answer these questions:

1. **Key Question**: What question does this service answer?
   - Example (Player): "Who is this player?"
   - Example (MTL): "What cash transactions require regulatory reporting?"

2. **Data Ownership**: What data does this service OWN vs REFERENCE?
   ```
   OWNS:
   - table_x (full CRUD)
   - computed_field_y (business logic)

   REFERENCES:
   - table_z (from ServiceZ, read-only)
   ```

3. **Service Boundaries**: Check SERVICE_RESPONSIBILITY_MATRIX
   - No overlap with existing services?
   - Clear separation from related domains?

### Step 1.2: Create Service Specification

Generate `.claude/specs/{service}-service.spec.md`:

```markdown
---
service_name: {ServiceName}
bounded_context: "{Key question}"
status: proposed
created: {date}
---

# {ServiceName} Service Specification

## Bounded Context
[Answer to key question]

## Data Ownership

### OWNS
- `table_x`: [Description]
- `field_y`: [Computed logic]

### REFERENCES
- `table_z` (ServiceZ): [Usage]

## Interface Definition
\```typescript
export interface {ServiceName}Service {
  // CRUD operations
  create(data: Create{Entity}): Promise<{Entity}>;
  getById(id: string): Promise<{Entity} | null>;
  update(id: string, updates: Update{Entity}): Promise<{Entity}>;
  delete(id: string): Promise<void>;

  // Specialized queries
  {specificQuery}(params: {Params}): Promise<{Result}>;
}
\```

## Implementation Requirements
1. [Technical requirement 1]
2. [Technical requirement 2]
3. [Performance target]

## Validation Criteria
- [ ] All CRUD operations implemented
- [ ] Business logic in `business.ts`, not `crud.ts`
- [ ] Test coverage ≥80%
- [ ] No anti-pattern violations
- [ ] Passes integration smoke test
```

### Step 1.3: VALIDATION GATE 1 - Design Review

🛑 **STOP: Present specification to user**

**Checklist**:
- [ ] Bounded context is clear and unique?
- [ ] No overlap with existing services?
- [ ] Follows SERVICE_RESPONSIBILITY_MATRIX principles?
- [ ] Interface is complete and unambiguous?
- [ ] Validation criteria are measurable?

**User must explicitly approve before proceeding to Phase 2.**

---

## Phase 2: Implementation (Service Engineer Mode)

**Chatmode**: `service-engineer.chatmode.md`
**Tools**: Read, Write, Edit, Bash (test execution)
**Input**: `.claude/specs/{service}-service.spec.md`
**Output**: Service implementation files

### Step 2.1: Create Directory Structure

```bash
mkdir -p services/{service}
touch services/{service}/index.ts
touch services/{service}/crud.ts
touch services/{service}/business.ts
touch services/{service}/queries.ts
```

### Step 2.2: Implement Following SERVICE_TEMPLATE_QUICK

**Required Patterns**:
- ✅ Functional factory: `export function create{Service}Service(supabase: SupabaseClient<Database>)`
- ✅ Explicit interfaces: `export interface {Service}Service { ... }`
- ✅ Type parameter: `SupabaseClient<Database>` (NEVER `any`)
- ✅ Separation: CRUD in `crud.ts`, business logic in `business.ts`
- ✅ Public API: Only export through `index.ts`

**Anti-Pattern Checks** (MUST enforce):
- ❌ NO class-based services
- ❌ NO `ReturnType<typeof create{Service}Service>`
- ❌ NO global singletons
- ❌ NO service-to-service direct calls

### Step 2.3: VALIDATION GATE 2 - Implementation Review

🛑 **STOP: Present implementation summary**

**Summary Format**:
```
Implementation Complete: {ServiceName}Service

Files Created:
- services/{service}/index.ts (32 lines)
- services/{service}/crud.ts (125 lines)
- services/{service}/business.ts (68 lines)
- services/{service}/queries.ts (45 lines)

Interface:
[Show TypeScript interface]

Anti-Pattern Check:
- [x] Functional factory ✅
- [x] Explicit interfaces ✅
- [x] SupabaseClient<Database> typing ✅
- [x] No classes ✅
- [x] No global state ✅

Ready for testing?
```

**User must approve before Phase 3.**

---

## Phase 3: Testing (Service Engineer Mode)

**Chatmode**: `service-engineer.chatmode.md`
**Tools**: Read, Write, Bash (test execution)
**Output**: Test files + test report

### Step 3.1: Create Test Files

```bash
mkdir -p __tests__/services/{service}
touch __tests__/services/{service}/crud.test.ts
touch __tests__/services/{service}/business.test.ts
touch __tests__/services/{service}/queries.test.ts
```

### Step 3.2: Implement Test Coverage

**Required Test Categories**:

1. **CRUD Operations** (crud.test.ts)
   - [ ] Create: Happy path
   - [ ] Create: Validation errors
   - [ ] Read: Found
   - [ ] Read: Not found
   - [ ] Update: Success
   - [ ] Update: Not found
   - [ ] Delete: Success
   - [ ] Delete: Not found

2. **Business Logic** (business.test.ts)
   - [ ] Calculations correct
   - [ ] Edge cases handled
   - [ ] Validation logic works

3. **Specialized Queries** (queries.test.ts)
   - [ ] Query returns expected results
   - [ ] Handles empty results
   - [ ] Performance within limits

### Step 3.3: Run Tests

```bash
npm test -- services/{service}
```

**Target Coverage**: ≥80% lines, branches, functions

### Step 3.4: VALIDATION GATE 3 - Test Review

🛑 **STOP: Present test results**

**Test Report**:
```
Test Results: {ServiceName}Service

Suites: X passed, X total
Tests:  X passed, X total
Coverage:
  Lines:      XX% (target: 80%)
  Branches:   XX% (target: 80%)
  Functions:  XX% (target: 80%)

All Tests Passing: ✅ / ❌

Integration Check:
- [ ] Works with existing services?
- [ ] No breaking changes?
- [ ] Performance acceptable?

Ready for documentation phase?
```

**User must approve before Phase 4.**

---

## Phase 4: Documentation (Documenter Mode)

**Chatmode**: `documenter.chatmode.md`
**Tools**: Read, Write, Edit
**Output**: Updated memory files and documentation

### Step 4.1: Update Service Catalog

Add to `.claude/memory/service-catalog.memory.md`:

```markdown
### {ServiceName}Service

**Bounded Context**: "{Key question}"

**Ownership**:
- OWNS: [tables/fields]
- REFERENCES: [other services]

**Location**: `services/{service}/`

**Tests**: `__tests__/services/{service}/`

**Coverage**: XX% (as of {date})

**Key Patterns**:
- [Pattern 1]
- [Pattern 2]
```

### Step 4.2: Update SERVICE_RESPONSIBILITY_MATRIX

Add row to table in `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md`.

### Step 4.3: Create Reference Documentation (Optional)

If service is complex, create `docs/services/{service}.md` with:
- API reference
- Usage examples
- Special considerations

### Step 4.4: Update Phase Status

Update `.claude/memory/phase-status.memory.md`:
```markdown
## Recently Completed
- ✅ {ServiceName}Service ({date})
  - All CRUD + X specialized queries
  - XX% test coverage
  - Zero anti-pattern violations
```

---

## Final Checklist

Before marking service creation complete:

- [ ] Specification created and approved (Gate 1)
- [ ] Implementation follows SERVICE_TEMPLATE_QUICK
- [ ] All anti-patterns avoided
- [ ] Tests written with ≥80% coverage
- [ ] All tests passing (Gate 3)
- [ ] service-catalog.memory.md updated
- [ ] SERVICE_RESPONSIBILITY_MATRIX updated
- [ ] phase-status.memory.md updated
- [ ] No breaking changes to existing services

## Success Metrics

**Quality**:
- Zero anti-pattern violations
- Test coverage ≥80%
- All validation gates passed

**Efficiency**:
- 2-4 hours total (vs 4-6 hours ad-hoc)
- 3 human approval checkpoints (vs continuous review)

**Documentation**:
- Memory files auto-updated
- No manual documentation needed

---

✅ **Service creation workflow complete!**
```

**Benefits**:
- **Repeatability**: Same workflow every time, deterministic outcomes
- **Quality gates**: 3 checkpoints prevent bad implementations
- **Role clarity**: Architect designs, engineer implements, documenter records
- **Automation**: Memory files updated automatically
- **Auditability**: Each phase tracked, approvals documented

---

### Layer 4: Specification Files (Implementation Blueprints)

**Purpose**: Create unambiguous implementation requirements that any engineer can execute.

```
.claude/specs/
├── loyalty-service.spec.md             # Loyalty service implementation
├── player-loyalty-ui.spec.md           # Player loyalty page
├── visit-tracking-ui.spec.md           # Visit tracking interface
└── template.spec.md                    # Specification creation guide
```

**Example**: `loyalty-service.spec.md`

```markdown
---
service_name: LoyaltyService
bounded_context: "What rewards has player earned?"
status: approved
created: 2025-10-17
approved_by: architect
implements: Service Layer (Phase 2)
---

# Loyalty Service Specification

## Bounded Context

**Key Question**: "What rewards has player earned and what tier are they in?"

LoyaltyService owns player reward accumulation and tier management.

## Data Ownership

### OWNS
- `loyalty_tier` (enum): BRONZE, SILVER, GOLD, PLATINUM
- Points calculation logic
- Tier upgrade/downgrade rules
- Reward redemption tracking

### REFERENCES
- `player` (PlayerService): Player identity
- `visit` (VisitService): Session for point attribution
- `rating_slip` (RatingSlipService): Points earned per session

### DOES NOT OWN
- Player identity (PlayerService)
- Financial transactions (PlayerFinancialService)
- Session management (VisitService)

## Interface Definition

```typescript
export interface LoyaltyService {
  // Points Management
  addPoints(playerId: string, points: number, visitId: string): Promise<void>;
  getPointsBalance(playerId: string): Promise<number>;
  getPointsHistory(playerId: string, limit?: number): Promise<PointsTransaction[]>;

  // Tier Management
  getCurrentTier(playerId: string): Promise<LoyaltyTier>;
  checkTierUpgrade(playerId: string): Promise<TierChangeResult>;

  // Rewards
  getAvailableRewards(playerId: string): Promise<Reward[]>;
  redeemReward(playerId: string, rewardId: string): Promise<RedemptionResult>;
}

export interface PointsTransaction {
  id: string;
  playerId: string;
  visitId: string;
  points: number;
  reason: string;
  createdAt: Date;
}

export enum LoyaltyTier {
  BRONZE = 'BRONZE',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM'
}

export interface TierChangeResult {
  currentTier: LoyaltyTier;
  newTier: LoyaltyTier | null;
  pointsRequired: number | null;
}
```

## Database Schema

### Required Tables

```sql
-- Loyalty points ledger
CREATE TABLE loyalty_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES player(id),
  visit_id UUID REFERENCES visit(id),
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tier configuration (seeded data)
CREATE TABLE loyalty_tier_config (
  tier TEXT PRIMARY KEY,
  min_points INTEGER NOT NULL,
  multiplier DECIMAL(3,2) NOT NULL,
  benefits JSONB NOT NULL
);

-- Reward redemptions
CREATE TABLE loyalty_redemption (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES player(id),
  reward_type TEXT NOT NULL,
  points_cost INTEGER NOT NULL,
  redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Computed Fields

Add to `player` table:
```sql
ALTER TABLE player
  ADD COLUMN loyalty_tier TEXT DEFAULT 'BRONZE',
  ADD COLUMN total_loyalty_points INTEGER DEFAULT 0;
```

## Business Rules

### Points Accumulation
- 1 point per $10 wagered
- Points attributed to visit session
- Bonus multipliers by tier:
  - BRONZE: 1.0x
  - SILVER: 1.2x
  - GOLD: 1.5x
  - PLATINUM: 2.0x

### Tier Thresholds
- BRONZE: 0-999 points
- SILVER: 1,000-4,999 points
- GOLD: 5,000-19,999 points
- PLATINUM: 20,000+ points

### Tier Upgrades
- Automatic on threshold cross
- Effective immediately
- Multiplier applies to future earnings

## Implementation Requirements

1. **Functional Factory Pattern**
   ```typescript
   export function createLoyaltyService(
     supabase: SupabaseClient<Database>
   ): LoyaltyService {
     // Implementation
   }
   ```

2. **File Organization**
   - `services/loyalty/index.ts` - Public API export
   - `services/loyalty/crud.ts` - Database operations
   - `services/loyalty/business.ts` - Points/tier logic
   - `services/loyalty/queries.ts` - Specialized queries

3. **Type Safety**
   - All interfaces explicitly defined
   - No `ReturnType` inference
   - SupabaseClient<Database> typing

4. **Performance Targets**
   - getPointsBalance: <50ms
   - getCurrentTier: <50ms
   - addPoints: <100ms (includes tier check)

5. **Error Handling**
   - Validate player exists before point operations
   - Handle concurrent point additions gracefully
   - Return null for non-existent entities (no throws)

## Test Requirements

### Unit Tests (`__tests__/services/loyalty/`)

**crud.test.ts**:
- [ ] addPoints: Success
- [ ] addPoints: Invalid player ID
- [ ] getPointsBalance: Player exists
- [ ] getPointsBalance: Player doesn't exist
- [ ] getPointsHistory: Returns ordered by date
- [ ] getPointsHistory: Respects limit parameter

**business.test.ts**:
- [ ] Tier calculation: BRONZE threshold
- [ ] Tier calculation: SILVER threshold
- [ ] Tier calculation: GOLD threshold
- [ ] Tier calculation: PLATINUM threshold
- [ ] Tier upgrade: Crosses threshold
- [ ] Tier multiplier: Applied correctly

**queries.test.ts**:
- [ ] getAvailableRewards: Returns by tier
- [ ] redeemReward: Deducts points
- [ ] redeemReward: Insufficient points error

### Coverage Target
- **Minimum**: 80% lines, branches, functions
- **Ideal**: 90%+

## Integration Points

### With RatingSlipService
```typescript
// After rating slip finalized, attribute points
const ratingSlip = await ratingSlipService.finalize(slipId);
await loyaltyService.addPoints(
  ratingSlip.playerId,
  calculatePoints(ratingSlip.averageBet),
  ratingSlip.visitId
);
```

### With PlayerService
```typescript
// Display tier on player profile
const tier = await loyaltyService.getCurrentTier(playerId);
```

## Migration Strategy

### Phase 1: Schema (Week 3)
```bash
supabase migration new loyalty_schema
# Apply tables, computed fields, seed tier config
```

### Phase 2: Service Implementation (Week 3)
- Implement following this spec
- Write comprehensive tests
- Validate with SERVICE_TEMPLATE_QUICK

### Phase 3: Integration (Week 4)
- Connect to RatingSlipService
- Update player profile UI
- Add loyalty dashboard widget

## Validation Criteria

Before marking complete:
- [ ] All interface methods implemented
- [ ] Functional factory pattern used
- [ ] No anti-patterns detected (classes, ReturnType, globals)
- [ ] Test coverage ≥80%
- [ ] All business rules validated in tests
- [ ] Performance targets met (<100ms operations)
- [ ] Integration with RatingSlipService working
- [ ] service-catalog.memory.md updated
- [ ] SERVICE_RESPONSIBILITY_MATRIX updated

## References

- Service Template: `docs/patterns/SERVICE_TEMPLATE_QUICK.md`
- Service Responsibility Matrix: `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md`
- Architecture Standards: `docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md` §3.3

---

**Status**: Ready for implementation by service-engineer chatmode
```

**Benefits**:
- **Unambiguous**: Any engineer can implement from spec
- **Complete**: All requirements specified (interface, schema, tests, performance)
- **Traceable**: Links to templates, standards, validation criteria
- **Handoff-ready**: Created by architect, implemented by engineer

---

### Layer 5: Modular Instructions (Scope-Based Guidance)

**Purpose**: Load only relevant instructions based on file scope using YAML `applyTo` frontmatter.

```
.claude/instructions/
├── service-layer.instructions.md       # applyTo: services/**/*.ts
├── ui-layer.instructions.md            # applyTo: app/**/*.tsx
├── testing.instructions.md             # applyTo: __tests__/**/*.test.ts
├── migrations.instructions.md          # applyTo: supabase/migrations/*.sql
└── template.instructions.md            # Instruction file creation guide
```

**Example**: `service-layer.instructions.md`

```markdown
---
applyTo:
  - "services/**/*.ts"
  - "!services/**/*.test.ts"
description: "Service layer implementation standards and anti-pattern enforcement"
---

# Service Layer Implementation Instructions

These instructions apply when working in `services/` directory TypeScript files.

## Type Safety (ALWAYS Enforce)

### ✅ CORRECT Patterns

```typescript
import type { Database } from "@/types/database.types";
import { SupabaseClient } from "@supabase/supabase-js";

// Explicit interface
export interface PlayerService {
  getById(id: string): Promise<Player | null>;
  create(data: CreatePlayer): Promise<Player>;
}

// Functional factory with typed parameter
export function createPlayerService(
  supabase: SupabaseClient<Database>  // ← NEVER use 'any'
): PlayerService {
  return {
    async getById(id: string) {
      const { data } = await supabase
        .from("player")  // ← Type-safe
        .select("*")
        .eq("id", id)
        .single();

      return data;  // ← Fully typed
    }
  };
}
```

### ❌ FORBIDDEN Patterns

```typescript
// ❌ NO: ReturnType inference
export type PlayerService = ReturnType<typeof createPlayerService>;

// ❌ NO: 'any' typing
export function createPlayerService(supabase: any) { }

// ❌ NO: Class-based services
export class PlayerService {
  constructor(private supabase: SupabaseClient) {}
}

// ❌ NO: Global singletons
const supabaseClient = createClient(...);
export const playerService = createPlayerService(supabaseClient);
```

## File Organization (ALWAYS Follow)

```
services/{domain}/
├── index.ts          # Public API export only
├── crud.ts           # Database operations (CRUD)
├── business.ts       # Business logic, calculations
└── queries.ts        # Specialized queries, aggregations
```

**Separation Rules**:
- `crud.ts`: Pure data access, no business logic
- `business.ts`: Calculations, validations, no direct DB calls
- `queries.ts`: Complex queries, joins, aggregations
- `index.ts`: Compose and export service interface

## Anti-Patterns (ENFORCE via Validation)

Before making any file changes in service layer:

1. **Check**: Is this a functional factory?
2. **Check**: Are all interfaces explicit?
3. **Check**: Is `SupabaseClient<Database>` typed correctly?
4. **Check**: No global state or singletons?
5. **Check**: Service doesn't call other services directly?

**If ANY check fails, STOP and ask user before proceeding.**

## Bounded Context Verification

Before creating or modifying a service:

1. **Load**: `.claude/memory/service-catalog.memory.md`
2. **Check**: Does this service have a clear "key question"?
3. **Verify**: No overlap with existing services?
4. **Confirm**: Follows SERVICE_RESPONSIBILITY_MATRIX?

**If unclear, switch to architect.chatmode for design review.**

## Common Scenarios

### Scenario: Adding New Service Method

```typescript
// 1. Add to interface (EXPLICIT)
export interface PlayerService {
  // ... existing methods
  getByEmail(email: string): Promise<Player | null>;  // ← New method
}

// 2. Implement in appropriate file
// If pure data access → crud.ts
// If business logic → business.ts
// If complex query → queries.ts
```

### Scenario: Service Needs Data from Another Service

```typescript
// ❌ WRONG: Direct service-to-service call
export function createPlayerService(supabase: SupabaseClient<Database>) {
  const visitService = createVisitService(supabase);  // ← NO!

  return {
    async getWithVisits(id: string) {
      const player = await getById(id);
      const visits = await visitService.getByPlayerId(id);  // ← NO!
      return { ...player, visits };
    }
  };
}

// ✅ CORRECT: Client/action orchestrates
// In app action or client code:
export async function getPlayerWithVisits(playerId: string) {
  const player = await playerService.getById(playerId);
  const visits = await visitService.getByPlayerId(playerId);
  return { ...player, visits };
}
```

## Performance Considerations

- Queries should complete <100ms for simple CRUD
- Use indexes for frequently queried fields
- Batch operations when possible
- Avoid N+1 queries (use joins)

## Testing Requirements

Every service MUST have:
- `__tests__/services/{domain}/crud.test.ts`
- `__tests__/services/{domain}/business.test.ts`
- Coverage ≥80% lines, branches, functions

## When to Escalate

**Switch to architect.chatmode if**:
- Unclear where logic belongs (CRUD vs business)
- Service boundary ambiguity
- Potential bounded context overlap
- Need to create new service

**Switch to reviewer.chatmode if**:
- Implementation complete, need quality check
- Unsure if anti-patterns present
- Want validation before committing

---

**Last Updated**: 2025-10-17
```

**Benefits**:
- **Automatic loading**: Instructions appear when editing `services/**/*.ts`
- **Scope-based**: UI instructions don't load for service layer work
- **Enforced standards**: Anti-pattern checks built into workflow
- **Context-aware**: References relevant templates and memory files

---

## Systematic Workflows

### Workflow 1: Session Start (Automatic Context Loading)

**Current State** (Manual):
```
1. User starts session
2. Agent: "Let me review current state..."
3. Agent reads SESSION_HANDOFF.md (manually)
4. Agent reads .claude/CLAUDE.md references (manually)
5. Agent navigates to PRD, templates, etc.
6. [2-5 minutes pass]
7. Agent: "Okay, I understand where we are"
```

**Proposed State** (Automatic):
```
1. User starts session
2. Claude Code auto-loads:
   - .claude/memory/project-context.memory.md
   - .claude/memory/phase-status.memory.md
   - .claude/memory/architecture-decisions.memory.md
3. [<10 seconds]
4. Agent: "Ready. Phase 2 is 87.5% complete. Next task?"
```

**Implementation**:
```markdown
# .claude/config.yml (auto-load configuration)
memory:
  auto_load:
    - .claude/memory/project-context.memory.md
    - .claude/memory/phase-status.memory.md
    - .claude/memory/architecture-decisions.memory.md
  on_demand:
    - .claude/memory/service-catalog.memory.md
    - .claude/memory/domain-glossary.memory.md
```

**Benefits**:
- 96% faster context loading (2-5min → <10s)
- No manual reference chasing
- Always current (memory files updated by agents)
- Consistent session starts

---

### Workflow 2: Create Service (Validation Gates)

**Current State** (Ad-Hoc):
```
User: "Create MTL service"
Agent: [Immediately starts creating files]
Agent: [Creates service with potential issues]
User: [Reviews after the fact]
User: "Wait, this violates bounded context..."
Agent: [Fixes issues]
[Iterative debugging continues]
```

**Proposed State** (Systematic):
```
User: "Create MTL service"
Agent: "I'll use the create-service workflow. Switching to architect mode..."

[PHASE 1: DESIGN]
Architect Agent: [Analyzes bounded context]
Architect Agent: "🛑 VALIDATION GATE 1: Design Review

  Proposed: MTLService
  Bounded Context: 'What cash transactions require regulatory reporting?'

  Data Ownership:
  - OWNS: CTR calculations, compliance status
  - REFERENCES: player_financial_transaction, visit, player

  No overlap with existing services ✅

  Specification created: .claude/specs/mtl-service.spec.md

  Do you approve this design?"

User: "Yes, approved"

[PHASE 2: IMPLEMENTATION]
Service Engineer Agent: [Implements from spec]
Service Engineer Agent: "🛑 VALIDATION GATE 2: Implementation Review

  Created:
  - services/mtl/index.ts
  - services/mtl/crud.ts
  - services/mtl/queries.ts

  Anti-pattern check:
  - Functional factory ✅
  - Explicit interfaces ✅
  - No classes ✅

  Ready for testing?"

User: "Yes, proceed"

[PHASE 3: TESTING]
Service Engineer Agent: [Writes tests]
Service Engineer Agent: "🛑 VALIDATION GATE 3: Test Results

  Tests: 24/24 passing ✅
  Coverage: 92% ✅

  All validation gates passed. Ready to finalize?"

User: "Yes"

[PHASE 4: DOCUMENTATION]
Documenter Agent: [Updates memory files]
Documenter Agent: "Documentation complete.
  - service-catalog.memory.md updated
  - SERVICE_RESPONSIBILITY_MATRIX updated

  MTL Service creation complete! ✅"
```

**Implementation**: Execute `.claude/workflows/create-service.prompt.md`

**Benefits**:
- 3 human approval checkpoints (vs continuous review)
- Zero anti-pattern violations (caught at Gate 2)
- Consistent quality (same workflow every time)
- Clear role separation (architect → engineer → documenter)

---

### Workflow 3: Session Handoff (Automated)

**Current State** (Manual):
```
[End of session]
User: "Can you write a SESSION_HANDOFF?"
Agent: [Manually writes SESSION_HANDOFF.md from memory]
Agent: [May miss details, inconsistent format]
User: [Reviews and edits manually]
[15-30 minutes]
```

**Proposed State** (Automated):
```
[End of session]
User: "/handoff" or "Create session handoff"
Agent: "I'll execute the session-handoff workflow..."

Agent: [Loads phase-status.memory.md]
Agent: [Generates structured handoff from template]
Agent: [Updates memory with new progress/blockers]
Agent: [Outputs formatted SESSION_HANDOFF.md]

Agent: "Session handoff created:
  - docs/phases/phase-2/SESSION_HANDOFF.md
  - .claude/memory/phase-status.memory.md updated

  Would you like me to commit both files?"
```

**Implementation**: Execute `.claude/workflows/session-handoff.prompt.md`

**Template Structure**:
```markdown
# Session Handoff Template

## Current Status
[From phase-status.memory.md]

## Completed This Session
[Extract from memory updates]

## In Progress
[Active tasks]

## Blockers
[Known impediments]

## Next Actions
[Prioritized list]

## Technical Notes
[Decisions, discoveries, gotchas]
```

**Benefits**:
- 5-10 minutes (vs 15-30 minutes manual)
- Consistent format (template-based)
- Always current (reads from memory)
- Auto-updates memory (dual output)

---

### Workflow 4: ADR Creation (Structured)

**Current State** (Freeform):
```
User: "We need an ADR for state management"
Agent: [Writes ADR freeform, may miss sections]
Agent: [Submits for review]
User: [Points out missing alternatives, incomplete rationale]
[Multiple revision rounds]
```

**Proposed State** (Structured):
```
User: "Create ADR for state management strategy"
Agent: "I'll use the create-adr workflow. Switching to architect mode..."

Architect Agent: [Loads architecture-decisions.memory.md]
Architect Agent: [Uses sequential-thinking for analysis]

Architect Agent: "I'll analyze state management options systematically:

**Context**: Phase 3 requires client state management

**Options Analysis**:
1. **React Query + Zustand** (Proposed)
   - Pros: Server state + local state separation, proven pattern
   - Cons: Two libraries, learning curve

2. **Redux Toolkit**
   - Pros: Single state solution
   - Cons: Heavier, server/local state mixed

3. **React Context + SWR**
   - Pros: Built-in + lightweight
   - Cons: Limited devtools, manual optimization

[Sequential thinking analysis...]

🛑 VALIDATION GATE: Architecture Decision

**Recommendation**: React Query + Zustand

**Rationale**:
- React Query: Server state, caching, optimistic updates
- Zustand: Local UI state, simple API
- Clear separation: server vs client concerns
- Aligns with Next.js App Router patterns

**Consequences**:
- Risk: Two state systems to learn
- Mitigation: Clear guidelines, examples
- Benefit: Best-in-class for each concern

Do you approve this decision? I'll create the ADR."

User: "Approved"

Architect Agent: [Generates ADR-003-state-management-strategy.md]
Architect Agent: [Updates architecture-decisions.memory.md with summary]

Architect Agent: "ADR created:
  - docs/adr/ADR-003-state-management-strategy.md
  - .claude/memory/architecture-decisions.memory.md updated

  Ready to commit?"
```

**Implementation**: Execute `.claude/workflows/create-adr.prompt.md` with `architect.chatmode.md`

**Benefits**:
- Structured analysis (sequential-thinking)
- 3+ alternatives always considered
- Clear rationale documentation
- Memory auto-updated (future context)
- Validation gate before creation

---

## Implementation Roadmap

### Phase 1: Memory Infrastructure (Week 1)

**Goal**: Establish cross-session memory foundation

**Deliverables**:
1. Create `.claude/memory/` directory
2. **project-context.memory.md** (tech stack, patterns, constraints)
   - Extract from CANONICAL_BLUEPRINT_MVP_PRD.md
   - Extract from .claude/CLAUDE.md
   - Extract from BALANCED_ARCHITECTURE_QUICK.md
3. **architecture-decisions.memory.md** (ADR summaries)
   - Summarize ADR-001 (dual DB types)
   - Summarize ADR-002 (test locations)
   - Summarize ADR-003 (state management)
4. **phase-status.memory.md** (current work, blockers)
   - Migrate from SESSION_HANDOFF.md
   - Add blockers, next actions
5. **service-catalog.memory.md** (implemented services)
   - List Player, Casino, Visit, RatingSlip, PlayerFinancial, TableContext, MTL
   - Document bounded contexts
6. **domain-glossary.memory.md** (terminology)
   - Define key terms (bounded context, service layer, etc.)
   - Document domain-specific vocabulary

**Effort**: 4-6 hours

**Success Criteria**:
- [ ] All 6 memory files created
- [ ] Each file <500 lines
- [ ] Auto-load configuration working
- [ ] Session start <10s with full context

**Testing**:
```bash
# Start new session
# Measure context load time
# Verify agent has full context without manual references
```

---

### Phase 2: Chat Modes (Week 1-2)

**Goal**: Define role boundaries and tool restrictions

**Deliverables**:
1. **architect.chatmode.md**
   - Tools: Read, Grep, Glob, WebSearch, sequential-thinking (NO Write/Edit)
   - Context: PRD, ADRs, patterns
   - Responsibilities: Design, ADRs, specs
2. **service-engineer.chatmode.md**
   - Tools: Read, Write, Edit, Bash (test execution)
   - Context: SERVICE_TEMPLATE_QUICK, service-catalog
   - Responsibilities: Service implementation, tests
3. **ui-engineer.chatmode.md**
   - Tools: Read, Write, Edit, shadcn MCP
   - Context: UI patterns, component library
   - Responsibilities: Frontend implementation
4. **reviewer.chatmode.md**
   - Tools: Read, Grep, Glob (NO Write/Edit)
   - Context: Quality standards, anti-patterns
   - Responsibilities: Code review, validation
5. **documenter.chatmode.md**
   - Tools: Read, Write, Edit
   - Context: Memory files, documentation standards
   - Responsibilities: Update docs, memory files

**Effort**: 4-6 hours

**Success Criteria**:
- [ ] All 5 chatmodes created
- [ ] Tool restrictions enforced (architect can't Write)
- [ ] Context scoped correctly
- [ ] Validation gates defined

**Testing**:
```bash
# Switch to architect mode
# Try to use Write tool → Should be forbidden
# Verify only relevant context loads
```

---

### Phase 3: Workflow Prompts (Week 2-3)

**Goal**: Systematize common operations with validation gates

**Deliverables**:
1. **create-service.prompt.md**
   - 4 phases: design → implementation → testing → docs
   - 3 validation gates
   - Chatmode sequence: architect → service-engineer → service-engineer → documenter
2. **write-migration.prompt.md**
   - Migration creation workflow
   - Type regeneration automation
   - Validation: schema check before commit
3. **create-adr.prompt.md**
   - Structured ADR creation
   - Sequential thinking analysis
   - Validation: alternatives evaluated, rationale clear
4. **session-handoff.prompt.md**
   - Auto-generate from phase-status.memory.md
   - Update memory with session outcomes
   - Consistent format (template-based)
5. **phase-completion.prompt.md**
   - Checklist-based signoff
   - Quality gate verification
   - Handoff to next phase

**Effort**: 6-8 hours

**Success Criteria**:
- [ ] All 5 workflow prompts created
- [ ] Each has explicit validation gates
- [ ] Deterministic, repeatable outcomes
- [ ] Tested end-to-end (create-service workflow)

**Testing**:
```bash
# Execute create-service workflow
# Verify 3 validation gates trigger
# Verify chatmode switches work
# Verify memory files update automatically
```

---

### Phase 4: Specification Files (Week 3-4)

**Goal**: Create implementation-ready blueprints for remaining work

**Deliverables**:
1. **loyalty-service.spec.md**
   - Bounded context: "What rewards has player earned?"
   - Interface definition
   - Database schema
   - Business rules
   - Test requirements
2. **player-loyalty-ui.spec.md**
   - UI requirements for player loyalty page
   - Component breakdown
   - API integration
   - Validation criteria
3. **visit-tracking-ui.spec.md**
   - UI requirements for visit tracking
   - Real-time updates
   - Form validation
4. **Template**: `template.spec.md`
   - Guide for creating new specs

**Effort**: 4-6 hours

**Success Criteria**:
- [ ] 3 specification files created
- [ ] Implementable by junior engineer (unambiguous)
- [ ] Clear validation criteria
- [ ] Links to relevant templates/standards

**Testing**:
```bash
# Give spec to hypothetical junior engineer
# Can they implement without questions?
# Are all requirements clear and measurable?
```

---

### Phase 5: Modular Instructions (Week 4)

**Goal**: Context engineering with scope-based instruction loading

**Deliverables**:
1. **service-layer.instructions.md**
   - applyTo: `services/**/*.ts`
   - Anti-pattern enforcement
   - Type safety rules
   - Bounded context checks
2. **ui-layer.instructions.md**
   - applyTo: `app/**/*.tsx`
   - Component patterns
   - shadcn/ui standards
   - Accessibility requirements
3. **testing.instructions.md**
   - applyTo: `__tests__/**/*.test.ts`
   - Test structure
   - Coverage requirements
   - Naming conventions
4. **migrations.instructions.md**
   - applyTo: `supabase/migrations/*.sql`
   - Migration patterns
   - Type regeneration reminder
   - Naming convention enforcement
5. **Update**: `.claude/CLAUDE.md`
   - Reference modular instructions
   - Remove static content (now in memory/instructions)

**Effort**: 3-4 hours

**Success Criteria**:
- [ ] 4 instruction files created
- [ ] Scope-based loading working (applyTo)
- [ ] No context pollution (UI rules don't load for services)
- [ ] .claude/CLAUDE.md streamlined

**Testing**:
```bash
# Edit services/player/index.ts
# Verify service-layer.instructions.md loads
# Verify ui-layer.instructions.md does NOT load
```

---

### Phase 6: Validation & Iteration (Week 4-5)

**Goal**: Test complete system, refine based on real usage

**Activities**:
1. **End-to-end test**: Execute create-service workflow
2. **Performance test**: Measure session start time
3. **Usability test**: Developer onboarding with memory files
4. **Refinement**: Based on actual usage, adjust workflows
5. **Documentation**: Update AGENTIC_WORKFLOW_STRATEGY.md with learnings

**Effort**: 2-3 hours

**Success Criteria**:
- [ ] create-service workflow completes successfully
- [ ] Session start <10s with full context
- [ ] New developer onboarded in <30 minutes
- [ ] Zero anti-pattern violations in test service
- [ ] Memory files stay current (auto-updated)

---

## Migration Path: Ad-Hoc → Systematic

### Step 1: Extract Knowledge (Compression + Structuring)

**Current State**:
- 203,833 words across 104 files
- Full read requires 2-5 minutes
- Context rebuilt each session

**Action**:
```bash
# Use compressed version as input
# Extract essential facts into 6 memory files

Input:  docs-compressed/ (72,640 words, 64.2% compression)
Output: .claude/memory/ (6 files, ~3,000 words total)
Reduction: 96% (203k → 3k words)
```

**Process**:
1. Read compressed docs with focus on:
   - Tech stack → project-context.memory.md
   - ADR decisions → architecture-decisions.memory.md
   - Current status → phase-status.memory.md
   - Service list → service-catalog.memory.md
   - Terminology → domain-glossary.memory.md
2. LLM summarizes into structured memory format
3. Human reviews and approves
4. Memory files committed to repo

**Benefit**: 96% context reduction, <10s session load

---

### Step 2: Define Roles (Separation of Concerns)

**Current State**:
- Single agent does everything
- No validation gates
- Quality depends on agent memory

**Action**:
```bash
# Create 5 chatmodes with tool boundaries

architect.chatmode.md        # Design only, NO code
service-engineer.chatmode.md # Service impl only
ui-engineer.chatmode.md      # Frontend only
reviewer.chatmode.md         # Review only, NO impl
documenter.chatmode.md       # Docs only
```

**Tool Restrictions**:
- Architect: Read, Grep, Glob, WebSearch (NO Write/Edit)
- Service Engineer: Read, Write, Edit, Bash
- UI Engineer: Read, Write, Edit, shadcn MCP
- Reviewer: Read, Grep, Glob (NO Write/Edit)
- Documenter: Read, Write, Edit

**Benefit**: Professional boundaries, quality gates enforced

---

### Step 3: Systematize Operations (Repeatability)

**Current State**:
- Ad-hoc "create a service" requests
- Inconsistent outcomes
- Manual review after the fact

**Action**:
```bash
# Create workflow prompts with validation gates

create-service.prompt.md    # 3 validation gates
write-migration.prompt.md   # Type regeneration automated
create-adr.prompt.md        # Structured format
session-handoff.prompt.md   # Automated generation
```

**Validation Gates**:
- Gate 1: Design review (before implementation)
- Gate 2: Implementation review (before testing)
- Gate 3: Test review (before documentation)

**Benefit**: Same quality every time, deterministic outcomes

---

### Step 4: Preserve Context (Cross-Session Memory)

**Current State**:
- SESSION_HANDOFF manually updated
- Context rebuilt each session
- Facts lost between sessions

**Action**:
```bash
# Auto-update memory files after each task

After service creation:
  → Update service-catalog.memory.md

After ADR creation:
  → Update architecture-decisions.memory.md

After session:
  → Update phase-status.memory.md

Memory files become single source of truth
```

**Benefit**: Perfect session continuity, no context loss

---

## Success Metrics

### Quantitative Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| **Context Load Time** | 2-5 minutes | <10 seconds | Time from session start to agent ready |
| **Memory Footprint** | 203k words | <5k words | Total words in memory files |
| **Validation Gate Compliance** | 0% | 100% | % of operations with human approval |
| **Documentation Freshness** | Weekly | Real-time | Time between change and doc update |
| **Anti-Pattern Detection Rate** | Manual | 100% | % of violations caught automatically |
| **Session Continuity** | 0% | 100% | % of sessions resuming with full context |

### Qualitative Metrics

| Aspect | Current | Target |
|--------|---------|--------|
| **Developer Onboarding** | 4 hours | 30 minutes |
| **Session Starts** | "Let me review docs..." | "Ready. What's next?" |
| **Service Creation** | Ad-hoc, inconsistent | Systematic, repeatable |
| **Quality Assurance** | Manual review only | Automated + human gates |
| **Role Clarity** | Single agent does all | Specialized chatmodes |
| **Documentation Updates** | Manual, weekly | Automated, real-time |

---

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Memory Drift** (facts become outdated) | Medium | Medium | Weekly auto-validation against codebase; git blame tracking |
| **Over-Engineering** (too many files/complexity) | Low | Low | Start minimal (6 memory, 5 chatmodes); expand only if needed |
| **Adoption Resistance** (team learning curve) | Medium | Medium | Phase 1 invisible to devs (memory backend); gradual rollout |
| **Tool Restrictions Too Rigid** (chatmodes block work) | High | Low | Allow override flag in chatmode YAML; review after 2 weeks |
| **Validation Gates Slow Work** | Medium | Medium | Gates only for critical ops (new service, ADR); skip for routine tasks |
| **Memory Files Grow Too Large** | Low | Low | 500-line limit per file; compression techniques |
| **Context Pollution** (wrong instructions load) | Medium | Low | Test applyTo scope carefully; clear file patterns |
| **Cross-Session Staleness** (memory not updated) | High | Low | Mandatory memory update in workflow final step |

---

## Comparison: Before vs. After

| Aspect | Current (Ad-Hoc) | Proposed (Systematic) | Improvement |
|--------|------------------|----------------------|-------------|
| **Context Loading** | Manual (2-5 min) | Auto-memory (<10s) | **96% faster** |
| **Session Continuity** | Lost between sessions | Persistent memory | **100% retention** |
| **Validation** | None | 3 gates per workflow | **Quality gates** |
| **Role Boundaries** | Single agent | 5 specialized chatmodes | **Professional separation** |
| **Documentation Update** | Manual (weekly) | Automated (real-time) | **Instant freshness** |
| **Quality Assurance** | Human review only | Automated + human gates | **Zero anti-patterns** |
| **Repeatability** | Varies by agent/session | Deterministic (.prompt.md) | **Consistent outcomes** |
| **Onboarding Time** | 4 hours | 30 minutes | **87% faster** |
| **Memory Footprint** | 203k words (full docs) | <5k words (memory files) | **96% reduction** |
| **Service Creation** | Ad-hoc, reactive | Systematic, validated | **3 checkpoints** |

---

## Next Steps

### Immediate Actions (Week 1)

1. **Approve Strategy** ✅
   - Review this document
   - Confirm approach
   - Prioritize phases

2. **Phase 1 Kickoff** (4-6 hours)
   - Create `.claude/memory/` directory
   - Extract 6 memory files from compressed docs
   - Configure auto-load
   - Test session start time (<10s?)

3. **Validate Memory Approach** (1 hour)
   - Start new session
   - Verify auto-load works
   - Confirm agent has full context
   - Measure load time

### Phase 2-5 Execution (Weeks 2-4)

4. **Create Chatmodes** (4-6 hours)
   - Implement 5 chatmode files
   - Test tool restrictions
   - Verify context scoping

5. **Build Workflows** (6-8 hours)
   - Create 5 workflow prompts
   - Test create-service end-to-end
   - Validate gate triggering

6. **Develop Specs** (4-6 hours)
   - Write loyalty-service.spec.md
   - Create UI feature specs
   - Template for future specs

7. **Implement Instructions** (3-4 hours)
   - Create 4 scoped instruction files
   - Test applyTo patterns
   - Streamline .claude/CLAUDE.md

### Continuous Improvement (Ongoing)

8. **Monitor & Refine**
   - Track metrics (session start time, validation compliance)
   - Gather developer feedback
   - Adjust workflows based on usage
   - Update AGENTIC_WORKFLOW_STRATEGY.md with learnings

---

## References

### External

- **GitHub Blog**: [Building Reliable AI Workflows with Agentic Primitives](https://github.blog/ai-and-ml/github-copilot/how-to-build-reliable-ai-workflows-with-agentic-primitives-and-context-engineering/)
- **Claude Code Documentation**: [Context Engineering Patterns](https://docs.claude.com/en/docs/claude-code/)

### Internal

- **Current Documentation**: `/home/diepulp/projects/pt-2/docs/` (203k words, 104 files)
- **Compressed Version**: `/home/diepulp/projects/pt-2/docs-compressed/` (72k words, 64.2% reduction)
- **Architecture Standards**: `/home/diepulp/projects/pt-2/.claude/CLAUDE.md`
- **Service Template**: `docs/patterns/SERVICE_TEMPLATE_QUICK.md`
- **Architecture Framework**: `docs/patterns/BALANCED_ARCHITECTURE_QUICK.md`
- **PRD**: `docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md`

### Related ADRs

- ADR-001: Dual Database Type Strategy
- ADR-002: Test Location Standardization
- ADR-003: State Management Strategy (React Query + Zustand)

---

## Appendices

### Appendix A: Memory File Template

```markdown
---
last_updated: YYYY-MM-DD
auto_load: true|false
scope: all_agents|specific_chatmode
max_size: 500 lines
---

# [Memory File Name]

## Section 1: [Category]
[Focused facts, no prose]

## Section 2: [Category]
[Key decisions, constraints]

## Section 3: [Category]
[Current state, next actions]

## References (Full Context)
- [Link to detailed doc if needed]
```

### Appendix B: Chatmode Template

```markdown
---
role: [Role Name]
description: [Brief description]
tools_allowed:
  - [Tool 1]
  - [Tool 2]
tools_forbidden:
  - [Tool X]
context_files:
  - [Memory file 1]
  - [Doc reference 1]
---

# [Role Name] Chat Mode

## Responsibilities
[What this role does]

## Boundaries
### ❌ DO NOT
[Forbidden actions]

### ✅ DO
[Allowed actions]

## Validation Gate Protocol
[When and how to get approval]

## Output Deliverables
[What this role produces]

## Example Interaction
[Sample task execution]
```

### Appendix C: Workflow Prompt Template

```markdown
---
title: [Workflow Name]
description: [Brief description]
chatmode_sequence:
  - [chatmode1]
  - [chatmode2]
validation_gates: [number]
context_files:
  - [Memory/doc reference]
---

# [Workflow Name]

## Overview
[Purpose and expected outcome]

## Phase 1: [Phase Name] ([Chatmode])
[Steps and validation gate]

## Phase 2: [Phase Name] ([Chatmode])
[Steps and validation gate]

## Final Checklist
[Success criteria]
```

### Appendix D: Specification Template

```markdown
---
service_name: [ServiceName]
bounded_context: "[Key question]"
status: proposed|approved|implemented
created: YYYY-MM-DD
---

# [ServiceName] Specification

## Bounded Context
[Key question this service answers]

## Data Ownership
### OWNS
[Tables/fields owned]

### REFERENCES
[Other services referenced]

## Interface Definition
\```typescript
[TypeScript interface]
\```

## Implementation Requirements
[Technical requirements]

## Validation Criteria
[Success checklist]
```

---

**Document Version**: 1.0.0
**Last Updated**: 2025-10-17
**Status**: Proposed (Pending Approval)
**Next Review**: After Phase 1 completion

---

## Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2025-10-17 | Initial strategy document | AI Agent |

---

**End of Document**
