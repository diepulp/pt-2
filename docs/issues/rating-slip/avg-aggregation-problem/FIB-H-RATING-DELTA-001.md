# FEATURE INTAKE BRIEF

## A. Feature identity

**Feature name:** Rating Slip Delta Reconciliation Posture Investigation

**Feature ID / shorthand:** FIB-H-RATING-DELTA-001

**Related wedge / phase / slice:** Post-walkthrough domain posture investigation / Rating Slip + Visit Aggregation

**Requester / owner:** Product / Architecture

**Date opened:** 2026-05-25

**Priority:** P0

**Target decision horizon:** Pilot readiness / pre-client follow-up

---

## B. Operator problem statement

During a client walkthrough, the client asked how the system reconciles changing average bets across multiple rating slips within a single player visit. The current system appears to preserve average bet at the individual rating-slip level but does not expose a visit-level weighted average, intra-slip bet-change history, or clear reconciliation explanation. This creates a risk that pit bosses, floor supervisors, or management may interpret the current slip average as the player’s visit-level rated betting behavior, especially when a player moves tables or changes betting level frequently.

---

## C. Pilot-fit / current-slice justification

This investigation is required now because the walkthrough surfaced a real buyer-facing trust question: whether the system can explain rated betting behavior across a player’s visit without misleading operators. The issue touches core rating workflow credibility, player valuation, comp judgment, session review, and operational auditability. Without investigation, the system may continue exposing technically correct slip-level values that are semantically incomplete at the visit level.

This is not yet a feature-build request. The immediate need is to assess the system posture, quantify the magnitude of the gap, determine whether the current topology is sufficient, and recommend the smallest correct remediation path.

---

## D. Primary actor and operator moment

**Primary actor:** Pit boss / floor supervisor

**Secondary actors:** Shift manager, casino operations leadership, player development / host role if applicable

**When does this happen?**  
During active rated play, table movement, rating slip close, visit review, and post-session evaluation.

**Primary surface:**  
Rating slip modal / visit live view / player visit summary / session review surfaces.

**Trigger event:**  
A player changes average bet frequently, moves tables during a visit, or accumulates multiple rating slips under one visit.

---

## E. Feature Containment Loop

1. Pit boss opens an active player visit → system shows the current rating slip and current segment average bet.
2. Player changes betting level during the slip → system allows the operator to update the slip-level average bet.
3. Player moves tables or creates additional slips under the same visit → system stores each slip as a separate visit segment.
4. Pit boss or manager reviews the visit → system should distinguish current segment average bet from visit-level average bet.
5. Reviewer asks how the visit-level number was derived → system should be able to explain whether it is latest-slip, simple average, duration-weighted, or unavailable.
6. Architecture reviewer inspects the current data model and services → system posture is assessed for whether true weighted aggregation is currently possible.
7. Investigation identifies whether intra-slip bet-change history exists → system determines whether true delta-over-time calculation is feasible or only slip-level approximation is possible.
8. Product/architecture decides remediation path → system records whether this is a bounded DTO/projection fix, a new bet-segment model, or a deferred post-pilot enhancement.
9. Follow-up client explanation is prepared → team can accurately state what the current system does, what it does not yet do, and what the planned correction is.

---

## F. Required outcomes

- Determine whether the current system can compute a valid visit-level average bet from existing data.
- Distinguish clearly between:
  - current segment average bet,
  - slip-level average bet,
  - visit-level weighted average bet,
  - intra-slip bet-change delta history.
- Identify every surface/API/DTO where `average_bet` or equivalent values are exposed.
- Determine whether existing `rating_slip.accumulated_seconds`, pause intervals, open/closed status, and visit anchoring are sufficient for a pilot-level duration-weighted calculation.
- Determine whether true intra-slip bet volatility requires a new append-only `rating_slip_bet_segment` / `bet_observation` model.
- Assess the magnitude of the gap:
  - semantic labeling issue only,
  - derived aggregation gap,
  - data model gap,
  - operator workflow gap,
  - auditability gap.
