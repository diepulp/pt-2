# Loyalty Canonization and Split-Brain Remediation Strategy

**Status:** Proposed  
**Artifact type:** Remediation strategy / canonization program  
**Trigger:** SIGP-003 — Loyalty split-brain diagnosis  
**Date:** 2026-06-21  
**Scope:** Loyalty authority, valuation, balance, correction lifecycle, propagation, vocabulary, and consumer convergence  
**Primary references:** TIA canon exemplar, transactional outbox Wave 2, Exemplar Slice Discipline

---

## 1. Executive Direction

The Loyalty Service should not be treated as a collection of unrelated defects or repaired through one broad refactor.

The diagnosis shows one repeated disease across several layers:

1. **Settled or historical values are recomputed from mutable live inputs.**
2. **Derived values have multiple owners or competing read paths.**
3. **Authoring, propagation, and consumer state form parallel truths.**
4. **Vocabulary does not distinguish estimates, settled facts, valuation, balance, correction, and entitlement clearly enough.**

The remediation should therefore become a bounded **Loyalty Canonization Program**, modeled on the proven Table Inventory Accounting and transactional-outbox exemplars.

The governing rules are:

- Settled facts must not be recomputed from mutable inputs.
- One owner produces each derived value.
- Surfaces render canonical DTOs and do not recalculate domain meaning.
- Corrections are compensating facts, not mutations.
- Propagation begins only after the authored fact semantics are stable.
- Horizontal expansion follows a vertically proven exemplar.

---

## 2. Immediate Containment Boundary

Until the canonization program closes:

- No new loyalty-liability or point-value surfaces may be introduced.
- No consumer may be connected to the existing `loyalty_outbox`.
- No additional balance cache or parallel balance representation may be introduced.
- No client may add new point-cost, liability, reward, or balance calculations.
- No new loyalty reason or event type may be minted outside a frozen vocabulary register.
- Existing shift-report liability must be treated as **at-risk**, not canonical merely because it is already live.
- New work must not preserve contradictory semantics behind compatibility adapters.

The intent is containment, not feature suspension. Existing operator workflows may remain available where necessary, but their non-canonical status must be explicit and no new dependency may form around them.

---

## 3. Target Canonical Model

### 3.1 Canonical Facts

| Concept | Canonical authority |
|---|---|
| Point movement | `loyalty_ledger` |
| Current balance | Projection derived from loyalty ledger movements |
| Liability snapshot | Dated valuation projection |
| Accrual result | Settled ledger entry created by the accrual boundary |
| Open-session reward value | Mutable live estimate |
| Reversal | Compensating ledger entry referencing the original |
| Redemption | Settled negative loyalty movement |
| Point valuation | Versioned policy selected by an explicit as-of rule |
| Event propagation | Canonical loyalty outbox path |
| Vocabulary | Loyalty SRL / SRM owner |

### 3.2 Canonical Temporal Postures

Every loyalty value must declare one temporal posture:

- `event_time_pinned`
- `as_of_date_versioned`
- `live_estimate`
- `current_operational_state`

A value must not silently move between these postures.

Examples:

- Closed-slip accrual: `event_time_pinned`
- Liability snapshot: `as_of_date_versioned`
- Open-slip reward suggestion: `live_estimate`
- Current player balance: `current_operational_state`

### 3.3 Canonical Ownership Rule

Each derived loyalty value has exactly one owner.

A surface may:

- request the value;
- render the returned DTO;
- display provenance, policy version, as-of time, and settlement status.

A surface may not:

- select valuation policy;
- compute point cost;
- recompute balance;
- infer correction semantics;
- combine a historical amount with a live rate;
- fabricate absent tier or policy state.

---

## 4. Program Structure

The remediation should proceed through five bounded phases.

```text
SIGP-003 accepted
        ↓
Phase 0 — Loyalty Canonicalization Directive
        ↓
Phase 1 — Valuation and Liability Exemplar
        ↓
Phase 2 — Ledger Balance and Correction Exemplar
        ↓
Phase 3 — Temporal, Attribution, and Vocabulary Hardening
        ↓
Phase 4 — Loyalty Transactional-Outbox Exemplar
        ↓
Phase 5 — Consumer and Surface Convergence
        ↓
System-wide Canonical Fact and Projection Standard
```

---

# Phase 0 — Loyalty Canonicalization Directive

## 5. Purpose

Freeze the meaning, ownership, and lifecycle of all loyalty facts before implementation begins.

This phase creates the governing artifact set and fracture inventory. It does not change runtime behavior.

## 6. Required Decisions

The directive must freeze:

