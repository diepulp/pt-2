---
id: PRD-004-RPC-RLS-ENFORCEMENT
title: LoyaltyService RPC/RLS Role Enforcement Specification
owner: Security/Architecture
status: Proposed
affects: [PRD-004, ADR-015, ADR-019, SEC-001, SEC-003]
created: 2025-12-13
version: 1.0.0
---

# RPC/RLS Role Enforcement Specification - PRD-004 LoyaltyService

## 1. Overview

This document defines the **authoritative role enforcement architecture** for PRD-004 LoyaltyService RPCs and RLS policies. It addresses the identified gap where role/tenancy enforcement was only mentioned at the route layer, leaving unclear how SECURITY INVOKER RPCs tie to withServerAction context and how roles are validated.

**Governing Documents:**
- `docs/10-prd/PRD-004-loyalty-service.md` - Feature requirements
- `docs/80-adrs/ADR-019-loyalty-points-policy_v2.md` - Policy authority
- `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` - RLS patterns
- `docs/30-security/SEC-001-rls-policy-matrix.md` - Policy templates

**Key Principle:** All LoyaltyService RPCs use **SECURITY INVOKER** pattern with hybrid RLS (Pattern C: transaction context + JWT fallback) per ADR-015. Role enforcement happens via **explicit RPC role checks + RLS policies**, never via SECURITY DEFINER privilege escalation.

---

## 2. Architecture Decision: SECURITY INVOKER Pattern

### 2.1 Why SECURITY INVOKER?

**Decision (ADR-019 P3):** All LoyaltyService RPCs are `SECURITY INVOKER` (never `SECURITY DEFINER`).

**Rationale:**
1. **No privilege escalation** - RPCs run with caller's permissions, subject to RLS
2. **Defense-in-depth** - RLS policies prevent cross-tenant access even if RPC logic has bugs
3. **Explicit validation** - Role checks are visible in RPC code, not hidden behind DEFINER privilege
4. **Audit clarity** - Caller identity preserved in logs and audit trail

**Tradeoff:** Requires careful RLS policy design to allow legitimate RPC operations while blocking unauthorized access.

### 2.2 Security Model Layers

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: HTTP Route Authorization (Next.js API)                │
│ - Rate limiting, request validation, idempotency key generation │
│ - Calls withServerAction wrapper                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2: withServerAction Middleware                            │
│ - getAuthContext: validates auth.uid() → staff record           │
│ - injectRLSContext: calls set_rls_context() RPC                 │
│ - Sets: app.actor_id, app.casino_id, app.staff_role             │
│ - JWT fallback: auth.jwt() -> 'app_metadata' -> {casino_id, ...}│
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3: RPC Explicit Role Checks (SECURITY INVOKER)            │
│ - Validate caller role: pit_boss, admin, cashier                │
│ - Validate casino_id matches current_setting('app.casino_id')   │
│ - Return error if unauthorized (no silent failure)              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 4: RLS Policies (Pattern C Hybrid)                        │
│ - Enforce casino_id scoping (tenant isolation)                  │
│ - Block UPDATE/DELETE on append-only ledgers                    │
│ - Validate auth.uid() IS NOT NULL                               │
│ - Fallback to JWT claims if context not set                     │
└─────────────────────────────────────────────────────────────────┘
```

**Defense-in-depth:** Each layer enforces constraints. Bypassing any single layer still fails at subsequent layers.

---

## 3. RLS Policy Definitions

### 3.1 loyalty_ledger Policies (Current State)

**Existing Policies (Migrations `20251211153228`, `20251212080915`):**

```sql
-- Pattern C (Hybrid): Transaction context + JWT fallback
-- Migration: 20251211153228_adr015_rls_compliance_patch.sql

ALTER TABLE loyalty_ledger ENABLE ROW LEVEL SECURITY;

-- Read: Any authenticated staff from same casino
CREATE POLICY loyalty_ledger_select ON loyalty_ledger
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- Insert: Only pit_boss or admin (role-gated)
CREATE POLICY loyalty_ledger_insert ON loyalty_ledger
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- Append-only enforcement (Migration: 20251212080915_sec006_rls_hardening.sql)
CREATE POLICY loyalty_ledger_no_updates ON loyalty_ledger
  FOR UPDATE USING (auth.uid() IS NOT NULL AND false);

CREATE POLICY loyalty_ledger_no_deletes ON loyalty_ledger
  FOR DELETE USING (auth.uid() IS NOT NULL AND false);
```

**Status:** ✅ **COMPLIANT** with ADR-015 Pattern C and SEC-001 Template 3.

**Analysis:**
- `loyalty_ledger_select`: Read access requires authentication + casino scope (hybrid resolution)
- `loyalty_ledger_insert`: Write access requires `pit_boss` or `admin` role + casino scope
- Append-only: UPDATE/DELETE explicitly blocked for all users (audit integrity)

**Modification Required for PRD-004:**
- **Add `cashier` role** to insert policy (per FR-17: comp issuance requires pit_boss, cashier, or admin)

### 3.2 player_loyalty Policies (Current State)

**Existing Policies (Migration `20251211153228`):**

```sql
ALTER TABLE player_loyalty ENABLE ROW LEVEL SECURITY;

