# ISSUE: Supabase Type System Audit — Staleness Remediation

**Date:** 2026-02-03
**Status:** Open — staleness resolved (S1/S2), residual artifacts remain
**Severity:** High (residual `as any` casts), Medium (policy gaps)
**Scope:** All runtime code, tests, and configuration in `pt-2/`
**Method:** Exhaustive ripgrep searches (6 queries), file reads, diff analysis
**Governing protocol:** [`DB-CONTRACT-STALENESS-PROTOCOL`](dual-type-system/DB-CONTRACT-STALENESS-PROTOCOL.md)

---

## Summary

Per the staleness protocol: **migrations are the schema authority, `types/database.types.ts` is the sole canonical runtime contract, and types represent the contract produced by migrations — not an environment.**

Multiple DB instances (local docker, remote project, worktrees) are expected and supported. The remote snapshot (`types/remote/database.types.ts`) is a CI validation artifact — never imported by runtime code.

### What happened

A seed file issue caused **S1 staleness** (local DB missing migrations), which cascaded into **S2 staleness** (canonical types missing 30+ RPCs). Rather than following the remediation playbook (reset → regenerate → remove casts), an agent introduced a protocol-violating shim (`lib/gaming-day/rpc.ts`) that imported remote types into runtime code.

**Current state:** S1 and S2 are resolved — canonical types are current. However, the shim and all 30+ `as any` casts remain as dead artifacts. No CI gates prevent recurrence.

---

## Root Cause (mapped to protocol categories)

| # | Category | What happened | Protocol violation |
|---|----------|---------------|-------------------|
| 1 | **S1** — Local DB stale | Seed file issue prevented local schema from reflecting migrations | None — S1 is normal during development |
| 2 | **S2** — Types stale | `db:types-local` generated against stale local DB → canonical types missing RPCs | None — S2 follows from S1 |
| 3 | **Protocol skip** | Instead of Steps 1–4 (reset → regen → remove casts), agent introduced `lib/gaming-day/rpc.ts` importing remote types into runtime code | Violates **G1** (single canonical import) and **G2** (no type-system mixing) |
| 4 | **No guardrails** | Nothing in CI detects G1/G2/G3 violations or drift | Missing enforcement of protocol guardrails |

---

## Terminology (per protocol)

| Term | Meaning |
|------|---------|
| **canonical runtime types** | `types/database.types.ts` — the only import target for all runtime code. Generated from local DB via `npm run db:types-local` (preferred) or from remote via fallback. Represents the migration contract. |
| **remote snapshot** | `types/remote/database.types.ts` — CI validation artifact generated from remote project via `npm run db:types` Generated from the deployed remote DB to verify it matches repo migrations/canonical types. **Never imported by runtime code.** |
| **schema authority** | The repo migrations folder (`supabase/migrations/`). Remote DB and local DB instances must match migrations. |
| **S1–S4** | Staleness categories defined in the protocol. This incident was S1 → S2 cascade. |

---

## A) Canonical Inventory — Type Imports

### Runtime Code (services, lib, app, hooks, components, utils)

