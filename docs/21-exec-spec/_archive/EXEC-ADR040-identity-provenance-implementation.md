---
spec_id: EXEC-ADR040
title: "ADR-040 Identity Provenance Rule — Implementation"
prd: ADR-040
source: docs/80-adrs/ADR-040-identity-provenance-rule.md
status: proposed
created: 2026-03-07

workstreams:
  WS1:
    name: "Category A RPC Identity Derivation"
    executor: rls-expert
    executor_type: skill
    depends_on: []
    outputs:
      - "supabase/migrations/YYYYMMDDHHMMSS_adr040_loyalty_identity_derivation.sql"
    gate: schema-validation

  WS2:
    name: "Category B Same-Casino Staff Validation"
    executor: rls-expert
    executor_type: skill
    depends_on: []
    outputs:
      - "supabase/migrations/YYYYMMDDHHMMSS_adr040_category_b_staff_validation.sql"
    gate: schema-validation

  WS3:
    name: "Loyalty Service Layer Hardening"
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS1]
    outputs:
      - "services/loyalty/dtos.ts"
      - "services/loyalty/schemas.ts"
      - "services/loyalty/crud.ts"
    gate: type-check

  WS5:
    name: "SEC-003 Gate Expansion"
    executor: rls-expert
    executor_type: skill
    depends_on: []
    outputs:
      - "supabase/tests/security/03_identity_param_check.sql"
    gate: test-pass

  WS6:
    name: "Identity Provenance Integration Tests"
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS1, WS2, WS3, WS5]
    outputs:
      - "supabase/tests/security/adr040_identity_provenance.test.sql"
    gate: test-pass

  WS7:
    name: "Release Documentation"
    executor: lead-architect
    executor_type: skill
    depends_on: [WS1, WS2, WS3, WS5, WS6]
    outputs:
      - "docs/80-adrs/ADR-040-identity-provenance-rule.md"
    gate: build

execution_phases:
  - name: "Database Migrations (RPC Rewrites)"
    parallel: [WS1, WS2, WS5]
    gate: schema-validation
  - name: "Service Layer Cleanup"
    parallel: [WS3]
    gate: type-check
  - name: "Integration Tests & Documentation"
    parallel: [WS6, WS7]
    gate: test-pass
---

# EXEC-ADR040: Identity Provenance Rule Implementation

## Scope

Implement ADR-040 Definition of Done: remove Category A spoofable identity params from 2 loyalty RPCs, add Category B same-casino staff validation to 4 chip custody RPCs, expand SEC-003 gate, update service layer, and write integration tests.

### Scope Corrections

- `rpc_create_financial_txn` — does not exist in codebase. Removed from scope.
- `rpc_create_financial_adjustment` — does not exist in codebase. Removed from scope.
- WS4 (Route Handler Override) — eliminated. Both loyalty route handlers pass the full validated `input` object to the service without destructuring identity fields. WS3 (DTO/schema/crud cleanup) is sufficient; no route handler changes needed.
- Chip custody RPCs are already `LANGUAGE plpgsql` with ADR-024 preamble (done by PRD-041/EXEC-044). Only Category B validation inserts needed.
- `requested_by`, `authorized_by`, `removed_by`, `counted_by` already use `v_context_actor_id` — Category A compliant. Only `p_delivered_by`, `p_received_by`, `p_sent_by`, `p_witnessed_by`, `p_verified_by` need Category B validation.

---

## WS1: Category A RPC Identity Derivation

**Type:** database
**Bounded Context:** loyalty-service
**Executor:** rls-expert
**Dependencies:** none

### Objective

Remove `p_awarded_by_staff_id` from `rpc_manual_credit` and `p_issued_by_staff_id` from `rpc_redeem`. Replace with `v_context_actor_id` derived from `current_setting('app.actor_id')` per ADR-040 canonical preamble.

### Current State

Latest versions in `supabase/migrations/20260306223803_prd044_d3d4_remove_p_casino_id.sql`:

**`rpc_redeem`** (line 309):
- Signature: `(p_player_id, p_points, p_issued_by_staff_id, p_note, p_idempotency_key, p_allow_overdraw, p_reward_id, p_reference)` — 8 params
- `p_issued_by_staff_id` used at:
  - Line 450: `staff_id` column in `INSERT INTO loyalty_ledger`
  - Line 465: `approved_by_staff_id` in overdraw metadata
