# GAP-CASHIN-ADJUSTMENT-MTL-SYNC

## Cash-In Adjustment Bi-Directional Sync Failure

**Status**: Open
**Created**: 2026-02-17
**Updated**: 2026-02-17 (audit feedback incorporated)
**Category**: Data Sync Bug (MTL compliance dashboard / Rating Slip)
**Severity**: Critical — MTL dashboard totals can be wrong vs the finance ledger, which is a compliance/reporting integrity breach.

---

## Data Contract

**Write SSoT**: `player_financial_transaction` only. No direct writes to `mtl_entry` for financial types (enforced by `mtl_financial_types_must_be_derived` CHECK constraint).

**Derivations**:
- `visit_financial_summary` — SQL view aggregating from `player_financial_transaction`
- `mtl_entry` — derived from `player_financial_transaction` via forward bridge trigger (`trg_derive_mtl_from_finance`)
- `table_buyin_telemetry` — derived via `bridge_rated_buyin_to_telemetry` trigger

**MTL Product Intent**: `mtl_entry` is a **ledger of all movements** (not a compliance-only subset). The forward bridge trigger creates entries for ALL pit cash/chips transactions regardless of amount. Threshold checking (`$3,000 watchlist`, `$10,000 CTR`) is for **UI notification/badge purposes only**, not for gating entry creation.

**UI Freshness Rule**: Both UIs must invalidate the same MTL key scopes after any successful finance write. Cache invalidation must be **unconditional** since the DB trigger is unconditional.

---

## Field Taxonomy

| Field | Domain | Purpose | Values |
|-------|--------|---------|--------|
| `tender_type` | Finance | Payment instrument | `'cash'`, `'chips'`, `'adjustment'` |
| `txn_kind` | Finance | Semantic kind (original vs correction) | `'original'`, `'adjustment'`, `'reversal'` |
| `mtl_txn_type` | MTL | Compliance classification | `'buy_in'`, `'cash_out'`, `'marker'`, `'front_money'`, `'chip_fill'` |
| `direction` | Both | Money flow direction | `'in'`, `'out'` |

**Trigger gating rule**: The MTL bridge trigger gates on **two orthogonal predicates**:
- Original transactions: `tender_type IN ('cash', 'chips')` — instrument-based gate
- Corrections: `txn_kind IN ('adjustment', 'reversal')` — semantic-kind gate

These are OR'd in the WHEN clause, not mixed.

---

## Reversal Semantics

**Representation**: Option A — new `player_financial_transaction` row with `txn_kind = 'reversal'`, `related_transaction_id` referencing the original. This is already defined in the `financial_txn_kind` enum and enforced by existing constraints.

**Trigger behavior for reversals**:
- Insert an `mtl_entry` whose net effect is the inverse of the original (either by sign or by direction, consistent with existing DB constraints)
- Maps to `mtl_txn_type = 'buy_in'` (for `direction = 'in'`) or `'cash_out'` (for `direction = 'out'`)
- Idempotency key: `'fin:{reversal_txn_id}'` (same pattern as originals)

**Note**: Reversals are not yet implemented in the UI (no RPC exists). The trigger extension covers them proactively so no future migration is needed when they ship.

---

## Problem Statement

Cash-in adjustments made in the rating slip do not reflect in the MTL compliance dashboard, and vice versa. Both entry points write to the finance SSoT; both UIs must converge via derived views + cache invalidation.

**Investigation**: 4 parallel agents deployed (2 frontend, 1 RLS, 1 backend). 3 of 4 produced detailed findings that converge on the same root causes. RLS was ruled out as a factor.

---

## Root Cause Analysis: 4 Compounding Gaps

### GAP-1: Database Trigger Excludes Adjustment Transactions (PRIMARY)

**File**: `supabase/migrations/20260116111329_finance_to_mtl_derivation.sql:183-191`

The forward bridge trigger `trg_derive_mtl_from_finance` only fires for `tender_type IN ('cash', 'chips')`. Financial adjustments use `tender_type = 'adjustment'` + `txn_kind = 'adjustment'`, so **no `mtl_entry` row is ever created** for adjustments. The `mtl_gaming_day_summary` view (which aggregates from `mtl_entry`) shows stale totals.

Note: The telemetry bridge trigger WAS fixed for adjustments in migration `20260219002247_enable_adjustment_telemetry.sql` (replaces deleted `20260202123300`), but the MTL bridge was **overlooked in the same fix**.