| File | Import Statement | Which Type File | Server/Client/Shared | Notes |
|------|-----------------|-----------------|----------------------|-------|
| `lib/supabase/server.ts:6` | `import { Database } from '@/types/database.types'` | canonical | Server | Non-`type` import (value import) |
| `lib/supabase/client.ts:6` | `import type { Database } from '@/types/database.types'` | canonical | Client | |
| `lib/supabase/service.ts:16` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `lib/supabase/rls-context.ts:17` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `lib/gaming-day/server.ts:18` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `lib/gaming-day/rpc.ts:13` | `import type { Database } from '@/types/database.types'` | canonical | Shared | Also imports RemoteDatabase — **G1/G2 violation** |
| `lib/gaming-day/rpc.ts:14` | `import type { Database as RemoteDatabase } from '@/types/remote/database.types'` | **remote (violation)** | Shared | **G1 violation — runtime code importing remote snapshot. Dead code (shim no longer needed).** |
| `lib/theo.ts:12` | `import type { Database } from '@/types/database.types'` | canonical | Shared | |
| `lib/server-actions/types.ts:4` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `lib/server-actions/audit.ts:4` | `import type { Database, Json } from '@/types/database.types'` | canonical | Server | |
| `lib/server-actions/middleware/compositor.ts:7` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `lib/server-actions/middleware/audit.ts:2` | `import type { Database, Json } from '@/types/database.types'` | canonical | Server | |
| `lib/server-actions/middleware/types.ts:5` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `utils/supabase/client.ts:6` | `import type { Database } from '@/types/database.types'` | canonical | Client | Duplicate of `lib/supabase/client.ts` |
| `services/player/dtos.ts:11` | `import type { Database } from '@/types/database.types'` | canonical | Shared | |
| `services/player/crud.ts:16` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `services/player/index.ts:14` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `services/player/identity.ts:16` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `services/visit/dtos.ts:12` | `import type { Database } from '@/types/database.types'` | canonical | Shared | |
| `services/visit/crud.ts:16` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `services/visit/index.ts:26` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `services/rating-slip/dtos.ts:15` | `import type { Database, Json } from '@/types/database.types'` | canonical | Shared | |
| `services/rating-slip/crud.ts:21` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `services/rating-slip/index.ts:22` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `services/rating-slip/mappers.ts:15` | `import type { Json } from '@/types/database.types'` | canonical | Shared | |
| `services/rating-slip/queries.ts:18` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `services/rating-slip-modal/rpc.ts:15` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `services/casino/dtos.ts:11` | `import type { Database } from '@/types/database.types'` | canonical | Shared | |
| `services/casino/crud.ts:17` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `services/casino/index.ts:20` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `services/loyalty/index.ts:21` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `services/loyalty/crud.ts:16` | `import type { Database } from '@/types/database.types'` | canonical | Server | Heavy `as any` RPC bypass |
| `services/loyalty/rollups.ts:14` | `import type { Database } from '@/types/database.types'` | canonical | Server | `as any` RPC bypass |
| `services/loyalty/dtos.ts:13` | `import type { Database } from '@/types/database.types'` | canonical | Shared | |
| `services/loyalty/promo/index.ts:13` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `services/loyalty/promo/crud.ts:15` | `import type { Database } from '@/types/database.types'` | canonical | Server | 12x `as any` casts |
| `services/mtl/dtos.ts:12` | `import type { Database } from '@/types/database.types'` | canonical | Shared | |
| `services/mtl/crud.ts:23` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `services/mtl/index.ts:27` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `services/mtl/mappers.ts:11` | `import type { Database } from '@/types/database.types'` | canonical | Shared | |
| `services/player-financial/mappers.ts:11` | `import type { Database } from '@/types/database.types'` | canonical | Shared | |
| `services/player-financial/index.ts:20` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `services/player-financial/crud.ts:16` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `services/player360-dashboard/crud.ts:21` | `import type { Database, Json } from '@/types/database.types'` | canonical | Server | |
| `services/player360-dashboard/mappers.ts:10` | `import type { Json } from '@/types/remote/database.types'` | **remote (violation)** | Shared | **G1 violation — must import from canonical** |
| `services/player-timeline/crud.ts:14` | `import type { Database } from '@/types/database.types'` | canonical | Server | |
| `services/player-timeline/mappers.ts:11` | `import type { Json } from '@/types/database.types'` | canonical | Shared | |
| `services/table-context/dtos.ts:11` | `import type { Database } from '@/types/database.types'` | canonical | Shared | |
| `services/table-context/*.ts` (8 files) | `import type { Database } from '@/types/database.types'` | canonical | Server | Consistent |
| `services/floor-layout/*.ts` (4 files) | `import type { Database } from '@/types/database.types'` | canonical | Server/Shared | Consistent |
| `app/api/v1/casino/route.ts:29` | `import type { Json } from '@/types/database.types'` | canonical | Server | |
| `app/api/v1/casino/[id]/route.ts:28` | `import type { Json } from '@/types/database.types'` | canonical | Server | |
| `app/review/pit-map/types.ts:6` | `import type { Database } from '@/types/database.types'` | canonical | Shared | |
| `components/table/pit-map-selector.tsx:22` | `import type { Database } from '@/types/database.types'` | canonical | Client | |
| `hooks/dashboard/use-dashboard-realtime.tsx:23` | `import type { Database } from '@/types/database.types'` | canonical | Client | |

