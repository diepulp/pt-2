# API Validation Checklist (PT-2)

Comprehensive checklist for validating API implementations against SDLC taxonomy and governance standards.

---

## 1. Pre-Implementation Validation

### Documentation Alignment

- [ ] **API Surface Entry** - Route documented in `docs/25-api-data/API_SURFACE_MVP.md`
- [ ] **OpenAPI Spec** - Route defined in `docs/25-api-data/api-surface.openapi.yaml`
- [ ] **SRM Ownership** - Endpoint belongs to correct bounded context per SRM
- [ ] **ADR Reference** - Any architectural decisions recorded in `docs/80-adrs/`
- [ ] **Surface Classification (ADR-041)** - If route serves a UI surface, the owning EXEC-SPEC declares its Data Aggregation pattern from the Proven Pattern Palette (BFF Summary Endpoint, BFF RPC Aggregation, Simple Query/View, Client-side Fetch). Routes acting as BFF Summary Endpoints must be classified explicitly.

### Service Layer Prerequisites

- [ ] **Service Exists** - Owning service in `services/{domain}/` implements required method
- [ ] **DTO Defined** - Request/response DTOs in `services/{domain}/dtos.ts`
- [ ] **Zod Schema** - Validation schema matches DTO interface
- [ ] **Keys Defined** - React Query keys in `services/{domain}/keys.ts`

---

## 2. Route Handler Structure

### File Location

```
✅ CORRECT:
app/api/v1/{domain}/route.ts                    # Collection: POST, GET
app/api/v1/{domain}/[id]/route.ts              # Resource: GET, PATCH, DELETE
app/api/v1/{domain}/{action}/route.ts          # Action: POST

❌ INCORRECT:
app/api/{domain}/route.ts                       # Missing v1 version
pages/api/{domain}.ts                           # Pages router (deprecated)
app/{domain}/api/route.ts                       # Wrong nesting
```

### Required Imports

```typescript
// MUST include these imports
import type { NextRequest } from 'next/server';
import {
  createRequestContext,
  errorResponse,
  requireIdempotencyKey,  // For POST/PATCH/DELETE
  successResponse
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
```

### Export Configuration

```typescript
// Required for dynamic routes
export const dynamic = 'force-dynamic';

// Optional: edge runtime (if needed)
// export const runtime = 'edge';
```

---

## 3. Request Handling

### Idempotency Key (Writes Only)

- [ ] POST/PATCH/DELETE require `Idempotency-Key` header
- [ ] Uses `requireIdempotencyKey(request)` helper
- [ ] Key passed to `withServerAction` context

### Input Validation

- [ ] JSON body parsed with `readJsonBody(request)` helper
- [ ] Zod schema validates input before service call
- [ ] Validation errors return 400 with `VALIDATION_ERROR` code
- [ ] Search params parsed for GET requests

### Path Parameters (Next.js 15)

```typescript
// CORRECT: Await params Promise
export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ id: string }> }
) {
  const params = await segmentData.params;
  const { id } = params;
  // ...
}

// INCORRECT: Direct access (breaks in Next.js 15)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params; // ❌ Runtime error
}
```

---

## 4. Response Contract

### Success Response

- [ ] Uses `successResponse(ctx, data, code, status?)`
- [ ] Returns `ServiceHttpResult<T>` envelope
- [ ] HTTP 200 for GET, 201 for POST create, 200 for PATCH/DELETE
- [ ] Includes `requestId`, `durationMs`, `timestamp`

### Error Response

- [ ] Uses `errorResponse(ctx, error)`
- [ ] Maps database errors to domain codes
- [ ] Returns appropriate HTTP status
- [ ] Never exposes raw database errors

### Response Shape Validation

