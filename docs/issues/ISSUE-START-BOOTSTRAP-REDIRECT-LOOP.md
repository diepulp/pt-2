# ISSUE: /start ↔ /bootstrap Redirect Loop on PostgREST Failure

**Status:** RESOLVED
**Date:** 2026-03-26
**Severity:** P1 — blocks all login flows
**Affected routes:** `/start`, `/bootstrap`

## Symptom

Application stuck in infinite redirect loop after sign-in:

```
GET /start 200
GET /start 200
GET /bootstrap 200
GET /bootstrap 200
```

User never reaches `/pit`. Loop continues indefinitely.

## Root Cause

Two contributing factors:

### 1. PostgREST container stopped (infra)

`supabase_rest_pt-2` was down, returning **503** to all `.from()` queries through the Supabase REST API. The auth service (`supabase_auth_pt-2`) remained healthy.

### 2. Silent error swallowing in `/start` gateway (code)

`app/(public)/start/page.tsx` destructured only `data` from the staff query, ignoring `error`:

```typescript
// BEFORE — error silently discarded
const { data: staff } = await supabase
  .from('staff')
  .select('id, status, casino_id')
  .eq('user_id', user.id)
  .maybeSingle();

if (!staff) {
  redirect('/bootstrap'); // triggered on DB error, not just missing data
}
```

When PostgREST returned 503, `data` was `null` and `error` was set — but the code treated this as "no staff record exists" and redirected to `/bootstrap`.

### Loop mechanism

1. `/start` → staff query fails (503) → `data: null`, error ignored → redirect `/bootstrap`
2. `/bootstrap` → `auth.getUser()` succeeds (auth service healthy) → `app_metadata.casino_id` exists → redirect `/start`
3. Repeat

## Resolution

### Infra fix
```bash
docker start supabase_rest_pt-2
```

### Code fix (defensive)

Added explicit error handling to break the loop on service failures:

```typescript
// AFTER — error checked before routing decision
const { data: staff, error: staffError } = await supabase
  .from('staff')
  .select('id, status, casino_id')
  .eq('user_id', user.id)
  .maybeSingle();

if (staffError) {
  redirect('/signin?error=service_unavailable');
}

if (!staff) {
  redirect('/bootstrap');
}
```

## Lessons

1. **Never ignore Supabase query errors in routing decisions.** A `null` data response can mean "no rows" OR "query failed" — only the `error` field distinguishes these.
2. **Auth service and REST API have independent availability.** `getUser()` can succeed while `.from()` fails — any gateway page that mixes both must handle partial outages.
3. **SEC-007 P0-1 tightened `staff_read` from `USING(true)` to casino-scoped Pattern C** (migration `20260302230018`). While not the direct cause here, this means the staff read path now depends on a valid JWT with `casino_id` in `app_metadata` — making error handling even more critical.
