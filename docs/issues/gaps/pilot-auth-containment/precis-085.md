## PRD-085 / EXEC-085: External Oversight Admin Auth Isolation — Delivery Précis

### What Changed

PRD-083 established `PILOT_ADMIN_EMAILS` as the admin authority gate and PRD-084
added the demo sandbox routing. Both slices left three boundary gaps: (1) the
`/start` page ran `createServiceClient()` and `checkAllowlistGate()` before the
admin check — instantiating a service-role client on the admin path; (2) unauthenticated
requests to `/pilot-review` redirected to `/signin` instead of `/admin/login`; (3)
the `sendMagicLinkAction` reached the allowlist DB before blocking admin emails.
Additionally, all five admin-check call sites parsed `PILOT_ADMIN_EMAILS` inline,
giving no single update point. This slice patches all five call sites, closes the
boundary gaps, and promotes `isPilotAdmin(email)` to a shared authority helper.

### Flow (Before → After)

**Before (post-PRD-084, pre-PRD-085):**
```
External oversight admin attempts to sign in:
  (no dedicated path — admin used /signin → magic-link OTP like any evaluator)

Unauthenticated request to /pilot-review:
  Middleware: no user + not public → redirect /signin
  (wrong surface — admin password login is at /admin/login)

/start with admin session:
  → auth ✓
  → createServiceClient()           ← service-role client instantiated on admin path
  → checkAllowlistGate(...)         ← DB query made on admin path
  → adminEmails inline parse        ← isPilotAdmin logic duplicated here
  → redirect /pilot-review

sendMagicLinkAction('admin@example.com'):
  → Zod parse ✓
  → createServiceClient()           ← service-role client instantiated
  → checkAllowlistGate(...)         ← DB query made for admin email
  → not_approved result returned

approvePilotAccessAction (target = admin email):
  → allowlist upsert ✓
  → request update ✓
  → signInWithOtp(adminEmail)       ← OTP sent to admin email (wrong path)
  → magicLinkSent: !otpError        ← telemetry: true if OTP succeeded (incorrect)
```

**After:**
```
External oversight admin sign-in:
  /admin/login → password credentials → signInWithPassword
  → session established → redirect /pilot-review

Unauthenticated request to /pilot-review:
  Middleware: pathname.startsWith('/pilot-review') →
    redirect /admin/login  (pure string prefix check, no I/O)

  Page-level (defense-in-depth):
  pilot-review/page.tsx: getUser() returns null →
    redirect /admin/login

/start with admin session:
  → auth ✓ (user.email = admin email)
  → isPilotAdmin(canonicalizeEmail(user.email))  ← fires BEFORE createServiceClient()
  → redirect /pilot-review
  (createServiceClient never called, no allowlist DB query)

/start with evaluator session (unchanged):
  → auth ✓
  → isPilotAdmin(...) → false
  → createServiceClient()
  → checkAllowlistGate(...)
  → [PRD-084 demo binding flow continues]

sendMagicLinkAction('admin@example.com'):
  → Zod parse ✓
  → isPilotAdmin(canonicalEmail) → true
  → return { ok: true, data: { allowlistResult: 'not_approved' } }  ← early exit
  (createServiceClient never called, no allowlist DB query, non-revealing shape)

sendMagicLinkAction('evaluator@casino.com') (unchanged):
  → Zod parse ✓
  → isPilotAdmin(...) → false
  → createServiceClient() → checkAllowlistGate(...)
  → approved: signInWithOtp → magic link sent

approvePilotAccessAction (target = admin email):
  → allowlist upsert ✓
  → request update ✓
  → isPilotAdmin(targetEmail) → true → signInWithOtp skipped
  → magicLinkSent: false  (telemetry accurate: OTP was not attempted)

approvePilotAccessAction (target = evaluator email, unchanged):
  → allowlist upsert ✓
  → request update ✓
  → isPilotAdmin(targetEmail) → false → signInWithOtp sent
  → magicLinkSent: !otpError

isPilotAdmin(email) — single authority helper (new):
  lib/pilot/is-pilot-admin.ts
  Parse PILOT_ADMIN_EMAILS once per call.
  Fail-closed: unset or empty env var → false for all inputs.
  Case-insensitive, whitespace-stripped on both sides.
  Five call sites: requirePilotAdminSession, start/page, pilot-review/page,
    sendMagicLinkAction, approvePilotAccessAction.
```

