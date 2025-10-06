# PT-2 Canonical Service Layer Template

> **Status**: Living Reference Implementation
> **Source**: Player service (Phase 2, Slice 1-2)
> **Version**: 1.0.0
> **Last Updated**: 2025-10-06

## Purpose

This template captures the **proven, PRD-compliant service architecture** from Player domain implementation. Use as blueprint for all PT-2 domain services (Visit, RatingSlip, Casino, etc.).

## Anti-Pattern Guardrails

Before starting ANY service implementation, verify you will NOT:

| ❌ Anti-Pattern | ✅ Correct Pattern |
|----------------|-------------------|
| `ReturnType<typeof createXService>` | Explicit `interface XService` |
| `supabase: any` | `supabase: SupabaseClient<Database>` |
| `import from '@/types/database-rebuilt'` | `Database['public']['Tables']['x']` |
| `services/x/types.ts` | `types/domains/x/index.ts` |
| `@deprecated` code | Delete, don't maintain dual APIs |
| `class BaseService` | Functional factories only |
| `console.*` in operations | Structured logging/monitoring |

**One-Violation Rule**: If migrating PT-1 code that breaks ANY rule above → rewrite, don't patch.

---

## Directory Structure

```
services/
├── shared/                          # ✅ Shared infrastructure
│   ├── types.ts                    # ServiceResult, ServiceError
│   ├── utils.ts                    # generateRequestId
│   └── operation-wrapper.ts        # executeOperation
│
└── {domain}/                        # ✅ Domain service
    ├── index.ts                    # Factory + explicit interface
    ├── crud.ts                     # CRUD operations module
    ├── business.ts                 # Business logic (if needed)
    ├── queries.ts                  # Complex queries (if needed)
    └── __tests__/
        └── {domain}-service.test.ts
```

**Rule of Three**: Don't create `business.ts` or `queries.ts` until 3rd instance of pattern.

---

## 1. Shared Infrastructure

### `services/shared/types.ts`

```typescript
/**
 * Canonical service result types for PT-2
 * All service operations MUST return ServiceResult<T>
 */

export interface ServiceError {
  code: string;        // Error code (e.g., "DUPLICATE_EMAIL")
  message: string;     // Human-readable message
  details?: unknown;   // Optional error context
}

export interface ServiceResult<T> {
  data: T | null;         // Operation result (null on error)
  error: ServiceError | null;  // Error details (null on success)
  success: boolean;       // Quick success check
  status: number;         // HTTP-style status (200, 400, 500)
  timestamp: string;      // ISO timestamp
  requestId: string;      // Tracking ID
}
```

### `services/shared/utils.ts`

```typescript
/**
 * Shared utilities - keep minimal
 */

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
```

### `services/shared/operation-wrapper.ts`

```typescript
/**
 * Standardized operation wrapper for error handling
 */

import type { ServiceResult } from "./types";
import { generateRequestId } from "./utils";

export interface OperationOptions {
  label?: string;
  timeout?: number;
}

/**
 * Wraps service operations with consistent error handling
 *
 * @example
 * return executeOperation<PlayerDTO>("create_player", async () => {
 *   const { data, error } = await supabase.from('player').insert(...);
 *   if (error) throw { code: "DB_ERROR", message: error.message };
 *   return data;
 * });
 */
export async function executeOperation<T>(
  label: string,
  operation: () => Promise<any>,
  options?: OperationOptions,
): Promise<ServiceResult<T>> {
  const requestId = generateRequestId();
  const timestamp = new Date().toISOString();

  try {
    const result = await operation();
    return {
      data: result,
      error: null,
      success: true,
      status: 200,
      timestamp,
      requestId,
    };
  } catch (err: unknown) {
    // Structured errors pass through
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      "message" in err
    ) {
      return {
        data: null,
        error: {
          code: (err as any).code,
          message: (err as any).message,
          details: (err as any).details,
        },
        success: false,
        status: 400,
        timestamp,
        requestId,
      };
    }

    // Unexpected errors
    const error = err as Error;
    return {
      data: null,
      error: {
        code: "OPERATION_FAILED",
        message: error.message,
        details: error,
      },
      success: false,
      status: 500,
      timestamp,
      requestId,
    };
  }
}
```

