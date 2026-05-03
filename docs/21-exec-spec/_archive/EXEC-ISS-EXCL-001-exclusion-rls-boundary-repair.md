---
# EXECUTION-SPEC: ISS-EXCL-001 — Exclusion RLS Boundary Repair
# Generated from: docs/superpowers/specs/2026-03-28-exclusion-rls-boundary-repair-design.md

prd: ISS-EXCL-001
prd_title: "Player Exclusion RLS Boundary Repair"
service: PlayerService
mvp_phase: 1

workstreams:
  WS1:
    name: SECURITY DEFINER Write RPCs
    description: >
      Single migration with two SECURITY DEFINER RPCs (rpc_create_player_exclusion,
      rpc_lift_player_exclusion) that bundle context injection + DML in one transaction.
      Follows ADR-018 Template 5, ADR-024 INV-8, ADR-030 D4. Type regeneration included.
    executor: rls-expert
    executor_type: skill
    depends_on: []
    outputs:
      - supabase/migrations/YYYYMMDDHHMMSS_add_exclusion_write_rpcs.sql
      - types/database.types.ts
    gate: schema-validation
    estimated_complexity: medium

  WS2:
    name: Service Layer RPC Migration
    description: >
      Replace .from().insert() and pre-check SELECT + .update() in exclusion-crud.ts
      with .rpc() calls. Add assertSingletonRow helper and mapExclusionRpcError with
      verified ERRCODE mapping. ERRCODE verification gate must pass first.
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS1]
    outputs:
      - services/player/exclusion-crud.ts
    gate: type-check
    estimated_complexity: medium

  WS3:
    name: RPC Write-Path Integration Tests
    description: >
      Integration tests that validate RPC write path end-to-end against real Supabase.
      Create, lift, and error paths (unauthorized, not found, already lifted).
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS1, WS2]
    outputs:
      - services/player/__tests__/exclusion-rpc.int.test.ts
    gate: test-pass
    estimated_complexity: medium

execution_phases:
  - name: "Phase 1 - Database RPCs + Type Generation"
    parallel: [WS1]
    gates: [schema-validation, errcode-verification]

  - name: "Phase 2 - Service Layer Migration"
    parallel: [WS2]
    gates: [type-check]

  - name: "Phase 3 - Integration Tests"
    parallel: [WS3]
    gates: [test-pass]

gates:
  schema-validation:
    command: "npm run db:types-local"
    success_criteria: "Exit code 0, RPC types present in database.types.ts"

  type-check:
    command: "npm run type-check"
    success_criteria: "Exit code 0, no type errors"

  test-pass:
    command: "npx jest services/player/__tests__/exclusion-rpc.int.test.ts"
    success_criteria: "All tests pass (jest is the project test runner per package.json)"

  errcode-verification:
    command: "manual"
    success_criteria: >
      Call each RPC with conditions that trigger RAISE EXCEPTION, confirm error.code
      in Supabase client response matches the ERRCODE string used in the migration.

external_dependencies: []

risks:
  - risk: "PostgREST may normalize or wrap Postgres ERRCODE differently than expected"
    mitigation: "ERRCODE verification gate (section 5 of design spec) is a hard prerequisite before finalizing error mapping in service layer"
  - risk: "set_rls_context_from_staff() signature change could break RPC"
    mitigation: "Using zero-arg call pattern (DEFAULT correlation_id) matching the established SECURITY DEFINER RPC pattern in this codebase"

da_review:
  tier: 1
  verdict: "Ship w/ gates"
  reviewer: R1-Security
  findings_applied:
    - "P1-FIX: p_review_date type changed from date to timestamptz (matches column type)"
    - "P1-NOTE: lift RPC also fixes pre-existing bug where lifted_by was never set by direct DML"
    - "P2-ACCEPTED: ERRCODE verification gate already specified as hard prerequisite"
    - "P2-ACCEPTED: TOCTOU in lift pre-check — low-concurrency, WHERE guard + GET DIAGNOSTICS catch it"

write_path_classification: not_applicable_non_prd
---

# EXECUTION-SPEC: ISS-EXCL-001 — Exclusion RLS Boundary Repair

## Overview

Player exclusion CREATE and LIFT operations fail with RLS policy violation (42501) because
the `player_exclusion` INSERT/UPDATE policies use session-var-only checks (ADR-030 D4), but
the middleware sets `SET LOCAL` vars in one transaction while the subsequent `.from().insert()`
runs as a separate HTTP request — the session vars are gone.

**Fix**: Two SECURITY DEFINER RPCs that bundle context injection + DML in a single transaction,
matching the established SECURITY DEFINER pattern used by existing RPCs in this codebase
(e.g. `rpc_start_or_resume_visit`, `rpc_get_player_exclusion_status`).

**Constraint**: Boundary repair only. No DTO, mapper, hook, or UI changes.

## Scope

- **In Scope**: Two write RPCs, service-layer `.rpc()` migration, ERRCODE verification, integration test
- **Out of Scope**: DTOs, mappers, schemas, selects, hooks, UI components, route handlers, E2E tests

## Architecture Context

- **Bounded Context**: Player service (`services/player/`)
- **Tables**: `player_exclusion` (owned by player context)
- **ADRs**: ADR-015 (connection pooling), ADR-018 (SECURITY DEFINER governance), ADR-024 (authoritative context — INV-8), ADR-030 (auth hardening — D4 session-var-only writes)
- **Existing pattern**: `rpc_get_player_exclusion_status`, `rpc_start_or_resume_visit` (both SECURITY DEFINER with `set_rls_context_from_staff()`)