1. `loyalty_ledger` as the authoritative history of point movements.
2. Balance as a projection, not an independently authoritative fact.
3. Liability as a dated valuation projection, not a live recomputation.
4. Open-session reward output as a mutable estimate.
5. Posted ledger entries as settled and immutable.
6. Corrections as compensating entries.
7. Server ownership of redemption and entitlement calculations.
8. The fate of `rpc_issue_mid_session_reward`.
9. The fate of `current_balance`.
10. The canonical loyalty reason and event vocabularies.

## 7. Producer and Consumer Classification

Every current producer and consumer must be classified as:

- `canonical`
- `raw_input`
- `legacy_projection`
- `legacy_surface`
- `dead_candidate`
- `migration_target`

The inventory should cover at minimum:

### Producers

- rating-slip close accrual
- open-session reward suggestion
- promotion issuance
- manual reward
- mid-session reward
- redemption
- correction / reversal paths
- policy administration

### Consumers

- Player 360
- shift report
- measurement widgets
- rating-slip modal
- loyalty panel
- comp entitlement panel
- receipts
- hooks and direct table queries
- admin economics surfaces

## 8. Phase 0 Exit Gate

Phase 1 must not begin until the following are resolved:

- What does “balance” mean?
- What does “liability” mean?
- When is valuation frozen?
- Which values are live estimates?
- How are corrections represented?
- Does `rpc_issue_mid_session_reward` survive?
- Is `current_balance` removed, retained as a governed projection, or rebuilt?
- Which reason and event terms are canonical?
- Which surfaces must be suppressed during migration?

---

# Phase 1 — Valuation and Liability Exemplar

## 9. Why This Comes First

The loyalty liability fracture is already load-bearing because it feeds the shift-report PDF.

A mutable active valuation rate can retroactively re-price the same held-point pool. This is a management-facing money value and therefore the highest-priority trust repair.

## 10. Exemplar Goal

Prove one canonical liability path:

```text
ledger truth
→ point holdings at snapshot cutoff
→ valuation policy effective at cutoff
→ immutable liability snapshot
→ one report consumer
```

## 11. Recommended Valuation Rule

Use **as-of-date versioned valuation**.

```text
liability_snapshot(snapshot_date)
  = eligible loyalty ledger balance as of snapshot cutoff
  × valuation policy effective at that cutoff
```

Do not stamp valuation rates on every historical ledger row unless later evidence proves that level of granularity is required.

## 12. Canonical Snapshot Contract

A liability snapshot should persist:

```ts
interface LoyaltyLiabilitySnapshotDTO {
  casino_id: string
  snapshot_date: string
  snapshot_as_of: string

  points_balance: number
  cents_per_point: number
  liability_cents: number

  valuation_policy_version: string
  valuation_effective_date: string

  status: 'original' | 'superseding_correction'
  supersedes_snapshot_id: string | null
}
```

## 13. Snapshot Rules

- A snapshot must not be silently overwritten using a different valuation policy.
- Re-running the same snapshot request should return the existing canonical result.
- A correction must create a superseding snapshot with provenance.
- Ledger entries posted after the cutoff must not affect the snapshot.
- The rendered rate and rendered liability amount must come from the same snapshot.
- The active policy at render time is irrelevant to a historical snapshot.

## 14. Exemplar Consumer

Migrate only the shift-report loyalty liability section.

The report must display:

- liability amount;
- point balance used;
- cents-per-point rate used;
- valuation policy version;
- valuation effective date;
- snapshot as-of date;
- correction status where applicable.

The report must not fetch a separate live valuation rate.

## 15. Phase 1 Proof Invariants

- Changing the active valuation policy does not alter an existing snapshot.
- Re-running an identical snapshot request is idempotent.
- A later snapshot may use a later policy without rewriting the earlier snapshot.
- Post-cutoff ledger entries do not affect the earlier snapshot.
- The displayed amount and displayed rate share one snapshot identity.
- Recomputing from the same cutoff and policy version produces the same result.

## 16. Explicit Deferrals

Phase 1 must not:

- migrate every balance consumer;
- redesign the loyalty outbox;
- implement all correction workflows;
- build a general valuation engine;
- introduce a generic policy framework.

---

# Phase 2 — Ledger Balance and Correction Exemplar

## 17. Purpose

Close the aggregate split-brain and undefined correction lifecycle together.

These are one problem:

- ledger SUM is declared authoritative;
- surfaces read `current_balance`;
- drift detection is inactive;
- reversal exists only as vocabulary and type shape.

## 18. Canonical Balance Invariant

```text
player loyalty balance = SUM(loyalty_ledger.points_delta)
```

