# ISSUE-17F32B7C Investigation Report: Error Masking in errorResponse()

**Date**: 2025-12-20
**Status**: Investigation Complete
**Severity**: Medium
**Impact**: System-wide error handling compliance

---

## Executive Summary

The `errorResponse()` function in `lib/http/service-response.ts` has been **partially fixed** but the system-wide error handling architecture is **compliant with ERROR_TAXONOMY_AND_RESILIENCE.md**. The current implementation correctly:

1. ✅ Maps DomainError to proper HTTP responses with business error codes
2. ✅ Preserves error context (code, message, details)
3. ✅ Prevents Postgres errors from leaking (handled by withServerAction middleware)
4. ❌ **MISSING**: Does not include `retryable` field in error response envelope
5. ❌ **GAP**: ServiceResult interface doesn't include `retryable` field

---

## Current State Analysis

### 1. Error Response Implementation (lib/http/service-response.ts)

**Lines 118-182**: The `errorResponse()` function correctly handles:

```typescript
export function errorResponse(
  ctx: RequestContext,
  error: unknown,
  fallbackMessage = "Unexpected error",
) {
  // ✅ GOOD: Handles ServiceResult pass-through (from withServerAction)
  if (typeof error === "object" && error !== null && "ok" in error && "code" in error) {
    const serviceResult = error as ServiceHttpResult<never>;
    const status = "status" in serviceResult ? serviceResult.status : toHttpStatus(serviceResult.code);
    return NextResponse.json(serviceResult, { status });
  }

  // ✅ GOOD: Preserves DomainError properties
  if (error instanceof DomainError) {
    const result = baseResult<never>(ctx, {
      ok: false,
      code: error.code,
      status: error.httpStatus,
      error: error.message,
      details: error.details,
      // ❌ MISSING: retryable field not included!
    });
    return NextResponse.json(result, { status: result.status });
  }

  // ✅ GOOD: Maps RouteError to proper response
  if (error instanceof RouteError) { ... }

  // ✅ GOOD: Maps ZodError to VALIDATION_ERROR
  if (error instanceof ZodError) { ... }

  // ✅ FALLBACK: Generic errors become INTERNAL_ERROR
  const result = baseResult<never>(ctx, {
    ok: false,
    code: "INTERNAL_ERROR",
    status: 500,
    error: error instanceof Error ? error.message : fallbackMessage,
    // ❌ MISSING: retryable field not included!
  });
  return NextResponse.json(result, { status: result.status });
}
```

**Problem**: DomainError has `retryable` property but errorResponse() doesn't include it in the response envelope.

### 2. ServiceResult Interface (lib/http/service-response.ts)

**Lines 22-31**: Missing `retryable` field

```typescript
export interface ServiceResult<T> {
  ok: boolean;
  code: ResultCode | string;
  data?: T;
  error?: string;
  details?: unknown;
  requestId: string;
  durationMs: number;
  timestamp: string;
  // ❌ MISSING: retryable field
}
```

### 3. Error Flow Architecture (Compliant per ADR-012)

```
┌─────────────────────────────────────────────────────────────┐
│ CLIENT (React)                                              │
│ Expects: ServiceResult<T> with retryable flag              │
│ - { ok: false, code: 'VISIT_CONCURRENT_MODIFICATION',      │
│     error: '...', retryable: true }  ← MISSING FIELD        │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ TRANSPORT LAYER (API Routes)                               │
│ /app/api/v1/*/route.ts                                     │
│                                                            │
│ try {                                                      │
│   const result = await withServerAction(...);             │
│   if (!result.ok) return errorResponse(ctx, result);      │
│ } catch (error) {                                          │
│   return errorResponse(ctx, error);  ← Loses retryable!   │
│ }                                                          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ MIDDLEWARE LAYER (withServerAction)                        │
│ lib/server-actions/with-server-action-wrapper.ts           │
│                                                            │
│ catch (error) {                                            │
│   const mapped = mapDatabaseError(error); ← Has retryable │
│   return {                                                 │
│     ok: false,                                             │
│     code: mapped.code,                                     │
│     error: mapped.message,                                 │
│     details: mapped.details,                               │
│     // ❌ MISSING: retryable not copied to ServiceResult   │
│   };                                                       │
│ }                                                          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ ERROR MAPPER (mapDatabaseError)                            │
│ lib/server-actions/error-map.ts                            │
│                                                            │
│ Returns MappedError:                                       │
│ {                                                          │
│   code: DomainErrorCode,                                   │
│   message: string,                                         │
│   httpStatus: number,                                      │
│   retryable: boolean,  ← ✅ Field exists here!            │
│   details?: unknown                                        │
│ }                                                          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ SERVICE LAYER (services/*)                                 │
│ Throws: DomainError { code, message, httpStatus,          │
│                       retryable, details }  ✅             │
└─────────────────────────────────────────────────────────────┘
```

