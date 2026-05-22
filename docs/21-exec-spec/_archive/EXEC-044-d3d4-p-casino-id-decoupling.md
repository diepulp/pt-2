---
spec_id: EXEC-044
prd: PRD-044
prd_ref: PRD-044
title: "D3/D4 p_casino_id Decoupling — Final 4 RPCs"
status: approved
created: 2026-03-06
bounded_contexts:
  - player-financial-service
  - loyalty-service
  - platform/security
pattern: B
http_boundary: false

workstreams:
  WS1:
    name: "Phase 1 SQL Migration — Remove p_casino_id + Hardening"
    type: database
    bounded_context: platform/security
    executor: rls-expert
    executor_type: skill
    depends_on: []
    outputs:
      - "supabase/migrations/{TIMESTAMP}_prd044_d3d4_remove_p_casino_id.sql"
      - "rollback artifact: restore prior 4 RPC signatures"
    gate: schema-validation

  WS2:
    name: "Type Regeneration + TypeScript Cascade"
    type: service-layer
    bounded_context: player-financial-service, loyalty-service
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS1]
    outputs:
      - "types/database.types.ts (regenerated)"
      - "services/player-financial/crud.ts (1 line deleted)"
      - "services/player-financial/http.ts (1 line deleted)"
      - "services/loyalty/crud.ts (2 lines deleted)"
      - "lib/finance.ts (3 lines changed)"
      - "lib/supabase/__tests__/pit-boss-financial-txn.test.ts (~15 lines deleted)"
      - "__tests__/services/table-context/finance-telemetry-bridge.int.test.ts (~6 lines deleted)"
      - "services/loyalty/__tests__/crud.test.ts (~3 lines deleted)"
      - "services/player-financial/__tests__/crud.test.ts (~1 line deleted)"
      - "__tests__/lib/finance.test.ts (~2 lines deleted)"
    gate: type-check

  WS3:
    name: "Phase 3 Cleanup Migration + SEC-003 Enforcement Flip"
    type: database
    bounded_context: platform/security
    executor: rls-expert
    executor_type: skill
    depends_on: [WS2]
    outputs:
      - "supabase/migrations/{TIMESTAMP}_prd044_cleanup_adjustment_compat.sql"
      - "supabase/tests/security/03_identity_param_check.sql (allowlist emptied, enforcement flipped)"
    gate: schema-validation

  WS4:
    name: "DoD Validation Gate"
    type: unit-tests
    bounded_context: platform/security
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS3]
    outputs:
      - "Catalog zero-tolerance query: 0 rows"
      - "run_all_gates.sh: 8/8 pass"
      - "npm run type-check: exit 0"
      - "npm run build: exit 0"
      - "npm run test: all green"
    gate: build

execution_phases:
  - name: "Phase 1 — SQL Migration"
    parallel: [WS1]
  - name: "Phase 2 — TypeScript Cascade"
    parallel: [WS2]
  - name: "Phase 3 — Cleanup + Enforcement"
    parallel: [WS3]
  - name: "Phase 4 — DoD Validation"
    parallel: [WS4]

dod_gates:
  - type-check
  - lint
  - test-pass
  - build
---

# EXEC-044: D3/D4 p_casino_id Decoupling — Final 4 RPCs

## Overview

Remove `p_casino_id` from the last 4 RPCs in the SEC-003 allowlist, zero the allowlist, and flip enforcement to hard-fail. This completes ADR-024 zero-tolerance enforcement for tenant parameter spoofability.

**PRD**: PRD-044
**Predecessor**: PRD-043 (D1+D2 — 10 RPCs, commit `d510025`)
**Pattern**: B (database/security, no HTTP boundary). Note: although no HTTP contract changes are introduced, `rpc_create_financial_adjustment` is invoked from browser-side code, so rollout must respect client-bundle compatibility during the temporary compatibility phase.

## Source Code Analysis (Expert Consultation)

### RPC Current State

