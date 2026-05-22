## PRD-083 / EXEC-083: Pilot Authentication Containment Gate — Delivery Précis

### What Changed

Previously, PT-2 had no access restriction at sign-up or login — any visitor could create an account. This slice closes the open pilot to the public: only email addresses pre-approved by an admin can receive a magic-link OTP. Unapproved visitors see a "closed pilot" message and are directed to a request-access form instead.

### Flow (Before → After)

**Before:** `/signin` → enter email → OTP issued → sign in (anyone)

**After:**
```
Visitor:
  /signin → enter email → allowlist check → not approved → closed-pilot message → /request-access
                                           → approved → OTP issued → sign in

Unapproved authenticated user hitting any protected route → /request-access

Admin:
  /pilot-review (internal) → see pending requests → Approve / Reject
  Approve → upserts approved_email_allowlist + updates request status (atomic)
  Revoke → sets allowlist status=revoked (immediate effect)
```

### Artifacts Delivered (33 files across 10 workstreams)

**Database (WS1)**
- `pilot_access_requests` table — public anon INSERT, no SELECT for anon/authenticated; partial unique index `(email) WHERE status='pending'`; CHECK constraints on `email` (lowercase, no whitespace), `status`, `estimated_table_count`
- `approved_email_allowlist` table — no RLS SELECT policy for any role (server-side reads only via service-role client); status CHECK; lookup index `(email) WHERE status='active'`
- SRM updated to v4.24.0: PilotContainmentService bounded context registered

**Pilot Service (`services/pilot/`, WS2)**
- `canonicalizeEmail` — lowercase + trim (defense-in-depth; DB CHECK is authoritative per DEC-7)
- `checkAllowlistGate(serviceClient, email)` — binary `'approved' | 'not_approved'`; fail-closed on any error (missing row, revoked, query failure, thrown exception)
- `submitAccessRequest` — anon INSERT; 23505 unique violation treated as safe success (non-revealing per RULE-8)
- `listPendingRequests` — service-role read for admin surface
- `PilotAccessRequestDTO`, `AllowlistGateResult`, Zod schemas, React Query key factory

**Auth Server Actions (WS2)**
- `sendMagicLinkAction(email)` — allowlist gate before OTP; `shouldCreateUser: false`; returns `{ allowlistResult: 'approved' | 'not_approved' }` without revealing which path for non-approved; never calls `signUp()` (RULE-2)
- `requestPilotAccessAction(formData)` — public INSERT; idempotent on duplicate

