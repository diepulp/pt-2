# Financial Data Ownership Table

**Version**: 1.0.0
**Date**: 2025-10-20
**Phase**: Phase B - Financial Bounded Context Integrity
**Status**: Complete

## Executive Summary

This document provides a comprehensive inventory of all financial columns in the database schema, mapping each to its authoritative service owner and Phase B remediation status. The table establishes clear ownership boundaries for monetary data to prevent duplicate writes and ensure data integrity.

---

## Financial Column Inventory

| Table | Column | Type | Owner Service | Pattern | Status | Phase B Action |
|-------|--------|------|---------------|---------|--------|----------------|
| **player_financial_transaction** | cash_in | decimal | PlayerFinancial | OWNS | Source of Truth | ✅ Primary |
| **player_financial_transaction** | chips_brought | decimal | PlayerFinancial | OWNS | Source of Truth | ✅ Primary |
| **player_financial_transaction** | chips_taken | decimal | PlayerFinancial | OWNS | Source of Truth | ✅ Primary |
| **player_financial_transaction** | net_change | decimal | PlayerFinancial | OWNS | Source of Truth | ✅ Primary |
| **player_financial_transaction** | event_type | enum | PlayerFinancial | OWNS | Source of Truth | ✅ Added Phase B.1 |
| **player_financial_transaction** | idempotency_key | text | PlayerFinancial | OWNS | Source of Truth | ✅ Added Phase B.1 |
| **player_financial_transaction** | transaction_type | enum | PlayerFinancial | OWNS | Source of Truth | ✅ Existing |
| **player_financial_transaction** | reconciliation_status | enum | PlayerFinancial | OWNS | Source of Truth | ✅ Existing |
| **ratingslip** | cash_in | decimal | RatingSlip | DENORMALIZED | Legacy Duplication | 🔄 Remove Phase B.2 |
| **ratingslip** | chips_brought | decimal | RatingSlip | DENORMALIZED | Legacy Duplication | 🔄 Remove Phase B.2 |
| **ratingslip** | chips_taken | decimal | RatingSlip | DENORMALIZED | Legacy Duplication | 🔄 Remove Phase B.2 |
| **ratingslip** | average_bet | decimal | RatingSlip | OWNS | Performance Metric | ✅ Retained (not financial) |
| **visit_financial_summary** | total_cash_in | decimal | PlayerFinancial | REFERENCES | Aggregate View | ✅ Created Phase B.1 |
| **visit_financial_summary** | total_chips_brought | decimal | PlayerFinancial | REFERENCES | Aggregate View | ✅ Created Phase B.1 |
| **visit_financial_summary** | total_chips_taken | decimal | PlayerFinancial | REFERENCES | Aggregate View | ✅ Created Phase B.1 |
| **visit_financial_summary** | transaction_count | integer | PlayerFinancial | REFERENCES | Aggregate View | ✅ Created Phase B.1 |
| **visit_financial_summary** | last_transaction_at | timestamp | PlayerFinancial | REFERENCES | Aggregate View | ✅ Created Phase B.1 |
| **visit_financial_summary_gd** | total_cash_in | decimal | PlayerFinancial | REFERENCES | Gaming Day View | ✅ Created Phase B.1 |
| **visit_financial_summary_gd** | total_chips_brought | decimal | PlayerFinancial | REFERENCES | Gaming Day View | ✅ Created Phase B.1 |
| **visit_financial_summary_gd** | total_chips_taken | decimal | PlayerFinancial | REFERENCES | Gaming Day View | ✅ Created Phase B.1 |
| **visit_financial_summary_gd** | transaction_count | integer | PlayerFinancial | REFERENCES | Gaming Day View | ✅ Created Phase B.1 |
| **visit_financial_summary_gd** | gaming_day | date | Casino (temporal) | REFERENCES | Gaming Day View | ✅ Created Phase B.1 |
| **ratingslip_with_financials** | cash_in | decimal | PlayerFinancial | REFERENCES | Compatibility View | ✅ Created Phase B.1 |
| **ratingslip_with_financials** | chips_brought | decimal | PlayerFinancial | REFERENCES | Compatibility View | ✅ Created Phase B.1 |
| **ratingslip_with_financials** | chips_taken | decimal | PlayerFinancial | REFERENCES | Compatibility View | ✅ Created Phase B.1 |
| **ratingslip_with_financials** | financial_transaction_count | integer | PlayerFinancial | REFERENCES | Compatibility View | ✅ Created Phase B.1 |
| **ratingslip_with_financials** | last_transaction_at | timestamp | PlayerFinancial | REFERENCES | Compatibility View | ✅ Created Phase B.1 |
| **DropEvent** | amount | decimal | TableManagement | OWNS | Table Inventory | ✅ Separate Domain |
| **DropEvent** | variance | decimal | TableManagement | OWNS | Table Inventory | ✅ Separate Domain |
| **mtl_entry** | amount | decimal | MTL | OWNS | Compliance Tracking | ✅ Separate Domain |

