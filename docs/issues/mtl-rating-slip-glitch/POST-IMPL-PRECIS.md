# MTL Buy-In Glitch Containment — Post-Implementation Precis

**Shipped:** 2026-04-16 · **Commit:** `3839ba9b` · **PRD:** [PRD-064](../../10-prd/PRD-064-mtl-buyin-glitch-containment-v0.md) · **Branch:** `fix/exceptions-realtime`

## Outcome

The production race is closed. The operator no longer sees success-like UI for a financial transaction that has not durably committed, the rating-slip modal cannot be dismissed while the save is in flight, the `rpc_create_financial_txn → fn_derive_mtl_from_finance → mtl_entry` bridge has direct integration-test coverage for the first time, and the close-session path can no longer silently drop an unsaved buy-in. `INV-MTL-BRIDGE-ATOMICITY` is codified in the governance registry.

No migrations. No RPC signature changes. No RLS policy changes. No new SECURITY DEFINER functions. All changes are reversible per-diff per PRD §9.

## What Shipped

| PRD item | Change | Files |
|---|---|---|
| **P0.1** confirmation UI moves post-201 | `notifyThreshold()` removed from `mutationFn`; threshold result threaded through mutation's resolved value; toast fires in `onSuccess` only | `hooks/rating-slip-modal/use-save-with-buyin.ts` |
| **P0.2** commit-barrier UX | Dialog `onOpenChange` / `onEscapeKeyDown` / `onPointerDownOutside` / `onInteractOutside` all guard on `isSavePending`. Save button shows `<Loader2 />` + `Saving...` + disabled. X button gets a z-indexed spinner overlay (see Design Decisions). Pause/Resume/Close Session buttons disabled during save. | `components/modals/rating-slip/rating-slip-modal.tsx` + plumbing in `pit-dashboard-client.tsx`, `pit-panels-client.tsx` |
| **P0.3** bridge integration tests | Qualifying / sub-threshold / G1·G2·G3 guard rollback. 5 test cases. | `services/player-financial/__tests__/bridge-mtl-integration.int.test.ts` |
| **P1.4** close-session interlock | `hasPendingUnsavedBuyIn(formState)` predicate (`Number(formState.newBuyIn) > 0`); `handleCloseSession` early-returns and opens a non-dismissible `AlertDialog` with exact PRD text *"Unsaved buy-in detected. Save it before closing session."*; only control is "Return to Save". | `components/pit-panels/pit-panels-client.tsx`, `hooks/rating-slip-modal/has-pending-unsaved-buyin.ts` |
| **Invariant** codification | `INV-MTL-BRIDGE-ATOMICITY` added to governance doc; route handler test header references it. | `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md`, `app/api/v1/financial-transactions/__tests__/route.test.ts` |
| **Index** cross-link | Issue-folder README created. | `docs/issues/mtl-rating-slip-glitch/README.md` |
| **E2E regression** | `e2e/repro-mtl-glitch.spec.ts` verdict flipped: now asserts the glitch is impossible to reproduce. | `e2e/repro-mtl-glitch.spec.ts` |

## Design Decisions Worth Surfacing

