# GAP-COMPANY-CASINO-RLS-CONTEXT

**Created:** 2026-01-28
**Status:** Open
**Severity:** Medium
**Related ADRs:** ADR-023, ADR-024, ADR-015, ADR-020
**Bounded Context:** CasinoService (Foundational)

---

## Summary

The `company` table exists with a one-to-many relationship to `casino`, but is completely absent from the RLS security model. All tenant isolation operates exclusively at the `casino_id` level, with no mechanism for company-level scoping, cross-property access, or company-based authorization.

---

## Current State

### Schema Relationship

```sql
-- company (parent)
CREATE TABLE company (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  legal_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- casino (child, one-to-many)
CREATE TABLE casino (
  id uuid PRIMARY KEY,
  company_id uuid REFERENCES company(id) ON DELETE CASCADE,  -- ← Optional FK
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  ...
);
```

### Context Derivation (ADR-024)

`set_rls_context_from_staff()` derives context from staff table:

```plpgsql
-- Only these values are extracted:
SELECT s.casino_id, s.role::text
INTO v_casino_id, v_role
FROM public.staff s
WHERE s.id = v_staff_id AND s.status = 'active';

-- Only these context variables are set:
PERFORM set_config('app.casino_id', v_casino_id::text, true);
PERFORM set_config('app.actor_id', v_staff_id::text, true);
PERFORM set_config('app.staff_role', v_role, true);

-- Missing: app.company_id is NOT set
```

### RLS Enforcement

| Table | RLS Enabled | Scoped By |
|-------|-------------|-----------|
| `company` | ❌ No | None |
| `casino` | ✅ Yes | `casino_id` |
| `staff` | ✅ Yes | `casino_id` |
| All operational tables | ✅ Yes | `casino_id` |

---

## Identified Gaps

### GAP-1: Company Not Part of RLS Security Model

**Issue:** The `company_id` foreign key in `casino` is metadata only. No RLS policies reference company, and no `app.company_id` context variable exists.

**Impact:** Company ownership cannot be used for authorization decisions at the database level.

**Location:** `supabase/migrations/20251229152317_adr024_rls_context_from_staff.sql`

---

### GAP-2: No Cross-Property Access for Company Admins

**Issue:** Staff has a 1:1 relationship with casino (`staff.casino_id` is singular). No mechanism exists for a company-level user (e.g., regional manager, company owner) to access multiple casinos.

**Impact:** Users who need visibility across multiple properties owned by the same company cannot do so through authenticated client paths.

**Missing Pattern:**
```sql
-- Junction table for multi-property access (does not exist)
CREATE TABLE staff_casino_access (
  staff_id uuid REFERENCES staff(id),
  casino_id uuid REFERENCES casino(id),
  access_level text,
  PRIMARY KEY (staff_id, casino_id)
);
```

---

### GAP-3: Company Table Has No RLS Policies

**Issue:** `company` table does not have RLS enabled. Any query with elevated privileges (service_role, SECURITY DEFINER) can read/write the entire company registry.

**Impact:** Low immediate risk (company data is minimal), but undocumented security posture.

**Missing:**
```sql
ALTER TABLE company ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_select ON company FOR SELECT ...;
```

---

### GAP-4: Casino Ownership Not Validated in Context Derivation

**Issue:** When `set_rls_context_from_staff()` derives context, it validates staff is active but does NOT validate:
- Casino is still active (`casino.status = 'active'`)
- Company still owns the casino (no ownership check)
- Company is in good standing (no company status field)

**Impact:** Staff could retain access to a deactivated casino or one transferred to another company.

**Location:** `set_rls_context_from_staff()` WHERE clause:
```plpgsql
-- Current:
WHERE s.id = v_staff_id AND s.status = 'active' AND s.casino_id IS NOT NULL;

-- Missing:
-- AND EXISTS (SELECT 1 FROM casino c WHERE c.id = s.casino_id AND c.status = 'active')
```

---

### GAP-5: Silo Escape Hatch Not Implemented

**Issue:** ADR-023 defines Silo as an "escape hatch" deployment option (per-casino dedicated Supabase project), but no runtime configuration or provisioning automation exists.

**Impact:** If a customer requires dedicated infrastructure, manual setup is required.

**Reference:** ADR-023 §Implementation Notes: Silo

---

## Recommendations

| Gap | Priority | Action |
|-----|----------|--------|
| GAP-1 | P2 | Document company as metadata-only in SEC-002; revisit if multi-company features needed |
| GAP-2 | P3 (post-MVP) | Create ADR for multi-property staff access if business requirement emerges |
| GAP-3 | P3 | Either enable RLS on company or document as admin-only table in SEC-001 |
| GAP-4 | P2 | Add casino status validation to `set_rls_context_from_staff()` |
| GAP-5 | P3 | Defer until customer explicitly requests dedicated infrastructure |

---

## Decision Required

**Question:** Should `company_id` be elevated to a security boundary, or remain as organizational metadata?

**Option A: Metadata Only (Current)**
- Company is for reporting/organization, not authorization
- All multi-tenancy enforced at casino level
- Simpler model, aligned with MVP scope

**Option B: Company as Security Boundary**
- Add `app.company_id` to RLS context
- Enable company-scoped policies for admin views
- Support multi-property staff via junction table
- Requires ADR amendment (ADR-024-A)

**Recommendation:** Option A for MVP. Revisit in post-MVP if multi-property management becomes a product requirement.

---

## References

- ADR-023: Multi-Tenancy Storage Model Selection (Pool Primary)
- ADR-024: Authoritative RLS Context Derivation
- ADR-015: RLS Connection Pooling Strategy
- ADR-020: MVP RLS Strategy (Track A Hybrid)
- SEC-002: Casino-Scoped Security Model
- SRM v4.11.0: CasinoService bounded context

---

## Audit Trail

| Date | Author | Action |
|------|--------|--------|
| 2026-01-28 | Claude | Initial gap document created |
