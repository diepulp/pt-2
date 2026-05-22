# Hardening Direction Audit — Issue Assessment and Recommendation

## Executive verdict

The proposed hardening direction is **largely sound**, but it bundles together three different classes of work:

1. the **actual ship-blocker fix**
2. the **nearby state-transition containment fixes**
3. the **adjacent cleanup / architectural clarification items**

That distinction matters. Otherwise, the document risks presenting one coherent “hardening effort” when in reality only a subset directly addresses the observed failure.

The source proposal is captured in `PROPOSED-FIXES.md`. fileciteturn2file0

---

## Learned issue model

The observed glitch appears to be a classic **UI–persistence split-brain**:

- the interface signals or behaves as though the buy-in save succeeded
- persistence is not yet durably complete
- the modal can still be closed while the mutation is in flight
- the backend side-effect chain can therefore be interrupted or skipped
- the expected `rpc_create_financial_txn` → `mtl_entry` bridge does not complete

In plain terms: the operator can be led to believe the action landed even though the compliance-relevant write path did not finish. The proposal’s first two P0 fixes are therefore aimed at the actual wound, not merely its visible symptoms. fileciteturn2file0

---

## Assessment by tier

### P0 — Correct ship-blocker direction

The strongest part of the proposal is the P0 set:

- move `notifyThreshold` until **after** successful POST
- block modal close while save mutation is pending
- add an integration test that verifies `rpc_create_financial_txn` yields the expected `mtl_entry`

This is the right immediate response.

### Why P0 is correct

The current behavior appears to violate a basic operational invariant:

> the user must never receive a success-like confirmation for a write that has not durably completed.

Likewise, allowing the surface to close during the in-flight mutation creates an avoidable race. Blocking closure while saving is not glamourous, but it is the correct containment move.

The proposed bridge integration test is also high-value. It closes the exact test-coverage hole that let this class of regression escape in the first place. fileciteturn2file0

### Caveat on P0

The proposal is still slightly too UI-centric in how it frames the fix.

Disabling the modal close is good, but the deeper invariant should be:

> once the operator initiates save, the workflow must not transition into a state that implies the action is cancellable unless cancellation is genuinely supported and leaves the system coherent.

So yes, block the close behavior. But conceptually the real target is **operator-visible atomicity**, not merely a disabled “X” button.

---

## P1 — Real findings, but not all the same severity

The P1 items are useful, but they do not all belong to the same risk class.

### Strong P1 items

#### 1. Unsaved buy-in interlock on close-session
Wiring `newBuyIn` into `handleCloseSession`, or forcing a “save first?” interlock, is important. This is the same family of failure as the original glitch: an invalid state transition that lets the operator escape a partially completed loop. fileciteturn2file0

#### 2. Remove silent `modalData` guard
A silent guard that swallows missing modal state creates phantom failures and obscures root cause. Logging and surfacing feedback is the correct direction. fileciteturn2file0

### Moderate P1 item

#### 3. Invalidate `mtlKeys` on close-session flow
This is worth doing, but it is primarily a **read freshness / observability** concern rather than a write-path correctness fix. It should not be narratively grouped with the core failure as though it solves the same problem. fileciteturn2file0

### Architectural / policy item masquerading as hardening

#### 4. Chips-taken → MTL bridge decision
This is the most consequential item in P1, but it is not merely a patch task.

If cash-out on close no longer hits MTL because the system moved to `pit_cash_observation`, then the team may be facing **semantic responsibility drift** between:

- cash observation
- financial transaction semantics
- compliance-trigger semantics
- operator expectation

That is not just a bug. That is a bounded-context contract question and should be treated as one. The proposal is correct to raise it, but it should be spun out into an explicit decision artifact rather than buried inside a hardening list. fileciteturn2file0

---

## P2 — Sensible hardening, properly secondary

The P2 items are reasonable second-order improvements.

### 1. Gaming-day default correctness
Using computed casino gaming day instead of `format(new Date(), ...)` is the correct direction. With a Los Angeles 06:00 cutoff, naive local-date logic is a quiet source of false discrepancies. fileciteturn2file0

### 2. Mixed-unit fixture cleanup
If fixtures on `gaming_day = 2026-04-09` are in dollars instead of cents and therefore silently fall below the threshold filter, then the tests are lying about the system. Good catch; worthwhile cleanup. fileciteturn2file0

