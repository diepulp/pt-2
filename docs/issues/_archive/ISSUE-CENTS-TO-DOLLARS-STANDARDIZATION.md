# ISSUE: Cents-to-Dollars Conversion Standardization

**ID**: ISSUE-CENTS-DOLLARS
**Severity**: High (data display corruption in production UI)
**Status**: Partially Remediated
**Created**: 2026-01-29
**Reporter**: User report ("buy-in of $100 displayed as $10,000")

---

## 1. Executive Summary

The PT-2 system stores financial amounts in **cents** (integer multiples of 100) in
`player_financial_transaction` and `mtl_entry`, but in **dollars** in `rating_slip.average_bet`.
This dual convention is undocumented at the database column level, has no shared conversion
utility, and the boundary where cents become dollars varies by code path (RPC, service mapper,
component). Four service-layer fixes and one SQL migration were applied on 2026-01-29 to
address the reported display bug. This report audits every financial amount touchpoint,
assesses residual risk, and recommends standardization work.

---

## 2. Root Cause

`hooks/rating-slip-modal/use-save-with-buyin.ts:121` converts user-entered dollar amounts
to cents before writing to `player_financial_transaction`:

```typescript
amount: newBuyIn * 100, // Convert dollars to cents
```

Downstream consumers (RPCs, services, components) must reverse this conversion before display.
Multiple code paths failed to do so, or performed the conversion at inconsistent layers.

---

## 3. Storage Convention Map

| Table / View | Column | Type | Unit | Evidence |
|---|---|---|---|---|
| `player_financial_transaction` | `amount` | numeric | **CENTS** | `use-save-with-buyin.ts:121` multiplies by 100 |
| `mtl_entry` | `amount` | numeric | **CENTS** | `services/mtl/dtos.ts:139` comment, test values (5000 = $50) |
| `rating_slip` | `average_bet` | numeric | **DOLLARS** | Displayed directly in `active-slips-panel.tsx:340` |
| `visit_financial_summary` (view) | `total_in`, `total_out`, `net_amount` | numeric | **CENTS** | Aggregates raw `pft.amount` |
| `table_context` entities | `amount_cents`, `discrepancy_cents` | int | **CENTS** | Explicit `_cents` suffix convention |
| `loyalty_ledger` | `points_delta` | numeric | **POINTS** | Not a currency amount |

**Critical gap**: None of these columns have a SQL `COMMENT` documenting their unit.
The `_cents` suffix convention in `table_context` is the only self-documenting pattern.

---

## 4. Conversion Boundary Audit

### 4.1 Dollars-to-Cents (Write Path)

| Location | Conversion | Status |
|---|---|---|
| `hooks/rating-slip-modal/use-save-with-buyin.ts:121` | `newBuyIn * 100` | Correct |
| `components/table/grind-buyin-panel.tsx:86` | `Math.round(dollars * 100)` | Correct |
| `components/mtl/mtl-entry-form.tsx:718` | `Math.round(data.amount * 100)` | Correct |
| `components/modals/rating-slip/rating-slip-modal.tsx:394` | `data.deltaAmount * 100` | Correct |
| `components/mtl/compliance-dashboard.tsx:192` | `data.deltaAmount * 100` | Correct |

All write paths correctly convert dollars to cents. No issues found.

### 4.2 Cents-to-Dollars (Read Path)

Conversion happens at three possible layers. The table below shows where each
data path performs its conversion:

| Data Path | RPC Layer | Service Layer | Component Layer | Status |
|---|---|---|---|---|
| **Timeline events** (`rpc_get_player_timeline`) | `/100` (migration 20260129) | ~~`/100`~~ removed | none | **Fixed** (was double-converting) |
| **Player summary** (`getPlayerSummary`) | none | `/100` in `crud.ts:243-244` | none | **Fixed** |
| **Recent sessions** (`rpc_get_player_recent_sessions`) | none | `/100` in `visit/crud.ts:518-520` | none | **Fixed** |
| **Visit live view** (`rpc_get_visit_live_view`) | none | `/100` in `rating-slip/mappers.ts:337-339` | none | **Fixed** |
| **MTL entries** (direct table query) | none | none | `/100` in 4 MTL components | Correct |
| **Rating slip modal** (financial aggregates) | none | none | `/100` in `rating-slip-modal.tsx:297,540` | Correct |
| **Closed sessions panel** (`average_bet`) | N/A | N/A | none (already dollars) | Correct |
| **Active slips panel** (`average_bet`) | N/A | N/A | none (already dollars) | Correct |
| **Table rundown** (`amount_cents`) | N/A | N/A | `/100` in `rundown-summary-panel.tsx:64` | Correct |
| **Threshold notifications** | none | none | `/100` in `rating-slip-modal.tsx:297` | Correct |

