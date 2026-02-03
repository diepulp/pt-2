# ADR-032: Frontend Error Boundary Architecture

**Status:** Proposed
**Date:** 2026-02-02
**Owner:** Platform/Frontend
**Applies to:** All route segments under `app/`, all multi-panel layouts
**Decision type:** Architecture
**Extends:** ADR-012 (Error Handling Layers)
**Triggered by:** PERF-006 P0-1 (3/3 audit consensus — zero error boundaries in Player 360)

---

## Context

ADR-012 established a clean layered error architecture:

| Layer | Pattern | Catches |
|-------|---------|---------|
| Service Layer | `throw DomainError` | Business rule violations, DB errors |
| Transport Layer | `ServiceResult<T>` | All service exceptions → structured envelope |
| Client Layer | `onError` callbacks | Expected API failures (400, 409, 404) |

**The gap:** ADR-012 addresses errors that flow through the request/response pipeline. It says nothing about errors that occur **during React rendering** — outside the `ServiceResult<T>` envelope:

| Error Type | Example | Current Behavior |
|------------|---------|-----------------|
| Null dereference in render | `player.name` when `player` is `undefined` | White screen |
| Malformed data in JSX | Array method on non-array query result | White screen |
| Browser API failure | `navigator.clipboard.writeText` throws `NotAllowedError` | Unhandled rejection |
| Zustand selector crash | Store shape changes, selector throws | White screen |
| Component lifecycle error | `useEffect` cleanup throws | White screen |

PERF-006 confirmed: the Player 360 route (`/players/[[...playerId]]`) has **zero** error boundaries. A single `<Suspense>` boundary at `page.tsx:40` catches loading states only. Any uncaught exception from the 9+ hooks, malformed API response, or null dereference crashes the entire page with no recovery UI.

**Impact:** 100% page failure on any panel error. No graceful degradation. No correlation ID for support escalation. Users see a white screen or the root error page.

---

## Decision

### D1: Three-Tier Error Boundary Hierarchy

Adopt a three-tier error boundary architecture that provides progressively finer-grained isolation:

```
┌─────── Tier 1: error.tsx (route segment) ─────────────────────────┐
│                                                                    │
│  Last-resort catch-all. Full-page recovery UI with retry.          │
│  Next.js convention: automatic React Error Boundary wrapper.       │
│                                                                    │
│  ┌──── Tier 2: PanelErrorBoundary (layout panels) ─────────────┐  │
│  │                                                               │  │
│  │  Per-panel isolation. One panel crash does not affect others.  │  │
│  │  Inline error state with panel-specific retry.                │  │
│  │                                                               │  │
│  │  ┌──── Tier 3: QueryErrorResetBoundary (data subtrees) ──┐   │  │
│  │  │                                                        │   │  │
│  │  │  TanStack Query integration. Resets failed queries     │   │  │
│  │  │  and retries data fetching without full remount.       │   │  │
│  │  │                                                        │   │  │
│  │  └────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

| Tier | Mechanism | Scope | Recovery |
|------|-----------|-------|----------|
| 1 | Next.js `error.tsx` | Entire route segment | `reset()` re-renders segment; "Go back" navigates away |
| 2 | `PanelErrorBoundary` | Individual layout panel | Reset panel state + `queryClient.invalidateQueries()` |
| 3 | `QueryErrorResetBoundary` | Query-dependent subtree | `reset()` retries failed queries |

### D2: Shared ErrorState Component

A single `ErrorState` component provides the fallback UI across all tiers. It wires into the existing error utility infrastructure from ADR-012 and `ERROR_HANDLING_STANDARD.md`:

```typescript
// components/error-boundary/error-state.tsx

interface ErrorStateProps {
  error: Error;
  reset?: () => void;
  variant: 'full-page' | 'panel' | 'inline';
  panelName?: string;
}
```

**Wiring to existing utilities:**

| Utility | Used For |
|---------|----------|
| `getErrorMessage(error)` | User-friendly message display |
| `isRetryableError(error)` | Show/hide retry button |
| `getErrorCode(error)` | Display error code for support escalation |
| `logError(error, context)` | Structured dev logging on mount |
| `isAuthError(error)` | Redirect to login if session expired |

**Variant behavior:**

| Variant | Layout | Retry | Navigation |
|---------|--------|-------|------------|
| `full-page` | Centered card, icon | Yes (if retryable) | "Go back" button |
| `panel` | Compact inline, fits panel dimensions | Yes (if retryable) | None (other panels remain usable) |
| `inline` | Minimal text + retry link | Yes (if retryable) | None |

### D3: PanelErrorBoundary Component

A reusable React class component (error boundaries require `componentDidCatch`):

```typescript
// components/error-boundary/panel-error-boundary.tsx

