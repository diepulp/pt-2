# FEATURE INTAKE BRIEF

## A. Feature identity

**Feature name:** Rating Telemetry Classification and Outbox Posture Investigation

**Feature ID / shorthand:** FIB-H-RATING-TELEMETRY-SIGP-001

**Related wedge / phase / slice:** Post-walkthrough diagnostic pass / Rating Slip Average Bet Lifecycle / Transactional Outbox Classification

**Requester / owner:** Product / Architecture

**Date opened:** 2026-05-25

**Priority:** P0 investigation

**Target decision horizon:** Pre-build classification decision / post-Wave-2 backlog triage

**Diagnostic protocol:** SIGP diagnostic protocol — acronym to be confirmed before downstream scaffold.

---

## B. Operator problem statement

A client walkthrough surfaced a rating-slip average-bet concern that now appears to contain two separate issues: the system does not expose a visit-level weighted average across multiple rating slips, and open-slip average-bet edits currently overwrite prior values without preserving their timing. The operator remains the source of intra-slip rating judgment, but when the operator changes the average bet during play, the system may need to preserve that change as rating telemetry rather than silently destroying the previous estimate. Before any feature is designed, the system must determine whether this belongs outside the transactional financial outbox, inside a new rating-telemetry classification, or behind a future propagation path.

---

## C. Pilot-fit / current-slice justification

This investigation is required now because the first rating-delta investigation confirmed a real semantic and aggregation gap: `current_segment_average_bet` is exposed as the active slip’s value, while visit-level weighted average is computable but not currently derived or exposed. It also confirmed a data-model gap: intra-slip volatility cannot be recovered because `average_bet` updates destructively overwrite the previous value without timestamped history. :contentReference[oaicite:0]{index=0}

The proposed remediation now touches classification boundaries. Average-bet changes are related to player valuation and PFT-adjacent interpretation, but they are not themselves cash movement, buy-ins, cash-outs, or financial adjustments. The investigation must use SIGP diagnostics to prevent a bad classification from contaminating PFT, `finance_outbox`, or Wave 2 projection semantics.

---

## D. Primary actor and operator moment

**Primary actor:** Pit boss / floor supervisor

**Secondary actors:** Shift manager, casino operations leadership, architecture reviewer

**When does this happen?**  
During active rated play, when the floor updates an open rating slip’s average bet after observing the patron’s play; during slip close; during visit review; during post-session evaluation.

**Primary surface:**  
Rating slip modal / active slip panel / visit live view / future visit summary surface.

**Trigger event:**  
An operator changes the populated `average_bet` during an open rating slip, or a visit contains multiple rating slips with different operator-attested average bets.

---

## E. Feature Containment Loop

1. Pit boss observes a patron’s play during an open rating slip → system allows the operator to enter or update the current average bet.
2. Pit boss changes the populated average bet after further observation → system behavior must be classified: destructive overwrite, timestamped checkpoint, or interval transition.
3. The rating slip remains open, paused, resumed, or closed → investigation determines whether average-bet timing should follow the slip lifecycle and pause semantics.
4. The slip closes → investigation determines whether the final slip average should remain operator-attested, be system-weighted from operator checkpoints, or expose both values.
5. The visit contains multiple slips → investigation confirms how visit-level weighted average should consume slip-level final averages or interval-derived values.
6. Architecture reviewer applies SIGP diagnostics → system classifies the proposed records/events as rating telemetry, financial fact, projection input, or out-of-scope instrumentation.
7. Reviewer inspects transactional outbox implications → system determines whether rating telemetry belongs in `finance_outbox`, a future `rating_outbox`, direct projection, or no outbox path.
8. Product/architecture records a remediation recommendation → system separates immediate visit rollup, open-slip lifecycle capture, and deferred machine-observed wager telemetry.
9. Follow-up client explanation is prepared → team can distinguish what the floor supervisor provides, what the system computes, and what would require RFID/smart-table instrumentation.

---

## F. Required outcomes

- ApplySIGP diagnostics to the proposed average-bet lifecycle feature and record the diagnostic findings.
- Confirm the feature’s semantic class:
  - financial authority fact,
  - operational financial telemetry,
  - rating telemetry,
  - projection input,
  - surface-only derived value,
  - or out-of-scope machine-observed wager telemetry.
- Determine whether average-bet interval capture should be represented as an append-only rating-domain store, not as PFT.
- Determine whether any rating telemetry event may use `finance_outbox` without violating existing Wave 2 financial event semantics.
- Determine whether a separate propagation surface such as `rating_outbox` or future generalized projection-input stream is required.
- Preserve the distinction between:
  - operator-attested average bet,
  - system-derived slip weighted average,
  - system-derived visit weighted average,
  - machine-observed exact wager average.
- Confirm whether the visit-level weighted average remains a low-risk derived aggregate, separate from rating telemetry propagation.
- Assess whether the proposed feature would require a new ADR before PRD.
- Produce a final recommendation:
  - no build,
  - visit-rollup only,
  - append-only rating interval capture,
  - rating telemetry outbox classification,
  - or defer pending RFID/smart-table integration.