- Already calls `PERFORM set_rls_context_from_staff()` (line 336) but does not derive actor_id

**`rpc_manual_credit`** (line 503):
- Signature: `(p_player_id, p_points, p_awarded_by_staff_id, p_note, p_idempotency_key)` — 5 params
- `p_awarded_by_staff_id` used at:
  - Line 602: `staff_id` column in `INSERT INTO loyalty_ledger`
  - Line 609: `awarded_by_staff_id` in manual_credit metadata
- Already calls `PERFORM set_rls_context_from_staff()` (line 525) but does not derive actor_id

### Gold Standard (pattern to replicate)

`rpc_issue_mid_session_reward` in `20260302230030_fix_sec007_p1_rpc_toctou_context.sql`:
```sql
v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
IF v_context_actor_id IS NULL THEN
  RAISE EXCEPTION 'actor_id missing from context';
END IF;
-- Uses v_context_actor_id in ledger INSERT instead of parameter
```

### SECURITY INVOKER Compatibility Note

Both loyalty RPCs use `SECURITY INVOKER` (not DEFINER). `SET LOCAL` GUCs from `set_rls_context_from_staff()` are transaction-scoped and visible to all functions within the same transaction regardless of DEFINER/INVOKER context. The `current_setting('app.actor_id')` derivation works identically in both modes.

### Metadata Key Handling

Keep existing JSON key names (`awarded_by_staff_id`, `approved_by_staff_id`) for backward compatibility with reporting queries. Only change the **value source** from the removed parameter to `v_context_actor_id`. Example:

```sql
-- Before: 'awarded_by_staff_id', p_awarded_by_staff_id
-- After:  'awarded_by_staff_id', v_context_actor_id
```

### Outputs

1. **Migration**: `supabase/migrations/YYYYMMDDHHMMSS_adr040_loyalty_identity_derivation.sql`
   - DROP old `rpc_redeem` signature (8 params including `p_issued_by_staff_id`)
   - CREATE new `rpc_redeem` (7 params — remove `p_issued_by_staff_id`)
     - Add `v_context_actor_id` derivation after `set_rls_context_from_staff()`
     - Replace `p_issued_by_staff_id` with `v_context_actor_id` in ledger INSERT (staff_id column)
     - Replace `p_issued_by_staff_id` in overdraw metadata value with `v_context_actor_id` (keep JSON key name)
   - DROP old `rpc_manual_credit` signature (5 params including `p_awarded_by_staff_id`)
   - CREATE new `rpc_manual_credit` (4 params — remove `p_awarded_by_staff_id`)
     - Add `v_context_actor_id` derivation after `set_rls_context_from_staff()`
     - Replace `p_awarded_by_staff_id` with `v_context_actor_id` in ledger INSERT (staff_id column)
     - Replace `p_awarded_by_staff_id` in manual_credit metadata value with `v_context_actor_id` (keep JSON key name)
   - REVOKE/GRANT per existing pattern
   - `NOTIFY pgrst, 'reload schema'`

### Validation

- `npm run db:types-local` succeeds (schema regeneration)
- TypeScript type-check reveals crud.ts breakage (expected — fixed by WS3)

---

## WS2: Category B Same-Casino Staff Validation

**Type:** database
**Bounded Context:** table-context-service
**Executor:** rls-expert
**Dependencies:** none

### Objective

Add same-casino validation for all Category B staff UUID parameters in chip custody RPCs. Reject cross-tenant staff references per ADR-040 INV-8b.

### Current State

Latest versions in `supabase/migrations/20260303195220_prd041_phase_b_tablecontext_derive.sql`. All 4 RPCs already have:
- `LANGUAGE plpgsql SECURITY DEFINER`
- ADR-024 preamble with `set_rls_context_from_staff()`
- `v_casino_id` derived from context
- Category A params (`requested_by`, `authorized_by`, `removed_by`, `counted_by`) already use `v_context_actor_id`

Only these Category B params lack tenant-scope validation:

| RPC | Category B Params (need validation) |
|-----|-------------------------------------|
| `rpc_request_table_fill` | `p_delivered_by`, `p_received_by` |
| `rpc_request_table_credit` | `p_sent_by`, `p_received_by` |
| `rpc_log_table_drop` | `p_witnessed_by` |
| `rpc_log_table_inventory_snapshot` | `p_verified_by` |

### Validation Pattern (insert after preamble, before business logic)

