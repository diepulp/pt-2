# SIGP-001 — Post-Wave-2 Financial Surface Truth Review

**Review ID**: SIGP-001
**Date**: 2026-05-23
**Reviewer**: Vladimir Ivanov
**Status**: Active — findings classified, dispositions assigned
**Source audits**:
- `docs/issues/gaps/financial-data-distribution-standard/post-wave-2-stabilization/ Post-Wave-2-Operational-Truth-Audit.md`
- `docs/issues/gaps/financial-data-distribution-standard/post-wave-2-stabilization/OP-TRUTH-ADDENDUM.md`
**Companion YAML**: `SIGP-001-zachman.yaml`

---

## 1. Review Scope

| Item | Coverage |
|---|---|
| Bounded contexts | Financial Surface Rendering, Operational Projection, Inventory / Pit Terminal, Shift Dashboard |
| Components reviewed | `rating-slip-modal.tsx`, `form-section-cash-in.tsx`, `grind-buyin-panel.tsx`, `hero-win-loss-compact.tsx`, `secondary-kpi-stack.tsx`, `analytics-panel.tsx`, `telemetry-rail-panel.tsx`, `bank-summary.tsx`, `rundown-report-card.tsx`, `rundown-summary-panel.tsx` |
| Tables / services touched | `table_fill`, `table_credit`, `table_buyin_telemetry`, `pit_cash_observation`, `table_inventory_snapshot`, `shift_operational_projection`, `finance_outbox`, `rpc_shift_table_metrics`, `rpc_shift_casino_metrics`, `rpc_compute_table_rundown` |
| Propagation involved | Yes — `finance_outbox` → `shift_operational_projection` (Phase 2.4) |
| User-visible meaning affected | Yes — authority labels, completeness badges, and composite values across highest-traffic operator surfaces |

---

## 2. Trigger

**Mandatory** per SIGP §4.1, items 5 and 6:
- Item 5: User-visible totals, statuses, summaries, and lifecycle labels
- Item 6: Multiple surfaces consuming the same source facts via different paths

---

## 3. Diagnostic Summary

| Pass | Status | Notes |
|---|---|---|
| Authority | **RISK** | Envelope discarded at render boundary on 5 surfaces; composite value blended without disclosure (F1) |
| Aggregate Ownership | **RISK** | Fills/credits computed via two parallel paths with no reconciliation signal |
| Propagation Integrity | **CLEAR** | Transport spine and projection stores are structurally sound |
| Surface Truthfulness | **FRACTURED** | 6 surfaces render misleading or absent authority/completeness signals |
| Vocabulary | **RISK** | `'actual'` misapplied to inventory snapshots; `complete` used as non-null sentinel |
| Projection Dependency | **RISK** | Shift dashboard never crossed to projection layer; remains pre-Phase-2.4 |
| Operational Reality | **RISK** | Operators read `complete` on open-shift data; Net Position includes unsaved form field silently |

**Overall**: Two S4 findings require Canonicalization Directives. Five additional findings require Risk Register entries. No rollout halt required (audit surfaces pre-exist Wave 2; transport layer is sound).

---

## 4. Diagnostic Passes

### 4.1 Authority Audit

**Clean paths**:
- `GET /api/v1/visits/[visitId]/financial-summary` — correct `type:'actual'`, `source:'PFT'`, lifecycle-aware completeness via `getVisitClassACompleteness`.
- `OperationalProjectionResponseDTO` — carries `type:'estimated'` and lifecycle completeness correctly.
- `RundownSummaryPanel` — correct `'estimated'` for fills/credits/win-loss; `derivedFrom` declared; Pattern B applied.

**Fractured paths**:

- **Rating Slip Modal (F1)**: DTOs carry the correct authority envelope (`type:'actual'`, `source:'PFT'`, `completeness:{status:'unknown'}`). The component discards all of it — renders `$.toFixed(2)` strings. Additionally, `computedNetPosition` silently blends an authoritative DTO value (`totalCashOut.value`) with an unsaved form input (`pendingChipsTaken * 100`), presenting a preview composite as if it were a PFT authority fact.