### Test Code with anomalies

| File | Import Statement | Which Type File | Notes |
|------|-----------------|-----------------|-------|
| `services/loyalty/__tests__/points-accrual-calculation.integration.test.ts:28` | `import type { Database } from '/home/diepulp/projects/pt-2/types/database.types.ts'` | canonical | **Absolute path with `.ts` extension** |
| All other tests (~30 files) | `import type { Database } from '@/types/database.types'` or `'../../types/database.types'` | canonical | Consistent |

---

## B) Inventory — Supabase Client Typing Patterns

| File | Client creation/wrapper | Generic type used | Any casts/bypasses | Notes |
|------|------------------------|-------------------|-------------------|-------|
| `lib/supabase/server.ts:17` | `createServerClient<Database>(...)` | `Database` (canonical) | None | `satisfies SupabaseClient<Database>` |
| `lib/supabase/client.ts:62` | `createBrowserClient<Database>(...)` | `Database` (canonical) | None | `satisfies SupabaseClient<Database>` |
| `lib/supabase/service.ts:38` | `createSupabaseClient<Database>(...)` | `Database` (canonical) | None | Service role client |
| `lib/gaming-day/rpc.ts:23` | `toRemoteClient(...)` | `RemoteDatabase` (remote snapshot) | `as unknown as RemoteClient` | **Dead shim — G1/G2 violation, delete** |
| `utils/supabase/client.ts:62` | `createBrowserClient<Database>(...)` | `Database` (canonical) | `mockClient as unknown as` (test path) | Duplicate client file |
| `services/security/__tests__/rls-context.test.ts:42` | mock | `Database` (canonical) | `as unknown as SupabaseClient<Database>` | Test double — acceptable |
| `services/rating-slip-modal/__tests__/rpc.test.ts:42` | mock | `Database` (canonical) | `as unknown as SupabaseClient<Database>` | Test double — acceptable |
| `services/rating-slip-modal/__tests__/rpc-security.test.ts:40` | mock | `Database` (canonical) | `as unknown as SupabaseClient<Database>` | Test double — acceptable |
| `services/rating-slip-modal/__tests__/rpc-contract.test.ts:48` | mock | `Database` (canonical) | `as unknown as SupabaseClient<Database>` | Test double — acceptable |
| `services/casino/__tests__/service.test.ts:69` | mock | `Database` (canonical) | `as unknown as SupabaseClient<Database>` | Test double |
| `services/casino/__tests__/crud.unit.test.ts:77` | mock | `Database` (canonical) | `as unknown as SupabaseClient<Database>` | Test double |
| `services/player-financial/__tests__/service.test.ts:74` | mock | `Database` (canonical) | `as unknown as SupabaseClient<Database>` | Test double |
| `lib/server-actions/middleware/__tests__/compositor.test.ts:46` | mock | None | `as any` | **Untyped mock** |
| `lib/server-actions/middleware/__tests__/tracing.test.ts:11` | mock | None | `{} as any` | **Untyped mock** |
| `lib/server-actions/middleware/__tests__/audit.test.ts:9` | mock | None | `as any` | **Untyped mock** |
| `lib/server-actions/middleware/__tests__/idempotency.test.ts:7` | mock | None | `{} as any` | **Untyped mock** |
| `lib/server-actions/middleware/__tests__/rls.test.ts:12` | mock | None | `{} as any` | **Untyped mock** |
| `lib/server-actions/middleware/__tests__/auth.test.ts:13` | mock | None | `{} as any` | **Untyped mock** |

---

## C) RPC Usage Table

### Production Runtime RPCs

