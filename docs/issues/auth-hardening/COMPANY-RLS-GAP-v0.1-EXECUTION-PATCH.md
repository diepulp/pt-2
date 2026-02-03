# COMPANY-RLS-GAP v0.1 — Execution Patch (MVP Stance)

**Status:** Proposed  
**Date:** 2026-01-29  
**Bounded Context:** CasinoService (Foundational)  
**Related:** `GAP-COMPANY-CASINO-RLS-CONTEXT` (2026-01-28), AUTH-HARDENING v0.1 (scope excludes company_id RLS)

---

## 0) Decision (explicit MVP stance)

**MVP stance: Option A — Company is metadata only (NOT a security boundary).**

- Tenant isolation remains **casino-scoped** (`casino_id` is the RLS boundary).
- `company_id` is organizational/reporting metadata only.
- Cross-property/company-admin access is **post‑MVP** (requires a junction table + new RLS context variable).

This matches the gap document’s recommendation to keep the model simple for MVP and revisit only if multi-property management becomes a real requirement.

---

## 1) Problem Statement (what we are actually fixing)

The gap document identifies three distinct concerns:

1. `company` table has **no RLS enabled** (undocumented posture; elevated paths can read/write entire registry).
2. `set_rls_context_from_staff()` does **not validate casino is active** when deriving context (staff can retain access to a deactivated casino).
3. `company_id` is not part of the RLS security model (this is a *decision*, not a bug, under Option A).

For v0.1 we fix (1) and (2), and explicitly document (3) as “metadata-only by design”.

---

## 2) Scope (v0.1)

### In scope
- **WS1:** Document the MVP decision (company metadata-only) in security docs (SEC-001/SEC-002) + SRM note.
- **WS2:** Enable RLS on `company` with a minimal, explicit access posture (admin-only or deny-by-default).
- **WS3:** Patch `set_rls_context_from_staff()` to validate `casino.status = 'active'` during context derivation.

### Out of scope (deferred)
- Adding `app.company_id` to RLS context.
- Company-scoped policies across operational tables.
- Multi-property staff access (junction table like `staff_casino_access`).
- “Company good standing” / company status fields.
- Any “Silo escape hatch” runtime/provisioning automation.

---

## 3) Definition of Done (DoD)

- [ ] A written decision exists: **Option A (metadata-only)** with explicit rationale + “when to revisit” triggers.
- [ ] `company` table has RLS enabled and an explicit policy posture (not “floating open”).
- [ ] `set_rls_context_from_staff()` denies context derivation if the staff’s casino is not active.
- [ ] `npm run db:types && npm run type-check && npm test` pass.

---

## 4) Workstreams (sequenced)

### WS1 — Decision + documentation (no code risk)

**Goal:** Stop ambiguity from reappearing as scope creep.

**Deliverables:**
- Patch `SEC-002` to state:  
  “Authorization boundary is casino-scoped; company is metadata-only for MVP.”
- Add “revisit triggers”:
  - A customer requirement for **cross-property management**
  - Need for company-level consolidated dashboards **under authenticated client paths**
  - Any requirement for company-admin roles with least-privileged access

**Acceptance Criteria:**
- Decision and triggers are clearly written and linked from SRM / security index.

---

### WS2 — Company table RLS containment (minimal database change)

**Goal:** Make `company` posture explicit and safe under elevated execution paths.

**Two acceptable MVP patterns (pick one and standardize):**

**Pattern A (preferred): admin-only**
- Enable RLS on `company`
- Allow SELECT/INSERT/UPDATE/DELETE only for `staff_role = 'admin'` *and* casino-scoped staff context exists.
- Rationale: admin screens might need company CRUD during onboarding.

**Pattern B: deny-by-default**
- Enable RLS on `company`
- No policies for authenticated (everything denied), and only service-role / SECURITY DEFINER admin tooling can touch it.
- Rationale: if you do not have a UI for company yet, keep it locked.

**SQL skeleton (Pattern A example):**
```sql
ALTER TABLE public.company ENABLE ROW LEVEL SECURITY;

-- Example: allow admins to read companies
CREATE POLICY company_select_admin
ON public.company
FOR SELECT
TO authenticated
USING (
  NULLIF(current_setting('app.actor_id', true), '') IS NOT NULL
  AND NULLIF(current_setting('app.casino_id', true), '') IS NOT NULL
  AND current_setting('app.staff_role', true) = 'admin'
);

-- Add INSERT/UPDATE/DELETE similarly if needed for MVP onboarding
```

**Acceptance Criteria:**
- `company` is no longer “no RLS”.
- Policy posture is explicit (documented + tested via a tiny SQL test or integration test).

---

### WS3 — Context derivation must validate casino is active (auth-adjacent correctness)

**Goal:** Prevent staff from retaining access to a deactivated casino.

**Change:**
- In `set_rls_context_from_staff()`, add:
  ```sql
  AND EXISTS (
    SELECT 1
    FROM public.casino c
    WHERE c.id = s.casino_id
      AND c.status = 'active'
  )
  ```
- If the `EXISTS` check fails, raise `FORBIDDEN` (consistent with existing staff status checks).

**Acceptance Criteria:**
- Deactivated casino → context derivation fails.
- Active staff + active casino → context derivation succeeds.

---

## 5) Rollout Plan (PR sequence)

1. **PR-1:** WS1 docs only (decision + revisit triggers)
2. **PR-2:** WS2 company RLS enablement (choose Pattern A or B)
3. **PR-3:** WS3 RPC patch for casino active validation

Each PR must remain “single-purpose” to avoid blending concerns.

---

## 6) Post-MVP Upgrade Path (explicitly deferred)

If/when Option B becomes necessary:

- Add `app.company_id` to the RLS context
- Add company-admin role semantics (new role or access table)
- Introduce multi-casino membership via a junction table (e.g., `staff_casino_access`)
- Add company-scoped dashboards and policies

This requires an ADR amendment (per the gap doc) and a new security spec; do not “sneak” it into v0.1.
