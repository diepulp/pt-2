---
id: PRD-060
title: Company Registration and First Property Bootstrap
owner: Lead Architect
status: Draft
affects: [ADR-043, ADR-024, ADR-030, SEC-002, ARCH-SRM-v4.23.0]
created: 2026-04-01
last_review: 2026-04-01
phase: Phase 1 (Foundational)
pattern: A
http_boundary: true
---

# PRD-060 — Company Registration and First Property Bootstrap

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Summary:** The onboarding flow creates synthetic company rows by copying the casino name during bootstrap, leaving `company` as a structurally present but operationally hollow entity. This PRD introduces an explicit company registration step before first-property bootstrap. A new `/register` page collects company name (required) and legal name (optional), a new `rpc_register_company` RPC persists the company and a pending `onboarding_registration` row, and the existing `rpc_bootstrap_casino` is amended to resolve the registered company server-side and consume the registration transactionally. There are no production tenants — the fix is forward-only with no legacy remediation.

---

## 2. Problem & Goals

### 2.1 Problem

ADR-043 Phase 1 established `company` as a real tenancy parent and enforced `casino.company_id NOT NULL`. However, the bootstrap RPC still auto-creates a synthetic company row named after the casino (ADR-043 D4). The result: `company.name` equals `casino.name`, `company.legal_name` is always NULL, and no user ever sees or controls the company record.

This means the first link in the canonical domain model — **Company (purchases PT-2) → owns Casino(s) → configured via Bootstrap** — is fabricated rather than established by the operator. The company entity is structurally present but carries no real business identity.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Operator explicitly registers their company before first-property bootstrap | Every new `company` row created through onboarding is created by `rpc_register_company`, never by `rpc_bootstrap_casino`. Future admin or seed paths may create company rows through other mechanisms — this goal governs onboarding only. |
| **G2**: Bootstrap resolves company identity server-side from DB state | `rpc_bootstrap_casino` reads `company_id` from `onboarding_registration` — no client-carried identifiers, no URL params, no JWT metadata |
| **G3**: Synthetic auto-create path is removed entirely | `rpc_bootstrap_casino` raises an exception if no pending registration exists for `auth.uid()` |
| **G4**: Gateway routing correctly sequences registration before bootstrap | `/start` redirects to `/register` when no pending registration exists, to `/bootstrap` when one does |
| **G5**: Company legal name is capturable at registration without blocking onboarding | `company.legal_name` is optional at registration, editable later |

### 2.3 Non-Goals

- Self-serve "add sister property" flow (second casino under same company)
- Company settings/edit panel (likely next slice, not this one)
- Payment, billing, pricing, invoicing, subscription
- Demo request / contact-sales / sales-assist choreography
- Tax ID, billing contact, corporate address, compliance profile
- Marketing-site lead capture or CRM integration
- Changes to PRD-051 cross-property recognition behavior
- Legacy tenant remediation UI (no production tenants exist)

---

## 3. Users & Use Cases

- **Primary users:** New operators onboarding their first casino property

**Top Jobs:**

- As an **operator**, I need to register my company name so that the tenant parent in PT-2 reflects my actual business identity.
- As an **operator**, I need to optionally provide my legal company name at registration so that I don't have to look it up before I can proceed with setup.
- As an **operator**, I need to be routed from registration to bootstrap automatically so that I create my first property under the company I just registered.
- As an **operator**, I need the system to prevent me from reaching bootstrap without first registering so that no synthetic company records are created.

---

## 4. Scope & Feature List

### 4.1 In Scope

**Registration:**
- Company registration form at `/register` (company name required, legal name optional)
- `rpc_register_company` SECURITY DEFINER RPC: creates `company` row + `onboarding_registration` row keyed to `auth.uid()`
- `onboarding_registration` table with `status` column (`pending` | `consumed`)
- RLS deny-by-default + SELECT policy scoped to `user_id = auth.uid() AND status = 'pending'`
- Partial unique index on `onboarding_registration.user_id` WHERE `status = 'pending'` (allows historical consumed rows while enforcing one active pending registration per user)

**Bootstrap amendment:**
- `rpc_bootstrap_casino` resolves `company_id` from `onboarding_registration` (no new parameters)
- Marks registration row `consumed` transactionally with casino creation
- Fails closed (raises exception) if no pending registration exists
- Synthetic company auto-create path removed entirely

**Gateway routing:**
- `/start` page evaluates routing conditions in priority order (see Section 6)
- `/register` page guard (redirect to `/bootstrap` if pending registration exists)
- `/bootstrap` page guard (redirect to `/register` if no pending registration)

**Testing:**
- Integration tests covering: registration creates correct rows, bootstrap fail-closed, bootstrap consumes registration, consumed rows invisible via RLS, route guard behavior

