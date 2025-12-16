# Migration Risk & Rollback Playbook

**Purpose:** Operational guide for executing Track A/B migrations safely with clear rollback procedures.

**Audience:** Engineers executing the migration

---

## Pre-Flight Safety Checklist

### Before ANY Migration (Mandatory)

- [ ] **Backup verification:** Supabase automatic backups enabled (verify last backup timestamp)
- [ ] **Team availability:** At least 2 engineers available during migration window
- [ ] **Monitoring setup:** Sentry/observability dashboards open and active
- [ ] **Rollback script tested:** Dry-run in staging environment (verify it works)
- [ ] **Communication:** Team notified (Slack/Discord announcement with migration window)
- [ ] **Feature freeze:** No other deployments during migration window
- [ ] **Off-hours deployment:** Non-peak hours preferred (weekend/evening for Track B)

### Track A Specific Pre-Flight

- [ ] **Rating slip pattern verified:** 4 existing self-injecting RPCs working in production
- [ ] **Integration test baseline:** Current test pass rate documented (target: maintain 100%)
- [ ] **Scanner baseline:** Current issue count documented (target: reduce to 0)

### Track B Specific Pre-Flight

- [ ] **JWT sync reliability:** 99%+ success rate over 7 days (monitor `sync_staff_jwt_claims` trigger)
- [ ] **Performance baseline:** Query latency per table captured (p50, p95, p99)
- [ ] **Cross-tenant test data:** Test users for Casino A and Casino B created
- [ ] **Token refresh test:** Role change → token refresh → policy enforcement verified

---

## Track A: Per-RPC Rollback Procedures

### Rollback Scenario: Single RPC Failure

**Symptoms:**
- RPC returns unexpected errors
- Attribution errors in audit logs (wrong casino_id/actor_id)
- Integration tests fail for specific RPC

**Rollback Time:** 5-10 minutes

**Procedure:**

1. **Identify Failed RPC:**
   ```bash
   # Check Supabase logs for RPC errors
   # Look for: "MISSING_CASINO_CONTEXT" or "CASINO_MISMATCH"
   ```

2. **Revert RPC Function:**
   ```sql
   -- Example: Rollback rpc_request_table_fill
   CREATE OR REPLACE FUNCTION rpc_request_table_fill(
     p_casino_id uuid,
     p_actor_id uuid,
     p_table_id uuid,
     p_amount numeric,
     p_chip_types jsonb
   ) RETURNS jsonb
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public
   AS $$
   DECLARE
     v_context_casino_id uuid;
   BEGIN
     -- RESTORE ORIGINAL: Validate context (no self-injection)
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

     -- Original business logic (unchanged)
     -- ...
   END;
   $$;
   ```

3. **Verify Rollback:**
   ```bash
   # Run integration test for this RPC
   npm test -- rpc_request_table_fill.test.ts
   ```

4. **Monitor Production:**
   ```bash
   # Watch for 5 minutes, ensure no new errors
   # Check audit logs for correct attributions
   ```

5. **Document Incident:**
   ```markdown
   ## RPC Rollback Incident
   - RPC: rpc_request_table_fill
   - Reason: [describe failure mode]
   - Rollback Time: [timestamp]
   - Root Cause: [analysis]
   - Prevention: [action items]
   ```

### Rollback Scenario: Multiple RPC Failures

**Symptoms:**
- Multiple RPCs failing with similar errors
- Systematic issue (e.g., JWT claim sync broken)

**Rollback Time:** 15-30 minutes (batch revert)

**Procedure:**

1. **Identify Root Cause:**
   - JWT claim sync issue? (check `sync_staff_jwt_claims` trigger)
   - `set_rls_context()` RPC broken? (check RPC logs)
   - Middleware issue? (check `injectRLSContext()` logs)

2. **Batch Revert Migration:**
   ```bash
   # If using Supabase CLI
   npx supabase migration down

   # Or manual SQL (if migration already applied)
   psql -f rollback/20251215_XXXXXX_rollback.sql
   ```

3. **Verify System State:**
   ```bash
   # Run full integration test suite
   npm test -- integration.test.ts

   # Verify scanner shows expected baseline
   bash scripts/adr015-rls-scanner.sh
   ```