**Required params** (no DEFAULT NULL — always validate):
```sql
-- ADR-040 INV-8b: Category B same-casino validation (required param)
IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_delivered_by AND casino_id = v_casino_id) THEN
  RAISE EXCEPTION 'SEC-007: staff % does not belong to casino context', p_delivered_by;
END IF;
```

**Optional params** (DEFAULT NULL — NULL-guard before validation):
```sql
-- ADR-040 INV-8b: Category B same-casino validation (optional param)
IF p_verified_by IS NOT NULL THEN
  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_verified_by AND casino_id = v_casino_id) THEN
    RAISE EXCEPTION 'SEC-007: staff % does not belong to casino context', p_verified_by;
  END IF;
END IF;
```

**Parameter nullability (from current signatures):**

| RPC | Param | Nullable | Validation |
|-----|-------|----------|------------|
| `rpc_request_table_fill` | `p_delivered_by` | NO | Unconditional |
| `rpc_request_table_fill` | `p_received_by` | NO | Unconditional |
| `rpc_request_table_credit` | `p_sent_by` | NO | Unconditional |
| `rpc_request_table_credit` | `p_received_by` | NO | Unconditional |
| `rpc_log_table_drop` | `p_witnessed_by` | NO | Unconditional |
| `rpc_log_table_inventory_snapshot` | `p_verified_by` | YES (`DEFAULT NULL`) | NULL-guarded |

### Outputs

1. **Migration**: `supabase/migrations/YYYYMMDDHHMMSS_adr040_category_b_staff_validation.sql`
   - DROP + CREATE all 4 RPCs with validation blocks added after preamble
   - **Signature preservation**: signatures MUST match byte-for-byte with the authoritative PRD-041 definitions:
     - parameter names, order, types, defaults
     - return type
     - `SECURITY DEFINER`
     - `SET search_path = pg_catalog, public`
     - volatility (default VOLATILE)
     - `REVOKE ALL ... FROM PUBLIC, anon` + `GRANT EXECUTE ... TO authenticated, service_role`
     - `COMMENT ON FUNCTION` (if present)
   - `NOTIFY pgrst, 'reload schema'`

### Validation

- `npm run db:types-local` succeeds (no signature changes, so types should be stable)

---

## WS3: Loyalty Service Layer Hardening

**Type:** service-layer
**Bounded Context:** loyalty-service
**Executor:** backend-service-builder
**Dependencies:** [WS1]

### Objective

Remove `issuedByStaffId` and `awardedByStaffId` from client-facing DTOs, Zod schemas, and CRUD layer. After WS1 removes these params from RPC signatures, the TypeScript layer must stop referencing them.

### Changes

**`services/loyalty/dtos.ts`:**
- Remove `issuedByStaffId: string` from `RedeemInput` (line 163)
- Remove `awardedByStaffId: string` from `ManualCreditInput` (line 220)

**`services/loyalty/schemas.ts`:**
- Remove `issuedByStaffId: uuidSchema('staff ID')` from `redeemInputSchema` (line 51)
- Remove `awardedByStaffId: uuidSchema('staff ID')` from `manualCreditInputSchema` (line 71)

**`services/loyalty/crud.ts`:**
- Remove `p_issued_by_staff_id: input.issuedByStaffId` from `rpc_redeem` call (line 261)
- Remove `p_awarded_by_staff_id: input.awardedByStaffId` from `rpc_manual_credit` call (line 312)

### Route Handler Impact (WS4 Eliminated)

Both route handlers (`app/api/v1/loyalty/redeem/route.ts`, `app/api/v1/loyalty/manual-credit/route.ts`) pass the full validated `input` object to the service without destructuring identity fields:

```typescript
// redeem/route.ts line 49
const data = await service.redeem(input);

// manual-credit/route.ts line 49
const data = await service.manualCredit(input);
```

After WS3:
1. Zod parse strips unknown fields (any client-supplied `issuedByStaffId` is silently dropped)
2. The validated `input` object no longer contains the field
3. crud.ts no longer passes it to the RPC
4. **No route handler code changes needed**

### Zod Stripping Contract (WS4 elimination guarantee)

The WS4 elimination depends on Zod's default `.strip()` behavior. This must be verified as an explicit contract:

- Schemas MUST use default mode (`.strip()`) or `.strict()` — **NOT** `.passthrough()`
- Route handlers MUST parse the request body through the schema before forwarding to the service
- The parsed value (not the raw request body) MUST be what the handler passes to the service

