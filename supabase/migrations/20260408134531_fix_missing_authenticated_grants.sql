-- Fix: Grant EXECUTE on 4 rpc_* functions missing authenticated role grants
-- Root cause: These functions were never given explicit GRANT EXECUTE TO authenticated.
-- They survive only on default PUBLIC inheritance, which is fragile — any future
-- bulk REVOKE (like ADR-018's 20260219235800) would silently break them.
--
-- Reference: GAP-AUTHENTICATED-ROLE-GRANT-BLIND-SPOT (2026-04-08 P1 incident)
-- Reference: PRODUCTION-READINESS-REPORT-04-08, Section 1.1

-- 1. rpc_check_table_seat_availability(uuid, int)
--    Called from: services/visit/crud.ts:648
REVOKE ALL ON FUNCTION public.rpc_check_table_seat_availability(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_check_table_seat_availability(uuid, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_check_table_seat_availability(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_check_table_seat_availability(uuid, int) TO service_role;

-- 2. rpc_get_visit_live_view(uuid, boolean, integer)
--    Called from: services/rating-slip/crud.ts:711, app/api/v1/visits/[visitId]/live-view/route.ts
REVOKE ALL ON FUNCTION public.rpc_get_visit_live_view(uuid, boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_visit_live_view(uuid, boolean, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_visit_live_view(uuid, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_visit_live_view(uuid, boolean, integer) TO service_role;

-- 3. rpc_get_visit_loyalty_summary(uuid)
--    Called by: rpc_get_player_recent_sessions (internal caller chain)
REVOKE ALL ON FUNCTION public.rpc_get_visit_loyalty_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_visit_loyalty_summary(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_visit_loyalty_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_visit_loyalty_summary(uuid) TO service_role;

-- 4. rpc_get_visit_last_segment(uuid)
--    Called by: rpc_get_player_recent_sessions, rpc_get_player_last_session_context (internal)
REVOKE ALL ON FUNCTION public.rpc_get_visit_last_segment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_visit_last_segment(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_visit_last_segment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_visit_last_segment(uuid) TO service_role;
