# SDLC Documentation Taxonomy (PT-2)

This guide defines **what belongs where**, **why it exists**, and **who owns it** across the SDLC. Use it to tame doc sprawl and keep PRDs properly cross-referenced.

---

## 1. Canonical Categories

### Vision & Scope (V&S)
**What:** One-pager with problem, goals, non-goals, stakeholders.
**Why:** Aligns direction; guards against scope creep.
**Docs:** Vision Brief, Success Metrics, Out-of-Scope list.
**Location:** `docs/00-vision/`

### Product Requirements (PRD)
**What:** User stories, acceptance criteria, constraints, release goals.
**Why:** Drives prioritization and testable outcomes.
**Docs:** PRD, Release Plan, Feature Specs.
**Location:** `docs/10-prd/`

### Architecture & System Patterns (ARCH)
**What:** System diagram, bounded contexts (SRM), integration contracts, non-functionals.
**Why:** Prevents drift; informs RLS, services, and APIs.
**Docs:** Service Responsibility Matrix (SRM), Context Map, Service Layer Diagram, Edge Transport policy, Service Layer Isolation & CQRS guidance, NFRs.
**Location:** `docs/20-architecture/`

### Architecture Decision Records (ADR)
**What:** Immutable log of decisions with trade-offs.
**Why:** Traceability; avoids "why did we do this?" rework.
**Docs:** ADR-### with Status (Proposed/Accepted/Superseded).
**Location:** `docs/80-adrs/`

### API & Data Contracts (API/DATA)
**What:** OpenAPI/Swagger, contract-first DTOs + shared zod schemas, DB schema (`database.types.ts`), events.
**Why:** Stable interfaces for client/server and data lineage; keeps UI/tests aligned with SRM DTOs.
**Docs:** API Surface, DTO Catalog (edge/server), Event Catalog, Schema Diffs, Migration Plan.
**Location:** `docs/25-api-data/`

### Security & Access (SEC/RBAC)
**What:** RLS/RBAC matrix, secrets handling, data classification.
**Why:** Enforces least-privilege and compliance.
**Docs:** RLS Rules, Role Matrix, Threat Model, Secrets Runbook.
**Location:** `docs/30-security/`

### Delivery & Quality (DEL/QA)
**What:** Test strategy, test plans, coverage goals, CI gates.
**Why:** Ensures done-ness and prevents regressions.
**Docs:** Test Plan, Quality Gates, Perf Budget, Accessibility checks.
**Location:** `docs/40-quality/`

### Operations & Reliability (OPS/SRE)
**What:** Observability spec, runbooks, SLIs/SLOs, incident process.
**Why:** Keep prod healthy and diagnosable.
**Docs:** O11y Spec, Dashboards, On-call Playbooks, Incident Template.
**Location:** `docs/50-ops/`

### Change & Release (REL/CHANGE)
**What:** Versioning, release notes, rollout/rollback, feature flags.
**Why:** Safe, reversible delivery.
**Docs:** Release Notes, Rollout Plan, Backout Plan.
**Location:** `docs/60-release/`

### Governance & Process (GOV)
**What:** SDLC policy, coding standards, anti-patterns, contribution guide.
**Why:** Consistency and maintainability.
**Docs:** SDLC Policy, Over-engineering Guardrails, FE Standards, Contribution Guide.
**Location:** `docs/70-governance/`

---

## 2. Taxonomy Matrix (Docs x SDLC Phases)

| Doc Group | Inception | Discovery | Design | Build | Test | Release | Operate | Evolve |
|-----------|:---------:|:---------:|:------:|:-----:|:----:|:-------:|:-------:|:------:|
| **V&S** | X | X | . | . | . | . | . | X |
| **PRD** | X | X | X | . | X | X | . | X |
| **ARCH** | X | X | X | X | . | . | X | X |
| **ADR** | X | X | X | X | X | X | X | X |
| **API/DATA** | . | X | X | X | X | X | X | X |
| **SEC/RBAC** | . | X | X | X | X | X | X | X |
| **DEL/QA** | . | X | X | X | X | X | X | X |
| **OPS/SRE** | . | . | X | X | X | X | X | X |
| **REL/CHANGE** | . | . | X | X | X | X | X | X |
| **GOV** | X | X | X | X | X | X | X | X |

Legend: **X** = primary; **.** = optional/supporting.

---

## 3. Where Your Docs Fit

