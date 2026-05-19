I have a complete picture of the current auth flow. Here's my investigation report:

---

## Current Auth Flow: Investigation Summary

### Entry Points

**Login** — Two surfaces rendering the same `LoginForm`:
- `app/(public)/auth/login/page.tsx`
- `app/(marketing)/signin/page.tsx`

`LoginForm` (`components/login-form.tsx:34`) calls `supabase.auth.signInWithPassword()` — **password-based, not magic link**. Has a "Create account" link pointing to `/auth/sign-up`.

**Sign-Up** — `app/(public)/auth/sign-up/page.tsx` → `SignUpForm` (`components/sign-up-form.tsx:41`) calls `supabase.auth.signUp()` — **completely open, no allowlist check, anyone can register**.

**Auth Confirm** — `app/(public)/auth/confirm/route.ts` handles OTP verification via `supabase.auth.verifyOtp()`. Already wired for magic-link token handling but only used for post-signup email confirmation today.

### Post-Auth Gateway: `/start`

`app/(public)/start/page.tsx` is the routing hub after any successful auth:
1. No user → `/signin`
2. No staff record → checks `onboarding_registration` → `/bootstrap` or `/register`
3. Staff inactive → `/signin?error=inactive`
4. Casino not set up → `/setup`
5. All clear → `/pit`

### Onboarding Pipeline

```
/register → registerCompanyAction (skipAuth: true)
    ↓
/bootstrap → bootstrapAction (skipAuth: true)  ← both have skipAuth
    ↓
/setup → casino wizard
    ↓
/pit
```

Both server actions have `skipAuth: true`. The page-level guards (`if (!user) redirect(...)`) are the only real protection.

### Landing Page

Main landing (`app/(landing)/page.tsx`) CTAs already point to `/contact` ("Request a Demo", "Book a walkthrough") — **no "Start Free" CTA exists**. The open signup is only accessible if someone knows `/auth/sign-up` directly.

### No Middleware

No `middleware.ts` exists at the repo root — there is no global route protection layer.

---

## Gap Matrix: Current State vs. Containment Model

| Requirement                       | Current State                                            | Gap                                   |
| --------------------------------- | -------------------------------------------------------- | ------------------------------------- |
| Allowlist check before auth       | None                                                     | **Missing**                           |
| Magic-link only (no password)     | `signInWithPassword()`                                   | **Wrong method**                      |
| `pilot_access_requests` table     | Doesn't exist                                            | **Missing**                           |
| `approved_email_allowlist` table  | Doesn't exist                                            | **Missing**                           |
| Sign-up disabled                  | Open via `/auth/sign-up`                                 | **Exposed**                           |
| Request-access form               | None (just `/contact`)                                   | **Missing**                           |
| First-login bootstrap gate        | Partial (page guards exist)                              | **Adequate**                          |
| Forgot-password / update-password | Exist (`/auth/forgot-password`, `/auth/update-password`) | **Irrelevant with OTP — dead routes** |
| Admin review surface              | None                                                     | **Missing (Phase 2)**                 |

---

## Implementation Scope

**Phase 1 (Containment)**:
1. Two DB migrations — `pilot_access_requests` + `approved_email_allowlist` tables with RLS
2. Replace `LoginForm` with a magic-link form that server-side checks the allowlist before calling `signInWithOtp()`
3. Replace `app/(public)/auth/sign-up` with a request-access form (or redirect to it)
4. Kill/redirect forgot-password and update-password routes (no passwords → no resets)
5. New server action: `requestPilotAccess()` — inserts into `pilot_access_requests`
6. New server action: `sendMagicLink()` — allowlist-checks, then calls `signInWithOtp()`

**Phase 2 (Admin Workflow)**:
- Internal admin surface to approve requests and insert allowlist rows

**Phase 3 (Bootstrap Alignment)**:
- Harden `registerCompanyAction` and `bootstrapAction` — drop `skipAuth: true`, enforce real session

---

Want me to proceed with Phase 1 via the build pipeline (`/build`), or write a PRD first for the full containment model?