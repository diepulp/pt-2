# Architecture Context for PRD Pipeline

This context file is loaded by the build-pipeline skill during EXECUTION-SPEC generation.
It contains canonical patterns and rules that MUST be validated against.

---

## SRM Reference

**Canonical Document**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
**Current Version**: 4.9.0 (2025-12-25)

Always check the actual SRM file for the current version. Do not hard-code version numbers.

### SRM Ownership Rules

1. Each service owns specific tables - cross-context writes are prohibited
2. Cross-context consumption is via DTOs, RPCs, or published queries only
3. `casino_id` is required on all operational tables (multi-tenancy)

---

## ADR-024: Authoritative Context Derivation (CRITICAL)

**Document**: `docs/80-adrs/ADR-024_DECISIONS.md`
**Status**: Accepted (Frozen)

### Core Rule

**INV-8**: No client-callable RPC may accept `casino_id`/`actor_id` as user input.

### Correct Pattern

```sql
-- CORRECT: Derive casino_id from context
CREATE OR REPLACE FUNCTION rpc_example(p_slip_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER  -- or SECURITY DEFINER with set_rls_context_from_staff()
AS $$
DECLARE
  v_casino_id uuid;
BEGIN
  -- For SECURITY DEFINER RPCs, call this first:
  PERFORM set_rls_context_from_staff();

  -- Derive casino_id from context (NOT from parameter)
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_casino_id IS NULL THEN
    -- Fallback to JWT claim
    v_casino_id := (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid;
  END IF;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set';
  END IF;

  -- Use v_casino_id (derived, not parameter)
  ...
END;
$$;
```

### Anti-Pattern (FORBIDDEN)

```sql
-- WRONG: Accepting casino_id as parameter violates INV-8
CREATE OR REPLACE FUNCTION rpc_example(p_slip_id uuid, p_casino_id uuid)  -- BAD!
RETURNS jsonb AS $$
BEGIN
  -- Using p_casino_id is spoofable!
  SELECT * FROM table WHERE casino_id = p_casino_id;  -- VULNERABLE
END;
$$;
```

### When to Use Each Security Mode

| RPC Type | Security Mode | Context Injection |
|----------|---------------|-------------------|
| Read-only, RLS-protected tables | `SECURITY INVOKER` | Context derived via `current_setting()` + JWT fallback |
| Write operations, audit logging | `SECURITY DEFINER` | Must call `set_rls_context_from_staff()` at start |
| Ops/migration only | `SECURITY DEFINER` | May use `set_rls_context_internal()` (service_role only) |

---

## ADR-030: Auth Pipeline Hardening (CRITICAL)

**Document**: `docs/80-adrs/ADR-030-auth-system-hardening.md`
**Status**: Accepted (2026-01-29)

### Core Changes

| Decision | What Changed |
|----------|-------------|
| **D1 — TOCTOU removal** | `set_rls_context_from_staff()` now `RETURNS TABLE(actor_id, casino_id, staff_role)`. Middleware uses ONLY this return value for `ctx.rlsContext`. |
| **D2 — Claims lifecycle** | `syncUserRLSClaims()` / `clearUserRLSClaims()` failures surfaced (no silent try/catch). Claims cleared on deactivation. |
| **D3 — Bypass lockdown** | `DEV_AUTH_BYPASS` requires `NODE_ENV=development` + `ENABLE_DEV_AUTH=true`. `skipAuth` banned in production. |
| **D4 — Write-path tightening** | INSERT/UPDATE/DELETE on critical tables use session vars only — no JWT COALESCE fallback. |

### Critical Tables (Session-Var-Only Writes)

`staff`, `player`, `player_financial_transaction`, `visit`, `rating_slip`, `loyalty_ledger`

### ADR-030 Invariants

- **INV-030-1**: `ctx.rlsContext` from RPC return value only
- **INV-030-2**: Claim sync/clear failures must be surfaced
- **INV-030-3**: `DEV_AUTH_BYPASS` requires dual gate
- **INV-030-4**: `skipAuth` banned in production source
- **INV-030-5**: Mutations on critical tables fail without session vars
- **INV-030-6**: JWT fallback during SELECT must be logged

---

## DTO Patterns

**Document**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`

### Pattern A: Contract-First (Manual DTOs)

- For complex services with specific shaping needs
- Full control over DTO structure
- Example: PlayerFinancialService

### Pattern B: Pick/Omit from Database Types

- Derive DTOs from `types/database.types.ts`
- Use `Pick<>`, `Omit<>`, or `Partial<>`
- Simpler, less code, tighter coupling to schema

---

## Service Layer Patterns

**Document**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`

### Factory Pattern

```typescript
// CORRECT: Functional factory
export function createExampleService(
  supabase: SupabaseClient<Database>
): ExampleServiceInterface {
  return {
    list: (filters) => crud.list(supabase, filters),
    getById: (id) => crud.getById(supabase, id),
    // ...
  };
}

// WRONG: Class-based service (anti-pattern)
export class ExampleService { /* ... */ }
```

### No ReturnType Inference

```typescript
// CORRECT: Explicit interface
export interface ExampleServiceInterface {
  list(filters?: ListFilters): Promise<{ items: ItemDTO[]; cursor: string | null }>;
  getById(id: string): Promise<ItemDTO | null>;
}

// WRONG: ReturnType inference
export type ExampleServiceInterface = ReturnType<typeof createExampleService>;
```

---

## Temporal Patterns (TEMP-001/002/003, PRD-027)

**Registry:** `docs/20-architecture/temporal-patterns/INDEX.md`

### Canonical Contract

Gaming day computation uses a three-layer function contract:

| Layer | Function | Volatility | Callers |
|-------|----------|-----------|---------|
| **Layer 1** | `compute_gaming_day(ts, gstart time)` | `IMMUTABLE` — pure math | DB triggers |
| **Layer 2** | `compute_gaming_day(casino_id, timestamp)` | `STABLE, SECURITY DEFINER` | Route handlers, RPCs |
| **Layer 3** | `rpc_current_gaming_day(timestamp)` | `STABLE, SECURITY DEFINER` | RSC server helpers, server actions |

### Invariants (non-negotiable)

1. **Database owns `gaming_day`** via `casino_settings` + `compute_gaming_day()`. No JS derivation.
2. **No inline reimplementation** in triggers or stored procedures.
3. **No parameter bypass** — temporal RPCs derive `casino_id` from RLS context (ADR-024).
4. **Banned patterns**: `toISOString().slice(0, 10)`, `new Date()` arithmetic, `getUTC*()` for business dates.

### EXECUTION-SPEC Implications

When generating EXECUTION-SPECs for workstreams that touch `gaming_day`:
- Database workstreams must specify trigger function creation (Layer 1 pattern)
- Service workstreams must use DB RPCs for gaming day — not JS date math
- Frontend workstreams must use `getServerGamingDay()` (RSC) or `useGamingDay()` (client)
- Test workstreams must include boundary tests: pre-boundary, post-boundary, UTC-midnight, DST

**References:** TEMP-001 (spec), TEMP-002 (authority pattern), TEMP-003 (enforcement), PRD-027 (standardization)

---

## Cross-Cutting Rules

1. **No `as any`** - Use proper typing or `unknown` with type guards
2. **No `console.*` in production** - Use structured logging
3. **Types from `database.types.ts` only** - Run `npm run db:types` after migrations
4. **Functional factories** - No class-based services
5. **No JS gaming day computation** - Use DB RPCs per TEMP-001/003
