# Supabase Advisor Migration Audit — Regressions Precis

**Date:** 2026-04-03
**Branch:** `supabase-advisors`
**Scope:** 7 migrations produced by cloud agent remediation of 303 Supabase Database Advisor findings
**Auditor:** Post-implementation review (3 parallel audit agents)

---

## Summary

| Migration | Issues | Verdict | Regressions |
|-----------|--------|---------|-------------|
| `_move_pg_trgm_to_extensions_schema` | SEC-S4 | **SOUND** | None |
| `_drop_duplicate_loyalty_ledger_index` | PERF-P2 | **SOUND** | None |
| `_add_unindexed_foreign_key_indexes` | PERF-P4 | **SOUND** (minor) | Header/body comment contradiction |
| `_fix_supabase_advisor_sec_s1_s2_s5` | SEC-S1/S2/S5 | **HAS ISSUES** | 1 HIGH, 1 MEDIUM, 1 LOW |
| `_fix_function_search_path_sec_s3` | SEC-S3 | **FIXED** | Was broken (17 functions), rewritten in `6a3a7fc` |
| `_fix_rls_initplan_perf_p1` | PERF-P1 | **SOUND** | None (5 spot-checks passed) |
| `_fix_staff_permissive_policies_perf_p3` | PERF-P3 | **SOUND** | None |

**Scorecard:** 5 sound, 1 fixed, 1 has issues (1 HIGH regression)

---

## HIGH — SEC-S2: `company` deny-all policy breaks casino creation

**Migration:** `20260403202555_fix_supabase_advisor_sec_s1_s2_s5.sql` (lines 72-82)
**Finding:** SEC-S2 (RLS enabled but no policies)
**Regression:** The `company_deny_all` policy blocks the casino creation API

### What the migration does

```sql
CREATE POLICY company_deny_all
  ON public.company
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL AND false)
  WITH CHECK (auth.uid() IS NOT NULL AND false);
```

### Why it breaks

`app/api/v1/casino/route.ts:150-158` does a direct `.from('company').insert()` via the authenticated `mwCtx.supabase` client during casino creation (ADR-043 auto-create company flow):

```typescript
const { data: company, error: companyError } = await mwCtx.supabase
  .from('company')
  .insert({ name: input.name })
  .select('id')
  .single();
```

The deny-all `WITH CHECK (false)` rejects the INSERT regardless of RLS context. The `mwCtx.supabase` client runs as `authenticated` (not `service_role`), so it is subject to the policy.

`staff_pin_attempts` deny-all is safe — confirmed it is only accessed via SECURITY DEFINER RPCs.

### Fix options

1. **Refactor route to use RPC** — create `rpc_create_company` as SECURITY DEFINER, call it from the casino route. Most aligned with ADR-030 D5 (Template 2b writes via RPCs).
2. **Scoped admin INSERT policy** — replace blanket deny-all with a policy that allows admin-role INSERT via session-var context.
3. **Remove `company` deny-all** — revert to the original no-policy posture and document the intent. Least invasive but leaves the advisor lint unsatisfied.

### Impact

POST `/api/v1/casino` without a `company_id` will fail with a PostgREST/RLS error. Casino creation flow is broken for any case where the caller does not provide an existing `company_id`.

---

## MEDIUM — SEC-S1: DROP/CREATE view instead of ALTER VIEW

**Migration:** `20260403202555_fix_supabase_advisor_sec_s1_s2_s5.sql` (lines 24-59)
**Finding:** SEC-S1 (SECURITY DEFINER view)

The migration drops and recreates `mtl_gaming_day_summary` to add `security_invoker = true`. The codebase has precedent for the non-destructive approach:

```sql
-- Existing pattern (20251216160332_fix_visit_financial_summary_security_invoker.sql):
ALTER VIEW public.visit_financial_summary SET (security_invoker = true);
```

