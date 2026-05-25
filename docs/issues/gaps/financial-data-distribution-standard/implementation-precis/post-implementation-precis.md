# Post-Implementation Précis — Wave 2 Blockers B-1 / B-2

**Date:** 2026-05-07  
**Commit:** `e3765c04`  
**Branch:** `feat/transactional-outbox`

---

## What Was Done

### B-1 — Documentation Calibration (OPEN → partially advanced)

The calibration pass applied the agreed patch delta to all wave-2 docs that
carried ADR-amendment framing or catastrophe-level language:

- `FILLS-CREDITS-SEMANTIC-DRIFT.md` — provenance stability note added;
  "direct breach" softened to "inconsistent with surface contract";
  summary rewritten to distinguish surface label discipline from provenance failure.
- `wave-2-blockers.md` — semantic anchor block strengthened: `'estimated'` now
  explicitly framed as a provenance label, not an accuracy qualifier; B-1 criterion 3
  changed from "ADR amendment" to "Wave 2 UL clarification note".
- `FILLS-CREDITS-SUMMARY.md` — "will corrupt downstream projections" softened;
  ADR amendment language removed; closing framing aligned to patch delta.

**B-1 is not fully resolved.** Remaining open criterion: Dependency Event terminology
must be formally adopted across all Wave 2 planning documents, and a Wave 2 UL
clarification note must be produced before producer wiring begins. See
`wave-2-blockers.md §B-1` for resolution criteria.

---

### B-2 — Surface Violation Patches (OPEN → RESOLVED)

Six surfaces corrected. Fills and credits now carry `type: 'estimated'`
(non-ledger operational provenance label) consistently across all shift dashboard
and rundown render paths.

| Blocker | File | Nature | Change |
|---|---|---|---|
| B-2.1 | `components/table/rundown-summary-panel.tsx` | Explicit `'actual'` | `type` → `'estimated'` on Fills, Credits, Table Win/Loss; completeness derived from `isDropPosted` (D5 worst-input inheritance) |
| B-2.2 | `components/shift-dashboard-v3/left-rail/secondary-kpi-stack.tsx` | Silent fallback | Fallback inverted to `AUTHORITATIVE ? 'actual' : 'estimated'`; `metricGrade="ESTIMATE"` added to Fills and Credits call sites |
| B-2.3 | `components/shift-dashboard/pit-metrics-table.tsx` | Unlabeled | `FinancialValue` imported; both cells wrapped with `type: 'estimated'`, `completeness: 'partial'` |
| B-2.4 | `components/shift-dashboard/table-metrics-table.tsx` | Unlabeled | Same as B-2.3 |
| B-2.5 | `components/shift-dashboard-v3/center/metrics-table.tsx` | Explicit `'actual'` | Two-field `type` fix; Win/Loss row above was already correct |
| B-2.6 | `components/shift-dashboard-v3/center/pit-table.tsx` | Unlabeled | `FinancialValue` imported; both cells wrapped with `type: 'estimated'`, `completeness: 'partial'` |

**Type-check:** passed clean post-patch.  
**Lint/Prettier:** passed via pre-commit hook.  
**Visual verification:** pending — Fills/Credits cells must show the amber
`Estimated` badge (not green `Actual`) across all five components.

---

## Key Implementation Decisions

**Completeness derivation for `rundown-summary-panel.tsx` (B-2.1)**

Fills and Credits completeness was previously hardcoded `'complete'`. The patch
derives it from `isDropPosted` (`rundown.drop_posted_at !== null`), which was
already computed at line 174. If drop is not posted, fills/credits are `'partial'`;
if posted, `'complete'`. Table Win/Loss completeness inherits the same logic (ADR-054
D5 worst-input rule): `null → 'unknown'`, non-null + drop not posted → `'partial'`,
non-null + drop posted → `'complete'`.

**Fallback inversion in `secondary-kpi-stack.tsx` (B-2.2)**

The original fallback (`ESTIMATE ? 'estimated' : 'actual'`) made `'actual'` the
default for any absent or unrecognised `metricGrade`. Inverted to
`AUTHORITATIVE ? 'actual' : 'estimated'`, making `'estimated'` the safe default.
After the patch, no call site in `SecondaryKpiStack` passes `'AUTHORITATIVE'` —
the authoritative branch is intentionally unreachable. This is correct: the component
is an operational telemetry surface, not a provenance-authoritative KPI surface.

**Completeness for live-shift surfaces (B-2.3, B-2.4, B-2.6)**

`ShiftPitMetricsDTO` and `ShiftTableMetricsDTO` carry no closed-shift signal.
Fills and credits accumulate throughout the shift. Completeness is therefore
`'partial'` for all three unlabeled surfaces — consistent with the rationale in
`wave-2-blockers.md §B-2.3`.

**Chart surface exemption**

`shift-dashboard-v3/charts/win-loss-trend-chart.tsx` plots fills/credits as raw
cents series in a Recharts chart with bare `formatCents()` tooltips. Chart
visualizations do not carry the `FinancialValue` authority envelope and are
exempt from the surface labeling requirement. No action taken.

---

## Provenance Stability Confirmation

The remediation did not touch:
- PFT write paths or any `player_financial_transaction` authoring paths
- Grind authoring paths
- MTL or compliance surfaces
- Service layer, hooks, DTOs, migrations, or RPC signatures
- Event lineage or attribution boundaries

The underlying provenance model is intact. These patches corrected surface label
discipline only — ensuring the UI boundary consistently represents fills and credits
as non-ledger operational inputs (`'estimated'`) rather than ledger-authoritative
facts (`'actual'`).

---

## Remaining Pre-Conditions for Wave 2 Producer Wiring

| Blocker | Status | Next action |
|---|---|---|
| B-1 — UL Semantic Stabilization | **OPEN** | Produce Wave 2 UL clarification note; adopt Dependency Event terminology in remaining planning docs |
| B-2 — Surface Violation Patches | **RESOLVED** | Visual badge verification pending |

Wave 2 producer wiring must not begin until B-1 is resolved.