- **GrindBuyinPanel (F2)**: DTO carries `type:'estimated'` and lifecycle-aware `completeness.status`. Component renders `formatCentsToDollars(grindTotal?.totalCents ?? 0)` only. Authority class invisible to operator. Secondary: the total labeled "Grind Buy-ins" includes `fill_total_cents` and `credit_total_cents` from the projection store — name implies buy-in telemetry only.

- **Shift Dashboard (F3)**: Authority type `'estimated'` is correct (hardcoded in SQL as `metric_grade: ESTIMATE`). Completeness is fabricated: `status:'complete'` whenever value is non-null, with no lifecycle gate. An open gaming shift and a fully settled one are indistinguishable in completeness posture.

- **BankSummary (F5)**: No envelope whatsoever. `$${totalValue.toLocaleString()}` — authority class unknown to operator. Source is `table_inventory_snapshot` direct read.

- **RundownReportCard (F6)**: `formatCents()` raw strings on Win/Loss, Fills, Credits, Drop — the same formula lines that `RundownSummaryPanel` renders correctly via `FinancialValue`.

- **Inventory snapshots labeled `'actual'` (NOTE)**: Physical chip counts entered by pit bosses are Dependency Events in ADR-052 terms, not Class A PFT ledger facts. `type:'actual'` overclaims their authority. `'observed'` (physically verifiable quantity) is the semantically correct type.

### 4.2 Aggregate Ownership Audit

Single split-brain risk: **fills/credits have two parallel read paths for the same underlying events**.

- **Path A**: `table_session.fills_total_cents` / `credits_total_cents` — trigger-maintained denorm from `table_fill` / `table_credit`. Consumed by `rpc_compute_table_rundown` → `RundownSummaryPanel`.
- **Path B**: `finance_outbox` events (`fill.recorded`, `credit.recorded`) → `rpc_process_operational_projection` → `shift_operational_projection`. Consumed by `GrindBuyinPanel` via the operational projection route.

Both paths derive from the same source transactions. If outbox delivery fails, replays, or processes out of order, the two paths diverge silently. No reconciliation signal exists on either surface. The rundown formula and the GrindBuyinPanel operational total can show different numbers for the same fills/credits with no visible indicator of the discrepancy. This is exactly the structural consistency the outbox was intended to close — it remains open in a dual-path form.

### 4.3 Propagation Integrity Audit

**Clear**. The `finance_outbox` → `shift_operational_projection` pipeline is structurally sound per both audit documents. Event identity is stable. Idempotency is proven (i3/i4 scripts). Replay produces equivalent state.

The fracture is not at the transport boundary but at the **consumption boundary**: surfaces not crossing into the projection layer at all, or crossing and discarding the envelope at the render layer. This is a surface rendering debt, not a propagation bug.

### 4.4 Surface Truthfulness Audit

Six surfaces are actively misleading:

1. **Rating Slip Modal**: Clean dollar strings over partial PFT data. `computedNetPosition` is an undisclosed preview composite — PFT authority value plus unsaved form input.
2. **GrindBuyinPanel**: `estimated` authority and lifecycle completeness invisible. Panel label implies narrower scope than actual aggregate content.
3. **Shift Dashboard Win/Loss**: `complete` asserted whenever value is non-null, on a live open shift.
4. **Shift Dashboard Fills/Credits/Est.Drop**: Same completeness fabrication. An operator reading the shift KPIs during an active gaming day sees `complete` on every non-null metric.
5. **Telemetry Rail**: `type:'observed'` correct; `complete` hardcoded for in-progress observation windows.
6. **BankSummary**: No authority signal.
7. **RundownReportCard**: No authority signal where `RundownSummaryPanel` correctly applies the full envelope.

**Reference implementation**: `RundownSummaryPanel` (`components/table/rundown-summary-panel.tsx`) — `FinancialValue` on every line, correct authority types for the domain, genuine lifecycle gate (`isDropPosted`), `derivedFrom` declared for the derived win/loss. This is the pattern; the gaps elsewhere are deviations from it.

### 4.5 Vocabulary Integrity Audit

