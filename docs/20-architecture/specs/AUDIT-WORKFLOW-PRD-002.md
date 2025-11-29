# Architecture Audit Report: WORKFLOW-PRD-002

**Document**: `docs/20-architecture/specs/WORKFLOW-PRD-002-parallel-execution.md`
**Audit Date**: 2025-11-28
**Auditor**: Lead Architect (Claude Code)
**Standard References**: SLAD v2.1.2, SRM v3.1.0, SERVICE_TEMPLATE v2.0.3, anti-patterns.memory.md

---

## Summary

| Category | Violations | Warnings | Notes |
|----------|------------|----------|-------|
| Type Safety | 2 | 1 | `as` casting, duplicate interfaces |
| Service Patterns | 1 | 2 | ServiceResult vs DomainError inconsistency |
| DTO Rules | 0 | 1 | Documentation gap |
| Anti-Patterns | 2 | 0 | Type casting, missing type guards |
| API Patterns | 1 | 1 | Casino context extraction |
| React Query | 0 | 1 | Empty string mutation key |

**Overall**: 6 violations, 6 warnings requiring attention before implementation.

---

## Critical Violations

### V1: Type Casting Anti-Pattern

**Location**: WS-3 lifecycle.ts (lines 490, 509, 528, 571)
**Severity**: HIGH

```typescript
// VIOLATION - Banned by anti-patterns.memory.md
return { success: true, data: data as RatingSlipDTO };
```

**Standard Reference**: `anti-patterns.memory.md` line 9
> "Supabase clients must be typed; never `any` or unchecked spreads"

The `as` casting bypasses type safety. If RPC return shape changes, this will fail silently at runtime.

**Fix Required**:
```typescript
// Use mapper function with compile-time validation
function mapToRatingSlipDTO(data: unknown): RatingSlipDTO {
  // Validate and transform with type guards
  if (!isValidRatingSlipData(data)) {
    throw new DomainError('INVALID_RPC_RESPONSE');
  }
  return {
    id: data.id,
    casino_id: data.casino_id,
    // ... explicit mapping
  };
}
```

---

### V2: ServiceResult vs DomainError Inconsistency

**Location**: WS-2, WS-3 service methods
**Severity**: MEDIUM
**Status**: RESOLVED via ADR-012

The workflow defines:
```typescript
// WS-3: lifecycle.ts (lines 435-439)
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}
```

**Standard Reference**: `service-patterns.md` lines 245-262
```typescript
// REQUIRED pattern per service-patterns.md
export async function createPlayer(input: PlayerCreateDTO) {
  throw new DomainError('PLAYER_ALREADY_EXISTS'); // Throw, don't return
}
```

**Architectural Decision Made (ADR-012)**: These patterns are **not conflicting** but operate at **different architectural layers**:

| Layer | Pattern | Purpose |
|-------|---------|---------|
| **Service Layer** (`services/**`) | `throw DomainError` | Error signaling within business logic |
| **Transport Layer** (Server Actions) | `ServiceResult<T>` | Response envelope for HTTP clients |

**Resolution**:
- Service functions return `Promise<T>` and **throw** `DomainError` on failure
- `withServerAction()` wrapper catches errors and returns `ServiceResult<T>`
- WS-2, WS-3 service methods must use throw pattern, not return `ServiceResult`
- `service-patterns.md` updated to remove conflicting example

**Reference**: `docs/80-adrs/ADR-012-error-handling-layers.md`

---

### V3: Duplicate Interface Definitions

**Location**: WS-2 (line 259-263), WS-3 (line 435-439)
**Severity**: MEDIUM

Both workstreams define identical `ServiceResult<T>` interface inline.

**Standard Reference**: `dto-rules.md` line 118-126
> "Never access Database types directly... Import published DTO from owning service"

Same principle applies to shared patterns.

**Fix Required**:
```typescript
// Create shared type in services/shared/types.ts
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}
```

---

### V4: Casino Context Extraction from Header

**Location**: WS-4 route handler (line 739)
**Severity**: HIGH

```typescript
// DANGEROUS - Trusts client-provided header
const casinoId = request.headers.get('x-casino-id') ?? '';
```

This violates security principles:
1. Client can spoof `x-casino-id` header
2. Empty string fallback bypasses RLS silently
3. Should derive casino_id from authenticated user's context

**Standard Reference**: RLS patterns require server-derived casino context, not client-provided.

**Fix Required**:
```typescript
// Derive from authenticated user's staff record
const { data: staffRecord } = await supabase
  .from('staff')
  .select('casino_id')
  .eq('user_id', user.id)
  .single();

if (!staffRecord?.casino_id) {
  return NextResponse.json(
    { ok: false, code: 'CASINO_CONTEXT_MISSING' },
    { status: 403 }
  );
}
const casinoId = staffRecord.casino_id;
```

---

### V5: Missing RPC Type Definitions

**Location**: WS-1 (lines 127-133)
**Severity**: MEDIUM

The workflow lists 6 RPCs to create but doesn't specify their TypeScript type generation. After `npm run db:types`, these should produce:

```typescript
Database['public']['Functions']['rpc_update_table_status']['Args']
Database['public']['Functions']['rpc_update_table_status']['Returns']
```

Service methods should use these generated types, not manual interface definitions.

**Fix Required**: Add explicit note in WS-1 acceptance criteria:
```markdown
- [ ] Verify RPC types generated in `types/database.types.ts`:
  - `Database['public']['Functions']['rpc_*']['Args']` for all 6 RPCs
  - `Database['public']['Functions']['rpc_*']['Returns']` for all 6 RPCs
```

---

### V6: Missing Error Domain Codes Registration

**Location**: WS-3 mapRpcError (lines 445-465)
**Severity**: LOW

