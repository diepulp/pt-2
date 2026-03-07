# ADR-040 Re-Audit — Pass 3 (Actionable Fixes + Patch Notes)

**Scope:** Re-audit of `ADR-040-identity-provenance-rule.md` against its own stated invariants and the supporting SEC-007 investigation/hardening artifacts.

## Verdict

**Ship with amendments.** The ADR is materially strong (decision, invariant, Category A/B split, remediation, DoD). Two gaps remain that can cause policy→enforcement mismatch, plus a couple consistency tighten-ups.

---

## What’s Solid

- The ADR correctly treats execution identity as **derived**, not client-controlled.
- The Category A vs Category B split is workable and maps to the real world (execution identity vs domain attribution).
- The remediation scope and DoD are coherent and align with the SEC-007 findings.

---

## Blocking Gaps

### GAP 1 — SEC-003 detection patterns won’t catch Category B parameters reliably

You require SEC-003 to enforce Category B “same-casino validation” (INV-8c).  
But Appendix A’s patterns mainly target `p_%_staff_id` and `p_*_by_%` variants. Your Category B examples are `p_witnessed_by`, `p_verified_by`, `p_sent_by`, `p_delivered_by` — these often **won’t match** the current patterns.

**Risk:** The gate can pass a new RPC that introduces cross-casino Category B spoofing, while ADR-040 claims the gate prevents it.

#### Required fix (minimum viable)

Extend Appendix A + SEC-003 detector to include Category B patterns. Choose one:

**Option A (quickest, least correct but immediately effective)**
- Add explicit regex for:
  - `p_(witnessed_by|verified_by|sent_by|delivered_by)`  
- Add an allowlist escape hatch for false positives (documented).

**Option B (better generalization)**
- Add a broader pattern like `p_%_by` and then enforce that any such param:
  - must be validated within tenant scope, OR
  - must be explicitly allowlisted with rationale.

**Option C (best, more work)**
- Detect any RPC parameter used to reference `staff(id)` (type/usage-aware scan).  
This becomes “semantic detection,” not naming detection.

> Recommendation: implement Option A now to close the gap, then migrate to Option C once you have the bandwidth.

---

### GAP 2 — Canonical RPC preamble ordering invites copy/paste drift

The canonical example reads `current_setting(...)` into `v_actor_id` / `v_casino_id` *before* calling `PERFORM set_rls_context_from_staff();` and then re-reads after. That isn’t unsafe if re-read is preserved, but it’s sloppy and will be cargo-culted incorrectly.

**Risk:** A future RPC copies the “first read” version and deletes the “second read,” reintroducing pre-context ambiguity.

#### Required fix

Make the canonical template strictly ordered:

1. `PERFORM set_rls_context_from_staff();`
2. Read trusted settings **once**
3. Fail closed

---

## Tighten-the-Screws Improvements (Non-blocking, but do them)

### Improvement 1 — D1 exception list should reference D2 Category B constraints explicitly

D1’s exception criteria and D2’s Category B constraints overlap but aren’t explicitly linked. That creates two “standards” in the document.

**Fix:** Add one line in D1:

> “Any exception must satisfy Category B constraints in D2.”

### Improvement 2 — Ops-only exceptions should explicitly tie to SECURITY DEFINER governance

You reference ADR-018, but ADR-040 should state the rule plainly:

> “Ops-only exceptions are not client-callable; they must be SECURITY DEFINER gated and invoked only from trusted jobs/admin channels.”

---

## Patch Notes (Suggested Edits)

Below are targeted edits you can apply to ADR-040.

### 1) Canonical preamble (replace the snippet with the ordered version)

**Replace** the canonical template with:

```sql
PERFORM public.set_rls_context_from_staff();

v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

IF v_actor_id IS NULL OR v_casino_id IS NULL THEN
  RAISE EXCEPTION 'SECURITY ERROR: missing trusted execution context';
END IF;
```

### 2) D1 exception criteria (add linkage to Category B)

**Add to D1**:

- “All exceptions must satisfy Category B constraints in D2 (semantic naming, tenant validation, prohibited-as-actor, documented rationale).”

### 3) Ops-only exception rule (insert explicit sentence)

**Add under context / amendments section**:

- “Ops-only exceptions are not client-callable; they must be SECURITY DEFINER gated per ADR-018 and invoked only from trusted jobs/admin channels.”

### 4) Appendix A / SEC-003 detector (extend to catch Category B)

**Add to Appendix A** (minimum viable approach):

- Pattern: `p_(witnessed_by|verified_by|sent_by|delivered_by)`  
  - Enforcement: same-casino validation required or explicit allowlist entry with rationale + tests.

**Or** (broader approach):

- Pattern: `p_%_by`  
  - Enforcement: must be Category B with same-casino validation or allowlisted with rationale.

---

## Definition of Done Addendum (Recommended)

Add one explicit DoD bullet:

- “SEC-003 detector patterns cover Category B candidate parameters (at minimum via explicit patterns; ideally via semantic detection of staff FK usage).”

This prevents the policy from drifting away from enforcement.

---

## Summary

ADR-040 is basically correct and mature enough to approve.  
Fix the **SEC-003 pattern coverage** and **canonical preamble ordering**, then tighten D1/D2 linkage and ops-only governance language to reduce future ambiguity.

