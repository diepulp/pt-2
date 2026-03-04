---
id: PRD-040
title: "ADR-024 P2 Validate-to-Derive Remediation"
owner: Platform / Security
status: Draft
affects: [ADR-024, ADR-018, ADR-015, SEC-007, SEC-001]
created: 2026-03-03
last_review: 2026-03-03
phase: "P2 Security Compliance (Post-SEC-007)"
source: "docs/issues/gaps/sec-007/GAP-SEC007-P2-BACKLOG-ADR024-COMPLIANCE.md"
exec_spec_parent: "EXEC-040 WS11"
pattern: B
http_boundary: false
---

# PRD-041 --- ADR-024 P2 Validate-to-Derive Remediation

## 1. Overview

- **Owner:** Platform / Security
- **Status:** Draft
- **Summary:** SEC-007 (EXEC-040) remediated all P0 critical and P1 high tenant isolation findings. Five P2 findings were explicitly deferred to WS11. This PRD covers the deferred P2 remediation work: removing spoofable `p_casino_id` validate-pattern parameters from 12 RPCs and cascading the change to ~16 production TypeScript callsites across 5 bounded contexts, plus 4 low-effort quick wins (grant tightening, policy normalization, WITH CHECK addition, and a business decision on delegation semantics). The target state is full ADR-024 compliance: all client-callable RPCs derive casino and actor identity from authoritative session context, never from user-supplied parameters.

---

## 2. Problem & Goals

### 2.1 Problem

ADR-024 mandates that client-callable RPCs derive tenant context (`casino_id`, `actor_id`, `staff_role`) exclusively from the authoritative `set_rls_context_from_staff()` function, which reads from the JWT and staff table. No user-supplied identity parameters should exist in RPC signatures (INV-8).

After the SEC-007 P0/P1 remediation (commit `9ee2850`), 12 RPCs still accept `p_casino_id` as a parameter. These RPCs use a **validate pattern** --- the caller supplies `p_casino_id`, and the function checks it against `current_setting('app.casino_id')`, raising an exception on mismatch. This pattern is **functional** (it cannot be exploited because mismatches are rejected) but **non-compliant** with ADR-024's derive-only mandate.

The parameter's continued existence creates three risks:

1. **Compliance debt:** Every RPC with `p_casino_id` is a standing deviation from the project's own security architecture, undermining the credibility of the ADR-024 contract.
2. **Copy-paste regression:** New RPCs authored by copying existing patterns will inherit the validate pattern instead of the derive pattern, as proven by the P0-5 regression in SEC-007.
3. **CI gate friction:** The SEC-003 identity param CI gate must maintain an allowlist of 12 RPCs. Removing the parameters enables zero-tolerance enforcement.

Additionally, 4 smaller compliance gaps remain: a spoofable `p_created_by_staff_id` attribution parameter, an unnecessary anon grant on a helper function, 8 inconsistent denial policy patterns, and a missing WITH CHECK clause on `player_tag` UPDATE.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Remove `p_casino_id` from all 12 validate-pattern RPCs | `SELECT proname FROM pg_proc WHERE proname LIKE 'rpc_%' AND 'p_casino_id' = ANY(proargnames);` returns 0 rows |
| **G2**: Update all TypeScript callsites to stop passing `p_casino_id` | `grep -r 'p_casino_id' services/ app/ hooks/ --include='*.ts' --include='*.tsx'` returns 0 production matches (test files updated separately) |
| **G3**: SEC-003 CI gate runs zero-tolerance (no allowlist) | SEC-003 `p_casino_id` allowlist is empty; gate hard-fails on any `p_casino_id` param |
| **G4**: Resolve `p_created_by_staff_id` delegation semantics | Business decision documented; parameter either removed or explicitly justified in ADR-024 addendum |
| **G5**: Revoke `chipset_total_cents` from anon | `has_function_privilege('anon', 'chipset_total_cents(jsonb)', 'EXECUTE')` returns false |
| **G6**: Normalize denial policy patterns | All denial policies include `auth.uid() IS NOT NULL` prefix per project convention |
| **G7**: Add WITH CHECK to `player_tag` UPDATE | `SELECT with_check FROM pg_policies WHERE tablename = 'player_tag' AND cmd = 'UPDATE';` returns non-null WITH CHECK clause |
| **G8**: Type system remains sound | `npm run db:types-local && npm run type-check && npm run build` all pass |

