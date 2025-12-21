-- =====================================================
-- Migration: Add Foreign Key Indexes for Performance
-- Created: 2025-12-20 16:11:47
-- Purpose: Add indexes to all foreign key columns to improve
--          join performance and prevent full table scans
-- Note: Removed CONCURRENTLY for Supabase migration compatibility
--       (migrations run in transactions, CONCURRENTLY cannot)
-- =====================================================

-- audit_log table indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON public.audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_casino_id ON public.audit_log (casino_id);

-- casino table indexes
CREATE INDEX IF NOT EXISTS idx_casino_company_id ON public.casino (company_id);

-- dealer_rotation table indexes
CREATE INDEX IF NOT EXISTS idx_dealer_rotation_casino_id ON public.dealer_rotation (casino_id);
CREATE INDEX IF NOT EXISTS idx_dealer_rotation_staff_id ON public.dealer_rotation (staff_id);

-- finance_outbox table indexes
CREATE INDEX IF NOT EXISTS idx_finance_outbox_ledger_id ON public.finance_outbox (ledger_id);

-- floor_layout table indexes
CREATE INDEX IF NOT EXISTS idx_floor_layout_approved_by ON public.floor_layout (approved_by);
CREATE INDEX IF NOT EXISTS idx_floor_layout_created_by ON public.floor_layout (created_by);
CREATE INDEX IF NOT EXISTS idx_floor_layout_reviewed_by ON public.floor_layout (reviewed_by);

-- floor_layout_activation table indexes
CREATE INDEX IF NOT EXISTS idx_floor_layout_activation_activated_by ON public.floor_layout_activation (activated_by);
CREATE INDEX IF NOT EXISTS idx_floor_layout_activation_layout_version_id ON public.floor_layout_activation (layout_version_id);

-- floor_layout_version table indexes
CREATE INDEX IF NOT EXISTS idx_floor_layout_version_created_by ON public.floor_layout_version (created_by);

-- floor_table_slot table indexes
CREATE INDEX IF NOT EXISTS idx_floor_table_slot_pit_id ON public.floor_table_slot (pit_id);
CREATE INDEX IF NOT EXISTS idx_floor_table_slot_preferred_table_id ON public.floor_table_slot (preferred_table_id);

-- gaming_table table indexes
CREATE INDEX IF NOT EXISTS idx_gaming_table_casino_id ON public.gaming_table (casino_id);

-- gaming_table_settings table indexes
CREATE INDEX IF NOT EXISTS idx_gaming_table_settings_casino_id ON public.gaming_table_settings (casino_id);
CREATE INDEX IF NOT EXISTS idx_gaming_table_settings_table_id ON public.gaming_table_settings (table_id);

