# Security Patterns

**Purpose**: Security rules for backend services - context derivation, RLS parameters, trust boundaries.
**Canonical Reference**: V4 violation - casino context from untrusted source

---

## Casino Context Derivation (CRITICAL)

**Rule**: NEVER trust client-provided context for tenant isolation.

### ❌ DANGEROUS - Trusting Client Headers

```typescript
// app/api/tables/route.ts
export async function POST(request: NextRequest) {
  // ❌ DANGEROUS - Client can spoof this header
  const casinoId = request.headers.get('x-casino-id') ?? '';

  // ❌ Empty string fallback bypasses RLS silently
  if (!casinoId) {
    // This still runs, just with wrong scope
  }

  await supabase.rpc('rpc_update_table', { p_casino_id: casinoId, ... });
}
```

### ❌ DANGEROUS - Trusting Request Body

```typescript
// app/actions/table.ts
export async function updateTableStatus(input: { casinoId: string; ... }) {
  // ❌ DANGEROUS - Client provides casinoId in mutation payload
  const { casinoId, tableId, newStatus } = input;

  await supabase.rpc('rpc_update_table_status', {
    p_casino_id: casinoId,  // ❌ Attacker can pass any UUID
    ...
  });
}
```

### ✅ CORRECT - Derive from Authenticated User

```typescript
// app/actions/table.ts
import { createClient } from '@/lib/supabase/server';

export async function updateTableStatus(input: { tableId: string; newStatus: TableStatus }) {
  const supabase = await createClient();

  // 1. Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new DomainError('UNAUTHORIZED');
  }

  // 2. Derive casino_id from user's staff record (server-side truth)
  const { data: staffRecord, error: staffError } = await supabase
    .from('staff')
    .select('casino_id')
    .eq('user_id', user.id)
    .single();

  if (staffError || !staffRecord?.casino_id) {
    throw new DomainError('STAFF_CASINO_MISMATCH', 'User not associated with a casino');
  }

  // 3. Use server-derived casinoId
  const casinoId = staffRecord.casino_id;

  // 4. Now safe to call RPC with derived context
  const { data, error } = await supabase.rpc('rpc_update_table_status', {
    p_casino_id: casinoId,  // ✅ Derived from auth, not request
    p_table_id: input.tableId,
    p_new_status: input.newStatus,
  });

  if (error) {
    throw mapDatabaseError(error);
  }

  return data;
}
```

---

## Context Caching Pattern

For multiple operations in one request, cache the casino context:

```typescript
// lib/auth/get-casino-context.ts
import { createClient } from '@/lib/supabase/server';
import { DomainError } from '@/lib/errors/domain-errors';

export interface CasinoContext {
  userId: string;
  casinoId: string;
  staffId: string;
}

export async function getCasinoContext(): Promise<CasinoContext> {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new DomainError('UNAUTHORIZED');
  }

  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, casino_id')
    .eq('user_id', user.id)
    .single();

  if (staffError || !staff) {
    throw new DomainError('STAFF_NOT_FOUND');
  }

  if (!staff.casino_id) {
    throw new DomainError('STAFF_CASINO_MISMATCH');
  }

  return {
    userId: user.id,
    casinoId: staff.casino_id,
    staffId: staff.id,
  };
}
```

Usage:

```typescript
// app/actions/rating-slip.ts
export async function startRatingSlipAction(input: StartRatingSlipInput) {
  const ctx = await getCasinoContext();  // Throws if unauthorized

  return withServerAction(
    () => startSlip(getSupabase(), ctx.casinoId, {
      ...input,
      actorId: ctx.staffId,
    }),
    { domain: 'rating-slip', operation: 'start' }
  );
}
```

---

## Route Handler Pattern

For API routes (not server actions):

```typescript
// app/api/tables/[tableId]/status/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createRequestContext, errorResponse, successResponse } from '@/lib/http/service-response';
import { getCasinoContext } from '@/lib/auth/get-casino-context';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { tableId: string } }
) {
  const ctx = createRequestContext(request);

  try {
    // 1. Derive context from auth (NOT from headers/body)
    const casinoCtx = await getCasinoContext();

    // 2. Parse request body (only non-context fields)
    const body = await request.json();
    const { newStatus } = body;  // ✅ OK - not a context field

    // 3. Call service with derived context
    const result = await updateTableStatus(
      casinoCtx.casinoId,  // ✅ Derived
      params.tableId,
      newStatus,
      casinoCtx.staffId,  // ✅ Derived
    );

    return successResponse(ctx, result);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
```

---

## RLS Parameter Setting

When RPCs need `current_setting('app.casino_id')`:

```typescript
// Set before RPC call (if not using RLS policies directly)
await supabase.rpc('set_config', {
  p_casino_id: casinoCtx.casinoId,  // ✅ Derived from auth
});

// Or use RPCs that accept p_casino_id parameter directly
// (RPC validates internally)
```

---

## Trust Boundary Summary

| Source | Trust Level | Use For |
|--------|-------------|---------|
| `supabase.auth.getUser()` | ✅ Trusted | User identity |
| `staff` table query | ✅ Trusted | Casino association |
| Request headers | ❌ UNTRUSTED | Never for auth context |
| Request body | ❌ UNTRUSTED | Only entity IDs, not context |
| URL params | ⚠️ Validate | Entity IDs only, validate ownership |
| Cookies (auth) | ✅ Trusted | Via Supabase auth helpers |

---

## Anti-Patterns

| Anti-Pattern | Risk | Fix |
|--------------|------|-----|
| `headers.get('x-casino-id')` | Header spoofing | Derive from staff table |
| `body.casinoId` | Payload tampering | Derive from staff table |
| Empty string fallback `?? ''` | Silent bypass | Throw if missing |
| Trusting `params.casinoId` | URL manipulation | Derive from staff table |

---

## Checklist

Before implementing any endpoint that uses casino context:

- [ ] Casino ID derived from authenticated user's staff record
- [ ] No casino_id in request body for mutations
- [ ] No casino_id header trust
- [ ] Empty/missing context throws error (no silent fallback)
- [ ] Staff record lookup uses authenticated user.id
- [ ] RLS policies use `current_setting('app.casino_id')` set server-side
