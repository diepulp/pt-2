# Route Handler Templates (PT-2)

Ready-to-use templates for common API patterns. Copy and customize for new endpoints.

---

## Template 1: Create Resource (POST)

```typescript
// app/api/v1/{domain}/route.ts
import type { NextRequest } from 'next/server';
import {
  createRequestContext,
  errorResponse,
  requireIdempotencyKey,
  successResponse
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/with-server-action-wrapper';
import { create{Domain}Service } from '@/services/{domain}';
import { {Domain}CreateSchema } from '@/services/{domain}/dto';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const idempotencyKey = requireIdempotencyKey(request);
    const body = await request.json();
    const input = {Domain}CreateSchema.parse(body);

    const result = await withServerAction(
      async () => {
        const service = create{Domain}Service(supabase);
        return service.create(input);
      },
      {
        supabase,
        action: '{domain}.create',
        entity: '{domain}',
        idempotencyKey,
        requestId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    return successResponse(ctx, result.data, result.code, 201);
  } catch (err) {
    return errorResponse(ctx, err);
  }
}
```

---

## Template 2: Get Single Resource (GET with ID)

```typescript
// app/api/v1/{domain}/[id]/route.ts
import type { NextRequest } from 'next/server';
import {
  createRequestContext,
  errorResponse,
  successResponse
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/with-server-action-wrapper';
import { create{Domain}Service } from '@/services/{domain}';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ id: string }> }
) {
  const ctx = createRequestContext(request);

  try {
    const params = await segmentData.params; // Next.js 15: params is Promise
    const { id } = ParamsSchema.parse(params);

    const supabase = await createClient();

    const result = await withServerAction(
      async () => {
        const service = create{Domain}Service(supabase);
        return service.getById(id);
      },
      {
        supabase,
        action: '{domain}.getById',
        entity: '{domain}',
        entityId: id,
        requestId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    return successResponse(ctx, result.data, result.code);
  } catch (err) {
    return errorResponse(ctx, err);
  }
}
```

---

## Template 3: Update Resource (PATCH)

```typescript
// app/api/v1/{domain}/[id]/route.ts (add to existing file)
import { {Domain}UpdateSchema } from '@/services/{domain}/dto';

export async function PATCH(
  request: NextRequest,
  segmentData: { params: Promise<{ id: string }> }
) {
  const ctx = createRequestContext(request);

  try {
    const params = await segmentData.params;
    const { id } = ParamsSchema.parse(params);

    const supabase = await createClient();
    const idempotencyKey = requireIdempotencyKey(request);
    const body = await request.json();
    const input = {Domain}UpdateSchema.parse(body);

    const result = await withServerAction(
      async () => {
        const service = create{Domain}Service(supabase);
        return service.update(id, input);
      },
      {
        supabase,
        action: '{domain}.update',
        entity: '{domain}',
        entityId: id,
        idempotencyKey,
        requestId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    return successResponse(ctx, result.data, result.code);
  } catch (err) {
    return errorResponse(ctx, err);
  }
}
```

---

## Template 4: List Resources with Pagination

```typescript
// app/api/v1/{domain}/route.ts (add to existing file)
import { {Domain}ListSchema } from '@/services/{domain}/dto';

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const filters = {Domain}ListSchema.parse(searchParams);

    const result = await withServerAction(
      async () => {
        const service = create{Domain}Service(supabase);
        return service.list(filters);
      },
      {
        supabase,
        action: '{domain}.list',
        entity: '{domain}',
        requestId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    return successResponse(ctx, result.data, result.code);
  } catch (err) {
    return errorResponse(ctx, err);
  }
}
```

### Pagination Schema

```typescript
// services/{domain}/dto.ts
export const {Domain}ListSchema = z.object({
  casino_id: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  q: z.string().optional(), // Search query
});

export type {Domain}ListFilters = z.infer<typeof {Domain}ListSchema>;
```

