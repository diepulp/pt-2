# RLS Policy Templates

Complete policy templates for PT-2 casino-scoped tables. All templates follow ADR-015 Pattern C (Hybrid).

## Template 1: Read Access (Standard)

Use for most casino-scoped tables (visit, rating_slip, gaming_table, etc.)

```sql
-- Enable RLS
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;

-- Read policy (hybrid pattern with JWT fallback)
CREATE POLICY "{table_name}_read_hybrid"
  ON {table_name}
  FOR SELECT USING (
    -- Verify authenticated user
    auth.uid() IS NOT NULL
    -- Verify casino scope (SET LOCAL with JWT fallback)
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

**How it works:**
1. `auth.uid() IS NOT NULL` - Ensures user is authenticated via Supabase auth
2. `COALESCE(...)` - Tries transaction context first, falls back to JWT
3. `current_setting('app.casino_id', true)` - Injected by `set_rls_context()` RPC
4. `NULLIF(..., '')` - Treats empty string as NULL (connection pooling edge case)
5. `auth.jwt() -> 'app_metadata' ->> 'casino_id'` - JWT fallback for direct client queries

**Dealers**: Automatically excluded (dealers have `user_id = null`, cannot satisfy `auth.uid()` check)

---

## Template 2: Write Access (Role-Gated)

Use for tables requiring specific roles (pit_boss, admin, cashier).

```sql
-- Write policy (role-gated with hybrid context)
CREATE POLICY "{table_name}_insert_authorized_roles"
  ON {table_name}
  FOR INSERT WITH CHECK (
    -- Verify authenticated user with required role
    auth.uid() IN (
      SELECT user_id
      FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
      AND user_id IS NOT NULL
    )
    -- Verify casino scope
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- Update policy (same pattern)
CREATE POLICY "{table_name}_update_authorized_roles"
  ON {table_name}
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT user_id
      FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
      AND user_id IS NOT NULL
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

**Role Variations:**
- Admin only: `role = 'admin'`
- Operations: `role IN ('pit_boss', 'admin')`
- Financial: `role IN ('cashier', 'admin')`
- Compliance: `role IN ('compliance', 'admin')`

---

## Template 2b: Write Access — Session Vars Required (ADR-030)

Use for INSERT/UPDATE/DELETE on **critical tables** (`staff`, `player`, `player_financial_transaction`, `visit`, `rating_slip`, `loyalty_ledger`). No JWT COALESCE fallback — writes fail closed if session context is absent.

```sql
-- Write policy (session vars required — no JWT fallback)
CREATE POLICY "{table_name}_insert_session_required"
  ON {table_name}
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT user_id
      FROM staff
      WHERE casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
      AND user_id IS NOT NULL
    )
    AND casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
  );

-- Update policy (session vars required)
CREATE POLICY "{table_name}_update_session_required"
  ON {table_name}
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT user_id
      FROM staff
      WHERE casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
      AND user_id IS NOT NULL
    )
    AND casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
  ) WITH CHECK (
    casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
  );
```

**Key difference from Template 2:** No `COALESCE(..., auth.jwt()...)` — if `app.casino_id` is unset, the cast of empty/null string yields `NULL`, equality fails, writes are denied.

**SELECT policies** on these tables retain the COALESCE fallback (Template 1) until v0.2.

**Reference:** `docs/80-adrs/ADR-030-auth-system-hardening.md` (D4), `docs/30-security/SEC-001-rls-policy-matrix.md` (Template 2b)

---

## Template 3: Append-Only Ledger

Use for financial transactions, loyalty ledger, MTL entries.

```sql
-- Insert only (role-gated with hybrid context)
CREATE POLICY "{table_name}_append_authorized"
  ON {table_name}
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT user_id
      FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role IN ('cashier', 'admin')  -- Adjust roles as needed
      AND status = 'active'
      AND user_id IS NOT NULL
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- Explicitly deny updates
CREATE POLICY "{table_name}_no_updates"
  ON {table_name}
  FOR UPDATE USING (false);

-- Explicitly deny deletes
CREATE POLICY "{table_name}_no_deletes"
  ON {table_name}
  FOR DELETE USING (false);
```

**Idempotency Requirement:**

Tables MUST include `idempotency_key` column with partial unique index:

```sql
CREATE UNIQUE INDEX ux_{table}_idempotency
  ON {table_name} (casino_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

---

## Template 4: Admin Global Override (Use Sparingly)

Use only for system-wide admin operations (emergency access, cross-casino reporting).

```sql
CREATE POLICY "{table_name}_admin_global_access"
  ON {table_name}
  FOR ALL USING (
    auth.uid() = (
      SELECT user_id
      FROM staff
      WHERE id = COALESCE(
        NULLIF(current_setting('app.actor_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      )
      AND role = 'admin'
      AND status = 'active'
    )
    -- Note: No casino_id check - global admin access
  );
```

**WARNING**: Use only when absolutely necessary. Prefer casino-scoped policies.

---

## Template 5: Pit Boss Financial Constraints

Use for pit_boss write access to player_financial_transaction (buy-ins only).

```sql
CREATE POLICY "pft_pitboss_table_buyin"
  ON player_financial_transaction
  FOR INSERT WITH CHECK (
    -- Authenticated pit_boss or admin
    auth.uid() IN (
      SELECT user_id
      FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
      AND user_id IS NOT NULL
    )
    -- Casino scope
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    -- Pit boss constraints (SEC-005 v1.1.0)
    AND (
      COALESCE(
        NULLIF(current_setting('app.staff_role', true), ''),
        (auth.jwt() -> 'app_metadata' ->> 'staff_role')
      ) = 'admin'
      OR (
        direction = 'in'
        AND tender_type IN ('cash', 'chips')
        AND visit_id IS NOT NULL
      )
    )
  );
```

---

## Complete Migration Template

Full example for adding RLS to a new table:

```sql
-- =============================================================================
-- Migration: {timestamp}_{table_name}_rls_policies.sql
-- Description: Add ADR-015 compliant RLS policies to {table_name}
-- =============================================================================

-- 1. Enable RLS
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;

-- 2. Read policy (all authenticated staff in same casino)
CREATE POLICY "{table_name}_read_hybrid"
  ON {table_name}
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- 3. Insert policy (authorized roles only)
CREATE POLICY "{table_name}_insert_authorized"
  ON {table_name}
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT user_id
      FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
      AND user_id IS NOT NULL
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- 4. Update policy (authorized roles only)
CREATE POLICY "{table_name}_update_authorized"
  ON {table_name}
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT user_id
      FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
      AND user_id IS NOT NULL
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- 5. Delete policy (admin only, or deny all for ledgers)
CREATE POLICY "{table_name}_delete_admin_only"
  ON {table_name}
  FOR DELETE USING (
    auth.uid() IN (
      SELECT user_id
      FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role = 'admin'
      AND status = 'active'
      AND user_id IS NOT NULL
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

---

## Policy Naming Convention

Follow this naming pattern:
- `{table_name}_{operation}_{scope/role}`

Examples:
- `visit_read_hybrid`
- `rating_slip_insert_pitboss`
- `player_financial_transaction_append_cashier`
- `loyalty_ledger_no_updates`
- `staff_update_admin_only`
