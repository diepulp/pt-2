# ADR-021: Idempotency Header Standardization

**Status:** Accepted
**Date:** 2025-12-21
**Deciders:** Lead Architect
**Related Issues:** ISSUE-45C3C18B, ISSUE-B164C009

## Context

During investigation of ISSUE-B164C009 (TableContextService idempotency header mismatch), a global audit revealed systemic inconsistencies in idempotency header handling across the codebase:

1. **Critical Bug:** `lib/http/fetch-json.ts:127` uses `"x-idempotency-key"` - a completely different header name that causes server rejection
2. **Style Drift:** Various files use different casings (`idempotency-key`, `Idempotency-Key`)
3. **No Centralization:** Each service manually defines header strings, leading to typos and drift

### Impact Assessment

| Severity | Scope |
|----------|-------|
| Critical | All code using `mutateJSON()` helper is broken |
| High | All loyalty service mutations fail (accrueOnClose, redeem, manualCredit, applyPromotion) |

### Standards Research

The [IETF draft-ietf-httpapi-idempotency-key-header](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) (Standards Track, v07, October 2025) defines:

> **Header Field Name:** `Idempotency-Key`
>
> "Idempotency-Key is an Item Structured Header. Its value MUST be a String."

HTTP headers are case-insensitive per RFC 7230, so `Idempotency-Key` and `idempotency-key` are equivalent at the protocol level. However, `x-idempotency-key` is a **different header name entirely**.

## Decision

### 1. Canonical Header Name

Adopt `Idempotency-Key` (title case) as the canonical header name to align with:
- IETF standard (draft-ietf-httpapi-idempotency-key-header)
- OpenAPI spec (`docs/25-api-data/api-surface.openapi.yaml:953-958`)

### 2. Centralized Header Constants

Create `lib/http/headers.ts` with exported constants:

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

### 3. Import Pattern

All HTTP fetchers MUST import from centralized location:

```typescript
// ✅ Correct
import { IDEMPOTENCY_HEADER } from "@/lib/http/headers";
headers: { [IDEMPOTENCY_HEADER]: idempotencyKey }

// ❌ Wrong - string literal
headers: { "idempotency-key": idempotencyKey }

// ❌ Wrong - different header name
headers: { "x-idempotency-key": idempotencyKey }
```

## Consequences

### Positive

1. **Immediate bug fix:** `mutateJSON()` will work correctly
2. **Single source of truth:** Header name defined once, imported everywhere
3. **Standards alignment:** Matches IETF standard and OpenAPI spec
4. **Compile-time safety:** TypeScript catches typos in import names
5. **Documentation clarity:** Clear reference point for header conventions

### Negative

1. **Migration effort:** Existing services need updates to import constant
2. **No runtime enforcement:** ESLint rule needed for full enforcement

### Neutral

1. **No breaking change:** HTTP headers are case-insensitive, so changing from `idempotency-key` to `Idempotency-Key` is transparent

## Compliance

### Server-Side Validation

The existing `requireIdempotencyKey()` function in `lib/http/service-response.ts` handles case variations:

```typescript
const key =
  request.headers.get(IDEMPOTENCY_HEADER) ??
  request.headers.get(IDEMPOTENCY_HEADER.toUpperCase());
```

This will be updated to import from `lib/http/headers.ts`.

### Anti-Pattern

Add to governance documentation:

```markdown
## ANT-HTTP-001: Hardcoded HTTP Header Names

**Pattern:** Using string literals for standard HTTP headers
**Problem:** Leads to typos, inconsistent casing, and drift
**Solution:** Import from `lib/http/headers.ts`
```

## Implementation

See PRD-014 for detailed implementation workstreams.

## References

- [IETF draft-ietf-httpapi-idempotency-key-header](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)
- [RFC 7230 - HTTP/1.1 Message Syntax and Routing](https://tools.ietf.org/html/rfc7230)
- `docs/25-api-data/api-surface.openapi.yaml`
- `docs/20-architecture/specs/PRD-004/IDEMPOTENCY-DRIFT-CONTRACT.md`
