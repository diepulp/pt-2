# GAP-COMPANY-ENTITY-ONBOARDING-ORPHAN

**Created:** 2026-02-10
**Status:** Open
**Severity:** P1 (Product gap — company data never collected)
**Related:** GAP-COMPANY-CASINO-RLS-CONTEXT, COMPANY-RLS-GAP-v0.1-EXECUTION-PATCH, PRD-025
**Bounded Context:** CasinoService (Foundational)

---

## Summary

The company entity is fully orphaned in the onboarding flow. The security posture is established (RLS deny-by-default per COMPANY-RLS-GAP v0.1), the schema exists (`company` table with `casino.company_id` FK), and the service layer accepts `company_id` — but no UI, no RPC, and no wizard step ever creates a company row or associates it with a casino. The `company` table is permanently empty through all product paths.

The product domain model is: **Company (purchases PT-2) → owns Casino(s) → configured via Bootstrap**. The implementation skips the first link entirely.

---

## Current State

### Schema Relationship

```sql
-- company (parent, purchasing entity)
CREATE TABLE company (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- casino (child, company_id nullable FK)
CREATE TABLE casino (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES company(id) ON DELETE CASCADE,  -- always NULL
  name text NOT NULL,
  ...
);
```

### Where company_id Is Wired But Never Called

| Layer | Code | What it does | Called during onboarding? |
|-------|------|-------------|:-:|
| Baseline DDL | `casino.company_id uuid references company(id)` | FK exists | - |
| `createCasinoSchema` | `company_id: uuidSchemaNullable()` | Validates if provided | No |
| `CreateCasinoDTO` | `Pick<..., 'company_id'>` | DTO includes it | No |
| `createCasino()` in crud.ts | `company_id: input.company_id ?? null` | Sets to null if absent | No |
| `updateCasino()` in crud.ts | `if (input.company_id !== undefined)` | Can update later | No UI calls this |
| `POST /api/v1/casino` | Passes `company_id` to insert | Admin API route | No |
| `PATCH /api/v1/casino/[id]` | Passes `company_id` to update | Admin API route | No |
| `rpc_bootstrap_casino` | **Not mentioned at all** | Creates casino with no company_id | Skipped entirely |

### RLS Posture (Established, Not the Gap)

- Company table: RLS enabled, deny-by-default (no permissive policies for `authenticated`)
- Decision documented in SEC-002: "company is organizational metadata, not a security boundary"
- Only `service_role` and SECURITY DEFINER RPCs can access

The security posture is correct. The gap is that **no code path populates the table**.

---

## The Disconnect

### Product Domain Model

```
Company (purchases PT-2)
  └── Casino (operational tenant)
        └── Casino Settings (timezone, gaming day, thresholds)
        └── Staff (admin, pit_boss, cashier, dealer)
        └── Game Settings, Gaming Tables, etc.
```

### Implementation Model

```
Bootstrap → creates Casino (company_id = NULL) → company row never created
```

### PRD-025 Noted But Did Not Implement

PRD-025 section 6 (UX/Flow Overview, line 99) specified the bootstrap form as:

> "single form (casino name, timezone, gaming day start, **optional legal name**)"

The `legal_name` field was intended as company metadata but was never implemented in the bootstrap form or RPC. The RPC accepts only `p_casino_name`, `p_timezone`, `p_gaming_day_start`.

---

## Recommended Fix

### Option 1: Extend Bootstrap RPC (Preferred — Atomic)

Extend `rpc_bootstrap_casino` to accept optional company fields and atomically create both:

```
rpc_bootstrap_casino(
  p_casino_name text,
  p_timezone text,
  p_gaming_day_start time,
  p_company_name text DEFAULT NULL,      -- NEW
  p_company_legal_name text DEFAULT NULL  -- NEW
)
```

Logic:
1. If `p_company_name` is provided → INSERT `company` row → use returned `id` as `casino.company_id`
2. If `p_company_name` is NULL → create casino with `company_id = NULL` (backward compatible)
3. All within the same atomic transaction

Bootstrap form adds two optional fields: Company Name, Legal Name.

### Option 2: Separate Company Step (Pre-Bootstrap)

Create company in a prior step, pass `company_id` to bootstrap. More complex, less atomic, requires state management between steps.

### Option 3: Post-Bootstrap Association (Setup Wizard)

Collect company data during the setup wizard and associate via `UPDATE casino SET company_id = ...`. Works but leaves a temporal gap where the casino has no company.

### Recommendation

**Option 1** is cleanest — extends the existing atomic bootstrap transaction, backward compatible (company fields optional), single form, no multi-step state. Aligns with PRD-025's original spec that mentioned `legal_name` in the bootstrap form.

---

## Impact Assessment

| Area | Impact |
|------|--------|
| Reporting | No company-level aggregation possible (company is always NULL) |
| Multi-property | Future multi-casino-per-company requires company rows to exist |
| Compliance | Legal entity name (`legal_name`) unavailable for regulatory reports |
| Billing | If billing is company-scoped, no entity to attach invoices to |
| Data model integrity | `company` table exists but is permanently empty — dead schema |

---

## Definition of Done

- [ ] Company data (name, legal_name) is collected during onboarding (bootstrap or setup wizard)
- [ ] `company` row is created and linked to `casino.company_id`
- [ ] Bootstrap RPC or new RPC handles company creation atomically
- [ ] Bootstrap form includes company fields (at minimum: company name)
- [ ] Existing tenants with `company_id = NULL` have a migration path (admin settings or backfill)

---

## Related Documents

| Document | Relationship |
|----------|-------------|
| `docs/issues/gaps/GAP-COMPANY-CASINO-RLS-CONTEXT.md` | Parent gap — identified company RLS absence |
| `docs/issues/auth-hardening/COMPANY-RLS-GAP-v0.1-EXECUTION-PATCH.md` | Addressed security posture (WS1-WS3 complete) |
| `docs/issues/gaps/GAP-ONBOARDING-SETUP-WIZARD-CONFIG-TAXONOMY.md` | Setup wizard gap — could include company collection |
| `docs/30-security/SEC-002-casino-scoped-security-model.md` | Documents company-as-metadata decision |
| `docs/10-prd/PRD-025-onboarding-bootstrap-invites-v0.md` | Mentions `legal_name` in bootstrap form spec but not implemented |
