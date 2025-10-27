# PT-2 Service Standard (v1.2)
> **Scope:** Small-team, MVP-scale architecture. KISS + YAGNI preserved. DDD boundaries respected.  
> **Applies to:** Domain services consumed by Next.js 15 App Router Route Handlers (`app/api/v1/**/route.ts`) and Server Actions, backed by Supabase/Postgres with RLS enforced.

---

## 0) Core Principles
- **KISS / YAGNI:** Extract only on the 3rd repetition. No base classes. No singletons.  
- **Schema-first:** Use generated `Database` types as the *only* table/enum source of truth.  
- **Bounded Contexts:** Each folder under `services/` = one bounded context. No cross-context imports except public DTOs/APIs or published **views**.  
- **RLS-first:** All runtime access through PostgREST with RLS. Never use service keys in app runtime.  
- **HTTP at the edge:** Inside services, use domain error codes. Map to HTTP only in server actions/controllers.  
- **Idempotency by design:** Prefer natural keys + constraint handling to make writes retry-safe.

---

## Anti-Pattern Guardrails

Before starting ANY service implementation, verify you will NOT:

| ❌ Anti-Pattern | ✅ Correct Pattern |
|----------------|-------------------|
| `ReturnType<typeof createXService>` | Explicit `interface XService` |
| `supabase: any` | `supabase: SupabaseClient<Database>` |
| Importing ad-hoc rebuilt DB types | Use generated `Database['public']['Tables']['x']` |
| `services/x/types.ts` junk drawer | Promote **cross-context** types only to `types/domains/shared/…`; DTOs live in `services/{domain}/dto.ts` |
| Maintaining deprecated parallel APIs | Delete obsolete APIs; provide a single canonical path |
| `class BaseService` hierarchy | Functional factories only |
| `console.*` noise in ops | Structured logging via `executeOperation` logger hook |
| HTTP status in `ServiceResult` | Keep HTTP mapping in server actions/controllers only |
| Premature abstraction | Extract on the 3rd repetition (Rule-of-Three) |
| Cross-context ad-hoc joins | Consume other context’s published view/service |
| Bypassing RLS with service keys | Service keys only in migrations/CI |
| Unscoped queries | Include tenancy keys where required (`casino_id`, `gaming_day`, …) |
| Scattered validation | Validate at the edge; services may re-validate to guard invariants |
| Repeated inline select strings | Centralize in `selects.ts` |
| Singletons / global state | Functional factories; no global singletons |
| `any` or `ReturnType<>` leaks | Explicit interfaces and types only |
| Non-idempotent writes where natural key exists | Handle `23505`; return existing when safe |

---

## 1) Minimal Directory Structure

```
services/
├── shared/                          # ✅ Shared infrastructure
│   ├── types.ts                    # ServiceResult<T>, ServiceError (domain-agnostic)
│   └── operation.ts                # executeOperation: timeouts, (opt) retry, logger hook
│
└── {domain}/                        # ✅ Domain service
    ├── dto.ts                      # ⬅️ DTO schemas (Zod) + inferred types
    ├── selects.ts                  # Named column sets for .select(...)
    ├── index.ts                    # Factory + explicit interface; composes crud
    ├── crud.ts                     # CRUD operations module
    ├── business.ts                 # Business logic (if needed)
    ├── queries.ts                  # Complex queries (if needed)
    └──
```

**Rules**
- **DTO co-location is required.** Application/input/output DTOs live in `services/{domain}/dto.ts`.  
- **Promote** to `types/domains/shared/…` *only* if used across ≥2 bounded contexts.  
- **No** `services/{domain}/types.ts` junk drawers.

---

## 2) DTOs & Validation
- Define **Zod** schemas in `dto.ts`. Export both schemas and inferred types.  
- **Validate at the edge** (server action / API route). Services can assume validated inputs.  
- If a service is reachable from multiple edges, it may re-validate to guard invariants.