Verify during execution: `grep -n 'passthrough' services/loyalty/schemas.ts` returns zero matches.

### Validation

- `npm run type-check` passes
- `npm run lint` passes
- Existing loyalty service tests updated if they reference removed fields
- Grep for `issuedByStaffId` and `awardedByStaffId` across `__tests__/` directories — update or remove any references

---

## WS5: SEC-003 Gate Expansion

**Type:** database (SQL test)
**Bounded Context:** security-platform
**Executor:** rls-expert
**Dependencies:** none

### Objective

Expand SEC-003 from narrow `p_created_by_staff_id`-only detection to full identity attribution scanning per ADR-040 Appendix A. Add Category B allowlist with governance metadata.

### Current State

`supabase/tests/security/03_identity_param_check.sql`:
- Check 1: `p_actor_id` → HARD FAIL (lines 37-54)
- Check 2: `p_casino_id` → HARD FAIL with empty allowlist (lines 56-75)
- Check 3: Allowlist drift → NOTICE (lines 77-91)
- Check 4: `p_created_by_staff_id` → NOTICE only (lines 93-134)

### Changes

**Replace Check 4** with expanded identity parameter detection:

**Check 4 (Category A — FAIL):**
Scan for any RPC argument matching Category A identity patterns:
- `p_%_staff_id` (any param ending in `_staff_id` with prefix)
- `p_actor_id`
- `p_created_by_%`, `p_issued_by_%`, `p_awarded_by_%`, `p_approved_by_%`

Use `proargnames` array scanning with pattern matching. Any match is a HARD FAIL — these params must not exist on client-callable RPCs.

After WS1 removes `p_issued_by_staff_id` and `p_awarded_by_staff_id`, this check should pass cleanly.

**Check 5 (Category B — Allowlist-gated FAIL):**
Scan for Category B attribution patterns:
- `p_witnessed_by`, `p_verified_by`, `p_sent_by`, `p_delivered_by`, `p_received_by`

Add a Category B allowlist with governance metadata per ADR-040 §6:

```sql
v_category_b_allowlist text[][] := ARRAY[
  -- {param_name, owning_rpc, category, rationale, validation_rule}
  ARRAY['p_witnessed_by', 'rpc_log_table_drop', 'B', 'ADR-040: multi-party drop witness', 'staff.casino_id check'],
  ARRAY['p_verified_by', 'rpc_log_table_inventory_snapshot', 'B', 'ADR-040: inventory verification', 'staff.casino_id check'],
  ARRAY['p_sent_by', 'rpc_request_table_credit', 'B', 'ADR-040: credit sender attestation', 'staff.casino_id check'],
  ARRAY['p_delivered_by', 'rpc_request_table_fill', 'B', 'ADR-040: fill delivery attestation', 'staff.casino_id check'],
  ARRAY['p_received_by', 'rpc_request_table_fill', 'B', 'ADR-040: fill receipt attestation', 'staff.casino_id check'],
  ARRAY['p_received_by', 'rpc_request_table_credit', 'B', 'ADR-040: credit receipt attestation', 'staff.casino_id check']
];
```

Any Category B param found on an RPC that is NOT in the allowlist is a HARD FAIL.

**Precedence rule (Category A vs Category B overlap):**
If a parameter matches both Category A patterns (e.g., `p_%_staff_id`) AND is explicitly allowlisted as Category B for that specific RPC + param name, then Check 5 governs (Category B allowlist). Otherwise Check 4 applies (Category A FAIL). Implementation: exclude allowlisted `(param_name, rpc_name)` pairs from Check 4 matching.

**Check 6 (Category B allowlist drift):**
Verify all allowlist entries still exist in catalog. Stale entries → NOTICE.

### Outputs

1. **Updated file**: `supabase/tests/security/03_identity_param_check.sql`

### Validation

- Run SEC-003 test against local database: all checks pass
- Verify Check 4 catches Category A params (before WS1 migration: should show `p_issued_by_staff_id`, `p_awarded_by_staff_id`)
- After WS1 migration: Check 4 should pass clean

---

## WS6: Identity Provenance Integration Tests

**Type:** unit-tests (integration)
**Bounded Context:** security-platform
**Executor:** backend-service-builder
**Dependencies:** [WS1, WS2, WS3, WS5]

### Objective

Prove ADR-040 enforcement with integration tests covering both Category A (spoofed delegation rejection) and Category B (cross-casino staff injection rejection).

### Test File

