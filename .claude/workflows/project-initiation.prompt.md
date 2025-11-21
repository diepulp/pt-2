---
title: Project Initiation Workflow
description: Systematic workflow for setting up agentic infrastructure for new projects
chatmode_sequence:
  - architect      # Phase 1: Assess requirements
  - documenter     # Phase 2: Initialize memory files
  - architect      # Phase 3: Create initial specs
  - documenter     # Phase 4: Finalize documentation
validation_gates: 3
estimated_time: 3-5 hours
version: 1.0.0
last_updated: 2025-11-20
context_files:
  - docs/agentic-workflow/AI-NATIVE-IMPLEMEMTATION-AID.md
  - docs/agentic-workflow/agentic-workflow-strategy.md
---

# Project Initiation Workflow

## Overview

This workflow sets up the complete agentic infrastructure for a new project, including memory files, context files, chatmodes, and initial specifications.

**Use this workflow when:**
- Starting a new project from scratch
- Migrating an existing project to agentic workflow
- Onboarding a new development team to agentic practices

**Estimated Time**: 3-5 hours (full setup)

**Outcome**: Complete agentic infrastructure ready for development

---

## Prerequisites

Before starting this workflow:

- [ ] Project repository created
- [ ] Basic project structure exists (if migrating)
- [ ] Project requirements document available (or PRD)
- [ ] Key stakeholders identified

---

## Phase 1: Requirements Assessment (Architect Mode)

**Chatmode**: `architect.chatmode.md`
**Tools**: Read, Grep, Glob, WebSearch, sequential-thinking
**Output**: Project assessment document

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

Based on project assessment, determine:

**Memory Files Required:**
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

**Chatmodes Required:**
```
Essential:
- .github/chatmodes/architect.chatmode.md     # Design decisions
- .github/chatmodes/reviewer.chatmode.md      # Quality assurance
- .github/chatmodes/documenter.chatmode.md    # Documentation

Project-specific:
- .github/chatmodes/backend-dev.chatmode.md   # Backend work
- .github/chatmodes/frontend-dev.chatmode.md  # Frontend work
- .github/chatmodes/service-engineer.chatmode.md  # Service layer
- .github/chatmodes/devops.chatmode.md        # Infrastructure (optional)
- .github/chatmodes/security.chatmode.md      # Security review (optional)
```

**Workflows Required:**
```
Essential:
- .claude/workflows/session-handoff.prompt.md   # Session continuity
- .claude/workflows/phase-completion.prompt.md  # Phase signoffs

Project-specific:
- .claude/workflows/create-service.prompt.md    # For service-oriented
- .claude/workflows/create-adr.prompt.md        # For architecture decisions
- .claude/workflows/write-migration.prompt.md   # For database projects
- .claude/workflows/deploy.prompt.md            # For deployment automation
```

**Context Files Required:**
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

## Agentic Infrastructure Plan

### Memory Files to Create (Priority)
1. ✅ project.memory.md (ESSENTIAL)
2. ✅ anti-patterns.memory.md (ESSENTIAL)
3. ✅ phase-status.memory.md (ESSENTIAL)
4. [ ] architecture-decisions.memory.md
5. [ ] service-catalog.memory.md
6. [ ] domain-glossary.memory.md

### Chatmodes to Create (Priority)
1. ✅ architect.chatmode.md (ESSENTIAL)
2. ✅ documenter.chatmode.md (ESSENTIAL)
3. ✅ reviewer.chatmode.md (ESSENTIAL)
4. [ ] backend-dev.chatmode.md
5. [ ] frontend-dev.chatmode.md
6. [ ] service-engineer.chatmode.md

### Workflows to Create (Priority)
1. ✅ session-handoff.prompt.md (ESSENTIAL)
2. ✅ phase-completion.prompt.md (ESSENTIAL)
3. [ ] create-service.prompt.md
4. [ ] create-adr.prompt.md
5. [ ] write-migration.prompt.md

### Context Files to Create (Priority)
1. ✅ architecture.context.md (ESSENTIAL)
2. ✅ governance.context.md (ESSENTIAL)
3. [ ] api-security.context.md
4. [ ] db.context.md
5. [ ] quality.context.md

## Estimated Effort

- Phase 2 (Memory initialization): 1-2 hours
- Phase 3 (Chatmode/workflow creation): 2-3 hours
- Phase 4 (Context documentation): 1-2 hours

**Total**: 4-7 hours
```

### Step 1.4: VALIDATION GATE 1 - Assessment Review

🛑 **STOP: Present assessment to user**

```
🛑 VALIDATION GATE 1: Project Assessment Review

**Project**: {Name}
**Type**: {Type}
**Tech Stack**: {Stack}

**Agentic Infrastructure Plan**:

Memory Files: {N} files
  Essential: 3 (project, anti-patterns, phase-status)
  Optional: {N} additional

Chatmodes: {N} chatmodes
  Essential: 3 (architect, documenter, reviewer)
  Optional: {N} additional

Workflows: {N} workflows
  Essential: 2 (session-handoff, phase-completion)
  Optional: {N} additional

Context Files: {N} files
  Essential: 2 (architecture, governance)
  Optional: {N} additional

**Estimated Effort**: 4-7 hours

**Next Steps**:
  - Create memory files (documenter)
  - Create chatmodes and workflows (architect)
  - Initialize context documentation (documenter)

