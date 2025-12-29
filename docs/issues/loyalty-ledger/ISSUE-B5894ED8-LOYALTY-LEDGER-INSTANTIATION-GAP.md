# ISSUE-B5894ED8: Loyalty Ledger Instantiation Gap

**Status:** P0 Database Fix Complete | P0 Service Layer Fix Requires Refactor
**Date:** 2025-12-29
**Severity:** P0 (Production Bug)
**Affects:** LoyaltyService, CasinoService, Enrollment Flow
**Related Issues:** ISSUE-AE49B5DD (column collision), ISSUE-752833A6 (policy snapshot)

---

## Executive Summary

`enrollPlayer()` creates `player_casino` but **NOT** `player_loyalty`. The seed.sql masks this bug by explicitly creating both records. In production, newly enrolled players have no loyalty account until their first rating slip close triggers a lazy upsert—which may fail due to RLS policy gaps.

**Objectives (no scope creep):**
1. Guarantee `player_loyalty` exists **immediately at enrollment** (no "create on accrue")
2. Make the guarantee **atomic + idempotent** (safe to retry)
3. Preserve SRM/SLAD boundaries (no cross-context table writes)
4. Stop seed data from masking the bug
5. Add a test that would have caught this

**Out of scope (this patch):**
- Outbox/event-driven enrollment
- Global auth strategy rework
- Loyalty program logic redesign

---

## Root Cause Analysis

### Confirmed Bug: player_loyalty Not Created on Enrollment

| Component | Creates `player` | Creates `player_casino` | Creates `player_loyalty` |
|-----------|------------------|-------------------------|--------------------------|
| `enrollPlayer()` (services/casino/crud.ts:480-510) | No | Yes | **No** |
| `rpc_create_player` (migration 20251227034101) | Yes | Yes | **No** |
| `seed.sql` (lines 144-173) | Yes | Yes | Yes **MASKS BUG** |

### Code Evidence

**services/casino/crud.ts:480-510** - `enrollPlayer()` only creates `player_casino`:
```typescript
export async function enrollPlayer(...) {
  const { data, error } = await supabase
    .from("player_casino")  // Only creates player_casino
    .upsert({ player_id: playerId, casino_id: casinoId, ... })
    .select("player_id, casino_id, status, enrolled_at, enrolled_by")
    .single();
  // NO player_loyalty creation!
}
```

**seed.sql:144-173** - Explicitly creates both (masking the bug):
```sql
-- Section 8: player_casino enrollment
INSERT INTO player_casino (player_id, casino_id, status) VALUES ...

-- Section 9: player_loyalty (EXPLICIT CREATION)
INSERT INTO player_loyalty (player_id, casino_id, current_balance, tier, preferences) VALUES ...
```

---

## Architectural Audit

### What to Keep
- The diagnosis: missing `player_loyalty` provisioning is the root cause
- The idea of fixing the canonical RPC (`rpc_create_player`) so enrollment is transactional

### What to Fix / Avoid

| Anti-Pattern | Problem | SRM Reference |
|--------------|---------|---------------|
| Service-layer direct insert into `player_loyalty` from CasinoService | **Bounded-context violation** (Casino writing Loyalty-owned data) | SRM v4.9.0 §LoyaltyService |
| Lazy-create inside `rpc_accrue_on_close` | Accrual is not the place to provision accounts; creates hidden coupling + role-policy explosions | ADR-019 §ledger model |

---

## Chosen Approach

### Primary: Enrollment RPC Provisions Loyalty (Atomic)

Patch `rpc_create_player` to ensure in **one transaction**:
- `player_casino` exists
- `player_loyalty` exists
- with **idempotent upserts** guarded by unique keys

**Status:** ✅ Done in `20251229020455_fix_loyalty_instantiation_gap.sql`

### Secondary: Remove Lazy-Create from Accrual Path

`rpc_accrue_on_close` must assume the loyalty account exists. If not, return a **hard, explicit error**:

```sql
IF NOT EXISTS (
  SELECT 1 FROM public.player_loyalty
  WHERE player_id = v_player_id AND casino_id = v_casino_id
) THEN
  RAISE EXCEPTION 'player_loyalty_missing: player_id=%, casino_id=%', v_player_id, v_casino_id
    USING ERRCODE = 'P0001';
END IF;
```

**Status:** ❌ Not yet implemented

### Tertiary: Enforce Invariants at DB Level

Add constraints so the invariant cannot rot:

```sql
-- Ensure enrollment key exists (if missing)
ALTER TABLE public.player_casino
  ADD CONSTRAINT player_casino_player_casino_uk UNIQUE (player_id, casino_id);

-- Loyalty must be unique per player+casino
ALTER TABLE public.player_loyalty
  ADD CONSTRAINT player_loyalty_player_casino_uk UNIQUE (player_id, casino_id);

-- Loyalty cannot exist without enrollment
ALTER TABLE public.player_loyalty
  ADD CONSTRAINT player_loyalty_player_casino_fk
  FOREIGN KEY (player_id, casino_id)
  REFERENCES public.player_casino (player_id, casino_id)
  ON DELETE CASCADE;
```

**Status:** ❌ Not yet implemented

---

## RLS Policy Analysis

### player_loyalty INSERT Policy Excludes Cashier

From `20251214195201_adr015_prd004_loyalty_rls_fix.sql:86-100`:

```sql
CREATE POLICY player_loyalty_insert ON player_loyalty
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(...)
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')  -- CASHIER EXCLUDED FROM INSERT
  );
```

**Impact:** Only `pit_boss` and `admin` can INSERT into `player_loyalty`. Cashiers can UPDATE but NOT INSERT.

### Resolution

Because provisioning is now in the enrollment RPC (SECURITY DEFINER), the RLS INSERT policy becomes irrelevant for enrollment. Only roles that can call `rpc_create_player` matter—currently `pit_boss` and `admin`. If cashiers need to enroll, either:

**Option A (preferred):** Add `cashier` to `rpc_create_player` role check
**Option B:** Create a separate `rpc_enroll_player` callable by cashiers

---

## Bounded Context Analysis

### SRM Ownership (SERVICE_RESPONSIBILITY_MATRIX.md)

| Service | Owns | Responsibility |
|---------|------|----------------|
| **CasinoService** | `player_casino` | Enrollment relationship (who is enrolled where) |
| **LoyaltyService** | `player_loyalty`, `loyalty_ledger` | Reward policy & assignment |

### ADR-022 Enrollment Prerequisite (D7)

> Identity rows MUST NOT exist unless a matching enrollment exists in `player_casino(casino_id, player_id)`.
> **Enforcement:** FK constraint with `ON DELETE CASCADE`.

**Gap:** ADR-022 establishes `player_casino` as prerequisite for `player_identity`, but there's **NO ADR establishing when `player_loyalty` should be created**.

---

## Documentation Gaps Identified

| Document | Gap |
|----------|-----|
| **ADR-019 v2** | Specifies ledger-based credit/debit model but doesn't specify when `player_loyalty` is created |
| **ADR-022** | Focuses on `player_identity` lifecycle, silent on `player_loyalty` |
| **EXEC-SPEC-PRD-004** | WS1 says "Create/update player_loyalty table" but no initialization workstream |
| **SRM v4.9.0** | Defines ownership but not lifecycle timing for `player_loyalty` |
| **PRD-004** | Doesn't specify enrollment → loyalty initialization requirement |

---

## Current Implementation Status

### ✅ Completed (Correct)

| Item | File | Notes |
|------|------|-------|
| RPC creates `player_loyalty` atomically | `20251229020455_fix_loyalty_instantiation_gap.sql` | SECURITY DEFINER, respects SRM |

### ❌ Needs Refactor (Bounded-Context Violation)

| Item | File | Issue |
|------|------|-------|
| Service layer creates `player_loyalty` | `services/casino/crud.ts:516-528` | CasinoService writing Loyalty-owned data |

**Current code (to be removed):**
```typescript
// In enrollPlayer() - BOUNDED-CONTEXT VIOLATION
const { error: loyaltyError } = await supabase.from("player_loyalty").upsert(
  { player_id: playerId, casino_id: casinoId, ... },
  { onConflict: "player_id,casino_id", ignoreDuplicates: true }
);
```

**Fix:** Remove this block. The RPC already handles it atomically.

### ❌ Not Yet Implemented

| Item | Description | Priority |
|------|-------------|----------|
| Remove lazy-create from `rpc_accrue_on_close` | Hard-fail if no loyalty account | P0 |
| FK constraint: `player_loyalty` → `player_casino` | Enforce at DB level | P1 |
| Seed.sql uses enrollment path | Stop direct `player_loyalty` inserts | P1 |
| Backfill migration | Create missing `player_loyalty` for existing enrollments | P1 |
| Integration test | Enrollment → loyalty invariant | P2 |
| ADR for loyalty initialization timing | Document the lifecycle | P2 |
| SRM update | Add `player_loyalty` lifecycle notes | P2 |

