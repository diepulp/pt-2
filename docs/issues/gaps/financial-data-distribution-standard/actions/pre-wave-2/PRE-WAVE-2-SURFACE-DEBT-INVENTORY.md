# Pre-Wave-2 Surface Debt — Field Inventory

---

status: complete
date: 2026-05-06
scope: 12 fields across 4 DTOs — minimum 6 (required) + 6 compliance residual (recommended)
parent: wave-2/pre-phase-2-surface-debt-initiation-directive.md
dispositions: PRE-WAVE-2-SURFACE-DEBT-DISPOSITIONS.md

---

## How to read this document

Each field entry records:
- **Route / DTO** — the HTTP surface and service-layer type
- **Unit** — the bare-number semantic (cents, unless noted)
- **Source store** — the database origin
- **Current rendering** — how the field reaches the user today
- **Bare-number consumers** — every callsite that reads the field as a raw `number`
- **Classification target** — the authority/source/completeness values when wrapped

This document is a read artifact. Dispositions (A/B/C/D) are recorded separately in `PRE-WAVE-2-SURFACE-DEBT-DISPOSITIONS.md`.

---

## Group 1 — Visit Financial Summary (minimum required)

### Route: `GET /api/v1/visits/[visitId]/financial-summary`

Handler: `app/api/v1/visits/[visitId]/financial-summary/route.ts`
Service: `createPlayerFinancialService → getVisitSummary(visitId)`
Mapper: `services/player-financial/mappers.ts → toVisitFinancialSummaryDTO`
Source view: `visit_financial_summary` (aggregates `player_financial_transaction`)

---

#### Field: `VisitFinancialSummaryDTO.total_in`

| Property | Value |
|---|---|
| Type | `number` |
| Unit | Integer cents |
| Semantic | Sum of all `direction = 'in'` PFT transactions for the visit |
| Source store | `player_financial_transaction` (Class A — Ledger) |
| Classification target | `type: 'actual'`, `source: "PFT"` |
| Completeness | `'partial'` while visit OPEN; `'complete'` when CLOSED; `'unknown'` if lifecycle ambiguous |

**Bare-number consumers:**

| Callsite | Role |
|---|---|
| `app/api/v1/rating-slips/[id]/modal-data/route.ts:303` | BFF populates `FinancialSectionDTO.totalCashIn` |
| `hooks/mtl/use-patron-daily-total.ts:125` | Cross-context consumer (MTL hook reading player-financial value) |
| `components/mtl/gaming-day-summary.tsx:272` | Renders in MTL compliance view |
| `app/(dashboard)/players/[playerId]/timeline/_components/compliance-panel-wrapper.tsx:43` | Timeline compliance panel |
| `services/player360-dashboard/mappers.ts` | Arithmetic on `.total_in` in derived player-360 mapper |

**Implementation note:** The `toVisitFinancialSummaryDTO` mapper does not receive visit status. Completeness cannot be determined at mapper level without a schema join or an additional parameter. EXEC-SPEC must decide: emit `'unknown'` at service layer (honest default), or extend mapper signature to accept visit status.

---

#### Field: `VisitFinancialSummaryDTO.total_out`

| Property | Value |
|---|---|
| Type | `number` |
| Unit | Integer cents |
| Semantic | Sum of all `direction = 'out'` PFT transactions for the visit |
| Source store | `player_financial_transaction` (Class A — Ledger) |
| Classification target | `type: 'actual'`, `source: "PFT"` |
| Completeness | Same lifecycle rule as `total_in` |

**Bare-number consumers:**

| Callsite | Role |
|---|---|
| `app/api/v1/rating-slips/[id]/modal-data/route.ts:304` | BFF populates `FinancialSectionDTO.totalCashOut` |
| `hooks/mtl/use-patron-daily-total.ts:126` | Cross-context consumer (MTL hook) |
| `components/mtl/gaming-day-summary.tsx:288` | Renders in MTL compliance view |
| `services/player360-dashboard/mappers.ts` | Arithmetic on `.total_out` |

