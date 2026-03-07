# EXEC-044 AUDIT ADDENDUM — Recommended Corrections

**Date:** 2026-03-06  
**Target:** `EXEC-044-d3d4-p-casino-id-decoupling.md`  
**Purpose:** Fold the audit recommendations into a concise implementation addendum before execution.

---

## Summary

EXEC-044 is approved in direction and structure, but the following corrections are recommended to tighten execution safety, rollback hygiene, and security-gate sequencing.

These are not scope expansions. They are execution-quality corrections intended to reduce deployment risk and improve auditability.

---

## 1. Compatibility Parameter Rule

For the compatibility phase of `rpc_create_financial_adjustment`, the spec currently states that:

```sql
p_casino_id uuid DEFAULT NULL
```

is retained temporarily as a compatibility parameter.

### Recommendation

Make the rule explicit:

> During the compatibility phase, `p_casino_id` must not be referenced anywhere in the function body.

The compatibility parameter exists only to absorb stale browser/client payloads during rollout. It must not participate in:

- mismatch assertions
- WHERE clauses
- INSERT values
- UPDATE filters
- audit metadata
- any fallback logic

### Suggested spec language

```md
Compatibility invariant: `p_casino_id` is retained only to preserve old client compatibility during rollout. It must not be read, validated, compared, or written anywhere in the function body. All tenant scoping must derive exclusively from `v_casino_id`.
```

---

## 2. Explicit Fail-Closed NULL Guard for Loyalty RPCs

The current spec notes that loyalty RPCs already have fail-closed behavior. That may be true in practice, but the execution spec should make this explicit rather than implicit.

### Recommendation

Require the recreated loyalty RPCs to contain an explicit guard:

```sql
IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'SEC-007: casino context missing';
END IF;
```

and, if not already guaranteed by existing logic:

```sql
IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'SEC-007: actor context missing';
END IF;
```

### Rationale

Security-critical derivation should not rely on inference, side effects, or historical behavior hidden elsewhere in the function body.

### Suggested spec language

```md
Add explicit fail-closed guards in recreated loyalty RPCs for missing derived context values. Do not rely on indirect or downstream NULL failures.
```

---

## 3. PostgREST Reload Timing Clarification

The spec includes:

```sql
NOTIFY pgrst, 'reload schema';
```

This is correct, but the timing should be made explicit.

### Recommendation

Clarify that PostgREST reload notification should occur only after the migration transaction successfully commits.

### Rationale

Schema cache reload intent is only meaningful once the final committed function signature exists. The spec should avoid any ambiguity that suggests mid-transaction visibility.

### Suggested spec language

```md
Emit `NOTIFY pgrst, 'reload schema'` only after the migration transaction commits successfully.
```

---

## 4. Split SEC-003 Allowlist Removal from Enforcement Flip

WS3 currently combines:

- allowlist emptying
- hard-fail enforcement flip

in one step.

### Recommendation

Separate these into two explicit sub-steps:

1. Remove the final `p_casino_id` allowlist entries after the catalog is clean
2. Then flip the enforcement path to hard-fail

### Rationale

This separation improves troubleshooting, reduces noisy CI diagnosis, and makes failures more attributable if the catalog still contains stale signatures.

### Suggested execution order

1. Apply cleanup migration
2. Regenerate types
3. Confirm zero catalog matches for `p_casino_id`
4. Empty SEC-003 allowlist
5. Flip SEC-003 to hard-fail
6. Run gates

### Suggested spec language

```md
Do not combine allowlist removal and enforcement hardening as one opaque edit. Sequence them explicitly so catalog cleanliness is verified before hard-fail behavior is enabled.
```

---

## 5. Rollback Artifact Must Be Included in the Exec Spec

The current spec mentions rollback only in the risk table. That is not enough.

### Recommendation

Add an explicit rollback deliverable to WS1 and WS3.

### Minimum requirement

Prepare rollback SQL before execution for:

- the original 13-param `rpc_create_financial_txn`
- the original 8-param `rpc_create_financial_adjustment`
- the original 9-param `rpc_redeem`
- the original 6-param `rpc_manual_credit`

and separately for the adjustment cleanup phase.

### Rationale

Function-signature surgery requires `DROP` + `CREATE`. Reversal should not depend on ad hoc git archaeology during an incident.

### Suggested spec language

```md
Pre-compute and store rollback migration artifacts before execution. Rollback must restore the exact prior signatures, comments, privileges, and `search_path` settings for all four RPCs.
```

---

## 6. Optional Clarification: Pattern B with Browser-Facing Compatibility Constraint

The current spec labels the work as:

```md
Pattern: B (database/security, no HTTP boundary)
```

This is technically correct, but one small clarification would help future readers.

### Recommendation

Add a note that although there is no HTTP boundary change, `rpc_create_financial_adjustment` has a browser-bundle compatibility constraint during deployment.

### Suggested spec language

```md
Pattern B remains correct because no HTTP contract changes are introduced; however, `rpc_create_financial_adjustment` is invoked from browser-side code, so rollout must respect client-bundle compatibility during the temporary compatibility phase.
```

---

## Consolidated Recommendation Block

The following block can be inserted into EXEC-044 under a new section such as **“Execution Corrections”**:

```md
## Execution Corrections

1. Compatibility invariant: during the temporary compatibility phase for `rpc_create_financial_adjustment`, `p_casino_id` exists only to absorb stale client payloads and must not be referenced anywhere in the function body.

2. Add explicit fail-closed guards in recreated loyalty RPCs for missing derived context values (`v_context_casino_id`, and where appropriate `v_context_actor_id`).

3. Emit `NOTIFY pgrst, 'reload schema'` only after the migration transaction commits successfully.

4. Sequence SEC-003 cleanup explicitly:
   - verify catalog is clean
   - empty allowlist
   - then flip enforcement to hard-fail

5. Pre-compute rollback migration artifacts before execution, restoring prior signatures, comments, privileges, and `search_path` values for all affected RPCs.

6. Clarify that this remains Pattern B work, but `rpc_create_financial_adjustment` introduces a browser-bundle compatibility constraint during rollout.
```

---

## Bottom Line

EXEC-044 is ready in substance. These corrections simply make the execution plan less brittle, less ambiguous, and less dependent on operator memory at deploy time.

That is the kind of boring discipline that prevents loud problems later.
