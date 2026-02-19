# ADR-035: Client State Lifecycle Across Auth Transitions

**Status:** Accepted
**Date:** 2026-02-18
**Owner:** Platform / Frontend
**Decision type:** Architecture — Client State Contract
**Extends:** ADR-003 (Section 8 — Zustand Scope)
**Complements:** ADR-030 (client-side counterpart to server-side auth hardening)
**Triggered by:** ISSUE-POST-SIGNIN-TABLES-NOT-RENDERED
**Related:** ADR-003, ADR-030, ADR-032

---

## Context

### Soft Navigation Preserves Client State

Next.js App Router soft navigation (`router.push()`) preserves the root layout and keeps JavaScript singletons alive across route transitions. Zustand stores live in-memory as module-scoped singletons, so they persist unless explicitly reset.

During sign-out, the flow clears TanStack Query (`queryClient.clear()`) but does not clear Zustand session-scoped stores. Supabase's `onAuthStateChange` listener handles server-side session invalidation (token expiry, admin revocation) by updating the TanStack Query cache, but also does not reset Zustand stores — a second, independent path into "session ended" state.

### Observed Failure Mode

A production-impacting symptom illustrates the gap:

- After sign-in, redirect to `/pit` shows "Select a table to view layout" instead of rendering tables.
- A hard refresh fixes it (because it destroys JS state and reinitializes Zustand).

### Stale State Leak Across Auth Boundaries

Without a formal lifecycle contract, session-scoped client state leaks across auth boundaries:

- `selectedTableId` remains set from a prior session/casino/user context.
- Auto-select logic that expects "no selection" never runs.
- The UI falls into a fallback state because the selection is stale and cannot be resolved against newly-fetched data.
- In a multi-tenancy context, stale casino-scoped UUIDs (table IDs, pit IDs, player IDs) from User A's casino could persist into User B's session.

### Root Cause

1. **Soft navigation preserves in-memory state** — the root layout remains mounted across route transitions.
2. **TanStack Query is cleared** on sign-out, but **Zustand is not**.
3. **Store actions are partial** — built for in-session use and do not represent a hard reset at the session boundary.
4. **`onAuthStateChange` SIGNED_OUT** events clear query cache but not Zustand.

This is a class of recurring bugs, not a one-off defect. ADR-030 hardened the server-side auth pipeline; this ADR establishes the complementary client-side lifecycle contract.

---

## Decision

Adopt a formal **Session Reset Contract** for client state.

### D1: Classify Client State by Lifecycle Scope

All Zustand stores MUST be classified as either:

- **Session-scoped:** Must be cleared/reset whenever the auth session changes (sign-out, server-side session invalidation, and any future "actor/casino context switch").
- **App-scoped:** May persist across sessions (e.g., purely cosmetic UI preferences).

The classification is an architectural decision, not an implementation detail. Each store's scope MUST be documented and enforced.

### D2: Single Orchestrated Reset Path

A single `resetSessionState()` orchestrator function MUST reset all session-scoped stores **and browser storage containing session-scoped data** in one atomic call. This function MUST be:

- A plain synchronous function (not a React hook) — callable from hooks, event listeners, and non-component contexts.
- Invoked during sign-out after `queryClient.clear()` in both the normal and fallback cleanup paths.
- Invoked from the `onAuthStateChange` listener when `event === 'SIGNED_OUT'`.

The orchestrator additionally:
- Calls the UI store's `closeModal()` as a defensive measure to prevent session-specific modal data payloads from persisting, even though the UI store is app-scoped. Sidebar preference is NOT touched.
- Clears non-Zustand browser storage that holds session-scoped or casino-scoped data (see D6).

### D3: Defensive Selection Validation (All Surfaces)

Any "selected ID" sourced from client state MUST be validated against currently loaded server data before rendering dependent UI. Invalid selections MUST trigger auto-correction (auto-select), not empty or broken fallback states.