---

#### Field: `VisitFinancialSummaryDTO.net_amount`

| Property | Value |
|---|---|
| Type | `number` |
| Unit | Integer cents |
| Semantic | `total_in − total_out`; can be negative |
| Source store | Derived from `player_financial_transaction` (Class A) |
| Classification target | `type: 'actual'`, `source: "PFT"` (both operands are Class A; no authority degradation) |
| Completeness | Same lifecycle rule as `total_in` |

**Bare-number consumers:**

| Callsite | Role |
|---|---|
| `app/api/v1/rating-slips/[id]/modal-data/route.ts:305` | BFF populates `FinancialSectionDTO.netPosition` |
| `services/player360-dashboard/mappers.ts` | Arithmetic on `.net_amount` |

---

## Group 2 — Rating Slip Modal Financial Section (minimum required)

### Route: `GET /api/v1/rating-slips/[id]/modal-data`

Handler: `app/api/v1/rating-slips/[id]/modal-data/route.ts`
DTO: `services/rating-slip-modal/dtos.ts → FinancialSectionDTO` (nested inside `RatingSlipModalDTO.financial`)
Population: route handler directly maps `VisitFinancialSummaryDTO → FinancialSectionDTO` at lines 302–306

This is a BFF aggregation route. It is consumed by a single UI component: `components/modals/rating-slip/rating-slip-modal.tsx`.

---

#### Field: `FinancialSectionDTO.totalCashIn`

| Property | Value |
|---|---|
| Type | `number` |
| Unit | Integer cents (populated directly from `VisitFinancialSummaryDTO.total_in`) |
| Semantic | Visit buy-in total as of request time |
| Source store | `player_financial_transaction` (Class A — via `VisitFinancialSummaryDTO`) |
| Classification target | `type: 'actual'`, `source: "PFT"` |
| Completeness | Inherits from `VisitFinancialSummaryDTO.total_in` lifecycle rule |

**Bare-number consumers:**

| Callsite | Role |
|---|---|
| `components/modals/rating-slip/rating-slip-modal.tsx:554` | `const totalCashIn = modalData.financial.totalCashIn / 100` — bare dollar conversion |
| `components/modals/rating-slip/rating-slip-modal.tsx:718` | `${totalCashIn.toFixed(2)}` — rendered bare, no authority label |
| `components/modals/rating-slip/rating-slip-modal.tsx:921` | Passed as `currentTotal` prop to buy-in form section |
| `components/modals/rating-slip/form-section-cash-in.tsx:24` | Prop type `totalCashIn?: number` |
| `components/modals/rating-slip/form-section-cash-in.tsx:119` | `${totalCashIn.toFixed(2)}` — displayed as bare dollar |

**Note:** The `/100` at `rating-slip-modal.tsx:554` is a manual dollar conversion. After wrap, the UI must read `totalCashIn.value` (already integer cents) and call `formatCents()`.

---

#### Field: `FinancialSectionDTO.totalCashOut`

| Property | Value |
|---|---|
| Type | `number` |
| Unit | Integer cents |
| Semantic | Visit cashout total; used together with `pendingChipsTaken` in modal arithmetic |
| Source store | `player_financial_transaction` (Class A — via `VisitFinancialSummaryDTO`) |
| Classification target | `type: 'actual'`, `source: "PFT"` |
| Completeness | Inherits lifecycle rule |

**Bare-number consumers:**

| Callsite | Role |
|---|---|
| `components/modals/rating-slip/rating-slip-modal.tsx:560` | `(modalData.financial.totalCashOut + pendingChipsTaken * 100) / 100` — arithmetic with pending input |

**Note:** The `+ pendingChipsTaken * 100` is a UI-local adjustment for chips not yet committed. After wrap, this becomes `totalCashOut.value + pendingChipsTaken * 100`, and the result (derived local number, not an emitted FinancialValue) drives `computedChipsOut`.

---

#### Field: `FinancialSectionDTO.netPosition`

