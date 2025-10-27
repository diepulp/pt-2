
# Server Actions Architecture (Redacted & Updated)

**Status**: APPROVED  
**Date**: 2025-10-10  
**Phase**: 3 - State Management Infrastructure  
**Related**: ADR-003 State Management Strategy, `25-api-data/API_SURFACE_MVP.md`  
**Redacted/Updated**: 2025-10-24 (doc v1.2 aligns with API Surface v1)

---

## Overview
This update preserves the separation between **server action implementations** and **utilities**, and adds a **Route Handlers** path to harmonize with ADR-003’s React Query usage for **mutations**. Server actions remain for **form-based** flows.  
All HTTP edges must satisfy the canonical `ServiceHttpResult<T>` contract defined in `25-api-data/API_SURFACE_MVP.md` and implemented in `lib/http/service-response.ts`.

---

## Directory Structure

```
app/
├── actions/                           # 👈 Server Action Implementations (form-based flows)
│   ├── player/
│   │   ├── create-player-action.ts
│   │   ├── update-player-action.ts
│   │   └── delete-player-action.ts
│   ├── visit/
│   │   ├── start-visit-action.ts
│   │   └── end-visit-action.ts
│   └── rating-slip/
│       ├── create-rating-slip-action.ts
│       └── close-rating-slip-action.ts
│
├── api/                               # 👈 Route Handlers (React Query mutation transport)
│   └── player/
│       └── create/route.ts            # POST → with-server-action → JSON(ServiceHttpResult)
│
lib/
├── http/                              # 👈 Route/Server Action HTTP helpers (canonical)
│   └── service-response.ts            # ServiceResult, ServiceHttpResult, helpers
├── server-actions/                    # 👈 Server Action utilities (wrapper + audit)
│   ├── with-server-action-wrapper.ts  # Error mapping, audit logging, timing, requestId
│   ├── error-map.ts                   # PG → domain codes
│   ├── audit.ts                       # PII-redacted audit writer
│   ├── validation.ts                  # Zod schemas per domain
│   └── types.ts                       # ServerActionContext (migration target: lib/http)
│
services/
├── player/                            # 👈 Service Layer
│   ├── index.ts
│   ├── crud.ts
│   └── ...
```

---

## Separation of Concerns

### `app/actions/` — Domain-Specific Implementations (Form Flows)
- `"use server"`
- Accept **form** inputs (SSR or RSC-prop passing)
- Call service layer through **`withServerAction`**
- Return typed **ServiceResult<T>**
- **Do not** perform cache invalidation (UI owns it per ADR-003)

### `app/api/v1/**/route.ts` — Route Handlers (React Query Mutations)
- `POST`/`PATCH` for mutations; `GET` for read-only JSON endpoints
- Accept JSON, validate with **Zod**
- Enforce **Idempotency-Key** (header) on writes
- Use `createRequestContext` + `withServerAction` + domain service
- Return **ServiceHttpResult<T>** via `successResponse`/`errorResponse` for React Query `mutationFn`
- Await Next.js 15 `params` promise (`segmentData.params`) before parsing

### `lib/http/` — Reusable HTTP Utilities
- Error mapping (PG → domain)
- Audit logging (prod-only, PII redacted)
- Request ID, latency, metrics
- Validation helpers (Zod schemas)
- Type contracts: `ServiceResult`, `ServiceHttpResult`, `RouteError`, `RequestContext`
- `requireIdempotencyKey`, `createRequestContext`, `successResponse`, `errorResponse`

---

## Types

- Prefer importing `ServiceResult` / `ServiceHttpResult` directly from `@/lib/http/service-response`.  
- `ServiceHttpResult<T>` envelope = `{ ok, code, status, requestId, durationMs, timestamp, data?, error?, details? }` per API Surface doc.

---

## Wrapper

```ts
// lib/server-actions/with-server-action-wrapper.ts
import { nanoid } from 'nanoid';
import { mapDatabaseError, toHttpStatus } from './error-map';
import { writeAuditLog } from './audit';

export async function withServerAction<T>(
  action: () => Promise<ServiceResult<T>>,
  ctx: ServerActionContext,
): Promise<ServiceResult<T>> {
  const start = Date.now();
  const requestId = ctx.requestId ?? nanoid();

  try {
    const result = await action();
    const envelope = {
      ...result,
      ok: result.ok ?? true,
      code: result.code ?? 'OK',
      requestId,
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    } satisfies ServiceResult<T>;

    if (process.env.NODE_ENV === 'production') {
      await writeAuditLog(ctx.supabase, ctx, envelope);
    }
    return envelope;
  } catch (error) {
    const mapped = mapDatabaseError(error);
    const envelope: ServiceResult<T> = {
      ok: false,
      code: mapped.code,
      error: mapped.message,
      details: mapped.details,
      requestId,
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
    if (process.env.NODE_ENV === 'production') {
      await writeAuditLog(ctx.supabase, ctx, envelope);
    }
    return envelope;
  }
}
```

