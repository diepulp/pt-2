## Phase 1 Root Cause Investigation — Consolidated Findings

The premise "buy-ins suddenly not registering" conceals **multiple stacked bugs**, some latent-since-Dec-2025 and one caused by a UX shift. The DB write path is **not broken** — it's the client workflow and cache invalidation that silently fail.

### Evidence that the pipeline works for real users
- DB trigger `trg_derive_mtl_from_finance` is enabled.
- All 8 recent authenticated buy-in rows in `player_financial_transaction` (Apr 6–8) have matching `mtl_entry` rows via `idempotency_key = 'fin:<id>'`.
- Amounts align in cents on both tables; the threshold filter converts `casino_settings` dollars → cents at `services/mtl/crud.ts:145–155`, so the comparison is sound for real data.

### Confirmed (original Phase 1 doc was right)
1. **`handleCloseSession` never wires `newBuyIn`** (`components/pit-panels/pit-panels-client.tsx:347-355`). Blame shows this was true from the surface's introduction at `ffea41ec` (Dec 17, 2025) — a copy-paste of the legacy dashboard's pre-existing gap. Latent, not regressed. Visibility increased with the Dec→Jan pit-panels migration.
2. **Silent guard** in `handleSave` at `pit-panels-client.tsx:291-294` (no toast/logError).
3. **Modal stays open after save** → operator can click Close Session next, dropping any buy-in entered after the save.

### Claims from the doc that I disproved
- "No single commit breaks the chain" — broadly true, **but** the Mar 7 `adr040_financial_txn_identity_derivation` migration made `p_direction`/`p_source` required. `lib/finance.ts:25-32` legacy helper omits both — calling it post-Mar-7 would crash. Fortunately it's dead code (only its own test imports it), so not the regression.

### NEW findings the original investigation missed
4. **`useCloseWithFinancial` does zero `mtlKeys` invalidation** (`hooks/rating-slip-modal/use-close-with-financial.ts:185-223`). Save path invalidates; close path does not. Even if Finding 1 were fixed, the compliance dashboard would not reflect the buy-in until `staleTime` elapses plus a window-focus refetch.
5. **MTL has zero realtime subscriptions** — grep for `postgres_changes` returns only `gaming_table`, `rating_slip`, `table_fill`, `table_credit`. Not `mtl_entry`, not `player_financial_transaction`. The branch `fix/exceptions-realtime` added realtime for fills/credits only. A second tab viewing `/compliance` never auto-updates.
6. **Chips-taken on close stopped writing to `player_financial_transaction`** (PRD-OPS-CASH-OBS-001). It now writes to `pit_cash_observation` only, which is not bridged to MTL. Cash-out on close-session silently never hits CTR/MTL. If the user's "buy in that exceeds the threshold" was actually a cash-out, this is the answer.
7. **Client-local gaming_day** (`components/mtl/compliance-dashboard.tsx:72-73`) uses `new Date()` in the browser's local TZ, but casino gaming_day is computed in `America/Los_Angeles` with a 06:00 cutoff. Entries can exist under a different date than the one the dashboard defaults to.
8. **Mixed-unit seed rows** on gaming_day `2026-04-09` (totals 5,850, 200, 5,750, 5,850). Those look like dollars stored where cents are expected — they fall below the `300_000` cents watchlist filter and vanish from the summary. Probably test-fixture pollution, not regression, but worth scrubbing.

### Most-likely root cause by workflow

| User workflow | What breaks |
|---|---|
| Enter buy-in → **Save** → MTL dashboard | Works. This path invalidates mtlKeys and the bridge fires. |
| Enter buy-in → **Close Session** (no Save first) | **#1** (silently dropped) — row never written. |
| Enter buy-in → Save → Close Session | Saved buy-in persists; but if operator re-entered buy-in after save, that second value is dropped via #1. |
| Any flow, operator watches `/compliance` in a second tab | **#4 + #5** — dashboard does not auto-refresh from close-path mutations and has no realtime. |
| Operator testing cash-out (not buy-in) | **#6** — chips-taken doesn't hit MTL at all. |
| Operator testing near midnight or across casino TZ boundary | **#7** — entry is on a different gaming_day than the dashboard defaults to. |

### What I need from you before proposing any fix
Which workflow were you using when you observed the regression? Specifically:
1. Did you click **Save** before Close Session, or did you go straight to Close Session?
2. Was it a **buy-in** or a **chips-taken/cash-out** that didn't appear?
3. Was `/compliance` open in another tab, or did you navigate to it after?

Your answer narrows this from 7 candidate issues to 1–2. No fixes until I know which bug(s) to target.