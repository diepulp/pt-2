---
id: WAVE-2-BLOCKERS
status: RESOLVED
date: 2026-05-06
resolved: 2026-05-07
scope: Wave 2 pre-conditions — must resolve before producer wiring begins
references:
  - wave-2/WAVE-2-BLOCKER-UL-RECONCILIATION-PATH.md
  - wave-2/PRE-WAVE-2-UBIQUITOUS-LANGUAGE-PROPOSITION.md
  - wave-2/WAVE-2-UBIQUITOUS-LANGUAGE-CLARIFICATION.md
  - actions/WAVE-1-CLASSIFICATION-RULES.md
---

# Wave 2 Pre-Condition Blockers

Wave 2 producer wiring and outbox relay implementation must not begin until
all blockers below are resolved. These are semantic stabilization requirements,
not rollbacks of Wave 1.

---

## B-1 — UL Reconciliation (Ontological)

**Status:** RESOLVED  
**Source:** `wave-2/WAVE-2-BLOCKER-UL-RECONCILIATION-PATH.md`  
**Nature:** Pre-wire semantic clarity

The Wave 2 Ubiquitous Language proposition introduces a third event ontology
category — **Dependency Event** — not present in the Wave 1 Class A / Class B
model. Fills, credits, and inventory snapshots are Dependency Events: they
affect projections but are not themselves authority-bearing financial facts.

Wave 1 correctly classified them as Class B (`estimated`) for surface
purposes. The new UL refines the internal ontological description without
changing that surface label.

**Resolution criteria:**

1. Dependency Event terminology adopted in all Wave 2 planning documents before
   producer wiring begins.
2. Outbox scope described as **Projection Input propagation** (Authority Facts +
   Telemetry Facts + Dependency Events), not "financial event propagation".
3. A Wave 2 UL clarification note added to distinguish projection participation
   from authority semantics. This is semantic stabilization guidance — not an
   architectural re-foundation or ADR replacement.

**Resolution note (2026-05-07):** All three criteria met.
- Criterion 1: Dependency Event terminology present throughout Wave 2 planning docs.
- Criterion 2: Outbox scope described as Projection Input propagation in `outbox-knowledge-base.md` and `WAVE-2-BLOCKER-UL-RECONCILIATION-PATH.md`.
- Criterion 3: `WAVE-2-UBIQUITOUS-LANGUAGE-CLARIFICATION.md` produced as the canonical stabilization note.

**Containment note:** This refinement must not expand into reconciliation
infrastructure, inventory settlement systems, or general casino accounting
ontology. Pilot scope remains operational telemetry propagation.

---

## B-2 — Surface Violation Patches (Implementation)

**Status:** RESOLVED  
**Nature:** Blocking implementation fixes — six components

Fills and credits are currently rendered with incorrect authority labels in
six components. These must be patched before outbox replay and propagation
hardening; surfaces carrying an incorrect authority label risk propagating
semantic interpretation drift once relay propagation is live.

### Semantic anchor

The `'actual'` / `'estimated'` labels are **operational authority semantics**,
not epistemic certainty claims:

- `'actual'` = ledger-authoritative (PFT-class / Class A)
- `'estimated'` = non-ledger operational input (Class B)

Fills and credits are operationally concrete and auditable to the cent. They
carry `'estimated'` because they are **non-ledger operational inputs** under the
current surface contract — not because their values are uncertain or
approximate. `'estimated'` here is a provenance label, not an accuracy
qualifier. This distinction must be preserved in all patch rationale.

---

### B-2.1 — `rundown-summary-panel.tsx` (EXPLICIT — highest severity)

**File:** `components/table/rundown-summary-panel.tsx`  
**Lines:** 242 (Fills), 291 (Credits), 344 (Table Win/Loss — D5 cascade)

Fills and Credits explicitly pass `type: 'actual'` to `<FinancialValue>`.
`table_win_cents` (line 344) is derived from formula inputs that include
fills and credits; under ADR-054 D5 it must degrade to `'estimated'`.

| Field | Current | Required | Source string | Completeness |
|---|---|---|---|---|
| Fills (line 242) | `type: 'actual'` | `type: 'estimated'` | `table_session.fills_total` | `isDropPosted ? 'complete' : 'partial'` |
| Credits (line 291) | `type: 'actual'` | `type: 'estimated'` | `table_session.credits_total` | `isDropPosted ? 'complete' : 'partial'` |
| Table Win/Loss (line 344) | `type: 'actual'` | `type: 'estimated'` | `table_session.inventory_win` | inherit worst of inputs |

`isDropPosted` is already computed at line 174 — no new variable required.

---

### B-2.2 — `secondary-kpi-stack.tsx` (SILENT FALLBACK)

**File:** `components/shift-dashboard-v3/left-rail/secondary-kpi-stack.tsx`  
**Lines:** 56 (fallback), 79–84 (Fills call), 85–90 (Credits call)

`CompactKpi` at line 56 resolves authority as:
```ts
type: metricGrade === 'ESTIMATE' ? 'estimated' : 'actual'
```
Fills and Credits are called without `metricGrade` → silently resolve to
`'actual'`. The fallback must be inverted: only an affirmative `'AUTHORITATIVE'`
signal should elevate to `'actual'`; absent or `'ESTIMATE'` stays `'estimated'`.

