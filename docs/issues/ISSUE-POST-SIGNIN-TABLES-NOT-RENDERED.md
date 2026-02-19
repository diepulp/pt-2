# ISSUE: Post-Sign-In Tables Not Rendered

**Date:** 2026-02-18
**Status:** Diagnosed (unfixed)
**Severity:** High
**Branch:** `has-vars-bypass`

## Symptom

After sign-in, the app redirects to `/pit` and displays "Select a table to view layout" instead of rendering the gaming tables. A hard browser refresh (F5/Ctrl+R) correctly displays the tables.

## Investigation Method

Three domain expert agents deployed in parallel:

| Agent | Domain | Key Finding |
|-------|--------|-------------|
| Auth Flow | Cookie race, middleware pipeline | `proxy.ts` IS active (corrected initial finding that `middleware.ts` was deleted) |
| React Query / State | TanStack Query cache, Zustand persistence | One-frame render gap between query resolution and auto-select effect |
| RSC Navigation | Soft nav, route groups, RSC caching | **Primary root cause**: stale Zustand state survives soft navigation across sign-out/sign-in cycles |

---

## Root Cause Analysis

### PRIMARY: Stale Zustand State Across Sign-Out/Sign-In Cycles

During sign-out (`hooks/auth/use-sign-out.ts:72-111`):

1. `signOutAction()` runs (server telemetry)
2. `supabase.auth.signOut()` clears auth session
3. `queryClient.clear()` clears TanStack Query cache
4. `router.push('/signin')` navigates away

**Step 3 clears query cache. Nothing clears Zustand stores.** The `clearSelection()` method exists on `usePitDashboardStore` but is never called during sign-out (confirmed via grep -- zero invocations outside tests and unused destructured references).

When the user signs back in, `router.push('/start')` triggers a **soft navigation** (root layout stays mounted, all JS singletons survive). The Zustand store retains a stale `selectedTableId` from the previous session.

The auto-select guard at `pit-panels-client.tsx:199`:

```typescript
if (!selectedTableId && tables.length > 0) { ... }
```

**Fails** because `selectedTableId` is NOT null (it holds the stale UUID). The `selectedTable` lookup at line 212:

```typescript
tables.find((t) => t.id === selectedTableId)
```

Returns `undefined` because the stale ID doesn't match any table in the freshly-fetched array. `TablesPanel` at `tables-panel.tsx:130-137` then renders the "Select a table to view layout" fallback.

**Why hard refresh fixes it**: Full page load destroys all JS state. Zustand reinitializes with `selectedTableId: null`. Auto-select fires correctly.

### CONTRIBUTING: One-Frame Render Gap (React Query / State)

Even when auto-select works correctly, there is a guaranteed one-frame flash where `selectedTableId` is `null` while tables have loaded but the `useEffect` hasn't fired yet. The `isLoading` calculation at `pit-panels-client.tsx:472`:

```typescript
isLoading: tablesLoading || statsLoading
```

Does NOT account for the auto-select pending state (`tables.length > 0 && !selectedTableId`).

### CONTRIBUTING: `router.push()` Preserves SPA State (Auth Flow / RSC Navigation)

Using `router.push('/start')` at `login-form.tsx:44` keeps the navigation as a soft SPA transition. While the proxy (`proxy.ts`) handles session refresh correctly, `router.push()` preserves in-memory Zustand state that should have been cleared. Using `window.location.href` would force a full page load (incidentally resetting all state), but this masks the real bug rather than fixing it.

### Correction: Proxy IS Active

Agent 1 (Auth Flow) initially reported `middleware.ts` was deleted and `lib/supabase/middleware.ts` was dead code. This was **incorrect**. The project migrated to Next.js 16's `proxy.ts` convention:

```typescript
// proxy.ts (root)
import { updateSession } from '@/lib/supabase/middleware';
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}
```

The session refresh pipeline is functional.

---

## Affected Files

| File | Line(s) | Role |
|------|---------|------|
| `hooks/auth/use-sign-out.ts` | 72-111 | Sign-out flow missing Zustand cleanup |
| `components/pit-panels/pit-panels-client.tsx` | 198-208, 211-214, 472 | Auto-select guard, selectedTable lookup, isLoading calc |
| `components/pit-panels/tables-panel.tsx` | 130-137 | Renders "Select a table to view layout" fallback |
| `store/pit-dashboard-store.ts` | 35, 77-86 | `clearSelection()` exists but never called on sign-out |
| `components/login-form.tsx` | 44 | `router.push('/start')` preserves SPA state |
| `proxy.ts` | 1-21 | Session refresh pipeline (functional) |

---

## Recommended Fixes

### Fix 1: Clear Zustand on sign-out (root cause)

**File:** `hooks/auth/use-sign-out.ts`

After `queryClient.clear()` (step 3), before redirect (step 4):

```typescript
usePitDashboardStore.getState().clearSelection();
```

### Fix 2: Defensive auto-select (resilience)

**File:** `components/pit-panels/pit-panels-client.tsx:198-208`

Replace the auto-select effect with one that validates the current selection:

```typescript
React.useEffect(() => {
  if (tables.length > 0) {
    const currentValid = selectedTableId && tables.some(t => t.id === selectedTableId);
    if (!currentValid) {
      const firstActive = tables.find((t) => t.status === 'active');
      setSelectedTable(firstActive?.id ?? tables[0].id);
    }
  }
}, [tables, selectedTableId, setSelectedTable]);
```

This also handles orphaned selections outside the sign-out path (e.g., table deleted by another admin).

### Fix 3: Include auto-select pending in isLoading (flash prevention)

**File:** `components/pit-panels/pit-panels-client.tsx:472`

```typescript
// Before:
isLoading: tablesLoading || statsLoading,

// After:
isLoading: tablesLoading || statsLoading || (tables.length > 0 && !selectedTableId),
```

### Fix 4 (Optional): Add streaming fallback

Create `app/(dashboard)/pit/loading.tsx` for visual feedback during soft navigation transitions.

---

## Expert Agreement Matrix

| Finding | Agent 1 (Auth) | Agent 2 (Query) | Agent 3 (RSC) |
|---|---|---|---|
| Proxy/middleware is functional | Missed (said deleted) | N/A | Confirmed |
| Zustand state survives soft nav | N/A | Confirmed (no persist) | **Primary cause** |
| `clearSelection()` never called on sign-out | N/A | N/A | **Confirmed** |
| Auto-select has render gap | N/A | **Identified** | Corroborated |
| `router.push()` preserves state | Flagged cookie race | N/A | **Identified as key enabler** |

---

## Reproduction Path

1. User is signed in, viewing tables (Zustand has `selectedTableId = <some-uuid>`)
2. User signs out (Zustand NOT cleared, only query cache cleared)
3. User signs back in
4. `router.push('/start')` -> soft navigation -> `/pit`
5. Zustand still has stale `selectedTableId`
6. Tables load, stale ID doesn't match any table
7. `selectedTable` = `undefined` -> "Select a table to view layout"
8. Hard refresh destroys all JS state -> Zustand reinitializes -> auto-select works