- **G2/G3 guards exercised at trigger layer, not RPC layer.** `rpc_create_financial_txn` derives both `casino_id` and `created_by_staff_id` from session context via `set_rls_context_from_staff()` (ADR-024, migration `20260307135439`). It has no user-supplied identity params, so tenant-mismatch and actor-mismatch violations are structurally unreachable through the RPC. The integration tests use service-role direct inserts to drive the `fn_derive_mtl_from_finance()` trigger's G1/G2/G3 checks (migration `20260116111329_finance_to_mtl_derivation.sql:54-81`). This preserves the atomicity-under-guard-failure proof while honoring ADR-024's "no spoofable params" design.
- **"Not persisted" check collapsed to `Number(newBuyIn) > 0`.** `handleSave` resets the form via `initializeForm({ newBuyIn: '0', ... })` on success. A non-zero `newBuyIn` therefore proves either the save mutation has not run this modal session OR the field is dirty — both collapse to the same predicate. No new state tracking needed.
- **X button quirk.** `DialogPrimitive.Close` inside Radix `DialogContent` cannot be externally disabled without forking the primitive. We render a z-indexed `<Loader2 />` overlay during pending and guard `onOpenChange`, so the X is functionally a no-op and visually a spinner.
- **E2E verification via network-route delay.** Pending-state assertions use `page.route('**/api/v1/financial-transactions', ...)` with a promise-gated `waitUntilPending` / `release` pair. No timing hacks; deterministic window.
- **E2E requires `test.describe.configure({ mode: 'serial' })`.** Shared-seed races under parallel workers forced serial mode per QA-006 §4.
- **Sub-threshold case (b) carries an explanatory comment.** The bridge writes `mtl_entry` unconditionally; threshold gating is read-time at `services/mtl/crud.ts:444–450`. The test comment cites that line and PRD §R-3 so future readers don't misread the assertion as a bug.

## Tests

**21 new tests, all green.**

| Layer | Count | File | Status |
|---|---|---|---|
| Hook unit (notifyThreshold ordering, rejection behavior) | 7 | `hooks/rating-slip-modal/__tests__/use-save-with-buyin.test.tsx` | pass |
| Predicate + close-session contract | 6 | `hooks/rating-slip-modal/__tests__/use-close-with-financial.test.tsx` | pass |
| Bridge integration (a, b, c·G1, c·G2, c·G3) | 5 | `services/player-financial/__tests__/bridge-mtl-integration.int.test.ts` | pass (RUN_INTEGRATION_TESTS=1) |
| E2E regression (dismissal inertness, close-session interlock, happy-path regression) | 3 | `e2e/repro-mtl-glitch.spec.ts` | pass (Mode B, serial) |

Full repo type-check: exit 0. Lint: clean on all modified files. Pre-commit hooks passed (migration naming, RPC self-injection, API standards, service anti-patterns, Zustand, ADR-034, search_path safety).

## Deliberately Deferred (per PRD §2.3)

These are legitimate and were held out of this slice so the containment ships narrow:

- `mtlKeys` invalidation on close-session (observability, not correctness).
- Gaming-day default via casino-TZ API (observability).
- Realtime subscription on `mtl_entry` (live-surface freshness).
- Mixed-unit test-fixture cleanup for `gaming_day = 2026-04-09`.
- Restoring `data-testid` coverage on the pit-panels surface (separate QA ticket).
- Removing the silent `modalData` guard in `handleSave`.
- CTR/SAR threshold-message content expansion.

## Parallel, Non-Blocking

- [ADR-049](../../80-adrs/ADR-049-operator-action-atomicity-boundary.md) — composite client-side mutation vs single server-side command. Direction affirmed in draft; packaging deferred. PRD-064 patches the symptom; ADR-049 decides the long-term shape.
- [PRD-065](../../10-prd/PRD-065-adr049-operator-atomicity-save-with-buyin-v0.md) — ADR-049 rollout PRD.
- Chips-taken / `pit_cash_observation` / MTL semantic-boundary decision (separate ADR).

Neither was a dependency of this slice. Both should proceed on their own cadence.

## References

- Invariant: [`INV-MTL-BRIDGE-ATOMICITY`](../../70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md) — the route contract and operator-visible atomicity corollary.
- ADR-024 — authoritative context derivation; explains why G2/G3 cannot be driven through the RPC.
- ADR-030 — write-path session-var enforcement; not regressed (bridge tests serve as guard).
- ADR-040 — identity provenance; not regressed.
- SRM v4.11.0 — `mtl` and `player_financial_transaction` ownership.
- Original incident chain: `RATING-MTL-ISSUE.md` → `7-findings.md` → `hardening-direction-audit.md` → `PROPOSED-FIXES.md` → `arch-flaw.md`.
