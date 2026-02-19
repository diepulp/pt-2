# ISSUE: `.env.example` Var Name Drift — Incomplete Fix from ISSUE-001

**Status:** Open
**Severity:** High (compounds ISSUE-PROXY-HASENVVARS-MIDDLEWARE-BYPASS)
**Category:** Auth / Configuration
**Discovered:** 2026-02-17
**Origin:** Residual from ISSUE-001 (archived, 2025-12-09)
**Blocks:** ISSUE-PROXY-HASENVVARS-MIDDLEWARE-BYPASS (fixing this issue resolves the middleware bypass)

---

## Summary

`.env.example` uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` while the actual `.env` and all Supabase client files use `NEXT_PUBLIC_SUPABASE_ANON_KEY`. ISSUE-001 fixed this mismatch in `lib/supabase/middleware.ts:21` (the `createServerClient` call) but left three files using the old name — including `lib/utils.ts` where the `hasEnvVars` guard permanently disables the proxy session refresh.

## Background: `.env.example` Purpose

`.env.example` is a developer onboarding template. It is referenced in 4 places:

| Location | Usage |
|---|---|
| `README.md:76` | "Rename `.env.example` to `.env.local` and update the following" |
| `.claude/commands/create-worktree.md:88` | `cp .env.example .env` during worktree setup |
| `e2e/README.md:22,30` | E2E setup instructions reference the same var name |
| `.env.test.example:9` | Parallel template for E2E tests |

The template itself has no runtime impact. The problem is that its var name leaked into `lib/utils.ts` as the `hasEnvVars` check.

## The Incomplete Fix

**ISSUE-001** (archived `docs/issues/_archive/ISSUE-001-dashboard-auth-nextjs16.md`) documented and fixed the env var mismatch in `lib/supabase/middleware.ts:21`:

> The Supabase middleware referenced a non-existent environment variable:
> `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!`
>
> **Fix Applied:** Changed to `NEXT_PUBLIC_SUPABASE_ANON_KEY` to match `.env`.

Three files were missed during that fix:

| File | Line | Impact |
|---|---|---|
| `lib/utils.ts` | 13 | `hasEnvVars` guard — **permanently falsy**, disables proxy session refresh |
| `.env.example` | 4 | Onboarding template — new developers get the wrong var name |
| `.env.test.example` | 9 | E2E test template — same wrong var name |

## Runtime Impact

`hasEnvVars` is imported in exactly one place: `lib/supabase/middleware.ts:4,13`. Its sole purpose is to skip session refresh during initial project setup (before env vars are configured). In a running project it should always be truthy.

Because `.env` has `NEXT_PUBLIC_SUPABASE_ANON_KEY` but `hasEnvVars` checks `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`:

```typescript
// lib/utils.ts:11-13
export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&          // ✅ defined
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY; // ❌ undefined
// Result: always falsy
```

```typescript
// lib/supabase/middleware.ts:13-15
if (!hasEnvVars) {
  return supabaseResponse; // ← always exits here, getClaims() never called
}
```

This is the direct cause of the middleware bypass documented in `ISSUE-PROXY-HASENVVARS-MIDDLEWARE-BYPASS.md`.

## Fix

Three files need alignment:

**`lib/utils.ts:11-13`**
```diff
 export const hasEnvVars =
   process.env.NEXT_PUBLIC_SUPABASE_URL &&
-  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY;
+  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
```

**`.env.example:4`**
```diff
-NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your-anon-key
+NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**`.env.test.example:9`**
```diff
-NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your-local-anon-key
+NEXT_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key
```

Additionally, `e2e/README.md` lines 22 and 30 reference the old name and should be updated for documentation consistency.

## Related

- `docs/issues/auth-hardening/ISSUE-PROXY-HASENVVARS-MIDDLEWARE-BYPASS.md` — downstream consequence
- `docs/issues/_archive/ISSUE-001-dashboard-auth-nextjs16.md` — original partial fix
- `README.md:76-81` — onboarding instructions (already uses the correct `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
