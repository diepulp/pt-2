# SEC-REMEDIATION-STRATEGY-2026-02-19: Comprehensive Security Posture Fix Plan

**Date:** 2026-02-19
**Source Audit:** `SEC-AUDIT-2026-02-19-RLS-VIOLATIONS-MATRIX.md`
**Patch Applied:** `SEC-REMEDIATION-STRATEGY-2026-02-19-PATCHED.md` (folded corrections)
**Expert Team:** RLS Security Expert, Lead Architect, Backend Specialist, QA Specialist
**Status:** Strategy finalized with corrections folded, awaiting implementation approval

---

## Executive Summary

Four domain experts independently analyzed the audit findings, read the affected source code, inventoried all TypeScript callers, and drafted concrete remediation artifacts. Their consensus produces **4 migration files + 3 code fixes** organized into 3 priority tiers.

| Tier | Migrations | Code Changes | Findings Addressed | Risk |
|------|-----------|--------------|-------------------|------|
| P0 (Immediate) | 1 SQL migration | Type regen only | C-1, C-2, H-4 | Medium (signature change) |
| P1 (Next Sprint) | 2 SQL migrations | 1 Jest test fix, 1 regression test fix | H-1-H-3, M-1-M-4, L-3, TG-1, TG-2 | Low |
| P2 (Hardening) | 1 SQL migration + 1 script | None | L-1, L-2, L-5, TG-3, TG-4 | Low |

**Zero production TypeScript changes required.** All production callers already use the secure code path. This claim is **verified by two independent checks:**

1. **CI grep gate** — scans production directories (`app/`, `services/`, `lib/`, `hooks/`, `components/`, excluding `__tests__/`, `*.test.*`, `scripts/__tests__/`) for `.rpc('remediated_rpc_name'` calls that pass `p_actor_id` or old signature fields. Must also check for dynamic RPC name construction (template literals, variable-based `.rpc()` calls) to avoid false negatives.
2. **Typegen + TypeScript compile** — the real backstop. After `npm run db:types-local`, `npm run type-check` must pass with zero suppressions. Any caller still constructing the old argument shape will fail to compile.

---

## Consensus Design Decisions

### Decision 1: Service-Role Gated Bypass (H-1/H-2/H-3)

**All experts agreed:** The `p_actor_id` parameter cannot simply be removed from shift metrics RPCs because `service_role` clients have no JWT and `set_rls_context_from_staff()` requires one.

**Chosen approach:** Gate the bypass on `current_user <> 'service_role'`:
```sql
IF p_actor_id IS NOT NULL THEN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN: p_actor_id bypass is restricted to service_role';
  END IF;
  -- service_role path: derive context from p_actor_id
  ...
```

**Rationale:**
- `current_user` in PostgreSQL is not spoofable — it reflects the connection role
- Production callers never pass `p_actor_id` (confirmed: 0 production callers)
- Integration tests use `service_role` client — no test changes needed
- Minimal blast radius: 3-line security block addition per function
- Establishes reusable pattern for all RPCs with this vulnerability

**Containment warning:** This approach is **operationally convenient but normalizes "service_role can impersonate staff by UUID."** The gated bypass alone does NOT satisfy INV-8 ("no spoofable identity params") — it merely constrains _who_ can spoof. Claiming INV-8 PASS after P1 requires one of the two lockdown paths below to ship _in P1_, not as a future hardening item.

**Path A (preferred): Split public vs internal RPCs — ship in P1 Migration 2:**
1. Public RPCs: **no `p_actor_id` param** — clean external surface.
2. Internal RPCs: `rpc_shift_*_internal(p_internal_actor_id uuid, ...)`:
   - `GRANT EXECUTE` **only to `service_role`** (no `authenticated` grant)
   - Parameter name signals intent (`p_internal_actor_id`)
   - `REVOKE ALL FROM PUBLIC` on internal variants

**Path B (minimum viable): Keep single RPC but lock down grants:**
- Rename parameter to `p_internal_actor_id`
- Require `current_user = service_role` gate (already planned)
- `REVOKE EXECUTE FROM authenticated` on these 3 RPCs — grant **only to `service_role`**
- Add additional invariant: `p_casino_id` must match staff record, or require session var `app.internal_call = 'true'`

**P1 MERGE GATE: One of Path A or Path B must ship in P1 Migration 2. This is a blocking condition — the P1 PR cannot merge without it. Without grant lockdown, INV-8 remains PARTIAL and the Invariant Restoration Forecast is false.**