| Change | Detail |
|---|---|
| Line 56 fallback | `metricGrade === 'ESTIMATE' ? 'estimated' : 'actual'` → `metricGrade === 'AUTHORITATIVE' ? 'actual' : 'estimated'` |
| Lines 79–84 Fills | Add `metricGrade="ESTIMATE"` |
| Lines 85–90 Credits | Add `metricGrade="ESTIMATE"` |

**Implementation note:** Within `SecondaryKpiStack`, no current call site passes
`metricGrade="AUTHORITATIVE"`. The fallback inversion therefore intentionally
makes the authoritative branch unreachable at runtime. This is considered correct
behavior: `SecondaryKpiStack` is an operational telemetry surface, not a
provenance-authoritative KPI surface.

Potential future cleanup: remove `'AUTHORITATIVE'` from `CompactKpi.metricGrade`
if no legitimate provenance-bearing use case emerges.

---

### B-2.3 — `pit-metrics-table.tsx` (UNLABELED)

**File:** `components/shift-dashboard/pit-metrics-table.tsx`  
**Lines:** 166 (Fills), 169 (Credits)

Fills and Credits render as bare `formatCents()` with no authority marker.
`FinancialValue` is not yet imported in this file.

| Change | Detail |
|---|---|
| Add import | `import { FinancialValue } from '@/components/financial'` |
| Replace both cells | `FinancialValue variant="compact"`, `type: 'estimated'`, `source: 'shift_metrics'`, `completeness: { status: 'partial' }` |

Completeness is `'partial'`: this is a live shift dashboard; fills/credits
accumulate throughout the shift. `ShiftPitMetricsDTO` carries no closed-shift
signal.

---

### B-2.4 — `table-metrics-table.tsx` (UNLABELED)

**File:** `components/shift-dashboard/table-metrics-table.tsx`  
**Lines:** 250 (Fills), 253 (Credits)

Same pattern as B-2.3. Same fix: `FinancialValue compact`, `'estimated'`,
`source: 'shift_metrics'`, `completeness: { status: 'partial' }`.

---

### B-2.5 — `metrics-table.tsx` (EXPLICIT — high severity)

**File:** `components/shift-dashboard-v3/center/metrics-table.tsx`  
**Lines:** 119 (Fills), 133 (Credits)

`FinancialValue` is already imported and used correctly for Win/Loss
(`type: 'estimated'` at line 100). Fills and Credits immediately after revert
to `type: 'actual'` — a copy-paste violation.

| Field | Current | Required | Source string | Completeness |
|---|---|---|---|---|
| Fills (line 119) | `type: 'actual'` | `type: 'estimated'` | `shift_metrics` | `table.fills_total_cents == null ? 'unknown' : 'complete'` |
| Credits (line 133) | `type: 'actual'` | `type: 'estimated'` | `shift_metrics` | `table.credits_total_cents == null ? 'unknown' : 'complete'` |

No structural changes required — only the `type` field on each `FinancialValue`
value object changes. The completeness logic (`null` → `'unknown'` else
`'complete'`) is appropriate for the table-level row context and should be
preserved.

---

### B-2.6 — `pit-table.tsx` (UNLABELED)

**File:** `components/shift-dashboard-v3/center/pit-table.tsx`  
**Lines:** 53 (Fills), 56 (Credits)

Pit-level rollup rows render Fills and Credits as bare `formatCents()` with no
authority marker. `FinancialValue` is not imported in this file.

| Change | Detail |
|---|---|
| Add import | `import { FinancialValue } from '@/components/financial'` |
| Replace Fills cell (line 53) | `FinancialValue variant="compact"`, `type: 'estimated'`, `source: 'shift_metrics'`, `completeness: { status: 'partial' }` |
| Replace Credits cell (line 56) | same as Fills |

Completeness is `'partial'`: `ShiftPitMetricsDTO` carries no closed-shift
signal; pit-level rollups accumulate throughout the shift. This matches the
rationale used for B-2.3 and B-2.4.

**Note:** The chart surface (`shift-dashboard-v3/charts/win-loss-trend-chart.tsx`)
plots fills/credits as raw cents series with no authority badge. Chart
visualizations do not carry `FinancialValue` authority semantics; the tooltip
uses bare `formatCents()`. This is not a violation — it is exempt from the
surface labeling requirement. No action required.

---

## Scope Boundary

These patches correct surface rendering only. They do not touch:

- PFT write paths
- Grind authoring paths
- MTL or compliance surfaces
- Service layer, hooks, DTOs, migrations, or RPC signatures

Adjacent non-blocking observations noted during investigation (not in scope):

- `opening`, `closing`, and `drop_total_cents` in `rundown-summary-panel.tsx`
  also carry `type: 'actual'`; under WAVE-1 rules `drop_total_cents` is Class B
  and opening/closing snapshots are custody-chain facts. These are deferred —
  not listed as Wave 2 blockers.

---

## Resolution Gate

Both B-1 and B-2 must be resolved and verified before:

- outbox producer wiring
- relay worker implementation
- projection freshness harness
- replay correctness testing

**B-2 patch completion** — type-check passed 2026-05-07. Visual verification
required: Fills/Credits cells must display the amber `Estimated` badge (not
green `Actual`) across rundown panel, secondary KPI stack, pit metrics table,
table metrics table, metrics table, and pit table.
