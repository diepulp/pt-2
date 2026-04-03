# Unused Index Review — Post-Launch Traffic Analysis

**Source:** PERF-P5 from Supabase Advisor Report 2026-04-02  
**Status:** Tracking (DO NOT DROP pre-launch)  
**Total unused indexes:** 126  
**Next review date:** 30 days post-launch (with production traffic data)

---

## Context

The Supabase Database Advisor flagged 126 indexes with zero scans in `pg_stat_user_indexes`. These indexes are **pre-production** and have not been exercised by real traffic. Dropping them now would be premature — many support query patterns that will activate once the application has production load.

**Decision:** Track all 126 indexes here. After 30 days of production traffic, re-run `pg_stat_user_indexes` analysis and drop any indexes that remain at zero scans and are confirmed unnecessary.

## Review Process

1. After 30 days of production traffic, query `pg_stat_user_indexes` for scan counts
2. Cross-reference zero-scan indexes against active query plans (`EXPLAIN ANALYZE`)
3. Check if any zero-scan indexes serve as unique constraints (cannot drop)
4. Confirm no scheduled jobs or batch processes depend on the index
5. Drop confirmed-unused indexes in a migration with `DROP INDEX CONCURRENTLY`

---

## Unused Index Inventory (126 indexes)

### rating_slip (6 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_rating_slip_table_status_active` | Composite: table + status filter for active slips |
| `ix_rating_slip_accrual_kind` | Accrual kind lookups |
| `idx_rating_slip_theo_discrepancy` | Theo discrepancy flag |
| `idx_rating_slip_casino_id` | Casino ID FK |
| `idx_rating_slip_table_seat_status` | Table + seat + status composite |
| `idx_rating_slip_previous_slip_id` | Previous slip chain |
| `idx_rating_slip_move_group_id` | Move group tracking |

### mtl_entry (8 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `ix_mtl_patron_day` | Patron + gaming day composite |
| `ix_mtl_gaming_day_direction` | Gaming day + direction composite |
| `ix_mtl_occurred_at` | Occurred at timestamp |
| `idx_mtl_entry_patron_uuid` | Patron UUID FK |
| `idx_mtl_entry_staff_id` | Staff ID FK |
| `idx_mtl_entry_visit_id` | Visit ID FK |
| `idx_mtl_player_timeline` | Player timeline composite |
| `ix_mtl_casino_time` | Casino + time composite |

### table_buyin_telemetry (5 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_tbt_table_window` | Casino + table + occurred_at composite |
| `idx_tbt_gaming_day` | Gaming day |
| `idx_tbt_visit` | Casino + visit + occurred_at composite |
| `idx_tbt_kind` | Transaction kind |
| `idx_table_buyin_telemetry_casino_occurred` | Casino + occurred_at composite |

### visit (6 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `ix_visit_casino_gaming_day` | Casino + gaming day composite |
| `ix_visit_active_by_player` | Active visits per player |
| `ix_visit_by_casino_date` | Casino + date composite |
| `ix_visit_by_kind` | Visit kind |
| `idx_visit_group` | Visit group ID |
| `idx_visit_player_recent_closed` | Player + recent closed |

### player_financial_transaction (3 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_financial_txn_related_txn_id` | Related transaction FK |
| `idx_financial_player_timeline` | Player timeline composite |
| `ix_fin_txn_player_time` | Player + time composite |
| `ix_fin_txn_casino_gaming_day` | Casino + gaming day composite |

### table_fill (6 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_table_fill_casino_created` | Casino + created_at composite |
| `idx_table_fill_status_casino` | Status + casino composite |
| `idx_table_fill_session` | Session ID |
| `idx_table_fill_delivered_by` | Delivered by staff FK |
| `idx_table_fill_received_by` | Received by staff FK |
| `idx_table_fill_requested_by` | Requested by staff FK |
| `idx_table_fill_table_id` | Table ID FK |

