# SPEC — ONBOARDING v0.1 (PT‑2)

**Description:** This spec covers technical tenant bootstrap and staff onboarding. For contracting/payment/training/go-live, see [CUSTOMER ONBOARDING v0.1](docs/00-vision/company-onboarding/EXECUTION-SPEC-CUSTOMER-ONBOARDING-v0.1.md).
**Status:** Proposed  
**Date:** 2026-01-30  
**Owner BC:** CasinoService (Foundational)  
**Depends on:** AUTH‑HARDENING v0.1 (context RPC + bypass lockdown + WS5 revision)  
**MVP stance:** `company` is **metadata-only**, **not** a security boundary (defer relationships).

---

## 0) Intent

Ship a minimal, reliable onboarding flow that:

1) creates a **casino tenant** (and its settings),  
2) creates/binds the **first admin staff** to a Supabase Auth user,  
3) supports **invite → accept** for additional staff,  
4) remains **casino-scoped** for authorization (RLS boundary is `casino_id`),  
5) avoids introducing company/org scope creep.

Onboarding must be compatible with the existing security model: **Postgres RLS is the enforcement boundary**; server actions/RPCs establish context via `set_rls_context_from_staff()` for authenticated tenant-scoped work.

---

## 1) MVP Decision: Company is not onboarding-critical

### Decision
For v0.1 onboarding, `company` is **not required** Company is a billing/legal container. A casino tenant can exist without any `company` relationship.

### Consequence
- `company` table is **locked down** (RLS enablement with deny-by-default or admin-only, per COMPANY-RLS-GAP v0.1).
- Any “company name” collected in onboarding is stored as simple **casino metadata** (e.g., `casino.legal_name`), not as a relational org model.

### Revisit Triggers (post‑MVP)
- A customer requires **multi-property** management under a single company identity
- Need for **company-level consolidated dashboards** across casinos under authenticated client paths
- Requirement for **company-admin** role with least-privileged access

---

## 2) Scope

### In scope (v0.1)
- **Bootstrap tenant creation** (casino + settings + first admin staff binding)
- **Invite-based staff onboarding**
- Basic UI screens for create tenant and invite/accept
- RLS + RPC rules that prevent tenant leakage
- Tests that lock invariants (no “best-effort” auth)

### Out of scope (explicitly deferred)
- SSO/SAML/SCIM, enterprise identity lifecycle automation
- Multi-casino membership model (junction tables)
- Company-as-security-boundary (`company_id` in RLS context)
- Complex role hierarchy beyond existing `staff_role`
- Automated billing/subscription provisioning

---

## 3) Key Invariants

1) **A staff user cannot write tenant data without tenant context**.
2) Tenant context is derived from DB truth: `auth.uid() → staff.user_id → staff.id/casino_id/role`.
3) Bootstrap is the *only* flow allowed to create the initial tenant binding.
4) Invites bind a Supabase Auth identity to a casino staff record **only via RPC**.
5) Disabling a casino or staff prevents context derivation (casino active validation).

---

## 4) Data Model Additions

### 4.1 New Table: `staff_invite`

**Purpose:** Represent pending staff invitations for a casino tenant.

**Columns (MVP)**
- `id uuid primary key default gen_random_uuid()`
- `casino_id uuid not null references public.casino(id)`
- `email text not null`
- `staff_role public.staff_role not null`
- `token_hash text not null` (store hash only)
- `expires_at timestamptz not null`
- `accepted_at timestamptz null`
- `created_by uuid not null references public.staff(id)`
- `created_at timestamptz not null default now()`

**Constraints**
- Unique active invite per casino/email (optional for v0.1; recommended):
  - unique partial index on `(casino_id, lower(email)) where accepted_at is null`
- Expiry must be in the future at creation.

### 4.2 (MVP-friendly) Casino metadata
To collect “company name” without building company tenancy:
- Add nullable `casino.legal_name text` (or similar)
- No relationship to `company` required.

---

## 5) RLS Policies

### 5.1 `staff_invite` RLS
- **SELECT**: allowed to tenant admins/pit bosses as needed (default: admin only)
- **INSERT**: admin only (creator is current actor; must match `created_by`)
- **UPDATE**: admin only (e.g., revoke by marking expired/accepted); no direct acceptance via UPDATE
- **DELETE**: optional hard-deny; use “revoke” via update or time-based expiry

**Tenant scope:** `staff_invite.casino_id = current_setting('app.casino_id')::uuid`  
**Role gate:** `current_setting('app.staff_role') IN ('admin')` (tight by default)

### 5.2 Acceptance path
Invite acceptance must not rely on direct table UPDATE from the client.
Acceptance is performed via `rpc_accept_staff_invite(token)` (SECURITY DEFINER), which:
- validates token
- binds user_id to staff row
- stamps accepted_at
- returns staff context

---

## 6) RPC/API Surface