---

## 2. Domain Service Implementation

### `services/{domain}/crud.ts`

```typescript
/**
 * {Domain} CRUD Module
 * Following PT-2 canonical service architecture
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { executeOperation } from "../shared/operation-wrapper";
import type { ServiceResult } from "../shared/types";

// ✅ DTOs - Use Pick/Omit from canonical Database types
export interface XCreateDTO {
  field1: string;
  field2: string;
}

export type XDTO = Pick<
  Database["public"]["Tables"]["x"]["Row"],
  "id" | "field1" | "field2"
>;

// ✅ Functional factory with explicit typing
export function createXCrudService(supabase: SupabaseClient<Database>) {
  return {
    /**
     * Creates new {domain} entity
     *
     * @param data - Creation payload
     * @returns ServiceResult with created entity or error
     *
     * @example
     * const result = await xService.create({ field1: "value" });
     * if (result.success) console.log(result.data.id);
     */
    create: async (data: XCreateDTO): Promise<ServiceResult<XDTO>> => {
      return executeOperation<XDTO>("x_create", async () => {
        const { data: entity, error } = await supabase
          .from("x")
          .insert(data)
          .select("id, field1, field2")
          .single();

        if (error) {
          // ✅ Map database constraints to business errors
          if (error.code === "23505") {
            throw {
              code: "DUPLICATE_X",
              message: "Entity already exists",
              details: error,
            };
          }
          throw error;
        }

        return entity;
      });
    },

    /**
     * Updates existing {domain} entity
     */
    update: async (
      id: string,
      data: Partial<XCreateDTO>
    ): Promise<ServiceResult<XDTO>> => {
      return executeOperation<XDTO>("x_update", async () => {
        const { data: entity, error } = await supabase
          .from("x")
          .update(data)
          .eq("id", id)
          .select("id, field1, field2")
          .single();

        if (error) {
          if (error.code === "PGRST116") {
            throw {
              code: "NOT_FOUND",
              message: `Entity ${id} not found`,
            };
          }
          throw error;
        }

        return entity;
      });
    },

    /**
     * Retrieves {domain} by ID
     */
    getById: async (id: string): Promise<ServiceResult<XDTO>> => {
      return executeOperation<XDTO>("x_get_by_id", async () => {
        const { data, error } = await supabase
          .from("x")
          .select("id, field1, field2")
          .eq("id", id)
          .single();

        if (error) {
          if (error.code === "PGRST116") {
            throw { code: "NOT_FOUND", message: `Entity ${id} not found` };
          }
          throw error;
        }

        return data;
      });
    },
  };
}
```

### `services/{domain}/index.ts`

```typescript
/**
 * {Domain} Service Factory
 * Following PT-2 canonical service architecture with explicit interfaces
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createXCrudService } from "./crud";
import type { XCreateDTO, XDTO } from "./crud";
import type { ServiceResult } from "../shared/types";

// ✅ STEP 1: Explicit interface - NOT ReturnType inference
export interface XService {
  create(data: XCreateDTO): Promise<ServiceResult<XDTO>>;
  update(id: string, data: Partial<XCreateDTO>): Promise<ServiceResult<XDTO>>;
  getById(id: string): Promise<ServiceResult<XDTO>>;
}

// ✅ STEP 2: Typed factory with explicit interface return
export function createXService(
  supabase: SupabaseClient<Database>,
): XService {
  const crudService = createXCrudService(supabase);

  // ✅ Pure composition - no state, no side effects
  return {
    ...crudService,
  };
}

// ✅ STEP 3: Export explicit type (not ReturnType)
export type XServiceType = XService;

// ✅ STEP 4: Re-export DTOs for convenience
export type { XCreateDTO, XDTO };
```