Two vocabulary fractures:

**`'actual'` applied to inventory snapshots**: In the Wave 2 UL, `type:'actual'` means a Class A PFT ledger fact — an authority event authored in the primary financial transaction store. Physical chip counts taken by pit bosses are Dependency Events: physically verifiable but not ledger-authoritative. The proposed correct type is `'observed'`. `'estimated'` would be wrong (counts are exact to the chip). This creates a vocabulary gap — the UL recognizes `'actual'`, `'estimated'`, and `'derived'` but does not have a canonical entry for the inventory-observation class.

**`complete` as non-null sentinel**: Across the shift dashboard family, `completeness: { status: valueCents == null ? 'unknown' : 'complete' }` is used as a null-guard, not a lifecycle signal. `complete` in the `FinancialValue` contract means "the lifecycle window is closed and all expected inputs have arrived." Using it as a null-guard collapses the vocabulary — an open shift with real values reads as `complete` the same as a settled shift.

### 4.6 Projection Dependency Audit

**Shift Dashboard (F3)**: `rpc_shift_table_metrics` reads `table_fill`, `table_credit`, `table_buyin_telemetry` directly. `shift_operational_projection` was never wired into the shift dashboard path. Completeness cannot be lifecycle-derived because the lifecycle-aware projection store is not in the data path. The shift dashboard surfaces are structurally pre-Phase-2.4.

**GrindBuyinPanel (F2)**: Correctly consumes from `shift_operational_projection` via `/api/v1/table-context/operational-projection`. Projection inputs are correct. Completeness is lifecycle-aware at the DTO. The render layer discards it. Projection dependency is sound; the surface dependency is broken.

**Fills/Credits dual path (SR-007)**: Two projections of the same underlying data exist simultaneously with no declared canonical authority. Either can be the "current" value depending on which surface an operator is reading.

### 4.7 Operational Reality Audit

**Shift Dashboard completeness fabrication**: Floor supervisors and pit bosses use the shift dashboard during live shifts. A reading of `Win/Loss: $12,450 — complete` during an open gaming day implies settlement or near-finality. The system is producing confidence language it has not earned. Operators who act on `complete` shift numbers before the gaming day closes are making decisions from a fabricated signal. This is the highest operational risk in this audit.

**Rating Slip Net Position composite**: An operator entering chips in the rating slip modal sees a Net Position that includes the current unsaved chip form entry — a live preview, not a PFT fact. The number updates as they type. This is useful real-time feedback but it is not labeled as a preview. An operator who reads this as the authoritative PFT net position is making decisions from a blended number without disclosure.

**RundownSummaryPanel `'actual'` for chip counts**: Pit bosses physically count chips; the system labels the result `'actual'`. To an operator, this reads as "ledger-verified" rather than "physically observed." The distinction matters when they compare this against PFT records and find discrepancies — `'actual'` implies no discrepancy should exist.

---

## 5. Fracture Register

| ID | Finding | Fracture Type | Severity | Disposition |
|---|---|---|---|---|
| SR-001 | Rating Slip Modal: no authority envelope + undisclosed composite Net Position | Surface Misrepresentation, Authority Ambiguity | **S4** | **Canonicalization Directive → CD-001** |
| SR-002 | GrindBuyinPanel: projection envelope discarded at render; label scope mismatch | Surface Misrepresentation, Projection Drift | **S3** | Risk Register — blocked as pattern reference |
| SR-003 | Shift Dashboard: pre-Phase-2.4 data path + fabricated `complete` completeness | Projection Drift, Surface Misrepresentation | **S4** | **Canonicalization Directive → CD-002** |
| SR-004 | Telemetry Rail: `complete` hardcoded for in-progress pit cash observations | Surface Misrepresentation | **S3** | Risk Register |
| SR-005 | BankSummary: no authority envelope on live bankroll total | Surface Misrepresentation | **S3** | Risk Register |
| SR-006 | RundownReportCard: inconsistent with RundownSummaryPanel in same domain | Surface Misrepresentation | **S2** | Risk Register |
| SR-007 | Fills/credits dual-path divergence: trigger denorm vs. outbox projection | Aggregate Split-Brain, Propagation Ambiguity | **S3** | Risk Register |
| SR-008 | Inventory snapshots labeled `'actual'` — should be `'observed'` | Authority Ambiguity, Vocabulary Overload | **S2** | Risk Register |