### 4.3 Inconsistency: Where the Conversion Happens

The system uses **three different patterns** for the same operation:

**Pattern A — RPC-level conversion** (1 instance):
- `rpc_get_player_timeline`: `ROUND(pft.amount / 100.0, 2)` in SQL

**Pattern B — Service-layer conversion** (3 instances):
- `services/player360-dashboard/crud.ts:243-244`: `totalInCents / 100`
- `services/visit/crud.ts:518-520`: `s.total_buy_in / 100`
- `services/rating-slip/mappers.ts:337-339`: `data.session_total_buy_in / 100`

**Pattern C — Component-level conversion** (6+ instances):
- `components/mtl/entry-detail.tsx:65`: `amountCents / 100`
- `components/mtl/entry-list.tsx:67`: `amountCents / 100`
- `components/mtl/gaming-day-summary.tsx:69`: `/ 100`
- `components/mtl/mtl-entry-form.tsx:131`: `amountCents / 100`
- `components/modals/rating-slip/rating-slip-modal.tsx:297,341,540,554`: `/ 100`
- `components/table/rundown-summary-panel.tsx:64`: `cents / 100`

**Risk**: When a new consumer is added, developers must know which layer already
converts. No type-system enforcement prevents double-conversion or omission.

---

## 5. `formatCurrency` Function Fragmentation

There are **10+ independent `formatCurrency` implementations** across the codebase,
each with slightly different expectations about input units:

| File | Input Unit | Divides by 100? | Pattern |
|---|---|---|---|
| `components/table/rundown-summary-panel.tsx:61` | cents | Yes | `Intl.NumberFormat` |
| `components/mtl/entry-detail.tsx:62` | cents | Yes | `Intl.NumberFormat` |
| `components/mtl/entry-list.tsx:64` | cents | Yes | `Intl.NumberFormat` |
| `components/mtl/gaming-day-summary.tsx:66` | cents | Yes | `Intl.NumberFormat` |
| `components/mtl/mtl-entry-form.tsx:128` | cents | Yes | `Intl.NumberFormat` |
| `components/pit-panels/closed-sessions-panel.tsx:68` | dollars | No | `$${amount.toLocaleString()}` |
| `components/player-sessions/start-from-previous.tsx:111` | dollars | No | `Intl.NumberFormat` |
| `components/player-sessions/player-list-panel.tsx:81` | dollars | No | `Intl.NumberFormat` |
| `components/player-360/summary/summary-band.tsx:34` | dollars | No | `Intl.NumberFormat` |
| `components/player-360/left-rail/filter-tile-stack.tsx:32` | dollars | No | `Intl.NumberFormat` |
| `components/player-360/recent-events-strip.tsx:91` | dollars | No | `Intl.NumberFormat` |
| `hooks/table-context/use-buyin-telemetry.ts:166` | cents | Yes | `$${(cents / 100).toLocaleString()}` |
| `app/review/shift-dashboard-v2/lib/format.ts:4` | cents | Yes | `Intl.NumberFormat` |

No shared utility exists in `lib/`. This violates DRY and makes it easy
for new components to pick the wrong variant.

---

## 6. Documentation Gaps

### 6.1 Database Column Comments

No financial column carries a SQL `COMMENT` stating its unit:

```sql
-- Missing comments (should be added):
COMMENT ON COLUMN player_financial_transaction.amount IS 'Amount in cents (1 dollar = 100)';
COMMENT ON COLUMN mtl_entry.amount IS 'Amount in cents (1 dollar = 100)';
COMMENT ON COLUMN rating_slip.average_bet IS 'Average bet in dollars';
```