---

## Temporal Authority Pattern

### Casino → PlayerFinancial

**Context**: Gaming day boundaries are defined by casino-specific timezone and gaming_day_start time.

**Owner**: Casino service owns `casino_settings` table with:
- `timezone` (e.g., "America/Los_Angeles")
- `gaming_day_start` (e.g., "06:00:00")

**Consumer**: PlayerFinancial service REFERENCES these via `visit_financial_summary_gd` view for gaming-day aggregation.

**Pattern**:
```sql
-- Casino service OWNS configuration
UPDATE casino_settings SET gaming_day_start = '05:00:00' WHERE casino_id = ?;

-- PlayerFinancial REFERENCES via view (read-only)
SELECT gaming_day, total_cash_in
FROM visit_financial_summary_gd
WHERE casino_id = ?;
```

**Anti-Pattern** (DO NOT):
```sql
-- ❌ PlayerFinancial must NOT modify casino_settings
UPDATE casino_settings SET timezone = 'UTC' WHERE ...;
```

---

### Visit → PlayerFinancial

**Context**: Visit records represent player check-ins/check-outs at a casino.

**Owner**: Visit service owns `visit` table with:
- `id` (UUID, primary key)
- `player_id`, `casino_id`, `status`, `mode`

**Consumer**: PlayerFinancial service joins `visit.id` for aggregation but never modifies visit data.

**Pattern**:
```sql
-- Visit service OWNS visit lifecycle
INSERT INTO visit (player_id, casino_id, status) VALUES (?, ?, 'ONGOING');

-- PlayerFinancial REFERENCES via foreign key (read-only join)
SELECT vfs.total_cash_in, v.check_in_date
FROM visit_financial_summary vfs
JOIN visit v ON vfs.visit_id = v.id
WHERE v.player_id = ?;
```

**Anti-Pattern** (DO NOT):
```sql
-- ❌ PlayerFinancial must NOT modify visit records
UPDATE visit SET status = 'COMPLETED' WHERE id = ?;
```

---

## Event Type Semantics

### financial_event_type Enum

Phase B.1 introduced the `financial_event_type` enum with CHECK constraints to ensure semantic correctness:

| Event Type | Description | Field Requirements | Aggregation Logic |
|------------|-------------|-------------------|-------------------|
| `CASH_IN` | Player deposits cash at table | `cash_in > 0`, others NULL | Add to totals |
| `CHIPS_BROUGHT` | Player brings chips to table | `chips_brought > 0`, others NULL | Add to totals |
| `CHIPS_TAKEN` | Player takes chips from table | `chips_taken > 0`, others NULL | Add to totals |
| `REVERSAL` | Correction/void transaction | Any field can be set | Subtract from totals |

**Aggregation Logic in Views**:
```sql
SUM(CASE WHEN event_type = 'CASH_IN' THEN cash_in
         WHEN event_type = 'REVERSAL' THEN -1 * cash_in
         ELSE 0 END) AS total_cash_in
```

---

## Anti-Patterns Eliminated

### ❌ Duplicate Writes

**Before Phase B.2**:
- RatingSlip service could write to `ratingslip.cash_in`, `ratingslip.chips_brought`, `ratingslip.chips_taken`
- PlayerFinancial service wrote to `player_financial_transaction.cash_in`, etc.
- Two sources of truth for the same data → data integrity risk

