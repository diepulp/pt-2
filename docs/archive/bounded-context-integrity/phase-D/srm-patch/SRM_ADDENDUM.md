# SRM Addendum (v3.0.1): Micro-Sections to Canonicalize Bounded-Context Alignment

**Purpose:** Extend the SRM `docs/bounded-context-integrity/phase-D/srm-patch/SERVICE_RESPONSIBILITY_MATRIX.md` with concise, testable checklists and catalogs so each bounded context can be validated mechanically in CI. These sections are designed to be **copied into the main SRM** under the relevant headings.

---

## 1) Per‑Context Acceptance Checklists

> Copy each checklist under its context section and keep it in-sync with the DDL.

### Casino (Root Authority)

- [ ] **Tables present:** `company`, `casino`, `casino_settings`, `staff`
- [ ] **PK/FK types:** all `uuid`; `casino_settings.casino_id` is `uuid unique not null`
- [ ] **Ownership:** `casino_id` on `staff`
- [ ] **Constraints:** `casino_settings` 1:1 via unique `(casino_id)`
- [ ] **RLS:** staff read/write scoped to their `casino_id` (admins write)
- [ ] **Access paths:** `casino_settings` by `casino_id`; `staff` by `casino_id`, `employee_id`

### TableContext (Operational)

- [ ] **Tables present:** `game_settings`, `gaming_table`, `gaming_table_settings`, `dealer_rotation`
- [ ] **PK/FK types:** all `uuid`; `dealer_rotation.table_id` → `gaming_table.id`
- [ ] **Ownership:** `casino_id` on `game_settings`, `gaming_table`
- [ ] **Constraints:** `unique (game_settings.casino_id, game_type)`; bet range checks
- [ ] **RLS:** read for staff of same casino; write for admins/pit_boss
- [ ] **Access paths:** tables by `casino_id`; rotations by `table_id` and recency

### Loyalty (SoT) & Rating Slip (Telemetry)

- [ ] **Tables present:** `player_loyalty`, `loyalty_ledger`, `rating_slip`
- [ ] **Stance:** **No cached points** on `rating_slip` (or declare cache policy if chosen)
- [ ] **PK/FK types:** all `uuid`; `loyalty_ledger.player_id` → `player.id`
- [ ] **Constraints:** non-negative balances; index `(player_id, created_at desc)`
- [ ] **RLS:** player-scoped reads via staff roles; writes by system services only
- [ ] **Access paths:** balance by `player_id`; ledger by `player_id` + time

### Finance & MTL (Compliance Interfaces)

- [ ] **Tables present:** `player_financial_transaction`, `mtl_entry`
- [ ] **Ownership:** `casino_id` required
- [ ] **Temporal:** `gaming_day` computed via `casino_settings.gaming_day_start_time`
- [ ] **Idempotency:** `mtl_entry.idempotency_key` unique (nullable, partial index)
- [ ] **RLS:** reads limited to compliance roles per `casino_id`; writes by cashier/compliance services
- [ ] **Access paths:** finance by `(player_id, created_at)` and `(casino_id, gaming_day)`; MTL by `(casino_id, created_at)`

### Player & Visit

- [ ] **Tables present:** `player`, `player_casino`, `visit`
- [ ] **PK/FK types:** all `uuid`; `player_casino` PK `(player_id, casino_id)`
- [ ] **Constraints:** `player_casino.status default 'active'`
- [ ] **RLS:** membership reads within same `casino_id`; writes by enrollment service
- [ ] **Access paths:** membership by `(player_id, casino_id)`; visits by `(player_id, started_at desc)`

---

## 2) Centralized Enum Catalog

> Maintain all enums here; reference by name in DDL. Keep spelling stable.

```sql
create type staff_role as enum ('dealer','pit_boss','admin');
create type staff_status as enum ('active','inactive');
create type game_type   as enum ('blackjack','poker','roulette','baccarat');
create type table_status as enum ('inactive','active','closed');
-- Optional (declare if/when standardized)
-- create type mtl_direction as enum ('in','out');
```
- **Migration order:** enums first, then tables that consume them.
- **Change policy:** additive values only; removals require deprecation + data rewrite.

---

## 3) Event / Telemetry Notes (Future‑proofing)

> If/when you add streaming/analytics, keep event shapes here to avoid schema drift in pipelines.

**rating_slip.events** (example, non-persistent)
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
- **Contract:** event keys mirror table FKs and types in SRM; no ad-hoc string keys.

---

## 4) Index Strategy Stubs (per access path)

> Declare intended indexes so reviewers & CI can assert they exist.

```sql
-- Loyalty lookups
create index if not exists ix_loyalty_ledger_player_time
  on loyalty_ledger (player_id, created_at desc);

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

---

## 5) Deprecation Policy Examples (Exercised)

> Use these to practice the lifecycle; update EOL dates as needed.

```md
**DEPRECATIONS**
- `rating_slip.points` — deprecated in v3.0.0, EOL v3.2.0. Replace with `player_loyalty.balance`.
- `dealer_rotation.tableStringId` — deprecated in v3.0.0, EOL v3.1.0. Use FK `dealer_rotation.table_id`.
```
**Notes**
- Deprecations must include: rationale, migration/backfill plan, owner, and EOL release.
- A CI rule should fail if an EOL item still exists past its target version.

---

## How to Integrate These Sections

1. Paste each section into the main SRM under the appropriate headings.  
2. Commit as **SRM v3.0.1** with a changelog entry.  
3. Update CI to parse these lists:  
   - Checklists → ensure required tables/columns/indexes exist.  
   - Enum catalog → assert types exist pre-table creation.  
   - Index stubs → validate presence via `pg_indexes`.  
   - Deprecations → fail if EOL passed and object remains.
