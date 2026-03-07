# ADR-040: Identity Provenance Rule — Expanding ADR-024 INV-8

**Status:** Proposed
**Date:** 2026-03-06
**Owner:** Security/Platform
**Amends:** ADR-024 INV-8
**Related:** ADR-024, ADR-015, ADR-018, ADR-030, SEC-001, SEC-003
**Triggered by:** INV-SEC007-DELEGATION-PARAM-SPOOFABILITY-AUDIT

---

## Context

ADR-024 INV-8 currently states:

> "No client-callable RPC may accept `casino_id`/`actor_id` as user input (ops-only exceptions allowed)."

A 5-agent security investigation (INV-SEC007) discovered that this scope is too narrow. Three delegation parameters — `p_awarded_by_staff_id`, `p_issued_by_staff_id`, and `p_created_by_staff_id` — are identity inputs that fall outside INV-8's literal wording but violate its intent.

### Evidence

**Spoofable chain (loyalty RPCs):**
`rpc_manual_credit` and `rpc_redeem` accept `p_awarded_by_staff_id` / `p_issued_by_staff_id` as parameters. These are written directly to `loyalty_ledger.staff_id` and overdraw metadata without validation against `current_setting('app.actor_id')`. The route handlers (`app/api/v1/loyalty/redeem/route.ts`, `manual-credit/route.ts`) pass request body values through without overriding from `rlsContext.actorId`.

**Secured pattern (prior art):** Some RPCs historically compared a redundant caller-supplied identity field to `v_actor_id` and raised on mismatch. ADR-040 treats that as transitional only and prefers removing/deriving Category A identity parameters entirely.

**Gold standard (mid-session reward):**
`rpc_issue_mid_session_reward` (P1-6 fix) removed the staff parameter entirely and derives from `current_setting('app.actor_id')`.

**SEC-003 blind spot:**
Check 4 scans only for `p_created_by_staff_id`. The variants `p_awarded_by_staff_id` and `p_issued_by_staff_id` are invisible to the gate.

**Cross-casino FK gap:**
Chip custody RPCs accept operational attribution params (`p_witnessed_by`, `p_delivered_by`, `p_sent_by`, `p_verified_by`) without validating that the referenced staff belongs to `current_setting('app.casino_id')`. The FK constraint checks existence only, not tenant scope.

---

## Decision

### D1: Expand INV-8 — Identity Provenance Rule

Replace ADR-024 INV-8 with:

> **INV-8 (amended):** No client-callable RPC may accept any identity attribution parameter as user input. Identity attribution includes `casino_id`, `actor_id`, and any parameter that asserts which staff member performed, approved, awarded, issued, or created an operation. Exceptions require:
>
> 1. The parameter represents a separate operational participant (not the execution actor)
> 2. The value is validated for same-casino scope
> 3. The parameter is documented as intentional multi-party attribution
>
> This is the **Identity Provenance Rule**: execution identity must be derived exclusively from the RLS session context established by `set_rls_context_from_staff()`.

### D2: Category A / Category B Classification

All staff identity parameters in RPCs fall into one of two categories:

**Category A — Execution Identity (MUST derive from context)**

Parameters that assert "who performed this operation." These must resolve to `current_setting('app.actor_id')`. Client input must never be trusted.

Includes any parameter with semantics matching:
- `created_by_staff_id`
- `awarded_by_staff_id`
- `issued_by_staff_id`
- `approved_by_staff_id`
- `actor_id`

**Category B — Operational Attribution (allowed with same-casino validation)**

Parameters that name a different participant in a multi-party workflow. These are acceptable when:

1. They model a real-world role distinct from the recording actor (e.g., witness, deliverer, verifier)
2. They are validated for casino scope before use:
   ```sql
   SELECT 1 FROM staff
   WHERE id = p_witnessed_by
     AND casino_id = current_setting('app.casino_id')::uuid;
   ```
3. They are not used as execution identity in any audit trail

Current Category B parameters (chip custody):
- `p_witnessed_by` (`rpc_log_table_drop`)
- `p_verified_by` (`rpc_log_table_inventory_snapshot`)
- `p_sent_by` (`rpc_request_table_credit`)
- `p_delivered_by` (`rpc_request_table_fill`)

### D3: Canonical RPC Identity Block

All client-callable RPCs must begin with this identity derivation pattern:

```sql

DECLARE
    v_actor_id  uuid;
    v_casino_id uuid;
BEGIN
    -- Establish trusted execution context (SoT)
    PERFORM set_rls_context_from_staff();

    -- Derive actor + tenant scope from trusted session settings
    v_actor_id  := NULLIF(current_setting('app.actor_id', true), '')::uuid;
    v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'SEC-007: actor context missing';
    END IF;

    IF v_casino_id IS NULL THEN
        RAISE EXCEPTION 'SEC-007: casino context missing';
    END IF;

    -- Use v_actor_id for ALL execution attribution (Category A)
    -- Validate Category B params against v_casino_id before use
```

This pattern is already implemented in `rpc_issue_mid_session_reward` and post-PRD-044 RPCs. It ensures identity is always derived and fail-closed.

### D4: SEC-003 Gate Expansion

SEC-003 Check 4 must be expanded from a name-specific check to a semantic identity gate:

**Current (narrow):** Scans only for `p_created_by_staff_id`
**Required (expanded):** Scan for any RPC argument matching identity semantics

