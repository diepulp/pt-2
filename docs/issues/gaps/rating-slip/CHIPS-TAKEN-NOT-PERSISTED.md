# BUG: Chips Taken value not persisted on Save Changes

**Status:** Open
**Severity:** Medium — data loss on common workflow
**Discovered:** 2026-02-17
**Component:** Rating Slip Modal

---

## Symptom

User enters a "Chips Taken" value in the rating slip modal. The financial summary total updates reactively in the UI, but clicking **Save Changes** silently discards the value and resets it to `0`. The total snaps back.

## Root Cause

`chipsTaken` is only persisted through the **Close Session** flow. The **Save Changes** flow ignores it entirely.

### Save Changes path (broken)

1. `SaveWithBuyInInput` interface has no `chipsTaken` field
   - `hooks/rating-slip-modal/use-save-with-buyin.ts:34-57`
2. `handleSave` callers do not pass `chipsTaken`
   - `components/pit-panels/pit-panels-client.tsx:283`
   - `components/dashboard/pit-dashboard-client.tsx:310`
3. After save, `initializeForm()` resets `chipsTaken: '0'`
   - `components/pit-panels/pit-panels-client.tsx:297-304`
   - `components/dashboard/pit-dashboard-client.tsx:322-330`

### Close Session path (works)

1. `handleCloseSession` passes `chipsTaken` to `closeWithFinancial.mutateAsync()`
   - `components/pit-panels/pit-panels-client.tsx:327-335`
   - `components/dashboard/pit-dashboard-client.tsx:344-380`
2. `use-close-with-financial.ts:100-121` calls `createPitCashObservation()` when `chipsTaken > 0`
3. `services/rating-slip/http.ts:249-310` invokes `rpc_create_pit_cash_observation`
4. Row inserted into `pit_cash_observation` table

### Secondary issue: `visit_financial_summary` view gap

The `visit_financial_summary` view (`20251213180125_add_visit_financial_summary_view.sql:13-27`) only aggregates `player_financial_transaction` rows. It does **not** include `pit_cash_observation` records. Even if chips taken were persisted mid-session, the server-side `totalChipsOut` would not reflect them.

## Reactive UI behavior (misleading)

The modal computes a client-side preview at `rating-slip-modal.tsx:546-553`:

```ts
const pendingChipsTaken = Number(formState.chipsTaken) || 0;
const computedChipsOut = modalData
  ? (modalData.financial.totalChipsOut + pendingChipsTaken * 100) / 100
  : 0;
const computedNetPosition = totalCashIn - computedChipsOut;
```

This gives the user visual feedback that chips taken is working, but the value is never sent to the server on Save.

## Key files

| File | Role |
|---|---|
| `components/modals/rating-slip/rating-slip-modal.tsx` | Modal container, reactive total computation |
| `components/modals/rating-slip/form-section-chips-taken.tsx` | Chips taken input UI |
| `store/rating-slip-modal-store.ts` | Zustand store with `chipsTaken` field |
| `hooks/rating-slip-modal/use-save-with-buyin.ts` | Save path — missing `chipsTaken` |
| `hooks/rating-slip-modal/use-close-with-financial.ts` | Close path — persists `chipsTaken` |
| `components/pit-panels/pit-panels-client.tsx` | `handleSave` / `handleCloseSession` callers |
| `components/dashboard/pit-dashboard-client.tsx` | Same callers (dashboard variant) |
| `services/rating-slip/http.ts` | `createPitCashObservation` RPC wrapper |
| `supabase/migrations/20251213180125_add_visit_financial_summary_view.sql` | View missing `pit_cash_observation` |

## Fix options

| Approach | Scope | Description |
|---|---|---|
| **A. Persist on Save** | Medium | Call `createPitCashObservation` from `use-save-with-buyin.ts` when `chipsTaken > 0`. Update `visit_financial_summary` to include `pit_cash_observation` amounts. |
| **B. Accumulate in form state** | Small | Stop resetting `chipsTaken` to `'0'` after save. Persist only on Close Session (current design intent, fix the premature reset). |
| **C. Persist immediately** | Larger | Persist each chips-taken entry on input (like buy-ins), updating the financial summary view. |
