# SDLC Documentation Taxonomy (PT‑2)

This guide defines **what belongs where**, **why it exists**, and **who owns it** across your SDLC. Use it to tame doc sprawl and keep PT‑2 aligned with SRM, schema, and delivery cadence.

---

## 1) Canonical Categories

### Vision & Scope (V&S)
**What:** One‑pager with problem, goals, non‑goals, stakeholders.  
**Why:** Aligns direction; guards against scope creep.  
**Docs:** Vision Brief, Success Metrics, Out‑of‑Scope list.

### Product Requirements (PRD)
**What:** User stories, acceptance criteria, constraints, release goals.  
**Why:** Drives prioritization and testable outcomes.  
**Docs:** PRD, Release Plan, Feature Specs.

### Architecture & System Patterns (ARCH)
**What:** System diagram, bounded contexts (SRM), integration contracts, non-functionals.  
**Why:** Prevents drift; informs RLS, services, and APIs.  
**Docs:** Service Responsibility Matrix (SRM), Context Map, Service Layer Diagram, Edge Transport policy (`withServerAction` chain + headers), Service Layer Isolation & CQRS guidance (DTO-only APIs, telemetry projections), NFRs.

### Architecture Decision Records (ADR)
**What:** Immutable log of decisions with trade‑offs.  
**Why:** Traceability; avoids “why did we do this?” rework.  
**Docs:** ADR‑### with Status (Proposed/Accepted/Superseded).

### API & Data Contracts (API/DATA)
**What:** OpenAPI/Swagger, contract-first DTOs + shared zod schemas, DB schema (`database.types.ts`), events.  
**Why:** Stable interfaces for client/server and data lineage; keeps UI/tests aligned with SRM DTOs.  
**Docs:** API Surface, DTO Catalog (edge/server), Event Catalog, Schema Diffs, Migration Plan.

### Security & Access (SEC/RBAC)
**What:** RLS/RBAC matrix, secrets handling, data classification.  
**Why:** Enforces least‑privilege and compliance.  
**Docs:** RLS Rules, Role Matrix, Threat Model, Secrets Runbook.

### Delivery & Quality (DEL/QA)
**What:** Test strategy, test plans, coverage goals, CI gates.  
**Why:** Ensures done‑ness and prevents regressions.  
**Docs:** Test Plan, Quality Gates, Perf Budget, Accessibility checks.

### Operations & Reliability (OPS/SRE)
**What:** Observability spec, runbooks, SLIs/SLOs, incident process.  
**Why:** Keep prod healthy and diagnosable.  
**Docs:** O11y Spec, Dashboards, On‑call Playbooks, Incident Template.

### Change & Release (REL/CHANGE)
**What:** Versioning, release notes, rollout/rollback, feature flags.  
**Why:** Safe, reversible delivery.  
**Docs:** Release Notes, Rollout Plan, Backout Plan.

### Governance & Process (GOV)
**What:** SDLC policy, coding standards, anti‑patterns, contribution guide.  
**Why:** Consistency and maintainability.  
**Docs:** SDLC Policy, Over‑engineering Guardrails, FE Standards, Contribution Guide.

---

## 2) Taxonomy Matrix (Docs × SDLC Phases)

| Doc Group | Inception | Discovery | Design | Build | Test | Release | Operate | Evolve |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **V&S** | ✅ | ✅ | ◻️ | ◻️ | ◻️ | ◻️ | ◻️ | ✅ |
| **PRD** | ✅ | ✅ | ✅ | ◻️ | ✅ | ✅ | ◻️ | ✅ |
| **ARCH (SRM, diagrams, NFRs)** | ✅ | ✅ | ✅ | ✅ | ◻️ | ◻️ | ✅ | ✅ |
| **ADR** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **API/DATA** | ◻️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **SEC/RBAC** | ◻️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **DEL/QA** | ◻️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **OPS/SRE** | ◻️ | ◻️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **REL/CHANGE** | ◻️ | ◻️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **GOV** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Legend: ✅ primary; ◻️ optional/supporting.

