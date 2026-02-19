# ADR-035: Client State Lifecycle Across Auth Transitions (Session Reset Contract)

**Status:** Proposed
**Date:** 2026-02-18
**Owner:** Platform / Frontend
**Decision Type:** Architecture / Client State Contract
**Extends:** ADR-003 (Section 8 — Zustand Scope)
**Complements:** ADR-030 (client-side counterpart to server-side auth hardening)
**Triggered by:** ISSUE-POST-SIGNIN-TABLES-NOT-RENDERED
**Related:** ADR-003, ADR-030, ADR-032

---

## Context

The app uses Next.js soft navigation (`router.push()`), which preserves the root layout and **keeps JS singletons alive** across route transitions. Zustand stores live in-memory as module-scoped singletons, so they persist unless explicitly reset.

During sign-out (`hooks/auth/use-sign-out.ts`), the flow clears TanStack Query (`queryClient.clear()`), but **does not clear Zustand session-scoped stores**.

A diagnosed production-impacting symptom illustrates the failure mode:

- After sign-in, redirect to `/pit` shows **"Select a table to view layout"** instead of rendering tables.
- A hard refresh fixes it (because it destroys JS state and reinitializes Zustand).

Additionally, Supabase's `onAuthStateChange` listener in `use-auth.ts` handles server-side session invalidation (token expiry, admin revocation) by updating the TanStack Query cache, but does NOT reset Zustand stores — a second, independent path into "session ended" state.

---

## Problem

Without a formal lifecycle contract, **session-scoped client state leaks across auth boundaries**:

- `selectedTableId` remains set from a prior session/casino/user context.
- Auto-select logic that expects "no selection" never runs.
- The UI falls into a fallback state because the selection is stale and cannot be resolved against newly-fetched data.
- In a multi-tenancy context, stale `casino_id`-scoped UUIDs (table IDs, pit IDs, player IDs) from User A's casino could persist into User B's session.

This is a **class of recurring bugs**, not a one-off defect.

---

## Root Cause

1. **Soft navigation preserves in-memory state** (root layout remains mounted).
2. **TanStack Query is cleared** on sign-out, but **Zustand is not**.
3. **Store actions are partial** (built for in-session use) and do not represent "hard reset on session boundary."
4. **`onAuthStateChange` SIGNED_OUT** events clear query cache but not Zustand.

---

## Decision

Adopt a formal **Session Reset Contract** for client state:

### D1: Classify Client State by Lifecycle Scope

All Zustand stores MUST be classified as either:

- **Session-scoped:** Must be cleared/reset whenever the auth session changes (sign-out, server-side session invalidation, and any future "actor/casino context switch").
- **App-scoped:** May persist across sessions (e.g., purely cosmetic UI preferences).

### D2: Single Orchestrated Reset Path

Implement `resetSessionState()` that resets all session-scoped stores in one atomic call. This MUST be:

- A plain synchronous function (not a React hook) — callable from hooks, event listeners, and non-component contexts.
- Invoked during sign-out after `queryClient.clear()` in both the normal and `performLocalCleanup` fallback paths.
- Invoked from the `onAuthStateChange` listener when `event === 'SIGNED_OUT'`.

The orchestrator also calls `useUIStore.getState().closeModal()` as a defensive measure to prevent session-specific `modal.data` payloads (typed `unknown`) from persisting, even though `uiStore` is app-scoped. Sidebar preference is NOT touched.

### D3: Defensive Selection Validation

Any "selected ID" sourced from client state MUST be validated against currently loaded server data before rendering dependent UI. Invalid selections MUST trigger auto-correction (auto-select), not empty/broken fallback states.

This provides defense-in-depth against stale selections from any source — not just auth transitions, but also external changes like table deletion or casino reconfiguration.

### D4: Soft Navigation Correctness Is Mandatory

