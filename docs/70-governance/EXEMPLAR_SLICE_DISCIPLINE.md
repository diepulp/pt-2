# Exemplar Slice Discipline (PT-STANDARD-ES-01)

**Status:** Adopted  
**Applies to:** Any multi-category or multi-producer rollout where the implementation surface spans more than one structural category and must prove end-to-end transport, lifecycle, or projection invariants before horizontal expansion  
**Primary intent:** Collapse broad implementation scope into the smallest symmetric working proof before expanding; prevent the discovery loop from stalling delivery  
**Related governance:** OVER_ENGINEERING_GUARDRAIL (complexity trigger), FEATURE-DEVELOPMENT-GATE (pipeline gate), SIGP (semantic integrity precondition)

---

## 1. Problem

Complex rollouts that span multiple categories — producers, fact classes, event types, service layers, or API surface variants — share a failure pattern:

> Implementation begins horizontally across all categories simultaneously.  
> Semantic or structural findings emerge mid-flight.  
> Scope widens to address each finding.  
> No single category reaches end-to-end proof.  
> The discovery loop consumes implementation budget without producing a working system.

The result is a partially-wired architecture that is more expensive to reason about than either the pre-implementation state or a clean post-proof state.

This is not an over-engineering failure. The full breadth may be correct and necessary. The failure is in sequencing — committing to all categories before the transport or projection mechanism is proven against any of them.

---

## 2. The Discipline

**Collapse vertically before expanding horizontally.**

A vertical collapse means:

> Choose the smallest representative exemplar pair, prove the full end-to-end chain against it, freeze the result, then expand.

A horizontal expansion means:

> Wire all categories in parallel, discover issues across N surfaces simultaneously, resolve before any path is complete.

The discipline forbids horizontal expansion until the exemplar slice passes its proof invariants under real execution conditions — not against specification language.

---

## 3. When This Applies

This discipline is mandatory when all of the following are true:

1. The rollout spans **two or more structural categories** (e.g., Class A / Class B, authority / telemetry, transactional / observational, schema / service / surface).
2. The categories share a **common transport, lifecycle, or projection mechanism** that must be proven to work.
3. The implementation surface contains **five or more independently-movable parts** before the mechanism is proven.
4. A semantic or structural finding in one category **could require changes in the mechanism shared by all categories**.

It is advisory when:

- The rollout spans one category only (single producer type, single fact class).
- Mechanism decisions are already stabilized by prior proof in production.
- The scope is bounded to a single bounded context with no propagation path.

It is not required for:

- Isolated CRUD additions with no cross-context propagation.
- Refactors that change shape without changing meaning.
- UI changes with no new authority, projection, or lifecycle claims.

---

## 4. Selecting the Exemplar

The exemplar must be:

**Minimal** — the smallest set of producers, consumers, or surfaces that exercises the full chain.

**Symmetric** — one representative from each required category. If the mechanism must serve Class A and Class B facts, the exemplar must include both. Selecting only the easier class is an asymmetric shortcut and is forbidden.

**End-to-end** — the exemplar must traverse the complete chain from authoring event through transport through consumer receipt. An exemplar that proves only the authoring side is not an exemplar.

**Real** — proof must come from running code producing observable outcomes. Specification assertions, mock-heavy tests, or coverage-by-description do not satisfy the invariant.

### 4.1 Category Coverage Rule

For every structural category in the full rollout, the exemplar must include exactly one representative that:

- exercises that category's unique contract requirements,
- shares the mechanism with all other category representatives,
- fails visibly if its category-specific invariant is violated.

If a category has no representative in the exemplar, it may not be claimed as "covered by the proof."

### 4.2 Minimum Pair

When the rollout spans exactly two categories, the exemplar is a minimum pair: one from each. Neither may be deferred. The forbidden pattern is:

```
Category A now, Category B later.
```

The permitted pattern is:

```
One Category A exemplar + one Category B exemplar now.
Remaining Category A and Category B producers later.
```

---

## 5. Proof Invariants

Before the exemplar slice is considered complete, it must demonstrate all of the following under real execution conditions.

Define the invariants for the specific domain at the time of planning. The template below applies broadly; instantiate it against the actual mechanism.

### I1 — Atomicity

The authoring record and any dependent output record (outbox row, event emission, ledger entry, projection seed) are born in the same transaction for every exemplar producer.

Rollback injection must prove both writes commit or both disappear. Row-count assertions alone are insufficient.

### I2 — Durability

A committed output survives downstream failure and is redelivered or recomputed on the next cycle without data loss.

### I3 — Idempotency

Processing the same unit of work twice produces exactly one consumer side effect.

The idempotency key and the side effect commit atomically. Separate commits are insufficient.

### I4 — Replayability

Truncating derived state and replaying from the authoritative source in deterministic order produces the same result as live processing.

The replay must be exercised against both exemplar categories. A replay that works for Category A but has not been tested for Category B does not satisfy I4.

---

## 6. Containment Rules During the Exemplar Phase

While the exemplar slice is in progress:

**Allowed:**

- Work within the exemplar's explicitly scoped boundary.
- Schema, service, route, and surface work required by the two exemplar producers.
- Test harness and proof infrastructure for the exemplar invariants.
- Event catalog entries for the exemplar pair.
- UL/ADR/PRD amendments triggered by exemplar findings (do not suppress findings; address them in the mechanism, not by expanding scope).

**Forbidden:**

