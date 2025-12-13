---
name: api-builder
description: Build PT-2 API endpoints following SDLC taxonomy (API/DATA category), OpenAPI-first contracts, and transport architecture patterns. This skill should be used when creating new API routes, implementing route handlers, or validating API compliance. Produces Route Handlers with ServiceHttpResult contracts, validates OpenAPI alignment, and ensures DTO pattern compliance.
---

# API Builder

## Overview

This skill guides implementation of PT-2 API endpoints following the SDLC documentation taxonomy **API/DATA** category (`docs/25-api-data/`).

**Capabilities:**
- Contract-first API development (OpenAPI → Types → Implementation)
- Route Handler patterns for React Query integration
- DTO compliance validation (Pattern A vs B rules)
- OpenAPI alignment verification
- Response contract enforcement (`ServiceHttpResult<T>`)

**Use this skill when:**
- Creating a new API route (e.g., "Add endpoint for player search")
- Implementing Route Handlers for React Query mutations
- Converting Server Actions to Route Handlers
- Validating API implementation before merge

**Do NOT use for:**
- Backend service implementation → use `backend-service-builder` skill
- Frontend development → use `frontend-design` skill
- Architecture design → use `lead-architect` skill
- RLS policies or database security → use `rls-expert` skill
- Simple code fixes without API changes

---

## Quick Start

**Example 1: Create new endpoint**
```
User: "Create an API endpoint for player search"

→ Document in API_SURFACE_MVP.md
→ Update api-surface.openapi.yaml
→ Generate types: npm run openapi:types
→ Create route handler (see references/route-templates.md)
→ Validate compliance
```

**Example 2: Convert Server Action to Route Handler**
```
User: "Convert create-player action to use React Query"

→ Identify existing Server Action in app/actions/
→ Create Route Handler in app/api/v1/
→ Add Idempotency-Key enforcement
→ Update client to use React Query mutation
→ Validate response contract
```

**Example 3: Validate existing API**
```
User: "Check if player API follows standards"

→ Run validate_route.py on route handlers
→ Run check_openapi_alignment.py for spec consistency
→ Run validate_dto_patterns.py on DTOs
→ Report findings and suggest fixes
```

---

## API Implementation Workflow

### Step 1: Document the API

**1a. Update API Surface Catalogue**

Add entry to `docs/25-api-data/API_SURFACE_MVP.md`:
- Method and path
- Request/Response DTOs
- Idempotency requirements
- Auth requirements

**1b. Update OpenAPI Specification**

Add route to `docs/25-api-data/api-surface.openapi.yaml` with:
- Operation summary and tags
- Request body schema reference
- Response schema (`ServiceHttpResult_{ResponseDTO}`)
- Error responses (400, 404, etc.)

**1c. Regenerate Types**

```bash
npm run openapi:types
npm run openapi:sync
```

---

### Step 2: Create DTOs and Zod Schemas

**Read:** `references/api-patterns.md` § DTO Patterns for complete rules and examples.

**Pattern Selection:**
| Service Type | Pattern | When to Use |
|--------------|---------|-------------|
| Pattern A | Manual interfaces | Complex business logic (Loyalty, Finance) |
| Pattern B | Pick/Omit from Database types | Simple CRUD (Player, Visit) |

**Critical Rules:**
- Pattern B: MUST use `type` with Pick/Omit (NO interfaces)
- Pattern B: Create DTOs derive from `Insert` not `Row`
- Zod schemas MUST mirror DTO structure exactly
- Location: `services/{domain}/dto.ts`

---

### Step 3: Create Route Handler

**Read:** `references/route-templates.md` for ready-to-use templates.

**File Location:**
```
app/api/v1/{domain}/route.ts          # Collection (POST, GET list)
app/api/v1/{domain}/[id]/route.ts     # Resource (GET, PATCH, DELETE)
app/api/v1/{domain}/{action}/route.ts # Action (POST)
```

**Available Templates:**
1. Create Resource (POST)
2. Get Single Resource (GET with ID)
3. Update Resource (PATCH)
4. List with Pagination (GET)
5. RPC-Based Action
6. Search Endpoint
7. Nested Resource

**Required Elements:**
- `export const dynamic = 'force-dynamic'`
- `createRequestContext(request)` for tracing
- `requireIdempotencyKey(request)` for writes
- `withServerAction()` wrapper for all service calls
- Zod validation before service call
- Next.js 15: `await segmentData.params` for dynamic routes

