# PRD Audit — PRD-043: SEC-007 Remaining RPC `p_casino_id` Remediation (Allowlist Tail)

Date: 2026-03-04  
Scope: Audit of PRD-043 (“SEC-007 Remaining RPC `p_casino_id` Remediation (14 RPCs)”) as provided by the user.

---

## Executive take

The PRD is structurally sound and appropriately “mechanical” for a remediation tail (finish the last allowlisted RPCs so SEC-003 can go zero-tolerance). The risk is not design—it's **loose ends**: a couple of internal inconsistencies, assumptions that aren’t enforced, and two “TBD callsites” that can quietly turn into scope creep and review churn.

If you tighten the acceptance criteria and standardize the migration template, this becomes a boring, repeatable cleanup (which is what you want).

---

## What’s solid (keep it)

- Clear framing: WS6 surfaced the remaining non-compliant allowlist items; this PRD finishes the job so CI can enforce “zero allowlist exceptions.”
- Good measurable goals: catalog/grep checks + security gates.
- Scope split into D1–D4 (unblocked → blocked) is pragmatic and reduces blast radius.
- Correct emphasis on PostgREST + overloaded functions: **DROP old signature then CREATE new** to avoid ambiguity traps.

---

## Gaps / inconsistencies (things that will bite later)

### 1) Migration template inconsistency (DROP+CREATE vs CREATE OR REPLACE)

The PRD says to **DROP old signature then CREATE new signature** (good), but Appendix C shows `CREATE OR REPLACE FUNCTION` after the DROP.

That can be safe, but it contradicts the “no ambiguity / no lingering overload” doctrine you’re trying to enforce. Standardize to one pattern:

**Preferred (strict):**
- `DROP FUNCTION IF EXISTS ... (old signature);`
- `CREATE FUNCTION ... (new signature);`

If you want to keep `OR REPLACE`, explicitly justify why it’s still safe under your PostgREST named-parameter + DEFAULT-arg constraints.

### 2) “All 14 RPCs already call set_rls_context_from_staff()” is an assumption, not a requirement

The PRD treats this as “assumed complete.” That’s exactly how a single weird RPC slips through: it “kinda” sets context, but not early enough, or not consistently.

Add a hard requirement:

**FR-0 (Context setup):** Every remediated RPC must call `set_rls_context_from_staff()` as the first executable statement and must derive tenant identity (`casino_id`, actor) from session context, not from parameters.

Also add a proof step per function (see “Recommended patches”).

### 3) Delegation params are framed as questions, not as acceptance criteria

You’ve got open questions like “should delegation params be removed?” and “derive from app.actor_id” guidance, but you don’t define what “done” looks like for either decision.

You need explicit acceptance criteria for both possible outcomes:

- **If delegation is allowed:** parameter must be validated via an authorization rule (role-based + same tenant boundary) and must produce an audit record/event. Include tests.
- **If delegation is not allowed:** parameter is removed; actor attribution must be derived from session context (`current_setting('app.actor_id')` or equivalent) and tests must assert it.

Otherwise you’ll debate it in review, and each reviewer will re-litigate it.

### 4) “No behavioral change” needs a more honest definition

Removing `p_casino_id` will alter error surfaces (and that’s fine). Claiming “no behavioral change” can be read as “no observable change whatsoever,” which isn’t true.

Better wording:

> No **business-output** changes for valid callers; parameter surface and error messaging may change.

### 5) Appendix A has “TBD callsites” (hidden scope trap)

Two production callsites are labeled TBD. That means your callsite inventory requirement is incomplete by definition. Bake in a rule:

- Before implementing each batch/PR, pin **the concrete callsite list** (ripgrep output) into the PR description and update Appendix A.

### 6) Grants/authorization posture is under-specified

The PRD broadly mandates `GRANT EXECUTE TO authenticated, service_role`. That may be correct, but the PRD doesn’t distinguish:
- read-only dashboard RPCs vs mutation RPCs (loyalty/finance)
- whether *all* authenticated staff should have access, or only specific roles

If you’re gating inside function bodies (common), the PRD should explicitly require role authorization for mutation RPCs (or state “out of scope: role gating already handled by X”). Otherwise “authenticated” becomes “any logged-in staff can mutate money/points.”

---

## Recommended PRD patch set (minimal, high-leverage)

Add these as explicit requirements / acceptance criteria:

1) **FR-0 (Context setup / tenant derivation)**
   - Each remediated RPC calls `set_rls_context_from_staff()` as the first executable statement.
   - `casino_id` must be derived from session context (no tenant parameters).
   - Add a per-RPC assertion/test:
     - a SQL-level check that the function body contains the call near the top (lightweight)
     - and/or a runtime test that calling without proper context fails safely.

2) **Standardize migration recipe**
   - Choose one canonical migration template:
     - strict DROP + CREATE (recommended), or
     - DROP + CREATE OR REPLACE with an explicit rationale and guardrails.

3) **Delegation decision acceptance criteria**
   - If allowed: authorization + audit + tests.
   - If disallowed: remove param + derive actor + tests.

4) **Callsite inventory must be non-TBD**
   - For each RPC, require explicit callsite references (file path + line) or “no callsites found”.
   - Require ripgrep output inclusion in PR.

5) **Clarify NFR wording**
   - Replace “no behavioral change” with “no business-output change for valid callers; interface/error surface may change.”

6) **Mutation RPC authorization statement**
   - Either: mandate staff_role gating in mutation RPCs, or
   - explicitly state which layer already enforces it and how it will be tested.

---

## Practical “definition of done” checklist (copy/paste into PRs)

- [ ] Old RPC signature dropped; new signature created (no overlap).
- [ ] No `p_casino_id` (or tenant identity) params remain.
- [ ] `set_rls_context_from_staff()` is first executable statement in each remediated RPC.
- [ ] Grants match intended audience; mutation RPCs have explicit authorization (function gate or RLS).
- [ ] Ripgrep callsite inventory included in PR description; Appendix A updated (no TBD).
- [ ] CI security gates pass; SQL catalog checks show zero remaining allowlist exceptions.

---

## Final verdict

Ship-worthy after you tighten the above. The PRD is already pointed in the right direction—just remove the “soft spots” (assumptions, TBDs, and the template inconsistency) so review doesn’t turn into a philosophical seminar.
