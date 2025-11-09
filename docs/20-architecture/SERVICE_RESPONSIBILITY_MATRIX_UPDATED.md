# Service Responsibility Matrix - Bounded Context Integrity (CANONICAL)

> **Version**: 3.0.2 (Rating Slip Mid-Session Rewards) - PATCHED
> **Date**: 2025-10-21
> **Status**: CANONICAL - Contract-First, snake_case, UUID-based
> **Purpose**: Maintain bounded context integrity across all service domains

> **Contract Policy (Canonical)**
> - Source of truth: **This SRM** (matrix-first). Schema MUST mirror this document.
> - Naming: **lower_snake_case** for tables/columns/enums; no quoted CamelCase.
> - IDs: **uuid** for all PKs/FKs. Text IDs allowed only as secondary business keys.
> - JSON: allowed only for **extensible metadata**; anything used in FKs/RLS/analytics must be a first-class column.
> - Ownership: Records that depend on casino policy MUST carry `casino_id` and (where applicable) `gaming_day`.
> - RLS: Policies derive from ownership in this SRM and must be shipped with each schema change.

> **Conventions**
> **Identifiers**
> - All primary keys are `uuid default gen_random_uuid()`; all foreign keys reference `uuid`.
> - Business keys (`employee_id`, `table_label`, etc.) are `text` with unique constraints as needed.

---

## CI Validation Catalogs

### Centralized Enum Catalog

```sql
create type staff_role as enum ('dealer','pit_boss','admin');
create type staff_status as enum ('active','inactive');
create type game_type as enum ('blackjack','poker','roulette','baccarat');
create type table_status as enum ('inactive','active','closed');
create type loyalty_reason as enum ('mid_session','session_end','manual_adjustment','promotion','correction');
-- Optional (declare when standardized)
-- create type mtl_direction as enum ('in','out');
```
- Migration order: enums first, then tables that consume them.
- Change policy: additive values only; removals require deprecation plus data rewrite.

### Event / Telemetry Notes

**rating_slip.events** (reference, non-persistent)
```json
{
  "event": "rating_slip.updated",
  "rating_slip_id": "uuid",
  "player_id": "uuid",
  "casino_id": "uuid",
  "average_bet": 25.0,
  "minutes_played": 42,
  "game_type": "blackjack",
  "at": "2025-10-21T19:15:00Z"
}
```

**loyalty.ledger_appended**
```json
{
  "event": "loyalty.ledger_appended",
  "ledger_id": "uuid",
  "player_id": "uuid",
  "points_earned": 120,
  "reason": "session_end",
  "rating_slip_id": "uuid|null",
  "at": "2025-10-21T19:16:00Z"
}
```
- Contract: event keys mirror table FKs and types in this SRM; no ad-hoc string keys.

### Index Strategy Stubs

```sql
-- Loyalty lookups
create index if not exists ix_loyalty_ledger_player_time
  on loyalty_ledger (player_id, created_at desc);

create index if not exists ix_loyalty_ledger_rating_slip_time
  on loyalty_ledger (rating_slip_id, created_at desc);

-- Game settings uniqueness
create unique index if not exists ux_game_settings_casino_type
  on game_settings (casino_id, game_type);

-- Table rotations (recent first)
create index if not exists ix_dealer_rotation_table_time
  on dealer_rotation (table_id, started_at desc);

-- Finance reporting
create index if not exists ix_fin_txn_player_time
  on player_financial_transaction (player_id, created_at desc);

create index if not exists ix_fin_txn_casino_gaming_day
  on player_financial_transaction (casino_id, gaming_day);

-- MTL compliance scans
create index if not exists ix_mtl_casino_time
  on mtl_entry (casino_id, created_at desc);
```

### Deprecation Policy

```md
**DEPRECATIONS**
- `rating_slip.points` — deprecated in v3.0.0, EOL v3.2.0. Replace with `player_loyalty.balance`.
- `dealer_rotation.table_string_id` (legacy alias `tableStringId`) — deprecated in v3.0.0, EOL v3.1.0. Use FK `dealer_rotation.table_id`.
```
- CI rule: fail when an EOL item exists past its target version (5 business day grace max).
- Every deprecation must name rationale, migration/backfill plan, owner, and EOL release.

