# PT-2 RPC Authorization Architecture

## Current State Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                      CLIENT REQUEST (Browser/API)                    │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
         ┌───────────────────────────────────────────────────────────┐
         │  Next.js API Route / Server Action                        │
         │  ┌─────────────────────────────────────────────┐          │
         │  │  withServerAction wrapper                   │          │
         │  │  1. getAuthContext(supabase)                │          │
         │  │     → validates auth.uid() → staff lookup   │          │
         │  │  2. injectRLSContext()                      │          │
         │  │     → calls set_rls_context RPC             │          │
         │  │       SET LOCAL app.casino_id               │          │
         │  │       SET LOCAL app.actor_id                │          │
         │  │       SET LOCAL app.staff_role              │          │
         │  │  3. Execute handler                         │          │
         │  └─────────────────────────────────────────────┘          │
         └───────────────────────────┬───────────────────────────────┘
                                     │
                                     ▼
         ┌───────────────────────────────────────────────────────────┐
         │  Service Layer (services/{domain}/crud.ts)                │
         │  - Calls supabase.rpc("rpc_name", params)                 │
         │  - Maps database errors to domain errors                  │
         └───────────────────────────┬───────────────────────────────┘
                                     │
                                     ▼
         ┌───────────────────────────────────────────────────────────┐
         │            SUPABASE (Transaction Mode Pooling)            │
         │  ⚠️ Each RPC may get DIFFERENT connection/transaction     │
         └───────────────────────────┬───────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
        ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
        │ Pattern A     │ │ Pattern B     │ │ Pattern C     │
        │ JWT-First     │ │ Self-Inject   │ │ External Ctx  │
        │ ─────────     │ │ ─────────     │ │ ─────────     │
        │ INVOKER       │ │ DEFINER       │ │ DEFINER       │
        │               │ │               │ │               │
        │ ✅ RLS on     │ │ ✅ Calls      │ │ ⚠️ Relies on  │
        │ SELECT/INSERT │ │ set_rls_ctx() │ │ middleware    │
        │               │ │ internally    │ │ context       │
        │ ✅ Context    │ │               │ │               │
        │ from JWT      │ │ ✅ Validates  │ │ ✅ Validates  │
        │ claims        │ │ casino_id     │ │ casino_id     │
        │               │ │ match         │ │ match         │
        │ ✅ Explicit   │ │               │ │               │
        │ role gates    │ │ ✅ JWT        │ │ ✅ JWT        │
        │               │ │ fallback      │ │ fallback      │
        │               │ │               │ │               │
        │ Examples:     │ │ Examples:     │ │ Examples:     │
        │ - Loyalty     │ │ - Rating slip │ │ - Floor layout│
        │   RPCs (8)    │ │   RPCs (4)    │ │   RPCs (2)    │
        │ - Financial   │ │               │ │ - Table ctx   │
        │   txn (1)     │ │               │ │   RPCs (5)    │
        │               │ │               │ │               │
        │ ✅ Pooling    │ │ ✅ Pooling    │ │ ⚠️ Pooling    │
        │ Safe          │ │ Safe          │ │ Risk          │
        └───────────────┘ └───────────────┘ └───────────────┘
                    │                │                │
                    └────────────────┼────────────────┘
                                     ▼
                    ┌──────────────────────────────────┐
                    │  PostgreSQL Database             │
                    │  - RLS policies (Pattern A/C)    │
                    │  - Audit logging (all patterns)  │
                    │  - Business logic enforcement    │
                    └──────────────────────────────────┘
```

---

## Pattern Comparison

### Pattern A: JWT-First (SECURITY INVOKER) ✅ BEST PRACTICE

```sql
CREATE OR REPLACE FUNCTION rpc_accrue_on_close(...)
LANGUAGE plpgsql
SECURITY INVOKER  -- ⭐ RLS enforced
AS $$
DECLARE
  v_context_casino_id uuid;
  v_caller_role text;
