---
id: PRD-084
title: Pilot Sandbox Demo Routing
owner: Product
status: Accepted
affects: [PRD-083, PILOT_RUNTIME_ENTRY_MODEL, FIB-H-SIGNIN-RUNTIME-ENTRY-001]
created: 2026-05-18
last_review: 2026-05-18
phase: Pilot Phase (Auth Containment)
pattern: C
http_boundary: false
---

# PRD-084 — Pilot Sandbox Demo Routing

## 1. Overview

- **Owner:** Product
- **Status:** Draft
- **Summary:** This slice closes the sandbox isolation gap introduced in PRD-083. All allowlist-approved users without an existing staff binding currently fall through to production setup surfaces (`/register`, `/bootstrap`). This PRD removes that path from the public gateway, auto-establishes a demo staff binding at first sign-in for approved users without an existing binding, and routes them directly to `/pit`. The direct `/pit` path for already-staff-bound users is preserved unchanged. A `/demo` route is introduced as a defense-in-depth edge case handler (revoked access, direct URL navigation) — it is not a normal destination in the approved user flow. Production setup surfaces are hard-blocked for non-admin approved users. Landing page CTAs are updated to align with the runtime entry model. No DB migration is required beyond the `provisioning_authorized` flag (see containment plan). The durable `provisioning_authorized` authorization gate is deferred because no provisioning-eligible users exist yet in the pilot.

---

## 2. Problem & Goals

### 2.1 Problem

PRD-083 introduced the pilot allowlist gate but did not complete the runtime entry separation mandated by the runtime model (`PILOT_RUNTIME_ENTRY_MODEL.md`). The result: any approved user without an existing staff binding is silently routed through casino-settings checks and lands on `/register` or `/bootstrap` — both production setup surfaces. Demo evaluators must never reach those surfaces (sandbox isolation rule, §12.2 of the runtime model).

Additionally, the landing page CTAs currently point to `/contact` and `#operations`. Neither directs visitors toward the pilot evaluation or sign-in path.

### 2.2 Goals

| Goal | Observable Signal |
|------|-------------------|
| **G1**: Approved users without a staff binding are auto-bound to Casino 1 at first sign-in and reach `/pit` directly, never `/register` or `/bootstrap` | Smoke test: approved user with no prior staff binding signs in → staff binding created → lands on `/pit` |
| **G2**: Approved users with an existing staff binding still reach `/pit` directly from `/start` | Regression: existing staff-bound pilot user signs in → lands on `/pit` |
| **G3**: `/demo` handles edge cases (revoked access, direct URL navigation) with a clear informational page | Direct navigation to `/demo` by a user with no staff binding → holding page with `/contact` CTA |
| **G4**: Landing page primary CTA drives sign-in for demo evaluation | Hero button links to `/signin`; secondary links to `/request-access` |

### 2.3 Non-Goals

- **Durable `provisioning_authorized` authorization gate** — deferred. This future flag distinguishes demo evaluators from users explicitly authorized to enter the production setup progression. It is deferred not because of migration complexity, but because no provisioning-eligible users exist in the current pilot slice. All currently-approved non-admin users are sandbox evaluators. Until the durable gate exists, `/register`, `/bootstrap`, `registerCompanyAction`, and `bootstrapAction` must fail closed for approved non-admin users. When the first operational customer needs the `/register` → `/bootstrap` path, this gate must be implemented with `AllowlistGateResult` split (`approved_demo` / `approved_provisioning`) and `/start` routing updated accordingly.
- **`AllowlistGateResult` type split** — not needed in this slice; single `'approved'` state is sufficient until the authorization gate is introduced.
- **Per-evaluator staff binding UI** — demo staff bindings are established automatically at first sign-in. Manual admin intervention for staff binding is needed only to revoke access or restore it after revocation (see Appendix C). There is no admin UI for manual binding creation in this slice.
- **Per-evaluator isolated demo tenancy** — deferred. This slice accepts one shared, synthetic demo casino for pilot walkthroughs only. The shared demo tenancy must not be used for real patron, employee, cage, MTL, loyalty, or confidential casino data. Pilot admins must notify evaluators that demo writes are visible to other demo evaluators and may be reset.
- **RLS policy changes** — none.
- **Admin review surface (`/pilot-review`) changes** — none in this slice beyond what exists (approve/reject access requests).
- **Production setup implementation changes beyond containment guards** — out of scope.

---

