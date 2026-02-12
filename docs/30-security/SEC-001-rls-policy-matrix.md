---
id: SEC-001
title: Casino-Scoped RLS Policy Matrix
owner: Security
status: Active
affects: [SEC-005, ADR-017]
created: 2025-11-02
last_review: 2025-12-25
updated: 2025-12-25
superseded_by: null
canonical_reference: docs/30-security/SECURITY_TENANCY_UPGRADE.md
related_adrs: [ADR-015, ADR-017, ADR-018, ADR-020, ADR-023, ADR-024, ADR-030]
version: 1.7.0
---

## Overview

This matrix extracts the canonical Row-Level Security (RLS) expectations from the Service Responsibility Matrix (SRM) and consolidates them for every casino-scoped data set. Use it to verify that each schema change, policy, or RPC preserves the least-privilege model defined by the owning service.

**Tenancy Model (ADR-023)**: Pool Primary; Silo Optional. See `SEC-002` §Multi-Tenancy Storage Model for guardrails.

**Canonical Reference**: `docs/30-security/SECURITY_TENANCY_UPGRADE.md` - For complete migration guide, policy templates, and rationale.

**ADR-015 Compliance**: `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` - Canonical RLS patterns for connection pooling compatibility.

## Migration Status

**Schema Foundation**: ✅ **DEPLOYED**
- `staff.user_id uuid references auth.users(id)` - Migration `20251110224223_staff_authentication_upgrade.sql`
- `set_rls_context()` RPC (ADR-015) - Migration `20251209183033_adr015_rls_context_rpc.sql`
- Unique index `staff_user_id_unique` - Partial (where user_id is not null)

**RLS Policies**: ✅ **HYBRID PATTERN DEPLOYED** (Pattern C - Transaction-wrapped with JWT fallback). All new/updated policies must use:
  - `COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid)`
  - `COALESCE(NULLIF(current_setting('app.actor_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid)` for actor alignment when applicable.

**MVP Strategy**: See ADR-020 for Track A (Hybrid) as the MVP architecture. Track B (JWT-only) migration is deferred until production validation prerequisites are met.

**Application Layer**: ⚠️ **IN PROGRESS**
- `withServerAction` wrapper - Updated for ADR-015
- `getAuthContext` helper - Exists in `lib/supabase/rls-context.ts`
- Service key removal - Not yet complete

**See**: `docs/audits/RLS_DOCUMENTATION_DRIFT_ANALYSIS_2025-11-13.md` for complete remediation plan.

---

## Core Principles

- Every casino-scoped table includes a non-null `casino_id` column that anchors ownership.
- Read policies constrain access to authenticated staff from the same `casino_id` via `auth.uid()` → `staff.user_id` lookup.
- **ADR-015 Compliance** - Context injection via transaction-wrapped `set_rls_context()` RPC with JWT fallback.
- **No service keys in runtime** - All operations use anon key + user authentication.
- Write paths are delegated to service-owned RPCs or role-specific policies; direct table writes must be disabled unless explicitly listed.
- Cross-context joins rely on declared foreign keys; implicit string-based joins are forbidden.
- Append-only ledgers (finance, loyalty, compliance) enforce idempotency and block deletes; corrections flow through supervised RPCs.

---

## Policy Matrix

> **Updated 2025-12-16**: PRD-010 RLS MVP Hardening - Added `casino` table RLS (P0 fix), `mtl_audit_note` denial policies.