---

## 6. Canonicalization Directive CD-001 — Rating Slip Modal Financial Rendering

### Problem

The Rating Slip Modal renders financial values as raw dollar strings with no authority badge, source label, or completeness signal, despite DTOs carrying the full envelope. A UI-side composite (`computedNetPosition`) silently adds an unsaved form value (`pendingChipsTaken * 100`) to an authoritative DTO total (`totalCashOut.value`), displaying a preview-blended number as if it were a PFT authority fact. Operators cannot distinguish the preview composite from the authoritative value.

### Affected Contexts

- `components/modals/rating-slip/rating-slip-modal.tsx:711–742`
- `components/modals/rating-slip/form-section-cash-in.tsx:119`
- `services/rating-slip/` DTO mappers (not broken — envelope is correct, unused at surface)

### Current Competing Meanings

| Concept | Meaning A | Meaning B | Where Seen |
|---|---|---|---|
| Net Position displayed | Authoritative PFT fact (`type:'actual'`, `source:'PFT'`) | Preview composite (PFT fact + unsaved chip form input) | `rating-slip-modal.tsx computedNetPosition` |
| Authority visibility | Envelope present on DTO | Invisible at render | Component vs. DTO layer |

### Required Decisions

- **Surface rendering rule**: All financial lines in the Financial Summary section must render via `<FinancialValue />`.
- **Composite disclosure rule**: `computedNetPosition` must be visually distinguished as a live preview when it includes unsaved form inputs — via a labeled preview state, tooltip disclosure, or a separate preview line alongside the authoritative value. The composite itself is acceptable; its undisclosed nature is not.
- **Authority reclassification**: Not required. DTOs are already correct.

### Explicit Non-Goals

- Do not redesign the Rating Slip Modal layout.
- Do not change DTO authority classification.
- Do not gate the composite preview behavior behind a new PRD — the behavior is correct once disclosed.

### Minimum Viable Resolution

1. Replace all `$X.toFixed(2)` renders in `rating-slip-modal.tsx:711–742` and `form-section-cash-in.tsx:119` with `<FinancialValue ... />` consuming the envelope already on the DTO.
2. Mark `computedNetPosition` as a preview (label, visual treatment, or separate line) when `pendingChipsTaken > 0`.

### Required Downstream Artifacts

- Component migration (implementation)
- Test: no naked `toFixed`/`toLocaleString` on financial values in rating-slip-modal.tsx or form-section-cash-in.tsx

### Exit Criteria

- `FinancialValue` used on all financial lines in `rating-slip-modal.tsx:711–742` and `form-section-cash-in.tsx:119`
- `computedNetPosition` disclosed as preview when form input is active
- Authority and completeness badges visible to operator on the Financial Summary section

---

## 7. Canonicalization Directive CD-002 — Shift Dashboard Completeness Integrity

### Problem

The shift dashboard family (`hero-win-loss-compact.tsx`, `secondary-kpi-stack.tsx`, `analytics-panel.tsx`) fabricates `complete` completeness whenever a financial value is non-null. The underlying `rpc_shift_table_metrics` reads directly from authoring tables (`table_fill`, `table_credit`, `table_buyin_telemetry`) and never crosses into `shift_operational_projection`. An open gaming shift and a fully settled one look identical in completeness posture on the dashboard. Operators are presented with `complete` signals on live, unclosed shifts across all shift KPIs.

### Affected Contexts

- `components/dashboard/hero-win-loss-compact.tsx`
- `components/dashboard/secondary-kpi-stack.tsx`
- `components/dashboard/analytics-panel.tsx`
- `services/measurement/` (RPC wrappers around `rpc_shift_table_metrics`, `rpc_shift_casino_metrics`)
- `shift_operational_projection` (exists but not consumed by the dashboard data path)

### Current Competing Meanings