### 6.2 DTO Documentation

`FinancialTransactionDTO.amount` (`services/player-financial/dtos.ts:67`) is documented as:
> "Transaction amount (can be negative for adjustments)"

No mention of cents. Same issue for `VisitFinancialSummaryDTO.total_in` (line 111),
`CreateFinancialTxnInput.amount` (line 140), and `RecentSessionDTO.total_buy_in`
(`services/visit/dtos.ts:315`).

### 6.3 Review / Prototype Code Divergence

`app/review/mtl-form/mtl-entry-form.tsx:89` defines `THRESHOLD_AMOUNT = 3000` (dollars),
while production `components/mtl/mtl-entry-form.tsx:115` uses `MTL_THRESHOLD_AMOUNT = 300000`
(cents). The review code is not used in production but creates confusion if referenced
during development.

---

## 7. Fixes Applied (2026-01-29)

| # | File | Change | Bug Fixed |
|---|---|---|---|
| 1 | `services/player360-dashboard/crud.ts:237-244` | Added `/100` for `totalIn`, `totalOut` from `player_financial_transaction` | Player 360 summary tiles showing 100x values |
| 2 | `services/player360-dashboard/crud.ts:504-511` | ~~Added `/100`~~ then removed after fix #5 converted at RPC level | Recent events strip amounts |
| 3 | `services/visit/crud.ts:510-529` | Added `centsToDollars()` for `getPlayerRecentSessions` | Start-from-previous panel showing 100x values |
| 4 | `services/rating-slip/mappers.ts:335-339` | Added `/100` for `session_total_buy_in`, etc. in `toVisitLiveViewDTO` | Visit live view (preemptive — no frontend consumer yet) |
| 5 | `supabase/migrations/20260129205310_fix_timeline_rpc_cents_to_dollars.sql` | `ROUND(pft.amount / 100.0, 2)` for `cash_in`, `cash_out`, `mtl_recorded` events | Timeline summary text showing "$10000" instead of "$100" |

---

## 8. Residual Risk Assessment

### 8.1 Confirmed Safe (No Action Needed)

- **`average_bet` display paths**: All components display directly (dollars). Correct.
- **MTL component display**: All 4 MTL components divide by 100 locally. Correct.
- **Rating slip modal**: Converts at component level before display. Correct.
- **Table-context domain**: Uses `_cents` suffix, dedicated `formatCentsToDollars`. Correct.
- **Write paths**: All consistently multiply by 100 before DB write. Correct.

### 8.2 Low Risk (Monitor)

- **Visit live view** (`toVisitLiveViewDTO`): Fix #4 applied, but no frontend hook
  consumes this endpoint yet. When a hook is created, it will receive dollars. The
  conversion is correct but untested end-to-end.
- **`rpc_get_player_timeline` amount field**: Fix #5 now returns dollars. The
  `player-timeline/crud.ts:111` service passes `row.amount` through without conversion.
  Downstream consumers (`InteractionEventDTO.amount`) now receive dollars.
  UI components consuming this DTO should NOT divide by 100.

### 8.3 Medium Risk (Recommend Action)

| Risk | Description | Recommended Action |
|---|---|---|
| **No shared `formatCurrency` utility** | 10+ independent implementations with different input expectations | Create `lib/format/currency.ts` with `formatDollars()` and `formatCents()` |
| **No type-level unit enforcement** | `number` type carries no semantic unit; easy to pass cents where dollars expected | Consider branded types (`CentsAmount`, `DollarsAmount`) or at minimum JSDoc `@unit` tags |
| **Missing SQL column comments** | Financial columns undocumented at DB level | Add `COMMENT ON COLUMN` in a migration |
| **Missing DTO unit documentation** | `amount: number` says nothing about unit | Add `/** Amount in cents */` to all financial DTOs |
| **Inconsistent conversion layer** | Three patterns (RPC, service, component) for same operation | Standardize: service layer should be the single conversion boundary |

---

## 9. Recommended Standardization Plan

### Phase 1 — Documentation (Low effort, high impact)