Do you approve this plan? (Reply "approved" to proceed)
```

---

## Phase 2: Memory File Initialization (Documenter Mode)

**Chatmode**: `documenter.chatmode.md`
**Tools**: Read, Write, Edit
**Input**: Project assessment from Phase 1
**Output**: Initialized memory files

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

## Phase 3: Chatmodes & Workflows Creation (Architect Mode)

**Chatmode**: `architect.chatmode.md`
**Tools**: Read, Write
**Input**: Project assessment
**Output**: Chatmode files, workflow files

### Step 3.1: Create Essential Chatmodes

**Required for all projects:**

1. **architect.chatmode.md** (if doesn't exist)
   - Copy from reference implementation (PT-2 or template)
   - Customize tool restrictions
   - Customize context files

2. **documenter.chatmode.md** (if doesn't exist)
   - Copy from reference implementation
   - Customize for project structure

3. **reviewer.chatmode.md** (if doesn't exist)
   - Copy from reference implementation
   - Customize review checklist for project standards

### Step 3.2: Create Project-Specific Chatmodes

**Based on project type:**

**Backend-focused projects:**
- `backend-dev.chatmode.md` or `service-engineer.chatmode.md`
- Configure for backend directory structure
- Add database-specific tools

**Frontend-focused projects:**
- `frontend-dev.chatmode.md`
- Configure for component directory structure
- Add UI library tools (shadcn, etc.)

**Full-stack projects:**
- Both backend and frontend chatmodes

### Step 3.3: Create Essential Workflows

**Required for all projects:**

1. **session-handoff.prompt.md**
   - Automates session continuity
   - Updates memory files
   - Captures technical notes

2. **phase-completion.prompt.md**
   - Checklist-based signoffs
   - Quality gate verification
   - Handoff to next phase

### Step 3.4: Create Project-Specific Workflows

**Based on project needs:**

**Service-oriented:**
- `create-service.prompt.md` (4-phase workflow with validation gates)

**Architecture-heavy:**
- `create-adr.prompt.md` (structured ADR creation)

**Database-driven:**
- `write-migration.prompt.md` (migration workflow with type regeneration)

**Deployment needs:**
- `deploy.prompt.md` (deployment workflow with rollback plan)

### Step 3.5: VALIDATION GATE 3 - Infrastructure Review

🛑 **STOP: Present complete infrastructure**

```
🛑 VALIDATION GATE 3: Agentic Infrastructure Complete

**Chatmodes Created** ({N} total):
  ✅ architect.chatmode.md
  ✅ documenter.chatmode.md
  ✅ reviewer.chatmode.md
  [List optional chatmodes]

**Workflows Created** ({N} total):
  ✅ session-handoff.prompt.md
  ✅ phase-completion.prompt.md
  [List optional workflows]

**Directory Structure**:
  ✅ .github/chatmodes/
  ✅ .claude/workflows/
  ✅ .claude/specs/
  ✅ memory/
  ✅ context/ (to be populated)

**Next Steps**:
  - Initialize context documentation (documenter)
  - Create initial project specifications (architect)
  - Begin Phase 1 development

Infrastructure complete? (Reply "finalize" to proceed)
```

---

## Phase 4: Context Documentation & Finalization (Documenter Mode)

**Chatmode**: `documenter.chatmode.md`
**Tools**: Read, Write, Edit
**Output**: Context files, .claude/CLAUDE.md updated

### Step 4.1: Create Essential Context Files

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

### Step 4.2: Create Optional Context Files (Based on Plan)

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

### Step 4.3: Update .claude/CLAUDE.md

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

### Step 4.4: Create Developer Onboarding Guide

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

### Step 4.5: Final Summary

```
✅ PROJECT INITIATION COMPLETE

**Agentic Infrastructure Created**:

Memory Files: {N} files
  - project.memory.md
  - anti-patterns.memory.md
  - phase-status.memory.md
  [List additional files]

Chatmodes: {N} chatmodes
  - architect.chatmode.md
  - documenter.chatmode.md
  - reviewer.chatmode.md
  [List additional chatmodes]

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

**Total Setup Time**: {X} hours

**Next Steps**:
  1. Review all created files
  2. Customize templates for project needs
  3. Create initial project specifications (architect)
  4. Begin Phase 1 development
  5. Use session-handoff workflow for session continuity

**Agentic Workflow Status**: ✅ READY FOR DEVELOPMENT
```

---

## Final Checklist

Before marking project initiation complete:

### Memory Infrastructure
- [ ] Essential memory files created (3 minimum)
- [ ] Optional memory files created (based on project)
- [ ] Memory files properly formatted
- [ ] Cross-references to detailed docs included

### Chatmode Infrastructure
- [ ] Essential chatmodes created (3 minimum)
- [ ] Project-specific chatmodes created
- [ ] Tool restrictions configured
- [ ] Context files properly referenced

### Workflow Infrastructure
- [ ] Essential workflows created (2 minimum)
- [ ] Project-specific workflows created
- [ ] Validation gates defined
- [ ] Chatmode sequences specified

### Context Documentation
- [ ] Essential context files created (2 minimum)
- [ ] Project-specific context files created
- [ ] Links to full documentation included
- [ ] Standards and patterns documented

### Configuration
- [ ] .claude/CLAUDE.md updated with auto-load
- [ ] .claude/specs/ directory created
- [ ] docs/ONBOARDING.md created
- [ ] Developer guide comprehensive

### Quality Assurance
- [ ] All memory files under 500 lines
- [ ] Consistent formatting throughout
- [ ] No broken links
- [ ] Clear cross-references

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
| 1.0.0   | 2025-11-20 | Initial project initiation workflow |

---

**Workflow Status**: Production Ready
**Last Updated**: 2025-11-20
**Maintained By**: Agentic Workflow Framework
