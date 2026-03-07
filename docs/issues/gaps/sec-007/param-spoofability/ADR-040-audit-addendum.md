# ADR-040 Audit Addendum — Identity Provenance Rule and Valuation Policy Storage

## Verdict

ADR-040 is directionally sound and should be **approved with amendments**, not accepted unchanged.

The architectural intent is solid:

- `set_rls_context_from_staff()` is the source of truth for actor identity.
- Execution identity is not client-supplied business data.
- Client-callable RPCs must not expose alternate identity channels.
- Legitimate multi-party attribution fields may remain only when they are treated as domain data, not execution identity.

That direction is supported by the investigation and the hardening addendum. The weak spots are not in the core thesis, but in the governance, rollout, and enforcement details.

---

## What the ADR Gets Right

### 1) It correctly reframes the problem

The ADR properly moves the discussion away from “is this field useful to the business?” toward the real question:

> Can this parameter influence or override execution identity?

That is the correct frame. The issue is not whether a field carries some operational meaning. The issue is whether a client-controlled input can be mistaken for actor provenance.

### 2) It aligns with the emerging system source of truth

The current security direction is coherent:

- identity is derived from authenticated context,
- tenant scope is derived from that same trusted context,
- business procedures should consume derived identity rather than accept it from clients.

That makes the ADR consistent with the post-SEC-007 tightening rather than some detached policy sermon.

### 3) It preserves a valid distinction between execution identity and domain attribution

The ADR is right to separate:

- **Category A** — execution identity / provenance fields that must be derived,
- **Category B** — domain attribution / custody / witness / delegation fields that may remain as inputs, but only under strict validation.

That distinction is necessary. Without it, the system either becomes insecure or unusably rigid.

---

## Gaps and Weak Spots

### 1) The ADR is trying to do too many jobs at once

Right now the document mixes together:

- architecture decision,
- security classification scheme,
- canonical implementation pattern,
- rollout plan,
- SEC-003 gate policy,
- allowlist governance.

That makes the document heavier and harder to maintain.

### Recommendation

Split the ADR more cleanly into these sections:

1. **Decision**
2. **Security invariants**
3. **Classification model (Category A / Category B)**
4. **Implementation guidance**
5. **Rollout / compatibility**
6. **Enforcement and CI implications**

Same content, cleaner boundaries. Otherwise any future SEC-003 tuning creates needless ADR churn.

---

### 2) Category B needs tighter audit semantics

The ADR says Category B parameters are allowed when they do not serve as execution identity and are validated within tenant scope. Good. But it should go further.

A lingering risk remains if downstream code, reports, or auditors can blur:

- who **performed** the action,
- who **witnessed** it,
- who **received** it,
- who was **delegated** or otherwise associated.

If those semantics are not made explicit, somebody will eventually flatten them into one muddy attribution model and reintroduce the same security confusion in a different costume.

### Recommendation

Require Category B fields to satisfy all of the following:

- semantically distinct naming,
- explicit same-casino validation,
- explicit statement that they are **not execution identity**,
- explicit prohibition on using them as the primary actor in audit trails,
- documented rationale for why they remain client-supplied.

---

### 3) The canonical RPC pattern should be singular, not implied

The ADR and supporting addendum both point toward the same hardened shape, but the ADR should name one pattern as canonical, not leave room for “equivalent enough” variants.

### Recommendation

State plainly that every client-callable security-sensitive RPC must begin with the same preamble:

```sql
PERFORM public.set_rls_context_from_staff();

v_actor_id := NULLIF(current_setting('app.current_staff_id', true), '')::uuid;
v_casino_id := NULLIF(current_setting('app.current_casino_id', true), '')::uuid;

IF v_actor_id IS NULL OR v_casino_id IS NULL THEN
  RAISE EXCEPTION 'SECURITY ERROR: missing trusted execution context';
END IF;
```

Then derive all execution identity from those values.

Do not let developers choose between several “roughly similar” patterns. That is how drift crawls back in.

---

### 4) SEC-003 allowlist governance is underspecified

The ADR sensibly allows Category B fields to survive SEC-003, but it does not place enough discipline around that exception path.

Without stronger governance, the allowlist becomes a junk drawer for awkward leftovers.

### Recommendation

Require each SEC-003 allowlist entry to include:

- parameter name,
- owning RPC,
- category designation,
- linked ADR or exec-spec rationale,
- validation rule summary,
- explicit confirmation that it cannot affect actor provenance,
- security test coverage reference.

