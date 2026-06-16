-- Dev utility: read latest OTP token from auth.one_time_tokens for a given email.
-- Callable only by service_role (REVOKE from PUBLIC prevents anon/authenticated access).
-- The API route that calls this is separately guarded by ENABLE_DEV_AUTH + NODE_ENV=development.
CREATE OR REPLACE FUNCTION public.dev_get_latest_otp_token(p_email TEXT)
RETURNS TABLE (token_hash TEXT, token_type TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    t.token_hash::TEXT,
    t.token_type::TEXT,
    t.created_at
  FROM auth.one_time_tokens t
  WHERE t.relates_to = p_email
  ORDER BY t.created_at DESC
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.dev_get_latest_otp_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dev_get_latest_otp_token(TEXT) TO service_role;
