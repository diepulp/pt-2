# API Patterns Reference (PT-2)

This reference defines canonical API implementation patterns aligned with SDLC taxonomy category **API/DATA** (`docs/25-api-data/`).

---

## 1. Transport Architecture

PT-2 uses a **dual transport** model:

| Transport | Use Case | Contract | Cache Control |
|-----------|----------|----------|---------------|
| **Route Handlers** (`app/api/v1/**`) | React Query mutations/queries | `ServiceHttpResult<T>` | UI owns invalidation |
| **Server Actions** (`app/actions/**`) | Form-based flows | `ServiceResult<T>` | N/A |

**Key Principle:** Route Handlers for React Query, Server Actions for forms.

---

## 2. Response Contract: `ServiceHttpResult<T>`

All HTTP edges MUST return the canonical envelope defined in `lib/http/service-response.ts`:

```typescript
interface ServiceHttpResult<T> {
  ok: boolean;              // True if operation succeeded
  code: string;             // Domain code: 'OK', 'NOT_FOUND', etc.
  status: number;           // HTTP status: 200, 400, 404, etc.
  requestId: string;        // Trace ID (nanoid)
  durationMs: number;       // Processing time
  timestamp: string;        // ISO 8601
  data?: T;                 // Payload on success
  error?: string;           // Error message on failure
  details?: unknown;        // Additional error context
}
```

**Source:** `25-api-data/API_SURFACE_MVP.md`

---

## 3. Route Handler Pattern

### Standard Structure

```typescript
// app/api/v1/{domain}/{action}/route.ts
import type { NextRequest } from 'next/server';
import {
  createRequestContext,
  errorResponse,
  requireIdempotencyKey,
  successResponse
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/with-server-action-wrapper';
import { create{Domain}Service } from '@/services/{domain}';
import { {Action}Schema } from '@/services/{domain}/dto';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);
  try {
    const supabase = await createClient();
    const idempotencyKey = requireIdempotencyKey(request);
    const body = await request.json();
    const input = {Action}Schema.parse(body);

    const result = await withServerAction(
      async () => {
        const service = create{Domain}Service(supabase);
        return service.{action}(input);
      },
      {
        supabase,
        action: '{domain}.{action}',
        entity: '{domain}',
        idempotencyKey,
        requestId: ctx.requestId
      },
    );

    return successResponse(ctx, result.data, result.code);
  } catch (err) {
    return errorResponse(ctx, err);
  }
}
```

### Next.js 15 Dynamic Params

```typescript
// For routes with path params: app/api/v1/players/[id]/route.ts
export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ id: string }> }
) {
  const params = await segmentData.params; // MUST await in Next.js 15
  const { id } = params;
  // ... rest of handler
}
```

---

## 4. Required Headers

### Write Operations (POST/PATCH/DELETE)

| Header | Required | Purpose |
|--------|----------|---------|
| `Content-Type` | Yes | `application/json` |
| `Idempotency-Key` | Yes (writes) | Dedupe via ledger/constraint |
| `Authorization` | Yes | Bearer token (Supabase auth) |

### Idempotency Enforcement

```typescript
// lib/http/service-response.ts
export function requireIdempotencyKey(request: NextRequest): string {
  const key = request.headers.get('idempotency-key');
  if (!key) {
    throw new RouteError('IDEMPOTENCY_REQUIRED', 'Idempotency-Key header is required', 400);
  }
  return key;
}
```

---

## 5. Error Mapping

### PostgreSQL to Domain Codes

| PostgreSQL Code | Domain Code | HTTP | Message |
|-----------------|-------------|------|---------|
| 23503 | FOREIGN_KEY_VIOLATION | 400 | Invalid reference: related record does not exist |
| 23505 | UNIQUE_VIOLATION | 409 | A record with this information already exists |
| 23514 | VALIDATION_ERROR | 400 | Invalid data: check constraints failed |
| 23502 | VALIDATION_ERROR | 400 | Required field is missing |
| PGRST116 | NOT_FOUND | 404 | Record not found |
| - | UNAUTHORIZED | 401 | Authentication required |
| - | FORBIDDEN | 403 | Insufficient privileges |
| (unknown) | INTERNAL_ERROR | 500 | Internal error |

### Error Response Shape

```typescript
{
  ok: false,
  code: "VALIDATION_ERROR",
  status: 400,
  requestId: "abc123",
  durationMs: 45,
  timestamp: "2025-11-26T10:00:00.000Z",
  error: "Required field is missing",
  details: { field: "casino_id", constraint: "NOT NULL" }
}
```

---

## 6. DTO Patterns

### Pattern A (Contract-First) - Complex Business Logic

Manual interfaces with inline mappers for domain contracts:

```typescript
// services/{domain}/{feature}.ts
export interface MidSessionRewardInput {
  casinoId: string;
  playerId: string;
  ratingSlipId: string;
  staffId: string;
  points: number;
}

// Zod schema for validation
export const MidSessionRewardSchema = z.object({
  casinoId: z.string().uuid(),
  playerId: z.string().uuid(),
  ratingSlipId: z.string().uuid(),
  staffId: z.string().uuid(),
  points: z.number().positive(),
});

// Mapper to RPC input
export function buildMidSessionRewardRpcInput(
  input: MidSessionRewardInput
): MidSessionRewardRpcInput {
  return {
    p_casino_id: input.casinoId,
    p_player_id: input.playerId,
    p_rating_slip_id: input.ratingSlipId,
    p_staff_id: input.staffId,
    p_points: input.points,
  };
}
```

### Pattern B (Canonical CRUD) - Simple Operations

DTOs derived from Database types via Pick/Omit:

```typescript
// services/{domain}/dto.ts
import type { Database } from '@/types/database.types';

export type PlayerDTO = Pick<
  Database['public']['Tables']['player']['Row'],
  'id' | 'first_name' | 'last_name' | 'created_at'
>;

export type PlayerCreateDTO = Pick<
  Database['public']['Tables']['player']['Insert'],
  'first_name' | 'last_name' | 'birth_date'
>;

// Zod schema MUST mirror the DTO structure
export const PlayerCreateSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  birth_date: z.string().date().optional(),
});
```

---

## 7. Validation with Zod

All API inputs MUST be validated using Zod schemas:

```typescript
// services/{domain}/dto.ts
import { z } from 'zod';

// Schema matches DTO interface exactly
export const VisitCreateSchema = z.object({
  player_id: z.string().uuid(),
  casino_id: z.string().uuid(),
  started_at: z.string().datetime().optional(),
});

export type VisitCreateDTO = z.infer<typeof VisitCreateSchema>;
```

### Validation in Route Handler

```typescript
try {
  const body = await request.json();
  const input = VisitCreateSchema.parse(body); // Throws ZodError on invalid
  // ... proceed with validated input
} catch (err) {
  if (err instanceof z.ZodError) {
    return errorResponse(ctx, new RouteError(
      'VALIDATION_ERROR',
      'Invalid request body',
      400,
      { issues: err.issues }
    ));
  }
  return errorResponse(ctx, err);
}
```

---

## 8. React Query Integration

### Client-Side Usage

```typescript
// hooks/use-player.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { playerKeys } from '@/services/player/keys';

export function useCreatePlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: PlayerCreateDTO) => {
      const res = await fetch('/api/v1/players', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(input),
      });
      const json: ServiceHttpResult<PlayerDTO> = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Unknown error');
      }
      return json.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playerKeys.root });
    },
  });
}
```

### Query Key Pattern

```typescript
// services/{domain}/keys.ts
const ROOT = ['{domain}'] as const;

export const {domain}Keys = {
  root: ROOT,
  list: Object.assign(
    (filters: Filters = {}) => [...ROOT, 'list', serialize(filters)] as const,
    { scope: [...ROOT, 'list'] as const },
  ),
  detail: (id: string) => [...ROOT, 'detail', id] as const,
};
```

---

## 9. OpenAPI Alignment

### Workflow

1. **Update spec first:** Edit `docs/25-api-data/api-surface.openapi.yaml`
2. **Regenerate types:** `npm run openapi:types`
3. **Sync to public:** `npm run openapi:sync`
4. **Implement route:** Create route handler matching spec
5. **Validate:** `npm run openapi:validate`

### Type Usage

```typescript
import type { paths } from '@/types/api-schema';

// Response type from OpenAPI
type PlayerResponse =
  paths['/players/{player_id}']['get']['responses']['200']['content']['application/json'];

// Request body type from OpenAPI
type PlayerCreate =
  paths['/players']['post']['requestBody']['content']['application/json'];
```

---

## 10. File Locations

| File | Purpose |
|------|---------|
| `docs/25-api-data/api-surface.openapi.yaml` | OpenAPI spec (source of truth) |
| `docs/25-api-data/API_SURFACE_MVP.md` | Human-readable API catalogue |
| `types/api-schema.d.ts` | Generated TypeScript types |
| `lib/http/service-response.ts` | Response helpers and contracts |
| `lib/server-actions/with-server-action-wrapper.ts` | Action wrapper with audit |
| `app/api/v1/**` | Route handlers |
| `services/{domain}/dto.ts` | DTOs and Zod schemas |
| `services/{domain}/keys.ts` | React Query key factories |

---

## 11. Anti-Patterns

### ❌ DO NOT

- Create ad-hoc response envelopes (use `ServiceHttpResult<T>`)
- Skip idempotency key on write operations
- Use GET for mutations
- Perform cache invalidation server-side
- Include raw database errors in responses
- Skip Zod validation
- Use `any` types in DTOs or handlers

### ✅ DO

- Use `withServerAction` for all service calls
- Generate unique `requestId` for tracing
- Log `durationMs` for performance monitoring
- Return proper HTTP status codes
- Keep DTOs at API boundary
- Test error mapping thoroughly
