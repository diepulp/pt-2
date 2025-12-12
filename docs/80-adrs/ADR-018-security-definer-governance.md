# ADR-018: SECURITY DEFINER Function Governance

**Status:** Implemented
**Date:** 2025-12-12
**Implementation Date:** 2025-12-12
**Owner:** Security/Platform
**Applies to:** All PostgreSQL RPC functions using SECURITY DEFINER
**Decision type:** Security
**Supersedes:** None
**Related:** ADR-015, SEC-001, SEC-006

---

## Context

### The Problem

PT-2 uses SECURITY DEFINER functions for service-owned RPCs that require elevated privileges (bypassing Row-Level Security to perform cross-context operations). However, a systematic audit (SEC-006) revealed that **SECURITY DEFINER functions bypass RLS entirely** and several RPCs trusted caller-provided `p_casino_id` without validating against the authenticated context.

**Critical Finding (SEC-006):**

```sql
-- VULNERABLE: Accepts caller-provided casino_id without validation
CREATE OR REPLACE FUNCTION rpc_create_floor_layout(
  p_casino_id uuid,  -- Caller can provide ANY casino_id
  p_name text,
  p_description text,
  p_created_by uuid
) RETURNS floor_layout
LANGUAGE plpgsql
SECURITY DEFINER  -- Bypasses all RLS!
AS $$
BEGIN
  -- No validation that p_casino_id matches authenticated context
  INSERT INTO floor_layout (casino_id, name, ...) VALUES (p_casino_id, ...);
END;
$$;
```

**Risk:** A staff member authenticated to Casino A could invoke `rpc_create_floor_layout('casino-b-uuid', ...)` and create data in Casino B's scope—a direct privilege escalation attack.

### Root Cause Analysis

The original security model assumed:
1. RLS policies would enforce casino scope on all data access
2. RPCs would use SECURITY INVOKER to inherit caller's RLS context

In practice:
1. Several RPCs use SECURITY DEFINER for legitimate privilege elevation
2. These RPCs accept `p_casino_id` as a parameter (for convenience)
3. **No validation** that `p_casino_id` matches authenticated session context
4. SECURITY DEFINER runs with function owner's privileges, **bypassing all RLS**

### Affected Functions (Pre-Remediation)

| Function | Service | Risk |
|----------|---------|------|
| `rpc_create_floor_layout` | FloorLayoutService | Create layouts in any casino |
| `rpc_activate_floor_layout` | FloorLayoutService | Activate layouts in any casino |
| `rpc_log_table_inventory_snapshot` | TableContextService | Log inventory for any casino |
| `rpc_request_table_fill` | TableContextService | Record fills for any casino |
| `rpc_request_table_credit` | TableContextService | Record credits for any casino |
| `rpc_log_table_drop` | TableContextService | Record drops for any casino |
| `rpc_issue_mid_session_reward` | LoyaltyService | Issue points in any casino |

---

## Decision

### Mandatory Context Validation Pattern

All SECURITY DEFINER functions that accept `p_casino_id` as a parameter **MUST validate** it against the authenticated RLS context before executing any data mutations.

**Canonical Pattern (SEC-001 Template 5):**

```sql
CREATE OR REPLACE FUNCTION rpc_example_mutation(
  p_casino_id uuid,
  p_other_params text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, ADR-018)
  -- MANDATORY for all SECURITY DEFINER functions accepting p_casino_id
  -- ═══════════════════════════════════════════════════════════════════════════
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;
  -- ═══════════════════════════════════════════════════════════════════════════

  -- Proceed with mutation only after validation passes
  INSERT INTO table_name (casino_id, ...) VALUES (p_casino_id, ...);
END;
$$;
```

### Alternative: Derive casino_id From Context

For new RPCs, consider **not accepting** `p_casino_id` as a parameter at all:

```sql
CREATE OR REPLACE FUNCTION rpc_create_entity(
  p_name text
  -- NO p_casino_id parameter
) RETURNS entity
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_casino_id uuid;
BEGIN
  -- Derive from context only
  v_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set';
  END IF;

  INSERT INTO entity (casino_id, name) VALUES (v_casino_id, p_name);
END;
$$;
```