---

## Route Handler Example (React Query Compatible)

```ts
// app/api/v1/players/route.ts
import type { NextRequest } from 'next/server';
import { createRequestContext, errorResponse, requireIdempotencyKey, successResponse } from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/with-server-action-wrapper';
import { createPlayerService } from '@/services/player';
import { PlayerCreateSchema } from '@/services/player/dto';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);
  try {
    const supabase = await createClient();
    const idempotencyKey = requireIdempotencyKey(request);
    const body = await request.json();
    const input = PlayerCreateSchema.parse(body);
    const result = await withServerAction(
      async () => {
        const service = createPlayerService(supabase);
        return service.create(input);
      },
      { supabase, action: 'player.create', entity: 'player', idempotencyKey, requestId: ctx.requestId },
    );
    return successResponse(ctx, result.data, result.code);
  } catch (err) {
    return errorResponse(ctx, err);
  }
}
```

**Next.js 15 note:** Route Handlers receive `segmentData.params` as a `Promise`, so always `const params = await segmentData.params;` before validation.

**Client (React Query)**
```ts
// mutationFn using fetch to the route handler
const mutation = useMutation({
  mutationFn: async (input: CreatePlayerInput) => {
    const res = await fetch('/api/v1/players', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': crypto.randomUUID(),
      },
      body: JSON.stringify(input),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || 'Unknown error');
    return json.data as Player;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: playerKeys.root() });
  },
});
```

---

## Error Mapping Reference (Expanded)

| PostgreSQL Code | PostgREST Code | Mapped Error | HTTP | Message |
|---|---|---|---|---|
| 23503 | - | FOREIGN_KEY_VIOLATION | 400 | Invalid reference: related record does not exist |
| 23505 | - | UNIQUE_VIOLATION | 409 | A record with this information already exists |
| 23514 | - | VALIDATION_ERROR | 400 | Invalid data: check constraints failed |
| 23502 | - | VALIDATION_ERROR | 400 | Required field is missing |
| - | PGRST116 | NOT_FOUND | 404 | Record not found |
| - | - | UNAUTHORIZED | 401 | Authentication required |
| - | - | FORBIDDEN | 403 | Insufficient privileges |
| (unknown) | - | INTERNAL_ERROR | 500 | Internal error |

---

## Do’s and Don’ts (Delta)

### ✅ DO
- Use **Route Handlers** for React Query mutations; keep server actions for **forms**.
- Validate inputs with **Zod** in handlers/actions.
- Enforce **Idempotency-Key** on write operations.
- Generate **requestId**, measure **durationMs**, and attach to response.
- Redact PII in audit logs; log raw payloads only in non-prod.
- Let the **UI layer** manage cache invalidation (ADR-003).

### ❌ DON’T
- Don’t call server actions directly from client bundles (unless passed from RSC or used via form actions).
- Don’t perform cache invalidation in the server layer.
- Don’t include sensitive data in audit logs.
- Don’t use GET routes for mutations.

---

## Testing

- Unit: error mapping matrix, validation fail → 400, idempotency replay → same result, requestId propagation.  
- Integration: route handler 200/400/409/500 paths; production-only audit branch.  
- Contract: `ServiceHttpResult` schema stability.

---

## API Surface Alignment Checklist
- `app/api/v1/**` namespace + `/api/v{n}` versioning per API Surface doc.
- `ServiceHttpResult<T>` responses via `lib/http/service-response` only (no ad-hoc envelopes).
- `Idempotency-Key` enforced on POST/PATCH; dedupe ledger writes per SRM invariants.
- `withServerAction` wraps every service call to capture `requestId`, `durationMs`, audit logs.
- Route Handlers declare caching/edge config (`export const dynamic = 'force-dynamic' | 'force-static'`, etc.) when different from defaults.
- RBAC + rate limiting rely on `lib/rate-limiter` and SRM-defined staff roles; log to `audit_log` with requestId.

---

## Related Documentation
- **ADR-003**: State Management Strategy (v5 pagination, key factories)  
- **SERVICE_RESPONSIBILITY_MATRIX.md**  
- **SERVICE_TEMPLATE.md** (v1.2) for domain-service responsibilities  
- **API_SURFACE_MVP.md** for per-route DTOs + operational notes

**Status**: APPROVED  
**Last Updated**: 2025-10-24  
**Version**: 1.2 (API Surface Alignment)
