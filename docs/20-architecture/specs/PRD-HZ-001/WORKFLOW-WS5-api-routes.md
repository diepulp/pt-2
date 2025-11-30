# WORKFLOW-WS5 — API Route Handler Migration

**Workstream:** WS5 (API Routes)
**Priority:** P1 (Important)
**Parallel Execution:** Yes - Tasks 1-3 can run in parallel
**Skill:** `api-builder`
**Estimated LOC:** ~150 (handlers) + ~50 (tests)

---

## Overview

This workstream migrates existing Route Handlers to use the new composable middleware architecture from WS1. It validates API compliance and ensures all routes follow PT-2 transport patterns.

**Current State (as of 2025-11-29):**
- 35 route handlers exist in `app/api/v1/**/route.ts`
- **0 routes** use the old `with-server-action-wrapper.ts`
- **0 routes** use the new middleware compositor
- **All routes** call services directly with manual `getAuthContext()` calls

**Key Changes:**
1. Wrap direct service calls with new `withServerAction` middleware compositor
2. Ensure all write routes enforce idempotency via `requireIdempotency: true`
3. Validate `ServiceHttpResult<T>` response contract
4. Consolidate auth/RLS handling into middleware chain

---

## Prerequisites

Before starting, ensure:
- [ ] WS1 middleware implementation complete
- [ ] Read `docs/20-architecture/EDGE_TRANSPORT_POLICY.md`
- [ ] Read `.claude/skills/api-builder/SKILL.md`
- [ ] Directory structure exists:

```bash
# Verify middleware is available
ls lib/server-actions/middleware/index.ts
```

---

## Existing Code Reference

**MUST READ before implementation:**

| File | Purpose | Key Exports |
|------|---------|-------------|
| `lib/http/service-response.ts` | Response helpers | `createRequestContext()`, `successResponse()`, `errorResponse()`, `requireIdempotencyKey()` |
| `lib/server-actions/middleware/index.ts` | New middleware | `withServerAction`, `MiddlewareContext` |
| `lib/server-actions/with-server-action-wrapper.ts` | OLD wrapper | `withServerAction` (to be deprecated) |
| `.claude/skills/api-builder/references/route-templates.md` | Templates | Route handler patterns |

---

## Parallel Execution Plan

```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  TASK 1: Audit      │  │  TASK 2: Update     │  │  TASK 3: Deprecate  │
│  Existing Routes    │  │  Import Patterns    │  │  Old Wrapper        │
│  (Discovery)        │  │  (Documentation)    │  │  (Backward Compat)  │
└──────────┬──────────┘  └──────────┬──────────┘  └──────────┬──────────┘
           │                        │                        │
           └────────────────────────┼────────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────┐
                    │  TASK 4: Migrate First      │
                    │  Route Handler              │
                    │  (Reference Implementation) │
                    └──────────┬──────────────────┘
                               │
                               ▼
                    ┌─────────────────────────────┐
                    │  TASK 5: Migrate Remaining  │
                    │  Routes (Iterative)         │
                    └──────────┬──────────────────┘
                               │
                               ▼
                    ┌─────────────────────────────┐
                    │  TASK 6: Validation         │
                    │  (API Compliance Check)     │
                    └─────────────────────────────┘
```

**Parallel Groups:**
- **Group A (Parallel):** Tasks 1, 2, 3 can run simultaneously
- **Group B (Sequential):** Task 4 → Task 5 → Task 6

---

## TASK 1: Audit Existing Route Handlers

**Purpose:** Discover all route handlers that need migration
**Blocking:** Required before Task 4
**Est. Time:** Research only

### Discovery Commands