-- Read: Any authenticated staff from same casino
CREATE POLICY player_loyalty_select ON player_loyalty
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- Insert: Only pit_boss or admin (balance initialization)
CREATE POLICY player_loyalty_insert ON player_loyalty
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- Update: Only pit_boss or admin (balance updates from RPCs)
CREATE POLICY player_loyalty_update ON player_loyalty
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );
```

**Status:** ⚠️ **NEEDS UPDATE** - Add `cashier` role for comp issuance operations.

**Modification Required:**
- Insert policy: Add `'cashier'` to role list (balance initialization on first transaction)
- Update policy: Add `'cashier'` to role list (balance updates from redeem operations)

### 3.3 Required Policy Updates

**Migration: `20251213_prd004_loyalty_rls_cashier_role.sql`**

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- PRD-004: Add cashier role to LoyaltyService RLS policies
-- Reference: PRD-004 FR-17 (comp issuance requires pit_boss, cashier, admin)
-- Pattern: ADR-015 Pattern C (Hybrid context)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Update loyalty_ledger insert policy to allow cashier role
DROP POLICY IF EXISTS loyalty_ledger_insert ON loyalty_ledger;
CREATE POLICY loyalty_ledger_insert ON loyalty_ledger
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin', 'cashier')  -- Added cashier
  );

-- 2. Update player_loyalty insert policy to allow cashier role
DROP POLICY IF EXISTS player_loyalty_insert ON player_loyalty;
CREATE POLICY player_loyalty_insert ON player_loyalty
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin', 'cashier')  -- Added cashier
  );

-- 3. Update player_loyalty update policy to allow cashier role
DROP POLICY IF EXISTS player_loyalty_update ON player_loyalty;
CREATE POLICY player_loyalty_update ON player_loyalty
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin', 'cashier')  -- Added cashier
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION (Run manually after migration):
-- ═══════════════════════════════════════════════════════════════════════════
--
-- -- Test cashier can insert ledger entry (should succeed with proper context)
-- SELECT set_rls_context(
--   p_actor_id := '<cashier-staff-id>',
--   p_casino_id := '<casino-id>',
--   p_staff_role := 'cashier'
-- );
--
-- INSERT INTO loyalty_ledger (casino_id, player_id, points_delta, reason, metadata)
-- VALUES ('<casino-id>', '<player-id>', -500, 'redeem', '{"test": true}');
-- -- Expected: Success
--
-- -- Test dealer cannot insert (should fail)
-- SELECT set_rls_context(
--   p_actor_id := '<dealer-staff-id>',
--   p_casino_id := '<casino-id>',
--   p_staff_role := 'dealer'
-- );
--
-- INSERT INTO loyalty_ledger (casino_id, player_id, points_delta, reason, metadata)
-- VALUES ('<casino-id>', '<player-id>', 100, 'base_accrual', '{"test": true}');
-- -- Expected: Policy violation error
```

---

## 4. Role Enforcement Matrix

### 4.1 LoyaltyService Operations by Role

| RPC / Operation | Required Roles | Enforcement Point | Notes |
|-----------------|----------------|-------------------|-------|
| **`mint_base_accrual`** | `pit_boss`, `admin` | RPC validation + RLS insert policy | Triggered on rating slip close; base accrual should not be manual |
| **`redeem_points`** | `pit_boss`, `cashier`, `admin` | RPC validation + RLS insert policy | Comp issuance (debit); overdraw requires `pit_boss` or `admin` |
| **`manual_credit`** | `pit_boss`, `admin` | RPC validation + RLS insert policy | Service recovery / goodwill credits; cashier excluded (higher privilege) |
| **`apply_promotion`** | `pit_boss`, `admin` | RPC validation + RLS insert policy | Campaign overlays; post-MVP feature |
| **`get_player_balance`** | `pit_boss`, `cashier`, `admin` | RLS select policy only | Read-only; no explicit RPC role check needed |
| **`get_player_ledger`** | `pit_boss`, `cashier`, `admin` | RLS select policy only | Read-only; paginated history |
| **`evaluate_session_reward_suggestion`** | `pit_boss`, `cashier`, `admin` | RLS select policy only | Pure helper; no minting or balance changes |

### 4.2 Role-Specific Capabilities

| Role | Base Accrual | Comp Issuance (Redeem) | Overdraw Approval | Manual Credit | Adjustment/Reversal | Read Balance/Ledger |
|------|--------------|------------------------|-------------------|---------------|---------------------|---------------------|
| **pit_boss** | ✅ | ✅ | ✅ | ✅ | ❌ (admin-only) | ✅ |
| **cashier** | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **dealer** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Notes:**
- **Dealers** have no loyalty system access (non-authenticated role)
- **Cashiers** can issue comps but not approve overdraw or manual credits
- **Pit bosses** have operational authority (issue comps, approve overdraw, manual credits)
- **Admins** have full authority including adjustments/reversals

### 4.3 Overdraw-Specific Authorization

**Overdraw Policy (ADR-019 P4):**
- **Default:** Redemption fails if `balance < redemption_cost`
- **Controlled overdraw:** Allowed only when:
  1. Caller passes `allow_overdraw = true` (explicit flag)
  2. Caller's role is `pit_boss` or `admin` (validated in RPC)
  3. Overdraw amount ≤ `max_overdraw_points_per_redeem` (cap: 5000 default)
  4. Approval metadata recorded in ledger entry

**Enforcement Point:** `redeem_points` RPC validates role before allowing overdraw:

```sql
-- Inside rpc_redeem logic:
IF p_allow_overdraw = true THEN
  -- Validate caller has overdraw authority
  v_caller_role := NULLIF(current_setting('app.staff_role', true), '');

  IF v_caller_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'LOYALTY_OVERDRAW_NOT_AUTHORIZED: Role % cannot approve overdraw', v_caller_role;
  END IF;

  IF (v_balance_before - p_points) < (-1 * v_max_overdraw) THEN
    RAISE EXCEPTION 'LOYALTY_OVERDRAW_EXCEEDS_CAP: Overdraw would exceed max_overdraw_points_per_redeem';
  END IF;
END IF;
```

---

## 5. Context Injection Flow

### 5.1 withServerAction Context Extraction

**Source:** `lib/server-actions/with-server-action-wrapper.ts`

**Flow:**

```typescript
// 1. Get authenticated user
const { data: { user } } = await supabase.auth.getUser();
// Returns: user.id (from auth.users table)

// 2. Query staff table
const { data: staff } = await supabase
  .from('staff')
  .select('id, casino_id, role')
  .eq('user_id', user.id)
  .eq('status', 'active')
  .single();

// 3. Build RLS context
const rlsContext: RLSContext = {
  actorId: staff.id,        // staff.id (UUID)
  casinoId: staff.casino_id, // staff.casino_id (UUID)
  staffRole: staff.role,     // staff.role (enum: pit_boss, admin, cashier, dealer)
};

// 4. Inject via set_rls_context() RPC (ADR-015)
await supabase.rpc('set_rls_context', {
  p_actor_id: rlsContext.actorId,
  p_casino_id: rlsContext.casinoId,
  p_staff_role: rlsContext.staffRole,
  p_correlation_id: requestId
});
```

