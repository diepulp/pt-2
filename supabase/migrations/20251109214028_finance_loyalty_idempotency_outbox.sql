-- Add idempotency key to player_financial_transaction
alter table if exists public.player_financial_transaction
  add column if not exists idempotency_key text;

create unique index if not exists ux_fin_txn_idempotency
  on public.player_financial_transaction (casino_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.rpc_create_financial_txn(
  p_casino_id uuid,
  p_player_id uuid,
  p_amount numeric,
  p_tender_type text default null,
  p_created_at timestamptz default now(),
  p_visit_id uuid default null,
  p_rating_slip_id uuid default null,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.player_financial_transaction as t (
    id,
    player_id,
    casino_id,
    visit_id,
    rating_slip_id,
    amount,
    tender_type,
    created_at,
    idempotency_key
  ) values (
    gen_random_uuid(),
    p_player_id,
    p_casino_id,
    p_visit_id,
    p_rating_slip_id,
    p_amount,
    p_tender_type,
    coalesce(p_created_at, now()),
    p_idempotency_key
  )
  on conflict (casino_id, idempotency_key) where idempotency_key is not null
  do update set idempotency_key = excluded.idempotency_key
  returning t.id into v_id;

  if v_id is null and p_idempotency_key is not null then
    select id into v_id
      from public.player_financial_transaction
     where casino_id = p_casino_id
       and idempotency_key = p_idempotency_key;
  end if;

  return v_id;
end;
$$;

-- Finance outbox for downstream side effects
create table if not exists public.finance_outbox (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references public.casino(id) on delete cascade,
  ledger_id uuid not null references public.player_financial_transaction(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempt_count int not null default 0
);

create index if not exists ix_finance_outbox_unprocessed
  on public.finance_outbox (casino_id, created_at desc)
  where processed_at is null;

-- Loyalty outbox for downstream side effects
create table if not exists public.loyalty_outbox (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references public.casino(id) on delete cascade,
  ledger_id uuid not null references public.loyalty_ledger(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempt_count int not null default 0
);

create index if not exists ix_loyalty_outbox_unprocessed
  on public.loyalty_outbox (casino_id, created_at desc)
  where processed_at is null;

-- Pure reward policy evaluation helper
create or replace function public.evaluate_mid_session_reward_policy(
  p_average_bet numeric,
  p_minutes_played integer,
  p_policy jsonb
) returns table (
  eligible boolean,
  recommended_points integer
)
language plpgsql
stable
as $$
declare
  v_min_bet numeric := coalesce((p_policy ->> 'min_average_bet')::numeric, 0);
  v_min_minutes integer := coalesce((p_policy ->> 'min_minutes_played')::integer, 0);
  v_points integer := coalesce((p_policy ->> 'base_points')::integer, 0);
begin
  eligible := (coalesce(p_average_bet, 0) >= v_min_bet)
           and (coalesce(p_minutes_played, 0) >= v_min_minutes);
  recommended_points := case when eligible then v_points else 0 end;
  return next;
end;
$$;
