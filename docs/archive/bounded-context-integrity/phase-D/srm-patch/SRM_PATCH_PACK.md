# SRM Patch Pack (v3.0.2)

**Purpose:** Keep the Service Responsibility Matrix (SRM) `docs/bounded-context-integrity/phase-D/srm-patch/SERVICE_RESPONSIBILITY_MATRIX.md` canonical (contract-first), snake_case, UUID-based, and enforceable via CI. This refresh folds in the CI checklist catalog (v3.0.1) and the Rating Slip mid-session rewards contract (v3.0.2).

---

## 0) Contract Policy Header (insert near the top of SRM)

```md
> **Contract Policy (Canonical)**
> - Source of truth: **This SRM** (matrix-first). Schema MUST mirror this document.
> - Naming: **lower_snake_case** for tables/columns/enums; no quoted CamelCase.
> - IDs: **uuid** for all PKs/FKs. Text IDs allowed only as secondary business keys.
> - JSON: allowed only for **extensible metadata**; anything used in FKs/RLS/analytics must be a first-class column.
> - Ownership: Records that depend on casino policy MUST carry `casino_id` and (where applicable) `gaming_day`.
> - RLS: Policies derive from ownership in this SRM and must be shipped with each schema change.
```

---

## 1) Global Find-and-Replace (mechanical cleanup)

Apply these renames **throughout the SRM** (DDL + prose + code samples):

| From (legacy / CamelCase) | To (snake_case) |
|---|---|
| `CasinoSettings` | `casino_settings` |
| `GameSettings` | `game_settings` |
| `GamingTable` | `gaming_table` |
| `GamingTableSettings` | `gaming_table_settings` |
| `DealerRotation` | `dealer_rotation` |
| `AuditLog` | `audit_log` |
| `Report` | `report` |
| `Staff` | `staff` |
| `PlayerCasino` / `playercasino` | `player_casino` |
| `RatingSlip` / `ratingslip` | `rating_slip` |
| `PlayerFinancial` / `PlayerFinancialTransaction` | `player_financial_transaction` |
| `MTLEntry` | `mtl_entry` |
| `KeyControlLog` | `key_control_log` |
| `ChipCountEvent` | `chip_count_event` |
| `FillSlip` | `fill_slip` |
| `DropEvent` | `drop_event` |

> **CI tip:** Add a lint rule that fails PRs when SQL contains quoted identifiers like `"[A-Z]"`.

---

## 2) ID & Enum Strategy

Add this **once** in SRM’s “Conventions” section:

```md
**Identifiers**
- All primary keys are `uuid default gen_random_uuid()`; all foreign keys reference `uuid`.
- Business keys (`employee_id`, `table_label`, etc.) are `text` with unique constraints as needed.
```

If any DDL shows `id text` or a `text` FK, update it to `uuid`.

And keep the **enum catalog** aligned:

```sql
create type staff_role as enum ('dealer','pit_boss','admin');
create type staff_status as enum ('active','inactive');
create type game_type as enum ('blackjack','poker','roulette','baccarat');
create type table_status as enum ('inactive','active','closed');
create type loyalty_reason as enum ('mid_session','session_end','manual_adjustment','promotion','correction');
```

CI parses the SRM catalog—any enum declared upstream must exist in the schema before tables that reference it.

---

## 3) Loyalty ↔ Rating Slip stance (no cache + mid-session rewards)

### Canonical stance: **No cache on rating_slip**

Remove all references to `rating_slip.points`. Replace with:

```md
**Loyalty is the sole source of truth for rewards.**
`rating_slip` stores telemetry only (time, average_bet, policy snapshot, state).
Mid-session rewards are issued via `rpc_issue_mid_session_reward` which appends to `loyalty_ledger` and updates `player_loyalty`.
```

Delete any alternative cache wording from the SRM. If a denormalized cache is reintroduced in the future, it must reappear here with triggers + reconciliation.

---

## 4) Canonical DDL Blocks (drop-in replacements)

### 4.1 Company, Casino, Staff

```sql
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
  gaming_day_start interval not null default interval '06:00:00',
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
```

### 4.2 Player, Membership, Loyalty

```sql
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

create table player_loyalty (
  player_id uuid primary key references player(id) on delete cascade,
  balance int not null default 0,
  tier text,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create type loyalty_reason as enum ('mid_session','session_end','manual_adjustment','promotion','correction');

create table loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
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
create unique index on loyalty_ledger (idempotency_key) where idempotency_key is not null;
create index on loyalty_ledger (player_id, created_at desc);
create index on loyalty_ledger (rating_slip_id, created_at desc);
```

### 4.3 Game Policy & Table Context

```sql
create table game_settings (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  game_type game_type not null,
  min_bet numeric,
  max_bet numeric,
  rotation_interval_minutes int,
  unique (casino_id, game_type),
  constraint chk_game_bet_range check (
    min_bet is null or max_bet is null or min_bet <= max_bet
  )
);

create type table_status as enum ('inactive','active','closed');

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
  table_id uuid not null references gaming_table(id) on delete cascade,
  staff_id uuid references staff(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
```

### 4.4 Visit, Rating Slip (no points cache), Finance, MTL