## 3. Users & Use Cases

- **Primary users:** Pilot evaluators (casino operators evaluating the platform), existing staff-bound pilot users, PT-2 pilot admins

**Top Jobs:**

- As a **pilot evaluator**, I need to sign in and land directly in the application so that I can evaluate the platform without encountering production setup flows or holding pages.
- As an **existing staff-bound pilot user**, I need to sign in and reach `/pit` directly so that my session is unaffected by this change.
- As a **landing page visitor**, I need a CTA that takes me to sign-in or the pilot request form so that I start the correct evaluation path.
- As an **evaluator whose demo access was revoked**, I need a clear informational page so that I understand my access is suspended and know how to follow up.

---

## 4. Scope & Feature List

### 4.1 In Scope

**Gateway routing (`/start`) — modified:**
- Staff binding check is **retained**: approved + active staff record → `/pit` (direct, unchanged behavior for existing operational users)
- Casino-settings check and `/register`/`/bootstrap` redirect branches are **removed** from the approved path
- Approved + no staff binding → **auto-create Casino 1 demo staff binding** → `/pit`
- Auto-binding uses: `casino_id = Casino 1`, `role = 'pit_boss'`, `employee_id = 'DEMO-{random}'`, `user_id` from authenticated session. Creation is idempotent — repeat sign-ins find the existing row.
- Auto-binding failure → `/signin?error=service_unavailable` (fail closed)
- Admin shortcut (`PILOT_ADMIN_EMAILS`) → `/pilot-review` (unchanged)
- Unauthenticated → `/signin` (unchanged)
- Not approved → `/request-access` (unchanged)
- DB error on staff query → `/signin?error=service_unavailable` (unchanged)

**Demo entry route (`/demo`) — new, defense-in-depth only:**
- New server component at `app/(public)/demo/page.tsx`
- This route is **not** a normal destination in the approved user flow. Auto-binding at `/start` routes approved evaluators to `/pit` before `/demo` is reached.
- Auth-gated: unauthenticated → `/signin`
- Allowlist-gated: not-approved authenticated users → `/request-access`
- Admin shortcut: admin users → `/pilot-review`
- Active staff users who navigate directly to `/demo` → redirect to `/pit`
- Approved non-admin users with no staff binding (revoked or edge case) → holding page
- Must not create, mutate, or initialize any tenancy state

**Production setup containment (`/register`, `/bootstrap`) — hardened:**
- Direct navigation to `/register` by an approved non-admin user without explicit provisioning authorization redirects to `/demo`
- Direct navigation to `/bootstrap` by an approved non-admin user without explicit provisioning authorization redirects to `/demo`
- `registerCompanyAction` rejects approved non-admin users without explicit provisioning authorization
- `bootstrapAction` rejects approved non-admin users without explicit provisioning authorization
- In this slice, "explicit provisioning authorization" means pilot admin authority only (`PILOT_ADMIN_EMAILS`)
- Pilot admin authority does not bypass the allowlist gate: pilot admins must be authenticated, allowlisted, and listed in `PILOT_ADMIN_EMAILS`
- Page guards and server action guards must use one shared server-only authorization helper

**Landing page CTAs — updated:**
- Hero primary: "Explore Interactive Demo" → `/signin` (was: "Request an operational walkthrough" → `/contact`)
- Hero secondary: "Request Production Pilot" → `/request-access` (was: "Explore operational domains" → `#operations`)
- Bottom close CTA: mirrors hero primary update

### 4.2 Out of Scope

- Admin UI for staff binding management beyond approve/reject
- `provisioning_authorized` authorization gate and DB column
- Production setup flow redesign beyond containment guards
- Any modification to `/pilot-review`
- New API routes or server actions

---

## 5. Requirements

### 5.1 Functional Requirements

