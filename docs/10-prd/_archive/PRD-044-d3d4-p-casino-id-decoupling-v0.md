---
id: PRD-044
title: "D3/D4 p_casino_id Decoupling — Final 4 RPCs"
owner: Platform / Security
status: Proposed
affects: [ADR-024, ADR-018, SEC-003, SEC-007, PRD-043]
created: 2026-03-06
last_review: 2026-03-06
phase: "SEC-007 Zero-Tolerance Enforcement"
source: "docs/issues/gaps/sec-007/param-spoofability/param-decoupling/REMEDIATION-DECISION-MEMO-D3D4-P-CASINO-ID-DECOUPLING.md"
pattern: B
http_boundary: false
---

# PRD-044 --- D3/D4 p_casino_id Decoupling --- Final 4 RPCs

## 1. Overview

- **Owner:** Platform / Security
- **Status:** Proposed
- **Summary:** PRD-043 Phases 1--3 removed `p_casino_id` from 10 of 14 RPCs. The remaining 4 RPCs (`rpc_create_financial_txn`, `rpc_create_financial_adjustment`, `rpc_manual_credit`, `rpc_redeem`) were blocked by OQ-1/OQ-2 delegation-parameter decisions. A 5-agent security investigation and blast-radius analysis determined that `p_casino_id` removal is structurally independent from delegation params and should proceed immediately. This PRD decouples the tenant-boundary remediation from the identity-attribution remediation, zeroing the SEC-003 allowlist and enabling hard enforcement of ADR-024's derive-only mandate.

---

## 2. Problem & Goals

### 2.1 Problem

The SEC-003 allowlist contains 4 entries for RPCs that still accept `p_casino_id`. These RPCs already derive `v_casino_id` from `set_rls_context_from_staff()` internally --- the caller-supplied `p_casino_id` feeds only a redundant mismatch assertion. Its presence:

1. **Blocks zero-tolerance enforcement**: SEC-003 cannot flip from NOTICE to EXCEPTION while the allowlist is non-empty.
2. **Creates false coupling**: PRD-043 WS6--WS9 bundled `p_casino_id` removal with delegation-param decisions (OQ-1/OQ-2), despite these being independent concerns.
3. **Leaves 2 RPCs exposed to PUBLIC**: `rpc_manual_credit` and `rpc_redeem` lack REVOKE statements --- any Supabase role can EXECUTE them.
4. **Leaves 2 RPCs without `search_path` hardening**: Same 2 RPCs lack `SET search_path`, exposing them to search-path injection.

A decision memo approved decoupling `p_casino_id` removal from delegation-param remediation, with corrective conditions.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Remove `p_casino_id` from 4 remaining RPCs | `SELECT proname FROM pg_proc WHERE proname LIKE 'rpc_%' AND 'p_casino_id' = ANY(proargnames) AND pronamespace = 'public'::regnamespace;` returns 0 rows |
| **G2**: SEC-003 allowlist empty, enforcement flipped | SEC-003 allowlist array is `'{}'`. `run_all_gates.sh` exits 0 (8/8 pass). |
| **G3**: REVOKE/GRANT hardening on `rpc_manual_credit` and `rpc_redeem` | SEC-004 gate passes; `SELECT has_function_privilege('anon', 'rpc_manual_credit(...)', 'EXECUTE')` returns `false` |
| **G4**: `search_path` normalized on all 4 RPCs | All 4 RPCs have `SET search_path = pg_catalog, public` in `proconfig` |
| **G5**: Zero-downtime deployment for browser-facing RPC | `rpc_create_financial_adjustment` uses compatibility migration (DEFAULT NULL phase) to avoid breaking cached browser clients |

### 2.3 Non-Goals