### Artifacts Delivered (6 workstreams)

**Shared Authority Helper — WS0**
- `lib/pilot/is-pilot-admin.ts` — new file; exports `isPilotAdmin(email: string): boolean`.
  Parses `PILOT_ADMIN_EMAILS` on each call (no module-level singleton — env var is
  mutable per-test). Fail-closed: unset or empty → `false`.
- `lib/pilot/__tests__/is-pilot-admin.test.ts` — 8 unit tests: undefined env var,
  empty string, single exact match, single non-match, list member, list non-member,
  case-insensitive match, whitespace-stripped entries.

**`/start` Admin Check Ordering — WS1**
- `app/(public)/start/page.tsx` — moved `isPilotAdmin` check immediately after the
  `if (!user)` unauthenticated guard, before `createServiceClient()`. Removed the
  3-line inline `PILOT_ADMIN_EMAILS` parse block. Added import.
- `app/(public)/start/__tests__/start-gateway.test.ts` — added
  `describe('StartGatewayPage admin path (PRD-085)')` with one test asserting
  `createServiceClient` is never called on the admin path. Existing 10-test routing
  table preserved.

**`/pilot-review` Redirect Target — WS2**
- `app/(internal)/pilot-review/page.tsx` — changed `redirect('/signin')` to
  `redirect('/admin/login')` on the unauthenticated branch. Removed inline
  `PILOT_ADMIN_EMAILS` parse block (4 lines). Replaced local `adminEmails.includes`
  with `isPilotAdmin(canonical)`. Added import.

**Middleware Path Guard — WS3**
- `lib/supabase/middleware.ts` — inside `if (!user && !isPublicPath)`, added prefix
  check before the general `/signin` redirect:
  ```typescript
  if (request.nextUrl.pathname.startsWith('/pilot-review')) {
    url.pathname = '/admin/login';
    return NextResponse.redirect(url);
  }
  ```
  Pure string operation, no imports, no I/O. `/admin/login` already in `publicPaths`.

**`sendMagicLinkAction` Admin Guard — WS4**
- `app/actions/auth/send-magic-link.ts` — inserted `if (isPilotAdmin(canonicalEmail))`
  guard after Zod parse, before `createServiceClient()`. Returns early with
  `{ ok: true, data: { allowlistResult: 'not_approved' } }` — same shape as a
  non-approved evaluator (RULE-7: non-revealing). Added import.
- `app/actions/auth/__tests__/send-magic-link.test.ts` — added
  `describe('admin email guard (PRD-085)')` with two tests: admin email returns
  `not_approved` without hitting allowlist; `createServiceClient` not called on
  admin path. Also corrected a pre-existing stale assertion (`shouldCreateUser:
  false` → `expect.objectContaining({ shouldCreateUser: true })`).

**`approvePilotAccessAction` OTP Skip — WS5**
- `app/actions/pilot/review-actions.ts` — three changes:
  1. `requirePilotAdminSession`: removed inline `PILOT_ADMIN_EMAILS` parse, replaced
     with `isPilotAdmin(canonical)`. Added import.
  2. `approvePilotAccessAction`: wrapped `signInWithOtp` in
     `if (!isPilotAdmin(targetEmail))` guard. `otpError` initialised to `null`; only
     set when OTP is actually attempted.
  3. `magicLinkSent` telemetry: changed from `!otpError` to
     `!isPilotAdmin(targetEmail) && !otpError` — accurately reports `false` when OTP
     was skipped rather than incorrectly reporting the link was sent.