**Tradeoff:** This eliminates parameter validation entirely but requires all callers to ensure context is set. The explicit parameter pattern with validation is preferred for clarity and auditability.

### When SECURITY DEFINER Is Appropriate

Use SECURITY DEFINER only when:
1. The function needs to **read/write across tables** with different RLS policies in a single transaction
2. The function performs **system-level operations** (e.g., inserting into audit tables)
3. The function needs to **bypass normal user permissions** for a specific, well-defined purpose

**Prefer SECURITY INVOKER** for:
1. Simple CRUD operations on single tables
2. Functions that should inherit caller's RLS context
3. Read-only queries where RLS should apply

---

## Implementation

### Migration: SEC-006 RLS Hardening

All 7 affected functions were hardened in migration `20251212080915_sec006_rls_hardening.sql`:

```sql
-- Section 2: RPC Context Validation
-- Applies Template 5 validation to all SECURITY DEFINER RPCs
```

### Pre-Commit Hook Enhancement

Add to `.husky/pre-commit-migration-safety.sh`:

```bash
# SEC-006: Scan for SECURITY DEFINER without context validation
check_security_definer_validation() {
  local file="$1"

  # Skip if file doesn't contain SECURITY DEFINER
  if ! grep -q "SECURITY DEFINER" "$file"; then
    return 0
  fi

  # Check if file has context validation pattern
  if ! grep -q "current_setting('app.casino_id'" "$file"; then
    echo "ERROR: SECURITY DEFINER function in $file missing context validation"
    echo "       All SECURITY DEFINER functions accepting p_casino_id must validate"
    echo "       against current_setting('app.casino_id') per ADR-018"
    return 1
  fi

  return 0
}
```

### SEC-001 Amendment

SEC-001 Template 5 is updated to include:

> **Mandatory for SECURITY DEFINER:** All SECURITY DEFINER functions that accept `p_casino_id` as a parameter MUST include context validation per ADR-018. This is enforced by pre-commit hook.

---

## Consequences

### Positive

1. **Privilege Escalation Prevented:** Caller-provided casino_id cannot bypass authenticated context
2. **Defense in Depth:** Validation occurs even if RLS policy has gaps
3. **Audit Trail:** Exception messages clearly identify mismatch attempts
4. **Consistent Pattern:** All service RPCs follow same validation approach
5. **Tooling Support:** Pre-commit hook catches violations early

### Negative

1. **Verbosity:** Every SECURITY DEFINER function needs 15-20 lines of validation boilerplate
2. **Performance:** Minor overhead from context lookup (negligible for most use cases)
3. **Migration Effort:** Existing functions required updates (completed in SEC-006)

### Risks

| Risk | Mitigation |
|------|------------|
| Developers skip validation | Pre-commit hook enforcement |
| Context not set (NULL) | Explicit exception with clear message |
| JWT fallback fails | Pattern C (hybrid) provides dual resolution |

---

## Compliance Matrix

| Requirement | Implementation |
|-------------|----------------|
| All SECURITY DEFINER RPCs validate context | SEC-006 migration applied to 7 functions |
| New RPCs follow pattern | Pre-commit hook + code review |
| Documentation updated | SEC-001 Template 5 + this ADR |
| Audit coverage | SEC-006 audit document tracks all RPCs |

---

## Related Documents

- `docs/30-security/SEC-001-rls-policy-matrix.md` - Template 5 pattern
- `docs/30-security/SEC-006-rls-strategy-audit-2025-12-11.md` - Audit findings
- `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` - Pattern C (hybrid) context
- `supabase/migrations/20251212080915_sec006_rls_hardening.sql` - Implementation

---

## Changelog

| Date | Change |
|------|--------|
| 2025-12-12 | ADR created based on SEC-006 audit findings |
| 2025-12-12 | Implementation via migration `20251212080915_sec006_rls_hardening.sql` |
