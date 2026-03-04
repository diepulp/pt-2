---
prd: PRD-041
prd_title: "ADR-024 P2 Validate-to-Derive Remediation"
service: SecurityRemediation
mvp_phase: 1

workstreams:
  WS1:
    name: Quick Wins Migration (P2-3, P2-4, P2-5)
    description: "REVOKE chipset_total_cents from anon, normalize 8 denial policies, add WITH CHECK to player_tag UPDATE"
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - supabase/migrations/YYYYMMDDHHMMSS_prd041_quick_wins_p2_3_4_5.sql
    gate: build
    estimated_complexity: low

  WS2:
    name: RatingSlip Validate-to-Derive (Phase A)
    description: "Remove p_casino_id from 4 RatingSlip RPCs, update 4 TS callsites + tests"
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - supabase/migrations/YYYYMMDDHHMMSS_prd041_phase_a_ratingslip_derive.sql
      - services/rating-slip/crud.ts
      - services/rating-slip-modal/rpc.ts
    gate: build
    estimated_complexity: medium

  WS3:
    name: TableContext Validate-to-Derive (Phase B)
    description: "Remove p_casino_id from 5 TableContext RPCs, update 4 TS callsites + tests (rpc_update_table_status has 0 production callsites)"
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS2]
    outputs:
      - supabase/migrations/YYYYMMDDHHMMSS_prd041_phase_b_tablecontext_derive.sql
      - services/table-context/chip-custody.ts
    gate: build
    estimated_complexity: medium

  WS4:
    name: Player Validate-to-Derive (Phase C)
    description: "Remove p_casino_id from rpc_create_player, update 1 TS callsite + tests"
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS3]
    outputs:
      - supabase/migrations/YYYYMMDDHHMMSS_prd041_phase_c_player_derive.sql
      - services/player/crud.ts  # Callsite-only: remove p_casino_id arg (PlayerService ownership)
    gate: build
    estimated_complexity: low

  WS5:
    name: FloorLayout Validate-to-Derive (Phase D)
    description: "Remove p_casino_id from 2 FloorLayout RPCs, update 2 route handler callsites + tests"
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS4]
    outputs:
      - supabase/migrations/YYYYMMDDHHMMSS_prd041_phase_d_floorlayout_derive.sql
      - app/api/v1/floor-layouts/route.ts
      - app/api/v1/floor-layout-activations/route.ts
    gate: build
    estimated_complexity: low

  WS6:
    name: CI Gate Hardening (POST-SHIP)
    description: "POST-SHIP: Upgrade SEC-003 p_casino_id path from notice-only to hard-fail with allowlist for known-deferred RPCs, add p_created_by_staff_id as NOTICE-level detection, then run the full security gate suite"
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS2, WS3, WS4, WS5]
    outputs:
      - supabase/tests/security/03_identity_param_check.sql
    gate: test-pass
    estimated_complexity: low
    deferred: true

  WS7:
    name: P2-2 Delegation Documentation (DEFERRED)
    description: "Record business owner + follow-up path for rpc_create_financial_txn.p_created_by_staff_id delegation decision"
    executor: lead-architect
    executor_type: skill
    depends_on: []
    outputs:
      - docs/issues/gaps/sec-007/GAP-SEC007-P2-BACKLOG-ADR024-COMPLIANCE.md
    gate: documentation
    deferred: true

execution_phases:
  - name: "Phase 1 — Quick Wins"
    parallel: [WS1]
    gates: [build]

  - name: "Phase 2 — RatingSlip Migration"
    parallel: [WS2]
    gates: [build]

  - name: "Phase 3 — TableContext Migration"
    parallel: [WS3]
    gates: [build]

  - name: "Phase 4 — Player Migration"
    parallel: [WS4]
    gates: [build]

  - name: "Phase 5 — FloorLayout Migration"
    parallel: [WS5]
    gates: [build]

  # WS6 is POST-SHIP hardening and intentionally excluded from ship gating.
  # Release phases = WS1–WS5 only; WS6 happens after ship.

