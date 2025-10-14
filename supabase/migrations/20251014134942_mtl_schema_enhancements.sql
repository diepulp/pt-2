-- =====================================================
-- MTL Schema Enhancements Migration
-- Purpose: Add cross-domain correlation and audit trail
-- =====================================================
-- Context: Align MTL schema with MTL_DOMAIN_CLASSIFICATION.md
-- Dependencies:
--   - 20250828011313_init_corrected.sql (mtl_entry base table)
--   - 20251012185626_phase_6_wave_0_bounded_context_corrections.sql (ratingslip, visit, loyalty)
-- Quality Gates:
--   - Migration applies cleanly
--   - FK constraints validate correctly
--   - Indexes created for correlation lookups
--   - Audit note table enforces immutability
--   - Contextual enrichment view performs efficiently
-- =====================================================

BEGIN;

-- =====================================================
-- STEP 1: Add Cross-Domain Correlation Columns
-- =====================================================
-- Purpose: Enable read-only contextual enrichment per MTL_DOMAIN_CLASSIFICATION.md
-- Section 2: Relationships to Other Domains

ALTER TABLE mtl_entry
  ADD COLUMN IF NOT EXISTS rating_slip_id UUID REFERENCES ratingslip(id),
  ADD COLUMN IF NOT EXISTS visit_id UUID REFERENCES visit(id),
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Add documentation comments
COMMENT ON COLUMN mtl_entry.rating_slip_id IS 'Reference to rating slip session for behavioral reconstruction';
COMMENT ON COLUMN mtl_entry.visit_id IS 'Reference to patron visit for session context';
COMMENT ON COLUMN mtl_entry.correlation_id IS 'Request-scoped correlation ID for distributed tracing (aligned with loyalty_ledger)';
COMMENT ON COLUMN mtl_entry.idempotency_key IS 'Unique key for duplicate transaction prevention';

-- =====================================================
-- STEP 2: Create Performance Indexes
-- =====================================================

-- Index for rating slip correlation (session-based queries)
CREATE INDEX IF NOT EXISTS idx_mtl_entry_rating_slip_id
  ON mtl_entry(rating_slip_id)
  WHERE rating_slip_id IS NOT NULL;

-- Index for visit correlation (visit-based queries)
CREATE INDEX IF NOT EXISTS idx_mtl_entry_visit_id
  ON mtl_entry(visit_id)
  WHERE visit_id IS NOT NULL;

-- Index for correlation-based lookups (distributed tracing)
CREATE INDEX IF NOT EXISTS idx_mtl_entry_correlation_id
  ON mtl_entry(correlation_id)
  WHERE correlation_id IS NOT NULL;

-- Index for idempotency checks (duplicate prevention)
CREATE INDEX IF NOT EXISTS idx_mtl_entry_idempotency_key
  ON mtl_entry(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- =====================================================
-- STEP 3: Create Audit Note Table (Immutable Audit Trail)
-- =====================================================
-- Purpose: Enforce append-only audit notes per MTL_DOMAIN_CLASSIFICATION.md
-- Section 7: Data Lifecycle & Retention - "Mutable fields: Only notes via addAuditNote()"

CREATE TABLE IF NOT EXISTS mtl_audit_note (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mtl_entry_id BIGINT NOT NULL REFERENCES mtl_entry(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES "Staff"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT mtl_audit_note_not_empty CHECK (length(trim(note)) > 0)
);

-- Index for efficient note retrieval by entry
CREATE INDEX IF NOT EXISTS idx_mtl_audit_note_entry_id
  ON mtl_audit_note(mtl_entry_id, created_at DESC);

-- Index for staff audit trail
CREATE INDEX IF NOT EXISTS idx_mtl_audit_note_staff
  ON mtl_audit_note(created_by, created_at DESC);

COMMENT ON TABLE mtl_audit_note IS 'Immutable append-only audit notes for MTL entries';

-- Enable RLS on audit note table
ALTER TABLE mtl_audit_note ENABLE ROW LEVEL SECURITY;

-- Only AUDITOR and SUPERVISOR roles can read audit notes
CREATE POLICY "mtl_audit_note_read_policy" ON mtl_audit_note
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Staff" s
      WHERE s.id = auth.uid()
      AND s.role IN ('AUDITOR'::"StaffRole", 'SUPERVISOR'::"StaffRole")
    )
  );

-- Any authenticated staff can insert audit notes
CREATE POLICY "mtl_audit_note_insert_policy" ON mtl_audit_note
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Staff" s
      WHERE s.id = auth.uid()
    )
    AND created_by = auth.uid()
  );

-- =====================================================
-- STEP 4: Create Contextual Enrichment View
-- =====================================================
-- Purpose: Read-only contextual enrichment for compliance analysis
-- Per MTL_DOMAIN_CLASSIFICATION.md Section 2e: Loyalty Service integration

