# REMEDIATION DECISION MEMO — D3/D4 `p_casino_id` Decoupling Approval

**Date:** 2026-03-06  
**Scope:** Approval assessment for `GAP-SEC007-D3D4-UNBLOCK-CASINO-ID-FROM-DELEGATION.md` and `BLAST-RADIUS-D3D4-DECOUPLING.md`  
**Related artifacts:**  
- `INV-SEC007-DELEGATION-PARAM-SPOOFABILITY-AUDIT.md`  
- `GAP-SEC007-D3D4-UNBLOCK-CASINO-ID-FROM-DELEGATION.md`  
- `BLAST-RADIUS-D3D4-DECOUPLING.md`  

---

## 1. Executive Decision

**Approved, with corrective conditions.**

The direction to **decouple removal of `p_casino_id` from the delegation-parameter remediation** is sound and should proceed. The claim that `p_casino_id` removal is blocked by OQ-1/OQ-2 is not substantiated by the current function bodies or the blast-radius analysis.

The decoupling is:

- **architecturally valid**
- **mechanically localized**
- **low-risk at the code level**
- subject to **one real deployment hazard**: the browser-side call to `rpc_create_financial_adjustment`

The correct conclusion is:

> `p_casino_id` removal should proceed now. Delegation-parameter hardening should continue as a separate remediation track.

---

## 2. Approval Basis

### 2.1 The concerns are independent

The original gap is correct in its central claim: `p_casino_id` and the delegation parameters represent different concerns.

- `p_casino_id` is a **tenant-boundary input**
- `p_created_by_staff_id`, `p_awarded_by_staff_id`, and `p_issued_by_staff_id` are **identity-attribution inputs**

These are not the same class of problem and should not be operationally bundled.

### 2.2 The source of truth already exists

All four RPCs already call:

```sql
set_rls_context_from_staff()
```

and derive:

```sql
v_casino_id := current_setting('app.casino_id', true)::uuid;
```

This means the authoritative tenant context is **already established independently of the caller-supplied parameter**.

`p_casino_id` is therefore not required for tenant derivation. It serves only as a mismatch assertion against the already-derived context.

### 2.3 No codepath couples `p_casino_id` to delegation params

The blast-radius assessment confirms that in all four target RPCs, `p_casino_id` is not cross-validated against the delegation parameter and does not participate in shared branching with those values.

This is the crucial validation point: removing `p_casino_id` does **not** alter the delegation-parameter behavior. The concerns are structurally separable.

---

## 3. Substantiation of the Decoupling Claim

The claim that decoupling is safe is **substantiated**.

### 3.1 Why the claim holds

Removing `p_casino_id` is a subtractive change because:

1. the tenant context is already derived from `set_rls_context_from_staff()`
2. `v_casino_id` is already used in the body
3. the parameter is not needed to compute authorization or routing decisions
4. the parameter is not required for DTO, schema, hook, or route-handler shape

### 3.2 What this means practically

The remediation does **not** require:

- schema redesign
- DTO redesign
- hook contract changes
- route-layer behavior changes
- architectural rewrites

It is a contained function-signature cleanup with shallow TypeScript fallout.

### 3.3 What the blast radius supports

The blast-radius analysis credibly narrows the change to:

- 4 SQL function recreations
- 5 production TypeScript files
- 6 test files
- approximately 30 lines of deletion
- no DTO/schema/hook/route-handler changes

That is a classic low-radius remediation, not a broad refactor.

---

## 4. Blast Radius Assessment

### 4.1 SQL layer

The SQL changes are straightforward:

- remove `p_casino_id` from the 4 remaining RPC signatures
- replace any body references with the already-derived `v_casino_id`
- preserve existing security/volatility characteristics
- reapply exact GRANT/REVOKE statements on the new signatures

No dependent objects or overload entanglements were identified. That materially lowers catalog risk.

### 4.2 TypeScript layer

The TS fallout is also shallow:

- remove `p_casino_id` from RPC invocation payloads
- keep DTOs and schemas intact where `casino_id` still has non-RPC uses
- update tests accordingly

This is deletion-heavy, not redesign-heavy.

### 4.3 Security-gate effect

This is one of the best reasons to proceed:

- current SEC-003 allowlist remains artificially stuck above zero
- removal of `p_casino_id` allows the allowlist to shrink accordingly
- this supports eventual restoration of hard enforcement

In other words, the change is not just cleanup. It directly improves security-governance posture.

---