## Workstream Details

### WS1: SECURITY DEFINER Write RPCs

**Purpose**: Create two RPCs that bundle RLS context injection + DML in one transaction.

**Deliverables**:
1. Single migration file with both RPCs
2. Regenerated `types/database.types.ts`

**RPC 1 — `rpc_create_player_exclusion`**:
- Signature: 9 params (player_id, exclusion_type, enforcement, reason, + 5 optional). NO casino_id/actor_id params (ADR-024 INV-8)
- `RETURNS SETOF player_exclusion`
- Body: `PERFORM set_rls_context_from_staff()` → extract context → validate context + role (pit_boss/admin) → INSERT with context-derived casino_id/created_by → `RETURNING *`
- Grants: REVOKE PUBLIC/anon, GRANT authenticated/service_role

**RPC 2 — `rpc_lift_player_exclusion`**:
- Signature: 2 params (exclusion_id, lift_reason). NO player_id/casino_id/actor_id (derived from context + existing row)
- `RETURNS SETOF player_exclusion`
- Body: `PERFORM set_rls_context_from_staff()` → extract context → validate context + role (admin only) → validate lift_reason non-empty → pre-check (exists, same casino, not already lifted) → UPDATE lifted_at/lifted_by/lift_reason with WHERE guards → post-update consistency check via `GET DIAGNOSTICS`
- Grants: same as RPC 1

**Acceptance Criteria**:
- [ ] Migration sorts after all existing migrations
- [ ] Both RPCs use `SECURITY DEFINER` + `SET search_path = public, pg_temp`
- [ ] No casino_id/actor_id in signatures (ADR-024 INV-8)
- [ ] Context derived via `set_rls_context_from_staff()` (ADR-018 Template 5)
- [ ] Role checks: create = pit_boss|admin, lift = admin only
- [ ] `p_review_date` parameter is `timestamptz` (verified: column is `review_date TIMESTAMPTZ` in migration 20260310003435 line 40)
- [ ] Lift RPC sets `lifted_by = v_actor_id` (fixes pre-existing bug where direct DML never set lifted_by)
- [ ] `npm run db:types-local` succeeds with new RPC types

### WS2: Service Layer RPC Migration

**Purpose**: Replace direct DML with `.rpc()` calls in `exclusion-crud.ts`.

**Deliverables**:
1. Updated `createExclusion()` — `.rpc('rpc_create_player_exclusion', {...})`
2. Updated `liftExclusion()` — `.rpc('rpc_lift_player_exclusion', {...})` (pre-check removed — now inside RPC)
3. `assertSingletonRow<T>()` helper (inline or local)
4. `mapExclusionRpcError()` replacing `mapDatabaseError()` with ERRCODE-based switch

**ERRCODE Verification Gate (HARD PREREQUISITE)**:
Before finalizing error mapping, apply migration locally and verify end-to-end that
`error.code` in Supabase client response matches the ERRCODE used in RAISE EXCEPTION.
If PostgREST normalizes differently, adjust mapping.

**Acceptance Criteria**:
- [ ] `createExclusion()` uses `.rpc()` instead of `.from().insert()`
- [ ] `liftExclusion()` uses `.rpc()` instead of pre-check SELECT + `.update()`
- [ ] `assertSingletonRow()` rejects empty/multiple results with DomainError
- [ ] Error mapping covers: unauthorized, forbidden, not found, already lifted, FK violation, immutability trigger (→ `EXCLUSION_IMMUTABLE` — illegal mutation attempt, not "not found")
- [ ] ERRCODE verification gate passes
- [ ] `npm run type-check` succeeds
- [ ] No intentional production-scope changes outside the bounded file set (DTOs, mappers, schemas, selects, hooks, http, routes). Test harness or generated-type fallout strictly required to compile/run is acceptable.

### WS3: RPC Write-Path Integration Tests

**Purpose**: Validate the RPC write path works end-to-end against real Supabase.

**Deliverables**:
1. `services/player/__tests__/exclusion-rpc.int.test.ts`

**Test Cases**:
- **Create happy path**: Call `rpc_create_player_exclusion` with valid params, verify row returned with context-derived `casino_id` and `created_by`
- **Lift happy path**: Call `rpc_lift_player_exclusion` on created row, verify `lifted_at`, `lifted_by`, `lift_reason` set correctly
- **Error — unauthorized**: Call without context, expect ERRCODE for unauthorized
- **Error — not found**: Lift non-existent exclusion, expect not-found error
- **Error — already lifted**: Lift same exclusion twice, expect already-lifted error

**Acceptance Criteria**:
- [ ] Tests run against real Supabase client (local), not mocks
- [ ] File named `*.int.test.ts` per governance standard
- [ ] Located in `services/player/__tests__/`
- [ ] All 5+ test cases pass

## Definition of Done

- [ ] All workstream outputs created (migration, crud update, integration test)
- [ ] `npm run db:types-local` succeeds (schema-validation gate)
- [ ] `npm run type-check` succeeds (type-check gate)
- [ ] Integration tests pass (test-pass gate)
- [ ] ERRCODE verification gate passes
- [ ] No regressions in existing tests (`npm test services/player/`)
- [ ] ADR-024 INV-8 compliant (no spoofable params)
- [ ] ADR-030 D4 compliant (session-var-only writes on critical table)
- [ ] No intentional production-scope changes outside the bounded file set, except test harness or generated-type fallout strictly required to compile/run