CREATE OR REPLACE VIEW mtl_compliance_context AS
SELECT
  -- Core MTL entry data
  m.id,
  m.casino_id,
  m.patron_id,
  m.person_name,
  m.person_last_name,
  m.person_description,
  m.direction,
  m.area,
  m.tender_type,
  m.amount,
  m.table_number,
  m.location_note,
  m.event_time,
  m.gaming_day,
  m.recorded_by_employee_id,
  m.recorded_by_signature,
  m.notes,
  m.created_at,
  m.updated_at,
  m.correlation_id,
  m.idempotency_key,

  -- Session context (from RatingSlip)
  m.rating_slip_id,
  r.average_bet as session_avg_bet,
  r.accumulated_seconds as session_duration_seconds,
  r.status as session_status,

  -- Visit context
  m.visit_id,
  v.check_in_date as visit_check_in,
  v.check_out_date as visit_check_out,

  -- Player identification (resolved)
  p.id as player_uuid,
  p."firstName" as player_first_name,
  p."lastName" as player_last_name,

  -- Loyalty context (for compliance correlation)
  l.id as loyalty_ledger_id,
  l.points_change,
  l.transaction_type as loyalty_transaction_type,
  l.staff_id as loyalty_staff_id,
  l.reason as loyalty_reason,
  l.source as loyalty_source,
  l.balance_before as loyalty_balance_before,
  l.balance_after as loyalty_balance_after,
  l.tier_before as loyalty_tier_before,
  l.tier_after as loyalty_tier_after,

  -- Staff context (who recorded the transaction)
  s."firstName" as staff_first_name,
  s."lastName" as staff_last_name,
  s.role as staff_role,

  -- Threshold context (from existing view)
  tm.threshold_status,
  tm.proximity_status,
  tm.watchlist_percentage,
  tm.ctr_percentage

FROM mtl_entry m

-- Join with rating slip (session context)
LEFT JOIN ratingslip r ON m.rating_slip_id = r.id

-- Join with visit (visit context)
LEFT JOIN visit v ON m.visit_id = v.id

-- Join with player (identity resolution)
LEFT JOIN player p ON m.patron_id = p.id::text

-- Join with loyalty ledger (contextual enrichment for compliance)
-- Note: Multiple loyalty entries may exist per rating_slip, join to most recent
LEFT JOIN LATERAL (
  SELECT *
  FROM loyalty_ledger ll
  WHERE ll.rating_slip_id = m.rating_slip_id
  ORDER BY ll.created_at DESC
  LIMIT 1
) l ON true

-- Join with staff (accountability)
LEFT JOIN "Staff" s ON m.recorded_by_employee_id = s.id

-- Join with threshold monitor (compliance status)
LEFT JOIN mtl_threshold_monitor tm ON
  tm.casino_id = m.casino_id
  AND tm.gaming_day = m.gaming_day
  AND (
    (tm.patron_id = m.patron_id AND m.patron_id IS NOT NULL)
    OR (tm.person_name = m.person_name AND tm.person_last_name = m.person_last_name)
  );

COMMENT ON VIEW mtl_compliance_context IS 'Read-only contextual enrichment view for MTL compliance analysis - joins with RatingSlip, Visit, Player, Loyalty, and Staff domains';

-- =====================================================
-- STEP 5: Create Helper View for Audit Notes
-- =====================================================

CREATE OR REPLACE VIEW mtl_entry_with_notes AS
SELECT
  m.*,
  COALESCE(
    json_agg(
      json_build_object(
        'id', n.id,
        'note', n.note,
        'created_by', n.created_by,
        'created_at', n.created_at,
        'staff_name', s."firstName" || ' ' || s."lastName"
      )
      ORDER BY n.created_at ASC
    ) FILTER (WHERE n.id IS NOT NULL),
    '[]'::json
  ) as audit_notes
FROM mtl_entry m
LEFT JOIN mtl_audit_note n ON m.id = n.mtl_entry_id
LEFT JOIN "Staff" s ON n.created_by = s.id
GROUP BY m.id;

COMMENT ON VIEW mtl_entry_with_notes IS 'MTL entries with aggregated audit notes for efficient querying';

-- =====================================================
-- STEP 6: Add Unique Constraint for Idempotency
-- =====================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_mtl_entry_idempotency_unique
  ON mtl_entry(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON INDEX idx_mtl_entry_idempotency_unique IS 'Enforce idempotency - prevent duplicate MTL transactions with same idempotency key';

-- =====================================================
-- STEP 7: Update Existing RLS Policies (if needed)
-- =====================================================
-- Note: RLS policies already exist from 20251002040000_compliance_table_stubs.sql
-- No changes needed - existing policies cover new columns

COMMIT;

-- =====================================================
-- Quality Gates Verification
-- =====================================================
-- Run these queries after migration to verify:
--
-- 1. Check columns exist:
--    SELECT column_name, data_type, is_nullable
--    FROM information_schema.columns
--    WHERE table_name = 'mtl_entry'
--    AND column_name IN ('rating_slip_id', 'visit_id', 'correlation_id', 'idempotency_key');
--
-- 2. Check indexes exist:
--    SELECT indexname FROM pg_indexes
--    WHERE tablename = 'mtl_entry'
--    AND indexname LIKE 'idx_mtl_entry_%';
--
-- 3. Check views exist:
--    SELECT viewname FROM pg_views
--    WHERE viewname IN ('mtl_compliance_context', 'mtl_entry_with_notes');
--
-- 4. Check RLS policies:
--    SELECT policyname, tablename FROM pg_policies
--    WHERE tablename IN ('mtl_entry', 'mtl_audit_note');
--
-- =====================================================
