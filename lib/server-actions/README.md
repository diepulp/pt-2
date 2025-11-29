# Server Actions Middleware

This module provides composable middleware for API route handlers, ensuring consistent auth, RLS, idempotency, audit logging, and tracing across all endpoints.

## Quick Start

```typescript
import { withServerAction } from '@/lib/server-actions/middleware';

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);
  const supabase = await createClient();
  const idempotencyKey = requireIdempotencyKey(request);

  const result = await withServerAction(
    supabase,
    async (mwCtx) => {
      // mwCtx.rlsContext contains casinoId, actorId
      return myService.create(mwCtx.supabase, input);
    },
    {
      domain: 'my-domain',
      action: 'create',
      requireIdempotency: true,
      idempotencyKey,
    },
  );

  if (!result.ok) {
    return errorResponse(ctx, result);
  }
  return successResponse(ctx, result.data);
}
```

## Middleware Chain Order

```
withTracing (outermost) → withAuth → withRLS → withIdempotency → withAudit → handler
```

Each middleware:
1. **withTracing** - Adds correlation ID, measures duration, catches all errors
2. **withAuth** - Validates user authentication via Supabase
3. **withRLS** - Populates `rlsContext` with `casinoId`, `actorId`
4. **withIdempotency** - Enforces idempotency key for mutations
5. **withAudit** - Logs action to audit trail (production only)

## Configuration Options

```typescript
interface ServerActionOptions {
  domain?: string;           // Domain for audit (e.g., 'rating-slip')
  action?: string;           // Action name (e.g., 'start', 'close')
  requireIdempotency?: boolean; // Enforce x-idempotency-key header
  idempotencyKey?: string;   // The key from request header
  correlationId?: string;    // Override auto-generated correlation ID
  skipAuth?: boolean;        // Skip auth (internal use only)
}
```

## MiddlewareContext

The handler receives a `MiddlewareContext` with:

```typescript
interface MiddlewareContext {
  supabase: SupabaseClient<Database>;  // RLS-aware client
  correlationId: string;               // Request trace ID
  startedAt: number;                   // Request timestamp
  rlsContext?: RLSContext;             // { casinoId, actorId, role }
  idempotencyKey?: string;             // From header
  domain?: string;                     // From options
  action?: string;                     // From options
}
```

---

## Migration Guide: Route Handler → New Middleware

### Pattern A: Direct Service Calls → New Middleware (MOST COMMON)

Most existing routes call services directly with manual `getAuthContext()`. This is the primary migration pattern.

#### Before (Direct Service Call - Current State)

```typescript
import { getAuthContext } from '@/lib/supabase/rls-context';
import { createClient } from '@/lib/supabase/server';
import { startSlip } from '@/services/rating-slip';

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);
  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const authCtx = await getAuthContext(supabase);  // Manual auth
    const body = await readJsonBody<StartRatingSlipInput>(request);

    // Direct service call
    const result = await startSlip(supabase, authCtx.casinoId, authCtx.actorId, body);

    return successResponse(ctx, { ratingSlipId: result.id });
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
```

#### After (New Middleware)

```typescript
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { startSlip } from '@/services/rating-slip';

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);
  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody<StartRatingSlipInput>(request);

    // Middleware handles auth, RLS, audit, tracing
    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Auth context available via mwCtx.rlsContext
        return startSlip(
          mwCtx.supabase,
          mwCtx.rlsContext!.casinoId,
          mwCtx.rlsContext!.actorId,
          body
        );
      },
      {
        domain: 'rating-slip',
        action: 'start',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse(ctx, result.data);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
```

### Pattern B: Old Wrapper → New Middleware (IF APPLICABLE)

If any routes use the old `with-server-action-wrapper.ts`, migrate as follows:

#### Before (Old Wrapper)

```typescript
import { withServerAction } from '@/lib/server-actions/with-server-action-wrapper';

const result = await withServerAction(
  async () => {
    const service = createPlayerService(supabase);
    return service.create(input);
  },
  {
    supabase,
    action: 'player.create',
    entity: 'player',
    idempotencyKey,
    requestId: ctx.requestId,
  },
);
```

#### After (New Middleware)

```typescript
import { withServerAction } from '@/lib/server-actions/middleware';

const result = await withServerAction(
  supabase,
  async (mwCtx) => {
    const service = createPlayerService(mwCtx.supabase);
    return service.create(input);
  },
  {
    domain: 'player',
    action: 'create',
    requireIdempotency: true,
    idempotencyKey,
  },
);
```

### Key Differences

| Aspect | Direct Calls | Old Wrapper | New Middleware |
|--------|--------------|-------------|----------------|
| Auth handling | Manual `getAuthContext()` | Implicit | Via `mwCtx.rlsContext` |
| RLS injection | Manual or missing | Implicit | Automatic |
| Audit logging | Missing | Production only | Production only |
| Error mapping | Manual | Automatic | Automatic |
| Supabase | Separate variable | In options | First parameter |
| Handler context | None | None | `MiddlewareContext` |
| Idempotency | Manual check | Manual key | `requireIdempotency: true` |

---

## Reference Implementation

See `/api/v1/rating-slip/start/route.ts` for a complete example using the new middleware.

## Exports

```typescript
// From '@/lib/server-actions/middleware'
export { withServerAction, createServerActionWrapper } from './compositor';
export { withAuth } from './auth';
export { withRLS } from './rls';
export { withIdempotency } from './idempotency';
export { withAudit } from './audit';
export { withTracing } from './tracing';
export type { MiddlewareContext, Middleware, ServerActionConfig, ServerActionOptions } from './types';
```
