-- ============================================================================
-- SEC-007 P1 REVOKE FROM PUBLIC Batch
-- Fixes: P1-7 (write RPCs), P1-8 (read RPCs)
-- Source: SEC-007 Tenant Isolation Enforcement Contract (EXEC-040)
-- ADR: ADR-018
-- ============================================================================
-- PostgreSQL grants EXECUTE to PUBLIC by default. These 10 functions were
-- created without explicit REVOKE FROM PUBLIC, meaning the anon role
-- (unauthenticated PostgREST clients) could invoke them.
-- All these functions have internal auth checks (set_rls_context_from_staff
-- or auth.uid()), so anon calls would fail at runtime. However, defense-in-depth
-- requires REVOKE FROM PUBLIC to prevent PostgREST from even routing the request.
-- ============================================================================

-- P1-7: Write RPCs
-- rpc_create_financial_txn(uuid, uuid, uuid, numeric, financial_direction, financial_source, uuid, text, uuid, uuid, text, timestamptz, text)
REVOKE ALL ON FUNCTION public.rpc_create_financial_txn(uuid, uuid, uuid, numeric, financial_direction, financial_source, uuid, text, uuid, uuid, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_create_financial_txn(uuid, uuid, uuid, numeric, financial_direction, financial_source, uuid, text, uuid, uuid, text, timestamptz, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_financial_txn(uuid, uuid, uuid, numeric, financial_direction, financial_source, uuid, text, uuid, uuid, text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_financial_txn(uuid, uuid, uuid, numeric, financial_direction, financial_source, uuid, text, uuid, uuid, text, timestamptz, text) TO service_role;

-- rpc_create_financial_adjustment(uuid, uuid, uuid, numeric, adjustment_reason_code, text, uuid, text)
REVOKE ALL ON FUNCTION public.rpc_create_financial_adjustment(uuid, uuid, uuid, numeric, adjustment_reason_code, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_create_financial_adjustment(uuid, uuid, uuid, numeric, adjustment_reason_code, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_financial_adjustment(uuid, uuid, uuid, numeric, adjustment_reason_code, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_financial_adjustment(uuid, uuid, uuid, numeric, adjustment_reason_code, text, uuid, text) TO service_role;

-- P1-8: Read RPCs
-- rpc_get_dashboard_stats() — no parameters
REVOKE ALL ON FUNCTION public.rpc_get_dashboard_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_dashboard_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_dashboard_stats() TO service_role;

-- rpc_get_rating_slip_modal_data(uuid, uuid)
REVOKE ALL ON FUNCTION public.rpc_get_rating_slip_modal_data(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_rating_slip_modal_data(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_rating_slip_modal_data(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_rating_slip_modal_data(uuid, uuid) TO service_role;

-- rpc_get_dashboard_tables_with_counts(uuid)
REVOKE ALL ON FUNCTION public.rpc_get_dashboard_tables_with_counts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_dashboard_tables_with_counts(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_dashboard_tables_with_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_dashboard_tables_with_counts(uuid) TO service_role;

-- rpc_list_active_players_casino_wide(int, text)
REVOKE ALL ON FUNCTION public.rpc_list_active_players_casino_wide(int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_list_active_players_casino_wide(int, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_active_players_casino_wide(int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_list_active_players_casino_wide(int, text) TO service_role;

-- rpc_list_closed_slips_for_gaming_day(date, int, timestamptz, uuid)
REVOKE ALL ON FUNCTION public.rpc_list_closed_slips_for_gaming_day(date, int, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_list_closed_slips_for_gaming_day(date, int, timestamptz, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_closed_slips_for_gaming_day(date, int, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_list_closed_slips_for_gaming_day(date, int, timestamptz, uuid) TO service_role;

-- rpc_shift_active_visitors_summary() — no parameters
REVOKE ALL ON FUNCTION public.rpc_shift_active_visitors_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_shift_active_visitors_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_shift_active_visitors_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_shift_active_visitors_summary() TO service_role;

-- rpc_promo_exposure_rollup(date, uuid, timestamptz, timestamptz)
REVOKE ALL ON FUNCTION public.rpc_promo_exposure_rollup(date, uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_promo_exposure_rollup(date, uuid, timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_promo_exposure_rollup(date, uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_promo_exposure_rollup(date, uuid, timestamptz, timestamptz) TO service_role;

-- rpc_promo_coupon_inventory(uuid, promo_coupon_status)
REVOKE ALL ON FUNCTION public.rpc_promo_coupon_inventory(uuid, promo_coupon_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_promo_coupon_inventory(uuid, promo_coupon_status) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_promo_coupon_inventory(uuid, promo_coupon_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_promo_coupon_inventory(uuid, promo_coupon_status) TO service_role;

NOTIFY pgrst, 'reload schema';
