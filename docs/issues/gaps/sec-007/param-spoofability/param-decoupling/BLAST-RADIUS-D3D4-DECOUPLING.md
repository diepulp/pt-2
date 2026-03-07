# BLAST-RADIUS: D3/D4 p_casino_id Decoupling

**Filed**: 2026-03-06
**Source**: 3-agent parallel blast radius investigation
**Status**: READY FOR EXECUTION
**Companion**: INV-SEC007-DELEGATION-PARAM-SPOOFABILITY-AUDIT.md

## Executive Summary

Removing `p_casino_id` from the 4 remaining RPCs is a **well-contained, low-risk decoupling** with one P0 deployment hazard. The blast radius is:

- **1 SQL migration** (4 DROP+CREATE statements)
- **11 TypeScript files** (5 production, 6 test)
- **~30 line deletions** across the TS layer (all trivial single-line removals)
- **0 DTO changes, 0 schema changes, 0 hook interface changes, 0 route handler changes**

The one hazard: `rpc_create_financial_adjustment` is called directly from the browser — a migration/rebuild timing mismatch will break the cashier adjustment workflow.

---

## 1. SQL Migration Blast Radius

### Per-RPC `p_casino_id` Usage Sites

| RPC | `p_casino_id` occurrences in body | All replaceable with `v_casino_id`? | Cross-validates with delegation param? | Overloads? | Dependent objects? |
|-----|-----------------------------------|-------------------------------------|---------------------------------------|------------|-------------------|
| `rpc_create_financial_txn` | 4 (mismatch check, INSERT, ON CONFLICT ref, COMMENT) | YES | NO | None (stale ones already dropped) | None |
| `rpc_create_financial_adjustment` | 5 (mismatch check, original-txn lookup, 2x INSERT, ON CONFLICT ref) | YES | N/A (no delegation param) | None | None |
| `rpc_manual_credit` | 7 (mismatch check, idempotency, balance query, INSERT, EXISTS, UPDATE, INSERT fallback) | YES | NO | None | None |
| `rpc_redeem` | 7 (mismatch check, idempotency, balance query, FOR UPDATE lock, INSERT, UPDATE) | YES | NO | None | None |

**Key finding**: In NONE of the 4 RPCs is `p_casino_id` cross-validated against the delegation param. The decoupling is structurally clean — no codepath connects these two concerns.

### Authoritative Function Definitions

| RPC | Latest migration | Params (current) | Params (after) |
|-----|-----------------|-------------------|----------------|
| `rpc_create_financial_txn` | `20260217153443_prd033_rpc_financial_txn_external_ref.sql` | 13 | 12 |
| `rpc_create_financial_adjustment` | `20260219002247_enable_adjustment_telemetry.sql` | 8 | 7 |
| `rpc_manual_credit` | `20251229154020_adr024_loyalty_rpcs.sql` line 484 | 6 | 5 |
| `rpc_redeem` | `20251229154020_adr024_loyalty_rpcs.sql` line 285 | 9 | 8 |

### GRANT/REVOKE Requirements

| RPC | Existing GRANT/REVOKE? | Action |
|-----|----------------------|--------|
| `rpc_create_financial_txn` | YES (`20260302230032` lines 17-20, old 13-param sig) | Replicate with new 12-param sig |
| `rpc_create_financial_adjustment` | YES (`20260302230032` lines 23-26, old 8-param sig) | Replicate with new 7-param sig |
| `rpc_manual_credit` | **NO — EXECUTE TO PUBLIC by default** | **Add** REVOKE PUBLIC/anon + GRANT authenticated/service_role (hardening bonus) |
| `rpc_redeem` | **NO — EXECUTE TO PUBLIC by default** | **Add** REVOKE PUBLIC/anon + GRANT authenticated/service_role (hardening bonus) |

### Configuration to Preserve/Upgrade

| RPC | Security | Volatility | `SET search_path` (current) | Action |
|-----|----------|------------|---------------------------|--------|
| `rpc_create_financial_txn` | INVOKER | VOLATILE | `= public` | Upgrade to `= pg_catalog, public` |
| `rpc_create_financial_adjustment` | INVOKER | VOLATILE | `= public` | Upgrade to `= pg_catalog, public` |
| `rpc_manual_credit` | INVOKER | VOLATILE | **Missing** | Add `= pg_catalog, public` |
| `rpc_redeem` | INVOKER | VOLATILE | **Missing** | Add `= pg_catalog, public` |