---

## Service Responsibility Matrix

| Domain | Service | Owns | References | Aggregates | Responsibilities |
|--------|---------|------|------------|------------|------------------|
| **Foundational** | `CasinoService` | • Casino registry<br>• **casino_settings** (EXCLUSIVE WRITE)<br>• **Timezone & gaming day** (temporal authority)<br>• **Compliance thresholds** (CTR, watchlist)<br>• Game config templates<br>• Staff & access control<br>• Corporate grouping<br>• Audit logs<br>• Reports | • Company (FK, corporate parent) | • All operational domains<br>• Policy inheritance<br>• Configuration distribution | **Root temporal authority & global policy** |
| **Identity** | `PlayerService` | • Player profile<br>• Contact info<br>• Identity data | • Casino (FK, enrollment) | • Visits<br>• rating_slips<br>• Loyalty | Identity management |
| **Operational** | `TableContextService` | • Gaming tables<br>• Table settings<br>• Dealer rotations<br>• Fills/drops/chips (chip custody telemetry)<br>• Inventory slips<br>• Break alerts<br>• Key control logs | • Casino (FK)<br>• Staff (FK, dealers) | • Performance metrics<br>• MTL events<br>• Table snapshots | **Table lifecycle & operational telemetry** |
| **Session** | `VisitService` | • Visit sessions<br>• Check-in/out<br>• Visit status | • Player (FK)<br>• Casino (FK) | • rating_slips<br>• Financials<br>• MTL entries | Session lifecycle |
| **Telemetry** | `RatingSlipService` | • Average bet<br>• Time played<br>• Game settings<br>• Seat number<br>• `status`/`policy_snapshot` | • Player (FK)<br>• Visit (FK)<br>• Gaming Table (FK) | – | **Gameplay measurement** |
| **Reward** | `LoyaltyService` | • **Points calculation logic**<br>• Loyalty ledger<br>• Tier status<br>• Tier rules<br>• Preferences | • Player (FK)<br>• rating_slip (FK)<br>• Visit (FK) | • Points history<br>• Tier progression | **Reward policy & assignment** |
| **Finance** | `PlayerFinancialService` | • `player_financial_transaction` (OWNS - append-only)<br>• **Financial event types**<br>• Idempotency enforcement<br>• **PROVIDES**: 3 aggregation views | • Player (FK)<br>• Visit (FK - READ-ONLY)<br>• rating_slip (FK - compat)<br>• Casino (FK - temporal) | • Visit consumes summaries (READ)<br>• MTL refs gaming-day aggs | **Financial ledger (SoT)** |
| **Compliance** | `MTLService` | • **Cash transaction log**<br>• `mtl_entry` (immutable)<br>• `mtl_audit_note` (append)<br>• Gaming day calc (trigger)<br>• Threshold detection<br>• Compliance exports | • `casino_settings` (READ-ONLY)<br>• Player (FK, optional)<br>• Casino (FK)<br>• Staff (FK)<br>• rating_slip (FK, optional)<br>• Visit (FK, optional) | • Daily aggregates<br>• Threshold monitoring<br>• CTR/Watchlist detection | **AML/CTR compliance** |
| **Observability** | `PerformanceService` | • `performance_metrics`<br>• `performance_alerts`<br>• `performance_thresholds`<br>• `performance_config`<br>• Alert generation | • No FK dependencies<br>• Metadata correlation<br>• Observes all (read-only) | • MTL transaction volume<br>• System performance<br>• Threshold breaches | **Real-time monitoring** |

---

## Casino Service - Foundational Context

### ✅ CasinoService (Root Authority & Global Policy)

**OWNS:**
- **Casino registry** (master records for licensed gaming establishments)
- **casino_settings** table (EXCLUSIVE WRITE - Single temporal authority)
- `casino` table (canonical casino identity)
- `company` table (corporate ownership hierarchy)
- `game_settings` table (game configuration templates)
- `staff` table (staff registry and access control)
- `player_casino` table (player enrollment associations)
- `audit_log` table (cross-domain event logging)
- `report` table (administrative reports)

