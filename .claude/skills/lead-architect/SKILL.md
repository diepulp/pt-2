---
name: lead-architect
description: Design and validate PT-2 system architecture. This skill should be used for bounded context design, service decomposition, SRM updates, ADR creation, technical debt evaluation, and architecture compliance validation. Produces canonical documentation (SRM, ADR, API specs). Delegates to prd-writer skill for PRD creation and prd-pipeline skill for EXECUTION-SPEC generation.
---

# Lead Systems Architect

Design, validate, and document system architecture for PT-2.

## Quick Start

```
1. Query Memori → 2. Load existing docs → 3. Design → 4. Validate → 5. Document
```

**Pre-flight** (optional):
```bash
python .claude/skills/lead-architect/scripts/check_primitive_freshness.py
```

## When to Use This Skill

**Use this skill for:**
- Bounded context design and service decomposition
- SRM (Service Responsibility Matrix) updates
- ADR (Architecture Decision Record) creation
- Technical debt evaluation
- Architecture compliance validation
- Schema design and invariant definition

**Delegate to other skills:**
- PRD creation → Use `prd-writer` skill
- EXECUTION-SPEC generation → Use `prd-pipeline` skill
- Service implementation → Use `backend-service-builder` skill
- Route Handler implementation → Use `api-builder` skill

## Extended Thinking Triggers

Use specific phrases to allocate thinking budget:

| Phrase | Budget Level | Use Case |
|--------|--------------|----------|
| `think` | Low | Simple design, straightforward assertions |
| `think hard` | Moderate | Complex workflow, edge cases |
| `think harder` | High | Multi-step verification, architectural |
| `ultrathink` | Maximum | Critical flow design, security verification | Systems design/architecure decisions

## Core Workflow

### Step 1: Discovery

**Query existing knowledge first:**
- Check Memori for past decisions: `/arch-memory decisions`
- Locate docs via `SDLC_DOCS_TAXONOMY.md` section 7 cheatsheet
- Load SRM for affected bounded contexts
- Review SLAD §308-348 for service structure patterns
- Check `types/database.types.ts` for current schema

**Principle:** Extend what exists rather than designing from scratch.

### Step 2: Model Domain

- Sketch entities and relationships (textual ERD)
- Describe core flows (inputs → processing → outputs)
- Identify invariants ("this should remain true")
- Map to existing schema

### Step 3: Design Architecture

- Propose 1-2 options with tradeoffs
- Select recommended option with justification
- Validate against:
  - PT-2 tech stack (Next.js 16, Supabase, React 19)
  - `OVER_ENGINEERING_GUARDRAIL.md`
  - Existing patterns in SLAD

### Step 4: Validate Compliance

Run validation checklist from `references/validation-checklist.md`:
- Cross-reference affected docs (SRM, ADR, API specs)
- Check DTO compliance per `DTO_CANONICAL_STANDARD.md`
- Verify Zod schema requirements per ADR-013
- Confirm RLS implications

### Step 5: Document

Update canonical docs atomically:
- SRM - Service boundaries and ownership
- ADR - Decision records for significant tradeoffs
- API Contracts - Route definitions, payloads
- Schema Changes - Migrations with invariants

## PT-2 Constraints

### Next.js 16 Requirements

| Pattern | Requirement |
|---------|-------------|
| Dynamic params | `params: Promise<{ id: string }>` - MUST await |
| Cache revalidation | `revalidateTag(tag, 'max')` |
| Server Actions | `useActionState` returns `[state, action, pending]` |
| Cache tags | `cacheTag('tag')` (stable API) |

### Service Layer Patterns

- Functional factories, not classes
- Explicit interfaces, avoid `ReturnType` inference
- Type `supabase` as `SupabaseClient<Database>`
- Single source of truth: `types/database.types.ts`

### Migration Naming Convention (CRITICAL)

**Format:** `YYYYMMDDHHMMSS_description.sql`