| Document Type | Category | Location |
|--------------|----------|----------|
| ADRs | ADR | `docs/80-adrs/` |
| System patterns | ARCH + GOV | `docs/20-architecture/` + `docs/70-governance/` |
| Service layer diagram | ARCH | `docs/20-architecture/` |
| SRM (canonical) | ARCH | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` |
| Edge transport & middleware | ARCH + API/DATA | `docs/20-architecture/` + `docs/25-api-data/` |
| Service layer isolation & CQRS | ARCH | `docs/20-architecture/` |
| Front-end standards | GOV | `docs/70-governance/` |
| Over-engineering guardrails | GOV | `docs/70-governance/` |
| `database.types.ts`, OpenAPI | API/DATA | `docs/25-api-data/` + `types/` |
| RLS/RBAC matrix | SEC/RBAC | `docs/30-security/` |
| Observability spec, runbooks | OPS/SRE | `docs/50-ops/` |

---

## 4. Minimal Doc Set per Phase

| Phase | Required Documents |
|-------|-------------------|
| **Inception/Discovery** | Vision Brief, PRD skeleton, Context Map, 1-2 ADRs |
| **Design** | SRM vX, Service Layer Diagram, OpenAPI draft, RLS/RBAC matrix, Test Strategy, O11y Spec |
| **Build** | ADRs (accepted), API contract tests, CI gates, Runbooks (draft) |
| **Test/Release** | Test Plan & results, Release Notes, Rollout/Backout plan, Readiness checklist |
| **Operate/Evolve** | Incident template, SLOs & dashboards, Postmortems, Deprecation policy |

---

## 5. Naming, Status, and Storage Conventions

### Document IDs

| Category | ID Pattern | Examples |
|----------|-----------|----------|
| Governance | GOV-XXX | GOV-001, GOV-002 |
| Architecture | ARCH-XXX | ARCH-012, ARCH-SRM |
| ADR | ADR-XXX | ADR-015, ADR-017 |
| API/Data | API-XXX | API-005, API-DTO-001 |
| Security | SEC-XXX | SEC-001, SEC-003 |
| Quality | QA-XXX | QA-001, QA-008 |
| Operations | OPS-XXX | OPS-006 |
| Release | REL-XXX | REL-003 |
| PRD | PRD-XXX | PRD-000, PRD-003 |

### Status Values

```
Draft -> Proposed -> Accepted -> Superseded -> Deprecated
```

### Folder Structure

```
/docs/
  00-vision/           # V&S
  10-prd/              # PRD
  20-architecture/     # ARCH (SRM, diagrams, edge transport, service isolation)
  25-api-data/         # API/DATA (openapi, dto catalogs, events, schema diffs)
  30-security/         # SEC/RBAC (rls-rbac, threat-model)
  40-quality/          # DEL/QA (test-strategy, plans, gates)
  50-ops/              # OPS/SRE (o11y, runbooks, slo)
  60-release/          # REL/CHANGE (notes, rollout, backout)
  70-governance/       # GOV (standards, guardrails, contribution)
  80-adrs/             # ADR
```

### Document Front-matter Template

```yaml
---
id: ARCH-012
title: Service Layer Diagram (v2)
owner: Architecture
status: Accepted
affects: [API-003, SEC-004, ADR-029]
last_review: 2025-11-15
---
```

---

## 6. Ownership Matrix (RACI-lite)

| Doc Group | Owner | Approvers | Consulted |
|-----------|-------|-----------|-----------|
| V&S, PRD | Product | Eng Lead | Architecture, QA |
| ARCH, SRM | Architecture | Eng Lead | Security, Product |
| ADR | Authoring team | Architecture | Affected teams |
| API/DATA | Backend Lead | Architecture | Frontend, QA |
| SEC/RBAC | Security | Architecture | Backend |
| DEL/QA | QA Lead | Eng Lead | All teams |
| OPS/SRE | SRE/Platform | Eng Lead | Backend |
| REL/CHANGE | Release Mgr | Eng Lead | Product, QA |
| GOV | Eng Lead | Architecture | All teams |

---

## 7. "Where-to-put-this?" Cheatsheet

| Question | Answer |
|----------|--------|
| "Why did we choose X?" | ADR |
| "How should bounded contexts talk?" | ARCH -> SRM |
| "What are the endpoints/contracts?" | API/DATA |
| "Who can read/write this table?" | SEC/RBAC |
| "What tests must pass before merge?" | DEL/QA |
| "How do we debug this in prod?" | OPS/SRE Runbooks |
| "How do we ship safely?" | REL/CHANGE |
| "Stop over-engineering!" | GOV -> Guardrails |
| "What features are in this release?" | PRD |

---

## 8. PRD Cross-Reference Best Practices

When writing a PRD, use these patterns to cross-reference other docs:

### In Requirements Section

```markdown
> Architecture details: See SRM v4.2, SLAD v2.1.2, MVP-ROADMAP Section 1.2
```

### In Related Documents Section

```markdown
## 9. Related Documents
- **Vision / Strategy**: [VIS-001-VISION-AND-SCOPE.md](../00-vision/VIS-001-VISION-AND-SCOPE.md)
- **Architecture / SRM**: [SERVICE_RESPONSIBILITY_MATRIX.md](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- **Schema / Types**: `types/database.types.ts`
- **Security / RLS**: [SEC-001-rls-policy-matrix.md](../30-security/SEC-001-rls-policy-matrix.md)
- **QA / Test Plan**: [QA-001-service-testing-strategy.md](../40-quality/QA-001-service-testing-strategy.md)
```

### In Affects Field (Frontmatter)

```yaml
affects: [ARCH-SRM, PRD-003, SEC-001, ADR-015]
```

---

## 9. Document Index Location

The main documentation index lives at `docs/INDEX.md` and should list all documents with their ID, title, status, and path.