No independently authored balance value may exist.

## 19. Preferred Baseline

Derive balance from the ledger at the service boundary.

This should be the initial pilot posture because it removes invisible cache drift and makes replay trivial.

## 20. Permitted Projection Optimization

`current_balance` may remain only as a formally governed projection when all of the following are true:

- ledger entry and projection update occur atomically;
- direct projection mutation is impossible;
- drift is mechanically detected;
- rebuilding from the ledger is supported;
- replay equivalence is tested;
- consumers know the value is a projection;
- the ledger remains the sole authored authority.

Without all conditions, `current_balance` should be removed from canonical reads.

## 21. Reversal Lifecycle

Introduce one canonical reversal operation:

```text
rpc_reverse_loyalty_ledger_entry(
  original_entry_id,
  reversal_reason,
  idempotency_key
)
```

The operation must:

- resolve the original entry;
- reject cross-casino reversal;
- reject unauthorized reversal;
- reject reversal of an ineligible entry;
- prevent duplicate or excessive reversal;
- create a compensating ledger entry;
- reference the original ledger entry;
- preserve the original semantic reason;
- add a correction reason;
- update any retained balance projection atomically;
- derive staff attribution from trusted context;
- return original and compensating entry identities.

## 22. Forbidden Correction Patterns

- Updating or deleting the original ledger row.
- Reusing `manual_reward` as an unnamed reversal.
- Reusing `adjustment` without reference to the original.
- Client-side subtraction from balance.
- A reversal row with no original-entry link.
- Multiple full reversals of the same original entry.
- Correction logic outside the canonical RPC/service boundary.

## 23. Reconciliation Posture

The existing unused reconciliation materialized view must either:

1. be deleted when balance becomes read-time derived; or
2. become a real scheduled invariant check with alerting when a projection remains.

A detector that is never refreshed or inspected must not remain as evidence of safety.

## 24. Phase 2 Proof Invariants

- Ledger SUM equals rendered balance.
- Original plus full reversal nets to zero.
- Duplicate reversal requests create one compensating row.
- Direct balance projection mutation is impossible.
- Projection rebuild reproduces the ledger-derived result.
- All consumers receive the same balance for the same cutoff.
- Staff attribution comes from trusted server context.
- Reversal history remains auditable.

---

# Phase 3 — Temporal, Attribution, and Vocabulary Hardening

## 25. Open-Session Estimate Contract

The average-bet symptom is not a settled-points mutation. It is a mutable preview presented too much like a settled result.

The canonical active-session behavior should be:

```ts
interface LiveRewardEstimateDTO {
  estimate_status: 'live'
  settled: false

  estimated_points: number
  basis_as_of: string
  average_bet_basis_cents: number
  policy_version: string

  may_change: true
}
```

At slip close, the settled result becomes:

```ts
interface SettledLoyaltyMovementDTO {
  settled: true
  ledger_entry_id: string
  points_delta: number
  accrued_at: string
  policy_version: string
}
```

## 26. Recommended Average-Bet Rule

During an open slip:

- use the current valid average bet;
- label the result as a live estimate;
- show the basis timestamp;
- state that it may change until close.

At close:

- pin all accrual inputs;
- create one settled ledger entry;
- prevent later slip edits from changing the settled result.

## 27. Mid-Session Reward Decision

Do not repair `rpc_issue_mid_session_reward` until its need is proven.

### If dead

Delete:

- RPC;
- DTOs;
- enum branches;
- schema branches;
- unused UI scaffolding;
- deprecated reason handling tied only to this path.

### If live

Bring it fully under canon:

- trusted staff attribution;
- canonical reasons only;
- database rejection of deprecated reasons;
- append-only ledger semantics;
- same correction rules;
- canonical outbox emission;
- idempotency proof.

Deletion is preferred when the path has no real call sites.

## 28. Loyalty Vocabulary

Create an SRL binding for:

- `accrual`
- `reward`
- `redemption`
- `comp_entitlement`
- `manual_credit`
- `reversal`
- `adjustment`
- `live_reward_estimate`
- `settled_points`
- `point_valuation`
- `loyalty_liability`
- `balance_projection`
- `valuation_policy_version`

## 29. Reason-to-Event Mapping

Ledger reasons and event types may use different syntax, but they must map to one semantic catalog.

Example:

| Ledger reason | Event type | Canonical semantic class |
|---|---|---|
| `base_accrual` | `loyalty.accrual_settled` | accrual |
| `promotion_reward` | `loyalty.promotion_reward_settled` | reward |
| `redemption` | `loyalty.redemption_settled` | redemption |
| `reversal` | `loyalty.movement_reversed` | correction |
| `manual_credit` | `loyalty.manual_credit_settled` | reward |

