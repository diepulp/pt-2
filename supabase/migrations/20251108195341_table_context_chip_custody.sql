-- 2025-11-08 — TableContextService chip custody extensions
-- Aligns schema + RPC surface with SRM v3.0.2 patched (inventory snapshots, fills, credits, drop custody)

BEGIN;

-- -----------------------------------------------------------------------------
-- Core custody tables (idempotency + casino ownership enforced)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.table_inventory_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.gaming_table(id) ON DELETE CASCADE,
  snapshot_type text NOT NULL CHECK (snapshot_type IN ('open', 'close', 'rundown')),
  chipset jsonb NOT NULL,
  counted_by uuid REFERENCES public.staff(id),
  verified_by uuid REFERENCES public.staff(id),
  discrepancy_cents int DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.table_fill (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.gaming_table(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  chipset jsonb NOT NULL,
  amount_cents int NOT NULL,
  requested_by uuid REFERENCES public.staff(id),
  delivered_by uuid REFERENCES public.staff(id),
  received_by uuid REFERENCES public.staff(id),
  slip_no text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.table_credit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.gaming_table(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  chipset jsonb NOT NULL,
  amount_cents int NOT NULL,
  authorized_by uuid REFERENCES public.staff(id),
  sent_by uuid REFERENCES public.staff(id),
  received_by uuid REFERENCES public.staff(id),
  slip_no text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.table_drop_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.gaming_table(id) ON DELETE CASCADE,
  drop_box_id text,
  seal_no text,
  gaming_day date,
  seq_no int,
  removed_by uuid REFERENCES public.staff(id),
  witnessed_by uuid REFERENCES public.staff(id),
  removed_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  delivered_scan_at timestamptz,
  note text
);

-- -----------------------------------------------------------------------------
-- Post-create alterations (handles reruns / existing dev DBs)
-- -----------------------------------------------------------------------------

ALTER TABLE public.table_fill
  ALTER COLUMN request_id SET NOT NULL;

ALTER TABLE public.table_credit
  ALTER COLUMN request_id SET NOT NULL;

ALTER TABLE public.table_drop_event
  ADD COLUMN IF NOT EXISTS drop_box_id text,
  ADD COLUMN IF NOT EXISTS gaming_day date,
  ADD COLUMN IF NOT EXISTS seq_no int,
  ADD COLUMN IF NOT EXISTS delivered_scan_at timestamptz;

ALTER TABLE public.table_drop_event
  ALTER COLUMN drop_box_id SET NOT NULL;

-- -----------------------------------------------------------------------------
-- Ensure idempotency uniqueness on fills / credits
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'table_fill_casino_request_id_key'
       AND conrelid = 'public.table_fill'::regclass
  ) THEN
    ALTER TABLE public.table_fill
      ADD CONSTRAINT table_fill_casino_request_id_key UNIQUE (casino_id, request_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'table_credit_casino_request_id_key'
       AND conrelid = 'public.table_credit'::regclass
  ) THEN
    ALTER TABLE public.table_credit
      ADD CONSTRAINT table_credit_casino_request_id_key UNIQUE (casino_id, request_id);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- RLS helper trigger bindings (reuse assert_table_context_casino)
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_table_inventory_snapshot_casino ON public.table_inventory_snapshot;
CREATE TRIGGER trg_table_inventory_snapshot_casino
BEFORE INSERT OR UPDATE ON public.table_inventory_snapshot
FOR EACH ROW EXECUTE FUNCTION public.assert_table_context_casino();

DROP TRIGGER IF EXISTS trg_table_fill_casino ON public.table_fill;
CREATE TRIGGER trg_table_fill_casino
BEFORE INSERT OR UPDATE ON public.table_fill
FOR EACH ROW EXECUTE FUNCTION public.assert_table_context_casino();

DROP TRIGGER IF EXISTS trg_table_credit_casino ON public.table_credit;
CREATE TRIGGER trg_table_credit_casino
BEFORE INSERT OR UPDATE ON public.table_credit
FOR EACH ROW EXECUTE FUNCTION public.assert_table_context_casino();

DROP TRIGGER IF EXISTS trg_table_drop_event_casino ON public.table_drop_event;
CREATE TRIGGER trg_table_drop_event_casino
BEFORE INSERT OR UPDATE ON public.table_drop_event
FOR EACH ROW EXECUTE FUNCTION public.assert_table_context_casino();

-- -----------------------------------------------------------------------------
-- RPC interfaces (canonical write paths)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_log_table_inventory_snapshot(
  p_casino_id uuid,
  p_table_id uuid,
  p_snapshot_type text,
  p_chipset jsonb,
  p_counted_by uuid DEFAULT NULL,
  p_verified_by uuid DEFAULT NULL,
  p_discrepancy_cents int DEFAULT 0,
  p_note text DEFAULT NULL
) RETURNS public.table_inventory_snapshot
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.table_inventory_snapshot (
    casino_id,
    table_id,
    snapshot_type,
    chipset,
    counted_by,
    verified_by,
    discrepancy_cents,
    note
  )
  VALUES (
    p_casino_id,
    p_table_id,
    p_snapshot_type,
    p_chipset,
    p_counted_by,
    p_verified_by,
    COALESCE(p_discrepancy_cents, 0),
    p_note
  )
  RETURNING *
$$;

CREATE OR REPLACE FUNCTION public.rpc_request_table_fill(
  p_casino_id uuid,
  p_table_id uuid,
  p_chipset jsonb,
  p_amount_cents int,
  p_requested_by uuid,
  p_delivered_by uuid,
  p_received_by uuid,
  p_slip_no text,
  p_request_id text
) RETURNS public.table_fill
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.table_fill (
    casino_id,
    table_id,
    chipset,
    amount_cents,
    requested_by,
    delivered_by,
    received_by,
    slip_no,
    request_id
  )
  VALUES (
    p_casino_id,
    p_table_id,
    p_chipset,
    p_amount_cents,
    p_requested_by,
    p_delivered_by,
    p_received_by,
    p_slip_no,
    p_request_id
  )
  ON CONFLICT (casino_id, request_id) DO UPDATE
    SET delivered_by = EXCLUDED.delivered_by,
        received_by = EXCLUDED.received_by,
        amount_cents = EXCLUDED.amount_cents
  RETURNING *
$$;

CREATE OR REPLACE FUNCTION public.rpc_request_table_credit(
  p_casino_id uuid,
  p_table_id uuid,
  p_chipset jsonb,
  p_amount_cents int,
  p_authorized_by uuid,
  p_sent_by uuid,
  p_received_by uuid,
  p_slip_no text,
  p_request_id text
) RETURNS public.table_credit
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.table_credit (
    casino_id,
    table_id,
    chipset,
    amount_cents,
    authorized_by,
    sent_by,
    received_by,
    slip_no,
    request_id
  )
  VALUES (
    p_casino_id,
    p_table_id,
    p_chipset,
    p_amount_cents,
    p_authorized_by,
    p_sent_by,
    p_received_by,
    p_slip_no,
    p_request_id
  )
  ON CONFLICT (casino_id, request_id) DO UPDATE
    SET received_by = EXCLUDED.received_by,
        amount_cents = EXCLUDED.amount_cents
  RETURNING *
$$;

CREATE OR REPLACE FUNCTION public.rpc_log_table_drop(
  p_casino_id uuid,
  p_table_id uuid,
  p_drop_box_id text,
  p_seal_no text,
  p_removed_by uuid,
  p_witnessed_by uuid,
  p_removed_at timestamptz DEFAULT now(),
  p_delivered_at timestamptz DEFAULT NULL,
  p_delivered_scan_at timestamptz DEFAULT NULL,
  p_gaming_day date DEFAULT NULL,
  p_seq_no int DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS public.table_drop_event
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.table_drop_event (
    casino_id,
    table_id,
    drop_box_id,
    seal_no,
    removed_by,
    witnessed_by,
    removed_at,
    delivered_at,
    delivered_scan_at,
    gaming_day,
    seq_no,
    note
  )
  VALUES (
    p_casino_id,
    p_table_id,
    p_drop_box_id,
    p_seal_no,
    p_removed_by,
    p_witnessed_by,
    COALESCE(p_removed_at, now()),
    p_delivered_at,
    p_delivered_scan_at,
    p_gaming_day,
    p_seq_no,
    p_note
  )
  RETURNING *
$$;

COMMIT;