4. **Root Cause Analysis:**
   - Review logs for common error patterns
   - Identify broken assumption (e.g., JWT claims not populated)
   - Create fix plan before re-attempting

---

## Track B: Per-Context Rollback Procedures

### Rollback Scenario: Context Migration Failure

**Symptoms:**
- Cross-tenant data leakage detected
- RLS policy violations (permission denied errors spike)
- Query latency regression >20%
- JWT claim missing/stale errors

**Rollback Time:** 2-4 hours (per context)

**Procedure:**

1. **Immediate Mitigation (Stop the Bleeding):**
   ```sql
   -- Emergency: Disable RLS on affected tables (VERY LAST RESORT)
   -- Only if data leakage detected and cannot rollback fast enough
   ALTER TABLE [affected_table] DISABLE ROW LEVEL SECURITY;
   -- ⚠️ WARNING: This exposes all data! Only for emergency mitigation.
   -- Must immediately follow with proper rollback.
   ```

2. **Revert Migration:**
   ```bash
   # Supabase CLI rollback
   npx supabase migration down

   # Or manual SQL (restore hybrid policies)
   psql -f rollback/20251216_XXXXXX_player_context_rollback.sql
   ```

3. **Restore Hybrid Policies:**
   ```sql
   -- Example: Player context rollback
   -- Drop JWT-only policies
   DROP POLICY IF EXISTS player_select_enrolled_jwt ON player;
   DROP POLICY IF EXISTS player_casino_select_jwt ON player_casino;
   DROP POLICY IF EXISTS visit_select_jwt ON visit;

   -- Recreate hybrid policies (Pattern C)
   CREATE POLICY player_select_enrolled ON player
     FOR SELECT USING (
       auth.uid() IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM player_casino pc
         WHERE pc.player_id = player.id
           AND pc.casino_id = COALESCE(
             NULLIF(current_setting('app.casino_id', true), '')::uuid,
             (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
           )
       )
     );

   -- ... (repeat for all policies in context)

   -- Re-enable RLS if disabled in step 1
   ALTER TABLE player ENABLE ROW LEVEL SECURITY;
   ALTER TABLE player_casino ENABLE ROW LEVEL SECURITY;
   ALTER TABLE visit ENABLE ROW LEVEL SECURITY;
   ```

4. **Restore Service Layer:**
   ```bash
   # Revert code changes (restore injectRLSContext for this context)
   git revert HEAD

   # Redeploy
   git push origin main
   ```

5. **Verify Cross-Tenant Isolation:**
   ```bash
   # Run cross-tenant test suite
   npm test -- cross-tenant-isolation.test.ts

   # Manual smoke test
   curl -H "Authorization: Bearer $CASINO_A_TOKEN" https://api/v1/players
   curl -H "Authorization: Bearer $CASINO_B_TOKEN" https://api/v1/players
   # Verify no overlap in player_id sets
   ```

6. **Monitor Production (Extended):**
   ```bash
   # Watch for 2 hours (longer than Track A due to higher risk)
   # Metrics to monitor:
   # - RLS policy violations: should return to baseline
   # - Query latency: should return to baseline (±5%)
   # - Audit log attributions: verify correctness
   # - Cross-tenant queries: verify zero leakage
   ```

7. **Post-Mortem:**
   ```markdown
   ## Context Migration Rollback
   - Context: Player/Visit
   - Tables Affected: player, player_casino, visit
   - Policies Reverted: 9
   - Reason: [describe failure mode]
   - Detection Time: [timestamp]
   - Rollback Initiated: [timestamp]
   - Rollback Complete: [timestamp]
   - Total Downtime: [duration]
   - Data Leakage: [yes/no - if yes, describe scope]
   - Root Cause: [analysis]
   - Prevention: [action items]
   ```

### Rollback Scenario: JWT Claim Sync Broken

**Symptoms:**
- Many users reporting "permission denied" errors
- JWT claims missing `app_metadata.casino_id`
- `sync_staff_jwt_claims` trigger failing

**Rollback Time:** 1-2 hours (system-wide revert to hybrid)

**Procedure:**

1. **Halt Track B Migration:**
   ```bash
   # Stop any in-progress context migrations
   # Do NOT proceed with remaining contexts
   ```