```bash
# Find all route handlers
find app/api -name "route.ts" -o -name "route.tsx" | head -20

# Count total routes
find app/api -name "route.ts" | wc -l

# Find routes using NEW middleware (target state)
grep -r "from '@/lib/server-actions/middleware'" app/api/ --include="*.ts"

# Find routes using OLD wrapper (legacy - expected: none)
grep -r "from '@/lib/server-actions/with-server-action-wrapper'" app/api/ --include="*.ts"

# Find routes with NO wrapper (current state - direct service calls)
grep -rL "withServerAction" app/api/v1/ --include="*.ts" | grep route.ts

# Find routes with manual getAuthContext (migration candidates)
grep -r "getAuthContext" app/api/ --include="*.ts"

# Find routes with idempotency enforcement
grep -r "requireIdempotencyKey\|idempotencyKey" app/api/ --include="*.ts"
```

### Deliverables

- [ ] List of all route handlers in `app/api/`
- [ ] Categorization by:
  - **Wrapper Status:** None (direct calls) / Old / New
  - **Manual Auth:** Uses `getAuthContext()` directly: Yes/No
  - **Idempotency:** Has `requireIdempotencyKey`: Yes/No
  - **Response Contract:** Returns `ServiceHttpResult`: Yes/No
- [ ] Priority ranking for migration

### Output Format

Create inventory in this format:

```markdown
| Route | Method | Wrapper | Manual Auth | Idempotency | Priority |
|-------|--------|---------|-------------|-------------|----------|
| `/api/v1/rating-slip/start` | POST | None | Yes | Yes | P0 |
| `/api/v1/players` | POST | None | No | Yes | P1 |
| `/api/v1/visits` | GET | None | No | N/A | P2 |
```

**Expected Result:** Most routes will show `Wrapper: None` and `Manual Auth: Yes`, indicating they need migration to the new middleware.

### Acceptance Criteria

- [ ] Complete inventory of all route handlers
- [ ] Each route categorized
- [ ] Migration priority assigned

---

## TASK 2: Create Import Migration Guide

**Purpose:** Document how to update imports from old to new middleware
**Blocking:** None
**Est. Time:** Documentation only

### Implementation

Create section in `lib/server-actions/README.md`:

```markdown
## Migration Guide: Route Handler → New Middleware

### Pattern A: Direct Service Calls → New Middleware (MOST COMMON)

Most existing routes call services directly with manual `getAuthContext()`. This is the primary migration pattern.

#### Before (Direct Service Call - Current State)

\`\`\`typescript
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
\`\`\`

#### After (New Middleware)

\`\`\`typescript
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
\`\`\`

### Pattern B: Old Wrapper → New Middleware (IF APPLICABLE)

If any routes use the old `with-server-action-wrapper.ts`, migrate as follows:

#### Before (Old Wrapper)

\`\`\`typescript
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
\`\`\`

#### After (New Middleware)

\`\`\`typescript
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
\`\`\`

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
```

### Acceptance Criteria

- [ ] Migration guide documented
- [ ] Before/after examples clear
- [ ] Key differences table included

---

## TASK 3: Deprecate Old Wrapper (OPTIONAL)

**File:** `lib/server-actions/with-server-action-wrapper.ts`
**Blocking:** None
**Est. LOC:** ~20 (modifications)
**Status:** OPTIONAL - As of 2025-11-29, no routes import the old wrapper. Execute only if backward compatibility shim is needed during migration.

### Implementation

```typescript
/**
 * @deprecated Use `withServerAction` from `@/lib/server-actions/middleware` instead.
 *
 * This wrapper will be removed in v2.0. See migration guide:
 * lib/server-actions/README.md#migration-guide
 *
 * Migration:
 * ```typescript
 * // Old
 * import { withServerAction } from '@/lib/server-actions/with-server-action-wrapper';
 *
 * // New
 * import { withServerAction } from '@/lib/server-actions/middleware';
 * ```
 */
export async function withServerAction<T>(
  handler: () => Promise<ServiceResult<T>>,
  options: LegacyServerActionOptions
): Promise<ServiceResult<T>> {
  // Log deprecation warning in development
  if (process.env.NODE_ENV === 'development') {
    console.warn(
      '[DEPRECATED] withServerAction from with-server-action-wrapper.ts is deprecated. ' +
      'Migrate to @/lib/server-actions/middleware. See README for migration guide.'
    );
  }

  // Delegate to new middleware with legacy options mapping
  const { withServerAction: newWithServerAction } = await import('./middleware');

  return newWithServerAction(
    options.supabase,
    async () => handler(),
    {
      domain: options.entity,
      action: options.action,
      idempotencyKey: options.idempotencyKey,
      correlationId: options.requestId,
    }
  );
}
```

