# ADDENDUM — Identity Provenance & Delegation Parameter Hardening
Related to: INV-SEC007-DELEGATION-PARAM-SPOOFABILITY-AUDIT  
Date: 2026-03-06  
Purpose: Provide architectural clarification and remediation guidance following the investigation findings.

---

# 1. Context Clarification

During the SEC-007 remediation work, the legacy RPC `set_rls_context` was formally deprecated.

The authoritative identity source is now:

```sql
set_rls_context_from_staff()
```

This function establishes the trusted execution context for each request and sets the session variables used throughout the system:

```sql
app.actor_id
app.casino_id
app.staff_role
```

These values are injected into the PostgreSQL session and are considered the **single source of truth (SoT)** for identity and tenancy within the database execution context.

All identity attribution must therefore originate from:

```sql
current_setting('app.actor_id')
current_setting('app.casino_id')
```

Client-provided identity fields must never be trusted unless validated against this context.

---

# 2. Architectural Principle: Identity Provenance Rule

The investigation surfaced a broader architectural rule that should be formalized in ADR-024.

## Identity Provenance Rule

Client-callable RPCs must not accept identity parameters from untrusted sources.

Identity parameters include, but are not limited to:

```text
casino_id
actor_id
staff_id
created_by
issued_by
awarded_by
approved_by
```

Instead, identity must always be derived from the RLS session context:

```sql
current_setting('app.actor_id')
current_setting('app.casino_id')
```

## Rationale

Identity attribution is **execution context**, not business data.

Allowing identity values to enter the system through RPC parameters creates alternate identity channels and enables spoofability.

SEC-007 enforcement ensures identity is derived exclusively from authenticated session state.

---

# 3. Identity vs Attribution: Important Distinction

The investigation revealed two categories of identity fields.

## Category A — Execution Identity (MUST be derived)

These fields represent **who performed the operation**.

Examples:

```text
created_by_staff_id
awarded_by_staff_id
issued_by_staff_id
approved_by_staff_id
```

These must always resolve to:

```sql
current_setting('app.actor_id')
```

Client input must never be trusted for these values.

## Category B — Operational Attribution (Allowed with validation)

Certain operational workflows legitimately involve multiple staff members.

Examples from chip custody workflows:

```text
p_witnessed_by
p_verified_by
p_sent_by
p_delivered_by
```

These represent **participants in the operational process**, not the actor executing the RPC.

These parameters are acceptable when:

1. They represent real-world roles
2. They are validated for casino scope
3. They are not used as execution identity

Example validation pattern:

```sql
SELECT 1
FROM staff
WHERE id = p_witnessed_by
AND casino_id = current_setting('app.casino_id')::uuid;
```

---

# 4. Canonical RPC Identity Template

To prevent recurrence of spoofability patterns, all client-callable RPCs should follow a standardized identity pattern.

## Recommended Template

```sql
DECLARE
    v_actor_id uuid := NULLIF(current_setting('app.actor_id', true), '')::uuid;
    v_casino_id uuid := NULLIF(current_setting('app.casino_id', true), '')::uuid;
BEGIN

IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'SEC-007: actor context missing';
END IF;

IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'SEC-007: casino context missing';
END IF;

-- Use v_actor_id for all execution attribution
```

This pattern ensures:

- identity is always derived
- spoofable parameters cannot override attribution
- execution context is guaranteed before database mutation

---

# 5. Security Gate Hardening (SEC-003)

The investigation identified that **SEC-003 Check 4** currently scans only for a single parameter name:

```text
p_created_by_staff_id
```

This approach is fragile and can miss identity spoofing vectors.

## Recommended Improvement

Extend the check to detect any RPC argument referencing staff identity.

Example detection strategy:

Scan for argument names containing patterns such as:

```text
staff
_actor
_created
_issued
_awarded
_approved
```

Alternatively:

Reject any RPC parameter referencing the `staff` table unless explicitly allowlisted.

This converts SEC-003 from a **name-specific gate** into a **semantic identity gate**.

---

# 6. Multi-Tenant Integrity Hardening

The investigation revealed a cross-casino attribution vector:

```text
ledger.casino_id = Casino A
staff_id = Casino B employee
```

This occurs because the FK constraint validates only existence:

```text
staff(id)
```

and not tenant alignment.

## Recommended Validation Pattern

Where staff references appear in operational attribution parameters:

```sql
SELECT 1
FROM staff
WHERE id = p_staff_id
AND casino_id = current_setting('app.casino_id')::uuid;
```

This prevents cross-tenant attribution contamination.

---

# 7. ADR Implications

The findings suggest the need to clarify ADR-024.

## Recommended ADR Amendment

Original principle:

> No RPC may accept `casino_id` or `actor_id` as client input.

Expanded principle:

> No client-callable RPC may accept any staff identity attribution parameter as client input unless:
>
> 1. The parameter represents a separate operational participant
> 2. The value is validated against the current casino scope
> 3. The parameter is not used as execution identity

This formalizes the **Identity Provenance Rule** across the system.

---

# 8. Long-Term Governance Recommendation

To prevent recurrence of identity spoofing patterns, introduce the following rule into the security governance framework.

## RPC Identity Contract

Every client-callable RPC must satisfy:

1. Identity is derived from RLS context
2. Execution actor cannot be supplied by caller
3. Any secondary staff references must validate casino scope
4. Security tests must enforce identity derivation

---

# 9. Summary

The investigation uncovered a broader architectural insight beyond the original SEC-007 gap:

The system must enforce **single-source identity provenance**.

All execution identity must originate from the RLS context established by:

```sql
set_rls_context_from_staff()
```

RPC parameters must never introduce alternate identity channels.

Applying this rule consistently will eliminate an entire class of spoofability vulnerabilities and significantly simplify future security auditing.

---

# 10. Recommended Next Step

During remediation, perform a repository-wide scan for RPC arguments containing identity references:

```text
staff_id
created_by
approved_by
issued_by
awarded_by
actor
```

Each occurrence should be evaluated against the Identity Provenance Rule to determine whether it must be derived or validated.

This audit will ensure no additional identity spoofing vectors remain in the codebase.