**Onboarding Guard + Action Hardening (WS3)**
- `requireApprovedPilotSession(supabase)` — verifies auth session + active allowlist entry; does NOT require staff binding (pre-staff state); throws `DomainError(UNAUTHORIZED | FORBIDDEN)`
- `registerCompanyAction` and `bootstrapAction` both catch guard `DomainError` and return a `ServiceResult` instead of propagating; guard runs before `withServerAction` (which checks staff binding that doesn't exist yet)

**Auth Surface Replacement (WS4)**
- `MagicLinkForm` — replaces `LoginForm` at `/auth/login` and `/signin`; three states: idle / approved ("Check your email") / not-approved ("This is a closed pilot. Request access.")
- `RequestAccessForm` — 6-field public form (name, email, casino, role, table count optional, message optional); success state identical for new and duplicate (non-revealing)
- `/auth/sign-up` — renders `RequestAccessForm` in place; `signUp()` never fires (DEC-2)
- `/auth/forgot-password`, `/auth/update-password` — redirect stubs to `/auth/login` (DEC-4)

**Public Request-Access Page (WS5)**
- `app/(public)/request-access/page.tsx` — publicly accessible without authentication; renders `RequestAccessForm` with dark glassmorphic wrapper matching `/signin`

**Session-Time Allowlist Gates (WS6)**
- `app/(public)/start/page.tsx` — allowlist check inserted between auth check (step 1) and staff-binding check (step 2); fail → `/request-access`
- `app/(dashboard)/layout.tsx` — allowlist check after auth check
- `app/(protected)/layout.tsx` — same
- `app/(onboarding)/register/page.tsx` — allowlist check inside non-devbypass branch
- `app/(onboarding)/bootstrap/page.tsx` — same

**Pilot Review Server Actions (WS7)**
- `approvePilotAccessAction(requestId)` — requires `PILOT_ADMIN_EMAILS` env var match (auth-only, no staff binding required per DEC-1); upserts `approved_email_allowlist` + updates request status; partial write (upsert succeeds but update fails) → returns error + emits `pilot_review.approve.partial_write`
- `rejectPilotAccessAction(requestId)` — updates status only; no allowlist mutation
- `revokePilotAccessAction(email)` — sets `status=revoked`; immediate effect on next login attempt
- All three: idempotent; emit `pilot_review.{action}.{success|denied}` telemetry with `{ targetEmail, actorEmail, action, result, correlationId }` (DEC-8); non-admin → FORBIDDEN + denied telemetry; `createServiceClient()` created only AFTER admin check passes

**Internal Pilot Review Surface (WS8)**
- `app/(internal)/pilot-review/page.tsx` — RSC; admin check at render time (same env var pattern); authenticated non-admin → `/request-access` (not `/signin`, per RULE-9 containment); fetches pending requests server-side
- `pilot-review-table.tsx` — client component; `useTransition` per row; per-row pending state; inline error feedback; `router.refresh()` after action; empty state with dashed border Card

**Unit Tests (WS9, 7 files)**
- `allowlist-gate.test.ts` — approved, not-found (null), query error, thrown exception, email canonicalization before query
- `email-canonicalization.test.ts` — lowercase, trim, both, no-op
- `send-magic-link.test.ts` — not-approved path (no OTP), approved path (OTP issued, `shouldCreateUser:false`), `signUp()` never called (RULE-2), OTP error handling
- `request-pilot-access.test.ts` — valid submission, duplicate idempotency, validation error, DB error
- `review-actions.test.ts` — FORBIDDEN for non-admin (DEC-1), denied telemetry (DEC-8), UNAUTHORIZED, success + success telemetry, partial write detection, NOT_FOUND, reject doesn't touch allowlist, revoke canonicalizes email
- `register/__tests__/_actions.test.ts` — UNAUTHORIZED and FORBIDDEN guard rejection, proceeds on guard pass
- `bootstrap/__tests__/_actions.test.ts` — same

**E2E Specs (WS10, 4 files — Local Verification, advisory tier)**
- `request-access.spec.ts` — happy path, duplicate idempotency, required field gate
- `unapproved-login-rejection.spec.ts` — closed-pilot message, request-access link
- `retired-routes.spec.ts` — DEC-2 (/auth/sign-up renders request form, no password field), DEC-4 redirects
- `direct-deeplink-containment.spec.ts` — unauthenticated hits to /pit, /register, /bootstrap, /start → /signin

### Key Decisions

| Decision | Resolution |
|----------|-----------|
| DEC-1 | Admin authority via `PILOT_ADMIN_EMAILS` env var (comma-separated); auth-only — no staff binding required |
| DEC-2 | `/auth/sign-up` replaced in place with `RequestAccessForm`; no redirect loop; bookmarks kept alive |
| DEC-4 | `/auth/forgot-password` and `/auth/update-password` redirect to `/auth/login`; files kept for bookmark safety |
| DEC-6 | Allowlist enforced at all authenticated entry points (start, dashboard, protected, register, bootstrap) |
| DEC-7 | DB CHECK constraints are authoritative for email canonicalization; service schemas are defense-in-depth |
| DEC-8 | Telemetry namespace: `pilot_review.{action}.{result}`; required metadata: targetEmail, actorEmail, action, result, correlationId; no env var values in logs |

### Architecture Compliance

| Concern | Compliance |
|---------|-----------|
| Fail-closed | `checkAllowlistGate` returns `'not_approved'` on any error — missing row, revoked, query failure, thrown exception |
| Non-revealing | Success responses identical for new vs. duplicate access requests; not-approved path returns `ok:true` (RULE-7/8) |
| Service-role containment | `approved_email_allowlist` has no SELECT RLS policy for anon/authenticated — all reads are service-role only |
| Admin isolation | `createServiceClient()` only created after `requirePilotAdminSession()` resolves — service-role key never instantiated for non-admin callers |
| Pre-staff authorization | `requireApprovedPilotSession` verifies auth + allowlist without staff binding; distinct from `withServerAction` auth middleware |
| RULE-2 | `sendMagicLinkAction` never calls `signUp()` under any branch |
| RULE-9 | Admin surface (/pilot-review) restricted to pending moderation only; no broader admin capabilities |
| ADR-041 | All new surfaces declare Rendering Delivery + Data Aggregation + Rejected Patterns + Metric Provenance |
| INV-ERR-DETAILS | All DomainError.details use `safeErrorDetails()` — no raw Error objects |

### Known Limitations

- Email-only allowlist: no per-casino scoping in this slice (single shared allowlist)
- OTP delivery not E2E-verified: full magic-link email click deferred per PRD §7.2 risk note; verified at unit level only
- Authenticated non-allowlisted containment E2E path requires a seeded test user with no allowlist entry — deferred to E2E Mode B promotion
- `expires_at` column stored in allowlist but not enforced (DEC-3); enforcement is a future slice
- Admin-only surface has no pagination; suitable for small pilot cohort