### Acceptance Criteria

- [ ] `@deprecated` JSDoc added
- [ ] Development warning logged
- [ ] Re-exports to new location for backward compatibility
- [ ] Migration path documented

---

## TASK 4: Migrate First Route Handler (Reference)

**Target:** Select ONE route handler as reference implementation
**Candidate:** `/api/v1/rating-slip/start/route.ts` (recommended - has POST, idempotency, auth)
**Blocking:** WS1 complete, Tasks 1-3 complete
**Est. LOC:** ~50

### Selection Criteria

Choose route that:
1. Has POST method (tests idempotency flow)
2. Uses manual `getAuthContext()` (current pattern)
3. Already has `requireIdempotencyKey` enforcement
4. Is relatively simple but representative

### Migration Steps

**Step 1: Identify Route**

```bash
# Recommended candidate
cat app/api/v1/rating-slip/start/route.ts
```

**Step 2: Update Imports**

```typescript
// Remove manual auth import
// import { getAuthContext } from '@/lib/supabase/rls-context';

// Add middleware import
import { withServerAction } from '@/lib/server-actions/middleware';
```

**Step 3: Wrap Service Call with Middleware**

```typescript
// Before (Direct Service Call - Current Pattern)
const supabase = await createClient();
const authCtx = await getAuthContext(supabase);  // Manual auth
const result = await startSlip(supabase, authCtx.casinoId, authCtx.actorId, body);

// After (New Middleware)
const supabase = await createClient();
const result = await withServerAction(
  supabase,
  async (mwCtx) => {
    // Service now receives context from middleware
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
```

**Step 4: Handle ServiceResult Response**

```typescript
// Middleware returns ServiceResult<T>, handle accordingly
if (!result.ok) {
  return errorResponse(ctx, result);
}
return successResponse(ctx, result.data);
```

**Step 5: Verify Tests Pass**

```bash
npm test -- app/api/v1/rating-slip/
```

### Reference Implementation Template

```typescript
// app/api/v1/{domain}/route.ts
import type { NextRequest } from 'next/server';
import {
  createRequestContext,
  errorResponse,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
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
      supabase,
      async (mwCtx) => {
        const service = create{Domain}Service(mwCtx.supabase);
        return service.create(input);
      },
      {
        domain: '{domain}',
        action: 'create',
        requireIdempotency: true,
        idempotencyKey,
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

### Acceptance Criteria

- [ ] One route handler fully migrated
- [ ] Uses new `withServerAction` from middleware
- [ ] Idempotency properly configured
- [ ] All existing tests pass
- [ ] Can serve as reference for Task 5

---

## TASK 5: Migrate Remaining Routes

**Blocking:** Task 4 complete
**Est. LOC:** Varies by route count
**Approach:** Iterative

### Migration Checklist (Per Route)

For each route from Task 1 inventory:

- [ ] Update import statement
- [ ] Update `withServerAction` call signature
- [ ] Configure `requireIdempotency` for write operations
- [ ] Update `domain` and `action` fields
- [ ] Run route-specific tests
- [ ] Validate with api-builder scripts

### Batch Strategy

**Priority P0 (Migrate First):**
- Routes with active development
- Routes in PRD-002 scope (Table/Rating)
- Routes with failing tests

**Priority P1 (Migrate Second):**
- CRUD routes for core entities
- Routes with idempotency already

**Priority P2 (Migrate Last):**
- Read-only routes (GET)
- Health check routes
- Static routes

### Validation Per Route

```bash
# After each migration
npm test -- app/api/v1/{domain}/