**After Phase B.2**:
- RatingSlip columns dropped from table schema
- Only PlayerFinancial service can write financial data
- Single source of truth enforced at database level

---

### ❌ Missing Idempotency Protection

**Before Phase B.1**:
- No unique constraint on financial transactions
- Risk of duplicate charges if API request retries
- No way to detect accidental duplicates

**After Phase B.1**:
- `idempotency_key` column added with unique constraint
- Client provides UUID with each transaction
- Database rejects duplicate idempotency keys
- Safe retry behavior guaranteed

---

### ❌ Event Type Ambiguity

**Before Phase B.1**:
- Only `transaction_type` enum (DEPOSIT, WITHDRAWAL, etc.)
- Not specific enough for gaming operations
- Couldn't distinguish CASH_IN vs CHIPS_BROUGHT

**After Phase B.1**:
- `financial_event_type` enum with gaming-specific semantics
- CHECK constraints ensure correct field usage
- Aggregation views use event types for accurate totals

---

### ❌ Temporal Authority Leakage

**Before Phase B.1**:
- Gaming day logic scattered across services
- Each service reimplemented timezone/gaming_day_start logic
- Risk of calculation drift between services

**After Phase B.1**:
- Gaming day logic isolated to `visit_financial_summary_gd` view
- Single source of truth: `casino_settings` table
- All consumers query the view (no local calculation)

---

## Service Ownership Summary

### PlayerFinancial Service OWNS

- ✅ Write authority for `player_financial_transaction` table (all columns)
- ✅ Schema evolution (add columns, constraints, indexes)
- ✅ View maintenance (`visit_financial_summary`, `visit_financial_summary_gd`, `ratingslip_with_financials`)
- ✅ Append-only enforcement (RLS + trigger)
- ✅ Idempotency protection (unique constraint on `idempotency_key`)
- ✅ Event type validation (CHECK constraints)
- ✅ Aggregation logic (view definitions)

### Visit Service REFERENCES

- ✅ Read-only access via `visit_financial_summary` view
- ✅ Join on `visit.id` for financial context in UI
- ❌ Never writes to `player_financial_transaction`
- ❌ Never modifies aggregation logic

### RatingSlip Service

**Current (pre-Phase B.2)**:
- ⚠️ Still has financial columns in schema (denormalized)
- ⚠️ No longer writes to these columns (already migrated in code)

**After Phase B.2**:
- ✅ Financial columns removed from schema
- ✅ Uses `ratingslip_with_financials` view for legacy queries
- ✅ Focuses solely on performance metrics (average_bet, time_played, seat_number)

### Casino Service (Temporal Authority)

- ✅ Owns `casino_settings` (timezone, gaming_day_start)
- ✅ PlayerFinancial reads these for gaming-day aggregation
- ❌ Casino never writes financial transaction data

---

## Security Posture

### Row-Level Security (RLS)

| Role | Permission | Scope | Enforcement |
|------|------------|-------|-------------|
| **authenticated** | SELECT | Own transactions only (`player_id = auth.uid()`) | RLS policy |
| **authenticated** | INSERT | Blocked (must use service_role) | RLS policy |
| **authenticated** | UPDATE | Blocked (append-only) | RLS policy + trigger |
| **authenticated** | DELETE | Blocked (append-only) | RLS policy + trigger |
| **service_role** | Full access | Trusted internal service | Bypass RLS |
| **reporting_reader** | SELECT via views | Read-only analytics | GRANT on views only |

### Grants

```sql
-- Views: authenticated users can read aggregated data
GRANT SELECT ON visit_financial_summary TO authenticated;
GRANT SELECT ON visit_financial_summary_gd TO reporting_reader;
GRANT SELECT ON ratingslip_with_financials TO authenticated;

-- Raw table: NO direct access for authenticated users
REVOKE SELECT ON player_financial_transaction FROM authenticated;

-- service_role: full access (implicit via RLS bypass)
```

---

## Migration Roadmap

### Phase B.1: View Creation ✅ COMPLETE