### `set_rls_context_from_staff()` Already Present

All 4 RPCs already call `set_rls_context_from_staff()` as their first statement and derive `v_casino_id` from context. The `p_casino_id` parameter feeds a mismatch check that compares it against the already-derived value. Removing `p_casino_id` is purely subtractive — the derivation path is already the authoritative one.

| RPC | Context call line | `v_casino_id` derivation line |
|-----|------------------|-------------------------------|
| `rpc_create_financial_txn` | Line 40 | Line 42 |
| `rpc_create_financial_adjustment` | Line 87 | Line 89 |
| `rpc_manual_credit` | Line 511 | Line 517 |
| `rpc_redeem` | Line 319 | Line 325 |

---

## 2. TypeScript Callsite Cascade

### Production Files (5 files, ~7 line deletions)

| # | File | Line(s) | RPC | Change | Complexity |
|---|------|---------|-----|--------|------------|
| 1 | `services/player-financial/crud.ts` | 152 | `rpc_create_financial_txn` | Delete `p_casino_id: input.casino_id,` | Trivial |
| 2 | `services/player-financial/http.ts` | 186 | `rpc_create_financial_adjustment` | Delete `p_casino_id: input.casino_id,` | Trivial |
| 3 | `services/loyalty/crud.ts` | 259 | `rpc_redeem` | Delete `p_casino_id: input.casinoId,` | Trivial |
| 4 | `services/loyalty/crud.ts` | 311 | `rpc_manual_credit` | Delete `p_casino_id: input.casinoId,` | Trivial |
| 5 | `lib/finance.ts` | 6, 18, 28 | `rpc_create_financial_txn` | Remove `casinoId` from type, destructure, and RPC arg | Low |

### Test Files (6 files, ~28 line deletions)

| # | File | Occurrences | RPC(s) | Complexity |
|---|------|-------------|--------|------------|
| 1 | `lib/supabase/__tests__/pit-boss-financial-txn.test.ts` | **15** | `rpc_create_financial_txn` | Medium (bulk delete) |
| 2 | `__tests__/services/table-context/finance-telemetry-bridge.int.test.ts` | **6** | `rpc_create_financial_txn` | Low |
| 3 | `services/loyalty/__tests__/crud.test.ts` | **3** | `rpc_redeem` (2), `rpc_manual_credit` (1) | Trivial |
| 4 | `services/player-financial/__tests__/crud.test.ts` | **1** | `rpc_create_financial_txn` | Trivial |
| 5 | `__tests__/lib/finance.test.ts` | **2** | `rpc_create_financial_txn` | Trivial |
| 6 | `services/security/__tests__/rls-context.integration.test.ts` | **0** (string refs only) | N/A | None |

### Files Confirmed NOT Requiring Changes

- **All DTOs** — `casino_id`/`casinoId` fields remain (used for cache keys, route handler context, non-RPC purposes)
- **All Zod schemas** — validation fields stay (API boundary validation)
- **All hooks** — no interface changes (DTOs unchanged, hooks consume DTOs not RPC args)
- **All route handlers** — no changes needed (they pass to service layer, not directly to RPCs)
- **All mappers** — map RPC responses, not inputs

---

## 3. Risk Matrix

| # | Hazard | Likelihood | Impact | Severity | Mitigation |
|---|--------|-----------|--------|----------|------------|
| **R1** | Browser-cached JS calls `rpc_create_financial_adjustment` with stale `p_casino_id` after migration | **HIGH** | **HIGH** (cashier adjustment workflow broken until hard refresh) | **P0** | 2-phase migration (see below) or atomic Vercel+migration deploy |
| R2 | Server-side old code sends `p_casino_id` to migrated RPCs during deployment gap | MEDIUM | HIGH (financial txns fail) | P1 | Server restarts load new code immediately; deploy migration + code atomically |
| R3 | SEC-003 allowlist update ordering causes CI gate failure | MEDIUM | LOW (CI failure, not runtime) | P2 | Migration first, allowlist shrink second (WS10 pattern) |
| R4 | Partial DROP+CREATE if migration not wrapped in transaction | LOW | HIGH (orphaned overload) | P2 | Wrap D3/D4 migration in explicit `BEGIN...COMMIT` |
| R5 | Rollback needed but old function body unavailable | LOW | MEDIUM (15-30 min recovery) | P2 | Pre-compute rollback migration from git history |
| R6 | `database.types.ts` not regenerated after migration | MEDIUM | MEDIUM (type-check fails) | P1 | `npm run db:types-local` is Gate G1 |

