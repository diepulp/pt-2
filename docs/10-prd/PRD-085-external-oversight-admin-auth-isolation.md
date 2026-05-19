---
id: PRD-085
title: External Oversight Admin Auth Isolation
owner: Architecture
status: Draft
affects: [PRD-083, PRD-084, ADR-030, SEC-001]
created: 2026-05-18
last_review: 2026-05-18
phase: Pilot Containment
pattern: B
http_boundary: false
---

# PRD-085 — External Oversight Admin Auth Isolation

## 1. Overview

- **Owner:** Architecture
- **Status:** Draft
- **Summary:** The pilot containment system (PRD-083/084) introduced an external oversight admin role identified by the `PILOT_ADMIN_EMAILS` env var. This role is responsible solely for reviewing and approving pilot access requests via `/pilot-review`. Its auth surface — password-based login at `/admin/login` — exists independently of the magic-link evaluator flow. However, the current implementation conflates this external actor with the general pilot user pipeline: the allowlist gate fires before the admin check in `/start`, the admin surface redirects unauthenticated users to the evaluator sign-in page, and no explicit barrier prevents a magic link from being issued for an admin email. This PRD closes those gaps and establishes a clean, isolated auth boundary for the external oversight admin.

> **Containment patch framing:** This PRD intentionally patches the existing pilot-review auth boundary. It does not establish a durable owner console, admin platform, or long-term privileged operations surface. Future readers should not interpret this PRD as permission or precedent for a generalized admin center.

---

## 2. Problem & Goals

### 2.1 Concept Disambiguation

PT-2 has two distinct admin concepts that must not be conflated:

**Application admin** — a `staff` row with a privileged RBAC role (e.g. `pit_boss`, future `admin`) within the operational casino system. This actor has a casino binding, is subject to RLS context injection via `set_rls_context_from_staff`, and operates entirely within `(dashboard)` and `(protected)` surfaces. Created through the normal provisioning flow (`/register` → `/bootstrap` → staff INSERT). This role is part of the RBAC matrix and is in scope for future operational governance work. It is **not in scope for this PRD**.

**External oversight admin** — an out-of-band authority identified solely by the `PILOT_ADMIN_EMAILS` environment variable. No `staff` row. No casino binding. No RLS context. Valid surface: `/pilot-review` only (allowlist approval, rejection, revocation). Auth mechanism: password via `/admin/login`. This role exists only for the duration of the controlled pilot and has no footprint in the operational data model. **This PRD governs only this role.**

These two are orthogonal. An external oversight admin is not an application admin. The `PILOT_ADMIN_EMAILS` env var carries no operational permissions inside the casino system.

### 2.2 Problem

Three gaps exist in the current external oversight admin auth boundary:

1. **Allowlist gate runs before admin check in `/start`.** The external oversight admin, after password login, is directed through `/start`. The allowlist gate (step 1b) fires before the admin shortcut (step 1c). If the admin email is not on `approved_email_allowlist` (correct operational posture), they are redirected to `/request-access` before the admin check runs. If their email is on the allowlist (incorrect posture that has occurred in practice), the allowlist gate passes and the admin reaches `/pilot-review` via the evaluator path — conflating the two auth models at runtime.

2. **`/pilot-review` and middleware direct unauthenticated access to `/signin`.** The evaluator magic-link sign-in page is the wrong landing point for unauthenticated access to the admin surface. It creates UX confusion and implicitly suggests magic-link is a valid admin auth method.

3. **No explicit barrier prevents magic link issuance for admin emails.** `sendMagicLinkAction` issues an OTP for any email that passes the allowlist gate. `approvePilotAccessAction` (after our recent fix) now also sends an OTP to any approved email. If an admin email is on the allowlist, both paths will issue a magic link — putting the admin on the evaluator auth path where they do not belong. The design intent is that admin emails are never on the allowlist; this intent is not enforced in code.

### 2.3 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: External oversight admin auth path is entirely password-based | `sendMagicLinkAction` never issues OTP for an email in `PILOT_ADMIN_EMAILS`; verified by unit test |
| **G2**: `/start` routes external oversight admin correctly regardless of allowlist state | Admin email present or absent from allowlist produces identical outcome: redirect to `/pilot-review`; verified by unit test asserting no allowlist query on admin path |
| **G3**: Unauthenticated access to `/pilot-review` routes to `/admin/login`, not `/signin` | Browser navigation to `/pilot-review` while unauthenticated lands on `/admin/login` |
| **G4**: `approvePilotAccessAction` never sends magic link to an admin email | OTP call skipped when target email is in `PILOT_ADMIN_EMAILS`; verified by unit test |