This rule applies to **every surface that consumes a `selectedId` from a Zustand store** — not just the pit dashboard. Current known sites: `selectedTableId` (pit), `selectedPlayerId` (player/CRM), `selectedPitId` / `selectedTableId` (shift), `slipId` (rating slip modal). Future stores that hold a selected entity ID inherit this obligation.

This provides defense-in-depth against stale selections from any source — not just auth transitions, but also external changes like table deletion, player deactivation, or casino reconfiguration.

### D4: Soft Navigation Correctness Is Mandatory

Hard reload (`window.location.href`) MUST NOT serve as the primary session-state reset mechanism. The lifecycle contract must be correct under Next.js soft navigation. Hard reload masks the gap and would re-break under future soft-navigation features (e.g., casino context switch without sign-out).

### D5: Store Registration Enforcement

New session-scoped stores MUST be registered with `resetSessionState()`. All store hooks MUST be exported from the store barrel module (`store/index.ts`). A contract test MUST:

- Import all store exports from the store barrel module.
- Verify the union of session-scoped + app-scoped stores equals the complete set.
- Fail if a new store hook is added without classification.

This prevents silent decay of the session reset contract as the codebase grows.

### D6: Browser Storage Cleanup

The `resetSessionState()` orchestrator MUST clear non-Zustand browser storage entries that contain session-scoped or casino-scoped data — specifically PII or casino-scoped entity references that persist across sign-out boundaries.

Known targets:
- `localStorage.removeItem('player-360-recent-players')` — contains player names (PII) and IDs scoped to the current casino. Cross-casino PII leak on shared workstations without cleanup.

This decision extends the reset contract beyond Zustand stores to any client-side persistence mechanism holding session-scoped data. Future localStorage/sessionStorage keys containing casino-scoped or PII data inherit this obligation.

---

## Security Invariants

**INV-035-1:** All session-scoped Zustand stores MUST expose a `resetSession()` action that returns all state fields to a declared, exported initial state constant. The initial state constant MUST be typed with a helper type that extracts data-only fields from the store interface, ensuring a compile error if a data field is added without updating the constant. The helper type MUST use a `Satisfies`-style constraint (not a plain cast) so that `as any` or `as unknown` on the constant is a lint error. CI MUST fail if `as any` or type assertions appear on any `INITIAL_STATE` declaration (`no-explicit-any` + `consistent-type-assertions` ESLint rules apply).

**INV-035-2:** `resetSessionState()` MUST be invoked during every auth-session-ending path:
  - Normal sign-out (after `queryClient.clear()`)
  - Fallback/local-cleanup sign-out
  - `onAuthStateChange` `SIGNED_OUT` event

**INV-035-3:** Any "selected ID" sourced from client state MUST be validated against currently loaded server data before rendering. Invalid selections MUST auto-correct. This applies to all surfaces that consume a `selectedId` from any Zustand store (pit, player/CRM, shift, rating slip modal, and any future stores), not only the triggering `/pit` case.

**INV-035-4:** New session-scoped stores MUST register with `resetSessionState()`. A contract test with a store-inventory completeness assertion MUST fail if a store hook is exported from the store barrel without being classified.

**INV-035-5:** Hard reload MUST NOT be the primary session-state reset mechanism. Soft navigation correctness is mandatory.

**INV-035-6:** `resetSessionState()` MUST clear non-Zustand browser storage entries that contain session-scoped PII or casino-scoped entity references. Specifically: `localStorage.removeItem('player-360-recent-players')`. Future storage keys holding casino-scoped data inherit this obligation.

---

## Store Classification

| Store / Storage | Scope | Reset Requirement |
|---|---|---|
| `pitDashboardStore` | **Session** | Full reset of all data fields |
| `playerDashboardStore` | **Session** | Full reset of all data fields |
| `shiftDashboardStore` | **Session** | Full reset of all data fields |
| `ratingSlipModalStore` | **Session** | Full reset of all data fields including form and original state |
| `lockStore` | **Session** | Unlock; `hasHydrated` excluded (reflects persist middleware lifecycle) |
| `uiStore` | **App** | Defensive `closeModal()` only; sidebar preference persists by design |
| `player-360-recent-players` (localStorage) | **Session** | `removeItem()` — contains player names (PII) and casino-scoped IDs |

