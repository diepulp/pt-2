# PRD-PATCH — START GATEWAY (Onboarding Mapping + Provisioning Bridge) v0.1

**Status:** Draft Patch  
**Date:** 2026-01-30  
**Applies To:** `PRD-WIZARDS-BOOTSTRAP-SETUP-v0.1` + Onboarding Specs  
**Purpose:** Define the routing “bridge” between public marketing and authenticated tenant provisioning/setup.

---

## 0) Problem

The product currently has a static landing page. Without an explicit gateway, users who click “Get started” or “Sign in” can land in ambiguous states:

- authenticated but no tenant binding (no `staff` row) → “blank app” or errors  
- tenant created but floor setup incomplete → ops can’t use the system, but there’s no guided path  
- mixing marketing and app logic in one page creates SEO, caching, and security confusion

We need one deterministic entry point that maps auth + tenancy state to the correct wizard/app screen.

---

## 1) Goal

Introduce a **Start Gateway** route that:

- keeps `/` as a marketing flyer (public, cacheable)
- routes users into the app or onboarding wizards based on **DB truth**
- becomes the single place where onboarding state mapping is enforced

---

## 2) Non-Goals

- tenant picker / multi-tenant per user (defer)
- subscription/billing portal
- marketing personalization by auth state beyond “Sign in” vs “Continue”
- storing onboarding state in client local storage

---

## 3) UX Structure (Routing)

### Public
- `/` — marketing landing (static)
- `/pricing`, `/security`, `/contact` — marketing pages
- `/signin` — auth entry (Supabase)
- `/start` — **gateway** (dynamic routing)

### App (authenticated)
- `/app` — main app
- `/app/bootstrap` — Wizard A (Tenant Bootstrap)
- `/app/setup` — Wizard B (Initial Setup)

---

## 4) Start Gateway Decision Tree (v0.1)

Route: `GET /start`

1) **Not authenticated**
   - Redirect → `/signin`

2) **Authenticated + staff binding exists and active**
   - If `setup_status = 'ready'` → redirect `/app`
   - Else → redirect `/app/setup`

3) **Authenticated + no staff binding**
   - Redirect → `/app/bootstrap`

**Authoritative checks must be server-side** (DB), not inferred from local state.

---

## 5) Required Data Signal: Setup Status

We need a minimal, explicit indicator for “setup complete”.

### Recommended (v0.1 minimal)
Add to `casino_settings`:

- `setup_status text not null default 'not_started'`
  - allowed: `not_started | in_progress | ready`
- optional: `setup_completed_at timestamptz null`

Wizard B updates:
- when step 1 begins → `in_progress`
- when checklist passes and admin confirms → `ready` (+ timestamp)

---

## 6) Security Requirements

- `/app/*` routes require auth via middleware.
- `/start` may be public but must not reveal tenant data:
  - it only redirects based on server-side checks.
- Start Gateway must not depend on Postgres `SET LOCAL` session context (cross-request).
- Staff binding check must confirm:
  - `staff.user_id = auth.uid()`
  - `staff.status = 'active'`
  - casino active (as per `set_rls_context_from_staff()` hardening)

---

## 7) Implementation Notes (Next.js / Supabase)

- Use middleware to protect `/app/*`
- In `/start`, call a server action or route handler that:
  - reads current user (Supabase auth)
  - queries `staff` by `user_id`
  - reads `casino_settings.setup_status` for the staff’s casino
  - returns redirect target

Future extension:
- if multi-casino per user is enabled later, `/start` becomes tenant picker.

---

## 8) Acceptance Criteria

- Clicking “Get started” from `/` always ends at:
  - `/signin` (not authed), or
  - `/app/bootstrap` (authed, no staff), or
  - `/app/setup` (authed, tenant exists but setup incomplete), or
  - `/app` (authed, setup ready)
- No case results in a blank app shell or permissions error page.
- `/` remains SEO/caching friendly (no auth-based dynamic rendering required).
- Works in a fresh browser session (no client-side cached state assumptions).

---

## 9) Rollout Plan

**PR-1:** Add `setup_status` field to `casino_settings` (migration + types)  
**PR-2:** Implement `/start` decision tree + redirects  
**PR-3:** Wire marketing CTAs:
- `/` “Get started” → `/start`
- `/` “Sign in” → `/signin`
**PR-4:** Wizard B updates `setup_status` to `ready`

Single-purpose PRs only.

