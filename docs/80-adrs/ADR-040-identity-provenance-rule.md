# ADR-040: Identity Provenance Rule — Expanding ADR-024 INV-8

**Status:** Accepted
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
> 4. All exceptions must satisfy Category B constraints in D2 (semantic naming, tenant validation, prohibited-as-actor, documented rationale)
>
> This is the **Identity Provenance Rule**: execution identity must be derived exclusively from the RLS session context established by `set_rls_context_from_staff()`.

### D2: Category A / Category B Classification

All staff identity parameters in RPCs fall into one of two categories:

**Category A — Execution Identity (MUST derive from context)**

Parameters that assert "who performed this operation." These must resolve to `current_setting('app.actor_id')`. Client input must never be trusted.

Includes any parameter with semantics matching:
- `created_by_staff_id` / `performed_by_staff_id` — action performer
- `awarded_by_staff_id` — award issuer
- `issued_by_staff_id` — issuance actor
- `approved_by_staff_id` — approval actor
- `actor_id` — direct actor reference

**Naming convention:** Fields named `*_by_staff_id` where the prefix verb implies the RPC's own action (created, issued, awarded, approved) are Category A by default.

**Category B — Operational Attribution (allowed with same-casino validation)**

Parameters that name a different participant in a multi-party workflow. Category B is not a relaxed escape hatch — it is a constrained exception. A parameter qualifies as Category B only when **all** of the following hold:

1. It represents a legitimate domain relationship distinct from the recording actor (e.g., witness, deliverer, verifier, recipient)
2. It is validated for same-casino scope before use:
   ```sql
   SELECT 1 FROM staff
   WHERE id = p_witnessed_by
     AND casino_id = current_setting('app.casino_id')::uuid;
   ```
3. It is **not** used as execution identity in any audit trail or reporting context
4. It uses semantically distinct naming that cannot be confused with execution identity
5. It has a documented business rationale explaining why it must be client-supplied

**Naming convention:** Fields named `*_by` without `staff_id` suffix (e.g., `witnessed_by`, `delivered_by`) or `recipient_staff_id` are Category B candidates.

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

### D5: Ops-Only Exception Governance

Ops-only exceptions are not client-callable; they must be SECURITY DEFINER gated per ADR-018 and invoked only from trusted jobs/admin channels.

---

## Security Invariants

**INV-8a:** Category A identity parameters must be derived from `current_setting('app.actor_id')`. No RPC may accept execution identity from caller input.

**INV-8b:** Category B attribution parameters must validate `staff.casino_id = current_setting('app.casino_id')::uuid` before use. Cross-tenant staff references are prohibited.

**INV-8c:** SEC-003 must detect all identity attribution parameters (not just `p_created_by_staff_id`). Category A params without derivation are FAIL. Category B params without same-casino validation are FAIL.

---

## Remediation Scope

### Immediate — Category A violations (remove or derive)

| RPC | Param | Action |
|-----|-------|--------|
| `rpc_manual_credit` | `p_awarded_by_staff_id` | Replace with `current_setting('app.actor_id')` |
| `rpc_redeem` | `p_issued_by_staff_id` | Replace with `current_setting('app.actor_id')` |

### Optional — Transport layer (defense-in-depth)

> Note: These route overrides are **optional** if the request schemas strip/ignore unknown identity fields (no `.passthrough()`) *and* the corresponding RPCs no longer accept identity parameters. Keep the overrides during a transition window if you want belt-and-suspenders.

| Route | Action |
|-------|--------|
| `app/api/v1/loyalty/redeem/route.ts` | Override `issuedByStaffId` from `mwCtx.rlsContext!.actorId` |
| `app/api/v1/loyalty/manual-credit/route.ts` | Override `awardedByStaffId` from `mwCtx.rlsContext!.actorId` |

### Deferred — Category B hardening (add same-casino validation)

| RPC | Param | Action |
|-----|-------|--------|
| `rpc_request_table_fill` | `p_delivered_by` | Add `staff.casino_id` check |
| `rpc_request_table_credit` | `p_sent_by` | Add `staff.casino_id` check |
| `rpc_log_table_drop` | `p_witnessed_by` | Add `staff.casino_id` check |
| `rpc_log_table_inventory_snapshot` | `p_verified_by` | Add `staff.casino_id` check |

---

## Deprecation and Removal Policy

Legacy identity parameters must not be silently ignored. The removal strategy depends on classification.

### Known Category A violations (identified by INV-SEC007)

These are the parameters explicitly surfaced by the investigation: `p_awarded_by_staff_id` and `p_issued_by_staff_id`. For these, the correct action is:

- **Remove or derive immediately** — no phased rollout. The investigation already provides the evidence and the precedent (`rpc_issue_mid_session_reward` P1-6 fix).
- Add compatibility notes in release documentation where client contracts change.
- Pair each removal with transport-layer hardening and integration tests.

### Legacy or future ambiguous cases

For identity-like parameters discovered later or not yet fully classified, a phased deprecation model applies:

**Phase 1 — Deprecate and log:** Mark parameters as deprecated. Log usage with a structured warning when clients supply them. Server derives and uses context values regardless.

