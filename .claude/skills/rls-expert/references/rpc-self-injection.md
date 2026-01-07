# RPC Self-Injection Patterns

> ## ⚠️ DEPRECATION WARNING (ADR-024)
>
> **This document describes the OLD self-injection pattern that is now DEPRECATED.**
>
> The `set_rls_context(p_actor_id, p_casino_id, p_staff_role)` pattern allowed context spoofing attacks.
> All client-callable RPCs must now use `set_rls_context_from_staff()` which derives context authoritatively
> from JWT claims + staff table lookup.
>
> **See:** `docs/80-adrs/ADR-024_DECISIONS.md` and `references/rpc-patterns.md` for the current pattern.

---

## Historical Context (Pre-ADR-024)

SECURITY DEFINER RPCs bypass RLS and must self-inject casino context before accessing data.

## Why Self-Injection is Required

- `SECURITY DEFINER` functions run as the function owner (typically superuser)
- RLS policies are bypassed entirely in this context
- Without explicit context injection, queries return data from ALL casinos
- This is a **critical security violation** - cross-tenant data exposure

**However:** ADR-024 identified that the self-injection pattern itself was vulnerable when using spoofable parameters.

---

## Pattern 1: RLS-Only Functions (No casino_id Parameter)

Use when the RPC doesn't accept `p_casino_id` as a parameter.

```sql
CREATE OR REPLACE FUNCTION rpc_get_table_availability(p_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_result jsonb;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════════
  -- SELF-INJECTION: Extract and inject context before data access
  -- ═══════════════════════════════════════════════════════════════════════════
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  -- JWT fallback for edge cases
  IF v_context_casino_id IS NULL THEN
    v_context_casino_id := (current_setting('request.jwt.claims', true)::jsonb ->> 'casino_id')::uuid;
  END IF;

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  -- Inject context for RLS policies
  PERFORM set_config('app.casino_id', v_context_casino_id::text, true);
  -- ═══════════════════════════════════════════════════════════════════════════

  -- Now safe to query - RLS policies will filter by casino_id
  SELECT jsonb_build_object(
    'table_id', t.id,
    'table_number', t.table_number,
    'is_active', t.is_active
  ) INTO v_result
  FROM gaming_table t
  WHERE t.id = p_table_id;

  RETURN v_result;
END;
$$;
```

---

## Pattern 2: RPCs with p_casino_id Parameter

Use when the RPC accepts `p_casino_id` as a parameter. Adds validation that parameter matches context.

```sql
CREATE OR REPLACE FUNCTION rpc_create_visit_segment(
  p_casino_id uuid,
  p_visit_id uuid,
  p_table_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_new_segment_id uuid;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════════
  -- SELF-INJECTION + VALIDATION
  -- ═══════════════════════════════════════════════════════════════════════════
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_context_casino_id IS NULL THEN
    v_context_casino_id := (current_setting('request.jwt.claims', true)::jsonb ->> 'casino_id')::uuid;
  END IF;

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  -- CRITICAL: Validate parameter matches context
  IF p_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;

  -- Inject context for RLS policies
  PERFORM set_config('app.casino_id', v_context_casino_id::text, true);
  -- ═══════════════════════════════════════════════════════════════════════════

  -- Safe to proceed with mutation
  INSERT INTO visit_segment (casino_id, visit_id, table_id)
  VALUES (p_casino_id, p_visit_id, p_table_id)
  RETURNING id INTO v_new_segment_id;

  RETURN v_new_segment_id;
END;
$$;
```

---

## Common Mistakes

### ❌ Missing self-injection entirely

```sql
-- WRONG: No context injection
CREATE FUNCTION rpc_bad_example(p_id uuid)
RETURNS TABLE(...) SECURITY DEFINER AS $$
BEGIN
  -- Bypasses RLS, returns ALL casino data!
  RETURN QUERY SELECT * FROM player WHERE id = p_id;
END;
$$;
```

### ❌ Only validating but not injecting

```sql
-- WRONG: Validates but doesn't inject
v_context_casino_id := current_setting('app.casino_id', true)::uuid;
IF p_casino_id != v_context_casino_id THEN
  RAISE EXCEPTION 'mismatch';
END IF;
-- Missing: PERFORM set_config('app.casino_id', ..., true);
-- Subsequent queries still bypass RLS!
```

### ❌ Setting context for wrong scope

```sql
-- WRONG: false = session-wide (persists after transaction)
PERFORM set_config('app.casino_id', v_casino_id::text, false);

-- CORRECT: true = transaction-local (resets after transaction)
PERFORM set_config('app.casino_id', v_casino_id::text, true);
```

---

## Self-Injection Template

Copy this block to the start of every SECURITY DEFINER RPC:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- ADR-015 SELF-INJECTION BLOCK
-- ═══════════════════════════════════════════════════════════════════════════
DECLARE
  v_context_casino_id uuid;
BEGIN
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_context_casino_id IS NULL THEN
    v_context_casino_id := (current_setting('request.jwt.claims', true)::jsonb ->> 'casino_id')::uuid;
  END IF;

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  -- If p_casino_id parameter exists, add this validation:
  -- IF p_casino_id != v_context_casino_id THEN
  --   RAISE EXCEPTION 'casino_id mismatch: caller % context %', p_casino_id, v_context_casino_id;
  -- END IF;

  PERFORM set_config('app.casino_id', v_context_casino_id::text, true);
-- ═══════════════════════════════════════════════════════════════════════════
```

---

## Pre-Commit Hook

The `check_rpc_context_injection.py` hook validates all SECURITY DEFINER functions:

```bash
# Runs automatically on commit
# Checks for set_config('app.casino_id'...) in SECURITY DEFINER functions
# Blocks commits missing self-injection
```

---

## Related Documentation

- **ADR-015**: `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`
- **Migration Anti-Patterns**: `docs/70-governance/anti-patterns/07-migrations.md`
- **RPC Patterns**: `.claude/skills/rls-expert/references/rpc-patterns.md`
- **Policy Templates**: `.claude/skills/rls-expert/references/policy-templates.md`

---

## Checklist for New RPCs

- [ ] Function uses `SECURITY DEFINER`? → MUST self-inject
- [ ] Extracts `app.casino_id` from session config
- [ ] Falls back to JWT claim if session config is null
- [ ] Raises exception if context is null
- [ ] If `p_casino_id` param exists → validates it matches context
- [ ] Calls `set_config('app.casino_id', ..., true)` before any data access
- [ ] Uses `true` (transaction-local) not `false` (session-wide)