**RPC Implementation (Migration `20251209183033_adr015_rls_context_rpc.sql`):**

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

### 5.2 JWT Claims (Fallback)

**JWT Structure (Supabase Auth `app_metadata`):**

```json
{
  "aud": "authenticated",
  "role": "authenticated",
  "app_metadata": {
    "casino_id": "uuid-casino-1",
    "staff_id": "uuid-staff-123",
    "staff_role": "pit_boss"
  }
}
```

**Sync Mechanism (ADR-015 Phase 2):**
- On staff creation: `services/casino/crud.ts` calls `syncUserRLSClaims()`
- On staff update: Role/casino changes trigger JWT sync
- Database trigger: `trg_sync_staff_jwt_claims` on `staff` table updates

**RLS Policy Resolution:**

```sql
-- Hybrid COALESCE pattern (Pattern C):
COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,  -- Try transaction context
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid        -- Fall back to JWT
)
```

**Benefits:**
1. **Primary path:** Transaction context (fresh from database, set by withServerAction)
2. **Fallback path:** JWT claims (survives connection pooling edge cases)
3. **No stale data risk:** Transaction context is always current; JWT sync is async but eventual

### 5.3 Direct RPC Calls (Without withServerAction)

**Scenario:** Developer calls RPC directly from Supabase client:

```typescript
// Direct call (NOT via withServerAction)
const { data, error } = await supabase.rpc('redeem_points', {
  p_casino_id: casinoId,
  p_player_id: playerId,
  p_points: 500,
  // ...
});
```

**What happens:**

1. **Transaction context:** `current_setting('app.casino_id', true)` returns empty string (not set)
2. **JWT fallback:** `auth.jwt() -> 'app_metadata' ->> 'casino_id'` resolves from user's JWT
3. **RLS policy evaluation:** Uses JWT `casino_id` for scoping
4. **RPC role check:** Reads `current_setting('app.staff_role', true)` → empty → **FAILS**

**Result:** ❌ **Direct RPC calls without context injection will FAIL** due to empty `app.staff_role` in role checks.

**Security Contract:**
- **Guarantee:** Direct RPC calls without `withServerAction` will fail role validation
- **Exception:** Read-only RPCs that don't check roles may succeed via JWT fallback
- **Enforcement:** RPC code validates `current_setting('app.staff_role')` is not null before role checks

**Example RPC Role Validation Pattern:**

```sql
-- Inside rpc_redeem:
DECLARE
  v_caller_role text;
BEGIN
  -- Extract role from transaction context (primary) or fail explicitly
  v_caller_role := NULLIF(current_setting('app.staff_role', true), '');

  IF v_caller_role IS NULL THEN
    -- Context not set; check JWT fallback
    v_caller_role := (auth.jwt() -> 'app_metadata' ->> 'staff_role');

    IF v_caller_role IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: RLS context not set (app.staff_role is required)';
    END IF;
  END IF;

  -- Validate role is authorized for this operation
  IF v_caller_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % cannot issue comp redemptions', v_caller_role;
  END IF;

  -- Proceed with operation...
END;
```

**Why this matters:**
- Prevents accidental privilege escalation via direct client calls
- Forces developers to use `withServerAction` wrapper (rate limiting, audit logging, idempotency)
- Provides clear error messages when context is missing

---

## 6. RPC Security Contracts

### 6.1 mint_base_accrual (Deterministic Credit)

**Signature:**

```sql
CREATE OR REPLACE FUNCTION mint_base_accrual(
  p_rating_slip_id uuid,
  p_casino_id uuid,
  p_idempotency_key uuid
) RETURNS TABLE (
  ledger_id uuid,
  points_delta int,
  theo numeric,
  balance_after int,
  is_existing boolean
)
LANGUAGE plpgsql
SECURITY INVOKER  -- Runs with caller permissions
AS $$
```

**Security Contract:**

1. **Authentication:** Caller must have valid `auth.uid()`
2. **Casino scope:** `p_casino_id` must match `current_setting('app.casino_id')`
3. **Role requirement:** `pit_boss` or `admin` (validated explicitly)
4. **Idempotency:** Returns existing entry if `idempotency_key` already used
5. **RLS enforcement:** Insert policy checks casino_id + role before allowing ledger write
6. **Snapshot source:** Reads ONLY from `rating_slip.policy_snapshot->'loyalty'` (canonical)

**Error Codes:**
- `LOYALTY_SLIP_NOT_FOUND`: Rating slip does not exist
- `LOYALTY_SLIP_NOT_CLOSED`: Base accrual requires `status = 'closed'`
- `LOYALTY_SNAPSHOT_MISSING`: Rating slip lacks `policy_snapshot.loyalty`
- `UNAUTHORIZED`: RLS context not set
- `FORBIDDEN`: Caller role is not `pit_boss` or `admin`
- `CASINO_MISMATCH`: `p_casino_id` != `current_setting('app.casino_id')`

**Example Implementation Skeleton:**