**PROVIDES TO (All Downstream Contexts):**
- **TableContext**: Casino ID linkage, game config templates, staff authorization
- **Visit**: Casino jurisdiction, timezone, gaming day boundaries
- **RatingSlip**: Casino settings for gameplay telemetry normalization
- **MTL**: Gaming day start time, compliance thresholds, timezone
- **Loyalty**: Casino-specific tier rules (future)
- **Performance**: Timezone and threshold normalization
- **Audit/Compliance**: Centralized audit logging and regulatory reporting

**BOUNDED CONTEXT**: "What are the operational parameters and policy boundaries of this casino property?"

### Acceptance Checklist (CI)
- [ ] **Tables present:** `company`, `casino`, `casino_settings`, `staff`
- [ ] **PK/FK types:** all `uuid`; `casino_settings.casino_id` is `uuid unique not null`
- [ ] **Temporal config:** `casino_settings.gaming_day_start_time time not null default '06:00'`
- [ ] **Ownership:** `casino_id` on `staff`
- [ ] **Constraints:** `casino_settings` 1:1 via unique `(casino_id)`
- [ ] **RLS:** staff read/write scoped to their `casino_id` (admins write)
- [ ] **Access paths:** `casino_settings` by `casino_id`; `staff` by `casino_id`, `employee_id`

**RLS (excerpt)**
- Tables owned by casino scope (`casino_id` present) MUST include:
  - Read: staff of same `casino_id` (role-gated).
  - Write: admins of same `casino_id`.
- Cross-domain joins must rely on declared FKs (no implicit string keys).

### Schema (Core Entities)

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
```

### Sample Code

```typescript
// Casino settings (by casino)
const { data, error } = await supabase
  .from('casino_settings')
  .select('*')
  .eq('casino_id', casino_id)
  .single();
```

---

## Player & Visit - Identity & Session Context

### Player & Visit Acceptance Checklist (CI)
- [ ] **Tables present:** `player`, `player_casino`, `visit`
- [ ] **PK/FK types:** all `uuid`; `player_casino` PK `(player_id, casino_id)`
- [ ] **Constraints:** `player_casino.status default 'active'`
- [ ] **RLS:** membership reads within same `casino_id`; writes by enrollment service
- [ ] **Access paths:** membership by `(player_id, casino_id)`; visits by `(player_id, started_at desc)`

**RLS (excerpt)**
- Tables owned by casino scope (`casino_id` present) MUST include:
  - Read: staff of same `casino_id` (role-gated).
  - Write: admins of same `casino_id`.
- Cross-domain joins must rely on declared FKs (no implicit string keys).

### Schema

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

create table visit (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
```

---

## Loyalty Service - Reward Context

### ✅ LoyaltyService (Reward Policy Engine)

**OWNS:**
- **Point calculation logic** (business rules, formula, multipliers)
- `loyalty_ledger` table (source of truth for all points transactions)
- `player_loyalty` table (per-casino balance, tier status)
- Tier progression rules
- Point multipliers and conversion rates
- Reward preferences

**REFERENCES:**
- `casino_id` - Casino-scoped ownership and RLS anchor
- `player_id` - Who earned the points
- `rating_slip_id` - Source of gameplay telemetry
- `visit_id` - Session context
- `staff_id` - Who issued the reward

**BOUNDED CONTEXT**: "What is this gameplay worth in rewards?"

**Canonical stance:** **Loyalty is the sole source of truth for rewards.**
`rating_slip` stores telemetry only (time, average_bet, policy snapshot, state) and never caches reward balances. Mid-session rewards are issued via `rpc_issue_mid_session_reward`, which appends to `loyalty_ledger` and updates `player_loyalty` in one transaction.

