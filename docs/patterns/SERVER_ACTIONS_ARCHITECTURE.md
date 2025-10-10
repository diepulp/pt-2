# Server Actions Architecture

**Status**: APPROVED
**Date**: 2025-10-10
**Phase**: 3 - State Management Infrastructure
**Related**: ADR-003 State Management Strategy

---

## Overview

This document clarifies the architectural separation between server action **implementations** and server action **utilities** to prevent namespace confusion and ensure consistent patterns.

---

## Directory Structure

```
app/
├── actions/                           # 👈 Server Action Implementations
│   ├── player/
│   │   ├── create-player-action.ts
│   │   ├── update-player-action.ts
│   │   └── delete-player-action.ts
│   ├── visit/
│   │   ├── start-visit-action.ts
│   │   └── end-visit-action.ts
│   └── rating-slip/
│       ├── create-rating-slip-action.ts
│       └── close-rating-slip-action.ts
│
lib/
├── server-actions/                    # 👈 Server Action Utilities
│   └── with-server-action-wrapper.ts  # Error mapping, audit logging
│
services/
├── player/                            # 👈 Service Layer
│   ├── index.ts
│   ├── crud.ts
│   └── ...
```

---

## Separation of Concerns

### `app/actions/` - Domain-Specific Implementations

**Purpose**: Next.js server actions that handle client-side form submissions and mutations

**Responsibilities**:
- Marked with `"use server"` directive
- Accept client-side inputs
- Call service layer methods
- Use wrapper utilities from `lib/server-actions/`
- Return typed results to client

**Naming Convention**: `{action-name}-action.ts` (e.g., `create-player-action.ts`)

**Example**:
```typescript
// app/actions/player/create-player-action.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { withServerAction } from "@/lib/server-actions/with-server-action-wrapper";
import { createPlayerService } from "@/services/player";

export async function createPlayerAction(input: CreatePlayerInput) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  return withServerAction(
    async () => {
      const playerService = createPlayerService(supabase);
      return playerService.create(input);
    },
    supabase,
    {
      action: "create_player",
      userId: session?.user?.id,
      entity: "player",
      metadata: { email: input.email }
    }
  );
}
```

---

### `lib/server-actions/` - Reusable Utilities

**Purpose**: Shared utilities and wrappers for server actions (not domain-specific)

**Responsibilities**:
- Error mapping (PostgreSQL → user-friendly messages)
- Audit logging (production-only)
- Standardized result handling
- Performance monitoring
- Request ID generation

**Naming Convention**: Descriptive utility names (e.g., `with-server-action-wrapper.ts`)

**Example**:
```typescript
// lib/server-actions/with-server-action-wrapper.ts
export async function withServerAction<T>(
  action: () => Promise<ServiceResult<T>>,
  supabase: SupabaseClient<Database>,
  context: ServerActionContext
): Promise<ServiceResult<T>> {
  try {
    const result = await action();

    // Audit logging for production
    if (process.env.NODE_ENV === "production") {
      await writeAuditLog(supabase, context, result);
    }

    return result;
  } catch (error: unknown) {
    // Error mapping
    const mappedError = mapDatabaseError(error);
    // ... return standardized error result
  }
}
```

---

## Integration Pattern

### Standard Server Action Template

All server actions in `app/actions/{domain}/` should follow this pattern:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { withServerAction } from "@/lib/server-actions/with-server-action-wrapper";
import { create{Domain}Service } from "@/services/{domain}";
import type { ServiceResult } from "@/services/shared/types";

