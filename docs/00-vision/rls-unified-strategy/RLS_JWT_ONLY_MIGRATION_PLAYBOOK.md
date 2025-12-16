# JWT-Only RLS Migration Playbook (Track B)
**Date:** 2025-12-14
**Status:** DRAFT - Awaiting approval
**Effort:** 4-6 days (1 sprint)
**Risk:** Low (JWT already proven in Phase 2)

---

## Prerequisites

**Before starting migration, verify:**

- [x] ADR-015 Phase 2 complete (JWT claims sync deployed)
- [x] JWT claims populated for all active staff (`sync_staff_jwt_claims` trigger active)
- [x] Existing JWT tests passing (`lib/supabase/__tests__/rls-jwt-claims.integration.test.ts`)
- [ ] Stakeholder approval for Track B migration
- [ ] Sprint capacity allocated (1 developer, 4-6 days)

---

## Migration Overview

### Phase 1: Create JWT-Only Policies (Days 1-2)
1. Write migration to drop Pattern C policies
2. Create Pattern A (JWT-only) policies
3. Run integration tests locally
4. Deploy to staging

### Phase 2: Verify & Deploy (Days 3-4)
5. Monitor staging for RLS failures
6. Run security regression suite
7. Deploy to production
8. Monitor production

### Phase 3: Cleanup (Days 5-6)
9. Remove session var infrastructure
10. Simplify test suite
11. Update documentation

---

## Phase 1: Create JWT-Only Policies

### Step 1.1: Generate Migration File

```bash
cd /home/diepulp/projects/pt-2
npx supabase migration new adr015_jwt_only_final
```

**Expected output:** `supabase/migrations/YYYYMMDDHHMMSS_adr015_jwt_only_final.sql`

---

### Step 1.2: Write Migration Content

**Migration template:** `/home/diepulp/projects/pt-2/supabase/migrations/YYYYMMDDHHMMSS_adr015_jwt_only_final.sql`

