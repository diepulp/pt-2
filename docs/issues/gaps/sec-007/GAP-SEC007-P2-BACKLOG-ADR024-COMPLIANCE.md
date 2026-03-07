# GAP-SEC007-P2-BACKLOG-ADR024-COMPLIANCE

**Severity**: P2
**Domain**: Security, RLS, RPC
**Discovered**: 2026-03-02
**Status**: Open
**Affects**: ADR-024, ADR-018, ADR-015, SEC-007, SEC-001
**Source**: EXEC-040 WS11 (deferred from SEC-007 tenant isolation enforcement)
**PRD Warranted**: Yes — P2-1 requires coordinated 12-RPC rewrite + TS caller cascade

---

## Summary

SEC-007 remediation (EXEC-040) addressed all P0 critical and P1 high findings. Five P2 findings were explicitly deferred to WS11. These represent **consistency/compliance gaps** against ADR-024 target state, not active exploits. The validate-pattern on affected RPCs is functional — callers supply `p_casino_id` which is checked against session context — but the parameter's existence violates ADR-024's derive-only mandate.

A PRD is warranted because P2-1 (12-RPC parameter removal) cascades to ~60+ TypeScript call sites across 5-6 bounded contexts and requires phased rollout.

---

## P2 Findings

### P2-1: 12 RPCs accept `p_casino_id` with validate-pattern instead of derive [PARAM]

**Risk**: Compliance — validate-pattern works but violates ADR-024 target state
**Effort**: HIGH — 12 function rewrites + TypeScript caller cascades

Functions affected:

| # | Function | Bounded Context | Arg Count |
|---|----------|----------------|-----------|
| 1 | `rpc_activate_floor_layout` | FloorLayout | 3 |
| 2 | `rpc_close_rating_slip` | RatingSlip | 3 |
| 3 | `rpc_create_floor_layout` | FloorLayout | 3 |
| 4 | `rpc_create_player` | Player | 4 |
| 5 | `rpc_log_table_drop` | TableContext | 11 |
| 6 | `rpc_log_table_inventory_snapshot` | TableContext | 7 |
| 7 | `rpc_move_player` | RatingSlip | 5 |
| 8 | `rpc_pause_rating_slip` | RatingSlip | 2 |
| 9 | `rpc_request_table_credit` | TableContext | 8 |
| 10 | `rpc_request_table_fill` | TableContext | 8 |
| 11 | `rpc_resume_rating_slip` | RatingSlip | 2 |
| 12 | `rpc_update_table_status` | TableContext | 3 |

**Current pattern** (validate — functional but non-compliant):
```sql
-- Caller supplies p_casino_id; function validates against session
IF p_casino_id IS DISTINCT FROM
   NULLIF(current_setting('app.casino_id', true), '')::uuid
THEN RAISE EXCEPTION 'casino_id mismatch';
END IF;
```

**Target pattern** (derive — ADR-024 compliant):
```sql
-- No p_casino_id parameter; function derives from session
v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
IF v_casino_id IS NULL THEN
  RAISE EXCEPTION 'no casino context';
END IF;
```

**TypeScript impact**: Each RPC removal cascades to service-layer callers that currently pass `casinoId` to the RPC. Estimated ~60+ call sites across:
- `services/rating-slip/crud.ts`
- `services/visit/crud.ts`
- `services/player/crud.ts`
- `services/table-context/crud.ts` (table-mgmt operations)
- `services/floor-layout/crud.ts`

---

### P2-2: `rpc_create_financial_txn` — spoofable `p_created_by_staff_id` [PARAM]

**Risk**: Potential — allows spoofed actor attribution in financial records
**Effort**: MEDIUM — depends on business decision

**Issue**: Function accepts `p_created_by_staff_id` for audit attribution. Caller supplies staff ID rather than deriving from context.

**Business question**: Is delegated attribution ("supervisor records on behalf of staff") a legitimate use case? If yes, the current parameter may be acceptable with explicit documentation. If no, derive from `current_setting('app.actor_id')`.

**Action required**: Product/business decision before remediation.

#### Delegation follow-up (documented for PRD-041 deferral)

| Item | Details |
|------|---------|
| **Decision Owner** | Priya Shah (Director, Product Strategy) |
| **Follow-up Artifact** | `docs/10-prd/PRD-052-financial-txn-delegation.md` — to be drafted by Product to capture delegation rules and implementation approach |
| **Target Date** | 2026-03-24 (one sprint after PRD-041 ship) |
| **Current Status** | Deferred from PRD-041. Engineering blocked until Product confirms whether delegated attribution is allowed. If *disallowed*, PRD-052 must include a migration plan to drop `p_created_by_staff_id` and derive from `app.actor_id`. If *allowed*, PRD-052 must document the approved exception and ADR addendum reference. |

This table must be updated once the follow-up PRD is created or the delegation decision is finalized.

