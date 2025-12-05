# ADR-013: Zod Validation Schemas Standard

**Status:** Accepted  
**Date:** 2025-12-03  
**Author:** Lead Architect  
**Deciders:** Architecture Team  
**Context:** Casino, Player, and Visit services introduced ad-hoc `schemas.ts` files  
**Supersedes:** N/A

---

## Context

Three services (Casino, Player, Visit) have independently introduced `schemas.ts` files containing Zod validation schemas for API request bodies and query parameters. This pattern emerged organically during PRD-000 and PRD-003 implementation but was not formalized in SLAD or other governance documents.

**Current State:**
- `services/casino/schemas.ts` (138 lines, 7 schemas, tested)
- `services/player/schemas.ts` (82 lines, 6 schemas)
- `services/visit/schemas.ts` (71 lines, 6 schemas)

**Observed Usage:**
- Route Handlers import schemas for request validation
- Schemas use `.refine()` for complex business rules (e.g., staff role constraints)
- Query param coercion via `z.coerce.number()` for pagination
- Types exported via `z.infer<typeof ...>` for route handler type safety

**Gap Identified:**
- `schemas.ts` is NOT listed in SLAD §308-348 (service directory structure)
- EDGE_TRANSPORT_POLICY.md §5 references "DTO + zod schema module" but doesn't define location
- DTO_CANONICAL_STANDARD.md doesn't address runtime validation

---

## Decision

**Standardize `schemas.ts` as the canonical location for Zod validation schemas in any service that exposes HTTP Route Handlers.**

- For **services that expose HTTP Route Handlers**, `schemas.ts` is **REQUIRED**.  
- For **internal-only services** (no HTTP boundary), `schemas.ts` is **omitted**.

### Core Principles

1. **Purpose Separation**
   - `dtos.ts` – Static type contracts derived from `Database` types (compile-time)
   - `schemas.ts` – Runtime validation schemas for inbound API input (transport layer)

2. **Naming Convention**
   - Schema names: `createXSchema`, `updateXSchema`, `xListQuerySchema`, `xRouteParamsSchema`
   - Type exports: `CreateXInput`, `UpdateXInput`, `XListQuery` (use `Input`/`Query` suffix, **NOT** `DTO`)
   - For each exported Zod schema there SHOULD be a matching `type` alias using `z.infer<>` with the same base name + `Input`/`Query` suffix.

3. **Scope Boundaries & Validation Responsibilities**
   - Schemas validate **inbound** API requests at Route Handler (or Server Action) level.
   - DTOs shape **outbound** service responses and internal contracts.
   - Schemas MUST NOT be imported or used in the service layer; services operate on DTOs and domain types only.
   - Schemas MAY express **cheap, synchronous business preconditions** (e.g., staff role constraints, obvious cross-field checks), but:
     - Canonical **domain invariants** MUST still be enforced in the service/domain layer.
     - Database constraints and RLS remain the ultimate source of truth for data integrity.
   - Schemas MUST NOT be treated as the sole enforcement point for critical business invariants.

4. **When to Create `schemas.ts`**
   - Service exposes HTTP Route Handlers under `/api/v1/**` or equivalent.
   - Request body validation is needed.
   - Complex validation rules appear (cross-field, role constraints, regex patterns).
   - Query parameter coercion is needed (`limit`, `cursor`, dates, booleans, etc.).

---

## Updated Service Directory Structure (SLAD Amendment)

```txt
services/{domain}/
├── dtos.ts                    # DTO contracts (REQUIRED)
├── schemas.ts                 # ✅ Zod validation schemas (REQUIRED for HTTP boundary services)
│   └── Request body + query param validation
│   └── Type exports: CreateXInput, XListQuery, etc.
│   └── Used by Route Handlers / Server Actions only
├── mappers.ts                 # Contract-first services only
├── selects.ts                 # Named column sets
├── keys.ts                    # React Query key factories
├── http.ts                    # HTTP fetchers
├── index.ts                   # Factory + explicit interface
├── crud.ts                    # CRUD operations
├── business.ts                # Business logic (if needed)
└── queries.ts                 # Complex queries (if needed)
```