### 6.1 `rpc_bootstrap_casino(...)` (SECURITY DEFINER)
**Use case:** first-time tenant creation when user has no staff binding yet.

**Inputs (MVP)**
- `casino_name text`
- `timezone text` (optional default)
- `gaming_day_start time` (optional default)
- optional: `casino_legal_name text` (metadata only)

**Behavior**
- Require `auth.uid()` present (must be authenticated).
- Create `casino` + `casino_settings`.
- Create `staff` row for `auth.uid()` with:
  - `role = 'admin'`
  - `status = 'active'`
  - `casino_id = newly created casino`
  - `user_id = auth.uid()`
- Set RLS context (actor/casino/role) for the remainder of the transaction.
- Return `{ casino_id, staff_id, staff_role }`.

**Idempotency (recommended)**
- If the user already has an active staff binding, return a conflict/error (do not create another tenant).

### 6.2 `rpc_create_staff_invite(email, role, ttl_minutes)` (SECURITY DEFINER or INVOKER)
**Preferred:** SECURITY DEFINER to keep consistent permissioning & auditing.

**Behavior**
- Requires context vars present (`app.actor_id`, `app.casino_id`, `app.staff_role`).
- Enforce admin-only.
- Create invite:
  - hash random token (server-side)
  - store hash, return **raw token once** to caller for email delivery
- Audit log entry.

**Return**
- `{ invite_id, email, role, expires_at, token }` (token returned once)

### 6.3 `rpc_accept_staff_invite(token)` (SECURITY DEFINER)
**Behavior**
- Require `auth.uid()` present.
- Hash token, locate unaccepted invite, check expiry.
- Create or upsert staff binding:
  - If staff row exists for email (optional), bind `user_id`
  - Else create staff row with `casino_id` from invite, role from invite, status active
- Mark invite accepted.
- Return `{ casino_id, staff_id, staff_role }`.

**Security note**
- Token is the capability. Keep TTL short (e.g., 72h) and single-use.

---

## 7) UI Deliverables (minimal)

### 7.1 Create Casino Wizard (Admin self-serve)
- Fields: casino name, timezone, gaming day start (optional)
- Action: calls `rpc_bootstrap_casino`
- Success: route to “Admin Home” (now tenant-scoped)

### 7.2 Invite Staff Screen
- Fields: email, role
- Action: calls `rpc_create_staff_invite`
- Email delivery: v0.1 can display token/link for manual testing; production uses email provider.

### 7.3 Accept Invite Screen
- Reads token from URL
- Requires auth sign-in
- Calls `rpc_accept_staff_invite`
- On success, reload session / proceed into tenant app

---

## 8) Auditing & Observability (v0.1)

- Log/record:
  - tenant bootstrap events
  - invite created/revoked/accepted
- For failures:
  - invalid/expired token attempts (rate-limit at app layer)
  - attempts to bootstrap when already bound to staff

Do not build a full metrics pipeline in v0.1; ensure events are searchable.

---

## 9) Tests (must-have)

### 9.1 Bootstrap invariants
- User without staff binding can bootstrap; returns casino_id/staff_id.
- User with staff binding cannot bootstrap again (conflict).
- Bootstrap creates casino_settings.

### 9.2 Invite invariants
- Non-admin cannot create invites.
- Admin can create invite; token returned once; hash stored.
- Invite acceptance binds user to staff and sets `accepted_at`.
- Token is single-use; second acceptance attempt fails.

### 9.3 Tenant isolation invariants
- Invites are scoped to casino_id in RLS for read/list.
- Accepted staff cannot access another casino’s invites or data.

### 9.4 Casino active validation
- If casino is deactivated, `set_rls_context_from_staff()` fails; tenant writes fail.

---

## 10) Definition of Done (DoD)

- [ ] `rpc_bootstrap_casino` implemented + covered by tests
- [ ] `staff_invite` table + RLS implemented + covered by tests
- [ ] `rpc_create_staff_invite` + `rpc_accept_staff_invite` implemented + covered by tests
- [ ] Minimal UI screens exist (create casino, invite staff, accept invite)
- [ ] `company` table posture explicitly documented and locked down (per COMPANY-RLS-GAP v0.1)
- [ ] `db:types`, `type-check`, `lint`, `test` green in CI

---

## 11) Rollout Plan (sequenced PRs)

1. **PR‑1:** Schema (`staff_invite`) + RLS policies  
2. **PR‑2:** RPCs (bootstrap + invite create/accept)  
3. **PR‑3:** UI screens (wizard + invite + accept)  
4. **PR‑4:** Hardening polish (rate limits, audit logs, nicer UX)

Single-purpose PRs only.

---

## 12) Notes / Risks

- Email delivery is a product dependency; v0.1 may ship with “copy link” for pilots.
- If you later add `company_id` relationships, onboarding can be extended without breaking this flow.
- Keep invite tokens short-lived and hashed; never store raw token.

