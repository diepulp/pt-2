# EXEC-043 Consistency Delta Patch

Date: 2026-03-04  
Target: `EXEC-043-sec007-remaining-rpc-remediation.md`

Purpose: Surgical edits to eliminate remaining internal inconsistencies and make gates mechanically enforceable.

---

## 1) WS10 G7: scope catalog query to `public`

**Find (WS10 G7):**
```sql
SELECT proname
FROM pg_proc
WHERE proname LIKE 'rpc_%'
  AND 'p_casino_id' = ANY(proargnames);
```

**Replace with:**
```sql
SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname LIKE 'rpc_%'
  AND 'p_casino_id' = ANY(proargnames);
```

Rationale: avoids false failures from non-`public` schemas.

---

## 2) WS5 G7a: remove misleading note about comments; add “no EXECUTE” guard

**Find (G7a note block):**
> Uses pg_get_functiondef() (full CREATE FUNCTION text, includes signature/attributes) rather than prosrc (body-only) and strips catalog comments. Does not scan for EXECUTE; assume no dynamic SQL.

**Replace with:**
> Uses `pg_get_functiondef()` (full CREATE FUNCTION text, includes signature/attributes). Comments may be present; this check is intentionally conservative. Does not attempt to prove safety of dynamic SQL.

**Add immediately after G7a (new G7a.1):**
```sql
-- G7a.1: No dynamic SQL (EXECUTE) in remediated RPCs unless manually reviewed.
SELECT p.proname
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = ANY(ARRAY[
    -- list the same remediated RPC names used by G7a
  ])
  AND lower(pg_get_functiondef(p.oid)) ~ '\mexecute\M';
```

Success criteria: 0 rows.

---

## 3) WS5 G1: align success criteria with what `db:types-local` actually guarantees

**Find (WS5 G1 success criteria text):**
> Success: no `p_casino_id` in Args for the 10 remediated RPCs.

**Replace with:**
> Success: types regenerate cleanly. Catalog-based argname checks are enforced by G7 / WS10.

Rationale: `db:types-local` is generation, not an assertion by itself.

---

## 4) WS1 acceptance criteria: explicitly defer FR-0 validation to WS5

**Find (WS1 acceptance criteria bullet):**
> FR-0: `set_rls_context_from_staff()` is first executable statement…

**Replace with:**
> FR-0: `set_rls_context_from_staff()` placement will be validated by WS5 G7a (must PASS for all D1 RPCs).

Rationale: prevents reviewers expecting WS1 PR to satisfy a gate that lives in WS5.

---

## 5) (Optional hardening) WS5 G6 allowlist assertion: avoid NULL `array_length`

**Find:**
```sql
SELECT array_length(v_casino_id_allowlist, 1) = 4;
```

**Replace with:**
```sql
SELECT COALESCE(array_length(v_casino_id_allowlist, 1), 0) = 4;
```

Rationale: avoids NULL semantics if the array is empty or uninitialized.