### 2.3 Non-Goals

- Migrating to Track B (JWT-only RLS policies) per ADR-020 --- that is a separate, larger effort
- Removing `p_casino_id` from RPCs that are exclusively `service_role`-callable (ops lane per ADR-024)
- Rewriting RPC bodies beyond the parameter removal --- the derive pattern is already in place via `set_rls_context_from_staff()`; only the signature and the validate-block removal are in scope
- Adding new RPCs or tables
- Changing RLS policies on tables other than `player_tag` and the 8 denial policy normalizations
- Refactoring the TypeScript service layer beyond removing the `p_casino_id` argument from `.rpc()` calls

---

## 3. Users & Use Cases

- **Primary users:** Platform engineers, security reviewers, backend developers

**Top Jobs:**

- As a **security reviewer**, I need the SEC-003 CI gate to enforce zero-tolerance on identity parameters so that new RPCs cannot introduce spoofable params without triggering a hard failure.
- As a **backend developer**, I need a single consistent pattern for calling RPCs (no `p_casino_id` parameter anywhere) so that I do not have to decide whether to use validate or derive when writing new service code.
- As a **platform engineer**, I need the `p_created_by_staff_id` delegation question resolved so that the financial transaction audit trail is architecturally sound.
- As a **pit boss** (end user), I need the system to continue working identically after parameter removal --- no change to any user-facing behavior.

---

## 4. Scope & Feature List

### 4.1 In Scope

**Sprint 1 --- Quick Wins (P2-2 through P2-5):**

- P2-2: Business decision on `rpc_create_financial_txn` `p_created_by_staff_id` delegation semantics; then parameter removal or explicit documentation
- P2-3: REVOKE `chipset_total_cents(jsonb)` from anon; GRANT to authenticated + service_role only
- P2-4: Normalize 8 denial policies to include `auth.uid() IS NOT NULL AND false` pattern
- P2-5: Add WITH CHECK to `player_tag` UPDATE policy

**Sprint 2--3 --- Validate-to-Derive Migration (P2-1), phased by bounded context:**

- Phase A (RatingSlip): `rpc_pause_rating_slip`, `rpc_resume_rating_slip`, `rpc_close_rating_slip`, `rpc_move_player`
- Phase B (TableContext): `rpc_update_table_status`, `rpc_log_table_drop`, `rpc_log_table_inventory_snapshot`, `rpc_request_table_credit`, `rpc_request_table_fill`
- Phase C (Player): `rpc_create_player`
- Phase D (FloorLayout): `rpc_create_floor_layout`, `rpc_activate_floor_layout`

Each phase: DROP old signature, CREATE new (sans `p_casino_id`), update TS callers, type regeneration, acceptance tests.

**Sprint 4 --- CI Hardening:**

- Remove `p_casino_id` allowlist from SEC-003 CI gate
- Update SEC-004 allowlist to remove `chipset_total_cents`
- Verify all gates pass clean

### 4.2 Out of Scope

- RLS policy rewrites beyond P2-4 and P2-5 (all P0/P1 policies already remediated)
- `p_casino_id` on `service_role`-only RPCs (ops lane, explicitly permitted by ADR-024)
- RPC body logic changes (the `set_rls_context_from_staff()` call and derive pattern are already in place; only the parameter and validate-block are removed)
- New feature work or UI changes
- `p_casino_id` on RPCs outside the P2-1 list of 12 (e.g., `rpc_get_dashboard_tables_with_counts`, loyalty RPCs, `rpc_current_gaming_day`). These RPCs also accept `p_casino_id` but were not flagged in the SEC-007 P2-1 finding. Their compliance status should be assessed as a follow-up after this PRD ships, informed by the SEC-003 CI gate results at zero-tolerance.

