I have enough data across all key surfaces. Let me now compile the full audit.

---

## Post-Wave-2 Operational Truth Audit

### Methodology

I traced each financial-ish surface from its UI render point back to its database source, checking: (1) whether the data goes through the Phase 2.3/2.4 projection layer, (2) whether the `FinancialValue` surface rendering contract is honored, and (3) whether completeness signals are lifecycle-aware or hardcoded.

---

### Audit Table

| Surface / Value                                                                  | Source                                                                                                       | Uses projection?                           | Still polling authoring store?                                   | Authority label correct?                                                                             | Completeness correct?                                                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Rating Slip Modal — Financial Summary** (`rating-slip-modal.tsx:711–742`)      | `rpc_get_rating_slip_modal_data` → PFT direct query                                                          | ✗ No                                       | YES — PFT direct                                                 | ✗ **MISSING** — raw `$X.toFixed(2)` strings; `FinancialValue` not used                               | ✗ **MISSING** — no badge at all; also undisclosed UI-side net-position recomputation           |
| **Rating Slip Modal — FormSectionCashIn total** (`form-section-cash-in.tsx:119`) | Same BFF RPC → PFT                                                                                           | ✗ No                                       | YES — PFT direct                                                 | ✗ **MISSING** — raw `$X.toFixed(2)`                                                                  | ✗ **MISSING**                                                                                  |
| **GrindBuyinPanel — "Shift Total"** (`grind-buyin-panel.tsx`)                    | `/api/v1/table-context/operational-projection` → `shift_operational_projection`                              | ✓ YES                                      | No                                                               | ✗ **DISCARDED** — DTO carries `type:'estimated'` but component renders `formatCentsToDollars()` only | ✗ **DISCARDED** — `grindTotal.completeness.status` available, never rendered                   |
| **Shift Dashboard — Win/Loss** (`hero-win-loss-compact.tsx`)                     | `rpc_shift_casino_metrics` → `rpc_shift_table_metrics` → `table_fill`+`table_credit`+`table_buyin_telemetry` | ✗ No                                       | YES — direct authoring store aggregation                         | ✓ Correct — maps to `'estimated'` (metric_grade hardcoded ESTIMATE in SQL)                           | ✗ **LIE** — hardcodes `status:'complete'` when non-null; no lifecycle gate                     |
| **Shift Dashboard — Fills / Credits / Est.Drop** (`secondary-kpi-stack.tsx`)     | Same RPC chain → `table_fill`, `table_credit`, `table_buyin_telemetry`                                       | ✗ No                                       | YES                                                              | ✓ Correct — hardcoded `metricGrade="ESTIMATE"` → `'estimated'`                                       | ✗ **LIE** — hardcodes `status: valueCents == null ? 'unknown' : 'complete'`; no lifecycle gate |
| **Analytics Panel — Estimated Drop** (`analytics-panel.tsx:176`)                 | `rpc_shift_table_metrics` → `table_buyin_telemetry`                                                          | ✗ No                                       | YES                                                              | ✓ `type:'estimated'`, `source:'shift_metrics'`                                                       | ✗ **LIE** — `status: tableMetrics == null ? 'unknown' : 'complete'`; no lifecycle gate         |
| **Telemetry Rail — Cash Observations** (`telemetry-rail-panel.tsx`)              | `fetchCashObsCasino` → `pit_cash_observation`                                                                | N/A — Observed class, not outbox-projected | YES (intended for Observed class)                                | ✓ `type:'observed'` correct                                                                          | ✗ Hardcodes `status:'complete'`; no lifecycle awareness                                        |
| **Visit Financial Summary** (`GET /api/v1/visits/[visitId]/financial-summary`)   | `visit_financial_summary` view + `visit_class_a_projection` via `createServiceClient()`                      | ✓ YES (Phase 2.3)                          | Yes (view aggregates PFT) but completeness is projection-derived | ✓ `type:'actual'`, `source:'PFT'`                                                                    | ✓ Lifecycle-aware via `getVisitClassACompleteness`                                             |

---

### Findings

#### F1 — CRITICAL: Rating Slip Modal renders financial values without the surface rendering contract

**Files**: `rating-slip-modal.tsx:711–742`, `form-section-cash-in.tsx:119`