- `app/(public)/start/page.tsx`: the staff binding query (`staff` table, `eq('user_id', user.id)`) is retained and routes active staff directly to `/pit`. The casino-settings query is removed. The `/register` and `/bootstrap` redirect branches are removed. Approved non-admin users with no staff binding have a Casino 1 demo staff binding created inline, then are redirected to `/pit`.
- `app/(public)/demo/page.tsx`: performs auth check → allowlist check → admin check → staff-binding check. Admins redirect to `/pilot-review`. Active staff users redirect to `/pit`. Approved non-admin users with no staff binding render the holding page. The page holds heading, subtext, and `/contact` CTA. No writes to any table.
- `app/(onboarding)/register/page.tsx`: after auth and allowlist checks, approved non-admin users redirect to `/demo`. Pilot admins remain able to load the page for manual/admin-mediated provisioning workflows.
- `app/(onboarding)/bootstrap/page.tsx`: after auth and allowlist checks, approved non-admin users redirect to `/demo`. Pilot admins remain able to load the page for manual/admin-mediated provisioning workflows.
- `registerCompanyAction` and `bootstrapAction`: before mutating any setup state, reject approved non-admin users with `FORBIDDEN` unless they satisfy the same explicit provisioning authorization rule used by the setup pages.
- Landing page: both CTA locations updated to "Explore Interactive Demo" → `/signin`. Secondary CTA updated to "Request Production Pilot" → `/request-access`.

### 5.2 Non-Functional Requirements

- `/start` demo staff binding creation must be idempotent — a second sign-in by an already-bound user finds the existing row and proceeds to `/pit` without inserting a duplicate
- `/start` staff binding creation failure must redirect to `/signin?error=service_unavailable` and must not leave the user in a partial or ambiguous state
- `/demo` must add no new service-role exemptions beyond what is already used for the allowlist gate in `/start`
- `/demo` must never call `set_rls_context_from_staff` or any context-injection RPC
- Holding page (edge case path only) must render without requiring any successful DB read; staff query failures fall back to holding for approved non-admin users and do not crash
- `/demo` staff query failures must emit a structured diagnostic signal before falling back to the holding page. The diagnostic must not leak the evaluator email in plaintext.
- Provisioning setup pages and actions must fail closed for approved non-admin users while the durable `provisioning_authorized` gate is absent