gates:
  build:
    command: "npm run db:types-local && npm run type-check && npm run build"
    success_criteria: "Exit code 0 for all three commands"

  test-pass:  # POST-SHIP only — used by WS6 after release; not part of ship gating
    command: "npm run db:types-local && npm run type-check && npm run build && ./supabase/tests/security/run_all_gates.sh"
    success_criteria: "Exit code 0; build passes and the full security gate suite passes on the remediated schema"

  documentation:
    command: "rg -n \"P2-2 delegation\" docs/issues/gaps/sec-007/GAP-SEC007-P2-BACKLOG-ADR024-COMPLIANCE.md"
    success_criteria: "Command locates the documented owner + follow-up instructions for the deferred rpc_create_financial_txn decision"

external_dependencies:
  - prd: EXEC-040
    service: SEC-007
    required_for: "P0/P1 remediation complete (commit 9ee2850)"

risks:
  - risk: "Parallel WS4+WS5 share database.types.ts via db:types-local"
    mitigation: "Spec enforces sequential Phase 4 → Phase 5 execution plus WS5 depends on WS4, so migrations/types regen run in order before any concurrent TS edits"
  - risk: "Phantom overload if DROP misses old signature"
    mitigation: "Each migration uses explicit DROP with full old param list before CREATE"
  - risk: "Missed callsite causes runtime error after migration"
    mitigation: "TypeScript compiler catches all mismatches after type regeneration"
  - risk: "SEC-003 hard-fail blocks on out-of-scope RPCs that still have p_casino_id"
    mitigation: "WS6 uses an explicit allowlist for known-deferred RPCs; only NEW violations hard-fail"
  - risk: "DB migration deploys before app code — brief window where old app sends p_casino_id to new RPC"
    mitigation: "Phased rollout limits exposure to one bounded context; window is seconds-to-minutes per phase"
  - risk: "pg_temp in search_path enables temp function shadowing in SECURITY DEFINER RPCs"
    mitigation: "Template mandates SET search_path = pg_catalog, public — no pg_temp"
---

# EXEC-041: PRD-041 — ADR-024 P2 Validate-to-Derive Remediation

## Overview

Remove `p_casino_id` validate-pattern parameters from 12 RPCs across 4 bounded contexts
(RatingSlip, TableContext, Player, FloorLayout) and cascade the change to 11 production
TypeScript callsites. Additionally resolve 3 quick-win compliance gaps (grant tightening,
denial policy normalization, WITH CHECK addition). Final phase hardens SEC-003 to
hard-fail with an allowlist for known-deferred RPCs, and validates the full security gate
suite on the remediated schema.

All RPCs already call `set_rls_context_from_staff()` and derive `casino_id` from
`current_setting('app.casino_id')`. In the current branch baseline, `p_casino_id` is the
only remaining identity parameter on these 12 RPCs. The only change is removing that
redundant parameter and the validate-block that checks it against the derived value.

**P2-2 (delegation decision on `rpc_create_financial_txn` `p_created_by_staff_id`)** is
deferred — requires business input and does not block WS1–WS6.

## Scope

- **In Scope**: 12 RPC `p_casino_id` parameter removals, 11 TS callsite updates, 3 quick-win migrations, CI gate hardening with allowlist
- **Out of Scope**: Track B migration (ADR-020), service_role-only RPCs, RPC body logic changes, new features
- **Known remaining INV-8 gaps (deferred)**: `rpc_create_financial_txn.p_created_by_staff_id` (P2-2) remains unresolved pending business input. `rpc_get_dashboard_tables_with_counts` also accepts `p_casino_id` (SECURITY INVOKER — lower risk, RLS applies). Additional RPCs with `p_casino_id` outside the P2-1 list (see SEC-003 allowlist in WS6) will be surfaced by the zero-tolerance gate after this spec ships. The 12 in-scope RPCs were rebaselined against the current ADR-024 canonical state; their stale actor params were already removed in prior migrations and are not part of this execution slice.

## Architecture Context