The "Financial Summary" section (`Cash In / Chips Out / Net Position`) renders raw dollar strings using `$.toFixed(2)`. The `FinancialValue` component is not used. No authority badge, no source label, no completeness badge appears on screen. This violates ADR-054 surface rendering contract at the highest-traffic operator surface.

Additional: `computedNetPosition` includes an undisclosed UI-side sum — `modalData.financial.totalCashOut.value + pendingChipsTaken * 100` — adding an unsaved form field to an authoritative DTO without surfacing that the displayed number is a preview composite.

The DTOs carry the envelope (`type: 'actual'`, `source: 'PFT'`, `completeness: {status: 'unknown'}`). The information is available. The component throws it away.

---

#### F2 — HIGH: GrindBuyinPanel discards the projection envelope at the render boundary

**File**: `grind-buyin-panel.tsx:line ~110`

This surface does the right thing architecturally: it reads from `/api/v1/table-context/operational-projection` → `shift_operational_projection` (Phase 2.4). The `OperationalProjectionResponseDTO` carries `type: 'estimated'` and a lifecycle-aware `completeness.status`. But the component renders only:

```ts
formatCentsToDollars(grindTotal?.totalCents ?? 0)
```

No `FinancialValue`, no `estimated` badge, no completeness signal. The projection layer was built; the surface layer ignores it.

**Secondary issue**: `totalCents = grind_volume_cents + fill_total_cents + credit_total_cents` — the panel is labeled "Grind Buy-ins" but the total it displays includes fills and credits from the projection store. The `count` field (shown as "N buy-ins") similarly counts all operational events.

---

#### F3 — HIGH: Shift Dashboard does not consume `shift_operational_projection`

**Files**: `hero-win-loss-compact.tsx`, `secondary-kpi-stack.tsx`, `analytics-panel.tsx`

`rpc_shift_table_metrics` (the source of all shift dashboard financial values) reads `table_fill`, `table_credit`, and `table_buyin_telemetry` **directly** — not from `shift_operational_projection`. The Phase 2.4 projection store exists but is wired only to `GrindBuyinPanel` via the operational projection route. The shift dashboard surfaces never touch it.

This means:
- **Fills and Credits** on the shift dashboard are direct authoring-store reads. The outbox spine is not in the loop.
- **Estimated Drop** is direct `table_buyin_telemetry` — same as pre-Wave-2.
- **Win/Loss** is inventory snapshot arithmetic on those same tables.

All three surfaces claim `completeness: 'complete'` or `completeness: valueCents == null ? 'unknown' : 'complete'` with no lifecycle gate. An open gaming day with unprocessed outbox events looks identical to a fully settled one.

---

#### F4 — MEDIUM: Telemetry Rail (pit cash observations) hardcodes `'complete'`

**File**: `telemetry-rail-panel.tsx`

The authority type `'observed'` is correct. But `completeness: { status: 'complete' }` is hardcoded — there is no lifecycle-aware signal for pit cash observations. For an in-progress shift this is false.

---

### What IS clean

| Path                                             | Why it's clean                                                                                                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/visits/[visitId]/financial-summary` | Uses `createServiceClient()` → `visit_class_a_projection` + `gaming_day_lifecycle` for completeness. `FinancialValue` envelope is populated correctly at the mapper layer. |
| Outbox observability admin surface               | Read-only, no authority claims, relay health only.                                                                                                                         |
| `VisitCashInWithAdjustmentsDTO` mapper           | Hardcodes `unknown` — acknowledged and correct; per PRD-070 policy.                                                                                                        |

---

### Summary Assessment

The outbox transport spine and projection stores are structurally sound. The problem is the **render boundary**: several surfaces receive correct projection data but discard the envelope before rendering, and the shift dashboard's aggregate RPCs never cross the projection layer at all.

The three root defects:

1. **Rating slip modal** never adopted `FinancialValue` — it pre-dates the rendering contract and wasn't migrated.
2. **GrindBuyinPanel** wired the correct source but rendered it as a raw number — the Phase 2.4 work stopped at the API route, not the component.
3. **`rpc_shift_table_metrics`** was not updated to read from `shift_operational_projection` — the shift dashboard surfaces are effectively pre-Phase-2.4 in their data plumbing.

None of these are transport or projection bugs. They are surface layer gaps where authority and completeness signals are either absent or manufactured.

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