> Architecture details: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`, `docs/issues/gaps/pilot-auth-containment/PILOT_RUNTIME_ENTRY_MODEL.md`  
> FIB: `docs/issues/gaps/pilot-auth-containment/FIB-H-SIGNIN-RUNTIME-ENTRY-001.md`  
> Pilot service layer: `services/pilot/` (`checkAllowlistGate`, `canonicalizeEmail`)

---

## 6. UX / Flow Overview

**Flow 1: New approved evaluator — first sign-in (auto-binding)**
1. Visitor clicks "Explore Interactive Demo" → `/signin`
2. Enters approved email → magic link sent
3. Clicks magic link → `/auth/confirm` → `/start`
4. `/start`: auth ✅, allowlist `approved` ✅, not admin ✅, staff query → no row → auto-create Casino 1 staff binding → redirect `/pit`
5. Evaluator enters the application directly. `/demo` is never reached.

**Flow 2: Approved evaluator — repeat sign-in (existing binding)**
1. User signs in via magic link → `/auth/confirm` → `/start`
2. `/start`: auth ✅, allowlist `approved` ✅, not admin ✅, staff query → active row → redirect `/pit`
3. Idempotent — same outcome as Flow 1 without creating a duplicate binding.

**Flow 3: Existing staff-bound pilot user (regression path — must be preserved)**
1. User signs in via magic link → `/auth/confirm` → `/start`
2. `/start`: auth ✅, allowlist `approved` ✅, not admin ✅, staff query → active row → redirect `/pit`
3. User enters the operational runtime directly. Behavior unchanged from pre-PRD-084.

**Flow 4: Admin entry (unchanged)**
1. Admin visits `/admin/login` or signs in via magic link
2. `PILOT_ADMIN_EMAILS` check → redirect `/pilot-review`

**Flow 5: Landing page → pilot access request**
1. Visitor clicks "Request Production Pilot" → `/request-access`
2. Fills out access request form (existing flow, unchanged)

**Flow 6: Evaluator with revoked demo access (edge case)**
1. User signs in → `/start` → staff query → no row (binding was deleted by admin)
2. `/start` attempts auto-binding → succeeds → `/pit` (if admin re-enables by re-inserting)
3. OR if admin has also set allowlist status to `revoked` → `/request-access`
4. Direct navigation to `/demo` by an approved user with no staff binding → holding page

**Flow 7: Approved non-admin attempts direct setup access**
1. Approved non-admin user manually visits `/register` or `/bootstrap`
2. Page-level guard verifies auth and allowlist, then detects no explicit provisioning authorization
3. User redirects to `/demo`
4. If the same user invokes `registerCompanyAction` or `bootstrapAction` directly, the action returns `FORBIDDEN` before any write

**Flow 8: Pilot admin setup access**
1. Admin authenticates and is present in both `approved_email_allowlist` (`status = 'active'`) and `PILOT_ADMIN_EMAILS`
2. Admin navigates directly to `/register` or `/bootstrap`
3. Setup page guard allows access for manual/admin-mediated provisioning
4. If the admin invokes `registerCompanyAction` or `bootstrapAction`, the action authorization guard passes before normal validation and mutation logic runs

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **PRD-083** (`services/pilot/`, `checkAllowlistGate`, `approved_email_allowlist` table) — must be merged and deployed first.
- **seed.sql applied to target environment** — `supabase/seed.sql` contains the complete demo casino (Casino 1: "Lucky Star Downtown", `ca000000-...001`), its `casino_settings` (`setup_status = 'ready'`), tables, players, visits, rating slips, and loyalty records. The seed must be applied to any non-local environment where the demo will be used. Casino 1 must exist before `/start` can auto-create staff bindings against it.

### 7.2 Risks & Open Questions

- **Auto-binding at `/start` is a write on the authenticated read path.** The staff INSERT runs on every first sign-in for an approved demo user. If the INSERT fails (DB unavailable, constraint violation), the user is redirected to `/signin?error=service_unavailable`. This is the correct fail-closed behavior but means a DB hiccup at sign-in time prevents access entirely. Mitigation: idempotency check before INSERT; structured telemetry on failure.

- **`/register` and `/bootstrap` are now routing-orphaned and guarded.** No non-admin user can reach these surfaces from the normal magic-link flow. Before any provisioning-eligible non-admin user is manually approved, the durable `provisioning_authorized` gate must replace the temporary admin-only setup authorization rule.

- **`provisioning_authorized` gate absence is a known capability gap.** Without the flag, the system cannot distinguish demo evaluators from provisioning-eligible operators in the routing layer. This is accepted for the current pilot because no provisioning-eligible users exist. When implemented, the gate requires: a DB column on `approved_email_allowlist`, `AllowlistGateResult` type split in `services/pilot/dtos.ts`, ripple updates to `send-magic-link.ts`, `start/page.tsx`, `/register`, `/bootstrap`, and both setup actions.

- **Admin email bypass via env var.** `PILOT_ADMIN_EMAILS` must be set in all deployment environments. If the env var is unset or empty, `requireApprovedPilotSession` with `requireProvisioningAuth: true` must fail closed. Admins must also be allowlisted.

- **Shared demo tenancy is intentionally non-confidential.** All auto-bound demo evaluators enter the same seeded Casino 1 tenant. No real patron, employee, cage, loyalty, MTL, or confidential casino data may be entered.

- **Demo access revocation.** Deleting a user's staff row removes their operational access. On their next sign-in, `/start` will attempt to auto-create a new binding. To permanently revoke demo access, the allowlist entry must also be set to `revoked` — otherwise the auto-binding logic will re-establish access. See Appendix C.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Approved non-admin user with no prior staff binding → auto-bound at `/start` → lands on `/pit` directly, not `/register`, `/bootstrap`, or `/demo`
- [ ] Auto-binding is idempotent — second sign-in by already-bound user proceeds to `/pit` without duplicate insertion
- [ ] Approved user with an existing active staff binding → lands on `/pit` directly from `/start` (regression check)
- [ ] Auto-binding failure → redirects to `/signin?error=service_unavailable` (fail closed)
- [ ] Active staff-bound user direct request to `/demo` → redirects to `/pit`
- [ ] Unauthenticated request to `/demo` → redirects to `/signin`
- [ ] Non-approved authenticated user on `/demo` → redirects to `/request-access`
- [ ] Admin user on `/start` → redirects to `/pilot-review` (regression check)
- [ ] Approved non-admin direct request to `/register` → redirects to `/demo`
- [ ] Approved non-admin direct request to `/bootstrap` → redirects to `/demo`
- [ ] Pilot admin direct request to `/register` remains available for manual/admin-mediated provisioning
- [ ] Pilot admin direct request to `/bootstrap` remains available for manual/admin-mediated provisioning when registration prerequisites are met
- [ ] Pilot admin who is not allowlisted cannot access `/register` or `/bootstrap`
- [ ] Landing hero primary CTA: "Explore Interactive Demo" → `/signin`
- [ ] Landing secondary CTA: "Request Production Pilot" → `/request-access`
- [ ] Landing bottom close CTA mirrors hero primary

**Security & Access**
- [ ] `/demo` performs no writes to any table under any code path
- [ ] `/demo` does not call any RLS context-injection function
- [ ] `/start` auto-binding does not call `set_rls_context_from_staff` or any RLS context-injection RPC
- [ ] `registerCompanyAction` returns `FORBIDDEN` for approved non-admin users without explicit provisioning authorization
- [ ] `bootstrapAction` returns `FORBIDDEN` for approved non-admin users without explicit provisioning authorization
- [ ] Denied setup actions do not call `registerCompany` or `bootstrapCasino`
- [ ] `/register` and `/bootstrap` direct navigation does not rely on `/start` as the only containment boundary

**Testing**
- [ ] Unit test: `/start` routing table — six branches covered: unauthenticated, not_approved, admin, approved+active-staff, approved+no-staff (auto-bind success), approved+no-staff (auto-bind failure)
- [ ] Unit test: `/start` auto-binding idempotency — existing DEMO- staff row found → no INSERT, proceed to `/pit`
- [ ] Unit test: `/demo` defense-in-depth — unauthenticated, not_approved, admin, active-staff, and approved+no-staff branches covered
- [ ] Unit test: setup page guards — approved non-admin redirects from `/register` and `/bootstrap`; allowlisted pilot admin does not; non-allowlisted pilot admin is denied
- [ ] Unit test: setup action guards — approved non-admin receives `FORBIDDEN`; mutation functions are not called
- [ ] Unit test: shared setup authorization helper — unauthenticated denied, non-allowlisted denied, approved non-admin denied, allowlisted `PILOT_ADMIN_EMAILS` member allowed
- [ ] Unit test: setup page/action parity — `/register`, `/bootstrap`, `registerCompanyAction`, and `bootstrapAction` all use the same helper outcome for approved non-admin and allowlisted admin users
- [ ] Unit test: `/demo` staff query failure renders holding page and emits non-PII diagnostic signal
- [ ] Verification: seeded Casino 1 exists with `casino_settings.setup_status = 'ready'`

**Operational Readiness**
- [ ] `PILOT_ADMIN_EMAILS` env var confirmed set in all active deployment environments
- [ ] Every `PILOT_ADMIN_EMAILS` address required for this slice has an `approved_email_allowlist` row with `status = 'active'`
- [ ] Holding page `/contact` CTA confirmed functional (edge case path)
- [ ] Contact surface (`/contact`) confirmed monitored and responsive before first evaluator is approved

**Documentation**
- [ ] This PRD updated to `Accepted` status before merge
- [ ] `sign-in-flow-containment-plan.md` deliverables marked complete
- [ ] `provisioning_authorized` gate deferral and temporary admin-only setup gate noted in team handoff

---

## 9. Related Documents

- **Runtime Entry Model**: `docs/issues/gaps/pilot-auth-containment/PILOT_RUNTIME_ENTRY_MODEL.md`
- **Feature Intake Brief**: `docs/issues/gaps/pilot-auth-containment/FIB-H-SIGNIN-RUNTIME-ENTRY-001.md`
- **Containment Directive**: `docs/issues/gaps/pilot-auth-containment/DEMO_SIGN_IN_FLOW_CONTAINMENT_DIRECTIVE.md`
- **Containment Plan**: `docs/issues/gaps/pilot-auth-containment/sign-in-flow-containment-plan.md`
- **Prerequisite PRD**: `docs/10-prd/PRD-083-pilot-auth-containment-v0.md`
- **Pilot Service Layer**: `services/pilot/` (`checkAllowlistGate`, `canonicalizeEmail`, `AllowlistGateResult`)
- **Architecture / SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **Security / RLS**: `docs/30-security/SEC-001-rls-policy-matrix.md`

---

## Appendix A: Implementation Plan

### WS1: `/start` Gateway Update (P0)

- [ ] Remove casino-settings query block (`casino_settings` table query, `settingsError` handler, `setup_status` check)
- [ ] Remove `/register` and `/bootstrap` redirect branches from the approved path
- [ ] Replace the "no staff / no registration" fallback with inline Casino 1 demo staff binding creation → `redirect('/pit')`
- [ ] Staff binding INSERT: `casino_id = DEMO_CASINO_ID`, `role = 'pit_boss'`, `employee_id = 'DEMO-{randomUUID().substring(0,6).toUpperCase()}'`, `user_id = user.id`, `email = canonicalizeEmail(user.email)`, `first_name` and `last_name` derived from `pilot_access_requests.name` if available, else email username + 'Demo'
- [ ] Idempotency: query for existing `staff` row with `casino_id = DEMO_CASINO_ID AND user_id = user.id` before INSERT; if found, skip INSERT and redirect to `/pit`
- [ ] INSERT error → `redirect('/signin?error=service_unavailable')`
- [ ] Retain staff binding query (`staff` table) and its active-staff → `redirect('/pit')` branch
- [ ] Retain DB error handler → `redirect('/signin?error=service_unavailable')`
- [ ] Verify admin shortcut (`PILOT_ADMIN_EMAILS`) remains intact and runs before the staff query

Resulting approved-user routing in `/start`:
```
admin check              → /pilot-review
staff query error        → /signin?error=service_unavailable
active staff row         → /pit
no staff row (idempotency check passes) → INSERT demo staff binding
  insert success         → /pit
  insert error           → /signin?error=service_unavailable
