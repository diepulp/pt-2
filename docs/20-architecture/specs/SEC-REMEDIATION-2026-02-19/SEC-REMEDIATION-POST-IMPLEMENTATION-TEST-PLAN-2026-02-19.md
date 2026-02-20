---
title: "Post-Implementation Test Plan — SEC Remediation Exec Spec"
doc_id: SEC-REMEDIATION-TEST-PLAN-2026-02-19
date: 2026-02-19
timezone: America/Los_Angeles
status: "ready"
applies_to:
  - EXECUTION-SPEC-SEC-REMEDIATION-2026-02-19.md
  - SEC-REMEDIATION-STRATEGY-2026-02-19.md
purpose: "How to test the security remediation after implementation"
---

# Purpose

This document defines a **post-implementation test plan** to verify the remediation work actually restores the intended security invariants (not just “tests are green”).

It validates:
- signature removal (no vulnerable overloads remain)
- privilege posture (no `PUBLIC` EXECUTE on SECURITY DEFINER)
- behavior gates (no spoofable actor injection by authenticated users)
- tooling regressions (scripts/tests that previously broke or were brittle)

---

# 0) Preconditions

Assumptions:
- Local Supabase environment is available (CLI / docker).
- Migrations run against local DB.
- Type generation and integration tests run against the same local DB.
- You can run SQL assertions via psql or Supabase SQL editor against the local instance.

---

# 1) Migration + Type Safety Gates (signature-breaking validation)

## 1A) Clean-room reset and apply migrations

```bash
supabase db reset
```

## 1B) Regenerate types and compile

This catches any lingering `.rpc()` callers that still pass removed params (e.g., `p_actor_id`).

```bash
npm run db:types-local
npm run type-check
npm run build
```

**Expected result:**
- No TypeScript errors related to `.rpc()` argument objects or function signatures.

---

# 2) Catalog Assertions (prove vulnerable overloads are gone)

> This is the most important post-implementation check. A mismatched `DROP FUNCTION` can silently leave the vulnerable overload in place.

## 2A) Detect any function identity args containing `p_actor_id`

Run:

```sql
select
  n.nspname as schema,
  p.proname as fn,
  pg_get_function_identity_arguments(p.oid) as identity_args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'rpc_%'
  and pg_get_function_identity_arguments(p.oid) ilike '%p_actor_id%';
```

**Expected result:** `0` rows.

## 2B) Confirm expected signatures exist for P0 RPCs

```sql
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'rpc_create_pit_cash_observation',
    'rpc_log_table_buyin_telemetry'
  )
order by 1,2;
```

**Expected result:** only the safe signature(s); no legacy overload remains.

---

# 3) Privilege Assertions (prove `PUBLIC` cannot execute DEFINER RPCs)

## 3A) Verify no PUBLIC EXECUTE on SECURITY DEFINER RPCs

```sql
select
  n.nspname,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  p.prosecdef as security_definer,
  array_agg(distinct r.rolname)
    filter (where has_function_privilege(r.oid, p.oid, 'EXECUTE')) as roles_with_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join pg_roles r
where n.nspname = 'public'
  and p.proname like 'rpc_%'
  and p.prosecdef
  and r.rolname in ('public', 'authenticated', 'service_role')
group by 1,2,3,4
order by 1,2,3;
```

**Expected result:**
- `public` is never listed with EXECUTE.
- `authenticated` / `service_role` appear only where intended by the strategy.

## 3B) Shift metrics special case (WS4)

Goal (recommended posture):
- `authenticated` executes the **2-param wrapper** only.
- `service_role` executes the **3-param internal** overload only (if retained).

```sql
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as sr_exec
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
  and p.proname in ('rpc_shift_table_metrics','rpc_shift_pit_metrics','rpc_shift_casino_metrics')
order by 1,2;
```

**Expected result:**
- `(timestamptz, timestamptz)` → `auth_exec = true`
- `(timestamptz, timestamptz, uuid)` → `auth_exec = false`, `sr_exec = true`

---

# 4) Behavior Tests (prove bypass attempts fail)

## 4A) Run baseline integration tests

```bash
npm test lib/supabase/__tests__/bypass-lockdown.test.ts
npm test lib/supabase/__tests__/rls-pooling-safety.integration.test.ts
```

**Expected result:** pass.

## 4B) P0 CRITICAL: attempt calling removed signature (manual negative test)

Attempt the old signature. It must fail with “function does not exist” (because the overload was dropped).

```sql
select public.rpc_create_pit_cash_observation(
  now(), 'cash_in'::text, 1, 2, 3, 4, 5, 6, '00000000-0000-0000-0000-000000000000'::uuid
);
```

**Expected result:** function not found.

## 4C) H-4 enroll player role gate (SECURITY DEFINER)

Test with a non-admin / non-pit-boss staff role attempting to call `rpc_enroll_player`.

**Expected result:** explicit denial (role gate), not “RLS happened to block it.”

## 4D) WS4 shift metrics: three-case gate verification

Test the following cases:

1) `authenticated` calls 2-param wrapper → **OK**
2) `authenticated` calls 3-param internal overload → **DENIED** (no EXECUTE)
3) `service_role` calls internal overload with an actor from a different casino → **DENIED** (scope invariant)

---

# 5) Tooling Regression Checks (TG fixes)

## 5A) TG-2 regression script

```bash
bash scripts/__tests__/lint-rls-write-path.regression.sh
```

**Expected result:** no brittle formatting failures.

## 5B) TG-3 catalog audit script (if implemented)

```bash
bash scripts/audit-rpc-context-injection.sh
```

**Expected result:** produces a stable report; flags unexpected SECURITY DEFINER RPCs without required context injection.

---

# 6) Final Ship Gate (post-implementation)

All of the following must be true before marking READY:

- [ ] `supabase db reset` applies all migrations cleanly
- [ ] `npm run db:types-local` completes and types update
- [ ] `npm run type-check` and `npm run build` succeed
- [ ] Catalog query returns **0** rows for identity args containing `p_actor_id`
- [ ] No `PUBLIC` EXECUTE on SECURITY DEFINER RPCs
- [ ] Shift-metrics grants match intended boundary (wrapper vs internal overload)
- [ ] Baseline integration tests pass (bypass-lockdown, pooling safety)
- [ ] Manual negative test proves removed signature is not callable
- [ ] Shift-metrics negative cases deny bypass attempts
- [ ] TG scripts run cleanly (no false positives / brittleness)

---

# Notes

- Treat catalog assertions as **non-optional** for security migrations. “We dropped the overload” is not evidence.
- The shift-metrics internal impersonation behavior (if retained) must remain **internal-only** via grants and additional scope invariants.