### Acceptance Checklist (CI)
- [ ] **Tables present:** `player_loyalty`, `loyalty_ledger`
- [ ] **Ownership:** both tables include `casino_id uuid references casino(id)`; `player_loyalty` primary key `(player_id, casino_id)`
- [ ] **Ledger columns:** `staff_id`, `rating_slip_id`, `reason loyalty_reason`, `idempotency_key`
- [ ] **Indices:** `ux_loyalty_ledger_idem` partial unique on `idempotency_key`; `ix_loyalty_ledger_player_time`; `ix_loyalty_ledger_rating_slip_time`
- [ ] **PK/FK types:** all `uuid`; ledger FKs resolve to `casino`, `player`, `rating_slip`, `staff`
- [ ] **Atomic issuance:** `rpc_issue_mid_session_reward` exists and updates ledger + `player_loyalty` balance in one transaction
- [ ] **RLS:** append-only inserts by authorized roles; reads scoped to same `casino_id`

**RLS (excerpt)**
- Tables owned by casino scope (`casino_id` present) MUST include:
  - Read: staff of same `casino_id` (role-gated).
  - Write: admins of same `casino_id`.
- Cross-domain joins must rely on declared FKs (no implicit string keys).

### Schema

```sql
create table player_loyalty (
  player_id uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  balance int not null default 0,
  tier text,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (player_id, casino_id)
);

create type loyalty_reason as enum ('mid_session','session_end','manual_adjustment','promotion','correction');

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
create unique index if not exists ux_loyalty_ledger_idem on loyalty_ledger (idempotency_key) where idempotency_key is not null;
create index if not exists ix_loyalty_ledger_player_time on loyalty_ledger (player_id, created_at desc);
create index if not exists ix_loyalty_ledger_rating_slip_time on loyalty_ledger (rating_slip_id, created_at desc);
```

### Mid-Session Reward RPC (Atomic Issuance)

```sql
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
end $$;
```

### Sample Code

```typescript
// Loyalty balance (single source of truth)
const { data: loyalty } = await supabase
  .from('player_loyalty')
  .select('balance, tier')
  .eq('player_id', player_id)
  .eq('casino_id', casino_id)
  .single();

// Mid-session reward (server-side; supply a stable idempotency key)
const { data: ledger, error: reward_error } = await supabase
  .rpc('rpc_issue_mid_session_reward', {
    p_casino_id: casino_id,
    p_player_id: player_id,
    p_rating_slip_id: rating_slip_id,
    p_staff_id: staff_id,
    p_points: calculated_points,
    p_idempotency_key: request_id
  });
```

---

## TableContextService

### ✅ TableContextService (Operational Telemetry & Lifecycle)

**OWNS:**
- **Table lifecycle management** (provision, activate, deactivate)
- `gaming_table` table (canonical registry)
- `gaming_table_settings` table (configuration history)
- `dealer_rotation` table (dealer assignments and rotations)
- **Chip custody telemetry** for fills, credits, inventory snapshots, and drop custody events (non-monetary)

**PROVIDES TO:** Visit, RatingSlip, Loyalty, Finance, and Compliance contexts that need authoritative table metadata and casino alignment.

**BOUNDED CONTEXT**: "What is the operational state and chip custody posture of this gaming table?"

### Acceptance Checklist (CI)
- [ ] **Tables present:** `game_settings`, `gaming_table`, `gaming_table_settings`, `dealer_rotation`, `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_drop_event`
- [ ] **PK/FK types:** all `uuid`; chip custody tables reference `gaming_table.id`
- [ ] **Ownership:** `casino_id` required on all tables (legacy + chip custody)
- [ ] **Constraints:** `ux_game_settings_casino_type` unique index; bet range checks; `assert_table_context_casino` trigger on `gaming_table_settings` + `dealer_rotation`; custody tables require `request_id not null` for idempotency
- [ ] **RLS:** read for staff of same casino; writes by admins/pit bosses; custody tables extend to cage/count team roles
- [ ] **Access paths:** tables by `casino_id`; rotations by `(table_id, started_at desc)`; custody events by `(casino_id, table_id, created_at desc)`

