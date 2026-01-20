# Bidirectional MTL-Financial Transaction Bridge

## Problem Statement

Currently, the data flow is **unidirectional**:
- Rating slip buy-in → `player_financial_transaction` → `mtl_entry` (via trigger)

When MTL entries are created manually via the Compliance Dashboard, the reverse flow doesn't exist:
- MTL entry form → `mtl_entry` → ❌ NO `player_financial_transaction` created

This causes the rating slip's `session_total_buy_in` (which queries `player_financial_transaction`) to NOT reflect manually-added MTL entries.

## Current Architecture

```
┌─────────────────────┐     ┌──────────────────────────────┐     ┌─────────────────┐
│    Rating Slip      │────▶│  player_financial_transaction │────▶│   mtl_entry     │
│   (Buy-in Modal)    │     │        (stores CENTS)         │     │ (stores DOLLARS)│
└─────────────────────┘     └──────────────────────────────┘     └─────────────────┘
         │                              │                                  │
         │                     TRIGGER: fn_derive_mtl_from_finance         │
         │                     (converts cents→dollars, /100)              │
         │                     idempotency_key: 'fin:{finance_id}'         │
         │                                                                 │
         └─────────────────────────────────────────────────────────────────┘
                                    ❌ NO REVERSE BRIDGE
```

## Proposed Solution

Create a **bidirectional bridge** with circularity prevention via idempotency key prefixes:

```
┌─────────────────────┐     ┌──────────────────────────────┐     ┌─────────────────┐
│    Rating Slip      │◀───▶│  player_financial_transaction │◀───▶│   mtl_entry     │
└─────────────────────┘     └──────────────────────────────┘     └─────────────────┘
                                       │                                  │
                            ┌──────────┴──────────┐          ┌───────────┴───────────┐
                            │ EXISTING:           │          │ NEW:                   │
                            │ fn_derive_mtl       │          │ fn_derive_finance      │
                            │ (cents→dollars /100)│          │ (dollars→cents *100)   │
                            │ key: 'fin:{id}'     │          │ key: 'mtl:{id}'        │
                            └─────────────────────┘          └─────────────────────────┘
```

### Circularity Prevention

- **Forward bridge**: Creates MTL with `idempotency_key = 'fin:{financial_txn_id}'`
- **Reverse bridge**: Creates financial txn with `idempotency_key = 'mtl:{mtl_entry_id}'`
- Each trigger checks the prefix and **skips** if the record originated from the other side

---

## Implementation Plan

### WS1: Database Migration - Reverse Bridge Trigger

**File**: `supabase/migrations/YYYYMMDDHHMMSS_reverse_mtl_to_finance_bridge.sql`

Create `fn_derive_finance_from_mtl()` trigger function:

1. **Guard G0: Skip bridged entries**
   - IF `NEW.idempotency_key LIKE 'fin:%'` THEN RETURN (already from financial side)

2. **Guard G1: Visit required**
   - IF `NEW.visit_id IS NULL` THEN RETURN (manual compliance-only entries, no financial impact)

3. **Guard G2-G5: ADR-015 security guardrails**
   - Context validation (fail-closed)
   - Tenant invariant check
   - Actor invariant check
   - No spoofable parameters

4. **Currency conversion**
   - `v_amount_cents := ROUND(NEW.amount * 100)::bigint`

5. **Insert financial transaction**
   ```sql
   INSERT INTO player_financial_transaction (
     casino_id, player_id, visit_id, rating_slip_id,
     amount, direction, source, tender_type,
     created_by_staff_id, gaming_day, idempotency_key
   ) VALUES (
     v_casino_id, NEW.patron_uuid, NEW.visit_id, NEW.rating_slip_id,
     v_amount_cents, NEW.direction, 'pit',
     CASE WHEN NEW.txn_type = 'buy_in' THEN 'cash' ELSE 'chips' END,
     v_actor_id, NEW.gaming_day, 'mtl:' || NEW.id::text
   ) ON CONFLICT (casino_id, idempotency_key) DO NOTHING;
   ```

6. **Create trigger**
   ```sql
   CREATE TRIGGER trg_derive_finance_from_mtl
     AFTER INSERT ON mtl_entry
     FOR EACH ROW
     WHEN (NEW.visit_id IS NOT NULL AND NEW.patron_uuid IS NOT NULL)
     EXECUTE FUNCTION fn_derive_finance_from_mtl();
   ```

### WS2: Update MTL Entry Form Mutation

**File**: `hooks/mtl/use-mtl-mutations.ts`

After successful MTL entry creation:
1. Invalidate `visitLiveView` query key to refresh `session_total_buy_in`
2. Invalidate `playerFinancial` queries to refresh transaction list

```typescript
onSuccess: (data, variables) => {
  // Existing invalidations
  queryClient.invalidateQueries({ queryKey: mtlKeys.entries(variables.casino_id) });

  // NEW: Invalidate visit live view to refresh total_buy_in
  if (variables.visit_id) {
    queryClient.invalidateQueries({
      queryKey: visitKeys.liveView(variables.visit_id)
    });
  }
}
```

### WS3: Update Forward Bridge Guard

**File**: Update existing `fn_derive_mtl_from_finance()` if needed

Add guard to skip if idempotency_key starts with `mtl:`:
```sql
-- Skip if this finance record came from MTL (reverse bridge)
IF NEW.idempotency_key LIKE 'mtl:%' THEN
  RETURN NEW;
END IF;
```

---

## Edge Cases & Constraints

| Scenario | Behavior |
|----------|----------|
| MTL entry without `visit_id` | No financial txn created (compliance-only) |
| MTL entry without `patron_uuid` | Trigger skipped (WHEN clause) |
| Duplicate MTL entry | Idempotent via ON CONFLICT DO NOTHING |
| Financial txn from MTL bridge | Forward trigger skips (prefix check) |

## Files Changed

1. **NEW**: `supabase/migrations/YYYYMMDDHHMMSS_reverse_mtl_to_finance_bridge.sql`
2. **EDIT**: `hooks/mtl/use-mtl-mutations.ts` - Add query invalidations
3. **EDIT**: `supabase/migrations/20260119162505_fix_mtl_bridge_cents_to_dollars.sql` - Add reverse guard (or new patch migration)

## Testing Strategy

1. **Integration test**: Create MTL entry via form, verify financial transaction created
2. **Integration test**: Create financial transaction via rating slip, verify MTL entry created (existing)
3. **E2E test**: Create MTL entry, verify rating slip modal shows updated total
4. **Circularity test**: Verify no infinite loops - each bridge creates exactly one record

## Rollback Plan

If issues arise:
1. Drop trigger: `DROP TRIGGER IF EXISTS trg_derive_finance_from_mtl ON mtl_entry;`
2. Drop function: `DROP FUNCTION IF EXISTS fn_derive_finance_from_mtl();`
3. Revert mutation hook changes