```ts
// services/player/dto.ts
import { z } from "zod";

export const CreatePlayerSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().optional(),
});
export type CreatePlayerDTO = z.infer<typeof CreatePlayerSchema>;

export const PlayerSchema = z.object({
  id: z.string().uuid(),
  first_name: z.string(),
  last_name: z.string(),
  phone: z.string().nullable(),
});
export type PlayerDTO = z.infer<typeof PlayerSchema>;

// Domain error codes (small, explicit)
export const PlayerError = {
  DUPLICATE: "PLAYER_DUPLICATE",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;
```

---

## 3) Select Sets (Drift Prevention)
Keep column shapes consistent and reviewable.

```ts
// services/player/selects.ts
export const PLAYER_SELECT_MIN = "id, first_name, last_name, phone";
```

---

## 4) Service Interface & Factory (Explicit, Stable)
```ts
// services/player/index.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { ServiceResult } from "@/services/shared/types";
import type { CreatePlayerDTO, PlayerDTO } from "./dto";
import { createPlayerCrud } from "./crud";

export interface PlayerService {
  create(data: CreatePlayerDTO): Promise<ServiceResult<PlayerDTO>>;
  update(id: string, data: Partial<CreatePlayerDTO>): Promise<ServiceResult<PlayerDTO>>;
  getById(id: string): Promise<ServiceResult<PlayerDTO>>;
}

export function createPlayerService(supabase: SupabaseClient<Database>): PlayerService {
  const crud = createPlayerCrud(supabase);
  return { ...crud };
}
```

---

## 5) Persistence Module (Thin, RLS-Aware, Idempotent)
```ts
// services/player/crud.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { executeOperation } from "@/services/shared/operation";
import type { ServiceResult } from "@/services/shared/types";
import { CreatePlayerDTO, PlayerDTO, PlayerError } from "./dto";
import { PLAYER_SELECT_MIN } from "./selects";

export function createPlayerCrud(supabase: SupabaseClient<Database>) {
  return {
    create: (data: CreatePlayerDTO): Promise<ServiceResult<PlayerDTO>> =>
      executeOperation<PlayerDTO>({ label: "player.create" }, async () => {
        const { data: row, error } = await supabase
          .from("player")
          .insert(data)
          .select(PLAYER_SELECT_MIN)
          .single();

        if (error) {
          // Postgres duplicate key
          if ((error as any).code === "23505") {
            // Optional idempotency: look up existing by natural key & return it
            // const existing = await findByNaturalKey(...);
            throw { code: PlayerError.DUPLICATE, message: "Player already exists", details: error };
          }
          throw error;
        }
        return row!;
      }),

    update: (id: string, data: Partial<CreatePlayerDTO>) =>
      executeOperation<PlayerDTO>({ label: "player.update" }, async () => {
        const { data: row, error } = await supabase
          .from("player")
          .update(data)
          .eq("id", id)
          // If tenant-scoped, also filter: .eq("casino_id", casinoId)
          .select(PLAYER_SELECT_MIN)
          .single();

        if (error) {
          if ((error as any).code === "PGRST116") {
            throw { code: PlayerError.NOT_FOUND, message: `Player ${id} not found` };
          }
          throw error;
        }
        return row!;
      }),

    getById: (id: string) =>
      executeOperation<PlayerDTO>({ label: "player.getById" }, async () => {
        const { data: row, error } = await supabase
          .from("player")
          .select(PLAYER_SELECT_MIN)
          .eq("id", id)
          // If tenant-scoped, also filter: .eq("casino_id", casinoId)
          .single();

        if (error) {
          if ((error as any).code === "PGRST116") {
            throw { code: PlayerError.NOT_FOUND, message: `Player ${id} not found` };
          }
          throw error;
        }
        return row!;
      }),
  };
}
```

---

## 6) Operation Wrapper (Domain-centric; HTTP is External)
```ts
// services/shared/types.ts
export interface ServiceError { code: string; message: string; details?: unknown; }
export interface ServiceResult<T> {
  data: T | null;
  error: ServiceError | null;
  success: boolean;
  timestamp: string;
  requestId: string;
}
```