**RLS (excerpt)**
- Tables owned by casino scope (`casino_id` present) MUST include:
  - Read: staff of same `casino_id` (role-gated).
  - Write: admins of same `casino_id`.
- Cross-domain joins must rely on declared FKs (no implicit string keys).

### Core Schema (Lifecycle & Settings)

```sql
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

create unique index if not exists ux_game_settings_casino_type
  on game_settings (casino_id, game_type);

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

create index if not exists ix_dealer_rotation_table_time
  on dealer_rotation (table_id, started_at desc);

create or replace function assert_table_context_casino()
returns trigger
language plpgsql
as $$
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
end $$;

create trigger trg_gaming_table_settings_casino
before insert or update on gaming_table_settings
for each row execute function assert_table_context_casino();

create trigger trg_dealer_rotation_casino
before insert or update on dealer_rotation
for each row execute function assert_table_context_casino();
```

### Chip Custody Extensions (Non-Monetary)

**Responsibility:** Capture operational custody of chips (inventory, fills, credits, drop movement) without storing monetary ledgers. Monetary counting remains with `PlayerFinancialService`.

#### Owns (Data)
- `table_inventory_snapshot` — opening/closing/rundown counts; dual signers; discrepancies
- `table_fill` — chip replenishment to table (idempotent by request id)
- `table_credit` — chips returned from table to cage (idempotent by request id)
- `table_drop_event` — drop box removal/delivery; custody timeline (`gaming_day`, `drop_box_id`, `seq_no`, `delivered_scan_at`)

#### References (Read-Only)
- `casino`, `gaming_table`, `staff`, `report`

#### Does Not Own
- **Finance**: monetary ledgers, drop count sheets, marker workflows
- **Compliance/MTL**: CTR/SAR thresholds and filings
- **Loyalty**: reward ledger/balance

#### Extended Schema
```sql
-- inventory snapshots (open/close/rundown)
create table if not exists table_inventory_snapshot (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  table_id uuid not null references gaming_table(id) on delete cascade,
  snapshot_type text not null check (snapshot_type in ('open','close','rundown')),
  chipset jsonb not null,
  counted_by uuid references staff(id),
  verified_by uuid references staff(id),
  discrepancy_cents int default 0,
  note text,
  created_at timestamptz not null default now()
);

-- fills (chips to table)
create table if not exists table_fill (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  table_id uuid not null references gaming_table(id) on delete cascade,
  request_id text not null,
  chipset jsonb not null,
  amount_cents int not null,
  requested_by uuid references staff(id),
  delivered_by uuid references staff(id),
  received_by uuid references staff(id),
  slip_no text,
  created_at timestamptz not null default now(),
  unique (casino_id, request_id)
);

-- credits (chips to cage)
create table if not exists table_credit (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  table_id uuid not null references gaming_table(id) on delete cascade,
  request_id text not null,
  chipset jsonb not null,
  amount_cents int not null,
  authorized_by uuid references staff(id),
  sent_by uuid references staff(id),
  received_by uuid references staff(id),
  slip_no text,
  created_at timestamptz not null default now(),
  unique (casino_id, request_id)
);

-- drop custody events (no money here)
create table if not exists table_drop_event (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  table_id uuid not null references gaming_table(id) on delete cascade,
  seal_no text,
  drop_box_id text,
  gaming_day date,
  seq_no int,
  removed_by uuid references staff(id),
  witnessed_by uuid references staff(id),
  removed_at timestamptz not null default now(),
  delivered_at timestamptz,
  delivered_scan_at timestamptz,
  note text
);
```