```sql
CREATE OR REPLACE FUNCTION mint_base_accrual(
  p_rating_slip_id uuid,
  p_casino_id uuid,
  p_idempotency_key uuid
) RETURNS TABLE (
  ledger_id uuid,
  points_delta int,
  theo numeric,
  balance_after int,
  is_existing boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_context_casino_id uuid;
  v_caller_role text;
  v_slip record;
  v_loyalty_snapshot jsonb;
  v_theo numeric;
  v_base_points int;
  v_existing_entry record;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- SECURITY: Casino scope validation (SEC-001)
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: RLS context not set (app.casino_id is required)';
  END IF;

  IF p_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'CASINO_MISMATCH: Caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- SECURITY: Role validation (ADR-019)
  -- ═══════════════════════════════════════════════════════════════════════
  v_caller_role := NULLIF(current_setting('app.staff_role', true), '');

  IF v_caller_role IS NULL THEN
    -- Fallback to JWT
    v_caller_role := (auth.jwt() -> 'app_metadata' ->> 'staff_role');
  END IF;

  IF v_caller_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % cannot mint base accrual', v_caller_role;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- IDEMPOTENCY: Check for existing entry
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO v_existing_entry
  FROM loyalty_ledger
  WHERE casino_id = p_casino_id
    AND source_kind = 'rating_slip'
    AND source_id = p_rating_slip_id
    AND reason = 'base_accrual';

  IF FOUND THEN
    -- Return existing entry (idempotent hit)
    RETURN QUERY SELECT
      v_existing_entry.id,
      v_existing_entry.points_delta,
      (v_existing_entry.metadata->'calc'->>'theo')::numeric,
      (SELECT current_balance FROM player_loyalty
       WHERE player_id = v_existing_entry.player_id AND casino_id = p_casino_id),
      true;
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- BUSINESS LOGIC: Fetch rating slip and validate
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO v_slip
  FROM rating_slip
  WHERE id = p_rating_slip_id AND casino_id = p_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOYALTY_SLIP_NOT_FOUND: Rating slip % not found', p_rating_slip_id;
  END IF;

  IF v_slip.status != 'closed' THEN
    RAISE EXCEPTION 'LOYALTY_SLIP_NOT_CLOSED: Base accrual requires status=closed';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- CANONICAL SOURCE: policy_snapshot.loyalty (ADR-019 D2)
  -- ═══════════════════════════════════════════════════════════════════════
  v_loyalty_snapshot := v_slip.policy_snapshot->'loyalty';

  IF v_loyalty_snapshot IS NULL THEN
    RAISE EXCEPTION 'LOYALTY_SNAPSHOT_MISSING: Rating slip lacks policy_snapshot.loyalty';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- DETERMINISTIC CALCULATION (ADR-019 D1)
  -- ═══════════════════════════════════════════════════════════════════════
  v_theo := calculate_theo_from_snapshot(v_slip, v_loyalty_snapshot);
  v_base_points := ROUND(v_theo * (v_loyalty_snapshot->>'points_conversion_rate')::numeric);

  -- Constraint: Never mint negative points
  IF v_base_points < 0 THEN
    v_base_points := 0;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- INSERT LEDGER ENTRY (RLS enforced: casino_id + role check)
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO loyalty_ledger (
    casino_id,
    player_id,
    rating_slip_id,
    visit_id,
    points_delta,
    reason,
    idempotency_key,
    source_kind,
    source_id,
    metadata
  ) VALUES (
    p_casino_id,
    v_slip.player_id,
    p_rating_slip_id,
    v_slip.visit_id,
    v_base_points,
    'base_accrual',
    p_idempotency_key,
    'rating_slip',
    p_rating_slip_id,
    jsonb_build_object(
      'calc', jsonb_build_object(
        'theo', v_theo,
        'base_points', v_base_points,
        'conversion_rate', v_loyalty_snapshot->>'points_conversion_rate'
      ),
      'policy', jsonb_build_object(
        'snapshot_ref', 'rating_slip.policy_snapshot.loyalty',
        'version', v_loyalty_snapshot->>'policy_version'
      )
    )
  )
  RETURNING id INTO ledger_id;

  -- Update player_loyalty balance (upsert pattern)
  -- ... (implementation details)

  RETURN QUERY SELECT ledger_id, v_base_points, v_theo, balance_after, false;
END;
$$;
```

---

### 6.2 redeem_points (Comp Issuance / Debit)

**Signature:**

```sql
CREATE OR REPLACE FUNCTION redeem_points(
  p_casino_id uuid,
  p_player_id uuid,
  p_points int,  -- Positive cost (will be negated for ledger)
  p_issued_by_staff_id uuid,
  p_note text,
  p_idempotency_key uuid,
  p_allow_overdraw boolean DEFAULT false,
  p_reward_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL
) RETURNS TABLE (
  ledger_id uuid,
  points_delta int,  -- Negative value
  balance_before int,
  balance_after int,
  overdraw_applied boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
```

**Security Contract:**

1. **Authentication:** Caller must have valid `auth.uid()`
2. **Casino scope:** `p_casino_id` must match `current_setting('app.casino_id')`
3. **Role requirement:** `pit_boss`, `cashier`, or `admin`
4. **Overdraw authorization:** If `p_allow_overdraw = true`, requires `pit_boss` or `admin`
5. **Overdraw cap:** Overdraw amount ≤ `max_overdraw_points_per_redeem` (5000 default)
6. **Row locking:** `SELECT ... FOR UPDATE` on `player_loyalty` to prevent race conditions
7. **Mandatory note:** `p_note` must be non-empty (audit requirement)

**Error Codes:**
- `LOYALTY_INSUFFICIENT_BALANCE`: Balance < redemption cost and overdraw not allowed
- `LOYALTY_OVERDRAW_NOT_AUTHORIZED`: Caller lacks overdraw approval authority
- `LOYALTY_OVERDRAW_EXCEEDS_CAP`: Overdraw exceeds cap
- `LOYALTY_POINTS_INVALID`: Points must be positive integer
- `LOYALTY_NOTE_REQUIRED`: Note is required for all redemptions
- `LOYALTY_PLAYER_NOT_FOUND`: Player loyalty record not found
- `UNAUTHORIZED`: RLS context not set
- `FORBIDDEN`: Caller role is not authorized
- `CASINO_MISMATCH`: `p_casino_id` != `current_setting('app.casino_id')`

**Example Implementation (Skeleton):**

