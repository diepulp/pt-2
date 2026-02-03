# GAP Patch: Integrate `company` Into the Multi-Tenancy Policy (Casino-Scoped Tenancy)

**Scope:** Remediate the overlooked gap where multi-tenancy and RLS policies reference only `casino_id`, leaving `company` under-specified.  
**Primary decision:** For MVP, **tenant boundary = casino**. `company` is an **organizational grouping**, not an authorization boundary (yet).  
**Inputs:**  
- `GAP-COMPANY-CASINO-RLS-CONTEXT.md`  
- `ADR-023-multi-tenancy-storage-model-selection.md`

---

## Problem Statement

Current policies and RLS patterns assume **`casino_id` is the sole tenant discriminator**. The `company` entity (parent grouping of one or more casinos) is not explicitly integrated into:

- RLS coverage and enforcement rules
- Context derivation (`set_rls_context_from_staff()` family)
- “Tenant boundary” language in the multi-tenancy docs

This creates ambiguity and future risk: `company` can become an accidental bypass vector or a drift point for “company admin” features.

---

## Open Questions → Reduced Decision Set

These “open questions” converge into a small set of choices:

1. **Is `company_id` a security boundary or organizational metadata?**  
2. **Do we require cross-casino access under the same company in MVP?**  
3. **Should the `company` table have RLS, and what access rule should apply?**  
4. **Must context derivation validate casino/company status/ownership before setting context?**  
5. **How does this align with ADR-023 Pool vs Silo model?**

**MVP Answer:**  
- **Company is metadata only**; **casino remains the tenant boundary**.  
- **No cross-casino company admin access** in MVP.

---

## Remediation Strategy

### Phase 0 — Policy Clarification (Stop the Ambiguity)

Patch multi-tenancy/security docs (including ADR-023 adjacencies and SEC policies) to explicitly declare:

- **Tenant boundary = casino** (Pool discriminator key is `casino_id`)
- **Company = organizational grouping only** (MVP)
- Cross-casino access is out of scope unless implemented explicitly post-MVP

**Outcome:** Engineers stop “discovering” `company` and inventing inconsistent rules.

---

### Phase 1 — Close the Gap: Derive `app.company_id` and Put `company` Under RLS

Even if company is not a tenant boundary, it must have a defined security posture.

#### 1. Extend Context Derivation

Patch `set_rls_context_from_staff()` (or equivalent) to derive and set:

- `app.company_id` via: `staff.casino_id -> casino.company_id`

#### 2. Add Status/Ownership Validation (Hardening)

Before setting context variables, validate:

- staff is active
- casino exists and is active
- (optional) company exists and is in good standing (if/when `company.status` exists)

This is defense-in-depth and prevents stale/deactivated tenancy contexts.

#### 3. Enable RLS on `company`

Enable RLS on `company` and add **minimal** policies:

- **SELECT:** allow only `company.id = current_setting('app.company_id')`
- **INSERT/UPDATE/DELETE:** deny by default for MVP (recommended); allow only via controlled admin RPCs if needed

**Outcome:** `company` cannot become a backdoor table.

---

### Phase 2 — Make “Casino Ownership” Non-Fiction

Context derivation must not ignore business state changes (deactivation, reassignment, etc.). Enforce:

- `casino.status = 'active'`
- `casino.company_id` non-null **if** you enforce “every casino belongs to a company”

Avoid “null means global” semantics (high risk of future leakage).

---

### Phase 3 — Defer Cross-Property Company Admin, But Lay Rails

**Not MVP** unless you already have a real stakeholder requirement.

Future-ready rails (do not implement now unless required):

- Keep `staff.casino_id` as home casino (simple)
- Add later: `staff_casino_access(staff_id, casino_id, access_level)`
- Selected casino per request:
  - either via JWT claim containing allowed casinos (harder)
  - or via RPC-driven “selected casino” that validates against `staff_casino_access` (fits your current pattern)

For MVP documentation:  
> “No company-level cross-property access. Switching casinos requires explicit casino context selection (post-MVP) or separate staff records.”

---

### Phase 4 — ADR-023 Alignment: Pool vs Silo

ADR-023 frames Silo as an ops/provisioning choice, not an authorization rewrite.

- **Pool:** tenant boundary is `casino_id`; `company` is grouping metadata  
- **Silo:** database/project boundary already isolates; keep RLS for defense-in-depth, but company-level access is handled at provisioning/config, not by cross-tenant RLS tricks

---

## Concrete Deliverables (What to Change)

### 1) Documentation Patch
- Add a section: **“Company is not a tenant boundary (MVP)”**
- Update multi-tenancy policy text to:
  - define tenant boundary explicitly
  - define company’s role
  - declare cross-casino access out-of-scope for MVP

### 2) Database Hardening Migration
- Patch `set_rls_context_from_staff()` to set:
  - `app.company_id` (derived)
- Add validation checks:
  - casino active
  - staff active
  - optionally company exists/active
- Enable RLS on `company`
  - minimal SELECT policy
  - default-deny writes for MVP

### 3) CI / Audit Gate Updates
- Add `company` to “RLS coverage required” checks
- Enforce “no client-supplied company_id/casino_id in RPC signatures” (context-derivation only)

### 4) Post-MVP Backlog ADR
- “Company-scoped access model”
  - `staff_casino_access`
  - explicit casino selection mechanism
  - role model expansion

---

## MVP Decision Summary

**Chosen:** **Option A** — Company is organizational metadata only (MVP), **implemented safely**:
- `app.company_id` derived and available
- `company` table RLS enabled (no bypass)
- context derivation validates casino state

**Deferred:** **Option B** — Company as a true authorization boundary (requires a separate ADR and access model)

---

## Definition of Done

- [ ] Policy docs explicitly declare tenant boundary and company role
- [ ] `set_rls_context_from_staff()` sets `app.company_id` (derived)
- [ ] Context derivation validates casino is active
- [ ] RLS enabled on `company` with minimal SELECT policy
- [ ] Writes to `company` are denied in MVP (or gated by admin-only mechanism)
- [ ] CI/audit gates include `company` in RLS coverage and signature rules
- [ ] Post-MVP ADR stub created for company-scoped admin (if needed)