2. **Revert All Migrated Contexts:**
   ```bash
   # Identify which contexts already migrated to JWT-only
   psql -c "SELECT tablename, policyname, qual FROM pg_policies WHERE qual LIKE '%auth.jwt()%' AND qual NOT LIKE '%current_setting%';"

   # Revert each context (use rollback SQL scripts)
   psql -f rollback/casino_context_rollback.sql
   psql -f rollback/player_context_rollback.sql
   # ... (repeat for all migrated contexts)
   ```

3. **Fix JWT Sync Trigger:**
   ```sql
   -- Diagnose trigger issue
   SELECT * FROM pg_stat_user_functions WHERE funcname = 'sync_staff_jwt_claims';

   -- Verify trigger exists
   SELECT * FROM pg_trigger WHERE tgname = 'trg_sync_staff_jwt_claims';

   -- Test trigger manually
   UPDATE staff SET role = 'admin' WHERE id = 'test-staff-id';
   -- Check if JWT claims updated in auth.users
   ```

4. **Backfill Missing JWT Claims:**
   ```sql
   -- Re-run backfill script
   SELECT sync_staff_jwt_claims();
   ```

5. **Verify System State:**
   ```bash
   # Full regression test suite
   npm test

   # Verify all contexts back to hybrid RLS
   bash scripts/adr015-rls-scanner.sh
   # Should show hybrid patterns (COALESCE + NULLIF + JWT fallback)
   ```

6. **Decision:**
   - **Option A:** Fix JWT sync issue, re-attempt Track B (after 1 week monitoring)
   - **Option B:** Stay on Track A indefinitely (hybrid RLS functional)

---

## Risk Mitigation Strategies

### Track A: Minimize Per-RPC Risk

**Canary Deployment (Recommended):**

```
Step 1: Deploy LOW-RISK RPC first (e.g., rpc_log_table_inventory_snapshot)
├─ Test in production for 1 hour
├─ Monitor error rates
└─ If green → proceed

Step 2: Deploy MEDIUM-RISK RPCs (e.g., floor layout RPCs)
├─ Test in production for 2 hours
└─ If green → proceed

Step 3: Deploy HIGH-RISK RPCs (e.g., financial chip custody RPCs)
├─ Extended monitoring (4 hours)
├─ Audit log validation (verify attributions)
└─ If green → complete
```

**Per-RPC Risk Scoring:**

| RPC | Risk | Reason | Monitor Duration |
|-----|------|--------|------------------|
| `rpc_log_table_inventory_snapshot` | LOW | Read-heavy, reconciliation support | 1 hour |
| `rpc_update_table_status` | LOW | Simple status update | 1 hour |
| `rpc_create_floor_layout` | MEDIUM | Multi-table insert, infrequent | 2 hours |
| `rpc_activate_floor_layout` | MEDIUM | Idempotent, infrequent | 2 hours |
| `rpc_request_table_fill` | **HIGH** | Chip custody audit trail | 4 hours |
| `rpc_request_table_credit` | **HIGH** | Chip custody audit trail | 4 hours |
| `rpc_log_table_drop` | **HIGH** | Revenue calculation feed | 4 hours |

### Track B: Minimize Per-Context Risk

**Context Migration Ordering (Recommended):**

```
Order contexts by risk (lowest → highest):

1. Casino (2 tables, 8 policies)
   └─ Reason: Foundational, low traffic
   └─ Monitor: 30 minutes

2. Loyalty (3 tables, 13 policies)
   └─ Reason: Already 50% JWT-compliant
   └─ Monitor: 1 hour

3. Floor Layout (5 tables, 18 policies)
   └─ Reason: Infrequent changes
   └─ Monitor: 1 hour

4. Rating Slip (2 tables, 6 policies)
   └─ Reason: Workflow-critical but isolated
   └─ Monitor: 2 hours

5. Table/Chip (4 tables, 12 policies)
   └─ Reason: Operational, moderate traffic
   └─ Monitor: 2 hours

6. Finance/MTL (4 tables, 8 policies)
   └─ Reason: Audit-critical (HIGH RISK)
   └─ Monitor: 4 hours

7. Player/Visit (3 tables, 9 policies)
   └─ Reason: Highest traffic (HIGHEST RISK)
   └─ Monitor: 4 hours

⚠️ NOTE: If ANY context fails, HALT migration and rollback.
         Do NOT proceed to next context until issue resolved.
```