```sql
CREATE OR REPLACE FUNCTION redeem_points(
  p_casino_id uuid,
  p_player_id uuid,
  p_points int,
  p_issued_by_staff_id uuid,
  p_note text,
  p_idempotency_key uuid,
  p_allow_overdraw boolean DEFAULT false,
  p_reward_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL
) RETURNS TABLE (
  ledger_id uuid,
  points_delta int,
  balance_before int,
  balance_after int,
  overdraw_applied boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_context_casino_id uuid;
  v_caller_role text;
  v_balance_before int;
  v_balance_after int;
  v_overdraw_applied boolean := false;
  v_max_overdraw int := 5000;  -- TODO: Read from casino_settings
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- SECURITY: Casino scope + role validation
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: RLS context not set';
  END IF;

  IF p_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'CASINO_MISMATCH: Caller casino % != context %', p_casino_id, v_context_casino_id;
  END IF;

  v_caller_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')
  );

  IF v_caller_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % cannot issue comp redemptions', v_caller_role;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- VALIDATION: Input constraints
  -- ═══════════════════════════════════════════════════════════════════════
  IF p_points <= 0 THEN
    RAISE EXCEPTION 'LOYALTY_POINTS_INVALID: Points must be positive (got %)', p_points;
  END IF;

  IF p_note IS NULL OR trim(p_note) = '' THEN
    RAISE EXCEPTION 'LOYALTY_NOTE_REQUIRED: Note is required for redemptions';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- CONCURRENCY: Row-level lock on player_loyalty (ADR-019 P6)
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT current_balance INTO v_balance_before
  FROM player_loyalty
  WHERE player_id = p_player_id AND casino_id = p_casino_id
  FOR UPDATE;  -- Locks row until transaction commits

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOYALTY_PLAYER_NOT_FOUND: Player % has no loyalty record', p_player_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- OVERDRAW AUTHORIZATION (ADR-019 P4)
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_balance_before < p_points THEN
    -- Insufficient balance
    IF NOT p_allow_overdraw THEN
      RAISE EXCEPTION 'LOYALTY_INSUFFICIENT_BALANCE: Balance % < redemption %',
        v_balance_before, p_points;
    END IF;

    -- Overdraw requested; validate caller authority
    IF v_caller_role NOT IN ('pit_boss', 'admin') THEN
      RAISE EXCEPTION 'LOYALTY_OVERDRAW_NOT_AUTHORIZED: Role % cannot approve overdraw', v_caller_role;
    END IF;

    -- Check overdraw cap
    IF (v_balance_before - p_points) < (-1 * v_max_overdraw) THEN
      RAISE EXCEPTION 'LOYALTY_OVERDRAW_EXCEEDS_CAP: Overdraw would exceed cap %', v_max_overdraw;
    END IF;

    v_overdraw_applied := true;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- INSERT LEDGER ENTRY (RLS enforced)
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO loyalty_ledger (
    casino_id,
    player_id,
    points_delta,
    reason,
    staff_id,
    idempotency_key,
    metadata
  ) VALUES (
    p_casino_id,
    p_player_id,
    -1 * p_points,  -- NEGATIVE for debit
    'redeem',
    p_issued_by_staff_id,
    p_idempotency_key,
    jsonb_build_object(
      'redemption', jsonb_build_object(
        'reward_id', p_reward_id,
        'reference', p_reference,
        'note', p_note
      ),
      'balance_before', v_balance_before,
      'overdraw', CASE WHEN v_overdraw_applied THEN
        jsonb_build_object(
          'allowed', true,
          'approved_by_staff_id', p_issued_by_staff_id,
          'note', p_note
        )
      ELSE NULL END
    )
  )
  RETURNING id INTO ledger_id;

  -- Update balance
  v_balance_after := v_balance_before - p_points;

  UPDATE player_loyalty
  SET current_balance = v_balance_after,
      updated_at = now()
  WHERE player_id = p_player_id AND casino_id = p_casino_id;

  RETURN QUERY SELECT ledger_id, -1 * p_points, v_balance_before, v_balance_after, v_overdraw_applied;
END;
$$;
```

---

### 6.3 manual_credit (Service Recovery Credit)

**Signature:**

```sql
CREATE OR REPLACE FUNCTION manual_credit(
  p_casino_id uuid,
  p_player_id uuid,
  p_points int,  -- Positive only
  p_awarded_by_staff_id uuid,
  p_note text,
  p_idempotency_key uuid,
  p_suggested_points int DEFAULT NULL
) RETURNS TABLE (
  ledger_id uuid,
  points_delta int,
  balance_after int
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
```

**Security Contract:**

1. **Authentication:** Caller must have valid `auth.uid()`
2. **Casino scope:** `p_casino_id` must match `current_setting('app.casino_id')`
3. **Role requirement:** `pit_boss` or `admin` (cashier excluded - higher privilege)
4. **Mandatory note:** `p_note` must be non-empty (audit requirement)
5. **Positive points:** `p_points` must be > 0 (credits only)

**Error Codes:**
- `LOYALTY_POINTS_INVALID`: Points must be positive
- `LOYALTY_NOTE_REQUIRED`: Note is required for manual credits
- `UNAUTHORIZED`: RLS context not set
- `FORBIDDEN`: Caller role is not `pit_boss` or `admin`
- `CASINO_MISMATCH`: `p_casino_id` != `current_setting('app.casino_id')`

---

### 6.4 get_player_balance (Read-Only Helper)

**Signature:**

```sql
CREATE OR REPLACE FUNCTION get_player_balance(
  p_casino_id uuid,
  p_player_id uuid
) RETURNS TABLE (
  current_balance int,
  tier text,
  last_updated timestamptz
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT current_balance, tier, updated_at
  FROM player_loyalty
  WHERE casino_id = p_casino_id AND player_id = p_player_id;
$$;
```

**Security Contract:**

1. **RLS enforcement:** Read policy validates `casino_id` scoping
2. **No explicit role check:** Any authenticated staff from same casino can read
3. **Returns NULL:** If player has no loyalty record

---

### 6.5 get_player_ledger (Read-Only Paginated)

**Signature:**

```sql
CREATE OR REPLACE FUNCTION get_player_ledger(
  p_casino_id uuid,
  p_player_id uuid,
  p_cursor timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50
) RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  points_delta int,
  reason loyalty_reason,
  staff_id uuid,
  metadata jsonb
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT id, created_at, points_delta, reason, staff_id, metadata
  FROM loyalty_ledger
  WHERE casino_id = p_casino_id
    AND player_id = p_player_id
    AND (p_cursor IS NULL OR created_at < p_cursor)
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;
```

**Security Contract:**

1. **RLS enforcement:** Read policy validates `casino_id` scoping
2. **No explicit role check:** Any authenticated staff from same casino can read
3. **Cursor pagination:** Efficient for large ledgers

---

### 6.6 evaluate_session_reward_suggestion (Pure Helper)

**Signature:**

```sql
CREATE OR REPLACE FUNCTION evaluate_session_reward_suggestion(
  p_rating_slip_id uuid,
  p_as_of_ts timestamptz DEFAULT now()
) RETURNS TABLE (
  suggested_theo numeric,
  suggested_points int,
  policy_version text,
  max_recommended_points int,
  notes text
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
```