### 2.4 Non-Goals

- Changes to the application admin (RBAC) role or the `staff` table role column
- Changes to `(dashboard)/layout.tsx` or `(protected)/layout.tsx` — these are operational surfaces governed by RBAC, not the external oversight model; the existing allowlist gate in those layouts correctly blocks external oversight admins from operational surfaces, which is the right boundary
- Pagination or additional capabilities on the `/pilot-review` surface
- Persistent session-level tagging of auth method (password vs. OTP) in Supabase claims
- Promotion of `PILOT_ADMIN_EMAILS` to a DB-backed admin table — deferred until steady-state post-pilot
- Dedicated external owner/admin console — `/pilot-review` remains the only external oversight surface in this slice; no new oversight-facing routes, views, or navigation surfaces are introduced
- `/admin/login` is a temporary pilot auth entrypoint and does not imply access to, ownership of, or route affinity with the future application `/admin` surface

---

## 3. Users & Use Cases

- **Primary user:** External oversight admin (identified by `PILOT_ADMIN_EMAILS`)

**Top Jobs:**

- As an **external oversight admin**, I need to sign in with my password at `/admin/login` so that I reach `/pilot-review` without interacting with the evaluator magic-link flow.
- As an **external oversight admin**, I need `/start` to recognise me as admin before checking the allowlist so that my auth path is independent of whether my email appears on the allowlist.
- As an **external oversight admin**, I need a magic link to never be issued to my email so that the two auth models remain cleanly separated in practice.
- As a **PT-2 engineer**, I need the two admin concepts clearly separated in code so that future RBAC work on application admins does not inadvertently affect the pilot oversight surface.

---

## 4. Scope & Feature List

### 4.1 In Scope

**Auth path isolation:**
- `sendMagicLinkAction` rejects magic link issuance for `PILOT_ADMIN_EMAILS` members before the allowlist query, returning `not_approved` (non-revealing per RULE-7)
- `approvePilotAccessAction` skips `signInWithOtp` call when the target email is in `PILOT_ADMIN_EMAILS`

**Routing correction:**
- `/start` evaluates admin check (step 1b) before the allowlist gate (step 1c); admin → `redirect('/pilot-review')` with zero allowlist queries on that path
- `/pilot-review` redirects unauthenticated visitors to `/admin/login`, not `/signin`
- Middleware special-cases paths under `/pilot-review`: unauthenticated → `/admin/login`

**Shared authority helper:**
- `isPilotAdmin(email: string): boolean` extracted as a single source of truth for `PILOT_ADMIN_EMAILS` membership; all five call sites (WS1–WS5) use this helper — no inline parsing duplication

**Test coverage:**
- Unit tests asserting the admin-before-allowlist ordering in `/start` (service-role client not called on admin path)
- Unit tests for magic link block in `sendMagicLinkAction` for admin emails
- Unit test for OTP skip in `approvePilotAccessAction` for admin target emails

### 4.2 Out of Scope

- Moving `PILOT_ADMIN_EMAILS` authority to a database-backed admin table
- Session-level auth-method tagging (password vs. OTP) in JWT claims
- Changes to the application admin RBAC model or `staff.role` enumeration
- Changes to `(dashboard)/layout.tsx` or `(protected)/layout.tsx`
- UI changes to `/admin/login` page design
- Dedicated external owner/admin console — `/pilot-review` is and remains the only external oversight surface; no new oversight routes are added
- Any expansion of `/admin/login` beyond its current role as a temporary pilot-only entrypoint; this route carries no implied ownership of future `/admin/*` surfaces

---

## 5. Requirements

### 5.1 Functional Requirements

- A shared `isPilotAdmin(email: string): boolean` helper MUST be introduced at a stable import path (e.g. `lib/pilot/is-pilot-admin.ts`) and used at all five call sites. No call site may inline the env-var parse pattern independently.
- `sendMagicLinkAction` MUST NOT issue an OTP for any email that is a member of `PILOT_ADMIN_EMAILS`, regardless of the email's allowlist status.
- `approvePilotAccessAction` MUST NOT call `signInWithOtp` when the approved email is in `PILOT_ADMIN_EMAILS`.
- `/start` MUST redirect a user whose email is in `PILOT_ADMIN_EMAILS` to `/pilot-review` before executing the allowlist check; the service-role client MUST NOT be instantiated on the admin path.
- `/pilot-review` MUST redirect unauthenticated requests to `/admin/login`.
- The middleware MUST redirect unauthenticated requests to paths under `/pilot-review` to `/admin/login`.
- All five changes MUST be fail-closed with respect to `PILOT_ADMIN_EMAILS`: an unset or empty env var produces zero admin emails, and no existing behaviour changes.