- `app/actions/pilot/__tests__/review-actions.test.ts` — added test:
  "skips OTP and returns ok:true when approved target email is an admin email (PRD-085)":
  asserts `result.ok === true` and `signInWithOtp` not called. Existing 14 tests
  preserved.

### Key Decisions

| Decision | Resolution |
|----------|-----------|
| `isPilotAdmin` scope | In-scope MUST for this slice — five inline parse blocks were a single-update-point risk. All call sites now delegate to one helper. |
| Fail-closed guarantee | `PILOT_ADMIN_EMAILS` unset or empty → `isPilotAdmin` returns `false` for all inputs. No admin access granted by default; env var omission does not open a gap. |
| Admin guard ordering in `/start` | Guard fires before `createServiceClient()` — service-role client is never instantiated on the admin path. This eliminates an unnecessary privileged DB call, not just a performance concern. |
| Non-revealing magic link block | Admin emails return `{ ok: true, data: { allowlistResult: 'not_approved' } }` — identical shape to a non-approved evaluator. No information leakage about whether the email is in the admin list (RULE-7). |
| OTP skip vs. OTP block | `approvePilotAccessAction` skips OTP for admin target emails rather than blocking; the admin already has a password-auth path. `magicLinkSent: false` in telemetry signals the skip without treating it as an error. |
| Middleware guard placement | Path prefix check inserted before the general `/signin` redirect — the first branch that matches exits early. No interaction with existing public-path logic. |
| `/admin/login` route ownership | This path is a temporary entrypoint for the pilot auth boundary only. It carries no affinity with a future `/admin/*` product surface. The route collision is acknowledged and deferred. |
| Console deferred | No admin console, owner console, or admin platform surface is created or implied by this patch. |

### Architecture Compliance

| Concern | Compliance |
|---------|-----------|
| Single source of truth | All five `PILOT_ADMIN_EMAILS` parse sites consolidated to `isPilotAdmin()`. No inline parse remains in any call site. |
| Fail-closed | Verified in 2 of 8 unit tests for `isPilotAdmin`: undefined env var → false; empty string → false. |
| Non-revealing error shape | Admin path in `sendMagicLinkAction` returns identical envelope to `'not_approved'` — no new error code, no new field. |
| No service-role on admin path | `createServiceClient` is never called when `isPilotAdmin` returns true in `/start` or `sendMagicLinkAction`. |
| Middleware: pure string check | No imports, no DB calls, no email parsing in middleware guard — only `request.nextUrl.pathname.startsWith('/pilot-review')`. |
| INV-ERR-DETAILS | No `DomainError.details: error` (raw Error objects); all error details use `safeErrorDetails()` or omit the details field. |
| Telemetry accuracy | `magicLinkSent` field correctly reflects whether an OTP attempt was made, not whether the attempt succeeded. Skipped OTP → `false`; attempted + succeeded → `true`; attempted + failed → `false`. |
| `magicLinkSent` on partial write | Partial-write path emits `pilot_review.approve.partial_write` before reaching OTP block — OTP skip logic is unreachable on that path. No interaction. |

### Known Limitations

- `/admin/login` route collision is unresolved: the path currently serves the pilot
  auth boundary; any future `/admin/*` product surface must coordinate ownership at
  that point. No durable admin surface is implied by this patch.
- `PILOT_ADMIN_EMAILS` is still the sole authority for admin identity — no DB-backed
  admin role, no staff row, no casino binding. Rotation requires a deployment.
- Middleware guard is prefix-only: `/pilot-review-archive` or any future path that
  begins with `/pilot-review` would also redirect to `/admin/login` for unauthenticated
  requests. Low risk given current route inventory; note for future path planning.
- Admin authentication at `/admin/login` is Supabase `signInWithPassword` — no
  MFA, no session length customisation, no audit log beyond Supabase Auth logs.
  Adequate for the pilot containment scope; not adequate for a durable privileged
  operations surface.
- The `pilot-review/page.tsx` page-level redirect to `/admin/login` is defense-in-depth;
  the middleware guard should intercept first in production. Both are intentional.
