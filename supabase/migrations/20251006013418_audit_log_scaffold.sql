-- Migration 3: Audit Log Scaffold
-- Phase 1: Security Skeleton - Audit Infrastructure (Stub)

-- NOTE: AuditLog table already exists in schema
-- Existing columns: id, userId, action, entity, entityId, timestamp, details
-- This migration extends RLS and adds helper functions

-- Enable RLS on existing AuditLog table
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

-- Auditor-only read policy
CREATE POLICY "auditor_read_policy" ON "AuditLog"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Staff" s
      WHERE s.id = auth.uid()
      AND s.role = 'AUDITOR'::"StaffRole"
    )
  );

-- System write policy (authenticated staff can append)
CREATE POLICY "system_write_policy" ON "AuditLog"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Staff" s
      WHERE s.id = auth.uid()
    )
  );

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_auditlog_timestamp ON "AuditLog"(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_auditlog_userid ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS idx_auditlog_action ON "AuditLog"(action);

-- Empty trigger function scaffold (to be wired per domain in Phase 2)
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Phase 1 stub: does nothing
  -- Phase 2+: Will log specific domain actions (player edits, rating changes, etc.)
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION audit_trigger() IS 'Phase 1 stub: No-op. Will be wired to tables in Phase 2.';
