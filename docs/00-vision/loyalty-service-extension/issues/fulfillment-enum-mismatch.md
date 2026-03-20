---
title: "Fulfillment Enum Mismatch — DB CHECK vs App Values"
severity: P0
status: open
date: 2026-03-19
affects: Reward creation fails when any fulfillment type is selected
references:
  - supabase/migrations/20260206005751_adr033_reward_catalog_schema.sql:38
  - services/loyalty/reward/schemas.ts:59
  - services/loyalty/reward/dtos.ts:31
  - components/admin/loyalty/rewards/create-reward-dialog.tsx:211-214
---

# Fulfillment Enum Mismatch — DB CHECK vs App Values

## Symptom

Creating a reward with any fulfillment type selected (Comp Slip, Coupon, or No Fulfillment) fails silently. The toast shows "Failed to create reward." Leaving fulfillment unselected (NULL) succeeds.

## Root Cause

The database CHECK constraint and the application use different enum values:

| Layer | Allowed Values |
|---|---|
| **DB CHECK constraint** (migration line 38) | `'immediate'`, `'voucher'`, `'external'` |
| **Zod schema** (schemas.ts:59) | `'comp_slip'`, `'coupon'`, `'none'` |
| **TypeScript type** (dtos.ts:31) | `'comp_slip'`, `'coupon'`, `'none'` |
| **UI dropdown** (create-reward-dialog.tsx:211-214) | `'comp_slip'`, `'coupon'`, `'none'` |

When the app sends `'comp_slip'`, Postgres rejects it with error code `23514` (CHECK constraint violation). The error mapper in `crud.ts` has no handler for `23514`, so it falls through to generic `INTERNAL_ERROR`.

## Error Path

```
UI: selects "Comp Slip" → value = 'comp_slip'
  → Zod validates: PASS (schema allows 'comp_slip')
  → supabase.from('reward_catalog').insert({ fulfillment: 'comp_slip' })
  → Postgres: CHECK (fulfillment IN ('immediate', 'voucher', 'external')) → FAIL
  → PostgREST: error code 23514
  → mapRewardError(): no case for 23514 → INTERNAL_ERROR
  → UI: "Failed to create reward" (no actionable feedback)
```

## Fix Options

### Option A: Migrate DB constraint to match app values (recommended)

```sql
ALTER TABLE reward_catalog DROP CONSTRAINT reward_catalog_fulfillment_check;
ALTER TABLE reward_catalog ADD CONSTRAINT reward_catalog_fulfillment_check
  CHECK (fulfillment IN ('comp_slip', 'coupon', 'none'));
```

The app values (`comp_slip`, `coupon`, `none`) are more descriptive of the actual fulfillment semantics than the original DB values (`immediate`, `voucher`, `external`).

### Option B: Align app to match DB values

Change `FulfillmentType`, Zod schema, and UI labels to use `'immediate'`, `'voucher'`, `'external'`. Less descriptive but requires no migration.

## Secondary Fix

Add `23514` (CHECK constraint violation) to `mapRewardError()` in `services/loyalty/reward/crud.ts` so constraint failures return actionable errors instead of generic `INTERNAL_ERROR`.

## Recommendation

**Option A** — the app values are better names. Single migration + secondary error mapping fix.