#### RPC (canonical write paths)
```sql
-- inventory snapshots
create or replace function rpc_log_table_inventory_snapshot(
  p_casino_id uuid,
  p_table_id uuid,
  p_snapshot_type text,
  p_chipset jsonb,
  p_counted_by uuid default null,
  p_verified_by uuid default null,
  p_discrepancy_cents int default 0,
  p_note text default null
) returns table_inventory_snapshot language sql security definer as $$
  insert into table_inventory_snapshot (
    casino_id, table_id, snapshot_type, chipset,
    counted_by, verified_by, discrepancy_cents, note
  ) values (
    p_casino_id, p_table_id, p_snapshot_type, p_chipset,
    p_counted_by, p_verified_by, coalesce(p_discrepancy_cents, 0), p_note
  )
  returning *;
$$;

-- idempotent fills
create or replace function rpc_request_table_fill(
  p_casino_id uuid, p_table_id uuid, p_chipset jsonb, p_amount_cents int,
  p_requested_by uuid, p_delivered_by uuid, p_received_by uuid,
  p_slip_no text, p_request_id text
) returns table_fill language sql security definer as $$
  insert into table_fill (casino_id, table_id, chipset, amount_cents,
    requested_by, delivered_by, received_by, slip_no, request_id)
  values (p_casino_id, p_table_id, p_chipset, p_amount_cents,
    p_requested_by, p_delivered_by, p_received_by, p_slip_no, p_request_id)
  on conflict (casino_id, request_id) do update
    set delivered_by = excluded.delivered_by,
        received_by = excluded.received_by,
        amount_cents = excluded.amount_cents
  returning *;
$$;

-- idempotent credits
create or replace function rpc_request_table_credit(
  p_casino_id uuid, p_table_id uuid, p_chipset jsonb, p_amount_cents int,
  p_authorized_by uuid, p_sent_by uuid, p_received_by uuid,
  p_slip_no text, p_request_id text
) returns table_credit language sql security definer as $$
  insert into table_credit (casino_id, table_id, chipset, amount_cents,
    authorized_by, sent_by, received_by, slip_no, request_id)
  values (p_casino_id, p_table_id, p_chipset, p_amount_cents,
    p_authorized_by, p_sent_by, p_received_by, p_slip_no, p_request_id)
  on conflict (casino_id, request_id) do update
    set received_by = excluded.received_by,
        amount_cents = excluded.amount_cents
  returning *;
$$;

-- drop custody event
create or replace function rpc_log_table_drop(
  p_casino_id uuid,
  p_table_id uuid,
  p_drop_box_id text,
  p_seal_no text,
  p_removed_by uuid,
  p_witnessed_by uuid,
  p_removed_at timestamptz default now(),
  p_delivered_at timestamptz default null,
  p_delivered_scan_at timestamptz default null,
  p_gaming_day date default null,
  p_seq_no int default null,
  p_note text default null
) returns table_drop_event language sql security definer as $$
  insert into table_drop_event (casino_id, table_id, drop_box_id, seal_no,
    removed_by, witnessed_by, removed_at, delivered_at, delivered_scan_at,
    gaming_day, seq_no, note)
  values (p_casino_id, p_table_id, p_drop_box_id, p_seal_no,
    p_removed_by, p_witnessed_by, coalesce(p_removed_at, now()), p_delivered_at, p_delivered_scan_at,
    p_gaming_day, p_seq_no, p_note)
  returning *;
$$;
```

#### RLS (sketch)
- **Read:** same-casino for `pit_boss`, `dealer`, `accounting_read`, `cage_read`, `compliance_read` (as appropriate).  
- **Write:** `pit_boss` for inventory/fill/credit/drop; `cage`/`count_team` limited to their custody flows.  
- Enforce `casino_id = current_setting('app.casino_id')::uuid` and role allow-lists.

#### Events & Observability
Emit: `table.inventory_open|close|rundown_recorded`, `table.fill_requested|completed`, `table.credit_requested|completed`, `table.drop_removed|delivered`.  
Payload keys: `{casino_id, table_id, staff_id[], slip_no|request_id, amount_cents, chipset, ts}`.

#### KPIs
- Time-to-fill; fills/credits per table/shift; drop removed→delivered SLA; % closes with zero discrepancy.

---

## RatingSlip Service - Telemetry Context (Updated)

### ✅ RatingSlipService (Gameplay Telemetry)

**OWNS:**
- `average_bet` - How much player wagered (INPUT for points)
- `start_time` / `end_time` - Duration of play (INPUT for points)
- `game_settings` - Game configuration (INPUT for points calculation)
- `seat_number` - Where player sat
- `status` - Rating slip lifecycle state
- `policy_snapshot` - Reward policy at time of play

