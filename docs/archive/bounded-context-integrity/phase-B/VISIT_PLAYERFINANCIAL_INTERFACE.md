# Visit ↔ PlayerFinancial Service Interface

**Version**: 1.0.0
**Date**: 2025-10-20
**Phase**: Phase B - Financial Bounded Context Integrity
**Status**: Complete

---

## Executive Summary

This document defines the read-model contract between Visit and PlayerFinancial services. PlayerFinancial owns the financial ledger as the authoritative source of truth; Visit service consumes aggregated financial summaries via read-only views. This establishes clear bounded context boundaries: **PlayerFinancial writes financial data, Visit reads financial context**.

**Key Principle**: Visit service NEVER writes to `player_financial_transaction`. All financial mutations flow through PlayerFinancial service exclusively.

---

## Overview

Visit service tracks player check-ins and session lifecycle at casinos. Financial transactions (cash deposits, chip movements) are recorded separately in the PlayerFinancial service. To provide a complete session view, Visit service reads financial aggregates but never modifies the financial ledger.

**Bounded Context Separation**:
- **PlayerFinancial**: Owns monetary truth (WRITE authority)
- **Visit**: Owns session lifecycle (READ-ONLY consumer of financial data)

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ PlayerFinancial Service (Write Authority)                    │
├─────────────────────────────────────────────────────────────┤
│  player_financial_transaction (append-only table)            │
│  • cash_in, chips_brought, chips_taken, net_change          │
│  • event_type (CASH_IN, CHIPS_BROUGHT, CHIPS_TAKEN, REVERSAL)│
│  • idempotency_key (unique constraint)                       │
│  • RLS: service_role only for INSERT                         │
│  • Trigger: Enforces append-only (no UPDATE/DELETE)          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ Aggregates via SQL Views
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Read-Only Views (Compatibility Layer)                        │
├─────────────────────────────────────────────────────────────┤
│ 1. visit_financial_summary                                   │
│    Purpose: Per-visit financial totals                       │
│    Consumer: Visit service, UI components                    │
│    Columns: visit_id, total_cash_in, total_chips_brought,   │
│             total_chips_taken, transaction_count             │
│                                                               │
│ 2. visit_financial_summary_gd                                │
│    Purpose: Gaming-day aligned financial totals              │
│    Consumer: MTL service, reporting dashboards               │
│    Additional: casino_id, gaming_day, timezone               │
│                                                               │
│ 3. ratingslip_with_financials                                │
│    Purpose: Legacy compatibility (transitional)              │
│    Consumer: RatingSlip-based queries                        │
│    Status: Retain for 1 release cycle post-Phase B.2         │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ Consumed via SELECT
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Visit Service (Read-Only Consumer)                           │
├─────────────────────────────────────────────────────────────┤
│  • Joins visit_financial_summary on visit.id                 │
│  • Displays financial context in UI                          │
│  • ❌ NEVER writes to player_financial_transaction           │
└─────────────────────────────────────────────────────────────┘
```

---

## Interface Contract

### Provided Views

#### 1. visit_financial_summary

**Purpose**: Per-visit financial totals with reversals applied

**Consumer**: Visit service, reporting, UI dashboards

**Schema**:
```sql
CREATE VIEW visit_financial_summary WITH (security_barrier = true) AS
SELECT
  visit_id UUID,
  total_cash_in DECIMAL,        -- Sum of CASH_IN events minus REVERSAL
  total_chips_brought DECIMAL,  -- Sum of CHIPS_BROUGHT minus REVERSAL
  total_chips_taken DECIMAL,    -- Sum of CHIPS_TAKEN minus REVERSAL
  transaction_count INTEGER,    -- Total financial events for this visit
  last_transaction_at TIMESTAMP -- Most recent transaction
FROM player_financial_transaction
GROUP BY visit_id;
```

**Event Semantics**:
| Event Type | Description | Aggregation Logic |
|------------|-------------|-------------------|
| `CASH_IN` | Player deposits cash at table | Add `cash_in` to total |
| `CHIPS_BROUGHT` | Player brings chips to table | Add `chips_brought` to total |
| `CHIPS_TAKEN` | Player takes chips from table | Add `chips_taken` to total |
| `REVERSAL` | Correction/void transaction | Subtract corresponding field from total |

**Aggregation SQL**:
```sql
SUM(CASE WHEN event_type = 'CASH_IN' THEN COALESCE(cash_in, 0)
         WHEN event_type = 'REVERSAL' THEN -1 * COALESCE(cash_in, 0)
         ELSE 0 END) AS total_cash_in
