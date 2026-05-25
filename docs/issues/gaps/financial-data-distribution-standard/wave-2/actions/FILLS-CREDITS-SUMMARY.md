## Fills & Credits Classification — Summary

### The Issue

Fills and credits occupy a precise but easily misread position in the financial model. They are **inventory movements** — operationally concrete, auditable to the cent — but they carry no financial authority over player accounts. The three-document set establishes the complete classification:

| Layer                               | Classification                        | Why                                                                           |
| ----------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| Wave 2 ontology (UL)                | **Dependency Event**                  | They affect shift projections without being authority-bearing financial facts |
| Phase 1.0 surface contract (frozen) | `origin_label: 'estimated'` (Class B) | Non-ledger operational inputs; not player-attributed; not PFT                 |
| What they are NOT                   | Authority Fact / Class A / `'actual'` | That label is reserved for PFT ledger facts: buy-ins, cash-outs, adjustments  |

The critical guardrail from the UL proposition (§4.3): *"Dependency Events do not automatically carry `actual` or `estimated` financial authority."* When they surface in UI, they carry `'estimated'` — not because they are uncertain, but because the surface contract distinguishes ledger-authoritative (`'actual'`) from non-ledger operational (`'estimated'`). That distinction is semantic, not epistemic.

### What the Implementation Got Wrong

Six violations across five files, in two patterns:

**Explicit (`type: 'actual'` hardcoded) — highest severity:**
- `components/table/rundown-summary-panel.tsx` lines 242, 291, 344
- `components/shift-dashboard-v3/center/metrics-table.tsx` lines 119, 133 — particularly sharp because Win/Loss in the same component is correctly `'estimated'`

**Unlabeled (bare `formatCents()`, no authority envelope) — medium severity:**
- `components/shift-dashboard/pit-metrics-table.tsx` lines 166, 169
- `components/shift-dashboard/table-metrics-table.tsx` lines 250, 253
- `components/shift-dashboard-v3/center/pit-table.tsx` lines 53, 56

**Silent fallback (architectural) — medium severity:**
- `components/shift-dashboard-v3/left-rail/secondary-kpi-stack.tsx` line 56 — `metricGrade` absent → defaults to `'actual'`; fallback logic is inverted

### Why This Is a Pre-Condition, Not Just a UI Bug

Once outbox relay is live, surfaces carrying an incorrect authority label risk propagating semantic interpretation drift downstream. Patching after wiring is significantly harder than patching before.

### Proposed Remediation

**B-1 (semantic stabilization):** Adopt Dependency Event terminology in all Wave 2 planning docs before producer wiring. Add a Wave 2 UL clarification note distinguishing projection participation from authority semantics — this is semantic stabilization guidance, not an architectural re-foundation or ADR replacement.

**B-2 (implementation) — six targeted patches:**

| Blocker | File                        | Fix                                                                                                                                   |
| ------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| B-2.1   | `rundown-summary-panel.tsx` | Change Fills/Credits/Win-Loss to `'estimated'`; completeness from `isDropPosted` (already computed at line 174)                       |
| B-2.2   | `secondary-kpi-stack.tsx`   | Invert fallback: `metricGrade === 'AUTHORITATIVE' ? 'actual' : 'estimated'`; add `metricGrade="ESTIMATE"` to Fills/Credits call sites |
| B-2.3   | `pit-metrics-table.tsx`     | Add `FinancialValue` import; wrap both cells with `type: 'estimated'`, `completeness: 'partial'`                                      |
| B-2.4   | `table-metrics-table.tsx`   | Same as B-2.3                                                                                                                         |
| B-2.5   | `metrics-table.tsx`         | Two-character fix per cell: `'actual'` → `'estimated'`; no structural change needed                                                   |
| B-2.6   | `pit-table.tsx`             | Add `FinancialValue` import; wrap both cells with `type: 'estimated'`, `completeness: 'partial'`                                      |

Completion criteria: type-check pass + visual verification that Fills/Credits cells show the amber `Estimated` badge (not green `Actual`) across all five components.

The direction is operationally coherent across all three artifacts and preserves the existing provenance model while refining semantic interpretation boundaries. Nothing in the UL proposition contradicts the Phase 1.0 frozen rule — the Dependency Event framing refines the ontological description without changing the surface label.