That turns the allowlist into a governed exception mechanism rather than a quiet pile of technical debt.

---

### 5) The Definition of Done is too soft

The supporting artifacts clearly indicate that gaps remain in tests and coverage. The ADR should convert those observations into non-negotiable acceptance conditions.

### Recommendation

Add a **Definition of Done** section requiring all of the following before the work is considered complete:

- Category A provenance parameters removed or derived,
- transport-level identity override paths removed,
- SEC-003 broadened to detect both overloaded-parameter and delegated-identity variants,
- integration tests added for spoof attempts,
- cross-casino delegation rejection tests added,
- explicit coverage for `rpc_create_financial_adjustment`,
- migration and client contract notes documented.

Without this, the ADR remains right in theory while leaving the blast radius half-treated.

---

### 6) Deprecation behavior should be explicit

The current framing that legacy identity parameters may be “ignored” is too permissive.

Silently ignoring malicious or obsolete inputs is how bad client behavior persists forever.

### Recommendation

Declare a phased policy:

- **Phase 1:** deprecate and log usage,
- **Phase 2:** reject deprecated identity parameters with a contract error,
- **Phase 3:** remove them from signatures entirely where feasible.

That is cleaner than quietly discarding them and pretending the problem died.

---

## Suggested Improvements to Fold into ADR-040

### A. Tighten the core invariant

Add a concise invariant block:

> Actor identity and tenant scope for client-callable RPCs must be derived exclusively from trusted execution context established by `set_rls_context_from_staff()`. No client-supplied parameter may create, override, or ambiguate execution provenance.

That sentence should sit near the top and act as the document’s spine.

### B. Make Category B a constrained exception, not a relaxed escape hatch

Add a paragraph clarifying that Category B parameters are acceptable only when:

- they represent legitimate domain relationships,
- they are validated against trusted tenant scope,
- they are not used as actor provenance,
- they have a documented business and security rationale.

### C. Add explicit audit-field semantics

Recommend naming rules such as:

- `created_by_staff_id` / `performed_by_staff_id` = derived execution identity
- `witnessed_by_staff_id` / `approved_by_staff_id` / `recipient_staff_id` = validated domain attribution

That distinction should be enforced consistently in schema, RPCs, and reporting.

### D. Add an enforcement appendix or implementation note

Move SEC-003 detection patterns, example grep rules, or CI gate specifics out of the core decision section and into an appendix or implementation notes section.

The policy should remain stable even if the detector evolves.

---

## Open Question: Valuation Policy Storage

### Decision

Use a **separate table**, not a `casino_settings` field.

### Why this is the better choice

Valuation policy is not just another convenience setting.

It is operational policy with likely future needs for:

- auditability,
- explicit ownership,
- effective dating,
- possible version history,
- clean migration boundaries,
- independent querying,
- possible future branching by policy type or valuation basis.

Stuffing this into `casino_settings` would turn that table into an increasingly overloaded junk drawer.

That may feel expedient for one migration, but it will age badly.

### Recommended direction

Create a dedicated table such as:

- `valuation_policy`

Suggested columns:

- `id`
- `casino_id`
- `policy_type` or `valuation_basis`
- `currency_code`
- `point_to_cash_rate` or normalized valuation fields
- `effective_from`
- `effective_to` nullable
- `is_active`
- `created_by_staff_id`
- `created_at`
- `notes` or `metadata` sparingly

### Optional convenience

If the application wants a quick pointer to the current active policy, `casino_settings` may store a foreign key reference to the active row.

But the policy record itself should not live inline inside `casino_settings`.

---

## Why Not `casino_settings`?

Using `casino_settings` is only justified if the policy is all of the following:

- single-valued,
- non-historical,
- operationally trivial,
- rarely changed,
- never independently queried,
- not compliance-relevant.

That does not appear to match the system trajectory.

Given the project’s current direction, valuation policy is much more likely to expand than to shrink. So burying it in a settings blob or settings row is the usual false economy.

---

## Final Recommendation

Approve ADR-040 **after revision**, with these conditions:

1. sharpen the invariant around trusted execution identity,
2. tighten Category B governance and audit semantics,
3. define one canonical RPC identity-derivation preamble,
4. convert testing and enforcement into explicit Definition of Done criteria,
5. make deprecation behavior explicit and phased,
6. choose a **separate `valuation_policy` table** as the prerequisite storage model for Artifact 4.

That keeps the ADR sound, reduces future ambiguity, and avoids solving a provenance problem while quietly creating a policy-modeling problem beside it.
