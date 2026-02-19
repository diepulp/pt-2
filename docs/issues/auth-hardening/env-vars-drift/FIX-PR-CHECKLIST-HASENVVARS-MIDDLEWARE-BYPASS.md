---
id: FIX-PR-CHECKLIST-HASENVVARS-MIDDLEWARE-BYPASS
title: Fix PR Checklist — `hasEnvVars` Middleware Bypass + Env Drift Hardening
status: ready
owner: PT-2 / Auth & Middleware
last_updated: 2026-02-17
source_of_truth: FINDINGS-HASENVVARS-MIDDLEWARE-BYPASS
---

# Goal

Ship a small, decisive PR that:

1. Restores the **entire** server-side Supabase auth middleware pipeline (session refresh + token rotation + edge ACL).
2. Eliminates the **silent failure** pattern that allowed config drift to disable security infrastructure.
3. Aligns `.env.example` / `.env.test.example` so new setups cannot reintroduce the bug.
4. Adds minimal guardrails so this never regresses.

This checklist is derived from the confirmed findings. 

---

# Scope & Order of Operations

## P0 — Restore Runtime Correctness (must land first)

### ✅ 1) Fix the wrong env var name used by `hasEnvVars`
**File:** `lib/utils.ts`  
**Change:** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`  
**Why:** `hasEnvVars` is currently permanently falsy, bypassing auth middleware on every request. 

**Acceptance test:**
- Add a temporary log in middleware (see P0#2) and confirm `updateSession()` runs on request.

---

### ✅ 2) Remove or fail-loud the middleware early return
**File:** `lib/supabase/middleware.ts`  
**Change:** eliminate silent `if (!hasEnvVars) return response;` OR convert to fail-loud in dev/CI.

**Required behavior:**
- **Dev/CI:** throw a clear error if required env is missing.
- **Prod:** refuse to run critical auth refresh silently (log fatal / return 500 is preferable to bypass).

**Why:** silent bypass created the “works until token expiry” time-bomb. 

**Acceptance test:**
- With correct env present: middleware always calls `createServerClient` + `getClaims()` path.
- With env missing (simulate by unsetting): dev should fail loudly.

---

## P1 — Stop Template Drift (must land with P0)

### ✅ 3) Fix `.env.example` wrong var name
**File:** `.env.example`  
**Change:** replace `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` with `NEXT_PUBLIC_SUPABASE_ANON_KEY`. 

### ✅ 4) Fix `.env.test.example` wrong var name
**File:** `.env.test.example`  
**Change:** same alignment. 

### ✅ 5) Add missing service role key to `.env.example`
**File:** `.env.example`  
**Add:** `SUPABASE_SERVICE_ROLE_KEY=...`  
**Why:** required by `lib/supabase/service.ts` but missing from template, leading to future breakage. 

---

## P2 — User-Visible Secondary Fixes (small, safe)

### ✅ 6) Fix misleading E2E docs (optional for the first PR; easy follow-up PR ok)
**File:** `e2e/README.md`  
**Change:** align env var name references. 

### ✅ 7) Lock screen refresh bypass (separate bug; do not mix with auth PR unless you want it)
**File:** `store/lock-store.ts`  
**Change:** add Zustand `persist` with `sessionStorage` so lock survives F5. 

> Recommendation: keep this as PR#2 unless you’re already touching lock screen flows.

---

## P3 — Structural Prevention (guardrails; can be follow-up PRs)

### ✅ 8) Centralized env validation module
**Action:** introduce `src/env/*` (or `lib/env.ts`) using Zod for validation; export typed `env`. 

**Rules:**
- No `process.env.*` outside env module.
- Split server-only vs `NEXT_PUBLIC_*` client-exposed vars.

### ✅ 9) CI guard: templates must match env module
**Action:** add a CI script that compares required keys in env module vs `.env.example` (+ `.env.test.example`). 

### ✅ 10) E2E regression: token expiry + hard refresh
**Action:** automated test that:
- signs in
- simulates expiry (time travel / cookie manipulation)
- hard refreshes a protected route
- asserts still authenticated (or controlled redirect for real logout). 

### ✅ 11) Add `withServerAction` to future API routes (when implemented)
**Action:** ensure route handlers don’t ship without auth middleware. 

---

# Minimal Acceptance Tests (Do Not Skip)

## A) Auth correctness — hard refresh
1. Sign in.
2. Navigate to a protected route.
3. Hard refresh.
4. Must remain authenticated (no redirect to signin).

## B) Auth correctness — token expiry
1. Sign in.
2. Wait ~1hr or simulate token expiry.
3. Hard refresh protected route.
4. Must remain authenticated (middleware refresh must rotate cookies).

## C) Middleware path verification (temporary logging)
Temporarily log:
- middleware entered
- bypass path taken (should never occur with correct env)
- updateSession called

Remove logs before merge or gate behind `NODE_ENV !== 'production'`.

---

# Notes for Review (what to look for)

- Any early-return paths in middleware that disable cookie refresh.
- Any lingering references to `*_PUBLISHABLE_OR_ANON_KEY` across repo.
- Template completeness: `.env.example` must include all runtime-required vars (including `SUPABASE_SERVICE_ROLE_KEY`).
- No new raw `process.env.*` usage introduced while fixing.

---

# Out of Scope (for the first fix PR)

- Refactoring 40+ scattered `process.env` reads (do after env module is introduced).
- Reworking auth architecture (ADR changes).
- Implementing stub API route handlers (they are currently TODO/stubs). 
