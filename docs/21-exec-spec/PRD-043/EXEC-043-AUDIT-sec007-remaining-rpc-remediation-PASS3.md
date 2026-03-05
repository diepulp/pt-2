# EXEC-SPEC Audit — EXEC-043: SEC-007 Remaining RPC `p_casino_id` Remediation (Pass 3)

Date: 2026-03-04  
Artifact: `EXEC-043-sec007-remaining-rpc-remediation.md`. fileciteturn8file0

---

## Executive verdict

This version is **substantially cleaner** than Pass 2: you resolved the allowlist merge-conflict story (moved to WS5), standardized NOTIFY placement, added deterministic FR-0 verification, and added volatility preservation gates. The plan is now “mostly runbook.”

Pass 3 findings: you still have **two logic bugs in your verification gates** that can cause false FAIL/PASS (FR-0 query and WS10 “unnamed args” query), plus a couple of smaller correctness nits.

Fix these, and you can stop auditing and start shipping.

---

## What is clearly improved (compared to previous audits)

- **Allowlist edits are consolidated in WS5** to avoid parallel merge conflicts (WS1/WS3 explicitly do not touch `03_identity_param_check.sql`). This is the right operational move. fileciteturn8file0L167-L173 fileciteturn8file0L320-L327
- **NOTIFY placement is standardized** (“once at end of migration file”). fileciteturn8file0L140-L145
- **Volatility preservation is elevated to a real gate** (WS5 G7b + WS10 G7a). fileciteturn8file0L147-L150 fileciteturn8file0L605-L610
- **Invoker search_path policy is no longer “optional”** — you picked a consistent rule (apply `SET search_path = pg_catalog, public` to all remediated RPCs). fileciteturn8file0L377-L381
- **WS5 G6 now correctly defines allowlist edit as a file edit + assertion**, and explains why it’s consolidated. fileciteturn8file0L463-L473

---

## High-severity issues (fix before implementation)

### 1) FR-0 `strpos()` verification query is currently wrong (it will often FAIL even when correct)

Your G7a query treats the *first occurrence* of keywords like `perform`, `select`, etc. as “first data statement.” fileciteturn8file0L507-L572

But your required pattern **explicitly uses**:

`PERFORM set_rls_context_from_staff(); ...` fileciteturn8file0L128-L132

That means:
- The string `"perform"` will appear **at the context line itself**
- So `pos_first_data` will frequently equal `pos_ctx`
- Your condition `pos_ctx < pos_first_data` will yield **FAIL** even when the function is perfectly compliant.

**Fix (recommended approach):**
Instead of searching the whole function body for `select/insert/...`, search **only the substring after the context call**.

Example shape:
- `pos_ctx := strpos(def, 'set_rls_context_from_staff');`
- `def_after := substr(def, pos_ctx + length('set_rls_context_from_staff'));`
- compute `pos_first_data_after` inside `def_after`
- pass if `pos_ctx > 0 AND pos_first_data_after > 0`

Also: your inclusion of `'with'` is dangerous because it can match `"without"` (you literally use “without p_casino_id” in prose/comments). Use a word-boundary regex for CTE detection or search for `'with '` at line-start patterns.

**Bottom line:** As written, G7a can generate false FAILs and send you on a wild goose chase.

### 2) WS10 “unnamed args” catalog query is too broad (likely false positives)

WS10 G7-b says:

`pg_get_function_arguments(oid) ILIKE '%casino_id%'` fileciteturn8file0L640-L646

This will match:
- `p_created_by_staff_id`
- `p_awarded_by_staff_id`
- any other arg containing `..._id`

So it will produce false positives even when `p_casino_id` is fully removed.

**Fix:**
Make the query search for the *exact parameter name* (or structured token), e.g.
- `ILIKE '%p_casino_id%'`
- or use a regex word boundary: `~* '\mp_casino_id\M'`

If the goal is “no argument *named* p_casino_id,” then searching for the exact name is the correct test.

### 3) FR-0 still allows “comment-only compliance”
Even with `strpos()`, if someone writes `-- PERFORM set_rls_context_from_staff();` in a comment above a SELECT, your “pos_ctx > 0” check could pass if you search for the raw substring.

**Fix:**
Use `pg_get_functiondef()` and strip comments before scanning, or enforce a more specific token like `perform set_rls_context_from_staff` and then verify that token occurs before any DML in the post-context substring.

---

## Medium-severity issues (will cause friction / confusion)

### 4) WS5 G6 allowlist assertion: `array_length` can be NULL
You require: `array_length(v_casino_id_allowlist, 1) = 4`. fileciteturn8file0L486-L487

If the allowlist array is empty or NULL depending on how the SQL is written, `array_length` can return NULL. Safer assertion:
- `COALESCE(array_length(...), 0) = 4`

Or: assert the array contains exactly the 4 expected names.

### 5) Expected catalog state after D1+D2 uses `proargnames` only
You already know `proargnames` can miss unnamed args. WS10 tries to handle this, but the “unnamed args” query is currently broken (see issue #2). fileciteturn8file0L492-L500

Once you fix WS10 G7-b, also consider using the same corrected approach in WS5’s expected-state check, so reviewers don’t get confused by two different standards.

### 6) The FR-0 query includes `execute` and `perform` as “data statements”
`execute` may appear in dynamic SQL; `perform` appears for non-result calls. Both are fine, but you need to define what you consider “first data statement.”
- If “first statement touching DB state” includes `perform set_rls_context_from_staff()` itself, then your condition must explicitly exclude it (see issue #1).
- If it doesn’t, then you must scan after context call.

Right now the spec implies the latter, but the SQL implements the former.

---

## Low-severity nits (optional polish)

### 7) WS1 says `rpc_issue_mid_session_reward` has “no production TS callsite,” but DTO exists
That’s fine, but it’s worth explicitly stating whether “DTO existence” is considered a callsite for audit purposes. You do mark it as DTO cleanup in WS1 and removal in WS2. fileciteturn8file0L156-L163 fileciteturn8file0L272-L274

### 8) Role gate testing is great; ensure D1 read RPCs get at least one “no context” fail-closed test
WS4 adds several “fails without casino context” tests for loyalty. fileciteturn8file0L417-L424  
You may want one analogous test for one D1 read RPC (e.g., recent sessions) to prove the pattern holds outside loyalty.

---

## Minimal patch list (Pass 3)

1) **Fix WS5 G7a FR-0 query**: scan only after the context call; avoid “WITH” matching “without”; don’t count the context PERFORM line as “data statement.” fileciteturn8file0L507-L572  
2) **Fix WS10 G7-b**: search for `p_casino_id` specifically, not generic `casino_id`. fileciteturn8file0L640-L646  
3) Harden SEC-003 allowlist assertion: `COALESCE(array_length(...),0)` or assert exact set equality. fileciteturn8file0L486-L487  
4) Optionally: strip comments (or match a stronger token) in FR-0 scanning to prevent “comment-only compliance.”

---

## Final conclusion

You’ve turned this into a largely executable spec. The only remaining “sharp edges” are in your *verification logic*, not the remediation plan itself. Fix the FR-0 gate and the WS10 unnamed-arg check, and you’ll have a spec that is both compliant and hard to mis-execute.