- Removing or modifying delegation params (`p_created_by_staff_id`, `p_awarded_by_staff_id`, `p_issued_by_staff_id`) --- tracked separately per INV-SEC007
- Adding new tests for delegation-param spoofability (separate remediation stream)
- Resolving OQ-1/OQ-2 business decisions (decoupled by design)
- Modifying DTOs, Zod schemas, hooks, or route handlers
- Changing RLS policies on `loyalty_ledger` or `player_financial_transaction`

---

## 3. Users & Use Cases

- **Primary users:** Platform engineers, security reviewers, cashiers (indirectly)

**Top Jobs:**

- As a **platform engineer**, I need the SEC-003 allowlist at zero so that the CI gate enforces hard-fail on any new `p_casino_id` introduction.
- As a **security reviewer**, I need all client-callable RPCs to derive tenant context exclusively from `set_rls_context_from_staff()` so that ADR-024 compliance is verifiable via catalog query.
- As a **cashier**, I need financial adjustment operations to remain functional during migration rollout so that my workflow is not interrupted.

---

## 4. Scope & Feature List

### 4.1 In Scope

**SQL Migration (4 RPCs):**
- Remove `p_casino_id` from `rpc_create_financial_txn` (12 params -> 11)
- Remove `p_casino_id` from `rpc_create_financial_adjustment` via compatibility rollout (7 params -> 6, with DEFAULT NULL intermediate)
- Remove `p_casino_id` from `rpc_manual_credit` (5 params -> 4)
- Remove `p_casino_id` from `rpc_redeem` (8 params -> 7)

**Security Hardening (bundled):**
- REVOKE ALL FROM PUBLIC, anon + GRANT EXECUTE TO authenticated, service_role on `rpc_manual_credit`
- REVOKE ALL FROM PUBLIC, anon + GRANT EXECUTE TO authenticated, service_role on `rpc_redeem`
- Replicate existing GRANT/REVOKE for `rpc_create_financial_txn` and `rpc_create_financial_adjustment` with new signatures

**Configuration Normalization:**
- Add/upgrade `SET search_path = pg_catalog, public` on all 4 RPCs

**TypeScript Cascade:**
- Remove `p_casino_id` from 5 production callsites
- Update 6 test files (~28 line deletions)

**SEC-003 Enforcement:**
- Shrink allowlist from 4 to 0
- Flip SEC-003 Check 2 from NOTICE to EXCEPTION for `p_casino_id` violations

**Operational Safety:**
- Prepare rollback migration artifact before deployment
- Compatibility rollout for browser-facing `rpc_create_financial_adjustment`

### 4.2 Out of Scope

- Delegation-param removal (INV-SEC007 follow-up)
- New integration tests for delegation-param spoofability
- DTO/schema/hook/route-handler changes (none needed)
- RLS policy changes
- UI changes

---

## 5. Requirements

### 5.1 Functional Requirements

- **FR-1**: All 4 RPCs must derive `casino_id` exclusively from `current_setting('app.casino_id')` after `set_rls_context_from_staff()`. No caller-supplied tenant context.
- **FR-2**: `rpc_create_financial_adjustment` must accept `p_casino_id DEFAULT NULL` during the compatibility phase so cached browser clients do not break.
- **FR-3**: The compatibility parameter must be ignored in the function body (use `v_casino_id` from context, not the parameter).
- **FR-4**: After browser bundle deployment, a cleanup migration must remove the compatibility parameter entirely.
- **FR-5**: `rpc_manual_credit` and `rpc_redeem` must not be executable by `anon` or `PUBLIC` roles after migration.
- **FR-6**: All 4 RPCs must include `SET search_path = pg_catalog, public`.
- **FR-7**: SEC-003 allowlist must be empty after all migrations land. Check 2 must hard-fail on any `p_casino_id` in `rpc_*` catalog entries.

### 5.2 Non-Functional Requirements