**Security Contract:**

1. **Pure read-only:** No INSERT/UPDATE/DELETE operations
2. **No minting:** Returns suggested values only; does not create ledger entries
3. **RLS enforcement:** Reads rating_slip with casino_id scoping
4. **No explicit role check:** Any authenticated staff can call

**Use Case:** UI displays "suggested comp value" during active sessions based on session-to-date theo.

---

## 7. Security Guarantees

### 7.1 Explicit Security Contracts

| Guarantee | Enforcement Mechanism |
|-----------|----------------------|
| **No cross-tenant access** | RLS policies enforce `casino_id` scoping at database level |
| **Role-based authorization** | RPC code validates `current_setting('app.staff_role')` before operations |
| **Append-only ledger** | UPDATE/DELETE policies return `false` for all users |
| **Idempotency** | Unique index on `(casino_id, idempotency_key)` prevents duplicates |
| **Overdraw control** | Role + cap validation in `redeem_points` RPC |
| **Audit provenance** | All ledger entries capture `staff_id`, `metadata`, `created_at` |
| **Deterministic minting** | Base accrual reads only from `policy_snapshot.loyalty` (canonical) |

### 7.2 Direct RPC Call Behavior

**Scenario:** Developer calls RPC without `withServerAction` wrapper.

**Result:**

| RPC | Behavior | Reason |
|-----|----------|--------|
| `mint_base_accrual` | ❌ **FAILS** | Role check fails (`app.staff_role` empty or invalid) |
| `redeem_points` | ❌ **FAILS** | Role check fails (cashier, pit_boss, admin required) |
| `manual_credit` | ❌ **FAILS** | Role check fails (pit_boss, admin required) |
| `get_player_balance` | ✅ **Succeeds** (if JWT valid) | RLS policy uses JWT fallback; no explicit role check |
| `get_player_ledger` | ✅ **Succeeds** (if JWT valid) | RLS policy uses JWT fallback; no explicit role check |
| `evaluate_session_reward_suggestion` | ✅ **Succeeds** (if JWT valid) | RLS policy uses JWT fallback; no explicit role check |

**Security Posture:**
- **Write operations fail** without proper context (safe default)
- **Read operations may succeed** via JWT fallback (acceptable for non-sensitive reads)
- **Best practice:** Always use `withServerAction` for consistent behavior

### 7.3 Failure Modes

| Failure Mode | Detection | Mitigation |
|--------------|-----------|------------|
| **Missing RLS context** | RPC role check raises `UNAUTHORIZED` | Force use of `withServerAction` wrapper |
| **Role mismatch** | RPC role check raises `FORBIDDEN` | Clear error message with required role |
| **Casino scope mismatch** | RPC casino validation raises `CASINO_MISMATCH` | Validates `p_casino_id` matches context |
| **Insufficient balance** | RPC business logic raises `LOYALTY_INSUFFICIENT_BALANCE` | Suggest overdraw approval or different comp |
| **Overdraw not authorized** | RPC role check raises `LOYALTY_OVERDRAW_NOT_AUTHORIZED` | Escalate to pit boss/admin |
| **Overdraw exceeds cap** | RPC cap validation raises `LOYALTY_OVERDRAW_EXCEEDS_CAP` | Cap violation prevented before write |
| **Duplicate idempotency key** | Unique index violation (PostgreSQL) | Return existing entry instead of error |

---

## 8. Validation & Testing

### 8.1 RLS Policy Verification

**Test: Cross-Casino Isolation**

```sql
-- Setup: Two casinos, two staff members
-- Casino A: Staff Alice (pit_boss)
-- Casino B: Staff Bob (pit_boss)

-- Set context for Alice (Casino A)
SELECT set_rls_context(
  p_actor_id := '<alice-staff-id>',
  p_casino_id := '<casino-a-id>',
  p_staff_role := 'pit_boss'
);

-- Alice can read Casino A ledger
SELECT count(*) FROM loyalty_ledger WHERE casino_id = '<casino-a-id>';
-- Expected: Success (returns count)

-- Alice CANNOT read Casino B ledger
SELECT count(*) FROM loyalty_ledger WHERE casino_id = '<casino-b-id>';
-- Expected: Success (returns 0 - RLS filters out rows)

-- Alice CANNOT insert into Casino B ledger
INSERT INTO loyalty_ledger (casino_id, player_id, points_delta, reason, metadata)
VALUES ('<casino-b-id>', '<player-id>', 100, 'base_accrual', '{}');
-- Expected: POLICY VIOLATION ERROR
```

**Test: Role Enforcement**

```sql
-- Set context for dealer (non-authenticated)
SELECT set_rls_context(
  p_actor_id := '<dealer-staff-id>',
  p_casino_id := '<casino-a-id>',
  p_staff_role := 'dealer'
);

-- Dealer CANNOT insert ledger entry
INSERT INTO loyalty_ledger (casino_id, player_id, points_delta, reason, metadata)
VALUES ('<casino-a-id>', '<player-id>', 100, 'base_accrual', '{}');
-- Expected: POLICY VIOLATION ERROR (role not in [pit_boss, admin, cashier])
```

**Test: Append-Only Enforcement**

```sql
-- Set context for admin
SELECT set_rls_context(
  p_actor_id := '<admin-staff-id>',
  p_casino_id := '<casino-a-id>',
  p_staff_role := 'admin'
);

-- Admin CANNOT update ledger entry
UPDATE loyalty_ledger
SET points_delta = 200
WHERE id = '<ledger-entry-id>';
-- Expected: POLICY VIOLATION ERROR (no_updates policy)

-- Admin CANNOT delete ledger entry
DELETE FROM loyalty_ledger WHERE id = '<ledger-entry-id>';
-- Expected: POLICY VIOLATION ERROR (no_deletes policy)
```

### 8.2 RPC Authorization Tests

**Test: Cashier Redemption (Allowed)**