### 5.2 Non-Functional Requirements

- No schema migrations required.
- No new environment variables introduced; `PILOT_ADMIN_EMAILS` remains the sole authority signal.
- Magic link block in `sendMagicLinkAction` is non-revealing: the response for an admin email is identical in shape to a `not_approved` evaluator response (RULE-7).
- Middleware is on the hot path; the admin check addition must be a simple string prefix check with no DB or service-role calls.

---

## 6. UX / Flow Overview

**Flow 1: External oversight admin — normal password sign-in**
1. Admin navigates to `/admin/login`
2. Enters email + password → `signInAdminAction` → `signInWithPassword`
3. On success, client redirects to `/pilot-review`
4. `/pilot-review` verifies `PILOT_ADMIN_EMAILS` membership, renders pending request list

**Flow 2: External oversight admin — navigates to `/pilot-review` while unauthenticated**
1. Admin navigates directly to `/pilot-review`
2. Middleware: path starts with `/pilot-review`, user unauthenticated → `redirect('/admin/login')`
3. Admin signs in → `/pilot-review`

**Flow 3: External oversight admin — lands on `/start` (e.g. stale bookmark)**
1. Admin is authenticated (password session exists), navigates to `/start`
2. Auth check passes
3. **Admin check fires (new ordering)**: email in `PILOT_ADMIN_EMAILS` → `redirect('/pilot-review')`
4. Allowlist query never executes

**Flow 4: Admin email submitted to `/signin` (evaluator magic-link form)**
1. Admin (or anyone) types admin email into `/signin` → `sendMagicLinkAction`
2. Admin check fires first: email in `PILOT_ADMIN_EMAILS` → return `{ allowlistResult: 'not_approved' }` immediately
3. Allowlist query never executes; no OTP issued; form shows closed-pilot message

**Flow 5: Admin approves an evaluator request**
1. Admin clicks Approve on `/pilot-review` → `approvePilotAccessAction`
2. Allowlist upsert + request status update succeed
3. Target email admin check: not in `PILOT_ADMIN_EMAILS` → OTP send proceeds (normal path)
4. If target email were admin (edge case): OTP send skipped, success result unchanged

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- PRD-083 and PRD-084 fully delivered — this PRD patches gaps in those slices; no new bounded contexts introduced.
- `PILOT_ADMIN_EMAILS` env var set in all target environments; an unset value means zero admin emails and produces no behaviour change (fail-closed).

### 7.2 Risks & Open Questions

- **`PILOT_ADMIN_EMAILS` shared across both admin checks**: The ordering fix in `/start` and the magic-link block both parse the same env var using the same pattern. If the format of the env var changes in future (e.g. moving to a DB table), all five call sites must be updated atomically. Mitigation: the shared `isPilotAdmin(email)` helper introduced in this slice (WS0) is the single update point — env-var format changes require only one edit.
- **Admin email accidentally placed on allowlist**: The magic-link block in `sendMagicLinkAction` and the OTP skip in `approvePilotAccessAction` provide defense-in-depth. The correct operational posture (admin email not on allowlist) is not enforced by a DB constraint in this slice — a future validation slice could add a trigger or application-layer check on allowlist INSERT.
- **Middleware critical-path safety**: The admin check in middleware is a pure string prefix check (`startsWith('/pilot-review')`) with no I/O. Performance impact is negligible.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] External oversight admin can sign in via `/admin/login` → password → `/pilot-review` without any allowlist interaction
- [ ] External oversight admin landing on `/start` (authenticated) is redirected to `/pilot-review` before the allowlist query fires
- [ ] Unauthenticated navigation to `/pilot-review` redirects to `/admin/login`, not `/signin`
- [ ] Submitting an admin email to the magic-link form at `/signin` returns the `not_approved` response; no OTP is sent
- [ ] `approvePilotAccessAction` completes successfully for an admin target email without calling `signInWithOtp`

**Security & Access**
- [ ] No code path issues a magic link for an email in `PILOT_ADMIN_EMAILS`
- [ ] Allowlist table is never queried on the external oversight admin auth path
- [ ] `PILOT_ADMIN_EMAILS` unset or empty: zero behaviour change to any non-admin flow
- [ ] Authenticated external oversight admin cannot enter `(dashboard)` or `(protected)` casino runtime surfaces — these layouts' existing allowlist gates correctly block the admin, proving the patch did not create a privileged side entrance