```typescript
// Expected envelope structure
{
  ok: boolean,         // ✅ Required
  code: string,        // ✅ Required: 'OK', 'NOT_FOUND', etc.
  status: number,      // ✅ Required: HTTP status
  requestId: string,   // ✅ Required: Trace ID
  durationMs: number,  // ✅ Required: Processing time
  timestamp: string,   // ✅ Required: ISO 8601
  data?: T,            // Success payload
  error?: string,      // Error message
  details?: unknown    // Error context
}
```

---

## 5. Error Handling

### Error Code Mapping

| Scenario | Code | HTTP |
|----------|------|------|
| Resource not found | `NOT_FOUND` | 404 |
| Validation failed | `VALIDATION_ERROR` | 400 |
| Duplicate resource | `UNIQUE_VIOLATION` | 409 |
| FK constraint | `FOREIGN_KEY_VIOLATION` | 400 |
| Not authenticated | `UNAUTHORIZED` | 401 |
| Not authorized | `FORBIDDEN` | 403 |
| Server error | `INTERNAL_ERROR` | 500 |

### Error Response Examples

```typescript
// 400 - Validation Error
{
  ok: false,
  code: "VALIDATION_ERROR",
  status: 400,
  error: "Invalid request body",
  details: { issues: [{ path: ["casino_id"], message: "Required" }] }
}

// 404 - Not Found
{
  ok: false,
  code: "NOT_FOUND",
  status: 404,
  error: "Player not found"
}

// 409 - Conflict
{
  ok: false,
  code: "UNIQUE_VIOLATION",
  status: 409,
  error: "A record with this information already exists"
}
```

---

## 6. Service Integration

### withServerAction Usage

- [ ] All service calls wrapped with `withServerAction`
- [ ] First arg is `supabase` client, second arg is handler receiving `mwCtx`, third arg is options
- [ ] Options include: `domain`, `action`, `correlationId`
- [ ] Write operations include `requireIdempotency: true` and `idempotencyKey`

```typescript
const result = await withServerAction(
  supabase,                  // ✅ Required: Supabase client
  async (mwCtx) => {         // ✅ Required: handler receives MiddlewareContext
    const service = createPlayerService(mwCtx.supabase);
    return service.create(input);
  },
  {
    domain: 'player',          // ✅ Required: bounded context
    action: 'create',          // ✅ Required: operation name
    correlationId: ctx.requestId, // ✅ Required: trace ID
    requireIdempotency: true,  // For writes
    idempotencyKey,            // For writes
  },
);
```

### Result Handling

```typescript
// Check result.ok before accessing data
if (!result.ok) {
  return errorResponse(ctx, result);
}
return successResponse(ctx, result.data, result.code);
```

---

## 7. DTO Compliance

### Pattern Selection

| Service Type | DTO Pattern | Example |
|--------------|-------------|---------|
| Complex business logic | Pattern A (manual interfaces) | Loyalty, Finance |
| Simple CRUD | Pattern B (Pick/Omit) | Player, Visit |

### Pattern A Validation

- [ ] Interfaces defined explicitly (not derived)
- [ ] Mapper functions for DB ↔ DTO conversion
- [ ] Zod schemas match interfaces exactly
- [ ] Domain contracts decoupled from schema

### Pattern B Validation

- [ ] DTOs use `Pick<Database['public']['Tables'][T]['Row'], ...>`
- [ ] Create DTOs use `Insert` not `Row`
- [ ] NO manual interfaces (use type aliases)
- [ ] Zod schemas mirror picked fields

---

## 8. OpenAPI Alignment

### Pre-Commit Checks

```bash
# Regenerate types from OpenAPI
npm run openapi:types

# Sync spec to public folder
npm run openapi:sync

# Validate spec (requires Java)
npm run openapi:validate

# Type check implementation
npm run type-check
```

### Spec Consistency

- [ ] Path matches route file location
- [ ] HTTP methods match handlers
- [ ] Request body schema matches Zod schema
- [ ] Response schema matches DTO
- [ ] Error responses documented

---

