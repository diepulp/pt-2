---
id: POSTMORTEM-SET-RLS-CONTEXT-DROP-20260303
title: "Postmortem: Unverified DROP of set_rls_context() and Guardrail Fix"
status: Draft
owner: Platform/Security
date: 2026-03-03
scope: [migrations, rls, rpc, governance, ci-gates]
related:
  - migrations/20260302230024
  - migrations/20260303212259
  - EXEC-040 (SEC-007)
  - EXEC-041 (PRD-041)
---

# Postmortem: Unverified DROP of `set_rls_context()` and Guardrail Fix

## Executive Summary

A migration dropped a legacy helper function (`set_rls_context`) based on an **unverified assumption** that all function bodies had already been migrated to `set_rls_context_from_staff()` via later `CREATE OR REPLACE`. That assumption was wrong: **three PRD-017 RPCs still called the legacy function**, causing runtime breakage after the drop.

A fix migration (`20260303212259`) remediated the remaining RPC bodies. A catalog scan now returns **zero** functions still referencing `set_rls_context(` in the local database.

The technical fix is complete. The real gap was **process**: a destructive schema change was executed without a **catalog-introspection gate** proving it was safe.

---

## Incident

### Trigger
- Migration **20260302230024** dropped `set_rls_context()`.
- It included a comment claiming remaining body references were already overridden by later migrations, but this was never validated.

### Failure Mode
- Three PRD-017 RPCs still contained `PERFORM set_rls_context(...)`.
- After the drop, those RPCs failed at runtime (missing function).

### Why this slipped through
- No prerequisite step in EXEC-040/EXEC-041 required scanning all function bodies (`pg_proc`) for `set_rls_context(` references.
- EXEC-041 contained a baseline assertion equivalent to “all RPCs already call `set_rls_context_from_staff()`” — taken on faith rather than verified.

---

## Remediation (Completed)

### Fix Migration
- **20260303212259** updated the three PRD-017 RPCs to stop calling `set_rls_context()` (now remediated).

### Verification (Local DB)
Confirmed: **Zero rows** from catalog introspection query:

```sql
select
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'graphql_public')
  and pg_get_functiondef(p.oid) ilike '%set_rls_context(%'
order by 1, 2;

```
Result: 0 functions still reference set_rls_context().

Root Cause
Immediate cause

A function was dropped without enumerating all callers in function bodies.

Systemic cause (process failure)

Destructive changes (“DROP/RENAME shared primitives”) were not gated behind catalog-based proof that the primitive is unused.

Key lesson:

Specs and comments are not proof. pg_proc is proof.

Guardrail: “DROP Requires Proof” (Must Implement)
New invariant

Any migration that drops or renames a function that could be called by other functions MUST prove:

pg_get_functiondef(p.oid) contains zero references to the legacy function name.

CI Gate (Hard Fail)

Add a gate SQL file (example path):

supabase/tests/security/XX_no_legacy_set_rls_context.sql
```sql
do $$
declare v_cnt int;
begin
  select count(*) into v_cnt
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','graphql_public')
    and pg_get_functiondef(p.oid) ilike '%set_rls_context(%';

  if v_cnt > 0 then
    raise exception 'Legacy set_rls_context() still referenced in % function(s). Drop/rename is unsafe.', v_cnt;
  end if;
end $$;
```
Repo Scan (Quick Pre-check)

This is not sufficient alone (because overrides/ordering matters), but it’s a fast early warning:
```bash
rg -n --glob '*.sql' "\bset_rls_context\s*\(" supabase
```
Migration Self-Defense (Optional but Strong)

Even if CI is bypassed, the migration can refuse to run if callers exist.

Add this before dropping the function:

```sql
do $$
declare v_cnt int;
begin
  select count(*) into v_cnt
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','graphql_public')
    and pg_get_functiondef(p.oid) ilike '%set_rls_context(%';

  if v_cnt > 0 then
    raise exception 'Refusing to drop set_rls_context(): % caller(s) remain.', v_cnt;
  end if;
end $$;
```
Then proceed with:
```sql
-- drop function ...;
```
Spec Updates (Stop Writing Baseline Fiction)
Replace baseline assertions with verification language

Bad:

“All RPCs already call set_rls_context_from_staff().”

Good:

“Target state: all RPCs call set_rls_context_from_staff(). Verified by pg_proc catalog scan returning zero legacy references.”

Add a standard prerequisite to any destructive workstream

For any WS that drops/renames shared primitives:

Prereq: Catalog scan shows 0 callers in pg_proc function bodies.

Evidence: Query output (or CI logs) attached.

Definition of Done (Updated)

A destructive removal (DROP/RENAME) is “done” only when:

 Catalog scan returns 0 functions referencing the legacy function.

 CI gate that enforces the scan is present and passing.

 Migration includes a pre-drop refusal block (optional but recommended).

 Specs reference verification outputs (not assumptions).

Final Status

✅ Functional remediation complete (local DB: zero remaining callers).

⚠️ Governance gap identified and must be fixed: add CI + spec prerequisite so this cannot happen again.

Appendix: Why CREATE OR REPLACE Assumptions Are Dangerous

Relying on “later migrations must have replaced earlier function bodies” fails when:

some functions were never overridden,

branch merges reorder or omit expected migrations,

a legacy file is reintroduced via cherry-pick/rebase,

or the "later" migration touched a subset, not all.

Only pg_proc introspection tells you what the database actually contains.

