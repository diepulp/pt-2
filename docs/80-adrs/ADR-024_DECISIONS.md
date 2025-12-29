# ADR-024: RLS Context Self-Injection Anti-Pattern Remediation - Decisions

**Status:** Accepted (Frozen)
**Date:** 2025-12-29
**Owner:** Security/Platform
**Decision Scope:** RLS context injection across all client-callable RPCs
**Supersedes:** Partially supersedes ADR-015 Phase 1A "self-injection" pattern
**Related:** ADR-015, ADR-020, SEC-001, SEC-002

---

## Context

ADR-015 Phase 1A introduced "RPC self-injection" where RPCs call `set_rls_context()` internally to ensure context is set within the same transaction. This pattern is vulnerable to **context spoofing** because:

1. `set_rls_context(p_actor_id, p_casino_id, p_staff_role)` is callable by the `authenticated` role
2. Session variables (`app.actor_id`, `app.casino_id`, `app.staff_role`) are user-writable via `set_rls_context()`
3. COALESCE prioritizes session variables over JWT claims
4. RPCs read from `current_setting()` which returns attacker-controlled values

**Impact:** Multi-tenant isolation is compromised. Attackers can access data from other casinos, escalate their role to `admin` or `pit_boss`, and impersonate other staff members.

---

## Decision

### Replace Spoofable Context Injection with Authoritative Derivation

Create a new function `set_rls_context_from_staff()` that:

1. Takes **NO spoofable parameters** (only optional correlation_id for tracing)
2. Derives `staff_id` from JWT `app_metadata.staff_id` claim (authoritative source)
3. Binds `staff_id` claim to `auth.uid()` (prevents mis-issued token escalation)
4. Looks up `casino_id` and `role` from the `staff` table (authoritative source)
5. Validates staff is `active` and casino-scoped before setting context
6. Sets transaction-local context via `SET LOCAL` (pooler-safe)
7. Caps correlation_id length/charset to protect logs

### Update All Affected RPCs

Replace the vulnerable self-injection pattern in all 16 affected RPCs with a call to `set_rls_context_from_staff()`.

### Deprecate Old set_rls_context()

After all RPCs are updated, revoke execute permission from `authenticated` role.

### Define Ops Lane (Internal Context Setter)

Create a separate internal setter `set_rls_context_internal()` callable only by `service_role` for ops/migration scenarios.

---

## Security Invariants

**INV-1:** `set_rls_context(...)` MUST NOT be executable by `authenticated` or `PUBLIC` roles.

**INV-2:** Only `set_rls_context_from_staff()` is callable by client roles for context injection.

**INV-3:** Staff identity MUST be bound to `auth.uid()` even when `staff_id` claim exists in JWT.

**INV-4:** Inactive staff MUST be blocked from deriving context.

**INV-5:** Context MUST be set via `SET LOCAL` and MUST NOT leak across transactions (pooling safety).

**INV-6:** Staff lookup MUST be deterministic (unique `staff.user_id` constraint, no `LIMIT 1` ambiguity).

**INV-7:** All client-callable RPCs that depend on session vars MUST call `set_rls_context_from_staff()`.

**INV-8:** No client-callable RPC may accept `casino_id`/`actor_id` as user input (ops-only exceptions allowed).

---

## Consequences

### Positive

- **Security:** Eliminates context spoofing attack vector
- **Trust Boundary:** Context is now derived from authoritative sources (JWT + staff table), not spoofable parameters
- **Defense in Depth:** Even if an attacker finds another way to set session vars, RPCs will overwrite them with authoritative values
- **Minimal Blast Radius:** Changes are contained to RPC definitions; RLS policies unchanged
- **Backward Compatible:** RPCs still set the same `app.*` context vars; downstream behavior identical

### Negative

- **Staff Table Lookup:** Each RPC call now queries the `staff` table (indexed lookup by `id` and/or `user_id`)
- **Migration Effort:** 16 RPCs need to be updated
- **Breaking Change (Minor):** Any code that relied on pre-setting session vars before calling RPCs will no longer work (this is the intended security fix)

### Neutral

- `set_rls_context()` remains available for internal/migration use, but revoked from `authenticated`
- RLS policies continue to use `COALESCE(current_setting(), jwt)` pattern; safe when client-callable code cannot set `app.*` except via `set_rls_context_from_staff()`
- No changes to TypeScript service layer required

---

## Alternatives Considered

### Option A: Harden set_rls_context() with Validation

Add validation to `set_rls_context()` to verify parameters match JWT claims.

**Rejected:** Adds complexity and still requires trusting input parameters. Cleaner to remove parameters entirely.

### Option B: JWT-Only Pattern (ADR-015 Phase 3)

Remove `SET LOCAL` entirely, use only `auth.jwt()` in RLS policies.

**Deferred:** This is the correct long-term solution (Track B per ADR-020), but requires rewriting 116 RLS policies. The current fix provides equivalent security with less risk.

### Option C: Must-Match Pattern in RLS Policies

Require session vars to match JWT when both exist.

**Deferred:** Requires updating all 116 RLS policies. RPC-level fix is more targeted.

---

## Rationale

### Why This Fix Over Track B Migration

| Factor | set_rls_context_from_staff() | Track B (JWT-only) |
|--------|------------------------------|---------------------|
| Scope | 16 RPCs | 116 RLS policies |
| Risk | Low (RPC definitions only) | High (all data access) |
| Timeline | 1 migration | Multiple migrations |
| Security | Equivalent (authoritative source) | Equivalent (JWT is authoritative) |
| Pooling | Compatible (SET LOCAL) | Native (no SET LOCAL) |

### Why Derive from Staff Table

The `staff` table is the authoritative source for `casino_id`, `role`, and `status`. Deriving at RPC time ensures:

1. No stale JWT claims (role changes take effect immediately)
2. Inactive staff are blocked even with valid JWTs
3. Casino assignment changes are enforced immediately
4. Deterministic identity binding with unique `staff.user_id`

---

## References

- EXEC-SPEC: `docs/20-architecture/specs/ADR-024/EXEC-SPEC-024.md`
- DoD Gates: `docs/20-architecture/specs/ADR-024/DOD-024.md`
- [ADR-015: RLS Connection Pooling Strategy](./ADR-015-rls-connection-pooling-strategy.md)
- [ADR-020: RLS Track A MVP Strategy](./ADR-020-rls-track-a-mvp-strategy.md)
- [SEC-001: RLS Policy Matrix](../30-security/SEC-001-rls-policy-matrix.md)

---

## Changelog

- 2025-12-29: Initial ADR created based on security audit findings
- 2025-12-29: ADR frozen - implementation details moved to EXEC-SPEC-024.md