## 9. Testing Requirements

### Testing Governance (ADR-044)

Route handler tests are governed by the **Testing Governance Standard** (`docs/70-governance/TESTING_GOVERNANCE_STANDARD.md`):

- **§3.4 Route-Handler Layer**: Canonical layer — verify HTTP boundary (status codes, body shape, error paths). Required environment: `node`.
- **§9 Shallow Test Policy**: Net-new mock-everything/existence-only route tests are **prohibited**. New tests must assert on response status, body shape, and error paths with minimal mocking.
- **§4 Environment Contract**: Route handler tests must run under `node`, not `jsdom`. Use `/** @jest-environment node */` docblock or split Jest config.

### Unit Tests

- [ ] Service method tested in isolation
- [ ] Zod schema validation tested
- [ ] Error mapping tested

### Route Handler Tests (§9 Compliant)

- [ ] Route handler returns correct status codes
- [ ] Idempotency key enforced
- [ ] Auth required/rejected appropriately
- [ ] Response matches contract
- [ ] Uses real or minimally-mocked request objects (not mock-everything)
- [ ] Asserts on observable HTTP behavior (status, body, errors)
- [ ] Runs under `node` environment (not `jsdom`)

### Test File Location

```
services/{domain}/{feature}.test.ts    # Service tests (SERVER-UNIT layer)
app/api/v1/{domain}/__tests__/         # Route handler tests (ROUTE-HANDLER layer)
```

---

## 10. Documentation Updates

### Required Updates

- [ ] `docs/25-api-data/API_SURFACE_MVP.md` - Route documented
- [ ] `docs/25-api-data/api-surface.openapi.yaml` - Spec updated
- [ ] `services/{domain}/README.md` - Service docs updated
- [ ] ADR created if significant architectural decision

### API Catalogue Entry Template

```markdown
### {METHOD} /api/v1/{domain}/{path}
- **Request**: {RequestDTO}
- **Response**: {ResponseDTO}
- **Notes**: {Operational notes}
- **Idempotency**: {Required/Not required}
- **Auth**: {Required roles}
```

---

## 11. Anti-Pattern Detection

### ❌ Patterns to Flag

```typescript
// Ad-hoc response envelope
return Response.json({ success: true, data }); // ❌

// Missing idempotency
export async function POST(request: NextRequest) {
  // No idempotency key check for write // ❌
}

// Direct database access in handler
const { data } = await supabase.from('table').select(); // ❌

// Unvalidated input
const body = await request.json();
service.create(body); // ❌ No Zod validation

// Missing error handling
return successResponse(ctx, result.data); // ❌ No result.ok check

// Wrong params access (Next.js 15)
{ params }: { params: { id: string } } // ❌ Should be Promise
```

---

## Quick Validation Command

Run this checklist against an endpoint:

```bash
# Validate route handler structure
.claude/skills/api-builder/scripts/validate_route.py app/api/v1/{domain}/route.ts

# Check OpenAPI alignment
.claude/skills/api-builder/scripts/check_openapi_alignment.py {domain}

# Verify DTO patterns
.claude/skills/api-builder/scripts/validate_dto_patterns.py services/{domain}/dtos.ts
```

---

## Summary Checklist

### Before Coding
- [ ] Route in API Surface doc
- [ ] OpenAPI spec updated
- [ ] Service method exists
- [ ] DTOs and schemas defined

### During Coding
- [ ] Correct file location
- [ ] Required imports present
- [ ] `withServerAction` wraps service calls
- [ ] Idempotency enforced (writes)
- [ ] Zod validation on input
- [ ] Next.js 15 params handling

### After Coding
- [ ] Types regenerated
- [ ] Type check passes
- [ ] Tests written (under `node` env, no mock-everything — ADR-044)
- [ ] Response contract validated
- [ ] Documentation updated
- [ ] Surface classification declared if route serves a UI surface (ADR-041)