| Concept | Meaning A | Meaning B | Where Seen |
|---|---|---|---|
| `complete` completeness | Lifecycle window closed, all expected inputs arrived | Value is non-null | `FinancialValue` contract vs. shift dashboard components |
| Shift financials source | `shift_operational_projection` (Phase 2.4) | Direct `table_fill` / `table_credit` / `table_buyin_telemetry` | `GrindBuyinPanel` vs. `rpc_shift_table_metrics` |

### Required Decisions

- **Completeness rule**: Shift dashboard completeness must be derived from a lifecycle signal, not a null-guard. Accepted signals: `is_gaming_day_closed` from `gaming_day_lifecycle`; `shift_end_time IS NOT NULL`; or equivalent.
- **Projection path decision**: Choose one: (a) migrate `rpc_shift_table_metrics` to read from `shift_operational_projection`, or (b) keep the current authoring-store read path and add a lifecycle-aware completeness gate to it. Option (b) is the lower-risk path — it fixes the S4 completeness fabrication without requiring a full projection migration.
- **Surface rendering**: Shift dashboard components must pass `completeness.status` through to `FinancialValue` (or equivalent) and must not hardcode it.

### Explicit Non-Goals

- Do not redesign the shift dashboard layout.
- Do not require full shift dashboard migration to `shift_operational_projection` before resolving the completeness fabrication — fixing the lifecycle gate is sufficient to close the S4 finding.
- Do not block current shift dashboard reads.

### Minimum Viable Resolution

1. Add a lifecycle completeness resolver to the `rpc_shift_table_metrics` data path: derive `is_gaming_day_closed` from `gaming_day_lifecycle`; map to `complete` | `partial` | `unknown`.
2. Surface that completeness field on the `ShiftMetricsDTO`.
3. Pass it through to all three dashboard components; remove the hardcoded `complete` assertions.

### Required Downstream Artifacts

- RPC amendment or view update to derive completeness from `gaming_day_lifecycle`
- `ShiftMetricsDTO` update (add `completeness` field)
- Component updates: `hero-win-loss-compact.tsx`, `secondary-kpi-stack.tsx`, `analytics-panel.tsx`
- Test: `completeness.status !== 'complete'` when gaming day is open

### Exit Criteria

- No shift dashboard surface hardcodes `complete` when gaming day is open
- `completeness.status` is derived from a lifecycle gate, not a null-guard
- At least the Win/Loss line renders completeness disclosure via `FinancialValue` or equivalent

---

## 8. Semantic Risk Register Entries

### SR-002 — GrindBuyinPanel: Projection Envelope Discarded at Render

- **Risk ID**: SR-002 | **Severity**: S3 | **Status**: Open
- **Fracture type**: Surface Misrepresentation, Projection Drift
- **Affected context**: `components/dashboard/grind-buyin-panel.tsx`
- **Current behavior**: `GrindBuyinPanel` reads correctly from `shift_operational_projection` via `/api/v1/table-context/operational-projection`. The `OperationalProjectionResponseDTO` carries `type:'estimated'` and lifecycle-aware `completeness.status`. The component renders `formatCentsToDollars(grindTotal?.totalCents ?? 0)` — no authority badge, no completeness. Secondary: the aggregate includes `fill_total_cents` and `credit_total_cents` from the projection store but is labeled "Grind Buy-ins."
- **Why acceptable temporarily**: The projection data path is correct; this is a render-only gap. No authority is fabricated (value is unlabeled, not mislabeled). Lower operational stakes than shift dashboard.
- **Containment rule**: `GrindBuyinPanel` must not be used as a pattern reference for new projection-consuming components. No new surface may read from `shift_operational_projection` without `FinancialValue` at the render boundary.
- **Resolution trigger**: Any new surface reading from `shift_operational_projection`, or next GrindBuyinPanel feature work.
- **Likely resolution artifact**: Component migration; label review for fill/credit inclusion.
- **Owner**: Financial Surface Rendering

---

### SR-004 — Telemetry Rail: Hardcoded `complete` for In-Progress Observations