| RPC | Security | search_path | REVOKE/GRANT | p_casino_id body sites |
|-----|----------|-------------|--------------|----------------------|
| `rpc_create_financial_txn` | SECURITY INVOKER | `public` | Yes (20260302) | 2 (mismatch + INSERT) |
| `rpc_create_financial_adjustment` | SECURITY INVOKER | `public` | Yes (20260302) | 3 (mismatch + WHERE + INSERT) |
| `rpc_manual_credit` | SECURITY INVOKER | none | **NO** | 7 (mismatch + 4 WHERE + INSERT + INSERT) |
| `rpc_redeem` | SECURITY INVOKER | none | **NO** | 7 (mismatch + 3 WHERE + INSERT + UPDATE WHERE) |

### Variable Naming

- Financial RPCs: `v_casino_id` (derived from context)
- Loyalty RPCs: `v_context_casino_id` (derived from context)

All 4 RPCs already call `PERFORM set_rls_context_from_staff()` as first line.

---

## WS1: Phase 1 SQL Migration

**Executor**: rls-expert
**Pattern**: DROP old signature + CREATE OR REPLACE with new signature (required for param removal)
**Template**: PRD-043 D2 migration (`20260304172336_prd043_d2_remove_loyalty_p_casino_id.sql`)

### Migration Content

Single migration file, wrapped in `BEGIN...COMMIT`:

#### 1. `rpc_create_financial_txn` (13 → 12 params)

- **DROP** old 13-param signature
- **CREATE OR REPLACE** without `p_casino_id`
- Remove mismatch assertion (`IF v_casino_id IS NULL OR v_casino_id <> p_casino_id`)
- Replace `p_casino_id` → `v_casino_id` in INSERT VALUES
- Add fail-closed NULL check: `IF v_casino_id IS NULL THEN RAISE EXCEPTION`
- Change `SET search_path = public` → `SET search_path = pg_catalog, public`
- **REVOKE/GRANT**: Replicate for new 12-param signature
- **COMMENT ON FUNCTION**: Update with new signature

#### 2. `rpc_create_financial_adjustment` (8 → 7 params + DEFAULT NULL compat)

- **DROP** old 8-param signature
- **CREATE OR REPLACE** with `p_casino_id uuid DEFAULT NULL` as LAST param (compat)
- **Compatibility invariant**: `p_casino_id` exists only to absorb stale browser/client payloads during rollout. It must not be read, validated, compared, or written anywhere in the function body. All tenant scoping must derive exclusively from `v_casino_id`.
- Remove mismatch assertion
- Replace `p_casino_id` → `v_casino_id` in WHERE + INSERT
- Add fail-closed NULL check
- Change `SET search_path = public` → `SET search_path = pg_catalog, public`
- **REVOKE/GRANT**: Replicate for new signature
- **COMMENT ON FUNCTION**: Update

#### 3. `rpc_redeem` (9 → 8 params)

- **DROP** old 9-param signature
- **CREATE OR REPLACE** without `p_casino_id`
- Remove mismatch assertion
- Replace all 6 `p_casino_id` → `v_context_casino_id` in WHERE + INSERT + UPDATE
- Add explicit fail-closed guard: `IF v_context_casino_id IS NULL THEN RAISE EXCEPTION 'SEC-007: casino context missing'`
- **ADD** `SET search_path = pg_catalog, public`
- **NEW** REVOKE ALL FROM PUBLIC, anon + GRANT TO authenticated, service_role
- **COMMENT ON FUNCTION**: Update

#### 4. `rpc_manual_credit` (6 → 5 params)

- **DROP** old 6-param signature
- **CREATE OR REPLACE** without `p_casino_id`
- Remove mismatch assertion
- Replace all 7 `p_casino_id` → `v_context_casino_id` in WHERE + INSERT + UPDATE
- Add explicit fail-closed guard: `IF v_context_casino_id IS NULL THEN RAISE EXCEPTION 'SEC-007: casino context missing'`
- **ADD** `SET search_path = pg_catalog, public`
- **NEW** REVOKE ALL FROM PUBLIC, anon + GRANT TO authenticated, service_role
- **COMMENT ON FUNCTION**: Update

#### 5. PostgREST notification

Emit `NOTIFY pgrst, 'reload schema'` only after the migration transaction commits successfully. Place it after the `COMMIT` statement, not inside the transaction block.

