-- Migration: ADR-015 Financial RPC Hardening
-- Created: 2025-12-11 17:25:16 UTC
-- Purpose: Enforce Pattern C (hybrid) context validation and role gating in rpc_create_financial_txn
-- Reference: ADR-015, SEC-001, ISSUE-003
-- VERIFIED_SAFE

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'financial_direction') THEN
    CREATE TYPE financial_direction AS ENUM ('in', 'out');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'financial_source') THEN
    CREATE TYPE financial_source AS ENUM ('pit', 'cage', 'system');
  END IF;
END;
$$;

ALTER TABLE player_financial_transaction
  ADD COLUMN IF NOT EXISTS direction financial_direction,
  ADD COLUMN IF NOT EXISTS source financial_source,
  ADD COLUMN IF NOT EXISTS created_by_staff_id uuid,
  ADD COLUMN IF NOT EXISTS related_transaction_id uuid;

-- Replace rpc_create_financial_txn to require authenticated actor, casino scope match,
-- and cashier/admin role for inserts. Returns full row for service consumption.
CREATE OR REPLACE FUNCTION public.rpc_create_financial_txn(
  p_casino_id uuid,
  p_player_id uuid,
  p_visit_id uuid,
  p_amount numeric,
  p_direction player_financial_transaction.direction%TYPE,
  p_source player_financial_transaction.source%TYPE,
  p_created_by_staff_id uuid,
  p_tender_type text DEFAULT NULL,
  p_rating_slip_id uuid DEFAULT NULL,
  p_related_transaction_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_created_at timestamptz DEFAULT now()
) RETURNS public.player_financial_transaction
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_casino_id uuid := COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid);
  v_actor_id uuid := COALESCE(NULLIF(current_setting('app.actor_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid);
  v_staff_role text := COALESCE(NULLIF(current_setting('app.staff_role', true), ''), (auth.jwt() -> 'app_metadata' ->> 'staff_role'));
  v_row player_financial_transaction%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF v_casino_id IS NULL OR v_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch';
  END IF;

  IF v_actor_id IS NULL OR v_actor_id <> p_created_by_staff_id THEN
    RAISE EXCEPTION 'actor_id mismatch';
  END IF;

  PERFORM 1
    FROM staff s
   WHERE s.id = p_created_by_staff_id
     AND s.user_id = auth.uid()
     AND s.status = 'active'
     AND s.casino_id = v_casino_id
     AND s.role IN ('cashier', 'admin');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthorized staff role';
  END IF;

  INSERT INTO public.player_financial_transaction AS t (
    id,
    player_id,
    casino_id,
    visit_id,
    rating_slip_id,
    amount,
    direction,
    source,
    tender_type,
    created_by_staff_id,
    related_transaction_id,
    created_at,
    idempotency_key
  )
  VALUES (
    gen_random_uuid(),
    p_player_id,
    p_casino_id,
    p_visit_id,
    p_rating_slip_id,
    p_amount,
    p_direction,
    p_source,
    p_tender_type,
    p_created_by_staff_id,
    p_related_transaction_id,
    COALESCE(p_created_at, now()),
    p_idempotency_key
  )
  ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING t.* INTO v_row;

  RETURN v_row;
END;
$$;

COMMIT;