---

## 4. P0 Mitigation: Browser-Side `rpc_create_financial_adjustment`

`services/player-financial/http.ts` line 184 calls `rpc_create_financial_adjustment` directly from the browser via `createBrowserComponentClient()`. After migration, cached browser bundles will send `p_casino_id` to a function that no longer accepts it — PostgREST returns 404.

### Option A: 2-Phase Migration (zero-downtime)

**Phase 1** — Make `p_casino_id DEFAULT NULL` on all 4 RPCs:
- Old client code sends `p_casino_id` → function accepts but ignores it (uses `v_casino_id`)
- New client code omits `p_casino_id` → function works normally

**Phase 2** — Deploy new TS/JS bundle to Vercel

**Phase 3** — Follow-up migration removes `p_casino_id` entirely (clean catalog)

### Option B: Atomic Deploy (simpler, accepts brief risk)

- Merge PR with both migration + TS changes
- Run `supabase db push` and trigger Vercel deploy simultaneously
- Accept ~30-60s window where cached browser clients may fail
- Users recover on next page load (new JS bundle served)

---

## 5. Security Gate Sequencing

| Gate | Affected? | Details |
|------|-----------|---------|
| SEC-001 (permissive TRUE) | No | RLS policy check |
| SEC-002 (overload ambiguity) | Transitional | Safe if migration wrapped in transaction |
| **SEC-003 (identity params)** | **YES** | Allowlist shrinks from 4 → 0. Check 3 drift detection emits WARN for stale entries until allowlist updated. |
| SEC-004 (PUBLIC execute) | Yes | New REVOKE/GRANT must match existing pattern |
| SEC-005 (deprecated context) | No | Already use `set_rls_context_from_staff()` |
| SEC-006 (context first-line) | No | Only checks SECURITY DEFINER; all 4 are INVOKER |
| SEC-007 (dashboard RPC) | No | Single-RPC check |
| SEC-008 (deprecated body) | No | Already compliant |

**Correct ordering**:
1. Apply migration (removes `p_casino_id` from RPCs)
2. Update SEC-003 allowlist (shrink from 4 to 0)
3. Run `run_all_gates.sh` → expect 8/8 pass

---

## 6. Recommended Deployment Sequence

```
1. Pre-deploy    Write rollback migration from git diff (keep in _rollback/, untested)
2. Migration     Apply D3/D4 migration wrapped in BEGIN...COMMIT
                 - DROP+CREATE all 4 RPCs without p_casino_id
                 - REVOKE PUBLIC/anon + GRANT authenticated/service_role (all 4)
                 - SET search_path = pg_catalog, public (all 4)
                 - NOTIFY pgrst, 'reload schema' (once at end)
3. Types         npm run db:types-local → commit updated database.types.ts
4. TS cascade    Delete p_casino_id from 5 production files + 6 test files (~30 lines)
5. Validate      npm run type-check && npm run build && npm run lint
6. Tests         npm run test:ci > /tmp/d3d4-tests.log 2>&1
7. SEC-003       Shrink allowlist from 4 to 0 in 03_identity_param_check.sql
8. Security      bash supabase/tests/security/run_all_gates.sh → 8/8 pass
9. Deploy        Push migration + code together (atomic)
```

---

## 7. Blast Radius Summary

| Dimension | Count | Risk |
|-----------|-------|------|
| SQL functions modified | 4 | Low (all INVOKER, no dependents, no overloads) |
| `p_casino_id` body sites replaced | 23 total (4+5+7+7) | Low (all straight `v_casino_id` substitutions) |
| Production TS files changed | 5 | Trivial (single-line deletions) |
| Test TS files changed | 5 (1 needs no change) | Low-Medium (28 occurrences, mostly bulk delete) |
| DTOs changed | 0 | None |
| Schemas changed | 0 | None |
| Hooks changed | 0 | None |
| Route handlers changed | 0 | None |
| Security gates affected | 1 (SEC-003 allowlist) | Low (same pattern as D1/D2 WS5) |
| Deployment hazards | 1 P0 (browser-side RPC) | Mitigable via 2-phase or atomic deploy |

**Conclusion**: The decoupling is safe to execute. The blast radius is well-contained, follows the established D1/D2 precedent, and requires no architectural changes. The P0 browser-side deployment hazard is the only item requiring a decision (2-phase vs atomic).