BEGIN
  -- Extract context from JWT (always available)
  v_context_casino_id := (auth.jwt()->'app_metadata'->>'casino_id')::uuid;
  v_caller_role := (auth.jwt()->'app_metadata'->>'staff_role');

  -- Validate casino scope
  IF p_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'CASINO_MISMATCH';
  END IF;

  -- Role gate
  IF v_caller_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- Business logic (RLS enforced on INSERT)
  INSERT INTO loyalty_ledger (...) VALUES (...);
END;
$$;
```

**Pros:**
- ✅ No pooling issues (JWT always available)
- ✅ Forces explicit RLS design
- ✅ Cannot accidentally bypass RLS
- ✅ Cleaner separation of concerns

**Cons:**
- Requires JWT claims to be populated (via `sync_staff_jwt_claims` trigger)

**Used By:** Loyalty RPCs (8), Financial RPC (1) = 9 total

---

### Pattern B: Self-Injection (SECURITY DEFINER) ✅ POOLING-SAFE

```sql
CREATE OR REPLACE FUNCTION rpc_start_rating_slip(...)
LANGUAGE plpgsql
SECURITY DEFINER  -- Can bypass RLS if needed
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_staff_role text;
BEGIN
  -- ⭐ SELF-INJECT: Call set_rls_context in same transaction
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text,
    'pit_boss'
  );

  PERFORM set_rls_context(p_actor_id, p_casino_id, v_context_staff_role);

  -- Extract and validate context
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch';
  END IF;

  -- Business logic continues...
END;
$$;
```

**Pros:**
- ✅ Pooling-safe (context in same transaction)
- ✅ Can perform cross-table operations
- ✅ Backward compatible (works with/without middleware)

**Cons:**
- More complex (boilerplate code)
- DEFINER mode requires careful audit

**Used By:** Rating slip RPCs (4) = 4 total

---

### Pattern C: External Context (SECURITY DEFINER) ⚠️ POOLING RISK

```sql
CREATE OR REPLACE FUNCTION rpc_create_floor_layout(...)
LANGUAGE plpgsql
SECURITY DEFINER  -- Can bypass RLS
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
BEGIN
  -- ⚠️ NO SELF-INJECTION - relies on middleware
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch';
  END IF;

  -- Business logic continues...
END;
$$;
```

**Pros:**
- Simpler than Pattern B (less boilerplate)

**Cons:**
- ⚠️ **POOLING RISK:** If RPC gets different connection, SET LOCAL missing
- ⚠️ Validation may fail or succeed with stale JWT
- ⚠️ Requires discipline in caller (must use `withServerAction`)

**Used By:** Floor layout RPCs (2), Table context RPCs (5) = 7 total

**Recommendation:** Migrate to Pattern B (self-injection)

---

## Pooling Compatibility Matrix

| Pattern | SECURITY Mode | Self-Injects? | Pooling Safe? | Count | Examples |
|---------|---------------|---------------|---------------|-------|----------|
| A       | INVOKER       | N/A (JWT)     | ✅ YES        | 9     | Loyalty, Finance |
| B       | DEFINER       | ✅ YES        | ✅ YES        | 4     | Rating slip lifecycle |
| C       | DEFINER       | ❌ NO         | ⚠️ RISK       | 7     | Floor layout, Table ctx |
| N/A     | DEFINER       | N/A           | N/A           | 2     | Infrastructure (set_rls_ctx, compute_gaming_day) |

**Total RPCs:** 22
**Pooling-Safe:** 13 (59%)
**At-Risk:** 7 (32%)
**Infrastructure:** 2 (9%)

---

## Multi-RPC Workflow Safety

### Safe Workflow: Close Slip → Accrue Points

```
withServerAction:
  1. set_rls_context(actor, casino, role) ───┐
                                              │ Transaction 1
  2. rpc_close_rating_slip() ────────────────┤
     └─ Calls set_rls_context() internally   │
     └─ Validates casino_id                  │
                                              │
  [New transaction - context MAY be lost]    │
                                              │
  3. rpc_accrue_on_close() ──────────────────┐ Transaction 2
     └─ Uses JWT (always available)          │
     └─ Validates casino_id                  │

