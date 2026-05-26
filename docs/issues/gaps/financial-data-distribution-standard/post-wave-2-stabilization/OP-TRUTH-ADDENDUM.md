I have the full picture. Here is the inventory management addendum to the audit.

---

## Audit Addendum — Inventory Management / Pit Terminal

These surfaces live in `InventoryPanel` and its child components. They are a separate formula domain from the PFT/grind outbox domain — but they still carry financial values that need authority classification.

### Additional Surface Table

| Surface / Value                                                                             | Source                                                                                                         | Uses projection?      | Still polling authoring store?  | Authority label correct?                                                          | Completeness correct?                                                              |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **BankSummary — "Total Value"** (`bank-summary.tsx`)                                        | `useInventorySnapshots` → `table_inventory_snapshot` direct read                                               | ✗ No                  | YES                             | ✗ **MISSING** — raw `$${totalValue.toLocaleString()}`; `FinancialValue` not used  | ✗ **MISSING**                                                                      |
| **ChipCountCaptureDialog — "Total Bankroll"** (`chip-count-capture-dialog.tsx:239`)         | In-memory `calculateChipsetTotal(chipset)` — live form preview, not yet persisted                              | N/A — data entry form | N/A                             | Not applicable — this is the authoring UI, not a value display surface            | N/A                                                                                |
| **RundownSummaryPanel — Opening / Closing** (`rundown-summary-panel.tsx`)                   | `rpc_compute_table_rundown` → `table_inventory_snapshot` (chip count snapshots)                                | ✗ No                  | YES                             | ⚠ Uses `'actual'` — inventory snapshots are physical chip counts, not PFT entries | ✓ `opening_total_cents == null ? 'unknown' : 'complete'` — meaningful null-gate    |
| **RundownSummaryPanel — Fills / Credits**                                                   | Same RPC → `table_session.fills_total_cents` / `credits_total_cents` (denorm from `table_fill`/`table_credit`) | ✗ No                  | YES — authoring store denorm    | ✓ `type: 'estimated'` — correct per ADR-054 R4                                    | ✓ `isDropPosted ? 'complete' : 'partial'` — genuine lifecycle gate                 |
| **RundownSummaryPanel — Drop**                                                              | Same RPC → `table_session.drop_total_cents` (manual pit entry)                                                 | ✗ No                  | YES                             | ⚠ Uses `'actual'` — manually posted value, not a PFT entry                        | ✓ `drop_total_cents == null ? 'unknown' : 'complete'`                              |
| **RundownSummaryPanel — Table Win/Loss**                                                    | Formula: `closing + credits + drop − opening − fills` (SQL layer)                                              | ✗ No                  | N/A — derived                   | ✓ `type: 'estimated'` + `derivedFrom` — correct mixed-authority degradation       | ✓ `isDropPosted ? 'complete' : 'partial'` — tied to the only real gate that exists |
| **RundownReportCard — Win/Loss / Fills / Credits / Drop** (`rundown-report-card.tsx:82–96`) | `useRundownReport` → `table_rundown_report` table (persisted snapshot)                                         | ✗ No                  | NO — reads persisted report row | ✗ **MISSING** — `formatCents()` raw strings; `FinancialValue` not used            | ✗ **MISSING**                                                                      |

---

### Findings (Inventory Domain)

#### F5 — MEDIUM: BankSummary renders the live bankroll without any authority envelope

**File**: `pit-panels/bank-summary.tsx:73`

The "Total Value" is the sum of the most recent `table_inventory_snapshot` chipset — a physical chip count entered by a pit boss. This is a Dependency Event source in Wave 2 UL terms (it feeds the opening/closing inputs for win/loss formulas). It renders as `$${totalValue.toLocaleString()}` with no `FinancialValue`, no source label, no completeness.

---

#### F6 — LOW-MEDIUM: RundownReportCard drops the envelope that RundownSummaryPanel correctly applies

**File**: `components/table/rundown-report-card.tsx:82–96`

The persisted rundown report (same formula data as `RundownSummaryPanel`) renders all four financial lines — Win/Loss, Fills, Credits, Drop — as `formatCents()` raw strings. The adjacent `RundownSummaryPanel` component applies `FinancialValue` consistently to the same values. These two components are rendering the same domain with inconsistent discipline: `RundownSummaryPanel` is the model; `RundownReportCard` ignores it.

---

#### NOTE — CLEAN: RundownSummaryPanel is the best-implemented financial surface in the system

`RundownSummaryPanel` (`components/table/rundown-summary-panel.tsx`) is the only surface that:
- Uses `FinancialValue` on every line
- Applies correct authority labels for its domain (`'estimated'` for fills/credits and the derived win/loss, Pattern B `derivedFrom` declared)
- Ties completeness to a genuine operational lifecycle signal (`isDropPosted`) rather than hardcoding it

This is the reference implementation. The gaps elsewhere in the system are deviations from this pattern, not from an aspirational standard that doesn't exist in code.

---

#### STRUCTURAL NOTE — Fills/Credits: Dual-Path Divergence Risk

Fills and credits now have **two parallel read paths** for the same underlying events:

1. **Rundown formula** reads `table_session.fills_total_cents` / `credits_total_cents` — denormalized columns maintained by trigger on `table_fill` / `table_credit`
2. **Shift operational projection** reads `finance_outbox` events (`fill.recorded` / `credit.recorded`) via `rpc_process_operational_projection`

Both paths read from the same source data, but via different denormalization routes. If the trigger-maintained denorm column and the outbox projection diverge (delivery failure, replay, out-of-order processing), the rundown formula and `GrindBuyinPanel` operational total will show different numbers for the same fills/credits with no reconciliation signal visible on either surface. This is not a current bug, but it is a structural consistency risk that the outbox was supposed to close.

---

### Authority Classification Concern — Inventory Snapshots as `'actual'`

`RundownSummaryPanel` labels Opening and Closing bankroll snapshots as `type: 'actual'` and Drop as `type: 'actual'`. These are not PFT entries — they are physical chip counts taken by pit bosses and a manually posted drop figure. In ADR-052 terms, inventory snapshots are Dependency Events (they influence win/loss projections but are not Class A ledger facts). The `'actual'` label signals PFT-class ledger authority they do not have.

A more accurate type for inventory snapshots would be `'observed'` — physical observation of a verifiable physical quantity. `'estimated'` would be incorrect (they are counted to the chip). This is a classification edge case at the boundary between the pilot's financial model and its inventory model, but it affects what operators read on screen.