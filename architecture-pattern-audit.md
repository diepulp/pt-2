# Architecture Pattern Consistency Audit

**Scope**: System patterns, anti-patterns, and architectural decisions
**Documents**: 17

## Executive Summary

- **Pattern Categories Analyzed**: 5
- **Contradictions Found**: 2

## Pattern Categories

### Service Implementation

**Description**: How services should be implemented

- Documents mentioning: 5
- REQUIRED statements: 2
- PROHIBITED statements: 8
- **Status**: ⚠️ Mixed guidance (check for contradictions)

### Type Inference

**Description**: Type declaration patterns

- Documents mentioning: 8
- REQUIRED statements: 18
- PROHIBITED statements: 9
- **Status**: ⚠️ Mixed guidance (check for contradictions)

### Supabase Client

**Description**: Supabase client handling

- Documents mentioning: 13
- REQUIRED statements: 14
- PROHIBITED statements: 15
- **Status**: ⚠️ Mixed guidance (check for contradictions)

### State Management

**Description**: State management approach

- Documents mentioning: 12
- REQUIRED statements: 52
- PROHIBITED statements: 23
- **Status**: ⚠️ Mixed guidance (check for contradictions)

### Exports

**Description**: Module export patterns

- Documents mentioning: 2
- REQUIRED statements: 2
- PROHIBITED statements: 3
- **Status**: ⚠️ Mixed guidance (check for contradictions)

## Contradictions Found

### C001: Supabase client handling

**Category**: supabase_client

#### Issue: Supabase client typing with any

**Required by**:

- `system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md:197` - // NO: createPlayerService(supabase: any) - must type as SupabaseClient<Database>...
- `system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md:197` - // NO: createPlayerService(supabase: any) - must type as SupabaseClient<Database>...
- `system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md:110` - - Any advanced offline/optimistic behaviour must sit behind domain-specific services with explicit a...

**Prohibited by**:

- `system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md:302` - ✅ Type `supabase` parameter as `SupabaseClient<Database>` (never `any`)...
- `system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md:302` - ✅ Type `supabase` parameter as `SupabaseClient<Database>` (never `any`)...
- `system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md:320` - ❌ Type parameters as `any` (violations: Casino, MTL services)...

### C002: Module export patterns

**Category**: exports

#### Issue: Default vs named exports

**Required by**:

- `system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md:312` - ✅ Use named exports exclusively (no default exports)...
- `system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md:312` - ✅ Use named exports exclusively (no default exports)...

**Prohibited by**:

- `system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md:324` - ❌ Mix default and named exports from service modules...
- `system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md:181` - - Ban mixing default and named exports from service modules; use named exports exclusively for consi...
- `system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md:181` - - Ban mixing default and named exports from service modules; use named exports exclusively for consi...

## Detailed Pattern Statements

### Service Implementation

#### adr/ADR-005-integrity-enforcement.md

ℹ️ **Line 53** (NEUTRAL)

- Keyword: `classes`
- Statement: **Defense in Depth**: Each layer catches different classes of violations:

ℹ️ **Line 77** (NEUTRAL)

- Keyword: `classes`
- Statement: - Prevents entire classes of bugs

#### patterns/SERVICE_TEMPLATE.md

ℹ️ **Line 23** (NEUTRAL)

- Keyword: `functional factories`
- Statement: | `class BaseService` | Functional factories only |

ℹ️ **Line 23** (NEUTRAL)

- Keyword: `BaseService`
- Statement: | `class BaseService` | Functional factories only |

#### patterns/controlled-hybrid-refactor-model.md

❌ **Line 33** (PROHIBITED)

- Keyword: `BaseService`
- Statement: - ❌ `class BaseService` abstractions

#### system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md

✅ **Line 45** (REQUIRED)

- Keyword: `factory function`
- Statement: - **Explicit Interface Contracts**: Every service factory MUST declare an explicit interface defining all public methods with complete type signatures. Return this interface from the factory function.

❌ **Line 63** (PROHIBITED)

- Keyword: `factory function`
- Statement: - **Typed Dependencies**: Factory functions MUST type the `supabase` parameter as `SupabaseClient<Database>`. Never use `any`.

ℹ️ **Line 86** (NEUTRAL)

- Keyword: `factory function`
- Statement: - **Consistent Export Pattern**: Export both the factory function and the service type. Name them consistently: `createXService` → `XService` interface → `export type XService`.

ℹ️ **Line 177** (NEUTRAL)

- Keyword: `factory function`
- Statement: - Forbid `supabase: any` parameters in service factory functions (violations in `services/casino/index.ts`, `services/mtl/index.ts`).

ℹ️ **Line 182** (NEUTRAL)

- Keyword: `factory function`
- Statement: - Prohibit runtime validation in service factory functions; move validation to development-only assertions or initialization-time checks.

ℹ️ **Line 93** (NEUTRAL)

- Keyword: `class-based`
- Statement: - Drop class-based base abstractions and the over-engineered `ServiceFactory`; V2 services are plain factories or functional modules without internal caching/metrics side effects (`services/base.service.ts`, `services/service.factory.ts`). Dependency injection stays explicit at the call site.

ℹ️ **Line 93** (NEUTRAL)

- Keyword: `ServiceFactory`
- Statement: - Drop class-based base abstractions and the over-engineered `ServiceFactory`; V2 services are plain factories or functional modules without internal caching/metrics side effects (`services/base.service.ts`, `services/service.factory.ts`). Dependency injection stays explicit at the call site.

❌ **Line 187** (PROHIBITED)

- Keyword: `ServiceFactory`
- Statement: - Ban service-layer factories that cache or mutate global state (e.g., `ServiceFactory` performance caches); service creation stays pure and request-scoped.

#### system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md

ℹ️ **Line 43** (NEUTRAL)

- Keyword: `functional factories`
- Statement: SF[Functional Factories<br/>createXService()]

✅ **Line 300** (REQUIRED)

- Keyword: `functional factories`
- Statement: ✅ Use plain functional factories for service creation

ℹ️ **Line 28** (NEUTRAL)

- Keyword: `factory function`
- Statement: - Runtime validation in factory functions

❌ **Line 325** (PROHIBITED)

- Keyword: `factory function`
- Statement: ❌ Add runtime validation in factory functions (use dev-only assertions)

ℹ️ **Line 17** (NEUTRAL)

- Keyword: `class-based`
- Statement: - Class-based service abstractions (BaseService)

❌ **Line 520** (PROHIBITED)

- Keyword: `class-based`
- Statement: ❌ **NO** `services/base.service.ts` - No class-based abstractions

❌ **Line 316** (PROHIBITED)

- Keyword: `classes`
- Statement: ❌ Use class inheritance (BaseService, abstract classes)

ℹ️ **Line 17** (NEUTRAL)

- Keyword: `BaseService`
- Statement: - Class-based service abstractions (BaseService)

ℹ️ **Line 194** (NEUTRAL)

- Keyword: `BaseService`
- Statement: // NO: class BaseService { ... }

❌ **Line 316** (PROHIBITED)

- Keyword: `BaseService`
- Statement: ❌ Use class inheritance (BaseService, abstract classes)

ℹ️ **Line 18** (NEUTRAL)

- Keyword: `ServiceFactory`
- Statement: - Over-engineered ServiceFactory with internal caching/metrics

ℹ️ **Line 195** (NEUTRAL)

- Keyword: `ServiceFactory`
- Statement: // NO: ServiceFactory.getInstance().getService('player')

❌ **Line 317** (PROHIBITED)

- Keyword: `ServiceFactory`
- Statement: ❌ Create ServiceFactory with caching/metrics side effects

### Type Inference

#### adr/NEXT_STEPS_REPORT.md

✅ **Line 181** (REQUIRED)

- Keyword: `ReturnType`
- Statement: - ✅ All services have explicit interfaces (no `ReturnType`)

✅ **Line 181** (REQUIRED)

- Keyword: `explicit interface`
- Statement: - ✅ All services have explicit interfaces (no `ReturnType`)

✅ **Line 216** (REQUIRED)

- Keyword: `explicit interface`
- Statement: ✅ Service layer complete with explicit interfaces (7/8 services, 87.5%)

ℹ️ **Line 760** (NEUTRAL)

- Keyword: `explicit interface`
- Statement: - [ ] Create `services/mtl/index.ts` with explicit interface

#### patterns/BALANCED_ARCHITECTURE_QUICK.md

❌ **Line 256** (PROHIBITED)

- Keyword: `ReturnType`
- Statement: ❌ **Explicit interfaces** - `interface XService`, NOT `ReturnType`

❌ **Line 256** (PROHIBITED)

- Keyword: `explicit interface`
- Statement: ❌ **Explicit interfaces** - `interface XService`, NOT `ReturnType`

ℹ️ **Line 384** (NEUTRAL)

- Keyword: `explicit interface`
- Statement: - [ ] No PRD violations (explicit interfaces, typed params)

#### patterns/SERVER_ACTIONS_ARCHITECTURE.md

ℹ️ **Line 192** (NEUTRAL)

- Keyword: `explicit interface`
- Statement: - Explicit interfaces for all actions

#### patterns/SERVICE_TEMPLATE.md