| Property | Value |
|---|---|
| Type | `number` |
| Unit | Integer cents |
| Semantic | Visit net position (populated from `VisitFinancialSummaryDTO.net_amount`; overridden locally by `computedNetPosition`) |
| Source store | `player_financial_transaction` (Class A — derived) |
| Classification target | `type: 'actual'`, `source: "PFT"` |
| Completeness | Inherits lifecycle rule |

**Bare-number consumers:**

| Callsite | Role |
|---|---|
| `components/modals/rating-slip/rating-slip-modal.tsx:564` | `const computedNetPosition = totalCashIn - computedChipsOut` — the wire value is immediately replaced by local arithmetic |

**Note:** `netPosition` from the wire is not rendered directly; the UI computes `computedNetPosition = totalCashIn - computedChipsOut` locally and uses that for display. After wrap, `netPosition.value` is ignored in this arithmetic; the UI's local computation is still a derived bare number (not a FinancialValue). The wire field must still be wrapped to satisfy the surface contract — callers of the route who are not this specific UI component must receive an honest envelope.

---

## Group 3 — MTL Entry (recommended residual)

### Route: `GET /api/v1/mtl/entries` / `GET /api/v1/mtl/entries/[id]`

DTO: `services/mtl/dtos.ts → MtlEntryDTO`
Source table: `mtl_entry`
Classification: Compliance-parallel (ADR-052 taxonomy; not Class A or Class B)

---

#### Field: `MtlEntryDTO.amount`

| Property | Value |
|---|---|
| Type | `number` |
| Unit | Integer cents (per ISSUE-FB8EB717) |
| Semantic | Individual AML/CTR-tracked cash transaction amount |
| Source store | `mtl_entry` (Compliance class — parallel, never merged with operational/ledger) |
| Classification target | `type: 'compliance'`, `source: "mtl_entry"`, completeness: `'complete'` per row |

**Bare-number consumers:**

| Callsite | Role |
|---|---|
| `components/mtl/entry-list.tsx:229` | Renders transaction amount in list view |
| `components/mtl/entry-detail.tsx:168` | Renders in detail pane |
| `components/mtl/mtl-entry-form.tsx:460,462,547,679,681` | Multiple render points in entry form |
| `components/mtl/mtl-entry-view-modal.tsx:226,228,306,429,431` | Multiple render points in view modal |
| `components/mtl/compliance-dashboard.tsx:386` | Compliance dashboard entry row |
| `app/review/mtl-form/mtl-entry-form.tsx:515,517,611,756,758` | Review-path entry form |

**Note:** `CreateMtlEntryInput.amount` is a §6.1 operator-input carve-out — not a FinancialValue candidate.

---

## Group 4 — MTL Gaming Day Summary (recommended residual)

### Route: `GET /api/v1/mtl/gaming-day-summary`

DTO: `services/mtl/dtos.ts → MtlGamingDaySummaryDTO`
Source view: `mtl_gaming_day_summary` (aggregates `mtl_entry` per patron per gaming day)
Classification: Compliance-parallel aggregate

---

#### Field: `MtlGamingDaySummaryDTO.total_in`

| Property | Value |
|---|---|
| Type | `number` |
| Unit | Integer cents |
| Semantic | Sum of cash-in transactions for patron on gaming day |
| Classification target | `type: 'compliance'`, `source: "mtl_entry"`, completeness: `'partial'` (day open), `'complete'` (day closed), `'unknown'` (boundary ambiguous) |

**Bare-number consumers:**

| Callsite | Role |
|---|---|
| `components/mtl/gaming-day-summary.tsx:272` | Renders in-total in compliance summary |
| `components/mtl/compliance-dashboard.tsx:132` | Compliance dashboard aggregate row |
| `hooks/mtl/use-patron-daily-total.ts:125` | Computes patron daily total |

---

#### Field: `MtlGamingDaySummaryDTO.total_out`

