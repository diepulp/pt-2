# COMPANY-ENTITY-POSTURE

**Created:** 2026-04-01
**Status:** Open
**Severity:** P2 (UI gap — company data exists but is synthetic/unmanageable)
**Supersedes:** GAP-COMPANY-ENTITY-ONBOARDING-ORPHAN (RESOLVED)
**Related:** ADR-043, PRD-050, PRD-051, PRD-025
**Bounded Context:** CasinoService (Foundational)

---

## Domain Model vs Implementation

### Domain Model (intended)

```
Company (purchases PT-2, legal entity)
  └── Casino (operational tenant, 1:N)
        └── Staff, Settings, Tables, Players...
```

The company is the **purchasing entity** — the business that buys PT-2, may own multiple casinos, and is the legal entity for compliance/billing. The onboarding flow should reflect this: register the company first, then create casinos under it.

### Implementation (current)

```
Bootstrap → auto-creates synthetic Company (name copied from casino)
         → creates Casino (company_id = synthetic company.id)

Result: Company exists structurally but has no business identity.
        It's a plumbing artifact, not a managed entity.
```

---

## Current State Audit

### Schema (correct, complete)

```sql
CREATE TABLE company (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,          -- ← always = casino.name (synthetic)
  legal_name text,                   -- ← always NULL (never collected)
  created_at timestamptz NOT NULL DEFAULT now()
);

-- casino.company_id is NOT NULL, FK RESTRICT (ADR-043)
```

### RPC Layer (company auto-created, not user-managed)

| RPC | Company behavior |
|-----|-----------------|
| `rpc_bootstrap_casino` | Auto-creates company row, copies casino name as company name |
| `set_rls_context_from_staff()` | Derives `app.company_id` via `staff → casino → company` join |
| `rpc_lookup_player_company` | Uses `app.company_id` for cross-property recognition |
| `rpc_activate_player_locally` | Uses `app.company_id` for cross-property activation |
| `rpc_redeem_loyalty_locally` | Uses `app.company_id` for loyalty redemption |

### Service Layer

| Layer | Status |
|-------|--------|
| `services/company/` | **Does not exist** — no service module |
| `services/casino/crud.ts` | Accepts `company_id` in create/update — wired but no UI calls it |
| `services/casino/schemas.ts` | Validates `company_id` as UUID |
| `services/casino/dtos.ts` | `CreateCasinoDTO` includes `company_id` |

### UI Layer

| Surface | Company presence |
|---------|-----------------|
| Bootstrap form (`components/onboarding/bootstrap-form.tsx`) | **None** — collects casino name, timezone, gaming day start only |
| Bootstrap action (`app/(onboarding)/bootstrap/_actions.ts`) | Passes only `casino_name`, `timezone`, `gaming_day_start` to RPC |
| Setup wizard (`app/(onboarding)/setup/`) | **None** — no company step |
| Dashboard settings | **None** — no company management |
| Admin routes | `POST/PATCH /api/v1/casino` accept `company_id` but no company CRUD routes |

### RLS Posture (correct, not the gap)

- Company table: RLS enabled, deny-by-default (SEC-002)
- Only `service_role` and SECURITY DEFINER RPCs access company rows
- `app.company_id` derived server-side, never from client input (ADR-024, ADR-040)

---

## What's Missing

### 1. Registration Surface (onboarding)

The bootstrap form skips the first link in the domain model. The user creates a "casino" but never registers their **company** — the purchasing entity that owns the casino.

**Current bootstrap flow:**
```
Sign up → Bootstrap form (casino name, timezone, gaming day) → Dashboard
```

**Target flow:**
```
Sign up → Registration form (company name, legal name) → Bootstrap form (casino details) → Dashboard
                         ↑                                          ↑
                   Creates company row                    Links casino to company
                   with real business data                via company_id
```

### 2. Company Management (post-onboarding)

No way to view or edit company metadata after creation:
- Company name (currently = casino name, not editable)
- Legal name (never collected, NULL)
- Future: billing contact, tax ID, address

### 3. Service Module

No `services/company/` module. Company CRUD is implicit inside `rpc_bootstrap_casino` and never exposed as a managed entity.

