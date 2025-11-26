---
name: api-builder
description: Build PT-2 API endpoints following SDLC taxonomy (API/DATA category), OpenAPI-first contracts, and transport architecture patterns. This skill should be used when creating new API routes, implementing route handlers, or validating API compliance. Produces Route Handlers with ServiceHttpResult contracts, validates OpenAPI alignment, and ensures DTO pattern compliance.
---

# API Builder

## Overview

This skill guides implementation of PT-2 API endpoints following the SDLC documentation taxonomy **API/DATA** category (`docs/25-api-data/`). It provides:

1. **Contract-first API development** (OpenAPI → Types → Implementation)
2. **Route Handler patterns** for React Query integration
3. **DTO compliance validation** (Pattern A vs B rules)
4. **OpenAPI alignment verification**
5. **Response contract enforcement** (`ServiceHttpResult<T>`)

**Use this skill when:**
- Creating a new API route (e.g., "Add endpoint for player search")
- Implementing Route Handlers for React Query mutations
- Converting Server Actions to Route Handlers
- Validating API implementation before merge

**Do NOT use for:**
- Backend service implementation (use `backend-service-builder` skill)
- Frontend development (use `frontend-design` skill)
- Architecture design (use `lead-architect` skill)
- Simple code fixes without API changes

---

## Memory Recording Protocol 🧠

This skill tracks execution outcomes to build API pattern knowledge.

### Memory Activation Model

Memory is **automatically activated** when this skill is invoked via the `Skill` tool.

**How automatic activation works:**
1. `PreToolUse` hook detects `Skill` tool invocation
2. `skill-init-memori.sh` extracts skill name and initializes namespace
3. Memori client is enabled for `skill_api_builder` namespace
4. All subsequent memory operations use the skill namespace

### Skill Execution Tracking

Record complete execution outcomes after API implementation:

```python
from lib.memori import create_memori_client, SkillContext

# Initialize Memori for this skill
memori = create_memori_client("skill:api-builder")
memori.enable()  # REQUIRED: Activates memory recording
context = SkillContext(memori)

# Record skill execution outcome
context.record_skill_execution(
    skill_name="api-builder",
    task="Create player search endpoint",
    outcome="success",  # or "failure", "partial"
    pattern_used="Route Handler with ServiceHttpResult",
    validation_results={
        "openapi_aligned": True,
        "dto_pattern_valid": True,
        "idempotency_enforced": True,
        "response_contract_valid": True
    },
    files_created=[
        "app/api/v1/players/search/route.ts",
        "services/player/dto.ts"
    ],
    issues_encountered=[
        "Initially missing idempotency check (fixed)"
    ],
    lessons_learned=[
        "Search endpoints need pagination support",
        "Query params require Zod coercion for numbers"
    ]
)
```

### Query Past Patterns Before Starting

Before implementing an API, check what patterns worked:

```python
# Search for similar past API implementations
past_apis = memori.search_learnings(
    query="API endpoint implementation",
    tags=["api", "route-handler"],
    category="skills",
    limit=5
)

if past_apis:
    print(f"\n📚 Learning from {len(past_apis)} past implementations:\n")
    for api in past_apis:
        metadata = api.get('metadata', {})
        print(f"  Task: {metadata.get('task', 'N/A')}")
        print(f"  Pattern: {metadata.get('pattern_used', 'N/A')}")
        print(f"  Issues: {metadata.get('issues_encountered', [])}")
```

### Namespace Reference

The skill uses the namespace `skill_api_builder` in the database. This maps from:
- Client initialization: `create_memori_client("skill:api-builder")`
- Database user_id: `skill_api_builder`

---

## SDLC Taxonomy Alignment

This skill operates within the **API/DATA** documentation category:

| Category | Location | Purpose |
|----------|----------|---------|
| API/DATA | `docs/25-api-data/` | OpenAPI, DTOs, contracts, events |

### Key Documents

- **`API_SURFACE_MVP.md`** - Human-readable API catalogue (source of truth)
- **`api-surface.openapi.yaml`** - Machine-readable OpenAPI spec
- **`OPENAPI_QUICKSTART.md`** - Developer workflow guide
- **`REAL_TIME_EVENTS_MAP.md`** - WebSocket event contracts

### ADR References

- **ADR-007** - API Surface Catalogue & OpenAPI Contract
- **ADR-003** - State Management (React Query integration)

---

## How to Use This Skill

### Quick Start Examples

**Example 1: Create new endpoint**
```
User: "Create an API endpoint for player search"

Process:
1. Document in API_SURFACE_MVP.md
2. Update api-surface.openapi.yaml
3. Generate types: npm run openapi:types
4. Create route handler following template
5. Validate compliance
```

**Example 2: Convert Server Action to Route Handler**
```
User: "Convert create-player action to use React Query"

Process:
1. Identify existing Server Action in app/actions/
2. Create Route Handler in app/api/v1/
3. Add Idempotency-Key enforcement
4. Update client to use React Query mutation
5. Validate response contract
```

