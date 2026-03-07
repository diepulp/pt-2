# EXEC-SPEC Audit — EXEC-043: SEC-007 Remaining RPC `p_casino_id` Remediation (Another Pass)

Date: 2026-03-04  
Artifact: `EXEC-043-sec007-remaining-rpc-remediation.md`. fileciteturn7file0

---

## Executive verdict

You’re **very close** to a clean, repeatable runbook. The spec now has the right bones: parallelizable phases, explicit gates, consolidated allowlist editing, FR-0 verification for INVOKER functions, and volatility preservation checks. fileciteturn7file0L10-L15 fileciteturn7file3L1-L19

But this “another pass” turns up a real issue: the doc currently contains **internal contradictions** around (a) *who edits SEC-003 allowlist* and (b) *how FR-0 is verified*. These will cause reviewer churn and, worse, drift in implementation.

Fix the contradictions and this spec is “ship and forget.”

---

## What’s materially better than the prior version

### 1) Allowlist edit consolidation is the right move
WS5 explicitly consolidates SEC-003 allowlist edits to avoid WS1/WS3 parallel merge conflicts. fileciteturn7file0L10-L15 fileciteturn7file0L35-L38  
That’s the correct operational choice.

### 2) You added a real FR-0 gate for INVOKER RPCs
WS5 adds G7a to validate FR-0 for **DEFINER + INVOKER**, acknowledging SEC-006 only covers DEFINER. fileciteturn7file0L11-L13 fileciteturn7file0L46-L48

### 3) You added volatility preservation verification
WS5 includes an explicit `provolatile` assertion for the D1+D2 set, and WS10 requires expanding this to all 14. fileciteturn7file0L12-L13 fileciteturn7file3L1-L19 fileciteturn7file3L59-L60

### 4) NOTIFY placement is standardized
You explicitly call for a single `NOTIFY pgrst, 'reload schema'` at the end of each migration file and justify why. fileciteturn7file1L14-L18

### 5) The SRM-validator workaround is now explained (not just sneaked in)
WS2 documents why `services/visit/crud.ts` is omitted from YAML outputs and how reviewers should enforce it. fileciteturn7file2L36-L40

---

## The big problem: contradictions that will bite you

### A) SEC-003 allowlist ownership is contradictory
You have *both* of these statements in the same doc:

- “SEC-003 allowlist update **moved to WS5**; WS1 does NOT modify `03_identity_param_check.sql`.” fileciteturn7file1L27-L30  
- “SEC-003 allowlist update (**WS1 responsibility**)… After D1: allowlist shrinks from 14 to 8 entries.” fileciteturn7file5L9-L20

Those cannot both be true.

**Fix (do this):**
- Delete the “WS1 responsibility / after D1 shrink” section (or rewrite it as historical context).
- Keep the “moved to WS5” policy everywhere.
- Ensure WS3 also does not claim allowlist changes (it currently aligns via WS5 consolidation).

### B) FR-0 verification method is contradictory (regex vs strpos)
WS1 acceptance criteria still says “`pg_get_functiondef` **regex** confirms …” fileciteturn7file2L24-L27  
But WS5 clearly prefers `strpos()` and calls regex brittle. fileciteturn7file0L12-L13

**Fix (do this):**
- Pick one method. Given you already wrote the deterministic `strpos()` query, standardize on it:
  - Update WS1 acceptance criteria to reference WS5 G7a (or include a shortened version).
  - If you keep regex anywhere, define what it matches and explicitly note its limitations.

---

## Additional issues worth fixing (smaller, but real)

### 1) `strpos()` query correctness: LEAST(NULL, …) can collapse to NULL
Your `LEAST(NULLIF(strpos(...),0), ...)` pattern can return NULL if any term is NULL in some Postgres versions/contexts, depending on expression evaluation (and even when it doesn’t, it’s easy to misread).

**Fix:**
Wrap each with a large sentinel:
- `COALESCE(NULLIF(strpos(def,'select'),0), 2147483647)` etc, then take LEAST.

Also: consider checking `with` statements (`WITH` CTE) and `execute` if used. You include `perform`, which is good. fileciteturn7file0L46-L48

### 2) WS5 “SEC-003 check against local DB” vs “edit the file”
In one place WS5 says allowlist consolidation is file edits (good), in another it phrases as a “check against local DB.” Keep the language consistent: it’s **a file edit plus a gate that asserts the allowlist count**. fileciteturn7file8L35-L39 fileciteturn7file0L17-L20

### 3) SECURITY INVOKER + `SET search_path` “optional per ADR-018” needs a yes/no decision
WS3 says for INVOKER RPCs: “add `SET search_path = pg_catalog, public` … optional but cheap.” fileciteturn7file3L34-L36

Specs should not leave “optional” security behavior ambiguous.

**Fix:**
Add one sentence:
- “For EXEC-043, we standardize on `SET search_path = pg_catalog, public` for *all* remediated RPCs (definer + invoker) for consistency.”  
or  
- “Only definers require it; invokers must not change `proconfig`.”

### 4) WS10: add one more catalog check to catch unnamed args
WS10 already requires 0 rows in catalog for argname `p_casino_id`. fileciteturn7file3L59-L60  
Add a second query using `pg_get_function_arguments(oid)` to catch unnamed/positional params.

---

## Minimal patch list

1) Remove the contradictory “SEC-003 allowlist update (WS1 responsibility)” section; keep “moved to WS5” as the single rule. fileciteturn7file1L27-L30 fileciteturn7file5L9-L20  
2) Standardize FR-0 verification: update WS1 acceptance criteria to use WS5 G7a (`strpos()`), not regex. fileciteturn7file2L24-L27 fileciteturn7file0L12-L13  
3) Harden the `strpos()` query (COALESCE sentinel) to avoid NULL/LEAST surprises.  
4) Decide and state whether INVOKER RPCs get `SET search_path` or not. fileciteturn7file3L34-L36  
5) WS10: add the second catalog query using `pg_get_function_arguments` to catch unnamed args.

---

## Final conclusion

The execution plan is solid. Your only real remaining threat is **spec drift caused by contradictory instructions**. Clean those up and you’ll stop bleeding time in review and rebases—exactly what an EXEC-SPEC is supposed to prevent.