---

## Consequences

### Positive

- Eliminates a whole class of "stale selection" and "stale filter" bugs across dashboards
- Ensures correctness under Next.js soft navigation without reliance on hard refresh behavior
- Provides a single place to reason about session boundary state resets
- Complements ADR-030's server-side auth hardening with client-side lifecycle correctness
- Handles all auth-ending paths (explicit sign-out, server-side invalidation, local cleanup)

### Negative

- Stores must maintain typed initial state constants and `resetSession()` without drift (mitigated by typed constants and contract tests)
- Requires contract tests to enforce registration and prevent regressions
- Incomplete classification of future stores remains a risk (mitigated by INV-035-4 store-inventory assertion)

### Neutral

- Existing partial reset actions (`clearSelection`, `resetNavigation`, `resetForm`) remain unchanged for in-session callers
- `uiStore` continues as app-scoped; sidebar preference persists across sessions by design
- `lockStore` sessionStorage persistence is unaffected (browser tab close already resets via sessionStorage scoping)
- `lockStore.hasHydrated` is NOT reset — it reflects persist middleware lifecycle, not session state

---

## Alternatives Considered

### Alt 1: Force Hard Reload on Sign-In or Sign-Out

Use `window.location.href` to destroy all client state indiscriminately.

**Rejected.** Hard reload destroys app-scoped preferences (sidebar collapse), imposes a full page load penalty, and masks the lifecycle gap rather than fixing it. Future soft-navigation features (e.g., casino context switch without sign-out) would re-expose the underlying bug.

### Alt 2: Rely Only on Defensive Validation in UI

Validate selections at render time without resetting stores.

**Rejected.** Defensive validation handles stale selections but cannot address other session-scoped state (stale filters, stale time windows, stale form data). Defense-in-depth requires both a clean reset (D2) AND defensive validation (D3).

### Alt 3: Persist Zustand to localStorage and Version-Bump on Auth Change

Persist all stores and invalidate via version key on session change.

**Rejected.** Adds persistence complexity, requires version management, and introduces a new class of bugs (version mismatch, migration). In-memory reset is simpler and more predictable. Persistence is only warranted for genuine cross-session preferences (sidebar collapse), which are already handled by the app-scoped classification.

### Alt 4: Event Bus or Zustand Middleware

Broadcast session-end events via an event bus or Zustand middleware.

**Rejected.** One producer (auth transition), 5-6 consumers (stores). A plain synchronous orchestrator function is simpler, more testable, and avoids the indirection of event propagation. Violates Over-Engineering Guardrail OE-AP-01 (premature generalization).

---

## Verification

### Definition of Done

- [ ] All session-scoped stores expose `resetSession()` that returns ALL fields to exported typed initial state constants
- [ ] Initial state constants typed via `DataOnly<T>` utility + `satisfies` (auto-excludes function fields, no manual `Omit` key lists)
- [ ] `resetSessionState()` orchestrator exists and calls all session store resets + browser storage cleanup (D6)
- [ ] `useLockStore` exported from `store/index.ts` barrel (prerequisite for INV-035-4)
- [ ] `resetSessionState()` called in normal sign-out path
- [ ] `resetSessionState()` called in fallback/local-cleanup sign-out path
- [ ] `resetSessionState()` called from `onAuthStateChange` SIGNED_OUT handler
- [ ] Defensive selection validation — Phase 1: `pit-panels-client.tsx` + `pit-dashboard-client.tsx` (both surfaces) + `shift-dashboard-page.tsx`
- [ ] Defensive selection validation — Phase 2 (follow-up): player dashboard panels (D2 reset sufficient for now)
- [ ] `isLoading` guard includes `(tables.length > 0 && !selectedTable)` on both pit surfaces
- [ ] `localStorage.removeItem('player-360-recent-players')` in orchestrator (INV-035-6)
- [ ] Contract test passes with store-inventory completeness assertion (all barrel hooks classified)
- [ ] `npm run type-check` clean

