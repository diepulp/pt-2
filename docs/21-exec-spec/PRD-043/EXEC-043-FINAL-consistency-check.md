# EXEC-043 Final Pass — Consistency Check (Post-Delta)

Date: 2026-03-04  
Artifact: `EXEC-043-sec007-remaining-rpc-remediation.md` fileciteturn10file0

This pass checks for internal contradictions, mismatched dependencies, untestable success criteria, and gate logic errors. Result: **consistent and executable** with a few last “paper cuts” to prevent reviewer confusion.

---

## ✅ Consistency: Green (no contradictions found)

### Workstream ownership & parallelism
- WS1 and WS3 are parallel migrations; WS2 and WS4 are parallel TS cascades; WS5 is the first sequential consolidation gate. This is internally consistent. fileciteturn10file0L167-L175
- SEC-003 allowlist edits are **owned by WS5 only**, and WS1/WS3 explicitly do not modify the file. This resolves the prior merge-conflict story cleanly. fileciteturn10file0L187-L194 fileciteturn10file0L332-L339 fileciteturn10file0L463-L474

### Security posture rules
- You standardized `SET search_path = pg_catalog, public` for *all* remediated RPCs (DEFINER + INVOKER). Clear, consistent, review-proof. fileciteturn10file0L377-L381
- NOTIFY placement is consistently “once at end of migration file.” fileciteturn10file0L140-L145

### Gates align to claims
- WS5 G1 success criteria now correctly states type generation success, with catalog truth enforced by G7a/WS10, avoiding “types regen proves arg removal” overclaim. fileciteturn10file0L444-L452
- Volatility preservation is both stated as critical and enforced by WS5/WS10 gates. fileciteturn10file0L605-L610

---

## ✅ Gate logic: Green (the big bugs are fixed)

### FR-0 verification (G7a)
- The query now scans the **preamble before** `perform set_rls_context_from_staff` and uses word boundaries to avoid substring traps. This avoids the earlier false FAIL issue caused by the context call itself using `PERFORM`. fileciteturn10file0L507-L597
- Dynamic SQL is handled separately via G7a.1 (`EXECUTE` guard). fileciteturn10file0L599-L603

### WS10 catalog checks
- Named-args query includes `pronamespace = 'public'::regnamespace` and checks for `p_casino_id` exactly. fileciteturn10file0L637-L646
- Unnamed args uses `pg_get_function_arguments(oid) ~* '\mp_casino_id\M'` which avoids the earlier “match any *_id” false positives. fileciteturn10file0L637-L646

---

## ⚠️ Remaining paper cuts (tiny edits that prevent review churn)

### 1) WS3 Acceptance criteria says “FR-0 verified” (but FR-0 is verified in WS5)
WS3 acceptance criteria includes “FR-0 verified for all 4 RPCs.” fileciteturn10file0L387-L391  
But your spec clearly makes FR-0 a WS5 gate (G7a). fileciteturn10file0L444-L462

**Fix:** change WS3 acceptance bullet to:
- “FR-0 validated by WS5 G7a (must PASS for D2 RPCs).”

This matches what you already did for WS1. fileciteturn10file0L243-L247

### 2) WS5 G7 (SEC-006) says “DEFINER only” but the success criteria text is vague
It’s fine as-is, but if you want absolute clarity, specify it is expected to apply to **`rpc_start_rating_slip` only** in D1+D2. fileciteturn10file0L444-L462

### 3) “No production TS callsite exists” for `rpc_issue_mid_session_reward`
This is consistent (catalog truth still makes it in scope), but reviewers will still ask “why are we touching it?” You already explain it, but adding one sentence tying it to SEC-003 allowlist/cat truth would end the debate. fileciteturn10file0L156-L163

---

## Final conclusion

EXEC-043 is now **internally consistent and mechanically enforceable**. The remaining issues are minor wording/clarity tweaks, not structural risks:

- Update WS3 acceptance to defer FR-0 verification to WS5 (like WS1 already does). fileciteturn10file0L387-L391
- Optionally tighten a couple of phrases to prevent predictable reviewer questions.

If you apply those micro-edits, this doc is “final-final.”