### Paginated Response Shape

```typescript
interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
  total?: number;
}
```

---

## Template 5: RPC-Based Action

For complex business logic with database RPCs:

```typescript
// app/api/v1/loyalty/mid-session-reward/route.ts
import type { NextRequest } from 'next/server';
import {
  createRequestContext,
  errorResponse,
  requireIdempotencyKey,
  successResponse
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/with-server-action-wrapper';
import { createLoyaltyService } from '@/services/loyalty';
import { MidSessionRewardSchema } from '@/services/loyalty/mid-session-reward';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const idempotencyKey = requireIdempotencyKey(request);
    const body = await request.json();
    const input = MidSessionRewardSchema.parse(body);

    const result = await withServerAction(
      async () => {
        const service = createLoyaltyService(supabase);
        return service.issueMidSessionReward({
          ...input,
          idempotencyKey,
        });
      },
      {
        supabase,
        action: 'loyalty.midSessionReward',
        entity: 'loyalty_ledger',
        idempotencyKey,
        requestId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    return successResponse(ctx, result.data, result.code);
  } catch (err) {
    return errorResponse(ctx, err);
  }
}
```

---

## Template 6: Search Endpoint

```typescript
// app/api/v1/{domain}/search/route.ts
import type { NextRequest } from 'next/server';
import {
  createRequestContext,
  errorResponse,
  successResponse
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/with-server-action-wrapper';
import { create{Domain}Service } from '@/services/{domain}';
import { {Domain}SearchSchema } from '@/services/{domain}/dto';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const query = {Domain}SearchSchema.parse(searchParams);

    const result = await withServerAction(
      async () => {
        const service = create{Domain}Service(supabase);
        return service.search(query);
      },
      {
        supabase,
        action: '{domain}.search',
        entity: '{domain}',
        requestId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    return successResponse(ctx, result.data, result.code);
  } catch (err) {
    return errorResponse(ctx, err);
  }
}
```

### Search Schema

```typescript
// services/{domain}/dto.ts
export const {Domain}SearchSchema = z.object({
  q: z.string().min(1).max(100),
  casino_id: z.string().uuid(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});
```

---

## Template 7: Nested Resource

```typescript
// app/api/v1/visits/[visitId]/rating-slips/route.ts
import type { NextRequest } from 'next/server';
import {
  createRequestContext,
  errorResponse,
  successResponse
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/with-server-action-wrapper';
import { createRatingSlipService } from '@/services/rating-slip';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({
  visitId: z.string().uuid(),
});

export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ visitId: string }> }
) {
  const ctx = createRequestContext(request);

  try {
    const params = await segmentData.params;
    const { visitId } = ParamsSchema.parse(params);

    const supabase = await createClient();

    const result = await withServerAction(
      async () => {
        const service = createRatingSlipService(supabase);
        return service.getByVisit(visitId);
      },
      {
        supabase,
        action: 'rating-slip.getByVisit',
        entity: 'rating_slip',
        parentId: visitId,
        requestId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    return successResponse(ctx, result.data, result.code);
  } catch (err) {
    return errorResponse(ctx, err);
  }
}
```

---

## Checklist: New Route Handler

Before creating a new route handler:

- [ ] Route defined in `docs/25-api-data/API_SURFACE_MVP.md`
- [ ] OpenAPI spec updated in `api-surface.openapi.yaml`
- [ ] Service method exists in `services/{domain}/`
- [ ] DTO and Zod schema defined in `services/{domain}/dto.ts`
- [ ] React Query key defined in `services/{domain}/keys.ts`

After creating:

- [ ] Types regenerated: `npm run openapi:types`
- [ ] OpenAPI synced: `npm run openapi:sync`
- [ ] Route handler implements correct HTTP methods
- [ ] Idempotency key required for write operations
- [ ] Error handling returns proper status codes
- [ ] Tests cover happy path and error cases