### 4.2 Out of Scope

- Company edit/settings UI
- Multi-property flows (adding second casino under same company)
- Abandoned registration cleanup (TTL/expiry) — downstream seam
- Bootstrap idempotency on transient failure — downstream seam

---

## 5. Requirements

### 5.1 Functional Requirements

- `rpc_register_company(p_company_name text, p_legal_name text DEFAULT NULL)` creates a `company` row and an `onboarding_registration` row with `status = 'pending'` in one transaction
- `rpc_register_company` returns CONFLICT if a pending registration already exists for `auth.uid()`
- `rpc_bootstrap_casino` resolves `company_id` by querying `onboarding_registration` for `user_id = auth.uid() AND status = 'pending'`
- `rpc_bootstrap_casino` raises a distinct error (not CONFLICT) if no pending row exists — separate from the existing duplicate-staff-binding CONFLICT
- `rpc_bootstrap_casino` creates the casino under the resolved `company_id`, marks the registration `consumed`, and creates the staff binding — all in one transaction
- No partial bootstrap writes persist if the transaction fails
- The `onboarding_registration` RLS SELECT policy only exposes `pending` rows — consumed rows are invisible to the client
- All mutations to `onboarding_registration` occur via SECURITY DEFINER RPCs — no direct INSERT/UPDATE/DELETE policies
- No client-carried `company_id` at any layer (RPC parameters, URL params, request body, JWT claims)
- `/register` form renders label "Legal company name (optional)" with helper text: "Use the registered legal entity name if known. You can add this later."

### 5.2 Non-Functional Requirements

- `rpc_register_company` must be allowlisted in security governance checks (context-first-line check, public-execute check) alongside `rpc_bootstrap_casino` — it is an auth-flow function called before staff context exists
- Registration and bootstrap RPCs must complete within existing Supabase RPC latency budget (no external calls, no async steps)
- Consistent with ADR-024 (server-authoritative derivation), ADR-030 (fail-closed posture), ADR-018 (SECURITY DEFINER governance)

> Architecture details: See SRM v4.23.0 §CompanyService (new), ADR-043, ADR-024, SEC-002

---

## 6. UX / Flow Overview

**Flow 1: New operator registration → bootstrap → setup**

1. Operator signs up / signs in → lands on `/start`
2. `/start` detects: no staff binding, no pending `onboarding_registration` → redirects to `/register`
3. Operator enters company name (required) and legal name (optional) → submits
4. `rpc_register_company` creates company + pending registration → redirects to `/bootstrap`
5. Operator enters casino name, timezone, gaming day start → submits
6. `rpc_bootstrap_casino` resolves company from registration, creates casino + staff, marks registration consumed → redirects to `/start`
7. `/start` detects: staff exists, setup incomplete → redirects to `/setup`
8. Normal setup flow continues

**`/start` routing priority (first match wins):**

```
1. staff exists + active + setup complete   → /pit
2. staff exists + active + setup incomplete  → /setup
3. staff exists + inactive                   → /signin?error=inactive
4. no staff + pending registration           → /bootstrap
5. no staff + no registration history         → /register
6. no staff + consumed registration only      → /register (treat as fresh)
```

**Flow 2: Direct URL bypass prevention**

1. User navigates directly to `/bootstrap` → page guard checks for pending registration
2. No pending registration → redirect to `/register`
3. User navigates directly to `/register` → page guard checks for pending registration
4. Pending registration exists → redirect to `/bootstrap`

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **SRM v4.23.0 amendment** — CompanyService formally introduced as bounded context owning `company` + `onboarding_registration`. Must land before or with this PRD's migration.
- **ADR-043 Phase 1 migration** — `company` table exists, `casino.company_id NOT NULL` enforced, `set_rls_context_from_staff()` derives `app.company_id`
- **Existing `rpc_bootstrap_casino`** — current signature (`p_casino_name, p_gaming_day_start?, p_timezone?`) is unchanged externally; internal logic changes only
- **Security governance tests** — `06_context_first_line_check` and `04_public_execute_check` must be updated to allowlist `rpc_register_company`

### 7.2 Risks & Open Questions