**Minimum acceptance criteria (regardless of path):**
- Authed (non-service_role) calls cannot influence actor identity by parameters.
- Shift metrics RPCs with `p_actor_id`/`p_internal_actor_id` are **not callable by `authenticated` role**.
- service_role calls cannot supply an actor_id that does not belong to the resolved casino scope (if casino scoping exists).
- EXECUTE grants are intentional: internal-only RPCs are not granted broadly.

### Decision 2: DROP + CREATE for C-1/C-2 (not CREATE OR REPLACE)

**RLS Expert identified:** Removing `p_actor_id` changes the function's parameter count. PostgreSQL identifies overloads by parameter types, so `CREATE OR REPLACE` would create a *second* overload, leaving the vulnerable version callable.

**Required sequence:**
1. `DROP FUNCTION IF EXISTS` with the old signature (including `p_actor_id`)
2. `CREATE FUNCTION` with the new signature (without `p_actor_id`)

**Impact:** Integration tests that pass `p_actor_id` to C-1/C-2 will break and must be refactored to use authenticated test users. This is the correct outcome — tests should exercise the production code path.

**Catalog assertion required (post-migration):** DROP assumes the old signature matches identity args exactly. If it doesn't, the vulnerable overload survives quietly. After each P0 migration that removes a `p_actor_id` signature, run the following **catalog assertion** and fail deploy/CI if any old overload remains:

```sql
-- Must return 0 rows. Any row = vulnerable overload survived.
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS identity_args
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'rpc_create_pit_cash_observation',
    'rpc_log_table_buyin_telemetry'
  )
  AND pg_get_function_identity_arguments(p.oid) ILIKE '%p_actor_id%';
```

**Acceptance:** query returns 0 rows. If non-zero, the DROP missed a signature and the vulnerable overload is still callable. Run this in CI post-migration and in TG-3 catalog audit script.

### Decision 3: L-4 (compute_gaming_day 2-arg) — No Action Needed

**Backend Specialist discovered:** Already remediated in migration `20260203005841_prd027_temporal_rpcs.sql` which REVOKEs execute from anon and authenticated. The function is retained because 5+ triggers call it as function owner. Dropping it would break production.

### Decision 4: M-4 (rpc_start_rating_slip p_actor_id) — Two-Phase Fix

**Backend Specialist discovered:** The `p_actor_id` is NOT merely vestigial — it's actively written to `audit_log.actor_id`, meaning a spoofable parameter causes **audit-log provenance corruption** (not merely an "ignored param" as originally classified). The audit matrix row for M-4 should reflect this true failure mode.

**Phase 1 (this migration):** `CREATE OR REPLACE` body change to use context-derived `app.actor_id` instead of `p_actor_id`. Parameter kept in signature for backward compatibility.

**Phase 2 (deferred):** Remove parameter from signature (requires TypeScript caller updates in `services/rating-slip/crud.ts` and `services/visit/crud.ts`).

---

## Tier P0: Immediate Security Fixes

### Migration 1: `YYYYMMDDHHMMSS_sec_audit_p0_actor_id_bypass_remediation.sql`

**Findings addressed:** C-1, C-2 (CRITICAL), H-4 (HIGH)

| Function | Change | Mechanism |
|----------|--------|-----------|
| `rpc_create_pit_cash_observation` | DROP old 9-param + CREATE new 8-param | Remove `p_actor_id`, unconditional `set_rls_context_from_staff()` |
| `rpc_log_table_buyin_telemetry` | DROP old 10-param + CREATE new 9-param | Remove `p_actor_id`, unconditional `set_rls_context_from_staff()` |
| `rpc_enroll_player` | CREATE OR REPLACE (body only) | Add role gate: `pit_boss`, `admin` |

**Key details from RLS Expert analysis:**

- C-2 validation updated: `amount_cents <> 0` (was `> 0`) to support negative RATED_ADJUSTMENT amounts per `20260219002247`
- C-2 `telemetry_kind` expanded to include `'RATED_ADJUSTMENT'` per same migration
- C-1/C-2: `service_role` removed from GRANT (bypass removed, no need for service_role PostgREST access). **Acceptance check:** confirm no server-side code paths (Edge Functions, cron jobs, background workers) call `rpc_create_pit_cash_observation` or `rpc_log_table_buyin_telemetry` using the `service_role` client. Grep server code for these RPC names with service client before applying.
- H-4: Role gate mirrors `player_casino` INSERT RLS policy (`pit_boss`, `admin` only)
- H-4: **SECURITY DEFINER requires context-derived role gate** — role restriction must read role **only from session context/JWT**, never from any parameter or a "look up staff by provided UUID" pattern. A staff user without `pit_boss`/`admin` role must receive an explicit denial. Attempts to pass alternate IDs cannot affect the authorization decision.