---

### Step 4: Required Headers

**Write Operations (POST/PATCH/DELETE):**

| Header | Required | Purpose |
|--------|----------|---------|
| `Content-Type` | Yes | `application/json` |
| `Idempotency-Key` | Yes | Dedupe via ledger/constraint |
| `Authorization` | Yes | Bearer token |

---

### RLS Awareness (ADR-015 + SEC-006)

**Row-Level Security is automatically enforced** via the middleware chain:

```
withAuth() → withRLS() → withIdempotency() → withAudit() → withTracing()
```

**What `withRLS` does (ADR-015 compliant):**
- Calls `set_rls_context()` RPC (transaction-wrapped, pooling-safe)
- RLS policies use **Pattern C Hybrid**: transaction context + JWT fallback
- All downstream queries are automatically casino-scoped

**Pattern C Resolution (canonical):**
```sql
casino_id = COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
)
```

**SEC-006 Critical Finding: SECURITY DEFINER Bypass**

SECURITY DEFINER RPCs **bypass RLS entirely**. If your API calls an RPC:
- Verify it validates `p_casino_id` against context (SEC-001 Template 5)
- Never trust caller-provided `p_casino_id` without validation
- See ADR-018 for SECURITY DEFINER governance

**SEC-001 Template 5 Pattern (required for all SECURITY DEFINER RPCs):**
```sql
v_context_casino_id uuid := COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
);
IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
  RAISE EXCEPTION 'casino_id context mismatch';
END IF;
```

**API Builder Responsibilities:**
- Ensure DTOs include `casino_id` where required by the schema
- Trust that RLS enforces tenant isolation at the database level
- Do NOT add manual `WHERE casino_id = ...` filters (RLS handles this)
- Never use legacy `SET LOCAL` loops (ADR-015 anti-pattern)
- Verify RPCs your API calls have proper context validation (SEC-006)

**When to use `rls-expert` skill:**
- Creating new database tables that need RLS policies
- Implementing SECURITY DEFINER RPCs (requires Template 5 validation)
- Troubleshooting multi-tenant data access issues
- Auditing policies for ADR-015/SEC-006 compliance

**References:**
- `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`
- `docs/30-security/SEC-006-rls-strategy-audit-2025-12-11.md`
- `docs/80-adrs/ADR-018-security-definer-governance.md`
- `docs/20-architecture/EDGE_TRANSPORT_POLICY.md` § Middleware Chain

---

### Step 5: Response Contract

All endpoints MUST return `ServiceHttpResult<T>`.

**Read:** `references/api-patterns.md` § Response Contract for full interface.

**Key Fields:**
- `ok: boolean` - Success indicator
- `code: string` - Domain code ('OK', 'NOT_FOUND', etc.)
- `status: number` - HTTP status
- `requestId: string` - Trace ID
- `data?: T` - Success payload
- `error?: string` - Error message

**Helpers:** `lib/http/service-response.ts`
- `successResponse(ctx, data, code, status?)`
- `errorResponse(ctx, error)`

---

### Step 6: Create React Query Hook

**Read:** `references/api-patterns.md` § React Query Integration for complete patterns.

**Location:** `hooks/use-{domain}.ts`

**Requirements:**
- Include `Idempotency-Key` header for mutations
- Parse `ServiceHttpResult` envelope
- Invalidate queries on success
- Use key factory from `services/{domain}/keys.ts`

---

### Step 7: Validate Implementation

**7a. Route Handler Validation**
```bash
.claude/skills/api-builder/scripts/validate_route.py app/api/v1/{domain}/route.ts
```
Checks: file location, imports, idempotency, withServerAction, response contract, Next.js 15 params

**7b. OpenAPI Alignment**
```bash
.claude/skills/api-builder/scripts/check_openapi_alignment.py {domain}
```
Checks: routes in spec exist as handlers, method coverage, undocumented routes

**7c. DTO Pattern Validation**
```bash
.claude/skills/api-builder/scripts/validate_dto_patterns.py services/{domain}/dto.ts
```
Checks: Pattern A/B compliance, Zod alignment, anti-patterns

**7d. Type Check**
```bash
npm run type-check
```

---

### Step 8: Testing

**Read:** `references/validation-checklist.md` § Testing Requirements

**Required Test Coverage:**
- Success path (correct status code)
- Validation errors (400)
- Idempotency key enforcement
- Response envelope shape (`ServiceHttpResult`)