---

## 3. Testing Pattern (TDD)

### `services/{domain}/__tests__/{domain}-service.test.ts`

```typescript
/**
 * {Domain} Service Tests - TDD approach
 * Write tests BEFORE implementation
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createXService } from "@/services/x";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

describe("X Service - CRUD Operations", () => {
  let supabase: SupabaseClient<Database>;
  let xService: ReturnType<typeof createXService>;

  beforeEach(() => {
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
    xService = createXService(supabase);
  });

  describe("create()", () => {
    it("should create entity with valid data", async () => {
      const result = await xService.create({
        field1: "test",
        field2: "value",
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBeDefined();
      expect(result.data?.field1).toBe("test");
    });

    it("should return error for duplicate entity", async () => {
      const data = { field1: "duplicate", field2: "value" };

      const first = await xService.create(data);
      expect(first.success).toBe(true);

      const duplicate = await xService.create(data);
      expect(duplicate.success).toBe(false);
      expect(duplicate.error?.code).toBe("DUPLICATE_X");
    });
  });

  describe("update()", () => {
    it("should update existing entity", async () => {
      const created = await xService.create({
        field1: "original",
        field2: "value",
      });
      expect(created.success).toBe(true);

      const updated = await xService.update(created.data!.id, {
        field1: "updated",
      });

      expect(updated.success).toBe(true);
      expect(updated.data?.field1).toBe("updated");
    });

    it("should return error for non-existent entity", async () => {
      const result = await xService.update("nonexistent-id", {
        field1: "value",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });
});
```

---

## 4. Server Action Integration

### `app/actions/{domain}/create-x-action.ts`

```typescript
"use server";

/**
 * Server Action: Create {Domain}
 * Following PT-2 vertical slice architecture
 */

import { createClient } from "@/lib/supabase/server";
import { createXService, type XCreateDTO } from "@/services/x";
import type { ServiceResult } from "@/services/shared/types";

export interface CreateXInput {
  field1: string;
  field2: string;
}

export type CreateXResult = ServiceResult<{ id: string; field1: string }>;

/**
 * Creates new {domain} entity via server action
 *
 * @param input - Entity creation data
 * @returns ServiceResult with created entity or error
 */
export async function createXAction(
  input: CreateXInput,
): Promise<CreateXResult> {
  const supabase = await createClient();
  const xService = createXService(supabase);

  return await xService.create(input);
}
```

---

## 5. UI Component Pattern

### `components/{domain}/{domain}-form.tsx`

```typescript
"use client";

import { useState } from "react";
import { createXAction } from "@/app/actions/x/create-x-action";

export function XForm() {
  const [field1, setField1] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const result = await createXAction({ field1, field2: "value" });

      if (result.success && result.data) {
        setMessage({
          type: "success",
          text: `Created: ${result.data.id}`,
        });
        setField1("");
      } else {
        setMessage({
          type: "error",
          text: result.error?.message || "Operation failed",
        });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Unexpected error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {message && (
        <div className={message.type === "success" ? "text-green-600" : "text-red-600"}>
          {message.text}
        </div>
      )}
      <input
        value={field1}
        onChange={(e) => setField1(e.target.value)}
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? "Creating..." : "Create"}
      </button>
    </form>
  );
}
```

---

## 6. Operational Guardrails

### Before Starting New Service

- [ ] Read this template completely
- [ ] Review Player service implementation
- [ ] Check PRD anti-pattern list
- [ ] Verify no PT-1 violations to migrate

### During Implementation

- [ ] **Rule of Three**: Don't extract helpers until 3rd use
- [ ] **One-Violation Rule**: Rewrite PT-1 code with ANY violation
- [ ] **Time-Box Mining**: Cap PT-1 exploration to ≤4h per module
- [ ] **JSDoc First**: Document as you code, not after

### End-of-Week Audit