**TypeScript impact:**

| File | Impact | Action |
|------|--------|--------|
| Production callers (4 files) | **None** — never pass `p_actor_id` | No changes |
| `rls-pooling-safety.integration.test.ts` | 3 tests pass `p_actor_id` | Refactor to authenticated user |
| `shift-metrics.int.test.ts` | ~12 calls pass `p_actor_id` | Refactor to authenticated user |
| `finance-telemetry-bridge.int.test.ts` | 4 calls pass `p_actor_id` | Refactor to authenticated user |

**Post-migration:**
1. Run `npm run db:types-local` to regenerate `database.types.ts`. TypeScript compiler will surface any remaining callers of the removed parameter.
2. Run **catalog assertion query** to verify no vulnerable overloads survive (see Decision 2 above).
3. Run **repo-wide grep** for calls to remediated RPC names — fail if argument objects include `p_actor_id` or old signature fields.

**Operational Bug (P0.5 — production break, non-security):** `hooks/table-context/use-buyin-telemetry.ts` passes `p_source: 'pit_manual'` which is rejected by the `chk_source_valid` CHECK constraint (only allows `'finance_bridge'` or `'manual_ops'`). **These production calls silently fail at the database level.** Must be addressed in a separate migration but should not be deprioritized — this is a live data-loss bug, not a cleanup item.

---

## Tier P1: Defense-in-Depth

### Migration 2: `YYYYMMDDHHMMSS_sec_h1_h2_h3_shift_metrics_service_role_gate.sql`

**Findings addressed:** H-1, H-2, H-3 (HIGH)

| Function | Change |
|----------|--------|
| `rpc_shift_table_metrics` | Add `current_user <> 'service_role'` gate before `p_actor_id` bypass |
| `rpc_shift_pit_metrics` | Same gate + REVOKE/GRANT |
| `rpc_shift_casino_metrics` | Same gate + REVOKE/GRANT |

**Delegation chain verified:** `rpc_shift_casino_metrics` → `rpc_shift_table_metrics` and `rpc_shift_pit_metrics` → `rpc_shift_table_metrics`. The `p_actor_id` is passed through.

**Each shift RPC enforces its own gate; no reliance on upstream validation.** Although the outer function validates before delegating, `rpc_shift_table_metrics` is independently callable — it must enforce the same `current_user` gate regardless of call origin. The migration adds the gate to all 3 functions individually.

**TypeScript impact:** Zero. Production callers never pass `p_actor_id`. Test callers use `service_role` client.

### Migration 3: `20260219235800_adr018_revoke_public_security_remediation.sql`

**Findings addressed:** M-1, M-2, M-3 (MEDIUM), M-4 (MEDIUM), L-3 (LOW)

**Already drafted by Backend Specialist.** Contains:

| Category | Count | Operation |
|----------|-------|-----------|
| REVOKE ALL FROM PUBLIC | 26 functions | Metadata DDL |
| REVOKE ALL FROM anon | 26 functions | Metadata DDL |
| GRANT EXECUTE TO authenticated | 25 functions | Metadata DDL |
| GRANT EXECUTE TO service_role | 25 functions | Metadata DDL |
| M-4 body fix | 1 function (`rpc_start_rating_slip`) | Use context-derived `actor_id` in audit_log |
| L-3 drop | 1 function (`exec_sql`) | DROP FUNCTION IF EXISTS |

**Grant rule:** Internal-only RPCs (accepting `p_actor_id`/`p_internal_actor_id`): `service_role` only, never `authenticated`. User-facing RPCs: `authenticated` (and optionally `service_role` if the server calls it). Never `PUBLIC`.

**Backend Specialist corrections to audit:**
- M-3 listed 12 RPCs by earlier names; actual functions differ (e.g., no `rpc_update_average_bet`, `rpc_change_table` — these were draft names). Real inventory is 12 different SECURITY DEFINER RPCs plus `rpc_start_rating_slip`.
- L-4 (`compute_gaming_day` 2-arg) already remediated — no action needed.
- 8 additional Stream 3 RPCs confirmed missing REVOKE (never added in later migrations).

**Permissions hygiene rule:** Each function must have an **explicit, reviewed grant list** — `authenticated` only, `service_role` only, or both with justification. Do not replace the REVOKE sweep with a blanket `GRANT EXECUTE` set that drifts over time. No DEFINER function may remain callable by `PUBLIC`. A diffable list of functions → grants must exist and be assertable.

**Risk:** LOW — REVOKE/GRANT are metadata-only DDL. Idempotent. Transaction-wrapped.

