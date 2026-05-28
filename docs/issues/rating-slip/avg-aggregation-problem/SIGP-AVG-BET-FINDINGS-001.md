# SIGP Findings: Average-Bet Lifecycle Classification
## Rating Telemetry and Outbox Posture

**Document type:** Semantic Integrity Governance Protocol — Findings Report  
**Protocol reference:** SEMANTIC_INTEGRITY_GOVERNANCE_PROTOCOL.md  
**Review ID:** SIGP-AVG-BET-FINDINGS-001  
**Artifact under review:** FIB-H-RATING-TELEMETRY-SIGP-001  
**Prior investigation:** FIB-H-RATING-DELTA-001-investigation.md  
**Reviewer:** Architecture / Product  
**Date:** 2026-05-25  
**Status:** Draft — pending human sign-off

---

## Step 1 — Review Scope

**Artifact reviewed:** FIB-H-RATING-TELEMETRY-SIGP-001 — investigation brief for average-bet lifecycle classification and outbox posture.

**Bounded contexts touched:**
- Rating Slip (primary authoring context)
- Visit (aggregation consumer)
- Financial Outbox / Wave 2 propagation substrate (classification boundary at risk)

**Tables / services / surfaces touched:**
- `rating_slip.average_bet` — destructively overwritten on operator edit
- `services/rating-slip/crud.ts:585` — `updateAverageBet()` (confirmed destructive overwrite)
- `rpc_get_visit_live_view()` — exposes `current_segment_average_bet` from active slip only
- `VisitLiveViewDTO` (`services/visit/dtos.ts:239`) — one field, no visit-level aggregate
- 15 surfaces rendering `average_bet` without context label (confirmed by DELTA-001 investigation)
- `finance_outbox` — proposed routing target, classification undecided

**Propagation or projection involved:** Yes — potential outbox emission of average-bet changes; visit-level weighted average is a derived projection computable from existing data.

**User-visible meaning changes:** Yes — operator-visible average bet currently implies a complete record but is a destructive terminal value.

---

## Step 2 — Trigger Check

The following mandatory triggers (SIGP §4.1) apply:

| # | Trigger | Evidence |
|---|---|---|
| 1 | Cross-context propagation | Proposed routing of average-bet changes to `finance_outbox` or a future `rating_outbox` |
| 4 | Visit and session aggregates | Visit-level weighted average is computable but absent from any authoritative surface |
| 5 | User-visible totals and summaries | 15 surfaces show `average_bet` without completeness or context label |
| 6 | Multiple surfaces consuming same source fact | All 15 surfaces read from `rating_slip.average_bet` directly |
| 7 | New domain term affecting authority | "Rating telemetry" is being introduced without stable definition |
| 10 | Two stores appearing to own the same fact | Rating Slip owns intra-slip value; Visit appears to expect a visit-level aggregate; neither owns both |

Protocol is **mandatory**. Advisory triggers also apply (UI values requiring disclaimers; term used inconsistently across docs and code).

---

## Step 3 — Diagnostic Pass Results

### 7.1 Authority Audit

| Question | Finding |
|---|---|
| What owns authoritative truth? | Pit boss / floor supervisor — operator-attested judgment, not machine-observed wager |
| Which facts are authored? | `rating_slip.average_bet` — operator entry via rating slip modal |
| Which facts are observed? | None — exact wager observation requires RFID/smart-table (explicitly excluded) |
| Which facts are estimated? | The average bet itself — it is the operator's estimate of representative wager, not a computed figure |
| Which facts are derived? | Visit-level weighted average (derivable from `average_bet × final_duration_seconds` per slip) |
| Which facts are external? | Machine-observed exact wager average — out of scope for this investigation |
| Can authority degrade? | **Yes** — operator enters $50, later changes to $200; $50 is silently erased. The record looks authoritative but is incomplete. |
| Are corrections mutations or new facts? | Currently mutations (destructive overwrite). This is the fracture. |
| Can two surfaces disagree? | Currently no — but if visit-level weighted average is added, it may diverge from the segment average, creating display confusion without labels |
| Settlement / finality implied? | `average_bet` at slip close implies finality; it is actually the last editor value with no lifecycle guarantee |