**Key Finding**: The `retryable` field exists in:
- ✅ DomainError class (line 287 of domain-errors.ts)
- ✅ MappedError interface (line 35 of error-map.ts)
- ❌ NOT in ServiceResult interface
- ❌ NOT copied in withServerAction error handling (line 128-137 of with-server-action-wrapper.ts)
- ❌ NOT included in errorResponse() DomainError handling (line 141-149 of service-response.ts)

---

## Files Affected

### Core Error Infrastructure
1. `/home/diepulp/projects/pt-2/lib/http/service-response.ts`
   - Lines 22-31: ServiceResult interface missing `retryable` field
   - Lines 141-149: errorResponse() not including `retryable` for DomainError
   - Lines 175-181: errorResponse() not including `retryable` for generic errors

2. `/home/diepulp/projects/pt-2/lib/server-actions/with-server-action-wrapper.ts`
   - Lines 128-137: ServiceResult construction missing `retryable` from MappedError

3. `/home/diepulp/projects/pt-2/lib/errors/domain-errors.ts`
   - ✅ CORRECT: Already has `retryable` property (line 287)

4. `/home/diepulp/projects/pt-2/lib/server-actions/error-map.ts`
   - ✅ CORRECT: MappedError interface has `retryable` (line 35)

### API Routes (54 files affected)
All route handlers use errorResponse() and would benefit from retryable flag:
- `/home/diepulp/projects/pt-2/app/api/v1/**/*.ts` (54 route files)

### Server Actions (5 files)
- `/home/diepulp/projects/pt-2/app/actions/table-context/*.ts` (5 action files)
- `/home/diepulp/projects/pt-2/app/actions/player.ts`

---

## Proposed Error Envelope Schema

Per ERROR_TAXONOMY_AND_RESILIENCE.md, the correct error envelope should be:

```typescript
export interface ServiceResult<T> {
  ok: boolean;
  code: ResultCode | string; // DomainErrorCode (superset of ResultCode)
  data?: T;
  error?: string;
  details?: unknown;
  requestId: string;
  durationMs: number;
  timestamp: string;
  retryable?: boolean; // ← ADD THIS FIELD
}

export interface ServiceHttpResult<T> extends ServiceResult<T> {
  status: number;
}
```

**Error Response Examples:**

```typescript
// 1. Retryable concurrent modification error
{
  ok: false,
  code: "VISIT_CONCURRENT_MODIFICATION",
  error: "Visit was modified by another process",
  status: 409,
  retryable: true, // ← Client can retry
  requestId: "uuid-...",
  durationMs: 45,
  timestamp: "2025-12-20T10:30:00Z"
}

// 2. Non-retryable validation error
{
  ok: false,
  code: "VALIDATION_ERROR",
  error: "Invalid player ID format",
  status: 400,
  retryable: false, // ← Client should NOT retry
  details: { field: "playerId", value: "invalid" },
  requestId: "uuid-...",
  durationMs: 12,
  timestamp: "2025-12-20T10:30:00Z"
}

// 3. Retryable internal error
{
  ok: false,
  code: "INTERNAL_ERROR",
  error: "Database connection timeout",
  status: 500,
  retryable: true, // ← Client can retry after backoff
  requestId: "uuid-...",
  durationMs: 5000,
  timestamp: "2025-12-20T10:30:00Z"
}
```

---

## Step-by-Step Remediation Plan

### Priority 1: Core Infrastructure (Breaking Change)

**Task 1.1**: Update ServiceResult interface
- **File**: `/home/diepulp/projects/pt-2/lib/http/service-response.ts`
- **Change**: Add `retryable?: boolean` field to ServiceResult interface (line 22-31)
- **Impact**: Type-safe propagation of retry hints to clients

**Task 1.2**: Update errorResponse() for DomainError
- **File**: `/home/diepulp/projects/pt-2/lib/http/service-response.ts`
- **Change**: Include `retryable: error.retryable` in baseResult call (line 141-149)
- **Impact**: Preserves DomainError retry hints

**Task 1.3**: Update errorResponse() for generic errors
- **File**: `/home/diepulp/projects/pt-2/lib/http/service-response.ts`
- **Change**: Add `retryable: false` for non-DomainError errors (line 175-181)
- **Rationale**: Unknown errors default to non-retryable (safe default)

**Task 1.4**: Update withServerAction error handling
- **File**: `/home/diepulp/projects/pt-2/lib/server-actions/with-server-action-wrapper.ts`
- **Change**: Copy `retryable` from MappedError to ServiceResult (line 128-137)
- **Impact**: Middleware layer preserves retry hints

### Priority 2: Client-Side Error Handling

**Task 2.1**: Update React Query error handlers
- **Files**: `/home/diepulp/projects/pt-2/hooks/**/*.ts`
- **Change**: Check `error.retryable` flag before retry logic
- **Impact**: Prevents unnecessary retries of validation errors

