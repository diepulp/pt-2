---
name: prd-writer
description: Create PRDs following PRD-STD-001 standard for PT-2 project. This skill should be used when users ask to write a PRD, create product requirements, document a new feature, or plan a new release. It produces bounded, shippable PRDs with proper YAML frontmatter, Definition of Done checklists, and cross-references to SDLC taxonomy categories. Delegates to lead-architect skill for PRD creation as part of architectural workflows.
---

# PRD Writer Skill

Create Product Requirements Documents (PRDs) that are small, concrete, and shippable following the PRD-STD-001 standard.

## Core Principle

A PRD describes a *specific, bounded slice* of the product:
- The **problem** it solves
- **Who** it is for
- **What** must exist for it to be called "done"
- **How we will know** it worked (success criteria)

A PRD is an **alignment artifact**, not a dumping ground for every detail.

---

## Quick Start Workflow

### 1. Scope Assessment

Before writing, validate scope is appropriate for a single PRD:

**Valid PRD scopes:**
- One release (MVP Pilot, v1.1, v2)
- One bounded problem area (e.g., "Player Intake + Eligibility Checks")
- One cohesive phase cutting across contexts (if shippable as a unit)

**Invalid scopes (split into multiple PRDs):**
- The entire product across many phases
- Every bounded context at once
- Multi-year roadmaps

### 2. PRD ID Convention

Use pattern: `PRD-XXX-description` where:
- `XXX` is sequential number (000, 001, 002...)
- `description` is short kebab-case name

Examples: `PRD-001-mvp-table-rating`, `PRD-002-loyalty-rewards`

### 3. Required YAML Frontmatter

```yaml
---
id: PRD-XXX
title: [Human-readable title]
owner: [Product | Lead Architect | Engineering]
status: Draft | Proposed | Accepted | Superseded
affects: [ARCH-XXX, ADR-XXX, SEC-XXX, ...]
created: YYYY-MM-DD
last_review: YYYY-MM-DD
phase: [Phase N (Name)]
pattern: [A | B | C]  # Optional: Service pattern per SRM
http_boundary: [true | false]  # Optional: Has API routes
---
```

### 4. Required Sections (9 sections)

Every PRD MUST contain these sections in order:

| # | Section | Purpose |
|---|---------|---------|
| 1 | Overview | Name, owner, status, 3-5 sentence summary |
| 2 | Problem & Goals | Problem statement, 3-5 goals, explicit non-goals |
| 3 | Users & Use Cases | Primary users, 2-4 jobs per user |
| 4 | Scope & Feature List | 5-15 testable bullets |
| 5 | Requirements | Functional + non-functional requirements |
| 6 | UX / Flow Overview | 3-7 bullet flows, not UI specs |
| 7 | Dependencies & Risks | Prerequisites and open questions |
| 8 | Definition of Done | 5-12 binary checkboxes |
| 9 | Related Documents | Links to ARCH, API, SEC, QA docs |

**For detailed section guidance, read:** `references/prd-standard.md`

---

## Definition of Done (DoD) Categories

Every DoD section MUST cover these categories:

```markdown
## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] All must-have user stories work end-to-end
- [ ] Critical edge cases handled or documented as backlog

**Data & Integrity**
- [ ] Data remains consistent across realistic usage
- [ ] No orphaned or stuck records for key flows

**Security & Access**
- [ ] Minimal role/permission model enforced
- [ ] No known privilege escalation paths

**Testing**
- [ ] At least one unit/integration test per critical service
- [ ] At least one happy-path E2E test for main journey

**Operational Readiness**
- [ ] Key logs/metrics exist for debugging
- [ ] Simple rollback or mitigation path defined

**Documentation**
- [ ] User-facing snippets or runbooks updated
- [ ] Known limitations documented
```

---

## SDLC Taxonomy Cross-References

PRDs link to (not duplicate) other document categories:

| Category | What to Reference | Location |
|----------|-------------------|----------|
| **V&S** | Vision, product strategy | `docs/00-vision/` |
| **ARCH** | SRM, service diagrams, bounded contexts | `docs/20-architecture/` |
| **API/DATA** | OpenAPI specs, DTOs, schema | `docs/25-api-data/` |
| **SEC/RBAC** | RLS policies, role matrix | `docs/30-security/` |
| **DEL/QA** | Test strategy, quality gates | `docs/40-quality/` |
| **OPS/SRE** | Observability, runbooks | `docs/50-ops/` |
| **ADR** | Architecture decisions | `docs/80-adrs/` |
| **GOV** | Standards, guardrails | `docs/70-governance/` |

**For full taxonomy details, read:** `references/sdlc-taxonomy.md`

---

## Anti-Patterns to Avoid

### "Everything PRD"
- **Smell:** Scope reads like the whole system
- **Fix:** Limit to one release/phase; mark others as "future PRD"

### Architecture Spec in PRD
- **Smell:** Service layout, folder structure, class diagrams
- **Fix:** Move to ARCH docs, leave 2-3 bullets + link

### QA Standard in PRD
- **Smell:** Coverage numbers, test tool configs, full test pyramid
- **Fix:** Keep QA in `docs/40-quality/`; DoD has minimal testing bullets

### Vague Goals
- **Smell:** "better UX", "more consistent"
- **Fix:** Every goal must be observable and binary testable

---

## Appendix Best Practices

Appendices are optional but valuable for:
- **Schema Reference** - SQL snippets (verified against `database.types.ts`)
- **Implementation Plan** - Workstreams (WS1, WS2...) with code scaffolds
- **Error Codes** - Domain error taxonomy
- **Version History** - Change log

Example appendix structure:
```markdown
---

## Appendix A: Schema Reference
[SQL snippets]

## Appendix B: Implementation Plan
[Workstreams WS1-WS5]

## Appendix C: Version History
| Version | Date | Author | Changes |
```

---

## Reference Files

For comprehensive guidance beyond this quick-start:

| Reference | Content | When to Read |
|-----------|---------|--------------|
| `references/prd-standard.md` | Full PRD-STD-001 standard | Writing new PRD |
| `references/prd-template.md` | Copy-paste template | Starting from scratch |
| `references/sdlc-taxonomy.md` | Full SDLC doc categories | Cross-referencing docs |
| `references/validation-checklist.md` | Pre-review checklist | Before submission |

---

## Usage Examples

### Example 1: New Service PRD

```markdown
---
id: PRD-010
title: Session Analytics Service
owner: Product
status: Draft
affects: [ARCH-SRM, PRD-003, SEC-001]
created: 2025-12-11
phase: Phase 4 (Analytics)
pattern: B
http_boundary: true
---

# PRD-010 — Session Analytics Service

## 1. Overview
- **Owner:** Product
- **Status:** Draft
- **Summary:** SessionAnalyticsService provides aggregated metrics...
```

### Example 2: Feature Enhancement PRD

```markdown
---
id: PRD-011
title: Player Tagging System
owner: Product
status: Draft
affects: [PRD-003, ARCH-SRM]
created: 2025-12-11
phase: Phase 2 (Player Features)
---

# PRD-011 — Player Tagging System

## 1. Overview
- **Owner:** Product
- **Status:** Draft
- **Summary:** Add tagging capability to player profiles...
```