---

## G. Explicit exclusions

- No implementation during this investigation.
- No new PFT row type.
- No mutation of `player_financial_transaction` ownership or semantics.
- No insertion of average-bet changes into PFT.
- No unreviewed use of `finance_outbox` for rating telemetry.
- No claim that the system observes exact wager movement without instrumentation.
- No RFID, camera, smart-table, or real-time chip-tracking integration.
- No hand-level wager tracking.
- No comp automation or player-worth scoring model.
- No change to MTL or compliance ledger semantics.
- No financial reconciliation, settlement, drop, or custody reconstruction.
- No dashboard expansion beyond diagnostic findings.
- No event-platform refactor or multi-consumer fan-out design.

---

## H. Adjacent ideas considered and rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Put average-bet updates into PFT | Average bet influences player valuation and may be discussed near buy-ins/cash movement | PFT represents financial transactions; average-bet changes are rating telemetry, not money movement |
| Emit average-bet updates through `finance_outbox` immediately | Wave 2 already has durable propagation infrastructure | Current `finance_outbox` is classified around financial facts and dependency events; rating telemetry needs classification first |
| Treat operator edits as exact intra-slip wager truth | Buyer may expect software to replace pit observation | The system does not observe every wager; exact wager reconstruction requires RFID/smart-table telemetry |
| Keep destructive overwrite behavior | Simplest current behavior | Silently loses timing of operator-attested changes and prevents lifecycle-weighted slip close calculation |
| Build `rating_slip_bet_segment` immediately | It likely solves lifecycle capture | Needs SIGP diagnostic classification and outbox posture review before build |
| Use client-side calculation from visible slip data | Fast UI patch | Domain math and lifecycle semantics must not drift into component-only behavior |

---

## I. Dependencies and assumptions

- First investigation confirmed visit-level weighted average is computable today from existing slip duration and average-bet fields.
- First investigation confirmed `average_bet` updates are destructive overwrites with no timestamp or history.
- Existing Wave 2 posture treats transport health separately from workflow-level producer coverage; each event type must be certified through the real workflow surface expected to emit it. :contentReference[oaicite:1]{index=1}
- Existing producer-anchor standard distinguishes visit-level aggregation from slip-scoped correction and warns that visit context alone can be too broad for lower-level fact resolution. :contentReference[oaicite:2]{index=2}
- Operator average-bet input is treated as operator-attested rating judgment, not machine-observed wager truth.
- PFT remains the ledger-authoritative financial transaction store.
- Rating telemetry may influence projections, theo, comp context, and review surfaces without becoming financial authority.
- Any outbox expansion must respect existing Wave 2 constraints and avoid semantic drift.

---

## J. Out-of-scope but likely next

- PRD for visit-level weighted average bet rollup.
- ADR/RFC for rating telemetry classification.
- PRD for append-only `rating_slip_average_bet_interval` or equivalent.
- PRD for UI label separation:
  - Current Segment Avg Bet
  - Final Slip Weighted Avg Bet
  - Visit Weighted Avg Bet
- Future ADR for `rating_outbox` or generalized projection-input propagation, if diagnostics justify it.

---

## K. Expansion trigger rule

Amend this brief if downstream artifacts propose:

- adding average-bet events to `finance_outbox`,
- creating a new outbox table,
- adding a new event category to the Wave 2 event taxonomy,
- changing PFT schema or semantics,
- changing rating-slip lifecycle states,
- changing visit/rating-slip topology,
- adding RFID/smart-table/camera telemetry,
- adding comp automation or theo calculation as an operator-visible outcome,
- introducing external consumer contracts,
- adding a new dashboard or top-level surface,
- using rating telemetry for compliance or accounting claims.

---

## L. Scope authority block

**Intake version:** v0

**Frozen for downstream design:** No — investigation brief only

**Downstream expansion allowed without amendment:** No

**Open questions allowed to remain unresolved at scaffold stage:**

- Whether rating telemetry deserves a new ADR or can be handled by PRD-local classification.
- Whether `rating_slip.average_bet` should remain as a denormalized current/final field.
- Whether interval capture should begin on slip open, first average-bet entry, or first average-bet update.
- Whether pause/resume should close intervals or suspend duration accumulation.
- Whether final slip average should overwrite `rating_slip.average_bet` or be stored separately.
- Whether rating telemetry should ever propagate through an outbox before post-pilot scaling.
- Whether visit weighted average should include active slips by default.

**Human approval / sign-off:** Pending

---

## Scope Authority Statement

This investigation exists to evaluate the proposed average-bet lifecycle feature through SIGP diagnostics before any build decision.

The investigation must answer:

> Is operator-entered average-bet change history rating telemetry, and if so, how should it be stored, derived, and classified without contaminating PFT or the transactional financial outbox?

The investigation must not become an implementation plan for RFID tracking, exact wager reconstruction, comp automation, financial reconciliation, or event-platform expansion.