| RPC name | File | Typed or bypassed | Evidence snippet |
|----------|------|-------------------|------------------|
| `rpc_current_gaming_day` | `lib/gaming-day/rpc.ts:29` | **Typed via dead shim (G1/G2 violation)** | `toRemoteClient(supabase).rpc('rpc_current_gaming_day')` — now available in canonical types, shim unnecessary |
| `rpc_gaming_day_range` | `lib/gaming-day/rpc.ts:47` | **Typed via dead shim (G1/G2 violation)** | `toRemoteClient(supabase).rpc('rpc_gaming_day_range', {...})` — now available in canonical types, shim unnecessary |
| `set_rls_context_from_staff` | `lib/supabase/rls-context.ts:89` | Typed | `supabase.rpc('set_rls_context_from_staff', {...})` |
| `rpc_create_player` | `services/player/crud.ts:141` | Typed | `supabase.rpc('rpc_create_player', {...})` |
| `rpc_start_rating_slip` | `services/rating-slip/crud.ts:180` | Typed | `supabase.rpc("rpc_start_rating_slip", {...})` |
| `rpc_pause_rating_slip` | `services/rating-slip/crud.ts:220` | Typed | `supabase.rpc("rpc_pause_rating_slip", {...})` |
| `rpc_resume_rating_slip` | `services/rating-slip/crud.ts:253` | Typed | `supabase.rpc("rpc_resume_rating_slip", {...})` |
| `rpc_close_rating_slip` | `services/rating-slip/crud.ts:289` | Typed | `supabase.rpc("rpc_close_rating_slip", {...})` |
| `rpc_get_rating_slip_duration` | `services/rating-slip/crud.ts:495` | Typed | `supabase.rpc("rpc_get_rating_slip_duration", {...})` |
| `rpc_list_closed_slips_for_gaming_day` | `services/rating-slip/crud.ts:805` | **Bypassed** | `(supabase.rpc as any)('rpc_list_closed_slips_...', {...})` |
| `rpc_start_from_previous` | `services/rating-slip/crud.ts:857` | **Bypassed** | `(supabase.rpc as any)('rpc_start_from_previous', {...})` |
| `rpc_get_rating_slip_modal_data` | `services/rating-slip-modal/rpc.ts:146` | Typed | `supabase.rpc('rpc_get_rating_slip_modal_data', {...})` |
| `rpc_move_player` | `services/rating-slip-modal/rpc.ts:366` | **Bypassed** | `(supabase.rpc as any)('rpc_move_player', {...})` |
| `rpc_start_or_resume_visit` | `services/visit/crud.ts:216` | Typed | `supabase.rpc("rpc_start_or_resume_visit", {...})` |
| `rpc_get_player_recent_sessions` | `services/visit/crud.ts:489` | Typed | `supabase.rpc("rpc_get_player_recent_sessions", {...})` |
| `rpc_check_table_seat_availability` | `services/visit/crud.ts:646` | Typed | `supabase.rpc("rpc_check_table_seat_availability", {...})` |
| `rpc_accrue_on_close` | `services/loyalty/crud.ts:211` | **Bypassed** | `(supabase.rpc as any)('rpc_accrue_on_close', {...})` |
| `rpc_redeem` | `services/loyalty/crud.ts:260` | **Bypassed** | `(supabase.rpc as any)('rpc_redeem', {...})` |
| `rpc_manual_credit` | `services/loyalty/crud.ts:313` | **Bypassed** | `(supabase.rpc as any)('rpc_manual_credit', {...})` |
| `rpc_apply_promotion` | `services/loyalty/crud.ts:363` | **Bypassed** | `(supabase.rpc as any)('rpc_apply_promotion', {...})` |
| `rpc_issue_mid_session_reward` | `services/loyalty/crud.ts:414` | **Bypassed** | `(supabase.rpc as any)('rpc_issue_mid_session_...', {...})` |
| `rpc_get_player_ledger` | `services/loyalty/crud.ts:541` | **Bypassed** | `(supabase.rpc as any)('rpc_get_player_ledger', {...})` |
| `rpc_get_player_loyalty_balance` | `services/loyalty/crud.ts:594` | **Bypassed** | `(supabase.rpc as any)('rpc_get_player_loyalty_...', {...})` |
| `rpc_get_loyalty_summary` | `services/loyalty/rollups.ts:140` | **Bypassed** | `(supabase.rpc as any)('rpc_get_loyalty_summary', {...})` |
| Promo RPCs (12 calls) | `services/loyalty/promo/crud.ts` | **Bypassed** | `(supabase.rpc as any)(...)` or `(supabase as any).from(...)` |
| `rpc_create_financial_txn` | `services/player-financial/crud.ts:149` | Typed | `supabase.rpc('rpc_create_financial_txn', {...})` |
| `rpc_create_financial_txn` | `lib/finance.ts:27` | Typed | `supabase.rpc('rpc_create_financial_txn', {...})` |
| `rpc_create_financial_adjustment` | `services/player-financial/http.ts:183` | Typed | `supabase.rpc('rpc_create_financial_adjustment', {...})` |
| `rpc_get_player_timeline` | `services/player360-dashboard/crud.ts:463` | Typed | `supabase.rpc('rpc_get_player_timeline', {...})` |
| `rpc_get_player_timeline` | `services/player-timeline/crud.ts:81` | Typed | `supabase.rpc('rpc_get_player_timeline', {...})` |
| `rpc_compute_table_rundown` | `services/table-context/rundown.ts:78` | Typed | `.rpc('rpc_compute_table_rundown', {...})` |
| `rpc_post_table_drop_total` | `services/table-context/rundown.ts:105` | Typed | `.rpc('rpc_post_table_drop_total', {...})` |
| `rpc_log_table_inventory_snapshot` | `services/table-context/chip-custody.ts:40` | Typed | `supabase.rpc('rpc_log_table_inventory_snapshot', {...})` |
| `rpc_request_table_fill` | `services/table-context/chip-custody.ts:66` | Typed | `supabase.rpc('rpc_request_table_fill', {...})` |
| `rpc_request_table_credit` | `services/table-context/chip-custody.ts:107` | Typed | `supabase.rpc('rpc_request_table_credit', {...})` |
| `rpc_log_table_drop` | `services/table-context/chip-custody.ts:151` | Typed | `supabase.rpc('rpc_log_table_drop', {...})` |
| `compute_gaming_day` | `services/casino/index.ts:191` | Typed | `supabase.rpc('compute_gaming_day', rpcArgs)` |
| `rpc_shift_cash_obs_*` (4) | `services/table-context/shift-cash-obs.ts` | **Bypassed** | `(supabase.rpc as any)('rpc_shift_cash_obs_*', {...})` |
| `rpc_shift_table_metrics` | `services/table-context/shift-metrics/service.ts` | **Bypassed** | `(supabase.rpc as any)('rpc_shift_table_metrics', {...})` |
| `rpc_open/close_table_session` | `services/table-context/table-session.ts:67` | **Bypassed** | `(supabase.rpc as any)(rpcName, params)` |
| `rpc_get_dashboard_stats` | `hooks/dashboard/use-dashboard-stats.ts:73` | **Bypassed** | `(supabase.rpc as any)('rpc_get_dashboard_stats', {...})` |
| `rpc_log_table_buyin_telemetry` | `hooks/table-context/use-buyin-telemetry.ts:93` | Typed | `supabase.rpc('rpc_log_table_buyin_telemetry', {...})` |
| `rpc_get_dashboard_tables_with_counts` | `hooks/dashboard/use-dashboard-tables.ts:58` | Typed | `supabase.rpc('rpc_get_dashboard_tables_with_counts', {...})` |
| `rpc_visitors_summary` | `app/api/v1/shift-dashboards/visitors-summary/route.ts:35` | Typed | `mwCtx.supabase.rpc('rpc_visitors_summary', {...})` |
| `rpc_activate_floor_layout` | `app/api/v1/floor-layout-activations/route.ts:45` | Typed | `mwCtx.supabase.rpc('rpc_activate_floor_layout', {...})` |