- **Risk ID**: SR-004 | **Severity**: S3 | **Status**: Open
- **Fracture type**: Surface Misrepresentation
- **Affected context**: `components/dashboard/telemetry-rail-panel.tsx`
- **Current behavior**: Renders pit cash observations with `type:'observed'` (correct) and `completeness: { status: 'complete' }` hardcoded. For an in-progress shift, this is false.
- **Why acceptable temporarily**: Pit cash observations are point-in-time records, not window aggregates. The `complete` assertion is incorrect but lower operational consequence than fabricated shift win/loss.
- **Containment rule**: No additional pit cash observation surfaces may hardcode `complete`. A lifecycle or observation-window gate must be designed before expanding this surface.
- **Resolution trigger**: Any Telemetry Rail expansion, or UL clarification of completeness semantics for the `'observed'` fact class.
- **Likely resolution artifact**: UL note or ADR clarifying completeness semantics for Observed facts; component update.
- **Owner**: Operational Telemetry

---

### SR-005 — BankSummary: No Authority Envelope on Live Bankroll Total

- **Risk ID**: SR-005 | **Severity**: S3 | **Status**: Open
- **Fracture type**: Surface Misrepresentation
- **Affected context**: `components/pit-panels/bank-summary.tsx:73`
- **Current behavior**: Renders the live bankroll total as `$${totalValue.toLocaleString()}` from `useInventorySnapshots` → `table_inventory_snapshot`. No `FinancialValue`, no authority label, no completeness.
- **Why acceptable temporarily**: Inventory domain is a separate formula domain from PFT/grind. Lower operational stakes. Not a high-frequency decision surface.
- **Containment rule**: No additional inventory domain surfaces may render financial values without `FinancialValue`.
- **Resolution trigger**: Any inventory domain surface expansion, or inventory integration into outbox domain.
- **Likely resolution artifact**: Component migration — adopt `FinancialValue` with `type:'observed'` (pending SR-008 vocabulary resolution).
- **Owner**: Inventory / Pit Terminal

---

### SR-006 — RundownReportCard: Inconsistent with RundownSummaryPanel

- **Risk ID**: SR-006 | **Severity**: S2 | **Status**: Open
- **Fracture type**: Surface Misrepresentation
- **Affected context**: `components/table/rundown-report-card.tsx:82–96`
- **Current behavior**: Renders Win/Loss, Fills, Credits, Drop as `formatCents()` raw strings. Adjacent component `RundownSummaryPanel` uses `FinancialValue` correctly on the same formula lines with correct authority types and completeness gates.
- **Why acceptable temporarily**: `RundownReportCard` likely renders a persisted report row (lower operational stakes than live projection). The reference implementation exists in the sibling component.
- **Containment rule**: No `RundownReportCard` extension may add new financial lines without `FinancialValue`.
- **Resolution trigger**: Any `RundownReportCard` update or inventory reporting expansion.
- **Likely resolution artifact**: Component migration using `RundownSummaryPanel` as the pattern.
- **Owner**: Inventory / Pit Terminal

---

### SR-007 — Fills/Credits Dual-Path Divergence Risk

- **Risk ID**: SR-007 | **Severity**: S3 | **Status**: Open
- **Fracture type**: Aggregate Split-Brain, Propagation Ambiguity
- **Affected contexts**: `rpc_compute_table_rundown`, `grind-buyin-panel.tsx`, `shift_operational_projection`, `table_session.fills_total_cents`
- **Current behavior**: Fills and credits are readable via two independent paths: (A) `table_session.fills_total_cents` / `credits_total_cents` (trigger-maintained denorm from `table_fill` / `table_credit`), consumed by rundown formula; (B) `finance_outbox` events → `rpc_process_operational_projection` → `shift_operational_projection`, consumed by `GrindBuyinPanel`.
- **Divergence scenario**: Outbox delivery failure, replay event, or out-of-order processing causes path B to differ from path A with no reconciliation signal on either surface. `RundownSummaryPanel` and `GrindBuyinPanel` can show different numbers for the same fills/credits.
- **Why acceptable temporarily**: Not a current bug. Both paths derive from the same source events. Divergence requires an outbox failure, which the Phase 2.5 observability layer is intended to surface.
- **Containment rule**: No new aggregate may depend on both path A and path B for the same session scope. Any new fills/credits surface must declare which path it uses and why.
- **Resolution trigger**: Any observed fills/credits divergence in production; any new surface requiring fills/credits aggregation; Phase 3 outbox expansion planning.
- **Likely resolution artifact**: ADR on canonical fills/credits read path post-Phase-2; potential deprecation timeline for trigger-maintained denorm columns.
- **Owner**: Financial Data Distribution / Outbox