### table_credit (7 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_table_credit_casino_created` | Casino + created_at composite |
| `idx_table_credit_session` | Session ID |
| `idx_table_credit_authorized_by` | Authorized by staff FK |
| `idx_table_credit_received_by` | Received by staff FK |
| `idx_table_credit_sent_by` | Sent by staff FK |
| `idx_table_credit_table_id` | Table ID FK |
| `idx_table_credit_status_casino` | Status + casino composite |

### table_drop_event (6 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_table_drop_event_casino_removed` | Casino + removed_at composite |
| `idx_table_drop_event_casino_id` | Casino ID FK |
| `idx_table_drop_event_removed_by` | Removed by staff FK |
| `idx_table_drop_event_table_id` | Table ID FK |
| `idx_table_drop_event_witnessed_by` | Witnessed by staff FK |
| `idx_drop_event_pending` | Pending status filter |

### table_inventory_snapshot (4 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_table_inventory_snapshot_session` | Session ID |
| `idx_table_inventory_snapshot_verified_by` | Verified by staff FK |
| `idx_tis_consumed_by` | Consumed by session FK |
| `idx_table_inventory_snapshot_casino_id` | Casino ID |
| `idx_table_inventory_snapshot_counted_by` | Counted by staff FK |

### loyalty_outbox (1 index)

| Index | Columns / Notes |
|-------|-----------------|
| `ix_loyalty_outbox_unprocessed` | Casino + created_at for unprocessed items |

### reward_catalog (1 index)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_reward_catalog_casino_active` | Casino + active status |

### gaming_table (2 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_gaming_table_casino_id` | Casino ID FK |
| `idx_gaming_table_game_settings_id` | Game settings FK |

### player (4 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_player_email_lower` | Lowercase email for search |
| `idx_player_phone_number` | Phone number search |
| `ix_player_name_trgm` | Trigram name search |
| `ix_player_names_lower` | Lowercase names |
| `ix_player_enrollment_match` | Enrollment matching |

### gaming_table_settings (1 index)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_gaming_table_settings_casino_id` | Casino ID FK |

### dealer_rotation (1 index)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_dealer_rotation_staff_id` | Staff ID FK |

### report (1 index)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_report_casino_id` | Casino ID FK |

### import_batch (3 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_import_batch_status_uploaded` | Status + uploaded filter |
| `idx_import_batch_status_parsing_heartbeat` | Parsing heartbeat |
| `idx_import_batch_casino_status` | Casino + status composite |

### import_row (1 index)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_import_row_batch_status` | Batch + status composite |

### loyalty_ledger (5 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `ix_loyalty_ledger_player_time` | Player + time composite |
| `ix_loyalty_ledger_pagination` | Pagination support |
| `idx_loyalty_ledger_staff_id` | Staff ID FK |
| `idx_loyalty_ledger_visit_id` | Visit ID FK |
| `idx_loyalty_player_timeline` | Player timeline composite |

### player_loyalty (1 index)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_player_loyalty_casino_id` | Casino ID FK |

### pit_cash_observation (2 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `ix_pit_cash_observation_visit_time` | Visit + time composite |
| `ix_pit_cash_observation_player_time` | Player + time composite |

### promo_program (2 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_promo_program_casino_id` | Casino ID FK |
| `idx_promo_program_casino_status` | Casino + status composite |

### promo_coupon (6 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_promo_coupon_casino_id` | Casino ID FK |
| `idx_promo_coupon_program_id` | Program ID FK |
| `idx_promo_coupon_player_id` | Player ID FK (partial) |
| `idx_promo_coupon_visit_id` | Visit ID FK (partial) |
| `idx_promo_coupon_status_issued` | Casino + status + issued_at |
| `idx_promo_coupon_expiry` | Expiry date (partial) |

### table_session (1 index)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_table_session_predecessor` | Predecessor session FK |

### staff_pin_attempts (1 index)

| Index | Columns / Notes |
|-------|-----------------|
| `ix_staff_pin_attempts_window_start` | Window start timestamp |

### table_rundown_report (2 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_rundown_report_gaming_day` | Gaming day |
| `idx_shift_checkpoint_latest` | Latest checkpoint composite |

