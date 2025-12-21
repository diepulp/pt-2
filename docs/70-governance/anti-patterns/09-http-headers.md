# ANT-HTTP-001: Hardcoded HTTP Header Names

## Category
HTTP Infrastructure

## Pattern
Using string literals for standard HTTP headers instead of centralized constants.

## Problem

- Typos go unnoticed until runtime (e.g., `"x-idempotency-key"` vs `"Idempotency-Key"`)
- Inconsistent casing across codebase
- Drift from IETF standards
- Silent failures when client and server use different header names

## Real Example (PRD-014)

```typescript
// BUG: Client sends "x-idempotency-key"
headers: { "x-idempotency-key": key }

// Server expects "Idempotency-Key" per IETF standard
request.headers.get("idempotency-key") // Returns null!
```

**Result**: All mutations using `mutateJSON()` failed with "Missing Idempotency-Key header".

## Solution

Import from `lib/http/headers.ts`:

```typescript
// Wrong - string literal prone to typos
headers: { "x-idempotency-key": key }
headers: { "idempotency-key": key }
headers: { "Idempotency-key": key }  // Case variation

// Correct - centralized constant
import { IDEMPOTENCY_HEADER } from "@/lib/http/headers";
headers: { [IDEMPOTENCY_HEADER]: key }
```

## Available Constants

| Constant | Value | Standard |
|----------|-------|----------|
| `IDEMPOTENCY_HEADER` | `"Idempotency-Key"` | IETF draft-ietf-httpapi-idempotency-key-header |
| `REQUEST_ID_HEADER` | `"x-request-id"` | OpenTelemetry convention |

## Detection

Look for string literals in header objects:

```typescript
// Red flags
"idempotency-key"
"x-idempotency-key"
"Idempotency-Key"  // Correct value but still a literal
```

## References

- [ADR-021: Idempotency Header Standardization](../../80-adrs/ADR-021-idempotency-header-standardization.md)
- [PRD-014: Idempotency Header Standardization](../../10-prd/PRD-014-idempotency-header-standardization.md)
- [IETF draft-ietf-httpapi-idempotency-key-header](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)
- [lib/http/headers.ts](../../../lib/http/headers.ts)