**Fracture detected:** FR-001 — Authority Ambiguity. The system presents the terminal `average_bet` value as operator-authoritative, but silently erases all prior operator judgments during the slip lifecycle. The value is not a complete attestation; it is the survivor of destructive updates.

---

### 7.2 Aggregate Ownership Audit

| Question | Finding |
|---|---|
| Which aggregate owns lifecycle truth? | Rating Slip owns intra-slip lifecycle (open → pause → resume → close) |
| Which aggregate owns average-bet truth? | Rating Slip owns the field; no intra-slip bet-change sub-lifecycle is defined |
| Which aggregate owns visit-level aggregation? | Undefined — Visit context expects it, but no aggregate produces it |
| Is another context reconstructing the same lifecycle? | Not currently — but Visit's RPC would need to reconstruct it from Rating Slip data |
| Is a summary table acting as source of record? | No new tables yet; risk exists if visit rollup is added without formal ownership |
| Can one aggregate close while another is open? | Yes — a visit can have closed slips (contributing to weighted average) and one open slip (contributing live data) |
| Is there a canonical transition boundary? | For slip lifecycle: yes. For bet-change lifecycle inside a slip: no — this is the gap |

**Fracture detected:** FR-002 — Lifecycle Ambiguity. The rating slip lifecycle is defined (open/pause/resume/close), but no sub-lifecycle exists for average-bet changes within an open slip. First entry, intra-slip edit, and final value are all collapsed into the same field with no timeline.

No aggregate split-brain currently — Rating Slip is clearly the authoring source. Gap is the absence of a visit-level aggregation owner, not a conflict between two owners.

---

### 7.3 Propagation Integrity Audit

| Question | Finding |
|---|---|
| What is propagated today? | Nothing — average-bet changes are local writes with no outbox emission |
| What is proposed? | Some future outbox emission — category unclassified |
| What semantic category applies? | Not established. The FIB correctly excludes PFT, but no positive classification is made |
| Is it an authority fact? | No — it is operator-attested rating judgment, not a financial transaction |
| Is it a telemetry fact? | Likely — but "rating telemetry" is not yet a defined category in the Wave 2 taxonomy |
| Is it a dependency event? | Possibly — if downstream projection (theo, comp context) would consume it |
| Is it a projection input? | Possibly — if visit-level aggregation is driven by propagated events rather than direct DB reads |
| Could it route through `finance_outbox`? | No — `finance_outbox` is classified around financial authority facts and dependency events. Average-bet changes are rating telemetry. Contamination risk is high. |
| Does a `rating_outbox` exist? | No |
| Can events be replayed deterministically? | Not today — destructive overwrite means no event log exists to replay |
| Does transport risk being confused with domain authority? | Yes — if emitted without stable category, consumers may treat propagated value as financial authority |

**Fracture detected:** FR-003 — Propagation Ambiguity. The semantic category of average-bet changes has not been established. Routing them through `finance_outbox` would contaminate financial event semantics. No alternative outbox exists. The feature cannot be classified into an outbox without a classification decision that currently does not exist.

---

### 7.4 Surface Truthfulness Audit

| Question | Finding |
|---|---|
| What will the user infer? | That the displayed average bet is the complete, final, operator-attested value for the slip or visit |
| Is the value complete? | No — it is the last write; prior operator estimates are gone |
| Is authority visible? | No — no label distinguishes operator-attested from system-derived |
| Are mixed-origin values labeled honestly? | Not applicable yet — visit-level aggregate not exposed; when it is, labels will be needed |
| Can operators mistake operational visibility for financial truth? | Low risk at current scope; higher risk if visit-level weighted average is labeled without qualifying language |
| Can stale or missing data appear current? | Yes — if an operator updated average bet 45 minutes ago and has since changed tables, the slip still shows the terminal value as if it is the current estimate |
| Are there 15 surfaces with unlabeled values? | Yes — confirmed by DELTA-001 investigation |

**Fracture detected:** FR-004 — Surface Misrepresentation. Fifteen surfaces render `average_bet` without communicating that it is the terminal overwritten value, not a complete lifecycle summary. The absence of a visit-level weighted average creates an implicit completeness claim — operators see one number and have no signal that it excludes prior estimates.