- [ ] No `ReturnType` inference in main exports
- [ ] No `any` typed parameters
- [ ] No `@/types/database-rebuilt` imports
- [ ] No `services/x/types.ts` files
- [ ] No `@deprecated` code
- [ ] No `console.*` in operations
- [ ] All tests passing
- [ ] Type-check clean (`npx tsc --noEmit`)

---

## 7. Error Code Catalogue

Standard error codes for consistency across services:

| Code | HTTP Status | Meaning | When to Use |
|------|-------------|---------|-------------|
| `DUPLICATE_X` | 400 | Unique constraint violation | 23505 PostgreSQL error |
| `NOT_FOUND` | 404 | Entity doesn't exist | PGRST116 Supabase error |
| `VALIDATION_ERROR` | 400 | Input validation failed | Zod/manual validation |
| `UNAUTHORIZED` | 401 | Auth required | RLS policy violation |
| `FORBIDDEN` | 403 | Action not allowed | Business rule violation |
| `OPERATION_FAILED` | 500 | Unexpected error | Catch-all for unknown errors |

**Naming Convention**: `{DOMAIN}_{ACTION}_{REASON}` (e.g., `PLAYER_UPDATE_EMAIL_EXISTS`)

---

## 8. PT-1 Mining Strategy

When borrowing patterns from PT-1:

### ✅ Safe to Mine

- Search query logic (SQL patterns)
- Error mapping tables (constraint → business error)
- Validation rules (business logic)
- DTO transform patterns (if PRD-compliant)

### ❌ Do Not Import

- `base.service.ts` class abstractions
- `@/types/database-rebuilt` manual types
- `ReturnType` inferred interfaces
- Deprecated wrapper functions
- Global state/singletons

### Mining Process

1. **Read PT-1 implementation** (understand logic)
2. **Extract business rules** (document in comments)
3. **Rewrite using this template** (fresh code)
4. **Test with TDD** (verify behavior matches)
5. **Audit against checklist** (ensure no violations)

**Time-Box**: If mining takes >4h, rebuild from scratch instead.

---

## 9. Reference Implementation

**Canonical Example**: [services/player/](~/services/player/)

**What Makes It Canonical:**
- ✅ Explicit `PlayerService` interface ([index.ts:17-19](~/services/player/index.ts:17-19))
- ✅ Typed factory parameter ([index.ts:23-25](~/services/player/index.ts:23-25))
- ✅ Functional composition ([index.ts:26-30](~/services/player/index.ts:26-30))
- ✅ ServiceResult pattern ([crud.ts:24-26](~/services/player/crud.ts:24-26))
- ✅ Database constraint mapping ([crud.ts:34-40](~/services/player/crud.ts:34-40))
- ✅ TDD tests ([__tests__/player-service.test.ts](~/__tests__/services/player/player-service.test.ts))

---

## 10. Quick Start Checklist

### For New Domain Service:

1. **Copy structure**: `cp -r services/player services/{domain}`
2. **Find/replace**: `Player` → `{Domain}`, `player` → `{domain}`
3. **Update DTOs**: Map to your table's canonical types
4. **Write tests first**: Copy test structure, update assertions
5. **Implement CRUD**: Start with `create()`, then `update()`, `getById()`
6. **Add complexity incrementally**: Don't build `search.ts` until needed
7. **Run audit**: Check end-of-week checklist before PR
8. **Document deviations**: If you must break a rule, document WHY

### Estimated Time per Service:

- **Basic CRUD**: 4-6 hours (3 slices × 2h)
- **+ Search**: +3 hours (if mining PT-1 patterns)
- **+ Queries**: +2 hours (if mining PT-1 patterns)
- **+ Business Logic**: +2-4 hours (domain-specific)

**Total**: 8-15 hours per complete domain service

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-06 | Initial template from Player Slice 1-2 |

## Maintenance

**Review Frequency**: After each domain service completion
**Owner**: Architecture team
**Update Process**: PR with justification for any pattern changes