**Summary:** ~30 production RPC call sites use `(supabase.rpc as any)` or `(supabase as any)` bypasses. These RPCs now exist in `types/database.types.ts` (staleness resolved). The casts are dead artifacts violating protocol guardrail **G3** and must be removed.

---

## D) Violations List

### HIGH

| # | What violates | Why it's risky | Minimal recommended fix |
|---|--------------|----------------|------------------------|
| H1 | **30+ `(supabase.rpc as any)` casts across loyalty, promo, shift-cash-obs, shift-metrics, table-session, rating-slip, dashboard hooks** | Completely disables type-checking for RPC parameter names, types, and return shapes. Wrong parameter names pass silently. Regressions are invisible until runtime. **These casts are now unnecessary — local types include all RPCs.** | Remove all casts. Investigate any that still fail type-check after removal (indicates wrapper bug or signature mismatch). |
| H2 | **`types/database.types.ts` was stale — RESOLVED** | Local types have been regenerated and now include all RPCs (`rpc_current_gaming_day`, `rpc_gaming_day_range`, `compute_gaming_day_for_casino`, loyalty RPCs, shift RPCs, etc.). Root cause was seed file drift. **However, the 30+ `as any` casts introduced during the drift period remain in the codebase and must be removed.** | Remove all `(supabase.rpc as any)` casts; they are now unnecessary. |
| H3 | **`services/player360-dashboard/mappers.ts:10` imports `Json` from `@/types/remote/database.types`** while every other service file imports from `@/types/database.types` | Mixed type origins can cause subtle structural mismatches if `Json` definitions ever diverge. Violates the codebase rule: "Import from `types/database.types.ts` only." | Change to `import type { Json } from '@/types/database.types'`. |
| H4 | **Parameter ordering drift — RESOLVED** | Was a symptom of S2 staleness. With canonical types regenerated, `rpc_create_financial_txn`, `set_rls_context_from_staff`, and other RPCs now have identical signatures in both type files. | No action needed. |

