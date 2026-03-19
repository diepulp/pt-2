---
id: SCAFFOLD-###
title: "Feature Scaffold: <Feature Name>"
owner: <driver>
status: Draft
date: YYYY-MM-DD
---

# Feature Scaffold: <Feature Name>

> Timebox: 30-60 minutes. If it's longer, you're drifting into a design doc.

**Feature name:**
**Owner / driver:**
**Stakeholders (reviewers):**
**Status:** Draft | In review | Decided | Superseded
**Last updated:** YYYY-MM-DD

## 1) Intent (what outcome changes?)

- **User story:**
- **Primary actor:** {Specific role, e.g., "Pit Boss — floor supervisor with enrollment authority"}
- **Success looks like:** (one measurable outcome that proves the feature works)

## 2) Constraints (hard walls)

- Security / tenancy constraints (RLS, tenant scope, actor identity, audit)
- Domain constraints (casino-scoped uniqueness, idempotency, conflict rules)
- Operational constraints (performance targets, retryability, tooling limits)
- Regulatory/compliance constraints (if any)

## 3) Non-goals (what we refuse to do in this iteration)

- ...
- ...

## 4) Inputs / Outputs (thin interface, not design)

- **Inputs:** (what comes in, e.g., "CSV rows", "vendor export", "operator mapping")
- **Outputs:** (what changes in system, e.g., "players seeded", "report produced")
- **Canonical contract(s):** (e.g., `ImportPlayerV1`)

## 5) Options (2-4 max; force tradeoffs)

### Option A: <name>

- **Pros:**
- **Cons / risks:**
- **Cost / complexity:**
- **Security posture impact:**
- **Exit ramp:** (how we pivot later without rewrites)

### Option B: <name>

- **Pros:**
- **Cons / risks:**
- **Cost / complexity:**
- **Security posture impact:**
- **Exit ramp:**

## 6) Decision to make (explicit)

- Decision: _______
- Decision drivers: (why this matters)
- Decision deadline: (if applicable)

## 7) Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| {PRD/Service/ADR} | Required / Optional | Implemented / Planned |

## 8) Risks / Open questions

| Risk / Question | Impact | Mitigation / Learning Plan |
|-----------------|--------|---------------------------|
| {risk_or_unknown} | High/Med/Low | {mitigation or "We will learn this by ..."} |

## 9) Definition of Done (thin)

- [ ] Decision recorded in ADR(s)
- [ ] Acceptance criteria agreed
- [ ] Implementation plan delegated

## Links

- Design Brief/RFC:
- ADR(s):
- PRD:
- Exec Spec:
