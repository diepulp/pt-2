# Sprint Handoff — PRD-081 Client-Side Error Handling Standardization

**Date:** 2026-05-18  
**Status:** Delivered — all must-have DoD items complete  
**Next sprint owner:** Engineering / Platform

---

## What Shipped

### PRD-081 — Full DoD met

| Workstream | Deliverable | Files |
|------------|-------------|-------|
| WS1 | `normalizeClientError` utility (36 tests) + 7 hook patches | `lib/errors/normalize-client-error.ts`, `lib/errors/normalize-client-error.test.ts`, `hooks/dashboard/http.ts`, `hooks/table-context/use-buyin-telemetry.ts`, `hooks/table-context/use-drop-events.ts` |
| WS2 | `ErrorState` component (full-page / panel / inline) + 3 route error.tsx files | `components/error-boundary/error-state.tsx`, `app/(dashboard)/error.tsx`, `app/(protected)/error.tsx`, `app/(onboarding)/error.tsx` |
| WS3 | `PanelErrorBoundary` adoption in Player 360 (shift-dashboard already had it) | `app/(dashboard)/players/[[...playerId]]/_components/player-360-content-wrapper.tsx` |
| WS4 | ESLint rule `client-error-safety/no-raw-provider-message` (20 tests) | `.eslint-rules/no-raw-provider-message.js`, `.eslint-rules/__tests__/no-raw-provider-message.test.js`, `eslint.config.mjs` |
| Governance | ADR-032 → Accepted, Directive → Accepted | `docs/80-adrs/ADR-032-frontend-error-boundary-architecture.md`, `docs/issues/gaps/client-side-error-handling-standard/CLIENT_SIDE_ERROR_HANDLING_STANDARDIZATION_DIRECTIVE.md` |

### Architecture state after this sprint

```
Client boundary:  normalizeClientError()  ← canonical client sanitizer
Server boundary:  DomainError → ServiceResult<T>  ← ADR-012, unchanged

Error boundary hierarchy:
  Tier 1  app/global-error.tsx            ← root catch-all
  Tier 1  app/(dashboard)/error.tsx       ← NEW: all dashboard routes
  Tier 1  app/(protected)/error.tsx       ← NEW: all protected routes  
  Tier 1  app/(onboarding)/error.tsx      ← NEW: onboarding flows
  Tier 1  app/(protected)/shift-dashboard/error.tsx  ← pre-existing
  Tier 1  app/(dashboard)/players/[[...]]/error.tsx  ← pre-existing
  Tier 2  PanelErrorBoundary              ← shift-dashboard (3 panels), player 360 (2 panels)
  Tier 3  QueryErrorResetBoundary         ← integrated inside PanelErrorBoundary

Lint enforcement:
  error-safety/no-unsafe-error-details    ← guards details: field (pre-existing)
  client-error-safety/no-raw-provider-message  ← NEW: guards message/hint/details propagation
```

---

## Immediate Follow-Up (P1 — Next Sprint)

### 14 remaining `no-raw-provider-message` violations

The new lint rule caught 14 violations outside PRD-081's scope. These are currently CI-flagged on any build touching those files. They need triage before the next merge cycle.

**Pattern distribution:**
- 13 in `components/` — mix of `toast.error(err.message)` in `onError` callbacks, JSX renders of `{error.message}`, and template literals in thrown errors
- 1 in `hooks/dashboard/use-dashboard-realtime.tsx` — template literal with `error.message` in a JSX `title` prop (the underlying error is a developer-constructed `new Error(...)`, making this a lint heuristic false positive)

**Triage decision for each violation:**

1. **If the `.message` comes from a Supabase/provider call result** — replace with `normalizeClientError(error)` or `getErrorMessage(error)` depending on context.
2. **If the `.message` comes from a domain `Error` object constructed by application code** (e.g., `new Error('Realtime channel error')`) — the content is already safe. Add `// eslint-disable-next-line client-error-safety/no-raw-provider-message -- application-constructed error, message is safe` with a justification comment.
3. **If it's a TanStack Query `onError` callback** — replace `toast.error(err.message)` with `toast.error(getErrorMessage(err))`.

**Files to triage (grep baseline — not all lines are actual violations):**

Priority group A (likely true violations — Supabase/RPC call sites):
- `hooks/dashboard/use-dashboard-realtime.tsx`
- `hooks/player-import/use-file-upload.ts`
- `hooks/player-import/use-staging-upload.ts`
- `hooks/player-timeline/use-player-timeline.ts`
- `hooks/rating-slip-modal/use-close-with-financial.ts`

Priority group B (component onError / toast patterns):
- `components/table/` (chip-count-capture-dialog, close-session-dialog, drop-event-dialog, table-power-toggle)
- `components/player-dashboard/` (loyalty-panel, player-edit-modal, session-control-panel)
- `components/mtl/` (audit-note-form, compliance-dashboard)

Priority group C (likely false positives — review and disable with justification):
- `hooks/dashboard/use-dashboard-realtime.tsx` (developer-constructed error message)
- `components/dashboard/active-slips-panel.tsx`, `promo-exposure-panel.tsx` (check if domain or provider)

**Suggested scope:** A single focused PR (~1 sprint day), no architectural decisions required. Mechanical — either `getErrorMessage(err)` swap or lint-disable with justification.

---

## Carry-Forward Work (Not Part of This Sprint)

| Item | Status | Notes |
|------|--------|-------|
| EXEC-065 Shift Report Build | Phase 1 pending | Worktree: `trees/reporting-layer` |
| Wedge C (Shift Intelligence) | AMBER 60% | PRD-055/056 drafted, baseline service not started |
| Wave 2 Transactional Outbox | Phase 2.1 authorized | Teardown gate pending before Phase 2.1 merge |
| Test Remediation Tier 2 | Backlog | 10 services, not started |
| `PanelErrorBoundary` rollout beyond 2 layouts | Out of PRD-081 scope | Admin panels, cashier panels, compliance dashboard — candidate for a future platform hardening slice |

---

## Decision Log (Choices Made This Sprint)

| Decision | Rationale |
|----------|-----------|
| `normalizeClientError` returns generic `Error`, not a typed subclass | Avoids introducing a new error type consumers must handle; `getErrorMessage` already handles `Error` gracefully |
| Shift-dashboard WS3 was already done | `ShiftDashboardV3` already had 3 `PanelErrorBoundary` wrappers; no changes needed |
| Player 360 wrapped at `Player360HeaderContent` + `TimelinePageContent` level | These are the two independently failable units; wrapping at shell level would defeat isolation |
| Lint rule uses name heuristics (`error`, `err`, `e`, `pgError`, etc.) not type inference | ESLint without TypeScript type information cannot distinguish `result.message` (DTO) from `error.message` (provider) — name-based heuristic prevents false positives on domain objects |
| `(onboarding)/error.tsx` promoted to Must Have mid-sprint | Onboarding flows are high-stakes (first-run registration); a crash there with no boundary is a user-acquisition risk |
| ESLint diagnostics on `.eslint-rules/` files not fixed | `no-unsafe-error-details.js` has identical patterns; fixing only the new rule creates inconsistency; `.eslint-rules/**` is excluded from project lint |

---

## Quality Gates — Final State

| Gate | Result |
|------|--------|
| `npm run type-check` | ✓ Zero errors |
| `npm run lint` (changed files) | ✓ Zero errors/warnings |
| Jest — `normalizeClientError` tests | ✓ 36/36 pass |
| Jest — ESLint rule tests | ✓ 20/20 pass |
| False-positive check on WS1-patched files | ✓ Zero findings |