| Scenario | `visit_financial_summary` (Rating Slip reads) | `mtl_entry` (MTL reads) | `table_buyin_telemetry` (Shift Dashboard) |
|----------|-----------------------------------------------|------------------------|------------------------------------------|
| Buy-in $500 | $500 | $500 | $500 |
| Adjust -$100 | **$400 (correct)** | **$500 (STALE)** | **$400 (correct)** |

### GAP-2: Missing MTL Cache Invalidation in `useCreateFinancialAdjustment`

**File**: `hooks/player-financial/use-financial-mutations.ts:120-168`

The `onSuccess` handler invalidates `playerFinancialKeys`, `ratingSlipModalKeys`, and `shiftDashboardKeys`, but has **zero `mtlKeys.*` invalidations**. Even if GAP-1 is fixed at the DB level, the MTL dashboard won't refresh until staleTime expires.

### GAP-3: Conditional MTL Invalidation in `useSaveWithBuyIn`

**File**: `hooks/rating-slip-modal/use-save-with-buyin.ts:213-224`

MTL cache invalidation is gated on `thresholdResult?.shouldCreateMtl && playerId`, but the forward bridge trigger ALWAYS creates MTL entries for `cash`/`chips` transactions regardless of threshold. Small buy-ins leave MTL data stale. Also, `mtlKeys.entries.scope` is **never** invalidated here.

### GAP-4: Dual Key Factory Mismatch (Silent Cross-Context Failure)

**Files**:
- `hooks/player-financial/keys.ts:50-51` — key segment `'visit-summary'` (singular)
- `services/player-financial/keys.ts:55-56` — key segment `'visit-summaries'` (plural)

MTL mutations (`hooks/mtl/use-mtl-mutations.ts:93`) import from `services/` and invalidate `['player-financial', 'visit-summaries', visit_id]`. But financial transaction queries import from `hooks/` and use `['player-financial', 'visit-summary', visitId]`. **Cross-context invalidation from MTL -> rating slip silently fails.**

---

## What's NOT the Issue

- **RLS policies**: Both systems can read the same data; entries simply don't exist in `mtl_entry`
- **Data model**: Normalized single source of truth (`player_financial_transaction`). Rating slip reads from `visit_financial_summary` view, MTL reads from `mtl_entry` table
- **`mtl_derived_only_constraint`**: Enforces `buy_in`/`cash_out` MTL entries must come through the trigger (`idempotency_key LIKE 'fin:%'`), so frontend can't INSERT directly

---

## Implementation Plan

### Fix 1: Database Migration — Extend MTL Bridge Trigger for Adjustments
**Priority**: Critical (data correctness)

Create migration: `YYYYMMDDHHMMSS_mtl_bridge_adjustment_support.sql`