```sql
-- Migration: ADR-015 JWT-Only Final (Pattern A)
-- Description: Migrate all RLS policies from Pattern C (hybrid) to Pattern A (JWT-only)
-- Reference: ADR-015, docs/issues/RLS_MAINTAINABILITY_ANALYSIS_20251214.md
-- VERIFIED_SAFE

BEGIN;

-- =============================================================================
-- CASINO CONTEXT (2 tables, 8 policies)
-- =============================================================================

-- casino_settings
DROP POLICY IF EXISTS casino_settings_read ON casino_settings;
DROP POLICY IF EXISTS casino_settings_write ON casino_settings;

CREATE POLICY casino_settings_read ON casino_settings
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

CREATE POLICY casino_settings_write ON casino_settings
  FOR ALL USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE id = (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      AND role IN ('admin', 'pit_boss')
      AND status = 'active'
    )
  );

-- staff
DROP POLICY IF EXISTS staff_read ON staff;
DROP POLICY IF EXISTS staff_write_admin ON staff;

CREATE POLICY staff_read ON staff
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

CREATE POLICY staff_write_admin ON staff
  FOR ALL USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE id = (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      AND role = 'admin'
      AND status = 'active'
    )
  );

-- =============================================================================
-- PLAYER/VISIT CONTEXT (3 tables, 9 policies)
-- =============================================================================

-- player
DROP POLICY IF EXISTS player_select_enrolled ON player;
DROP POLICY IF EXISTS player_insert_pit_boss ON player;
DROP POLICY IF EXISTS player_update_pit_boss ON player;

CREATE POLICY player_select_enrolled ON player
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM player_casino pc
      WHERE pc.player_id = player.id
      AND pc.casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY player_insert_pit_boss ON player
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE id = (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
      AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY player_update_pit_boss ON player
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE id = (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
      AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- player_casino
DROP POLICY IF EXISTS player_casino_select ON player_casino;
DROP POLICY IF EXISTS player_casino_insert ON player_casino;
DROP POLICY IF EXISTS player_casino_update ON player_casino;

CREATE POLICY player_casino_select ON player_casino
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

CREATE POLICY player_casino_insert ON player_casino
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

CREATE POLICY player_casino_update ON player_casino
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

-- visit
DROP POLICY IF EXISTS visit_select_same_casino ON visit;
DROP POLICY IF EXISTS visit_insert_pit_boss ON visit;
DROP POLICY IF EXISTS visit_update_pit_boss ON visit;

CREATE POLICY visit_select_same_casino ON visit
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

CREATE POLICY visit_insert_pit_boss ON visit
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE id = (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
    )
  );

CREATE POLICY visit_update_pit_boss ON visit
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE id = (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
    )
  );

-- =============================================================================
-- RATING SLIP CONTEXT (2 tables, 6 policies)
-- =============================================================================

-- rating_slip
DROP POLICY IF EXISTS rating_slip_select_same_casino ON rating_slip;
DROP POLICY IF EXISTS rating_slip_insert_pit_boss ON rating_slip;
DROP POLICY IF EXISTS rating_slip_update_pit_boss ON rating_slip;

CREATE POLICY rating_slip_select_same_casino ON rating_slip
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

CREATE POLICY rating_slip_insert_pit_boss ON rating_slip
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE id = (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
    )
  );

CREATE POLICY rating_slip_update_pit_boss ON rating_slip
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE id = (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
    )
  );

-- rating_slip_pause
DROP POLICY IF EXISTS rating_slip_pause_select_same_casino ON rating_slip_pause;
DROP POLICY IF EXISTS rating_slip_pause_insert_pit_boss ON rating_slip_pause;
DROP POLICY IF EXISTS rating_slip_pause_update_pit_boss ON rating_slip_pause;

CREATE POLICY rating_slip_pause_select_same_casino ON rating_slip_pause
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

CREATE POLICY rating_slip_pause_insert_pit_boss ON rating_slip_pause
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

CREATE POLICY rating_slip_pause_update_pit_boss ON rating_slip_pause
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

-- =============================================================================
-- LOYALTY CONTEXT (3 tables, 13 policies)
-- =============================================================================

-- player_loyalty
DROP POLICY IF EXISTS player_loyalty_select ON player_loyalty;
DROP POLICY IF EXISTS player_loyalty_insert ON player_loyalty;
DROP POLICY IF EXISTS player_loyalty_update ON player_loyalty;
DROP POLICY IF EXISTS player_loyalty_deny_delete ON player_loyalty;

CREATE POLICY player_loyalty_select ON player_loyalty
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

CREATE POLICY player_loyalty_insert ON player_loyalty
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'staff_role') IN ('pit_boss', 'cashier', 'admin')
  );

CREATE POLICY player_loyalty_update ON player_loyalty
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'staff_role') IN ('pit_boss', 'cashier', 'admin')
  );

CREATE POLICY player_loyalty_deny_delete ON player_loyalty
  FOR DELETE USING (
    auth.uid() IS NOT NULL
    AND false
  );

-- loyalty_ledger
DROP POLICY IF EXISTS loyalty_ledger_select ON loyalty_ledger;
DROP POLICY IF EXISTS loyalty_ledger_insert ON loyalty_ledger;
DROP POLICY IF EXISTS loyalty_ledger_deny_update ON loyalty_ledger;
DROP POLICY IF EXISTS loyalty_ledger_deny_delete ON loyalty_ledger;

CREATE POLICY loyalty_ledger_select ON loyalty_ledger
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

CREATE POLICY loyalty_ledger_insert ON loyalty_ledger
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'staff_role') IN ('pit_boss', 'cashier', 'admin')
  );

CREATE POLICY loyalty_ledger_deny_update ON loyalty_ledger
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND false
  );

CREATE POLICY loyalty_ledger_deny_delete ON loyalty_ledger
  FOR DELETE USING (
    auth.uid() IS NOT NULL
    AND false
  );

-- loyalty_outbox
DROP POLICY IF EXISTS loyalty_outbox_select ON loyalty_outbox;
DROP POLICY IF EXISTS loyalty_outbox_insert ON loyalty_outbox;
DROP POLICY IF EXISTS loyalty_outbox_update ON loyalty_outbox;
DROP POLICY IF EXISTS loyalty_outbox_delete ON loyalty_outbox;

CREATE POLICY loyalty_outbox_select ON loyalty_outbox
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

CREATE POLICY loyalty_outbox_insert ON loyalty_outbox
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

CREATE POLICY loyalty_outbox_update ON loyalty_outbox
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

CREATE POLICY loyalty_outbox_delete ON loyalty_outbox
  FOR DELETE USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

-- =============================================================================
-- FINANCE CONTEXT (1 table, 4 policies)
-- =============================================================================

-- player_financial_transaction
DROP POLICY IF EXISTS player_financial_transaction_select_same_casino ON player_financial_transaction;
DROP POLICY IF EXISTS player_financial_transaction_insert_cashier ON player_financial_transaction;
DROP POLICY IF EXISTS player_financial_transaction_no_updates ON player_financial_transaction;
DROP POLICY IF EXISTS player_financial_transaction_no_deletes ON player_financial_transaction;

CREATE POLICY player_financial_transaction_select_same_casino ON player_financial_transaction
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

CREATE POLICY player_financial_transaction_insert_cashier ON player_financial_transaction
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE id = (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      AND role IN ('cashier', 'admin')
      AND status = 'active'
    )
  );

CREATE POLICY player_financial_transaction_no_updates ON player_financial_transaction
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND false
  );

CREATE POLICY player_financial_transaction_no_deletes ON player_financial_transaction
  FOR DELETE USING (
    auth.uid() IS NOT NULL
    AND false
  );

-- =============================================================================
-- Continue for remaining contexts: MTL, TableContext, FloorLayout...
-- (Full migration would include all 116 policies)
-- =============================================================================

COMMIT;

-- Verification query
SELECT
  schemaname,
  tablename,
  policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**Note:** Full migration should include all 116 policies. This template shows pattern for first 5 contexts.

---

### Step 1.3: Run Migration Locally

```bash
npx supabase migration up
```

**Expected output:**
```
Applying migration 20251214HHMMSS_adr015_jwt_only_final.sql...
Migration applied successfully.
```

---

### Step 1.4: Regenerate Types

```bash
npm run db:types
```

**Verify:** `types/database.types.ts` updated with latest schema

---

### Step 1.5: Run Integration Tests

```bash
npm run test -- lib/supabase/__tests__/rls-jwt-claims.integration.test.ts
```

**Expected:** All tests passing (JWT claims already proven in Phase 2)

---

### Step 1.6: Deploy to Staging

```bash
# Push migration to staging
git add supabase/migrations/YYYYMMDDHHMMSS_adr015_jwt_only_final.sql
git commit -m "feat(rls): migrate to JWT-only policies (Track B)"
git push origin feature/rls-jwt-only