## 5. Corrective Actions Required Before / During Execution

The direction is approved, but the following items should be treated as required corrective actions.

### 5.1 Treat the browser-side RPC as a deployment hazard, not a footnote

The only serious operational risk is the browser call to:

```text
rpc_create_financial_adjustment
```

If the migration lands before the browser bundle updates, cached clients will send an outdated RPC shape and receive a PostgREST failure.

**Required action:** use a compatibility rollout.

Recommended pattern:

#### Phase 1 — compatibility migration
Keep `p_casino_id` temporarily as:

```sql
p_casino_id uuid DEFAULT NULL
```

and ignore it in the function body.

Optional but recommended:

```sql
IF p_casino_id IS NOT NULL THEN
  RAISE NOTICE 'Deprecated param p_casino_id ignored';
END IF;
```

#### Phase 2 — deploy updated TS / browser bundle

#### Phase 3 — remove `p_casino_id` entirely in a cleanup migration

This is safer than pretending an atomic deploy fully eliminates stale browser bundles. It does not.

---

### 5.2 Reclassify PUBLIC execute cleanup as mandatory

The blast-radius doc describes missing execute restrictions on `rpc_manual_credit` and `rpc_redeem` as a hardening bonus.

That is too soft.

If these functions are client-callable only through authenticated application workflows, then:

- `PUBLIC` execute is not acceptable
- `anon` execute is not acceptable

**Required action:**

```sql
REVOKE ALL ON FUNCTION ... FROM PUBLIC;
REVOKE ALL ON FUNCTION ... FROM anon;
GRANT EXECUTE ON FUNCTION ... TO authenticated;
GRANT EXECUTE ON FUNCTION ... TO service_role;
```

This should ship with the same remediation, not be deferred as optional polish.

---

### 5.3 Standardize `search_path`

Where missing or overly permissive, align all recreated functions to:

```sql
SET search_path = pg_catalog, public
```

This is small, cheap, and worth doing while the signatures are being recreated anyway.

---

### 5.4 Preserve a rollback artifact before execution

Because this is signature-level surgery, rollback should not depend on frantic git archaeology while production is smoldering.

**Required action:** prepare a rollback migration before deployment.

Not because the change is scary. Because disciplined rollback hygiene is cheaper than heroics.

---

### 5.5 Shrink the SEC-003 allowlist only after the function migration

The ordering matters.

Correct sequence:

1. apply the SQL migration
2. update the allowlist / checks
3. regenerate types
4. run all gates

Do not invert this unless the goal is to manufacture CI noise for sport.

---

## 6. What This Remediation Does Not Solve

This is important for reviewer clarity.

Decoupling `p_casino_id` does **not** resolve the broader delegation-parameter issue.

It does **not** fix spoofability of:

- `p_awarded_by_staff_id`
- `p_issued_by_staff_id`
- redundant `p_created_by_staff_id`

Those remain a separate identity-provenance remediation track and should continue under the investigation / ADR follow-up work.

So the correct framing is:

- **Approve D3/D4 decoupling now**
- **Do not pretend that doing so closes the broader delegation problem**

---

## 7. Overall Judgment

### 7.1 Approve or invalidate?

**Approve.**

### 7.2 Are the claims to decouple substantiated?

**Yes.**

The available evidence supports the claim that `p_casino_id` removal is independent from delegation-parameter remediation.

### 7.3 Is the blast radius acceptable?

**Yes, with one operational caveat.**

The code and catalog blast radius are small and controlled. The only material risk is browser/client version skew for `rpc_create_financial_adjustment`, which is solvable with a compatibility rollout.

---

## 8. Final Recommendation

Proceed with D3/D4 decoupling under the following conditions:

1. use a temporary compatibility migration for browser-facing `rpc_create_financial_adjustment`
2. remove `p_casino_id` from the remaining three RPCs immediately
3. apply mandatory REVOKE/GRANT hardening for `rpc_manual_credit` and `rpc_redeem`
4. normalize `search_path`
5. prepare rollback migration in advance
6. shrink SEC-003 allowlist only after the signature changes land
7. continue delegation-param hardening as a separate remediation stream

---

## 9. Bottom Line

The former issue surfaced by the gap was real, and the remediation direction is correct.

`p_casino_id` removal was blocked by an artificial coupling to delegation-parameter questions that do not materially affect tenant-context derivation.

The decoupling should be executed now.

What remains is not a reason to delay. It is simply the next problem in line.