### 4. Multi-Casino Association

When a company owns multiple casinos, there's no UI to create a second casino under the same company. The bootstrap flow always creates a new company per casino (1:1).

---

## Recommended Approach

### Option A: Pre-Bootstrap Registration Step (Recommended)

Add a company registration step **before** the casino bootstrap form. This makes the domain model explicit in the UI flow.

**Scope:**

1. **New route**: `app/(onboarding)/register/page.tsx` — company registration form
   - Fields: Company Name (required), Legal Name (optional)
   - Creates company row via new RPC or server action
   - Stores `company_id` for the subsequent bootstrap step

2. **Amend bootstrap RPC**: Accept `p_company_id` parameter instead of auto-creating
   - If `p_company_id` provided → use it (normal flow after registration)
   - If `p_company_id` NULL → auto-create synthetic company (backward compatible)

3. **New service module**: `services/company/` with standard Pattern A structure
   - `dtos.ts`, `schemas.ts`, `crud.ts`, `keys.ts`, `mappers.ts`, `http.ts`
   - CRUD: create, read, update (no delete — RESTRICT FK prevents orphaning casinos)

4. **Company settings panel**: In admin/settings, a "Company" tab to view/edit metadata
   - Editable fields: company name, legal name
   - Read-only: list of casinos under this company

5. **Migration**: Backfill existing synthetic company names
   - No schema changes needed — columns already exist
   - Optionally prompt existing tenants to "complete" their company profile

### Option B: Inline in Bootstrap (Simpler, Less Clean)

Add company fields (name, legal name) directly to the existing bootstrap form. Keeps it single-step but conflates company registration with casino creation.

- Faster to ship but doesn't support multi-casino scenario
- Doesn't establish company as a first-class managed entity

### Recommendation

**Option A** — it establishes the correct domain hierarchy in the UI, supports the multi-casino future (PRD-051 cross-property recognition already exists), and creates the service module foundation needed for company admin tooling.

Option B is acceptable as an interim step if the registration form is deferred.

---

## Impact of Current State

| Area | Impact |
|------|--------|
| Onboarding clarity | User creates a "casino" without understanding they're also creating a "company" |
| Company name accuracy | Company name = casino name (synthetic, likely wrong for multi-casino operators) |
| Legal compliance | `legal_name` always NULL — unavailable for regulatory reports |
| Multi-property | Second casino creates a new company instead of associating with existing one |
| Cross-property recognition | Works (PRD-051) but company identity is synthetic placeholder |
| Billing/invoicing | No canonical business entity to attach billing to |

---

## Definition of Done

- [ ] Company registration collects real business identity (name, legal name) during onboarding
- [ ] Bootstrap form uses the registered company (not auto-created synthetic)
- [ ] `services/company/` module exists with Pattern A structure
- [ ] Company settings panel accessible in admin/settings
- [ ] Existing tenants can edit their company metadata (backfill path)
- [ ] Multi-casino creation associates with existing company (not 1:1 auto-create)

---

## Related Documents

| Document | Relationship |
|----------|-------------|
| `docs/issues/gaps/GAP-COMPANY-ENTITY-ONBOARDING-ORPHAN.md` | Predecessor gap (RESOLVED — structural fix) |
| `docs/80-adrs/ADR-043-dual-boundary-tenancy.md` | Established company foundation (Phase 1) |
| `docs/10-prd/PRD-050-dual-boundary-tenancy-p1-v0.md` | Phase 1 spec (company foundation, no UI) |
| `docs/10-prd/PRD-051-dual-boundary-phase2-slice1-v0.md` | Cross-property recognition (uses company_id) |
| `docs/00-vision/DUAL-BOUNDARY-TENANCY/IMPLEMENTATION-PRECIS.md` | Implementation summary |
| `docs/10-prd/PRD-025-onboarding-bootstrap-invites-v0.md` | Original onboarding spec (mentioned `legal_name`) |
| `docs/30-security/SEC-002-casino-scoped-security-model.md` | Company-as-metadata security decision |
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | CasinoService owns `company` table |
