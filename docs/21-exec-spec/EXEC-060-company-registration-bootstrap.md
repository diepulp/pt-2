---
prd: PRD-060
prd_title: "Company Registration and First Property Bootstrap"
service: CompanyService
mvp_phase: 1

workstreams:
  WS1:
    name: Database Migration and RLS
    description: Create onboarding_registration table with RLS, partial unique index, and grants
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - supabase/migrations/20260402002621_prd060_onboarding_registration.sql
      - types/database.types.ts
    gate: schema-validation
    estimated_complexity: medium

  WS2:
    name: Registration RPC
    description: SECURITY DEFINER rpc_register_company with auth-flow pre-staff pattern and security governance allowlist updates
    executor: rls-expert
    executor_type: skill
    depends_on: [WS1]
    outputs:
      - supabase/migrations/20260402002622_prd060_rpc_register_company.sql
      - supabase/tests/security/04_public_execute_check.sql
      - supabase/tests/security/06_context_first_line_check.sql
      - supabase/tests/security/06_context_first_line_check.sh
    gate: schema-validation
    estimated_complexity: medium

  WS3:
    name: Bootstrap RPC Amendment
    description: Amend rpc_bootstrap_casino to resolve company from onboarding_registration and remove synthetic auto-create
    executor: rls-expert
    executor_type: skill
    depends_on: [WS1]
    outputs:
      - supabase/migrations/20260402002623_prd060_amend_rpc_bootstrap_casino.sql
    gate: schema-validation
    estimated_complexity: medium

  WS4:
    name: Service Layer
    description: Create services/company module with DTOs schemas CRUD keys and service factory
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS1, WS2, WS3]
    outputs:
      - services/company/dtos.ts
      - services/company/schemas.ts
      - services/company/crud.ts
      - services/company/keys.ts
      - services/company/http.ts
      - services/company/index.ts
    gate: type-check
    estimated_complexity: medium

  WS5:
    name: Gateway Routing and Registration Page
    description: New register page with form and server action plus start page routing amendment and page guards
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS4]
    outputs:
      - app/(onboarding)/register/page.tsx
      - app/(onboarding)/register/_actions.ts
      - components/onboarding/register-form.tsx
      - app/(public)/start/page.tsx
      - app/(onboarding)/bootstrap/page.tsx
    gate: lint
    estimated_complexity: medium

  WS6:
    name: Integration Tests
    description: RPC contract tests and service integration tests covering registration and bootstrap flows
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS2, WS3, WS4]
    outputs:
      - services/company/__tests__/rpc-contract.int.test.ts
      - services/company/__tests__/crud.int.test.ts
    gate: test-pass
    estimated_complexity: medium

  WS7:
    name: E2E Write-Path Tests
    description: Playwright specs covering registration to bootstrap to setup user journey and URL bypass prevention
    executor: e2e-testing
    executor_type: skill
    depends_on: [WS5, WS6]
    outputs:
      - e2e/workflows/company-registration.spec.ts
      - e2e/fixtures/company-registration-fixtures.ts
    gate: test-pass
    estimated_complexity: medium

execution_phases:
  - name: Phase 1 — Foundation
    parallel: [WS1]
    gates: [schema-validation]

  - name: Phase 2 — RPCs
    parallel: [WS2, WS3]
    gates: [schema-validation]

  - name: Phase 3 — Service Layer
    parallel: [WS4]
    gates: [type-check]

  - name: Phase 4 — Frontend
    parallel: [WS5]
    gates: [lint]

  - name: Phase 5 — Testing
    parallel: [WS6, WS7]
    gates: [test-pass]

gates:
  schema-validation:
    command: npm run db:types-local
    success_criteria: "Exit code 0, types regenerated successfully"

  type-check:
    command: npm run type-check
    success_criteria: "Exit code 0, no type errors"

  lint:
    command: npm run lint
    success_criteria: "Exit code 0, no errors, max-warnings=0"

  test-pass:
    command: npm test services/company/ && npx playwright test e2e/workflows/company-registration.spec.ts --reporter=list
    success_criteria: "All unit, integration, and E2E tests pass"

external_dependencies:
  - prd: PRD-050
    service: CasinoService
    required_for: "ADR-043 company table and casino.company_id NOT NULL"