```ts
// services/shared/operation.ts
export type Logger = (evt: { label: string; requestId: string; ok: boolean; ms: number; err?: unknown }) => void;

export interface OperationOptions {
  label: string;
  timeoutMs?: number;                 // default 10_000
  logger?: Logger;                    // optional
  retry?: { attempts: 0 | 1 | 2; backoffMs?: number }; // default 0
}

export async function executeOperation<T>(
  options: OperationOptions,
  op: () => Promise<T>,
): Promise<ServiceResult<T>> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const timestamp = new Date().toISOString();
  const timeoutMs = options.timeoutMs ?? 10_000;
  let attempts = Math.max(0, Math.min(options.retry?.attempts ?? 0, 2));
  const backoff = options.retry?.backoffMs ?? 200;

  const timed = () => Promise.race([
    op(),
    new Promise<never>((_, rej) => setTimeout(() => rej({ code: "TIMEOUT", message: "Operation timed out" }), timeoutMs)),
  ]);

  const start = performance.now();
  try {
    while (true) {
      try {
        const data = await timed();
        options.logger?.({ label: options.label, requestId, ok: true, ms: performance.now() - start });
        return { data, error: null, success: true, timestamp, requestId };
      } catch (e) {
        if (attempts-- > 0) { await new Promise(r => setTimeout(r, backoff)); continue; }
        throw e;
      }
    }
  } catch (err: any) {
    const code = typeof err === "object" && err?.code ? String(err.code) : "OPERATION_FAILED";
    const message = typeof err === "object" && err?.message ? String(err.message) : "Operation failed";
    options.logger?.({ label: options.label, requestId, ok: false, ms: performance.now() - start, err });
    return { data: null, error: { code, message, details: err }, success: false, timestamp, requestId };
  }
}
```

---

## 7) Route Handler & Server Action Boundary (HTTP Mapping Here Only)
```ts
// app/api/v1/casinos/[casino_id]/route.ts
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCasinoService } from "@/services/casino";
import { CasinoDetailParamsSchema } from "@/services/casino/dto";
import { withServerAction } from "@/lib/http/with-server-action";
import { toServiceHttpResponse } from "@/lib/http/service-response";
import { IdempotencyKey } from "@/lib/http/idempotency";

export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ casino_id: string }> },
) {
  // Next.js 15 passes params as a Promise — await before use.
  const params = await segmentData.params;
  const parse = CasinoDetailParamsSchema.safeParse(params);
  if (!parse.success) {
    return toServiceHttpResponse({
      ok: false,
      status: 400,
      error: { code: "VALIDATION_ERROR", issues: parse.error.flatten() },
    });
  }

  const supabase = await createClient();
  const service = createCasinoService(supabase);
  const envelope = await withServerAction("casino.detail", async (ctx) => {
    return service.getById(parse.data.casino_id);
  });

  return toServiceHttpResponse(envelope);
}

export async function PATCH(
  request: NextRequest,
  segmentData: { params: Promise<{ casino_id: string }> },
) {
  const params = await segmentData.params;
  const idempotencyKey = IdempotencyKey.fromRequest(request);
  // ...validate body with Zod, enforce Idempotency-Key per API Surface doc
  // ...call service mutation, return toServiceHttpResponse(envelope)
}
```

---

## 8) RLS & Tenancy Guardrails (Made Explicit)
- Always scope queries with required tenancy keys (`casino_id`, `gaming_day`, etc.) when the use-case requires.  
- Never bypass RLS with service keys in runtime. Service keys are allowed only in migrations/CI.  
- For cross-context reads, consume the other context’s **published view/service**. Do not ad-hoc join across domains.

---

