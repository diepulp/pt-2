# Skills Integration Strategy: The Sixth Agentic Primitive

> **Integrate Skills with Memory, Chat Modes, Workflows, Specs, and Instructions for complete context engineering**

**Version**: 1.0.0
**Date**: 2025-11-21
**Status**: Proposed
**Supersedes**: None (Extends `agentic-workflow-strategy.md`)
**References**:
- [Agentic Workflow Strategy](./agentic-workflow-strategy.md)
- [Frontend Design Skill](../../.claude/skills/frontend-design/)
- [GitHub: Agentic Primitives](https://github.blog/ai-and-ml/github-copilot/how-to-build-reliable-ai-workflows-with-agentic-primitives-and-context-engineering/)

---

## Executive Summary

**Problem**: The agentic workflow strategy (5 primitives) provides excellent project-specific context engineering but lacks domain expertise encapsulation and auto-invocation capabilities.

**Solution**: Introduce **Skills** as a sixth primitive that complements the existing five by providing:
- **Auto-invoked domain expertise** (triggers automatically based on task type)
- **Progressive disclosure** (metadata → SKILL.md → references)
- **Portable procedural knowledge** (reusable across projects)
- **Self-validation checklists** (built-in compliance verification)

**Impact**:
- **Zero-turn expertise loading** (skills auto-invoke vs manual workflow invocation)
- **95%+ pattern compliance** (skills provide validated workflows)
- **Portable knowledge base** (skills work across projects)
- **Reduced cognitive load** (agent focuses on implementation, not discovery)

---

## Table of Contents

1. [The Six-Layer Context Architecture](#the-six-layer-context-architecture)
2. [Skills as the Sixth Primitive](#skills-as-the-sixth-primitive)
3. [Comparative Analysis](#comparative-analysis-skills-vs-agentic-primitives)
4. [Integration Patterns](#integration-patterns)
5. [Complete Workflow Example](#complete-workflow-example)
6. [Decision Matrix](#decision-matrix-which-primitive-to-use)
7. [Implementation Roadmap](#implementation-roadmap)
8. [Context Engineering Principles](#context-engineering-principles)
9. [Benefits & Metrics](#benefits--metrics)

---

## The Six-Layer Context Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: SKILLS (Domain Expertise, Auto-Invoked)               │
│ Purpose: Specialized procedural knowledge, auto-loads by task   │
│ Example: frontend-design, service-builder, migration-manager    │
├─────────────────────────────────────────────────────────────────┤
│ Layer 2: MEMORY (Project Facts, Auto-Loaded)                   │
│ Purpose: Cross-session project state and decisions             │
│ Example: project.memory.md, phase-status.memory.md             │
├─────────────────────────────────────────────────────────────────┤
│ Layer 3: CHAT MODES (Role Boundaries, Manual Switch)           │
│ Purpose: Professional separation with tool restrictions        │
│ Example: architect, service-engineer, frontend-engineer        │
├─────────────────────────────────────────────────────────────────┤
│ Layer 4: WORKFLOWS (Task Orchestration, Manual Invoke)         │
│ Purpose: Multi-phase operations with validation gates          │
│ Example: create-service, implement-frontend                    │
├─────────────────────────────────────────────────────────────────┤
│ Layer 5: SPECIFICATIONS (Implementation Blueprints, Referenced)│
│ Purpose: Unambiguous requirements for execution                │
│ Example: loyalty-service.spec.md, player-dashboard.spec.md     │
├─────────────────────────────────────────────────────────────────┤
│ Layer 6: INSTRUCTIONS (Scope-Based Rules, Auto-Loaded)         │
│ Purpose: File-level guidance based on applyTo patterns         │
│ Example: service-layer.instructions.md, frontend-layer.instructions.md │
└─────────────────────────────────────────────────────────────────┘
```

---

## Skills as the Sixth Primitive

### What are Skills?

**Definition**: Self-contained packages of domain-specific procedural knowledge that auto-invoke based on task description matching and provide progressive context disclosure.

**Anatomy**:
```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description)
│   └── Markdown instructions (workflow, patterns)
└── resources/ (optional)
    ├── scripts/     - Executable code
    ├── references/  - Documentation (loaded on-demand)
    └── assets/      - Templates, boilerplate
```

### Progressive Disclosure Model

Skills use three-level context loading:

```
Level 1: Metadata (~100 words)
  Always in context
  Description triggers auto-invocation
  Example: "Create frontend interfaces for PT-2 architecture..."

Level 2: SKILL.md (~10KB)
  Loads when skill invokes
  Workflow guidance, patterns, checklists
  Example: 5-step frontend implementation workflow

Level 3: References (~43KB)
  Loaded as needed by agent
  Detailed documentation, ADRs, examples
  Example: ADR-003, technical standards, integration guides
```

### Auto-Invocation Mechanism

**Trigger**: User request matches skill description
```
User: "Build a player dashboard"
      ↓
Matches: "Create frontend interfaces..."
      ↓
Auto-loads: frontend-design skill
      ↓
Agent has: React 19 patterns, Tailwind v4, ADR-003, integration guides
```

### Current PT-2 Skills

| Skill | Status | Purpose | References Included |
|-------|--------|---------|---------------------|
| **frontend-design** | ✅ Complete | React 19 + Tailwind v4 + PT-2 architecture | ADR-003, technical standards, integration patterns |
| **service-builder** | 🆕 Proposed | Service layer creation following SRM | SERVICE_TEMPLATE, SRM, bounded context examples |
| **migration-manager** | 🆕 Proposed | Database migration workflow | Migration naming, RLS validation |
| **adr-writer** | 🆕 Proposed | Structured ADR creation | ADR template, decision framework |

---

## Comparative Analysis: Skills vs Agentic Primitives

| Aspect | Memory | Chat Modes | Workflows | Specs | Instructions | **Skills** |
|--------|--------|------------|-----------|-------|--------------|------------|
| **Invocation** | Auto (session) | Manual (switch) | Manual (invoke) | Referenced | Auto (applyTo) | **Auto (description)** |
| **Scope** | Project-specific | Project-specific | Project-specific | Project-specific | Project-specific | **Domain-general** |
| **Knowledge Type** | Current state | Role boundaries | Orchestration | Requirements | File rules | **Procedural expertise** |
| **Context Size** | ~5KB total | ~2KB each | ~5KB each | ~3KB each | ~2KB each | **10KB + 43KB refs** |
| **Update Frequency** | Dynamic (agents) | Static (versioned) | Static (versioned) | Static (versioned) | Static (versioned) | **Static (versioned)** |
| **Portability** | Project-bound | Project-bound | Project-bound | Project-bound | Project-bound | **Cross-project** |
| **Validation** | None | Tool restrictions | Human gates | Implementation criteria | Anti-pattern checks | **Self-checklists** |

### Synergy Analysis

**Skills Complement (Not Replace) Existing Primitives**:

1. **Skills + Memory**
   - Memory: "LoyaltyService not implemented"
   - Skill: Auto-loads service-builder with procedural knowledge
   - Synergy: Memory provides state, skill provides method

2. **Skills + Chat Modes**
   - Chat Mode: frontend-engineer (role boundaries)
   - Skill: frontend-design (auto-loaded for role)
   - Synergy: Role defines boundaries, skill provides expertise

3. **Skills + Workflows**
   - Workflow: implement-frontend (orchestration)
   - Skill: frontend-design (auto-invoked in Phase 2)
   - Synergy: Workflow orchestrates, skill guides execution

4. **Skills + Specifications**
   - Spec: player-dashboard.spec.md (requirements)
   - Skill: frontend-design (references "Real-time Dashboard" pattern)
   - Synergy: Spec defines what, skill defines how

5. **Skills + Instructions**
   - Instructions: frontend-layer.instructions.md (file rules)
   - Skill: frontend-design (comprehensive guidance)
   - Synergy: Instructions = quick reference, skill = deep knowledge

---

## Integration Patterns

### Pattern 1: Skill-Enhanced Chat Mode

**Scenario**: Frontend engineer needs immediate access to PT-2 patterns

```markdown
# .claude/chatmodes/frontend-engineer.chatmode.md
---
role: Frontend Engineer
tools_allowed: [Read, Write, Edit, Bash, shadcn MCP]
skills_loaded:
  - frontend-design  # Auto-load skill for this role
context_files:
  - .claude/memory/project.memory.md
  - .claude/memory/architecture-decisions.memory.md
---

## Your Responsibilities
Implement frontend interfaces following PT-2 architecture.

## Automatic Context
The **frontend-design skill** is automatically loaded for your role,
providing:
- React 19 + Next.js App Router + Tailwind v4 patterns
- ADR-003 state management guidance (TanStack Query + Zustand)
- Service layer integration patterns (Server Actions, DTOs)
- Performance requirements (virtualization, skeletons, staleTime)
- Self-validation checklist

## Workflow
Follow the skill's 5-step implementation workflow:
1. Understand requirements & design direction
2. Consult technical standards (skill references)
3. Integrate with PT-2 architecture
4. Implement with creative excellence
5. Verify technical compliance (skill checklist)
```

### Pattern 2: Skill-Invoked Workflow

**Scenario**: Multi-phase frontend implementation with skill guidance

```markdown
# .claude/workflows/implement-frontend.prompt.md
---
title: Implement Frontend Feature (Skill-Enhanced)
chatmode_sequence:
  - architect          # Phase 1: Design
  - frontend-engineer  # Phase 2: Implementation (uses skill)
  - reviewer           # Phase 3: Quality check
skills_invoked:
  - frontend-design    # Auto-loads in Phase 2
validation_gates: 3
---

## Phase 2: Implementation (Frontend Engineer + Skill)

**Chatmode**: frontend-engineer.chatmode.md
**Skill Auto-Loaded**: frontend-design

### Step 2.1: Skill-Guided Planning

The frontend-design skill provides automatic guidance:
1. ✅ Design direction chosen (bold aesthetic)
2. ✅ Technical standards consulted (ADR-003, Tailwind v4)
3. ✅ Architecture patterns identified (Server vs Client Components)

Agent follows skill's workflow automatically.

### Step 2.2: Implementation with Skill References

Agent reads skill references as needed:
- `references/ADR-003-state-management-strategy.md` for query key factories
- `references/pt2-architecture-integration.md` for service layer patterns
- `references/pt2-technical-standards.md` for shadcn/ui components

### Step 2.3: Self-Validation (From Skill Checklist)

🛑 **VALIDATION GATE 2**: Implementation Review

Agent uses skill's built-in checklist:
- [ ] Uses Tailwind v4 syntax (not v3)
- [ ] Uses shadcn/ui components where appropriate
- [ ] Server Actions for all mutations
- [ ] Service keys from services/{domain}/keys.ts
- [ ] Lists > 100 items use virtualization
- [ ] Loading states use skeletons (not spinners)

**User approval required before Phase 3.**
```

### Pattern 3: Specification References Skill

**Scenario**: Architect creates spec that references skill patterns

```markdown
# .claude/specs/player-dashboard.spec.md
---
feature_name: Player Dashboard
type: frontend
status: approved
uses_skill: frontend-design  # Explicit skill reference
implements: Phase 3 (UI delivery)
---

## Implementation Guidance

**Engineer**: Use frontend-engineer chatmode
**Skill**: frontend-design auto-loads
**Pattern**: Real-time Dashboard (from skill)

### From frontend-design Skill

The skill provides this pattern:
```
Pattern: Real-time Dashboard
- Server Component for initial data load
- Client Component with TanStack Query for interactivity
- Supabase subscription for real-time updates
- Cache invalidation on change events
- Creative, information-dense layout
```

Follow the skill's 5-step workflow for implementation.

### Technical Requirements (Skill Will Validate)

Based on skill checklist:
- ✅ React 19 with App Router (NOT Pages Router)
- ✅ TanStack Query with playerKeys.list() from services/player/keys.ts
- ✅ Tailwind v4 utilities (NOT v3 syntax or inline styles)
- ✅ shadcn/ui Table component
- ✅ @tanstack/react-virtual for player list (> 100 items)
- ✅ Loading skeleton (NOT spinner)
- ✅ Server Actions for mutations (NOT fetch to API routes)

See skill references for detailed implementation patterns.
```

### Pattern 4: Instructions Defer to Skill

**Scenario**: File-level instructions reference skill for comprehensive guidance

```markdown
# .claude/instructions/frontend-layer.instructions.md
---
applyTo:
  - "app/**/*.tsx"
  - "components/**/*.tsx"
description: "Frontend implementation standards (delegates to frontend-design skill)"
---

# Frontend Layer Instructions

## Quick Reference

For comprehensive frontend guidance, the **frontend-design skill** provides:
- Complete React 19 + Next.js App Router + Tailwind v4 patterns
- ADR-003 state management authority (TanStack Query + Zustand)
- Architecture integration patterns (Server Actions, DTOs, service layer)
- Performance requirements (virtualization, skeletons, caching)
- Self-validation checklist (compliance verification)

These instructions supplement the skill with file-specific quick rules.

## File-Specific Quick Rules

### Server Components (app/**/page.tsx)
```typescript
// ✅ GOOD: Direct service layer access
async function PlayersPage() {
  const supabase = await createClient()
  const playerService = createPlayerService(supabase)
  const result = await playerService.list()

  if (!result.success) {
    return <ErrorDisplay error={result.error} />
  }

  return <PlayersList initialPlayers={result.data} />
}
```

### Client Components (components/**/*.tsx)
```typescript
// ✅ GOOD: TanStack Query with service keys
'use client'
import { useQuery } from '@tanstack/react-query'
import { playerKeys } from '@/services/player/keys'

function InteractivePlayers() {
  const { data, isLoading } = useQuery({
    queryKey: playerKeys.list(),  // ← From service key factory
    queryFn: fetchPlayers,
    staleTime: 5 * 60 * 1000,  // ← From ADR-003 (hot data)
  })

  if (isLoading) return <PlayersSkeleton />  // ← NOT spinner

  return <PlayersList players={data} />
}
```

## When Uncertain

**Consult skill first**: The frontend-design skill has comprehensive patterns
**Escalate if needed**: Switch to architect chatmode for design questions
**Read references**: Skill provides ADR-003, technical standards, integration guides
```

---

## Complete Workflow Example

### Scenario: "Implement Player Dashboard with Real-time Updates"

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 0: Context Auto-Loading (<10s)                            │
├─────────────────────────────────────────────────────────────────┤
│ Auto-Loaded by Claude Code:                                     │
│ ✅ Memory files:                                                │
│    - project.memory.md (tech stack, patterns, constraints)      │
│    - phase-status.memory.md (current phase, blockers)           │
│    - architecture-decisions.memory.md (ADR summaries)           │
│ ✅ Instructions (via applyTo):                                  │
│    - frontend-layer.instructions.md (file-specific rules)       │
│                                                                  │
│ Agent knows immediately:                                         │
│ - Current phase: Phase 3 (UI delivery)                          │
│ - Tech stack: React 19, Next.js App Router, Tailwind v4        │
│ - Services available: PlayerService, VisitService, etc.         │
│ - State management: ADR-003 (TanStack Query + Zustand)         │
│                                                                  │
│ Time: <10 seconds                                                │
│ Tokens: ~5KB (memory) + ~2KB (instructions) = 7KB              │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: Design (Architect Chatmode)                            │
├─────────────────────────────────────────────────────────────────┤
│ User: "Implement player dashboard with real-time updates"       │
│                                                                  │
│ Switch to: architect.chatmode.md                                │
│ Tools: Read, Grep, Glob, WebSearch, sequential-thinking         │
│                                                                  │
│ Architect Agent:                                                 │
│ 1. Reads service-catalog.memory.md                              │
│    → PlayerService available                                    │
│    → Query keys: playerKeys.list(), playerKeys.detail(id)       │
│                                                                  │
│ 2. Creates specification:                                        │
│    → .claude/specs/player-dashboard.spec.md                     │
│    → References frontend-design skill pattern: "Real-time Dashboard" │
│    → Lists requirements: Server Component + Client Component    │
│    → References ADR-003 for state management                    │
│    → Defines validation criteria                                │
│                                                                  │
│ 3. VALIDATION GATE 1: Design Review                             │
│    🛑 Presents spec to user                                     │
│    Checklist:                                                    │
│    - [ ] Pattern from skill is appropriate?                     │
│    - [ ] Technical requirements clear?                          │
│    - [ ] Follows ADR-003 state management?                      │
│    - [ ] Performance requirements defined?                      │
│                                                                  │
│ User: "Approved ✅"                                              │
│                                                                  │
│ Time: 30 minutes                                                 │
│ Tokens: +10KB (spec creation)                                   │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2: Implementation (Frontend Engineer + Skill)             │
├─────────────────────────────────────────────────────────────────┤
│ Switch to: frontend-engineer.chatmode.md                        │
│ Tools: Read, Write, Edit, Bash, shadcn MCP                      │
│                                                                  │
│ AUTO-INVOKED (by description matching):                         │
│ ✅ frontend-design skill                                        │
│    - Level 1: Metadata already in context                       │
│    - Level 2: SKILL.md loads now (~10KB)                        │
│    - Level 3: References available on-demand (~43KB)            │
│                                                                  │
│ Frontend Engineer Agent (following skill workflow):              │
│                                                                  │
│ Step 1: Understand Requirements & Design Direction              │
│   - Reads player-dashboard.spec.md                              │
│   - Identifies "Real-time Dashboard" pattern from skill         │
│   - Chooses bold, data-dense aesthetic (skill guidance)         │
│                                                                  │
│ Step 2: Consult Technical Standards                             │
│   - Reads ADR-003 (Section 6: Realtime playbook)                │
│     → Subscription pattern                                      │
│     → invalidateQueries({ refetchType: 'active' })              │
│     → Batch/debounce invalidations                              │
│   - Reads pt2-technical-standards.md                            │
│     → shadcn/ui Table component                                 │
│     → @tanstack/react-virtual for lists > 100                   │
│     → Loading skeletons (not spinners)                          │
│                                                                  │
│ Step 3: Integrate with PT-2 Architecture                        │
│   - Reads pt2-architecture-integration.md                       │
│     → Server Component pattern (initial data)                   │
│     → Client Component pattern (interactivity)                  │
│     → Query keys: playerKeys.list() from services/player/keys.ts │
│     → Real-time: Supabase subscription + cache invalidation     │
│                                                                  │
│ Step 4: Implement with Creative Excellence                      │
│   - Creates app/dashboard/page.tsx (Server Component)           │
│     ✅ Direct service layer access                              │
│     ✅ ServiceResult<T> error handling                          │
│   - Creates components/PlayerDashboard.tsx (Client Component)   │
│     ✅ TanStack Query with playerKeys.list()                    │
│     ✅ usePlayerRealtime() custom hook                          │
│     ✅ Supabase subscription → invalidateQueries()              │
│   - Creates components/PlayerTable.tsx                          │
│     ✅ shadcn/ui Table component                                │
│     ✅ @tanstack/react-virtual (> 100 players)                  │
│     ✅ Loading skeleton (not spinner)                           │
│     ✅ Bold, data-dense aesthetic                               │
│   - Applies Tailwind v4 utilities                               │
│     ✅ Custom theme tokens                                      │
│     ✅ Dark mode variants                                       │
│     ✅ Responsive grid                                          │
│                                                                  │
│ Step 5: Verify Technical Compliance (Skill Checklist)           │
│   Self-validation before submitting:                            │
│   ✅ Uses Tailwind v4 syntax (shadow-xs not shadow-sm)         │
│   ✅ Uses shadcn/ui components where appropriate                │
│   ✅ Server Components for static content                       │
│   ✅ Client Components for interactivity                        │
│   ✅ Server Actions for all mutations                           │
│   ✅ Service keys from services/player/keys.ts                  │
│   ✅ DTOs imported from service types                           │
│   ✅ Lists > 100 items use virtualization                       │
│   ✅ Loading states use skeletons (not spinners)                │
│                                                                  │
│ 2. VALIDATION GATE 2: Implementation Review                     │
│    🛑 Presents implementation summary                           │
│                                                                  │
│    Files Created:                                                │
│    - app/dashboard/page.tsx (Server Component, 45 lines)        │
│    - components/PlayerDashboard.tsx (Client Component, 120 lines) │
│    - components/PlayerTable.tsx (Table + virtualization, 85 lines) │
│    - hooks/usePlayerRealtime.ts (Real-time sync, 40 lines)      │
│                                                                  │
│    Skill Compliance:                                             │
│    - [x] All 8 checklist items ✅                               │
│    - [x] Follows ADR-003 patterns ✅                            │
│    - [x] Uses skill references correctly ✅                     │
│                                                                  │
│    Ready for quality review?                                     │
│                                                                  │
│ User: "Approved ✅"                                              │
│                                                                  │
│ Time: 1.5 hours                                                  │
│ Tokens: +15KB (implementation) + 43KB (skill references as needed) │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3: Quality Review (Reviewer Chatmode)                     │
├─────────────────────────────────────────────────────────────────┤
│ Switch to: reviewer.chatmode.md                                 │
│ Tools: Read, Grep, Glob (NO Write/Edit)                         │
│                                                                  │
│ Reviewer Agent:                                                  │
│ 1. Reads implementation files                                    │
│ 2. Checks against anti-patterns.memory.md                       │
│    ✅ No class-based components                                 │
│    ✅ No ReturnType inference                                   │
│    ✅ No inline styles                                          │
│    ✅ No hardcoded query keys                                   │
│ 3. Verifies skill checklist compliance                          │
│    ✅ All 8 items from frontend-design skill                    │
│ 4. Checks accessibility requirements                            │
│    ✅ Semantic HTML                                             │
│    ✅ ARIA labels where needed                                  │
│    ✅ Keyboard navigation                                       │
│                                                                  │
│ 3. VALIDATION GATE 3: Quality Sign-Off                          │
│    🛑 Quality report                                            │
│                                                                  │
│    Compliance: 100%                                              │
│    Anti-patterns: 0 violations                                   │
│    Accessibility: Pass                                           │
│    Performance: Virtualization ✅, Skeletons ✅                 │
│                                                                  │
│    Approved for merge?                                           │
│                                                                  │
│ User: "Approved ✅"                                              │
│                                                                  │
│ Time: 20 minutes                                                 │
│ Tokens: +8KB (review)                                           │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 4: Documentation Update (Documenter Chatmode)             │
├─────────────────────────────────────────────────────────────────┤
│ Switch to: documenter.chatmode.md                               │
│ Tools: Read, Write, Edit                                         │
│                                                                  │
│ Documenter Agent:                                                │
│ 1. Updates memory files:                                         │
│    - .claude/memory/phase-status.memory.md                      │
│      → "Player dashboard implemented ✅ (2025-11-21)"           │
│      → "Used frontend-design skill"                             │
│      → "Real-time pattern with Supabase subscriptions"          │
│    - .claude/memory/project.memory.md                           │
│      → Adds player dashboard to UI features                     │
│                                                                  │
│ 2. Creates component documentation (optional):                   │
│    - docs/ui/player-dashboard.md                                │
│      → Component structure                                      │
│      → Real-time patterns used                                  │
│      → Performance considerations                               │
│                                                                  │
│ Agent: "Documentation complete. Task finished! ✅"              │
│                                                                  │
│ Time: 15 minutes                                                 │
│ Tokens: +3KB (documentation)                                    │
└─────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════
SUMMARY
═══════════════════════════════════════════════════════════════════
TOTAL TIME: 2.5 hours (vs 6-8 hours ad-hoc)
VALIDATION GATES: 3 (design, implementation, quality)
CONTEXT LOADED:
  - Memory (auto): 7KB
  - Skill (auto): 10KB + 43KB references
  - Total: ~60KB (vs 150KB manual discovery)
COMPLIANCE: 100% (skill checklist + reviewer validation)
ANTI-PATTERNS: 0 violations
QUALITY: Production-ready, tested, documented
═══════════════════════════════════════════════════════════════════
```

---

## Decision Matrix: Which Primitive to Use?

| Need | Primitive | When to Use | Example |
|------|-----------|-------------|---------|
| **Procedural expertise** (how-to) | **Skill** | Domain-specific knowledge needed, auto-invocation desired | frontend-design, service-builder |
| **Project facts** (current state) | **Memory** | Cross-session continuity, current phase status | service-catalog.memory.md, phase-status.memory.md |
| **Role boundaries** (who can do what) | **Chat Mode** | Professional separation, tool restrictions | architect, frontend-engineer, reviewer |
| **Multi-phase orchestration** (workflow) | **Workflow Prompt** | Complex task with validation gates | implement-frontend.prompt.md, create-service.prompt.md |
| **Requirements blueprint** (what to build) | **Specification** | Unambiguous implementation requirements | player-dashboard.spec.md, loyalty-service.spec.md |
| **File-level rules** (scope-specific) | **Instructions** | Context based on file pattern | frontend-layer.instructions.md, service-layer.instructions.md |

### When to Create a Skill vs Other Primitives

**Create a SKILL when**:
- ✅ Procedural knowledge applies across multiple projects (portable)
- ✅ Auto-invocation would improve UX (description matching)
- ✅ Progressive disclosure needed (references loaded on-demand)
- ✅ Self-validation checklist valuable (compliance verification)
- ✅ Domain expertise is stable (doesn't change frequently)

**Create a MEMORY file when**:
- ✅ Project-specific state needs persistence
- ✅ Fast auto-loading required (<10s session start)
- ✅ Agents need to update facts (dynamic content)
- ✅ Cross-session continuity critical

**Create a CHAT MODE when**:
- ✅ Professional role boundaries needed
- ✅ Tool restrictions required (architect can't Write)
- ✅ Scoped context loading desired
- ✅ Validation gates for role transitions

**Create a WORKFLOW PROMPT when**:
- ✅ Multi-phase task with orchestration
- ✅ Human validation gates needed
- ✅ Chat mode switching required
- ✅ Deterministic, repeatable process desired

**Create a SPECIFICATION when**:
- ✅ Implementation requirements are complex
- ✅ Handoff from architect to engineer needed
- ✅ Unambiguous blueprint required
- ✅ Multiple agents will reference it

**Create an INSTRUCTION file when**:
- ✅ File-specific quick rules needed
- ✅ Scope-based loading desired (applyTo)
- ✅ Defers to skills for comprehensive guidance
- ✅ Anti-pattern enforcement at file level

---

## Implementation Roadmap

### Phase 0: Current State (Completed ✅)

**Deliverables**:
- ✅ frontend-design skill created
- ✅ ADR-003 included as reference
- ✅ Technical standards documented
- ✅ Architecture integration patterns captured
- ✅ Skill validated and packaged

**Time**: 3 hours

### Phase 1: Memory Files + Enhanced Chat Modes (Week 1)

**Deliverables**:
1. Create 6 memory files (from agentic-workflow-strategy.md)
   - project.memory.md
   - architecture-decisions.memory.md
   - phase-status.memory.md
   - service-catalog.memory.md
   - domain-glossary.memory.md
   - anti-patterns.memory.md

2. Create chat modes with skill references
   - architect.chatmode.md
   - service-engineer.chatmode.md
   - **frontend-engineer.chatmode.md** (loads frontend-design skill)
   - reviewer.chatmode.md
   - documenter.chatmode.md

**Time**: 6-8 hours
**Validation**: Session start <10s, frontend task auto-loads skill

### Phase 2: Service Builder Skill + Workflows (Week 2)

**Deliverables**:
1. **service-builder skill**
   - SKILL.md with SERVICE_TEMPLATE workflow
   - references/SERVICE_RESPONSIBILITY_MATRIX.md
   - references/SERVICE_TEMPLATE.md
   - references/bounded-context-examples.md
   - scripts/validate-service-structure.ts

2. Enhanced workflow prompts
   - create-service.prompt.md (uses service-builder skill)
   - **implement-frontend.prompt.md** (uses frontend-design skill)
   - write-migration.prompt.md
   - session-handoff.prompt.md

**Time**: 8-10 hours
**Validation**: Service creation workflow with 3 gates + skill guidance

### Phase 3: Additional Skills + Specifications (Week 3)

**Deliverables**:
1. **migration-manager skill**
   - SKILL.md with migration workflow
   - scripts/create-migration.sh
   - scripts/validate-rls-coverage.ts
   - references/migration-naming-standard.md

2. **adr-writer skill**
   - SKILL.md with ADR structure
   - scripts/validate-adr-structure.sh
   - references/adr-template.md
   - references/decision-framework.md

3. Specifications
   - loyalty-service.spec.md (uses service-builder skill)
   - player-dashboard.spec.md (uses frontend-design skill)
   - template.spec.md

**Time**: 8-10 hours
**Validation**: Skills auto-invoke, specs reference skill patterns

### Phase 4: Scoped Instructions + Testing (Week 4)

**Deliverables**:
1. Scoped instruction files
   - service-layer.instructions.md
   - **frontend-layer.instructions.md** (defers to frontend-design skill)
   - testing.instructions.md
   - migrations.instructions.md

2. End-to-end testing
   - Execute implement-frontend workflow
   - Verify skill auto-invocation
   - Measure context load times
   - Test all validation gates
   - Validate memory updates

3. Documentation
   - Update agentic-workflow-strategy.md
   - Create SKILLS_INTEGRATION_STRATEGY.md (this document)
   - Update INDEX.md with skill references

**Time**: 6-8 hours
**Validation**: Complete workflow with <3 hour execution, 95%+ compliance

### Total Implementation Time: 28-36 hours over 4 weeks

---

## Context Engineering Principles

### 1. Layered Loading (Progressive Disclosure)

**Principle**: Load context incrementally based on need

```
Session Start (instant):
  → Load: Memory files (5KB, project state)
  → Load: Instructions (2KB, file-scoped)
  Total: 7KB

Task Invocation (description match):
  → Load: Skill SKILL.md (10KB, workflow)
  → Load: Chat Mode (2KB, role boundaries)
  Total: +12KB = 19KB

As Needed (agent decision):
  → Load: Skill references (43KB, detailed docs)
  → Load: Specifications (3KB, requirements)
  → Load: Workflow prompts (5KB, orchestration)
  Total: +51KB = 70KB (vs 150KB manual discovery)
```

### 2. Context Hierarchy (Precedence Order)

**Principle**: Clear precedence when primitives conflict

```
1. Skills (procedural expertise)           ← "How to do X"
2. Memory (project state)                  ← "What's true now"
3. Specifications (requirements)           ← "What to build"
4. Chat Modes (role boundaries)            ← "What I can do"
5. Workflows (orchestration)               ← "Who does what when"
6. Instructions (file rules)               ← "File-specific rules"
```

**Example Conflict Resolution**:
```
Skill says: "Use Server Actions for mutations"
Instructions say: "Use fetch() for mutations"

Resolution: Skill takes precedence (procedural expertise > file rule)
Agent follows skill guidance
```

### 3. Auto vs Manual Loading

**Principle**: Optimize for cognitive load and efficiency

```
AUTO-LOAD (zero user action):
✅ Memory files (session start via .claude/config.yml)
✅ Skills (description matching via SKILL.md frontmatter)
✅ Instructions (applyTo patterns via YAML frontmatter)

MANUAL INVOKE (explicit user/agent action):
🔄 Chat modes (agent switches via SlashCommand or user request)
🔄 Workflows (user invokes via command or request)
🔄 Specifications (referenced by workflows or agents)
```

### 4. Update Patterns (Static vs Dynamic)

**Principle**: Separate stable knowledge from changing state

```
STATIC (version-controlled, infrequent updates):
- Skills (SKILL.md, references)
- Specifications (.spec.md)
- Workflows (.prompt.md)
- Chat Modes (.chatmode.md)
- Instructions (.instructions.md)

DYNAMIC (agent-updated, frequent changes):
- Memory files (.memory.md)
  → Updated after task completion
  → Updated by documenter chatmode
  → Git-tracked for auditability
```

### 5. Validation Layering (Defense in Depth)

**Principle**: Multiple validation checkpoints prevent errors

```
Layer 1: Self-Validation (Skills)
  → Skill provides checklist
  → Agent validates before submission
  → Example: frontend-design 8-item compliance checklist

Layer 2: Human Gates (Workflows)
  → Workflow defines validation gates
  → User approves at key milestones
  → Example: Design review, implementation review, quality review

Layer 3: Role Restrictions (Chat Modes)
  → Chat mode enforces tool boundaries
  → Architect can't Write, reviewer can't Edit
  → Example: Architect creates spec, engineer implements

Layer 4: Anti-Pattern Detection (Memory + Instructions)
  → Memory lists forbidden patterns
  → Instructions check at file level
  → Example: No ReturnType inference, no classes
```

### 6. Knowledge Portability (Reuse vs Custom)

**Principle**: Balance reusable and project-specific knowledge

```
PORTABLE (cross-project, reusable):
✅ Skills
  → frontend-design works in any Next.js + Tailwind project
  → service-builder works in any service-oriented architecture
  → Can be packaged and shared

PROJECT-SPECIFIC (PT-2 only):
✅ Memory files (current phase, service catalog)
✅ Chat modes (PT-2 specific role definitions)
✅ Workflows (PT-2 validation gates)
✅ Specifications (PT-2 features)
✅ Instructions (PT-2 anti-patterns)

HYBRID:
✅ Skills with project-specific references
  → frontend-design skill (portable)
  → + ADR-003 reference (PT-2 specific)
  → Result: Skill is portable, references are swappable
```

---

## Benefits & Metrics

### Quantitative Benefits

| Metric | Without Skills | With Skills | Improvement |
|--------|----------------|-------------|-------------|
| **Context Discovery Time** | 5-10 turns | 0 turns (auto) | **Instant** |
| **Initial Context Load** | 150KB (manual) | 10KB (auto) | **93% reduction** |
| **Time to Implementation** | 3-5 hours | 1.5 hours | **60% faster** |
| **Pattern Compliance** | ~60% | ~95% | **58% better** |
| **Validation Gates** | 0 (manual review) | 3 (systematic) | **Quality assured** |
| **Knowledge Portability** | 0% (project-bound) | 100% (reusable) | **Cross-project** |
| **Token Usage** | ~150K (discovery + impl) | ~60K (progressive) | **60% reduction** |
| **User Corrections** | 3-5 per task | 0-1 per task | **80% fewer** |

### Qualitative Benefits

| Aspect | Traditional | With Agentic Primitives | With Skills Integration |
|--------|-------------|------------------------|-------------------------|
| **Context Loading** | "Let me search docs..." | "Memory loaded ✅" | "Memory + Skill loaded ✅" |
| **Domain Expertise** | Agent discovers ad-hoc | Memory provides state | **Skill provides method** |
| **Validation** | Manual user review | Workflow gates | **Skill checklist + gates** |
| **Consistency** | Varies by agent | Workflow enforced | **Skill pattern enforced** |
| **Portability** | Project-specific | Project-specific | **Cross-project reuse** |
| **Onboarding** | 4 hours | 30 minutes | **15 minutes (skill auto-loads)** |

### Success Metrics

**After Phase 1 (Week 1)**:
- [ ] Session start time <10 seconds
- [ ] Frontend task auto-loads skill
- [ ] Memory + skill context = ~17KB
- [ ] Agent has complete context without manual search

**After Phase 2 (Week 2)**:
- [ ] Service creation uses service-builder skill
- [ ] implement-frontend workflow completes in <3 hours
- [ ] 3 validation gates triggered
- [ ] 95%+ pattern compliance

**After Phase 3 (Week 3)**:
- [ ] Migration workflow uses migration-manager skill
- [ ] ADR creation uses adr-writer skill
- [ ] Specifications reference skill patterns
- [ ] Memory files stay current (auto-updated)

**After Phase 4 (Week 4)**:
- [ ] Instructions defer to skills appropriately
- [ ] Complete workflow end-to-end tested
- [ ] Zero anti-pattern violations
- [ ] Documentation complete and current

---

## Appendices

### Appendix A: Skill Template

```markdown
---
name: skill-name
description: [Clear, specific description for auto-invocation matching. Use third-person. Include WHEN to use this skill.]
license: Complete terms in LICENSE.txt
---

# Skill Name

This skill guides [what it does and when to use it].

## [Project-Specific Context] (if applicable)

**IMPORTANT**: This project follows specific standards. Consult references:

- **`references/[authoritative-doc].md`** - [Purpose]
- **`references/[technical-standards].md`** - [Purpose]

**Quick Requirements**:
- ✅ [Requirement 1]
- ✅ [Requirement 2]

## [Core Section 1]: [Topic]

[Guidance, patterns, examples]

## [Core Section 2]: Workflow

### Step 1: [Phase Name]
[Guidance]

### Step 2: [Phase Name]
[Guidance]

### Step 3: [Phase Name]
[Guidance]

## Validation Checklist

Before marking complete:
- [ ] [Criterion 1]
- [ ] [Criterion 2]

## Resources Available

- **`references/[ref1].md`** - [Purpose]
- **`references/[ref2].md`** - [Purpose]
```

### Appendix B: Chat Mode with Skill

```markdown
---
role: [Role Name]
description: [Brief description]
tools_allowed: [List]
tools_forbidden: [List]
skills_loaded:
  - [skill-name]  # Auto-load for this role
context_files:
  - .claude/memory/[memory-file].md
---

# [Role Name] Chat Mode

## Automatic Context

The **[skill-name] skill** is automatically loaded for your role,
providing [what the skill provides].

## Your Responsibilities
[What this role does]

## Workflow
Follow the skill's [N]-step workflow:
1. [Step 1]
2. [Step 2]

## Validation Gate Protocol
[When and how to get approval]
```

### Appendix C: Workflow with Skill

```markdown
---
title: [Workflow Name]
chatmode_sequence:
  - [chatmode1]
  - [chatmode2]
skills_invoked:
  - [skill-name]  # Auto-loads in specific phase
validation_gates: [number]
---

# [Workflow Name]

## Phase 1: [Phase Name] ([Chatmode])
[Steps without skill]

## Phase 2: [Phase Name] ([Chatmode] + Skill)

**Skill Auto-Loaded**: [skill-name]

### Step 2.1: Skill-Guided [Action]
The [skill-name] skill provides:
- [Guidance 1]
- [Guidance 2]

### Step 2.2: [Implementation with Skill References]
Agent reads skill references as needed:
- `references/[ref1].md` for [purpose]
- `references/[ref2].md` for [purpose]

### Step 2.3: Self-Validation (From Skill Checklist)
🛑 **VALIDATION GATE**: [Gate Name]
Agent uses skill's built-in checklist

## Final Checklist
[Success criteria including skill compliance]
```

### Appendix D: Specification Referencing Skill

```markdown
---
feature_name: [Feature Name]
type: [frontend|backend|fullstack]
status: [proposed|approved|implemented]
uses_skill: [skill-name]  # Explicit reference
---

# [Feature Name] Specification

## Implementation Guidance

**Engineer**: Use [chatmode-name] chatmode
**Skill**: [skill-name] auto-loads
**Pattern**: [Pattern Name] (from skill)

### From [skill-name] Skill

The skill provides this pattern:
```
[Pattern description from skill]
```

Follow the skill's [N]-step workflow for implementation.

### Technical Requirements (Skill Will Validate)

Based on skill checklist:
- ✅ [Requirement 1]
- ✅ [Requirement 2]

See skill references for detailed patterns.
```

---

## References

### External
- [GitHub: Agentic Primitives](https://github.blog/ai-and-ml/github-copilot/how-to-build-reliable-ai-workflows-with-agentic-primitives-and-context-engineering/)
- [Claude Code Documentation](https://docs.claude.com/en/docs/claude-code/)
- [Anthropic: Skills Specification](https://docs.anthropic.com/claude-code/skills)

### Internal
- [Agentic Workflow Strategy](./agentic-workflow-strategy.md) - Original 5 primitives
- [Frontend Design Skill](../../.claude/skills/frontend-design/) - First PT-2 skill
- [Memory Architecture V2](./MEMORY_ARCHITECTURE_V2.md)
- [Memory Loading Guide](./MEMORY_LOADING_GUIDE.md)

---

## Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2025-11-21 | Initial strategy document integrating skills with agentic primitives | AI Agent + User |

---

**Status**: Proposed (Pending Approval)
**Next Steps**: Phase 1 implementation (memory files + enhanced chat modes)
**Expected Impact**: 60% faster implementation, 95%+ compliance, cross-project portability

---

**End of Document**