```typescript
// Setup: Cashier with valid context
await withServerAction(
  async () => {
    const { data, error } = await supabase.rpc('redeem_points', {
      p_casino_id: casinoId,
      p_player_id: playerId,
      p_points: 500,
      p_issued_by_staff_id: cashierStaffId,
      p_note: 'Comp meal redemption',
      p_idempotency_key: uuidv4()
    });

    expect(error).toBeNull();
    expect(data.points_delta).toBe(-500);
  },
  { supabase, endpoint: 'loyalty.redeem', action: 'loyalty.redeem' }
);
```

**Test: Cashier Overdraw (Denied)**

```typescript
// Cashier tries to approve overdraw (should fail)
await withServerAction(
  async () => {
    const { data, error } = await supabase.rpc('redeem_points', {
      p_casino_id: casinoId,
      p_player_id: playerId,
      p_points: 10000,  // Exceeds balance
      p_issued_by_staff_id: cashierStaffId,
      p_note: 'VIP comp',
      p_allow_overdraw: true,  // Cashier lacks authority
      p_idempotency_key: uuidv4()
    });

    expect(error).not.toBeNull();
    expect(error.message).toContain('LOYALTY_OVERDRAW_NOT_AUTHORIZED');
  },
  { supabase, endpoint: 'loyalty.redeem', action: 'loyalty.redeem' }
);
```

**Test: Pit Boss Overdraw (Allowed)**

```typescript
// Pit boss approves overdraw (should succeed)
await withServerAction(
  async () => {
    const { data, error } = await supabase.rpc('redeem_points', {
      p_casino_id: casinoId,
      p_player_id: playerId,
      p_points: 2000,  // Exceeds balance (e.g., balance = 500)
      p_issued_by_staff_id: pitBossStaffId,
      p_note: 'VIP high roller comp - service recovery',
      p_allow_overdraw: true,
      p_idempotency_key: uuidv4()
    });

    expect(error).toBeNull();
    expect(data.overdraw_applied).toBe(true);
    expect(data.balance_after).toBeLessThan(0);
  },
  { supabase, endpoint: 'loyalty.redeem', action: 'loyalty.redeem' }
);
```

**Test: Direct RPC Call Fails (No Context)**

```typescript
// Direct call WITHOUT withServerAction wrapper
const { data, error } = await supabase.rpc('redeem_points', {
  p_casino_id: casinoId,
  p_player_id: playerId,
  p_points: 500,
  p_issued_by_staff_id: staffId,
  p_note: 'Test',
  p_idempotency_key: uuidv4()
});

expect(error).not.toBeNull();
expect(error.message).toContain('UNAUTHORIZED');
// Context not set (app.staff_role is NULL)
```

### 8.3 Idempotency Tests

**Test: Duplicate Idempotency Key**

```typescript
const idempKey = uuidv4();

// First call
const { data: data1, error: error1 } = await supabase.rpc('redeem_points', {
  p_casino_id: casinoId,
  p_player_id: playerId,
  p_points: 500,
  p_issued_by_staff_id: staffId,
  p_note: 'First redemption',
  p_idempotency_key: idempKey
});

expect(error1).toBeNull();
const ledgerId1 = data1.ledger_id;

// Second call with SAME idempotency key
const { data: data2, error: error2 } = await supabase.rpc('redeem_points', {
  p_casino_id: casinoId,
  p_player_id: playerId,
  p_points: 500,
  p_issued_by_staff_id: staffId,
  p_note: 'Duplicate attempt',
  p_idempotency_key: idempKey  // Same key
});

// Should return existing entry without creating duplicate
expect(error2).toBeNull();
expect(data2.ledger_id).toBe(ledgerId1);  // Same ledger ID
expect(data2.is_existing).toBe(true);     // Flag indicates idempotent hit
```

---

## 9. Migration Plan

### 9.1 Phase 1: RLS Policy Updates (Week 1)

**Goal:** Add `cashier` role to existing loyalty RLS policies.

**Tasks:**
1. Create migration `20251213_prd004_loyalty_rls_cashier_role.sql`
2. Drop and recreate `loyalty_ledger_insert`, `player_loyalty_insert`, `player_loyalty_update` policies with cashier role
3. Test policy changes in staging environment
4. Deploy to production (zero downtime - policies are additive)

**Risk:** Low (additive change, no breaking changes)

### 9.2 Phase 2: RPC Implementation (Week 2-3)

**Goal:** Implement SECURITY INVOKER RPCs with explicit role checks.

**RPCs to Implement:**
1. `mint_base_accrual` - Base accrual on rating slip close
2. `redeem_points` - Comp issuance with overdraw control
3. `manual_credit` - Service recovery credits
4. `get_player_balance` - Read-only balance helper
5. `get_player_ledger` - Read-only paginated ledger

**Tasks per RPC:**
1. Write SQL function with SECURITY INVOKER
2. Add casino scope validation (SEC-001 Template 5)
3. Add explicit role checks (validate `app.staff_role`)
4. Add idempotency handling (unique index check)
5. Add row locking for mutations (`SELECT ... FOR UPDATE`)
6. Write unit tests (golden fixtures)
7. Write integration tests (RLS + role enforcement)

**Risk:** Medium (complex business logic, concurrency handling)

### 9.3 Phase 3: Service Layer Integration (Week 3-4)

**Goal:** Wire RPCs into LoyaltyService TypeScript layer.

**Tasks:**
1. Create `services/loyalty/rpc-wrappers.ts` - Type-safe RPC call wrappers
2. Create `services/loyalty/crud.ts` - Service methods that call RPCs
3. Create `services/loyalty/mappers.ts` - Row → DTO transformations
4. Update API routes to use LoyaltyService methods
5. Write integration tests (end-to-end API tests)

**Risk:** Low (plumbing work, well-defined interfaces)

### 9.4 Phase 4: Validation & Security Audit (Week 4)

**Goal:** Verify security contracts and role enforcement.

**Checklist:**
- [ ] RLS policies enforce casino scoping for all tables
- [ ] RLS policies enforce role gates for write operations
- [ ] Append-only ledgers block UPDATE/DELETE for all users
- [ ] RPCs validate casino_id matches `current_setting('app.casino_id')`
- [ ] RPCs validate role before privileged operations
- [ ] Overdraw requires pit_boss or admin + cap enforcement
- [ ] Idempotency prevents duplicate entries
- [ ] Direct RPC calls fail without proper context
- [ ] Cross-tenant access blocked in integration tests
- [ ] Role escalation attempts blocked in integration tests