**Per-Context Risk Scoring:**

| Context | Risk | Reason | Rollback Complexity |
|---------|------|--------|---------------------|
| Casino | LOW | Foundational, low traffic | LOW (2 tables) |
| Loyalty | LOW | Already JWT-heavy | LOW (3 tables) |
| Floor Layout | LOW | Infrequent changes | MEDIUM (5 tables) |
| Rating Slip | MEDIUM | Workflow-critical | LOW (2 tables) |
| Table/Chip | MEDIUM | Operational | MEDIUM (4 tables) |
| Finance/MTL | **HIGH** | Audit-critical | MEDIUM (4 tables) |
| Player/Visit | **HIGHEST** | Most traffic | MEDIUM (3 tables, complex joins) |

---

## Monitoring & Alerting

### Track A: Per-RPC Monitoring

**Real-time Metrics (During Migration Window):**

```typescript
// Monitor RPC error rates (Sentry/observability)
const rpcErrorRate = await sentry.query({
  metric: 'rpc.error_rate',
  filters: { rpc_name: 'rpc_request_table_fill' },
  window: '5m'
});

// Alert if error rate > 1% (vs. baseline 0.01%)
if (rpcErrorRate > 0.01) {
  alert('RPC_ERROR_SPIKE', { rpc: 'rpc_request_table_fill', rate: rpcErrorRate });
  // Consider rollback
}

// Monitor attribution correctness (audit logs)
const attributionErrors = await db.query(`
  SELECT COUNT(*) FROM audit_log
  WHERE casino_id IS NULL OR actor_id IS NULL
    AND created_at > NOW() - INTERVAL '5 minutes'
`);

if (attributionErrors > 0) {
  alert('ATTRIBUTION_ERROR', { count: attributionErrors });
  // Immediate rollback (attribution critical)
}
```

**Post-Migration Validation (24 hours):**

```bash
# Daily report: RPC performance
psql -c "
  SELECT
    funcname,
    calls,
    total_time / calls AS avg_time_ms,
    self_time / calls AS avg_self_time_ms
  FROM pg_stat_user_functions
  WHERE funcname LIKE 'rpc_%'
  ORDER BY calls DESC;
"

# Compare to baseline (alert if >10% regression)
```

### Track B: Per-Context Monitoring

**Real-time Metrics (During Migration Window):**

```typescript
// Monitor cross-tenant isolation (CRITICAL)
const crossTenantQueries = await db.query(`
  -- Detect if Casino A user queried Casino B data
  SELECT
    al.actor_id,
    al.casino_id AS actor_casino,
    al.resource_id,
    r.casino_id AS resource_casino
  FROM audit_log al
  JOIN [resource_table] r ON r.id = al.resource_id::uuid
  WHERE al.casino_id != r.casino_id
    AND al.created_at > NOW() - INTERVAL '5 minutes'
`);

if (crossTenantQueries.length > 0) {
  alert('CROSS_TENANT_LEAK', { violations: crossTenantQueries });
  // IMMEDIATE ROLLBACK (security violation)
}

// Monitor RLS policy violations
const rlsViolations = await db.query(`
  SELECT COUNT(*) FROM pg_stat_database
  WHERE datname = 'postgres'
    AND blks_hit < blks_read * 0.9  -- Cache hit rate drop
`);

// Monitor query latency regression
const queryLatency = await observability.query({
  metric: 'db.query.latency.p95',
  filters: { table: 'player' },
  window: '5m'
});

const latencyRegression = (queryLatency - baseline.player.p95) / baseline.player.p95;

if (latencyRegression > 0.20) {  // >20% regression
  alert('QUERY_LATENCY_REGRESSION', {
    table: 'player',
    current: queryLatency,
    baseline: baseline.player.p95,
    regression: `${(latencyRegression * 100).toFixed(1)}%`
  });
  // Consider rollback if sustained
}
```

**Post-Migration Validation (7 days):**