| Context | Tables / Views | Read Access | Write Path | Notes |
| --- | --- | --- | --- | --- |
| CasinoService (Foundational) | `casino`, `staff`, `casino_settings`, `report` | Authenticated staff in same `casino_id` (role-gated) | Admin (`staff_role = 'admin'`) only; `casino` table is read-only (service_role for setup) | `casino_settings` is the sole temporal authority; policies block cross-casino visibility. Dealers excluded (non-authenticated). **PRD-010**: `casino` table now has RLS (Pattern C hybrid). |
| Player & Visit (Identity & Session) | `player_casino`, `visit` | Authenticated staff in same `casino_id` | Enrollment/Visit services; admin override only | Membership writes funnel through enrollment workflows; prevents cross-property session leakage. **Ghost visits**: `player_id` is NULL but `casino_id` scoping still applies. |
| LoyaltyService (Reward) | `player_loyalty`, `loyalty_ledger` | Authenticated staff in same `casino_id` | `rpc_issue_mid_session_reward` (append-only) | RLS blocks direct ledger updates; idempotency enforced via `idempotency_key`. Only `gaming_identified_rated` visits eligible for accrual. |
| LoyaltyService (Promo Instruments) | `promo_program`, `promo_coupon` | Authenticated staff in same `casino_id` | `rpc_issue_promo_coupon`, `rpc_void_promo_coupon`, `rpc_replace_promo_coupon`, `rpc_promo_coupon_inventory` | **ADR-024**: RPCs MUST call `set_rls_context_from_staff()` (no spoofable inputs). Nullable `player_id`/`visit_id` (Pattern C hybrid). `promo_coupon` is append-only for issuance; status transitions via RPCs. Idempotency via `validation_number` + `idempotency_key`. |
| TableContextService (Operational) | `game_settings`, `gaming_table`, `gaming_table_settings`, `dealer_rotation` | Authenticated operations staff for same `casino_id` | Admin + `pit_boss` roles | Trigger `assert_table_context_casino` enforces table/casino alignment. |
| RatingSlipService (Telemetry) | `rating_slip` | Authenticated staff in same `casino_id` | Authorized telemetry service roles | Policy snapshot and status updates limited to service-managed RPCs. **Updated**: `visit_id` and `table_id` are NOT NULL. |
| PlayerFinancialService (Finance) | `player_financial_transaction` | Authenticated finance, compliance & pit_boss staff in same `casino_id` | `rpc_create_financial_txn` (cashier/admin: full access; pit_boss: table buy-ins only per SEC-005 v1.1.0) | Append-only ledger; deletes disabled; gaming day derived via trigger. Pit boss constraints: direction='in', tender_type IN ('cash','chips'), visit_id required. |
| MTLService (Compliance) | `mtl_entry`, `mtl_audit_note` | Authenticated compliance staff within `casino_id` | Cashier + compliance services with matching `casino_id` | Immutable cash transaction log; notes append-only; thresholds hinge on casino settings. Ghost visits are first-class for CTR/cash movement. **PRD-010**: `mtl_audit_note` explicit denial policies for UPDATE/DELETE (Template 3). |
| CasinoService (Onboarding) | `staff_invite` | Admin-only within `casino_id` (Template 2b session-var-only for ALL ops including SELECT — PII tightening) | Admin-only INSERT/UPDATE; no DELETE | **PRD-025**: Invite-based staff onboarding. Token stored as SHA-256 hash; `token_hash` column not readable by `authenticated` role (column-level privilege restriction). Unique partial index enforces one active invite per casino+email. All three policies (SELECT/INSERT/UPDATE) use NULLIF-only — no COALESCE JWT fallback. |
| CasinoService (Metadata) | `company` | **Deny-by-default** — no permissive policies for `authenticated` role | service_role and SECURITY DEFINER RPCs only | **PRD-025**: Company is organizational metadata, not a security boundary. RLS enabled with zero permissive policies. `company_id` is not part of the RLS context (`app.company_id` does not exist). Access restricted to service_role for administrative operations. |

---

## Canonical RLS Pattern (ADR-015 + ADR-024 Compliant)

**Prerequisites**:
- ✅ `staff.user_id uuid references auth.users(id)` (Migration `20251110224223`)
- ✅ `set_rls_context_from_staff()` RPC for authoritative context derivation (ADR-024 remediation)
- ✅ JWT `app_metadata` with `casino_id` for fallback (Supabase Auth)

> ⚠️ **ADR-024 CRITICAL**: `set_rls_context(p_actor_id, p_casino_id, p_staff_role)` is **DEPRECATED** for client-callable RPCs. It accepts spoofable parameters that enable context injection attacks. All new RPCs MUST use `set_rls_context_from_staff()` which derives context authoritatively from JWT + staff table lookup.

**Pattern C (Hybrid)**: Transaction-wrapped context injection with JWT fallback

This pattern ensures:
1. **User is authenticated** via Supabase auth (`auth.uid()`)
2. **User is linked to active staff** via `staff.user_id`
3. **Casino scope injected** via `set_rls_context_from_staff()` RPC (ADR-024 - authoritative derivation)
4. **JWT fallback** via `auth.jwt() -> 'app_metadata' ->> 'casino_id'`

**Why Hybrid?**
- **Connection pooling safe**: Context setter executes all `SET LOCAL` in single transaction
- **JWT fallback**: Works when context injection is not called (direct Supabase client queries)
- **Security (ADR-024)**: Context derived from authoritative sources, not spoofable inputs

**Deprecated Patterns**:
- ❌ `exec_sql()` loop pattern - fails with connection pooling (ADR-015)
- ❌ `set_rls_context(p_actor_id, p_casino_id, p_staff_role)` - spoofable inputs (ADR-024)

---

## Security Invariants Registry

Consolidated invariants governing the auth/RLS security model. Each invariant is defined by its originating ADR and enforced through migrations, middleware, and tests.