## 9) Testing Policy (Fast Unit, Targeted Integration)
- **Unit tests:** mock `SupabaseClient<Database>` with a typed test double; verify interface shape & domain error mapping.  
- **Integration tests (opt-in):** run against local Supabase with RLS enabled; verify select shapes and constraint → domain error mapping.  
- Keep per-domain **test helpers** (e.g., `makePlayer()`) within the domain folder.

---

## 10) Testing Pattern (TDD)

**Goal:** fast feedback (red → green → refactor) with strong type guarantees and minimal ceremony.

### 10.1 Unit tests (default)
- **Isolate the application service.** Use a **typed test double** for `SupabaseClient<Database>`.
- **No `ReturnType` in public APIs or test types.** Import the **explicit service interface** (e.g., `PlayerService`) instead.
- Verify:
  - happy-path data mapping,
  - domain error mapping (e.g., `PGRST116` → `NOT_FOUND`, `23505` → domain `*_DUPLICATE`),
  - that `executeOperation` envelopes results consistently.

**Example (Vitest/Jest):**
```ts
// services/player/__tests__/player.unit.test.ts
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createPlayerService } from "@/services/player";
import type { PlayerService } from "@/services/player"; // explicit interface, not ReturnType

function makeClientDouble(overrides: Partial<SupabaseClient<Database>> = {}): SupabaseClient<Database> {
  // minimal shape we need for this test; add methods incrementally
  return {
    from: (table: string) => {
      if (table !== "player") throw new Error("unexpected table");
      return {
        insert: (_: any) => ({
          select: (_sel: string) => ({ single: async () => ({ data: { id: "p1", first_name: "A", last_name: "B", phone: null }, error: null }) }),
        }),
        update: (_: any) => ({
          eq: (_c: string, _v: string) => ({
            select: (_sel: string) => ({ single: async () => ({ data: { id: "p1", first_name: "A", last_name: "B", phone: null }, error: null }) }),
          }),
        }),
        select: (_sel: string) => ({
          eq: (_c: string, _v: string) => ({ single: async () => ({ data: { id: "p1", first_name: "A", last_name: "B", phone: null }, error: null }) }),
        }),
      } as any;
    },
    // @ts-expect-error partial double for tests
    ...overrides,
  } as SupabaseClient<Database>;
}

describe("player service (unit)", () => {
  it("creates a player and returns envelope", async () => {
    const svc: PlayerService = createPlayerService(makeClientDouble());
    const res = await svc.create({ first_name: "A", last_name: "B" });
    expect(res.success).toBe(true);
    expect(res.data?.id).toBe("p1");
  });
});
```

### 10.2 Integration tests (opt-in)
- Run against local Supabase with **RLS enabled** and seed data.
- Verify **column select shapes** and **constraint → domain error** behavior.
- Keep them focused and few; prefer unit tests for logic.

**Example outline:**
```ts
// services/player/__tests__/player.int.test.ts
// - boot real Supabase client
// - insert with conflicting natural key → expect domain DUPLICATE code
// - fetch by id with RLS scope → expect data
```

### 10.3 Testing rules
- **Use the public interface** (`PlayerService`) in tests; **do not** export or rely on `ReturnType<typeof createPlayerService>` in test declarations.
- **Do not mock** PostgREST internals; only double the **minimal** client surface you need.
- **Seed helpers** live per domain (e.g., `makePlayer()`); avoid a global utilities junk drawer.
- Keep CI fast: unit tests mandatory; integration tests are targeted.

---