Deprecated reasons must be rejected at the database boundary.

## 30. Gaming-Day Attribution

Add `gaming_day` only as canonical temporal attribution metadata.

It must not replace:

- event timestamp;
- liability cutoff;
- policy effective date;
- settlement timestamp;
- snapshot as-of timestamp.

---

# Phase 4 — Loyalty Transactional-Outbox Exemplar

## 31. Entry Condition

The outbox phase begins only after:

- liability semantics are stable;
- balance authority is stable;
- reversal semantics are stable;
- reason taxonomy is frozen;
- surviving producers are known.

Reliable propagation must not distribute ambiguous facts.

## 32. Exemplar Pair

Use the smallest representative lifecycle pair:

1. one positive settled movement — base accrual;
2. one negative or corrective settled movement — redemption or reversal.

The pair must prove both additive and subtractive/corrective loyalty semantics.

## 33. Exemplar Chain

```text
ledger entry
+ canonical loyalty outbox row
inside one database transaction
→ relay
→ idempotent receipt
→ minimal proof projection
→ deterministic replay
```

## 34. Reused Transport Mechanics

Reuse the proven Wave 2 mechanics:

- same-transaction authoring and outbox insertion;
- UUIDv7 event ID;
- immutable envelope fields;
- static event catalog;
- service-role claim path;
- at-least-once delivery;
- `processed_messages`;
- atomic consumer receipt;
- deterministic ordering;
- replay harness;
- I1–I4 proof.

## 35. Loyalty-Specific Event Classification

Do not force loyalty into the existing financial `ledger | operational` taxonomy without an explicit decision.

A candidate loyalty envelope is:

```ts
interface LoyaltyOutboxEvent {
  event_id: string
  event_type: string

  fact_class:
    | 'loyalty_accrual'
    | 'loyalty_redemption'
    | 'loyalty_correction'

  authority:
    | 'settled_loyalty_fact'
    | 'estimated_basis'

  casino_id: string
  player_id: string
  aggregate_id: string
  gaming_day: string | null

  payload: Record<string, unknown>
  created_at: string
  processed_at: string | null
}
```

The exact labels require ADR approval. The invariant is explicit immutable classification, not these precise names.

## 36. Phase 4 Proof Invariants

### I1 — Atomicity

Ledger row and outbox row commit or roll back together.

### I2 — Durability

A committed event survives relay failure and remains claimable.

### I3 — Idempotency

Duplicate delivery creates one consumer effect.

### I4 — Replayability

Rebuilding derived state from ordered event history produces the same result as live processing.

### Semantic proofs

- Reversal is not classified as accrual.
- Redemption is not classified as reward issuance.
- Ledger reason and event type use a registered mapping.
- No producer writes ledger-only.
- No producer writes outbox-only.
- Consumer code does not infer event meaning from payload shape.

## 37. Explicit Deferrals

- multi-consumer fan-out;
- external event contracts;
- generic event platform;
- replay UI;
- event sourcing;
- observability dashboard;
- dynamic consumer registry;
- cross-domain loyalty-finance event unification.

---

# Phase 5 — Consumer and Surface Convergence

## 38. Consumer Migration Rule

Every loyalty consumer must be assigned one disposition:

- consume canonical DTO;
- suppress;
- delete;
- document as outside active workflow.

No active consumer may continue reading a legacy projection after the corresponding canonical DTO lands.

## 39. Canonical DTO Family

Use a small DTO set:

```text
LoyaltyBalanceDTO
LoyaltyLiabilitySnapshotDTO
LiveRewardEstimateDTO
SettledLoyaltyMovementDTO
RedemptionQuoteDTO
```

## 40. Required DTO Provenance

Where relevant, DTOs must carry:

- `as_of`
- `policy_version`
- `policy_effective_date`
- `basis`
- `settled`
- `source`
- `authority`
- `updated_at`
- `ledger_entry_id`
- `snapshot_id`

## 41. Consumer Disposition Matrix

| Consumer | Required disposition |
|---|---|
| Shift-report liability | Canonical liability snapshot |
| Measurement liability widget | Canonical liability snapshot |
| Player 360 balance | Canonical balance DTO |
| Rating-slip modal | Canonical balance + live reward estimate |
| Comp confirmation panel | Server-computed redemption quote |
| Loyalty panel | Canonical tier and balance; no fabricated default |
| Receipts | Settled movement result |
| Direct hooks / table reads | Delete or route through service boundary |
| Legacy liability calculations | Delete |
| Legacy balance cache reads | Delete or formally project |

