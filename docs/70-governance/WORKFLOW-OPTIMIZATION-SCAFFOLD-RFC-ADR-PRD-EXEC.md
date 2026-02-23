---
title: Workflow Optimization — Feature Scaffold → Design Brief → ADR → PRD → Exec Spec
project: PT-2 Casino Player Tracker
doc_type: process_playbook
version: 1.0.0
date: 2026-02-22
status: ready_to_adopt
---

# Feature Scaffold Template (paste this first, every time)

> Purpose: a **tiny, disposable** primitive to prevent “rewrite the universe” spirals and avoid PRDs that rot when a single decision changes.
>
> Timebox: 30–60 minutes. If it’s longer, you’re already drifting into a design doc.

## FEATURE-SCAFFOLD

**Feature name:**  
**Owner / driver:**  
**Stakeholders (reviewers):**  
**Status:** Draft | In review | Decided | Superseded  
**Last updated:** YYYY-MM-DD

### 1) Intent (what outcome changes?)
- **User story:**  
- **Success looks like:** (observable outcome)

### 2) Constraints (hard walls)
- Security / tenancy constraints (RLS, tenant scope, actor identity, audit)
- Domain constraints (casino-scoped uniqueness, idempotency, conflict rules)
- Operational constraints (performance targets, retryability, tooling limits)
- Regulatory/compliance constraints (if any)

### 3) Non-goals (what we refuse to do in this iteration)
- …
- …

### 4) Inputs / Outputs (thin interface, not design)
- **Inputs:** (what comes in, e.g., “CSV rows”, “vendor export”, “operator mapping”)
- **Outputs:** (what changes in system, e.g., “players seeded”, “report produced”)
- **Canonical contract(s):** (e.g., `ImportPlayerV1`)

### 5) Options (2–4 max; force tradeoffs)
For each option:
- **Option name**
- **Pros**
- **Cons / risks**
- **Cost / complexity**
- **Security posture impact**
- **Exit ramp** (how we pivot later without rewrites)

### 6) Decision to make (explicit)
- Decision: _______
- Decision drivers: (why this matters)
- Decision deadline: (if applicable)

### 7) Open questions / unknowns
- Unknown vendor schema? file size? data quality?
- “We will learn this by …” (prototype / sample file / stakeholder interview)

### 8) Definition of Done (thin)
- A) Decision recorded in ADR(s)
- B) Acceptance criteria agreed
- C) Implementation plan delegated

---

# Why your docs went stale when you pivoted

You were using the **PRD as the decision log**.

PRDs tend to be implementation-adjacent. When you change one core mechanism (e.g., “custom CSV parser” → “third-party importer” or “Papa Parse”), the PRD becomes a rewrite project.

The fix is a **document pipeline** where decisions live in **ADRs** (small, stable), while PRDs stay focused on **what must be true**, and exec specs stay focused on **how we build it this time**.

---

# Optimized workflow (what to adopt)

## Stage 0 — Feature Scaffold (this doc)
- Goal: pin the intent, constraints, and the decision(s) required.
- Output: a 1-page scaffold + a list of decisions that must be recorded.

## Stage 1 — Systems Design Brief (a lightweight design doc / RFC)
- Goal: propose the direction and alternatives with tradeoffs, before anyone writes a PRD.
- Structure: “funnel” style (context → scope → overview → details → cross-cutting → alternatives).

## Stage 2 — ADR(s) (lock decisions)
- Goal: record **one decision per ADR** with context + consequences.
- Result: the decision becomes the stable anchor; later changes create “superseded by ADR-XXX” records instead of rewriting PRDs.

## Stage 3 — PRD (requirements only)
- Goal: define behavior, scope, acceptance criteria, constraints, and reporting.
- Rule: PRD references ADR IDs for *how* decisions (e.g., “Parsing strategy: see ADR-0xx”).

## Stage 4 — Exec Spec (implementation details)
- Goal: routes, RPCs, data model changes, RLS policies, tests, rollout.
- Allowed to churn. This is where “how” changes; it shouldn’t invalidate the PRD.

---

# “Systems designer” as a primitive (not a person)

You don’t need a special human role. You need a **gate** in your process:

**Gate: no PRD or exec spec until**
1) Feature Scaffold exists
2) Design Brief exists (or is explicitly waived for tiny changes)
3) ADR(s) exist for any irreversible or architectural decision

This gate eliminates the pattern:
> “We wrote a big doc, then changed one key axis, now everything is stale.”

---

# ADR Template (hand-off artifact from systems design to domain experts)

> Use Nygard-style ADR: Context → Decision → Consequences.
> Keep it short and searchable. One decision per file.

## ADR-XXX: <Decision title>

**Status:** Proposed | Accepted | Deprecated | Superseded  
**Date:** YYYY-MM-DD  
**Deciders:**  
**Consulted:**  
**Informed:**  

### Context
- What forces/constraints made this decision necessary?
- What is the problem we’re solving (briefly)?
- What options were considered (bullets)?

### Decision
- We will… (single sentence)
- Scope boundary: what is included vs excluded

### Consequences
**Positive**
- …

**Negative / risks**
- …

**Follow-ups**
- What must be done next because of this decision?
- What becomes easier/harder?

### Links
- Feature Scaffold:
- Design Brief/RFC:
- PRD:
- Exec Spec:

---

# PRD Guidance (so it stays stable)

A PRD should focus on:
- user outcomes and flows
- constraints (RLS/tenancy, auditability, conflict handling, idempotency)
- acceptance criteria and reportability
- non-goals and phased roadmap

A PRD should NOT:
- hardcode “mechanism choices” (parser library vs importer SaaS) unless it’s already locked by ADR

**Rule of thumb:** If changing a library would require rewriting the PRD, the PRD is doing the ADR’s job.

---

# Concrete example: CSV import pivot without doc rot

Instead of:
- “PRD says we parse CSV server-side with module X”

Do:
- ADR-010: “Parsing strategy is client-side with Papa Parse” (or “embedded importer vendor”)  
- PRD: “System accepts vendor CSV, provides mapping, produces canonical ImportPlayerV1 payloads, stages rows, executes merge, produces report.”  
- Exec Spec: “Here is the exact implementation (routes, RPCs, schema, tests).”

Now, when you pivot parsing strategy:
- You update **ADR-010** (supersede it with ADR-0YY).
- PRD remains mostly intact.
- Exec spec changes a lot (as expected).

---

# Suggested file layout in repo (simple and searchable)

- `docs/00-scaffolds/FEATURE-###-<slug>.md`
- `docs/01-design/RFC-###-<slug>.md`
- `docs/02-adr/ADR-###-<slug>.md`
- `docs/10-prd/PRD-###-<slug>.md`
- `docs/20-exec-spec/EXEC-###-<slug>.md`

---

# References (why this workflow is standard)

- ADR concept (context/decision/consequences) and why consequences become future context:
  - https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- ADR overview + decision log framing:
  - https://adr.github.io/
- ADR template catalog (MADR, Nygardian ADRs, etc.):
  - https://adr.github.io/adr-templates/
- “Design docs at Google” (design docs emphasize high-level strategy + key decisions + tradeoffs):
  - https://www.industrialempathy.com/posts/design-docs-at-google/
- Design doc structure “funnel” (context → scope/goals → overview → detailed design → alternatives):
  - https://www.industrialempathy.com/posts/design-doc-a-design-doc/
- RFC templates used in practice (example: HashiCorp RFC template):
  - https://www.hashicorp.com/en/how-hashicorp-works/articles/rfc-template