**Example 3: Validate existing API**
```
User: "Check if player API follows standards"

Process:
1. Run validate_route.py on route handlers
2. Run check_openapi_alignment.py for spec consistency
3. Run validate_dto_patterns.py on DTOs
4. Report findings and suggest fixes
```

---

## API Implementation Workflow

Follow these steps when building new API endpoints.

### Step 1: Document the API

**1a. Update API Surface Catalogue**

Add entry to `docs/25-api-data/API_SURFACE_MVP.md`:

```markdown
### {METHOD} /api/v1/{domain}/{path}
- **Request**: {RequestDTO}
- **Response**: {ResponseDTO}
- **Notes**: {Operational notes}
- **Idempotency**: Required (for writes)
- **Auth**: Required roles
```

**1b. Update OpenAPI Specification**

Add to `docs/25-api-data/api-surface.openapi.yaml`:

```yaml
/api/v1/{domain}/{path}:
  {method}:
    summary: {Description}
    operationId: {operationId}
    tags:
      - {Domain}
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/{RequestDTO}'
    responses:
      '200':
        description: Success
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ServiceHttpResult_{ResponseDTO}'
      '400':
        $ref: '#/components/responses/ValidationError'
      '404':
        $ref: '#/components/responses/NotFound'
```

**1c. Regenerate Types**

```bash
npm run openapi:types
npm run openapi:sync
```

---

### Step 2: Create DTOs and Zod Schemas

**Read**: `references/api-patterns.md` for complete DTO rules

**Pattern Selection**:
- **Pattern A** (manual interfaces) - Complex business logic (Loyalty, Finance)
- **Pattern B** (Pick/Omit) - Simple CRUD (Player, Visit)

**2a. Create DTOs** (`services/{domain}/dto.ts`)

Pattern B Example:
```typescript
import type { Database } from '@/types/database.types';
import { z } from 'zod';

// Response DTO - derived from Row
export type PlayerDTO = Pick<
  Database['public']['Tables']['player']['Row'],
  'id' | 'first_name' | 'last_name' | 'created_at'
>;

// Request DTO - derived from Insert
export type PlayerCreateDTO = Pick<
  Database['public']['Tables']['player']['Insert'],
  'first_name' | 'last_name' | 'birth_date'
>;

// Zod schema for validation
export const PlayerCreateSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  birth_date: z.string().date().optional(),
});
```

**Critical Rules**:
- Pattern B: MUST use `type` with Pick/Omit (NO interfaces)
- Pattern B: Create DTOs use `Insert` not `Row`
- Zod schemas MUST match DTO structure

---

### Step 3: Create Route Handler

**Read**: `references/route-templates.md` for complete templates

**3a. File Location**

```
app/api/v1/{domain}/route.ts          # Collection endpoints
app/api/v1/{domain}/[id]/route.ts     # Resource endpoints
app/api/v1/{domain}/{action}/route.ts # Action endpoints
```

**3b. Standard Handler Template**

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

**3c. Next.js 15 Dynamic Routes**

```typescript
// For [id] params - MUST await Promise
export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ id: string }> }
) {
  const params = await segmentData.params; // Required in Next.js 15
  const { id } = params;
  // ...
}
```

---

### Step 4: Required Headers

**Write Operations (POST/PATCH/DELETE)**:

| Header | Required | Purpose |
|--------|----------|---------|
| `Content-Type` | Yes | `application/json` |
| `Idempotency-Key` | Yes | Dedupe via ledger/constraint |
| `Authorization` | Yes | Bearer token |

**Enforcement**:
```typescript
const idempotencyKey = requireIdempotencyKey(request);
```

---

### Step 5: Response Contract

All endpoints MUST return `ServiceHttpResult<T>`:

```typescript
interface ServiceHttpResult<T> {
  ok: boolean;              // True if succeeded
  code: string;             // 'OK', 'NOT_FOUND', etc.
  status: number;           // HTTP status
  requestId: string;        // Trace ID
  durationMs: number;       // Processing time
  timestamp: string;        // ISO 8601
  data?: T;                 // Success payload
  error?: string;           // Error message
  details?: unknown;        // Error context
}
```

**Use helpers from** `lib/http/service-response.ts`:
- `successResponse(ctx, data, code, status?)`
- `errorResponse(ctx, error)`

---

### Step 6: Create React Query Hook

**Read**: `references/api-patterns.md` § React Query Integration

```typescript
// hooks/use-{domain}.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { {domain}Keys } from '@/services/{domain}/keys';
import type { {Domain}CreateDTO, {Domain}DTO } from '@/services/{domain}/dto';

export function useCreate{Domain}() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {Domain}CreateDTO) => {
      const res = await fetch('/api/v1/{domain}', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Unknown error');
      }
      return json.data as {Domain}DTO;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: {domain}Keys.root });
    },
  });
}
```

---

### Step 7: Validate Implementation

**7a. Route Handler Validation**

```bash
.claude/skills/api-builder/scripts/validate_route.py app/api/v1/{domain}/route.ts
```