#### 6. Rollback artifact

Pre-compute and store rollback migration artifacts before execution. Rollback must restore the exact prior signatures, comments, privileges, and `search_path` settings for all four RPCs. Generate from the authoritative source migrations listed in PRD-044 Appendix A.

### Validation (after WS1)

```bash
npm run db:types-local  # Regenerate types with new signatures
```

---

## WS2: Type Regeneration + TypeScript Cascade

**Executor**: backend-service-builder
**Prerequisite**: `npm run db:types-local` (types must reflect new RPC signatures)

### Production Files (5 files, ~7 line deletions)

| File | Line | Change |
|------|------|--------|
| `services/player-financial/crud.ts` | 152 | Delete `p_casino_id: input.casino_id,` |
| `services/player-financial/http.ts` | 186 | Delete `p_casino_id: input.casino_id,` |
| `services/loyalty/crud.ts` | 259 | Delete `p_casino_id: input.casinoId,` |
| `services/loyalty/crud.ts` | 311 | Delete `p_casino_id: input.casinoId,` |
| `lib/finance.ts` | 6 | Remove `casinoId: string;` from `CreateFinancialTxnArgs` type |
| `lib/finance.ts` | 18 | Remove `casinoId,` from destructure |
| `lib/finance.ts` | 28 | Delete `p_casino_id: casinoId,` from RPC call |

### Test Files (5 files, ~28 line deletions)

| File | Pattern | Change |
|------|---------|--------|
| `lib/supabase/__tests__/pit-boss-financial-txn.test.ts` | `p_casino_id` | Delete ~15 occurrences from RPC call objects |
| `__tests__/services/table-context/finance-telemetry-bridge.int.test.ts` | `p_casino_id` | Delete ~6 occurrences |
| `services/loyalty/__tests__/crud.test.ts` | `p_casino_id` | Delete ~3 occurrences (redeem + manual_credit) |
| `services/player-financial/__tests__/crud.test.ts` | `p_casino_id` | Delete ~1 occurrence |
| `__tests__/lib/finance.test.ts` | `p_casino_id\|casinoId` | Delete ~2 occurrences |

**Note**: `services/security/__tests__/rls-context.integration.test.ts` has string references only — no changes needed.

### Validation (after WS2)

```bash
npm run type-check   # Must pass with 0 errors
```

---

## WS3: Phase 3 Cleanup Migration + SEC-003 Enforcement Flip

**Executor**: rls-expert

### Migration: Cleanup Compatibility Param

- **DROP** the compat signature of `rpc_create_financial_adjustment` (with `p_casino_id DEFAULT NULL`)
- **CREATE OR REPLACE** final clean version without `p_casino_id` at all
- REVOKE/GRANT for final signature
- COMMENT ON FUNCTION
- `NOTIFY pgrst, 'reload schema'`

### SEC-003 Enforcement Flip (sequenced explicitly per audit addendum)

Do not combine allowlist removal and enforcement hardening as one opaque edit. Sequence them so catalog cleanliness is verified before hard-fail behavior is enabled:

1. Apply cleanup migration (DROP+CREATE `rpc_create_financial_adjustment` without `p_casino_id`)
2. Regenerate types: `npm run db:types-local`
3. Confirm zero catalog matches: `SELECT proname FROM pg_proc WHERE proname LIKE 'rpc_%' AND 'p_casino_id' = ANY(proargnames) AND pronamespace = 'public'::regnamespace;` → 0 rows
4. Empty SEC-003 allowlist in `supabase/tests/security/03_identity_param_check.sql`: `v_casino_id_allowlist text[] := ARRAY[]::text[];`
5. Flip SEC-003 Check 2 enforcement from NOTICE to EXCEPTION (change the allowlisted-entry branch)
6. Run security gates to verify

### Validation (after WS3)

```bash
npm run db:types-local  # Regenerate types (adjustment RPC signature changed again)
npm run type-check      # Verify no type errors from cleanup
```

---

## WS4: DoD Validation Gate

**Executor**: backend-service-builder

### Catalog Queries (via psql against local Supabase)