✅ SAFE: Both RPCs validate independently
```

---

### Risky Workflow: Table Fill → Inventory Snapshot

```
withServerAction:
  1. set_rls_context(actor, casino, role) ───┐
                                              │ Transaction 1
  2. rpc_request_table_fill() ───────────────┤
     └─ NO self-injection                    │
     └─ Reads current_setting('app.casino')  │
     └─ Falls back to JWT                    │
                                              │
  [New transaction - SET LOCAL lost]         │
                                              │
  3. rpc_log_table_inventory_snapshot() ─────┐ Transaction 2
     └─ NO self-injection                    │
     └─ Reads current_setting('app.casino')  │ ⚠️ MISSING!
     └─ Falls back to JWT ✅ SAVED BY FALLBACK

⚠️ RISK: Relies on JWT fallback. If JWT claims not populated, FAILS.
```

**Remediation Options:**
1. Add self-injection to both RPCs (Pattern B)
2. Create wrapper RPC: `rpc_fill_and_snapshot()` (atomic)
3. Ensure JWT claims always populated (via trigger)

---

## Authorization Decision Tree

```
Start: New RPC needed
│
├─ Read-only operation?
│  ├─ YES → Use SECURITY INVOKER + RLS
│  │       (e.g., rpc_get_player_ledger)
│  │
│  └─ NO → Continue
│
├─ Multi-table INSERT/UPDATE?
│  ├─ YES → SECURITY DEFINER (Pattern B: self-inject)
│  │       (e.g., rpc_create_floor_layout)
│  │
│  └─ NO → Continue
│
├─ Financial/audit-critical?
│  ├─ YES → SECURITY DEFINER (Pattern B: self-inject)
│  │       OR SECURITY INVOKER (Pattern A: JWT-first)
│  │       (e.g., rpc_request_table_fill)
│  │
│  └─ NO → Continue
│
└─ Default: SECURITY INVOKER (Pattern A: JWT-first)
          (e.g., rpc_accrue_on_close)
```

---

## GAP Remediation Status

| GAP | Description | Status | Notes |
|-----|-------------|--------|-------|
| **GAP 1** | Pooling context loss | ⚠️ PARTIAL | 13/20 RPCs safe, 7 need self-injection |
| **GAP 2** | Identity leakage | ✅ MITIGATED | `withServerAction` validates auth.uid() |
| **GAP 3** | DEFINER bypass | ✅ MITIGATED | All RPCs validate casino_id |
| **GAP 4** | Trust boundaries | ✅ COMPLIANT | Explicit auth in all mutating RPCs |
| **GAP 5** | Implicit context | ⚠️ PARTIAL | 4 self-inject, 8 JWT-only, 7 external |
| **GAP 6** | Audit observability | ✅ COMPLIANT | Audit logs in DEFINER RPCs |

---

## Next Steps (Priority Order)

### P0: Add self-injection to financial RPCs
- `rpc_request_table_fill`
- `rpc_request_table_credit`
- `rpc_log_table_drop`

**Why:** Financial audit critical, high attribution risk

---

### P1: Add self-injection to floor/inventory RPCs
- `rpc_create_floor_layout`
- `rpc_activate_floor_layout`
- `rpc_log_table_inventory_snapshot`
- `rpc_update_table_status`

**Why:** Operational integrity, medium risk

---

### P2: Migrate to INVOKER where possible
- Audit each DEFINER RPC for INVOKER migration
- Document blockers (multi-table, audit access)

**Why:** Long-term goal (ADR-015 Phase 3)

---

### P3: Observability & standards
- Service role monitoring (detect identity leakage)
- Standardize RPC error codes (replace string matching)
- RPC inventory dashboard for ops team

**Why:** Operational excellence, drift prevention

---

**End of Diagram**
