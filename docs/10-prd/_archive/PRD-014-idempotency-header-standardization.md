---
id: PRD-014
title: Idempotency Header Standardization
owner: Engineering
status: Proposed
affects: [ADR-021, ARCH-SRM, GOV-ANT]
created: 2025-12-21
last_review: 2025-12-21
phase: Remediation
pattern: N/A
http_boundary: true
related_issues: [ISSUE-45C3C18B, ISSUE-B164C009]
---

# PRD-014 — Idempotency Header Standardization

## 1. Overview

- **Owner:** Engineering
- **Status:** Proposed
- **Phase:** Remediation (Critical Bug Fix)

**Summary:** Fix critical idempotency header bug in `lib/http/fetch-json.ts` where `"x-idempotency-key"` is used instead of the standard `"Idempotency-Key"`. This breaks all code using the `mutateJSON()` helper, causing loyalty service mutations to fail with "Missing Idempotency-Key header" errors. Additionally, introduce centralized header constants in `lib/http/headers.ts` to prevent future drift.

---

## 2. Problem & Goals

### Problem Statement

The `mutateJSON()` helper in `lib/http/fetch-json.ts:127` sends requests with header `"x-idempotency-key"`, but the server-side validation in `requireIdempotencyKey()` expects `"idempotency-key"` or `"IDEMPOTENCY-KEY"`. The `x-` prefix makes it a **completely different header name**, causing all mutations using this helper to fail.

**Blast Radius:**
- All loyalty service mutations: `accrueOnClose`, `redeem`, `manualCredit`, `applyPromotion`
- Any future code using `mutateJSON()` helper

**Root Cause:**
- No centralized header constant for client-side HTTP code
- Manual string literals prone to typos and drift
- No enforcement mechanism

### Goals

| # | Goal | Measurable Outcome |
|---|------|-------------------|
| G1 | Fix critical header bug | `mutateJSON()` requests succeed with correct header |
| G2 | Centralize header constants | Single source of truth in `lib/http/headers.ts` |
| G3 | Align with IETF standard | Header matches `Idempotency-Key` per draft-ietf-httpapi-idempotency-key-header |
| G4 | Prevent future drift | Anti-pattern documented in governance |
| G5 | Resolve tracked issues | ISSUE-45C3C18B marked as resolved |

### Non-Goals

- Updating all service http.ts files to use centralized constant (optional improvement, not required for this PRD)
- Adding ESLint rule enforcement (future enhancement)
- Changing server-side header validation logic

---

## 3. Users & Use Cases

### Primary Users

| User | Role |
|------|------|
| **Frontend Developer** | Calls `mutateJSON()` helper for API mutations |
| **Service Developer** | Creates http.ts fetchers with idempotency headers |
| **Pit Boss** | End user affected by loyalty mutations failing |

### User Jobs

| User | Job |
|------|-----|
| Frontend Developer Skill | J1: Make mutation requests that don't fail with header errors |
| Service Developer Skill| J2: Import header constant instead of guessing string literal |
| Service Developer Skill| J3: Reference anti-pattern docs when adding new headers |
| Pit Boss | J4: Award loyalty points without silent failures |

---

## 4. Scope & Feature List

### In Scope

| # | Feature | Testable Criteria |
|---|---------|-------------------|
| F1 | Fix `fetch-json.ts` header | Header value is `"Idempotency-Key"`, not `"x-idempotency-key"` |
| F2 | Create `lib/http/headers.ts` | File exports `IDEMPOTENCY_HEADER` and `REQUEST_ID_HEADER` constants |
| F3 | Update `service-response.ts` | Imports `IDEMPOTENCY_HEADER` from `headers.ts` |
| F4 | Update `fetch-json.ts` | Imports `IDEMPOTENCY_HEADER` from `headers.ts` |
| F5 | Update `rating-slip-modal/http.ts` | Uses imported constant instead of string literal |
| F6 | Update test file | `fetch-json.test.ts` expects correct header |
| F7 | Document anti-pattern | `ANT-HTTP-001` added to governance docs |

### Out of Scope

- Migrating all other service http.ts files (7 files already correct)
- ESLint rule for header string literals
- Server-side validation changes

---

## 5. Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `mutateJSON()` must send `Idempotency-Key` header | Must |
| FR2 | `IDEMPOTENCY_HEADER` constant must be exported from `lib/http/headers.ts` | Must |
| FR3 | `REQUEST_ID_HEADER` constant must be exported from `lib/http/headers.ts` | Should |
| FR4 | `requireIdempotencyKey()` must import from centralized location | Must |
| FR5 | All modified files must use imported constant, not string literals | Must |

### Non-Functional Requirements

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR1 | No breaking changes to public API | Zero breaking changes |
| NFR2 | All existing tests pass | 100% pass rate |
| NFR3 | TypeScript compilation succeeds | Zero type errors |

---

## 6. UX / Flow Overview

This is an infrastructure fix with no user-facing UI changes.

**Developer Flow:**
1. Developer imports `IDEMPOTENCY_HEADER` from `@/lib/http/headers`
2. Developer uses constant in fetch headers: `{ [IDEMPOTENCY_HEADER]: key }`
3. Request reaches server with correct header name
4. Server validates header successfully

