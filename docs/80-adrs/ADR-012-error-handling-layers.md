# ADR-012: Error Handling Layers - DomainError vs ServiceResult

**Status:** Accepted
**Date:** 2025-11-28
**Owner:** Platform/Services
**Applies to:** All domain services under `services/**`, server actions under `app/actions/**`, route handlers under `app/api/**`
**Decision type:** Architecture

---

## Context

The audit of WORKFLOW-PRD-002 identified an apparent inconsistency between two error handling patterns in PT-2 documentation:

1. **`service-patterns.md`** showed service functions returning `Promise<ServiceResult<T>>`
2. **`service-patterns.md`** also prescribed throwing `DomainError` in service functions

This created confusion: should services **return** error results or **throw** errors?

Investigation of the actual codebase revealed these patterns are **not conflicting** but operate at **different architectural layers**:

| Layer | Pattern | Location |
|-------|---------|----------|
| Service Layer | `throw DomainError` | `services/**/*.ts` |
| Transport Layer | `ServiceResult<T>` | `lib/http/service-response.ts`, `lib/server-actions/with-server-action-wrapper.ts` |

The existing implementation correctly uses:
- **DomainError** thrown by service functions for business rule violations
- **ServiceResult<T>** as the transport envelope returned by server actions and route handlers

The documentation inconsistency in `service-patterns.md` showing `Promise<ServiceResult<RewardDTO>>` as a service return type was **aspirational documentation**, not actual implementation.

---

## Decision

### 1. Service Layer: Throw DomainError

Service functions **throw** errors; they do not return error envelopes.

```typescript
// services/{domain}/{feature}.ts

export async function createPlayer(
  supabase: SupabaseClient<Database>,
  input: PlayerCreateDTO
): Promise<PlayerDTO> {  // ✅ Returns success data only
  const existing = await findByEmail(input.email);
  if (existing) {
    throw new DomainError('PLAYER_ALREADY_EXISTS');  // ✅ Throw for errors
  }

  const { data, error } = await supabase
    .from('player')
    .insert(input)
    .select()
    .single();

  if (error) {
    throw mapDatabaseError(error);  // ✅ Map and throw
  }

  return data;  // ✅ Return success data
}
```

**Rationale:**
- Cleaner function signatures (`Promise<T>` not `Promise<ServiceResult<T>>`)
- Leverages TypeScript's native error handling
- Allows composition without unwrapping envelopes
- Consistent with pure domain logic principles

### 2. Transport Layer: Return ServiceResult<T>

Server actions and route handlers **catch** errors and **return** `ServiceResult<T>` envelopes.

```typescript
// app/actions/{domain}.ts

export async function createPlayerAction(input: PlayerCreateDTO) {
  return withServerAction(
    () => createPlayer(getSupabase(), input),  // ← May throw
    { supabase: getSupabase(), domain: 'player', operation: 'create' }
  );
}
// Returns ServiceResult<PlayerDTO>

// withServerAction catches errors and maps to ServiceResult<T>:
// - Success: { ok: true, code: 'OK', data: T, ... }
// - Failure: { ok: false, code: 'PLAYER_ALREADY_EXISTS', error: 'message', ... }
```

**Rationale:**
- Uniform API response format for clients
- Includes metadata (requestId, durationMs, timestamp)
- Preserves DomainError codes without leaking Postgres errors
- Works with React Query's expected mutation response shape

### 3. Error Flow Diagram

```
┌───────────────────────────────────────────────────────────────────┐
│  CLIENT (React)                                                   │
│                                                                   │
│  Receives: ServiceResult<T>                                       │
│  - { ok: true, data: T }                                          │
│  - { ok: false, code: 'PLAYER_ALREADY_EXISTS', error: '...' }     │
└───────────────────────────────┬───────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│  TRANSPORT LAYER (Server Actions / Route Handlers)                │
│                                                                   │
│  withServerAction() wrapper:                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ try {                                                       │  │
│  │   const data = await handler();                             │  │
│  │   return { ok: true, code: 'OK', data, ... };               │  │
│  │ } catch (error) {                                           │  │
│  │   const mapped = mapDatabaseError(error);                   │  │
│  │   return { ok: false, code: mapped.code, error: '...' };    │  │
│  │ }                                                           │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Returns: ServiceResult<T> (never throws to client)               │
└───────────────────────────────┬───────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│  SERVICE LAYER (services/*)                                       │
│                                                                   │
│  Pattern: THROW DomainError for failures                          │
│  - Validation: throw new DomainError('VALIDATION_ERROR', ...)     │
│  - Business rule: throw new DomainError('PLAYER_ALREADY_EXISTS')  │
│  - DB error: throw mapDatabaseError(error)                        │
│                                                                   │
│  Returns: Promise<T> (success data only, may throw)               │
└───────────────────────────────────────────────────────────────────┘
```

