---
id: ADR-023
title: Multi-Tenancy Storage Model Selection (Pool Primary, Silo Escape Hatch)
status: Accepted
date: 2025-12-24
implementation_date: 2025-12-24
owner: Security/Platform
applies_to:
  - Tenancy model
  - Supabase project boundaries
  - RLS policies + RPC governance
  - Deployment + operations
decision_type: Architecture + Security
supersedes: null
related:
  - ADR-015
  - ADR-018
  - ADR-020
  - ADR-021
  - SEC-001
  - SEC-002
  - SEC-003
  - SEC-005
  - SEC-006
---

# ADR-023: Multi-Tenancy Storage Model Selection (Pool Primary, Silo Escape Hatch)

**Status:** Accepted  
**Date:** 2025-12-24  
**Implementation Date:** 2025-12-24  
**Owner:** Security/Platform  
**Applies to:** Tenancy model, Supabase project boundaries, RLS policies + RPC governance, deployment operations  
**Decision type:** Architecture + Security  
**Supersedes:** None  
**Related:** ADR-015, ADR-018, ADR-020, ADR-021, SEC-001, SEC-002, SEC-003, SEC-005, SEC-006  

---

## Context

PT is being developed without an explicitly declared multi-tenant storage model, despite behaving as a multi-tenant system via `casino_id` scoping and RLS.

AWS frames three common SaaS storage models:

- **Silo** — dedicated datastore per tenant (strong isolation, higher ops cost)
- **Bridge** — separate tenant representations (e.g., per-tenant schema) on shared infrastructure
- **Pool** — shared schema/tables; tenant isolation via discriminator keys (e.g., `casino_id`)

PT currently implements a **hybrid RLS model** with **JWT claims + per-request session context** (transaction pooling compatible), plus governance for `SECURITY DEFINER` RPCs and idempotent mutations. These controls were adopted explicitly to make pooled storage safe and operable.

At the same time, casino industry dynamics and regulatory expectations tend to emphasize:

- demonstrable **segregation** (who can see what, and why)
- auditable **access control** and **non-repudiation** (logs/ledger integrity)
- support for **inspection / export** of a casino’s records without exposing other casinos

This ADR formalizes the tenancy model selection while minimizing refactor blast radius and preserving a credible compliance posture.

---

## Decision

PT will adopt:

1. **Pool as the primary / default multi-tenant model**  
   - Single Supabase project (by environment: dev/stage/prod)  
   - Shared schema and tables  
   - Isolation enforced by: `casino_id` + RLS (hybrid session context + JWT fallback), plus RPC governance

2. **Silo as an explicit “escape hatch” deployment option** (per-casino dedicated project)  
   - Separate Supabase project per casino (or per regulated customer boundary)  
   - Same schema, same codebase, same RLS (defense in depth)  
   - Offered when required by customer risk posture, jurisdiction, procurement, or audit comfort

3. **Bridge is deferred**  
   - Not selected for baseline due to additional operational complexity without materially reducing the strongest Pool risks (policy correctness and RPC bypass risk)
   - May be revisited if a future platform requirement arises (e.g., partial isolation, per-tenant schema migrations, or regionalization without full project split)

---

## Rationale

### Why Pool (now)

Pool is already the implemented reality:

- Data model is casino-scoped (`casino_id` is foundational across domains)
- Security posture assumes pooled resources:
  - hybrid RLS designed for transaction pooling
  - explicit `SECURITY DEFINER` guardrails
  - role taxonomy + RBAC matrices that assume many tenants share one surface area
  - idempotency standardization to prevent duplicate effects at scale

Switching baseline to Silo or Bridge would not materially improve correctness if the existing Pool controls are weak — it would mostly shift risk into operations. The fastest path to a defensible system is to keep Pool and harden it systematically.

### Why the Silo escape hatch (at all)

Even if a regulator does not explicitly ban pooling, **audit comfort** and **procurement friction** can force isolation. A “Silo option” gives PT a credible answer to:

- “We want dedicated infrastructure”
- “We require tenant-level inspection without any theoretical co-tenant exposure”
- “We need a clear blast-radius boundary for incident response”

Because PT is already casino-scoped, the silo option is primarily an **ops/provisioning** problem, not a schema rewrite.

### Why Bridge is not the default

Bridge can reduce co-tenant “accidental selection” risk (e.g., schema-per-tenant), but:

- it adds migration orchestration complexity
- it complicates tooling, analytics, and cross-cutting observability
- it does not eliminate the need for robust authz/RLS/RPC discipline (mistakes still happen)
- it can create a false sense of safety while leaving the real sharp edges (SECURITY DEFINER, service keys, operational bypass paths)