```bash
# Weekly report: JWT claim freshness
psql -c "
  SELECT
    s.id,
    s.role AS db_role,
    (u.raw_app_meta_data->>'staff_role') AS jwt_role,
    CASE
      WHEN s.role != (u.raw_app_meta_data->>'staff_role') THEN 'STALE'
      ELSE 'OK'
    END AS sync_status,
    s.updated_at AS last_db_update,
    u.updated_at AS last_jwt_update
  FROM staff s
  JOIN auth.users u ON u.id = s.user_id
  WHERE s.status = 'active'
  ORDER BY sync_status DESC;
"

# Alert if >1% stale (JWT sync issue)
```

---

## Communication Templates

### Pre-Migration Announcement

```
🚨 MIGRATION NOTICE: Auth/RLS [Track A/B] Migration

**Timeline:** [Start Time] - [End Time] ([Duration])
**Impact:** [Expected user impact - typically "none" for Track A, "minimal" for Track B]
**Rollback Plan:** [Per-RPC / Per-Context] rollback available

**What's changing:**
- [Track A: Self-injection pattern for [N] RPCs]
- [Track B: JWT-only RLS for [Context Name] context]

**Monitoring:**
- Engineers on-call: [Name1], [Name2]
- Slack channel: #incidents
- Rollback trigger: [Error rate >1% OR cross-tenant leak detected]

**Testing completed:**
- Integration tests: [Pass rate]
- Staging dry-run: [Success/Issues]
- Rollback rehearsal: [Verified]

**Proceed? (React with ✅ to approve)**
```

### Migration Success Notification

```
✅ MIGRATION COMPLETE: Auth/RLS [Track A/B] - [Context/RPCs]

**Completed:** [End Time]
**Duration:** [Actual duration vs. estimated]
**Status:** All systems green ✓

**Verification:**
- Error rate: [Current vs. baseline]
- Query latency: [Current vs. baseline]
- Cross-tenant isolation: [0 violations]
- Integration tests: [100% pass]

**Next steps:**
- [Track A: Continue monitoring for 24h, proceed to next RPC]
- [Track B: Extended monitoring for 4h, proceed to next context OR complete]

**Rollback status:** No rollback needed ✓
```

### Rollback Notification

```
⚠️ ROLLBACK INITIATED: Auth/RLS [Track A/B] - [Context/RPCs]

**Reason:** [Describe failure mode]
**Initiated:** [Timestamp]
**Status:** [In progress / Complete]

**Impact:**
- [Describe user impact, if any]
- [Describe data integrity - "No data loss" expected]

**Rollback procedure:**
- [Step 1: Revert migration]
- [Step 2: Restore previous state]
- [Step 3: Verify system health]

**Root cause:** [Initial analysis - full post-mortem to follow]

**Next steps:**
- [Fix root cause]
- [Re-attempt migration: [Timeframe] OR Stay on current pattern]

**Incident report:** [Link to post-mortem doc]
```

---

## Post-Migration Validation

### Track A: 24-Hour Validation Checklist

**Hour 0 (Immediate):**
- [ ] ADR-015 scanner: 0 issues
- [ ] Integration tests: 100% pass
- [ ] Loyalty endpoint: 200 status
- [ ] Production guard: service client blocked

**Hour 1:**
- [ ] Error rate: ≤ baseline
- [ ] Audit logs: 100% attributions correct (sample 100 records)

**Hour 4:**
- [ ] Query latency: ±5% baseline
- [ ] No cross-tenant violations detected

**Hour 24:**
- [ ] RPC performance: ±10% baseline (all 22 RPCs)
- [ ] No production incidents
- [ ] Team sign-off: migration successful

### Track B: 7-Day Validation Checklist

**Day 1 (Immediate):**
- [ ] All policies in context use JWT-only
- [ ] Integration tests: 100% pass
- [ ] Cross-tenant isolation: 0 violations
- [ ] Query latency: ±10% baseline

**Day 1 (4 hours post-migration):**
- [ ] Error rate: ≤ baseline
- [ ] JWT claim freshness: 0 stale claims detected
- [ ] No rollback triggered

**Day 3:**
- [ ] Query latency stable: ±10% baseline
- [ ] JWT sync: 99%+ success rate
- [ ] No cross-tenant violations (cumulative)