### 4. Documentation Updates Required

Update `service-patterns.md` to remove the conflicting example showing `ServiceResult` as a service return type:

**Before (line 91):**
```typescript
export async function rewardPlayer(
  supabase: SupabaseClient<Database>,
  input: MidSessionRewardInput
): Promise<ServiceResult<RewardDTO>> {  // ❌ Incorrect
```

**After:**
```typescript
export async function rewardPlayer(
  supabase: SupabaseClient<Database>,
  input: MidSessionRewardInput
): Promise<RewardDTO> {  // ✅ Correct
  // ... implementation throws DomainError on failure
```

---

## Rationale

### Why not return ServiceResult from services?

1. **Verbose composition**: Every service call requires unwrapping:
   ```typescript
   const result1 = await serviceA();
   if (!result1.ok) return result1;  // tedious
   const result2 = await serviceB(result1.data);
   if (!result2.ok) return result2;  // tedious
   ```

2. **Type pollution**: Service interfaces become `Promise<ServiceResult<T>>` everywhere

3. **Against existing patterns**: ERROR_TAXONOMY_AND_RESILIENCE.md (mandatory) prescribes throwing DomainError in service layer

### Why not throw from transport layer?

1. **Unpredictable client errors**: React Query expects consistent response shapes
2. **Lost metadata**: Thrown errors don't include requestId, timestamp
3. **Against HTTP semantics**: 4xx/5xx should return JSON bodies, not connection errors

---

## Alternatives Considered

### 1. Unified ServiceResult everywhere

All layers return `ServiceResult<T>`, services never throw.

**Rejected because:**
- Requires unwrapping at every composition point
- Inconsistent with `ERROR_TAXONOMY_AND_RESILIENCE.md` (mandatory doc)
- More verbose code without added safety

### 2. Throw everywhere, client handles errors

Services and transport both throw; client catches in error boundaries.

**Rejected because:**
- Loses structured error codes
- Loses request metadata (requestId, timing)
- Poor DX for handling expected business errors (e.g., "already exists")

### 3. Result<T, E> union type

Use a discriminated union (`{ success: true, data: T } | { success: false, error: E }`).

**Rejected because:**
- Still requires unwrapping in services
- Doesn't align with existing `ServiceResult<T>` infrastructure
- Over-engineering for current needs

---

## Implementation Notes

### Existing Infrastructure (No Changes Needed)

| File | Purpose |
|------|---------|
| `lib/errors/domain-errors.ts` | DomainError class + domain error codes |
| `lib/http/service-response.ts` | ServiceResult<T> interface |
| `lib/server-actions/with-server-action-wrapper.ts` | Catches errors, returns ServiceResult |
| `lib/server-actions/error-map.ts` | Maps Postgres/DomainError → MappedError |

### Documentation Fixes Required

| File | Change |
|------|--------|
| `.claude/skills/backend-service-builder/references/service-patterns.md` | Remove `Promise<ServiceResult<T>>` from service examples |
| `docs/20-architecture/specs/WORKFLOW-PRD-002-parallel-execution.md` | Align code samples with throw pattern |
| `docs/20-architecture/specs/SPEC-PRD-002-table-rating-core.md` | Verify service signatures use `Promise<T>` |

---

## Compliance

This ADR aligns with:

- **ERROR_TAXONOMY_AND_RESILIENCE.md** (§Service Layer REQUIRED): "Throw domain-specific errors"
- **ADR-008**: Service layer architecture template
- **OE-01 Guardrail**: No new abstraction layers required

---

## References

- `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md` (mandatory)
- `lib/errors/domain-errors.ts`
- `lib/http/service-response.ts`
- `lib/server-actions/with-server-action-wrapper.ts`
- ADR-008 (Service Layer Architecture)