### Code Fix: TG-1 — `bypass-lockdown.test.ts`

**File:** `lib/supabase/__tests__/bypass-lockdown.test.ts`

**Changes:**
1. Replace `fail()` (undefined in Jest 30) with `expect(violations).toEqual(...)` + guarded `throw new Error(...)`
2. Add `'**/app/(onboarding)/**'` to glob ignore list (ADR-030 D6 exemption)
3. Update test description to document onboarding exemption

### Code Fix: TG-2 — `lint-rls-write-path.regression.sh`

**File:** `scripts/__tests__/lint-rls-write-path.regression.sh`

**Root cause:** Synthetic violation spans multiple lines; grep pattern requires single-line `.from('TABLE').insert(`.

**Fix:** Change synthetic violation to single-line chained call matching real code patterns.

---

## Tier P2: Hardening Backlog

### Migration 4: `YYYYMMDDHHMMSS_fix_game_settings_side_bet_nullif_and_search_path.sql`

**Findings addressed:** L-1, L-2, L-5 (LOW)

**L-1 + L-5:** Replace `game_settings_side_bet` RLS policies:
- Add `NULLIF()` wrappers to `current_setting` calls
- Remove dead `'manager'` role reference (change to `'admin'` only)

**L-2:** Dynamic `search_path` standardization using `DO $$` block.

**Scope restriction (avoid deploy-bricker):** A broad DO-block iterating "all SECURITY DEFINER functions" can fail on edge cases (extensions, unexpected signatures). Restrict the operation:
- Only owned schemas (e.g., `public`)
- Only project RPC naming convention (e.g., `rpc_%`)
- Ideally: enumerate the specific functions intended to alter

```sql
DO $$
DECLARE rec RECORD; alter_sql text;
BEGIN
  FOR rec IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.prosecdef = true
      AND p.proname LIKE 'rpc_%'  -- restrict to project RPCs only
      AND NOT EXISTS (
        SELECT 1 FROM pg_options_to_table(p.proconfig)
        WHERE option_name = 'search_path' AND option_value LIKE '%pg_catalog%'
      )
  LOOP
    alter_sql := format('ALTER FUNCTION public.%I(%s) SET search_path = pg_catalog, public',
      rec.proname, rec.args);
    EXECUTE alter_sql;
  END LOOP;
END $$;
```

**Failure mode:** If any `ALTER FUNCTION` fails, the entire migration must abort — no partial application. Wrap in a transaction (Supabase migrations are transaction-wrapped by default) and rely on rollback. Do not catch/suppress errors inside the loop.

Migration must be **deterministic** and not depend on scanning the whole catalog surface.

### Script: TG-3 — `scripts/audit-rpc-context-injection.sh`

One-time catalog audit script that queries `pg_proc` for all `rpc_*` functions and checks whether their source contains `set_rls_context`. More reliable than scanning migration files because it validates the **current** function definitions.

### Documentation: TG-4

Category B policy lint (`scripts/lint-rls-category-b-policies.sh`) already has graceful degradation (exits 0 with WARNING when no DB available). Document as local-only check; add optional CI step that runs when `DATABASE_URL` is provided.

---

## Implementation Sequence

```
Week 1 (Immediate):
  [0] Fix TG-1 (bypass-lockdown.test.ts) FIRST — prevents bypass-lockdown
      tests from silently failing for unrelated Jest reasons
  [1] Apply P0 migration (C-1, C-2, H-4)
  [2] Run npm run db:types-local (typegen)
  [3] Run catalog assertions — verify no vulnerable overloads survive (A1)
  [4] Run repo-wide grep — confirm no prod calls pass removed params (F)
  [5] Run specific integration tests that previously relied on p_actor_id
  [6] Fix broken integration tests (refactor to authenticated users)
  [7] Verify: npm run test, npm run type-check
      → Signature break detected immediately in the same PR

Week 1-2 (Defense-in-Depth):
  [8] Apply P1 Migration 2 (H-1/H-2/H-3 service_role gate)
      ⛔ MERGE GATE: Must include Path A or Path B grant lockdown.
      Verify: authenticated role has NO EXECUTE on RPCs accepting
      p_actor_id/p_internal_actor_id. Without this, INV-8 stays PARTIAL.
  [9] Apply P1 Migration 3 (REVOKE/GRANT + M-4 + L-3)
  [10] Fix TG-2 (regression test)
  [11] Run full test suite + pre-commit hooks

Week 3+ (Hardening):
  [12] Apply P2 migration (L-1, L-2, L-5)
  [13] Run TG-3 catalog audit script
  [14] Document TG-4 in CI pipeline spec
  [15] M-4 Phase 2: Remove p_actor_id from rpc_start_rating_slip signature
       (requires TypeScript changes in rating-slip/crud.ts, visit/crud.ts)
```