### Testing Strategy

- **Store unit tests:** Each session-scoped store's `resetSession()` restores ALL fields to the exported initial state (snapshot-compare). Existing partial resets remain partial (documenting the distinction).
- **Contract test:** Verifies store-inventory completeness (all exported store hooks are classified), all session stores return to initial state after `resetSessionState()`, app-scoped state (e.g., sidebar preference) is preserved, and idempotency (calling `resetSessionState()` twice produces the same result).
- **Sign-out integration test:** Verifies `resetSessionState()` is called after `queryClient.clear()` in both normal and fallback sign-out paths, and NOT called when sign-out errors before reaching cleanup.
- **E2E (follow-up):** Authenticate, select table, sign out, re-authenticate, verify fresh dashboard with auto-select.

### Manual Verification

- Sign in, select a table, sign out, sign in: `/pit` renders tables immediately (no fallback state)
- Sign in, collapse sidebar, sign out, sign in: sidebar remains collapsed (app-scoped)
- Sign in, set non-default filters on shift dashboard, sign out, sign in: shift dashboard shows defaults

---

## References

- [ADR-003: State Management Strategy](./ADR-003-state-management-strategy.md) — Section 8 Zustand scope definition
- [ADR-030: Auth System Hardening](./ADR-030-auth-system-hardening.md) — Server-side auth pipeline (complemented by this ADR)
- [ADR-032: Frontend Error Boundary Architecture](./ADR-032-frontend-error-boundary-architecture.md) — Render-layer resilience
- [ISSUE: Post-Sign-In Tables Not Rendered](../issues/ISSUE-POST-SIGNIN-TABLES-NOT-RENDERED.md) — Triggering defect diagnosis
- [EXEC-SPEC: Zustand Session Reset](../issues/state-lifecycle/EXEC-SPEC-ADR-035-SESSION-RESET.md) — Workstream execution spec
- [Blast Radius Report](../issues/state-lifecycle/ADR-035-BLAST-RADIUS-REPORT.md) — 5-expert pre-implementation assessment

---

## Changelog

- 2026-02-18: **Blast radius amendment.** 5-expert pre-implementation assessment (unanimous APPROVE WITH CONCERNS). Changes:
  - Added D6 (Browser Storage Cleanup) — `player-360-recent-players` localStorage PII leak (cross-casino player names). New INV-035-6.
  - Amended D2 scope to include non-Zustand browser storage.
  - Amended D5 to require all store hooks exported from barrel (`useLockStore` was missing).
  - Amended DoD: D3 phased (Phase 1: pit + shift; Phase 2: player panels). Added `isLoading` guard requirement for both pit surfaces. Added `DataOnly<T>` + `satisfies` typing pattern (replaces manual `Omit`).
  - Amended Store Classification table to include `player-360-recent-players` localStorage entry.
  - Implementation plan promoted to EXEC-SPEC with workstream numbering.
- 2026-02-18: Tightened INV-035-1 — INITIAL_STATE typing must resist `as any` bypass (CI-enforced via `no-explicit-any` + `consistent-type-assertions`). Broadened D3/INV-035-3 — defensive selection validation applies to all `selectedId` surfaces (pit, player/CRM, shift, rating slip), not only the triggering `/pit` case.
- 2026-02-18: ADR accepted. Formalized from draft based on ISSUE-POST-SIGNIN-TABLES-NOT-RENDERED diagnosis. Expert panel review (Lead Architect, Security/Auth, Frontend State, QA) — unanimous APPROVE WITH CHANGES. All required changes incorporated.