---

### 7.5 Vocabulary Integrity Audit

| Concept | Where used | What it means |
|---|---|---|
| "average bet" (raw) | `rating_slip.average_bet`, 15 surfaces, operator speech | Conflated across all uses below |
| "current segment average bet" | `VisitLiveViewDTO`, some surface labels | Active slip's terminal overwritten value |
| "final slip average bet" | Not currently implemented | What the slip's average bet is at close (same as above under current model; would differ under interval model) |
| "slip-lifetime weighted average" | Not currently implemented | Weighted average computed from interval history, if intervals existed |
| "visit weighted average bet" | Not implemented | Duration-weighted aggregate across all slips in a visit |
| "machine-observed exact wager average" | Explicitly excluded | RFID/smart-table computed average — out of scope |

Five distinct concepts, one term. The FIB's Section F correctly separates the four in-scope variants, but none of the separations are implemented in code or stable in documentation.

**Fracture detected:** FR-005 — Vocabulary Overload. "Average bet" collapses at minimum four distinct in-scope semantic concepts: (1) operator active estimate on open slip, (2) terminal operator-attested value at slip close, (3) slip-lifetime weighted average from interval history, (4) visit-level weighted average from multiple slips. Until this vocabulary is canonicalized, implementation will produce silent drift between contexts, labels, and consumers.

---

### 7.6 Projection Dependency Audit

| Question | Finding |
|---|---|
| What inputs are required for visit-level weighted average? | `rating_slip.average_bet` (per slip) × `final_duration_seconds` (per slip) ÷ sum of durations |
| Which inputs are authoritative? | `average_bet` — operator-attested; `final_duration_seconds` — system-computed from lifecycle timestamps |
| Which inputs may be missing? | Active slip: `final_duration_seconds` is not yet set (slip is open); live duration available from `rpc_get_rating_slip_duration()` |
| Is the projection deterministic? | Yes — formula is stable given inputs |
| Can it be rebuilt from events? | No — under the current destructive overwrite model, past `average_bet` values are gone |
| Does ordering matter? | No for visit-level weighted average (sum commutes) |
| What is the lifecycle window? | Full visit (closed slips + optionally active slip) |
| What happens when a dependency arrives late? | Not applicable — direct DB read from `rating_slip` rows; no event dependency currently |

**Fracture detected:** FR-006 — Projection Drift (S1). Visit-level weighted average is computable from existing authority data today. The calculation is absent from `rpc_get_visit_live_view()`. Risk is low-grade currently but creates surface pressure to implement the math in UI components rather than the authoritative RPC. The first investigation already identified this as the immediate safe remediation path.

---

### 7.7 Operational Reality Audit

| Question | Finding |
|---|---|
| Does the model reflect how operators work? | Partially — operators do update the average bet during play; the system allows edits but loses history |
| Are operators mentally bridging missing state? | Likely — if a player's play quality changed mid-slip, the floor supervisor has no system record of the earlier estimate |
| Does the system invent a concept operations won't recognize? | No — "visit weighted average bet" is a concept pit management recognizes; "rating interval" is an architectural term that should not surface to operators |
| Does the model force workflow distortion? | Currently no — but if interval capture is added with operator-visible "segments," operators may be confused by architecture concepts |
| Are compliance concepts softened for UI convenience? | Not applicable at this scope |
| Does the abstraction reduce or increase operator ambiguity? | Current model increases ambiguity — one number across 15 surfaces implies false completeness |

No additional fracture from operational reality. The model gap is real and matches legitimate floor behavior. The proposed remediation (expose visit-level weighted average alongside segment average) aligns with how pit management actually evaluates session quality.

---

## Step 4 — Fracture Classification

