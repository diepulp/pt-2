# Zod Validation Schemas (ADR-013)

> **Source**: `docs/80-adrs/ADR-013-zod-validation-schemas.md`
> **Status**: Accepted (2025-12-03)

## Overview

Services that expose HTTP Route Handlers MUST have a `schemas.ts` file containing Zod validation schemas for request bodies and query parameters.

## When to Create schemas.ts

**REQUIRED when:**
- Service exposes HTTP Route Handlers under `/api/v1/**`
- Request body validation is needed
- Complex validation rules appear (cross-field, role constraints, regex patterns)
- Query parameter coercion is needed (`limit`, `cursor`, dates, booleans)

**NOT REQUIRED when:**
- Service is internal-only (no HTTP boundary)
- Service is consumed only via Server Actions with direct TypeScript types

## Purpose Separation

| File | Purpose | Layer |
|------|---------|-------|
| `dtos.ts` | Static type contracts from `Database` types | Service layer (compile-time) |
| `schemas.ts` | Runtime validation for inbound API input | Transport layer (runtime) |

**Key Rule**: Schemas MUST NOT be imported in the service layer. Services operate on DTOs and domain types only.

## File Structure

```typescript
// services/{domain}/schemas.ts

/**
 * {Domain}Service Zod Validation Schemas
 *
 * Request body and query parameter validation for API routes.
 * Used by Route Handlers / Server Actions for runtime validation.
 *
 * @see PRD-XXX
 */

import { z } from "zod";

// === CRUD Schemas ===

export const createXSchema = z.object({
  field: z.string().min(1, "Required").max(255),
  optional_field: z.string().nullable().optional(),
});

export const updateXSchema = createXSchema.partial();

// === Query Parameter Schemas ===

export const xListQuerySchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// === Route Parameter Schemas ===

export const xRouteParamsSchema = z.object({
  xId: z.string().uuid("Invalid ID format"),
});

// === Type Exports ===

export type CreateXInput = z.infer<typeof createXSchema>;
export type UpdateXInput = z.infer<typeof updateXSchema>;
export type XListQuery = z.infer<typeof xListQuerySchema>;
```

## Naming Conventions

| Schema Type | Naming Pattern | Type Export |
|-------------|----------------|-------------|
| Create | `createXSchema` | `CreateXInput` |
| Update | `updateXSchema` | `UpdateXInput` |
| List query | `xListQuerySchema` | `XListQuery` |
| Route params | `xRouteParamsSchema` | `XRouteParams` |

**Important**: Use `Input`/`Query` suffix, NOT `DTO`.

## Route Handler Usage

```typescript
// app/api/v1/{domain}/route.ts

import { NextRequest } from "next/server";
import { createXSchema } from "@/services/{domain}/schemas";
import type { CreateXInput } from "@/services/{domain}/schemas";
import { errorResponse } from "@/lib/http/error-response";

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Validate with Zod schema
  const parsed = createXSchema.safeParse(body);
  if (!parsed.success) {
    // Map to standardized VALIDATION_ERROR envelope
    return errorResponse({
      code: "VALIDATION_ERROR",
      status: 400,
      details: parsed.error.flatten(),
    });
  }

  const input: CreateXInput = parsed.data;
  // ... service call with validated input
}
```

## Anti-Patterns

| Anti-Pattern | Correct Pattern |
|--------------|-----------------|
| Inline Zod schemas in route handlers | Extract to `schemas.ts` |
| `schemas.ts` importing from `dtos.ts` | Keep schemas independent |
| Using schemas in service layer | Services use DTOs only |
| Using `DTO` suffix for schema types | Use `Input`/`Query` suffix |
| Missing type exports for schemas | Export `z.infer<>` types |

## Validation Scope

Schemas MAY express **cheap, synchronous business preconditions**:
- Staff role constraints
- Cross-field checks
- Format validation (regex patterns)

Schemas MUST NOT be the sole enforcement point for:
- Domain invariants (enforce in service layer)
- Database constraints (RLS/constraints remain source of truth)

## Reference Implementations

- `services/casino/schemas.ts` (138 lines, 7 schemas, tested)
- `services/player/schemas.ts` (82 lines, 6 schemas)
- `services/visit/schemas.ts` (71 lines, 6 schemas)

## Related Documents

- ADR-013: `docs/80-adrs/ADR-013-zod-validation-schemas.md`
- DTO Standard: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- EDGE Transport Policy: `docs/20-architecture/EDGE_TRANSPORT_POLICY.md`