ℹ️ **Line 18** (NEUTRAL)

- Keyword: `ReturnType`
- Statement: | `ReturnType<typeof createXService>` | Explicit `interface XService` |

✅ **Line 305** (REQUIRED)

- Keyword: `ReturnType`
- Statement: // ✅ STEP 1: Explicit interface - NOT ReturnType inference

✅ **Line 324** (REQUIRED)

- Keyword: `ReturnType`
- Statement: // ✅ STEP 3: Export explicit type (not ReturnType)

ℹ️ **Line 353** (NEUTRAL)

- Keyword: `ReturnType`
- Statement: let xService: ReturnType<typeof createXService>;

ℹ️ **Line 542** (NEUTRAL)

- Keyword: `ReturnType`
- Statement: - [ ] No `ReturnType` inference in main exports

ℹ️ **Line 585** (NEUTRAL)

- Keyword: `ReturnType`
- Statement: - `ReturnType` inferred interfaces

ℹ️ **Line 40** (NEUTRAL)

- Keyword: `explicit interface`
- Statement: ├── index.ts # Factory + explicit interface

⚪ **Line 296** (OPTIONAL)

- Keyword: `explicit interface`
- Statement: \* Following PT-2 canonical service architecture with explicit interfaces

✅ **Line 305** (REQUIRED)

- Keyword: `explicit interface`
- Statement: // ✅ STEP 1: Explicit interface - NOT ReturnType inference

✅ **Line 312** (REQUIRED)

- Keyword: `explicit interface`
- Statement: // ✅ STEP 2: Typed factory with explicit interface return

✅ **Line 305** (REQUIRED)

- Keyword: `type inference`
- Statement: // ✅ STEP 1: Explicit interface - NOT ReturnType inference

#### patterns/SERVICE_TEMPLATE_QUICK.md

ℹ️ **Line 12** (NEUTRAL)

- Keyword: `ReturnType`
- Statement: | `ReturnType<typeof createXService>` | Explicit `interface XService` |

✅ **Line 138** (REQUIRED)

- Keyword: `ReturnType`
- Statement: // ✅ STEP 3: Export type (NOT ReturnType)

ℹ️ **Line 174** (NEUTRAL)

- Keyword: `ReturnType`
- Statement: - [ ] No `ReturnType` in main exports

ℹ️ **Line 121** (NEUTRAL)

- Keyword: `explicit interface`
- Statement: ### 4. Create Factory with Explicit Interface

#### patterns/controlled-hybrid-refactor-model.md

❌ **Line 28** (PROHIBITED)

- Keyword: `ReturnType`
- Statement: - ❌ `ReturnType<typeof createXService>`

ℹ️ **Line 43** (NEUTRAL)

- Keyword: `ReturnType`
- Statement: **After each vertical slice, run the same audit checklist to ensure you didn't re-introduce legacy imports or ReturnType inference.**

⚪ **Line 84** (OPTIONAL)

- Keyword: `explicit interface`
- Statement: - Rewrite using canonical Database types + explicit interfaces

ℹ️ **Line 43** (NEUTRAL)

- Keyword: `type inference`
- Statement: **After each vertical slice, run the same audit checklist to ensure you didn't re-introduce legacy imports or ReturnType inference.**

#### system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md

❌ **Line 62** (PROHIBITED)

- Keyword: `ReturnType`
- Statement: - **Ban `ReturnType` Inference**: Never use `ReturnType<typeof createXService>` for exported service types. Always export the explicit interface: `export type PlayerService = IPlayerService`.

❌ **Line 62** (PROHIBITED)

- Keyword: `ReturnType`
- Statement: - **Ban `ReturnType` Inference**: Never use `ReturnType<typeof createXService>` for exported service types. Always export the explicit interface: `export type PlayerService = IPlayerService`.

❌ **Line 175** (PROHIBITED)

- Keyword: `ReturnType`
- Statement: - Ban `ReturnType<typeof createXService>` patterns in service exports (violations in `services/table-context/index.ts`, `services/rating-slip/index.ts`, `services/compliance/index.ts`).

✅ **Line 45** (REQUIRED)

- Keyword: `explicit interface`
- Statement: - **Explicit Interface Contracts**: Every service factory MUST declare an explicit interface defining all public methods with complete type signatures. Return this interface from the factory function.

✅ **Line 45** (REQUIRED)

- Keyword: `explicit interface`
- Statement: - **Explicit Interface Contracts**: Every service factory MUST declare an explicit interface defining all public methods with complete type signatures. Return this interface from the factory function.

❌ **Line 62** (PROHIBITED)

- Keyword: `explicit interface`
- Statement: - **Ban `ReturnType` Inference**: Never use `ReturnType<typeof createXService>` for exported service types. Always export the explicit interface: `export type PlayerService = IPlayerService`.

✅ **Line 176** (REQUIRED)

- Keyword: `explicit interface`
- Statement: - Require explicit interface definitions for all service factories with typed return signatures.

#### system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md

ℹ️ **Line 9** (NEUTRAL)

- Keyword: `ReturnType`
- Statement: - `ReturnType<typeof createXService>` inference instead of explicit interfaces

✅ **Line 190** (REQUIRED)

- Keyword: `ReturnType`
- Statement: // ✅ CORRECT: Export explicit type, not ReturnType inference

ℹ️ **Line 196** (NEUTRAL)

- Keyword: `ReturnType`
- Statement: // NO: export type PlayerService = ReturnType<typeof createPlayerService>

✅ **Line 303** (REQUIRED)

- Keyword: `ReturnType`
- Statement: ✅ Export explicit types, not `ReturnType<typeof createXService>`

❌ **Line 319** (PROHIBITED)

- Keyword: `ReturnType`
- Statement: ❌ Use `ReturnType<typeof createXService>` for type inference

ℹ️ **Line 9** (NEUTRAL)

- Keyword: `explicit interface`
- Statement: - `ReturnType<typeof createXService>` inference instead of explicit interfaces

ℹ️ **Line 163** (NEUTRAL)

- Keyword: `explicit interface`
- Statement: ### 1. Functional Factory Pattern with Explicit Interfaces

✅ **Line 166** (REQUIRED)

- Keyword: `explicit interface`
- Statement: // ✅ CORRECT: Explicit interface with complete type signatures

✅ **Line 174** (REQUIRED)

- Keyword: `explicit interface`
- Statement: // ✅ CORRECT: Typed factory returning explicit interface

✅ **Line 301** (REQUIRED)

- Keyword: `explicit interface`
- Statement: ✅ Declare explicit interfaces for all services with complete type signatures

ℹ️ **Line 452** (NEUTRAL)

- Keyword: `explicit interface`
- Statement: /_ explicit interface _/

✅ **Line 190** (REQUIRED)

- Keyword: `type inference`
- Statement: // ✅ CORRECT: Export explicit type, not ReturnType inference

❌ **Line 319** (PROHIBITED)

- Keyword: `type inference`
- Statement: ❌ Use `ReturnType<typeof createXService>` for type inference

### Supabase Client

#### adr/ADR-003-state-management-strategy.md

✅ **Line 59** (REQUIRED)

- Keyword: `any`
- Statement: **Override Guidance**: The 5-minute/30-minute defaults serve as a baseline. Hook authors should explicitly set shorter `staleTime`/`gcTime` values for high-volatility queries such as live table availability or player status dashboards, and extend the window for infrequently accessed reports. Document any override in the corresponding domain README so cross-team consumers know the expected freshness.

ℹ️ **Line 78** (NEUTRAL)

- Keyword: `any`
- Statement: ['casino', 'by-company', companyId]

ℹ️ **Line 78** (NEUTRAL)

- Keyword: `any`
- Statement: ['casino', 'by-company', companyId]

✅ **Line 528** (REQUIRED)

- Keyword: `any`
- Statement: 1. ✅ Casino Service (5 tests) - All CRUD + ListByCompany

#### adr/ADR-004-real-time-strategy.md

✅ **Line 38** (REQUIRED)

- Keyword: `any`
- Statement: - **Effect Boundaries**: A shared `useRealtimeSubscription` hook wraps Supabase listeners inside `useEffect` with deterministic cleanup. It also registers a `AbortController` which is signalled on unmount to short-circuit any pending scheduler tasks.

✅ **Line 51** (REQUIRED)

- Keyword: `any`
- Statement: - **Foreground/Background Awareness**: When the document visibility changes to hidden for >2 minutes, we pause scheduler execution (queue persists). On visibility regain we flush the queue then rely on React Query’s `refetchOnReconnect` to catch any missed deltas.

❌ **Line 65** (PROHIBITED)

- Keyword: `any`
- Statement: 2. **Leak Prevention**: Ref-counted registry and effect cleanup avoid the “too many listeners” warnings witnessed in earlier spikes.

#### adr/NEXT_STEPS_REPORT.md

✅ **Line 182** (REQUIRED)

- Keyword: `SupabaseClient`
- Statement: - ✅ All services use `SupabaseClient<Database>` (no `any`)

ℹ️ **Line 292** (NEUTRAL)

- Keyword: `createClient`
- Statement: const supabase = createClient();

ℹ️ **Line 302** (NEUTRAL)

- Keyword: `createClient`
- Statement: const supabase = createClient();