---

## 3) Where Your Current Docs Fit

- **ADRs** → **ADR** (cross‑phase).  
- **System patterns** → **ARCH** + **GOV** (patterns catalog under GOV; concrete usage in SRM/diagrams under ARCH).  
- **Service layer diagram** → **ARCH**.  
- **SRM (canonical)** → **ARCH** (matrix-first contract; mirrored by schema & RLS).  
- **Edge transport & middleware contract (`withServerAction`, header policy)** → **ARCH** (policy) + **API/DATA** (DTO/zod catalog).  
- **Service layer isolation & CQRS light (DTO-only APIs, projections)** → **ARCH** (policy) with supporting ADR references; API consumers reference service DTO catalogs.
- **Front-end standards, Over-engineering guardrails** → **GOV**.  
- **`database.types.ts`, OpenAPI** → **API/DATA**.  
- **RLS/RBAC matrix** → **SEC/RBAC**.  
- **Observability spec, runbooks** → **OPS/SRE**.

---

## 4) Minimal Doc Set per Phase (Lean but Complete)

- **Inception/Discovery**: Vision Brief, PRD skeleton, Context Map, 1–2 ADRs.  
- **Design**: SRM vX, Service Layer Diagram, OpenAPI draft, RLS/RBAC matrix, Test Strategy, O11y Spec.  
- **Build**: ADRs (accepted), API contract tests, CI gates (lint/type/test/perf budgets), Runbooks (draft).  
- **Test/Release**: Test Plan & results, Release Notes, Rollout/Backout plan, Readiness checklist.  
- **Operate/Evolve**: Incident template, SLOs & dashboards, Postmortems, Deprecation policy.

---

## 5) Naming, Status, and Storage Conventions

**IDs**: `GOV-001`, `ARCH-012`, `ADR-047`, `API-005`, `SEC-010`, `QA-008`, `OPS-006`, `REL-003`.  
**Status**: `Draft → Proposed → Accepted → Superseded → Deprecated`.  
**Folders** (repo root):

```
/docs/
  00-vision/
  10-prd/
  20-architecture/        # SRM, diagrams, edge transport policy, service isolation/CQRS patterns
  25-api-data/            # openapi, dto/zod catalogs, events, schema diffs
  30-security/            # rls-rbac, threat-model
  40-quality/             # test-strategy, plans, gates
  50-ops/                 # o11y, runbooks, slo
  60-release/             # notes, rollout, backout
  70-governance/          # standards, guardrails, contribution
  80-adrs/
```

**Doc front‑matter template:**

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

## 6) Ownership Matrix (RACI‑lite)

| Doc Group | Owner | Approvers | Consulted |
|---|---|---|---|
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

## 7) “Where‑to‑put‑this?” Cheatsheet

- “Why did we choose X?” → **ADR**.  
- “How should bounded contexts talk?” → **ARCH → SRM**.  
- “What are the endpoints/contracts?” → **API/DATA**.  
- “Who can read/write this table?” → **SEC/RBAC**.  
- “What tests must pass before merge?” → **DEL/QA**.  
- “How do we debug this in prod?” → **OPS/SRE Runbooks**.  
- “How do we ship safely?” → **REL/CHANGE**.  
- “Stop over‑engineering!” → **GOV → Guardrails**.

---

## 8) Immediate Actions (1–2 hours)

1. Move existing docs into the folder layout above; add front-matter.  
2. Create a **Docs Index** (`docs/INDEX.md`) listing `id → title → status → link`.  
3. Add a weekly **Docs Review** cadence to PR template (checkbox: “Touched related docs? yes/no”).
4. Capture the **Edge Transport & Middleware** contract (Server Actions vs Route Handlers, middleware chain, required headers, DTO catalog) under `docs/20-architecture/` and link it from API/DATA docs.