Error codes are mapped but not registered in the domain error catalog.

**Standard Reference**: `service-patterns.md` lines 266-276 shows domain-specific error codes per service.

**Fix Required**: Add to `services/rating-slip/README.md`:
```markdown
## Domain Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VISIT_NOT_OPEN` | 400 | Visit must be active to start slip |
| `TABLE_NOT_ACTIVE` | 400 | Table must be active to start slip |
| `RATING_SLIP_NOT_OPEN` | 409 | Can only pause open slips |
| `RATING_SLIP_NOT_PAUSED` | 409 | Can only resume paused slips |
| `RATING_SLIP_INVALID_STATE` | 409 | Invalid state transition |
| `DUPLICATE_ACTIVE_SLIP` | 409 | Player already has active slip at table |
```

---

## Warnings (Should Fix)

### W1: Empty String Mutation Key

**Location**: WS-5 (line 902)

```typescript
mutationKey: tableContextKeys.updateStatus('')
```

Empty string is likely a placeholder. Mutation keys for update operations typically use the entity ID.

---

### W2: Missing DTO Catalog Update

**Location**: WS-3 output artifacts (line 656-664)

New DTOs created but `docs/25-api-data/DTO_CATALOG.md` not listed for update.

---

### W3: Index Export Gap in WS-2

**Location**: WS-2 (line 346-354)

Creates `table-operations.ts` but doesn't mention `services/table-context/index.ts` update for re-export.

---

### W4: Auth Helpers Package Version

**Location**: WS-4 (line 709)

```typescript
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
```

Verify this matches current PT-2 auth pattern. Some projects use `@supabase/ssr` instead.

---

### W5: Missing Type Guards

**Location**: WS-3 closeSlip (line 550)

```typescript
const result = data as { slip: RatingSlipDTO; duration_seconds: number };
```

Should use runtime type validation for complex RPC responses.

---

### W6: Handoff Signal JSON Schema

**Location**: Throughout (lines 172-187, 358-372, etc.)

Handoff signals don't have a schema validator. Consider adding JSON schema validation to ensure agents produce valid signals.

---

## Compliant Patterns (Verified)

| Pattern | Location | Assessment |
|---------|----------|------------|
| Migration naming | WS-1 Task 1.1 | Uses `YYYYMMDDHHMMSS_description.sql` |
| RLS policies | SPEC-PRD-002 S5.1 | Uses `current_setting('app.casino_id')::uuid` |
| React Query keys | WS-3 Task 3.2 | Follows key factory pattern |
| OE-01 guardrail | SPEC-PRD-002 S12 | Explicit check documented |
| State machine pattern | WS-2 Task 2.1 | Correct transition addition |
| Bounded contexts | WS-2, WS-3 | Services own their tables |
| Audit logging | SPEC-PRD-002 S5.3 | All RPCs log to audit_log |

---

## Recommended Actions

### Before Implementation

1. ~~**Create ADR-XXX**: `ServiceResult vs DomainError Pattern`~~ **DONE (ADR-012)**
   - ✅ Documented layered error handling: services throw, transport catches
   - ✅ Updated service-patterns.md to remove conflicting example

2. **Create shared types file**: `services/shared/service-types.ts`
   - Extract `ServiceResult<T>` and other common patterns
   - Import in all service files
   - Note: ServiceResult already exists in `lib/http/service-response.ts` - WS code should import from there

3. **Fix casino context extraction**: Update WS-4 route handlers to derive casino_id from authenticated user, not header

4. **Add type guard utilities**: Create `lib/type-guards/rpc-responses.ts` with validators for RPC responses

### During Implementation

5. **Replace `as` casts** with mapper functions that use generated RPC types
6. **Update DTO_CATALOG.md** with new DTOs from WS-3
7. **Add domain error codes** to service README files

---

## Audit Checklist Summary

```
Pre-Architecture Validation
[x] SRM entries accurate (SPEC-PRD-002 S6)
[x] Migration naming follows YYYYMMDDHHMMSS pattern
[x] RLS policies defined
[x] ServiceResult vs DomainError pattern clarified (ADR-012)

Anti-Pattern Check
[!] `as` type casting present (V1)
[x] No class-based services
[x] No ReturnType inference
[!] Potential security issue (V4)

Post-Architecture Validation
[x] OE-01 check documented
[!] DTO catalog update missing (W2)
[!] Service index exports incomplete (W3)
```

---

## Audit Result

**Status**: ✅ PASS (Rectified 2025-11-28)

**Blockers** (RESOLVED):
- ✅ V1: Replaced `as` type casting with type guards (`isValidRatingSlipData`, `isValidCloseResponse`, `isValidTableDTO`)
- ✅ V4: Fixed casino context extraction - uses canonical `getAuthContext()` from `lib/supabase/rls-context.ts`

**Previously Resolved**:
- ✅ V2: ADR-012 created - services throw DomainError, transport returns ServiceResult
- ✅ V3: ServiceResult now imported from `lib/http/service-response.ts`

**Fixed During Rectification**:
- ✅ V5: Added RPC type verification acceptance criteria to WS-1
- ✅ V6: Added Domain Error Codes table to WS-3 README task
- ✅ W1-W3: All warnings addressed

**Rectified Document**: `WORKFLOW-PRD-002-parallel-execution.md` v1.1.0

---

## References

- `docs/20-architecture/specs/SPEC-PRD-002-table-rating-core.md`
- `docs/20-architecture/specs/WORKFLOW-PRD-002-parallel-execution.md`
- `.claude/skills/backend-service-builder/references/service-patterns.md`
- `.claude/skills/backend-service-builder/references/dto-rules.md`
- `memory/anti-patterns.memory.md`