risks:
  - risk: "Existing bootstrap callers (tests, seeds, E2E) break without registration precondition"
    mitigation: "WS6 updates all existing bootstrap-dependent tests. Grep for rpc_bootstrap_casino invocations."
  - risk: "Abandoned registrations accumulate (pending rows with no bootstrap follow-through)"
    mitigation: "Acceptable — one pending row per user is tolerated (partial unique index enforces the cap). Pending rows are visible to the owning user and affect routing, but cause no operational harm. Future slice can add TTL/cleanup if abandoned registrations become noisy."
  - risk: "Bootstrap retry after consumed registration creates duplicate company"
    mitigation: "RESOLVED. WS3 makes bootstrap idempotent — if user already has an active staff binding, returns existing (casino_id, staff_id, staff_role) with no side effects. WS2 adds a containment guardrail blocking re-registration for bootstrapped users. Primary fix is WS3 idempotency; WS2 guard is defensive perimeter."
  - risk: "PRD Appendix C shows timezone default America/New_York but codebase uses America/Los_Angeles"
    mitigation: "Preserve existing codebase default (America/Los_Angeles). Do NOT change rpc_bootstrap_casino default."
---

# EXECUTION-SPEC: PRD-060 — Company Registration and First Property Bootstrap

## Overview

PRD-060 introduces an explicit company registration step before first-property bootstrap. Currently, `rpc_bootstrap_casino` auto-creates a synthetic company row copied from the casino name (ADR-043 D4). This spec replaces that path with a two-step flow: operator registers their company via `rpc_register_company`, then `rpc_bootstrap_casino` resolves the registered company server-side and consumes the registration transactionally.

**Bounded Contexts:**
- **CompanyService (NEW)** — owns `company` (transferred from CasinoService), `onboarding_registration` (new), `rpc_register_company` (new)
- **CasinoService (AMENDED)** — `rpc_bootstrap_casino` amended to resolve company from registration, synthetic auto-create removed

## Scope

- **In Scope**: `onboarding_registration` table + RLS, `rpc_register_company` RPC, `rpc_bootstrap_casino` amendment, `services/company/` module, `/register` page, `/start` routing amendment, page guards, integration tests, E2E tests
- **Out of Scope**: Company edit/settings UI, multi-property flows, abandoned registration cleanup (TTL)

## Architecture Context

- **ADR-024 INV-8**: No client-carried `company_id` at any layer — company identity resolved server-side from `onboarding_registration`
- **ADR-018**: SECURITY DEFINER governance for `rpc_register_company` (pre-staff auth-flow exception — uses `auth.uid()` directly, not `set_rls_context_from_staff()`)
- **ADR-030**: Fail-closed posture — `rpc_bootstrap_casino` raises exception if no pending registration exists
- **ADR-043**: Company foundation — `casino.company_id NOT NULL` already enforced; synthetic auto-create path (D4) superseded by this PRD
- **SRM v4.22.0 → v4.23.0**: CompanyService formally introduced as new bounded context

## Workstream Details

### WS1: Database Migration & RLS

**Purpose**: Create `onboarding_registration` table with deny-by-default RLS and partial unique index.

**Deliverables**:
1. Migration file `20260402002621_prd060_onboarding_registration.sql`:
   - CREATE TABLE `onboarding_registration` (id, user_id, company_id, status, created_at, consumed_at)
   - `status` CHECK constraint: `('pending', 'consumed')`
   - Partial unique index: `CREATE UNIQUE INDEX uq_onboarding_registration_pending ON onboarding_registration (user_id) WHERE status = 'pending'`
   - RLS enabled, deny-by-default
   - SELECT policy: `user_id = auth.uid() AND status = 'pending'`
   - No INSERT/UPDATE/DELETE policies (all mutations via SECURITY DEFINER RPCs)
   - REVOKE ALL then GRANT SELECT to `authenticated`
   - NOTIFY pgrst, 'reload schema'
2. Regenerate `types/database.types.ts` via `npm run db:types-local`

**Special Constraints**:
- `onboarding_registration` has NO `casino_id` column — pre-tenancy exception to multi-tenancy rule
- `user_id` references `auth.users(id)` — not `staff.id` (user has no staff binding yet)
- `company_id` references `company(id)` — links registration to the company created in `rpc_register_company`

**Acceptance Criteria**:
- [ ] `npm run db:types-local` succeeds
- [ ] `onboarding_registration` table exists with correct constraints
- [ ] RLS enabled with deny-by-default + SELECT policy for pending rows only
- [ ] Partial unique index enforces one pending registration per user