| ID | Name | Type | Severity | Affected Contexts | Risk if Ignored |
|---|---|---|---|---|---|
| FR-001 | Destructive Overwrite Misrepresents Operator History | Authority Ambiguity | **S3** | Rating Slip, Visit, any downstream consumer of `average_bet` | Projections and visit aggregations are based on terminal value only; no signal that prior estimates existed or changed significantly during the slip |
| FR-002 | No Intra-Slip Bet-Change Lifecycle | Lifecycle Ambiguity | **S2** | Rating Slip | Interval capture (if built) cannot anchor to defined lifecycle events; timing of operator adjustments is structurally unrecoverable |
| FR-003 | No Semantic Category for Average-Bet Changes | Propagation Ambiguity | **S3** | Rating Slip, Financial Outbox, Wave 2 taxonomy | Any outbox routing decision made before classification contaminates the financial event stream or creates an uncategorized propagation path |
| FR-004 | 15 Surfaces Imply Completeness Without Labeling | Surface Misrepresentation | **S2** | All surfaces rendering `average_bet` | Operators misread the terminal value as a complete lifecycle summary; visit-level absence is invisible |
| FR-005 | "Average Bet" Collapses 4+ Distinct Concepts | Vocabulary Overload | **S3** | Code, UI, docs, operator speech, future ADR/PRD authors | Implementation will produce silent semantic drift between contexts and consumers; labels, DTO fields, and event names will be inconsistent |
| FR-006 | Visit Weighted Average Computable but Absent | Projection Drift | **S1** | Visit RPC, VisitLiveViewDTO | Ad-hoc UI-level computation of the weighted average; divergence between RPC-derived and component-derived values |

The S3 fractures (FR-001, FR-003, FR-005) form a coherent cluster: the authority, propagation, and vocabulary dimensions of average-bet lifecycle are all undefined at the same time. They cannot be resolved independently — a vocabulary decision drives the authority decision, which drives the propagation classification.

---

## Step 5 — Disposition

| Fracture | Disposition | Rationale |
|---|---|---|
| FR-001 (S3) | **Canonicalization Directive required** | Authority class must be defined before interval capture or outbox routing is designed |
| FR-002 (S2) | **Defer with register entry** | Interval capture depends on FR-001 resolution; no build yet |
| FR-003 (S3) | **Canonicalization Directive required** | Cannot route to any outbox without a classification decision |
| FR-004 (S2) | **Defer with register entry** | Label fix is safe and desirable; blocked only on vocabulary (FR-005) stabilization for consistent copy |
| FR-005 (S3) | **Canonicalization Directive required** | Vocabulary must be stable before any PRD, ADR, or surface label is written |
| FR-006 (S1) | **Clear — proceed** | Visit-level weighted average rollup is computable today from authority data; no new semantic classification needed; existing RPC extension with no schema change |

---

## Step 6 — Containment Rules

While the Canonicalization Directive is open, the following are **prohibited**:

1. No average-bet change events may be routed through `finance_outbox` — the semantic category is unclassified and contamination of the financial event stream is a blocking risk.
2. No new `finance_outbox` event type may reference `average_bet` or any variant of it.
3. No new implementation may introduce a `rating_outbox`, `rating_telemetry_outbox`, or equivalent table until the classification decision is recorded in an ADR.
4. No new DTO field or UI label may introduce the term "Final Slip Weighted Avg Bet," "Slip Lifetime Average," or equivalent until FR-005 vocabulary is canonicalized.
5. No implementation may append-write a `rating_slip_bet_segment` or equivalent interval table until FR-001 and FR-002 are resolved by the Canonicalization Directive.
6. No PFT row type may reference average-bet values in any form.

**Allowed while open:**
- Visit-level weighted average computation in `rpc_get_visit_live_view()` — FR-006 is cleared.
- DTO field addition for `visit_weighted_avg_bet` to `VisitLiveViewDTO`.
- UI label update distinguishing "Current Segment Avg Bet" from "Visit Weighted Avg Bet" — may proceed after vocabulary decision in FR-005 is recorded (can be drafted in parallel with the Canonicalization Directive, not after).
- Internal investigation and drafting of the Canonicalization Directive.

---

## Step 7 — Downstream Actions

