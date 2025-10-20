# Responsibility Matrix Remediation Workflow

**Version**: 2.0.0 (Lean Edition)
**Status**: Phase B kickoff pending — Phase A sign-off captured in [PHASE_A_SIGNOFF.md](./phase-A/PHASE_A_SIGNOFF.md)
**Created**: 2025-10-20
**Target Completion**: 4-5 weeks
**Source Audit**: [RESPONSIBILIY_MATRIX_AUDIT.md](./RESPONSIBILIY_MATRIX_AUDIT.md)
**Changes from v1.0**: Consolidated 4 waves into 3 phases, removed ceremony, simplified tooling

## Executive Summary

This workflow addresses 8 critical inconsistencies identified in the SERVICE_RESPONSIBILITY_MATRIX.md audit. The lean 3-phase approach resolves ownership conflicts, type mismatches, boundary erosion, and documentation gaps through focused execution with minimal ceremony.

**Impact**: Restores bounded context integrity, eliminates schema drift, and establishes single source of truth for service responsibilities.

**Philosophy**: Keep heavy rigor where risk is real (UUID migration, financial boundaries). Keep it light for documentation-only tasks, naming, and sign-off paths.

---

## Phase Structure Overview

| Phase | Focus | Duration | Risk Level | Deliverables |
|-------|-------|----------|------------|--------------|
| A | Decide & Document | 1 week | Low | Matrix updates (temporal, performance, schema appendix) |
| B | Boundaries | 1 week | Medium | Financial ownership table, RatingSlip decision, Visit interface |
| C | Type Integrity | 7-10 days | High | Patron UUID migration with generated column + hardened gates |

**Total Timeline**: 3-4 weeks (vs 7-10 weeks in original plan)

Phase A exit criteria met on 2025-10-20; see [PHASE_A_SIGNOFF.md](./phase-A/PHASE_A_SIGNOFF.md) for evidence.

---

## Issue → Phase Mapping

| Issue # | Description | Phase | Priority | Risk |
|---------|-------------|-------|----------|------|
| #1 | Configuration ownership duplication | Phase A | Critical | Low |
| #7 | Temporal authority leakage | Phase A | Critical | Low |
| #6 | Naming divergence | Phase A | High | Low |
| #5 | Performance context undefined | Phase A | Medium | Low |
| #8 | Legacy friction tracking | Phase A | Low | Low |
| #3 | Telemetry/finance boundary erosion | Phase B | Critical | Medium |
| #4 | Visit financial aggregation ambiguity | Phase B | High | Medium |
| #2 | MTL patron type mismatch | Phase C | Critical | High |

---

## Phase A: Decide & Document (1 week)

**Status**: ✅ Completed — see [PHASE_A_SIGNOFF.md](./phase-A/PHASE_A_SIGNOFF.md).

### Objective
Update Responsibility Matrix with all documentation fixes in a single PR: schema appendix, ownership resolution, temporal authority, performance context.

### Consolidated Deliverables

**Addresses**: Issues #1, #5, #6, #7, #8
**Effort**: 1 week (5 business days)
**Owner**: Architecture Team + 1 Reviewer
**Output**: Single PR to SERVICE_RESPONSIBILITY_MATRIX.md

### Tasks (Run in Parallel)

#### 1. Schema Identifier Appendix (Days 1-2)
- Parse `types/database.types.ts` → Extract all table names
- Map tables to owning services from existing matrix sections
- Create appendix showing Entity (Matrix) vs Table (Schema) naming

**Output Section**:
```markdown
## Appendix A: Schema Identifier Reference
| Service | Entity (Matrix) | Table (Schema) | Notes |
|---------|----------------|----------------|-------|
| Casino | CasinoSettings | casino_settings | snake_case |
| Casino | Staff | "Staff" | Quoted CamelCase |
```

#### 2. Configuration Ownership + Temporal Authority (Day 2)
- Code audit: `grep -r "casino_settings.*update\|insert\|upsert" services/`
- Confirm MTL has zero writes to `casino_settings`
- Update Casino section: Declare sole owner
- Update MTL section: Add temporal authority contract

**Output**:
```markdown
### Casino Service
**Owned Entities**: `casino_settings` - Single temporal authority

### MTL Service
**Consumed Entities**: `casino_settings` (read-only)
**Temporal Pattern**: References gaming-day logic, never modifies
```

#### 3. Performance Bounded Context (Day 3)
- Document Performance service as read-model consumer
- List data sources (Casino, Visit, RatingSlip, MTL)
- Define responsibilities vs anti-responsibilities

**Output Section**:
```markdown
## Performance Service
**Purpose**: Real-time monitoring (read-model only)
**Owned**: `performance_alerts`
**Consumed**: Casino, Visit, RatingSlip (read-only)
**Anti-Pattern**: ❌ Does NOT write source data
```

#### 4. Consistency Checklist (Day 4)
- Update audit checklist with Phase A/B/C status
- Assign owners and target dates for all 8 issues
- Link evidence for completed items

### Phase A Success Criteria (PR Checklist)