- **R1: Existing callers of `rpc_bootstrap_casino`** — Integration tests, seed scripts, and E2E tests call bootstrap without prior registration. All must be updated before this change lands. **Mitigation:** Grep codebase for all `rpc_bootstrap_casino` invocations; update each to include a `rpc_register_company` precondition.
- **R2: Abandoned registrations** — Pending rows with no bootstrap follow-through remain inert indefinitely. No TTL defined in this slice. **Mitigation:** Harmless — rows are invisible via RLS after consumption, orphaned rows have no operational impact. Future slice can add expiry if needed.
- **R3: Bootstrap idempotency** — If bootstrap fails mid-transaction and the user retries, the pending row should still be resolvable (transaction rolled back = row still `pending`). If the transaction succeeded but the client didn't receive the response, re-calling bootstrap finds a consumed row and fails. **Mitigation:** The partial unique index on pending rows means the user can re-register (creates a new pending row alongside the consumed one) and retry bootstrap. Acceptable for pre-production. **Known limitation:** recovery via re-registration creates an additional `company` row rather than resuming the original successful onboarding — the prior company row is orphaned. This is not a clean retry; it is a fresh registration path with duplication. Document as known limitation.
- **R4: Audit log shape for pre-bootstrap events** — `casino_id` and `actor_id` are NULL during registration (neither exists yet). **Decision deferred** to ADR/EXEC-SPEC: either carry `user_id` + `company_id` in `details` JSONB, or rely on `onboarding_registration.created_at` as the audit trail.
- **R5: SRM ownership** — This PRD formally introduces CompanyService as a new bounded context owning `company` and `onboarding_registration`. SRM amendment to v4.23.0 is a prerequisite dependency — it must land before or with this PRD's migration. CasinoService retains read-access to `company` rows via published DTO (existing `casino.company_id` FK is unchanged).

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `rpc_register_company` creates `company` + `onboarding_registration` (status=pending) in one transaction
- [ ] `rpc_bootstrap_casino` resolves company from pending registration, creates casino, marks consumed — all transactionally
- [ ] `rpc_bootstrap_casino` raises exception when no pending registration exists (fail-closed)
- [ ] `/start` routing correctly sequences registration → bootstrap → setup → pit
- [ ] Page guards prevent direct URL bypass of `/register` and `/bootstrap`

**Data & Integrity**
- [ ] No partial bootstrap writes persist on transaction failure
- [ ] Partial unique index on `onboarding_registration(user_id) WHERE status = 'pending'` prevents duplicate pending registrations while allowing historical consumed rows
- [ ] Consumed registration rows are invisible via RLS SELECT policy

**Security & Access**
- [ ] `onboarding_registration` has deny-by-default RLS + SELECT for `user_id = auth.uid() AND status = 'pending'`
- [ ] All mutations via SECURITY DEFINER RPCs — no direct INSERT/UPDATE/DELETE policies
- [ ] No client-carried `company_id` at any layer
- [ ] `rpc_register_company` allowlisted in security governance checks

**Testing**
- [ ] Integration tests cover: register creates rows, bootstrap fail-closed, bootstrap consumes registration, consumed row invisible, route guard redirects
- [ ] Existing bootstrap-dependent tests updated with registration precondition

**Operational Readiness**
- [ ] Error codes are distinct: CONFLICT for duplicate registration, new code for missing registration at bootstrap
- [ ] Rollback plan defined and validated for pre-production environments only. Once live registrations exist, destructive rollback (revert migration + restore synthetic auto-create) is not assumed — deploy sequencing must prevent partial rollout.

**Documentation**
- [ ] SRM updated to reflect CompanyService ownership of `company` + `onboarding_registration`
- [ ] ADR-043 D4 superseded by this PRD (synthetic auto-create removed)
- [ ] Known limitation documented: no idempotent retry on consumed registration

---

## 9. Related Documents

- **Intake Brief**: `docs/issues/gaps/company-registration/INTAKE-company-registration.md`
- **Feature Intake Brief**: `docs/issues/gaps/company-registration/FIB-registration.md`
- **Approach Analysis**: `docs/issues/gaps/company-registration/approaches.md`
- **Architecture / SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (v4.22.0 → v4.23.0 amendment: CompanyService introduction)
- **Dual-Boundary Tenancy**: `docs/80-adrs/ADR-043-dual-boundary-tenancy.md`
- **Context Derivation**: `docs/80-adrs/ADR-024-authoritative-context-derivation.md`
- **Auth Hardening**: `docs/80-adrs/ADR-030-auth-system-hardening.md`
- **SECURITY DEFINER Governance**: `docs/80-adrs/ADR-018-security-definer-governance.md`
- **Security Model**: `docs/30-security/SEC-002-casino-scoped-security-model.md`
- **Schema / Types**: `types/database.types.ts`
- **Predecessor Gap**: `docs/issues/gaps/GAP-COMPANY-ENTITY-ONBOARDING-ORPHAN.md` (RESOLVED)
- **Company Posture Audit**: `docs/issues/gaps/COMPANY-ENTITY-POSTURE.md`
- **Phase 1 Implementation**: `docs/10-prd/PRD-050-dual-boundary-tenancy-p1-v0.md`
- **Cross-Property Recognition**: `docs/10-prd/PRD-051-cross-property-recognition-entitlement-v0.md`