- **ADR-024**: Authoritative context derivation — INV-8 prohibits `p_casino_id` on client-callable RPCs
- **ADR-018**: SECURITY DEFINER governance — REVOKE/GRANT boilerplate required
- **ADR-015**: Connection pooling — self-injection pattern already in place
- **SEC-007**: Tenant isolation audit — P0/P1 complete, P2 deferred to this spec

## Current Baseline

- **Canonical rebaseline source**: `20251231072655_adr024_security_definer_rpc_remediation.sql`
- **Legacy overload cleanup**: `20251231093000_drop_legacy_adr024_rpc_signatures.sql`
- **Phantom overload cleanup**: `20260302230020_drop_sec007_p0_phantom_overloads.sql`

Implementation must use the exact current signature from the latest defining migration for
each RPC. Do not use the original creation migrations as the DROP baseline. The
rebaseline consensus report (`EXEC-041-rebaseline-consensus-report.md`) identified that
using stale signatures here creates phantom overloads on 8 of 12 RPCs.

## Preflight Inventory

Before authoring any WS2-WS5 migration, perform and record a fresh inventory against the
current branch state:

1. **Production callsite inventory**: grep/ripgrep for the 12 in-scope RPC names across
   `services/`, `app/`, `hooks/`, and `lib/` to confirm the current production callsite set
   still matches this spec before editing TypeScript callsites.
2. **Test callsite inventory**: grep/ripgrep for the same 12 RPC names across test files to
   capture the direct integration/unit test blast radius before editing or pruning assertions.
3. **Live signature snapshot**: query `pg_get_function_arguments` (or equivalent catalog
   introspection) for each in-scope RPC and capture the exact current argument list before
   writing `DROP FUNCTION IF EXISTS ...`; this snapshot is the execution-time source of truth
   if it differs from historical migrations.

Recommended local checks:

```bash
rg -n "rpc_(pause_rating_slip|resume_rating_slip|close_rating_slip|move_player|update_table_status|log_table_drop|log_table_inventory_snapshot|request_table_credit|request_table_fill|create_player|create_floor_layout|activate_floor_layout)" services app hooks lib --glob '*.{ts,tsx}'
```

```bash
rg -n "rpc_(pause_rating_slip|resume_rating_slip|close_rating_slip|move_player|update_table_status|log_table_drop|log_table_inventory_snapshot|request_table_credit|request_table_fill|create_player|create_floor_layout|activate_floor_layout)" . --glob '*test*.ts' --glob '*test*.tsx'
```

```sql
SELECT
  p.proname,
  pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'rpc_pause_rating_slip',
    'rpc_resume_rating_slip',
    'rpc_close_rating_slip',
    'rpc_move_player',
    'rpc_update_table_status',
    'rpc_log_table_drop',
    'rpc_log_table_inventory_snapshot',
    'rpc_request_table_credit',
    'rpc_request_table_fill',
    'rpc_create_player',
    'rpc_create_floor_layout',
    'rpc_activate_floor_layout'
  )
ORDER BY p.proname;
```

---

## Workstream Details

### WS1: Quick Wins Migration (P2-3, P2-4, P2-5)

**Purpose**: Resolve 3 small compliance gaps that require SQL-only changes (no TS impact).

**Single migration file** containing:

**P2-3 — REVOKE `chipset_total_cents` from anon:**
```sql
REVOKE ALL ON FUNCTION chipset_total_cents(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION chipset_total_cents(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION chipset_total_cents(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION chipset_total_cents(jsonb) TO service_role;
```
Source: `supabase/migrations/20260114003537_chipset_total_cents_helper.sql` (line 102 grants anon)

**P2-4 — Normalize 8 denial policies:**
Replace bare `USING (false)` with `USING (auth.uid() IS NOT NULL AND false)` on:

| # | Policy Name | Table | Source Migration |
|---|------------|-------|-----------------|
| 1 | `loyalty_ledger_deny_update` | loyalty_ledger | `20251213003000_prd004_loyalty_service_schema.sql:226` |
| 2 | `loyalty_ledger_deny_delete` | loyalty_ledger | `20251213003000_prd004_loyalty_service_schema.sql:233` |
| 3 | `player_identity_no_delete` | player_identity | `20251225003922_adr022_player_identity_mvp.sql:167` |
| 4 | `promo_program_no_delete` | promo_program | `20260106235611_loyalty_promo_instruments.sql:188` |
| 5 | `promo_coupon_no_delete` | promo_coupon | `20260106235611_loyalty_promo_instruments.sql:238` |
| 6 | `player_note_deny_update` | player_note | `20260121145501_adr029_player_note_table.sql:76` |
| 7 | `player_note_deny_delete` | player_note | `20260121145501_adr029_player_note_table.sql:80` |
| 8 | `player_tag_deny_delete` | player_tag | `20260121145502_adr029_player_tag_table.sql:104` |

Pattern:
```sql
DROP POLICY IF EXISTS {policy_name} ON {table};
CREATE POLICY {policy_name} ON {table}
  FOR {UPDATE|DELETE} USING (auth.uid() IS NOT NULL AND false);
```

**P2-5 — Add WITH CHECK to `player_tag` UPDATE:**

IMPORTANT: Copy the existing USING clause verbatim from the source migration (`20260121145502_adr029_player_tag_table.sql:89-100`). Only ADD the WITH CHECK clause. The USING clause uses `COALESCE(NULLIF(current_setting(...)), jwt)` for both `casino_id` and `staff_role`.

