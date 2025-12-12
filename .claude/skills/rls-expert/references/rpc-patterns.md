# RPC Security Patterns

Patterns for SECURITY DEFINER RPCs that validate casino scope per SEC-001/SEC-003.

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

## set_rls_context() RPC (ADR-015)

The canonical context injection RPC:

```sql
CREATE OR REPLACE FUNCTION set_rls_context(
  p_actor_id uuid,
  p_casino_id uuid,
  p_staff_role text,
  p_correlation_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- SET LOCAL ensures context persists for entire transaction
  PERFORM set_config('app.actor_id', p_actor_id::text, true);
  PERFORM set_config('app.casino_id', p_casino_id::text, true);
  PERFORM set_config('app.staff_role', p_staff_role, true);

  IF p_correlation_id IS NOT NULL THEN
    PERFORM set_config('application_name', p_correlation_id, true);
  END IF;
END;
$$;
```

**Key Points:**
- `SECURITY DEFINER` allows the function to set session variables
- `set_config(..., true)` = SET LOCAL (transaction-scoped)
- All context is set atomically in one transaction
- Correlation ID enables request tracing in logs

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

## RPC Security Checklist

- [ ] Uses `SECURITY DEFINER` when needed
- [ ] Sets `search_path = public` to prevent path injection
- [ ] Validates `app.casino_id` context is set
- [ ] Validates `casino_id` parameter matches context (if provided)
- [ ] Implements role-based access control checks
- [ ] Supports idempotency via `idempotency_key`
- [ ] Logs `actor_id` in `created_by`/`updated_by` columns
- [ ] Validates foreign key relationships belong to same casino
- [ ] Returns meaningful error messages (without leaking sensitive data)