**Day 7:**
- [ ] Performance regression: <10% (acceptable)
- [ ] JWT claim freshness: <1% stale (acceptable)
- [ ] Cross-tenant isolation: 100% (mandatory)
- [ ] Team sign-off: context migration successful

**After All Contexts (Track B Complete):**
- [ ] All 116 policies JWT-only
- [ ] `set_rls_context()` RPC removed
- [ ] `injectRLSContext()` middleware removed
- [ ] SEC-001 documentation updated
- [ ] ADR-015 archived (mission complete)

---

## Incident Response Playbook

### Severity Levels

| Severity | Criteria | Response Time | Rollback Decision |
|----------|----------|---------------|-------------------|
| **P0 - Critical** | Cross-tenant data leak detected | Immediate | IMMEDIATE rollback (no debate) |
| **P1 - High** | >5% error rate spike | <15 minutes | Rollback if not resolved in 30 min |
| **P2 - Medium** | 1-5% error rate spike | <30 minutes | Rollback if not resolved in 1 hour |
| **P3 - Low** | Performance regression >20% | <1 hour | Rollback if not resolved in 4 hours |

### P0 Incident: Cross-Tenant Leak

**Detection:**
```sql
-- Automated query (run every 5 minutes during migration)
SELECT COUNT(*) AS violations FROM (
  SELECT DISTINCT
    al.actor_id,
    al.casino_id AS actor_casino,
    r.casino_id AS resource_casino
  FROM audit_log al
  JOIN player r ON r.id = al.resource_id::uuid
  WHERE al.casino_id != r.casino_id
    AND al.created_at > NOW() - INTERVAL '5 minutes'
) AS leak_check;

-- If violations > 0: CRITICAL INCIDENT
```

**Response:**

1. **Immediate (within 60 seconds):**
   ```bash
   # Trigger incident alert
   slack-notify "#incidents" "P0: CROSS-TENANT LEAK DETECTED"

   # Begin rollback (no debate)
   psql -f rollback/emergency_rollback.sql
   ```

2. **Within 5 minutes:**
   - Identify scope of leak (how many records exposed?)
   - Identify affected users (Casino A/B/C?)
   - Disable RLS on affected tables (if rollback too slow)

3. **Within 15 minutes:**
   - Complete rollback
   - Verify leak stopped (no new violations)
   - Assess data exposure (PII leaked?)

4. **Within 1 hour:**
   - Notify affected customers (if PII exposed)
   - Root cause analysis
   - Incident report

5. **Within 24 hours:**
   - Full post-mortem
   - Fix root cause
   - Security review before re-attempt

### P1 Incident: High Error Rate

**Detection:**
```typescript
// Error rate > 5% (baseline: 0.01%)
if (errorRate > 0.05) {
  alert('P1: HIGH_ERROR_RATE', { rate: errorRate });
}
```

**Response:**

1. **Within 15 minutes:**
   - Identify error type (RLS violation? JWT missing? Other?)
   - Check if isolated to one RPC/context or system-wide

2. **Within 30 minutes:**
   - Attempt quick fix (if obvious)
   - If not resolved: initiate rollback

3. **Post-rollback:**
   - Root cause analysis
   - Fix issue
   - Re-attempt migration

---

## Testing Strategies

### Track A: Per-RPC Testing

**Unit Test Template:**
```typescript
describe('RPC Pooling Safety: rpc_request_table_fill', () => {
  test('works without external context injection', async () => {
    const supabase = createClient(/* user JWT with casino_id */);

    // Simulate pooled connection (no set_rls_context() call)
    const { data, error } = await supabase.rpc('rpc_request_table_fill', {
      p_casino_id: 'casino-id',
      p_actor_id: 'actor-id',
      p_table_id: 'table-id',
      p_amount: 1000,
      p_chip_types: { '100': 10 }
    });

    expect(error).toBeNull(); // Should self-inject and succeed
    expect(data).toHaveProperty('request_id');
  });

  test('validates casino_id from JWT', async () => {
    const supabase = createClient(/* JWT with casino-a */);

    // Attempt to use different casino
    const { error } = await supabase.rpc('rpc_request_table_fill', {
      p_casino_id: 'casino-b',  // Mismatch
      // ... other params
    });

    expect(error).toBeDefined();
    expect(error.message).toContain('CASINO_MISMATCH');
  });

  test('survives connection pool rotation', async () => {
    const supabase = createClient(/* user JWT */);

    // Execute 100 times rapidly (force pool churn)
    const promises = Array(100).fill(null).map(() =>
      supabase.rpc('rpc_request_table_fill', {
        p_casino_id: 'casino-id',
        // ... params
      })
    );

    const results = await Promise.all(promises);
    const errors = results.filter(r => r.error);

    expect(errors.length).toBe(0); // All should succeed
  });
});
```