**Task 2.2**: Update mutation hooks
- **Pattern**: 
  ```typescript
  useMutation({
    mutationFn: createPlayerAction,
    retry: (failureCount, error) => {
      // ✅ NEW: Respect retryable flag
      if (error?.retryable === false) return false;
      return failureCount < 3;
    }
  });
  ```

### Priority 3: Testing & Validation

**Task 3.1**: Add integration tests
- **File**: `/home/diepulp/projects/pt-2/lib/http/__tests__/service-response.test.ts`
- **Cases**:
  - DomainError with retryable=true → response includes retryable: true
  - DomainError with retryable=false → response includes retryable: false
  - Generic Error → response includes retryable: false
  - ZodError → response includes retryable: false

**Task 3.2**: Update API contract tests
- **Files**: `/home/diepulp/projects/pt-2/app/api/v1/**/__tests__/*.test.ts`
- **Verify**: Error responses include `retryable` field

**Task 3.3**: Type check system
- **Command**: `npx tsc --noEmit`
- **Goal**: No type errors after ServiceResult interface change

### Priority 4: Documentation Updates

**Task 4.1**: Update ERROR_TAXONOMY_AND_RESILIENCE.md
- **File**: `/home/diepulp/projects/pt-2/docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md`
- **Change**: Add `retryable` field to error envelope examples (line 497-533)

**Task 4.2**: Update ADR-012
- **File**: `/home/diepulp/projects/pt-2/docs/80-adrs/ADR-012-error-handling-layers.md`
- **Change**: Include `retryable` in ServiceResult examples (line 107, 120)

**Task 4.3**: Update API documentation
- **Files**: `/home/diepulp/projects/pt-2/docs/25-api-data/*.md`
- **Change**: Document `retryable` field in error response schema

---

## Compliance Matrix

| Requirement | Current State | Remediation |
|-------------|---------------|-------------|
| Domain errors with business context | ✅ COMPLIANT | None |
| Proper HTTP status mapping | ✅ COMPLIANT | None |
| DomainError class usage | ✅ COMPLIANT | None |
| Error envelope with code/message | ✅ COMPLIANT | None |
| Error envelope with httpStatus | ✅ COMPLIANT | None |
| **Error envelope with retryable** | ❌ **MISSING** | **Add retryable field** |
| Error envelope with requestId | ✅ COMPLIANT | None |
| Error envelope with timestamp | ✅ COMPLIANT | None |
| Postgres error code masking | ✅ COMPLIANT | None |

---

## Risk Assessment

### Breaking Changes
- **ServiceResult interface change**: Low risk
  - Optional field (`retryable?`) maintains backward compatibility
  - Existing clients ignore unknown fields
  
### Migration Path
1. Add `retryable?` to ServiceResult (optional field)
2. Update errorResponse() to populate field
3. Update withServerAction to propagate field
4. Update client-side hooks to use field (opt-in)
5. Monitor logs for retry behavior improvements

### Rollback Plan
- Revert changes to lib/http/service-response.ts
- Revert changes to lib/server-actions/with-server-action-wrapper.ts
- Client-side hooks gracefully handle missing field (optional chaining)

---

## Implementation Effort Estimate

| Task | Effort | Files Changed | Lines Changed |
|------|--------|---------------|---------------|
| Priority 1: Core Infrastructure | 2 hours | 2 files | ~20 lines |
| Priority 2: Client-Side Handlers | 1 hour | ~10 files | ~30 lines |
| Priority 3: Testing & Validation | 2 hours | ~5 test files | ~100 lines |
| Priority 4: Documentation | 1 hour | 3 docs | ~30 lines |
| **Total** | **6 hours** | **~20 files** | **~180 lines** |

---

## Next Steps

1. **Review & Approval**: Stakeholder sign-off on remediation plan
2. **Implementation**: Execute Priority 1 tasks (core infrastructure)
3. **Testing**: Execute Priority 3 tasks (validate changes)
4. **Deployment**: Merge behind feature flag (if desired)
5. **Documentation**: Execute Priority 4 tasks (update docs)
6. **Monitoring**: Track retry behavior metrics post-deployment

---

## References

- ERROR_TAXONOMY_AND_RESILIENCE.md: `/home/diepulp/projects/pt-2/docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md`
- ADR-012: `/home/diepulp/projects/pt-2/docs/80-adrs/ADR-012-error-handling-layers.md`
- DomainError: `/home/diepulp/projects/pt-2/lib/errors/domain-errors.ts`
- ServiceResult: `/home/diepulp/projects/pt-2/lib/http/service-response.ts`
- Error Mapper: `/home/diepulp/projects/pt-2/lib/server-actions/error-map.ts`

---

**Investigation Complete**: 2025-12-20
**Investigator**: Backend Developer Agent
**Recommended Action**: Proceed with Priority 1 remediation tasks