---

## Remediation Checklist

### P0 (Must Ship Together)

- [x] Add `player_loyalty` creation to `rpc_create_player` (migration done)
- [ ] Remove lazy-create from `rpc_accrue_on_close` (hard fail)
- [ ] Remove cross-context write from `enrollPlayer()` (service layer)

### P1 (Immediately After P0)

- [ ] Add unique + FK constraints for `player_loyalty`
- [ ] Backfill migration for already-enrolled rows missing loyalty
- [ ] Seed uses enrollment path, not direct inserts
- [ ] Commit uncommitted migrations (column collision, self-injection, player lookup)

### P2 (Follow-up)

- [ ] Integration test: enrollment provisions loyalty account
- [ ] Document `player_loyalty` lifecycle in SRM
- [ ] Create ADR for loyalty initialization timing

---

## Acceptance Criteria (Definition of Done)

- [ ] Enrolling a player results in both `player_casino` and `player_loyalty` existing (same request)
- [ ] `rpc_accrue_on_close` no longer creates `player_loyalty`
- [ ] `enrollPlayer()` does NOT write to `player_loyalty` (SRM compliance)
- [ ] Constraints prevent duplicates and prevent loyalty without enrollment
- [ ] `seed.sql` uses enrollment path, not direct table inserts for loyalty
- [ ] Integration test covers enrollment + accrual under at least one "non-admin" role

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Adding FK/unique constraints fails due to existing bad rows | Run backfill first (or in same migration before constraints) |
| Expanding INSERT policy to include cashier grants more than intended | Only include if they can enroll; otherwise enforce via enrollment route |
| Enrollment flow splits across multiple calls (partial state) | Prefer single RPC orchestration |
| Removing lazy-create breaks existing flows | Backfill ensures all enrolled players have loyalty accounts first |

---

## Investigation Methodology

Six parallel agents conducted investigation:

1. **RLS Expert 1**: player_loyalty table RLS policies
2. **RLS Expert 2**: loyalty_ledger table RLS policies
3. **RLS Expert 3**: player_casino enrollment RLS policies
4. **RLS Expert 4**: Cross-table RLS interactions
5. **Lead Architect**: SRM bounded context ownership
6. **API Builder**: RPC contracts and service layer

### Consensus Findings

All agents confirmed:
- `enrollPlayer()` only creates `player_casino`, not `player_loyalty`
- Seed.sql explicitly creates both records, masking the production bug
- RLS INSERT policy on `player_loyalty` excludes cashier role
- RPCs use lazy upsert pattern that assumes RLS allows INSERT
- No EXEC-SPEC or ADR specifies `player_loyalty` initialization timing

---

## Related Issues

### ISSUE-AE49B5DD: Column Collision in rpc_get_rating_slip_modal_data

**Status:** Fix exists but uncommitted

### ISSUE-752833A6: Policy Snapshot Remediation

**Status:** Fixes in uncommitted migrations:
- `20251228225240_repair_rpc_self_injection.sql`
- `20251228225241_fix_accrue_player_lookup.sql`

---

## References

- `docs/80-adrs/ADR-019-loyalty-points-policy_v2.md` - Ledger-based credit/debit model
- `docs/80-adrs/ADR-022_Player_Identity_Enrollment_DECISIONS.md` - Player identity decisions
- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` - Bounded context ownership
- `docs/20-architecture/specs/PRD-004/EXECUTION-SPEC-PRD-004.md` - Loyalty service implementation spec
- `docs/80-adrs/ADR-014-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling.md` - Ghost visit handling
- `services/casino/crud.ts:480-538` - enrollPlayer() implementation
- `supabase/migrations/20251229020455_fix_loyalty_instantiation_gap.sql` - rpc_create_player fix
- `supabase/migrations/20251214195201_adr015_prd004_loyalty_rls_fix.sql` - player_loyalty RLS policies

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2025-12-29 | Lead Architect | Initial investigation report with 6-agent consensus |
| 2025-12-29 | Claude Opus 4.5 | P0 database fix: migration 20251229020455 |
| 2025-12-29 | Claude Opus 4.5 | P0 service fix: added to enrollPlayer() |
| 2025-12-29 | Claude Opus 4.5 | Incorporated remediation path: identified service-layer fix as bounded-context violation, updated checklist |