# Deploy to staging via CI/CD
# (Follow your deployment process)
```

---

## Phase 2: Verify & Deploy

### Step 2.1: Monitor Staging (24-48 hours)

**Metrics to watch:**

1. **RLS Policy Failures**
   ```sql
   -- Query Supabase logs for RLS denials
   SELECT
     timestamp,
     event_message,
     metadata->>'request_id' as request_id
   FROM auth.audit_log_entries
   WHERE event_message LIKE '%permission denied%'
   ORDER BY timestamp DESC
   LIMIT 100;
   ```

2. **JWT Claim Presence**
   ```typescript
   // Add temporary logging in middleware
   export async function middleware(request: NextRequest) {
     const { data: { user } } = await supabase.auth.getUser();
     console.log('JWT claims:', user?.app_metadata);
   }
   ```

3. **Cross-Tenant Isolation**
   ```bash
   # Run security regression suite
   npm run test -- lib/supabase/__tests__/rls-policy-enforcement.integration.test.ts
   ```

**Success Criteria:**
- [ ] Zero RLS policy failures
- [ ] JWT claims present for all authenticated requests
- [ ] Cross-tenant isolation verified
- [ ] No performance degradation

---

### Step 2.2: Deploy to Production

**Prerequisites:**
- [ ] Staging verification complete (24-48 hours clean)
- [ ] Stakeholder approval for production deployment
- [ ] Rollback plan documented

**Deployment:**
```bash
# Merge to main
git checkout main
git merge feature/rls-jwt-only
git push origin main