`supabase/tests/security/adr040_identity_provenance.test.sql` (pgTAP or DO block style matching existing SEC-003 pattern)

### Category A Tests

1. **`rpc_manual_credit` derives identity from context:**
   - Call RPC as authenticated staff
   - Verify `loyalty_ledger.staff_id` equals the calling staff's `actor_id` from context
   - Verify `loyalty_ledger.metadata->'manual_credit'->>'awarded_by_staff_id'` equals the authenticated actor_id (metadata value also derived, not spoofed)
   - Verify the RPC no longer accepts `p_awarded_by_staff_id` parameter (call with old positional signature should fail with "function does not exist")

2. **`rpc_redeem` derives identity from context:**
   - Call RPC as authenticated staff
   - Verify `loyalty_ledger.staff_id` equals the calling staff's `actor_id` from context
   - Verify overdraw metadata `approved_by_staff_id` value (if overdraw applied) equals the authenticated actor_id
   - Verify the RPC no longer accepts `p_issued_by_staff_id` parameter (old positional signature fails)

### Category B Tests

3. **Cross-casino staff rejection (per RPC):**
   - Create staff_A in casino_A, staff_B in casino_B
   - Authenticate as staff_A
   - Call `rpc_request_table_fill` with `p_delivered_by = staff_B.id` → expect exception containing `SEC-007`
   - Call `rpc_request_table_credit` with `p_sent_by = staff_B.id` → expect exception
   - Call `rpc_log_table_drop` with `p_witnessed_by = staff_B.id` → expect exception
   - Call `rpc_log_table_inventory_snapshot` with `p_verified_by = staff_B.id` → expect exception

4. **Same-casino staff acceptance:**
   - Create staff_A and staff_C both in casino_A
   - Authenticate as staff_A
   - Call `rpc_log_table_drop` with `p_witnessed_by = staff_C.id` → expect success
   - Call `rpc_log_table_inventory_snapshot` with `p_verified_by = staff_C.id` → expect success

5. **NULL Category B params accepted (optional fields):**
   - Call `rpc_log_table_inventory_snapshot` with `p_verified_by = NULL` → expect success (no validation triggered)

6. **Removed identity fields in request body are ignored (Zod stripping):**
   - Send HTTP POST to `/api/v1/loyalty/manual-credit` with `awardedByStaffId` in request body (spoofed value)
   - Assert request succeeds (field silently stripped by Zod)
   - Assert `loyalty_ledger.staff_id` equals the authenticated actor, NOT the spoofed value
   - This protects against future schema loosening (`.passthrough()`)

### Outputs

1. **Test file**: `supabase/tests/security/adr040_identity_provenance.test.sql`

### Validation

- All tests pass against local Supabase

---

## WS7: Release Documentation

**Type:** documentation
**Bounded Context:** cross-cutting
**Executor:** inline (orchestrator)
**Dependencies:** [WS1, WS2, WS3, WS5, WS6]

### Outputs

1. **ADR-040 DoD checkboxes** — mark all completed items
2. **ADR-040 cleanup** — remove stale references to `rpc_create_financial_txn` and `rpc_create_financial_adjustment` (already done in this session)
3. **Breaking changes note** in ADR-040 changelog:
   - `rpc_redeem`: `p_issued_by_staff_id` parameter removed
   - `rpc_manual_credit`: `p_awarded_by_staff_id` parameter removed
   - Client code supplying these in request bodies will have them silently stripped by Zod validation
   - `loyalty_ledger.staff_id` now always reflects the authenticated actor, not client-supplied values

---

## Definition of Done (from ADR-040 §7)

| DoD Item | Workstream | Status |
|----------|------------|--------|
| Category A params removed from RPC signatures | WS1 | pending |
| Transport-level identity override applied | WS3 (WS4 eliminated) | pending |
| Loyalty service DTOs/schemas updated | WS3 | pending |
| SEC-003 Check 4 broadened | WS5 | pending |
| SEC-003 Check 4 promoted to FAIL | WS5 | pending |
| SEC-003 allowlist for Category B params | WS5 | pending |
| Integration tests: Category A rejection | WS6 | pending |
| Integration tests: Category B rejection | WS6 | pending |
| SEC-003 Category B pattern coverage | WS5 | pending |
| Breaking changes documented | WS7 | pending |

### Removed DoD Items

- ~~Integration test coverage for `rpc_create_financial_adjustment`~~ — RPC does not exist