export async function {action}Action(input: {Action}Input): Promise<ServiceResult<{Result}>> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  return withServerAction(
    async () => {
      const service = create{Domain}Service(supabase);
      return service.{method}(input);
    },
    supabase,
    {
      action: "{domain}_{action}",      // e.g., "create_player"
      userId: session?.user?.id,        // For audit logging
      entity: "{domain}",               // e.g., "player"
      entityId: result?.id,             // If known after creation
      metadata: { /* relevant data */ }  // For audit context
    }
  );
}
```

---

## Benefits of This Pattern

### 1. Clear Namespace Separation
- `app/actions/` = implementations
- `lib/server-actions/` = utilities
- No confusion about where code belongs

### 2. Consistent Error Handling
All server actions automatically get:
- PostgreSQL error code mapping (23503 FK → "FOREIGN_KEY_VIOLATION")
- User-friendly error messages
- Proper HTTP status codes (400, 404, 409, 500)

### 3. Automatic Audit Logging
Production-only audit trail includes:
- Who performed the action (`userId`)
- What action was performed (`action`)
- When it occurred (`timestamp`)
- What entity was affected (`entity`, `entityId`)
- Additional context (`metadata`)

### 4. Type Safety
- Full TypeScript support throughout
- `ServiceResult<T>` standardization
- Explicit interfaces for all actions

---

## Error Mapping Reference

The wrapper automatically maps database errors:

| PostgreSQL Code | PostgREST Code | Mapped Error | HTTP Status | User Message |
|-----------------|----------------|--------------|-------------|--------------|
| 23503 | - | FOREIGN_KEY_VIOLATION | 400 | Invalid reference: related record does not exist |
| 23505 | - | UNIQUE_VIOLATION | 409 | A record with this information already exists |
| 23514 | - | VALIDATION_ERROR | 400 | Invalid data: check constraints failed |
| 23502 | - | VALIDATION_ERROR | 400 | Required field is missing |
| - | PGRST116 | NOT_FOUND | 404 | Record not found |
| (unknown) | - | INTERNAL_ERROR | 500 | Error message from exception |

---

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Layer                            │
│  UI Component → Form Submission → Server Action Call        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│          app/actions/{domain}/{action-name}.ts              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 1. Get Supabase client                                │  │
│  │ 2. Get session (for audit userId)                     │  │
│  │ 3. Call withServerAction wrapper                      │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│       lib/server-actions/with-server-action-wrapper.ts      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 1. Execute service layer action                       │  │
│  │ 2. Catch and map database errors                      │  │
│  │ 3. Write audit log (production only)                  │  │
│  │ 4. Return ServiceResult<T>                            │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│             services/{domain}/index.ts                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 1. Execute business logic                             │  │
│  │ 2. Call Supabase database operations                  │  │
│  │ 3. Return ServiceResult<T>                            │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Supabase / PostgreSQL                      │
│  RLS Policies → Database Operations → Real-time Updates    │
└─────────────────────────────────────────────────────────────┘
```

---

## Do's and Don'ts

### ✅ DO

- **DO** use `withServerAction` wrapper for all mutations
- **DO** organize actions by domain in `app/actions/{domain}/`
- **DO** name actions with `-action.ts` suffix for clarity
- **DO** include audit context (userId, entity, metadata)
- **DO** get session for userId before calling wrapper
- **DO** return full `ServiceResult<T>` including status, timestamp, requestId
- **DO** keep utilities generic and reusable in `lib/server-actions/`

### ❌ DON'T

- **DON'T** put domain logic in `lib/server-actions/` (keep it generic)
- **DON'T** bypass the wrapper for database mutations
- **DON'T** create duplicate wrapper implementations
- **DON'T** use `lib/actions/` (use `lib/server-actions/` for clarity)
- **DON'T** include sensitive data in audit metadata
- **DON'T** call server actions from other server actions (call services directly)
- **DON'T** use server actions for queries (use React Query hooks instead)

---

## Migration Path

For existing server actions that don't use the wrapper:

### Before (No Wrapper)
```typescript
export async function createPlayerAction(input: CreatePlayerInput) {
  const supabase = await createClient();
  const service = createPlayerService(supabase);
  const result = await service.create(input);

  return {
    data: result.data,
    error: result.error,
    success: result.success
  };
}
```

### After (With Wrapper)
```typescript
export async function createPlayerAction(input: CreatePlayerInput) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  return withServerAction(
    async () => {
      const service = createPlayerService(supabase);
      return service.create(input);
    },
    supabase,
    { action: "create_player", userId: session?.user?.id, entity: "player" }
  );
}
```

**Benefits Gained**:
- ✅ Automatic error mapping
- ✅ Audit logging
- ✅ Request tracking
- ✅ Standardized responses

---

## Testing

Server actions with the wrapper should be tested for:

1. **Success Path**: Verify service result passes through correctly
2. **Error Mapping**: Test PostgreSQL error codes map to user-friendly messages
3. **Audit Logging**: Verify production-only logging behavior
4. **Session Handling**: Test with and without authenticated sessions

See `__tests__/lib/server-actions/with-server-action-wrapper.test.ts` for comprehensive examples.

---

## Related Documentation

- **ADR-003**: State Management Strategy
- **SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md**: Service layer patterns
- **WAVE_1_SIGNOFF.md**: Phase 3 infrastructure delivery

---

**Status**: APPROVED
**Last Updated**: 2025-10-10
**Version**: 1.0