```sql
DROP POLICY IF EXISTS player_tag_update ON player_tag;
CREATE POLICY player_tag_update ON player_tag
  FOR UPDATE USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((SELECT current_setting('app.staff_role', true)), ''),
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

**Acceptance Criteria:**
- [ ] `has_function_privilege('anon', 'chipset_total_cents(jsonb)', 'EXECUTE')` returns false
- [ ] All 8 denial policies include `auth.uid() IS NOT NULL` prefix
- [ ] `player_tag` UPDATE policy has non-null WITH CHECK clause
- [ ] `npm run db:types-local && npm run type-check && npm run build` passes

---

### WS2: RatingSlip Validate-to-Derive (Phase A)

**Purpose**: Remove `p_casino_id` from 4 RatingSlip RPCs and cascade to 4 TS callsites.

**RPCs (migration — DROP old + CREATE new):**

| RPC | Current Signature (DROP target) | New Signature |
|-----|--------------|---------------|
| `rpc_pause_rating_slip` | `(p_casino_id UUID, p_rating_slip_id UUID)` | `(p_rating_slip_id UUID)` |
| `rpc_resume_rating_slip` | `(p_casino_id UUID, p_rating_slip_id UUID)` | `(p_rating_slip_id UUID)` |
| `rpc_close_rating_slip` | `(p_casino_id UUID, p_rating_slip_id UUID, p_average_bet NUMERIC DEFAULT NULL)` | `(p_rating_slip_id UUID, p_average_bet NUMERIC DEFAULT NULL)` |
| `rpc_move_player` | `(p_casino_id UUID, p_slip_id UUID, p_new_table_id UUID, p_new_seat_number TEXT DEFAULT NULL, p_average_bet NUMERIC DEFAULT NULL)` | `(p_slip_id UUID, p_new_table_id UUID, p_new_seat_number TEXT DEFAULT NULL, p_average_bet NUMERIC DEFAULT NULL)` |

Source migration: `20251231072655_adr024_security_definer_rpc_remediation.sql` (pause/resume),
`20260129100000_perf005_close_rpc_inline_duration.sql` (close),
`20260114022828_add_seat_number_validation.sql` (move_player)

**Migration pattern per RPC:**
1. `DROP FUNCTION IF EXISTS public.{rpc}({old_params});` — MUST enumerate exact parameter type list from source migration to avoid phantom overloads
2. `CREATE OR REPLACE FUNCTION {rpc}({new_params})` — remove `p_casino_id` from the signature, remove the validate-block, and replace all remaining in-body `p_casino_id` references with the derived context variable while preserving `set_rls_context_from_staff()` + derive pattern
3. `REVOKE ALL ON FUNCTION {rpc}({new_params}) FROM PUBLIC;`
4. `GRANT EXECUTE ON FUNCTION {rpc}({new_params}) TO authenticated, service_role;`
5. `NOTIFY pgrst, 'reload schema';`
6. Verify: `SELECT count(*) FROM pg_proc WHERE proname = '{rpc}' AND pronamespace = 'public'::regnamespace` = 1 (no phantom overloads)

**TS callsite cascade:**

| File | Callsite Count | Change |
|------|---------------|--------|
| `services/rating-slip/crud.ts` | 3 | Remove `p_casino_id` from `rpc_pause_rating_slip` (L220), `rpc_resume_rating_slip` (L253), `rpc_close_rating_slip` (L289). **Do NOT touch** `rpc_start_rating_slip` (L181) — out of scope. |
| `services/rating-slip-modal/rpc.ts` | 1 | Remove `p_casino_id` from `rpc_move_player` (L365). **Do NOT touch** `rpc_get_rating_slip_modal_data` (L148) — out of scope. |

**WARNING:** `services/visit/crud.ts` contains 3 `p_casino_id` references (L490, L550, L694), but ALL are for out-of-scope RPCs (`rpc_get_player_recent_sessions`, `rpc_get_player_last_session_context`, `rpc_start_rating_slip`). **Do NOT modify this file.**

**Test updates:** `services/rating-slip/__tests__/*`, `services/visit/__tests__/*`, `lib/supabase/__tests__/rls-pooling-safety.integration.test.ts` (8 direct `.rpc()` calls for in-scope RPCs with `p_casino_id`)

**Acceptance Criteria:**
- [ ] All 4 RPCs lack `p_casino_id` in `pg_proc.proargnames`
- [ ] `npm run db:types-local && npm run type-check && npm run build` passes
- [ ] No `p_casino_id` in production TS files for these 4 RPCs
- [ ] Affected tests pass with updated callsites

---

### WS3: TableContext Validate-to-Derive (Phase B)

**Purpose**: Remove `p_casino_id` from 5 TableContext RPCs and cascade to 4 TS callsites.

**RPCs (migration — DROP old + CREATE new):**

| RPC | Current Params (DROP target) | Removed | Source Migration |
|-----|-----------|---------|-----------------|
| `rpc_update_table_status` | `(p_casino_id, p_table_id, p_new_status)` | `p_casino_id` | `20251231072655_adr024_security_definer_rpc_remediation.sql` |
| `rpc_log_table_drop` | `(p_casino_id, p_table_id, p_drop_box_id, p_seal_no, p_witnessed_by, p_removed_at, p_delivered_at, p_delivered_scan_at, p_gaming_day, p_seq_no, p_note)` | `p_casino_id` | `20251231072655_adr024_security_definer_rpc_remediation.sql` |
| `rpc_log_table_inventory_snapshot` | `(p_casino_id, p_table_id, p_snapshot_type, p_chipset, p_verified_by, p_discrepancy_cents, p_note)` | `p_casino_id` | `20251231072655_adr024_security_definer_rpc_remediation.sql` |
| `rpc_request_table_credit` | `(p_casino_id, p_table_id, p_chipset, p_amount_cents, p_sent_by, p_received_by, p_slip_no, p_request_id)` | `p_casino_id` | `20260224123752_prd038_modify_fill_credit_rpcs.sql` |
| `rpc_request_table_fill` | `(p_casino_id, p_table_id, p_chipset, p_amount_cents, p_delivered_by, p_received_by, p_slip_no, p_request_id)` | `p_casino_id` | `20260224123752_prd038_modify_fill_credit_rpcs.sql` |

**TS callsite cascade:**

| File | Callsite Count | Change |
|------|---------------|--------|
| `services/table-context/chip-custody.ts` | 4 | Remove `p_casino_id` from `rpc_log_table_inventory_snapshot` (L62), `rpc_request_table_fill` (L86), `rpc_request_table_credit` (L125), `rpc_log_table_drop` (L167) |

**NOTE:** `rpc_update_table_status` has **zero production TS callsites** — the migration is still required for ADR-024 compliance, but there is no TypeScript cascade for this RPC. After `db:types-local`, the generated types will update; since nobody calls this RPC from TS, no callsite change is needed.

**Test updates:** `services/table-context/__tests__/*`

**Acceptance Criteria:**
- [ ] All 5 RPCs lack `p_casino_id` in `pg_proc.proargnames`
- [ ] `npm run db:types-local && npm run type-check && npm run build` passes
- [ ] No `p_casino_id` in production TS files for these 5 RPCs

---

### WS4: Player Validate-to-Derive (Phase C)

**Purpose**: Remove `p_casino_id` from `rpc_create_player` and cascade to 1 TS callsite.

**RPC:**

| RPC | Current Signature (DROP target) | New Signature |
|-----|--------------|---------------|
| `rpc_create_player` | `(p_casino_id uuid, p_first_name text, p_last_name text, p_birth_date date DEFAULT NULL)` | `(p_first_name text, p_last_name text, p_birth_date date DEFAULT NULL)` |

Source migration: `20251231072655_adr024_security_definer_rpc_remediation.sql`

**TS callsite cascade:**

| File | Callsite Count | Change |
|------|---------------|--------|
| `services/player/crud.ts` | 1 (line ~141) | Remove `p_casino_id: input.casino_id` from `.rpc()` args |

**Test updates:** `services/player/__tests__/*`

**Acceptance Criteria:**
- [ ] `rpc_create_player` lacks `p_casino_id` in `pg_proc.proargnames`
- [ ] `npm run db:types-local && npm run type-check && npm run build` passes

---

### WS5: FloorLayout Validate-to-Derive (Phase D)

**Purpose**: Remove `p_casino_id` from 2 FloorLayout RPCs and cascade to 2 route handler callsites.

**RPCs:**

| RPC | Current Signature (DROP target) | New Signature |
|-----|--------------|---------------|
| `rpc_create_floor_layout` | `(p_casino_id uuid, p_name text, p_description text)` | `(p_name text, p_description text)` |
| `rpc_activate_floor_layout` | `(p_casino_id uuid, p_layout_version_id uuid, p_request_id text)` | `(p_layout_version_id uuid, p_request_id text)` |

Source migration: `20251231072655_adr024_security_definer_rpc_remediation.sql`

**TS callsite cascade:**

| File | Callsite Count | Change |
|------|---------------|--------|
| `app/api/v1/floor-layouts/route.ts` | 1 | Remove `p_casino_id` from `.rpc()` args |
| `app/api/v1/floor-layout-activations/route.ts` | 1 | Remove `p_casino_id` from `.rpc()` args |

**Test updates:** FloorLayout-related test files

**Acceptance Criteria:**
- [ ] Both RPCs lack `p_casino_id` in `pg_proc.proargnames`
- [ ] `npm run db:types-local && npm run type-check && npm run build` passes

---

### WS6: CI Gate Hardening (POST-SHIP)

**Purpose**: Upgrade SEC-003 from notice-only to hard-fail on `p_casino_id` with an allowlist
for known-deferred RPCs, add `p_created_by_staff_id` as NOTICE-level detection, then run the
full security gate suite against the remediated schema.

**Changes:**

1. **SEC-003** (`supabase/tests/security/03_identity_param_check.sql`):
   - Change `p_casino_id` detection from non-fatal notice output to `RAISE EXCEPTION`
   - **Add allowlist** for RPCs with known-deferred `p_casino_id` that are outside EXEC-041 scope:
     ```sql
     v_casino_id_allowlist text[] := ARRAY[
       'rpc_create_financial_txn',
       'rpc_create_financial_adjustment',
       'rpc_issue_mid_session_reward',
       'rpc_start_rating_slip',
       'rpc_get_player_recent_sessions',
       'rpc_get_player_last_session_context',
       'rpc_get_rating_slip_modal_data',
       'rpc_compute_gaming_day',
       'rpc_apply_mid_session_reward',
       'rpc_get_dashboard_tables_with_counts'
     ];
     ```
   - Allowlisted RPCs emit `RAISE NOTICE` (not EXCEPTION). Any NEW `rpc_*` function with
     `p_casino_id` that is NOT in the allowlist produces `RAISE EXCEPTION` (hard fail).
   - **Add `p_created_by_staff_id` detection** as NOTICE-level warning (INV-8 identity param,
     deferred pending business decision on delegation use case):
     ```sql
     IF v_args ILIKE '%p_created_by_staff_id%' THEN
       RAISE NOTICE 'DEFERRED: % has p_created_by_staff_id (P2-2 pending business input)', rec.proname;
     END IF;
     ```

2. **SEC-004** (`supabase/tests/security/04_public_execute_check.sql`):
   - No code change required for this workstream: the gate already scopes to `rpc_*` PUBLIC/anon grants
   - Verify it still passes unchanged as part of `supabase/tests/security/run_all_gates.sh`
   - Validate `chipset_total_cents` grant tightening separately via WS1 direct privilege assertions, since it is a helper function outside SEC-004's `rpc_*` scan

**Acceptance Criteria:**
- [ ] SEC-003 raises EXCEPTION for any NEW `rpc_*` with `p_casino_id` not in the allowlist
- [ ] SEC-003 emits NOTICE (not EXCEPTION) for allowlisted RPCs with known-deferred `p_casino_id`
- [ ] SEC-003 emits NOTICE for `rpc_create_financial_txn`'s `p_created_by_staff_id`
- [ ] `./supabase/tests/security/run_all_gates.sh` passes on the remediated local schema
- [ ] `npm run db:types-local && npm run type-check && npm run build` passes

---

### WS7: P2-2 Delegation Documentation (DEFERRED)

**Status**: Blocked on business input — does not gate WS1–WS6 execution, but the deferral
documentation must exist before the release is marked complete.

**Question**: Is `p_created_by_staff_id` on `rpc_create_financial_txn` legitimate delegation
("supervisor records on behalf of staff") or should it derive from `app.actor_id`?

**Outputs**:
- `docs/issues/gaps/sec-007/GAP-SEC007-P2-BACKLOG-ADR024-COMPLIANCE.md` updated with:
  - the named Product / Business owner for the decision,
  - the follow-up vehicle (PRD/ADR/issue) and target date, and
  - the explicit statement that P2-2 remains deferred from PRD-041.

**If delegation is NOT legitimate**: Remove parameter via a subsequent migration owned by
the follow-up spec (out of scope for PRD-041).
**If delegation IS legitimate**: Document the approved exception and ADR linkage inside the
same gap doc entry.

**Owner**: Product / Business
**Deadline**: Post-ship (does not block this EXEC-SPEC, but DoD enforcement requires the documentation)

**Acceptance Criteria:**
- [ ] Gap doc entry for P2-2 names the decision owner, articulates the validation path, and
      references the tracking artifact for the post-ship remediation decision.

---

## Implementation Notes

### Migration Pattern (all WS2–WS5 workstreams)

Each RPC follows this exact pattern. The DROP target must match the exact current live
signature from the latest defining migration for that RPC, not the original creation
migration. The rebaseline consensus report is the authoritative map for WS2-WS5.

```sql
-- Step 1: DROP old signature (with p_casino_id)
DROP FUNCTION IF EXISTS public.rpc_example(UUID, TEXT, ...);

-- Step 2: CREATE new signature (without p_casino_id)
CREATE OR REPLACE FUNCTION rpc_example(p_other_param TEXT, ...)
RETURNS ...
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id UUID;
BEGIN
  PERFORM set_rls_context_from_staff();
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  -- MANDATORY: defense-in-depth NULL check.
  -- Do NOT remove even though set_rls_context_from_staff() also validates.
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not available';
  END IF;

  -- Replace all former p_casino_id references with v_casino_id.
  -- Business logic is otherwise unchanged.
END;
$$;

-- Step 3: Grant posture (ADR-018 / EXEC-040 INV-1)
REVOKE ALL ON FUNCTION rpc_example(TEXT, ...) FROM PUBLIC;
REVOKE ALL ON FUNCTION rpc_example(TEXT, ...) FROM anon;
GRANT EXECUTE ON FUNCTION rpc_example(TEXT, ...) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_example(TEXT, ...) TO service_role;
NOTIFY pgrst, 'reload schema';
```

### TypeScript Cascade Pattern

After `npm run db:types-local`, the compiler flags all callsites where `p_casino_id` is still passed:

```typescript
// BEFORE (non-compliant)
const { data, error } = await supabase.rpc('rpc_example', {
  p_casino_id: casinoId,    // ← Remove this line
  p_other_param: value,
});

// AFTER (ADR-024 compliant)
const { data, error } = await supabase.rpc('rpc_example', {
  p_other_param: value,
});
```

### Type Regeneration Sequencing

WS4 and WS5 now run as back-to-back phases to keep `database.types.ts` deterministic:
1. Execute WS4 migration and immediately run the Phase 4 build gate (`npm run db:types-local && npm run type-check && npm run build`)
2. Update WS4 TS callsites/tests
3. After WS4 passes its gate, execute WS5 migration
4. Run the Phase 5 build gate (regenerates types again, then type-check + build)
5. Update WS5 TS callsites/tests

---

## Definition of Done

- [ ] All 12 RPCs lack `p_casino_id` in `pg_proc.proargnames` (G1)
- [ ] Zero `p_casino_id` matches in production TS files **for the 12 in-scope RPCs** (G2). Out-of-scope RPCs (`rpc_start_rating_slip`, `rpc_get_player_recent_sessions`, `rpc_get_player_last_session_context`, `rpc_get_rating_slip_modal_data`, `rpc_compute_gaming_day`, `rpc_create_financial_txn`, loyalty RPCs, `rpc_get_dashboard_tables_with_counts`) retain `p_casino_id` — do NOT remove.
- [ ] Zero `p_casino_id` matches in test files **for the 12 in-scope RPCs only**. Test callsites for out-of-scope RPCs (e.g., `rpc_start_rating_slip` in `services/visit/__tests__/*`) must NOT be modified.
- [ ] Build gate passes (`npm run db:types-local`, `npm run type-check`, `npm run build`)

### Post-ship (Recommended Hardening)

- [ ] (WS6) Upgrade SEC-003 identity-param check from NOTICE-only to hard-fail with allowlist for known-deferred/out-of-scope RPCs.
- [ ] (WS6) `./supabase/tests/security/run_all_gates.sh` passes on the remediated schema after WS6 lands.

- [ ] `chipset_total_cents` revoked from anon (G5)
- [ ] 8 denial policies normalized with `auth.uid() IS NOT NULL` (G6)
- [ ] `player_tag` UPDATE has WITH CHECK clause (G7)
- [ ] `npm run db:types-local && npm run type-check && npm run build` passes (G8)
- [ ] All affected service tests pass (including `lib/supabase/__tests__/rls-pooling-safety.integration.test.ts`)
- [ ] Each modified RPC callable via authenticated client and returns expected result
- [ ] No phantom function overloads: `pg_proc` count = 1 per modified RPC name
- [ ] All 12 remediated RPCs use `SET search_path = pg_catalog, public` (no `pg_temp`)
- [ ] All 12 remediated RPCs include defense-in-depth `v_casino_id IS NULL` check after `set_rls_context_from_staff()`
- [ ] Gap document marked as resolved
- [ ] P2-2 delegation deferral explicitly documents owner + follow-up path in `docs/issues/gaps/sec-007/GAP-SEC007-P2-BACKLOG-ADR024-COMPLIANCE.md`
