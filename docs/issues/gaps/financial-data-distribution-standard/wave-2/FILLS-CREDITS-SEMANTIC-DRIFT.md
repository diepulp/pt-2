Here is the complete picture.

---

## Semantic Drift — Fills & Credits: Full Findings

### What Phase 1.0 Decided (Frozen)

The surface audit's §8.1 "Custody Fact" proposal — which provisionally labeled fills/credits as **Actual (Custody)** — was **pre-decision and overruled** at Phase 1.0 sign-off. `WAVE-1-CLASSIFICATION-RULES §3.2` resolved it explicitly:

> ADR-052 §D1's "equivalent table-level money movement" folds custody-chain into Class B. No fifth class is introduced; fills/credits/drop classify as `estimated`.

The canonical Phase 1.0 rule is:

| Source                              | `fact_class`  | `origin_label` | Completeness                           |
| ----------------------------------- | ------------- | -------------- | -------------------------------------- |
| `table_fill.amount_cents`           | `operational` | `'estimated'`  | `complete` per row                     |
| `table_credit.amount_cents`         | `operational` | `'estimated'`  | `complete` per row                     |
| `table_session.fills_total_cents`   | `operational` | `'estimated'`  | `partial` (OPEN) / `complete` (CLOSED) |
| `table_session.credits_total_cents` | `operational` | `'estimated'`  | `partial` (OPEN) / `complete` (CLOSED) |

The DTO file confirms this: `services/table-context/dtos.ts:19–23` carries a comment block specifying `'estimated'` for all four variants.

---

### What the Implementation Actually Does

| File                                                              | Lines    | Field          | Current label                                        | Required                                      | Severity                     |
| ----------------------------------------------------------------- | -------- | -------------- | ---------------------------------------------------- | --------------------------------------------- | ---------------------------- |
| `components/table/rundown-summary-panel.tsx`                      | 243, 291 | Fills, Credits | `type: 'actual'` explicit                            | `type: 'estimated'`                           | **EXPLICIT VIOLATION**       |
| `components/shift-dashboard-v3/center/metrics-table.tsx`          | 119, 133 | Fills, Credits | `type: 'actual'` explicit (Win/Loss row above is correct) | `type: 'estimated'`                    | **EXPLICIT VIOLATION**       |
| `components/shift-dashboard-v3/left-rail/secondary-kpi-stack.tsx` | ~79–90   | Fills, Credits | no `metricGrade` → defaults to `'actual'` at line 56 | pass `metricGrade='ESTIMATE'` or fix fallback | **SILENT MISCLASSIFICATION** |
| `components/shift-dashboard/pit-metrics-table.tsx`                | 167, 170 | Fills, Credits | bare `formatCents()`                                 | `FinancialValue` with `type: 'estimated'`     | **UNLABELED**                |
| `components/shift-dashboard/table-metrics-table.tsx`              | 251, 254 | Fills, Credits | bare `formatCents()`                                 | `FinancialValue` with `type: 'estimated'`     | **UNLABELED**                |
| `components/shift-dashboard-v3/center/pit-table.tsx`              | 53, 56   | Fills, Credits | bare `formatCents()`                                 | `FinancialValue` with `type: 'estimated'`     | **UNLABELED**                |

`rundown-summary-panel.tsx` is the sharpest violation — it passes `type: 'actual'` to a `<FinancialValue>` component with `source: 'table_rundown'`. This is inconsistent with the ADR-052 §D4 surface contract (Class B = `'estimated'`) and the ADR-054 §D5 immutability rule for origin labels in transit.

`metrics-table.tsx` compounds this: Win/Loss in the same component is correctly marked `'estimated'`, but the Fills and Credits cells immediately below it revert to `'actual'` — the violation is invisible in isolation but glaring in context.

The secondary-kpi-stack violation is architectural: a fallback of `'actual'` when `metricGrade` is absent means any future fill/credit consumer who omits the prop will silently misclassify.

`shift-dashboard-v3/charts/win-loss-trend-chart.tsx` plots fills/credits as raw cents series in a Recharts chart. Chart visualizations are exempt — they carry no `FinancialValue` authority badge and are not classified as authority-bearing surfaces.

---

### The Wave 2 UL Tension

The Wave 2 UL proposition introduces a new and more precise category: **Dependency Event** — which explicitly says fills/credits "do NOT automatically carry `actual` or `estimated` financial authority." That is a tighter claim than Phase 1.0's Class B assignment.

This creates a productive ambiguity:

- **Phase 1.0 (frozen):** fills/credits = Class B = `'estimated'` — they carry operational authority in the `estimated` tier, because they affect shift financial telemetry computations.
- **Wave 2 UL (proposed):** fills/credits = Dependency Event — they influence projections but aren't themselves financial authority facts of any class.

These are not contradictory, but the resolution matters for how the outbox will categorize them. The DEC-UL-4 decision ("shared propagation does not imply shared authority") points toward the Dependency Event framing being the right Wave 2 anchor — with `'estimated'` being the surface label they carry *when surfaced as part of a projection*, not an intrinsic class they hold themselves.

---

### Summary

The implementation applied `'actual'` (PFT-class) labeling to fills and credits in three places and left them unlabeled in three others — six surface violations across five files.

**Provenance stability note:** The underlying provenance model is intact. Fills and credits remain operational inventory events, attribution boundaries are preserved, and no player-ledger authority escalation occurred in the data layer. This is a surface label discipline issue, not a provenance failure or event lineage corruption. The remediation targets semantic consistency at the UI boundary — ensuring non-ledger operational inputs consistently carry `'estimated'`, preventing semantic interpretation drift once outbox relay propagation is live.

The chart surface (`win-loss-trend-chart.tsx`) is exempt — it carries no authority badge.