The DROP/CREATE approach:
- Risks view definition drift during copy-paste (verified identical this time, but fragile)
- Creates a window where the view doesn't exist (mitigated by BEGIN/COMMIT transaction)
- Unnecessarily complex for a metadata-only change

**Fix:** Replace with `ALTER VIEW public.mtl_gaming_day_summary SET (security_invoker = true);`

---

## LOW — PERF-P4: Header/body contradiction

**Migration:** `20260403202125_add_unindexed_foreign_key_indexes.sql`

Header comments (lines 16-17) list `table_buyin_telemetry.visit_id` as **skipped** because of composite index coverage. The body (lines 236-237) creates the index anyway. The index is correct (composite has `visit_id` at position 2, not leading), but the header is misleading.

**Fix:** Update header comment to list `table_buyin_telemetry.visit_id` as included, not skipped.

---

## LOW — SEC-S1/S2/S5: NOTIFY after COMMIT

**Migration:** `20260403202555_fix_supabase_advisor_sec_s1_s2_s5.sql` (line 110)

`NOTIFY pgrst, 'reload schema'` is placed after `COMMIT;` (line 108). While it still fires (auto-commit), placing it before COMMIT is the consistent codebase pattern.

---

## RESOLVED — SEC-S3: search_path/body inconsistency

**Migration:** `20260403202628_fix_function_search_path_sec_s3.sql`
**Fixed in:** commit `6a3a7fc`

The original migration used `ALTER FUNCTION ... SET search_path = ''` on 36 functions without rewriting bodies. 17 functions had unqualified table/function references that would break at runtime.

**Fix applied:** `CREATE OR REPLACE` with `public.`-qualified bodies for 17 functions, `ALTER FUNCTION` with `SEARCH_PATH_SAFE` markers for 19 safe functions.

**Guardrails added:**
- `.husky/pre-commit-search-path-safety.sh` — blocks bare ALTER FUNCTION SET search_path
- `supabase/tests/security/09_search_path_body_check.sql` — CI gate for catalog-level consistency check

See: [GAMING-DAY-FUNCTION-DRIFT.md](./GAMING-DAY-FUNCTION-DRIFT.md)

---

## Sound Migrations (no action required)

### SEC-S4: pg_trgm extension move — SOUND

Correct 4-step sequence: drop dependent index, drop extension from public, recreate in extensions schema, recreate index with `extensions.gin_trgm_ops`. All dependents accounted for. Idempotent.

### PERF-P2: Duplicate index drop — SOUND

Confirmed true duplicate: `ux_loyalty_ledger_idem` (Dec 13, original) and `loyalty_ledger_idempotency_uk` (Dec 29, duplicate) cover identical columns with identical predicates. Drops the duplicate, keeps the original.

### PERF-P1: RLS InitPlan wrapping — SOUND

57 DROP + 57 CREATE, all balanced. 5 spot-checked policies verified:
- `mtl_entry_select` — COALESCE hybrid + role gate preserved
- `pit_cash_observation_insert` — actor binding + role gate preserved
- `staff_invite_update_admin_session` — session-var-only preserved
- `player_exclusion_update_admin` — admin gate + USING/WITH CHECK symmetry preserved
- `side_bet_update` — admin gate preserved (cosmetic `::jsonb` cast dropped, functionally equivalent)

One defensive addition: `auth.uid() IS NOT NULL` added to `staff_update_own_pin` where it was absent in the original. Harmless — the original `auth.uid() = user_id` already implied non-null.

### PERF-P3: Staff policy consolidation — SOUND

Two permissive UPDATE policies (`staff_update` admin-only, `staff_update_own_pin` self-service) consolidated into one with OR'd paths. Logically equivalent to PostgreSQL's implicit OR of permissive policies. Column-level GRANT (`GRANT UPDATE (pin_hash) ON public.staff TO authenticated`) preserved and interaction verified.

---

_Document owner: Post-implementation audit • Created 2026-04-03_