## 42. UI Prohibitions

The UI must not:

- calculate point cost;
- subtract balances;
- select valuation policies;
- fabricate a default tier;
- combine historical amounts with live rates;
- infer settled status;
- convert absent data into zero without an explicit zero-state contract;
- parse correction semantics from free-text reason fields.

## 43. Phase 5 Exit Gate

- All active consumers appear in the migration inventory.
- Each active consumer uses one canonical DTO or is suppressed.
- No duplicate liability formula remains.
- No duplicate balance formula remains.
- No client-side redemption calculation remains.
- No deprecated reason is rendered as canonical.
- Shift report, Player 360, rating-slip modal, and comp panel agree on shared values at the same cutoff.
- Legacy direct-table read paths are deleted or quarantined.

---

## 44. Recommended Delivery Sequence

| Order | Slice | Primary fracture closed |
|---:|---|---|
| 1 | Canonicalization Directive | Ownership and semantic ambiguity |
| 2 | Liability snapshot exemplar | Mutable valuation / historical repricing |
| 3 | Balance and reversal exemplar | Aggregate split-brain / correction lifecycle |
| 4 | Temporal and vocabulary hardening | Estimate-vs-settled ambiguity / reason drift |
| 5 | Outbox exemplar | Producer bifurcation / absent relay-consumer contract |
| 6 | Consumer convergence | Surface recomputation / parallel reads |
| 7 | System standardization | Recurrence prevention |

The outbox is deliberately not first.

Transporting ambiguous loyalty facts more reliably would widen the fracture rather than solve it.

---

## 45. What Should Be Reused Directly

The following proven system patterns should be reused:

- SIGP fracture classification;
- Canonicalization Directive;
- exemplar-first vertical collapse;
- one formula owner;
- one DTO authority;
- legacy surface suppression inventory;
- append-only correction-by-new-row;
- same-transaction outbox insertion;
- I1–I4 transport proofs;
- idempotent consumer infrastructure;
- server-owned financial calculations;
- provenance and as-of rendering;
- SRL registration;
- forbidden vocabulary lists;
- replay-based projection verification.

---

## 46. What Should Not Become a Shared Framework Yet

Do not introduce:

- a generic cross-domain fact engine;
- one universal policy-snapshot framework;
- a generic valuation service;
- a generic ledger library;
- a generic projection platform;
- a cross-domain event-bus redesign;
- one universal authority enum forced across unrelated domains.

The proven patterns should first become shared governance and invariant templates.

Shared runtime abstractions should follow only after repeated implementation evidence shows stable duplication.

---

## 47. System-Wide Canonical Fact and Projection Standard

After Loyalty proves the pattern, create a reusable standard requiring every stateful domain to answer:

1. What is the authoritative authored fact?
2. Is correction mutation or compensation?
3. Which inputs are pinned at event time?
4. Which inputs are selected as of a date?
5. Which values are live estimates?
6. Is an aggregate derived, cached, or independently authored?
7. Who owns the formula?
8. May a surface recompute it?
9. What provenance crosses the DTO boundary?
10. Does every producer emit atomically?
11. Can derived state be rebuilt?
12. Which vocabulary is canonical?
13. Which deprecated terms are mechanically rejected?
14. Which active surfaces must converge or be suppressed?
15. Which proof invariants certify the exemplar?

This standard becomes the method for reviewing the remaining bounded contexts.

---

## 48. Priority Model for Future Canonization

After Loyalty, rank candidate domains using:

```text
priority =
  operator_visible_trust_impact
  × financial_or_compliance_consequence
  × propagation_breadth
  × mutable_input_exposure
```

Do not select the next domain only by code size or number of defects.

A smaller domain with a management-facing trust break may deserve priority over a larger but isolated implementation.

---

## 49. Final Recommendation

Do not authorize a broad “Fix Loyalty Service” PRD.

Authorize three exemplars in sequence:

1. **Liability snapshot exemplar**  
   Proves temporal valuation authority.

2. **Balance and reversal exemplar**  
   Proves aggregate ownership and correction authority.

3. **Loyalty outbox exemplar**  
   Proves reliable propagation of already-canonical facts.

After those proofs:

- expand producers;
- migrate consumers;
- suppress competing surfaces;
- delete dead paths;
- establish the Canonical Fact and Projection Standard.

The desired end state is not merely fewer bugs.

The desired end state is:

> one authored loyalty history, one correction model, one valuation rule, one balance authority, one propagation path, and one interpretable set of surfaces.
