-- 2025-11-08 — FloorLayoutService schema
-- Adds floor layout design/versioning tables and RPCs per SRM v3.0.2

BEGIN;

create type if not exists public.floor_layout_status as enum ('draft','review','approved','archived');
create type if not exists public.floor_layout_version_status as enum ('draft','pending_activation','active','retired');

create table if not exists public.floor_layout (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references public.casino(id) on delete cascade,
  name text not null,
  description text,
  status public.floor_layout_status not null default 'draft',
  created_by uuid not null references public.staff(id) on delete restrict,
  reviewed_by uuid references public.staff(id) on delete set null,
  approved_by uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.floor_layout_version (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references public.floor_layout(id) on delete cascade,
  version_no int not null,
  status public.floor_layout_version_status not null default 'draft',
  layout_payload jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid not null references public.staff(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (layout_id, version_no)
);

create table if not exists public.floor_pit (
  id uuid primary key default gen_random_uuid(),
  layout_version_id uuid not null references public.floor_layout_version(id) on delete cascade,
  label text not null,
  sequence int not null default 0,
  capacity int,
  geometry jsonb,
  metadata jsonb
);

create table if not exists public.floor_table_slot (
  id uuid primary key default gen_random_uuid(),
  layout_version_id uuid not null references public.floor_layout_version(id) on delete cascade,
  pit_id uuid references public.floor_pit(id) on delete cascade,
  slot_label text not null,
  game_type public.game_type not null,
  preferred_table_id uuid references public.gaming_table(id) on delete set null,
  coordinates jsonb,
  orientation text,
  metadata jsonb
);

create table if not exists public.floor_layout_activation (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references public.casino(id) on delete cascade,
  layout_version_id uuid not null references public.floor_layout_version(id) on delete cascade,
  activated_by uuid not null references public.staff(id) on delete restrict,
  activated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  activation_request_id text not null,
  unique (casino_id, activation_request_id)
);

create index if not exists ix_floor_layout_casino on public.floor_layout (casino_id, status);
create index if not exists ix_floor_layout_version_layout on public.floor_layout_version (layout_id, version_no desc);
create index if not exists ix_floor_pit_layout on public.floor_pit (layout_version_id, sequence);
create index if not exists ix_floor_table_slot_layout on public.floor_table_slot (layout_version_id, slot_label);
create index if not exists ix_floor_layout_activation_casino on public.floor_layout_activation (casino_id, activated_at desc);

create or replace function public.rpc_create_floor_layout(
  p_casino_id uuid,
  p_name text,
  p_description text,
  p_created_by uuid
) returns public.floor_layout
language plpgsql security definer set search_path = public as $$
declare v_layout_id uuid;
begin
  insert into public.floor_layout (casino_id, name, description, created_by)
  values (p_casino_id, p_name, p_description, p_created_by)
  returning id into v_layout_id;

  insert into public.floor_layout_version (layout_id, version_no, created_by)
  values (v_layout_id, 1, p_created_by);

  return (select fl from public.floor_layout fl where fl.id = v_layout_id);
end;
$$;

create or replace function public.rpc_activate_floor_layout(
  p_casino_id uuid,
  p_layout_version_id uuid,
  p_activated_by uuid,
  p_request_id text
) returns public.floor_layout_activation
language sql security definer set search_path = public as $$
  insert into public.floor_layout_activation (
    casino_id, layout_version_id, activated_by, activation_request_id
  ) values (
    p_casino_id, p_layout_version_id, p_activated_by, p_request_id
  )
  on conflict (casino_id, activation_request_id) do update
    set layout_version_id = excluded.layout_version_id,
        activated_by = excluded.activated_by,
        activated_at = now()
  returning *;
$$;

COMMIT;