**DOES NOT STORE:**
- Reward balances or points; **Loyalty** remains the sole source of truth.

**BOUNDED CONTEXT**: "What gameplay activity occurred?"

### Acceptance Checklist (CI)
- [ ] **Table contract:** `rating_slip` excludes any points cache column
- [ ] **Columns:** `status text default 'open'`, optional `policy_snapshot jsonb`, immutable `player_id`/`casino_id`
- [ ] **States:** supports at least `open`, `closed`, optional `paused`; transitions enforced
- [ ] **Eligibility guard:** mid-session rewards only when `status` ∈ (`open`,`paused?`)
- [ ] **RLS:** same-casino read; updates restricted to authorized staff roles
- [ ] **Telemetry focus:** updates limited to gameplay metrics (`average_bet`, `start_time`, `end_time`)

**RLS (excerpt)**
- Tables owned by casino scope (`casino_id` present) MUST include:
  - Read: staff of same `casino_id` (role-gated).
  - Write: admins of same `casino_id`.
- Cross-domain joins must rely on declared FKs (no implicit string keys).

### Schema

```sql
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
```

### Lifecycle & States
- `created` → `open` → (`paused`/`resumed` optional) → `closed` → `archived?`
- `player_id`, `casino_id`, and `start_time` immutable post-create; `end_time` required at close.
- `status` drives eligibility: mid-session rewards limited to slips where `status = 'open'` (or `paused` if explicitly permitted by policy).
- `policy_snapshot` captures the casino's reward thresholds at issuance time for audit.

### Mid-Session Reward Contract
- Rating Slip never issues rewards directly; it emits telemetry consumed by `rpc_issue_mid_session_reward`.
- Mid-session issuance requires `casino_id`, `rating_slip_id`, `player_id`, `staff_id`, and (optionally) an `idempotency_key`.
- The RPC enforces casino ownership alignment, slip state (`open`), configured caps, and appends ledger entries in the Loyalty context.
- Any attempt to award while `status = 'closed'` (or outside policy) must raise an error.

---

## PlayerFinancial Service - Finance Context

**RLS (excerpt)**
- Tables owned by casino scope (`casino_id` present) MUST include:
  - Read: staff of same `casino_id` (role-gated).
  - Write: admins of same `casino_id`.
- Cross-domain joins must rely on declared FKs (no implicit string keys).

**RLS Expectations**
- Reads scoped by `casino_id` for finance/compliance roles.
- Inserts limited to cashier/compliance services with matching `casino_id`.
- Updates restricted to idempotent correction flows; deletes prohibited.

### Acceptance Checklist (CI)
- [ ] **Table present:** `player_financial_transaction`
- [ ] **Ownership:** `casino_id` required on every row; `gaming_day` derived via trigger
- [ ] **References:** optional `visit_id` (read-only) and `rating_slip_id` (compat) FKs maintained
- [ ] **Indices:** `ix_fin_txn_player_time`; `ix_fin_txn_casino_gaming_day`
- [ ] **RLS:** read/write policies enforce same-casino access; deletes disabled
- [ ] **Triggers:** `trg_fin_gaming_day` active with `set_fin_txn_gaming_day()`
- [ ] **RPC write path:** `rpc_create_financial_txn` is the supported insert interface

### Schema

```sql
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

create index if not exists ix_fin_txn_player_time
  on player_financial_transaction (player_id, created_at desc);

create index if not exists ix_fin_txn_casino_gaming_day
  on player_financial_transaction (casino_id, gaming_day);

create or replace function compute_gaming_day(ts timestamptz, gstart interval)
returns date language sql immutable as $$
  select (date_trunc('day', ts - gstart) + gstart)::date
$$;

create or replace function set_fin_txn_gaming_day()
returns trigger language plpgsql as $$
declare gstart interval;
begin
  select coalesce(gaming_day_start_time::interval, interval '06:00:00') into gstart
  from casino_settings where casino_id = new.casino_id;
  new.gaming_day := compute_gaming_day(coalesce(new.created_at, now()), gstart);
  return new;
end$$;

create trigger trg_fin_gaming_day
before insert or update on player_financial_transaction
for each row execute function set_fin_txn_gaming_day();
```

