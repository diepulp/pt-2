/**
 * MTLService Column Selects
 *
 * Named column projections for database queries.
 * Ensures consistent column selection across CRUD operations.
 *
 * @see PRD-005 MTL Service
 */

// ============================================================================
// MTL Entry Selects
// ============================================================================

/**
 * Columns for MTL entry list queries
 * Used by listEntries() and similar operations
 */
export const MTL_ENTRY_SELECT = `
  id,
  patron_uuid,
  casino_id,
  staff_id,
  rating_slip_id,
  visit_id,
  amount,
  direction,
  txn_type,
  source,
  area,
  gaming_day,
  occurred_at,
  created_at,
  idempotency_key
` as const;

/**
 * Columns for MTL entry detail with audit notes
 * Used by getEntryById() for full detail view
 */
export const MTL_ENTRY_DETAIL_SELECT = `
  id,
  patron_uuid,
  casino_id,
  staff_id,
  rating_slip_id,
  visit_id,
  amount,
  direction,
  txn_type,
  source,
  area,
  gaming_day,
  occurred_at,
  created_at,
  idempotency_key,
  mtl_audit_note (
    id,
    mtl_entry_id,
    staff_id,
    note,
    created_at
  )
` as const;

// ============================================================================
// MTL Audit Note Selects
// ============================================================================

/**
 * Columns for MTL audit note queries
 */
export const MTL_AUDIT_NOTE_SELECT = `
  id,
  mtl_entry_id,
  staff_id,
  note,
  created_at
` as const;

// ============================================================================
// Gaming Day Summary Selects
// ============================================================================

/**
 * Columns for Gaming Day Summary view queries
 * This view aggregates entries per patron + gaming_day
 */
export const MTL_GAMING_DAY_SUMMARY_SELECT = `
  casino_id,
  patron_uuid,
  gaming_day,
  total_in,
  count_in,
  max_single_in,
  first_in_at,
  last_in_at,
  total_out,
  count_out,
  max_single_out,
  first_out_at,
  last_out_at,
  total_volume,
  entry_count
` as const;
