# Service Implementation Quick Reference

> **Carry card for day-to-day development**
> **Full spec**: [SERVICE_TEMPLATE.md](./SERVICE_TEMPLATE.md)

## Pre-Flight Checklist

Before writing ANY service code:

| ❌ Never | ✅ Always |
|---------|----------|
| `ReturnType<typeof createXService>` | Explicit `interface XService` |
| `supabase: any` | `supabase: SupabaseClient<Database>` |
| `@/types/database-rebuilt` | `Database['public']['Tables']['x']` |
| `services/x/types.ts` | `types/domains/x/` |
| `@deprecated` code | Delete immediately |
| `console.*` | Structured logging |

**One-Violation Rule**: If PT-1 code breaks ANY rule → **rewrite**, don't patch.

---

## File Structure (Copy This)

```
services/
├── shared/
│   ├── types.ts                    # ServiceResult, ServiceError
│   ├── utils.ts                    # generateRequestId
│   └── operation-wrapper.ts        # executeOperation
│
└── {domain}/
    ├── index.ts                    # Factory + interface
    ├── crud.ts                     # CRUD operations
    └── __tests__/
        └── {domain}-service.test.ts
```

**Rule of Three**: Don't add `business.ts` or `queries.ts` until 3rd occurrence.

---

## Implementation Pattern (5 Steps)

### 1. Write Test First (TDD)

```typescript
// __tests__/x-service.test.ts
describe("X Service", () => {
  let xService: ReturnType<typeof createXService>;

  beforeEach(() => {
    const supabase = createClient<Database>(url, key);
    xService = createXService(supabase);
  });

  it("should create X with valid data", async () => {
    const result = await xService.create({ field: "value" });
    expect(result.success).toBe(true);
    expect(result.data?.id).toBeDefined();
  });

  it("should handle duplicate error", async () => {
    await xService.create({ field: "unique" });
    const dup = await xService.create({ field: "unique" });
    expect(dup.success).toBe(false);
    expect(dup.error?.code).toBe("DUPLICATE_X");
  });
});
```

### 2. Define DTOs (Pick from Database)

```typescript
// crud.ts
export interface XCreateDTO {
  field: string;
}

export type XDTO = Pick<
  Database["public"]["Tables"]["x"]["Row"],
  "id" | "field"
>;
```

### 3. Implement CRUD Module

```typescript
// crud.ts
import { executeOperation } from "../shared/operation-wrapper";

export function createXCrudService(supabase: SupabaseClient<Database>) {
  return {
    create: async (data: XCreateDTO): Promise<ServiceResult<XDTO>> => {
      return executeOperation<XDTO>("x_create", async () => {
        const { data: entity, error } = await supabase
          .from("x")
          .insert(data)
          .select("id, field")
          .single();

        if (error) {
          // Map DB constraint → business error
          if (error.code === "23505") {
            throw { code: "DUPLICATE_X", message: "Already exists" };
          }
          throw error;
        }
        return entity;
      });
    },
  };
}
```

### 4. Create Factory with Explicit Interface

```typescript
// index.ts
// ✅ STEP 1: Interface FIRST
export interface XService {
  create(data: XCreateDTO): Promise<ServiceResult<XDTO>>;
}

// ✅ STEP 2: Typed factory
export function createXService(
  supabase: SupabaseClient<Database>
): XService {
  const crudService = createXCrudService(supabase);
  return { ...crudService };  // Pure composition
}

// ✅ STEP 3: Export type (NOT ReturnType)
export type XServiceType = XService;
export type { XCreateDTO, XDTO };
```

### 5. Run Tests & Audit

```bash
npm test services/x
npx tsc --noEmit
```

---

## Common Error Mappings

| PostgreSQL Code | Business Error | HTTP Status |
|----------------|----------------|-------------|
| `23505` | `DUPLICATE_X` | 400 |
| `PGRST116` | `NOT_FOUND` | 404 |
| `23503` | `FOREIGN_KEY_VIOLATION` | 400 |
| `42P01` | `TABLE_NOT_FOUND` | 500 |

**Pattern**:
```typescript
if (error.code === "23505") {
  throw { code: "DUPLICATE_X", message: "...", details: error };
}
```

---

## End-of-Slice Audit (2 min)

**Before committing**, check:

- [ ] No `ReturnType` in main exports
- [ ] No `any` parameters
- [ ] No `database-rebuilt` imports
- [ ] No `services/x/types.ts` file
- [ ] No `@deprecated` code
- [ ] All tests passing
- [ ] `npx tsc --noEmit` clean

**If ANY fail** → fix before PR

---

## Quick Commands

```bash
# Copy Player template
cp -r services/player services/{domain}

# Run tests
npm test services/{domain}

# Type check
npx tsc --noEmit

# Full audit
npm test && npx tsc --noEmit
```

---

## Time Estimates

- **Basic CRUD**: 2h per operation (create, update, getById)
- **Search module**: +3h (if mining PT-1)
- **Queries module**: +2h (if mining PT-1)
- **Full service**: 8-12h total

**Time-Box Rule**: If PT-1 mining takes >4h → rebuild instead.

---

## Reference Implementation

**Live Example**: [services/player/](../../services/player/)

Copy patterns from:
- [index.ts](../../services/player/index.ts) - Factory structure
- [crud.ts](../../services/player/crud.ts) - CRUD operations
- [__tests__/player-service.test.ts](../../__tests__/services/player/player-service.test.ts) - Test patterns

---

## When to Consult Full Template

Reference [SERVICE_TEMPLATE.md](./SERVICE_TEMPLATE.md) for:

- Shared infrastructure details
- Server action patterns
- UI component integration
- PT-1 mining strategy
- Architecture rationale
- Error code catalogue

---

## Emergency Contacts

**Stuck?** Check in order:

1. Player service implementation
2. SERVICE_TEMPLATE.md full spec
3. Controlled Hybrid Refactor Model
4. Architecture team

**Architecture Changes?** Update [SERVICE_TEMPLATE.md](./SERVICE_TEMPLATE.md), NOT this quick ref.

---

_Last synced with SERVICE_TEMPLATE.md v1.0.0 (2025-10-06)_