Hard reload (`window.location.href`) MUST NOT serve as the primary session-state reset mechanism. The lifecycle contract must be correct under Next.js soft navigation. Hard reload masks the gap and would re-break under future soft-navigation features (e.g., casino context switch without sign-out).

### D5: Store Registration Enforcement

New session-scoped stores MUST be registered with `resetSessionState()`. A contract test MUST:

- Import all store exports from `store/index.ts`
- Verify the union of session-scoped + app-scoped stores equals the complete set
- Fail if a new store hook is added without classification

This prevents silent decay of the session reset contract as the codebase grows.

---

## Security Invariants

**INV-035-1:** All session-scoped Zustand stores MUST expose a `resetSession()` action that returns all state fields to a declared, exported `INITIAL_STATE` constant. `INITIAL_STATE` MUST be typed with a helper type that extracts data-only fields from the store interface, ensuring a compile error if a data field is added without updating `INITIAL_STATE`.

**INV-035-2:** `resetSessionState()` MUST be invoked during every auth-session-ending path:
  - Normal sign-out (after `queryClient.clear()`)
  - `performLocalCleanup` fallback sign-out
  - `onAuthStateChange` `SIGNED_OUT` event

**INV-035-3:** Any "selected ID" sourced from client state MUST be validated against currently loaded server data before rendering. Invalid selections MUST auto-correct.

**INV-035-4:** New session-scoped stores MUST register with `resetSessionState()`. A contract test with a store-inventory completeness assertion MUST fail if a store hook is exported from `store/index.ts` without being classified.

**INV-035-5:** Hard reload MUST NOT be the primary session-state reset mechanism. Soft navigation correctness is mandatory.

---

## Scope of Stores

### Store classification (current)

| Store | Scope | Current Reset | Gap |
|---|---|---|---|
| `pitDashboardStore` | **Session** | `clearSelection()` — skips activePanel, filters | Needs `resetSession()` |
| `playerDashboardStore` | **Session** | `clearSelection()` — complete | None |
| `shiftDashboardStore` | **Session** | `resetNavigation()` — skips timeWindow | Needs `resetSession()` |
| `ratingSlipModalStore` | **Session** | `resetForm()` — skips slipId, originalState | Needs `resetSession()` |
| `lockStore` | **Session** | `unlock()` — complete; sessionStorage | None |
| `uiStore` | **App** | N/A (sidebar pref, transient modal) | Defensive `closeModal()` only |

---

## Implementation Requirements

### 1) Add `resetSession()` to session-scoped stores with partial resets

Each store extracts a typed `INITIAL_STATE` constant and adds `resetSession()`:

- **`store/pit-dashboard-store.ts`**
  - Extract typed `PIT_INITIAL_STATE` (all 7 data fields)
  - Add `resetSession(): void` that calls `set(PIT_INITIAL_STATE)`
  - Keep `clearSelection()` partial (existing test asserts it doesn't touch `activePanel`)

- **`store/shift-dashboard-store.ts`**
  - Extract typed `SHIFT_INITIAL_STATE` (all 5 data fields)
  - Add `resetSession()`
  - Keep `resetNavigation()` partial (preserves timeWindow by design)

- **`store/rating-slip-modal-store.ts`**
  - Add `resetSession()` that clears `slipId` and restores both `formState` and `originalState` to `emptyFormState`

### 2) Create orchestrator

- New: `store/reset-session-state.ts`
  - `resetSessionState()` calls each session store's complete reset
  - Additionally calls `useUIStore.getState().closeModal()` defensively
  - Plain synchronous function — no React dependencies
  - JSDoc documents session-scoped vs app-scoped classification

### 3) Wire into sign-out (both paths)

- `hooks/auth/use-sign-out.ts`
  - Call `resetSessionState()` after `queryClient.clear()` in both normal and `performLocalCleanup` paths
  - Soft-fail semantics: inside same try/catch as `queryClient.clear()`

### 4) Wire into `onAuthStateChange`

- `hooks/auth/use-auth.ts` (or equivalent auth listener)
  - Call `resetSessionState()` when `event === 'SIGNED_OUT'`
  - Handles server-side session invalidation, token expiry, admin revocation

### 5) Defensive auto-select

- `components/pit-panels/pit-panels-client.tsx`
  - Validate `selectedTableId` exists in the loaded `tables` array before trusting it
  - If invalid (or missing), select a default
  - Adjust loading gating to prevent one-frame fallback flash

---

## Consequences

### Positive

- Eliminates a whole class of "stale selection" and "stale filter" bugs across dashboards
- Ensures correctness under Next.js soft navigation (no reliance on hard refresh behavior)
- Provides a single place to reason about session boundary state resets
- Complements ADR-030's server-side auth hardening with client-side lifecycle correctness
- Handles all auth-ending paths (explicit sign-out, server-side invalidation, local cleanup)

### Negative

- Stores must maintain `INITIAL_STATE` constants and `resetSession()` without drift (mitigated by typed constants and contract tests)
- Requires contract tests to enforce registration and prevent regressions
- Incomplete classification of future stores remains a risk (mitigated by INV-035-4 store-inventory assertion)

### Neutral

- Existing partial reset actions (`clearSelection`, `resetNavigation`, `resetForm`) remain unchanged for in-session callers
- `uiStore` continues as app-scoped; sidebar preference persists across sessions by design
- `lockStore` sessionStorage persistence is unaffected (browser tab close already resets via sessionStorage scoping)
- `lockStore.hasHydrated` is NOT reset — it reflects persist middleware lifecycle, not session state

---

## Alternatives Considered

### 1. Force hard reload on sign-in or sign-out (`window.location.href`)

**Rejected.** Hard reload destroys all client state indiscriminately (including app-scoped preferences like sidebar collapse), imposes a full page load penalty, and masks the lifecycle gap rather than fixing it. Future soft-navigation features (e.g., casino context switch without sign-out) would re-expose the underlying bug.

### 2. Rely only on defensive validation in UI

**Rejected.** Defensive validation handles stale selections but cannot address other session-scoped state (stale filters, stale time windows, stale form data). Defense-in-depth requires both a clean reset (D2) AND defensive validation (D3).

### 3. Persist Zustand to localStorage and version-bump on auth change

**Rejected.** Adds persistence complexity, requires version management, and introduces a new class of bugs (version mismatch, migration). In-memory reset is simpler and more predictable. Persistence is only warranted for genuine cross-session preferences (sidebar collapse), which are already handled by `uiStore`'s app-scoped classification.

### 4. Event bus or Zustand middleware

**Rejected.** One producer (auth transition), 5-6 consumers (stores). A plain synchronous orchestrator function is simpler, more testable, and avoids the indirection of event propagation. Violates Over-Engineering Guardrail OE-AP-01 (premature generalization).

---

## Verification

### Definition of Done

- [ ] All session-scoped stores expose `resetSession()` that returns ALL fields to exported `INITIAL_STATE`
- [ ] `INITIAL_STATE` constants are typed with helper types that prevent field omission
- [ ] `resetSessionState()` orchestrator exists and calls all session store resets
- [ ] `resetSessionState()` called in normal sign-out path
- [ ] `resetSessionState()` called in `performLocalCleanup` fallback path
- [ ] `resetSessionState()` called from `onAuthStateChange` SIGNED_OUT handler
- [ ] Defensive auto-select validates `selectedTableId` against loaded data
- [ ] All store unit tests pass (new + existing)
- [ ] Contract test passes with store-inventory completeness assertion
- [ ] `use-sign-out.ts` integration test verifies orchestrator invocation in both paths
- [ ] `npm run type-check` clean

### Automated Tests

- **Store unit tests** (`store/__tests__/{pit,shift,rating-slip}-dashboard-store.test.ts`):
  - `resetSession()` restores ALL fields to exported `INITIAL_STATE` (snapshot-compare, not field-by-field)
  - Partial resets remain partial (documents the distinction vs `resetSession`)

- **Contract test** (`store/__tests__/reset-session-state.test.ts`):
  1. Store-inventory completeness: all store hooks from `store/index.ts` are classified
  2. Dirty all session-scoped stores with non-default values (including `ratingSlipModalStore.originalState` via `initializeForm`)
  3. Call `resetSessionState()`
  4. Assert all session stores match their `INITIAL_STATE` constants
  5. Assert `uiStore.sidebarCollapsed` is unchanged (app-scoped preservation)
  6. Assert `lockStore.hasHydrated` remains `true` (middleware lifecycle, not session state)
  7. Idempotency: calling `resetSessionState()` twice produces same result

- **Sign-out integration test** (`hooks/auth/__tests__/use-sign-out.test.ts`):
  - `resetSessionState()` called after `queryClient.clear()` in normal sign-out
  - `resetSessionState()` called in `performLocalCleanup` path
  - `resetSessionState()` NOT called on hard-fail (sign-out error returns early)

### Manual

- Sign in → select a table → sign out → sign in → `/pit` renders tables immediately (no fallback)
- Sign in → collapse sidebar → sign out → sign in → sidebar remains collapsed (app-scoped)
- Sign in → navigate to shift dashboard → set time window to 24h → sign out → sign in → shift dashboard shows default 8h

### E2E (follow-up PR)

- `e2e/workflows/session-reset.spec.ts`: authenticate → select table → sign out → re-authenticate → verify fresh dashboard with auto-select

---

## Implementation Notes

### Type-Safe INITIAL_STATE Pattern

```typescript
// Extract data-only fields (omit actions) for compile-time enforcement
type PitDashboardData = Omit<PitDashboardStore,
  | 'setSelectedTable' | 'setSelectedSlip' | 'setSelectedPitLabel'
  | 'setActivePanel' | 'setNewSlipSeatNumber' | 'clearSelection'
  | 'setActivitySearchQuery' | 'setActivitySortMode' | 'resetSession'
>;

export const PIT_INITIAL_STATE: PitDashboardData = {
  selectedTableId: null,
  selectedSlipId: null,
  selectedPitLabel: null,
  activePanel: 'tables',
  newSlipSeatNumber: undefined,
  activitySearchQuery: '',
  activitySortMode: 'recent',
};

// In create():
...PIT_INITIAL_STATE,
resetSession: () => set(PIT_INITIAL_STATE, false, 'pit-dashboard/resetSession'),
```

If a developer adds a field to `PitDashboardStore` and forgets `PIT_INITIAL_STATE`, TypeScript emits an error.

### Conventions

- **DevTools action names:** `resetSession` actions follow `'{store-name}/resetSession'` convention
- **JSDoc tag:** Session-scoped stores include `@session-scoped` tag referencing `store/reset-session-state.ts`

---

## References

- [ADR-003: State Management Strategy](../../80-adrs/ADR-003-state-management-strategy.md) — Section 8 Zustand scope definition
- [ADR-030: Auth System Hardening](../../80-adrs/ADR-030-auth-system-hardening.md) — Server-side auth pipeline (complemented by this ADR)
- [ADR-032: Frontend Error Boundary Architecture](../../80-adrs/ADR-032-frontend-error-boundary-architecture.md) — Render-layer resilience
- [ISSUE: Post-Sign-In Tables Not Rendered](../ISSUE-POST-SIGNIN-TABLES-NOT-RENDERED.md)
- [Zustand Session Reset Plan](./ZUSTAND-SESSION-RESET-PLAN.md)

---

## Changelog

- 2026-02-18: Initial ADR proposed based on ISSUE-POST-SIGNIN-TABLES-NOT-RENDERED diagnosis. Expert panel review (Lead Architect, Security/Auth, Frontend State, QA) — unanimous APPROVE WITH CHANGES. All required changes incorporated.