---

## Risk Matrix

| Change | Risk | Rollback | Test Coverage |
|--------|------|----------|---------------|
| C-1/C-2: Remove p_actor_id | **Medium** — function signature change, integration tests break | Re-create old function with DROP + CREATE | Type-check catches callers; manual test refactor required |
| H-4: Add role gate | **Low** — body-only change, no signature change | CREATE OR REPLACE without role gate | Existing tests verify pit_boss/admin paths |
| H-1/H-2/H-3: service_role gate | **Low** — 3-line addition per function | Remove the `IF current_user` block | All tests use service_role — unaffected |
| M-1/M-2/M-3: REVOKE/GRANT | **Very Low** — metadata DDL, idempotent | GRANT EXECUTE TO PUBLIC | No behavioral change |
| L-3: Drop exec_sql | **Very Low** — no production callers | Re-create function | Tests use try/catch fallback |
| M-4: Body fix | **Low** — changes audit_log actor source | Revert body to use p_actor_id | Only affects audit trail provenance |
| TG-1/TG-2: Test fixes | **Very Low** — test code only | Revert test files | Run test suite |
| L-1/L-2/L-5: Consistency | **Very Low** — policy/config standardization | Revert policies | Category B lint validates |

---

## Acceptance Checklist (Folded from Patch)

### Catalog / schema verification
- [ ] No function overload exists with identity args containing `p_actor_id` for P0-remediated RPCs.
- [ ] `REVOKE ALL FROM PUBLIC` applied to all DEFINER RPCs in scope.
- [ ] EXECUTE grants are explicit and reviewed per function.
- [ ] Shift metrics RPCs: `authenticated` role does **not** have EXECUTE on RPCs that accept `p_actor_id`/`p_internal_actor_id`.

### Runtime authorization
- [ ] DEFINER RPCs enforce role gates using context/JWT-derived role.
- [ ] Shift metrics RPCs: each function enforces its own gate independently (no reliance on upstream validation).
- [ ] Shift metrics RPCs: internal impersonation is isolated and guarded (Path A split or Path B grant lockdown).

### Operational dependency
- [ ] No server-side code paths call C-1/C-2 RPCs using `service_role` client (verified by grep before GRANT removal).
- [ ] P0.5 operational bug (`p_source: 'pit_manual'`) tracked as **production break** — not cleanup, not deferred.

### App / TS verification
- [ ] Typegen updated and `npm run type-check` passes with zero suppressions.
- [ ] CI grep gate scans production dirs (`app/`, `services/`, `lib/`, `hooks/`, `components/` excluding `__tests__/`) — confirms no prod calls pass removed params.
- [ ] Grep also checks for dynamic RPC name construction (template literals, variable-based `.rpc()` calls).

---

## Invariant Restoration Forecast

After all tiers are implemented:

| Invariant | Current | After P0 | After P1 | After P2 |
|-----------|---------|----------|----------|----------|
| ADR-024 INV-7 (mandatory self-injection) | PARTIAL | **PASS** | PASS | PASS |
| ADR-024 INV-8 (no spoofable identity params) | PARTIAL | PARTIAL (H-1-3 remain) | **PASS**\* | PASS |
| ADR-030 INV-030-4 (write-path session-var) | PARTIAL | **PASS** | PASS | PASS |
| ADR-018 (REVOKE ALL FROM PUBLIC) | PARTIAL | PARTIAL | **PASS** | PASS |
| SEC-001 Pattern C (COALESCE with NULLIF) | PARTIAL | PARTIAL | PARTIAL | **PASS** |

**\*INV-8 PASS after P1 requires** that shift metrics RPCs with `p_actor_id`/`p_internal_actor_id` are **not callable by `authenticated` role** (Path A or Path B from Decision 1). A service_role gate alone is containment, not full invariant restoration.

**After P1 completion: All CRITICAL and HIGH findings resolved. All security invariants restored to PASS (conditional on H-1/H-2/H-3 grant lockdown).**

---

*Strategy synthesized 2026-02-19 from 4 independent domain expert analyses.*
*RLS Expert: C-1/C-2/H-4 remediation SQL + caller inventory.*
*Lead Architect: H-1/H-2/H-3 service_role gate design + delegation chain analysis.*
*Backend Specialist: REVOKE/GRANT inventory (26 functions) + M-4/L-3/L-4 analysis.*
*QA Specialist: TG-1-TG-4 root cause analysis + L-1/L-2/L-5 remediation SQL.*
