# GAP-COMPANY-ENTITY-ONBOARDING-ORPHAN

**Created:** 2026-02-10
**Resolved:** 2026-03-13 (ADR-043 / PR #25)
**Status:** RESOLVED — structural gap closed; UI enrichment tracked separately
**Severity:** ~~P1~~ → Closed
**Related:** GAP-COMPANY-CASINO-RLS-CONTEXT, COMPANY-RLS-GAP-v0.1-EXECUTION-PATCH, PRD-025, ADR-043, PRD-050
**Bounded Context:** CasinoService (Foundational)

---

## Resolution Summary

The structural gap — empty `company` table, nullable FK, no creation path — was **fully closed** by ADR-043 (Dual-Boundary Tenancy Phase 1), merged via PR #25 on 2026-03-13.

| Original Problem | Resolution |
|---|---|
| `company` table permanently empty | Backfilled with 1:1 synthetic company per casino |
| `casino.company_id` always NULL | `NOT NULL` constraint enforced |
| Bootstrap RPC ignored company | `rpc_bootstrap_casino` auto-creates company row before casino |
| No RLS context for company | `set_rls_context_from_staff()` derives and sets `app.company_id` |
| FK `ON DELETE CASCADE` risk | Hardened to `ON DELETE RESTRICT` |

## What Remains (Not This Gap)

The structural gap is closed, but the **UI surface for company metadata** was never built. This is tracked as a new concern in:

→ **`docs/issues/gaps/COMPANY-ENTITY-POSTURE.md`** — current posture + registration UI intent

Residual items:
- Company `name` is a synthetic copy of casino name (placeholder, not canonical business identity)
- `legal_name` column exists but is always NULL (never collected)
- No admin UI to view/edit company metadata
- No registration step in the onboarding flow

---

## Original Analysis (Archived)

<details>
<summary>Original gap analysis from 2026-02-10 (click to expand)</summary>

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
  company_id uuid REFERENCES company(id) ON DELETE CASCADE,  -- was always NULL
  name text NOT NULL,
  ...
);
```

### Where company_id Was Wired But Never Called

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

### Recommended Fix (Implemented as Option 1)

Option 1 (Extend Bootstrap RPC) was implemented in ADR-043 migration `20260312155427_adr043_company_foundation.sql`.

</details>
