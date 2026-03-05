# EXEC-SPEC Audit — EXEC-043: SEC-007 Remaining RPC `p_casino_id` Remediation

Date: 2026-03-04  
Artifact: `EXEC-043-sec007-remaining-rpc-remediation.md` fileciteturn5file0

---

## Executive verdict

This spec is **close to operationally “runbook-ready.”** The sequencing, gate definitions, and workstream decomposition are coherent, and it correctly treats catalog truth + PostgREST ambiguity as first-class risks. fileciteturn5file1L21-L29

Two things still need tightening to avoid self-inflicted pain:

1) **Parallel PR conflict risk:** WS1 and WS3 both output edits to the same SEC-003 allowlist file, which is a merge-conflict magnet if you actually run “parallel.” fileciteturn5file3L14-L17 fileciteturn5file3L41-L44  
2) **FR-0 verification query robustness:** the current regex approach is directionally right, but fragile. You can make it deterministic with `strpos()` ordering checks.

If you patch those, the rest is basically mechanical execution.

---

## What’s strong (keep it)

### Clear scope and batching
- “14 RPCs → 4 PR batches (D1–D4), 10 workstreams; D1/D2 unblocked; D3/D4 blocked on OQ-1/OQ-2” is explicit and review-friendly. fileciteturn5file4L8-L15
- You list each RPC per batch with security posture and signature action (DROP+CREATE), including special cases (e.g., `rpc_start_rating_slip` is DEFINER and needs `search_path` fix). fileciteturn5file4L26-L33

### Gates are concrete and measurable
- WS5 gate sequence is well-formed and includes SEC-003 shrinkage, SEC-006 (definer), and FR-0 checks for invoker functions. fileciteturn5file0L29-L40 fileciteturn5file0L49-L51
- WS10 “zero allowlist” end state is explicit: catalog query returns 0 rows, 8/8 security gates pass. fileciteturn5file2L16-L25

### Risk register is relevant (not filler)
- You call out the exact footguns: “phantom overload,” “Tier 4 still in catalog,” and the behavioral change for `rpc_get_player_ledger` fail-closed. fileciteturn5file1L21-L29

### Role-gate testing is specified (good)
- You explicitly add role-based mutation tests (dealer/cashier/pit_boss) and context-missing fail-closed tests. fileciteturn5file0L3-L12

---

## Gaps / issues (fix these)

### 1) Parallel execution vs shared-file outputs (merge conflict guaranteed)
In the YAML header, **both WS1 and WS3 list** `supabase/tests/security/03_identity_param_check.sql` as an output. fileciteturn5file3L14-L17 fileciteturn5file3L41-L44  
But Phase 1 says WS1 and WS3 run in parallel. fileciteturn4file0

**Why it matters:** If you truly run parallel PRs, both will modify the allowlist array, and one PR will have to rebase/resolve. That’s fine once; it’s annoying and error-prone as a planned workflow.

**Patch options (pick one):**
- **Option A (recommended):** Make allowlist edits a dedicated workstream/PR (or only performed in WS5), so D1/D2 migrations can be parallel without touching the same file.
- **Option B:** Keep it in WS1 and WS3, but update “parallel” to “parallelizable, but sequence allowlist edits” and mandate WS1 merges before WS3 (or vice versa).

### 2) FR-0 verification query is a good idea but too regex-dependent
WS5 introduces G7a to verify FR-0 for INVOKER RPCs (SEC-006 only covers DEFINER). That’s correct. fileciteturn5file0L37-L40 fileciteturn5file0L49-L51

But the shown SQL uses `regexp_match` and returns a `pre_data_block` blob. Regex-based “contains” checks are brittle and may false-pass if:
- `set_rls_context_from_staff()` exists in a comment
- a data statement appears in a branch earlier than the context call
- the regex doesn’t match some statement forms (`WITH`, `SELECT INTO`, `PERFORM` variations)

**Patch suggestion (deterministic ordering):** compute index positions:
- `pos_ctx := strpos(lower(def), 'set_rls_context_from_staff');`
- `pos_data := least_nonzero(strpos(def, 'select'), strpos(def, 'insert'), ...)`
and assert `pos_ctx > 0 AND pos_ctx < pos_data`.

(Use `pg_get_functiondef(p.oid)` rather than `prosrc` if you want the full function including attributes; or keep `prosrc` but be consistent.)

### 3) Volatility preservation is called out once — enforce it as a gate
WS1 explicitly warns to preserve `STABLE/IMMUTABLE` because CREATE defaults to VOLATILE. Good. fileciteturn4file0  
But there’s no matching **verification** step (WS5/WS10).

**Patch suggestion:** add a volatility check gate:
- snapshot old volatility (`provolatile`) for the 14 RPCs before remediation
- assert post-migration matches expected (`s` for STABLE, etc.)

This prevents silent regressions that don’t fail tests but do change planner behavior.

### 4) “services/visit/crud.ts omitted from YAML outputs” is a governance smell
WS2 notes it omits `services/visit/crud.ts` from outputs “to avoid SRM validation false-positive” but still modifies it. fileciteturn4file0

That’s a workaround, but the spec should explicitly document:
- what validator is being appeased
- why it’s safe to omit
- how reviewers should ensure it’s still updated

Otherwise someone will “follow the spec,” forget the file, and your runtime breaks.

### 5) `NOTIFY pgrst, 'reload schema'` in every function change: OK, but standardize placement
WS1 mandates NOTIFY in the migration pattern. fileciteturn5file4L39-L44  
In large migrations, multiple NOTIFYs are redundant and sometimes noisy.

**Patch suggestion:** prefer a single NOTIFY at end of migration file (unless you have a reason to do per-function). If you keep per-function, say “intentional redundancy” so nobody “optimizes” it inconsistently.

---

## Spec-level improvements (minimal patch list)

1) **Resolve parallel conflict** on SEC-003 allowlist file (separate workstream or sequence allowlist edits). fileciteturn5file3L14-L17 fileciteturn5file3L41-L44  
2) Replace FR-0 regex verification with `strpos()` ordering checks (deterministic). fileciteturn5file0L49-L51  
3) Add a volatility preservation gate (`provolatile` check), since you already call it “CRITICAL.” fileciteturn4file0  
4) Clarify the `services/visit/crud.ts` “omitted outputs” workaround and how it’s enforced in review. fileciteturn4file0  
5) Standardize NOTIFY placement (end-of-migration) or explicitly justify per-function. fileciteturn5file4L39-L44  

---

## Final conclusion

EXEC-043 is strong enough to execute as-is, but if you want it to be *boringly repeatable*, fix the planned parallel merge-conflict and harden FR-0 verification. Everything else is polish and guardrails.