---

## Appendix A: Schema Reference

### Existing `company` table (verified against `database.types.ts`)

```sql
-- Already exists, no changes
CREATE TABLE company (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  legal_name text,            -- nullable, optional at registration
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### New `onboarding_registration` table

```sql
CREATE TABLE onboarding_registration (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  company_id  uuid NOT NULL REFERENCES company(id),
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'consumed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);

-- Partial unique index: one pending registration per user (consumed rows retained as history)
CREATE UNIQUE INDEX uq_onboarding_registration_pending
  ON onboarding_registration (user_id)
  WHERE status = 'pending';

-- RLS: deny-by-default
ALTER TABLE onboarding_registration ENABLE ROW LEVEL SECURITY;

-- SELECT only pending rows for own user
CREATE POLICY "Users can read own pending registration"
  ON onboarding_registration FOR SELECT
  USING (user_id = auth.uid() AND status = 'pending');

-- No INSERT/UPDATE/DELETE policies — all mutations via SECURITY DEFINER
```

### RPC signatures

```sql
-- New: company registration
CREATE OR REPLACE FUNCTION rpc_register_company(
  p_company_name text,
  p_legal_name   text DEFAULT NULL
)
RETURNS TABLE (company_id uuid, registration_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$ ... $$;

-- Amended: bootstrap (signature unchanged)
CREATE OR REPLACE FUNCTION rpc_bootstrap_casino(
  p_casino_name      text,
  p_gaming_day_start time DEFAULT '06:00',
  p_timezone         text DEFAULT 'America/New_York'
)
RETURNS TABLE (casino_id uuid, staff_id uuid, staff_role text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$ ... $$;
```

---

## Appendix B: Implementation Plan

### WS1: Database Migration (P0)

- [ ] Create `onboarding_registration` table with RLS
- [ ] Grant SELECT on `onboarding_registration` to `authenticated`
- [ ] REVOKE ALL then GRANT SELECT (deny-by-default pattern)
- [ ] Update security governance tests to allowlist `rpc_register_company`

### WS2: `rpc_register_company` RPC (P0)

- [ ] Implement SECURITY DEFINER RPC with `auth.uid()` derivation
- [ ] Create `company` row + `onboarding_registration` row in one transaction
- [ ] Return CONFLICT on duplicate pending registration
- [ ] Regenerate `database.types.ts`

### WS3: `rpc_bootstrap_casino` Amendment (P0)

- [ ] Remove synthetic company auto-create logic
- [ ] Add pending registration lookup (`user_id = auth.uid() AND status = 'pending'`)
- [ ] Fail closed with distinct error if no pending row
- [ ] Mark registration `consumed` + set `consumed_at` in same transaction as casino creation

### WS4: Service Layer (P0)

- [ ] Create `services/company/` module (dtos, schemas, crud, keys, http, index)
- [ ] `registerCompany()` calls `rpc_register_company`
- [ ] Update SRM to register CompanyService

### WS5: Gateway Routing + Page Guards (P0)

- [ ] Amend `/start` page to query `onboarding_registration` for routing
- [ ] Create `/register` page with company registration form
- [ ] Add page guard to `/bootstrap` (redirect if no pending registration)
- [ ] Add page guard to `/register` (redirect if pending registration exists)

### WS6: Integration Tests (P0)

- [ ] Register creates company + pending registration
- [ ] Bootstrap without registration fails closed
- [ ] Bootstrap with registration creates casino under correct company
- [ ] Registration consumed on successful bootstrap
- [ ] Consumed row invisible via RLS
- [ ] Route guard redirects work correctly
- [ ] Update all existing bootstrap-dependent tests

---

## Appendix C: Error Codes

**CompanyService Domain (service-layer errors)**
- `REGISTRATION_CONFLICT` (409) — Pending registration already exists for this user

**CasinoService Domain (RPC-level errors, amended)**
- `BOOTSTRAP_NO_REGISTRATION` (422) — `rpc_bootstrap_casino` called without prior registration (distinct from existing `STAFF_BINDING_CONFLICT`). This is the RPC-level error raised inside `rpc_bootstrap_casino` when no pending `onboarding_registration` row exists.

---

## Appendix D: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-04-01 | Vladimir Ivanov | Initial draft from INTAKE-company-registration.md |
| 0.2.0 | 2026-04-01 | Vladimir Ivanov | Review pass: partial unique index (fix consumed-row-blocks-reregistration bug), CompanyService ownership committed, G1 scoped to onboarding, R3 mitigation corrected, rollback line tightened, "stale" removed from route priority, error code layering clarified |
