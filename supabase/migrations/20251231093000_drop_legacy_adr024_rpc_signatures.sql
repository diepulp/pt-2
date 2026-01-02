-- Drop legacy ADR-024 RPC signatures that still accept actor parameters.
-- These overloads are superseded by context-derived versions.

BEGIN;

DROP FUNCTION IF EXISTS public.rpc_activate_floor_layout(
  uuid,
  uuid,
  uuid,
  text
);

DROP FUNCTION IF EXISTS public.rpc_close_rating_slip(
  uuid,
  uuid,
  uuid,
  numeric
);

DROP FUNCTION IF EXISTS public.rpc_create_floor_layout(
  uuid,
  text,
  text,
  uuid
);

DROP FUNCTION IF EXISTS public.rpc_create_player(
  uuid,
  uuid,
  text,
  text,
  date
);

DROP FUNCTION IF EXISTS public.rpc_log_table_drop(
  uuid,
  uuid,
  text,
  text,
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  timestamptz,
  date,
  integer,
  text
);

DROP FUNCTION IF EXISTS public.rpc_log_table_inventory_snapshot(
  uuid,
  uuid,
  text,
  jsonb,
  uuid,
  uuid,
  integer,
  text
);

DROP FUNCTION IF EXISTS public.rpc_move_player(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  numeric
);

DROP FUNCTION IF EXISTS public.rpc_pause_rating_slip(
  uuid,
  uuid,
  uuid
);

DROP FUNCTION IF EXISTS public.rpc_request_table_credit(
  uuid,
  uuid,
  jsonb,
  integer,
  uuid,
  uuid,
  uuid,
  text,
  text
);

DROP FUNCTION IF EXISTS public.rpc_request_table_fill(
  uuid,
  uuid,
  jsonb,
  integer,
  uuid,
  uuid,
  uuid,
  text,
  text
);

DROP FUNCTION IF EXISTS public.rpc_resume_rating_slip(
  uuid,
  uuid,
  uuid
);

COMMIT;