---

### SR-008 — Inventory Snapshots Labeled `'actual'`

- **Risk ID**: SR-008 | **Severity**: S2 | **Status**: Open
- **Fracture type**: Authority Ambiguity, Vocabulary Overload
- **Affected context**: `components/table/rundown-summary-panel.tsx` (Opening, Closing, Drop lines)
- **Current behavior**: `RundownSummaryPanel` labels Opening and Closing bankroll snapshots (from `table_inventory_snapshot`) and manually posted Drop as `type:'actual'`. These are physical chip counts and a manual pit entry — Dependency Events in ADR-052 terms, not Class A ledger facts.
- **Proposed correct type**: `'observed'` — physical observation of a verifiable physical quantity. `'estimated'` is incorrect (chip counts are exact to the chip). The current Wave 2 UL does not have a canonical entry for `'observed'` as an authority type.
- **Why acceptable temporarily**: `RundownSummaryPanel` is otherwise the reference implementation; the overclaim is in authority type, not completeness. Practical operator impact is low within the inventory domain.
- **Containment rule**: No new inventory snapshot surface may use `type:'actual'`. New inventory surfaces must use `type:'observed'` pending UL disambiguation.
- **Resolution trigger**: Any UL update to the Wave 2 authority taxonomy; any new inventory snapshot surface; inventory integration with PFT reconciliation.
- **Likely resolution artifact**: ADR-052 amendment or UL addendum adding `'observed'` as a recognized inventory-class authority type; `RundownSummaryPanel` update.
- **Owner**: Financial Model Authority / Inventory Domain

---

## 9. Allowed and Blocked Work

### Blocked while open

| Block | Reason | Risk ID |
|---|---|---|
| New rating slip financial line renders using `toFixed()` / `toLocaleString()` | Propagates the missing-envelope pattern | SR-001 / CD-001 |
| New shift dashboard surfaces inheriting `rpc_shift_table_metrics` completeness without lifecycle gate | Propagates fabricated `complete` | SR-003 / CD-002 |
| Using `GrindBuyinPanel` as a pattern reference for projection-consuming components | Propagates envelope-discard pattern | SR-002 |
| New inventory domain financial surfaces using `type:'actual'` for chip count values | Propagates authority misclassification | SR-008 |

### Allowed while open

- Any new surface that uses `FinancialValue` correctly from the start
- Outbox transport, projection store, and observability changes (not affected)
- Visit financial summary work (already clean)
- RLS, auth, non-financial UI work
- RundownSummaryPanel as a reference for new inventory surfaces

---

## 10. Required Downstream Artifacts

| Artifact | Drives | Priority |
|---|---|---|
| CD-001 implementation — `FinancialValue` migration on rating-slip-modal + composite disclosure | SR-001 resolution | P1 |
| CD-002 implementation — lifecycle completeness gate on `rpc_shift_table_metrics` + DTO + components | SR-003 resolution | P1 |
| UL addendum or ADR-052 amendment — add `'observed'` authority type | SR-008 resolution; unblocks SR-005 component migration | P2 |
| Component migration — GrindBuyinPanel (adopt `FinancialValue`, review aggregate label) | SR-002 resolution | P2 |
| Component migration — BankSummary, RundownReportCard | SR-005, SR-006 resolution | P3 |
| ADR — canonical fills/credits read path post-Phase-2 | SR-007 resolution | P3 |

---

## 11. Out-of-Scope Candidates