Checks:
- File location and naming
- Required imports
- Idempotency enforcement
- withServerAction usage
- Response contract compliance
- Next.js 15 params handling

**7b. OpenAPI Alignment**

```bash
.claude/skills/api-builder/scripts/check_openapi_alignment.py {domain}
```

Checks:
- Routes in spec exist as handlers
- Handler methods match spec
- Undocumented routes flagged

**7c. DTO Pattern Validation**

```bash
.claude/skills/api-builder/scripts/validate_dto_patterns.py services/{domain}/dto.ts
```

Checks:
- Pattern A/B compliance
- Zod schema alignment
- Anti-patterns (any types, ReturnType)

**7d. Type Check**

```bash
npm run type-check
```

---

### Step 8: Testing

**Required Tests**:

```typescript
// app/api/v1/{domain}/__tests__/route.test.ts
import { describe, it, expect } from 'vitest';

describe('{METHOD} /api/v1/{domain}', () => {
  it('returns 201 on successful create', async () => {
    // Test implementation
  });

  it('returns 400 on validation error', async () => {
    // Test validation
  });

  it('requires idempotency key', async () => {
    // Test header enforcement
  });

  it('returns ServiceHttpResult envelope', async () => {
    // Verify response shape
  });
});
```

---

## Transport Architecture Reference

PT-2 uses dual transport:

| Transport | Use Case | Location |
|-----------|----------|----------|
| **Route Handlers** | React Query mutations/queries | `app/api/v1/**` |
| **Server Actions** | Form-based flows | `app/actions/**` |

**Rule**: Route Handlers for React Query, Server Actions for forms.

---

## Error Code Reference

| Code | HTTP | When |
|------|------|------|
| `OK` | 200 | Success |
| `VALIDATION_ERROR` | 400 | Invalid input |
| `FOREIGN_KEY_VIOLATION` | 400 | Invalid reference |
| `NOT_FOUND` | 404 | Resource not found |
| `UNIQUE_VIOLATION` | 409 | Duplicate |
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Not authorized |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Resources

### scripts/

**Validation Scripts**:

- **`validate_route.py`** - Validates route handler structure
  - Required imports and exports
  - Idempotency enforcement
  - Response contract compliance
  - Next.js 15 patterns

- **`check_openapi_alignment.py`** - Verifies spec-handler alignment
  - Routes documented vs implemented
  - Method coverage
  - DTO alignment hints

- **`validate_dto_patterns.py`** - Validates DTO pattern compliance
  - Pattern A/B detection
  - Pick/Omit vs interface rules
  - Zod schema alignment
  - Anti-pattern detection

### references/

- **`api-patterns.md`** - Complete API implementation patterns
  - Transport architecture
  - Response contracts
  - DTO patterns A/B
  - React Query integration
  - Error mapping

- **`route-templates.md`** - Ready-to-use route handler templates
  - Create resource (POST)
  - Get single (GET with ID)
  - Update (PATCH)
  - List with pagination
  - RPC actions
  - Nested resources

- **`validation-checklist.md`** - Comprehensive pre-merge checklist
  - Pre-implementation validation
  - Handler structure
  - Request handling
  - Response contract
  - Error handling
  - Testing requirements

---

## Anti-Patterns

### ❌ DO NOT

- Create ad-hoc response envelopes (use `ServiceHttpResult<T>`)
- Skip idempotency key on write operations
- Use GET for mutations
- Access Supabase directly in handlers (use services)
- Use `any` types or `as any` casts
- Use `ReturnType<typeof ...>` inference
- Skip Zod validation
- Forget to await params Promise (Next.js 15)

### ✅ DO

- Document route in API_SURFACE_MVP.md first
- Update OpenAPI spec before implementing
- Use `withServerAction` for all service calls
- Enforce idempotency on writes
- Return proper HTTP status codes
- Check `result.ok` before returning success
- Test error paths

---

## Final Checklist

Before marking API implementation complete:

- [ ] Route documented in `API_SURFACE_MVP.md`
- [ ] OpenAPI spec updated in `api-surface.openapi.yaml`
- [ ] Types regenerated (`npm run openapi:types`)
- [ ] DTOs follow pattern rules (A or B)
- [ ] Zod schemas match DTOs
- [ ] Route handler uses correct file location
- [ ] Required imports present
- [ ] `withServerAction` wraps service calls
- [ ] Idempotency enforced for writes
- [ ] Response uses `ServiceHttpResult<T>`
- [ ] Error codes mapped correctly
- [ ] React Query hook created
- [ ] Tests written and passing
- [ ] All validation scripts pass

---

## Notes

**Progressive Workflow**: Not all steps apply to every task:
- New endpoint → Full workflow (Steps 1-8)
- Add method to existing route → Steps 1, 3, 6-8
- Fix endpoint compliance → Steps 7-8

**Documentation First**: Always update API_SURFACE_MVP.md and OpenAPI spec before implementing. This ensures contract-first development and prevents drift.

**Validation Focus**: Run validation scripts frequently. Catch compliance issues early.