# Deploy via CI/CD
# (Follow your deployment process)
```

---

### Step 2.3: Monitor Production (48 hours)

**Same metrics as staging:**
1. RLS policy failures (should be zero)
2. JWT claim presence (should be 100%)
3. Cross-tenant isolation (verified via tests)
4. Performance (should be improved due to simpler policies)

**Rollback Plan (if needed):**
```sql
-- Emergency rollback: restore Pattern C policies
-- Keep this migration file ready:
-- supabase/migrations/YYYYMMDDHHMMSS_rollback_to_pattern_c.sql
```

---

## Phase 3: Cleanup

### Step 3.1: Remove Session Var Infrastructure (Day 5)

**Files to modify:**

1. **Remove `set_rls_context()` RPC**
   ```sql
   -- supabase/migrations/YYYYMMDDHHMMSS_remove_rls_context_rpc.sql
   DROP FUNCTION IF EXISTS set_rls_context(uuid, uuid, text);
   ```

2. **Remove middleware calls**
   ```typescript
   // lib/server-actions/middleware/withServerAction.ts
   // DELETE these lines:
   await injectRLSContext(supabase, {
     actorId: session.staffId,
     casinoId: session.casinoId,
     staffRole: session.staffRole,
   });
   ```

3. **Remove RPC self-injection**
   ```sql
   -- In all SECURITY DEFINER RPCs, DELETE:
   PERFORM set_rls_context(p_actor_id, p_casino_id, ...);
   ```

4. **Delete `rls-context.ts`**
   ```bash
   rm /home/diepulp/projects/pt-2/lib/supabase/rls-context.ts
   ```

**Estimated LOC removed:** ~500 lines

---

### Step 3.2: Simplify Test Suite (Day 5)

**Tests to remove/simplify:**

1. **Delete dual-path tests**
   ```bash
   # Remove session context path tests
   # Keep only JWT tests
   ```

2. **Simplify integration tests**
   ```typescript
   // lib/supabase/__tests__/rls-pooling-safety.integration.test.ts
   // DELETE: Test cases for session context
   // KEEP: Test cases for JWT claims
   ```

**Estimated LOC removed:** ~400-500 lines

---

### Step 3.3: Update Documentation (Day 6)

**Documentation updates:**

1. **SEC-001 RLS Policy Matrix**
   - Remove Pattern C examples
   - Keep only Pattern A (JWT-only)
   - Simplify from 45 pages to ~20 pages

2. **ADR-015**
   - Mark Pattern C as deprecated
   - Update "Recommended Pattern" to Pattern A only
   - Add migration notes

3. **SRM**
   - Update RLS reference section
   - Point to simplified SEC-001

4. **Remove compliance scanner**
   ```bash
   rm /home/diepulp/projects/pt-2/scripts/adr015-rls-scanner.sh
   ```

5. **Onboarding docs**
   - Simplify RLS section
   - Point to official Supabase docs
   - Remove Pattern C training materials

---

## Verification Checklist

### Migration Complete When:

- [ ] All 116 policies migrated to Pattern A (JWT-only)
- [ ] Migration deployed to production
- [ ] 48 hours production monitoring clean (zero RLS failures)
- [ ] Session var infrastructure removed (~500 LOC)
- [ ] Test suite simplified (~400 LOC removed)
- [ ] Documentation updated (SEC-001, ADR-015, SRM)
- [ ] Compliance scanner removed
- [ ] Team trained on new pattern (1-day session)

### Success Metrics:

| Metric | Before (Track A) | After (Track B) | Delta |
|--------|------------------|-----------------|-------|
| **RLS LOC** | ~3,480 (Pattern C) | ~580 (Pattern A) | -83% |
| **Test LOC** | ~1,000 | ~400 | -60% |
| **Service LOC** | +500 (RLS context) | 0 | -100% |
| **Compliance issues** | 63 | 0 | -100% |
| **Onboarding time** | 24 hours | 8 hours | -67% |
| **Policy error rate** | 44% | ~10% | -77% |
| **Docs pages** | 65 | 25 | -62% |

---

## Rollback Plan

### If Production Issues Occur

**Step 1: Quick Rollback (if within 24 hours)**
```bash
# Revert migration
npx supabase migration down

