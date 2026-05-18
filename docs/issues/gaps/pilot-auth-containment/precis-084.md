## PRD-084 / EXEC-084: Pilot Sandbox Demo Routing — Delivery Précis

### What Changed

PRD-083 added an allowlist gate but left approved users without a staff binding
falling through to production setup surfaces (`/register`, `/bootstrap`). This
slice closes that gap. Approved evaluators now get an automatic Casino 1 demo
staff binding on first sign-in and land directly in `/pit`. Production setup
surfaces are hard-blocked for non-admin approved users. A `/demo` defense-in-depth
route handles edge cases (direct URL navigation, revoked access). Landing page CTAs
are updated to drive sign-in and pilot requests.

### Flow (Before → After)

**Before (post-PRD-083, pre-PRD-084):**
```
Approved evaluator signs in
  → /auth/confirm → /start
  → allowlist ✓ → staff check → no staff row → /register or /bootstrap
                                                ↑ production setup surfaces — wrong path
```

**After:**
```
Approved evaluator signs in (first time):
  /signin → magic-link OTP → /auth/confirm → /start
  → auth ✓
  → allowlist ✓ (service-role client)
  → not admin (PILOT_ADMIN_EMAILS check)
  → staff query (user-auth client; RLS blocks without app.casino_id — returns null)
  → idempotency check (service-role client): no DEMO- row at Casino 1
  → INSERT staff binding (service-role client):
      casino_id = ca000000-0000-0000-0000-000000000001
      role      = 'pit_boss'
      employee_id = 'DEMO-{6-char UUID suffix}'
      user_id   = user.id
      email     = canonicalizeEmail(user.email)
      first_name = email username
      last_name  = 'Demo'
  → /pit

Returning evaluator (DEMO- binding exists):
  /start → ... → idempotency check: DEMO- row found → /pit (no INSERT)

Admin (in PILOT_ADMIN_EMAILS):
  /start → admin check → /pilot-review (unchanged)

Error paths:
  staff query error → /signin?error=service_unavailable
  INSERT error      → /signin?error=service_unavailable

Direct URL navigation to /demo (edge case only):
  not authenticated          → /signin
  not approved               → /request-access
  admin                      → /pilot-review
  active staff row           → /pit
  no active staff + approved → holding page ("Demo Access Pending") [read-only]
  staff query failure        → holding page + structured diagnostic (masked user ID, no PII)

Approved non-admin hitting /register or /bootstrap:
  requireApprovedPilotSession(requireProvisioningAuth:true) → FORBIDDEN → redirect /demo
  (same guard on registerCompanyAction and bootstrapAction returns FORBIDDEN ServiceResult,
   registerCompany / bootstrapCasino never called)

Landing page:
  Hero primary CTA:    "Explore Interactive Demo"  → /signin
  Hero secondary CTA:  "Request Production Pilot"  → /request-access
  Bottom-close CTA:    "Explore Interactive Demo"  → /signin
```

### Artifacts Delivered (5 workstreams)

**`/start` Gateway — WS_GATEWAY**
- `app/(public)/start/page.tsx` — rewrote approved-non-admin branch: removed
  `casino_settings` query, removed `/register`/`/bootstrap` redirect branches,
  added idempotency check + auto-binding INSERT using service-role client.
  `set_rls_context_from_staff` never called (EXEC-SPEC security invariant).
- `app/(public)/start/__tests__/start-gateway.test.ts` — 10 unit tests: all 8
  routing branches (unauth, not-approved, admin, staff error, active staff,
  idempotency hit, INSERT success, INSERT error) plus idempotency double-visit.

**`/demo` Entry Route — WS_DEMO**
- `app/(public)/demo/page.tsx` — new server component, `force-dynamic`. Five-step
  auth sequence: auth → allowlist → admin → staff binding → holding page. Staff
  query failure falls back gracefully (holding page rendered, structured diagnostic
  emitted with masked user ID). No DB writes, no RLS context-injection under any
  branch.
- `app/(public)/demo/__tests__/demo-page.test.ts` — 8 unit tests: all 5 routing
  branches plus staff-query-failure fallback and no-mutation assertion.

**Production Setup Containment Guards — WS_GUARDS**
- `lib/server-actions/guards/require-approved-pilot-session.ts` — extended with
  `RequireApprovedPilotSessionOpts.requireProvisioningAuth?: boolean`. Default
  behavior unchanged (auth + allowlist only). When `true`: adds
  `PILOT_ADMIN_EMAILS` check after allowlist gate; fail-closed when env var is
  unset or empty (throws FORBIDDEN with zero admin emails configured).
- `app/(onboarding)/register/page.tsx` — calls guard with
  `requireProvisioningAuth:true`; FORBIDDEN → redirect `/demo`; UNAUTHORIZED →
  redirect `/signin?redirect=/register`. Dev bypass unaffected.
- `app/(onboarding)/bootstrap/page.tsx` — same guard; FORBIDDEN → redirect
  `/demo`. Removed the `casino_id` claims-based short-circuit that assumed an
  operational session.
- `app/(onboarding)/register/_actions.ts` — `registerCompanyAction` calls guard
  with `requireProvisioningAuth:true` before `withServerAction`; on
  `DomainError` returns `ServiceResult { ok:false, code: err.code }` without
  calling `registerCompany`.
- `app/(onboarding)/bootstrap/_actions.ts` — `bootstrapAction` same pattern;
  `bootstrapCasino` never called on guard rejection.
