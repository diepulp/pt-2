-- Fix: grant EXECUTE on rpc_get_rating_slip_duration to authenticated role
-- Root cause: SEC-007 remediation (20260302230022) granted only to service_role,
-- omitting authenticated. All other 90+ RPCs have correct grants.

GRANT EXECUTE ON FUNCTION public.rpc_get_rating_slip_duration(uuid, timestamptz) TO authenticated;