```

**Example Query**:
```typescript
// Visit service reads financial context
const { data } = await supabase
  .from('visit_financial_summary')
  .select('total_cash_in, total_chips_brought, total_chips_taken')
  .eq('visit_id', visitId)
  .single();
```

**RLS Policy**: Authenticated users can SELECT (inherited from view's security_barrier)

---

#### 2. visit_financial_summary_gd

**Purpose**: Per-visit financial totals aligned to casino gaming-day boundaries

**Consumer**: MTL service (compliance reporting), gaming-day dashboards

**Schema**:
```sql
CREATE VIEW visit_financial_summary_gd WITH (security_barrier = true) AS
SELECT
  visit_id UUID,
  casino_id UUID,
  timezone TEXT,                 -- From casino_settings (e.g., 'America/Los_Angeles')
  gaming_day_start TIME,         -- From casino_settings (default: 06:00)
  gaming_day DATE,               -- Computed gaming day boundary
  total_cash_in DECIMAL,
  total_chips_brought DECIMAL,
  total_chips_taken DECIMAL,
  transaction_count INTEGER,
  last_transaction_at TIMESTAMP
FROM player_financial_transaction pft
JOIN visit v ON v.id = pft.visit_id
LEFT JOIN casino_settings cs ON cs.casino_id = v.casino_id
GROUP BY visit_id, casino_id, timezone, gaming_day_start, gaming_day;
```

**Gaming Day Calculation**:
```sql
-- Converts UTC transaction_time to casino local time, then shifts by gaming_day_start
(DATE_TRUNC('day', (transaction_time AT TIME ZONE timezone)
  - (COALESCE(gaming_day_start::interval, INTERVAL '6 hours')))
  + (COALESCE(gaming_day_start::interval, INTERVAL '6 hours')))::date
```

**Example**: If `gaming_day_start = 06:00` and transaction occurs at `2025-10-20 04:00 PT`, it belongs to gaming day `2025-10-19` (the previous calendar day).

**Temporal Authority Pattern**: Casino service owns `timezone` and `gaming_day_start`; PlayerFinancial REFERENCES these read-only for aggregation.

**RLS Policy**: `reporting_reader` role can SELECT; requires elevated permissions

---

#### 3. ratingslip_with_financials (Transitional)

**Purpose**: Compatibility view for legacy RatingSlip consumers during Phase B.2 transition

**Consumer**: Existing queries that expect financial fields on RatingSlip table

**Status**: **Transitional** - Retain for 1 release cycle post-Phase B.2, then deprecate

**Schema**:
```sql
CREATE VIEW ratingslip_with_financials WITH (security_barrier = true) AS
SELECT
  r.id,
  r.average_bet,           -- Performance metric (RatingSlip domain)
  r.seat_number,
  r.start_time,
  r.end_time,
  r.game_settings,
  r.gaming_table_id,
  r.visit_id,
  -- Financial fields sourced from PlayerFinancial aggregates
  vfs.total_cash_in AS cash_in,
  vfs.total_chips_brought AS chips_brought,
  vfs.total_chips_taken AS chips_taken,
  vfs.transaction_count AS financial_transaction_count,
  vfs.last_transaction_at
FROM ratingslip r
LEFT JOIN visit_financial_summary vfs ON vfs.visit_id = r.visit_id;
```

**Design Note**: Uses explicit column list (no `r.*`) to avoid dependency on dropped `ratingslip` financial columns after Phase B.2.

**Deprecation Plan**:
1. **Phase B.2**: Drop `ratingslip.{cash_in, chips_brought, chips_taken}` columns
2. **Monitor** (1 release cycle): Track view usage, identify remaining consumers
3. **Migrate Consumers**: Update queries to join `visit_financial_summary` directly
4. **Deprecate View**: After usage drops to zero, mark view as deprecated
5. **Remove View**: After 2+ release cycles with zero usage

**Example Migration**:
```typescript
// Before (legacy pattern):
const { data } = await supabase
  .from('ratingslip_with_financials')
  .select('*')
  .eq('id', ratingSlipId);

// After (recommended pattern):
const { data } = await supabase
  .from('ratingslip')
  .select('*, visit_financial_summary!inner(total_cash_in, total_chips_brought, total_chips_taken)')
  .eq('id', ratingSlipId);