| Property | Value |
|---|---|
| Type | `number` |
| Unit | Integer cents |
| Semantic | Sum of cash-out transactions for patron on gaming day |
| Classification target | `type: 'compliance'`, `source: "mtl_entry"` — same completeness rule as `total_in` |

**Bare-number consumers:**

| Callsite | Role |
|---|---|
| `components/mtl/gaming-day-summary.tsx:288` | Renders out-total in compliance summary |
| `hooks/mtl/use-patron-daily-total.ts:126` | Computes patron daily total |

---

#### Field: `MtlGamingDaySummaryDTO.max_single_in`

| Property | Value |
|---|---|
| Type | `number \| null` |
| Unit | Integer cents |
| Semantic | Largest single cash-in transaction for patron on gaming day |
| Classification target | `type: 'compliance'`, `source: "mtl_entry"`, completeness: same rule |

**Bare-number consumers:** Not surfaced in UI grep — value flows from DB view without named render callsites found. Confirm at EXEC-SPEC stage with targeted grep.

---

#### Field: `MtlGamingDaySummaryDTO.max_single_out`

| Property | Value |
|---|---|
| Type | `number \| null` |
| Unit | Integer cents |
| Semantic | Largest single cash-out transaction for patron on gaming day |
| Classification target | `type: 'compliance'`, `source: "mtl_entry"`, completeness: same rule |

**Bare-number consumers:** Same as `max_single_in` — confirm at EXEC-SPEC stage.

---

#### Field: `MtlGamingDaySummaryDTO.total_volume`

| Property | Value |
|---|---|
| Type | `number` |
| Unit | Integer cents |
| Semantic | `total_in + total_out` — combined cash flow volume for CTR aggregate badge logic |
| Classification target | `type: 'compliance'`, `source: "mtl_entry"` — same completeness rule; both operands are compliance-class so no authority degradation |

**Bare-number consumers:** Consumed by `agg_badge` logic. Named UI render callsites not found in surface grep — confirm at EXEC-SPEC stage.

---

## Cross-cutting implementation constraints

### Visit lifecycle and completeness

`VisitFinancialSummaryDTO` fields cannot determine completeness at mapper level — the mapper does not receive visit status from the `visit_financial_summary` view. Two options for EXEC-SPEC:

| Option | Description | Trade-off |
|---|---|---|
| **Option A — Honest unknown** | Mapper emits `completeness: { status: 'unknown' }` always. BFF routes that know visit status (modal-data) override completeness when building their section DTOs. | Simplest. Standalone `/financial-summary` consumers see `'unknown'` — honest but potentially surprising. |
| **Option B — View join** | Extend `visit_financial_summary` view (or add a new view variant) to include `visit_status`. Mapper uses it to set completeness correctly. | Correct but requires a schema-adjacent change — may be pre-Wave-2 scope creep. Wave 1 non-goal (no schema changes) technically no longer applies, but this is a view, not a table migration. |

Recommended: **Option A** for this pre-Wave-2 slice. Note in tracker as a Wave 2 refinement candidate.

### MTL consumer blast radius

`MtlEntryDTO.amount` has 13+ named consumer callsites across 6 files. Wrapping as `FinancialValue` requires updating every read point that currently calls a currency formatter directly on `.amount`. The EXEC-SPEC must enumerate and bound these changes explicitly — they are the primary scope risk for the MTL slice.

### Non-debt confirmation

The following fields were audited and confirmed as permanent bare-number carve-outs per WAVE-1-CLASSIFICATION-RULES:

- `SlipSectionDTO.averageBet` — ratio/operator input, §6.1 carve-out
- `LoyaltySuggestionDTO.suggestedTheo` — loyalty domain, not financial domain
- `CasinoThresholds.watchlistFloor/ctrThreshold` — policy/config thresholds, §6.2 carve-out
- `MtlEntryFilters.min_amount` / `MtlGamingDaySummaryFilters.min_total_in` etc. — filter thresholds, §6.2 carve-out
- `MtlGamingDaySummaryDTO.count_in/count_out/entry_count` — counts, not currency