```sql
-- Zero tolerance: no rpc_* with p_casino_id in proargnames
SELECT proname FROM pg_proc
WHERE proname LIKE 'rpc_%'
  AND 'p_casino_id' = ANY(proargnames)
  AND pronamespace = 'public'::regnamespace;
-- Expected: 0 rows

-- Positional args double-check
SELECT proname FROM pg_proc
WHERE proname LIKE 'rpc_%'
  AND pg_get_function_arguments(oid) ~* '\mp_casino_id\M'
  AND pronamespace = 'public'::regnamespace;
-- Expected: 0 rows

-- REVOKE verification for rpc_manual_credit and rpc_redeem
SELECT has_function_privilege('anon', 'rpc_manual_credit(uuid, int, uuid, text, uuid)', 'EXECUTE');
-- Expected: false

SELECT has_function_privilege('anon', 'rpc_redeem(uuid, int, uuid, text, uuid, boolean, uuid, text)', 'EXECUTE');
-- Expected: false

-- search_path verification
SELECT proname, proconfig
FROM pg_proc
WHERE proname IN ('rpc_create_financial_txn', 'rpc_create_financial_adjustment', 'rpc_manual_credit', 'rpc_redeem')
  AND pronamespace = 'public'::regnamespace;
-- Expected: all have 'search_path=pg_catalog, public' in proconfig
```

### Security Gate

```bash
cd supabase && psql "$DATABASE_URL" -f tests/security/run_all_gates.sh
# Expected: 8/8 pass, exit 0
```

### Build Gates

```bash
npm run type-check    # Exit 0
npm run lint          # Exit 0
npm run build         # Exit 0
npm run test          # All green
```

### Grep Verification

```bash
grep -rn "p_casino_id" services/ hooks/ lib/ --include='*.ts' | grep -E "rpc_create_financial_txn|rpc_create_financial_adjustment|rpc_manual_credit|rpc_redeem"
# Expected: 0 matches
```

---

## Execution Corrections (Audit Addendum)

1. **Compatibility invariant**: during the temporary compatibility phase for `rpc_create_financial_adjustment`, `p_casino_id` exists only to absorb stale client payloads and must not be referenced anywhere in the function body.

2. **Explicit fail-closed guards**: recreated loyalty RPCs must contain explicit `IF v_context_casino_id IS NULL THEN RAISE EXCEPTION` guards. Do not rely on indirect or downstream NULL failures.

3. **NOTIFY timing**: emit `NOTIFY pgrst, 'reload schema'` only after the migration transaction commits successfully.

4. **SEC-003 sequencing**: verify catalog is clean, then empty allowlist, then flip enforcement to hard-fail. Do not combine as one opaque edit.

5. **Rollback artifacts**: pre-compute rollback migration artifacts before execution, restoring prior signatures, comments, privileges, and `search_path` values for all affected RPCs.

6. **Pattern B clarification**: this remains Pattern B work, but `rpc_create_financial_adjustment` introduces a browser-bundle compatibility constraint during rollout.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Browser-cached JS sends `p_casino_id` to `rpc_create_financial_adjustment` | DEFAULT NULL compat param in WS1; cleanup in WS3 after Vercel deploys new bundle |
| DROP+CREATE partial failure | Wrapped in BEGIN...COMMIT |
| PostgREST schema cache stale | NOTIFY pgrst at end of each migration |
| Rollback needed | Pre-compute rollback migration (git diff of DROP+CREATE to restore old signatures) |

## Definition of Done

- [ ] All 4 RPCs: `p_casino_id` removed from `proargnames` (catalog query returns 0)
- [ ] `rpc_create_financial_adjustment`: compat phase deployed, then cleaned up
- [ ] All TypeScript callsites updated (grep returns 0 for in-scope RPCs)
- [ ] `rpc_manual_credit` + `rpc_redeem`: anon/PUBLIC EXECUTE revoked
- [ ] All 4 RPCs: `SET search_path = pg_catalog, public` in proconfig
- [ ] SEC-003 allowlist empty (0 entries)
- [ ] Security gates: 8/8 pass
- [ ] `npm run type-check` passes
- [ ] `npm run build` passes
- [ ] All tests green
