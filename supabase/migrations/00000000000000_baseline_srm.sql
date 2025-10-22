-- Baseline schema derived from SERVICE_RESPONSIBILITY_MATRIX v3.0.2 (canonical contract)

create extension if not exists pgcrypto;

-- Enumerations
create type staff_role as enum ('dealer','pit_boss','admin');
create type staff_status as enum ('active','inactive');
create type game_type as enum ('blackjack','poker','roulette','baccarat');
create type table_status as enum ('inactive','active','closed');
create type loyalty_reason as enum ('mid_session','session_end','manual_adjustment','promotion','correction');

-- Foundational context
create table company (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  created_at timestamptz not null default now()
);

create table casino (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references company(id) on delete cascade,
  name text not null,
  location text,
  address jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table casino_settings (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null unique references casino(id) on delete cascade,
  gaming_day_start_time time not null default time '06:00',
  timezone text not null default 'America/Los_Angeles',
  watchlist_floor numeric(12,2) not null default 3000,
  ctr_threshold numeric(12,2) not null default 10000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table staff (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid references casino(id) on delete set null,
  employee_id text unique,
  first_name text not null,
  last_name text not null,
  email text unique,
  role staff_role not null default 'dealer',
  status staff_status not null default 'active',
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid references casino(id) on delete set null,
  domain text not null,
  actor_id uuid references staff(id) on delete set null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create table report (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid references casino(id) on delete cascade,
  name text not null,
  payload jsonb not null,
  generated_at timestamptz not null default now()
);

-- Identity & session context
create table player (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  birth_date date,
  created_at timestamptz not null default now()
);

create table player_casino (
  player_id uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  status text not null default 'active',
  enrolled_at timestamptz not null default now(),
  primary key (player_id, casino_id)
);

create table visit (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

-- Telemetry context
create table game_settings (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  game_type game_type not null,
  min_bet numeric,
  max_bet numeric,
  rotation_interval_minutes int,
  constraint chk_game_bet_range check (
    min_bet is null or max_bet is null or min_bet <= max_bet
  )
);

create unique index ux_game_settings_casino_type
  on game_settings (casino_id, game_type);

create table gaming_table (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  label text not null,
  pit text,
  type game_type not null,
  status table_status not null default 'inactive',
  created_at timestamptz not null default now()
);

create table gaming_table_settings (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  table_id uuid not null references gaming_table(id) on delete cascade,
  active_from timestamptz not null default now(),
  active_to timestamptz,
  min_bet numeric,
  max_bet numeric,
  rotation_interval_minutes int,
  constraint chk_table_bet_range check (
    min_bet is null or max_bet is null or min_bet <= max_bet
  )
);

create table dealer_rotation (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  table_id uuid not null references gaming_table(id) on delete cascade,
  staff_id uuid references staff(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index ix_dealer_rotation_table_time
  on dealer_rotation (table_id, started_at desc);

create table rating_slip (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  visit_id uuid references visit(id) on delete set null,
  table_id uuid references gaming_table(id) on delete set null,
  game_settings jsonb,
  average_bet numeric,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  status text not null default 'open',
  policy_snapshot jsonb
);

-- Loyalty / rewards context
create table player_loyalty (
  player_id uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  balance int not null default 0,
  tier text,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (player_id, casino_id)
);

create table loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  player_id uuid not null references player(id) on delete cascade,
  rating_slip_id uuid references rating_slip(id) on delete set null,
  visit_id uuid references visit(id) on delete set null,
  staff_id uuid references staff(id) on delete set null,
  points_earned int not null,
  reason loyalty_reason not null default 'mid_session',
  idempotency_key text,
  average_bet numeric,
  duration_seconds int,
  game_type game_type,
  created_at timestamptz not null default now()
);

create unique index ux_loyalty_ledger_idem
  on loyalty_ledger (idempotency_key)
  where idempotency_key is not null;

create index ix_loyalty_ledger_player_time
  on loyalty_ledger (player_id, created_at desc);

create index ix_loyalty_ledger_rating_slip_time
  on loyalty_ledger (rating_slip_id, created_at desc);

-- Finance context
create table player_financial_transaction (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  visit_id uuid references visit(id) on delete set null,
  rating_slip_id uuid references rating_slip(id) on delete set null,
  amount numeric not null,
  tender_type text,
  created_at timestamptz not null default now(),
  gaming_day date
);

create index ix_fin_txn_player_time
  on player_financial_transaction (player_id, created_at desc);

create index ix_fin_txn_casino_gaming_day
  on player_financial_transaction (casino_id, gaming_day);

create or replace function compute_gaming_day(ts timestamptz, gstart interval)
returns date language sql immutable as $$
  select (date_trunc('day', ts - gstart) + gstart)::date
$$;

create or replace function set_fin_txn_gaming_day()
returns trigger language plpgsql as $$
declare
  gstart interval;
begin
  select coalesce(gaming_day_start_time::interval, interval '06:00:00') into gstart
    from casino_settings
   where casino_id = new.casino_id;

  new.gaming_day := compute_gaming_day(coalesce(new.created_at, now()), gstart);
  return new;
end;
$$;

create trigger trg_fin_gaming_day
  before insert or update on player_financial_transaction
  for each row execute function set_fin_txn_gaming_day();

create or replace function rpc_create_financial_txn(
  p_casino_id uuid,
  p_player_id uuid,
  p_amount numeric,
  p_tender_type text default null,
  p_created_at timestamptz default now(),
  p_visit_id uuid default null,
  p_rating_slip_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into player_financial_transaction (
    player_id,
    casino_id,
    visit_id,
    rating_slip_id,
    amount,
    tender_type,
    created_at
  ) values (
    p_player_id,
    p_casino_id,
    p_visit_id,
    p_rating_slip_id,
    p_amount,
    p_tender_type,
    coalesce(p_created_at, now())
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Compliance context
create table mtl_entry (
  id uuid primary key default gen_random_uuid(),
  patron_uuid uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  staff_id uuid references staff(id) on delete set null,
  rating_slip_id uuid references rating_slip(id) on delete set null,
  visit_id uuid references visit(id) on delete set null,
  amount numeric not null,
  direction text not null,
  area text,
  created_at timestamptz not null default now(),
  idempotency_key text
);

create unique index ux_mtl_entry_idem
  on mtl_entry (idempotency_key)
  where idempotency_key is not null;

create index ix_mtl_casino_time
  on mtl_entry (casino_id, created_at desc);

create table mtl_audit_note (
  id uuid primary key default gen_random_uuid(),
  mtl_entry_id uuid not null references mtl_entry(id) on delete cascade,
  staff_id uuid references staff(id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);

-- Table context invariants
create or replace function assert_table_context_casino()
returns trigger language plpgsql as $$
declare
  v_table_casino uuid;
begin
  select casino_id into v_table_casino
    from gaming_table
   where id = new.table_id;

  if v_table_casino is null then
    raise exception 'Gaming table % not found', new.table_id;
  end if;

  if new.casino_id <> v_table_casino then
    raise exception 'Casino mismatch for table % (expected %, got %)',
      new.table_id, v_table_casino, new.casino_id;
  end if;

  return new;
end;
$$;

create trigger trg_gaming_table_settings_casino
before insert or update on gaming_table_settings
for each row execute function assert_table_context_casino();

create trigger trg_dealer_rotation_casino
before insert or update on dealer_rotation
for each row execute function assert_table_context_casino();

-- Loyalty RPC
create or replace function rpc_issue_mid_session_reward(
  p_casino_id uuid,
  p_player_id uuid,
  p_rating_slip_id uuid,
  p_staff_id uuid,
  p_points int,
  p_idempotency_key text default null,
  p_reason loyalty_reason default 'mid_session'
) returns table (ledger_id uuid, balance_after int)
language plpgsql
as $$
declare
  v_ledger_id uuid;
  v_balance_after int;
  v_now timestamptz := now();
begin
  if p_points <= 0 then
    raise exception 'Points must be positive';
  end if;

  perform 1
    from rating_slip
   where id = p_rating_slip_id
     and player_id = p_player_id
     and casino_id = p_casino_id
     and status in ('open','paused');

  if not found then
    raise exception 'Rating slip not eligible for mid-session reward';
  end if;

  if p_idempotency_key is not null then
    if exists (
      select 1
        from loyalty_ledger
       where idempotency_key = p_idempotency_key
         and casino_id = p_casino_id
    ) then
      return query
        select id,
               (
                 select balance
                   from player_loyalty
                  where player_id = p_player_id
                    and casino_id = p_casino_id
               )
          from loyalty_ledger
         where idempotency_key = p_idempotency_key
           and casino_id = p_casino_id;
      return;
    end if;
  end if;

  insert into loyalty_ledger (
    casino_id,
    player_id,
    rating_slip_id,
    staff_id,
    points_earned,
    reason,
    idempotency_key,
    created_at
  )
  values (
    p_casino_id,
    p_player_id,
    p_rating_slip_id,
    p_staff_id,
    p_points,
    coalesce(p_reason, 'mid_session'),
    p_idempotency_key,
    v_now
  )
  returning id into v_ledger_id;

  update player_loyalty
     set balance = balance + p_points,
         updated_at = v_now
   where player_id = p_player_id
     and casino_id = p_casino_id
  returning balance into v_balance_after;

  return query select v_ledger_id, v_balance_after;
end;
$$;
