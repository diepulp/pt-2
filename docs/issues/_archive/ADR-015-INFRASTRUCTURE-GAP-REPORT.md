# ADR-015 Infrastructure Gap Report

**Generated:** 2025-12-11
**Reference:** docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md
**Scanner:** scripts/adr015-rls-scanner.sh

---

## Executive Summary

| Category | Status | Notes |
|----------|--------|-------|
| **Database RLS Policies** | REMEDIATION PENDING | 52 issues in 4 legacy migrations; fix migration created |
| **Application Layer** | COMPLIANT | `injectRLSContext()` uses `set_rls_context()` RPC |
| **Server Actions Middleware** | COMPLIANT | `withRLS()` middleware calls transaction-wrapped RPC |
| **JWT Claims Sync** | COMPLIANT | Staff CRUD and trigger auto-sync claims |
| **Service Layer** | COMPLIANT | No direct SET LOCAL usage found |

---

## ADR-015 Pattern Reference

### Compliant Pattern (Pattern C - Hybrid)

```sql
CREATE POLICY "table_read_hybrid"
  ON {table_name} FOR SELECT USING (
    auth.uid() IS NOT NULL                              -- Guard 1: Authenticated
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,  -- Try session first
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid       -- JWT fallback
    )
  );
```

### Anti-Patterns to Avoid

| Anti-Pattern | Why It's Bad | Example |
|--------------|--------------|---------|
| Bare `current_setting()` | Fails with connection pooling | `casino_id = current_setting('app.casino_id')::uuid` |
| Missing `true` param | Throws error if unset | `current_setting('app.casino_id')` vs `current_setting('app.casino_id', true)` |
| Missing `auth.uid()` check | Allows unauthenticated access | Policy without `auth.uid() IS NOT NULL` |
| Direct `SET LOCAL` | Fails across pooled connections | Multiple RPC calls with SET LOCAL |
| JWT-only (no session fallback) | Doesn't work with transaction-wrapped context | `auth.jwt() ->> 'casino_id'` alone |

---

## Database Layer Analysis

### Migration Scan Results

| Migration File | Issues | Status |
|----------------|--------|--------|
| `20251128221408_rating_slip_pause_tracking.sql` | 9 | Fixed by `20251209183401` |
| `20251129161956_prd000_casino_foundation.sql` | 18 | Fixed by `20251211153228` |
| `20251129230733_prd003_player_visit_rls.sql` | 23 | Fixed by `20251209183401` |
| `20251209023430_fix_staff_rls_bootstrap.sql` | 2 | Fixed by `20251211153228` |

### Issue Breakdown

| Anti-Pattern | Count | Description |
|--------------|-------|-------------|
| BARE_CURRENT_SETTING | 30 | Missing COALESCE(NULLIF(...)) wrapper |
| MISSING_TRUE_PARAM | 3 | Missing `true` param (throws on null) |
| MISSING_AUTH_UID | 19 | Policy lacks `auth.uid() IS NOT NULL` |
| DEPRECATED_SET_LOCAL | 0 | SET LOCAL outside transaction-wrapped RPC |

### ADR-015 Compliant Migrations (Fixes Applied)

1. **`20251209183033_adr015_rls_context_rpc.sql`** - Creates `set_rls_context()` RPC
2. **`20251209183401_adr015_hybrid_rls_policies.sql`** - Upgrades visit, player, player_casino, rating_slip_pause, rating_slip, gaming_table, dealer_rotation
3. **`20251210001858_adr015_backfill_jwt_claims.sql`** - JWT claims sync trigger + backfill
4. **`20251211153228_adr015_rls_compliance_patch.sql`** - Fixes casino_settings, staff + 16 tables missing RLS

### Tables Now Protected (via 20251211153228 patch)

| Table | RLS Status | Policies |
|-------|------------|----------|
| casino_settings | Upgraded | Pattern C (read/write) |
| staff | Upgraded | Pattern C with bootstrap |
| player_loyalty | NEW | SELECT, INSERT, UPDATE |
| loyalty_ledger | NEW | SELECT, INSERT |
| loyalty_outbox | NEW | SELECT, INSERT |
| player_financial_transaction | NEW | SELECT, INSERT |
| finance_outbox | NEW | SELECT, INSERT |
| mtl_entry | NEW | SELECT, INSERT |
| mtl_audit_note | NEW | SELECT (via mtl_entry), INSERT |
| game_settings | NEW | SELECT, INSERT, UPDATE |
| gaming_table_settings | NEW | SELECT, INSERT, UPDATE |
| table_inventory_snapshot | NEW | SELECT, INSERT |
| table_fill | NEW | SELECT, INSERT, UPDATE |
| table_credit | NEW | SELECT, INSERT, UPDATE |
| table_drop_event | NEW | SELECT, INSERT |
| audit_log | NEW | SELECT, INSERT |
| report | NEW | SELECT, INSERT |

### RPCs Fixed

| RPC Name | Issue | Fix |
|----------|-------|-----|
| `rpc_issue_mid_session_reward` | Referenced dropped `rating_slip.player_id` | Now derives player_id via JOIN to visit |

---

## Application Layer Analysis