interface PanelErrorBoundaryProps {
  children: React.ReactNode;
  panelName: string;       // For logging context
  className?: string;      // Panel-specific styling
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}
```

**Behavior:**
1. Catches render errors from children
2. Calls `logError(error, { component: `PanelErrorBoundary:${panelName}`, action: 'render-error' })`
3. Renders `<ErrorState variant="panel" />` with reset capability
4. Reset clears internal state and invalidates panel-related queries

### D4: Integration with ADR-012 Error Flow

Updated error flow diagram extending ADR-012 §3:

```
┌───────────────────────────────────────────────────────────────────┐
│  RENDER LAYER (NEW — ADR-032)                                     │
│                                                                   │
│  Catches: Render errors, null dereferences, browser API failures  │
│  Pattern: React Error Boundary hierarchy (Tiers 1-3)              │
│  Logging: logError() with component stack                         │
│  Recovery: reset() → re-render subtree                            │
│                                                                   │
│  Errors that escape ServiceResult<T>:                             │
│  - Malformed data in render path                                  │
│  - useEffect / event handler uncaught throws                      │
│  - Zustand selector / derived state errors                        │
│  - Third-party component crashes                                  │
└───────────────────────────────┬───────────────────────────────────┘
                                │ (errors that don't reach here
                                │  are handled by ADR-012 layers)
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│  CLIENT LAYER (ADR-012 §1)                                        │
│                                                                   │
│  Receives: ServiceResult<T>                                       │
│  Handles: Expected API failures via onError callbacks             │
│  Pattern: logError() + getErrorMessage() + type guards            │
└───────────────────────────────┬───────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│  TRANSPORT LAYER (ADR-012 §2)                                     │
│  withServerAction() → ServiceResult<T>                            │
└───────────────────────────────┬───────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│  SERVICE LAYER (ADR-012 §3)                                       │
│  throw DomainError → Promise<T>                                   │
└───────────────────────────────────────────────────────────────────┘
```

### D5: Route-Level error.tsx Convention

Every route segment that renders interactive content SHOULD have an `error.tsx`. Priority deployment order:

| Route | Priority | Reason |
|-------|----------|--------|
| `app/(dashboard)/players/[[...playerId]]/error.tsx` | P0 | PERF-006, most complex page |
| `app/(dashboard)/error.tsx` | P1 | Dashboard-wide fallback |
| `app/(protected)/error.tsx` | P2 | Protected route fallback |

`error.tsx` follows the Next.js convention:

```typescript
'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Render ErrorState with variant="full-page"
}
```

### D6: Logging and Error Reporting

All error boundaries MUST log using the existing `logError()` utility:

```typescript
logError(error, {
  component: `${boundaryType}:${panelName}`,
  action: 'render-error',
  metadata: {
    digest: error.digest,          // Next.js error digest (if available)
    componentStack: truncate(errorInfo?.componentStack, 500),
  },
});
```

**Invariants:**
- **INV-032-1**: Error boundaries MUST NOT use raw `console.error()`. Use `logError()` only.
- **INV-032-2**: Error boundaries MUST NOT swallow errors silently. Every caught error produces a `logError()` call and a visible UI state change.
- **INV-032-3**: `isAuthError(error)` MUST trigger navigation to login, not an error UI.

### D7: QueryErrorResetBoundary Composition

For panels that are primarily data-driven, compose `QueryErrorResetBoundary` inside `PanelErrorBoundary`:

```tsx
<PanelErrorBoundary panelName="timeline">
  <QueryErrorResetBoundary>
    {({ reset }) => (
      <PanelErrorBoundary panelName="timeline-queries" onReset={reset}>
        <TimelinePanel />
      </PanelErrorBoundary>
    )}
  </QueryErrorResetBoundary>