### MEDIUM

| # | What violates | Why it's risky | Minimal recommended fix |
|---|--------------|----------------|------------------------|
| M1 | **`lib/gaming-day/rpc.ts` uses `as unknown as RemoteClient` bridge — NOW DEAD CODE** | Agent-introduced shim that bridges local→remote types for `rpc_current_gaming_day` and `rpc_gaming_day_range`. Local types now include these RPCs, making this shim unnecessary. Also violates the ban on runtime imports from `types/remote/`. | Delete this file and update `lib/gaming-day/server.ts` to call `supabase.rpc(...)` directly. |
| M2 | **`services/loyalty/__tests__/points-accrual-calculation.integration.test.ts:28` uses absolute path import:** `from '/home/diepulp/projects/pt-2/types/database.types.ts'` | Breaks on any other machine or CI. Non-portable. | Change to `from '@/types/database.types'`. |
| M3 | **`utils/supabase/client.ts` is a duplicate of `lib/supabase/client.ts`** — both export `createBrowserComponentClient()` with identical `Database` typing | Two competing client factories. Risk of importing the wrong one, or of them drifting apart. | Consolidate to a single file. |
| M4 | **6 middleware test files use `{} as any` for Supabase mocks** (`compositor.test.ts`, `tracing.test.ts`, `audit.test.ts`, `idempotency.test.ts`, `rls.test.ts`, `auth.test.ts`) | Untyped mocks don't validate that tests align with the actual `SupabaseClient<Database>` shape. Breaking interface changes pass tests silently. | Use `as unknown as SupabaseClient<Database>` with minimal typed doubles (per QA-003 pattern). |

### LOW

| # | What violates | Why it's risky | Minimal recommended fix |
|---|--------------|----------------|------------------------|
| L1 | **`(navigator as any).userAgentData` in 3 component files** (`player-360-header-content.tsx:198`, `empty-states.tsx:525`, `use-search-keyboard.ts:175`) | Browser API type gap, not a Supabase issue. No runtime risk. | Add a `navigator.d.ts` declaration for `userAgentData` or use `'userAgentData' in navigator` guard. |
| L2 | **`services/loyalty/crud.ts:489` uses `data as any`** for post-query transform | Masks the return type of `rpc_get_player_ledger`. | H2 is resolved (types current). If this cast persists after removing the `as any` on the RPC call itself, it indicates a return-type mismatch to investigate. |
| L3 | **`lib/supabase/server.ts:6` uses value import `import { Database }` instead of `import type { Database }`** | Not a runtime issue (types are erased), but inconsistent with the `import type` pattern used everywhere else. Could cause unnecessary bundling in some setups. | Change to `import type { Database }`. |

---

## E) Recommendation — Align with Staleness Protocol

The [`DB-CONTRACT-STALENESS-PROTOCOL`](dual-type-system/DB-CONTRACT-STALENESS-PROTOCOL.md) is the governing document. This section maps audit findings to protocol remediation.

### Prime directive (from protocol)

> Many DB instances are allowed. Only one schema contract exists: **migrations → canonical types.**