---

### P2-3: `chipset_total_cents` granted to anon [GRANT]

**Risk**: Low — unnecessary exposure of computational helper
**Effort**: LOW — single REVOKE statement

**Issue**: Pure computational helper (no data access) is callable by unauthenticated users via PostgREST. Violates least-privilege.

**Remediation**:
```sql
REVOKE ALL ON FUNCTION public.chipset_total_cents(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chipset_total_cents(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.chipset_total_cents(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chipset_total_cents(jsonb) TO service_role;
```

---

### P2-4: 8 denial policies missing `auth.uid() IS NOT NULL` prefix [RLS]

**Risk**: None — functionally equivalent; style/consistency issue
**Effort**: LOW — policy rewrites with no behavioral change

**Issue**: Some RLS denial policies use bare `USING (false)` instead of the project convention `USING (auth.uid() IS NOT NULL AND false)`. Both deny all access. The explicit `auth.uid()` check makes intent clear and is consistent with all other policies.

**Affected count**: 8 policies (exact list TBD from catalog scan during remediation)

---

### P2-5: `player_tag` UPDATE missing WITH CHECK [RLS]

**Risk**: Low — allows `casino_id` mutation on UPDATE for a low-impact table
**Effort**: LOW — single WITH CHECK clause addition

**Issue**: Same gap pattern as P1-4 (which was fixed for `promo_program` and `promo_coupon`). The `player_tag` UPDATE policy has a USING clause but no WITH CHECK, meaning a valid row selection can mutate `casino_id` to a different tenant.

**Remediation**:
```sql
DROP POLICY IF EXISTS player_tag_update ON player_tag;
CREATE POLICY player_tag_update ON player_tag
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt()->'app_metadata'->>'casino_id')::uuid
    )
  )
  WITH CHECK (
    casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt()->'app_metadata'->>'casino_id')::uuid
    )
  );
```

---

## CI Gate Coverage

The following WS12 gates already track P2 items:

| Gate | P2 Coverage |
|------|-------------|
| SEC-003 (Identity Param Check) | Warns on 26 RPCs with `p_casino_id` — hard fails on `p_actor_id` only. Once P2-1 ships, remove allowlist for zero-tolerance. |
| SEC-004 (Public EXECUTE Check) | Tracks 46 pre-existing PUBLIC grants as warnings. P2-3 (`chipset_total_cents`) included. |
| SEC-002 (Overload Ambiguity) | 3 shift metrics overloads allowlisted — separate from P2 scope but tracked. |

---

## Recommended Remediation Plan

### Sprint 1 — Quick Wins (P2-2 through P2-5)

| Item | Action | Effort |
|------|--------|--------|
| P2-2 | Business decision on delegation semantics; then parameter removal or documentation | 1-2 days |
| P2-3 | REVOKE `chipset_total_cents` from anon | 1 migration |
| P2-4 | Normalize 8 denial policy patterns | 1 migration |
| P2-5 | Add WITH CHECK to `player_tag` UPDATE | 1 migration |

### Sprint 2-3 — Validate-to-Derive Migration (P2-1)

Phased by bounded context to limit blast radius:

| Phase | Functions | Context |
|-------|-----------|---------|
| 2a | `rpc_pause_rating_slip`, `rpc_resume_rating_slip`, `rpc_close_rating_slip`, `rpc_move_player` | RatingSlip |
| 2b | `rpc_update_table_status`, `rpc_log_table_drop`, `rpc_log_table_inventory_snapshot`, `rpc_request_table_credit`, `rpc_request_table_fill` | TableContext |
| 2c | `rpc_create_player` | Player |
| 2d | `rpc_create_floor_layout`, `rpc_activate_floor_layout` | FloorLayout |

Each phase: DROP old signature → CREATE new (sans `p_casino_id`) → update TS callers → type regeneration → acceptance tests.

---

## References

| Document | Relevance |
|----------|-----------|
| `docs/21-exec-spec/EXEC-040-sec007-tenant-isolation-enforcement.md` | WS11 definition and deferral rationale |
| `docs/30-security/SEC-007-tenant-isolation-enforcement-contract.md` | Full audit findings (P0-P2) |
| `docs/30-security/ROLE_GATING_CANON.md` | Grant management rules |
| `docs/30-security/templates/RLS_RPC_SECURITY_REVIEW_CHECKLIST.md` | PR review checklist |
| `supabase/tests/security/03_identity_param_check.sql` | CI gate tracking p_casino_id |
| `supabase/tests/security/04_public_execute_check.sql` | CI gate tracking PUBLIC grants |
| `docs/80-adrs/ADR-024_DECISIONS.md` | Authoritative context derivation target state |
| `.claude/skills/build-pipeline/checkpoints/EXEC-040.json` | Pipeline checkpoint (WS11 deferred) |