### WS2: Registration RPC

**Purpose**: Create `rpc_register_company` SECURITY DEFINER RPC using pre-staff auth pattern.

**Deliverables**:
1. Migration file `20260402002622_prd060_rpc_register_company.sql`:
   - `rpc_register_company(p_company_name text, p_legal_name text DEFAULT NULL)` RETURNS TABLE(company_id uuid, registration_id uuid)
   - SECURITY DEFINER, `SET search_path = pg_catalog, public`
   - Auth check: `auth.uid()` must not be NULL (reject anonymous)
   - **Already-bootstrapped guard** (containment guardrail): check `staff` table for existing active binding with `user_id = auth.uid()`. If found, raise `ALREADY_BOOTSTRAPPED` with ERRCODE `23505` (same CONFLICT family as bootstrap duplicate — message prefix distinguishes). This prevents orphaned company rows from forming; a bootstrapped user has no business creating a new company. This guard is defensive perimeter fencing — the primary idempotency fix lives in WS3.
   - Conflict detection: rely on the partial unique index (`uq_onboarding_registration_pending`) to raise `23505` (unique_violation) naturally on duplicate INSERT — do NOT pre-check and raise separately. The index is the canonical enforcement; the service layer maps 23505 → REGISTRATION_CONFLICT (409).
   - Transaction: INSERT `company` row, INSERT `onboarding_registration` with status='pending'
   - REVOKE ALL from PUBLIC, anon; GRANT EXECUTE to authenticated
   - COMMENT ON FUNCTION documenting ADR-018 compliance and auth-flow exception
   - NOTIFY pgrst, 'reload schema'
2. Update `supabase/tests/security/04_public_execute_check.sql` — add `rpc_register_company` to auth-flow allowlist (`v_allowlist` array)
3. Update `supabase/tests/security/06_context_first_line_check.sql` — add `rpc_register_company` to auth-flow allowlist (`v_allowlist` array)
4. Update `supabase/tests/security/06_context_first_line_check.sh` — add `rpc_register_company` to `ALLOWLIST` string with comment

**Patterns**:
- ADR-018 SECURITY DEFINER governance (auth-flow exception — no `set_rls_context_from_staff()`)
- ADR-024 INV-8 compliant (no `p_casino_id` or `p_actor_id` parameters)
- Same auth-flow pattern as existing `rpc_bootstrap_casino`

**Acceptance Criteria**:
- [ ] `rpc_register_company` creates company + pending registration in one transaction
- [ ] Returns CONFLICT (23505) if pending registration already exists
- [ ] **Returns ALREADY_BOOTSTRAPPED (23505) if user already has an active staff binding** (containment guardrail)
- [ ] No `set_rls_context_from_staff()` call (pre-staff RPC)
- [ ] Security governance tests pass with `rpc_register_company` allowlisted
- [ ] REVOKE/GRANT correctly restrict to authenticated role only

### WS3: Bootstrap RPC Amendment

**Purpose**: Amend `rpc_bootstrap_casino` to resolve company from registration instead of synthetic auto-create.

**Deliverables**:
1. Migration file `20260402002623_prd060_amend_rpc_bootstrap_casino.sql`:
   - `CREATE OR REPLACE FUNCTION rpc_bootstrap_casino(...)` — signature UNCHANGED
   - REPLACE existing CONFLICT exception block with **idempotent return**: if `staff` row exists for `auth.uid()` with `status = 'active'`, return existing `(casino_id, staff_id, staff_role)` and `RETURN` — no creation, no exception. This is the primary fix for bootstrap retry safety: retrying the same bootstrap intent must not explode.
   - REMOVE: synthetic company auto-create (`INSERT INTO company (name) VALUES (p_casino_name)`)
   - ADD: Registration lookup — `SELECT company_id, id INTO v_company_id, v_registration_id FROM onboarding_registration WHERE user_id = auth.uid() AND status = 'pending'`
   - ADD: Fail-closed — `IF v_company_id IS NULL THEN RAISE EXCEPTION 'BOOTSTRAP_NO_REGISTRATION: ...' USING ERRCODE = 'P0002'` (distinct from existing 23505 CONFLICT)
   - MODIFY: Casino INSERT uses resolved `v_company_id` (no change to INSERT statement, just the source of v_company_id)
   - ADD: Mark consumed — `UPDATE onboarding_registration SET status = 'consumed', consumed_at = now() WHERE id = v_registration_id`
   - Audit log payload updated with `registration_id`
   - COMMENT updated to reflect PRD-060 amendment
   - NOTIFY pgrst, 'reload schema'