| Fracture Cluster | Required Artifact | Priority |
|---|---|---|
| FR-005 + FR-001 + FR-003 (S3 cluster) | **Canonicalization Directive** (see below) | P0 — before any build |
| FR-006 (cleared) | **PRD** — visit-level weighted average RPC extension | Immediate — safe to build |
| FR-002 (S2) | **PRD** — append-only `rating_slip_average_bet_interval` (after Directive resolves FR-001) | Deferred |
| FR-004 (S2) | **PRD amendment** — UI label separation across 15 surfaces (unblocked once FR-005 vocabulary decision is recorded) | Near-term |
| FR-003 (S3) | **ADR** — rating telemetry classification and outbox posture (produced by Directive) | Required before interval capture build |

---

---

# Semantic Risk Register Entries

---

## SRR-AVG-001

**Risk ID:** SRR-AVG-001  
**Name:** Destructive Overwrite Misrepresents Operator Authority  
**Date opened:** 2026-05-25  
**Severity:** S3  
**Fracture type:** Authority Ambiguity  
**Affected contexts:** Rating Slip (authoring), Visit (aggregation), any downstream consumer  
**Affected artifacts:** `rating_slip.average_bet`, `services/rating-slip/crud.ts:585`, `VisitLiveViewDTO`

**Current behavior:**  
`updateAverageBet()` performs a destructive overwrite of `rating_slip.average_bet` with no timestamp, no prior-value preservation, and no lifecycle event. If a pit boss changes average bet from $50 to $200 mid-slip, $50 is permanently erased.

**Semantic fracture:**  
The terminal value in `average_bet` is displayed and consumed as if it is a complete operator attestation of the full slip. It is not — it is the last surviving value after an unknown number of overwrites. The system cannot distinguish "played 2 hours at $200" from "played 1 hour at $50 then 1 hour at $200, supervisor updated accordingly."

**Why this matters:**  
Visit-level aggregation, theo context, and future comp inputs will all be based on an incomplete record. The intra-slip signal of player behavior change — which a floor supervisor is explicitly tracking — is structurally unrecoverable.

**Temporary containment:**  
No interval capture or intra-slip history may be built without resolving this via the Canonicalization Directive. No new consumer may treat `average_bet` as representing full lifecycle authority.

**Allowed work while open:**  
Visit-level weighted average RPC extension using the terminal `average_bet` per closed slip. This is technically honest (it uses the authority value per slip, however incomplete the intra-slip history is) and is the lowest-risk remediation.

**Blocked work while open:**  
Any `rating_slip_bet_segment` or equivalent interval table. Any audit claim based on `average_bet` change history.

**Resolution trigger:**  
Canonicalization Directive produces authority class and correction model for average-bet lifecycle.

**Likely resolution artifact:** ADR (rating telemetry classification) + PRD (append-only interval capture)

**Owner:** Architecture / Product  
**Status:** Open

---

## SRR-AVG-002

**Risk ID:** SRR-AVG-002  
**Name:** Intra-Slip Bet-Change Lifecycle Undefined  
**Date opened:** 2026-05-25  
**Severity:** S2  
**Fracture type:** Lifecycle Ambiguity  
**Affected contexts:** Rating Slip  
**Affected artifacts:** `rating_slip` lifecycle states, no interval sub-model exists

**Current behavior:**  
The rating slip has defined lifecycle states (open, paused, resumed, closed). There is no sub-lifecycle for average-bet changes within an open slip: no first-entry event, no change-event, no interval boundary, no duration-weighted segment record.

**Semantic fracture:**  
If interval capture is built without a defined lifecycle anchor, intervals will not cleanly correspond to slip lifecycle transitions (open, pause, resume). The interval start/end model will be invented ad-hoc.

**Why this matters:**  
Pause semantics in duration calculation already exclude paused time (`final_duration_seconds` subtracts `rating_slip_pause` entries). Interval-level averages must follow the same exclusion logic or they will diverge from existing duration math.

**Temporary containment:**  
No `rating_slip_bet_segment` implementation may proceed. No draft PRD for interval capture may be written until the Canonicalization Directive defines the lifecycle anchor points.

**Allowed work while open:**  
Investigation of pause semantics and their relation to a future interval lifecycle.

**Blocked work while open:**  
Any implementation of interval capture, any migration adding interval tables.

**Resolution trigger:**  
Canonicalization Directive defines interval lifecycle anchors (slip-open, first-entry, each-edit, pause-boundary, close).

**Likely resolution artifact:** PRD — append-only interval capture