- **Schema authority:** `supabase/migrations/`
- **Canonical runtime types:** `types/database.types.ts` (only import target in runtime code)
- **Remote DB:** deployment target (must match migrations)
- **Local DB instances:** disposable mirrors (valid only after applying migrations)
- **Types do not choose environment. Env/config chooses environment.**

### Scripts (no changes needed)

The current `package.json` scripts align with the protocol's tooling standards:

```jsonc
// Canonical generation (protocol §4 — preferred, migrations-first)
"db:types-local": "npx supabase gen types typescript --local --schema public > types/database.types.ts"

// Remote snapshot (protocol §4 — CI validation artifact only)
"db:types": "npx supabase gen types typescript --project-id vaicxfihdldgepzryhpd --schema public > types/remote/database.types.ts"
```

> **Note:** The protocol's remediation playbook (§3 Step 2) references `npm run db:types` generically. In this project, the canonical generator is `db:types-local`. Consider aliasing `db:types` → canonical generation for clarity, or updating the protocol step to reference `db:types-local` explicitly.

### Protocol guardrails to enforce (§5)

The protocol defines three guardrails. This audit found violations of all three:

| Guardrail | Protocol rule | Violations found in this audit |
|-----------|--------------|-------------------------------|
| **G1** — Single canonical import | Runtime code imports only from `@/types/database.types` | `lib/gaming-day/rpc.ts:14` imports remote types; `services/player360-dashboard/mappers.ts:10` imports `Json` from remote |
| **G2** — No type-system mixing | No remote/local imports, no multiple `Database` types in runtime | `lib/gaming-day/rpc.ts` defines `RemoteClient` type alias from remote `Database` |
| **G3** — No casts around `.rpc(...)` | No `as any`, `as unknown as`, `@ts-ignore` to bypass RPC typing | 30+ files with `(supabase.rpc as any)` — all now unnecessary |

### Cast removal expectation

Canonical types are current. **Most** of the 30+ `(supabase.rpc as any)` casts are immediately removable. Remaining casts after removal indicate one of:

- A wrapper typing bug (generic suppression in a factory or helper)
- An RPC signature mismatch (DB function exists but generated types don't match the call-site parameters)
- A table/view added outside migration flow

Each remaining cast must be investigated individually rather than assumed safe.

### Remediation actions (protocol §3 Step 4 — remove temporary bypasses)

| Priority | File | Action | Protocol ref |
|----------|------|--------|-------------|
| **P0** | `lib/gaming-day/rpc.ts` | Delete shim — canonical types now include `rpc_current_gaming_day` and `rpc_gaming_day_range`. Update `lib/gaming-day/server.ts` to call `supabase.rpc(...)` directly. | G1, G2 |
| **P0** | 30+ files with `(supabase.rpc as any)` | Remove casts — canonical types now have all RPCs. Investigate any that still fail type-check after removal. | G3 |
| **P1** | `services/player360-dashboard/mappers.ts:10` | Change `from '@/types/remote/database.types'` to `from '@/types/database.types'` | G1 |
| **P2** | `services/loyalty/__tests__/points-accrual-calculation.integration.test.ts:28` | Change absolute path to `'@/types/database.types'` | Portability |
| **P2** | `lib/supabase/server.ts:6` | Change `import { Database }` to `import type { Database }` | Consistency |
| **P2** | 6 middleware test files | Replace `{} as any` mocks with typed doubles per QA-003 | G3 (test code) |
| **P3** | `utils/supabase/client.ts` | Consolidate with `lib/supabase/client.ts` or remove | Deduplication |

### Regression prevention (CI gates for protocol guardrails)

| Gate | Enforces | When to run |
|------|----------|-------------|
| Grep/lint ban: `from '@/types/remote/` in `app/ services/ hooks/ lib/ components/ utils/` | **G1** — single canonical import | Every PR |
| Grep/lint ban: `(supabase.rpc as any)` and `(supabase as any)` in runtime code | **G3** — no RPC typing bypasses | Every PR |
| `npm run type-check` (strict) | Compile-time RPC parameter validation | Every PR |
| Remote snapshot diff: generate + compare RPC signatures | Detect local/remote schema divergence (S1 early warning) | After any migration |
| Protocol DoD checklist (§6) | All schema changes follow full lifecycle | PR review |