Given current PT maturity, Bridge is a “pay now, maybe benefit later” choice.

---

## Consequences

### Positive

- Minimal refactor blast radius: formalizes the model already implemented
- Preserves existing security investments (hybrid RLS, RPC governance, idempotency)
- Clear growth path: start pooled, add silo for high-risk customers
- Easier to explain to auditors:
  - default controls: RLS + JWT/session context + immutable-ish ledgers
  - option controls: dedicated project boundary

### Negative / Risks

**Pool risks (primary):**
- Any RLS regression or missing `casino_id` filter is a potential cross-tenant exposure.
- SECURITY DEFINER can bypass RLS entirely if misused.

**Silo risks (secondary):**
- Provisioning, migrations, backups, and observability become N× more complex.
- Cost increases (projects/environments) and support overhead.

---

## Guardrails (Non-Negotiables)

These are required to make Pool defensible and to keep Silo viable without a rewrite:

1. **Casino-scoped ownership everywhere**
   - Every row that is tenant-owned must carry `casino_id`
   - Cross-casino joins are forbidden outside explicit admin/ops tooling

2. **Hybrid RLS is mandatory**
   - Policies must scope by `casino_id` using session context with JWT fallback
   - No runtime “service key” bypass in application code paths

3. **SECURITY DEFINER governance**
   - RPCs must not trust `p_casino_id` (derive from context/JWT; validate if accepted)
   - Every SECURITY DEFINER function must include explicit casino scope checks

4. **Append-only ledger expectations (where applicable)**
   - Updates/deletes are restricted; adjustments are new rows with reasons
   - Idempotency is enforced by standard header + uniqueness/index constraints

---

## Implementation Notes

### Pool (default)

- Keep the current shared schema model.
- Ensure every service uses the standardized auth context pattern.
- Add/maintain automated checks:
  - policy coverage for all tenant-owned tables
  - “no missing casino_id” linting for queries (where feasible)
  - RPC inventory + security review (SECURITY DEFINER scanning)

### Silo (escape hatch)

Operational contract:

- **One Supabase project per casino** (per environment)
- Migrations apply identically (same SRM-aligned schema)
- A single codebase deploys per casino configuration:
  - project URL/keys (or runtime config) point to that casino’s dedicated backend
- Incident response & audit exports become straightforward:
  - “this casino’s system” is a hard infrastructure boundary

Minimal product requirement:

- PT must avoid hidden cross-casino assumptions (e.g., “global reporting” inside prod runtime)
- Admin tooling, if ever needed, must be an explicit separate surface (not “oops, same API”)

---

## Alternatives Considered

### A) Silo as the default

**Pros:** strongest isolation story, easiest “inspect without co-tenant concern” posture  
**Cons:** high ops burden early, slows iteration, multiplies migration/backup/monitoring work  

Rejected as default due to implementation and operational blast radius, given Pool is already implemented.

### B) Bridge as the default (schema-per-tenant or similar)

**Pros:** more separation than Pool, less than Silo  
**Cons:** complexity tax with unclear immediate benefit; does not remove the need for strong authz discipline  

Deferred.

### C) Pure Pool with no Silo option

**Pros:** simplest ops in early lifecycle  
**Cons:** creates a hard ceiling for regulated/procurement-driven customers; forces later emergency re-architecture  

Rejected.

---

## Acceptance Criteria

- [x] The tenancy model is explicitly documented and referenced by security governance docs (this ADR, SEC-002)
- [x] Pool controls implemented and validated (ADR-015, ADR-018, ADR-021, SEC-006)
- [ ] A "silo provisioning playbook" exists (FUTURE: OPS-002)
- [x] SECURITY DEFINER pre-commit hook enforcement (ADR-018)
- [ ] Policy coverage CI gate for tenant-owned tables (FUTURE: extend pre-commit)
- [ ] A tenant audit/export procedure exists (FUTURE: OPS-003)

---

## References

- ADR-015 — RLS Connection Pooling Strategy
- ADR-018 — SECURITY DEFINER Function Governance
- ADR-020 — MVP RLS Strategy (Track A Hybrid)
- ADR-021 — Idempotency Header Standardization
- SEC-001 — RLS Policy Matrix
- SEC-002 — Casino-Scoped Security Model
- SEC-003 — RBAC Matrix
- SEC-005 — Role Taxonomy
- SEC-006 — RLS Strategy Audit
- [AWS Whitepaper: *Multi-tenant SaaS Storage Strategies* (Silo / Bridge / Pool)](https://docs.aws.amazon.com/whitepapers/latest/multi-tenant-saas-storage-strategies/finding-the-right-fit.html)