---

## 5. Requirements

### 5.1 Functional Requirements

**FR-1 (Parameter Removal):** Each of the 12 RPCs listed in P2-1 must have its `p_casino_id` parameter removed. The function must derive `casino_id` from `current_setting('app.casino_id')` (already set by `set_rls_context_from_staff()` at the top of the function body). The validate-block (`IF p_casino_id IS DISTINCT FROM ... THEN RAISE EXCEPTION`) must be removed.

**FR-2 (Signature Safety):** Each parameter removal requires DROP of the old signature followed by CREATE of the new signature (PostgreSQL treats different parameter counts as different functions). The migration must include `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated, service_role; NOTIFY pgrst, 'reload schema';` per EXEC-040 INV-1.

**FR-3 (TypeScript Caller Cascade):** All production `.rpc()` callsites that pass `p_casino_id` to the affected RPCs must be updated to remove the parameter. Affected files (production):

| Bounded Context | File | Callsite Count |
|----------------|------|----------------|
| RatingSlip | `services/rating-slip/crud.ts` | 4 |
| RatingSlip | `services/visit/crud.ts` | 3 |
| RatingSlip | `services/rating-slip-modal/rpc.ts` | 2 |
| TableContext | `services/table-context/chip-custody.ts` | 4 |
| Player | `services/player/crud.ts` | 1 |
| FloorLayout | `app/api/v1/floor-layouts/route.ts` | 1 |
| FloorLayout | `app/api/v1/floor-layout-activations/route.ts` | 1 |

**FR-4 (Test Caller Cascade):** All test files that pass `p_casino_id` to affected RPCs must be updated. Test files include `services/rating-slip/__tests__/`, `services/visit/__tests__/`, `services/security/__tests__/`, `services/loyalty/__tests__/`, `services/casino/__tests__/`, and `services/player-financial/__tests__/`.

**FR-5 (P2-2 Delegation Decision):** A business decision must be made on whether `rpc_create_financial_txn`'s `p_created_by_staff_id` parameter represents legitimate delegated attribution ("supervisor records on behalf of staff") or should be replaced with context-derived `app.actor_id`. If delegation is legitimate, document the exception in an ADR-024 addendum. If not, remove the parameter and derive from context.

**FR-6 (P2-3 Grant Tightening):** `chipset_total_cents(jsonb)` must be revoked from `anon` and `PUBLIC`, with EXECUTE granted only to `authenticated` and `service_role`.

**FR-7 (P2-4 Policy Normalization):** All 8 denial policies using bare `USING (false)` must be rewritten to `USING (auth.uid() IS NOT NULL AND false)` for consistency with the project convention documented in SEC-006.

**FR-8 (P2-5 WITH CHECK):** The `player_tag` UPDATE policy must include a WITH CHECK clause matching the USING clause to prevent `casino_id` mutation on UPDATE.

**FR-9 (Type Regeneration):** After each migration phase, `npm run db:types-local` must be run to regenerate `types/database.types.ts`, followed by `npm run type-check` and `npm run build` to validate the full type chain.

### 5.2 Non-Functional Requirements

**NFR-1 (Zero Downtime):** Parameter removal is a breaking change for PostgREST callers. Migrations and TypeScript changes must be deployed atomically. There must be no window where the DB expects no `p_casino_id` but the app still sends it (or vice versa).

**NFR-2 (Phased Rollout):** P2-1 must be phased by bounded context to limit blast radius. Each phase produces its own migration and corresponding TS changes. Phases can be merged individually or batched, but each phase must pass the build gate independently.

**NFR-3 (No Behavioral Change):** End-user behavior must be identical before and after. The only change is internal: the parameter is no longer sent, and the RPC derives the value it was previously validating.

> Architecture, schema, and RPC body patterns are documented in ADR-024, SEC-007, and EXEC-040. They are not repeated here.

---

## 6. UX / Flow Overview

This PRD has no user-facing UX changes. The changes are entirely in the database function signatures and TypeScript service layer plumbing.

**Developer workflow per phase:**

