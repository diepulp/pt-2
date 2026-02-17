/**
 * TableContextService Named Column Projections
 *
 * @see SLAD section 326 for select patterns
 */

// Gaming table projections
export const GAMING_TABLE_SELECT = `
  id,
  casino_id,
  label,
  pit,
  type,
  status,
  created_at
` as const;

export const GAMING_TABLE_WITH_DEALER_SELECT = `
  id,
  casino_id,
  label,
  pit,
  type,
  status,
  created_at,
  dealer_rotation!inner (
    staff_id,
    started_at
  )
` as const;

// Dealer rotation projection
export const DEALER_ROTATION_SELECT = `
  id,
  casino_id,
  table_id,
  staff_id,
  started_at,
  ended_at
` as const;

// Inventory snapshot projection
export const TABLE_INVENTORY_SNAPSHOT_SELECT = `
  id,
  casino_id,
  table_id,
  snapshot_type,
  chipset,
  counted_by,
  verified_by,
  discrepancy_cents,
  note,
  created_at
` as const;

// Fill projection
export const TABLE_FILL_SELECT = `
  id,
  casino_id,
  table_id,
  request_id,
  chipset,
  amount_cents,
  requested_by,
  delivered_by,
  received_by,
  slip_no,
  created_at,
  status,
  confirmed_at,
  confirmed_by,
  confirmed_amount_cents,
  discrepancy_note
` as const;

// Credit projection
export const TABLE_CREDIT_SELECT = `
  id,
  casino_id,
  table_id,
  request_id,
  chipset,
  amount_cents,
  authorized_by,
  sent_by,
  received_by,
  slip_no,
  created_at,
  status,
  confirmed_at,
  confirmed_by,
  confirmed_amount_cents,
  discrepancy_note
` as const;

// Drop event projection
export const TABLE_DROP_EVENT_SELECT = `
  id,
  casino_id,
  table_id,
  drop_box_id,
  seal_no,
  gaming_day,
  seq_no,
  removed_by,
  witnessed_by,
  removed_at,
  delivered_at,
  delivered_scan_at,
  note,
  cage_received_at,
  cage_received_by
` as const;

// Table settings projection
export const GAMING_TABLE_SETTINGS_SELECT = `
  id,
  casino_id,
  table_id,
  min_bet,
  max_bet,
  active_from,
  active_to,
  rotation_interval_minutes
` as const;