Detection patterns:
```
p_%_staff_id       — any param ending in staff_id with a prefix
p_actor_id         — direct actor reference
p_created_by_%     — creation attribution
p_issued_by_%      — issuance attribution
p_awarded_by_%     — award attribution
p_approved_by_%    — approval attribution
```

Category B params that pass same-casino validation may be allowlisted with documentation.

Check 4 should be promoted from NOTICE to FAIL once the loyalty RPC remediation is complete.

---

## Remediation Scope

### Immediate (Category A violations — remove or derive)

| RPC | Param | Action |
|-----|-------|--------|
| `rpc_manual_credit` | `p_awarded_by_staff_id` | Replace with `current_setting('app.actor_id')` |
| `rpc_redeem` | `p_issued_by_staff_id` | Replace with `current_setting('app.actor_id')` |

### Optional (defense-in-depth at transport layer)

> Note: These route overrides are **optional** if the request schemas strip/ignore unknown identity fields (no `.passthrough()`) *and* the corresponding RPCs no longer accept identity parameters. Keep the overrides during a transition window if you want belt-and-suspenders.

| Route | Action |
|-------|--------|
| `app/api/v1/loyalty/redeem/route.ts` | Override `issuedByStaffId` from `mwCtx.rlsContext!.actorId` |
| `app/api/v1/loyalty/manual-credit/route.ts` | Override `awardedByStaffId` from `mwCtx.rlsContext!.actorId` |

### Deferred (Category B hardening — add same-casino validation)

| RPC | Param | Action |
|-----|-------|--------|
| `rpc_request_table_fill` | `p_delivered_by` | Add `staff.casino_id` check |
| `rpc_request_table_credit` | `p_sent_by` | Add `staff.casino_id` check |
| `rpc_log_table_drop` | `p_witnessed_by` | Add `staff.casino_id` check |
| `rpc_log_table_inventory_snapshot` | `p_verified_by` | Add `staff.casino_id` check |

---

## Security Invariants (New)

**INV-8a:** Category A identity parameters must be derived from `current_setting('app.actor_id')`. No RPC may accept execution identity from caller input.

**INV-8b:** Category B attribution parameters must validate `staff.casino_id = current_setting('app.casino_id')::uuid` before use. Cross-tenant staff references are prohibited.

**INV-8c:** SEC-003 must detect all identity attribution parameters (not just `p_created_by_staff_id`). Category A params without derivation are FAIL. Category B params without same-casino validation are FAIL.

---

## Consequences

### Positive

- **Closes INV-8 scope gap:** Delegation params can no longer bypass identity provenance
- **Eliminates audit trail poisoning:** Staff cannot attribute actions to other staff within or across casinos
- **Formalizes precedent:** The `rpc_issue_mid_session_reward` P1-6 pattern becomes the documented standard
- **Strengthens SEC-003:** Gate evolves from name-specific to semantic, catching future identity param drift
- **Category B legitimacy preserved:** Chip custody multi-party workflows are explicitly allowed with validation

### Negative

- **Migration effort:** 3 RPCs need Category A remediation, 4 RPCs need Category B validation added
- **Service layer changes:** Loyalty service DTOs and schemas must drop delegation params (or mark them server-only)
- **Breaking change:** Any client code supplying `awarded_by_staff_id` or `issued_by_staff_id` in request bodies will be ignored (identity derived server-side)

### Neutral

- If delegation workflows are needed in the future, they can be implemented as a proper feature with dual-attribution records (`actor_id` + `delegated_to`), authorization rules, and a dedicated ADR exception

---

## Alternatives Considered

### Option A: Validate-then-trust (mismatch check pattern)

Keep delegation params but validate them against `app.actor_id` at the RPC level (as some legacy RPCs did).

**Rejected:** This adds a redundant parameter that must always match context. If it must match, there is no reason to accept it. Deriving from context is simpler and eliminates the attack surface entirely.

### Option B: Route-handler-only fix

Override delegation params from `rlsContext.actorId` at the transport layer, leaving RPC signatures unchanged.

**Rejected:** Defense-in-depth requires the RPC itself to be safe regardless of caller. Route handler overrides are a valid additional layer but not sufficient as the sole protection.

### Option C: Status quo with SEC-003 expansion only

Widen SEC-003 to detect the params but leave them as NOTICE.

**Rejected:** Detection without enforcement creates a false sense of security. The params are currently exploitable.

---

## References

- [INV-SEC007 Investigation](../issues/gaps/sec-007/param-spoofability/INV-SEC007-DELEGATION-PARAM-SPOOFABILITY-AUDIT.md)
- [Identity Provenance Addendum](../issues/gaps/sec-007/param-spoofability/ADDENDUM-SEC007-IDENTITY-PROVENANCE-HARDENING.md)
- [ADR-024: RLS Context Self-Injection Remediation](./ADR-024_DECISIONS.md)
- [ADR-018: SECURITY DEFINER Governance](./ADR-018-security-definer-governance.md)
- [ADR-030: Auth Pipeline Hardening](./ADR-030-auth-system-hardening.md)
- [SEC-003: Identity Parameter Check](../../supabase/tests/security/03_identity_param_check.sql)
- [SEC-001: RLS Policy Matrix](../30-security/SEC-001-rls-policy-matrix.md)

---

## Changelog

- 2026-03-06: ADR proposed based on INV-SEC007 investigation findings
