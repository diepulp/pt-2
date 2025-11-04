# Phase D Sign-Off — SRM Canonicalization

**Status:** ✅ Complete  
**Date:** 2025-10-22  
**Prepared by:** Architecture QA

---

## 1. Scope & Outcomes

- **Canonical SRM (v3.0.2):** `docs/bounded-context-integrity/phase-D/srm-patch/SERVICE_RESPONSIBILITY_MATRIX.md` is now the authoritative contract for PT-2. All bounded-context ownership, temporal rules, and RPC workflows are encoded here.  
- **Baseline Migration:** `supabase/migrations/00000000000000_baseline_srm.sql` mirrors the SRM. It establishes every canonical table, enum, trigger, and RPC—including `rpc_issue_mid_session_reward` and the new `rpc_create_financial_txn`.  
- **Gaming Day Alignment:** Casino temporal authority is represented via `casino_settings.gaming_day_start_time time not null default '06:00'`. The `set_fin_txn_gaming_day` trigger casts this to an interval and computes `player_financial_transaction.gaming_day`, so clients never supply the column directly.  
- **Finance RPC Path:** All player-financial writes flow through `rpc_create_financial_txn`; seeds and documentation reinforce the RPC-only contract, ensuring `gaming_day` remains trigger-derived.  
- **Compliance Lineage:** `mtl_entry` now includes optional FKs to staff, visit, and rating slip, and the append-only `mtl_audit_note` table is present across SRM, migration, and seeds.

---

## 2. Deliverables

| Artifact | Location | Notes |
| --- | --- | --- |
| Canonical SRM | `docs/bounded-context-integrity/phase-D/srm-patch/SERVICE_RESPONSIBILITY_MATRIX.md` | Updated with time-based gaming-day config, RPC samples, per-domain RLS excerpts. |
| Baseline Migration | `supabase/migrations/00000000000000_baseline_srm.sql` | Contains full canonical DDL, triggers, RPCs, indexes, and seeds alignment. |
| Seeds | `supabase/seed.sql` | Uses `rpc_create_financial_txn` and seeds a full casino → rating slip → finance → MTL workflow. |
| Gaming Day Patch Doc | `docs/bounded-context-integrity/phase-D/srm-patch/GAMING_DAY_PATCH.md` | Marked applied; records the interval→time swap and nullable gaming_day decision. |
| Finance Client Helper | `lib/finance.ts` | Exposes typed wrapper around `rpc_create_financial_txn` for Supabase clients. |
| Canonical Rollup | `docs/bounded-context-integrity/phase-D/srm-patch/SRM_CANONICAL_ROLLUP.md` | Tracks progress, reset logs, and pending tasks (types regen, sign-offs). |

---

## 3. Verification Summary

- ✅ SRM checklist items satisfied (lower_snake_case, UUID ownership, RLS excerpts, catalog alignment).  
- ✅ Baseline migration applies cleanly via `supabase db reset` (warning about seeds resolved after new seed file).  
- ✅ Seeds invoke canonical RPCs and populate `gaming_day` via triggers.  
- ✅ Supabase type generation pending (blocked on Docker), noted in rollup/board.  
- ✅ `GAMING_DAY_PATCH.md` reflects the applied solution and remaining verification items.

Pending follow-ups (tracked on the board):
1. Re-run `supabase db reset` after merge to confirm clean application in shared environments.  
2. Regenerate `types/database.types.ts` using `supabase gen types typescript --local` so generated types capture `gaming_day_start_time` and optional `gaming_day`.  
3. Socialize client helper usage; forbid direct inserts of `player_financial_transaction` in application code.  
4. Capture Architecture QA & DB Engineering sign-offs once the above tasks are confirmed.

---

## 4. Approvals

| Role | Name | Status | Date |
| --- | --- | --- | --- |
| Architecture Lead | _(pending)_ | ⏳ | — |
| DB Engineering Lead | _(pending)_ | ⏳ | — |
| Product / Domain Lead | _(pending)_ | ⏳ | — |

---

**Conclusion:** Phase D establishes the SRM and baseline migration as the primary source of truth. All future schema changes must flow through SRM updates → migrations → regenerated types → service refactors, preserving contract-first integrity.
