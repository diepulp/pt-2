-- Migration: Grant set_rls_context RPC to service_role
-- Description: Fixes dev mode RPC permission issue where service client cannot call RPC
-- Issue: In dev mode, withAuth middleware swaps to service client which uses service_role,
--        but set_rls_context was only granted to authenticated role
-- Created: 2025-12-13

-- Grant execution to service_role for dev mode compatibility
-- This allows the service client to inject RLS context in development
GRANT EXECUTE ON FUNCTION set_rls_context(uuid, uuid, text, text) TO service_role;

-- Note: This is safe because:
-- 1. service_role already bypasses RLS entirely
-- 2. The RPC only sets transaction-local config values
-- 3. In production, authenticated role is used (already granted in 20251209183033)
