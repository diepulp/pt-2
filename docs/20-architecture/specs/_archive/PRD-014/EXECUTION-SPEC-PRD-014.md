---
prd: PRD-014
title: Idempotency Header Standardization
service: HTTP Infrastructure
phase: Remediation
priority: Critical
created: 2025-12-21
workstreams:
  WS1:
    name: Create Header Constants
    agent: backend-sevice-builder
    depends_on: []
    outputs: [lib/http/headers.ts]
    gate: type-check
  WS2:
    name: Fix fetch-json.ts
    agent: backend-sevice-builder
    depends_on: [WS1]
    outputs: [lib/http/fetch-json.ts]
    gate: type-check
  WS3:
    name: Update service-response.ts
    agent: backend-sevice-builder
    depends_on: [WS1]
    outputs: [lib/http/service-response.ts]
    gate: type-check
  WS4:
    name: Update rating-slip-modal/http.ts
    agent: backend-sevice-builder
    depends_on: [WS1]
    outputs: [services/rating-slip-modal/http.ts]
    gate: type-check
  WS5:
    name: Fix Test Expectations
    agent: backend-sevice-builder
    depends_on: [WS2]
    outputs: [lib/http/__tests__/fetch-json.test.ts]
    gate: test-pass
  WS6:
    name: Document Anti-Pattern
    agent: backend-sevice-builder
    depends_on: []
    outputs: [docs/70-governance/anti-patterns/09-http-headers.md]
    gate: none
execution_phases:
  - name: Phase 1 - Foundation
    parallel: [WS1, WS6]
    gate: type-check
  - name: Phase 2 - Apply Fixes
    parallel: [WS2, WS3, WS4]
    gate: type-check
  - name: Phase 3 - Tests
    parallel: [WS5]
    gate: test-pass
---

# EXECUTION-SPEC: PRD-014 Idempotency Header Standardization

## Summary

**Critical Bug Fix**: The `mutateJSON()` helper sends `"x-idempotency-key"` but server expects `"Idempotency-Key"`. This breaks all loyalty service mutations.

**Blast Radius**: All code using `mutateJSON()` helper, including loyalty service operations.

## Workstream Details

### WS1: Create Header Constants

**File**: `lib/http/headers.ts` (CREATE)

```typescript
/**
 * HTTP Header Constants
 *
 * Centralized header names to prevent drift.
 * @see IETF draft-ietf-httpapi-idempotency-key-header
 * @see docs/25-api-data/api-surface.openapi.yaml
 */

/**
 * Idempotency-Key header per IETF standard.
 * HTTP headers are case-insensitive - use canonical title case.
 */
export const IDEMPOTENCY_HEADER = "Idempotency-Key" as const;

/** Request correlation ID header */
export const REQUEST_ID_HEADER = "x-request-id" as const;
```

### WS2: Fix fetch-json.ts

**File**: `lib/http/fetch-json.ts`

**Changes**:
1. Add import: `import { IDEMPOTENCY_HEADER } from "./headers";`
2. Line 127: Change `"x-idempotency-key": idempotencyKey` to `[IDEMPOTENCY_HEADER]: idempotencyKey`

### WS3: Update service-response.ts

**File**: `lib/http/service-response.ts`

**Changes**:
1. Remove line 51: `export const IDEMPOTENCY_HEADER = "idempotency-key";`
2. Add import and re-export:
   ```typescript
   import { IDEMPOTENCY_HEADER } from "./headers";
   export { IDEMPOTENCY_HEADER };
   ```

### WS4: Update rating-slip-modal/http.ts

**File**: `services/rating-slip-modal/http.ts`

**Changes**:
1. Add import: `import { IDEMPOTENCY_HEADER } from "@/lib/http/headers";`
2. Line 90: Change `"Idempotency-Key": idempotencyKey` to `[IDEMPOTENCY_HEADER]: idempotencyKey`

### WS5: Fix Test Expectations

**File**: `lib/http/__tests__/fetch-json.test.ts`

**Changes**:
1. Line 87: Change `'x-idempotency-key': 'idem-key-123'` to `'Idempotency-Key': 'idem-key-123'`

### WS6: Document Anti-Pattern

**File**: `docs/70-governance/anti-patterns/09-http-headers.md` (CREATE)

Document ANT-HTTP-001: Hardcoded HTTP Header Names anti-pattern.

## Validation Gates

| Phase | Gate | Command |
|-------|------|---------|
| Phase 1 | type-check | `npm run type-check` |
| Phase 2 | type-check | `npm run type-check` |
| Phase 3 | test-pass | `npm test lib/http/__tests__/fetch-json.test.ts` |
| Final | build | `npm run build` |

## Definition of Done

- [ ] `lib/http/headers.ts` created with exported constants
- [ ] `mutateJSON()` sends `Idempotency-Key` header (not `x-idempotency-key`)
- [ ] `service-response.ts` imports from `headers.ts`
- [ ] `rating-slip-modal/http.ts` uses constant
- [ ] Test updated to expect correct header
- [ ] Anti-pattern documented
- [ ] All validation gates pass

## References

- [PRD-014](../../../10-prd/PRD-014-idempotency-header-standardization.md)
- [ADR-021](../../../80-adrs/ADR-021-idempotency-header-standardization.md)
- [IETF Idempotency-Key Header Draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)