**Location:** `app/api/v1/{domain}/__tests__/route.test.ts`

---

## Key References

### SDLC Documents
| Document | Purpose |
|----------|---------|
| `docs/25-api-data/API_SURFACE_MVP.md` | Human-readable API catalogue |
| `docs/25-api-data/api-surface.openapi.yaml` | Machine-readable OpenAPI spec |
| `docs/20-architecture/EDGE_TRANSPORT_POLICY.md` | Transport policy, middleware |
| `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md` | Error mapping, rate limits |

### ADRs
- **ADR-007** - API Surface Catalogue & OpenAPI Contract
- **ADR-003** - State Management (React Query integration)

### Skill Resources
| Resource | Purpose |
|----------|---------|
| `references/api-patterns.md` | Complete API patterns (transport, DTOs, errors, React Query) |
| `references/route-templates.md` | Ready-to-use route handler templates |
| `references/validation-checklist.md` | Comprehensive pre-merge checklist |

---

## Error Codes Quick Reference

**Read:** `references/api-patterns.md` § Error Mapping for complete tables.

| Code | HTTP | When |
|------|------|------|
| `OK` | 200 | Success |
| `VALIDATION_ERROR` | 400 | Invalid input |
| `NOT_FOUND` | 404 | Resource not found |
| `UNIQUE_VIOLATION` | 409 | Duplicate |
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Not authorized |

---

## Anti-Patterns

### Avoid
- Ad-hoc response envelopes (use `ServiceHttpResult<T>`)
- Skipping idempotency key on writes
- GET for mutations
- Direct Supabase access in handlers (use services)
- `any` types or `as any` casts
- `ReturnType<typeof ...>` inference
- Skipping Zod validation
- Forgetting to await params Promise (Next.js 15)

### Required
- Document route in API_SURFACE_MVP.md first
- Update OpenAPI spec before implementing
- Use `withServerAction` for all service calls
- Enforce idempotency on writes
- Return proper HTTP status codes
- Check `result.ok` before returning success

---

## Final Checklist

Before marking API implementation complete:

- [ ] Route documented in `API_SURFACE_MVP.md`
- [ ] OpenAPI spec updated in `api-surface.openapi.yaml`
- [ ] Types regenerated (`npm run openapi:types`)
- [ ] DTOs follow pattern rules (A or B)
- [ ] Zod schemas match DTOs
- [ ] Route handler in correct location
- [ ] Required imports present
- [ ] `withServerAction` wraps service calls
- [ ] Idempotency enforced for writes
- [ ] Response uses `ServiceHttpResult<T>`
- [ ] Error codes mapped correctly
- [ ] React Query hook created
- [ ] Tests written and passing
- [ ] All validation scripts pass

---

## Progressive Workflow

Not all steps apply to every task:

| Task | Steps |
|------|-------|
| New endpoint | 1-8 (full workflow) |
| Add method to existing route | 1, 3, 6-8 |
| Fix endpoint compliance | 7-8 |

**Documentation First:** Always update API_SURFACE_MVP.md and OpenAPI spec before implementing.

---

## Validation Scripts

| Script | Purpose |
|--------|---------|
| `scripts/validate_route.py` | Validates route handler structure |
| `scripts/check_openapi_alignment.py` | Verifies spec-handler alignment |
| `scripts/validate_dto_patterns.py` | Validates DTO pattern compliance |

---

## Memory Recording Protocol

This skill tracks execution outcomes to build API pattern knowledge.

### Memory Activation

Memory is **automatically activated** when this skill is invoked via the `Skill` tool.

**Namespace:** `skill_api_builder`

### Record Execution Outcomes

After API implementation, record outcomes:

```python
from lib.memori import create_memori_client, SkillContext

memori = create_memori_client("skill:api-builder")
memori.enable()
context = SkillContext(memori)

context.record_skill_execution(
    skill_name="api-builder",
    task="Create player search endpoint",
    outcome="success",
    pattern_used="Route Handler with ServiceHttpResult",
    validation_results={
        "openapi_aligned": True,
        "dto_pattern_valid": True,
        "idempotency_enforced": True
    },
    files_created=["app/api/v1/players/search/route.ts"],
    lessons_learned=["Search endpoints need pagination support"]
)
```

### Query Past Patterns

Before implementing, check what worked:

```python
past_apis = memori.search_learnings(
    query="API endpoint implementation",
    tags=["api", "route-handler"],
    limit=5
)
```