- Recommend the smallest correct remediation path without reopening visit/rating-slip topology unless evidence requires it.

---

## G. Explicit exclusions

- No implementation during this investigation.
- No new UI surface unless recommended as a later remediation.
- No mutation of existing rating slip behavior during the investigation.
- No change to visit topology unless the investigation proves the current model cannot support the domain.
- No financial reconciliation, settlement logic, drop calculation, or accounting authority.
- No comp-rule automation.
- No player-worth scoring model.
- No analytics dashboard expansion.
- No historical migration design beyond feasibility assessment.
- No attempt to model every hand-level wager.
- No event-sourcing redesign.

---

## H. Adjacent ideas considered and rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Simple average across slips | Easy to compute from existing `segments[]` | Mathematically wrong because short and long slips would carry equal weight |
| Latest-slip average as visit average | Current live view effectively behaves this way | Misleading when the player recently changed tables or bet level |
| Creating a new rating slip for every bet change | Would preserve intervals | Overloads rating slip semantics; slips should represent table/session segments, not every wager delta |
| Full hand-by-hand wager tracking | Would provide the most precise average | Too heavy for pilot and likely mismatched to operator workflow |
| Client-side aggregation from `segments[]` | Fastest UI patch | Puts domain math in the wrong layer and risks inconsistent surface behavior |
| Reopening visit/rating-slip/PFT topology | The gap touches visit aggregation | Current topology likely remains valid; the missing piece is derived aggregation and possibly bet-change history |

---

## I. Dependencies and assumptions

- A visit may contain multiple rating slips.
- A rating slip represents a table-session segment within a visit.
- `rating_slip.average_bet` is mutable while open/paused and frozen when closed.
- Current visit live view exposes current segment average bet and optionally segment arrays.
- Existing slip duration / accumulated seconds are available or derivable.
- Pause intervals must be excluded or handled consistently in duration calculations.
- The system should preserve surface truthfulness: values must be labeled by what they actually represent.
- The investigation should treat average bet as rated operational telemetry, not accounting truth.
- Current architecture should be presumed valid unless the data model cannot support even a pilot-level duration-weighted aggregate.

---

## J. Out-of-scope but likely next

- PRD for visit-level weighted average bet projection or DTO enhancement.
- PRD for append-only intra-slip bet-change history if current data cannot support true delta reconciliation.
- UI copy/labeling update distinguishing “Current Segment Avg Bet” from “Visit Weighted Avg Bet.”
- Operator-facing explanation panel showing segment contribution to visit average.

---

## K. Expansion trigger rule

Amend this brief if downstream artifacts propose:

- a new rating-slip lifecycle state,
- a new top-level surface,
- hand-level wager tracking,
- comp automation,
- player valuation scoring,
- financial reconciliation or accounting claims,
- changes to visit ownership semantics,
- changes to PFT/MTL topology,
- external integration with a casino management or player-tracking system,
- migration of historical player rating data.

---

## L. Scope authority block

**Intake version:** v0

**Frozen for downstream design:** No — investigation brief only

**Downstream expansion allowed without amendment:** No

**Open questions allowed to remain unresolved at scaffold stage:**

- Whether existing slip duration fields are reliable enough for weighted aggregation.
- Whether pause intervals are already excluded from accumulated play duration.
- Whether average bet updates are timestamped anywhere today.
- Whether operators expect “average bet” to mean slip-level estimate or visit-level weighted estimate.
- Whether table moves should prefill prior average bet as operator convenience.
- Whether visit-level average bet should include only closed slips, active slips, or both with lifecycle labeling.

**Human approval / sign-off:** Pending

---

## Scope Authority Statement

This investigation exists to determine whether PT-2 can truthfully explain a player’s rated betting behavior across a visit when average bet changes over time and across rating slips.

The investigation must answer:

> Does the system have enough information to compute a duration-weighted visit average bet, and if not, what is the smallest correct model change required?

The investigation must not become a broad redesign of visit, rating slip, financial transaction, MTL, comp, or reconciliation architecture.