- **NFR-1**: Zero-downtime deployment --- cached browser clients must not receive PostgREST 404 errors during migration rollout.
- **NFR-2**: Rollback migration must be pre-computed and available before deployment (forward-fix pattern per ENVIRONMENT-FLOW.md).
- **NFR-3**: Migration must be wrapped in explicit `BEGIN...COMMIT` to prevent partial DROP+CREATE failures.
- **NFR-4**: `NOTIFY pgrst, 'reload schema'` at end of migration for PostgREST cache invalidation.
- **NFR-5**: All existing volatility markers preserved (all 4 are VOLATILE --- default, no marker needed).

> Architecture details: See [ADR-024](../../80-adrs/ADR-024_DECISIONS.md), [SEC-001](../../30-security/SEC-001-rls-policy-matrix.md), [EXEC-043](../../21-exec-spec/PRD-043/EXEC-043-sec007-remaining-rpc-remediation.md)

---

## 6. UX / Flow Overview

No user-facing UI changes. The change is entirely at the RPC and service layer.

**Flow 1: Compatibility Rollout for `rpc_create_financial_adjustment`**
1. Phase 1 migration lands: `p_casino_id` becomes `DEFAULT NULL`, ignored in body
2. Old browser bundles continue sending `p_casino_id` --- accepted but ignored
3. Vercel deploys new JS bundle without `p_casino_id` in RPC calls
4. Phase 3 cleanup migration removes `p_casino_id DEFAULT NULL` entirely
5. Catalog is clean; SEC-003 allowlist shrinks to 0

**Flow 2: Standard Remediation for Other 3 RPCs (server-side only)**
1. Migration drops old function, creates new function without `p_casino_id`
2. Server restarts load new TS code simultaneously
3. Callsites no longer pass `p_casino_id`
4. No browser exposure --- server-side only

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **PRD-043 Phases 1--3 merged** --- D1+D2 (10 RPCs) must be on the branch. Confirmed: commit `d510025`.
- **SEC-003 allowlist at 4 entries** --- Current state confirmed in `03_identity_param_check.sql`.
- **Supabase local running** --- Required for `npm run db:types-local` type regeneration.

### 7.2 Risks & Open Questions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **R1**: Browser-cached JS calls `rpc_create_financial_adjustment` with stale `p_casino_id` | HIGH | HIGH (cashier workflow broken) | Compatibility rollout with `DEFAULT NULL` intermediate phase |
| **R2**: Server-side deployment gap for other 3 RPCs | MEDIUM | HIGH (financial/loyalty txns fail) | Atomic migration + code deploy; server restart loads new code immediately |
| **R3**: SEC-003 allowlist update ordering causes CI failure | MEDIUM | LOW (CI only) | Migration first, allowlist shrink second |
| **R4**: Partial DROP+CREATE if transaction not wrapped | LOW | HIGH (orphaned overload) | Wrap migration in `BEGIN...COMMIT` |
| **R5**: Rollback needed after deployment | LOW | MEDIUM (15-30 min recovery) | Pre-compute rollback migration from git diff |

### 7.3 Former Open Questions (Resolved)

| ID | Question | Resolution |
|----|----------|------------|
| OQ-1 | Should `rpc_create_financial_txn` keep `p_created_by_staff_id`? | **Decoupled** --- out of scope for this PRD. Delegation params are a separate remediation stream (INV-SEC007). |
| OQ-2 | Should loyalty RPCs keep delegation params? | **Decoupled** --- same. The 5-agent investigation found no cross-validation between `p_casino_id` and delegation params in any of the 4 function bodies. |

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] All 4 RPCs have `p_casino_id` removed from `proargnames` (catalog query returns 0 rows)
- [ ] `rpc_create_financial_adjustment` compatibility phase: `p_casino_id DEFAULT NULL` accepted but ignored
- [ ] `rpc_create_financial_adjustment` cleanup phase: `p_casino_id` fully removed from catalog
- [ ] All TypeScript callsites updated (`grep -r "p_casino_id" services/ hooks/ lib/ --include='*.ts'` returns 0 matches for in-scope RPCs)

