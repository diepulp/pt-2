# Audit — Financial Surface Freshness Contract Rollout Matrix

**Date:** 2026-04-19  
**Artifact audited:** `FINANCIAL-FRESHNESS-ROLLOUT.md`  
**Verdict:** **Approve with patch delta**  
**Scope:** rollout sequencing, exemplar stance, replication posture, dependency clarity, reversibility

---

## 1. Executive Verdict

The rollout direction is sound.

The proposed plan shows the right instincts:

- exemplar first
- one PR per `(fact × surface)` pair
- registry-driven promotion to `ACTIVE`
- no multi-surface mega-PRs
- non-blocking hardening work kept separate from compliance-bearing slices

That is the right shape for rolling out ADR-050 without turning the contract into a bloated migration campaign.

However, the document should not be accepted untouched. A small patch sweep is warranted to correct several places where the plan is slightly too smooth about assumptions, dependency semantics, and rollback posture.

**Recommended disposition:** approve the plan after a light amendment sweep.

---

## 2. What Is Strong

### 2.1 Exemplar-first sequencing is correct

The strongest part of the rollout is the insistence that the first slice lands, proves the pattern, and produces a **Replication Checklist** before fan-out begins.

That is the correct anti-chaos move. It turns “pattern established” from a vague feeling into a concrete deliverable.

### 2.2 Slice granularity is well-contained

The plan correctly holds the line that each slice is:

- individually shippable
- individually reversible
- tied to one `(fact × surface)` pair
- responsible only for contract properties, not adjacent cleanup unless blocking

This is the right containment stance. It prevents the contract rollout from mutating into opportunistic surface refactors.

### 2.3 The exemplar choice is good

Using `FACT-RATED-BUYIN × shift-dashboard-v3` as Phase 1 is the correct choice because:

- the investigation trail is deep
- the D1 → D2 direction is already mostly settled
- the user-visible value is immediate
- the slice is technically rich enough to establish the pattern, but still bounded

This is a proper exemplar, not a decorative pilot.

### 2.4 Hardening is correctly parallelized

Phase 5 is positioned correctly:

- valuable
- non-blocking
- floor-raising
- not allowed to hold the exemplar hostage

That is the right balance. The contract should not wait for tooling perfection before it starts governing real slices.

---

## 3. Where the Plan Needs Tightening

### 3.1 Missing registry-alignment gate before rollout

The plan says the registry is the ledger and that slices promote rows from `PROPOSED` / `PENDING-BACKFILL` to `ACTIVE`.

That is fine, but the rollout depends heavily on the registry already reflecting the accepted ADR wording and the open-question review outcomes. The current Phase 0 list does not explicitly include a **registry alignment pass** after ADR acceptance.

That is a gap.

#### Why it matters

If the registry is slightly stale or still carries pre-review assumptions, then the whole rollout starts from a ledger that is supposed to govern slices but is itself not fully settled.

#### Recommended patch

Add a new prerequisite:

**P0.1b — Registry alignment sweep**
- validate initial registry rows against accepted ADR-050 wording
- fold in accepted open-question decisions
- mark contested or unresolved rows as blocked rather than letting them drift into Phase 2 implicitly

This is a small gate, but it makes the “registry is the ledger” principle credible from the start.

---

### 3.2 Phase 2.A slightly understates same-surface coupling risk

The plan says 2.A (`FACT-PIT-CASH-OBSERVATION` on shift-dashboard) is cheap because it piggybacks on Phase 1’s same surface and inherits the rolling-window fix.

That is partly true, but shared surface does not mean free integration.

#### Why it matters

If Phase 1 introduces:

- new canonical realtime wiring
- new invalidation flow
- new rolling-window semantics

then adding another fact on the same surface immediately afterward may still create:

- hook composition issues
- duplicate invalidations
- subtle freshness interactions
- same-surface blast radius

#### Recommended patch

Under 2.A, add:

> Because 2.A shares the exemplar surface, validate hook composition and duplicate invalidation behavior before merge; same-surface inheritance is an optimization, not a waiver of verification.

That preserves the benefit without pretending same-surface means zero risk.

---

### 3.3 Existing realtime coverage is not equivalent to contract compliance

Phase 2.B and 2.C are described as mostly registration/backfill/E2 work because realtime coverage already exists in production.

That is only conditionally true.

#### Why it matters

Existing realtime is not automatically compliant with ADR-050. The contract still requires proof that:

- the current subscription target matches the selected D2
- the invalidation path satisfies the declared reaction model
- the SLA semantics are actually met
- publication membership is explicitly version-controlled

A pre-existing hook is not itself proof of compliance.

#### Recommended patch

Under Phase 2 replication, add an explicit note:

> Slices with existing realtime hooks still require validation that the current subscription target matches the ADR-050 D2 choice and that the current invalidation/refetch behavior satisfies the declared reaction model and SLA.

This prevents “we already have a hook” from being used as a lazy waiver.

---

### 3.4 Phase 3 muddles reaction model and date-navigation semantics

This is the most conceptually important patch.

The current wording suggests that operator-driven date navigation may qualify as MANUAL window semantics if D4 is declared INTERVAL. That blends two distinct concerns:

- **reaction model**
- **windowing behavior**

#### Why it matters

The ADR introduced LIVE / INTERVAL / MANUAL specifically to sharpen behavior classes. If the rollout plan starts collapsing those categories back together, the taxonomy gets fuzzy again.

Date navigation alone does not determine whether a surface is MANUAL or INTERVAL.