---

## Schema File Structure

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

**Guideline:** For each exported Zod schema, provide a corresponding `type` alias via `z.infer` with a clear `Input`/`Query` suffix to keep the mapping obvious.

---

## Route Handler Usage Pattern

```typescript
// app/api/v1/{domain}/route.ts

import { NextRequest } from "next/server";
import {
  createXSchema,
  xListQuerySchema,
} from "@/services/{domain}/schemas";
import type {
  CreateXInput,
  XListQuery,
} from "@/services/{domain}/schemas";
import { errorResponse } from "@/lib/http/error-response"; // shared helper

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Validate with Zod schema
  const parsed = createXSchema.safeParse(body);
  if (!parsed.success) {
    // All Zod failures MUST map to the standardized VALIDATION_ERROR
    // envelope per EDGE_TRANSPORT_POLICY.md
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

### Error Envelope Standardization

- All Zod validation failures MUST be mapped to the standardized
  `VALIDATION_ERROR` envelope defined in `EDGE_TRANSPORT_POLICY.md`.
- `details` SHOULD contain the `ZodError.flatten()` output so the UI and
  observability tooling can consume a consistent structure.

---

## Consequences

### Positive

1. **Runtime Safety** – Catches malformed requests at the edge, before the service layer.
2. **Clear Error Messages** – Zod provides structured, field-level validation errors.
3. **Complex Validation** – Supports `.refine()` for business preconditions (e.g., staff role constraints, cross-field checks).
4. **Type Inference** – `z.infer<>` provides TypeScript types automatically for inputs and queries.
5. **Coercion** – Handles URL query param type conversion (`z.coerce`) in a centralized place.
6. **Testable** – Schemas can be unit tested independently (`schemas.test.ts`), including complex refinement logic and coercion behavior.
7. **Consistent Error Envelope** – Validation failures are consistently expressed via the `VALIDATION_ERROR` envelope, aligning with EDGE transport policy.

### Negative

1. **Two Type Sources** – Types from `schemas.ts` and `dtos.ts` could diverge.
   - **Mitigations:**
     - Clear naming (`Input`/`Query` vs `DTO` suffixes).
     - Strict scope boundaries (schemas used only at transport layer; DTOs used in services).
     - Optional compile-time compatibility checks for critical flows, e.g.:
       ```ts
       // Example: ensure CreatePlayerInput is assignable to CreatePlayerDTO
       type _CreatePlayerInputCompatible =
         CreatePlayerInput extends CreatePlayerDTO ? true : never;
       ```
2. **Additional File** – More files per service.
   - **Mitigation:** Only services with HTTP boundaries require `schemas.ts`; internal-only services remain simpler.
3. **Zod Dependency** – Runtime dependency for validation.
   - **Mitigation:** Zod is already in use for other validation (floor-layout, API routes), and the dependency is scoped to transport concerns.

### Neutral

1. **Learning Curve** – Developers must understand the schema vs DTO distinction and where each is used.
2. **Migration** – Existing services may need `schemas.ts` added retroactively and their inline Zod definitions migrated out of `route.ts` files.
3. **Shared Helpers (Future)** – Pagination/query helpers MAY be extracted into shared modules (e.g., `services/_shared/schemas/pagination.ts`) if repeated patterns emerge, but this is optional and governed by KISS/YAGNI.

---

## Relationship to Existing Standards

| Document                        | Relationship                                                                                   |
|--------------------------------|------------------------------------------------------------------------------------------------|
| DTO_CANONICAL_STANDARD.md      | Schemas complement DTOs; DTOs are derived from `Database` types and used in services.         |
| SLAD §308-348                  | Amended to include `schemas.ts` as **required** for services with HTTP boundaries.            |
| EDGE_TRANSPORT_POLICY.md §5    | Clarifies "zod schema module" location and standardizes `VALIDATION_ERROR` envelope usage.    |
| SERVICE_RESPONSIBILITY_MATRIX  | Schemas are owned by the same bounded context/service that owns the DTOs and HTTP routes.     |

---

## Implementation Checklist

- [x] CasinoService `schemas.ts` implemented and tested.
- [x] PlayerService `schemas.ts` implemented.
- [x] VisitService `schemas.ts` implemented.
- [ ] Update SLAD §308-348 to:
  - [ ] Mark `schemas.ts` as **required** for services with HTTP Route Handlers.
  - [ ] Clarify that internal-only services omit `schemas.ts`.
- [ ] Update service quick reference checklist to include:
  - [ ] `schemas.ts` present for HTTP boundary services.
  - [ ] Zod failures mapped to `VALIDATION_ERROR` envelope.
  - [ ] Non-trivial refinements and query coercions covered by `schemas.test.ts`.
- [ ] Add ESLint rule (or local lint rule) enforcing:
  - [ ] `schemas.ts` MUST NOT import from `dtos.ts`.
  - [ ] `route.ts` SHOULD import from `schemas.ts`, not define ad-hoc Zod schemas.
- [ ] (Optional) Add compile-time compatibility checks for core flows (e.g., `CreateXInput` assignable to `CreateXDTO`).
- [ ] Future services:
  - [ ] Include `schemas.ts` whenever HTTP Route Handlers are introduced.
  - [ ] Keep schemas focused on transport concerns + cheap preconditions; enforce invariants in services/domain.

---

## Alternatives Considered

### Alternative 1: Inline Zod in Route Handlers

```typescript
// Validate inline in route handler
const schema = z.object({ name: z.string() });
```

**Rejected because:**
- No reuse across routes (create/update share fields but must be duplicated).
- No centralized testing strategy.
- Harder to maintain and discover, particularly as the number of routes grows.
- Encourages mixing validation logic with routing and orchestration concerns.

### Alternative 2: Zod Schemas Inside `dtos.ts`

```typescript
// Combine DTOs and schemas in one file
export const createXSchema = z.object({ /* ... */ });
export type CreateXDTO = z.infer<typeof createXSchema>;
```

**Rejected because:**
- Violates DTO_CANONICAL_STANDARD (DTOs must derive from `Database` types, not Zod).
- Mixes compile-time DTO contracts with runtime validation concerns.
- Pattern B services (that do not use Zod) cannot reuse this approach cleanly.
- Increases the risk of using Zod schemas as domain models.

### Alternative 3: No Standardization

Continue with ad-hoc approach.

**Rejected because:**
- Inconsistent patterns across services.
- No clear guidance for new services or contributors.
- Documentation gap between EDGE_TRANSPORT_POLICY intent and actual code structure.
- Harder to enforce consistent error envelopes and validation behavior.

---

## References

- `services/casino/schemas.ts` – Reference implementation.
- `services/casino/schemas.test.ts` – Test patterns for schemas.
- `EDGE_TRANSPORT_POLICY.md` §5 – DTO & schema requirements and error envelope.
- `DTO_CANONICAL_STANDARD.md` – DTO patterns (complementary standard).
- `SLAD` §308-348 – Service directory structure (to be amended).

---

## Decision Record

**Decision:** STANDARDIZE the `schemas.ts` pattern as the canonical service file for Zod validation schemas for HTTP boundary services.

**Rationale:**
1. Pattern is proven across 3 services with consistent structure.
2. Solves real problem (runtime validation and coercion at the transport layer).
3. Complements existing DTO standard without overlap or confusion of responsibilities.
4. Tested and documented (`schemas.test.ts` exists).
5. Aligns with EDGE_TRANSPORT_POLICY.md §5 intent and error envelope requirements.
6. Keeps domain invariants and DTO contracts anchored in the schema-first `Database` types and service layer logic.

**Approved by:** Architecture Team  
**Effective Date:** 2025-12-03