**Testing**
- [ ] `send-magic-link.test.ts`: admin email returns `not_approved`; service-role client not called
- [ ] `review-actions.test.ts`: OTP not sent when `approvePilotAccessAction` target is admin email
- [ ] `start-gateway.test.ts`: admin path asserts no service-role client instantiation; redirect is `/pilot-review`
- [ ] All existing tests in affected files continue to pass

**Operational Readiness**
- [ ] No new telemetry events required; existing `pilot_review.approve.success` `magicLinkSent: false` flag covers the OTP-skip case
- [ ] Rollback: revert is a single commit touching 5 files, no DB migration to undo

**Documentation**
- [ ] `ADMIN-FLOW-GAP.md` updated to reflect resolved gaps
- [ ] `precis.md` (or `precis-085.md`) filed in `docs/issues/gaps/pilot-auth-containment/`

---

## 9. Related Documents

- **Prerequisite PRDs**: `docs/10-prd/PRD-083-pilot-auth-containment-v0.md`, `docs/10-prd/PRD-084-pilot-sandbox-demo-routing.md`
- **Gap analysis**: `docs/issues/gaps/pilot-auth-containment/ADMIN-FLOW-GAP.md`
- **Security model**: `docs/30-security/SEC-001-rls-policy-matrix.md`, `docs/30-security/SEC-002-casino-scoped-security-model.md`
- **Auth hardening ADR**: `docs/80-adrs/ADR-030-auth-pipeline-hardening.md`
- **Schema / Types**: `types/database.types.ts` (no schema changes in this slice)

---

## Appendix A: Implementation Plan

Six files, no schema changes. All changes are additive guards or ordering fixes.

### WS0: `isPilotAdmin` — shared authority helper

**File**: `lib/pilot/is-pilot-admin.ts` (new)

```typescript
export function isPilotAdmin(email: string): boolean {
  const admins = (process.env.PILOT_ADMIN_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}
```

All subsequent workstreams import this function instead of inlining the env-var parse. Unit test: unset env var → always `false`; comma-separated list → correct membership.

### WS1: `/start` — admin check before allowlist gate

**File**: `app/(public)/start/page.tsx`

Move the `PILOT_ADMIN_EMAILS` check (currently step 1c, after the allowlist query) to step 1b, immediately after the auth check. The service-role client instantiation for the allowlist query moves to after the admin check.

```
Before:
  auth check → allowlist gate (service-role query) → admin check → staff binding

After:
  auth check → admin check → allowlist gate (service-role query) → staff binding
```

Update `start-gateway.test.ts`: add test asserting `createServiceClient` is never called when the user email is in `PILOT_ADMIN_EMAILS`.

### WS2: `/pilot-review` — redirect unauthenticated to `/admin/login`

**File**: `app/(internal)/pilot-review/page.tsx`

Line 30: `redirect('/signin')` → `redirect('/admin/login')`.

### WS3: Middleware — `/pilot-review` unauthenticated → `/admin/login`

**File**: `lib/supabase/middleware.ts`

Before the general `redirect('/signin')` for unauthenticated users, add:

```typescript
if (request.nextUrl.pathname.startsWith('/pilot-review')) {
  url.pathname = '/admin/login';
  return NextResponse.redirect(url);
}
```

No DB calls. Pure path prefix check.

### WS4: `sendMagicLinkAction` — hard block for admin emails

**File**: `app/actions/auth/send-magic-link.ts`

Before the allowlist query, add:

```typescript
if (isPilotAdmin(canonicalEmail)) {
  return { ok: true, code: 'OK', data: { allowlistResult: 'not_approved' }, ... };
}
```

Add unit test: admin email returns `not_approved`; `createServiceClient` never called.

### WS5: `approvePilotAccessAction` — skip OTP for admin target emails

**File**: `app/actions/pilot/review-actions.ts`

Wrap the `signInWithOtp` call with an admin email guard:

```typescript
if (!isPilotAdmin(targetEmail)) {
  // send OTP (existing code)
}
```

Add unit test: `approvePilotAccessAction` with admin target email → `ok:true`, `signInWithOtp` not called.

---

## Appendix B: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-05-18 | Architecture | Initial draft |
| 0.2.0 | 2026-05-18 | Architecture | Containment-patch reframe; console-deferred non-goal; /admin/login route collision note; isPilotAdmin promoted to must; operational-surface denial DoD condition |