```

---

## Responsibilities Matrix

### PlayerFinancial Service OWNS

**Write Authority**:
- ✅ Exclusive INSERT rights to `player_financial_transaction`
- ✅ Schema evolution (add columns, enums, constraints)
- ✅ View definitions and aggregation logic
- ✅ Idempotency enforcement (unique constraint on `idempotency_key`)
- ✅ Event type validation (CHECK constraints per `financial_event_type`)
- ✅ Append-only enforcement (RLS + trigger)

**Maintenance Responsibilities**:
- ✅ View performance optimization (indexes, query plans)
- ✅ Security barrier configuration
- ✅ RLS policy management
- ✅ Historical data integrity

**Example**:
```typescript
// PlayerFinancial service creates transactions
export async function createFinancialTransaction(
  supabase: SupabaseClient<Database>,
  data: PlayerFinancialTransactionCreateDTO
): Promise<Result<PlayerFinancialTransaction>> {
  const { data: transaction, error } = await supabase
    .from('player_financial_transaction')
    .insert({
      player_id: data.playerId,
      visit_id: data.visitId,
      event_type: data.eventType, // 'CASH_IN', 'CHIPS_BROUGHT', etc.
      cash_in: data.cashIn,
      idempotency_key: data.idempotencyKey, // Client-provided UUID
      transaction_type: data.transactionType,
    })
    .select()
    .single();

  if (error) return { success: false, error };
  return { success: true, data: transaction };
}
```

---

### Visit Service REFERENCES

**Read-Only Access**:
- ✅ SELECT from `visit_financial_summary` (join on `visit.id`)
- ✅ Display financial context in session UI
- ✅ Aggregate financial totals for visit summaries
- ✅ Join financial data in reporting queries

**Anti-Responsibilities** (MUST NOT):
- ❌ INSERT to `player_financial_transaction` (use PlayerFinancial service)
- ❌ UPDATE financial data (append-only table)
- ❌ DELETE financial transactions (compliance requirement)
- ❌ Cache financial totals in `visit` table (use views)
- ❌ Implement custom aggregation logic (use provided views)

**Example**:
```typescript
// Visit service reads financial context (READ-ONLY)
export async function getVisitWithFinancials(
  supabase: SupabaseClient<Database>,
  visitId: string
): Promise<Result<VisitWithFinancials>> {
  const { data, error } = await supabase
    .from('visit')
    .select(`
      *,
      visit_financial_summary!inner (
        total_cash_in,
        total_chips_brought,
        total_chips_taken,
        transaction_count
      )
    `)
    .eq('id', visitId)
    .single();

  if (error) return { success: false, error };
  return { success: true, data };
}
```

---

### Casino Service (Temporal Authority)

**Owns Configuration**:
- ✅ `casino_settings` table (timezone, gaming_day_start)
- ✅ Gaming day boundary definitions
- ✅ Temporal configuration updates

**Consumed By PlayerFinancial**:
- ✅ `visit_financial_summary_gd` view reads `casino_settings` (read-only)
- ✅ Gaming day calculation uses `timezone` and `gaming_day_start`

**Anti-Responsibilities**:
- ❌ Casino service NEVER writes to `player_financial_transaction`
- ❌ Casino service does NOT aggregate financial data (use PlayerFinancial views)

**Temporal Authority Contract**:
```sql
-- Casino service OWNS temporal configuration
UPDATE casino_settings
SET gaming_day_start = '05:00:00', timezone = 'America/New_York'
WHERE casino_id = ?;

-- PlayerFinancial REFERENCES via view (read-only join)
SELECT gaming_day, total_cash_in
FROM visit_financial_summary_gd
WHERE casino_id = ?;
```

---

## Security Posture

### Row-Level Security (RLS)

**player_financial_transaction table**:
```sql
-- RLS enabled with security_barrier on all views
ALTER TABLE player_financial_transaction ENABLE ROW LEVEL SECURITY;

-- Policy 1: authenticated users can SELECT own transactions
CREATE POLICY pft_read_authenticated
  ON player_financial_transaction FOR SELECT
  TO authenticated
  USING (auth.uid() = player_id);

-- Policy 2: service_role has full access (trusted service)
CREATE POLICY pft_service_full_access
  ON player_financial_transaction FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Policy 3: reporting_reader can SELECT all (analytics role)
