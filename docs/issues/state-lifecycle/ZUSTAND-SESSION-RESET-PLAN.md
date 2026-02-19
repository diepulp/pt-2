# Zustand Session State Lifecycle Contract — Implementation Plan

**Status:** Planned — implementation paused
**Date:** 2026-02-18
**Branch:** `has-vars-bypass`
**ADR:** `ADR-035` (formalized via expert panel review)
**Related:** `docs/issues/ISSUE-POST-SIGNIN-TABLES-NOT-RENDERED.md`

---

## Problem

After sign-out + re-sign-in, `router.push()` performs soft navigation — JS singletons persist. TanStack Query gets cleared (`queryClient.clear()`), but Zustand stores do not.

**Result:** stale `selectedTableId` blocks auto-select, stale filters persist, stale selections from a previous user/casino context leak into the new session. This is a recurring class of bug, not a one-off.

## Root Cause

No formal contract exists for clearing session-scoped client state on auth transitions. Each store was built independently with partial reset actions that serve in-session use cases but miss the full-reset-on-sign-out requirement. Additionally, `onAuthStateChange` SIGNED_OUT events (server-side session invalidation) clear query cache but not Zustand.

## Store Classification

| Store | Scope | Current Reset | Gap |
|-------|-------|---------------|-----|
| `pitDashboardStore` | **Session** | `clearSelection()` — skips activePanel, filters | Needs `resetSession()` |
| `playerDashboardStore` | **Session** | `clearSelection()` — complete | None |
| `shiftDashboardStore` | **Session** | `resetNavigation()` — skips timeWindow | Needs `resetSession()` |
| `ratingSlipModalStore` | **Session** | `resetForm()` — skips slipId, originalState | Needs `resetSession()` |
| `lockStore` | **Session** | `unlock()` — complete, persists to sessionStorage | None |
| `uiStore` | **App** | N/A (sidebar pref, transient modal) | Defensive `closeModal()` only |

## Planned Changes

### 1. Add `resetSession()` to three stores

Each store gets a **typed, exported** `INITIAL_STATE` constant + a `resetSession()` action that resets ALL fields to initial values. Existing partial resets stay unchanged for their in-session callers.

**Type-safe pattern** (prevents drift — if a field is added to the interface but missed in INITIAL_STATE, TypeScript emits a compile error):

```typescript
type PitDashboardData = Omit<PitDashboardStore, /* action keys */>;
export const PIT_INITIAL_STATE: PitDashboardData = { ... };
```