1. Author migration: DROP old RPC signature, CREATE new signature (sans `p_casino_id`), include REVOKE/GRANT/NOTIFY boilerplate
2. Run `npm run db:types-local` to regenerate types
3. TypeScript compiler will flag all callsites where `p_casino_id` is still passed (property does not exist on the new type)
4. Remove `p_casino_id` from each flagged callsite
5. Run `npm run type-check` and `npm run build`
6. Run affected service tests; update test callsites as needed
7. Verify SEC-003 CI gate passes (or allowlist shrinks)

---

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|-----------|--------|-------|
| SEC-007 P0/P1 remediation (EXEC-040) | Complete (`9ee2850`) | All P0/P1 findings landed; P2 work builds on this |
| `set_rls_context_from_staff()` in all 12 RPCs | Complete | All 12 RPCs already call `set_rls_context_from_staff()` as their first line; they just also accept and validate `p_casino_id` |
| SEC-003 CI gate operational | Complete | Gate warns on `p_casino_id`; will be upgraded to hard-fail after P2-1 |
| SEC-004 CI gate operational | Complete | Gate tracks PUBLIC grants; `chipset_total_cents` in allowlist |
| Type regeneration infrastructure | Complete | `npm run db:types-local` pipeline functional |

### 7.2 Risks & Open Questions

| Risk | Impact | Mitigation |
|------|--------|------------|
| **R1**: Missed callsite causes runtime error after migration | HIGH --- `p_casino_id` in TS body sent to RPC that no longer accepts it; PostgREST returns 404/error | TypeScript compiler catches all mismatches after type regeneration. Phased rollout limits blast radius. |
| **R2**: P2-2 business decision delays the sprint | LOW --- P2-2 is independent of P2-1 | Can proceed with P2-1 while P2-2 awaits product input. P2-2 is a separate migration. |
| **R3**: Test suite has more callsites than expected | MEDIUM --- test updates are tedious but mechanical | Grep-based inventory is complete (see Section 5.1 FR-4). Compiler-assisted refactoring. |
| **R4**: Overload ambiguity if old signature lingers | HIGH --- phantom overload enables PostgREST routing to old signature | Every phase uses DROP + CREATE (not CREATE OR REPLACE). SEC-002 CI gate catches residual overloads. |
| **R5**: `chipset_total_cents` REVOKE breaks an unknown caller | LOW --- no TS callsites found in codebase; function is purely computational | Search confirms 0 callsites. If discovered post-deploy, fix is a single GRANT. |

### 7.3 Open Questions

| Question | Owner | Deadline |
|----------|-------|----------|
| **OQ-1**: Is delegated attribution ("supervisor records on behalf of staff") a legitimate use case for `rpc_create_financial_txn`? | Product / Business | Sprint 1 |
| **OQ-2**: Which 8 denial policies need normalization? Exact list TBD from catalog scan. | Security / Platform | Sprint 1 (pre-migration) |

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**

- [ ] All 12 RPCs listed in P2-1 have `p_casino_id` removed from their signatures
- [ ] All production TypeScript callsites (16 across 7 files) updated to remove `p_casino_id`
- [ ] All test callsites updated and passing
- [ ] P2-2 business decision documented; parameter either removed or justified
- [ ] `chipset_total_cents` revoked from anon (P2-3)
- [ ] 8 denial policies normalized (P2-4)
- [ ] `player_tag` UPDATE WITH CHECK added (P2-5)

**Data & Integrity**

- [ ] No behavioral change to any RPC output --- parameter removal is transparent to callers
- [ ] `casino_id` derivation verified via acceptance tests (each RPC derives from session context)

**Security & Access**

- [ ] `SELECT proname FROM pg_proc WHERE proname LIKE 'rpc_%' AND 'p_casino_id' = ANY(proargnames);` returns 0 rows
- [ ] SEC-003 CI gate `p_casino_id` allowlist is empty; gate hard-fails on any new `p_casino_id` param
- [ ] SEC-004 CI gate allowlist updated to remove `chipset_total_cents`
- [ ] No `rpc_*` has multiple overloads of the same name (no phantom signatures from DROP/CREATE)