```

File: `app/(public)/start/page.tsx`

---

### WS2: `/demo` Entry Route — Defense-in-Depth (P0)

This route is not reached during normal approved-user sign-in. It handles direct URL navigation and the edge case where a user's staff binding has been revoked.

- [ ] Create `app/(public)/demo/page.tsx` as an async server component
- [ ] Auth check: `supabase.auth.getUser()` — no user → `redirect('/signin')`
- [ ] Allowlist check: `checkAllowlistGate(serviceClient, canonicalizeEmail(user.email!))` — `not_approved` → `redirect('/request-access')`
- [ ] Admin check: `PILOT_ADMIN_EMAILS` → `redirect('/pilot-review')`
- [ ] Staff binding check: active staff row → `redirect('/pit')`
- [ ] Render holding page for approved non-admin users with no active staff binding (edge case)
- [ ] Holding page: heading, subtext, `<Link href="/contact">Contact us</Link>` CTA

File: `app/(public)/demo/page.tsx` (NEW)

---

### WS3: Production Setup Containment Guards (P0)

- [ ] Update `lib/server-actions/guards/require-approved-pilot-session.ts` to accept `{ requireProvisioningAuth?: boolean }`. When `requireProvisioningAuth: true`, additionally checks `PILOT_ADMIN_EMAILS` after the allowlist gate. Default (`false`) retains current behavior. If `PILOT_ADMIN_EMAILS` is unset or empty and `requireProvisioningAuth: true`, fail closed — no provisioning access granted.
- [ ] `registerCompanyAction` and `bootstrapAction` call `requireApprovedPilotSession(supabase, { requireProvisioningAuth: true })`; the pages call the same helper before rendering
- [ ] Update `app/(onboarding)/register/page.tsx` so approved non-admin users redirect to `/demo`
- [ ] Update `app/(onboarding)/bootstrap/page.tsx` so approved non-admin users redirect to `/demo`
- [ ] Update `registerCompanyAction` so approved non-admin users receive `FORBIDDEN` before `registerCompany`
- [ ] Update `bootstrapAction` so approved non-admin users receive `FORBIDDEN` before `bootstrapCasino`
- [ ] Add tests proving direct pages and direct actions are blocked for approved non-admin users

Files:
- `app/(onboarding)/register/page.tsx`
- `app/(onboarding)/bootstrap/page.tsx`
- `app/(onboarding)/register/_actions.ts`
- `app/(onboarding)/bootstrap/_actions.ts`
- `lib/server-actions/guards/`

---

### WS4: Landing Page CTA Updates (P1)

- [ ] Line 271: update primary CTA to "Explore Interactive Demo" → `/signin`
- [ ] Line 279: update secondary CTA to "Request Production Pilot" → `/request-access`
- [ ] Line 604: mirror hero primary update

File: `app/(landing)/page.tsx`

---

## Appendix C: Demo Access Management Runbook

Demo staff bindings are created automatically at first sign-in. This runbook covers two operational scenarios: **revoking** demo access for an evaluator, and **verifying** that auto-binding succeeded.

### Scenario 1 — Verify auto-binding after first sign-in

After an approved evaluator signs in for the first time, confirm their binding was created:

```sql
SELECT s.id, s.casino_id, s.email, s.role, s.status, s.employee_id, s.user_id
FROM staff s
WHERE s.user_id = (
  SELECT id FROM auth.users WHERE email = 'evaluator@their-company.com'
)
AND s.casino_id = 'ca000000-0000-0000-0000-000000000001';
```

Expected: one row with `role = 'pit_boss'`, `employee_id LIKE 'DEMO-%'`, `status = 'active'`.

If no row: evaluator has not yet signed in, or the auto-binding failed (check application logs for `service_unavailable` errors at sign-in time).

### Scenario 2 — Revoke demo access

Revoking demo access requires two steps. Deleting the staff row alone is insufficient — `/start` will auto-re-create the binding on next sign-in unless the allowlist entry is also revoked.

**Step 1 — Revoke allowlist entry:**

```sql
UPDATE approved_email_allowlist
SET status = 'revoked'
WHERE email = lower(trim('evaluator@their-company.com'));
```

Verify:
```sql
SELECT email, status FROM approved_email_allowlist
WHERE email = lower(trim('evaluator@their-company.com'));
```

**Step 2 — Remove staff binding:**

```sql
DELETE FROM staff
WHERE casino_id = 'ca000000-0000-0000-0000-000000000001'
  AND email = 'evaluator@their-company.com'
  AND employee_id LIKE 'DEMO-%';