## 11) Edge Compliance Checklist (API Surface Alignment)
- **Versioning:** All HTTP entrypoints live under `/api/v1/**`; breaking contracts fork to `/api/v2` with sunset guidance (see `25-api-data/API_SURFACE_MVP.md`).
- **ServiceHttpResult contract:** Route Handlers and Server Actions *must* return the canonical HTTP envelope (`ok`, `code`, `status`, `requestId`, `durationMs`, `timestamp`) via `lib/http/service-response.ts`. Services continue returning `ServiceResult`.
- **Idempotency:** POST/PATCH requests require an `Idempotency-Key`. Either persist per-domain ledgers (e.g., `loyalty_ledger.idempotency_key`) or hash the request into `audit_log` when tables lack a dedicated column. Services should prefer natural-key upserts; edges enforce header presence.
- **Rate limiting & RBAC:** Use `lib/rate-limiter` defaults (60 read / 10 write req/min/staff) unless the API Surface specifies stricter policies, and honor the SRM-defined JWT roles + `casino_id` scoping.
- **Observability & Audit:** Wrap mutating operations in `withServerAction` to capture `requestId`, `durationMs`, and actor context, and append mutations to `audit_log` with the same correlation identifiers.
- **Caching & runtime configs:** Configure Route Handler segment options (`dynamic`, `revalidate`, `runtime`, etc.) per Next.js guidance to match the API’s consistency expectations (e.g., `force-static` for cached GETs).

## 12) Error Code Catalog (Small & Domain-Centric)
- Shared minimal set: `NOT_FOUND`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `TIMEOUT`, `OPERATION_FAILED`.  
- Domain codes follow `{DOMAIN}_{REASON}` (e.g., `PLAYER_DUPLICATE`).  
- Catalogs live with the domain (`dto.ts`). Promote to shared only if reused across ≥2 domains.

Standard error codes for consistency across services. **Note:** HTTP mapping happens at the edge (server actions/controllers); services emit domain codes only.

| Code | HTTP Status | Meaning | When to Use |
|------|-------------|---------|-------------|
| `DUPLICATE_X` *(prefer domain-specific, e.g., `PLAYER_DUPLICATE`)* | **409** (or 400) | Unique constraint violation | PostgreSQL `23505` |
| `NOT_FOUND` | 404 | Entity doesn't exist | PostgREST `PGRST116` |
| `VALIDATION_ERROR` | 400 | Input validation failed | Zod/manual validation at the edge |
| `UNAUTHORIZED` | 401 | Auth required | No/invalid session |
| `FORBIDDEN` | 403 | Authenticated but not allowed | RLS policy denial / business rule violation |
| `TIMEOUT` | 504 | Operation exceeded timeout | `executeOperation` timeout |
| `OPERATION_FAILED` | 500 | Unexpected error | Catch‑all for unknown errors |

**Naming Convention:** `{DOMAIN}_{ACTION?}_{REASON}` (e.g., `PLAYER_UPDATE_EMAIL_EXISTS`, `PLAYER_DUPLICATE`).  
**Guidance:** Prefer **domain‑centric codes** in services (e.g., `PLAYER_DUPLICATE`). Map to the suggested HTTP status at the edge.

---

## 13) Idempotency & Constraints (Policy)
- If a natural key exists, **writes are idempotent**: on `23505`, find+return existing when safe.  
- If idempotency is not safe, return a domain duplicate error (`*_DUPLICATE`) with enough details to surface the conflict.

---

## 14) Checklists (Lean)
**Start**
- [ ] DTOs + Zod in `services/{domain}/dto.ts`  
- [ ] Named selects in `selects.ts`  
- [ ] Explicit interface in `index.ts`  
- [ ] No `services/{domain}/types.ts`

**During**
- [ ] Validate at edge; trust inside  
- [ ] No exported `ReturnType<>`; no `any`  
- [ ] Extract only on 3rd repetition

**Before PR**
- [ ] Unit tests pass (typed double)  
- [ ] Integration (if present) green  
- [ ] RLS scope verified in queries  
- [ ] Error codes mapped & documented

---

## 15) Migration Notes (from v1.0)
- **Move DTOs** into `services/{domain}/dto.ts`. Replace ad-hoc types with Zod schemas + inferred types.  
- **Delete** `services/{domain}/types.ts` files.  
- **Remove HTTP status** from `ServiceResult`; do mapping at edge only.  
- **Centralize** column sets in `selects.ts`.  
- **Adopt** `executeOperation()` wrapper with timeout (+ optional retry/logger).  

---
**End of file**