ℹ️ **Line 312** (NEUTRAL)

- Keyword: `createClient`
- Statement: const supabase = createClient();

ℹ️ **Line 328** (NEUTRAL)

- Keyword: `createClient`
- Statement: const supabase = createClient();

ℹ️ **Line 342** (NEUTRAL)

- Keyword: `createClient`
- Statement: const supabase = createClient();

ℹ️ **Line 419** (NEUTRAL)

- Keyword: `createClient`
- Statement: const supabase = createClient();

ℹ️ **Line 484** (NEUTRAL)

- Keyword: `createClient`
- Statement: const supabase = createClient();

ℹ️ **Line 604** (NEUTRAL)

- Keyword: `createClient`
- Statement: const supabase = createClient();

✅ **Line 182** (REQUIRED)

- Keyword: `any`
- Statement: - ✅ All services use `SupabaseClient<Database>` (no `any`)

✅ **Line 594** (REQUIRED)

- Keyword: `any`
- Statement: export function useSupabaseChannel<T extends RealtimePostgresChangesPayload<any>>(

#### patterns/BALANCED_ARCHITECTURE_QUICK.md

❌ **Line 257** (PROHIBITED)

- Keyword: `SupabaseClient`
- Statement: ❌ **Typed dependencies** - `supabase: SupabaseClient<Database>`, NOT `any`

❌ **Line 257** (PROHIBITED)

- Keyword: `any`
- Statement: ❌ **Typed dependencies** - `supabase: SupabaseClient<Database>`, NOT `any`

ℹ️ **Line 399** (NEUTRAL)

- Keyword: `any`
- Statement: 1. **"How many services does this touch?"**

#### patterns/MTL_DOMAIN_CLASSIFICATION.md

ℹ️ **Line 144** (NEUTRAL)

- Keyword: `any`
- Statement: - **Archival:** Nightly backup and secure WORM (Write-Once-Read-Many) storage.

#### patterns/OVER_ENGINEERING_GUARDRAIL.md

ℹ️ **Line 19** (NEUTRAL)

- Keyword: `any`
- Statement: **Symptoms** (any two = violation):

✅ **Line 51** (REQUIRED)

- Keyword: `any`
- Statement: Anything beyond this requires a trigger (§6) and a Mini-ADR (§7).

ℹ️ **Line 53** (NEUTRAL)

- Keyword: `any`
- Statement: ## 5. Red-Flag Checklist (Stop-the-Line if any two are "Yes")

⚪ **Line 66** (OPTIONAL)

- Keyword: `any`
- Statement: You may add infra/abstractions when any one is true and recorded:

#### patterns/SERVER_ACTIONS_ARCHITECTURE.md

ℹ️ **Line 109** (NEUTRAL)

- Keyword: `SupabaseClient`
- Statement: supabase: SupabaseClient<Database>,

ℹ️ **Line 65** (NEUTRAL)

- Keyword: `createClient`
- Statement: import { createClient } from "@/lib/supabase/server";

ℹ️ **Line 70** (NEUTRAL)

- Keyword: `createClient`
- Statement: const supabase = await createClient();

ℹ️ **Line 140** (NEUTRAL)

- Keyword: `createClient`
- Statement: import { createClient } from "@/lib/supabase/server";

ℹ️ **Line 146** (NEUTRAL)

- Keyword: `createClient`
- Statement: const supabase = await createClient();

ℹ️ **Line 290** (NEUTRAL)

- Keyword: `createClient`
- Statement: const supabase = await createClient();

ℹ️ **Line 305** (NEUTRAL)

- Keyword: `createClient`
- Statement: const supabase = await createClient();

#### patterns/SERVICE_RESPONSIBILITY_MATRIX.md

ℹ️ **Line 486** (NEUTRAL)

- Keyword: `SupabaseClient`
- Statement: supabase: SupabaseClient<Database>,

ℹ️ **Line 663** (NEUTRAL)

- Keyword: `any`
- Statement: Before adding ANY field or logic to a service, verify:

#### patterns/SERVICE_TEMPLATE.md

ℹ️ **Line 19** (NEUTRAL)

- Keyword: `SupabaseClient`
- Statement: | `supabase: any` | `supabase: SupabaseClient<Database>` |

ℹ️ **Line 184** (NEUTRAL)

- Keyword: `SupabaseClient`
- Statement: import type { SupabaseClient } from "@supabase/supabase-js";

ℹ️ **Line 201** (NEUTRAL)

- Keyword: `SupabaseClient`
- Statement: export function createXCrudService(supabase: SupabaseClient<Database>) {

ℹ️ **Line 299** (NEUTRAL)

- Keyword: `SupabaseClient`
- Statement: import type { SupabaseClient } from "@supabase/supabase-js";

ℹ️ **Line 314** (NEUTRAL)

- Keyword: `SupabaseClient`
- Statement: supabase: SupabaseClient<Database>,

ℹ️ **Line 344** (NEUTRAL)

- Keyword: `SupabaseClient`
- Statement: import { createClient, type SupabaseClient } from "@supabase/supabase-js";

ℹ️ **Line 352** (NEUTRAL)

- Keyword: `SupabaseClient`
- Statement: let supabase: SupabaseClient<Database>;

ℹ️ **Line 344** (NEUTRAL)

- Keyword: `createClient`
- Statement: import { createClient, type SupabaseClient } from "@supabase/supabase-js";

ℹ️ **Line 356** (NEUTRAL)

- Keyword: `createClient`
- Statement: supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

ℹ️ **Line 428** (NEUTRAL)

- Keyword: `createClient`
- Statement: import { createClient } from "@/lib/supabase/server";

ℹ️ **Line 448** (NEUTRAL)

- Keyword: `createClient`
- Statement: const supabase = await createClient();

✅ **Line 14** (REQUIRED)

- Keyword: `any`
- Statement: Before starting ANY service implementation, verify you will NOT:

ℹ️ **Line 19** (NEUTRAL)

- Keyword: `any`
- Statement: | `supabase: any` | `supabase: SupabaseClient<Database>` |

❌ **Line 26** (PROHIBITED)

- Keyword: `any`
- Statement: **One-Violation Rule**: If migrating PT-1 code that breaks ANY rule above → rewrite, don't patch.

ℹ️ **Line 116** (NEUTRAL)

- Keyword: `any`
- Statement: operation: () => Promise<any>,

ℹ️ **Line 143** (NEUTRAL)

- Keyword: `any`
- Statement: code: (err as any).code,

ℹ️ **Line 144** (NEUTRAL)

- Keyword: `any`
- Statement: message: (err as any).message,

ℹ️ **Line 145** (NEUTRAL)

- Keyword: `any`
- Statement: details: (err as any).details,

ℹ️ **Line 536** (NEUTRAL)

- Keyword: `any`
- Statement: - [ ] **One-Violation Rule**: Rewrite PT-1 code with ANY violation

ℹ️ **Line 543** (NEUTRAL)

- Keyword: `any`
- Statement: - [ ] No `any` typed parameters

ℹ️ **Line 649** (NEUTRAL)

- Keyword: `any`
- Statement: **Update Process**: PR with justification for any pattern changes

#### patterns/SERVICE_TEMPLATE_QUICK.md

ℹ️ **Line 13** (NEUTRAL)

- Keyword: `SupabaseClient`
- Statement: | `supabase: any` | `supabase: SupabaseClient<Database>` |

ℹ️ **Line 97** (NEUTRAL)

- Keyword: `SupabaseClient`
- Statement: export function createXCrudService(supabase: SupabaseClient<Database>) {

ℹ️ **Line 132** (NEUTRAL)

- Keyword: `SupabaseClient`
- Statement: supabase: SupabaseClient<Database>

ℹ️ **Line 58** (NEUTRAL)

- Keyword: `createClient`
- Statement: const supabase = createClient<Database>(url, key);

ℹ️ **Line 8** (NEUTRAL)

- Keyword: `any`
- Statement: Before writing ANY service code:

ℹ️ **Line 13** (NEUTRAL)

- Keyword: `any`
- Statement: | `supabase: any` | `supabase: SupabaseClient<Database>` |

❌ **Line 19** (PROHIBITED)

- Keyword: `any`
- Statement: **One-Violation Rule**: If PT-1 code breaks ANY rule → **rewrite**, don't patch.

ℹ️ **Line 175** (NEUTRAL)

- Keyword: `any`
- Statement: - [ ] No `any` parameters

ℹ️ **Line 182** (NEUTRAL)

- Keyword: `any`
- Statement: **If ANY fail** → fix before PR

#### patterns/controlled-hybrid-refactor-model.md

❌ **Line 20** (PROHIBITED)

- Keyword: `any`
- Statement: **Do not refactor or generalize any helper until you've repeated it in three slices.**

❌ **Line 29** (PROHIBITED)

- Keyword: `any`
- Statement: - ❌ `supabase: any`

❌ **Line 35** (PROHIBITED)

- Keyword: `any`
- Statement: Action: If PT-1 code contains ANY → **rewrite using template**, don't import.

ℹ️ **Line 38** (NEUTRAL)

- Keyword: `any`
- Statement: **Cap PT-1 exploration to ≤4 hours per module; anything longer means rebuild.**

#### system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md

ℹ️ **Line 54** (NEUTRAL)

- Keyword: `SupabaseClient`
- Statement: supabase: SupabaseClient<Database>,

❌ **Line 63** (PROHIBITED)

- Keyword: `SupabaseClient`
- Statement: - **Typed Dependencies**: Factory functions MUST type the `supabase` parameter as `SupabaseClient<Database>`. Never use `any`.

ℹ️ **Line 75** (NEUTRAL)

- Keyword: `SupabaseClient`
- Statement: supabase: SupabaseClient<Database>,

ℹ️ **Line 114** (NEUTRAL)

- Keyword: `createClient`
- Statement: - All mutations and privileged reads run through server actions wrapped by `withServerActionWrapper`; actions call Supabase via `createClient()` and return DTOs mapped in the service layer.

❌ **Line 14** (PROHIBITED)

- Keyword: `any`
- Statement: - **No Anti-Patterns**: Ban dual DB clients, React Query storming, business logic in Zustand stores, `Database = any` shims.

ℹ️ **Line 35** (NEUTRAL)

- Keyword: `any`
- Statement: - Any schema correction = new migration + new generated types (no in-place manual edits).

❌ **Line 63** (PROHIBITED)

- Keyword: `any`
- Statement: - **Typed Dependencies**: Factory functions MUST type the `supabase` parameter as `SupabaseClient<Database>`. Never use `any`.

ℹ️ **Line 81** (NEUTRAL)

- Keyword: `any`
- Statement: export function createCasinoService(supabase: any) {

✅ **Line 110** (REQUIRED)

- Keyword: `any`
- Statement: - Any advanced offline/optimistic behaviour must sit behind domain-specific services with explicit acceptance criteria and integration tests—not global managers.

✅ **Line 129** (REQUIRED)

- Keyword: `any`
- Statement: - Any advanced offline/optimistic behaviour must sit behind domain-specific services with explicit acceptance criteria and integration tests—not global managers.

ℹ️ **Line 173** (NEUTRAL)

- Keyword: `any`
- Statement: - Block `Database = any` shims, manual table redefinitions, and intersection-based schema rebuilds in type modules.

ℹ️ **Line 177** (NEUTRAL)

- Keyword: `any`
- Statement: - Forbid `supabase: any` parameters in service factory functions (violations in `services/casino/index.ts`, `services/mtl/index.ts`).

✅ **Line 183** (REQUIRED)

- Keyword: `any`
- Statement: - **Forbid `as any` type casting to bypass incomplete interfaces** (violation in `services/visit/index.ts:76`). If a method exists in implementation, it MUST be declared in the interface.

ℹ️ **Line 22** (NEUTRAL)

- Keyword: `client instantiation`
- Statement: - Provide shared Supabase client factories for browser/server usage (`lib/supabase/client.ts`, `lib/supabase/server.ts`). No client instantiation inside UI or stores.

#### system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md

ℹ️ **Line 176** (NEUTRAL)

- Keyword: `SupabaseClient`
- Statement: supabase: SupabaseClient<Database>,

✅ **Line 197** (REQUIRED)

- Keyword: `SupabaseClient`
- Statement: // NO: createPlayerService(supabase: any) - must type as SupabaseClient<Database>

❌ **Line 302** (PROHIBITED)

- Keyword: `SupabaseClient`
- Statement: ✅ Type `supabase` parameter as `SupabaseClient<Database>` (never `any`)

ℹ️ **Line 455** (NEUTRAL)

- Keyword: `SupabaseClient`
- Statement: supabase: SupabaseClient<Database>,

ℹ️ **Line 463** (NEUTRAL)

- Keyword: `SupabaseClient`
- Statement: export function createPlayerCrudService(supabase: SupabaseClient<Database>) {

ℹ️ **Line 476** (NEUTRAL)

- Keyword: `SupabaseClient`
- Statement: export function createPlayerBusinessService(supabase: SupabaseClient<Database>) {

ℹ️ **Line 488** (NEUTRAL)

- Keyword: `SupabaseClient`
- Statement: export function createPlayerQueriesService(supabase: SupabaseClient<Database>) {

ℹ️ **Line 10** (NEUTRAL)

- Keyword: `any`
- Statement: - `supabase: any` parameters losing type safety

ℹ️ **Line 11** (NEUTRAL)

- Keyword: `any`
- Statement: - Incomplete interfaces requiring `as any` casting

✅ **Line 197** (REQUIRED)

- Keyword: `any`
- Statement: // NO: createPlayerService(supabase: any) - must type as SupabaseClient<Database>

ℹ️ **Line 198** (NEUTRAL)

- Keyword: `any`
- Statement: // NO: return { ...(service as any).hiddenMethod } - incomplete interfaces

ℹ️ **Line 209** (NEUTRAL)

- Keyword: `any`
- Statement: operation: () => Promise<any>,

❌ **Line 302** (PROHIBITED)

- Keyword: `any`
- Statement: ✅ Type `supabase` parameter as `SupabaseClient<Database>` (never `any`)

❌ **Line 320** (PROHIBITED)

- Keyword: `any`
- Statement: ❌ Type parameters as `any` (violations: Casino, MTL services)

❌ **Line 321** (PROHIBITED)

- Keyword: `any`
- Statement: ❌ Use `as any` type casting to bypass incomplete interfaces (violation: Visit service)

### State Management

#### adr/ADR-001-dual-database-type-strategy.md

ℹ️ **Line 213** (NEUTRAL)

- Keyword: `cache`
- Statement: supabase migration new add_player_rating_cache

ℹ️ **Line 216** (NEUTRAL)

- Keyword: `cache`
- Statement: vim supabase/migrations/20251006120000_add_player_rating_cache.sql

ℹ️ **Line 225** (NEUTRAL)

- Keyword: `cache`
- Statement: # services/player/queries.ts now has RatingCache types

ℹ️ **Line 232** (NEUTRAL)

- Keyword: `cache`
- Statement: git commit -m "Add player rating cache table"

ℹ️ **Line 284** (NEUTRAL)

- Keyword: `cache`
- Statement: Local DB: Has new migration (player_rating_cache table)

ℹ️ **Line 286** (NEUTRAL)

- Keyword: `cache`
- Statement: Local Types: Include player_rating_cache

ℹ️ **Line 287** (NEUTRAL)

- Keyword: `cache`
- Statement: Remote Types: Missing player_rating_cache

ℹ️ **Line 371** (NEUTRAL)

- Keyword: `cache`
- Statement: if git diff --cached --name-only | grep "supabase/migrations"; then

#### adr/ADR-003-state-management-strategy.md

ℹ️ **Line 26** (NEUTRAL)

- Keyword: `React Query`
- Statement: ### React Query for Server State

✅ **Line 264** (REQUIRED)

- Keyword: `React Query`
- Statement: - Server data (players, visits, rating slips) → Use React Query

✅ **Line 265** (REQUIRED)

- Keyword: `React Query`
- Statement: - Fetched data → Use React Query

✅ **Line 271** (REQUIRED)

- Keyword: `React Query`
- Statement: - Filters that drive React Query queries must surface through selector hooks that derive query keys directly from the Zustand state to prevent divergence. Each consuming component should

ℹ️ **Line 275** (NEUTRAL)

- Keyword: `React Query`
- Statement: - React Query remains the single source of truth for server data; Zustand holds only the transient filter inputs and view configuration.

ℹ️ **Line 334** (NEUTRAL)

- Keyword: `React Query`
- Statement: **Planned Pattern**: Real-time hooks update React Query cache

✅ **Line 351** (REQUIRED)

- Keyword: `React Query`
- Statement: 3. **Reconnection handling**: Use React Query's automatic refetch on reconnect

ℹ️ **Line 355** (NEUTRAL)

- Keyword: `React Query`
- Statement: - Single source of truth (React Query cache)

ℹ️ **Line 367** (NEUTRAL)

- Keyword: `React Query`
- Statement: - Server state: React Query (all 6 services tested)

ℹ️ **Line 369** (NEUTRAL)

- Keyword: `React Query`
- Statement: - Real-time: Updates React Query cache (pattern documented)

ℹ️ **Line 376** (NEUTRAL)

- Keyword: `React Query`
- Statement: - Request deduplication (React Query default behavior)

✅ **Line 399** (REQUIRED)

- Keyword: `React Query`
- Statement: - Team must learn React Query patterns

ℹ️ **Line 413** (NEUTRAL)

- Keyword: `React Query`
- Statement: - React Query: ~40kb gzipped

✅ **Line 419** (REQUIRED)

- Keyword: `React Query`
- Statement: - Must mock React Query in tests

ℹ️ **Line 451** (NEUTRAL)

- Keyword: `React Query`
- Statement: - More boilerplate than React Query

ℹ️ **Line 466** (NEUTRAL)

- Keyword: `React Query`
- Statement: - Less TypeScript support than React Query

✅ **Line 492** (REQUIRED)

- Keyword: `React Query`
- Statement: - ✅ React Query configured (`lib/query-client.ts`) - 4 tests passing

✅ **Line 545** (REQUIRED)

- Keyword: `React Query`
- Statement: ### 1. React Query Defaults ✅ RESOLVED

ℹ️ **Line 593** (NEUTRAL)

- Keyword: `React Query`
- Statement: - React Query v5 Docs: https://tanstack.com/query/latest/docs/framework/react/overview

✅ **Line 627** (REQUIRED)

- Keyword: `React Query`
- Statement: ✅ All React Query defaults finalized with rationale

ℹ️ **Line 251** (NEUTRAL)

- Keyword: `Zustand`
- Statement: ### Zustand for UI State

✅ **Line 271** (REQUIRED)

- Keyword: `Zustand`
- Statement: - Filters that drive React Query queries must surface through selector hooks that derive query keys directly from the Zustand state to prevent divergence. Each consuming component should

❌ **Line 274** (PROHIBITED)

- Keyword: `Zustand`
- Statement: - When filters need to be shareable (deep links, collaborative workflows), promote them to URL params with Next.js router helpers and hydrate the Zustand store from the route in layout loaders. The ADR assumes “UI state only” filters during Wave 3, but teams should graduate filters to URL state whenever cross-session persistence or copy/paste links are required.

ℹ️ **Line 275** (NEUTRAL)

- Keyword: `Zustand`
- Statement: - React Query remains the single source of truth for server data; Zustand holds only the transient filter inputs and view configuration.

ℹ️ **Line 368** (NEUTRAL)

- Keyword: `Zustand`
- Statement: - UI state: Zustand (20 tests passing)

ℹ️ **Line 414** (NEUTRAL)

- Keyword: `Zustand`
- Statement: - Zustand: ~1kb gzipped

ℹ️ **Line 472** (NEUTRAL)

- Keyword: `Zustand`
- Statement: ### Alternative 4: Zustand for Everything

✅ **Line 494** (REQUIRED)

- Keyword: `Zustand`
- Statement: - ✅ Zustand stores created (`store/ui-store.ts`, `store/player-store.ts`) - 20 tests passing

ℹ️ **Line 594** (NEUTRAL)

- Keyword: `Zustand`
- Statement: - Zustand Docs: https://docs.pmnd.rs/zustand/getting-started/introduction

ℹ️ **Line 594** (NEUTRAL)

- Keyword: `Zustand`
- Statement: - Zustand Docs: https://docs.pmnd.rs/zustand/getting-started/introduction

✅ **Line 630** (REQUIRED)

- Keyword: `Zustand`
- Statement: ✅ Zustand scope clearly defined and boundaries enforced

ℹ️ **Line 35** (NEUTRAL)

- Keyword: `staleTime`
- Statement: staleTime: 1000 _ 60 _ 5, // 5 minutes

❌ **Line 48** (PROHIBITED)

- Keyword: `staleTime`
- Statement: - **staleTime: 5 minutes**: Balances data freshness with reduced network requests. Casino operations don't require sub-minute updates for most data.

✅ **Line 49** (REQUIRED)

- Keyword: `staleTime`
- Statement: - **gcTime: 30 minutes**: Keeps warm caches available for operators who bounce between views while still bounding memory usage. High-churn domains can override to shorter windows alongside domain-specific `staleTime` values when live data requires it (see below).

✅ **Line 59** (REQUIRED)

- Keyword: `staleTime`
- Statement: **Override Guidance**: The 5-minute/30-minute defaults serve as a baseline. Hook authors should explicitly set shorter `staleTime`/`gcTime` values for high-volatility queries such as live table availability or player status dashboards, and extend the window for infrequently accessed reports. Document any override in the corresponding domain README so cross-team consumers know the expected freshness.

ℹ️ **Line 373** (NEUTRAL)

- Keyword: `staleTime`
- Statement: - Background refetching (5-minute staleTime working)

ℹ️ **Line 391** (NEUTRAL)

- Keyword: `staleTime`
- Statement: - Intelligent caching reduces requests (5-minute staleTime)

✅ **Line 409** (REQUIRED)

- Keyword: `staleTime`
- Statement: - Requires tuning of `staleTime` and `refetchInterval`

ℹ️ **Line 410** (NEUTRAL)

- Keyword: `staleTime`
- Statement: - **Resolution**: 5-minute staleTime balances freshness with performance

ℹ️ **Line 546** (NEUTRAL)

- Keyword: `staleTime`
- Statement: **Question**: What `staleTime` balances freshness vs performance?

ℹ️ **Line 14** (NEUTRAL)

- Keyword: `real-time`
- Statement: - Real-time updates (player status, table events)

ℹ️ **Line 330** (NEUTRAL)

- Keyword: `real-time`
- Statement: ### Real-Time Updates Integration

ℹ️ **Line 334** (NEUTRAL)

- Keyword: `real-time`
- Statement: **Planned Pattern**: Real-time hooks update React Query cache

ℹ️ **Line 352** (NEUTRAL)

- Keyword: `real-time`
- Statement: 4. **Performance impact**: Measure and optimize based on actual real-time load

ℹ️ **Line 356** (NEUTRAL)

- Keyword: `real-time`
- Statement: - Real-time updates flow through established patterns

ℹ️ **Line 357** (NEUTRAL)

- Keyword: `real-time`
- Statement: - No separate real-time state management needed

ℹ️ **Line 358** (NEUTRAL)

- Keyword: `real-time`
- Statement: - Aligns with existing domain-specific real-time hooks pattern

✅ **Line 360** (REQUIRED)

- Keyword: `real-time`
- Statement: **Note**: Real-time patterns will be finalized during feature implementation when actual requirements are known.

ℹ️ **Line 369** (NEUTRAL)

- Keyword: `real-time`
- Statement: - Real-time: Updates React Query cache (pattern documented)

ℹ️ **Line 585** (NEUTRAL)

- Keyword: `real-time`
- Statement: ### 4. Real-Time Integration ⏸️ DEFERRED

✅ **Line 587** (REQUIRED)

- Keyword: `real-time`
- Statement: **Reason**: No real-time features implemented yet. Will be resolved during actual implementation.

ℹ️ **Line 588** (NEUTRAL)

- Keyword: `real-time`
- Statement: **Pattern**: Documented in "Real-Time Updates Integration" section above

ℹ️ **Line 15** (NEUTRAL)

- Keyword: `cache`
- Statement: - Cache invalidation and optimistic updates

✅ **Line 49** (REQUIRED)

- Keyword: `cache`
- Statement: - **gcTime: 30 minutes**: Keeps warm caches available for operators who bounce between views while still bounding memory usage. High-churn domains can override to shorter windows alongside domain-specific `staleTime` values when live data requires it (see below).

ℹ️ **Line 132** (NEUTRAL)

- Keyword: `cache`
- Statement: ### Cache Invalidation Strategy

ℹ️ **Line 192** (NEUTRAL)

- Keyword: `cache`
- Statement: // Remove deleted entity's detail query from cache

ℹ️ **Line 210** (NEUTRAL)

- Keyword: `cache`
- Statement: #### 4. Direct Cache Updates with `setQueryData`

ℹ️ **Line 218** (NEUTRAL)

- Keyword: `cache`
- Statement: // Refresh the detail cache directly from the mutation payload

ℹ️ **Line 221** (NEUTRAL)

- Keyword: `cache`
- Statement: // Merge the updated record into paginated list caches

ℹ️ **Line 239** (NEUTRAL)

- Keyword: `cache`
- Statement: - Optimistic updates already mutated the cache and you need to reconcile with the server response

ℹ️ **Line 273** (NEUTRAL)

- Keyword: `cache`
- Statement: - pass those values into the relevant service query hook so cache keys stay aligned.

ℹ️ **Line 334** (NEUTRAL)

- Keyword: `cache`
- Statement: **Planned Pattern**: Real-time hooks update React Query cache

✅ **Line 340** (REQUIRED)

- Keyword: `cache`
- Statement: // Option 1: Directly update cache (faster, requires complete data)

ℹ️ **Line 355** (NEUTRAL)

- Keyword: `cache`
- Statement: - Single source of truth (React Query cache)

ℹ️ **Line 369** (NEUTRAL)

- Keyword: `cache`
- Statement: - Real-time: Updates React Query cache (pattern documented)

✅ **Line 372** (REQUIRED)

- Keyword: `cache`
- Statement: 2. **Automatic Cache Management** ✅ Validated

ℹ️ **Line 436** (NEUTRAL)

- Keyword: `cache`
- Statement: - Manual cache management

ℹ️ **Line 441** (NEUTRAL)

- Keyword: `cache`
- Statement: **Decision**: Rejected due to missing cache management features

✅ **Line 507** (REQUIRED)

- Keyword: `cache`
- Statement: - ✅ 3 cache invalidation strategies documented

✅ **Line 574** (REQUIRED)

- Keyword: `cache`
- Statement: **Rationale**: Different filter values = different data, should be cached separately

✅ **Line 629** (REQUIRED)

- Keyword: `cache`
- Statement: ✅ All 3 cache invalidation strategies validated

#### adr/ADR-004-real-time-strategy.md

❌ **Line 10** (PROHIBITED)

- Keyword: `React Query`
- Statement: PT-2 enters Week 6 with server state, mutations, and invalidation patterns established (ADR-003). Casino operations require timely awareness of table availability, player status, rating slip lifecycle, and compliance signals. Supabase provides Postgres change feeds via Realtime channels. We must standardize how client code consumes those feeds, keeps the React Query cache current, and avoids resource leaks while maintaining predictable developer ergonomics.

✅ **Line 25** (REQUIRED)

- Keyword: `React Query`
- Statement: - **Typed Payload Contracts**: Channel factories accept generic payload mappers that enforce typed DTOs before they hit React Query callbacks. This keeps server data contracts consistent with existing service DTOs.

✅ **Line 44** (REQUIRED)

- Keyword: `React Query`
- Statement: - **Domain-Specific by Default**: Each domain exposes its own hook (e.g. `usePlayerRealtime`, `useTableAvailabilityRealtime`) that encapsulates filters, payload transforms, and cache wiring. This keeps concerns isolated and matches React Query’s domain-based query keys.

✅ **Line 51** (REQUIRED)

- Keyword: `React Query`
- Statement: - **Foreground/Background Awareness**: When the document visibility changes to hidden for >2 minutes, we pause scheduler execution (queue persists). On visibility regain we flush the queue then rely on React Query’s `refetchOnReconnect` to catch any missed deltas.

⚪ **Line 64** (OPTIONAL)

- Keyword: `React Query`
- Statement: 1. **Predictable Cache Updates**: Scheduler + canonical query keys minimize redundant refetches while keeping React Query aligned with live data.

ℹ️ **Line 80** (NEUTRAL)

- Keyword: `React Query`
- Statement: - **Cons**: Burst events hammer React Query and Supabase with redundant refetches; observed in Table Context prototype. Rejected in favor of scheduler.

ℹ️ **Line 102** (NEUTRAL)

- Keyword: `React Query`
- Statement: - Integrate status listener with React Query `refetchOnReconnect` and UI toast on repeated failures.

✅ **Line 50** (REQUIRED)

- Keyword: `Zustand`
- Statement: - **Backoff & Limits**: Let Supabase handle connection retries but impose a cap of 5 rapid reconnections before surfacing a toast via Zustand UI store prompting users to refresh. This prevents infinite reconnect loops in degraded networks.

ℹ️ **Line 1** (NEUTRAL)

- Keyword: `real-time`
- Statement: # ADR-004: Real-Time Strategy

ℹ️ **Line 29** (NEUTRAL)

- Keyword: `real-time`
- Statement: - **Scheduler Default**: Real-time hooks enqueue cache work into a micro-batched scheduler (`lib/realtime/invalidation-scheduler.ts`). The scheduler coalesces multiple events within a configurable debounce window (default 50ms) and executes a single invalidation/update batch on the next animation frame.

✅ **Line 90** (REQUIRED)

- Keyword: `real-time`
- Statement: - **Cons**: Requires comprehensive conflict resolution and rollback logic not available in Wave 3. Real-time feeds remain necessary for authoritative state. Rejected.

⚪ **Line 112** (OPTIONAL)

- Keyword: `real-time`
- Statement: - Canonical Blueprint MVP PRD (`docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md`) – §3.6 Real-Time & Invalidations

ℹ️ **Line 113** (NEUTRAL)

- Keyword: `real-time`
- Statement: - Balanced Architecture Quick Reference (`docs/patterns/BALANCED_ARCHITECTURE_QUICK.md`) – Real-time deliverables

❌ **Line 10** (PROHIBITED)

- Keyword: `cache`
- Statement: PT-2 enters Week 6 with server state, mutations, and invalidation patterns established (ADR-003). Casino operations require timely awareness of table availability, player status, rating slip lifecycle, and compliance signals. Supabase provides Postgres change feeds via Realtime channels. We must standardize how client code consumes those feeds, keeps the React Query cache current, and avoids resource leaks while maintaining predictable developer ergonomics.

ℹ️ **Line 27** (NEUTRAL)

- Keyword: `cache`
- Statement: ### 2. Event Processing & Cache Updates

ℹ️ **Line 29** (NEUTRAL)

- Keyword: `cache`
- Statement: - **Scheduler Default**: Real-time hooks enqueue cache work into a micro-batched scheduler (`lib/realtime/invalidation-scheduler.ts`). The scheduler coalesces multiple events within a configurable debounce window (default 50ms) and executes a single invalidation/update batch on the next animation frame.

ℹ️ **Line 30** (NEUTRAL)

- Keyword: `cache`
- Statement: - **Hybrid Cache Strategy**:

ℹ️ **Line 31** (NEUTRAL)

- Keyword: `cache`
- Statement: - For payloads that contain complete entity snapshots, hooks call `queryClient.setQueryData` using the patterns defined in ADR-003 §Cache Invalidation (Strategy 4). The scheduler exposes helpers for `setDetail` and `mergeList` operations.

✅ **Line 44** (REQUIRED)

- Keyword: `cache`
- Statement: - **Domain-Specific by Default**: Each domain exposes its own hook (e.g. `usePlayerRealtime`, `useTableAvailabilityRealtime`) that encapsulates filters, payload transforms, and cache wiring. This keeps concerns isolated and matches React Query’s domain-based query keys.

✅ **Line 57** (REQUIRED)

- Keyword: `cache`
- Statement: - **Documentation Alignment**: Domain READMEs must list realtime hooks, channel names, and cache impact so other teams understand downstream invalidations. ADR-003 overrides guide when to favor `setQueryData` vs invalidation.

⚪ **Line 64** (OPTIONAL)

- Keyword: `cache`
- Statement: 1. **Predictable Cache Updates**: Scheduler + canonical query keys minimize redundant refetches while keeping React Query aligned with live data.

✅ **Line 100** (REQUIRED)

- Keyword: `cache`
- Statement: - Implement `useTableAvailabilityRealtime` and `usePlayerStatusRealtime` with unit tests covering mount/unmount, scheduler batching, and cache updates via jest-mock Supabase client.

ℹ️ **Line 106** (NEUTRAL)

- Keyword: `cache`
- Statement: - Add integration tests (Cypress or Jest) simulating rapid updates and reconnection to confirm cache and UI consistency.

#### adr/ADR-005-integrity-enforcement.md

ℹ️ **Line 27** (NEUTRAL)

- Keyword: `real-time`
- Statement: ### Layer 1: IDE & Editor (Real-time)

#### adr/NEXT_STEPS_REPORT.md

ℹ️ **Line 20** (NEUTRAL)

- Keyword: `React Query`
- Statement: - **Week 3 (HORIZONTAL)**: React Query + Zustand for ALL domains → enables vertical UI

ℹ️ **Line 234** (NEUTRAL)

- Keyword: `React Query`
- Statement: **React Query Configuration** - **Affects ALL domains**:

ℹ️ **Line 237** (NEUTRAL)

- Keyword: `React Query`
- Statement: └── query-client.ts # React Query configuration

ℹ️ **Line 246** (NEUTRAL)

- Keyword: `React Query`
- Statement: **Key Decision**: React Query for ALL remote state (server data), Zustand ONLY for ephemeral UI state.

ℹ️ **Line 286** (NEUTRAL)

- Keyword: `React Query`
- Statement: **Pattern**: Wrap ServiceResult → throw on error → React Query error boundary

ℹ️ **Line 578** (NEUTRAL)

- Keyword: `React Query`
- Statement: - React Query + Zustand infrastructure → ALL domains benefit

ℹ️ **Line 653** (NEUTRAL)

- Keyword: `React Query`
- Statement: **Pattern**: Batch invalidations to prevent React Query thrashing on rapid updates.

✅ **Line 696** (REQUIRED)

- Keyword: `React Query`
- Statement: - ✅ React Query managing 100% of server data

✅ **Line 808** (REQUIRED)

- Keyword: `React Query`
- Statement: | React Query learning curve | Low | Medium | Use proven patterns from documentation, simple wrapper first |

✅ **Line 825** (REQUIRED)

- Keyword: `React Query`
- Statement: - ✅ React Query managing all remote state

ℹ️ **Line 20** (NEUTRAL)

- Keyword: `Zustand`
- Statement: - **Week 3 (HORIZONTAL)**: React Query + Zustand for ALL domains → enables vertical UI

ℹ️ **Line 246** (NEUTRAL)

- Keyword: `Zustand`
- Statement: **Key Decision**: React Query for ALL remote state (server data), Zustand ONLY for ephemeral UI state.

ℹ️ **Line 250** (NEUTRAL)

- Keyword: `Zustand`
- Statement: **Zustand UI Store Pattern** - **Affects ALL UI state**:

ℹ️ **Line 435** (NEUTRAL)

- Keyword: `Zustand`
- Statement: #### Vertical Slice 7: Zustand UI Store (Minimal)

❌ **Line 457** (PROHIBITED)

- Keyword: `Zustand`
- Statement: **IMPORTANT**: Zustand stores NEVER contain server data (players, visits, etc.). Only ephemeral UI state (modal visibility, selected IDs, navigation state).

ℹ️ **Line 578** (NEUTRAL)

- Keyword: `Zustand`
- Statement: - React Query + Zustand infrastructure → ALL domains benefit

✅ **Line 697** (REQUIRED)

- Keyword: `Zustand`
- Statement: - ✅ Zustand stores contain ZERO server data (UI state only)

✅ **Line 827** (REQUIRED)

- Keyword: `Zustand`
- Statement: - ✅ Zero Zustand state pollution

ℹ️ **Line 240** (NEUTRAL)

- Keyword: `staleTime`
- Statement: - staleTime: 5 _ 60 _ 1000 (5 minutes)

ℹ️ **Line 213** (NEUTRAL)

- Keyword: `real-time`
- Statement: > **Hybrid Strategy Applied**: Week 1 HORIZONTAL → Weeks 2-3 VERTICAL → Integrated real-time

ℹ️ **Line 535** (NEUTRAL)

- Keyword: `real-time`
- Statement: - Working Player Management UI (search, CRUD, real-time)

ℹ️ **Line 551** (NEUTRAL)

- Keyword: `real-time`
- Statement: - Real-time visit updates

ℹ️ **Line 560** (NEUTRAL)

- Keyword: `real-time`
- Statement: - Real-time rating updates

ℹ️ **Line 570** (NEUTRAL)

- Keyword: `real-time`
- Statement: - Working Visit Tracking UI (lifecycle, real-time)

ℹ️ **Line 571** (NEUTRAL)

- Keyword: `real-time`
- Statement: - Working RatingSlip UI (rating, points, real-time)

ℹ️ **Line 585** (NEUTRAL)

- Keyword: `real-time`
- Statement: **Real-Time**: Integrated per domain (not separate HORIZONTAL phase)

ℹ️ **Line 589** (NEUTRAL)

- Keyword: `real-time`
- Statement: **Week 6: Real-Time Infrastructure** (DEFERRED - integrated in Weeks 4-5)

ℹ️ **Line 591** (NEUTRAL)

- Keyword: `real-time`
- Statement: #### Vertical Slice 11: Real-Time Channel Wrapper

ℹ️ **Line 655** (NEUTRAL)

- Keyword: `real-time`
- Statement: #### Vertical Slice 13: Domain Real-Time Hooks (Player Example)

ℹ️ **Line 684** (NEUTRAL)

- Keyword: `real-time`
- Statement: #### Vertical Slice 14: Real-Time Testing

✅ **Line 699** (REQUIRED)

- Keyword: `real-time`
- Statement: - ✅ Real-time updates <1s latency

✅ **Line 809** (REQUIRED)

- Keyword: `real-time`
- Statement: | Real-time memory leaks | Medium | High | Strict cleanup testing, useEffect dependency audits |

✅ **Line 826** (REQUIRED)

- Keyword: `real-time`
- Statement: - ✅ Real-time updates <1s latency

#### patterns/BALANCED_ARCHITECTURE_QUICK.md

ℹ️ **Line 83** (NEUTRAL)

- Keyword: `React Query`
- Statement: // 4. HOOK: React Query

ℹ️ **Line 434** (NEUTRAL)

- Keyword: `React Query`
- Statement: UIH[UI Hooks - React Query]

ℹ️ **Line 435** (NEUTRAL)

- Keyword: `Zustand`
- Statement: UIState[UI State - Zustand]

ℹ️ **Line 218** (NEUTRAL)

- Keyword: `real-time`
- Statement: - Real-time for specific domains

ℹ️ **Line 236** (NEUTRAL)

- Keyword: `real-time`
- Statement: | **Add real-time to Player** | VERTICAL | Domain-specific | 1 week |

✅ **Line 249** (REQUIRED)

- Keyword: `real-time`
- Statement: ✅ **Manual refresh** - No real-time for MVP (Week 7 enhancement)

ℹ️ **Line 349** (NEUTRAL)

- Keyword: `real-time`
- Statement: ### Week 7: Real-Time Infrastructure (HORIZONTAL)

✅ **Line 353** (REQUIRED)

- Keyword: `real-time`
- Statement: ✅ Domain real-time hooks (Player, Visit, RatingSlip)

ℹ️ **Line 357** (NEUTRAL)

- Keyword: `real-time`
- Statement: **Deliverable**: Real-time synchronization across domains

ℹ️ **Line 456** (NEUTRAL)

- Keyword: `real-time`
- Statement: RT[Real-time]

ℹ️ **Line 160** (NEUTRAL)

- Keyword: `cache`
- Statement: - Batch cache invalidation

ℹ️ **Line 441** (NEUTRAL)

- Keyword: `cache`
- Statement: Cache[Cache Strategies]

ℹ️ **Line 441** (NEUTRAL)

- Keyword: `cache`
- Statement: Cache[Cache Strategies]

ℹ️ **Line 477** (NEUTRAL)

- Keyword: `cache`
- Statement: class SA,Middleware,Cache actionLayer

#### patterns/MTL_DOMAIN_CLASSIFICATION.md

ℹ️ **Line 135** (NEUTRAL)

- Keyword: `React Query`
- Statement: | **UI / API** | Record form, threshold dashboard, report downloads. | Lean React Query + Next.js app |

ℹ️ **Line 152** (NEUTRAL)

- Keyword: `React Query`
- Statement: - React Query caching covers all real-time needs.

ℹ️ **Line 152** (NEUTRAL)

- Keyword: `real-time`
- Statement: - React Query caching covers all real-time needs.

#### patterns/SERVER_ACTIONS_ARCHITECTURE.md

❌ **Line 279** (PROHIBITED)

- Keyword: `React Query`
- Statement: - **DON'T** use server actions for queries (use React Query hooks instead)

ℹ️ **Line 253** (NEUTRAL)

- Keyword: `real-time`
- Statement: │ RLS Policies → Database Operations → Real-time Updates │

#### patterns/SERVICE_RESPONSIBILITY_MATRIX.md

ℹ️ **Line 379** (NEUTRAL)

- Keyword: `React Query`
- Statement: // 4. Invalidate React Query caches

ℹ️ **Line 83** (NEUTRAL)

- Keyword: `cache`
- Statement: │ └──────────▶ Updates RatingSlip.points (denormalized cache) │

ℹ️ **Line 100** (NEUTRAL)

- Keyword: `cache`
- Statement: | **Telemetry** | `RatingSlipService` | • Average bet<br>• Time played<br>• Game settings<br>• Seat number<br>• **points** (cache) | • Player (FK)<br>• Visit (FK)<br>• Gaming Table (FK) | – | **Gameplay measurement** |

ℹ️ **Line 333** (NEUTRAL)

- Keyword: `cache`
- Statement: - `points` - **Denormalized cache from Loyalty** (for query performance)

ℹ️ **Line 338** (NEUTRAL)

- Keyword: `cache`
- Statement: **Key Change**: RatingSlip.points becomes a **read-optimized cache**, NOT the source of truth.

ℹ️ **Line 374** (NEUTRAL)

- Keyword: `cache`
- Statement: // 3. Update RatingSlip with calculated points (denormalized cache)

ℹ️ **Line 379** (NEUTRAL)

- Keyword: `cache`
- Statement: // 4. Invalidate React Query caches

ℹ️ **Line 397** (NEUTRAL)

- Keyword: `cache`
- Statement: 3. **RatingSlip caches result** - points field for fast queries

ℹ️ **Line 594** (NEUTRAL)

- Keyword: `cache`
- Statement: │ points: calculated │ ← Denormalized cache

ℹ️ **Line 721** (NEUTRAL)

- Keyword: `cache`
- Statement: // 3. Cache result in RatingSlip (optimization)

#### patterns/SERVICE_TEMPLATE.md

ℹ️ **Line 587** (NEUTRAL)

- Keyword: `global state`
- Statement: - Global state/singletons

#### system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md

❌ **Line 14** (PROHIBITED)

- Keyword: `React Query`
- Statement: - **No Anti-Patterns**: Ban dual DB clients, React Query storming, business logic in Zustand stores, `Database = any` shims.

ℹ️ **Line 103** (NEUTRAL)

- Keyword: `React Query`
- Statement: - React Query is the sole remote data cache; defaults derive from `lib/query-client.ts` (non-zero `staleTime`, `refetchOnWindowFocus: false`).

✅ **Line 105** (REQUIRED)

- Keyword: `React Query`
- Statement: - React Query hooks (`hooks/service-layer/use-service-query.ts`) become templates for entity/list/mutation operations; overrides for `staleTime: 0` require explicit approval.

❌ **Line 109** (PROHIBITED)

- Keyword: `React Query`
- Statement: - All React Query hooks wrap service-layer DTOs—never raw Supabase rows—and surface consistent loading/error contracts for UI components.

ℹ️ **Line 116** (NEUTRAL)

- Keyword: `React Query`
- Statement: - Default page data loads in Server Components; React Query hooks hydrate from server-provided DTOs or call server actions via fetcher utilities instead of instantiating Supabase clients in the browser.

❌ **Line 120** (PROHIBITED)

- Keyword: `React Query`
- Statement: - Domain React Query hooks do not new up Supabase clients; they consume server actions or Server Component props.

✅ **Line 126** (REQUIRED)

- Keyword: `React Query`
- Statement: - Real-time hooks batch React Query invalidations using the scheduler pattern from `hooks/table-context/useTableContextRealtime.ts`; every subscription must register cleanup on unmount.

✅ **Line 128** (REQUIRED)

- Keyword: `React Query`
- Statement: - Logging and metrics for live data stay inside dev tooling; production hooks should be silent and rely on React Query retries for resilience.

ℹ️ **Line 218** (NEUTRAL)

- Keyword: `React Query`
- Statement: - React Query manages all remote data; Zustand limited to UI-only concerns.

❌ **Line 14** (PROHIBITED)

- Keyword: `Zustand`
- Statement: - **No Anti-Patterns**: Ban dual DB clients, React Query storming, business logic in Zustand stores, `Database = any` shims.

ℹ️ **Line 104** (NEUTRAL)

- Keyword: `Zustand`
- Statement: - Zustand restricted to ephemeral UI state (selection, modal visibility) as demonstrated in `store/player-store.ts`, **ref is available upon request**.

ℹ️ **Line 171** (NEUTRAL)

- Keyword: `Zustand`
- Statement: - ESLint rule: forbid Supabase client creation in Zustand stores/components (legacy issue in `store/casino-store.ts`).

ℹ️ **Line 218** (NEUTRAL)

- Keyword: `Zustand`
- Statement: - React Query manages all remote data; Zustand limited to UI-only concerns.

ℹ️ **Line 103** (NEUTRAL)

- Keyword: `staleTime`
- Statement: - React Query is the sole remote data cache; defaults derive from `lib/query-client.ts` (non-zero `staleTime`, `refetchOnWindowFocus: false`).

✅ **Line 105** (REQUIRED)

- Keyword: `staleTime`
- Statement: - React Query hooks (`hooks/service-layer/use-service-query.ts`) become templates for entity/list/mutation operations; overrides for `staleTime: 0` require explicit approval.

✅ **Line 106** (REQUIRED)

- Keyword: `staleTime`
- Statement: - Queries declare sane `staleTime`/`gcTime` per domain; zero-stale configs require explicit real-time justification and documented invalidation strategy.

✅ **Line 172** (REQUIRED)

- Keyword: `staleTime`
- Statement: - Lint: prohibit `staleTime: 0` unless file opted into real-time policy (violations previously in `hooks/rating-slip/useActiveRatingSlipsByTable.ts`, `components/ui/table/casino-table-ui-v2.tsx`, `components/ui/table/table-seat.tsx`).

❌ **Line 187** (PROHIBITED)

- Keyword: `global state`
- Statement: - Ban service-layer factories that cache or mutate global state (e.g., `ServiceFactory` performance caches); service creation stays pure and request-scoped.

✅ **Line 106** (REQUIRED)

- Keyword: `real-time`
- Statement: - Queries declare sane `staleTime`/`gcTime` per domain; zero-stale configs require explicit real-time justification and documented invalidation strategy.

❌ **Line 117** (PROHIBITED)

- Keyword: `real-time`
- Statement: - Client-side Supabase access (`createBrowserComponentClient`) is reserved for real-time subscriptions or short-lived optimistic flows; wrap usage in documented helpers (`useSupabaseChannel`, scheduler utilities) and never expose raw table queries from the browser.

ℹ️ **Line 123** (NEUTRAL)

- Keyword: `real-time`
- Statement: ### 3.6 Real-Time & Invalidations

✅ **Line 126** (REQUIRED)

- Keyword: `real-time`
- Statement: - Real-time hooks batch React Query invalidations using the scheduler pattern from `hooks/table-context/useTableContextRealtime.ts`; every subscription must register cleanup on unmount.

❌ **Line 127** (PROHIBITED)

- Keyword: `real-time`
- Statement: - Domain hooks manage their own channel lifecycle; avoid cross-cutting singletons such as connection pools, optimistic-update managers, or offline queues under `services/real-time/*`.

✅ **Line 172** (REQUIRED)

- Keyword: `real-time`
- Statement: - Lint: prohibit `staleTime: 0` unless file opted into real-time policy (violations previously in `hooks/rating-slip/useActiveRatingSlipsByTable.ts`, `components/ui/table/casino-table-ui-v2.tsx`, `components/ui/table/table-seat.tsx`).

❌ **Line 186** (PROHIBITED)

- Keyword: `real-time`
- Statement: - Ban global real-time managers (connection pools, optimistic/offline singletons); enforce hook-scoped subscriptions with automated tests.

✅ **Line 210** (REQUIRED)

- Keyword: `real-time`
- Statement: - **Phase 3 (Performance Hardening)** – Apply bundle optimizations, real-time scheduler integration, enforce budgets in CI.

ℹ️ **Line 219** (NEUTRAL)

- Keyword: `real-time`
- Statement: - Real-time updates flow through shared scheduler utilities with clean cleanup semantics.

ℹ️ **Line 103** (NEUTRAL)

- Keyword: `cache`
- Statement: - React Query is the sole remote data cache; defaults derive from `lib/query-client.ts` (non-zero `staleTime`, `refetchOnWindowFocus: false`).

ℹ️ **Line 108** (NEUTRAL)

- Keyword: `cache`
- Statement: - Mutations perform cache updates via `invalidateQueries` or targeted `setQueryData`; optimistic updates stay opt-in and encapsulated in domain helpers.

ℹ️ **Line 118** (NEUTRAL)

- Keyword: `cache`
- Statement: - Mutating server actions document their cache strategy and invoke `revalidatePath`/`revalidateTag` accordingly, with integration tests asserting invalidation behaviour.

❌ **Line 187** (PROHIBITED)

- Keyword: `cache`
- Statement: - Ban service-layer factories that cache or mutate global state (e.g., `ServiceFactory` performance caches); service creation stays pure and request-scoped.

❌ **Line 187** (PROHIBITED)

- Keyword: `cache`
- Statement: - Ban service-layer factories that cache or mutate global state (e.g., `ServiceFactory` performance caches); service creation stays pure and request-scoped.

ℹ️ **Line 203** (NEUTRAL)

- Keyword: `cache`
- Statement: - Rollback plan: keep the previous build artifact and migration revert scripts ready; publish a playbook describing how to restore the last known good schema, redeploy, and invalidate caches.

#### system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md

ℹ️ **Line 37** (NEUTRAL)

- Keyword: `React Query`
- Statement: Hooks[React Query Hooks]

❌ **Line 330** (PROHIBITED)

- Keyword: `React Query`
- Statement: ❌ Use `staleTime: 0` in React Query without justification

ℹ️ **Line 347** (NEUTRAL)

- Keyword: `React Query`
- Statement: - Batch React Query invalidations

❌ **Line 329** (PROHIBITED)

- Keyword: `Zustand`
- Statement: ❌ Store server data in Zustand

❌ **Line 330** (PROHIBITED)

- Keyword: `staleTime`
- Statement: ❌ Use `staleTime: 0` in React Query without justification

ℹ️ **Line 21** (NEUTRAL)

- Keyword: `global state`
- Statement: - Global state management in services

ℹ️ **Line 22** (NEUTRAL)

- Keyword: `real-time`
- Statement: - Global real-time managers (connection pools, offline managers)

ℹ️ **Line 81** (NEUTRAL)

- Keyword: `real-time`
- Statement: RT[Real-time<br/>Subscriptions]

❌ **Line 331** (PROHIBITED)

- Keyword: `real-time`
- Statement: ❌ Create global real-time managers (connection pools, offline managers)

✅ **Line 346** (REQUIRED)

- Keyword: `real-time`
- Statement: - Implement proper cleanup for real-time subscriptions

❌ **Line 522** (PROHIBITED)

- Keyword: `real-time`
- Statement: ❌ **NO** `services/real-time/` - No global real-time managers

❌ **Line 522** (PROHIBITED)

- Keyword: `real-time`
- Statement: ❌ **NO** `services/real-time/` - No global real-time managers

❌ **Line 333** (PROHIBITED)

- Keyword: `cache`
- Statement: ❌ Cache service instances or add internal state

### Exports

#### system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md

❌ **Line 181** (PROHIBITED)

- Keyword: `named export`
- Statement: - Ban mixing default and named exports from service modules; use named exports exclusively for consistency and traceability.

❌ **Line 181** (PROHIBITED)

- Keyword: `named export`
- Statement: - Ban mixing default and named exports from service modules; use named exports exclusively for consistency and traceability.

ℹ️ **Line 86** (NEUTRAL)

- Keyword: `export pattern`
- Statement: - **Consistent Export Pattern**: Export both the factory function and the service type. Name them consistently: `createXService` → `XService` interface → `export type XService`.

#### system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md

ℹ️ **Line 200** (NEUTRAL)

- Keyword: `default export`
- Statement: // NO: default exports mixed with named exports

✅ **Line 312** (REQUIRED)

- Keyword: `default export`
- Statement: ✅ Use named exports exclusively (no default exports)

ℹ️ **Line 26** (NEUTRAL)

- Keyword: `named export`
- Statement: - Mixed default and named exports

ℹ️ **Line 200** (NEUTRAL)

- Keyword: `named export`
- Statement: // NO: default exports mixed with named exports

✅ **Line 312** (REQUIRED)

- Keyword: `named export`
- Statement: ✅ Use named exports exclusively (no default exports)

❌ **Line 324** (PROHIBITED)

- Keyword: `named export`
- Statement: ❌ Mix default and named exports from service modules

---

_End of Architecture Pattern Audit_