### 3. Restore test selectors
The absence of `data-testid` attributes in the new pit surface explains why existing E2E did not actually cover the regressed path. This is not glamorous work, but it is foundational test harness hygiene. fileciteturn2file0

### 4. Realtime subscription
Useful, but correctly treated as optional. It improves live observability, not core correctness. fileciteturn2file0

---

## What the proposal still under-specifies

### 1. The authoritative transaction boundary is not named sharply enough

The proposal implies a chain:

`save buy-in` → `create financial txn` → `mtl_entry`

But what is the actual unit of success?

If MTL creation is mandatory for qualifying buy-ins, then backend success should mean the whole required chain committed. The frontend should not be the final arbiter of whether the operation “really” succeeded.

### 2. Durability, side effect, and observability remain slightly conflated

The proposal implicitly spans three separate concerns:

- **durability** — did the buy-in persist?
- **side effect** — did the compliance bridge fire and create required records?
- **observability** — did the dashboard refresh and reveal the new state?

Those are related, but not interchangeable. Hardening should name them separately so the fix does not drift into cosmetic confidence theater.

### 3. One bridge test is the minimum, not the strategy

The proposed integration test is necessary, but one test alone is only a floor.

At minimum, the system should also have:

- a positive-path bridge test
- a non-qualifying / threshold-path test confirming when `mtl_entry` should **not** be created
- coverage for the operator flow that previously allowed escape during an in-flight mutation

### 4. The cash-out / observation / MTL question is a product-compliance contract issue

If operator mental models still assume cash-out contributes to compliance capture the way the old path did, then the architecture may have changed domain semantics, not just implementation wiring.

That deserves a deliberate decision, explicit documentation, and probably a governing artifact. It should not hide inside a general hardening pass. fileciteturn2file0

---

## Recommended classification

## Approve now

### A. P0.1 — move confirmation until after successful POST
Approve. Directly addresses false success signaling. fileciteturn2file0

### B. P0.2 — block modal close while save is pending
Approve. Directly addresses the abort race. fileciteturn2file0

### C. P0.3 — integration test for `rpc_create_financial_txn` → `mtl_entry`
Approve. Directly closes the regression coverage gap. fileciteturn2file0

### D. P1.4 — unsaved buy-in interlock before close-session
Approve for near-term inclusion if close-session is reachable in the same operator loop. This belongs to the same family of state leak. fileciteturn2file0

---

## Amend before implementation

### E. Backend contract language
Amend the plan so it explicitly states whether a qualifying buy-in is considered successful only when the required compliance side effect has also committed.

### F. Separate correctness from visibility
Amend the narrative so dashboard invalidation and realtime refresh are clearly categorized as observability work, not core correctness repair.

### G. Expand bridge testing slightly
Amend the testing direction to include at least one negative/threshold case in addition to the happy path.

---

## Defer / split into separate decision thread

### H. Chips-taken → MTL bridge decision
Do not leave this as an ordinary hardening bullet. Split it into a dedicated policy / architecture decision thread, because it concerns domain responsibility and compliance semantics, not just code robustness. fileciteturn2file0

### I. Realtime subscription
Defer. Nice-to-have for multi-surface freshness, not necessary to close the actual issue. fileciteturn2file0

---

## Final verdict

The direction is **good enough to proceed**, but only if it is framed honestly.

The real backbone of the fix is:

1. make the save flow atomic from the operator’s perspective
2. ensure backend success means required compliance side effects also landed
3. test that contract directly

Everything else is either nearby containment, observability cleanup, or a separate domain-policy decision that the bug happened to expose.

In other words: the proposal is not wrong, but it is a little too eager to sweep neighboring debris into one tidy “hardening” bundle. The core fix is narrower, sharper, and more defensible than the document currently makes it sound.

---

## Concise implementation posture

**Immediate batch**
- P0.1
- P0.2
- P0.3
- optionally P1.4 if the close-session path is part of the same operator loop

**Next hardening pass**
- silent guard removal
- `mtlKeys` invalidation
- gaming-day default correction
- fixture cleanup
- selector restoration

**Separate decision artifact**
- chips-taken / cash-out / observation / MTL semantic bridge