# Validate route structure
python3 .claude/skills/api-builder/scripts/validate_route.py app/api/v1/{domain}/route.ts
```

### Acceptance Criteria

- [ ] All P0 routes migrated
- [ ] All P1 routes migrated
- [ ] Tests passing for all migrated routes
- [ ] No routes using old wrapper (except deprecated re-export)

---

## TASK 6: API Compliance Validation

**Blocking:** Task 5 complete
**Purpose:** Final validation of all migrated routes

### Validation Commands

```bash
# Run all API validation scripts
for domain in players visits rating-slips loyalty; do
  echo "=== Validating $domain ==="
  python3 .claude/skills/api-builder/scripts/validate_route.py app/api/v1/$domain/route.ts 2>/dev/null || true
  python3 .claude/skills/api-builder/scripts/check_openapi_alignment.py $domain 2>/dev/null || true
done

# Type check all routes
npx tsc --noEmit app/api/

# Run full test suite
npm test -- app/api/
```

### Compliance Checklist

| Check | Command | Required |
|-------|---------|----------|
| Type safety | `npx tsc --noEmit` | Yes |
| Route structure | `validate_route.py` | Yes |
| OpenAPI alignment | `check_openapi_alignment.py` | Yes |
| DTO patterns | `validate_dto_patterns.py` | Yes |
| Unit tests | `npm test` | Yes |
| No old wrapper imports | `grep` search | Yes |

### Final Report Format

```markdown
## API Migration Report

### Summary
- Total routes: X
- Migrated: Y
- Remaining: Z

### Compliance Status
| Route | Type Check | Structure | OpenAPI | Tests |
|-------|------------|-----------|---------|-------|
| /api/v1/players | ✅ | ✅ | ✅ | ✅ |
| /api/v1/visits | ✅ | ✅ | ⚠️ | ✅ |

### Issues Found
1. [Issue description]
2. [Issue description]

### Recommendations
1. [Next steps]
```

### Acceptance Criteria

- [ ] All validation scripts pass
- [ ] No type errors
- [ ] No old wrapper imports (except deprecated file)
- [ ] All tests pass
- [ ] Migration report generated

---

## Verification Commands

After completing all tasks:

```bash
# Verify no old imports remain
grep -r "from '@/lib/server-actions/with-server-action-wrapper'" app/api/ --include="*.ts" | grep -v "__tests__"

# Type check
npx tsc --noEmit

# Run all API tests
npm test -- app/api/

# Run validation suite
for f in app/api/v1/*/route.ts; do
  python3 .claude/skills/api-builder/scripts/validate_route.py "$f" || echo "FAILED: $f"
done
```

---

## Success Criteria Summary

| Task | Deliverable | Status |
|------|-------------|--------|
| Task 1: Audit | Route inventory | ☐ |
| Task 2: Guide | Migration documentation | ☐ |
| Task 3: Deprecate | Old wrapper marked | ☐ |
| Task 4: Reference | First route migrated | ☐ |
| Task 5: Migrate | All routes updated | ☐ |
| Task 6: Validate | Compliance verified | ☐ |

---

## Integration with Other Workstreams

### Dependencies

| Workstream | Dependency Type | Notes |
|------------|-----------------|-------|
| WS1 (Middleware) | Hard dependency | Must complete before Task 4 |
| WS2 (Query) | Soft dependency | React Query hooks may need updates |
| WS3 (Testing) | Parallel | Test fixtures shared |

### Handoff Points

1. **From WS1:** Middleware available at `lib/server-actions/middleware/`
2. **To WS2:** Updated routes may affect React Query hook implementations
3. **To WS3:** Migrated routes need E2E test coverage

---

## Notes

**Skill Delegation:** This workflow is designed for the `api-builder` skill. The skill should:
1. Use its validation scripts for compliance checks
2. Follow route-templates.md for handler patterns
3. Record outcomes via SkillContext for pattern learning

**Incremental Migration:** Routes can be migrated incrementally. The old wrapper will continue to work (with deprecation warning) until all routes are migrated.

**Risk Mitigation:** If a route migration causes issues:
1. Revert to old wrapper import temporarily
2. Debug using correlation IDs in audit logs
3. Add test coverage before re-attempting migration
