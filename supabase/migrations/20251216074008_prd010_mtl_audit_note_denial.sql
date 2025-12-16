-- =====================================================
-- Migration: PRD-010 MTL Audit Note Denial Policies
-- Created: 2025-12-16 07:40:08
-- Purpose: Add explicit denial policies for UPDATE and DELETE
--          operations on mtl_audit_note (append-only ledger)
-- References: PRD-010, SEC-001 Template 3, ADR-020
-- =====================================================

BEGIN;

-- =====================================================
-- Context: mtl_audit_note is an append-only compliance ledger
-- Current state: Has SELECT and INSERT policies (from 20251211153228)
-- Required: Add explicit UPDATE and DELETE denial per SEC-001 Template 3
-- =====================================================

-- Explicit denial for updates (append-only ledger)
-- Per SEC-001 Template 3: Compliance ledgers must explicitly deny modifications
-- Note: auth.uid() check for ADR-015 compliance; false always denies anyway
CREATE POLICY mtl_audit_note_no_updates ON mtl_audit_note
  FOR UPDATE USING (auth.uid() IS NOT NULL AND false);

-- Explicit denial for deletes (append-only ledger)
-- Per SEC-001 Template 3: Compliance ledgers must explicitly deny deletions
-- Note: auth.uid() check for ADR-015 compliance; false always denies anyway
CREATE POLICY mtl_audit_note_no_deletes ON mtl_audit_note
  FOR DELETE USING (auth.uid() IS NOT NULL AND false);

-- =====================================================
-- Verification Note:
-- - mtl_audit_note already has RLS enabled (20251211153228)
-- - Existing SELECT policy: mtl_audit_note_select (casino-scoped via mtl_entry join)
-- - Existing INSERT policy: mtl_audit_note_insert (casino-scoped via mtl_entry join)
-- - New UPDATE policy: mtl_audit_note_no_updates (denies all)
-- - New DELETE policy: mtl_audit_note_no_deletes (denies all)
-- =====================================================

COMMIT;