- Wiring any producer, consumer, or surface outside the exemplar pair.
- Adding new structural categories to the exemplar after the slice boundary is set.
- Implementing projection consumers beyond the minimal receipt/proof harness.
- Operator-visible completeness changes, observability dashboards, or replay UIs.
- External consumer contracts, multi-consumer fan-out, or dynamic registry work.
- Claiming the mechanism is proven before I1–I4 pass under real execution.

**Containment on scope expansion:**

If a semantic finding during the exemplar phase reveals that the mechanism design must change, that change is made to the mechanism before expanding to additional producers. It is not resolved by adding more producers to the exemplar.

---

## 7. Expansion Gate

Horizontal expansion to remaining producers and consumers is permitted only after:

1. I1–I4 are demonstrated under real execution conditions for the exemplar pair.
2. The exemplar result is frozen (not open for renegotiation during expansion).
3. A written expansion plan names each subsequent producer/category, its proof obligation against the frozen mechanism, and its sequencing relative to other producers.

The expansion plan may proceed incrementally. Each expansion batch must declare:

- Which new producer/consumer it adds.
- Which previously-proven invariants it inherits without re-proof.
- Which invariants it must re-prove for the new category.

---

## 8. Anti-Patterns

### AP-ES-01 — Horizontal-First Rollout

Wiring all N producers before any single producer has proven the mechanism end-to-end.

**Symptom:** "We need to wire them all to see how the mechanism behaves at scale."  
**Correction:** The mechanism must be proven on one representative pair first. Scale questions that cannot be answered by the exemplar pair are architecture questions that must be resolved via ADR before expansion.

---

### AP-ES-02 — Asymmetric Shortcut

Selecting only the easy or well-understood category for the exemplar, deferring the harder category to a later slice.

**Symptom:** "Class A is straightforward; let's prove Class A first and add Class B in a follow-on."  
**Correction:** If the mechanism must serve both categories, both must be in the exemplar. An asymmetric proof does not validate the mechanism for the missing category. Issues in the missing category may invalidate the mechanism retroactively after Class A is in production.

---

### AP-ES-03 — Specification Proof

Treating a passing spec, mock-heavy test, or documentation assertion as sufficient proof of I1–I4.

**Symptom:** "The test suite passes and the spec says it should work this way."  
**Correction:** Proof requires real code, real transactions, real rollback injection, and real replay against derived state. If the test environment cannot simulate the failure condition, the invariant is not proven.

---

### AP-ES-04 — Discovery Loop

Continuously widening the exemplar scope to address each semantic or structural finding before closing the proof.

**Symptom:** "We found another edge case; let's add it to the exemplar before declaring done."  
**Correction:** Findings during the exemplar phase are addressed in the mechanism or deferred to the expansion plan. They do not widen the exemplar boundary. If a finding is load-bearing for the mechanism, fix the mechanism. If it is not load-bearing, register it and defer.

---

### AP-ES-05 — Silent Category Assumption

Assuming that proving the mechanism against Category A implies it works correctly for Category B without a representative.

**Symptom:** "Category B is similar enough; the Category A exemplar covers it."  
**Correction:** If the categories have different contracts, different authoring semantics, or different consumer requirements, they are not equivalent for proof purposes. The symmetry requirement exists precisely because similarity is not equivalence.

---

## 9. Relationship to Other Governance

**OVER_ENGINEERING_GUARDRAIL** addresses whether a feature or infrastructure addition is justified at all. This discipline addresses sequencing for features that are already justified and have multiple structural categories.

These are complementary, not duplicates. A feature may pass the OE guardrail (the mechanism is warranted) but still require this discipline (the rollout must collapse vertically before expanding).

**FEATURE-DEVELOPMENT-GATE** governs document pipeline ordering (Scaffold → RFC → ADR → PRD → EXEC). This discipline governs implementation sequencing within the EXEC phase when the implementation spans multiple categories.

**SIGP** governs semantic integrity before implementation hardens. A SIGP review should precede exemplar selection when the rollout touches cross-context propagation, financial truth, lifecycle signals, or user-visible aggregates. The exemplar should not be selected until semantic fractures in the mechanism are either resolved or explicitly registered with containment.

---

## 10. Canonical Instance

**PRD-081 — Transactional Outbox / GAP-F1 Closure** is the canonical instance of this discipline in PT-2.

The full rollout spans five producer categories (Class A transaction, Class A adjustment, Class B grind, Fill dependency event, Credit dependency event) plus a relay, idempotent consumer, and replay path.

The exemplar was collapsed to:

- Class A exemplar: `rpc_create_financial_txn`
- Class B exemplar: `rpc_record_grind_observation`

One representative from each structural category, proving atomicity, durability, idempotency, and replayability end-to-end before any additional producer is wired.

Remaining producers are deferred until I1–I4 pass under real execution against the exemplar pair.

---

## 11. Quick Reference

**When to apply:** Multi-category rollout, shared mechanism, five or more movable parts, category-specific findings could affect the shared mechanism.

**How to select the exemplar:** One representative per structural category. No asymmetric shortcuts.

**What the exemplar must prove:** I1 atomicity, I2 durability, I3 idempotency, I4 replayability — all under real execution conditions.

**What is forbidden during the exemplar phase:** Wiring non-exemplar producers; projections and observability beyond proof harness; external contracts; fan-out; any expansion before I1–I4 pass.

**When to expand:** After the exemplar result is frozen, with a written expansion plan.

**The governing question:** What is the smallest symmetric working proof of the mechanism?

Build that. Then everything else queues behind it.