**Testing**

- [ ] Each migration phase passes `npm run db:types-local && npm run type-check && npm run build`
- [ ] Affected service unit tests pass with updated callsites
- [ ] Integration tests for RatingSlip, TableContext, Player, and FloorLayout RPCs pass
- [ ] Catalog-based acceptance test: 0 RPCs with `p_casino_id` in `pg_proc`

**Operational Readiness**

- [ ] Migrations follow `MIGRATION_NAMING_STANDARD.md` (real timestamps, verb prefixes, no backdating)
- [ ] Each phase can be deployed independently without breaking the build gate
- [ ] Rollback path: revert migration + TS changes in the same phase (atomic)

**Documentation**

- [ ] Gap document (`GAP-SEC007-P2-BACKLOG-ADR024-COMPLIANCE.md`) marked as resolved
- [ ] If P2-2 delegation is justified, ADR-024 addendum documents the exception
- [ ] Known limitations: none expected (this eliminates the last known ADR-024 deviations)

---

## 9. Related Documents

| Document | Path | Relevance |
|----------|------|-----------|
| Gap Analysis | `docs/issues/gaps/sec-007/GAP-SEC007-P2-BACKLOG-ADR024-COMPLIANCE.md` | Source gap document defining all 5 P2 findings |
| ADR-024 | `docs/80-adrs/ADR-024_DECISIONS.md` | Authoritative context derivation target state (INV-7, INV-8) |
| SEC-007 Audit | `docs/30-security/SEC-007-tenant-isolation-enforcement-contract.md` | Full audit findings (P0--P2) |
| EXEC-040 | `docs/21-exec-spec/EXEC-040-sec007-tenant-isolation-enforcement.md` | Execution spec for SEC-007; WS11 defines deferred P2 scope |
| Callsite Audit | `docs/30-security/SEC-007-CALLSITE-AUDIT-REPORT-2026-03-02.md` | Production callsite inventory |
| SRM | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | Bounded context ownership |
| SEC-003 CI Gate | `supabase/tests/security/03_identity_param_check.sql` | CI gate tracking `p_casino_id` (currently warns; target: hard-fail) |
| SEC-004 CI Gate | `supabase/tests/security/04_public_execute_check.sql` | CI gate tracking PUBLIC grants |
| ADR-018 | `docs/80-adrs/ADR-018-security-definer-governance.md` | SECURITY DEFINER governance rules |
| Role Gating Canon | `docs/30-security/ROLE_GATING_CANON.md` | Grant management rules |
| Migration Standard | `docs/60-release/MIGRATION_NAMING_STANDARD.md` | Migration naming rules |

---

## Appendix A: P2-1 RPC Inventory

| # | Function | Bounded Context | Current Arg Count | Target Arg Count | Production TS Callsites |
|---|----------|----------------|-------------------|------------------|------------------------|
| 1 | `rpc_pause_rating_slip` | RatingSlip | 2 | 1 | `services/rating-slip/crud.ts`, `services/visit/crud.ts` |
| 2 | `rpc_resume_rating_slip` | RatingSlip | 2 | 1 | `services/rating-slip/crud.ts`, `services/visit/crud.ts` |
| 3 | `rpc_close_rating_slip` | RatingSlip | 3 | 2 | `services/rating-slip/crud.ts`, `services/visit/crud.ts` |
| 4 | `rpc_move_player` | RatingSlip | 5 | 4 | `services/rating-slip/crud.ts` |
| 5 | `rpc_update_table_status` | TableContext | 3 | 2 | `services/table-context/table-session.ts` |
| 6 | `rpc_log_table_drop` | TableContext | 11 | 10 | `services/table-context/chip-custody.ts` |
| 7 | `rpc_log_table_inventory_snapshot` | TableContext | 7 | 6 | `services/table-context/chip-custody.ts` |
| 8 | `rpc_request_table_credit` | TableContext | 8 | 7 | `services/table-context/chip-custody.ts` |
| 9 | `rpc_request_table_fill` | TableContext | 8 | 7 | `services/table-context/chip-custody.ts` |
| 10 | `rpc_create_player` | Player | 4 | 3 | `services/player/crud.ts` |
| 11 | `rpc_create_floor_layout` | FloorLayout | 3 | 2 | `app/api/v1/floor-layouts/route.ts` |
| 12 | `rpc_activate_floor_layout` | FloorLayout | 3 | 2 | `app/api/v1/floor-layout-activations/route.ts` |

