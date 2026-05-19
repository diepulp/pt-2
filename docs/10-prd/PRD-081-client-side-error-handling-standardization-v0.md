---
id: PRD-081
title: Client-Side Error Handling Standardization
owner: Engineering
status: Draft
affects: [ADR-012, ADR-032, GOV/ERROR_HANDLING_STANDARD, GOV/ERROR_TAXONOMY_AND_RESILIENCE]
created: 2026-05-18
last_review: 2026-05-18
phase: Platform Hardening
http_boundary: false
---

# PRD-081 — Client-Side Error Handling Standardization

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Phase:** Platform Hardening

The system has a well-designed server-side error sanitization stack (ADR-012: `DomainError` → `ServiceResult<T>` → structured transport). However, an auditable client-side boundary gap exists: client hooks that call Supabase directly from the browser propagate raw provider error messages into React Query, toasts, and error boundaries without normalizing them first. Additionally, ADR-032 (Frontend Error Boundary Architecture, status: Proposed) specifies structural requirements — a shared `ErrorState` component, route-level `error.tsx` coverage, and panel-level isolation — that remain only partially implemented.

This PRD closes both problems in a single bounded slice: it ships the client boundary normalization utility, patches the known violations, completes the structural ADR-032 deliverables (component + route coverage), adopts `PanelErrorBoundary` in multi-panel layouts, and introduces a lint rule to prevent recurrence. It does not redesign the server-side error stack, add external logging vendors, or change Supabase call patterns at scale.

---

## 2. Problem & Goals

### 2.1 Problem Statement

Three distinct but related gaps exist on the client error handling surface:

**Gap 1 — Client boundary: raw provider messages leaking.**
Five call sites in `hooks/dashboard/http.ts` and `hooks/table-context/` call Supabase RPCs directly and re-throw the raw `PostgrestError.message`. This string may include infrastructure-identifying details (project references, RPC names, SQL hints). It flows unchecked into React Query, which can propagate it into error boundaries, toast descriptions, or JSX. The existing `error-safety/no-unsafe-error-details` lint rule guards the `details` field only and does not catch this pattern.

**Gap 2 — ADR-032 structural deliverables incomplete.**
ADR-032 specifies a shared `ErrorState` component (three variants: `full-page`, `panel`, `inline`) and route-level `error.tsx` coverage for interactive route groups. The component does not exist. Route-level boundaries exist only for `/shift-dashboard` and `/players`. Group-level boundaries for `(dashboard)`, `(protected)`, and `(onboarding)` are missing. Panel-level `PanelErrorBoundary` exists but is not adopted in any production layout.

**Gap 3 — No lint enforcement for client boundary violations.**
No static check prevents a future hook from repeating the raw-message propagation pattern. Regression requires manual code review.

### 2.2 Goals

1. All client hooks that call Supabase directly normalize provider errors to a safe application-level error before propagating.
2. React Query, toast handlers, error boundaries, and JSX receive only safe, classified errors with no raw provider diagnostic strings.
3. A shared `ErrorState` component (3 variants) provides consistent fallback UI across all error boundary tiers.
4. Route-level error boundaries cover `(dashboard)`, `(protected)`, and `(onboarding)` group layouts.
5. `PanelErrorBoundary` is adopted in at minimum the two highest-traffic multi-panel layouts.
6. A lint rule enforces the client boundary invariant at authoring time.
7. ADR-032 and the CLIENT_SIDE_ERROR_HANDLING_STANDARDIZATION_DIRECTIVE advance to Accepted status.

### 2.3 Non-Goals

- Replacing any browser-side Supabase call with an app-owned API route (that is a separate architectural decision).
- Hiding network request URLs from browser developer tools.
- Changing the server-side error serialization stack (ADR-012 remains authoritative and unchanged).
- Adding external error logging vendors (Sentry wiring is a future enhancement).
- Extending the `DomainError` code catalog.
- Covering marketing, landing, or public auth routes (low operator impact).

---

## 3. Users & Use Cases

**Primary user: Operator (pit boss, floor supervisor)**
- As an operator, I need generic, actionable error messages when a dashboard fetch fails so that I can keep working without seeing internal Supabase diagnostics.
- As an operator, I need one failed panel to show an isolated retry state so that a localized failure does not blank the whole page.
- As an operator, I need transient client failures to provide a recovery action so that I can retry without reloading the full application.

**Secondary user: Platform engineer**
- As a platform engineer, I need lint enforcement for direct Supabase client hooks so that raw provider messages do not regress during future development.
- As a platform engineer, I need a shared `ErrorState` component so that new `error.tsx` boundaries render consistent safe fallback UI.
- As a platform engineer, I need an established `PanelErrorBoundary` adoption pattern so that new multi-panel layouts isolate independently-failable regions.

**Secondary user: On-call engineer**
- As an on-call engineer, I need structured `logError()` context for client boundary failures so that I can diagnose failures without exposing provider details to operators.

---

## 4. Scope & Feature List

### Must Have

- [ ] `normalizeClientError(error: unknown): Error` utility in `lib/errors/` — classifies `PostgrestError` into a safe application-level `Error` with a stable message; strips `message`, `hint`, `details`, `code` from the public-facing error text.
- [ ] All seven identified hook violation locations patched to call `normalizeClientError` instead of `throw new Error(error.message)`.
- [ ] `components/error-boundary/error-state.tsx` created with three variants (`full-page`, `panel`, `inline`), wired to existing `getErrorMessage()`, `isRetryableError()`, `getErrorCode()`, `isAuthError()` utilities.
- [ ] `app/(dashboard)/error.tsx` — group-level fallback boundary for all dashboard routes.
- [ ] `app/(protected)/error.tsx` — group-level fallback boundary for protected routes.
- [ ] `app/(onboarding)/error.tsx` — group-level fallback for onboarding flows.
- [ ] `PanelErrorBoundary` adopted in shift-dashboard multi-panel layout.
- [ ] `PanelErrorBoundary` adopted in player 360 multi-panel layout.
- [ ] ESLint rule `error-safety/no-raw-provider-message` — flags `error.message`, `error.hint`, `error.details` from Supabase/PostgrestError used in thrown errors, JSX content, toast calls, or template literals in client files.
- [ ] ADR-032 status updated to Accepted.
- [ ] CLIENT_SIDE_ERROR_HANDLING_STANDARDIZATION_DIRECTIVE status updated to Accepted.

### Should Have

- [ ] Unit tests for `normalizeClientError` covering: network error, PostgREST 401, PostgREST 500, unknown object, null input.
- [ ] Unit tests for `ErrorState` covering all three variants in render.

### Won't Have (this PRD)

- Per-leaf `error.tsx` for individual cashier, admin, compliance, and loyalty sub-routes.
- `PanelErrorBoundary` adoption beyond the two specified layouts.
- Production Sentry DSN configuration.
- Retry-policy (exponential backoff) for transient failures.

---

## 5. Requirements

### 5.1 Functional Requirements

**F-1 Client error normalization**
`normalizeClientError(error)` must:
- Accept any unknown thrown value.
- Detect `PostgrestError` shape (presence of `code`, `message`, `details`, `hint` fields).
- Return a plain `Error` with a safe, stable application message (e.g., "The service is temporarily unavailable. Please try again." for 5xx; "You do not have access to this resource." for 401/403; "We could not complete this operation." for 4xx).
- Never include any field from the raw provider error in the returned error's `message`, `cause`, or any custom property accessible to calling code.
- Log the raw error using `logError()` before stripping (for dev diagnostics).

**F-2 Hook patch**
The five violations (`hooks/dashboard/http.ts:46`, `:64`, `:95`; `hooks/table-context/use-buyin-telemetry.ts:51,105,147`; `hooks/table-context/use-drop-events.ts:58`) must call `normalizeClientError` and re-throw the result.

**F-3 ErrorState component**
`ErrorState` accepts `{ error, reset?, variant, panelName? }` and renders appropriate fallback UI per variant. `full-page` centers a card with retry and "Go back" navigation. `panel` is compact inline with retry. `inline` is minimal text with retry link. All variants use `getErrorMessage(error)` for user copy and call `isAuthError(error)` to redirect rather than render.

**F-4 Route boundaries**
`app/(dashboard)/error.tsx` and `app/(protected)/error.tsx` must use `ErrorState variant="full-page"` and call `logError` on mount with the error digest.

**F-5 Panel boundary adoption**
Shift-dashboard layout and player 360 layout must wrap each independently-failable panel section in `<PanelErrorBoundary panelName="...">`. One panel failure must not prevent other panels from rendering.

**F-6 Lint rule**
The new rule runs on files matching `hooks/**/*.{ts,tsx}`, `components/**/*.{ts,tsx}`, and `app/**/*.{ts,tsx}` that contain `'use client'` or are in client-side hook directories. It flags:
- `throw new Error(providerError.message)` or any variant
- `toast.error(providerError.message)` or `toast.error(..., { description: providerError.message })`
- JSX `{providerError.message}`, `{providerError.hint}`, `{providerError.details}`
- Template literals embedding any of the above

### 5.2 Non-Functional Requirements

**NF-1** `normalizeClientError` must not throw under any input (catches internally, logs, returns generic Error).

**NF-2** `ErrorState` variants must render within the Tailwind v4 / shadcn design system — no new UI dependencies.

**NF-3** The lint rule must produce zero false positives on the existing codebase's `getErrorMessage(error)` call pattern (that function already strips provider details).

**NF-4** All new files pass `npm run type-check` and `npm run lint` with zero warnings.

**NF-5** No database schema, RLS policy, or persisted data behavior changes are introduced by this PRD.

---

## 6. UX / Flow Overview

**Happy path (no change):** Normal operator session — no error handling surfaces are visible.

**Provider failure in dashboard hook:**
1. Supabase RPC call fails in `fetchDashboardTables`.
2. `normalizeClientError` intercepts, logs raw error in dev, returns safe `Error("We could not load this section.")`.
3. React Query receives the safe error.
4. Toast handler calls `getErrorMessage(safeError)` → shows "We could not load this section." in Sonner toast.
5. No Supabase project reference or RPC name is visible to the operator.

**Panel render crash:**
1. A component inside a panel throws during render.
2. `PanelErrorBoundary` catches it, calls `logError()` with component stack.
3. Panel renders `<ErrorState variant="panel" />` — compact inline error with retry button.
4. Other panels remain usable; the operator retries the failed panel independently.

**Route-level crash (unexpected):**
1. An uncaught exception escapes panel boundaries.
2. Next.js `error.tsx` activates, renders `<ErrorState variant="full-page" />`.
3. Operator sees "Something went wrong" with a retry button.
4. "Go back" navigation link is available.

**Auth error anywhere on client:**
1. `isAuthError(error)` returns true inside `ErrorState`.
2. Component redirects to `/auth/login` instead of rendering error UI.

---

## 7. Dependencies & Risks

### Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| `lib/errors/error-utils.ts` | Exists | `logError`, `getErrorMessage`, `isRetryableError`, `getErrorCode`, `isAuthError` all available |
| `components/error-boundary/panel-error-boundary.tsx` | Exists | No changes needed; used as-is |
| `components/error-boundary/index.ts` | Exists | Barrel to extend with `ErrorState` export |
| ESLint plugin for `error-safety` rules | Exists | New rule appended to existing plugin |
| Sonner toast (via `hooks/ui.ts`) | Exists | No changes |
| ADR-032 | Proposed | Advances to Accepted upon DoD completion |
| CLIENT_SIDE_ERROR_HANDLING_STANDARDIZATION_DIRECTIVE | Proposed | Advances to Accepted upon DoD completion |

### Risks

**R-1 (Low) — PostgrestError shape instability.** If Supabase client library changes the `PostgrestError` field names, `normalizeClientError`'s detection logic could miss new provider errors. Mitigation: detect by structural shape check, not instanceof; unit tests cover shape variations.

**R-2 (Low) — Panel boundary adoption causes unexpected Suspense/Query interaction.** Wrapping an existing layout in `PanelErrorBoundary` with `QueryErrorResetBoundary` may affect query key reset behavior. Mitigation: test each wrapped layout in dev before merge; use `panelName` logging to identify reset scope.

**R-3 (Low) — Lint rule false positives on legitimate `error.message` usage in server code.** Rule must restrict to client-context files only. Mitigation: scope rule to `'use client'` directive or explicit directory patterns; test rule against full codebase before enforcing.

### Open Questions

None blocking. ADR-032 and the Directive are fully specified. Implementation can begin from this PRD.

---

## 8. Definition of Done

The release is considered **Done** when:

**Functionality**
- [ ] Client error normalization, shared `ErrorState`, dashboard/protected/onboarding route boundaries, and the two required `PanelErrorBoundary` adoptions are implemented.
- [ ] All seven identified raw-message locations are patched (`http.ts:46,64,95`; `use-buyin-telemetry.ts:51,105,147`; `use-drop-events.ts:58`), and no hook in `hooks/` passes provider fields directly to thrown errors, toasts, or JSX.

**Data & Integrity**
- [ ] No database schema, RLS policy, persisted state, or server-side error serialization behavior changes are included in the implementation.

**Security & Access**
- [ ] Raw provider fields (`message`, `hint`, `details`, `code`) are not exposed through React Query errors, toasts, route boundaries, panel boundaries, or JSX.

**Testing**
- [ ] Unit tests cover `normalizeClientError` edge cases and all three `ErrorState` variants; `npm run type-check` and `npm run lint` pass with zero errors.

**Lint Enforcement**
- [ ] `error-safety/no-raw-provider-message` exists, is active in ESLint configuration, and has true-positive and false-positive regression tests for the supported client patterns.

**Operational Readiness**
- [ ] Client boundary failures call `logError()` with component/action context while preserving safe operator-facing copy and a retry path.

**Documentation**
- [ ] ADR-032, the Client-Side Error Handling Standardization Directive, and `docs/INDEX.md` are updated to reflect the completed standardization slice.

**Governance**
- [ ] ADR-032 `status:` field updated from `Proposed` to `Accepted`.
- [ ] `CLIENT_SIDE_ERROR_HANDLING_STANDARDIZATION_DIRECTIVE.md` `Status:` field updated from `Proposed` to `Accepted`.

---

## 9. Related Documents

| Document | Relationship |
|----------|-------------|
| `docs/00-vision/VIS-001-VISION-AND-SCOPE.md` | Vision reference for operator continuity and safe operational surfaces |
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | Bounded context registry; confirms this PRD does not change service ownership |
| `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` | Service architecture reference; server-side error stack remains unchanged |
| `docs/80-adrs/ADR-012-error-handling-layers.md` | Server-side error stack; this PRD extends client layer only |
| `docs/80-adrs/ADR-032-frontend-error-boundary-architecture.md` | Specifies D2 (`ErrorState`), D3 (`PanelErrorBoundary`), D5 (route coverage); advances to Accepted |
| `docs/issues/gaps/client-side-error-handling-standard/CLIENT_SIDE_ERROR_HANDLING_STANDARDIZATION_DIRECTIVE.md` | Governing boundary invariant; advances to Accepted |
| `docs/70-governance/ERROR_HANDLING_STANDARD.md` | Component error patterns; no changes required |
| `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md` | Domain error classification; `safeErrorDetails` standard |
| `docs/40-quality/QA-001-service-testing-strategy.md` | QA reference for unit validation expectations |
| `docs/40-quality/QA-002-quality-gates.md` | QA reference for lint and type-check validation expectations |
| `types/remote/database.types.ts` | Schema/type source of truth; no schema type changes expected |
| `lib/errors/error-utils.ts` | Utility source of truth; `normalizeClientError` added alongside |
| `components/error-boundary/panel-error-boundary.tsx` | Existing panel boundary; adoption extended |

---

## Appendix A: Known Violations (Audit Baseline)

| File | Line(s) | Pattern | Severity |
|------|---------|---------|----------|
| `hooks/dashboard/http.ts` | 46 | `throw new Error(error.message)` — raw PostgrestError from `rpc_get_dashboard_tables_with_counts` | P1 |
| `hooks/dashboard/http.ts` | 64 | `throw new Error(\`Failed to fetch dashboard stats: ${error.message}\`)` | P1 |
| `hooks/dashboard/http.ts` | 95 | `throw new Error(\`Failed to fetch gaming day: ${error.message}\`)` | P1 |
| `hooks/table-context/use-buyin-telemetry.ts` | 51, 105, 147 | `throw new Error(error.message)` — raw PostgrestError from browser Supabase client | P1 |
| `hooks/table-context/use-drop-events.ts` | 58 | `throw new Error(error.message)` | P1 |

All seven locations follow the same pattern: a direct Supabase call fails, and `error.message` from the `PostgrestError` is passed verbatim into a new `Error`. These propagate into React Query's error state and can surface in toast descriptions, error boundary renders, or `console.error` output visible to users.

---

## Appendix B: Implementation Plan

### WS1 — Client Boundary Normalization (no breaking changes)

**Deliverables:**
- `lib/errors/normalize-client-error.ts`
- `lib/errors/normalize-client-error.test.ts`
- Patches to 3 files (7 locations)

**`normalizeClientError` logic:**
```typescript
// lib/errors/normalize-client-error.ts
import { logError } from './error-utils';

function isPostgrestError(e: unknown): e is { code: string; message: string; details: string | null; hint: string | null } {
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e && 'details' in e;
}

export function normalizeClientError(error: unknown): Error {
  logError(error, { component: 'client-boundary', action: 'provider-error' });

  if (isPostgrestError(error)) {
    const code = String(error.code);
    if (code === 'PGRST301' || code.startsWith('4')) {
      return new Error('You do not have access to this resource.');
    }
    if (code === '42501') {
      return new Error('You do not have permission to perform this action.');
    }
    return new Error('The service is temporarily unavailable. Please try again.');
  }

  if (error instanceof Error) {
    return new Error('Something went wrong. Please try again.');
  }

  return new Error('Something went wrong. Please try again.');
}
```

**Patch shape (identical for all 7 locations):**
```typescript
// Before
if (error) {
  throw new Error(error.message);
}

// After
if (error) {
  throw normalizeClientError(error);
}
```

---

### WS2 — ErrorState Component + Route Boundaries

**Deliverables:**
- `components/error-boundary/error-state.tsx`
- `app/(dashboard)/error.tsx`
- `app/(protected)/error.tsx`
- `app/(onboarding)/error.tsx` (should-have)
- Update `components/error-boundary/index.ts`

**ErrorState interface (per ADR-032 D2):**
```typescript
interface ErrorStateProps {
  error: Error;
  reset?: () => void;
  variant: 'full-page' | 'panel' | 'inline';
  panelName?: string;
}
```

**Route error.tsx shape:**
```typescript
'use client';
import { useEffect } from 'react';
import { logError } from '@/lib/errors/error-utils';
import { ErrorState } from '@/components/error-boundary';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logError(error, { component: 'route-error-boundary', action: 'render-error', metadata: { digest: error.digest } });
  }, [error]);

  return <ErrorState error={error} reset={reset} variant="full-page" />;
}
```

---

### WS3 — PanelErrorBoundary Adoption

**Layouts to update:**
- `app/(protected)/shift-dashboard/` — identify independently-failable panel components; wrap each in `<PanelErrorBoundary panelName="...">`.
- `app/(dashboard)/players/[[...playerId]]/` — wrap LeftRail, Center, and RightRail sections.

**Pattern:**
```tsx
<PanelErrorBoundary panelName="shift-stats">
  <QueryErrorResetBoundary>
    {({ reset }) => (
      <PanelErrorBoundary panelName="shift-stats-queries" onReset={reset}>
        <ShiftStatsPanel />
      </PanelErrorBoundary>
    )}
  </QueryErrorResetBoundary>
</PanelErrorBoundary>
```

---

### WS4 — ESLint Rule

**Deliverables:**
- New rule `no-raw-provider-message` in existing `error-safety` ESLint plugin
- Rule test file

**Rule targets in client files:**
- `throw new Error(X.message)` where X is typed as PostgrestError or is a direct Supabase call result
- `toast.error(X.message)` or `toast.error(..., { description: X.message })`
- Template literals: `` `...${X.message}...` ``
- JSX: `{X.message}`, `{X.hint}`, `{X.details}`

**Scope:** Files containing `'use client'` directive or matching `hooks/**/*.{ts,tsx}`.

---

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v0 | 2026-05-18 | Engineering | Initial draft |
