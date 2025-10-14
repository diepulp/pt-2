# OVER-ENGINEERING GUARDRAIL (PT-STANDARD-OE-01)

**Status**: Adopted
**Applies to**: All phases, all domains (Player, RatingSlip, Loyalty, MTL, Staff, etc.)
**Primary intent**: Prevent MVP scope creep, redundant abstractions, and premature infrastructure
**Authoritative principles**: KISS, YAGNI, Single Source of Truth, Single Authoritative Mutator, Least Power

---

## 1. Problem Statement

Wave 2 (Phase 6) drifted toward a production anti-pattern: a generic event bus, durable event log, and distributed rate-limiting built when only one consumer existed. This violated MVP scope and delayed delivery. This guardrail canonizes what not to do and operationalizes how to stay lean.

## 2. Canonical Anti-Pattern (Do Not Repeat)

**OE-AP-01 — Premature Generalization**
"Generic, reusable infrastructure introduced before a second concrete consumer exists."

**Symptoms** (any two = violation):

- Abstract "dispatcher/bus" or "event store" created with one consumer
- New infra "for future scale" without a measured trigger
- Duplicating idempotency across layers when a DB uniqueness constraint suffices
- Cross-cutting libs (retry, rate-limit, logging) added without an incident, SLO breach, or an approved ADR

## 3. Non-Goals

- Does not block infra when justified by triggers (§6)
- Does not prevent small, surgical hardening (unique index, row lock)
- Does not forbid tiny extension points (≤30 LOC, no new infra)

## 4. Golden Path for 2-Domain MVP Workflows

When one producer and one consumer live in the same runtime:

**Direct Call Orchestration**
Server action (or service fn) calls consumer synchronously.

**Single Authoritative Mutator**
Only the owning service writes its state (e.g., Loyalty writes points + ledger).

**Database-Level Idempotency**
Deterministic idempotency_key + UNIQUE index. Treat unique violation as soft success and return prior outcome.

**Row-Level Concurrency**
All mutations via RPC/SQL proc with SELECT … FOR UPDATE. Return (before, after, tier_before, tier_after) for audit.

**Minimal Observability**
One structured log per operation with correlation_id (success/failure).

Anything beyond this requires a trigger (§6) and a Mini-ADR (§7).

## 5. Red-Flag Checklist (Stop-the-Line if any two are "Yes")

- [ ] Are you adding an abstraction layer (bus/dispatcher) with one consumer?
- [ ] Introducing new infra (Redis/Queue/EventLog) "to be ready later"?
- [ ] Duplicating idempotency in code when a DB constraint would do?
- [ ] Creating new tables that don't hold business truth before launch?
- [ ] Is the new module >150 LOC with no measured problem?
- [ ] Would removing it change zero user-visible outcomes today?

**If Yes ≥ 2 → STOP. File a Mini-ADR or remove the layer.**

## 6. Allowable Triggers for Added Complexity

You may add infra/abstractions when any one is true and recorded:

**Second Concrete Consumer**
(e.g., Analytics/Marketing subscribes to the same telemetry with committed scope).

**Performance/SLO Breach**
Measured p95 latency for direct call > target (e.g., >500 ms) with profiling evidence.

**Operational Risk / Compliance**
Requirement (audit/replay/legal) not met by ledger + logs.

**Horizontal Scale**
≥2 app instances where in-memory state fails; incident or load test proves it.

When a trigger is met: raise a Mini-ADR (§7).

## 7. Mini-ADR (Lean) — Required Content (≤1 page)

- **Title & Trigger**: Which §6 trigger is satisfied?
- **Current vs Proposed**: 3 bullets each.
- **Blast Radius**: Affected modules + rollback plan.
- **Exit Criteria**: Metrics proving necessity (e.g., p95 < 500 ms).
- **Sunset Clause**: When can we remove or simplify?
- **Approval**: Tech Lead + one reviewer.

## 8. Metrics that Matter

- p95 end-to-end for the user flow (e.g., completeRatingSlip): ≤500 ms
- Duplicate-write rate: 0 after idempotency rollout
- Incidents tied to missing infra: must be >0 to justify new infra (or mandated by compliance)
- LOC delta vs value: infra-only PRs ≤150 LOC, otherwise Mini-ADR required

## 9. Implementation Patterns (Allowed vs Disallowed)

**Allowed (MVP)**:

- Direct service invocation inside server action
- One RPC/proc for balance updates (FOR UPDATE)
- Single ledger table as audit source of truth
- Deterministic idempotency_key + UNIQUE constraint
- One structured log with correlation_id

**Disallowed (until triggers)**:

- Generic event bus/dispatcher
- Persistent event_log table "for future replay"
- Redis-backed rate limiting (in-memory OK for MVP)
- Multiple idempotency layers (code + event store + DB)
- New infra without a Mini-ADR

## 10. Enforcement

- **PR Gate**: Template includes OE-01 Check (§14)
- **Reviewer Duty**: If Yes ≥ 2 in §5, require Mini-ADR or removal
- **Build Gate (Optional)**: CI fails if OE-01 section missing
- **Post-Merge Audit**: Weekly scan for new infra packages/tables; flag entries without ADR

## 11. Exceptions

- Regulatory mandates (ticket linked)
- P0 incident mitigation (retroactive Mini-ADR within 48 h)
- Platform constraints (e.g., vendor contract requiring event capture; attach proof)

## 12. Wave-2 Case Study (Applied)

- **Violation**: Dispatcher, event_log, Redis planning with a single consumer
- **Remedy**: Direct call, DB idempotency, locked RPC, single structured log
- **Outcome**: ~55% complexity reduction; equal user value; faster delivery

## 13. Glossary

- **Single Authoritative Mutator**: One service is the sole writer of a domain's state
- **Idempotency**: Same intent → same end state; implemented via deterministic keys + DB uniqueness
- **Mini-ADR**: Lightweight architecture decision record per §7

## 14. OE-01 Quick Reference (paste into PRs)

```markdown
### OE-01 Check (Over-Engineering Guardrail)

- [ ] A §6 trigger exists (second consumer, SLO breach, compliance, scale)?
- [ ] Measured evidence attached (profile, incident, mandate)?
- [ ] Idempotency handled at DB (UNIQUE key), not re-implemented elsewhere?
- [ ] Single service mutates the domain (no cross-writes)?
- [ ] Infra-only change ≤150 LOC; if not, Mini-ADR attached?

**Result:** ☐ Proceed  ☐ Needs Mini-ADR  ☐ Reject (remove complexity)
```