### shift_checkpoint (1 index)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_shift_checkpoint_latest` | Casino + scope + created_at DESC |

### player_exclusion (3 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `ix_player_exclusion_active` | Casino + player composite |
| `ix_player_exclusion_review` | Review date |
| `ix_player_exclusion_jurisdiction` | Jurisdiction + type |

### table_metric_baseline (1 index)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_baseline_casino_day` | Casino + gaming day DESC |

### alert_acknowledgment (1 index)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_alert_ack_alert_id` | Alert ID FK |

### table_opening_attestation (1 index)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_toa_casino_id` | Casino ID |

### mtl_audit_note (3 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_mtl_audit_note_mtl_entry_id` | MTL entry FK |
| `idx_mtl_audit_note_staff_id` | Staff ID FK |
| `ix_mtl_audit_note_entry` | Entry composite |

### floor_layout (3 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_floor_layout_approved_by` | Approved by staff FK |
| `idx_floor_layout_created_by` | Created by staff FK |
| `idx_floor_layout_reviewed_by` | Reviewed by staff FK |
| `ix_floor_layout_casino` | Casino composite |

### floor_layout_activation (2 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_floor_layout_activation_activated_by` | Activated by staff FK |
| `idx_floor_layout_activation_layout_version_id` | Layout version FK |
| `ix_floor_layout_activation_casino` | Casino composite |

### floor_layout_version (1 index)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_floor_layout_version_created_by` | Created by staff FK |
| `ix_floor_layout_version_layout` | Layout composite |

### floor_table_slot (2 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `ix_floor_table_slot_layout` | Layout composite |
| `idx_floor_table_slot_pit_id` | Pit ID FK |
| `idx_floor_table_slot_preferred_table_id` | Preferred table FK |

### floor_pit (1 index)

| Index | Columns / Notes |
|-------|-----------------|
| `ix_floor_pit_layout` | Layout composite |

### finance_outbox (2 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_finance_outbox_ledger_id` | Ledger ID FK |
| `ix_finance_outbox_unprocessed` | Unprocessed items |

### rating_slip_pause (3 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `ix_slip_pause_slip_id` | Slip ID + started_at composite |
| `idx_rating_slip_pause_casino_id` | Casino ID FK |
| `idx_rating_slip_pause_created_by` | Created by staff FK |

### player_casino (2 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `ix_player_casino_by_casino` | Casino ID |
| `ix_player_casino_active` | Casino + status composite |

### context.sessions (2 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_sessions_started_at` | Started at DESC |
| `idx_sessions_active` | Chatmode + user_id composite |

### context.session_events (1 index)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_session_events_created_at` | Created at DESC |

### audit_log (2 indexes)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_audit_log_actor_id` | Actor ID |
| `idx_audit_log_casino_id` | Casino ID |

### staff (1 index)

| Index | Columns / Notes |
|-------|-----------------|
| `idx_staff_casino_id` | Casino ID FK |

---

## High-Confidence Keepers (likely needed post-launch)

These indexes support core query patterns and should NOT be dropped even if unused at review time:

- **Player search indexes:** `idx_player_email_lower`, `idx_player_phone_number`, `ix_player_name_trgm`, `ix_player_names_lower`
- **Timeline indexes:** `idx_financial_player_timeline`, `idx_loyalty_player_timeline`, `idx_mtl_player_timeline`
- **Active session/visit indexes:** `ix_visit_active_by_player`, `unique_active_session_per_table`
- **FK indexes:** All single-column FK indexes (support cascading deletes)
- **Outbox processors:** `ix_loyalty_outbox_unprocessed`, `ix_finance_outbox_unprocessed`

## Candidates for Possible Removal (verify with traffic data)

These indexes may be redundant with other composite indexes covering the same leading columns:

- Indexes that are subsets of wider composite indexes on the same table
- Partial indexes whose filter condition never matches production data patterns
- Indexes on low-cardinality columns (e.g., status enums with few values)

---

*Generated from Supabase Advisor Report 2026-04-02. Review with `pg_stat_user_indexes` after 30 days of production traffic.*