CREATE POLICY pft_reporting_reader_select
  ON player_financial_transaction FOR SELECT
  TO reporting_reader
  USING (true);

-- Policy 4: authenticated CANNOT UPDATE (append-only)
CREATE POLICY pft_no_update
  ON player_financial_transaction FOR UPDATE
  TO authenticated
  USING (false) WITH CHECK (false);

-- Policy 5: authenticated CANNOT DELETE (compliance)
CREATE POLICY pft_no_delete
  ON player_financial_transaction FOR DELETE
  TO authenticated
  USING (false);
```

**Append-Only Enforcement (Trigger)**:
```sql
-- Prevents UPDATE/DELETE from non-service roles at trigger level
CREATE OR REPLACE FUNCTION enforce_pft_append_only()
RETURNS trigger AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'player_financial_transaction is append-only for non-service roles';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_pft_append_only
  BEFORE UPDATE OR DELETE ON player_financial_transaction
  FOR EACH ROW EXECUTE FUNCTION enforce_pft_append_only();
```

---

### Grants

```sql
-- Views: authenticated users can SELECT aggregated financial data
GRANT SELECT ON visit_financial_summary TO authenticated;
GRANT SELECT ON ratingslip_with_financials TO authenticated;

-- Views: reporting_reader can SELECT for analytics
GRANT USAGE ON SCHEMA public TO reporting_reader;
GRANT SELECT ON visit_financial_summary TO reporting_reader;
GRANT SELECT ON visit_financial_summary_gd TO reporting_reader;
GRANT SELECT ON ratingslip_with_financials TO reporting_reader;

-- Raw table: NO direct SELECT for authenticated users (must use views)
REVOKE SELECT ON player_financial_transaction FROM authenticated;

-- service_role: Implicit full access via RLS bypass
```

---

### Security Design Principles

1. **Least Privilege**: Authenticated users can only SELECT via views, never raw table
2. **Append-Only**: Non-service roles blocked from UPDATE/DELETE at RLS + trigger level
3. **Separation of Concerns**: Financial writes isolated to service_role
4. **Security Barrier**: All views use `WITH (security_barrier = true)` to prevent RLS bypass
5. **Idempotency**: Unique constraint on `idempotency_key` prevents duplicate charges

---

## Performance Contract

### Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| **p95 Latency** | ≤ 100 ms | 90th percentile user experience acceptable |
| **Mean Latency** | ≤ 40 ms | Typical query response time |
| **Throughput** | 100+ QPS | Concurrent user load at scale |

### Indexes

**Primary Join Indexes**:
```sql
-- visit_financial_summary queries
CREATE INDEX idx_pft_visit_id ON player_financial_transaction (visit_id);
CREATE INDEX idx_pft_visit_event ON player_financial_transaction (visit_id, event_type);

-- visit_financial_summary_gd queries
CREATE INDEX idx_pft_transaction_time ON player_financial_transaction (transaction_time DESC);
CREATE INDEX idx_visit_casino ON visit (id, casino_id);
CREATE INDEX idx_csettings_cid ON casino_settings (casino_id);

-- Player-specific queries
CREATE INDEX idx_pft_player_id ON player_financial_transaction (player_id);

