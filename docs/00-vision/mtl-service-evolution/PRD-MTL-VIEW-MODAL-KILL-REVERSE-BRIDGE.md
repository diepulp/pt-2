---
title: "PRD: MTL View Modal & Kill Reverse Bridge"
doc_type: "prd"
project: "PT-2 Casino Player Tracker"
status: "ready"
version: "v1.0"
date: "2026-01-20"
owner: "Compliance/Finance Integration"
priority: "P0"
estimated_complexity: "Medium"
---

# PRD: MTL View Modal & Kill Reverse Bridge

## Problem Statement

The bidirectional MTL-Finance bridge introduced architectural complexity and a regression path:

1. **Reverse bridge fails silently** when `visit_id` is NULL (Compliance Dashboard doesn't pass it)
2. **Dual write paths** create drift risk between MTL and Finance ledgers
3. **Rating slip totals become stale** when buy-ins are created from Compliance Dashboard

The reverse bridge was built to sync MTL entries back to `player_financial_transaction`, but this creates a competing ledger that violates the "finance is canonical" principle.

## Decision

**Kill the reverse bridge entirely. Make MTL strictly derived for financial types.**

- `player_financial_transaction` remains the **single source of truth** for rating slip totals
- MTL entries for `buy_in`, `cash_out`, and other financial types are **derived only** (via forward bridge)
- Compliance Dashboard displays MTL entries in a **read-only view modal** with Print + Adjust actions
- Corrections happen via **financial adjustments** (existing `AdjustmentModal`)

## Scope

### In Scope

| # | Workstream | Description |
|--:|------------|-------------|
| WS1 | Drop reverse bridge | Remove `trg_derive_finance_from_mtl` trigger and `fn_derive_finance_from_mtl()` function |
| WS2 | Remove G0 guard | Clean up dead code from forward bridge (`fn_derive_mtl_from_finance`) |
| WS3 | Add DB constraint | Enforce `buy_in`/`cash_out` MTL entries must be derived (`idempotency_key LIKE 'fin:%'`) |
| WS4 | Create MtlEntryViewModal | Read-only modal preserving MtlEntryForm UI, no create/edit functionality |
| WS5 | Wire Compliance Dashboard | Replace MtlEntryForm with MtlEntryViewModal, add Adjust button |
| WS6 | Print support | Add `@media print` CSS and Print button to modal |

### Out of Scope

- Bidirectional editing (deferred post-MVP)
- MTL amendments/audit notes (future enhancement)
- Non-financial MTL types (compliance-only entries unaffected)

## Technical Design

### WS1: Drop Reverse Bridge (Migration)

```sql
-- Drop the reverse bridge trigger and function
DROP TRIGGER IF EXISTS trg_derive_finance_from_mtl ON public.mtl_entry;
DROP FUNCTION IF EXISTS fn_derive_finance_from_mtl();
```

### WS2: Remove G0 Guard (Migration)

The G0 guard in `fn_derive_mtl_from_finance()` checks for `mtl:` prefix to prevent circular triggering. With reverse bridge removed, this is dead code.

```sql
-- Remove lines 43-47 from fn_derive_mtl_from_finance:
-- IF NEW.idempotency_key IS NOT NULL AND NEW.idempotency_key LIKE 'mtl:%' THEN
--   RETURN NEW;
-- END IF;
```

### WS3: DB Constraint for Derived-Only Financial Types

```sql
ALTER TABLE public.mtl_entry
ADD CONSTRAINT mtl_financial_types_must_be_derived
CHECK (
  txn_type NOT IN ('buy_in', 'cash_out')
  OR (idempotency_key IS NOT NULL AND idempotency_key LIKE 'fin:%')
);
```

This prevents any UI or API regression from creating a competing ledger.

### WS4: MtlEntryViewModal Component

Create `components/mtl/mtl-entry-view-modal.tsx`:

**Preserve from MtlEntryForm:**
- Patron info section
- Running totals display with threshold indicators
- Transaction log table with running totals
- Gaming day display
- All visual styling and animations

**Remove:**
- `TransactionEntryForm` component (create functionality)
- `PhysicalCharacteristicsSection` inputs (or make read-only)
- `useCreateMtlEntry` mutation
- `useOptimistic` state (use server data only)
- Form submission logic

**Add:**
- Print button (calls `window.print()`)
- Adjust button (opens existing `AdjustmentModal`)
- Modal wrapper (Dialog from shadcn/ui)

### WS5: Compliance Dashboard Integration

Update `components/mtl/compliance-dashboard.tsx`:

```tsx
// Before: Opens editable MtlEntryForm
<MtlEntryForm patron={selectedPatron} ... />

// After: Opens read-only MtlEntryViewModal
<MtlEntryViewModal
  patron={selectedPatron}
  casinoId={casinoId}
  gamingDay={gamingDay}
  onAdjust={(entry) => setAdjustmentTarget(entry)}
  onClose={() => setSelectedPatron(null)}
/>
```

### WS6: Print Support

Add print-specific CSS:

```css
@media print {
  /* Hide non-essential UI */
  .no-print { display: none !important; }

  /* Ensure table renders properly */
  table { page-break-inside: avoid; }

  /* Clean header for printed form */
  .print-header { display: block; }
}
```

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `supabase/migrations/YYYYMMDD_kill_reverse_bridge.sql` | Create | WS1 + WS2 + WS3 |
| `components/mtl/mtl-entry-view-modal.tsx` | Create | WS4 - new view-only component |
| `components/mtl/compliance-dashboard.tsx` | Edit | WS5 - use view modal |
| `components/mtl/mtl-entry-form.tsx` | Keep | Preserve for future use (rating slip context) |
| `hooks/mtl/use-mtl-mutations.ts` | Edit | Remove/deprecate `useCreateMtlEntry` for financial types |

## Acceptance Criteria

- [ ] Reverse bridge trigger (`trg_derive_finance_from_mtl`) is removed
- [ ] G0 guard removed from forward bridge (dead code cleanup)
- [ ] DB constraint blocks manual `buy_in`/`cash_out` MTL inserts
- [ ] `MtlEntryViewModal` displays entries in read-only mode
- [ ] Compliance Dashboard opens view modal (not editable form)
- [ ] Print button generates clean printed output
- [ ] Adjust button opens `AdjustmentModal` for corrections
- [ ] Rating slip totals remain correct (derived from PFT only)
- [ ] Existing forward bridge continues to work

## Testing

### Migration Verification

```sql
-- Verify trigger is dropped
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_derive_finance_from_mtl';
-- Expected: 0 rows

-- Verify constraint exists
SELECT conname FROM pg_constraint WHERE conname = 'mtl_financial_types_must_be_derived';
-- Expected: 1 row

-- Verify constraint blocks manual insert
INSERT INTO mtl_entry (patron_uuid, casino_id, txn_type, amount, direction, ...)
VALUES (..., 'buy_in', 10000, 'in', ...);
-- Expected: ERROR (constraint violation)
```

### UI Verification

1. Open Compliance Dashboard
2. Select patron with existing MTL entries
3. Verify modal opens in read-only mode (no input fields)
4. Verify Print button generates clean output
5. Verify Adjust button opens AdjustmentModal
6. Create buy-in from Rating Slip Modal
7. Verify new entry appears in Compliance Dashboard (forward bridge works)

## Rollback Plan

If issues arise:
1. Migrations are additive (drop trigger, add constraint) - reversible
2. `MtlEntryForm` is preserved - can revert dashboard to use it
3. Forward bridge is unchanged - no risk to existing functionality

## Dependencies

- Existing `AdjustmentModal` component
- Existing `createFinancialAdjustment()` RPC
- Forward bridge (`fn_derive_mtl_from_finance`) must remain functional

## Notes

This PRD supersedes:
- `MVP-MTL-Readonly-Printable-Form-Kill-Reverse-Bridge.md` (decision doc)
- `MTL-Reverse-Bridge-Remediation.md` (diagnosis doc)

The reverse bridge files have been deleted (never committed):
- `20260119192728_reverse_mtl_to_finance_bridge.sql`
- `20260119192729_forward_bridge_reverse_guard.sql`
