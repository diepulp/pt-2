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

### A. Persist on Save (like buy-in) — Recommended

**Scope:** Medium
**Pattern:** Mirror the existing buy-in persistence flow within `use-save-with-buyin.ts`.

Buy-ins already follow a Save-to-persist model:
1. User enters a buy-in amount in the modal
2. User clicks **Save Changes**
3. `use-save-with-buyin.ts` calls `createFinancialTransaction()` with `direction: 'in'` (line 116-126)
4. After success, `initializeForm()` resets `newBuyIn: '0'` to prevent double-entry (line 300)

Chips taken should follow the identical pattern:
1. User enters a chips taken amount in the modal
2. User clicks **Save Changes**
3. `use-save-with-buyin.ts` calls `createPitCashObservation()` when `chipsTaken > 0`
4. After success, `initializeForm()` resets `chipsTaken: '0'` (already does this — line 303)

**Changes required:**

| File | Change |
|---|---|
| `hooks/rating-slip-modal/use-save-with-buyin.ts` | Add `chipsTaken: number` to `SaveWithBuyInInput`. Add Step 3b: call `createPitCashObservation()` after buy-in step when `chipsTaken > 0 && playerId`. |
| `components/pit-panels/pit-panels-client.tsx` | Pass `chipsTaken: Number(formState.chipsTaken \|\| 0)` in `handleSave` `mutateAsync()` call (line 283-293). |
| `components/dashboard/pit-dashboard-client.tsx` | Same — pass `chipsTaken` in `handleSave` call (line 310-319). |
| `supabase/migrations/` | New migration: update `visit_financial_summary` view to UNION `pit_cash_observation` amounts into `total_out`, so server-side totals reflect persisted chips taken. |

**Sequencing within `use-save-with-buyin.ts`:**
```
Step 1: Threshold check (existing)
Step 2: updateAverageBet (existing — critical path)
Step 3a: createFinancialTransaction for buy-in (existing — if newBuyIn > 0)
Step 3b: createPitCashObservation for chips taken (NEW — if chipsTaken > 0)
Step 4: MTL bridge (existing — handled by trigger)
```

Steps 3a and 3b are independent and could run in parallel (`Promise.all`), but sequential is safer to match the existing error-handling pattern where save fails if any sub-operation fails.

**Why this is the right fix:**
- Chips taken and buy-in are symmetric additive fields — both represent financial events entered during a session, both should persist on Save, both should reset to `'0'` after save to prevent double-entry
- The reset-to-zero logic at line 303 already exists and is correct — it just runs before persistence today
- The comment at line 294-296 already states: *"newBuyIn and chipsTaken create financial transactions — must be zeroed"* — confirming the **intent** was always to persist both on Save

### B. Accumulate in form state (defer to Close)

**Scope:** Small
**Trade-off:** User loses chips taken data if they navigate away without closing the session.

Stop resetting `chipsTaken` to `'0'` after Save. The value stays in the form and only persists when the user clicks **Close Session** (current design). This means chips taken is never recorded mid-session — if the browser refreshes or the user navigates away, the value is lost.

**Changes required:**
- Remove `chipsTaken: '0'` from the `initializeForm()` call in both `pit-panels-client.tsx:303` and `pit-dashboard-client.tsx` equivalent
- Keep the reactive UI computation as-is

**Risk:** This makes chips taken fundamentally different from buy-in. Buy-ins persist on Save and survive page refreshes. Chips taken would only survive in client memory until Close Session. A pit boss who saves multiple times during a long session could lose the chips taken value on any browser event.