**Error Flow (Current - Broken):**
1. Developer calls `mutateJSON()` with data
2. Helper sends `x-idempotency-key` header
3. Server rejects: "Missing Idempotency-Key header"
4. Mutation fails silently or with error

---

## 7. Dependencies & Risks

### Prerequisites

| Dependency | Status |
|------------|--------|
| ADR-021 approved | Accepted |
| ISSUE-45C3C18B logged | Open |

### Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Case sensitivity issues | Low | Medium | HTTP headers are case-insensitive per RFC 7230 |
| Test failures from header change | Medium | Low | Update test expectations in same PR |
| Missing import in new services | Medium | Medium | Document anti-pattern, consider ESLint rule later |

### Open Questions

None - architecture decision made in ADR-021.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

### Functionality
- [ ] `lib/http/fetch-json.ts:127` uses `Idempotency-Key` (not `x-idempotency-key`)
- [ ] `mutateJSON()` requests succeed with correct header
- [ ] Loyalty service mutations work end-to-end

### Data & Integrity
- [ ] No header-related 400 errors in mutation requests
- [ ] Idempotency protection working correctly

### Testing
- [ ] `lib/http/__tests__/fetch-json.test.ts` updated with correct header
- [ ] All existing tests pass
- [ ] Manual smoke test of loyalty mutation

### Code Quality
- [ ] `lib/http/headers.ts` created with exported constants
- [ ] `lib/http/service-response.ts` imports from `headers.ts`
- [ ] `lib/http/fetch-json.ts` imports from `headers.ts`
- [ ] `services/rating-slip-modal/http.ts` imports from `headers.ts`
- [ ] No string literal headers in modified files

### Documentation
- [ ] Anti-pattern `ANT-HTTP-001` documented in governance
- [ ] ADR-021 referenced in implementation

### Operational Readiness
- [ ] ISSUE-45C3C18B marked as resolved
- [ ] ISSUE-B164C009 updated if needed

---

## 9. Related Documents

| Document | Relationship |
|----------|--------------|
| [ADR-021](../80-adrs/ADR-021-idempotency-header-standardization.md) | Architecture decision |
| [IETF draft-ietf-httpapi-idempotency-key-header](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) | External standard |
| [OpenAPI Spec](../25-api-data/api-surface.openapi.yaml) | Header definition (line 953-958) |
| [IDEMPOTENCY-DRIFT-CONTRACT](../20-architecture/specs/PRD-004/IDEMPOTENCY-DRIFT-CONTRACT.md) | Idempotency patterns |
| [lib/http/service-response.ts](../../lib/http/service-response.ts) | Server-side validation |

---

## Appendix A: Implementation Plan

### WS1: Create Centralized Header Constants

**File:** `lib/http/headers.ts` (CREATE)

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

**File:** `lib/http/fetch-json.ts`

```typescript
// Add import
import { IDEMPOTENCY_HEADER } from "./headers";

// Change line 127 from:
"x-idempotency-key": idempotencyKey,
// To:
[IDEMPOTENCY_HEADER]: idempotencyKey,
```

### WS3: Update service-response.ts

**File:** `lib/http/service-response.ts`

```typescript
// Replace line 51:
export const IDEMPOTENCY_HEADER = "idempotency-key";
// With:
import { IDEMPOTENCY_HEADER } from "./headers";
export { IDEMPOTENCY_HEADER };
```

### WS4: Update rating-slip-modal/http.ts

**File:** `services/rating-slip-modal/http.ts`

```typescript
// Add import
import { IDEMPOTENCY_HEADER } from "@/lib/http/headers";

// Change line 90 from:
"Idempotency-Key": idempotencyKey,
// To:
[IDEMPOTENCY_HEADER]: idempotencyKey,
```

### WS5: Update Test

**File:** `lib/http/__tests__/fetch-json.test.ts`

```typescript
// Change line 87 from:
'x-idempotency-key': 'idem-key-123',
// To:
'Idempotency-Key': 'idem-key-123',
```

### WS6: Document Anti-Pattern

**File:** `docs/70-governance/anti-patterns/07-http-headers.md` (CREATE)

```markdown
# ANT-HTTP-001: Hardcoded HTTP Header Names

## Pattern
Using string literals for standard HTTP headers instead of centralized constants.

## Problem
- Typos go unnoticed until runtime
- Inconsistent casing across codebase
- Drift from standards (e.g., `x-idempotency-key` vs `Idempotency-Key`)

## Solution
Import from `lib/http/headers.ts`:

\`\`\`typescript
// Wrong
headers: { "x-idempotency-key": key }
headers: { "idempotency-key": key }

// Correct
import { IDEMPOTENCY_HEADER } from "@/lib/http/headers";
headers: { [IDEMPOTENCY_HEADER]: key }
\`\`\`

## References
- ADR-021: Idempotency Header Standardization
- IETF draft-ietf-httpapi-idempotency-key-header
```

---

## Appendix B: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-21 | Lead Architect | Initial PRD created from ISSUE-45C3C18B investigation |
