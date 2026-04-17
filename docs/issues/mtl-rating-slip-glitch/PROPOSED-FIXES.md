## Proposed Hardening Plan

### P0 — Ship-blocker (fixes yesterday's glitch directly)

1. **Move `notifyThreshold` to AFTER successful POST**, not before. Currently at `use-save-with-buyin.ts:101-106`. Move into `onSuccess` / end of mutationFn. User never sees confirmation for a save that hasn't persisted.
2. **Block modal close while save mutation is pending**. In `rating-slip-modal.tsx` pass `isSavePending` to the Dialog's `onOpenChange` handler — refuse to close while a mutation is in flight. Show a spinner + disable the Close button. This prevents the abort race entirely.
3. **Integration test for the bridge**: one Jest or Playwright test that calls `rpc_create_financial_txn` with `txn_type=buy_in` and asserts `mtl_entry` row exists — closes the test-coverage gap so regressions here are caught in CI.

### P1 — Systemic gaps surfaced by the same investigation

4. **Wire `newBuyIn` into `handleCloseSession`** (`pit-panels-client.tsx:347-355`). Or explicitly validate that pending buy-in is zero before closing; surface a dialog ("You have an un-saved buy-in — save first?").
5. **Remove silent guard** at `pit-panels-client.tsx:291-294` — log + toast when `modalData` is null.
6. **Invalidate `mtlKeys` in `useCloseWithFinancial`** — mirror the save-path invalidation so the compliance dashboard refreshes after close-session flows.
7. **Chips-taken→MTL bridge decision** (PRD-OPS-CASH-OBS-001): cash-out on close no longer hits MTL since the migration to `pit_cash_observation`. If operators expect CTR on cash-out, we need an observation-to-MTL bridge OR documentation clarifying cash-out MTL is recorded via a different surface.

### P2 — Resilience & correctness

8. **Gaming-day default in compliance-dashboard.tsx:72-73** — use the casino's computed gaming day (via `/api/v1/casino/gaming-day`) instead of `format(new Date(),…)`, so the dashboard never queries the wrong date across the LA 06:00 cutoff.
9. **Scrub mixed-unit test fixtures** on `gaming_day = 2026-04-09` (55 entries in dollars, not cents) — they fall below the cent-threshold filter silently.
10. **Add test-id attributes** to pit-panels seats / buttons — the legacy `PitDashboardClient` had `data-testid="table-grid"` / `data-seat-number`; the new surface has none, which is why existing E2E tests silently don't exercise the regressed path.
11. **Optional**: realtime subscription for `mtl_entry` — unlocks second-tab live update on `/compliance`.

### Next step

If you approve, I'd start with **P0 items 1 + 2** (they address the exact observed glitch) and **P0 item 3** (test to prevent regression). P1/P2 can follow once the ship-blocker is closed. Want me to implement the P0 set, or re-scope?