Single PR must demonstrate:
- ✅ Schema appendix maps all 50+ tables to services
- ✅ Zero duplicate ownership claims (run: `npm run validate:ownership`)
- ✅ Zero orphaned references (matrix mentions tables that don't exist)
- ✅ Temporal authority explicitly documented (Casino owns, MTL consumes)
- ✅ Performance context section added
- ✅ Remediation checklist current and accurate
- ✅ One owner + one reviewer sign-off (no ARB required)

**Validation Command**:
```bash
npm run validate:matrix-schema  # Must pass before merge
```

**Approval**: Architecture lead + 1 reviewer (no multi-gate sign-off)

---

## Phase B: Boundaries (1 week)

**Status**: Pending kickoff — Phase A completion recorded in [PHASE_A_SIGNOFF.md](./phase-A/PHASE_A_SIGNOFF.md) with all exit gates met.  
**Decision Anchor**: Execute against [ADR-006: RatingSlip Financial Field Removal](../adr/ADR-006-rating-slip-field-removal.md). If removal is rejected, produce an ADR-006 addendum documenting the sanctioned denormalization contract.

### Context
- Issues **#3** (Telemetry/finance boundary erosion) and **#4** (Visit financial aggregation ambiguity) remain unresolved.
- Phase A delivered automated validation and clarified non-financial ownership; monetary data duplication persists between `ratingslip` and `player_financial_transaction`.
- Casino-defined timezone + gaming-day boundaries constrain how financial data is aggregated and reported across services.

### Objectives
- Establish a single owning service for every monetary attribute in the matrix.
- Determine and document the RatingSlip financial field strategy using ADR-006 guardrails.
- Capture the Visit ↔ PlayerFinancial read-model contract and anti-responsibilities.
- Preserve <100 ms p95 query performance for financial aggregation paths.

### Implementation (ADR-006 Template + [Phase-B Considerations](./phase-B/considerations.md))
1. **Financial Ownership Inventory (Days 1-2)**
   - Parse `types/database.types.ts` and the matrix to enumerate financial columns.
   - Produce the `Financial Data Ownership Table` within `SERVICE_RESPONSIBILITY_MATRIX.md` (new subsection or appendix entry).
   - For each field, assign authoritative service, remediation action, and cross-check with audit issue mapping.
   - Flag any fields lacking idempotency protection and plan a `(visit_id, event_type, idempotency_key)` unique constraint update per considerations guidance.
2. **Two-Phase RatingSlip Transition (Days 2-4)**
   - Review ADR-006 with Database Lead and confirm removal or provide addendum rationale.
   - **Phase 1 — Compatibility Layer**
     - Add plain views `visit_financial_summary`, `visit_financial_summary_gd`, and `ratingslip_with_financials` mirroring ADR-006 definitions.
     - Embed the aggregation contract in documentation: allowed event types `{cash_in, chips_brought, chips_taken, reversal}`, reversals as negative movements, append-only writes (no `UPDATE`/`DELETE`), alignment to Casino gaming-day/timezone.
     - Add CHECK/ENUM constraints guaranteeing only sanctioned event types and persist idempotency key requirements.
     - Introduce unique constraint `(visit_id, event_type, idempotency_key)` (nullable-safe) to guard against double posts.
     - Add indexes to `player_financial_transaction` (`visit_id`, `player_id`, `rating_slip_id`, `created_at DESC`).
     - Expose primary keys in views (forward `ratingslip.id` as `id`) for PostgREST/Supabase consumers.
     - Update grants, RLS policies, and contract tests before switching readers; enforce “Visit role cannot write PFT”.
     - Run pre-drop CI guard (code search + SQL lint) ensuring no new references rely on legacy columns outside the view.
   - **Phase 2 — Column Removal**
     - After consumers migrate (validated via logs/grep inventory), drop `cash_in`, `chips_brought`, `chips_taken` from `ratingslip`.
     - Maintain compatibility view for one release cycle; plan rollback path to rehydrate columns from `visit_financial_summary` if needed.
   - **If denormalization retained**:
     - Publish ADR-006 addendum detailing sync mechanism, reconciliation cadence, append-only enforcement, idempotency guardrails, and monitoring obligations.
3. **Visit ↔ PlayerFinancial Interface Documentation (Day 4)**
   - Update Visit and PlayerFinancial sections in the matrix with the read-only consumption contract.
   - Include SQL snippet for the aggregation views and list anti-patterns (Visit never writes ledger tables) with explicit event-type semantics, reversal handling, and gaming-day alignment guidance.
   - Record ownership responsibilities for maintaining the view (PlayerFinancial) vs consuming data (Visit).
4. **Security & Interface Hardening (Day 4)**
   - Re-affirm that `player_financial_transaction` RLS policies cover all consumer roles; add policy tests showing Visit role denied direct table access yet allowed through the views.
   - Alter views to run as security barriers where supported (`ALTER VIEW ... SET (security_barrier = true);`) and set `security_invoker` explicitly if required.
   - Grant read access explicitly: `GRANT SELECT ON ratingslip_with_financials, visit_financial_summary, visit_financial_summary_gd TO reporting_reader;` and revoke default privileges from unintended roles.
   - Validate GraphQL/PostgREST exposure; if auto-generation fails, plan RPC/REST contract fallback.
5. **Validation & Performance Harness (Day 5)**
   - Run `npm run validate:matrix-schema` (must exit 0).
   - Store canonical queries in `.validation/queries.sql`, capture matching `EXPLAIN (ANALYZE, BUFFERS)` output, and include pg_stat_statements deltas in the PR.
   - Execute the lightweight pgbench/k6 scenario (10–20 representative queries) to confirm thresholds: p95 ≤ 100 ms, mean ≤ 40 ms, plan avoids sequential scans over `player_financial_transaction` exceeding 1,000 rows.

### Deliverables
- `Financial Data Ownership Table` appended to `SERVICE_RESPONSIBILITY_MATRIX.md`.
- Updated Visit and PlayerFinancial matrix sections documenting the interface contract.
- ADR-006 confirmation (or addendum) merged alongside workflow updates.
- `.validation/queries.sql`, `EXPLAIN (ANALYZE, BUFFERS)` artifacts, pg_stat_statements deltas, and pgbench/k6 harness notes attached to the PR.
- `.validation/rls_visit_read_contract.sql` results and CI guard outputs proving no legacy `ratingslip` column consumers remain.
- Migration scripts `supabase/migrations/20251020120000_phase_b_financial_views_phase1.sql` (views/indexes/grants) and `supabase/migrations/20251020123000_phase_b_financial_views_phase2.sql` (column drops) with rollback notes.

### Exit & Success Criteria
- ✅ Every monetary field has one authoritative service and remediation action documented.
- ✅ RatingSlip two-phase transition executed or planned with migration scripts, guards, and rollback path.
- ✅ Visit ↔ PlayerFinancial interface section details responsibilities, event semantics, and gaming-day alignment.
- ✅ `npm run validate:matrix-schema` passes and security contract tests (no Visit writes to PFT) succeed.
- ✅ Compatibility views sustain p95 ≤ 100 ms, mean ≤ 40 ms, with no Seq Scan over `player_financial_transaction` > 1,000 rows.
- ✅ Architecture Lead and Database Lead approve the Phase B PR checklist with harness artifacts attached.

### Rollback
- Retain compatibility views so legacy queries continue working if column removal must be reversed.
- If fields were removed, rollback by re-adding nullable columns to `ratingslip` and backfilling from `visit_financial_summary`.
- Keep index changes reversible; drop unused indexes during rollback if they introduce regressions.

### Deprecation & Follow-Up
- Track consumers of `ratingslip_with_financials`; schedule deprecation once all migrate to direct joins.
- Produce a consumer inventory (usage logs or repo `rg` report) and attach it to the Phase B PR for visibility.
- Open Phase C preparation tasks (UUID migration readiness) after benchmarks and documentation land.

### Owners & Coordination
- **Owner**: Architecture Lead (matrix updates, ADR alignment, documentation).
- **Co-Owner**: Database Lead (migrations, views, performance benchmarks).
- **Support**: Finance domain SME (reconciliation review) and Observability team (benchmark tooling).
- **Communication**: Daily PR comment updates; final sign-off recorded via the Phase B checklist.

---

## Phase C: Type Integrity (7-10 days)

### Objective
Migrate `mtl_entry.patron_id` from TEXT to UUID with zero data loss using generated column approach.

**Philosophy**: Keep rigor here—identity/UUID changes are high-risk and deserve phased execution with hardened cutover gates.

### ADR-007: MTL Patron UUID Migration

**Addresses**: Issue #2
**Effort**: 7-10 days
**Owner**: Database Team + 1 Reviewer

**Strategy**: Generated column migration with enforced parity, automated cutover gates, and relational integrity enforcement.

**Key Decisions**:
- UUID is authoritative type (`patron_uuid` column)
- Generated TEXT column provides legacy compatibility (no dual-write coordination)
- Semantic type naming preserved (no rename to avoid type confusion)
- FK constraints and indexes established before writer migration
- Automated discrepancy monitoring via pg_cron scheduled queries
- Hard cutover gates prevent progression with outstanding issues

---

### Phase C.0: Validation Infrastructure Setup (1 day)

**Deliverables**: Alert tracking, automated validation, cutover gate functions

```sql
-- Alert tracking table
CREATE TABLE IF NOT EXISTS schema_validation_alerts (
  id bigserial PRIMARY KEY,
  check_name text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  message text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_validation_alerts_created
  ON schema_validation_alerts(created_at DESC);

CREATE INDEX idx_validation_alerts_check_name
  ON schema_validation_alerts(check_name, created_at DESC);

-- Hourly validation function
CREATE OR REPLACE FUNCTION validate_mtl_patron_backfill()
RETURNS void AS $$
DECLARE
  divergence_count int;
  null_count int;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM mtl_entry
  WHERE patron_uuid IS NULL AND patron_id IS NOT NULL;

  SELECT COUNT(*) INTO divergence_count
  FROM mtl_entry
  WHERE patron_id IS NOT NULL
    AND patron_uuid IS NOT NULL
    AND patron_id::uuid <> patron_uuid;

  IF null_count > 0 OR divergence_count > 0 THEN
    INSERT INTO schema_validation_alerts (
      check_name, severity, message, details
    ) VALUES (
      'mtl_patron_backfill',
      'critical',
      'Patron UUID backfill divergence detected',
      jsonb_build_object(
        'null_count', null_count,
        'divergence_count', divergence_count,
        'timestamp', NOW()
      )
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Schedule hourly validation
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'mtl-patron-backfill-validation',
  '0 * * * *',
  $$SELECT validate_mtl_patron_backfill()$$
);

-- Cutover gate function
CREATE OR REPLACE FUNCTION check_phase_c1_cutover_gate()
RETURNS TABLE(
  gate_name text,
  status text,
  failing_count bigint,
  can_proceed boolean
) AS $$
BEGIN
  RETURN QUERY
  WITH validation_results AS (
    SELECT 'divergence_check'::text AS gate, COUNT(*) AS failures
    FROM mtl_entry
    WHERE patron_id IS NOT NULL
      AND patron_uuid IS NOT NULL
      AND patron_id::uuid <> patron_uuid
    UNION ALL
    SELECT 'backfill_completeness'::text, COUNT(*)
    FROM mtl_entry
    WHERE patron_uuid IS NULL AND patron_id IS NOT NULL
    UNION ALL
    SELECT 'orphaned_references'::text, COUNT(*)
    FROM mtl_entry e
    LEFT JOIN player p ON e.patron_uuid = p.id
    WHERE e.patron_uuid IS NOT NULL AND p.id IS NULL
    UNION ALL
    SELECT 'alert_history'::text, COUNT(*)
    FROM schema_validation_alerts
    WHERE check_name = 'mtl_patron_backfill'
      AND severity = 'critical'
      AND created_at > NOW() - INTERVAL '48 hours'
  )
  SELECT
    gate AS gate_name,
    CASE WHEN failures = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
    failures AS failing_count,
    (failures = 0) AS can_proceed
  FROM validation_results
  UNION ALL
  SELECT
    'OVERALL_DECISION'::text,
    CASE WHEN MIN(can_proceed::int) = 1 THEN 'GO' ELSE 'NO-GO' END::text,
    SUM(failing_count),
    (MIN(can_proceed::int) = 1)
  FROM (SELECT * FROM validation_results) vr;
END;
$$ LANGUAGE plpgsql;
```

**Validation**:
```bash
npm run validate:phase-c0-setup
# Verifies alert table, functions, and pg_cron job created
```

---

### Phase C.1: Add UUID with Relational Integrity (3-4 days)

**Deliverables**: UUID column with FK constraint, indexes, enforced parity, zero divergence

**Pre-Migration Audit**:
```bash
# Document current schema state
npm run db:dump-schema > schema_before_phase_c1.sql

# Check for orphaned records BEFORE adding FK
psql -c "SELECT COUNT(*) FROM mtl_entry e
         LEFT JOIN player p ON e.patron_id::uuid = p.id
         WHERE p.id IS NULL;"
# Must be 0, or clean up orphans first

# Identify query patterns for index optimization
grep -r "FROM mtl_entry" services/ > mtl_query_patterns.txt
```

**Migration SQL**:
```sql
BEGIN;

-- Step 1: Add UUID column
ALTER TABLE mtl_entry ADD COLUMN patron_uuid UUID;

-- Step 2: Backfill from existing TEXT column
UPDATE mtl_entry SET patron_uuid = patron_id::uuid
WHERE patron_uuid IS NULL;

-- Step 3: Validate backfill
DO $$
DECLARE
  null_count int;
  orphan_count int;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM mtl_entry WHERE patron_uuid IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % NULL patron_uuid values', null_count;
  END IF;

  SELECT COUNT(*) INTO orphan_count
  FROM mtl_entry e
  LEFT JOIN player p ON e.patron_uuid = p.id
  WHERE p.id IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Orphaned records: % mtl_entry rows reference non-existent players', orphan_count;
  END IF;
END $$;

-- Step 4: Make NOT NULL
ALTER TABLE mtl_entry ALTER COLUMN patron_uuid SET NOT NULL;

-- Step 5: Add parity constraint (enforces patron_id::uuid = patron_uuid)
ALTER TABLE mtl_entry
  ADD CONSTRAINT mtl_patron_uuid_parity_chk
  CHECK (patron_uuid IS NULL OR patron_id::uuid = patron_uuid)
  NOT VALID;

-- Step 6: Validate constraint (proves no divergence)
ALTER TABLE mtl_entry VALIDATE CONSTRAINT mtl_patron_uuid_parity_chk;

-- Step 7: Add Foreign Key constraint
ALTER TABLE mtl_entry
  ADD CONSTRAINT fk_mtl_entry_patron
  FOREIGN KEY (patron_uuid) REFERENCES player(id)
  ON DELETE CASCADE;

-- Step 8: Create indexes (based on query pattern analysis)
CREATE INDEX idx_mtl_entry_patron_uuid
  ON mtl_entry(patron_uuid);

CREATE INDEX idx_mtl_entry_patron_created
  ON mtl_entry(patron_uuid, created_at DESC);

-- Step 9: Analyze for query planner
ANALYZE mtl_entry;

COMMIT;
```

**Hardened Cutover Criteria**:
```bash
# Automated gate (MUST return OVERALL_DECISION = GO)
npm run validate:phase-c1-cutover

# Expected output:
# gate_name                | status | failing_count | can_proceed
# -------------------------+--------+---------------+-------------
# divergence_check         | PASS   | 0             | t
# backfill_completeness    | PASS   | 0             | t
# orphaned_references      | PASS   | 0             | t
# alert_history            | PASS   | 0             | t
# OVERALL_DECISION         | GO     | 0             | t
```

**Manual Validation**:
```sql
-- Verify FK constraint exists
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'mtl_entry'::regclass
  AND contype = 'f'
  AND conname = 'fk_mtl_entry_patron';

-- Verify indexes created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'mtl_entry'
  AND indexname LIKE '%patron_uuid%';

-- Performance baseline
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM mtl_entry WHERE patron_uuid = '...'::uuid;
```

**Go/No-Go Gates**:
- ✅ 100% backfill: Zero NULL `patron_uuid` values
- ✅ Zero divergence: `patron_id::uuid = patron_uuid` for all rows
- ✅ Zero orphans: All `patron_uuid` values exist in `player.id`
- ✅ FK constraint validated successfully
- ✅ Parity constraint validated successfully
- ✅ Indexes created and analyzed
- ✅ **48-hour monitoring**: Zero critical alerts from `validate_mtl_patron_backfill()`
- ✅ **Automated gate**: `check_phase_c1_cutover_gate()` returns `OVERALL_DECISION = GO`

**Validation Window**: 48 hours of zero discrepancies before proceeding

---

### Phase C.2: Generated Column Cutover (3-4 days)

**Deliverables**: UUID as authoritative type, generated TEXT for legacy compatibility

#### Phase C.2.1: Migrate Application Writers (2-3 days)

**Before** (legacy code):
```typescript
await supabase.from('mtl_entry').insert({
  patron_id: playerId.toString(),  // ❌ Will break after cutover
  // ...
});
```

**After** (migrated code):
```typescript
await supabase.from('mtl_entry').insert({
  patron_uuid: playerId,  // ✅ UUID is authoritative
  // patron_id removed - will be auto-generated
  // ...
});
```

**Writer Migration Checklist**:
```bash
# Find all writers
grep -r "\.insert.*patron_id.*mtl_entry" services/ > mtl_writers.txt
grep -r "\.update.*patron_id.*mtl_entry" services/ >> mtl_writers.txt

# Update each to use patron_uuid
# Deploy with backwards compatibility (both columns exist)
```

**Cutover Validation** (automated):
```sql
-- Zero writes to old column in 48 hours
SELECT
  'legacy_writes' AS check_name,
  COUNT(*) AS recent_legacy_writes
FROM mtl_entry
WHERE updated_at > NOW() - INTERVAL '48 hours'
  AND patron_id::uuid <> patron_uuid;
-- MUST return 0

-- Zero legacy query patterns
SELECT
  'query_audit' AS check_name,
  COUNT(*) AS legacy_query_count
FROM pg_stat_statements
WHERE (query LIKE '%INSERT INTO mtl_entry%patron_id%'
   OR query LIKE '%UPDATE mtl_entry%SET%patron_id%')
AND last_call > NOW() - INTERVAL '48 hours';
-- MUST return 0
```

**Go/No-Go Gates**:
- ✅ All application writers migrated to `patron_uuid`
- ✅ Code search confirms zero `INSERT/UPDATE` with `patron_id` column
- ✅ **48-hour observation**: Zero divergence in scheduled validation
- ✅ Zero legacy write patterns in `pg_stat_statements`
- ✅ Database Lead approval for Phase C.2.2 cutover

---

#### Phase C.2.2: Swap to Generated Column (1 day)

**BREAKING CHANGE**: After this step, writing to `patron_id` will fail.

**Migration SQL**:
```sql
BEGIN;

-- Document constraints that will be dropped
DO $$
DECLARE
  constraint_rec RECORD;
BEGIN
  RAISE NOTICE 'Constraints to be dropped with patron_id:';
  FOR constraint_rec IN
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'mtl_entry'::regclass
      AND pg_get_constraintdef(oid) LIKE '%patron_id%'
  LOOP
    RAISE NOTICE '  - %: %', constraint_rec.conname, constraint_rec.def;
  END LOOP;
END $$;

-- Step 1: Drop old TEXT column (CASCADE removes parity constraint)
ALTER TABLE mtl_entry DROP COLUMN patron_id CASCADE;

-- Step 2: Add generated TEXT column for legacy readers
ALTER TABLE mtl_entry
  ADD COLUMN patron_id text
  GENERATED ALWAYS AS (patron_uuid::text) STORED;

-- Step 3: Validate generated column
DO $$
DECLARE
  test_rec RECORD;
BEGIN
  SELECT patron_uuid, patron_id INTO test_rec
  FROM mtl_entry LIMIT 1;

  IF test_rec.patron_id != test_rec.patron_uuid::text THEN
    RAISE EXCEPTION 'Generated column mismatch: uuid=%, text=%',
      test_rec.patron_uuid, test_rec.patron_id;
  END IF;
END $$;

-- Step 4: Analyze
ANALYZE mtl_entry;

COMMIT;
```

**Post-Cutover Validation**:
```sql
-- Verify column structure
SELECT column_name, data_type, is_nullable, is_generated
FROM information_schema.columns
WHERE table_name = 'mtl_entry'
  AND column_name LIKE '%patron%';

-- Expected output:
-- column_name  | data_type | is_nullable | is_generated
-- -------------+-----------+-------------+--------------
-- patron_uuid  | uuid      | NO          | NEVER
-- patron_id    | text      | YES         | ALWAYS

-- Verify generated column immutability
UPDATE mtl_entry SET patron_id = 'test' WHERE id = 1;
-- Should fail: ERROR: column "patron_id" can only be updated to DEFAULT

-- Verify reads work
SELECT patron_uuid, patron_id FROM mtl_entry LIMIT 10;
-- patron_id should show TEXT representation of patron_uuid
```

**Go/No-Go Gates**:
- ✅ Old `patron_id` TEXT column dropped
- ✅ New `patron_id` generated column functional
- ✅ Generated column produces correct TEXT values
- ✅ SELECT queries return expected results
- ✅ INSERT/UPDATE to `patron_id` correctly fails
- ✅ Zero production errors in 48-hour observation window
- ✅ `npm run db:types` succeeds

---

### Rollback Strategy

**Phase C.1 Rollback** (Simple):
```sql
-- Drop UUID column and all constraints
ALTER TABLE mtl_entry DROP COLUMN patron_uuid CASCADE;
DROP INDEX IF EXISTS idx_mtl_entry_patron_uuid;
DROP INDEX IF EXISTS idx_mtl_entry_patron_created;
```

**Phase C.2.1 Rollback** (Application Only):
- Application writers roll back to using `patron_id` (TEXT)
- No database changes needed (both columns still exist)

**Phase C.2.2 Rollback** (Requires Backfill):
```sql
-- Drop generated column
ALTER TABLE mtl_entry DROP COLUMN patron_id;

-- Re-add as normal TEXT column
ALTER TABLE mtl_entry ADD COLUMN patron_id text;

-- Backfill from UUID
UPDATE mtl_entry SET patron_id = patron_uuid::text;

-- Make NOT NULL
ALTER TABLE mtl_entry ALTER COLUMN patron_id SET NOT NULL;

-- Application writers roll back to patron_id
```

**Rollback window**: 2-4 hours (backfill is fast)

---

### ADR-007 Document (Updated)

```markdown
# ADR-007: MTL Patron ID UUID Migration

## Status
Approved (Database Lead + Architecture Lead)

## Decision
Migrate `mtl_entry.patron_id` from TEXT to UUID using generated column approach with `patron_uuid` as canonical column name.

## Rationale
Current TEXT type requires `player.id::text` casts, violating UUID identity contract and preventing foreign key enforcement.

Generated column approach chosen over dual-write for:
- Impossible divergence (database-enforced consistency)
- No application coordination overhead during transition
- Clear forcing function for writer migration
- Legacy compatibility without maintenance burden

## Implementation
**3-phase migration**:
1. **Phase C.1**: Add `patron_uuid` UUID with FK/indexes + parity constraint (3-4 days)
2. **Phase C.2.1**: Migrate application writers to `patron_uuid` (2-3 days)
3. **Phase C.2.2**: Swap to generated TEXT column for legacy readers (1 day)

**Validation gates**: Automated cutover functions with 48-hour monitoring windows

**Semantic naming**: `patron_uuid` preserved (no rename to avoid type confusion)

## Relational Integrity
- FK constraint: `patron_uuid REFERENCES player(id) ON DELETE CASCADE`
- Indexes: `(patron_uuid)`, `(patron_uuid, created_at DESC)`
- Parity enforcement: CHECK constraint during Phase C.1
- Automated monitoring: pg_cron hourly validation

## Rollback
Each phase reversible:
- **Phase C.1**: Drop UUID column and constraints
- **Phase C.2.1**: Application rollback only (no DB changes)
- **Phase C.2.2**: Backfill TEXT from UUID (2-4 hours)

## Consequences
**Breaking changes**:
- Application writers MUST use `patron_uuid` after Phase C.2.2
- SELECT queries should migrate to `patron_uuid` for clarity (optional)
- Generated types show `patron_uuid: string` (UUID)

**Benefits**:
- Type safety: UUID enforced at database level
- Performance: UUID more efficient than TEXT for joins/comparisons
- Referential integrity: FK prevents orphaned records
- Future clarity: Column name signals UUID type

**Timeline**: 7-10 days (vs 12-14 days for dual-write approach)
```

---

### Phase C Success Criteria

**Infrastructure (Phase C.0)**:
- ✅ Alert tracking table created
- ✅ Validation functions deployed
- ✅ pg_cron scheduled job active
- ✅ Cutover gate function operational

**Migration (Phase C.1)**:
- ✅ 100% backfill validated (zero NULL `patron_uuid`)
- ✅ Zero divergence (parity constraint validated)
- ✅ Zero orphaned references
- ✅ FK constraint active: `fk_mtl_entry_patron`
- ✅ Indexes created and analyzed
- ✅ 48-hour monitoring: Zero critical alerts

**Writer Migration (Phase C.2.1)**:
- ✅ All writers migrated to `patron_uuid`
- ✅ Zero legacy write patterns (48-hour window)
- ✅ Zero divergence in monitoring queries

**Cutover (Phase C.2.2)**:
- ✅ Generated column functional
- ✅ Legacy TEXT column dropped
- ✅ `patron_uuid` remains canonical (no rename)
- ✅ Zero production errors (48-hour window)
- ✅ `npm run db:types` succeeds

**Overall**:
- ✅ ADR-007 approved by Database lead + Architecture lead
- ✅ All automated cutover gates PASS
- ✅ Zero data loss or corruption
- ✅ `mtl_entry.patron_uuid` is UUID type, NOT NULL, with FK
- ✅ `mtl_entry.patron_id` is generated TEXT (legacy compatibility)
- ✅ Rollback tested at Phase C.1 gate

**Approval**: Database lead + Architecture lead (no multi-stakeholder ARB)

**Timeline**: 7-10 days (60% faster than dual-write approach)

---


## Validation Framework (Simplified)

### Pre-Phase Checklist
Before starting any phase:
1. ✅ `npm run db:types` passes (schema current)
2. ✅ Previous phase PR merged (if applicable)

### Per-Phase Validation
Each phase PR must pass:
1. ✅ `npm run validate:matrix-schema` (zero conflicts, zero orphans)
2. ✅ PR checklist completed (see each phase's success criteria)
3. ✅ One owner + one reviewer approval

### Final Validation (Post-Phase C)
1. ✅ All 8 audit issues resolved (verify in matrix)
2. ✅ Update matrix version: v2.3.0 → v2.4.0
3. ✅ Optional: Publish compliance summary (not required)

---

## Tooling Requirements (Minimal)

### Single Validation Script

**File**: `scripts/validate_matrix_schema.ts`
**Purpose**: Thin checker for essential validations only
**Expand**: Only if new gaps emerge

```typescript
// scripts/validate_matrix_schema.ts
import { Database } from '../types/database.types';
import fs from 'fs';

interface ValidationResult {
  orphanedReferences: string[];  // Matrix → non-existent tables
  duplicateOwnership: string[];  // Same table claimed by >1 service
  success: boolean;
}

export function validateMatrixSchema(): ValidationResult {
  // 1. Extract tables from types/database.types.ts
  // 2. Parse SERVICE_RESPONSIBILITY_MATRIX.md for ownership claims
  // 3. Fail on duplicates or orphans
  // Exit code 0 if pass, 1 if fail
}
```

**Usage**:
```bash
npm run validate:matrix-schema

# Output on pass:
# ✅ 52 tables validated
# ✅ Zero duplicate ownership
# ✅ Zero orphaned references

# Output on fail:
# ❌ Duplicate ownership: casino_settings (Casino line 126, MTL line 438)
# ❌ Orphaned reference: legacy_table (not in schema)
```

**Add to package.json**:
```json
{
  "scripts": {
    "validate:matrix-schema": "tsx scripts/validate_matrix_schema.ts"
  }
}
```

---

## Governance (Simplified)

### Approval Structure

**One Owner + One Reviewer** per phase (no ARB/multi-gate)

| Phase | Owner | Reviewer | Approval Required |
|-------|-------|----------|-------------------|
| Phase A | Architecture Lead | Documentation Lead | PR approval |
| Phase B | Architecture Lead | Database Lead | PR approval |
| Phase C | Database Lead | Architecture Lead | PR approval per migration phase |

### Escalation (Rare Cases Only)
- **Ownership Disputes**: Architecture Lead decides (no ARB committee)
- **Migration Blockers**: Database Lead + Architecture Lead decide hold/pivot
- **Technical Issues**: Solve in PR comments, escalate to leads if needed

### Communication (Lightweight)
- **Pre-Phase**: Open PR with phase checklist
- **During Phase**: Updates in PR comments
- **Post-Phase**: Merge PR (approval = sign-off, no separate report)

---

## Risk Management (Focused)

### Where Rigor Matters

#### Phase C: UUID Migration (High-Risk)
- **Risk**: Data loss, breaking changes
- **Mitigation**: 4-phase rollout with 2-3 day validation windows
- **Rollback**: Each phase reversible, TEXT column retained until final validation

#### Phase B: Financial Boundaries (Medium-Risk)
- **Risk**: Breaking existing queries/reports
- **Mitigation**: Compatibility view (not materialized by default), performance benchmarks
- **Rollback**: View preserves schema compatibility indefinitely

### Where It's Light

#### Phase A: Documentation (Low-Risk)
- **Risk**: Minimal (doc-only changes)
- **Mitigation**: Code audit for ownership conflicts before matrix update
- **Rollback**: Git revert (instant)

---

## Success Metrics (Simplified)

### Must-Pass Criteria

| Phase | Success Indicator | Validation |
|-------|------------------|------------|
| Phase A | Zero duplicate ownership, zero orphans | `npm run validate:matrix-schema` |
| Phase B | <100ms p95 for views, all queries functional | Performance benchmarks |
| Phase C | Zero divergence, 100% backfill, automated cutover gates PASS | `check_phase_c1_cutover_gate()` |

### Acceptance

A phase is complete when:
- ✅ Validation script passes
- ✅ PR checklist complete
- ✅ One owner + one reviewer approved PR

---

## Timeline & Resource Allocation (Lean)

### Phase A: Decide & Document (1 week)
| Tasks | Effort | Team |
|-------|--------|------|
| Schema appendix, ownership, temporal, performance, checklist | 32 hours | Arch Lead + 1 person |

**Calendar**: 5 business days | **Output**: Single PR to matrix

---

### Phase B: Boundaries (1 week)
| Tasks | Effort | Team |
|-------|--------|------|
| Financial ownership table, RatingSlip decision, Visit interface | 40 hours | Arch + DB Team |

**Calendar**: 5 business days | **Output**: Matrix updates + ADR-006 (if removal)

---

### Phase C: Type Integrity (7-10 days)
| Tasks | Effort | Team |
|-------|--------|------|
| UUID migration (3 phases: infrastructure, backfill+FK, generated column) | 56 hours | DB Team + Dev |

**Calendar**: 7-10 business days | **Output**: UUID schema + automated validation + semantic naming

---

### Overall Timeline Summary

| Phase | Calendar Days | Person-Weeks |
|-------|---------------|--------------|
| Phase A | 5 | 0.8 |
| Phase B | 5 | 1.0 |
| Phase C | 7-10 | 1.4 |
| **Total** | **17-20 days (3-4 weeks)** | **3.2 weeks** |

**Efficiency Gain**: 65% reduction from original 7-10 week plan

**Target Completion**: Early-Mid November 2025 (assuming start late October)

---

## Appendix: PR Checklist Template

Copy this checklist into each phase's PR description:

### Phase A PR Checklist
```markdown
- [ ] Schema appendix maps all 50+ tables to services
- [ ] Zero duplicate ownership (`npm run validate:matrix-schema` passes)
- [ ] Zero orphaned references (matrix → non-existent tables)
- [ ] Temporal authority documented (Casino owns, MTL consumes)
- [ ] Performance context section added
- [ ] Remediation checklist updated (Phase A/B/C status)
- [ ] One owner + one reviewer approval
```

### Phase B PR Checklist
```markdown
- [ ] Financial Ownership Table complete (every monetary field → one service)
- [ ] RatingSlip decision documented (removal OR denormalization with justification)
- [ ] Compatibility view provided if removal chosen
- [ ] Visit interface pattern documented (plain view by default)
- [ ] Performance benchmarked (<100ms p95 for views)
- [ ] `npm run validate:matrix-schema` passes
- [ ] One owner + one reviewer approval
```

### Phase C PR Checklist (Per Migration Phase)
```markdown
**Phase C.0: Validation Infrastructure**
- [ ] schema_validation_alerts table created
- [ ] validate_mtl_patron_backfill() function deployed
- [ ] check_phase_c1_cutover_gate() function deployed
- [ ] pg_cron scheduled job active (hourly validation)
- [ ] npm run validate:phase-c0-setup passes

**Phase C.1: Add UUID with Relational Integrity**
- [ ] patron_uuid column added to mtl_entry
- [ ] 100% backfill success (zero NULL patron_uuid)
- [ ] Zero divergence: patron_id::uuid = patron_uuid for all rows
- [ ] Zero orphaned references to non-existent players
- [ ] Parity constraint added and validated
- [ ] FK constraint active: fk_mtl_entry_patron
- [ ] Indexes created: idx_mtl_entry_patron_uuid, idx_mtl_entry_patron_created
- [ ] 48-hour monitoring: Zero critical alerts
- [ ] Automated gate PASS: check_phase_c1_cutover_gate() returns OVERALL_DECISION = GO
- [ ] npm run validate:phase-c1-cutover passes

**Phase C.2.1: Migrate Application Writers**
- [ ] All INSERT/UPDATE statements migrated to patron_uuid
- [ ] Code search confirms zero patron_id writes
- [ ] Zero legacy write patterns in pg_stat_statements (48-hour window)
- [ ] Zero divergence in scheduled validation (48-hour window)
- [ ] Database Lead approval for Phase C.2.2 cutover

**Phase C.2.2: Generated Column Cutover**
- [ ] Old patron_id TEXT column dropped
- [ ] New patron_id generated column functional (GENERATED ALWAYS AS patron_uuid::text)
- [ ] Generated column produces correct TEXT values
- [ ] INSERT/UPDATE to patron_id correctly fails
- [ ] SELECT queries return expected results
- [ ] patron_uuid remains canonical (no rename performed)
- [ ] Zero production errors (48-hour observation)
- [ ] npm run db:types succeeds
- [ ] Final approval: Database lead + Architecture lead
```

---

## Document Control

**Version**: 2.1.0 (Hardened Phase C Edition)
**Author**: Architecture Team
**Based On**: [RESPONSIBILIY_MATRIX_AUDIT.md](./RESPONSIBILIY_MATRIX_AUDIT.md) + [overengineering.md](./overengineering.md)
**Approval**: Architecture Lead + Database Lead

**Changelog**:
- 2025-10-20: v1.0.0 - Initial 4-wave workflow (7-10 weeks)
- 2025-10-20: v2.0.0 - Lean 3-phase workflow (4-5 weeks)
  - Consolidated 4 waves into 3 phases
  - Removed multi-gate approval (now: 1 owner + 1 reviewer)
  - Simplified tooling (3 scripts → 1 validator)
  - Plain views by default (defer materialization)
  - PR-based sign-off (no separate reports)
  - 50% timeline reduction
- 2025-10-20: v2.1.0 - Hardened Phase C (3-4 weeks total)
  - Phase C: Generated column approach (7-10 days vs 2-3 weeks)
  - Added validation infrastructure (pg_cron, alert tracking, cutover gates)
  - Enforced parity constraint during backfill
  - FK constraints and indexes before writer migration
  - Automated discrepancy monitoring with 48-hour validation windows
  - Semantic type naming preserved (patron_uuid, no rename)
  - Hardened cutover criteria with check_phase_c1_cutover_gate()
  - 65% total timeline reduction from original plan

---

## References

1. [SERVICE_RESPONSIBILITY_MATRIX.md](./SERVICE_RESPONSIBILITY_MATRIX.md) - Source document
2. [RESPONSIBILIY_MATRIX_AUDIT.md](./RESPONSIBILIY_MATRIX_AUDIT.md) - 8 issues identified
3. [overengineering.md](./overengineering.md) - Lean approach guidance
4. [types/database.types.ts](../../types/database.types.ts) - Canonical schema

**Questions**: Contact Architecture Lead or Database Lead