-- Idempotency lookups
CREATE UNIQUE INDEX idx_pft_visit_event_idempotency
  ON player_financial_transaction (visit_id, event_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

### Query Plan Requirements

**visit_financial_summary**:
- ✅ Index scan on `idx_pft_visit_id` (no Seq Scan)
- ✅ Aggregate push-down optimization
- ✅ Security barrier does NOT block index usage

**visit_financial_summary_gd**:
- ✅ Nested loop join: `visit` → `player_financial_transaction` → `casino_settings`
- ✅ Index-only scan on `idx_visit_casino` where possible
- ✅ Gaming day calculation executed in aggregation phase (not per-row)

**Performance Validation** (pending Task 3.1-3.3):
```sql
-- Benchmark queries to validate targets
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM visit_financial_summary WHERE visit_id = ?;
-- Expected: Index Scan, <50ms execution time

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM visit_financial_summary_gd
WHERE casino_id = ? AND gaming_day = CURRENT_DATE;
-- Expected: Nested Loop with Index Scans, <100ms execution time
```

---

## Migration Path (Phase B.2)

### Pre-Cutover (Current State)

**Status**: Phase B.1 complete ✅
- ✅ Views created and indexed
- ✅ Event type enum + idempotency constraints added
- ✅ RLS policies + append-only trigger established
- ✅ Historical data backfilled with event types
- ⏳ Legacy `ratingslip.{cash_in, chips_brought, chips_taken}` columns still exist

**Validation Pending**:
- ⏳ Consumer audit: **COMPLETE** - Zero code references found
- ⏳ RLS contract tests (Task 2.2)
- ⏳ Integration tests (Task 2.4)
- ⏳ Performance validation (Task 3.1-3.3)

---

### Cutover (Phase B.2 Execution)

**Trigger**: All validation gates pass (Tasks 2.2-2.4, 3.1-3.3)

**Steps**:
1. Apply migration `20251019234330_phase_b_financial_views_phase2.sql`:
   ```sql
   -- Rebuild ratingslip_with_financials view without column dependencies
   CREATE OR REPLACE VIEW ratingslip_with_financials AS
   SELECT r.id, r.average_bet, ..., vfs.total_cash_in AS cash_in, ...
   FROM ratingslip r LEFT JOIN visit_financial_summary vfs ON vfs.visit_id = r.visit_id;

   -- Drop legacy financial columns from ratingslip
   ALTER TABLE ratingslip
     DROP COLUMN cash_in,
     DROP COLUMN chips_brought,
     DROP COLUMN chips_taken;

   -- Reload PostgREST schema cache
   NOTIFY pgrst, 'reload schema';
   ```

2. Regenerate TypeScript types:
   ```bash
   npm run db:types-local
   ```

3. Smoke test API responses:
   ```bash
   # Verify ratingslip no longer has financial columns
   curl "$SUPABASE_URL/rest/v1/ratingslip?select=*&limit=1"
   # Expected: No cash_in, chips_brought, chips_taken

   # Verify compatibility view works
   curl "$SUPABASE_URL/rest/v1/ratingslip_with_financials?select=*&limit=1"
   # Expected: Financial columns present (from view)
   ```

4. Monitor for 1 hour:
   - Check application logs for errors
   - Monitor query performance (no regressions)
   - Verify PostgREST schema cache refreshed

---

### Post-Cutover

**Monitoring Period**: 1 release cycle (2-3 weeks)

**Metrics to Track**:
- `ratingslip_with_financials` view query count
- API response time p95/p99 for financial endpoints
- Error rate for visit/ratingslip queries
- PostgREST cache hit rate

**Success Criteria**:
- ✅ Zero errors from schema change
- ✅ Performance within ±5% of baseline
- ✅ No support tickets related to financial data

**Deprecation Timeline**:
- **Weeks 1-4**: Monitor usage patterns, identify remaining consumers
- **Weeks 5-8**: If usage drops to zero, document deprecation plan
- **Weeks 9+**: Remove view if no longer needed

---

## Rollback Plan

If Phase B.2 causes production issues, execute the following rollback:

```sql
BEGIN;

-- Step 1: Re-add nullable financial columns to ratingslip
ALTER TABLE ratingslip
  ADD COLUMN cash_in DECIMAL,
  ADD COLUMN chips_brought DECIMAL,
  ADD COLUMN chips_taken DECIMAL;

-- Step 2: Backfill from visit_financial_summary
UPDATE ratingslip r
SET cash_in = vfs.total_cash_in,
    chips_brought = vfs.total_chips_brought,
    chips_taken = vfs.total_chips_taken
FROM visit_financial_summary vfs
WHERE r.visit_id = vfs.visit_id;

-- Step 3: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
```

**Rollback Validation**:
```bash
# Verify columns restored
psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns
  WHERE table_name = 'ratingslip' AND column_name IN ('cash_in', 'chips_brought', 'chips_taken');"
# Expected: 3 rows

# Regenerate types
npm run db:types-local

# Smoke test
curl "$SUPABASE_URL/rest/v1/ratingslip?select=cash_in,chips_brought,chips_taken&limit=1"
# Expected: Values present (backfilled from view)
```

**Rollback Retention**: Keep `visit_financial_summary` view indefinitely to enable seamless rollback.

---

## Anti-Patterns to Avoid

### ❌ Anti-Pattern 1: Visit Service Writing Financial Data

**Wrong**:
```typescript
// ❌ Visit service should NEVER do this
await supabase.from('player_financial_transaction').insert({
  visit_id: visitId,
  cash_in: 100,
  event_type: 'CASH_IN',
});
```

**Correct**:
```typescript
// ✅ Delegate to PlayerFinancial service
import { createFinancialTransaction } from '@/services/player-financial';

await createFinancialTransaction(supabase, {
  visitId,
  cashIn: 100,
  eventType: 'CASH_IN',
  idempotencyKey: uuidv4(),
});
```

---

### ❌ Anti-Pattern 2: Caching Financial Totals in Visit Table

**Wrong**:
```sql
-- ❌ Adding redundant cached columns
ALTER TABLE visit
  ADD COLUMN total_cash_in DECIMAL,
  ADD COLUMN total_chips_taken DECIMAL;

-- ❌ Manually updating cache on each transaction
UPDATE visit SET total_cash_in = total_cash_in + 100 WHERE id = ?;
```

**Correct**:
```sql
-- ✅ Use views (always fresh, no cache invalidation)
SELECT v.*, vfs.total_cash_in, vfs.total_chips_taken
FROM visit v
LEFT JOIN visit_financial_summary vfs ON vfs.visit_id = v.id
WHERE v.id = ?;
```

---

### ❌ Anti-Pattern 3: Custom Aggregation Logic in Visit Service

**Wrong**:
```typescript
// ❌ Reimplementing aggregation logic
const transactions = await supabase
  .from('player_financial_transaction')
  .select('*')
  .eq('visit_id', visitId);

const totalCashIn = transactions
  .filter(t => t.event_type === 'CASH_IN')
  .reduce((sum, t) => sum + t.cash_in, 0);
```

**Correct**:
```typescript
// ✅ Use provided view (handles reversals correctly)
const { data } = await supabase
  .from('visit_financial_summary')
  .select('total_cash_in')
  .eq('visit_id', visitId)
  .single();
```

---

### ❌ Anti-Pattern 4: Direct Table Access for Financial Data

**Wrong**:
```typescript
// ❌ Bypassing views exposes security risk
const { data } = await supabase
  .from('player_financial_transaction')
  .select('*')
  .eq('visit_id', visitId);
// Might expose other players' data if RLS misconfigured
```

**Correct**:
```typescript
// ✅ Use security-barrier views (RLS enforced)
const { data } = await supabase
  .from('visit_financial_summary')
  .select('*')
  .eq('visit_id', visitId);
// Security barrier ensures RLS checks happen correctly
```

---

## Verification Checklist

### Pre-Migration Checklist

- ✅ **Task 1.1**: Financial Data Ownership Table complete
- ✅ **Task 2.1**: Consumer audit complete (zero code changes)
- ⏳ **Task 2.2**: RLS contract tests pass
- ⏳ **Task 2.3**: `npm run validate:matrix-schema` passes
- ⏳ **Task 2.4**: Integration tests pass (API smoke tests)
- ⏳ **Task 3.1-3.3**: Performance targets met (p95 ≤ 100ms)

### Post-Migration Checklist

- ⏳ **Schema Change**: `ratingslip` table has NO financial columns
- ⏳ **Type Generation**: `types/database.types.ts` regenerated successfully
- ⏳ **API Compatibility**: `ratingslip_with_financials` view serves financial data
- ⏳ **Security**: RLS policies enforced on all views
- ⏳ **Performance**: Query latency within ±5% of baseline
- ⏳ **Monitoring**: Zero errors in application logs (1 hour post-deploy)

---

## References

- **Phase B Workflow**: `PHASE_B_IMPLEMENTATION_WORKFLOW.md`
- **Financial Ownership Table**: `FINANCIAL_DATA_OWNERSHIP_TABLE.md`
- **Consumer Audit Report**: `.validation/consumer_audit_report.md`
- **Service Responsibility Matrix**: `../SERVICE_RESPONSIBILITY_MATRIX.md`
- **Migration Phase 1**: `supabase/migrations/20251019234325_phase_b_financial_views_phase1.sql`
- **Migration Phase 2**: `supabase/migrations/20251019234330_phase_b_financial_views_phase2.sql`
- **ADR-006**: `80-adrs/ADR-006-rating-slip-field-removal.md`

---

## Document Control

**Version**: 1.0.0
**Author**: Architecture Lead + Database Lead
**Created**: 2025-10-20
**Status**: Complete (Task 1.2)
**Next Review**: Post-Phase B.2 execution

**Questions**: Contact Architecture Lead or Database Lead