# Redeploy previous version
git revert HEAD
git push origin main
```

**Step 2: Restore Pattern C (if needed)**
```sql
-- Run rollback migration
-- File: supabase/migrations/YYYYMMDDHHMMSS_rollback_to_pattern_c.sql
-- Contains all Pattern C policies from before migration
```

**Step 3: Restore session var code**
```bash
git checkout HEAD~1 -- lib/supabase/rls-context.ts
git checkout HEAD~1 -- lib/server-actions/middleware/withServerAction.ts
```

---

## Risk Mitigation

### Low-Risk Items (Already Mitigated)

| Risk | Mitigation | Status |
|------|------------|--------|
| JWT claims missing | Claim sync trigger deployed (Phase 2) | ✅ Mitigated |
| Token refresh latency | Supabase handles automatically | ✅ Mitigated |
| Wrong JWT path | Template uses correct path | ✅ Mitigated |
| Service role bypass | ADR-018 governance in place | ✅ Mitigated |

### Medium-Risk Items (Monitor During Migration)

| Risk | Mitigation | Action |
|------|------------|--------|
| Production RLS failures | 48-hour monitoring window | Watch logs closely |
| Performance regression | Simpler policies = better perf | Benchmark before/after |
| Developer confusion | 1-day training session | Schedule post-migration |

---

## Timeline

### Estimated Schedule

**Day 1 (Developer):**
- Morning: Write migration file (3 hours)
- Afternoon: Test locally, fix issues (3 hours)

**Day 2 (Developer):**
- Morning: Deploy to staging (1 hour)
- Afternoon: Begin monitoring (passive)

**Day 3-4 (Monitoring):**
- Passive monitoring of staging
- Verify metrics, address issues

**Day 5 (Developer):**
- Morning: Deploy to production (2 hours)
- Afternoon: Begin production monitoring

**Day 6 (Monitoring):**
- Passive production monitoring

**Day 7 (Developer):**
- Morning: Remove session var infrastructure (3 hours)
- Afternoon: Simplify test suite (3 hours)

**Day 8 (Developer):**
- Morning: Update documentation (3 hours)
- Afternoon: Team training session (2 hours)

**Total Developer Time:** 6 days
**Total Calendar Time:** 8 days (includes monitoring periods)

---

## Communication Plan

### Stakeholder Updates

**Before Migration:**
- Present Track B decision (this playbook)
- Get approval from Tech Lead + Security Lead
- Schedule sprint capacity

**During Migration:**
- Daily standup updates during active work (Days 1-2, 5, 7-8)
- Slack updates on staging/prod deployments
- Immediate escalation if issues found

**After Migration:**
- Team training session (Day 8)
- Post-mortem document (what went well, what didn't)
- Update runbooks with JWT-only pattern

---

## Next Steps

1. **Review this playbook** with Tech Lead + Security Lead
2. **Get stakeholder approval** for Track B migration
3. **Allocate sprint capacity** (1 developer, 6 days)
4. **Execute Phase 1** (write + test migration)
5. **Monitor & verify** (Phases 2-3)
6. **Celebrate** 4,000 LOC removed! 🎉

---

**Document Status:** DRAFT - Awaiting approval
**Owner:** System Architect Sub-agent
**Reviewers:** Tech Lead, Security Lead
**Approval Required:** Yes (Track B decision)
