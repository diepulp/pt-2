---
id: INVESTIGATION-GUIDE-PROXY-HASENVVARS-MIDDLEWARE-BYPASS
title: Investigation Guide — Proxy `hasEnvVars` Guard Bypasses Auth Middleware
status: draft
owner: PT-2 / Auth & Middleware
last_updated: 2026-02-17
scope: "Supabase auth session refresh, Next.js middleware, env var hygiene"
---

# Purpose

This guide documents how to **investigate**, **reproduce**, and **fix** the issue where a proxy-level env guard (`hasEnvVars`) causes the Supabase auth middleware to **silently bypass session refresh**, producing **hard-refresh logouts** and related “it works until it doesn’t” auth flakiness.

It also captures why the surface symptom is **smaller than the real blast radius**, and how to prevent recurrence.

# TL;DR Diagnosis

A guard intended to detect whether Supabase env vars are present is checking the **wrong env var name** (e.g., `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`) while the app actually uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Result:

- `hasEnvVars === false` even when env is correctly configured.
- middleware returns early → `updateSession()` never runs.
- client-side navigation appears “fine” (browser SDK refresh)
- **hard refresh / SSR gate** sees expired cookies and treats user as logged out.

This is a **silent auth pipeline disablement** caused by **config drift**.

# Symptoms & Signals

## User-facing
- Hard refresh on protected routes redirects to `/login` or shows unauthenticated state.
- “Session overlay” / “lock screen” state disappears on refresh (separate but compounding).

## Developer-facing
- No visible error, because the middleware returns early.
- Only reproduces reliably when the access token is expired (often ~1 hour) or when SSR is the authority.

# What’s Actually Broken (Model)

There are **two independent mechanisms** that look like “refresh breaks”:

1. **Auth refresh bypass** (server-side):
   - Middleware should refresh session cookies on each request.
   - Guard disables middleware → refresh doesn’t happen → SSR sees stale auth.

2. **Client state reset** (UI/state):
   - Zustand in-memory state resets on refresh by design.
   - If the lock screen is stored only in memory, refresh removes it.

These can both trigger on the same user action (“hard refresh”), so it feels “systemic.”

# Investigation Checklist

## 1) Confirm the env var drift

### What to check
- `.env` contains:
  - `NEXT_PUBLIC_SUPABASE_URL=...`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
- `.env.example` contains the same keys used by the app (no “imaginary” keys).
- `hasEnvVars` checks exactly the keys that truly exist.

### Quick grep targets
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`
- `PUBLISHABLE`
- `SUPABASE_ANON_KEY`
- `hasEnvVars`
- `updateSession`
- `middleware.ts`

### Expected finding
A mismatch between the key name checked in `hasEnvVars` and the key used elsewhere.

## 2) Verify middleware is being bypassed

### What to instrument (temporarily)
Add a short log line to middleware:

- At entry: `"middleware: entered"`
- Before early return: `"middleware: bypassed because hasEnvVars=false"`
- Before calling `updateSession`: `"middleware: calling updateSession"`

### Expected outcome
You’ll see `"bypassed"` in scenarios where you expected refresh to occur.

> Note: Remove logs or gate them behind `NODE_ENV !== 'production'`.

## 3) Reproduce deterministically

### Repro A — “Token expiry + hard refresh”
1. Sign in.
2. Wait for access token to expire (or simulate expiry by clearing/altering cookies).
3. Hard refresh a protected route (SSR/layout gate).
4. Observe redirect to login / unauth state.

### Repro B — “SSR gate dependency”
1. Ensure `app/(dashboard)/layout.tsx` (or similar) calls `getUser()` for gating.
2. With middleware bypassed, hard refresh the dashboard.
3. SSR sees no refreshed session → unauth.

### Repro C — “Client-only navigation mask”
1. Navigate around via client routing after sign-in.
2. Observe it *seems* fine.
3. Hard refresh and it fails.
This confirms the browser SDK is hiding the defect until SSR is involved.

## 4) Identify all affected flows

- Any route protected by SSR/layout `getUser()` checks.
- Any server action or route handler that assumes cookies are refreshed.
- Any “hybrid auth” flow where client + server disagree about session.

# Fix Plan (Immediate)

## 1) Align env var names

### Required change
- Update `hasEnvVars` to check the canonical keys actually used by the app:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Also fix templates
- Update `.env.example` to match exactly.

## 2) Remove the silent failure mode

At minimum, do **not** silently “return” when env vars are missing:

- In dev: throw an error so it fails fast.
- In CI/build: fail the build if required env vars aren’t present.
- In prod: emit a loud log/metric (structured) and degrade intentionally.

# Hardening (Prevent Recurrence)

## A) Centralize env parsing (single source of truth)
Create `env.ts`:

- Parse and validate env vars once (e.g., Zod).
- Export `env.SUPABASE_URL`, `env.SUPABASE_ANON_KEY`.
- Replace all direct `process.env.*` references with `env.*`.

This prevents “one file invents a key name” drift.

## B) CI guardrail: `.env.example` must match `env.ts`
Add a simple CI script/test that:
- Extracts required keys from `env.ts`
- Confirms `.env.example` contains them (and no stale superseded ones)

## C) Auth refresh integration test (E2E)
Add a test that:
1. Signs in.
2. Forces session near/at expiry (mock time or cookie manipulation).
3. Hard refreshes a protected page.
4. Asserts user remains authenticated (or controlled redirect occurs for real logout).

This would have caught the bug immediately.

## D) Reduce guard complexity in middleware
The best middleware is boring:

- Always attempt `updateSession()` when Supabase URL + anon key exist.
- If they don’t, fail loudly in dev/CI.
- Avoid “optional auth pipeline” patterns.

# Lock Screen Persistence (Separate but Related)

If “lock screen” must survive refresh:

- Use Zustand `persist` with `sessionStorage` (survive refresh in tab)
- Or `localStorage` (survive browser restart)

If lock is security-critical, don’t rely on client persistence:
- Make lock state server-authoritative (heavier; decide explicitly).

# Validation Steps After Fix

1. Confirm middleware entry logs show `updateSession()` running.
2. Sign in → hard refresh protected route → should remain authenticated.
3. Wait/force expiry → hard refresh → should still work.
4. Confirm `.env.example` matches `env.ts` required keys.
5. Run CI checks and ensure they fail if env keys drift again.

# “Wider Scope” Conclusion

This is not “a typo.” It is an **auth correctness dependency** on a middleware path that can be **disabled by config drift without detection**.

The immediate patch fixes the symptom.
The hardening steps eliminate the class of failure.