-- loyalty_ledger table indexes
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_staff_id ON public.loyalty_ledger (staff_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_visit_id ON public.loyalty_ledger (visit_id);

-- mtl_audit_note table indexes
CREATE INDEX IF NOT EXISTS idx_mtl_audit_note_mtl_entry_id ON public.mtl_audit_note (mtl_entry_id);
CREATE INDEX IF NOT EXISTS idx_mtl_audit_note_staff_id ON public.mtl_audit_note (staff_id);

-- mtl_entry table indexes
CREATE INDEX IF NOT EXISTS idx_mtl_entry_patron_uuid ON public.mtl_entry (patron_uuid);
CREATE INDEX IF NOT EXISTS idx_mtl_entry_rating_slip_id ON public.mtl_entry (rating_slip_id);
CREATE INDEX IF NOT EXISTS idx_mtl_entry_staff_id ON public.mtl_entry (staff_id);
CREATE INDEX IF NOT EXISTS idx_mtl_entry_visit_id ON public.mtl_entry (visit_id);

-- player_financial_transaction table indexes
CREATE INDEX IF NOT EXISTS idx_player_financial_transaction_rating_slip_id ON public.player_financial_transaction (rating_slip_id);
CREATE INDEX IF NOT EXISTS idx_player_financial_transaction_visit_id ON public.player_financial_transaction (visit_id);

-- player_loyalty table indexes
CREATE INDEX IF NOT EXISTS idx_player_loyalty_casino_id ON public.player_loyalty (casino_id);

-- rating_slip table indexes
CREATE INDEX IF NOT EXISTS idx_rating_slip_casino_id ON public.rating_slip (casino_id);

-- rating_slip_pause table indexes
CREATE INDEX IF NOT EXISTS idx_rating_slip_pause_casino_id ON public.rating_slip_pause (casino_id);
CREATE INDEX IF NOT EXISTS idx_rating_slip_pause_created_by ON public.rating_slip_pause (created_by);

-- report table indexes
CREATE INDEX IF NOT EXISTS idx_report_casino_id ON public.report (casino_id);

-- staff table indexes
CREATE INDEX IF NOT EXISTS idx_staff_casino_id ON public.staff (casino_id);

-- table_credit table indexes
CREATE INDEX IF NOT EXISTS idx_table_credit_authorized_by ON public.table_credit (authorized_by);
CREATE INDEX IF NOT EXISTS idx_table_credit_received_by ON public.table_credit (received_by);
CREATE INDEX IF NOT EXISTS idx_table_credit_sent_by ON public.table_credit (sent_by);
CREATE INDEX IF NOT EXISTS idx_table_credit_table_id ON public.table_credit (table_id);

-- table_drop_event table indexes
CREATE INDEX IF NOT EXISTS idx_table_drop_event_casino_id ON public.table_drop_event (casino_id);
CREATE INDEX IF NOT EXISTS idx_table_drop_event_removed_by ON public.table_drop_event (removed_by);
CREATE INDEX IF NOT EXISTS idx_table_drop_event_table_id ON public.table_drop_event (table_id);
CREATE INDEX IF NOT EXISTS idx_table_drop_event_witnessed_by ON public.table_drop_event (witnessed_by);

-- table_fill table indexes
CREATE INDEX IF NOT EXISTS idx_table_fill_delivered_by ON public.table_fill (delivered_by);
CREATE INDEX IF NOT EXISTS idx_table_fill_received_by ON public.table_fill (received_by);
CREATE INDEX IF NOT EXISTS idx_table_fill_requested_by ON public.table_fill (requested_by);
CREATE INDEX IF NOT EXISTS idx_table_fill_table_id ON public.table_fill (table_id);

-- table_inventory_snapshot table indexes
CREATE INDEX IF NOT EXISTS idx_table_inventory_snapshot_casino_id ON public.table_inventory_snapshot (casino_id);
CREATE INDEX IF NOT EXISTS idx_table_inventory_snapshot_counted_by ON public.table_inventory_snapshot (counted_by);
CREATE INDEX IF NOT EXISTS idx_table_inventory_snapshot_table_id ON public.table_inventory_snapshot (table_id);
CREATE INDEX IF NOT EXISTS idx_table_inventory_snapshot_verified_by ON public.table_inventory_snapshot (verified_by);

-- Comment on all indexes for documentation
COMMENT ON INDEX idx_audit_log_actor_id IS 'Foreign key index for actor_id - improves query performance on audit_log lookups by actor';
COMMENT ON INDEX idx_audit_log_casino_id IS 'Foreign key index for casino_id - improves query performance on audit_log lookups by casino';
COMMENT ON INDEX idx_casino_company_id IS 'Foreign key index for company_id - improves query performance on casino lookups by company';
COMMENT ON INDEX idx_dealer_rotation_casino_id IS 'Foreign key index for casino_id - improves query performance on dealer_rotation lookups by casino';
COMMENT ON INDEX idx_dealer_rotation_staff_id IS 'Foreign key index for staff_id - improves query performance on dealer_rotation lookups by staff';
COMMENT ON INDEX idx_finance_outbox_ledger_id IS 'Foreign key index for ledger_id - improves query performance on finance_outbox lookups by ledger';
COMMENT ON INDEX idx_floor_layout_approved_by IS 'Foreign key index for approved_by - improves query performance on floor_layout lookups by approver';
COMMENT ON INDEX idx_floor_layout_created_by IS 'Foreign key index for created_by - improves query performance on floor_layout lookups by creator';
COMMENT ON INDEX idx_floor_layout_reviewed_by IS 'Foreign key index for reviewed_by - improves query performance on floor_layout lookups by reviewer';
COMMENT ON INDEX idx_floor_layout_activation_activated_by IS 'Foreign key index for activated_by - improves query performance on floor_layout_activation lookups by activator';
COMMENT ON INDEX idx_floor_layout_activation_layout_version_id IS 'Foreign key index for layout_version_id - improves query performance on floor_layout_activation lookups by version';
COMMENT ON INDEX idx_floor_layout_version_created_by IS 'Foreign key index for created_by - improves query performance on floor_layout_version lookups by creator';
COMMENT ON INDEX idx_floor_table_slot_pit_id IS 'Foreign key index for pit_id - improves query performance on floor_table_slot lookups by pit';
COMMENT ON INDEX idx_floor_table_slot_preferred_table_id IS 'Foreign key index for preferred_table_id - improves query performance on floor_table_slot lookups by preferred table';
COMMENT ON INDEX idx_gaming_table_casino_id IS 'Foreign key index for casino_id - improves query performance on gaming_table lookups by casino';
COMMENT ON INDEX idx_gaming_table_settings_casino_id IS 'Foreign key index for casino_id - improves query performance on gaming_table_settings lookups by casino';
COMMENT ON INDEX idx_gaming_table_settings_table_id IS 'Foreign key index for table_id - improves query performance on gaming_table_settings lookups by table';
COMMENT ON INDEX idx_loyalty_ledger_staff_id IS 'Foreign key index for staff_id - improves query performance on loyalty_ledger lookups by staff';
COMMENT ON INDEX idx_loyalty_ledger_visit_id IS 'Foreign key index for visit_id - improves query performance on loyalty_ledger lookups by visit';
COMMENT ON INDEX idx_mtl_audit_note_mtl_entry_id IS 'Foreign key index for mtl_entry_id - improves query performance on mtl_audit_note lookups by MTL entry';
COMMENT ON INDEX idx_mtl_audit_note_staff_id IS 'Foreign key index for staff_id - improves query performance on mtl_audit_note lookups by staff';
COMMENT ON INDEX idx_mtl_entry_patron_uuid IS 'Foreign key index for patron_uuid - improves query performance on mtl_entry lookups by patron';
COMMENT ON INDEX idx_mtl_entry_rating_slip_id IS 'Foreign key index for rating_slip_id - improves query performance on mtl_entry lookups by rating slip';
COMMENT ON INDEX idx_mtl_entry_staff_id IS 'Foreign key index for staff_id - improves query performance on mtl_entry lookups by staff';
COMMENT ON INDEX idx_mtl_entry_visit_id IS 'Foreign key index for visit_id - improves query performance on mtl_entry lookups by visit';
COMMENT ON INDEX idx_player_financial_transaction_rating_slip_id IS 'Foreign key index for rating_slip_id - improves query performance on player_financial_transaction lookups by rating slip';
COMMENT ON INDEX idx_player_financial_transaction_visit_id IS 'Foreign key index for visit_id - improves query performance on player_financial_transaction lookups by visit';
COMMENT ON INDEX idx_player_loyalty_casino_id IS 'Foreign key index for casino_id - improves query performance on player_loyalty lookups by casino';
COMMENT ON INDEX idx_rating_slip_casino_id IS 'Foreign key index for casino_id - improves query performance on rating_slip lookups by casino';
COMMENT ON INDEX idx_rating_slip_pause_casino_id IS 'Foreign key index for casino_id - improves query performance on rating_slip_pause lookups by casino';
COMMENT ON INDEX idx_rating_slip_pause_created_by IS 'Foreign key index for created_by - improves query performance on rating_slip_pause lookups by creator';
COMMENT ON INDEX idx_report_casino_id IS 'Foreign key index for casino_id - improves query performance on report lookups by casino';
COMMENT ON INDEX idx_staff_casino_id IS 'Foreign key index for casino_id - improves query performance on staff lookups by casino';
COMMENT ON INDEX idx_table_credit_authorized_by IS 'Foreign key index for authorized_by - improves query performance on table_credit lookups by authorizer';
COMMENT ON INDEX idx_table_credit_received_by IS 'Foreign key index for received_by - improves query performance on table_credit lookups by receiver';
COMMENT ON INDEX idx_table_credit_sent_by IS 'Foreign key index for sent_by - improves query performance on table_credit lookups by sender';
COMMENT ON INDEX idx_table_credit_table_id IS 'Foreign key index for table_id - improves query performance on table_credit lookups by table';
COMMENT ON INDEX idx_table_drop_event_casino_id IS 'Foreign key index for casino_id - improves query performance on table_drop_event lookups by casino';
COMMENT ON INDEX idx_table_drop_event_removed_by IS 'Foreign key index for removed_by - improves query performance on table_drop_event lookups by remover';
COMMENT ON INDEX idx_table_drop_event_table_id IS 'Foreign key index for table_id - improves query performance on table_drop_event lookups by table';
COMMENT ON INDEX idx_table_drop_event_witnessed_by IS 'Foreign key index for witnessed_by - improves query performance on table_drop_event lookups by witness';
COMMENT ON INDEX idx_table_fill_delivered_by IS 'Foreign key index for delivered_by - improves query performance on table_fill lookups by deliverer';
COMMENT ON INDEX idx_table_fill_received_by IS 'Foreign key index for received_by - improves query performance on table_fill lookups by receiver';
COMMENT ON INDEX idx_table_fill_requested_by IS 'Foreign key index for requested_by - improves query performance on table_fill lookups by requester';
COMMENT ON INDEX idx_table_fill_table_id IS 'Foreign key index for table_id - improves query performance on table_fill lookups by table';
COMMENT ON INDEX idx_table_inventory_snapshot_casino_id IS 'Foreign key index for casino_id - improves query performance on table_inventory_snapshot lookups by casino';
COMMENT ON INDEX idx_table_inventory_snapshot_counted_by IS 'Foreign key index for counted_by - improves query performance on table_inventory_snapshot lookups by counter';
COMMENT ON INDEX idx_table_inventory_snapshot_table_id IS 'Foreign key index for table_id - improves query performance on table_inventory_snapshot lookups by table';
COMMENT ON INDEX idx_table_inventory_snapshot_verified_by IS 'Foreign key index for verified_by - improves query performance on table_inventory_snapshot lookups by verifier';