A surface can have:
- operator-chosen date range **and** auto-refresh = INTERVAL or LIVE
- operator-chosen date range **and** explicit fetch-only = MANUAL

Those are not the same thing.

#### Recommended patch

Rewrite the 3.A note to explicitly separate:
- whether the surface auto-refreshes after the date is set
- whether the operator must explicitly fetch/refresh
- whether the window itself advances after mount

That keeps the rollout aligned with the ADR instead of weakening it.

---

### 3.5 Cadence section sounds more deterministic than the plan really is

The cadence proposal is useful as a planning horizon, but some of the phrasing sounds more certain than the rest of the document’s gating logic justifies.

For example, statements like “four out of five registry facts are `ACTIVE`” by a given week read like predicted outcomes rather than target sequencing.

#### Why it matters

The rest of the plan is careful about:
- exemplar exit
- dependency gates
- stakeholder decisions
- unresolved items not fanning out

The cadence should sound consistent with that reality.

#### Recommended patch

Reframe the cadence section as:
- target sequence
- planning horizon
- intended flow if no blocking review findings emerge

not as pseudo-deterministic program management prophecy.

Small tone change, but worthwhile.

---

### 3.6 Reversibility section overstates the harmlessness of publication rollback

The reversibility section is generally good, but one line is too breezy:

> Publication-membership migrations are additive (`ADD TABLE`) and can be reversed with a `DROP TABLE` migration if ever required; no data loss.

Technically, that may be true in the narrow row-retention sense, but operationally it understates what rollback means.

#### Why it matters

Dropping publication membership:
- does not delete data
- but **does** change runtime freshness behavior
- and may invalidate the contract posture of active registry rows

So the rollback is reversible, yes — but not casually consequence-free.

#### Recommended patch

Replace the current statement with:

> Publication-membership rollback does not delete row data, but it does change runtime freshness behavior and requires demotion of any affected registry rows from `ACTIVE` to the appropriate pre-rollout status.

That is more honest and consistent with the registry-ledger model.

---

### 3.7 Exemplar exit should prove replicability, not just correctness

The current Exemplar Exit Criteria are already good, especially the requirement for a Replication Checklist.

One more criterion would strengthen it further.

#### Why it matters

The point of the exemplar is not only:
- to fix the first slice
- and not only to prove the contract can be satisfied once

It is also to prove that the pattern does not require slice-specific heroics.

#### Recommended patch

Add one more exit criterion:

> Reviewer confirms the exemplar did not require undocumented slice-specific exceptions to ADR-050 beyond those captured in the Replication Checklist.

That gives the exemplar a replicability smell test, not just a technical completion test.

---

## 4. Recommended Patch Delta

The following edits are recommended before acceptance.

### Additions

1. **P0.1b — Registry alignment sweep**
   - align initial registry rows with accepted ADR-050 and accepted review answers

2. **Phase 2.A caution**
   - same-surface inheritance does not waive verification of hook composition / duplicate invalidation behavior

3. **Phase 2 existing-realtime validation note**
   - existing hooks must still be validated against ADR-050 D2 and SLA semantics

4. **Exemplar Exit Criterion**
   - reviewer confirms the pattern was replicable without undocumented slice-specific heroics

### Rewrites

5. **Phase 3.A wording**
   - separate reaction model from date-navigation/window semantics

6. **Cadence section**
   - reframe as target sequence rather than deterministic forecast

7. **Reversibility wording**
   - make publication rollback consequences explicit in registry terms

---

## 5. Recommended Inline Amendment Text

Suggested text fragments for direct splicing.

### New P0.1b row

**P0.1b — Registry alignment sweep**  
Validate the initial `REGISTRY_FINANCIAL_SURFACES.md` rows against the accepted ADR-050 text and accepted review decisions. Any row with unresolved D1/D2/D4 ambiguity is marked blocked and does not proceed into Phase 1 or Phase 2 by default.

### Phase 2 note

**Validation note for inherited / pre-existing realtime:**  
A slice that already has realtime wiring is not presumed compliant. It must still verify that the current subscription target matches the ADR-050 D2 selection and that the current invalidation/refetch path satisfies the declared reaction model and SLA.

### Phase 2.A note

**Composition note:**  
Because 2.A shares the exemplar surface, validate hook composition, duplicate invalidation behavior, and same-surface freshness interactions before merge. Shared surface inheritance reduces work; it does not waive verification.

### Exemplar Exit Criterion addition

**Replication viability:**  
Reviewer confirms the exemplar did not require undocumented slice-specific exceptions beyond those captured in the Replication Checklist.

### Reversibility wording replacement

Publication-membership migrations are reversible, but rollback changes runtime freshness behavior. Any rollback that removes D2 publication membership must demote the affected registry row(s) from `ACTIVE` and record the change in the registry changelog.

---

## 6. Final Verdict

This is a good rollout plan.

It understands:
- sequencing
- containment
- exemplar value
- reversibility
- the difference between contract rollout and opportunistic cleanup

The bones are right.

The remaining work is not directional correction. It is a light honesty sweep:
- tighten dependency semantics
- avoid over-smooth assumptions
- preserve the ADR’s taxonomy
- make rollback consequences explicit
- make the registry truly authoritative from the first step

**Final recommendation:** approve after a small amendment pass.

---

## 7. One-Line Summary

The rollout matrix is fundamentally sound: exemplar first, replication after, one fact-surface slice at a time. Patch the assumptions around registry readiness, inherited realtime, Phase 3 semantics, and rollback posture, and it is fit for adoption.