Surfaces identified during the SIGP-001 grep pass that are outside the PFT/grind/inventory domain boundary of this review. Not findings — pre-candidates for future SIGP reviews. Recorded here so they are not lost.

### Measurement Domain — SIGP §14.4 Pre-Candidates

Both surfaces are in `components/measurement/` and render dollar-denominated values to operators without a `FinancialValue` envelope. Neither was covered by either source audit.

| Surface | File | Value | Issue |
|---|---|---|---|
| Loyalty Liability Widget | `components/measurement/loyalty-liability-widget.tsx:61` | "Estimated Liability" — `formatCents(data.estimatedMonetaryValueCents)` | Operator-facing dollar claim on casino loyalty exposure; label says "Estimated" in copy but carries no `FinancialValue` type signal, no completeness, no source label |
| Theo Discrepancy Widget | `components/measurement/theo-discrepancy-widget.tsx:72,116` | "Total Discrepancy" — `formatCents(data.totalDiscrepancyCents)` per casino and per-group breakdown | Delta between expected and actual theo; informs operator decisions about rating slip accuracy; no authority or completeness envelope |

**Probable severity if reviewed**: S2–S3. These are analytical summaries, not PFT authority claims, so the overclaim risk is lower than F1/F3. But they are dollar values displayed to operators making financial decisions without any signal about source, authority class, or completeness.

**Suggested trigger for SIGP §14.4 review**: Any expansion of the measurement dashboard, or any work that derives these values from the outbox projection layer rather than direct aggregation.

---

### MTL / Compliance Domain — SIGP §14.3 Pre-Candidates

The following surfaces use `formatCents` on compliance-class transaction amounts. Whether ADR-054 `FinancialValue` applies to compliance-class values is unresolved — MTL authority is parallel to operational financial authority and must not be merged (per ADR-052 non-goals). These are recorded as §14.3 pre-candidates, not SIGP-001 findings.

| Surface | Files |
|---|---|
| MTL entry detail | `components/mtl/entry-detail.tsx:168` |
| MTL entry list | `components/mtl/entry-list.tsx:230` |
| MTL entry form (running totals, threshold display) | `components/mtl/mtl-entry-form.tsx:213,235,238,548,559,570,596` |
| Compliance dashboard (volume summary) | `components/mtl/compliance-dashboard.tsx:326` — raw `toFixed(0)K` formatting on `totalVolume` |

**Note on compliance-dashboard.tsx**: The volume summary uses `$${(stats.totalVolume / 100 / 1000).toFixed(0)}K` — a rounded-down dollar figure on a compliance aggregate. This is the only surface in the grep that combines raw formatting with a compliance-class total visible on a supervisor-facing dashboard. Worth explicit attention in the §14.3 review.

---

### Surfaces Ruled Out During Grep Pass

For completeness — surfaces found by the grep that were considered and excluded:

| Surface | Ruling |
|---|---|
| `adjustment-modal.tsx:135,151` — "Current Total" / "Projected Total" | Authoring form preview of a pending adjustment before commit. Same N/A classification as `ChipCountCaptureDialog`. Not a value display surface. |
| `cashier/amount-display.tsx`, `cash-out-form.tsx` | Cash-out confirmation UI — operator confirms an action they are taking. Authoring boundary, not an authority display surface. |
| `components/admin/loyalty/promo-programs/...` | Admin configuration surfaces for promo program setup. Not operator-facing financial truth. |
| `components/admin/valuation-settings-form.tsx` | Rate configuration display (`$/pt`). Settings UI, not an authority claim. |
| `components/dashboard/active-slips-panel.tsx:341` — `Avg bet` | Operational telemetry / calculated field. Not a financial authority claim. |
| `app/(onboarding)/setup/steps/step-review-complete.tsx:359` — `Par: $X` | Onboarding wizard setup review. Not an operator-facing production surface. |
| `components/loyalty/comp-confirm-panel.tsx`, `issuance-result-panel.tsx`, `reward-selector.tsx` | Loyalty reward authoring / confirmation UI. Dollar values are face values of rewards being issued — authoring context, not authority display. |

---

## Reviewer Sign-Off

Vladimir Ivanov — 2026-05-23
