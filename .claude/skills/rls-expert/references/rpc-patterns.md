# RPC Security Patterns

Patterns for SECURITY DEFINER RPCs that validate casino scope per SEC-001/SEC-003.

## ⚠️ ADR-024 Context Security Update

**The `set_rls_context(p_actor_id, p_casino_id, p_staff_role)` pattern is DEPRECATED.**

All client-callable RPCs must now call `set_rls_context_from_staff()` which:
- Takes NO spoofable parameters (only optional `p_correlation_id`)
- Derives `staff_id` from JWT `app_metadata.staff_id` claim
- Looks up `casino_id` and `role` from `staff` table
- Validates staff is `active` before setting context

**Reference:** `docs/80-adrs/ADR-024_DECISIONS.md`

---

## Core Pattern: Casino Scope Validation

Every RPC that accepts `casino_id` as a parameter MUST validate it against context:

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
  RETURN gen_random_uuid();
END;
$$;
```

---

## Alternative: Derive casino_id from Context

When possible, derive `casino_id` from context instead of accepting as parameter:

```sql
CREATE OR REPLACE FUNCTION rpc_create_record(
  p_name text,
  p_description text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_casino_id uuid;
  v_new_id uuid;
BEGIN
  -- Derive casino_id from context (no parameter needed)
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  INSERT INTO records (casino_id, name, description)
  VALUES (v_casino_id, p_name, p_description)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;
```

---

## set_rls_context_from_staff() RPC (ADR-024) ✅ CURRENT

The authoritative context injection RPC that derives context from JWT + staff table:

```sql
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
  v_jwt_staff_id uuid;
  v_casino_id uuid;
  v_staff_role text;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: auth.uid() is null';
  END IF;

  -- Get staff_id from JWT (authoritative source)
  v_jwt_staff_id := (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid;
  IF v_jwt_staff_id IS NULL THEN
    RAISE EXCEPTION 'JWT missing staff_id claim in app_metadata';
  END IF;

  -- Lookup staff record and validate user_id binding (INV-3)
  SELECT id, casino_id, role INTO v_staff_id, v_casino_id, v_staff_role
  FROM staff
  WHERE id = v_jwt_staff_id
    AND user_id = v_user_id  -- Bind to auth.uid() (prevents mis-issued tokens)
    AND status = 'active';   -- INV-4: Block inactive staff

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff not found or inactive for user %', v_user_id;
  END IF;

  -- Set transaction-local context (INV-5: pooler-safe)
  PERFORM set_config('app.actor_id', v_staff_id::text, true);
  PERFORM set_config('app.casino_id', v_casino_id::text, true);
  PERFORM set_config('app.staff_role', v_staff_role, true);

  -- Correlation ID for tracing (capped length)
  IF p_correlation_id IS NOT NULL THEN
    PERFORM set_config('application_name',
      left(regexp_replace(p_correlation_id, '[^a-zA-Z0-9_-]', '', 'g'), 63),
      true);
  END IF;
END;
$$;
```

**Key Points:**
- NO spoofable parameters (only optional `p_correlation_id` for tracing)
- Derives `staff_id` from JWT `app_metadata.staff_id` (authoritative)
- Binds `staff_id` to `auth.uid()` (prevents mis-issued token escalation)
- Lookups `casino_id` and `role` from `staff` table
- Validates staff is `active` (inactive staff blocked)
- Uses `SET LOCAL` via `set_config(..., true)` (transaction-scoped, pooler-safe)
- Correlation ID sanitized and length-capped

---

## ⚠️ DEPRECATED: set_rls_context() RPC (Pre-ADR-024)

**DO NOT USE IN NEW CODE.** Execute permission revoked from `authenticated` role.

This pattern is vulnerable to context spoofing:

```sql
-- DEPRECATED: Spoofable parameters allow cross-tenant access
CREATE OR REPLACE FUNCTION set_rls_context(
  p_actor_id uuid,
  p_casino_id uuid,
  p_staff_role text,
  p_correlation_id text DEFAULT NULL
) RETURNS void
-- ... vulnerable implementation ...
```

**Why deprecated:**
- Accepts `casino_id` as user input → attacker can access any casino's data
- Accepts `staff_role` as user input → attacker can escalate to `admin`
- Session variables are user-writable → bypasses multi-tenant isolation

**Migration:** Replace all calls with `set_rls_context_from_staff()`.

---

## Financial Transaction RPC Pattern

Example: `rpc_create_financial_txn` with role-based constraints:

```sql
CREATE OR REPLACE FUNCTION rpc_create_financial_txn(
  p_player_id uuid,
  p_visit_id uuid DEFAULT NULL,
  p_amount numeric,
  p_direction text,
  p_tender_type text,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_context_actor_id uuid;
  v_new_id uuid;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════════
  -- CONTEXT EXTRACTION
  -- ═══════════════════════════════════════════════════════════════════════════
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- ROLE-BASED ACCESS CONTROL (SEC-005)
  -- ═══════════════════════════════════════════════════════════════════════════
  IF v_context_staff_role NOT IN ('cashier', 'admin', 'pit_boss') THEN
    RAISE EXCEPTION 'Unauthorized: role % cannot create financial transactions',
      v_context_staff_role;
  END IF;

  -- Pit boss constraints (SEC-005 v1.1.0)
  IF v_context_staff_role = 'pit_boss' THEN
    IF p_direction != 'in' THEN
      RAISE EXCEPTION 'pit_boss can only record buy-ins (direction=in)';
    END IF;
    IF p_tender_type NOT IN ('cash', 'chips') THEN
      RAISE EXCEPTION 'pit_boss can only use cash or chips (not markers)';
    END IF;
    IF p_visit_id IS NULL THEN
      RAISE EXCEPTION 'pit_boss transactions require visit_id';
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- IDEMPOTENCY CHECK
  -- ═══════════════════════════════════════════════════════════════════════════
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_new_id
    FROM player_financial_transaction
    WHERE casino_id = v_context_casino_id
      AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN v_new_id;  -- Return existing record
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- INSERT
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO player_financial_transaction (
    casino_id, player_id, visit_id, amount, direction, tender_type,
    notes, idempotency_key, created_by
  ) VALUES (
    v_context_casino_id, p_player_id, p_visit_id, p_amount, p_direction,
    p_tender_type, p_notes, p_idempotency_key, v_context_actor_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;
```

---

## Loyalty Reward RPC Pattern

Example: `rpc_issue_mid_session_reward` with visit validation:

```sql
CREATE OR REPLACE FUNCTION rpc_issue_mid_session_reward(
  p_visit_id uuid,
  p_reward_type text,
  p_amount numeric,
  p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_visit_casino_id uuid;
  v_new_id uuid;
BEGIN
  -- Context extraction
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  -- Verify visit belongs to same casino
  SELECT casino_id INTO v_visit_casino_id
  FROM visit WHERE id = p_visit_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit not found: %', p_visit_id;
  END IF;

  IF v_visit_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'Visit % does not belong to casino context %',
      p_visit_id, v_context_casino_id;
  END IF;

  -- Idempotency check
  SELECT id INTO v_new_id
  FROM loyalty_ledger
  WHERE casino_id = v_context_casino_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN v_new_id;
  END IF;

  -- Insert reward
  INSERT INTO loyalty_ledger (
    casino_id, visit_id, reward_type, amount, idempotency_key, issued_by
  ) VALUES (
    v_context_casino_id, p_visit_id, p_reward_type, p_amount,
    p_idempotency_key, v_context_actor_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;
```

---

---

## Idempotency Pattern (ADR-021)

RPCs that create records should support idempotency. Use the standardized header name:

```typescript
// TypeScript: Import from centralized location
import { IDEMPOTENCY_HEADER } from "@/lib/http/headers";

const response = await fetch(url, {
  headers: { [IDEMPOTENCY_HEADER]: idempotencyKey }
});
```

**Header name:** `Idempotency-Key` (title case, per IETF draft-ietf-httpapi-idempotency-key-header)

**Anti-pattern (ANT-HTTP-001):** Hardcoded header strings

```typescript
// ❌ WRONG - string literal
headers: { "idempotency-key": key }

// ❌ WRONG - different header name
headers: { "x-idempotency-key": key }

// ✅ CORRECT - import from headers.ts
import { IDEMPOTENCY_HEADER } from "@/lib/http/headers";
headers: { [IDEMPOTENCY_HEADER]: key }
```

**Reference:** `docs/80-adrs/ADR-021-idempotency-header-standardization.md`

---

## RPC Security Checklist

- [ ] Uses `SECURITY DEFINER` when needed
- [ ] Sets `search_path = public` to prevent path injection
- [ ] Calls `set_rls_context_from_staff()` for context (ADR-024)
- [ ] Validates `app.casino_id` context is set
- [ ] Validates `casino_id` parameter matches context (if provided)
- [ ] Implements role-based access control checks
- [ ] Supports idempotency via `idempotency_key` (ADR-021)
- [ ] Logs `actor_id` in `created_by`/`updated_by` columns
- [ ] Validates foreign key relationships belong to same casino
- [ ] Returns meaningful error messages (without leaking sensitive data)