**Owner:** Architecture  
**Status:** Open

---

## SRR-AVG-003

**Risk ID:** SRR-AVG-003  
**Name:** No Semantic Category for Average-Bet Changes  
**Date opened:** 2026-05-25  
**Severity:** S3  
**Fracture type:** Propagation Ambiguity  
**Affected contexts:** Rating Slip, Financial Outbox, Wave 2 taxonomy  
**Affected artifacts:** `finance_outbox`, Wave 2 event taxonomy, future `rating_outbox`

**Current behavior:**  
Average-bet changes are local writes only. No outbox emission exists. Wave 2 outbox is classified around financial authority facts and dependency events (ADR-052 through ADR-056). Rating telemetry is not a defined category in that taxonomy.

**Semantic fracture:**  
Any outbox routing decision made before classification is established either (a) contaminates `finance_outbox` by introducing non-financial events, or (b) creates an unclassified propagation path that consumers may misinterpret as financial authority.

**Why this matters:**  
Wave 2 posture is closed (PRD-089). Introducing an uncategorized event type reopens classification decisions that were deliberately finalized. The ADR-058 Feature Classification Gate exists precisely to prevent this.

**Temporary containment:**  
No average-bet change event may be routed through `finance_outbox`. No new outbox table may be created without an ADR classifying the event category. No consumer may receive average-bet propagation signals.

**Allowed work while open:**  
Classification investigation. Drafting of the ADR that defines the rating telemetry category.

**Blocked work while open:**  
Any outbox implementation, any producer code for average-bet events, any consumer that expects a propagated average-bet value.

**Resolution trigger:**  
ADR produced by Canonicalization Directive establishes rating telemetry as a named, classified event category with defined outbox posture.

**Likely resolution artifact:** ADR (rating telemetry classification and outbox posture)

**Owner:** Architecture  
**Status:** Open

---

## SRR-AVG-004

**Risk ID:** SRR-AVG-004  
**Name:** 15 Surfaces Imply Completeness Without Label  
**Date opened:** 2026-05-25  
**Severity:** S2  
**Fracture type:** Surface Misrepresentation  
**Affected contexts:** All surfaces rendering `average_bet`  
**Affected artifacts:** Pit terminal, rating slip modal, active slips panel, visit live view, 11 additional surfaces (DELTA-001 confirmed)

**Current behavior:**  
Fifteen surfaces render `average_bet` without any label indicating it is the terminal overwritten value, not a lifecycle-weighted summary. No surface shows visit-level weighted average.

**Semantic fracture:**  
Operators reading the displayed value infer it represents their complete assessment of the player's average wager. It represents only the last edit. When a visit contains multiple slips, there is no surface showing how slips aggregate.

**Why this matters:**  
Operator decisions about player valuation, comp, and session quality may be based on an incomplete or misleading signal. A visit where the player dramatically raised average bets mid-session looks identical to a steady session.

**Temporary containment:**  
No new surface may add `average_bet` without a context label. No surface may label any value "Final Avg Bet" or "Visit Avg Bet" until the vocabulary decision (FR-005) is recorded.

**Allowed work while open:**  
Auditing the 15 surfaces for label copy readiness. Drafting label language for review pending FR-005 vocabulary resolution.

**Blocked work while open:**  
Shipping new label copy that names the value category before vocabulary is stable.

**Resolution trigger:**  
FR-005 vocabulary canonicalized; label separation PRD drafted and approved.

**Likely resolution artifact:** PRD — UI label separation (Current Segment Avg Bet / Visit Weighted Avg Bet)

**Owner:** Product  
**Status:** Open

---

---

# Canonicalization Directive

**Directive ID:** CANON-AVG-BET-001  
**Triggered by:** FR-001, FR-003, FR-005 (S3 cluster)  
**Date:** 2026-05-25

---

## 1. Problem

The average-bet lifecycle feature cannot be designed or built because three foundational semantic questions are simultaneously open:

1. **Authority class**: What does `average_bet` represent — operator active estimate, terminal attestation, or interval-weighted fact?
2. **Propagation category**: If average-bet changes are emitted, what semantic class do they belong to — rating telemetry, projection input, dependency event, or surface-only derived value?
3. **Vocabulary**: What is each distinct concept called, in a stable way, across code, UI, docs, and operator speech?