**Deliverables**:
- ✅ `financial_event_type` enum created
- ✅ `event_type` + `idempotency_key` columns added to `player_financial_transaction`
- ✅ Historical data backfilled
- ✅ Append-only trigger + RLS policies established
- ✅ 3 views created with proper indexes
- ✅ `reporting_reader` role configured

**Status**: Applied via `20251019234325_phase_b_financial_views_phase1.sql`

---

### Phase B.2: Column Removal 🔄 IN PROGRESS

**Prerequisites**:
- ✅ Consumer audit complete (Task 2.1) - **Zero code references found**
- ✅ All consumers already migrated (service layer abstracted)
- 🔄 Integration validation (Task 2.4)
- 🔄 Performance validation (Task 3.3)

**Deliverables**:
- 🔄 Apply `20251019234330_phase_b_financial_views_phase2.sql`
- 🔄 Drop `ratingslip.{cash_in, chips_brought, chips_taken}` columns
- 🔄 Rebuild `ratingslip_with_financials` view without dependencies
- 🔄 PostgREST cache reload (`NOTIFY pgrst, 'reload schema'`)
- 🔄 Database types regeneration

**Status**: Ready for execution pending validation gates

---

### Post-Phase B: Monitoring & Deprecation

**Monitoring Period** (1 release cycle):
- Monitor `ratingslip_with_financials` view usage
- Track query performance metrics
- Validate zero errors from schema change

**Future Optimization**:
- Consider deprecating `ratingslip_with_financials` after consumers migrate to direct joins
- Document deprecation timeline in ADR-006 addendum
- Evaluate materialized view for `visit_financial_summary_gd` if dataset grows 10x

---

## Validation Criteria

### Data Integrity

- ✅ Every monetary column has exactly one authoritative service
- ✅ No duplicate write paths to the same logical data
- ✅ All financial writes funnel through `player_financial_transaction`
- ✅ Views provide read-only aggregations (no direct table access)

### Idempotency

- ✅ `idempotency_key` unique constraint prevents duplicate transactions
- ✅ Clients can safely retry API requests
- ✅ Database rejects duplicate submissions automatically

### Event Type Semantics

- ✅ CHECK constraints ensure correct field usage per event type
- ✅ Aggregation logic consistent across all views
- ✅ REVERSAL events correctly subtract from totals

### Temporal Authority

- ✅ Gaming day logic isolated to single view
- ✅ Casino service owns timezone/gaming_day_start configuration
- ✅ PlayerFinancial references (never modifies) casino settings

---

## Rollback Plan

If Phase B.2 causes issues, execute the following rollback:

```sql
-- Re-add columns to ratingslip (nullable)
ALTER TABLE ratingslip
  ADD COLUMN cash_in DECIMAL,
  ADD COLUMN chips_brought DECIMAL,
  ADD COLUMN chips_taken DECIMAL;

-- Backfill from visit_financial_summary
UPDATE ratingslip r
SET cash_in = vfs.total_cash_in,
    chips_brought = vfs.total_chips_brought,
    chips_taken = vfs.total_chips_taken
FROM visit_financial_summary vfs
WHERE r.visit_id = vfs.visit_id;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
```

**Retention**: Keep `ratingslip_with_financials` view indefinitely to enable seamless rollback.

---

## References

- **Phase B Workflow**: `PHASE_B_IMPLEMENTATION_WORKFLOW.md`
- **Service Responsibility Matrix**: `SERVICE_RESPONSIBILITY_MATRIX.md`
- **ADR-006**: `docs/adr/ADR-006-rating-slip-field-removal.md`
- **Migration Phase 1**: `supabase/migrations/20251019234325_phase_b_financial_views_phase1.sql`
- **Migration Phase 2**: `supabase/migrations/20251019234330_phase_b_financial_views_phase2.sql`

---

## Document Control

**Version**: 1.0.0
**Author**: Architecture Lead + Database Lead
**Created**: 2025-10-20
**Status**: Complete (Task 1.1)
**Next Review**: Post-Phase B.2 execution

**Questions**: Contact Architecture Lead or Database Lead
