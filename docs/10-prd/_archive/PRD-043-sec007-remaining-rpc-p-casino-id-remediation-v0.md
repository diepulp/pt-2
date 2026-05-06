---
id: PRD-043
title: "SEC-007 Remaining RPC p_casino_id Remediation (14 RPCs)"
owner: Platform / Security
status: Draft
affects: [ADR-024, ADR-018, ADR-015, ADR-030, SEC-003, SEC-007, PRD-041]
created: 2026-03-04
last_review: 2026-03-04
phase: "Post-PRD-041 Compliance Completion"
source: "docs/issues/gaps/sec-007/GAP-SEC007-WS6-REMAINING-RPC-REMEDIATION.md"
pattern: B
http_boundary: false
---

# PRD-043 --- SEC-007 Remaining RPC p_casino_id Remediation (14 RPCs)

## 1. Overview

- **Owner:** Platform / Security
- **Status:** Draft
- **Summary:** PRD-041 remediated 12 RPCs across RatingSlip, TableContext, Player, and FloorLayout bounded contexts. The WS6 enforcement flip (PR #14) exposed 14 additional RPCs that still accept `p_casino_id` --- all using the non-exploitable validate pattern but non-compliant with ADR-024's derive-only mandate. This PRD covers the final remediation batch across Loyalty (6), Financial (2), Cross-Context Reads (4), and 2 residuals from PRD-041 scope requiring investigation. After completion, the SEC-003 allowlist empties and the CI gate enforces zero-tolerance on `p_casino_id` identity parameters.

---

## 2. Problem & Goals

### 2.1 Problem

ADR-024 mandates that client-callable RPCs derive tenant context exclusively from `set_rls_context_from_staff()`. After PRD-041 shipped (12 RPCs remediated), the WS6 enforcement flip hard-failed SEC-003 on 14 RPCs that still carry `p_casino_id`. These RPCs validate the caller-supplied value against session context and reject mismatches --- functional, but non-compliant.

The continued existence of `p_casino_id` in these signatures creates three problems:

1. **CI blockage:** SEC-003 hard-fails on any PR touching `supabase/migrations/**` or `supabase/tests/security/**` until these are remediated or allowlisted.
2. **Copy-paste regression risk:** Developers copying existing RPCs inherit the validate pattern instead of the derive pattern (proven by the P0-5 regression in SEC-007).
3. **Delegation ambiguity:** Three RPCs (`rpc_manual_credit`, `rpc_redeem`, `rpc_create_financial_txn`) carry additional staff identity parameters (`p_awarded_by_staff_id`, `p_issued_by_staff_id`, `p_created_by_staff_id`) whose legitimacy requires a business decision.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Remove `p_casino_id` from all 14 remaining RPCs | `SELECT proname FROM pg_proc WHERE proname LIKE 'rpc_%' AND 'p_casino_id' = ANY(proargnames);` returns 0 rows |
| **G2**: Update all TypeScript callsites to stop passing `p_casino_id` | `grep -r "p_casino_id" services/ hooks/ lib/ app/ --include='*.ts' --include='*.tsx'` returns 0 production matches for in-scope RPCs |
| **G3**: All security gates pass clean with empty SEC-003 allowlist | SEC-003 allowlist is empty, `run_all_gates.sh` exits 0 (8/8 gates pass) |
| **G4**: Delegation params resolved or explicitly deferred | OQ-1 and OQ-2 have documented decisions; delegation params either removed or justified in ADR-024 addendum |
| **G5**: Tier 4 residuals investigated and resolved | `rpc_start_rating_slip` and `rpc_issue_mid_session_reward` verified --- either already clean or remediated |

### 2.3 Non-Goals

- Removing `p_casino_id` from `service_role`-only RPCs (ops lane, explicitly permitted by ADR-024)
- Rewriting RPC bodies beyond parameter removal --- the derive pattern is already in place via `set_rls_context_from_staff()`
- Adding new RPCs, tables, or RLS policies
- Migrating to Track B (JWT-only RLS) per ADR-020
- Refactoring TypeScript service layer beyond removing the `p_casino_id` argument from `.rpc()` calls
- Resolving non-`p_casino_id` compliance gaps (those belong to future PRDs)

---

## 3. Users & Use Cases

- **Primary users:** Platform engineers, security reviewers, backend developers

**Top Jobs:**

- As a **platform engineer**, I need the SEC-003 CI gate to pass clean so that PRs touching migrations are not blocked by stale allowlist entries.
- As a **security reviewer**, I need zero `p_casino_id` identity parameters in the RPC catalog so that the derive-only mandate is fully enforced and auditable.
- As a **backend developer**, I need a single consistent RPC calling pattern (no `p_casino_id` anywhere) so that I don't have to decide between validate and derive when writing new service code.
- As a **product owner**, I need the delegation question (OQ-1/OQ-2) resolved so that financial and loyalty audit trails are architecturally sound.

---

## 4. Scope & Feature List

### 4.1 In Scope

**PR D1 --- Cross-Context Reads + Tier 4 Investigation (unblocked):**
- Remove `p_casino_id` from `rpc_get_dashboard_tables_with_counts`
- Remove `p_casino_id` from `rpc_get_player_last_session_context`
- Remove `p_casino_id` from `rpc_get_player_recent_sessions`
- Remove `p_casino_id` from `rpc_get_rating_slip_modal_data`
- Investigate `rpc_start_rating_slip` --- verify PRD-041 migration landed; remediate if still present
- Investigate `rpc_issue_mid_session_reward` --- verify status; remediate if still present

**PR D2 --- Loyalty RPCs without delegation params (unblocked):**
- Remove `p_casino_id` from `rpc_accrue_on_close`
- Remove `p_casino_id` from `rpc_apply_promotion`
- Remove `p_casino_id` from `rpc_get_player_ledger`
- Remove `p_casino_id` from `rpc_reconcile_loyalty_balance`

**PR D3 --- Loyalty delegation RPCs (blocked on OQ-2):**
- Remove `p_casino_id` from `rpc_manual_credit`
- Remove `p_casino_id` from `rpc_redeem`
- Resolve `p_awarded_by_staff_id` and `p_issued_by_staff_id` per OQ-2 decision

**PR D4 --- Financial RPCs (blocked on OQ-1):**
- Remove `p_casino_id` from `rpc_create_financial_txn`
- Remove `p_casino_id` from `rpc_create_financial_adjustment`
- Resolve `p_created_by_staff_id` per OQ-1 decision

**Post-merge:**
- Empty SEC-003 allowlist
- Verify all 8 security gates pass clean

### 4.2 Out of Scope

- RLS policy changes (all P0/P1 policies already remediated in SEC-007)
- `p_casino_id` on `service_role`-only RPCs (ops lane per ADR-024)
- RPC body logic changes beyond parameter and validate-block removal
- New feature work or UI changes
- `p_created_by_staff_id`, `p_awarded_by_staff_id`, `p_issued_by_staff_id` implementation --- these are gated on OQ-1/OQ-2 business decisions and may ship as part of PR D3/D4 or be deferred to a follow-up PRD

---

## 5. Requirements

### 5.1 Functional Requirements

**FR-0 (Context Setup --- hard requirement):** Every remediated RPC must call `set_rls_context_from_staff()` as the first executable statement after `BEGIN` (comments and `DECLARE` blocks excepted). Tenant identity (`casino_id`, `actor_id`, `staff_role`) must be derived exclusively from session context, never from parameters. Each PR must include a per-RPC assertion that the function body contains the context-setting call before any data-reading statement.

> **FR-0 implementation note:** Assertion must use one of: (a) a SQL check over `pg_get_functiondef(oid)` verifying `set_rls_context_from_staff()` appears before the first `SELECT|INSERT|UPDATE|DELETE|PERFORM public\.` statement; or (b) a runtime integration test that calls the RPC without setting context and asserts it fails closed with `'no casino context'` before any reads.

**FR-1 (Parameter Removal):** Each of the 14 RPCs must have `p_casino_id` removed from its signature. The function must derive `casino_id` via `NULLIF(current_setting('app.casino_id', true), '')::uuid` (already set by `set_rls_context_from_staff()`). If the derived value is NULL, the function must raise an exception (`'no casino context'`) --- fail closed, never proceed without tenant context. The old validate-block (`IF p_casino_id IS DISTINCT FROM ... THEN RAISE EXCEPTION`) must be removed.

**FR-2 (Signature Safety + Security Posture):** Each removal requires DROP of the old signature followed by CREATE of the new signature (strict `DROP` + `CREATE FUNCTION` --- do **not** use `CREATE OR REPLACE` to avoid any ambiguity with lingering overloads). The migration must include `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated, service_role; NOTIFY pgrst, 'reload schema';` per EXEC-040 INV-1. Additional constraints:
- **SECURITY DEFINER/INVOKER posture:** Do not change the existing security mode of any RPC unless explicitly called out. If SECURITY DEFINER is used, the function must include `SET search_path = pg_catalog, public` (per ADR-018).
- **Mutation authorization verification:** Each mutation RPC (loyalty writes, financial writes) must have a test proving that disallowed roles (e.g., `dealer`, `cashier`) cannot perform the action --- either via function-body `app.staff_role` gate or via RLS. The broad `GRANT EXECUTE TO authenticated` is acceptable only when body-level or RLS-level role gating is verified.

**FR-3 (TypeScript Caller Cascade):** All production `.rpc()` callsites passing `p_casino_id` to affected RPCs must be updated, including any server route handlers or edge functions that wrap the RPC call indirectly. Affected production callsites:

| Bounded Context | File | RPCs Called | Callsite Count |
|----------------|------|-------------|----------------|
| Loyalty | `services/loyalty/crud.ts` | accrue_on_close, redeem, manual_credit, apply_promotion, get_player_ledger, reconcile_loyalty_balance | 6 |
| Visit | `services/visit/crud.ts` | get_player_recent_sessions, get_player_last_session_context, start_rating_slip | 3 |
| Dashboard | `hooks/dashboard/use-dashboard-tables.ts` | get_dashboard_tables_with_counts | 1 |
| RatingSlip | `services/rating-slip/crud.ts` | start_rating_slip | 1 |
| RatingSlip | `services/rating-slip-modal/rpc.ts` | get_rating_slip_modal_data | 1 |
| Finance | `lib/finance.ts` | create_financial_txn | 1 |
| Finance | `services/player-financial/http.ts` | create_financial_adjustment | 1 |

> **Callsite audit rule:** The audit must include server routes, edge functions, and API wrappers that invoke RPCs indirectly (not only direct `.rpc()` usage). If a file calls an API endpoint that in turn calls the RPC, both the HTTP wrapper and the server route are in scope.

**FR-4 (Test Caller Cascade):** Update every test file that directly calls one of the 14 RPCs to remove `p_casino_id`. Key test files include:
- `services/loyalty/__tests__/points-accrual-calculation.integration.test.ts`
- `services/rating-slip/__tests__/policy-snapshot.integration.test.ts`
- `services/visit/__tests__/visit-continuation.integration.test.ts`
- `services/visit/__tests__/visit-continuation.test.ts`
- `services/security/__tests__/rls-context.integration.test.ts`
- `lib/supabase/__tests__/rls-pooling-safety.integration.test.ts`
- `lib/supabase/__tests__/pit-boss-financial-txn.test.ts`

**FR-5 (Delegation Decision --- OQ-1):** A business decision must be made on whether `rpc_create_financial_txn`'s `p_created_by_staff_id` represents legitimate delegated attribution. Acceptance criteria for either outcome:
- **If delegation allowed:** parameter is retained, but must be validated via an authorization rule (caller must have a permitting `staff_role` + same-tenant boundary). The function must produce an audit record attributing both the acting staff (`app.actor_id`) and the delegated staff (`p_created_by_staff_id`). Document the exception in an ADR-024 addendum. Include tests for both authorization and audit.
- **If delegation disallowed:** parameter is removed. Actor attribution is derived from `current_setting('app.actor_id')`. Tests must assert the derived value matches the JWT-sourced identity.

**FR-6 (Delegation Decision --- OQ-2):** Same decision and acceptance criteria as FR-5, applied to `rpc_manual_credit` (`p_awarded_by_staff_id`) and `rpc_redeem` (`p_issued_by_staff_id`). Resolve together with OQ-1 for consistency.

**FR-7 (Tier 4 Investigation + Catalog Truth):** Verify that `rpc_start_rating_slip` and `rpc_issue_mid_session_reward` had their `p_casino_id` removed by prior migrations. If still present in the catalog, include in PR D1. **Scope rule:** if a function exists in `pg_proc` with `p_casino_id` in its argument names, it is in scope for remediation regardless of whether ripgrep finds a TypeScript callsite. The Postgres catalog is the source of truth, not the TS codebase.

**FR-8 (Type Regeneration):** After each PR's migration, run `npm run db:types-local` followed by `npm run type-check` and `npm run build` to validate the full type chain.

### 5.2 Non-Functional Requirements

**NFR-1 (Coordinated Deploy):** Strict DROP+CREATE means there is an unavoidable disagreement window between the Supabase migration landing and the Vercel app redeploying. This PRD accepts that risk with the following constraints:
- **Deploy order:** Migration first (DROP old + CREATE new), then Vercel redeploy (TS callsites updated). The disagreement window is the time between migration apply and Vercel build completion.
- **Expected failure mode:** During the window, the old app sends `p_casino_id` to an RPC that no longer accepts it; PostgREST returns a 404/error. This is a brief, self-resolving outage for affected RPCs only.
- **Rollback:** If the Vercel deploy fails, ship a forward hotfix migration that reintroduces the old signature (Supabase migrations are forward-only; "rollback" means a new migration restoring the prior contract). Each PR's migration + TS changes are scoped narrowly enough that the window is short and the hotfix is mechanical.
- **Mitigation:** Deploy during low-traffic windows. PR D1 (read RPCs) has the lowest blast radius and should ship first as a confidence signal.

**NFR-2 (Independent PRs):** Each PR (D1--D4) must pass the build gate independently. PRs D1 and D2 are unblocked and can ship in parallel. PRs D3 and D4 are blocked on OQ decisions.

**NFR-3 (No Business-Output Change):** No change to RPC return values or business logic for valid callers. The parameter surface and error messaging may change (callers sending the removed `p_casino_id` will receive an error instead of silent acceptance). This is expected and correct.

> Architecture, schema, and RPC body patterns are documented in ADR-024, SEC-007, and EXEC-040. They are not repeated here.

---

## 6. UX / Flow Overview

This PRD has no user-facing UX changes. The changes are entirely in database function signatures and TypeScript service layer plumbing.

**Developer workflow per PR:**

1. Pin concrete callsite list (ripgrep output) into the PR description; update Appendix A if any new callsites are discovered
2. Author migration: DROP old RPC signature, CREATE new (sans `p_casino_id`), include REVOKE/GRANT/NOTIFY boilerplate
2. Run `npm run db:types-local` to regenerate types
3. TypeScript compiler flags all callsites where `p_casino_id` is still passed (property does not exist on the new type)
4. Remove `p_casino_id` from each flagged callsite (production + test files)
5. Run `npm run type-check` and `npm run build`
6. Run affected service tests; update test callsites as needed
7. Verify SEC-003 allowlist shrinks; after all PRs, allowlist is empty

**Delegation decision flow (OQ-1/OQ-2):**

1. Product owner reviews whether "supervisor records on behalf of staff" is a real use case
2. If delegation is legitimate: document ADR-024 exception, keep param with explicit justification
3. If delegation is not legitimate: remove param, derive from `app.actor_id`
4. Decision unblocks PR D3 (loyalty) and PR D4 (financial)

---

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|-----------|--------|-------|
| PRD-041 P2-1 remediation (12 RPCs) | Complete (merged) | This PRD covers the remaining backlog |
| WS6 enforcement flip (PR #14) | Complete | SEC-003 hard-fails on new `p_casino_id` violations |
| `set_rls_context_from_staff()` in all 14 RPCs | Verify per FR-0 | Each RPC must be verified during implementation; any missing context call is a blocker (see FR-0) |
| SEC-003 CI gate operational | Complete | Gate hard-fails on non-allowlisted `p_casino_id` |
| Type regeneration infrastructure | Complete | `npm run db:types-local` pipeline functional |

### 7.2 Risks & Open Questions

| Risk | Impact | Mitigation |
|------|--------|------------|
| **R1**: Missed callsite causes runtime error after migration | HIGH --- PostgREST returns error for unknown param | TypeScript compiler catches all mismatches after type regeneration. Independent PRs limit blast radius. |
| **R2**: OQ-1/OQ-2 business decisions delayed | MEDIUM --- PR D3 and D4 blocked | PR D1 and D2 are unblocked and can ship immediately. Delegation RPCs are isolated. |
| **R3**: Tier 4 RPCs already remediated but still in allowlist | LOW --- allowlist entries are harmless but misleading | FR-7 investigation confirms catalog state; adjust allowlist accordingly. |
| **R4**: Phantom overload if old signature lingers | HIGH --- PostgREST routing ambiguity | Every PR uses DROP + CREATE (not CREATE OR REPLACE). SEC-002 gate catches residual overloads. |
| **R5**: Loyalty RPC test coverage gaps | MEDIUM --- integration tests may need substantial updates | Callsite audit shows test files; compiler-assisted refactoring makes changes mechanical. |

### 7.3 Open Questions

| ID | Question | Owner | Deadline |
|----|----------|-------|----------|
| **OQ-1** | Is delegated attribution ("supervisor records on behalf of staff") legitimate for `rpc_create_financial_txn`? If yes, document ADR-024 exception. If no, remove `p_created_by_staff_id` and derive from `app.actor_id`. | Priya Shah (Product) | 2026-03-24 |
| **OQ-2** | Do `rpc_manual_credit` (`p_awarded_by_staff_id`) and `rpc_redeem` (`p_issued_by_staff_id`) follow the same delegation pattern as OQ-1? Should they be resolved together? | Product / Engineering | 2026-03-24 |

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**

- [ ] All 14 RPCs have `p_casino_id` removed; all production and test TypeScript callsites updated and passing
- [ ] Every remediated RPC calls `set_rls_context_from_staff()` as first executable statement (FR-0 verified)
- [ ] Tier 4 investigation complete: `rpc_start_rating_slip` and `rpc_issue_mid_session_reward` verified or remediated

**Data & Integrity**

- [ ] No business-output change for valid callers; `casino_id` derivation verified via acceptance tests

**Security & Access**

- [ ] `SELECT proname FROM pg_proc WHERE proname LIKE 'rpc_%' AND 'p_casino_id' = ANY(proargnames);` returns 0 rows; no phantom overloads
- [ ] SEC-003 allowlist is empty; all 8 security gates pass clean (8/8)

**Testing**

- [ ] Each PR passes `npm run db:types-local && npm run type-check && npm run build`
- [ ] Affected unit, integration, and catalog-based acceptance tests pass

**Operational Readiness**

- [ ] Migrations follow `MIGRATION_NAMING_STANDARD.md`; each PR deployable independently with atomic rollback path

**Documentation**

- [ ] OQ-1 and OQ-2 resolved: delegation params either removed or justified in ADR-024 addendum
- [ ] Gap document updated with resolution status; SEC-003 allowlist entries removed as PRs merge

---

## 9. Related Documents

| Document | Path | Relevance |
|----------|------|-----------|
| Source Gap Document | `docs/issues/gaps/sec-007/GAP-SEC007-WS6-REMAINING-RPC-REMEDIATION.md` | Source gap defining all 14 RPCs |
| PRD-041 (Predecessor) | `docs/10-prd/PRD-041-adr024-p2-validate-to-derive-remediation-v0.md` | First batch: 12 RPCs remediated |
| P2 Backlog Gap | `docs/issues/gaps/sec-007/GAP-SEC007-P2-BACKLOG-ADR024-COMPLIANCE.md` | Original P2 deferral and delegation question |
| WS6 Rollout Plan | `docs/issues/gaps/sec-007/WS6-ROLLOUT-PLAN.md` | Enforcement flip plan and allowlist correction |
| ADR-024 | `docs/80-adrs/ADR-024_DECISIONS.md` | Authoritative context derivation mandate |
| ADR-018 | `docs/80-adrs/ADR-018-security-definer-governance.md` | SECURITY DEFINER governance |
| ADR-030 | `docs/80-adrs/ADR-030-auth-system-hardening.md` | Auth pipeline hardening, TOCTOU |
| SEC-007 Audit | `docs/30-security/SEC-007-tenant-isolation-enforcement-contract.md` | Full audit findings (P0--P2) |
| SEC-003 Gate | `supabase/tests/security/03_identity_param_check.sql` | CI gate tracking `p_casino_id` |
| EXEC-040 | `docs/21-exec-spec/EXEC-040-sec007-tenant-isolation-enforcement.md` | Execution spec for SEC-007 |
| SRM | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | Bounded context ownership |
| Schema / Types | `types/database.types.ts` | Generated DB types (source of truth for TS callsites) |
| Migration Standard | `docs/60-release/MIGRATION_NAMING_STANDARD.md` | Migration naming rules |

---

## Appendix A: RPC Inventory

| # | Function | Bounded Context | Params to Remove | PR | Production TS Callsites |
|---|----------|----------------|------------------|-----|------------------------|
| 1 | `rpc_get_dashboard_tables_with_counts` | Dashboard | `p_casino_id` | D1 | `hooks/dashboard/use-dashboard-tables.ts` |
| 2 | `rpc_get_player_last_session_context` | Visit | `p_casino_id` | D1 | `services/visit/crud.ts` |
| 3 | `rpc_get_player_recent_sessions` | Visit | `p_casino_id` | D1 | `services/visit/crud.ts` |
| 4 | `rpc_get_rating_slip_modal_data` | RatingSlip | `p_casino_id` | D1 | `services/rating-slip-modal/rpc.ts` |
| 5 | `rpc_start_rating_slip` | Visit | `p_casino_id` | D1 | `services/visit/crud.ts`, `services/rating-slip/crud.ts` |
| 6 | `rpc_issue_mid_session_reward` | Loyalty | `p_casino_id` | D1 | No production callsite found (DTO defined in `services/loyalty/dtos.ts`; verify catalog status) |
| 7 | `rpc_accrue_on_close` | Loyalty | `p_casino_id` | D2 | `services/loyalty/crud.ts` |
| 8 | `rpc_apply_promotion` | Loyalty | `p_casino_id` | D2 | `services/loyalty/crud.ts` |
| 9 | `rpc_get_player_ledger` | Loyalty | `p_casino_id` | D2 | `services/loyalty/crud.ts` |
| 10 | `rpc_reconcile_loyalty_balance` | Loyalty | `p_casino_id` | D2 | `services/loyalty/crud.ts` |
| 11 | `rpc_manual_credit` | Loyalty | `p_casino_id`, `p_awarded_by_staff_id` | D3 | `services/loyalty/crud.ts` |
| 12 | `rpc_redeem` | Loyalty | `p_casino_id`, `p_issued_by_staff_id` | D3 | `services/loyalty/crud.ts` |
| 13 | `rpc_create_financial_txn` | Financial | `p_casino_id`, `p_created_by_staff_id` | D4 | `lib/finance.ts` |
| 14 | `rpc_create_financial_adjustment` | Financial | `p_casino_id` | D4 | `services/player-financial/http.ts` |

---

## Appendix B: PR Sequencing

### PR D1 --- Cross-Context Reads + Tier 4 Investigation

**Blocked by:** Nothing --- can ship immediately

**Migration:** DROP + CREATE for `rpc_get_dashboard_tables_with_counts`, `rpc_get_player_last_session_context`, `rpc_get_player_recent_sessions`, `rpc_get_rating_slip_modal_data`. Investigate and remediate `rpc_start_rating_slip` and `rpc_issue_mid_session_reward` if still carrying `p_casino_id`.

**Catalog snapshot (required):** PR description must include the output of `SELECT proname, proargnames FROM pg_proc WHERE proname IN ('rpc_start_rating_slip', 'rpc_issue_mid_session_reward') AND 'p_casino_id' = ANY(proargnames);` to prove Tier-4 catalog state to reviewers.

**TS Updates:**
- `hooks/dashboard/use-dashboard-tables.ts` (1 callsite)
- `services/visit/crud.ts` (3 callsites)
- `services/rating-slip/crud.ts` (1 callsite, if Tier 4 applies)
- Test files: `services/visit/__tests__/`, `lib/supabase/__tests__/rls-pooling-safety.integration.test.ts`

**Rationale:** Read-only RPCs with lowest risk. Tier 4 investigation establishes whether prior migrations already landed.

### PR D2 --- Loyalty RPCs (no delegation params)

**Blocked by:** Nothing --- can ship immediately (parallel with D1)

**Migration:** DROP + CREATE for `rpc_accrue_on_close`, `rpc_apply_promotion`, `rpc_get_player_ledger`, `rpc_reconcile_loyalty_balance`

**TS Updates:**
- `services/loyalty/crud.ts` (4 callsites)
- Test files: `services/loyalty/__tests__/`, `services/rating-slip/__tests__/policy-snapshot.integration.test.ts`, `services/security/__tests__/rls-context.integration.test.ts`

**Rationale:** Four loyalty RPCs with straightforward `p_casino_id`-only removal. No delegation params involved.

### PR D3 --- Loyalty Delegation RPCs

**Blocked by:** OQ-2 resolution

**Migration:** DROP + CREATE for `rpc_manual_credit`, `rpc_redeem`. Delegation param handling depends on OQ-2 outcome.

**TS Updates:**
- `services/loyalty/crud.ts` (2 callsites)
- Test files: `services/loyalty/__tests__/`, `services/security/__tests__/`

**Rationale:** Delegation params require business decision before implementation.

### PR D4 --- Financial RPCs

**Blocked by:** OQ-1 resolution

**Migration:** DROP + CREATE for `rpc_create_financial_txn`, `rpc_create_financial_adjustment`. Delegation param handling for `p_created_by_staff_id` depends on OQ-1 outcome.

**TS Updates:**
- `lib/finance.ts` (1 callsite)
- Test files: `lib/supabase/__tests__/pit-boss-financial-txn.test.ts`

**Rationale:** Financial RPCs have the most complex delegation question and the densest test coverage. Isolated last to avoid blocking other PRs.

---

## Appendix C: SQL Pattern Reference

Same pattern as PRD-041. See PRD-041 Appendix C for full reference.

**Canonical migration recipe (strict DROP + CREATE --- no `OR REPLACE`):**

> **SECURITY posture:** Use the existing SECURITY mode (DEFINER vs INVOKER) from the current function; the snippet below shows DEFINER only as an example. If SECURITY DEFINER → include `SET search_path = pg_catalog, public` (per ADR-018). If SECURITY INVOKER → omit the SECURITY DEFINER clause; `SET search_path` is optional per governance.

```sql
-- Step 1: DROP old signature (with p_casino_id)
DROP FUNCTION IF EXISTS public.rpc_example(UUID, ...other_params...);

-- Step 2: CREATE new signature (without p_casino_id)
-- Use strict CREATE (not CREATE OR REPLACE) to guarantee no lingering overload
-- SECURITY posture: match the existing function (DEFINER or INVOKER)
CREATE FUNCTION rpc_example(...other_params...)
RETURNS ...
LANGUAGE plpgsql
SECURITY DEFINER                          -- ← keep existing posture; do NOT change
SET search_path = pg_catalog, public      -- ← required when DEFINER; optional when INVOKER
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

-- Step 3: Grant posture
REVOKE ALL ON FUNCTION rpc_example(...) FROM PUBLIC;
REVOKE ALL ON FUNCTION rpc_example(...) FROM anon;
GRANT EXECUTE ON FUNCTION rpc_example(...) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_example(...) TO service_role;
NOTIFY pgrst, 'reload schema';
```