These three cannot be resolved independently. The vocabulary decision constrains the authority model; the authority model drives the propagation classification.

---

## 2. Affected Contexts

| Context | Role |
|---|---|
| Rating Slip | Authoring source; `average_bet` field; slip lifecycle |
| Visit | Aggregation consumer; visit-level weighted average |
| Financial Outbox / Wave 2 | Classification boundary; blocked unless category is defined |
| UI surfaces (15) | Rendering; blocked on stable vocabulary |

---

## 3. Current Competing Meanings

| Concept | Meaning A | Meaning B | Where seen |
|---|---|---|---|
| `average_bet` | Operator's current active estimate on open slip | Terminal value at slip close, surviving all overwrites | `rating_slip` table field; all 15 surfaces |
| "average bet" (operator speech) | Representative wager quality this session | Precise average of individual hand bets | Operator discussion; FIB language |
| "segment average bet" | Current slip's value | Active duration window's value | UI label (inconsistently applied) |
| "visit average bet" | Sum of slip averages / slip count | Duration-weighted sum / total duration | Not implemented; implied by operator expectation |

---

## 4. Required Decisions

**Authority:**  
Decide whether `average_bet` on a closed slip is:
- (A) terminal operator attestation — the final judgment the supervisor committed at close, authoritative as-is, or
- (B) a lossy summary of interval history — not authoritative over the full lifecycle, superseded by an interval record if one is created.

**Correction model:**  
Decide whether an operator change to `average_bet` on an open slip is:
- (A) a correction (new authoritative value replaces prior), or
- (B) a new fact (prior value preserved, new value appended with timestamp).
This decision drives whether interval capture is needed and what form it takes.

**Aggregate owner:**  
Decide which aggregate produces the visit-level weighted average: the Visit context (as a derived projection from closed slips) or a new summary computed and cached at slip close. Confirm it is never a UI-level calculation.

**Propagation category:**  
Decide whether average-bet changes belong to:
- rating telemetry (operator-attested rating judgment — not financial authority),
- projection input (feeds downstream theo/comp without being a fact),
- or surface-only derived value (computed on read, never propagated).

If rating telemetry: decide whether they require a new outbox, or can be handled by direct projection reads without propagation during the pilot phase.

**Surface rendering rule:**  
Define the canonical label set:
- "Current Segment Avg Bet" — active slip's `average_bet` (operator entry, terminal overwrite)
- "Visit Weighted Avg Bet" — duration-weighted aggregate of closed slips (+ active slip if included)
- No other average-bet label variants may be introduced until a future PRD explicitly names them

**Vocabulary decision:**  
Retire the unqualified term "average bet" in system artifacts. It remains valid in operator speech but must not appear unqualified in code identifiers, DTO fields, UI labels, ADR/PRD titles, or event names.

**Projection rule:**  
Visit-level weighted average is a derived projection, not an authority fact. It must be computed in the RPC, not in UI components. It must declare completeness: "closed slips only" or "closed slips + active slip live estimate" — the label must match the completeness rule.

---

## 5. Explicit Non-Goals

- No RFID, smart-table, or exact wager observation.
- No PFT involvement.
- No `finance_outbox` routing without an ADR classifying the event type.
- No comp automation or theo calculation.
- No new outbox table created before the propagation category decision.
- No interval capture implementation before authority and correction model decisions.
- No multi-consumer fan-out design.

---

## 6. Minimum Viable Resolution

The smallest set of decisions that restores semantic coherence:

1. Name the authority class of `rating_slip.average_bet` (terminal attestation vs. lossy interval survivor).
2. Name the correction model (mutation vs. new fact).
3. Declare the canonical label set for the four distinct concepts.
4. Declare the propagation category for average-bet changes (or declare "no outbox during pilot").
5. Confirm that visit-level weighted average is a projection computed in the RPC, not an authority fact.

These five decisions, once recorded in an ADR, unblock all downstream artifacts.

---

## 7. Required Downstream Artifacts