```bash
# Generate timestamp for new migration:
date +%Y%m%d%H%M%S
# Example: 20251211153228

# Correct naming:
20251211153228_adr015_rls_compliance_patch.sql
20251210001858_adr015_backfill_jwt_claims.sql

# WRONG - will be rejected:
20251212000000_some_migration.sql  # Placeholder zeros
migration_name.sql                  # Missing timestamp
2025-12-11_migration.sql           # Wrong format
```

**Always** generate a real timestamp when creating migrations. Never use placeholder values like `000000`.

### Anti-Patterns (Critical)

**Migration:**
- Placeholder timestamps (`20251212000000`)
- Missing timestamp prefix
- Non-numeric timestamp formats

**Service Layer:**
- Class-based services
- `ReturnType<typeof createXService>`
- Global singletons
- `as any` casting

**DTO (per DTO_CANONICAL_STANDARD.md v2.1.0):**
- Manual `interface` for Pattern B services
- Raw `Row` type exports
- Missing `dtos.ts` in Pattern B
- `as` casting on query/RPC results

**Zod (per ADR-013):**
- Missing `schemas.ts` for HTTP services
- Inline schemas in route handlers
- `DTO` suffix for schema types (use `Input`/`Query`)

## Output Format

### Architecture Brief

```markdown
## [Feature] Architecture

### Context & Scope
[Problem statement and boundaries]

### Constraints & Assumptions
[Technical, business, regulatory]

### High-Level Design
[Description + mermaid diagram if complex]

### Alternatives Considered
[Options and why rejected]
```

### SRM Update

```markdown
## Service: [service-name]
**Domain:** [bounded context]
**Responsibility:** [what it owns]
**Owns:**
- Data: [tables]
- Business Rules: [logic]
- API Surface: [routes]
**Dependencies:** [services called]
```

### ADR

```markdown
# ADR-XXX: [Decision]

**Status:** Proposed | Accepted
**Date:** YYYY-MM-DD

## Context
[Why this decision is needed]

## Decision
[What we're choosing]

## Consequences
[Tradeoffs and implications]
```

### Implementation Plan

```markdown
## Workstreams

### Database
- [ ] Migration: `YYYYMMDDHHMMSS_description.sql`
- [ ] RLS policies
- [ ] Run `npm run db:types`

### Service Layer
- [ ] `dtos.ts` with Pick/Omit types
- [ ] `schemas.ts` with Zod (if HTTP)
- [ ] `mappers.ts` with typed input
- [ ] `selects.ts` with column sets
- [ ] `crud.ts` (no `as` casting)

### Testing
- [ ] Mapper unit tests
- [ ] RLS policy tests
- [ ] Integration tests
```

## Resources

### Skill References

| File | Purpose |
|------|---------|
| `references/QUICK_START.md` | Entry point |
| `references/architecture-rules.md` | Patterns and anti-patterns |
| `references/validation-checklist.md` | Pre/post validation |
| `references/dto-compliance.md` | DTO enforcement |
| `references/output-templates.md` | SRM, ADR, API templates |

### PT-2 Docs

| Document | Purpose |
|----------|---------|
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | Bounded contexts |
| `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` | Patterns |
| `docs/25-api-data/DTO_CANONICAL_STANDARD.md` | DTO rules (v2.1.0) |
| `docs/80-adrs/ADR-013-zod-validation-schemas.md` | Zod requirements |
| `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` | OE checks |

### Related Skills

| Skill | Use When |
|-------|----------|
| `prd-writer` | Creating or validating PRDs |
| `prd-pipeline` | Generating EXECUTION-SPECs |
| `backend-service-builder` | Implementing services |
| `api-builder` | Implementing Route Handlers |

## Definition of Done

Architecture task is complete when:

1. Problem and scope clearly stated
2. Single recommended architecture with justification
3. Core flows described (inputs → processing → outputs)
4. Ownership boundaries defined
5. Canonical docs updated atomically
6. Documentation consistency validated
7. Open questions/risks listed
8. Implementation plan actionable

## Non-Goals

This skill does NOT:
- Write implementation code (use implementation skills)
- Create PRDs (use `prd-writer` skill)
- Generate EXECUTION-SPECs (use `prd-pipeline` skill)
- Decide business priorities