**Data & Integrity**
- [ ] Existing financial transactions and loyalty ledger entries are unaffected (no data migration)
- [ ] `v_casino_id` derivation path unchanged (already authoritative via `set_rls_context_from_staff()`)

**Security & Access**
- [ ] `rpc_manual_credit` and `rpc_redeem`: `anon` and `PUBLIC` EXECUTE revoked
- [ ] All 4 RPCs: `SET search_path = pg_catalog, public` confirmed in `proconfig`
- [ ] SEC-003 allowlist empty (0 entries)
- [ ] All 8 security gates pass (`run_all_gates.sh` exits 0)

**Testing**
- [ ] `npm run type-check` passes (zero errors)
- [ ] `npm run build` passes (exit 0)
- [ ] `npm run test:ci` passes (all tests green)
- [ ] Catalog zero-tolerance query: `SELECT proname FROM pg_proc WHERE proname LIKE 'rpc_%' AND 'p_casino_id' = ANY(proargnames) AND pronamespace = 'public'::regnamespace;` returns 0 rows
- [ ] Positional args check: `SELECT proname FROM pg_proc WHERE proname LIKE 'rpc_%' AND pg_get_function_arguments(oid) ~* '\mp_casino_id\M' AND pronamespace = 'public'::regnamespace;` returns 0 rows

**Operational Readiness**
- [ ] Rollback migration artifact prepared before deployment
- [ ] Compatibility rollout verified: old browser bundle + new migration = no errors
- [ ] Migration wrapped in `BEGIN...COMMIT`
- [ ] `NOTIFY pgrst, 'reload schema'` included

**Documentation**
- [ ] GAP-SEC007-D3D4 updated with resolution status
- [ ] INV-SEC007 cross-referenced as follow-up for delegation params

---

## 9. Related Documents

- **Decision Memo**: `docs/issues/gaps/sec-007/param-spoofability/param-decoupling/REMEDIATION-DECISION-MEMO-D3D4-P-CASINO-ID-DECOUPLING.md`
- **Blast Radius**: `docs/issues/gaps/sec-007/BLAST-RADIUS-D3D4-DECOUPLING.md`
- **Security Investigation**: `docs/issues/gaps/sec-007/INV-SEC007-DELEGATION-PARAM-SPOOFABILITY-AUDIT.md`
- **Original Gap**: `docs/issues/gaps/sec-007/GAP-SEC007-D3D4-UNBLOCK-CASINO-ID-FROM-DELEGATION.md`
- **Parent PRD**: `docs/10-prd/PRD-043-sec007-remaining-rpc-p-casino-id-remediation-v0.md`
- **EXEC-043**: `docs/21-exec-spec/PRD-043/EXEC-043-sec007-remaining-rpc-remediation.md` (WS6--WS10)
- **ADR-024**: `docs/80-adrs/ADR-024_DECISIONS.md`
- **SEC-001 RLS Matrix**: `docs/30-security/SEC-001-rls-policy-matrix.md`
- **SEC-003 Gate**: `supabase/tests/security/03_identity_param_check.sql`
- **Deployment Flow**: `docs/deployments/ENVIRONMENT-FLOW.md`

---

## Appendix A: Migration Blast Radius

### Per-RPC p_casino_id Body Sites

| RPC | `p_casino_id` occurrences | All replaced with `v_casino_id` | Cross-validates with delegation param? |
|-----|--------------------------|--------------------------------|---------------------------------------|
| `rpc_create_financial_txn` | 4 | YES | NO |
| `rpc_create_financial_adjustment` | 5 | YES | N/A (no delegation param) |
| `rpc_manual_credit` | 7 | YES | NO |
| `rpc_redeem` | 7 | YES | NO |

### Authoritative Function Sources