**Idempotency contract** (replaces previous CONFLICT exception):
```sql
-- IDEMPOTENCY — if already bootstrapped, return existing binding (true retry safety)
SELECT s.casino_id, s.id, s.role::text
  INTO v_casino_id, v_staff_id, v_staff_role_text
FROM public.staff s
WHERE s.user_id = v_user_id AND s.status = 'active';

IF v_casino_id IS NOT NULL THEN
  casino_id  := v_casino_id;
  staff_id   := v_staff_id;
  staff_role := v_staff_role_text;
  RETURN NEXT;
  RETURN;
END IF;
```
The invariant: retrying the same bootstrap intent returns the same result. No new error code, no new state — if the work is done, say so.

**Patterns**:
- ADR-024: company_id derived from DB state, not parameters
- ADR-030: Fail-closed posture — raises distinct error if no pending registration
- Error code: `P0002` — distinct SQLSTATE for missing registration in this RPC path
- Idempotent return on existing staff binding — no exception, no side effects

**Acceptance Criteria**:
- [ ] Synthetic company auto-create logic completely removed
- [ ] **Bootstrap with existing active staff binding returns existing `(casino_id, staff_id, staff_role)` — no exception, no creation** (idempotent)
- [ ] Company resolved from `onboarding_registration` by `auth.uid()`
- [ ] Bootstrap raises `P0002` when no pending registration exists (and no existing staff binding)
- [ ] Registration marked `consumed` with `consumed_at = now()` in same transaction
- [ ] Existing return signature unchanged (casino_id, staff_id, staff_role)
- [ ] No partial writes persist on transaction failure

### WS4: Service Layer

**Purpose**: Create `services/company/` module implementing CompanyService bounded context.

**Deliverables**:
1. `services/company/dtos.ts` — DTOs derived from Database types (Pattern B: Pick/Omit)
   - `CompanyDTO`: Pick<Database['public']['Tables']['company']['Row'], 'id' | 'name' | 'legal_name' | 'created_at'>
   - `OnboardingRegistrationDTO`: Pick from onboarding_registration Row
   - `RegisterCompanyInput`: `{ company_name: string; legal_name?: string }`
   - `RegisterCompanyResult`: `{ company_id: string; registration_id: string }`
2. `services/company/schemas.ts` — Zod validation schemas
   - `registerCompanySchema`: `z.object({ company_name: z.string().min(1).max(200), legal_name: z.string().max(200).optional() })`
3. `services/company/crud.ts` — CRUD operations
   - `registerCompany(supabase, input)`: calls `supabase.rpc('rpc_register_company', ...)`, maps result to `RegisterCompanyResult`
   - `getRegistrationStatus(supabase)`: queries `onboarding_registration` for current user's pending row. Returns `OnboardingRegistrationDTO | null` — non-null with pending row details pre-bootstrap, null after consumption (consumed rows invisible via RLS). WS6 tests must assert this contract explicitly.
4. `services/company/keys.ts` — React Query key factory
   - `companyKeys.registration()`: key for registration status query
5. `services/company/http.ts` — ServiceHttpResult wrappers
6. `services/company/index.ts` — Service factory export: `createCompanyService(supabase)`

**Patterns**:
- Functional factory pattern (no classes)
- Explicit `CompanyServiceInterface` (no `ReturnType` inference)
- DTO Pattern B (Pick/Omit from `database.types.ts`)
- Zod schemas in `schemas.ts` (ADR-013)

**SRM v4.23.0 Amendment**:
- CompanyService introduced as new bounded context
- Owns: `company`, `onboarding_registration`
- RPCs: `rpc_register_company`
- CasinoService: `company` table ownership transferred; retains `casino.company_id` FK read-access

**Acceptance Criteria**:
- [ ] `npm run type-check` passes
- [ ] Service factory exports explicit interface
- [ ] DTOs derived from `database.types.ts` (no manual interfaces)
- [ ] Zod schema validates company name (required, 1-200 chars) and legal name (optional, max 200)
- [ ] SRM updated to v4.23.0 with CompanyService

### WS5: Gateway Routing & Registration Page

**Purpose**: Create `/register` page, amend `/start` routing, and add page guards.