```sql
create table visit (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

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

create table player_financial_transaction (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  amount numeric not null,
  tender_type text,
  created_at timestamptz not null default now(),
  gaming_day date not null
);

create or replace function compute_gaming_day(ts timestamptz, gstart interval)
returns date language sql immutable as $$
  select (date_trunc('day', ts - gstart) + gstart)::date
$$;

create or replace function set_fin_txn_gaming_day()
returns trigger language plpgsql as $$
declare gstart interval;
begin
  select gaming_day_start into gstart
  from casino_settings where casino_id = new.casino_id;
  if gstart is null then gstart := interval '06:00:00';
  end if;
  new.gaming_day := compute_gaming_day(new.created_at, gstart);
  return new;
end$$;

create trigger trg_fin_gaming_day
before insert or update on player_financial_transaction
for each row execute function set_fin_txn_gaming_day();

create table mtl_entry (
  id uuid primary key default gen_random_uuid(),
  patron_uuid uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  amount numeric not null,
  direction text not null,
  area text,
  created_at timestamptz not null default now(),
  idempotency_key text
);
create unique index on mtl_entry (idempotency_key) where idempotency_key is not null;
```

---

## 5) Mid-Session Reward RPC (contract-first)

Declare and document the atomic issuance entry point:

```sql
create or replace function rpc_issue_mid_session_reward(
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
  v_now timestamptz := now();
begin
  if p_points <= 0 then
    raise exception 'Points must be positive';
  end if;

  perform 1
    from rating_slip
   where id = p_rating_slip_id
     and player_id = p_player_id
     and status in ('open','paused');

  if not found then
    raise exception 'Rating slip not eligible for mid-session reward';
  end if;

  if p_idempotency_key is not null then
    if exists (
      select 1 from loyalty_ledger where idempotency_key = p_idempotency_key
    ) then
      return query
        select id, balance_after
          from loyalty_ledger
         where idempotency_key = p_idempotency_key;
      return;
    end if;
  end if;

  insert into loyalty_ledger (
    player_id,
    rating_slip_id,
    staff_id,
    points_earned,
    reason,
    idempotency_key,
    created_at
  )
  values (
    p_player_id,
    p_rating_slip_id,
    p_staff_id,
    p_points,
    coalesce(p_reason, 'mid_session'),
    p_idempotency_key,
    v_now
  )
  returning id into ledger_id;

  update player_loyalty
     set balance = balance + p_points,
         updated_at = v_now
   where player_id = p_player_id
  returning balance into balance_after;

  return query select ledger_id, balance_after;
end $$;
```

CI expects this function when the checklist bullet `Atomic issuance` is present.

---

## 6) Sample Code Corrections (Supabase)

```ts
// Casino settings (by casino)
const { data, error } = await supabase
  .from('casino_settings')
  .select('*')
  .eq('casino_id', casinoId)
  .single();

// Loyalty balance (single source of truth)
const { data: loyalty } = await supabase
  .from('player_loyalty')
  .select('balance, tier')
  .eq('player_id', playerId)
  .single();

// Mid-session reward (server-side; supply a stable idempotency key)
const { data: ledger, error: rewardError } = await supabase
  .rpc('rpc_issue_mid_session_reward', {
    p_player_id: playerId,
    p_rating_slip_id: ratingSlipId,
    p_staff_id: staffId,
    p_points: calculatedPoints,
    p_idempotency_key: requestId
  });
```

---

## 7) RLS Statement Template (include per domain)

```md
**RLS (excerpt)**
- Tables owned by casino scope (`casino_id`) MUST include:
  - Read: staff of same `casino_id` (role-gated).
  - Write: admins of same `casino_id`.
- Cross-domain joins rely on declared FKs (no implicit string keys).
```

---

## 8) SRM Changelog (new file or updated entry)

Create `docs/patterns/SRM_CHANGELOG.md`:

```md
# SRM Changelog

## v3.0.2
- Added CI-enforced enum catalog, index catalog, and service acceptance checklists.
- Defined mid-session reward stance: Rating Slip telemetry only, Loyalty sole source of truth.
- Added `loyalty_reason` enum, ledger columns (`staff_id`, `rating_slip_id`, `idempotency_key`) and partial unique index.
- Declared `rpc_issue_mid_session_reward` as atomic entry point with idempotency guards.
- Extended `rating_slip` schema with `status` lifecycle and optional `policy_snapshot`.

## v3.0.0
- Standardized naming to lower_snake_case; removed quoted CamelCase.
- Unified identifier strategy to uuid for all PKs/FKs.
- Clarified JSON usage (extensions only).
- Loyalty is SoT; removed `rating_slip.points` cache in contract. (If you keep cache, record opposite here.)
- Reinstated casino ownership (`casino_id`) across TableContext, Finance, MTL.
- Added gaming_day computation contract for financial transactions.
- Added unique constraints (e.g., `game_settings` unique (casino_id, game_type)) and bet range checks.
```

---

## 9) Canonical Readiness Checklist (paste into SRM footer)

```md
**Canonical Readiness Checklist**
- [ ] All identifiers in this doc are lower_snake_case (DDL + code samples).
- [ ] All PKs/FKs are uuid; any text IDs are documented business keys.
- [ ] Ownership (`casino_id`) appears on all casino-scoped tables.
- [ ] Finance includes `gaming_day` with trigger defined.
- [ ] Loyalty vs Rating Slip stance is singular (no cache) and mid-session RPC documented.
- [ ] RLS expectations are stated per domain (read/write ownership).
- [ ] CI catalog sections (enums, indexes, checklists, deprecations) are in sync with schema.
```