**`store/pit-dashboard-store.ts`**
- Extract `PIT_INITIAL_STATE` constant (all 7 data fields: selectedTableId, selectedSlipId, selectedPitLabel, activePanel, newSlipSeatNumber, activitySearchQuery, activitySortMode)
- Type with `Omit<PitDashboardStore, ...actions>` helper
- Add `resetSession: () => void` to interface
- Add `resetSession` action: `set(PIT_INITIAL_STATE, false, 'pit-dashboard/resetSession')`
- Spread `...PIT_INITIAL_STATE` in `create()` to prevent drift
- Add `@session-scoped` JSDoc tag
- `clearSelection()` stays partial (existing test asserts it doesn't touch `activePanel`)

**`store/shift-dashboard-store.ts`**
- Extract `SHIFT_INITIAL_STATE` constant (all 5 data fields: timeWindow, timeWindowPreset, lens, selectedPitId, selectedTableId)
- Type with `Omit<ShiftDashboardStore, ...actions>` helper
- Add `resetSession` action
- Add `@session-scoped` JSDoc tag
- `resetNavigation()` stays partial (preserves timeWindow by design)

**`store/rating-slip-modal-store.ts`**
- Add `resetSession` action: sets `slipId: null, formState: emptyFormState, originalState: emptyFormState`
- Uses existing `emptyFormState` constant (line 51)
- Add `@session-scoped` JSDoc tag

### 2. Create orchestrator function

**`store/reset-session-state.ts`** (NEW)
- Single `resetSessionState()` function
- Calls `.getState().resetSession()` on pit, shift, rating-slip stores
- Calls `.getState().clearSelection()` on player store
- Calls `.getState().unlock()` on lock store
- Calls `.getState().closeModal()` on uiStore (defensive — clears session-specific `modal.data`)
- Does NOT touch `uiStore.sidebarCollapsed`
- Plain function (not a hook) — synchronous, no React dependencies
- JSDoc documents session-scoped vs app-scoped classification

**`store/index.ts`**
- Add `export { resetSessionState } from './reset-session-state'`

### 3. Wire into sign-out (both paths)

**`hooks/auth/use-sign-out.ts`**
- Import `resetSessionState` from `@/store/reset-session-state`
- Add `resetSessionState()` after `queryClient.clear()` in **both** paths:
  - Normal sign-out (~line 105, inside Step 3 try/catch)
  - `performLocalCleanup` fallback (~line 63, after `queryClient.clear()`)
- Soft-fail semantics: inside same try/catch as `queryClient.clear()`

### 4. Wire into `onAuthStateChange`

**`hooks/auth/use-auth.ts`** (or equivalent auth listener)
- Import `resetSessionState` from `@/store/reset-session-state`
- Add `resetSessionState()` when `event === 'SIGNED_OUT'`
- Handles server-side session invalidation, token expiry, admin revocation

### 5. Defensive auto-select

**`components/pit-panels/pit-panels-client.tsx`**
- Replace auto-select effect (lines 198-208): validate `selectedTableId` exists in loaded `tables` array before trusting it
- Update `isLoading` (~line 475): add `|| (tables.length > 0 && !selectedTable)` to keep loading skeleton visible during the one-frame gap between data arrival and auto-select effect

### 6. Tests

**`store/__tests__/pit-dashboard-store.test.ts`** (Modify)
- Add `describe('resetSession')` — snapshot-compare ALL fields against exported `PIT_INITIAL_STATE`
- Existing `clearSelection` tests stay unchanged

**`store/__tests__/rating-slip-modal-store.test.ts`** (Modify)
- Add `describe('resetSession')` — verify slipId, formState, AND originalState all reset
- Dirty originalState via `initializeForm()` before calling resetSession

**`store/__tests__/shift-dashboard-store.test.ts`** (NEW)
- Test `resetSession` resets all state including timeWindow/preset (snapshot-compare against `SHIFT_INITIAL_STATE`)
- Test that `resetNavigation` preserves timeWindow (documents the distinction)

**`store/__tests__/reset-session-state.test.ts`** (NEW — contract test)
- Store-inventory completeness: assert all store hooks from `store/index.ts` are classified as session or app-scoped
- Dirty all session-scoped stores + app-scoped `uiStore`
- Call `resetSessionState()`
- Assert all session stores match their INITIAL_STATE constants (snapshot-compare)
- Assert `uiStore.sidebarCollapsed` is NOT touched (app-scoped preservation)
- Assert `lockStore.hasHydrated` remains `true` (middleware lifecycle, not session state)
- Idempotency: calling `resetSessionState()` twice produces same result

**`hooks/auth/__tests__/use-sign-out.test.ts`** (NEW — integration test)
- Mock `resetSessionState` and verify invocation in normal sign-out path
- Verify invocation in `performLocalCleanup` path
- Verify NOT called on hard-fail (sign-out error returns early)

### 7. Selector hooks (optional, low priority)

Expose `resetSession` in `hooks/ui/use-pit-dashboard-ui.ts`, `use-shift-dashboard-ui.ts`, `use-rating-slip-modal.ts` selectors for completeness. Not required for the orchestrator to work.

## Files Modified/Created

| File | Action |
|------|--------|
| `store/pit-dashboard-store.ts` | Modify: extract typed INITIAL_STATE, add resetSession, @session-scoped |
| `store/shift-dashboard-store.ts` | Modify: extract typed INITIAL_STATE, add resetSession, @session-scoped |
| `store/rating-slip-modal-store.ts` | Modify: add resetSession, @session-scoped |
| `store/reset-session-state.ts` | **Create**: orchestrator function |
| `store/index.ts` | Modify: add export |
| `hooks/auth/use-sign-out.ts` | Modify: call resetSessionState in both paths |
| `hooks/auth/use-auth.ts` | Modify: call resetSessionState on SIGNED_OUT |
| `components/pit-panels/pit-panels-client.tsx` | Modify: defensive auto-select + isLoading |
| `store/__tests__/pit-dashboard-store.test.ts` | Modify: add resetSession tests |
| `store/__tests__/rating-slip-modal-store.test.ts` | Modify: add resetSession tests |
| `store/__tests__/shift-dashboard-store.test.ts` | **Create**: resetSession + resetNavigation tests |
| `store/__tests__/reset-session-state.test.ts` | **Create**: contract test + store-inventory assertion |
| `hooks/auth/__tests__/use-sign-out.test.ts` | **Create**: integration test |

## Verification Checklist

- [ ] `npm run type-check` — no type errors from new interface members or typed INITIAL_STATE
- [ ] `npm run test -- store/__tests__/` — all store tests pass including new ones
- [ ] `npm run test -- store/__tests__/reset-session-state.test.ts` — contract test + inventory assertion passes
- [ ] `npm run test -- hooks/auth/__tests__/use-sign-out.test.ts` — integration test passes
- [ ] Manual: sign in → select a table → sign out → sign in → verify tables auto-select (no "Select a table" fallback)
- [ ] Manual: verify sidebar collapse preference survives sign-out/sign-in cycle (app-scoped)
- [ ] Manual: sign in → set shift time window to 24h → sign out → sign in → verify default 8h (session-scoped)