### `lib/supabase/rls-context.ts` - COMPLIANT

```typescript
export async function injectRLSContext(
  supabase: SupabaseClient<Database>,
  context: RLSContext,
  correlationId?: string,
): Promise<void> {
  // Uses set_rls_context() RPC per ADR-015
  const { error } = await supabase.rpc("set_rls_context", {
    p_actor_id: context.actorId,
    p_casino_id: context.casinoId,
    p_staff_role: context.staffRole,
    p_correlation_id: correlationId,
  });
  // ...
}
```

**Status:** Transaction-wrapped RPC call ensures all SET LOCAL in same transaction.

### `lib/server-actions/middleware/rls.ts` - COMPLIANT

```typescript
export function withRLS<T>(): Middleware<T> {
  return async (ctx: MiddlewareContext, next) => {
    await injectRLSContext(ctx.supabase, ctx.rlsContext, ctx.correlationId);
    return next();
  };
}
```

**Status:** Delegates to compliant `injectRLSContext()`.

### `lib/supabase/auth-admin.ts` - COMPLIANT

JWT claims are synced to `auth.users.app_metadata` via:
- `syncUserRLSClaims()` function (application-level)
- `trg_sync_staff_jwt_claims` database trigger (automatic)

---

## Service Layer Analysis

### Direct SET LOCAL Usage - NONE FOUND

No services use direct SET LOCAL or `exec_sql()` RPC. All context injection flows through:
1. `withServerAction` wrapper
2. `withAuth` + `withRLS` middleware composition
3. `injectRLSContext()` → `set_rls_context()` RPC

---

## Test Coverage

### ADR-015 Specific Tests

| Test File | Coverage |
|-----------|----------|
| `lib/supabase/__tests__/rls-context.integration.test.ts` | Context injection, transaction isolation |
| `lib/supabase/__tests__/rls-pooling-safety.integration.test.ts` | Connection pooling scenarios |
| `lib/supabase/__tests__/rls-jwt-claims.integration.test.ts` | JWT fallback verification |
| `lib/supabase/__tests__/rls-policy-enforcement.integration.test.ts` | Multi-tenant isolation |

---

## Remediation Actions

### Immediate (Apply Pending Migration)

```bash
# 1. Apply the compliance patch migration
npx supabase migration up

# 2. Regenerate TypeScript types
npm run db:types

# 3. Run RLS validation
npx supabase test db --linked

# 4. Re-run scanner to verify
./scripts/adr015-rls-scanner.sh
```

### Verification Checklist

- [ ] Migration `20251211153228_adr015_rls_compliance_patch.sql` applied
- [ ] TypeScript types regenerated
- [ ] Integration tests passing (12/12)
- [ ] Scanner reports 0 issues
- [ ] Manual test: Loyalty RPC (`rpc_issue_mid_session_reward`)
- [ ] Manual test: Cross-tenant query returns empty (not error)

---

## Documentation Updates Completed

The following documents were updated in commit `40eba4d`:

| Document | Changes |
|----------|---------|
| `.github/instructions/security.instructions.md` | Pattern C reference, lean JWT claims guidance |
| `docs/30-security/SEC-001-rls-policy-matrix.md` | Hybrid COALESCE pattern for actor_id/staff_role |
| `docs/30-security/SEC-003-rbac-matrix.md` | Hybrid context validation pattern |
| `docs/30-security/SEC-005-role-taxonomy.md` | All RLS examples upgraded to Pattern C |
| `docs/30-security/SECURITY_TENANCY_UPGRADE.md` | Full Pattern C upgrade, deprecated patterns marked |
| `docs/30-security/compliance/COMP-002-mtl-compliance-standard.md` | Updated for ADR-015 compliance |

---

## Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Migration not yet applied | HIGH | Run `npx supabase migration up` |
| Token refresh latency | LOW | JWT claims may be stale until token refresh; hybrid fallback handles this |
| Complex OR in staff_read bootstrap | LOW | Necessary for chicken-egg bootstrap; documented exception |

---

## Next Phase: ADR-015 Phase 3

Once Phase 2 is verified stable in production:

1. Monitor JWT claims vs. session variables usage patterns
2. Consider phasing out SET LOCAL for standard operations
3. Keep `set_rls_context()` only for batch/admin operations
4. Performance benchmark with pure JWT-based policies

---

## Scanner Usage

```bash
# Run with default settings
./scripts/adr015-rls-scanner.sh

# Run with verbose output
VERBOSE=true ./scripts/adr015-rls-scanner.sh

# Run against specific directory
./scripts/adr015-rls-scanner.sh path/to/migrations output.md
```

---

## Appendix: Files Referencing Deprecated Patterns

These files reference `SET LOCAL` in documentation/comments (not code):

| File | Context |
|------|---------|
| `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` | ADR explaining the problem |
| `docs/issues/ISSUE-002-rls-context-rpc-failure.md` | Historical issue documentation |
| `docs/30-security/SECURITY_TENANCY_UPGRADE.md` | Shows deprecated pattern in collapsible section |
| `.husky/pre-commit-service-check.sh` | Hook that may need review |

These are documentation references, not code execution paths.