| RPC | Migration file | Params (before -> after) |
|-----|---------------|--------------------------|
| `rpc_create_financial_txn` | `20260217153443_prd033_rpc_financial_txn_external_ref.sql` | 13 -> 12 |
| `rpc_create_financial_adjustment` | `20260219002247_enable_adjustment_telemetry.sql` | 8 -> 7 |
| `rpc_manual_credit` | `20251229154020_adr024_loyalty_rpcs.sql` line 484 | 6 -> 5 |
| `rpc_redeem` | `20251229154020_adr024_loyalty_rpcs.sql` line 285 | 9 -> 8 |

---

## Appendix B: TypeScript Change Manifest

### Production Files (5 files, ~7 line deletions)

| File | Line | RPC | Change |
|------|------|-----|--------|
| `services/player-financial/crud.ts` | 152 | `rpc_create_financial_txn` | Delete `p_casino_id: input.casino_id,` |
| `services/player-financial/http.ts` | 186 | `rpc_create_financial_adjustment` | Delete `p_casino_id: input.casino_id,` |
| `services/loyalty/crud.ts` | 259 | `rpc_redeem` | Delete `p_casino_id: input.casinoId,` |
| `services/loyalty/crud.ts` | 311 | `rpc_manual_credit` | Delete `p_casino_id: input.casinoId,` |
| `lib/finance.ts` | 6, 18, 28 | `rpc_create_financial_txn` | Remove `casinoId` from type + destructure + RPC arg |

### Test Files (6 files, ~28 line deletions)

| File | Occurrences | RPC(s) |
|------|-------------|--------|
| `lib/supabase/__tests__/pit-boss-financial-txn.test.ts` | 15 | `rpc_create_financial_txn` |
| `__tests__/services/table-context/finance-telemetry-bridge.int.test.ts` | 6 | `rpc_create_financial_txn` |
| `services/loyalty/__tests__/crud.test.ts` | 3 | `rpc_redeem`, `rpc_manual_credit` |
| `services/player-financial/__tests__/crud.test.ts` | 1 | `rpc_create_financial_txn` |
| `__tests__/lib/finance.test.ts` | 2 | `rpc_create_financial_txn` |
| `services/security/__tests__/rls-context.integration.test.ts` | 0 (string refs only) | N/A |

### Files Confirmed Unchanged

- All DTOs (`services/player-financial/dtos.ts`, `services/loyalty/dtos.ts`) --- `casino_id`/`casinoId` fields retained for cache keys and non-RPC uses
- All Zod schemas --- validation fields stay (API boundary)
- All hooks --- no interface changes
- All route handlers --- no changes needed
- All mappers --- map responses, not inputs

---

## Appendix C: Deployment Sequence

```
Phase 1 --- Compatibility Migration
  1. CREATE migration: p_casino_id DEFAULT NULL on rpc_create_financial_adjustment
     (body ignores param, uses v_casino_id)
  2. DROP+CREATE the other 3 RPCs without p_casino_id
  3. REVOKE/GRANT on all 4 RPCs
  4. SET search_path = pg_catalog, public on all 4
  5. NOTIFY pgrst, 'reload schema'
  6. npm run db:types-local
  7. TS cascade: remove p_casino_id from 5 production + 6 test files
  8. npm run type-check && npm run build && npm run lint

Phase 2 --- Deploy
  9. Push migration + TS code together
  10. Verify old browser bundles still work (p_casino_id accepted as NULL)
  11. Vercel deploys new bundle (no p_casino_id in RPC calls)

Phase 3 --- Cleanup Migration
  12. CREATE migration: DROP+CREATE rpc_create_financial_adjustment without p_casino_id
  13. Shrink SEC-003 allowlist from 4 to 0
  14. Run run_all_gates.sh --- expect 8/8 pass
  15. Catalog zero-tolerance query --- expect 0 rows
```

---

## Appendix D: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-03-06 | Claude Opus 4.6 | Initial draft from approved decision memo + 8-agent investigation corpus |