### ADR-024 Invariants (Context Derivation)

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| **INV-1** | `set_rls_context(...)` MUST NOT be executable by `authenticated` or `PUBLIC` roles | Migration: `REVOKE EXECUTE` |
| **INV-2** | Only `set_rls_context_from_staff()` is callable by client roles for context injection | Migration: `GRANT EXECUTE` scoping |
| **INV-3** | Staff identity MUST be bound to `auth.uid()` even when `staff_id` claim exists in JWT | RPC validation logic |
| **INV-4** | Inactive staff MUST be blocked from deriving context | RPC: `WHERE status = 'active'` |
| **INV-5** | Context MUST be set via `SET LOCAL` and MUST NOT leak across transactions (pooling safety) | `set_config(..., true)` third arg |
| **INV-6** | Staff lookup MUST be deterministic (unique `staff.user_id` constraint, no `LIMIT 1` ambiguity) | Partial unique index on `staff.user_id` |
| **INV-7** | All client-callable RPCs MUST call `set_rls_context_from_staff()` as first statement | ADR-015 scanner, PRD-015 remediation |
| **INV-8** | No client-callable RPC may accept `casino_id`/`actor_id` as user input (ops-only exceptions allowed) | Code review, ADR-024 compliance |

### ADR-030 Invariants (Auth Pipeline Hardening)

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| **INV-030-1** | `ctx.rlsContext` MUST be populated from the return value of `set_rls_context_from_staff()`, not from any independent derivation | `withRLS` middleware refactor (PR-1) |
| **INV-030-2** | JWT claim sync/clear failures MUST be surfaced to callers (no silent swallowing) | Remove silent `try/catch` in `CasinoService` (PR-2) |
| **INV-030-3** | `DEV_AUTH_BYPASS` MUST require `NODE_ENV=development` AND `ENABLE_DEV_AUTH=true`; violation at startup is a hard failure | `dev-context.ts` gate + startup check (PR-3) |
| **INV-030-4** | `skipAuth` MUST NOT appear in production source files | CI lint test (PR-3) |
| **INV-030-5** | Mutations (INSERT/UPDATE/DELETE) on security-critical tables MUST fail if `app.casino_id` session variable is absent, regardless of JWT claims | Write-path RLS policy migration (PR-4) |
| **INV-030-6** | JWT fallback reliance during SELECT MUST be logged at the application layer | App-layer structured logging (PR-4) |
| **INV-030-7** | Writes against Template 2b policies MUST use self-contained SECURITY DEFINER RPCs with internal `set_rls_context_from_staff()`. Direct PostgREST DML (`.from(table).insert/update/delete`) is PROHIBITED — session vars are transaction-local and lost across HTTP requests. | CI grep guard + code review checklist (D5) |

**References:** [ADR-024](../80-adrs/ADR-024_DECISIONS.md), [ADR-030](../80-adrs/ADR-030-auth-system-hardening.md)

---

## Policy Templates

> **Note**: Pattern C (Hybrid) is the recommended pattern for all new policies. Legacy patterns are documented for migration reference only.

### Template 1: Read Access (Hybrid - Preferred)

**Use For**: Most casino-scoped tables (visit, rating_slip, gaming_table, etc.)

**Pattern C (ADR-015 Compliant)**:

```sql
-- Enable RLS
alter table {table_name} enable row level security;

-- Read policy (hybrid pattern with JWT fallback)
create policy "{table_name}_read_hybrid"
  on {table_name}
  for select using (
    -- Verify authenticated user
    auth.uid() IS NOT NULL
    -- Verify casino scope (SET LOCAL with JWT fallback)
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

**How it works**:
1. `auth.uid() IS NOT NULL` - Ensures user is authenticated via Supabase auth
2. `COALESCE(...)` - Tries transaction context first, falls back to JWT
3. `current_setting('app.casino_id', true)` - Injected by `set_rls_context_from_staff()` RPC (ADR-024)
4. `NULLIF(..., '')` - Treats empty string as NULL (connection pooling edge case)
5. `auth.jwt() -> 'app_metadata' ->> 'casino_id'` - JWT fallback for direct client queries
6. If all conditions match, user can read rows from their casino only

**Connection Pooling Safe**: This pattern works with Supabase transaction-mode pooling because:
- `set_rls_context_from_staff()` wraps all `SET LOCAL` in single RPC call (same transaction)
- JWT fallback ensures policy never fails if context not set

**Dealers**: Automatically excluded (dealers have `user_id = null`, cannot satisfy `auth.uid()` check)

---

### Template 1b: Read Access (Legacy - Migration Path)

**Use For**: Existing tables during migration to Pattern C

```sql
-- Legacy pattern (deprecated - fails with connection pooling)
create policy "{table_name}_read_legacy"
  on {table_name}
  for select using (
    auth.uid() = (
      select user_id
      from staff
      where id = current_setting('app.actor_id')::uuid
    )
    AND casino_id = current_setting('app.casino_id')::uuid
  );