1. **Widen trigger WHEN clause** (two orthogonal predicates, OR'd):
   ```sql
   WHEN (
     NEW.source = 'pit'
     AND NEW.direction IS NOT NULL
     AND (
       NEW.tender_type IN ('cash', 'chips')           -- originals: instrument gate
       OR NEW.txn_kind IN ('adjustment', 'reversal')  -- corrections: semantic gate
     )
   )
   ```

2. **Extend `fn_derive_mtl_from_finance()` function body**:
   - For `txn_kind IN ('adjustment', 'reversal')`: map to `mtl_txn_type = 'buy_in'` (direction='in') or `'cash_out'` (direction='out'), with signed amount preserved
   - Same G1-G5 guardrails, same `'fin:{id}'` idempotency pattern
   - Adjustments carry negative amounts (already enforced by `chk_negative_amount_requires_adjustment_kind`)

3. **Backfill/repair**: One-time idempotent SQL to derive missing `mtl_entry` rows for any historical adjustment transactions that were inserted before this fix

4. Run `npm run db:types-local` after migration

### Fix 2: Frontend — Add MTL Key Invalidation to `useCreateFinancialAdjustment`
**Priority**: Critical (UI sync)

**File**: `hooks/player-financial/use-financial-mutations.ts`

Add `mtlKeys.entries.scope`, `mtlKeys.gamingDaySummary.scope`, and `mtlKeys.patronDailyTotal` invalidations to `onSuccess` handler.

### Fix 3: Frontend — Make MTL Invalidation Unconditional in `useSaveWithBuyIn`
**Priority**: High (correctness)

**File**: `hooks/rating-slip-modal/use-save-with-buyin.ts`

Remove threshold gate. Invalidate whenever `newBuyIn > 0 && playerId`, and add `mtlKeys.entries.scope` invalidation.

### Fix 4: Frontend — Consolidate Dual Key Factory
**Priority**: High (silent bug)

Keep `hooks/player-financial/keys.ts` as canonical (more consumers). Convert `services/player-financial/keys.ts` to a **thin re-export** from the hooks version. Update consumers:
- `hooks/mtl/use-mtl-mutations.ts` — change import to `@/hooks/player-financial/keys`, update call signature from `visitSummary({ visit_id })` to `visitSummary(visit_id)`
- `hooks/cashier/use-patron-transactions.ts` — change import to `@/hooks/player-financial/keys`, update `transactions.scope` to `list.scope`

---

## Mutation -> Invalidation Matrix

| Mutation | playerFinancial | ratingSlipModal | shiftDashboard | mtlKeys |
|----------|----------------|-----------------|----------------|---------|
| `useCreateFinancialTransaction` | list.scope, visitSummary, visitSummaryScope, forPlayer, forVisit | — | — | — (original buy-ins flow through useSaveWithBuyIn which handles MTL invalidation. **Guardrail**: if this hook is ever used directly for pit cash/chips without useSaveWithBuyIn, it must also invalidate mtlKeys.*) |
| `useCreateFinancialAdjustment` | list.scope, visitSummary, visitSummaryScope, forPlayer, forVisit | scope | summary.scope, allMetrics | **entries.scope, gamingDaySummary.scope, patronDailyTotal** |
| `useSaveWithBuyIn` | visitSummary | data(slipId) | — (via dashboardKeys) | **gamingDaySummary.scope, entries.scope, patronDailyTotal** (unconditional) |
| `useCreateMtlEntry` | visitSummary, transactions.scope | data(slipId) | — | entries.scope, gamingDaySummary.scope |

---

## Freshness Guarantee Note

After mutation success, invalidate + refetch in deterministic order for the visible screen. Cross-tab/multi-screen use can produce brief inconsistency bounded by React Query's `staleTime` (not addressed in this fix — would require real-time subscriptions).

---

## Critical Files

| File | Role |
|------|------|
| `supabase/migrations/20260116111329_finance_to_mtl_derivation.sql` | Existing trigger logic (reference) |
| `supabase/migrations/20260219002247_enable_adjustment_telemetry.sql` | Telemetry fix pattern (reference; replaces deleted 20260202123300) |
| NEW migration | Extend MTL bridge trigger + backfill |
| `hooks/player-financial/use-financial-mutations.ts` | Add MTL key invalidation (Fix 2) |
| `hooks/rating-slip-modal/use-save-with-buyin.ts` | Unconditional MTL invalidation (Fix 3) |
| `hooks/mtl/use-mtl-mutations.ts` | Fix import source for key factory (Fix 4) |
| `hooks/cashier/use-patron-transactions.ts` | Fix import source for key factory (Fix 4) |
| `hooks/player-financial/keys.ts` | Canonical key factory (keep) |
| `services/player-financial/keys.ts` | Convert to thin re-export (Fix 4) |
| `services/mtl/keys.ts` | MTL key definitions (reference) |

---

## Verification Plan

1. **Type check**: `npm run type-check` — no import/key type errors after consolidation
2. **Unit tests**: `npm run test` — existing tests pass
3. **Manual E2E flow**:
   - Create a visit with $500 buy-in -> verify MTL shows $500
   - Adjust cash-in by -$100 from rating slip -> verify MTL updates to $400
   - Adjust cash-in by +$50 from rating slip -> verify MTL updates to $450
   - Positive and negative adjustments from both entry points
   - Two adjustments in a row (aggregation + idempotency)
   - Cross-tab: rating slip + MTL open simultaneously; mutate in one, verify the other refreshes
   - Verify shift dashboard telemetry matches throughout
4. **Backfill validation**: historical visits with adjustments become consistent after repair
5. **Trigger verification**: Insert adjustment txn row -> assert `mtl_entry` row exists with `idempotency_key = 'fin:{id}'` (catches "WHEN clause widened but function still exits early" bugs)
6. **Automated invariant**: `SUM(finance direction='in' amount) == SUM(mtl_entry direction='in' amount)` per visit
6. **Build**: `npm run build` — clean production build
