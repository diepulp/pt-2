The failure is in a worktree integration test (`trees/table-lifecycle-recovery/...`) testing audit log insertion — not related to my changes. All core error handling and HTTP response tests pass.

Here's a summary of the fix:

## Root Cause

"Cyclic object value" occurs when `NextResponse.json()` (which calls `JSON.stringify()`) encounters circular references in error `details`. Throughout the codebase, raw Error objects (including Supabase PostgrestError, FetchError, etc.) are stored as `details` in DomainError instances:

```ts
// 50+ locations across services and middleware
throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
//                                                                ^^^^^
//                                        Raw Error with circular refs
```

When these bubble up to the route handler and get serialized as JSON responses, `JSON.stringify()` fails on circular references.

## Fix Applied (defense-in-depth at 3 layers)

1. **Serialization boundary** (`lib/http/service-response.ts`) — Added `safeDetails()` that sanitizes error details in `baseResult()` and the ServiceResult passthrough path. This catches ALL sources of circular refs regardless of where they originate in the call stack.

2. **Central error mapper** (`lib/server-actions/error-map.ts`) — Added `safeErrorDetails()` and applied it to the generic Error and unknown-type fallback paths.

3. **Middleware** (`auth.ts`, `rls.ts`) and **service layer** (`crud.ts`, `domain-errors.ts`) — Replaced `details: error` with safe property extraction at the points closest to the reward issuance flow.

No past git remediation was found for this issue.

## Comprehensive Fix Summary

**Root cause:** Latent bug — 65+ locations across the codebase store raw Error objects (Supabase PostgrestError, FetchError, etc.) as `DomainError.details`. These objects contain circular references through internal client/request/response refs. When any error path reaches `NextResponse.json()` → `JSON.stringify()`, it crashes with "cyclic object value".

**Why it surfaced now:** Each PRD (052→053→061) added more parallel pre-flight calls and error paths to the issuance workflow, increasing the probability of hitting the generic Error fallback path in `mapDatabaseError()`.

### Changes (12 files, 3-layer defense):

| Layer | File | Fix |
|-------|------|-----|
| **Canonical utility** | `lib/errors/safe-error-details.ts` | NEW — shared `safeErrorDetails()` that extracts only `{message, name, code, hint, details}` primitives |
| **Central error mapper** | `lib/server-actions/error-map.ts` | Uses `safeErrorDetails()` for all paths including `Reflect.get(error, 'details')` passthrough |
| **Serialization boundary** | `lib/http/service-response.ts` | `safeDetails()` deep-clones via `JSON.parse(JSON.stringify())`, falls back to primitive extraction on circular ref |
| **Route handler** | `app/api/v1/loyalty/issue/route.ts` | Spread of `error.details` now filters to primitive values only |
| **Middleware** | `auth.ts`, `rls.ts` | Extract `{message, name}` instead of raw Error |
| **Legacy wrapper** | `with-server-action-wrapper.ts` | Now receives pre-sanitized details from `mapDatabaseError` |
| **Loyalty services** | `crud.ts`, `promo/crud.ts`, `reward/crud.ts`, `rollups.ts` | Extract `{code, message}` instead of raw error |
| **Domain errors** | `domain-errors.ts` | `toDomainError()` extracts `{message, name}` instead of raw Error |