### Track B: Per-Context Testing

**Integration Test Template:**
```typescript
describe('JWT-Only Migration: Player Context', () => {
  test('cross-tenant isolation enforced', async () => {
    const casinoA = createClient(/* JWT with casino-a */);
    const casinoB = createClient(/* JWT with casino-b */);

    const { data: playersA } = await casinoA.from('player').select('*');
    const { data: playersB } = await casinoB.from('player').select('*');

    // No overlap in results
    const playerIdsA = new Set(playersA.map(p => p.id));
    const playerIdsB = new Set(playersB.map(p => p.id));
    const overlap = [...playerIdsA].filter(id => playerIdsB.has(id));

    expect(overlap.length).toBe(0); // Zero cross-tenant leakage
  });

  test('JWT claim stale detection', async () => {
    const staff = await createStaff({ role: 'pit_boss', casino_id: 'casino-a' });
    const token = await getAuthToken(staff);

    // Demote role (but token not refreshed yet)
    await db.query(`UPDATE staff SET role = 'dealer' WHERE id = $1`, [staff.id]);

    // Wait for JWT sync (should be <60s)
    await waitFor(60_000);

    // Get fresh token
    const newToken = await getAuthToken(staff);
    const claims = decodeJWT(newToken);

    expect(claims.app_metadata.staff_role).toBe('dealer'); // Updated
  });

  test('performance regression acceptable', async () => {
    const baseline = await measureQueryLatency('SELECT * FROM player LIMIT 100');

    // After JWT-only migration
    const afterMigration = await measureQueryLatency('SELECT * FROM player LIMIT 100');

    const regression = (afterMigration - baseline) / baseline;

    expect(regression).toBeLessThan(0.10); // <10% acceptable
  });
});
```

---

## Success Criteria Summary

### Track A Complete

```
┌────────────────────────────────────────────────────────┐
│ TRACK A MIGRATION SUCCESSFUL                           │
├────────────────────────────────────────────────────────┤
│ ✓ All 12 RPCs self-inject OR use JWT-only              │
│ ✓ ADR-015 scanner: 0 issues                            │
│ ✓ Integration tests: 100% pass                         │
│ ✓ Production monitoring: 24h green (no incidents)      │
│ ✓ Error rate: ≤ baseline                               │
│ ✓ Query latency: ±5% baseline                          │
│ ✓ Audit logs: 100% attributions correct                │
│ ✓ Cross-tenant isolation: 100% (hybrid RLS enforced)   │
└────────────────────────────────────────────────────────┘

System State: HYBRID RLS (MVP ready)
Technical Debt: Dual-path (session vars + JWT)
Next Phase: Track B (post-MVP) OR stay on Track A indefinitely
```

### Track B Complete

```
┌────────────────────────────────────────────────────────┐
│ TRACK B MIGRATION SUCCESSFUL                           │
├────────────────────────────────────────────────────────┤
│ ✓ All 116 policies JWT-only (no current_setting())     │
│ ✓ All 22 RPCs work without session context             │
│ ✓ Cross-tenant isolation: 100% (7 days, 0 violations)  │
│ ✓ Performance regression: <10%                         │
│ ✓ JWT claim freshness: <1% stale                       │
│ ✓ Production monitoring: 7d green (no incidents)       │
│ ✓ set_rls_context() RPC removed                        │
│ ✓ injectRLSContext() middleware removed                │
│ ✓ SEC-001 documentation updated                        │
└────────────────────────────────────────────────────────┘

System State: JWT-ONLY (clean architecture)
Technical Debt: ELIMINATED
Architectural Clarity: ACHIEVED (single source of truth)
```

---

**End of Playbook**

*Keep this document open during migration for quick reference to rollback procedures.*