**Deliverable:** Security audit report documenting compliance with ADR-015, ADR-019, SEC-001.

---

## 10. Appendix A: Enum Migration (loyalty_reason)

### 10.1 Current State

**Existing Enum Values (Migration `00000000000000_baseline_srm.sql`):**

```sql
CREATE TYPE loyalty_reason AS ENUM (
  'mid_session',
  'session_end',
  'manual_adjustment',
  'promotion',
  'correction'
);
```

### 10.2 Required Enum Values (ADR-019 v2)

**Canonical Reason Codes:**

```sql
-- New values required:
'base_accrual'    -- Deterministic slip close credit (replaces session_end)
'redeem'          -- Comp issuance debit (new)
'manual_reward'   -- Service recovery credit (replaces manual_adjustment for credits)
'adjustment'      -- Admin correction (+/-) (rename from manual_adjustment)
'reversal'        -- Reversal of prior entry (new)
'promotion'       -- Existing (keep)

-- Legacy values (keep for historical data, prohibit new writes):
'mid_session'     -- DEPRECATED (conflated semantics)
'session_end'     -- DEPRECATED (replaced by base_accrual)
'correction'      -- DEPRECATED (replaced by adjustment/reversal)
```

### 10.3 Migration Strategy (ADR-019 P1: Strategy B - Additive)

**Decision:** Keep legacy enum values for historical rows; add new values; enforce write prohibition via RPC validation.

**Migration: `20251213_prd004_loyalty_enum_expansion.sql`**

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- PRD-004: Expand loyalty_reason enum with canonical reason codes
-- Strategy: Additive (keep legacy values, add new values, prohibit legacy writes)
-- Reference: ADR-019 v2, PRD-004 Appendix B
-- ═══════════════════════════════════════════════════════════════════════════

-- Add new enum values (idempotent with IF NOT EXISTS)
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'base_accrual';
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'redeem';
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'manual_reward';
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'adjustment';
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'reversal';

-- Note: Existing values ('mid_session', 'session_end', 'manual_adjustment', 'promotion', 'correction')
-- remain for historical data but are write-prohibited in RPC logic.

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION:
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT enum_range(NULL::loyalty_reason);
-- Expected output includes all canonical + legacy values
```

**RPC Validation (Example):**

```sql
-- Inside mint_base_accrual RPC:
IF p_reason NOT IN ('base_accrual') THEN
  RAISE EXCEPTION 'LOYALTY_INVALID_REASON: Base accrual must use reason=base_accrual';
END IF;

-- Inside redeem_points RPC:
-- Hardcoded to use 'redeem' reason (no parameter)
v_reason := 'redeem';

-- Inside manual_credit RPC:
-- Hardcoded to use 'manual_reward' reason
v_reason := 'manual_reward';
```

**Benefits:**
- No data migration required (historical rows unchanged)
- No enum value renaming (PostgreSQL limitation avoided)
- Clear semantic separation (new code uses new reasons)
- Legacy values remain queryable for audit/reporting

---

## 11. Appendix B: Connection Pooling Edge Cases

### 11.1 ADR-015 Compliance

**Context:** Supabase uses Supavisor connection pooling in transaction mode (port 6543). Each query may get a different connection from the pool.

**Problem (Legacy Pattern):**

```typescript
// ❌ BAD: Each SET LOCAL on different connection (pre-ADR-015)
await supabase.rpc('exec_sql', { sql: "SET LOCAL app.actor_id = 'uuid-1'" });
await supabase.rpc('exec_sql', { sql: "SET LOCAL app.casino_id = 'uuid-2'" });
await supabase.rpc('exec_sql', { sql: "SET LOCAL app.staff_role = 'admin'" });
// Subsequent query may run on DIFFERENT connection where context is unset!
```

**Solution (ADR-015):**

```typescript
// ✅ GOOD: Single RPC call wraps all SET LOCAL in one transaction
await supabase.rpc('set_rls_context', {
  p_actor_id: 'uuid-1',
  p_casino_id: 'uuid-2',
  p_staff_role: 'admin'
});
// All context variables set atomically in same transaction
```

### 11.2 JWT Fallback Behavior

**Scenario:** Connection pooling edge case where `SET LOCAL` context is lost.

**RLS Policy Resolution (Pattern C):**

```sql
-- Try transaction context first
COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,  -- Returns NULL if unset or empty
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid        -- Fall back to JWT
)
```

**Behavior:**
1. `current_setting('app.casino_id', true)` returns `''` (empty string) if not set
2. `NULLIF(..., '')` converts empty string to `NULL`
3. `COALESCE` falls back to JWT `app_metadata.casino_id`
4. Policy evaluates with JWT claim value

**Security Guarantee:** Even if transaction context is lost, JWT fallback ensures tenant isolation.

---

## 12. References

- **PRD-004:** `/home/diepulp/projects/pt-2/docs/10-prd/PRD-004-loyalty-service.md`
- **ADR-019 v2:** `/home/diepulp/projects/pt-2/docs/80-adrs/ADR-019-loyalty-points-policy_v2.md`
- **ADR-015:** `/home/diepulp/projects/pt-2/docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`
- **SEC-001:** `/home/diepulp/projects/pt-2/docs/30-security/SEC-001-rls-policy-matrix.md`
- **withServerAction:** `/home/diepulp/projects/pt-2/lib/server-actions/with-server-action-wrapper.ts`
- **RLS Context:** `/home/diepulp/projects/pt-2/lib/supabase/rls-context.ts`
- **Existing Migrations:**
  - `20251211153228_adr015_rls_compliance_patch.sql` - Loyalty RLS policies (Pattern C)
  - `20251212080915_sec006_rls_hardening.sql` - Append-only denial policies
  - `20251209183033_adr015_rls_context_rpc.sql` - `set_rls_context()` RPC

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | RLS Security Specialist | Initial specification: RPC/RLS role enforcement for PRD-004, SECURITY INVOKER pattern, Pattern C hybrid policies, cashier role integration, overdraw authorization, direct RPC call behavior |