**Phase 2 — Reject:** Return a contract error (`400`) when deprecated identity parameters appear in request bodies. RPC raises an exception if deprecated params are supplied.

**Phase 3 — Remove:** Drop deprecated parameters from RPC signatures and service DTOs/schemas entirely.

---

## Enforcement and CI

### SEC-003 Allowlist Governance

Category B parameters that survive SEC-003 must be registered in a structured allowlist. Each entry requires:

| Field | Required |
|-------|----------|
| Parameter name | Yes |
| Owning RPC | Yes |
| Category designation (B) | Yes |
| Linked ADR or EXEC-SPEC rationale | Yes |
| Validation rule summary | Yes |
| Confirmation: not used as actor provenance | Yes |
| Security test coverage reference | Yes |

This turns the allowlist into a governed exception mechanism rather than accumulated technical debt.

### Detection Patterns

SEC-003 implementation details (patterns, grep rules, CI gate specifics) are documented in Appendix A. The policy in this section remains stable even as detection evolves.

---

## Definition of Done

This ADR is not considered implemented until all of the following are verified:

- [x] Category A provenance parameters removed from RPC signatures or replaced with context derivation
- [x] Transport-level identity override applied to loyalty route handlers (or confirmed unnecessary via Zod stripping)
- [x] Loyalty service DTOs and schemas updated to remove delegation params from client input
- [x] SEC-003 Check 4 broadened to detect all identity attribution param variants
- [x] SEC-003 Check 4 promoted from NOTICE to FAIL
- [x] SEC-003 allowlist entries created for all surviving Category B params with required metadata
- [x] Integration tests: spoofed delegation param rejection (Category A)
- [x] Integration tests: cross-casino staff_id injection rejection (Category B)
- [x] SEC-003 detector patterns cover Category B candidate parameters (at minimum via explicit patterns; ideally via semantic detection of staff FK usage)
- [x] Migration and client contract breaking changes documented in release notes

---

## Consequences

### Positive

- **Closes INV-8 scope gap:** Delegation params can no longer bypass identity provenance
- **Eliminates audit trail poisoning:** Staff cannot attribute actions to other staff within or across casinos
- **Formalizes precedent:** The `rpc_issue_mid_session_reward` P1-6 pattern becomes the documented standard
- **Strengthens SEC-003:** Gate evolves from name-specific to semantic, catching future identity param drift
- **Category B legitimacy preserved:** Chip custody multi-party workflows are explicitly allowed with validation

### Negative

- **Migration effort:** 2 RPCs need Category A remediation, 4 RPCs need Category B validation added
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

## Appendix A: SEC-003 Detection Patterns

The following patterns should be used by SEC-003 Check 4 to detect identity attribution parameters:

```
# Category A — execution identity patterns
p_%_staff_id       — any param ending in staff_id with a prefix
p_actor_id         — direct actor reference
p_created_by_%     — creation attribution
p_issued_by_%      — issuance attribution
p_awarded_by_%     — award attribution
p_approved_by_%    — approval attribution

# Category B — operational attribution patterns
p_(witnessed_by|verified_by|sent_by|delivered_by)  — multi-party attribution
p_%_by             — broader catch-all for *_by params (review as candidates)
```

Parameters matching these patterns must either:
1. Be absent from the RPC signature (Category A — derived from context), or
2. Appear in the governed allowlist with all required metadata (Category B — validated attribution)

Any match not in the allowlist is a FAIL.

---

## Changelog

- 2026-03-06: ADR proposed based on INV-SEC007 investigation findings
- 2026-03-07: Revised per audit addendum — tightened Category B governance, added DoD, deprecation policy, allowlist governance, canonical preamble singularity, appendix separation
- 2026-03-07: Pass 3 amendments — D1↔D2 exception linkage, D3 ops-only SECURITY DEFINER governance, Appendix A Category B detection patterns, DoD Category B coverage bullet
- 2026-03-07: De-referenced rpc_create_financial_txn and rpc_create_financial_adjustment (do not exist in codebase; p_casino_id removal already completed by EXEC-044)
- 2026-03-07: Structural revision — adopted flatter Decision structure (D1-D5), promoted canonical identity block to D3, promoted SEC-003 expansion to D4, added prior-art evidence, marked transport overrides as optional (Zod stripping sufficient), adopted clearer breaking-change language
- 2026-03-07: **IMPLEMENTED** — EXEC-ADR040 complete. Breaking changes:
  - `rpc_redeem`: `p_issued_by_staff_id` parameter removed (7 params, was 8)
  - `rpc_manual_credit`: `p_awarded_by_staff_id` parameter removed (4 params, was 5)
  - Client code supplying `issuedByStaffId`/`awardedByStaffId` in request bodies will have them silently stripped by Zod validation
  - `loyalty_ledger.staff_id` now always reflects the authenticated actor via `current_setting('app.actor_id')`, not client-supplied values
  - Category B same-casino validation added to 4 chip custody RPCs (SEC-007 error on cross-tenant staff references)
  - SEC-003 expanded to 6 checks (Category A FAIL + Category B allowlist-gated FAIL + drift detection)
  - Status changed from Proposed to Accepted