**Surface Classification (ADR-041)**:
- **Rendering Delivery**: Hybrid — RSC for auth check + routing guard (server), Client Shell for form interaction
- **Data Aggregation**: Simple Query — single Supabase query for registration status
- **Rejected Patterns**: Full CSR rejected (auth check must be server-side for security); BFF RPC rejected (no aggregation needed)
- **Metric Provenance**: None — registration page is a form, not a metrics dashboard

**Deliverables**:
1. `app/(onboarding)/register/page.tsx` — Server component
   - Auth guard: redirect to `/signin` if no user
   - Page guard: query `onboarding_registration` for pending row via `.maybeSingle()` (RLS filters to `user_id = auth.uid() AND status = 'pending'` automatically) — if exists, redirect to `/bootstrap`
   - Render `<RegisterForm />` component
2. `components/onboarding/register-form.tsx` — Client component (`'use client'`)
   - Modeled on `components/onboarding/bootstrap-form.tsx`
   - `useActionState` for form submission (React 19)
   - Two fields: `company_name` (Input, required), `legal_name` (Input, optional with helper text)
   - On success: `router.push('/bootstrap')` — NO `refreshAndVerifyClaims` (registration creates no staff/claims)
   - On `REGISTRATION_CONFLICT`: inline error "You already have a pending registration"
   - shadcn/ui Card/Input/Button, Tailwind v4
3. `app/(onboarding)/register/_actions.ts` — Server action
   - `registerCompanyAction(formData)`: validates via `registerCompanySchema`, calls `registerCompany()` from CompanyService
   - Uses `withServerAction` with `{ domain: 'company', action: 'register', skipAuth: true }` (auth-flow, pre-staff)
   - Return type: `Promise<ServiceResult<RegisterCompanyResult>>`
4. `app/(public)/start/page.tsx` — Amended routing:
   - Only the `!staff` branch changes (currently lines 31-33: `redirect('/bootstrap')`)
   - Insert: `.from('onboarding_registration').select('id').eq('status', 'pending').maybeSingle()` — include explicit `.eq('status', 'pending')` for self-documenting route logic even though RLS enforces the same filter. Route-gating code should not depend on hidden policy semantics.
   - PRD's 6 routing cases collapse to 2 code paths in `!staff` branch: pending row → `/bootstrap`, no row → `/register` (cases 5+6 identical because consumed rows invisible via RLS SELECT policy)
   - Full routing priority (first match wins):
     1. staff exists + active + setup complete → `/pit`
     2. staff exists + active + setup incomplete → `/setup`
     3. staff exists + inactive → `/signin?error=inactive`
     4. no staff + pending registration → `/bootstrap`
     5. no staff + no pending registration → `/register`
5. `app/(onboarding)/bootstrap/page.tsx` — Amended page guard:
   - Insert after existing `casinoId` redirect (line ~18): query `onboarding_registration` for pending row
   - If no pending row → redirect to `/register`
   - Preserves existing `casinoId` check (redirect to `/start` if already bound)

**UI Components**:
- Form with shadcn/ui: `Input` (company name, required), `Input` (legal name, optional)
- Label: "Legal company name (optional)" with helper text per PRD §5.1
- Submit button with loading state via `useActionState` (React 19)
- Error display for CONFLICT state

**Acceptance Criteria**:
- [ ] `/register` renders form and submits successfully
- [ ] `/register` redirects to `/bootstrap` if pending registration exists
- [ ] `/start` routes correctly through all 5 priority conditions
- [ ] `/bootstrap` redirects to `/register` if no pending registration
- [ ] Form validates company name as required, legal name as optional
- [ ] CONFLICT error displayed when duplicate registration attempted
- [ ] `npm run lint` passes with max-warnings=0

### WS6: Integration Tests

**Purpose**: Verify RPC contracts and service layer behavior with real Supabase.

**Deliverables**:
1. `services/company/__tests__/rpc-contract.int.test.ts`:
   - `rpc_register_company` creates company + pending registration
   - `rpc_register_company` returns CONFLICT (23505) on duplicate
   - `rpc_bootstrap_casino` fails closed (P0002) without prior registration
   - `rpc_bootstrap_casino` resolves company from registration and creates casino under correct company_id
   - Registration row marked `consumed` after successful bootstrap
   - Consumed row invisible via RLS SELECT policy
   - Partial unique index allows re-registration after consumed (new pending row)