1. **SQL migration**: Add `COMMENT ON COLUMN` for `player_financial_transaction.amount`,
   `mtl_entry.amount`, `rating_slip.average_bet`, `visit_financial_summary` columns.
2. **DTO JSDoc**: Add `/** Amount in cents */` or `/** Amount in dollars */` to every
   financial `amount` field across all DTO interfaces.
3. **Architecture doc**: Create `docs/20-architecture/ADR-FINANCIAL-AMOUNT-CONVENTION.md`
   formalizing the cents-storage, dollars-at-service-boundary pattern.

### Phase 2 — Shared Utility (Medium effort, prevents future bugs)

1. **Create `lib/format/currency.ts`** with two named functions:
   ```typescript
   /** Format a dollar amount for display. Input must be in dollars. */
   export function formatDollars(dollars: number): string { ... }

   /** Format a cent amount for display. Converts cents to dollars internally. */
   export function formatCents(cents: number): string { ... }
   ```
2. **Migrate component-level `formatCurrency` functions** to use the shared utility.
   This eliminates 10+ duplicated functions and makes the expected input unit explicit
   via function name.

### Phase 3 — Conversion Boundary Standardization (Higher effort)

1. **Adopt the rule**: "The service layer is the single conversion boundary.
   RPCs return raw DB values. Services convert to dollars. Components receive dollars."
2. **Revert `rpc_get_player_timeline` to return cents** and move conversion to
   `player-timeline/mappers.ts` and `player360-dashboard/crud.ts` for consistency
   with all other RPCs. *(Alternative: convert all RPCs to return dollars — either
   approach is valid if applied consistently.)*
3. **Update MTL components** to receive dollars from service layer rather than
   converting in each component independently.

### Phase 4 — Type Safety (Aspirational)

1. **Branded types** (`CentsAmount` / `DollarsAmount`) to make unit mismatches
   a compile-time error:
   ```typescript
   type CentsAmount = number & { readonly __brand: 'cents' };
   type DollarsAmount = number & { readonly __brand: 'dollars' };
   ```
   This is the strongest guard but requires the most refactoring.

---

## 10. Decision Required

The applied fixes (Section 7) resolve the user-reported bug. The residual risks
(Section 8.3) are latent — they will surface as new display bugs whenever a
developer adds a financial display path without knowing the convention.

**Minimum recommended**: Phase 1 (documentation) — prevents confusion with near-zero code risk.

**Recommended**: Phases 1 + 2 — eliminates the fragmented `formatCurrency` functions
and makes the convention self-documenting in code.

---

## Appendix: File Reference

### Storage & Schema
- `supabase/migrations/00000000000000_baseline_srm.sql` — Table definitions
- `supabase/migrations/20251213180125_add_visit_financial_summary_view.sql` — Financial view
- `supabase/migrations/20260129205310_fix_timeline_rpc_cents_to_dollars.sql` — Timeline fix

### Service Layer (Conversion Points)
- `services/player360-dashboard/crud.ts:237-244, 504-511`
- `services/visit/crud.ts:510-529`
- `services/rating-slip/mappers.ts:335-339`
- `services/player-timeline/crud.ts:111` (pass-through, no conversion)

### Hook Layer (Write Conversions)
- `hooks/rating-slip-modal/use-save-with-buyin.ts:121`
- `hooks/table-context/use-buyin-telemetry.ts:166`

### Component Layer (Display)
- `components/mtl/entry-detail.tsx:62-68`
- `components/mtl/entry-list.tsx:64-70`
- `components/mtl/gaming-day-summary.tsx:66-72`
- `components/mtl/mtl-entry-form.tsx:128-134`
- `components/modals/rating-slip/rating-slip-modal.tsx:297, 341, 394, 540, 554`
- `components/table/rundown-summary-panel.tsx:61-69`
- `components/pit-panels/closed-sessions-panel.tsx:68-71`
- `components/player-sessions/start-from-previous.tsx:111-118`
- `components/player-360/summary/summary-band.tsx:34-41`
- `components/player-360/left-rail/filter-tile-stack.tsx:32-39`
- `components/player-360/recent-events-strip.tsx:91-98`