</PanelErrorBoundary>
```

The outer boundary catches non-query render errors. The inner boundary catches query-related failures and uses TanStack Query's `reset()` to retry fetching.

---

## Rationale

### Why three tiers instead of just error.tsx?

Route-level `error.tsx` catches everything but replaces the entire page content. For multi-panel layouts like Player 360 (LeftRail + Center + RightRail), a single panel failure should not destroy the other panels. Tier 2 provides this isolation.

### Why not use the `react-error-boundary` library?

React's built-in class component pattern for error boundaries is ~30 LOC. Adding a dependency for this introduces supply chain surface without meaningful benefit. PT-2's OE Guardrail (OE-AP-01) discourages new dependencies without measured need.

### Why not per-component error boundaries everywhere?

Over-Engineering Guardrail §2: "Abstract infrastructure introduced before a second concrete consumer exists." Per-component boundaries add ceremony without value for leaf components. Panel-level granularity is the right balance — each panel has independent data sources and can fail independently.

### Why wire into existing error-utils instead of creating boundary-specific utilities?

ADR-012 established `lib/errors/error-utils.ts` as the single source of truth for error handling utilities. Creating parallel utilities for error boundaries would violate Single Source of Truth. The existing `getErrorMessage()`, `isRetryableError()`, `logError()` functions handle all error types that boundaries will encounter.

---

## Alternatives Considered

### 1. Route-level error.tsx only (no panel isolation)

**Rejected because:**
- Multi-panel layouts lose all panels on any single error
- No graceful degradation — binary all-or-nothing
- PERF-006 specifically calls out per-panel isolation as a requirement

### 2. Global error boundary at root layout

**Rejected because:**
- Too coarse — loses all route context and navigation state
- Cannot provide route-specific recovery actions
- Next.js root layout cannot have error.tsx (it's a server component constraint)

### 3. Per-component try/catch in render functions

**Rejected because:**
- Cannot catch errors in child components (React limitation)
- Verbose and repetitive
- React error boundaries exist specifically for this purpose

### 4. `react-error-boundary` library

**Rejected because:**
- Adds external dependency for ~30 LOC of functionality
- Violates OE Guardrail: no new deps without measured need
- React's class component pattern is stable and sufficient

---

## Consequences

### Positive

- **Graceful degradation**: Panel crashes show inline error, not white screen
- **User recovery**: Retry buttons for retryable errors
- **Support escalation**: Error codes visible in UI for correlation
- **Consistent logging**: All render errors flow through `logError()` pipeline
- **ADR-012 completion**: Closes the gap between transport and render layers

### Negative

- **Class component required**: React error boundaries require class syntax (no hooks alternative exists in React 19)
- **Testing complexity**: Error boundary tests need `jest.spyOn(console, 'error')` suppression
- **Prop drilling for reset**: Panel boundaries need access to `queryClient` for cache invalidation

### Neutral

- **No production logging initially**: `logError()` only logs in dev. Production error reporting (Sentry, etc.) is a future enhancement and out of scope for this ADR.

---

## Implementation Notes

### File Locations

| File | Purpose |
|------|---------|
| `components/error-boundary/error-state.tsx` | Shared fallback UI (all variants) |
| `components/error-boundary/panel-error-boundary.tsx` | Reusable panel-level boundary |
| `components/error-boundary/index.ts` | Barrel export |
| `app/(dashboard)/players/[[...playerId]]/error.tsx` | Route-level boundary (PERF-006) |

### Existing Infrastructure (No Changes Needed)

| File | Used By |
|------|---------|
| `lib/errors/error-utils.ts` | `getErrorMessage()`, `isRetryableError()`, `logError()`, `isAuthError()` |
| `lib/errors/domain-errors.ts` | `isDomainError()`, `DomainErrorCode` |
| `lib/http/fetch-json.ts` | `isFetchError()`, `FetchError` |

### Compliance

This ADR aligns with:

- **ADR-012** (Error Handling Layers): Extends the client layer with render-time error handling
- **ERROR_HANDLING_STANDARD.md**: Uses `logError()` for all error logging
- **ERROR_TAXONOMY_AND_RESILIENCE.md**: Wires into domain error classification
- **OE-01 Guardrail**: No new dependencies, ~70 LOC total, two immediate consumers

---

## References

- ADR-012: Error Handling Layers — DomainError vs ServiceResult
- `docs/70-governance/ERROR_HANDLING_STANDARD.md` — Component error patterns
- `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md` — Domain error classification
- `docs/issues/perf/PERF-006-PLAYER-360-RENDER-CASCADE-COMPREHENSIVE-AUDIT.md` — Triggering audit
- `lib/errors/error-utils.ts` — Error utility functions
- [React Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [Next.js error.tsx convention](https://nextjs.org/docs/app/building-your-application/routing/error-handling)
- [TanStack Query Error Boundaries](https://tanstack.com/query/latest/docs/framework/react/guides/suspense#resetting-error-boundaries)