```

After both steps, the evaluator's next sign-in will be redirected to `/request-access` (not approved). They will not be auto-re-bound.

### Scenario 3 — Restore revoked access

To restore access, re-activate the allowlist entry. The staff binding will be auto-recreated on next sign-in.

```sql
UPDATE approved_email_allowlist
SET status = 'active'
WHERE email = lower(trim('evaluator@their-company.com'));
```

No manual staff insertion needed — auto-binding at `/start` handles it.

### Notes

- All demo evaluators share Casino 1's operational data. Write activity accumulates across evaluator sessions.
- To reset demo data to baseline, require explicit pilot-admin approval before re-running `supabase db seed --linked`. This truncates and re-seeds all operational data but preserves `auth.users` and `approved_email_allowlist` rows. Auto-created `DEMO-` staff bindings will be lost and will be recreated automatically on the evaluator's next sign-in.
- The `chk_staff_role_user_id` constraint IS enforced in the production schema: `pit_boss` and `admin` roles require `user_id IS NOT NULL`. The auto-binding INSERT always provides a valid `user_id` from the authenticated session, satisfying this constraint.

---

## Appendix B: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-05-18 | Vladimir Ivanov | Initial draft |
| 1.1.0 | 2026-05-18 | Vladimir Ivanov | Reconcile semantic drift: `provisioning_authorized` is an authorization gate, not infrastructure automation. Reinstated deferral for correct reason. Restored staff binding check to `/start` (direct `/pit` path for existing staff-bound users). Removed staff check from `/demo` (now unconditional holding page). Added routing-orphan gap note for `/register`/`/bootstrap`. |
| 1.2.0 | 2026-05-18 | OpenAI Codex | Apply Devil's Advocate patch delta: make setup containment guards in-scope, fail closed for approved non-admin users, add direct page/action tests, and correct stale middleware wording. |
| 1.3.0 | 2026-05-18 | Vladimir Ivanov | Correct seeded demo tenancy framing: seed.sql already contains the complete demo casino and operational data. Separate deliverable language removed. Per-evaluator staff binding documented as admin SQL runbook (Appendix C). Staff binding UI remains out of scope. |
| 1.4.0 | 2026-05-18 | OpenAI Codex | Apply Devil's Advocate patch delta: fix allowlist status wording, define direct `/demo` staff behavior, require admins to be allowlisted, add mutation no-call tests, and harden Appendix C preflights/audit notes. |
| 1.5.0 | 2026-05-18 | Vladimir Ivanov | Apply DA P0/P1 patch delta: name `require-approved-pilot-session.ts` as the guard to update with `requireProvisioningAuth` option; specify fail-closed behavior when `PILOT_ADMIN_EMAILS` is unset; fix `chk_staff_role_user_id` constraint note; add `onboarding_registration` cascade clarification; add contact surface monitored DoD checkbox. |
| 1.6.0 | 2026-05-18 | Vladimir Ivanov | Collapse two-step admin model (approve + enable demo) into one. Approval is demo enablement. Demo staff binding auto-created at first sign-in in `/start` gateway — no admin SQL or secondary UI action required. `/demo` route reframed as defense-in-depth edge case handler only. Appendix C rewritten as access revocation / verification runbook. Flows, DoD, NFRs, and WS1/WS2 specs updated accordingly. |