| Artifact | Unblocks |
|---|---|
| **ADR** — Rating telemetry classification (authority class, correction model, propagation category) | PRD for interval capture; outbox posture |
| **PRD** — Visit-level weighted average RPC extension | Immediate build (FR-006 cleared — may proceed before ADR) |
| **PRD** — UI label separation across 15 surfaces | Unblocked once vocabulary is canonicalized |
| **PRD** — Append-only interval capture (if correction model = new fact) | Unblocked after ADR |
| **FIB amendment** — if a new operator-visible goal emerges from the authority decision | Per SIGP §13.1 |

---

## 8. Exit Criteria

- Authority class of `rating_slip.average_bet` is named and recorded in an ADR.
- Correction model (mutation vs. new fact) is decided and recorded.
- Canonical label set for the four concepts is stable and adopted in at least one reference surface.
- Propagation category is decided: rating telemetry / projection input / no outbox.
- Visit-level weighted average is declared a projection (RPC-computed), not an authority fact.
- SRR-AVG-001, SRR-AVG-003, and SRR-AVG-005 are marked Resolved or Contained in the risk register.
- Vocabulary (FR-005) is stable enough that a PRD author can write identifiers, labels, and event names without reopening the "what does average bet mean?" question.

---

---

# Semantic Clearance

```
# Semantic Clearance

## Scope Reviewed
FIB-H-RATING-TELEMETRY-SIGP-001 — average-bet lifecycle classification and outbox posture investigation

## Contexts Touched
Rating Slip (primary), Visit (aggregation), Financial Outbox / Wave 2 (classification boundary)

## Trigger
Mandatory — FIB introduces cross-context propagation question, user-visible aggregation surface,
and a new domain term ("rating telemetry") requiring authority and propagation classification.

## Diagnostic Summary
| Pass | Result | Notes |
|---|---|---|
| Authority | Risk | FR-001 (S3): destructive overwrite misrepresents operator history |
| Aggregate Ownership | Risk | FR-002 (S2): intra-slip bet-change lifecycle undefined; no visit-level aggregate owner |
| Propagation | Risk | FR-003 (S3): no semantic category established; finance_outbox routing blocked |
| Surface Truthfulness | Risk | FR-004 (S2): 15 surfaces imply completeness without labeling |
| Vocabulary | Risk | FR-005 (S3): "average bet" collapses 4+ distinct concepts |
| Projection Dependency | Risk | FR-006 (S1): visit weighted average computable but absent from RPC |
| Operational Reality | Clear | Model gap matches real floor behavior; proposed remediation is operationally coherent |

## Decision
Canonicalization required (S3 cluster: FR-001, FR-003, FR-005).
FR-006 cleared — visit-level weighted average RPC extension may proceed immediately.
FR-002 and FR-004 deferred with containment.

## Residual Risk
FR-006 (S1) — cleared. FR-002 and FR-004 deferred with explicit containment rules.
No S4 or S5 fractures found. No financial authority or compliance risk at current scope.

## Reviewer
Architecture / Product — 2026-05-25
```

---

## Final Recommendation

| Track | Decision | Rationale |
|---|---|---|
| **Immediate build allowed** | Visit-level weighted average — RPC extension + DTO field + label | FR-006 cleared. Computable today from authority data. No schema change. No new semantic classification needed. Closes the immediate client-walkthrough gap. |
| **Requires Canonicalization Directive** | Append-only interval capture, any outbox emission | S3 cluster (authority, propagation, vocabulary) must be resolved in an ADR before any build. |
| **Blocked** | Any routing through `finance_outbox`, any PFT involvement, any new outbox table | Classification decision does not exist; contamination risk is concrete. |
| **Blocked** | Any new surface label using non-canonical average-bet terminology | Vocabulary not stable; label copy will diverge without it. |
| **Deferred** | RFID / smart-table / exact wager observation | Explicitly out of scope; would require a separate investigation. |

**Summary verdict:** The investigation is correctly scoped. One track (visit-level aggregation) is low-risk and may proceed immediately. Three S3 fractures form a coherent classification cluster that blocks all others. The Canonicalization Directive (CANON-AVG-BET-001) defines the minimum decision set required before the remaining tracks can proceed.