2. `services/company/__tests__/crud.int.test.ts`:
   - `registerCompany()` happy path
   - `getRegistrationStatus()` returns pending row for current user
   - `getRegistrationStatus()` returns null after consumption

**Patterns**:
- Integration tests use real Supabase (not mocked)
- Test naming: `*.int.test.ts` (governance standard)
- Co-located: `services/company/__tests__/`
- Each test manages own test data lifecycle
- All existing `rpc_bootstrap_casino` callers in test suite updated with `rpc_register_company` precondition

**Acceptance Criteria**:
- [ ] All integration tests pass with `npm test services/company/`
- [ ] RPC error codes verified (23505 for conflict, P0002 for missing registration)
- [ ] RLS visibility verified (consumed rows invisible)
- [ ] Existing bootstrap tests updated — no regressions

### WS7: E2E Write-Path Tests

**Purpose**: Playwright specs covering full registration-to-bootstrap user journey.

**Write-Path Classification**: DETECTED — `rpc_register_company` (INSERT), `rpc_bootstrap_casino` amendment (UPDATE consumed), form submissions. E2E mandate applies per workflows-gaps.md §3.

**Deliverables**:
1. `e2e/workflows/company-registration.spec.ts` — Test scenarios:
   - **S1 Happy path** (serial): Sign in → /start → /register → fill company name + optional legal name → submit → /bootstrap → fill casino name → submit → /start → /setup. DB verification: company row, consumed registration, casino under correct company_id
   - **S2a URL bypass - bootstrap without registration**: Navigate to /bootstrap → redirected to /register
   - **S2b URL bypass - register with pending registration**: Navigate to /register → redirected to /bootstrap
   - **S3 Duplicate registration CONFLICT** (Mode C): Call `rpc_register_company` via authenticated client with existing pending → expect unique_violation. This is an API-level negative-path check, not a browser journey — included in WS7 because the `/register` page guard prevents browser-path reproduction of the CONFLICT. WS6 covers the RPC contract; S3 verifies the constraint holds end-to-end from an authenticated client perspective.
   - **S4 Required fields only**: Register with company name only (no legal name) → succeeds, legal_name is null in DB
2. `e2e/fixtures/company-registration-fixtures.ts` — Test fixtures:
   - `createRegistrationScenario()`: Creates bare auth user only (no staff, no company — the "brand new operator" state)
   - `createRegistrationWithPendingScenario()`: Creates auth user + calls `rpc_register_company` via service-role to pre-populate pending registration
   - Cleanup closure handles variable state (partial flow completion)

**Patterns**:
- Mode B (browser login) for S1, S2, S4 — tests real Next.js middleware/session/route chain per QA-006
- Mode C (authenticated client) for S3 — page guard prevents reaching form, so RPC constraint tested at API level
- Auth fixtures: `authenticateAndNavigate` from `e2e/fixtures/auth.ts` (shared auth helper per QA-006 §3)
- `test.describe.configure({ mode: 'serial' })` for multi-step flows
- DB verification via service-role client (bypasses RLS) for post-action assertions

**Acceptance Criteria**:
- [ ] At least 1 spec file exists at `e2e/workflows/company-registration.spec.ts`
- [ ] All Playwright specs pass: `npx playwright test e2e/workflows/company-registration.spec.ts --reporter=list`
- [ ] Minimum 5 test cases: S1, S2a, S2b, S3, S4
- [ ] Happy path (S1) covers full registration → bootstrap → setup flow with DB verification
- [ ] URL bypass prevention verified for both /register and /bootstrap

## Definition of Done

- [ ] All 7 workstreams complete
- [ ] All gates pass (schema-validation, type-check, lint, test-pass)
- [ ] E2E specs pass for write-path mandate (`npx playwright test e2e/workflows/company-registration.spec.ts`)
- [ ] No regressions in existing tests
- [ ] Security governance tests pass with `rpc_register_company` allowlisted
- [ ] ADR-024 INV-8 compliance: no client-carried `company_id` at any layer
- [ ] ADR-030 fail-closed: bootstrap raises exception without prior registration
- [ ] SRM updated to v4.23.0 (CompanyService introduced)
- [ ] Bootstrap is idempotent: re-calling with existing staff binding returns existing data, no exception (WS3)
- [ ] Re-registration blocked for bootstrapped users: `rpc_register_company` rejects with ALREADY_BOOTSTRAPPED (WS2)