- `lib/server-actions/guards/__tests__/require-approved-pilot-session.test.ts`
  — 15 unit tests: default-mode pass/fail, `requireProvisioningAuth` option
  (pass, fail-approved-non-admin, fail-closed on empty env var), all four
  surfaces (page redirects, action FORBIDDEN responses, mutation not invoked).

**Landing Page CTAs — WS_LANDING**
- `app/(landing)/page.tsx` — three CTA locations updated:
  - Line 271 (hero primary): `/contact` "Request an operational walkthrough" →
    `/signin` "Explore Interactive Demo"
  - Line 279 (hero secondary): `#operations` `<a>` "Explore operational domains"
    → `/request-access` `<Link>` "Request Production Pilot"
  - Line 604 (bottom close): `/contact` "Request an operational walkthrough" →
    `/signin` "Explore Interactive Demo"

**E2E Write-Path Tests — WS_E2E (advisory)**
- `e2e/pilot-auth/demo-routing.spec.ts` — 4 Playwright tests across 3 describe
  blocks. Mode B (browser login via `/auth/login`). Inline fixture factory:
  creates auth user + allowlist entry, cleans up by `user_id` scope.
  - S1 (happy path): fresh approved user → DEMO- INSERT → `/pit` + DB verify
    (`employee_id` matches `/^DEMO-[A-Z0-9]{6}$/`, `role=pit_boss`,
    `last_name=Demo`)
  - S2 (idempotency, serial, 2 tests): pre-inserted DEMO- binding → 2 visits →
    `/pit` each time → exactly 1 row, same ID, no new INSERT
  - S3 (regression): non-DEMO staff binding at `DEMO_CASINO_ID` → idempotency
    check prevents new DEMO- INSERT → `/pit` → only the original row remains

### Key Decisions

| Decision | Resolution |
|----------|-----------|
| Auto-bind scope | All approved non-admin users without a staff binding at Casino 1 get a DEMO- binding. No per-user provisioning flag in this slice — flag deferred until provisioning-eligible users exist. |
| Provisioning authority | `PILOT_ADMIN_EMAILS` env var is the single gate for `/register` / `/bootstrap` access. Matches the DEC-1 pattern from PRD-083. |
| Fail-closed for provisioning | `PILOT_ADMIN_EMAILS` unset → empty admin list → all `requireProvisioningAuth:true` guards throw FORBIDDEN. No provisioning access granted by default. |
| FORBIDDEN redirect target | Approved non-admin hitting setup surfaces → `/demo` (not `/request-access`). The user IS approved; they're being routed to the correct surface. |
| `/demo` write invariant | `/demo` holds no INSERT/UPDATE/DELETE under any branch, including staff query failure path. The holding page renders even on DB error. |
| RLS and service-role usage | Both the idempotency check and the staff INSERT use the service-role client. The user-auth-client staff query (step 2 in `/start`) operates against the standard RLS policy (`staff_read` requires `app.casino_id = current_setting('app.casino_id')`). Since `/start` does not call `set_rls_context_from_staff`, that query returns null for all pilot users navigating to `/start`. The idempotency check (service-role) is the operative path for returning users. |
| First_name derivation | `email.split('@')[0]` — no `pilot_access_requests` lookup in this slice (avoids extra query; sufficient for demo display name). |
| Dev bypass preservation | All four setup surfaces skip the provisioning guard in dev bypass (`ENABLE_DEV_AUTH=true`, no user). Existing dev workflow unchanged. |

### Architecture Compliance

| Concern | Compliance |
|---------|-----------|
| `/demo` write invariant | Verified: no `.insert(`, `.update(`, `.delete(` in `demo/page.tsx`; no RPC calls; holding page renders on staff query failure |
| `/start` RLS bypass scope | INSERT uses service-role client; user-auth-client queries only used where RLS correctly applies (auth check, staff status read — which returns null without context injection by design) |
| Fail-closed provisioning | `requireProvisioningAuth:true` throws FORBIDDEN when `PILOT_ADMIN_EMAILS` is unset or empty — zero admin emails = no provisioning access |
| Mutation guard ordering | `registerCompanyAction` and `bootstrapAction` run `requireApprovedPilotSession` before `withServerAction`; guard rejection returns `ServiceResult` without invoking service functions |
| No setup redirect for evaluators | `/register` and `/bootstrap` pages redirect FORBIDDEN to `/demo` (not to an error page); evaluators land on an appropriate surface |
| set_rls_context_from_staff | Never called in `/start` or `/demo` — neither route requires an operational staff session context |
| INV-ERR-DETAILS | No `DomainError.details: error` (raw Error objects) — all error details use `safeErrorDetails()` or omit the details field |

### Known Limitations

- `provisioning_authorized` DB flag deferred: provisioning gate is env-var-only
  (`PILOT_ADMIN_EMAILS`); adding a provisioning-eligible non-admin user requires
  adding them to that env var, which currently controls all admin surfaces
- `AllowlistGateResult` type unchanged (`'approved' | 'not_approved'`): the
  `approved_demo` / `approved_provisioning` split described in the containment
  plan is a future slice once the DB flag lands
- Active-staff branch in `/start` (user-auth-client query) is effectively dead
  code for pilot users navigating directly to `/start` — `staff_read` RLS
  policy requires `app.casino_id` which is not injected in the `/start` flow;
  the idempotency check (service-role) is the operative returning-user path
- `/demo` holding page staff query has the same RLS limitation: the
  `maybeSingle()` returns null for most users; the check is defense-in-depth
  for users who reach `/demo` with an established session context
- E2E tests are advisory (QA-006 advisory tier); require local Supabase +
  dev server; do not block merge