---

## Appendix B: Phased Rollout Plan

### Phase A --- RatingSlip (Sprint 2)

**Migration:** DROP + CREATE for `rpc_pause_rating_slip`, `rpc_resume_rating_slip`, `rpc_close_rating_slip`, `rpc_move_player`

**TS Updates:**
- `services/rating-slip/crud.ts` (4 callsites)
- `services/visit/crud.ts` (3 callsites)
- `services/rating-slip-modal/rpc.ts` (2 callsites)
- Test files: `services/rating-slip/__tests__/*.ts`, `services/visit/__tests__/*.ts`

**Rationale:** RatingSlip has the most callsites (9 production) and is the most frequently exercised flow. Doing it first provides the highest confidence signal.

### Phase B --- TableContext (Sprint 2)

**Migration:** DROP + CREATE for `rpc_update_table_status`, `rpc_log_table_drop`, `rpc_log_table_inventory_snapshot`, `rpc_request_table_credit`, `rpc_request_table_fill`

**TS Updates:**
- `services/table-context/chip-custody.ts` (4 callsites)
- Test files: `services/table-context/__tests__/*.ts`, `services/security/__tests__/*.ts`

**Rationale:** TableContext RPCs are clustered in a single service file (`chip-custody.ts`), making the cascade compact.

### Phase C --- Player (Sprint 3)

**Migration:** DROP + CREATE for `rpc_create_player`

**TS Updates:**
- `services/player/crud.ts` (1 callsite)
- Test files: `services/player/__tests__/*.ts`

**Rationale:** Smallest blast radius. Single callsite, single service.

### Phase D --- FloorLayout (Sprint 3)

**Migration:** DROP + CREATE for `rpc_create_floor_layout`, `rpc_activate_floor_layout`

**TS Updates:**
- `app/api/v1/floor-layouts/route.ts` (1 callsite)
- `app/api/v1/floor-layout-activations/route.ts` (1 callsite)

**Rationale:** FloorLayout callers are in route handlers (not service layer), which is a slightly different code path. Grouped last for isolation.

---

## Appendix C: SQL Pattern Reference

**Before (validate pattern --- non-compliant):**
```sql
CREATE OR REPLACE FUNCTION rpc_example(
  p_casino_id UUID,
  p_other_param TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_casino_id UUID;
BEGIN
  PERFORM set_rls_context_from_staff();
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  -- Validate pattern: check param against derived context
  IF p_casino_id IS DISTINCT FROM v_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch';
  END IF;

  -- ... business logic using v_casino_id ...
END;
$$;
```

**After (derive pattern --- ADR-024 compliant):**
```sql
CREATE OR REPLACE FUNCTION rpc_example(
  p_other_param TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_casino_id UUID;
BEGIN
  PERFORM set_rls_context_from_staff();
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'no casino context';
  END IF;

  -- ... business logic using v_casino_id ...
END;
$$;

REVOKE ALL ON FUNCTION rpc_example(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION rpc_example(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION rpc_example(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_example(TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';
```

**Migration pattern (DROP old + CREATE new):**
```sql
-- Step 1: DROP old signature (with p_casino_id)
DROP FUNCTION IF EXISTS public.rpc_example(UUID, TEXT);

-- Step 2: CREATE new signature (without p_casino_id)
CREATE OR REPLACE FUNCTION rpc_example(p_other_param TEXT) ...

-- Step 3: Grant posture (EXEC-040 INV-1)
REVOKE ALL ON FUNCTION rpc_example(TEXT) FROM PUBLIC;
...
```