```

**Warning**: This pattern is deprecated. Use Template 1 (Hybrid) for new policies.

---

### Template 2: Write Access (Role-Gated, Hybrid)

**Use For**: Tables requiring specific roles (pit_boss, admin)

> **ADR-030 (INV-030-5):** For security-critical tables (`staff`, `player`, `player_financial_transaction`, `visit`, `rating_slip`, `loyalty_ledger`), write policies MUST require session variables — no JWT COALESCE fallback. See Template 2b below. Other tables may continue using Pattern C until v0.2 rollout.

**Pattern C (ADR-015 Compliant)**:

```sql
-- Write policy (role-gated with hybrid context)
create policy "{table_name}_insert_authorized_roles"
  on {table_name}
  for insert with check (
    -- Verify authenticated user with required role
    auth.uid() IN (
      select user_id
      from staff
      where casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      and role in ('pit_boss', 'admin')
      and status = 'active'
      and user_id IS NOT NULL
    )
    -- Verify casino scope
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- Update policy (same pattern)
create policy "{table_name}_update_authorized_roles"
  on {table_name}
  for update using (
    auth.uid() IN (
      select user_id
      from staff
      where casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      and role in ('pit_boss', 'admin')
      and status = 'active'
      and user_id IS NOT NULL
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

**Role Variations**:
- Admin only: `role = 'admin'`
- Operations: `role in ('pit_boss', 'admin')`
- Financial: `role in ('cashier', 'admin')` - Cashier is a primary `staff_role` enum value (ADR-017)
- Compliance: `role in ('compliance', 'admin')` - Future service claim (see SEC-005)

**Connection Pooling Safe**: Uses hybrid context resolution for both role check and casino scope verification.

---

### Template 2b: Write Access — Session Vars Required (ADR-030)

**Use For**: INSERT/UPDATE/DELETE on security-critical tables (per INV-030-5)

**Rationale:** If `withRLS` is skipped (via `skipAuth`, error, or misconfiguration), the COALESCE fallback would allow writes using stale JWT claims. Write policies on critical tables must fail closed.

> **INV-030-7 Transport Constraint (ADR-030 D5):** Application code MUST NOT use `.from(table).insert/update/delete` against tables with Template 2b policies. Session vars set by the middleware's `set_rls_context_from_staff()` RPC are transaction-local (`set_config(name, val, true)`) and do not survive across separate PostgREST HTTP requests. All Template 2b writes MUST go through self-contained SECURITY DEFINER RPCs that call `set_rls_context_from_staff()` internally. See [ISSUE-SET-PIN-SILENT-RLS-FAILURE](../issues/ISSUE-SET-PIN-SILENT-RLS-FAILURE.md) for the failure case.

```sql
-- Write policy (session vars required — no JWT fallback)
create policy "{table_name}_insert_session_required"
  on {table_name}
  for insert with check (
    auth.uid() IN (
      select user_id
      from staff
      where casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
      and role in ('pit_boss', 'admin')
      and status = 'active'
      and user_id IS NOT NULL
    )
    AND casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
  );
```

**Key difference from Template 2:** No `COALESCE(..., auth.jwt()...)` — if `app.casino_id` is unset, the cast to `uuid` of an empty/null string yields `NULL`, and the equality check fails. Writes are denied.

**Applies to:** `staff`, `staff_pin_attempts`, `staff_invite`, `player_casino`, `player_financial_transaction`, `visit`, `rating_slip`, `loyalty_ledger`

**SELECT policies** on these tables retain the COALESCE fallback (Template 1) until v0.2.

---

### Template 3: Append-Only Ledger (Finance, Loyalty, MTL, Hybrid)

**Use For**: Financial transactions, loyalty ledger, MTL entries

**Pattern C (ADR-015 Compliant)**:

```sql
-- Insert only (role-gated with hybrid context)
create policy "{table_name}_append_authorized"
  on {table_name}
  for insert with check (
    auth.uid() IN (
      select user_id
      from staff
      where casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      and role in ('cashier', 'admin')  -- Adjust roles as needed
      and status = 'active'
      and user_id IS NOT NULL
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- Explicitly deny updates
create policy "{table_name}_no_updates"
  on {table_name}
  for update using (false);

-- Explicitly deny deletes
create policy "{table_name}_no_deletes"
  on {table_name}
  for delete using (false);
```

**Idempotency**: Tables MUST include `idempotency_key` column with partial unique index:
```sql
create unique index ux_{table}_idempotency
  on {table_name} (casino_id, idempotency_key)
  where idempotency_key is not null;
```

**Connection Pooling Safe**: Hybrid context ensures append-only ledgers work reliably with connection pooling.

---

### Template 4: Admin Global Override (Use Sparingly)

**Use For**: System-wide admin operations (emergency access, cross-casino reporting)

```sql
create policy "{table_name}_admin_global_access"
  on {table_name}
  for all using (
    auth.uid() = (
      select user_id
      from staff
      where id = current_setting('app.actor_id')::uuid
      and role = 'admin'
      and status = 'active'
    )
    -- Note: No casino_id check - global admin access
  );
```

**⚠️ WARNING**: Use only when absolutely necessary. Prefer casino-scoped policies.

---

### Template 5: RPC Casino Scope Validation (Required for All Mutations)

**Use For**: All service-owned RPCs that accept `casino_id` as a parameter

> **MANDATORY (ADR-018):** All SECURITY DEFINER functions that accept `p_casino_id` as a parameter MUST include this validation block. This is enforced by pre-commit hook. See `docs/80-adrs/ADR-018-security-definer-governance.md` for rationale.

**Pattern**:

```sql
CREATE OR REPLACE FUNCTION rpc_example_mutation(
  p_casino_id uuid,
  p_other_params text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001, SEC-003)
  -- RPC must validate casino_id alignment - never trust caller input alone
  -- ═══════════════════════════════════════════════════════════════════════════
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  IF p_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;
  -- ═══════════════════════════════════════════════════════════════════════════

  -- Proceed with mutation...
END;
$$;
```

**Why This Matters**:
- RLS policies provide defense-in-depth but RPCs run as `SECURITY DEFINER`
- Caller-provided `casino_id` could differ from authenticated context
- Explicit validation prevents privilege escalation before INSERT/UPDATE
- SEC-003:60 mandates: "validate both role/claim and casino_id parity before executing mutations"

**Alternative**: Derive `casino_id` from context instead of accepting as parameter:
```sql
-- Option B: No p_casino_id parameter; always use context
v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
INSERT INTO table (casino_id, ...) VALUES (v_casino_id, ...);
```

---

## RLS Context Injection (ADR-015 + ADR-024)

**Required**: All Server Actions MUST use `withServerAction` wrapper to inject RLS context.

> ⚠️ **ADR-024 CRITICAL**: Client-callable RPCs MUST use `set_rls_context_from_staff()` which derives context authoritatively. The old `set_rls_context(p_actor_id, p_casino_id, p_staff_role)` is **DEPRECATED** because it accepts spoofable parameters.

### Authoritative Context Setter (ADR-024 - REQUIRED for new RPCs)

```sql
-- ADR-024: Authoritative context derivation (NO spoofable inputs)
CREATE OR REPLACE FUNCTION set_rls_context_from_staff(
  p_correlation_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_staff_id uuid;
  v_casino_id uuid;
  v_staff_role text;
BEGIN
  -- 1. Get authenticated user from JWT (authoritative)
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: No authenticated user';
  END IF;

  -- 2. Lookup staff from authoritative source (staff table)
  SELECT id, casino_id, role INTO v_staff_id, v_casino_id, v_staff_role
  FROM staff
  WHERE user_id = v_user_id AND status = 'active'
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: User is not active staff';
  END IF;

  -- 3. Set transaction-local context (pooler-safe)
  PERFORM set_config('app.actor_id', v_staff_id::text, true);
  PERFORM set_config('app.casino_id', v_casino_id::text, true);
  PERFORM set_config('app.staff_role', v_staff_role, true);

  IF p_correlation_id IS NOT NULL THEN
    PERFORM set_config('application_name', LEFT(p_correlation_id, 63), true);
  END IF;
END;
$$;
```

**Security Invariants (ADR-024)**:
- **INV-7**: All client-callable RPCs MUST call `set_rls_context_from_staff()` as first statement
- **INV-8**: No client-callable RPC may accept `casino_id`/`actor_id` as user input
- Context derived from `auth.uid()` → `staff` table lookup (authoritative)
- Only `correlation_id` allowed as optional input parameter

### TypeScript Implementation (`lib/server-actions/middleware/rls.ts`)

```typescript
/**
 * RLS middleware - injects context via set_rls_context_from_staff() (ADR-024)
 *
 * Context is derived authoritatively from JWT + staff table.
 * No spoofable inputs accepted.
 */
export function withRLS<T>(): Middleware<T> {
  return async (ctx, next) => {
    // Call authoritative context setter (ADR-024)
    await ctx.supabase.rpc('set_rls_context_from_staff', {
      p_correlation_id: ctx.correlationId,
    });
    return next();
  };
}
```

### Deprecated Pattern (ADR-015 - DO NOT USE for new RPCs)

```sql
-- ❌ DEPRECATED: Accepts spoofable inputs (ADR-024 security vulnerability)
CREATE OR REPLACE FUNCTION set_rls_context(
  p_actor_id uuid,      -- ❌ Spoofable
  p_casino_id uuid,     -- ❌ Spoofable
  p_staff_role text,    -- ❌ Spoofable
  p_correlation_id text DEFAULT NULL
) RETURNS void
-- ... omitted - see ADR-024 for deprecation rationale
```

**When to use deprecated pattern**: ONLY for internal/migration scripts with `service_role`. Never for client-callable RPCs.

**Server Action Example**:

```typescript
export async function checkInAction(input: CheckInInput) {
  const supabase = await createClient();

  return withServerAction(
    async () => {
      // RLS context automatically injected by wrapper via set_rls_context() RPC
      const { data, error } = await supabase
        .from('visit')
        .insert({
          player_id: input.playerId,
          casino_id: input.casinoId, // Must match current_setting('app.casino_id')
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    {
      supabase,
      endpoint: 'visit.check-in',
      action: 'visit.create',
    },
  );
}
```

**Why ADR-015?**
- Single RPC call ensures all `SET LOCAL` statements execute in same transaction
- Connection pooling safe (Supabase Supavisor transaction mode compatible)
- Hybrid policies provide JWT fallback for robustness

---

## Anti-Patterns

### ❌ DON'T: Use JWT Claims Only (Without Fallback)

```sql
-- ❌ DISCOURAGED: JWT-only policies can be stale and lack role freshness
create policy "visit_read_jwt_only"
  on visit for select using (
    casino_id::text = auth.jwt() ->> 'casino_id'
    OR auth.jwt() ->> 'role' = 'admin'
  );
```

**Problems**:
- JWT claims not refreshed until next login (stale role data)
- Complex OR trees hard to audit
- Type mismatches (uuid vs text casting)

### ❌ DON'T: Use Legacy SET LOCAL Loop Pattern

```sql
-- ❌ BAD: Fails with connection pooling (each SET LOCAL on different connection)
-- Deprecated pattern from pre-ADR-015
FOR stmt IN array_of_statements LOOP
  EXECUTE 'SET LOCAL ' || stmt;
END LOOP;
```

**Problems**:
- Connection pooling breaks SET LOCAL across statements
- Intermittent failures (context lost between queries)
- See ADR-015 for technical details

### ✅ DO: Use Hybrid Pattern (Pattern C)

```sql
-- ✅ GOOD: Transaction-wrapped context with JWT fallback (ADR-015)
create policy "visit_read_hybrid"
  on visit for select using (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

**Benefits**:
- Connection pooling safe (set_rls_context() RPC is transaction-wrapped)
- JWT fallback ensures robustness
- Fresh role data from database (via set_rls_context)
- Strongly typed, deterministic

---

### ❌ DON'T: Use Service Keys in Runtime

```typescript
// ❌ BAD: Bypasses all RLS policies
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Dangerous!
);
```

**Problems**:
- Cross-tenant data leakage
- Privilege escalation
- No audit trail of who accessed what

### ✅ DO: Use Anon Key + User Context

```typescript
// ✅ GOOD: RLS enforced via auth.uid() and session context
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```

**When to use service key** (rare):
- Background jobs with system-level access (must still set `app.casino_id`)
- System migrations (one-time scripts)
- Admin tools with explicit audit logging

---

### ❌ DON'T: Complex OR Trees

```sql
-- ❌ BAD: Hard to audit, prone to logic errors
create policy "complex_bad"
  on visit for select using (
    casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    OR current_setting('app.staff_role') = 'admin'
    OR current_setting('app.permissions')::jsonb @> '["global.read"]'
    OR is_public = true
  );
```

### ✅ DO: Single Deterministic Path

```sql
-- ✅ GOOD: One path, easy to verify
create policy "simple_good"
  on visit for select using (
    auth.uid() = (
      select user_id
      from staff
      where id = COALESCE(
        NULLIF(current_setting('app.actor_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      )
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

---

## Verification Checklist

**Schema (ADR-015)**:
- [ ] Table DDL includes `casino_id uuid not null references casino(id)`.
- [ ] Table has RLS enabled (`alter table {table} enable row level security`).
- [ ] `staff.user_id` column exists (`\d staff` shows it).
- [ ] `set_rls_context()` RPC exists (`\df set_rls_context` shows it - Migration `20251209183033`).
- [ ] JWT `app_metadata` includes `casino_id` for fallback.

**Policies (Pattern C - Hybrid)**:
- [ ] Policies use `auth.uid() IS NOT NULL` for authentication check.
- [ ] Policies use hybrid `COALESCE()` pattern for `casino_id` resolution:
  - `NULLIF(current_setting('app.casino_id', true), '')::uuid` (transaction context)
  - `(auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid` (JWT fallback)
- [ ] Actor identity/role checks use hybrid `COALESCE()` for `app.actor_id` / `app.staff_role` with JWT fallback (`staff_id`, `staff_role`).
- [ ] Read policies defined for `SELECT`.
- [ ] Write policies defined for `INSERT`, `UPDATE`, `DELETE` as appropriate.
- [ ] Role-gated policies check `staff.casino_id` matches context (no cross-casino role checks).
- [ ] Append-only ledgers have `no_updates` and `no_deletes` policies.

**RPCs**:
- [ ] Service-owned RPCs validate `casino_id` alignment.
- [ ] RPCs use `security definer` where needed.
- [ ] RPCs enforce idempotency via `idempotency_key` for mutations.
- [ ] All RPC context injection uses `set_rls_context()` (not legacy `exec_sql` loop).

**Application**:
- [ ] Server Actions use `withServerAction` wrapper.
- [ ] `injectRLSContext()` calls `set_rls_context()` RPC (ADR-015 compliant).
- [ ] No `SERVICE_ROLE_KEY` in runtime code (grep codebase).
- [ ] All mutations include `x-idempotency-key` header.
- [ ] All requests include `x-correlation-id` header.

**Access**:
- [ ] No direct table grants exist outside RLS policies.
- [ ] Cross-context access uses DTOs (not direct table reads).
- [ ] Ledger-style tables route corrections through supervised RPCs.

**ADR-015 Compliance**:
- [ ] No legacy `exec_sql()` loop patterns in codebase.
- [ ] All policies support hybrid context resolution.
- [ ] Connection pooling compatibility verified (transaction mode).

---

## Testing RLS Policies

**Manual Test (ADR-015)**:

```sql
-- Set RLS context using set_rls_context() RPC (ADR-015)
SELECT set_rls_context(
  p_actor_id := '00000000-0000-0000-0000-000000000001',
  p_casino_id := 'casino-1-uuid',
  p_staff_role := 'pit_boss',
  p_correlation_id := 'test-correlation-id'
);

-- Should return only casino-1 visits
select count(*) from visit;

-- Should FAIL (cross-casino access)
insert into visit (player_id, casino_id, started_at)
values ('player-uuid', 'casino-2-uuid', now());
-- Expected: violates row-level security policy

-- Should SUCCEED (same casino)
insert into visit (player_id, casino_id, started_at)
values ('player-uuid', 'casino-1-uuid', now());
```

**Testing Hybrid Fallback (JWT)**:

```sql
-- Test without SET LOCAL (JWT fallback should work)
-- Ensure test user has app_metadata.casino_id set in Supabase Auth
select count(*) from visit;
-- Should still return casino-scoped results via JWT fallback
```

**Automated Test** (recommended):

See `docs/30-security/SECURITY_TENANCY_UPGRADE.md` lines 659-676 for complete test suite.

---

## Migration Priority

**Phase 1: Critical Tables** (Deploy First)
1. `player_financial_transaction` (Finance)
2. `loyalty_ledger` (Loyalty)
3. `mtl_entry`, `mtl_audit_note` (Compliance)

**Phase 2: Operational Tables**
4. `visit` (Session)
5. `rating_slip` (Telemetry)
6. `player_loyalty` (Balance)

**Phase 3: Administrative Tables**
7. `gaming_table`, `dealer_rotation` (TableContext)
8. `floor_layout*` (FloorLayout)
9. `staff`, `casino_settings` (Casino)

**See**: `docs/audits/RLS_DOCUMENTATION_DRIFT_ANALYSIS_2025-11-13.md` for complete migration plan.

---

## References

- **Canonical Guide**: `docs/30-security/SECURITY_TENANCY_UPGRADE.md` (AUTHORITATIVE)
- **ADR-015**: `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` (Connection pooling strategy, Pattern C)
- **ADR-020**: `docs/80-adrs/ADR-020-rls-track-a-mvp-strategy.md` (MVP strategy - Track A Hybrid)
- **ADR-024**: `docs/80-adrs/ADR-024_DECISIONS.md` (Context self-injection remediation - CRITICAL)
- **SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (v3.1.0)
- **Migration Analysis**: `docs/audits/RLS_DOCUMENTATION_DRIFT_ANALYSIS_2025-11-13.md`
- **RLS Middleware**: `lib/server-actions/middleware/rls.ts` (ADR-024 compliant)
- **WRAPPER**: `lib/server-actions/middleware/compositor.ts`
- **RPC (Authoritative)**: `set_rls_context_from_staff()` (ADR-024)
- **RPC (Deprecated)**: `set_rls_context()` (ADR-015 - internal use only)

---

**Status**: ✅ **ADR-015 + ADR-024 + ADR-030 COMPLIANT** (2026-01-29)
**Migration**: ✅ Schema deployed, `set_rls_context_from_staff()` RPC returns authoritative context (ADR-030 D1)
**Pattern**: Pattern C (Hybrid) - Transaction-wrapped context with JWT fallback; **write-path session-var-only on critical tables** (ADR-030 D4)
**Security**: ADR-030 hardening implemented — TOCTOU removal, claims lifecycle, bypass lockdown, write-path enforcement
**Next**: v0.2 — extend session-var-only write policies to remaining tables; evaluate Track B migration

---

## Category A/B Write Posture Cross-Reference (ADR-034)

ADR-034 defines two RLS write postures with CI enforcement. This section maps each casino-scoped table to its posture.

| Table | Category | Write Posture | Write Mechanism | CI Enforced |
|-------|----------|--------------|-----------------|-------------|
| `staff` | **A** | Session-var-only (Template 2b) | `rpc_create_staff`, `rpc_set_staff_pin` | Yes |
| `staff_pin_attempts` | **A** | Session-var-only (Template 2b) | `rpc_increment_pin_attempt`, `rpc_clear_pin_attempts` | Yes |
| `staff_invite` | **A** | Session-var-only (Template 2b, all ops) | `rpc_create_staff_invite`, `rpc_accept_staff_invite` | Yes |
| `player_casino` | **A** | Session-var-only (Template 2b) | `rpc_create_player`, `rpc_enroll_player` | Yes |
| `player` | **B** | Hybrid COALESCE (Template 2) | PostgREST DML (authenticated client) | No |
| `casino` | N/A | Read-only (service_role for setup) | `rpc_bootstrap_casino` | No |
| `casino_settings` | **B** | Hybrid COALESCE | `rpc_complete_casino_setup`, PostgREST DML | No |
| `visit` | **B** (D4 target) | Hybrid COALESCE (Template 2) | PostgREST DML | Pending migration to A |
| `rating_slip` | **B** (D4 target) | Hybrid COALESCE (Template 2) | PostgREST DML | Pending migration to A |
| `player_financial_transaction` | **B** (D4 target) | Append-only (Template 3) | `rpc_create_financial_txn` | Pending migration to A |
| `loyalty_ledger` | **B** (D4 target) | Append-only (Template 3) | `rpc_issue_mid_session_reward` | Pending migration to A |
| `game_settings` | **B** | Hybrid COALESCE | PostgREST DML | No |
| `gaming_table` | **B** | Hybrid COALESCE | PostgREST DML | No |

**Canonical source of truth**: Category A table list is owned by ADR-030 (`<!-- CATEGORY-A-REGISTRY -->` block). CI lint config generated by `npm run generate:category-a`.

**Reference**: [ADR-034](../80-adrs/ADR-034-RLS-write-path-compatibility-and-enforcement.md)

---

### Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2026-02-11 | **ADR-034 Ratification**: Added Category A/B Write Posture Cross-Reference section. Updated Template 2b applies-to list (added `staff_pin_attempts`, `staff_invite`, `player_casino`). Category A table registry sourced from ADR-030. |
| 1.9.0 | 2026-02-10 | **ADR-030 D5**: Added INV-030-7 transport constraint to Template 2b — direct PostgREST DML prohibited, SECURITY DEFINER RPCs required. Triggered by ISSUE-SET-PIN-SILENT-RLS-FAILURE. |
| 1.8.0 | 2026-01-31 | **PRD-025 Onboarding**: Added `staff_invite` (admin-only, Template 2b session-var-only for ALL ops — PII tightening) and `company` (deny-by-default, no permissive policies) to Policy Matrix. Column-level privilege restriction on `token_hash`. |
| 1.7.0 | 2026-01-29 | **ADR-030 Alignment**: Added consolidated Security Invariants Registry (ADR-024 INV-1–8 + ADR-030 INV-030-1–6). Added Template 2b for write-path session-var-required policies (INV-030-5). Noted ADR-030 write-path tightening on Template 2. |
| 1.6.0 | 2026-01-06 | **ADR-024 Alignment**: Updated Canonical RLS Pattern section to require `set_rls_context_from_staff()`. Deprecated `set_rls_context()` for client-callable RPCs. Added security invariants INV-7/INV-8. Updated RLS Context Injection section with authoritative context setter. |
| 1.5.0 | 2026-01-06 | **PRD-LOYALTY-PROMO**: Added `promo_program`, `promo_coupon` tables to LoyaltyService (Promo Instruments) context. RPCs require ADR-024 compliance (`set_rls_context_from_staff()`). |
| 1.3.0 | 2025-12-12 | **ADR-018 Reference**: Template 5 marked as MANDATORY for SECURITY DEFINER functions. Added cross-reference to ADR-018 governance pattern. |
| 1.2.0 | 2025-12-10 | Added **Template 5: RPC Casino Scope Validation**. Documents required pattern for service-owned RPCs to validate `p_casino_id` matches `current_setting('app.casino_id')`. |
| 1.1.0 | 2025-12-10 | **ADR-017 Compliance**: Added cashier to authenticated staff roles. Updated Role Variations to document cashier as primary `staff_role` enum value. |
| 1.0.0 | 2025-12-10 | Initial version with ADR-015 compliance. |