### Write Contract (Gaming Day Patch)
- `gaming_day` is derived inside the database trigger; client callers MUST omit it.
- All finance writes go through the canonical RPC so the trigger can populate `gaming_day` consistently.
-- Trigger ensures `gaming_day` populated from casino boundary; application callers MUST omit it.

```sql
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
```

### Sample Code

```typescript
import { createFinancialTransaction } from '@/lib/finance';

await createFinancialTransaction(supabase, {
  casinoId,
  playerId,
  amount,
  tenderType,
  visitId,
  ratingSlipId,
});
```

---

## MTL Service - Compliance Context

### ✅ MTLService (AML/CTR Compliance Engine)

**OWNS:**
- **Cash transaction logging** (immutable, write-once records)
- `mtl_entry` table (source of truth for all monetary transactions)
- `mtl_audit_note` table (append-only audit trail)
- Gaming day calculation logic (trigger-based, reads from casino_settings)
- Threshold detection rules (watchlist >= $3k, CTR >= $10k)

**REFERENCES:**
- `casino_settings` - **READ-ONLY via database trigger** (temporal authority pattern)

**BOUNDED CONTEXT**: "What cash/monetary transactions occurred for AML/CTR compliance?"

### Acceptance Checklist (CI)
- [ ] **Tables present:** `player_financial_transaction`, `mtl_entry`
- [ ] **Ownership:** `casino_id` required
- [ ] **References:** optional FKs to `staff`, `rating_slip`, and `visit` maintained for lineage
- [ ] **Temporal:** `gaming_day` computed via `casino_settings.gaming_day_start_time`
- [ ] **Idempotency:** `mtl_entry.idempotency_key` unique (nullable, partial index)
- [ ] **RLS:** reads limited to compliance roles per `casino_id`; writes by cashier/compliance services
- [ ] **Access paths:** finance by `(player_id, created_at)` and `(casino_id, gaming_day)`; MTL by `(casino_id, created_at)`

**RLS (excerpt)**
- Tables owned by casino scope (`casino_id` present) MUST include:
  - Read: staff of same `casino_id` (role-gated).
  - Write: admins of same `casino_id`.
- Cross-domain joins must rely on declared FKs (no implicit string keys).

### Schema

```sql
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
create unique index if not exists ux_mtl_entry_idem on mtl_entry (idempotency_key) where idempotency_key is not null;
create index if not exists ix_mtl_casino_time on mtl_entry (casino_id, created_at desc);

create table mtl_audit_note (
  id uuid primary key default gen_random_uuid(),
  mtl_entry_id uuid not null references mtl_entry(id) on delete cascade,
  staff_id uuid references staff(id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);
```

---

## RLS Statement Template

**RLS (excerpt)**
- Tables owned by casino scope (`casino_id`) MUST include:
  - Read: staff of same `casino_id` (role-gated).
  - Write: admins of same `casino_id`.
- Cross-domain joins rely on declared FKs (no implicit string keys).

---

## Canonical Readiness Checklist

**Canonical Readiness Checklist**
- [ ] All identifiers in this doc are lower_snake_case (DDL + code samples).
- [ ] All PKs/FKs are uuid; any text IDs are documented business keys.
- [ ] Ownership (`casino_id`) appears on all casino-scoped tables.
- [ ] Finance includes `gaming_day` with trigger defined.
- [ ] Loyalty vs Rating Slip stance is singular (no cache) and mid-session RPC documented.
- [ ] RLS expectations are stated per domain (read/write ownership).
- [ ] CI catalog sections (enums, indexes, checklists, deprecations) are in sync with schema.

---

**Document Version**: 3.0.2-PATCHED
**Created**: 2025-10-21
**Status**: CANONICAL - All SRM_PATCH_PACK.md patches applied
