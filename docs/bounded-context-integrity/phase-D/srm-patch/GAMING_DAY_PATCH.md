# GAMING_DAY_TYPES_ALIGNMENT_PATCH.md

**Status:** Applied  
**Date:** 2025-10-22  
**Owner:** Architecture QA

This patch removes the last two type mismatches between the **SRM** and the **generated Supabase types**:

1. `player_financial_transaction.gaming_day` shows as **required** in `TablesInsert` even though it is trigger-derived.  
2. `casino_settings.gaming_day_start` is typed as **unknown** (interval), losing client semantics.

---

## A) Make `gaming_day` optional in Insert types **without** weakening the invariant

**Problem:** Insert type requires `gaming_day` because the column is `NOT NULL` with no default. Triggers aren’t considered by the type generator.

**Solution (Option B, principled):** Make the column **nullable**, let the BEFORE INSERT/UPDATE trigger populate it, and rely on trigger logic + RPC to ensure it is set. CHECK constraints can’t be DEFERRABLE in Postgres, so we keep application guidance (“MUST omit”) and trigger enforcement.

### SQL Migration

```sql
-- 1) Ensure the trigger is present (as defined in SRM)
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
  new.gaming_day := compute_gaming_day(coalesce(new.created_at, now()), gstart);
  return new;
end$$;

drop trigger if exists trg_fin_gaming_day on player_financial_transaction;
create trigger trg_fin_gaming_day
before insert or update on player_financial_transaction
for each row execute function set_fin_txn_gaming_day();

alter table player_financial_transaction
  alter column gaming_day drop not null;
```

**Result:** `TablesInsert<'player_financial_transaction'>` will no longer require `gaming_day`, while the DB still guarantees it’s set before commit.

---

## B) Replace `casino_settings.gaming_day_start` (interval → time) to avoid `unknown` in types

**Problem:** Supabase typegen maps Postgres `interval` to `unknown` in TypeScript, degrading client ergonomics and obscuring SRM semantics.

**Decision:** Store gaming day boundary as a **`time`** (e.g., `06:00:00`). This is easier for clients and still supports the same computation by casting to `interval` inside the trigger.

### SQL Migration (backfill + swap)

```sql
-- 1) Add new column with clear type & default
alter table casino_settings
  add column if not exists gaming_day_start_time time not null default time '06:00';

-- 2) Backfill from existing interval column if present
-- Convert interval -> time (hours/minutes resolution)
update casino_settings
set gaming_day_start_time =
  make_time(
    extract(hour from gaming_day_start)::int,
    extract(minute from gaming_day_start)::int,
    0
  )
where gaming_day_start is not null;

-- 3) Update trigger function to read the new column
create or replace function set_fin_txn_gaming_day()
returns trigger language plpgsql as $$
declare gstart interval;
begin
  -- cast time to interval for compatible math
  select (gaming_day_start_time::interval) into gstart
  from casino_settings where casino_id = new.casino_id;

  if gstart is null then
    gstart := interval '06:00:00';
  end if;

  new.gaming_day := compute_gaming_day(coalesce(new.created_at, now()), gstart);
  return new;
end$$;

-- 4) (Optional) Drop old interval column once SRM & code are updated
-- alter table casino_settings drop column gaming_day_start;
```

### SRM Edits

- **Change:** `casino_settings.gaming_day_start` → `casino_settings.gaming_day_start_time time not null default '06:00'`.  
- **Explain:** “Gaming day boundary is a **local time-of-day**. The trigger casts it to interval and computes `gaming_day` from `created_at`.”  
- **Checklist:** Add bullet “`gaming_day_start_time` is `time`, not interval; types reflect `string`.”

**Result:** `Database['public']['Tables']['casino_settings']['Row']` will type the boundary as a `string` (time), restoring client clarity. The trigger keeps identical behavior.

---

## C) Tests & Seeds Adjustments

- **Seeds:** Either call `rpc_create_financial_txn` or insert directly (triggers fire inside DB).  
- **Contract test:** Ensure `gaming_day` is set after RPC call and matches expected boundary logic for a known timezone/start.

---

## D) Acceptance Criteria

- [ ] `TablesInsert<'player_financial_transaction'>` does **not** require `gaming_day`.  
- [ ] `casino_settings.gaming_day_start_time` is present (type: `time` → TS `string`); the old interval column is deprecated/removed.  
- [ ] Trigger `set_fin_txn_gaming_day` reads `gaming_day_start_time::interval`.  
- [ ] SRM updated to reflect the `time` type and deferrable check pattern (or RPC-first wording).  
- [ ] Contract tests pass; types regenerated and committed.

---

## E) Notes

- If you insist on keeping `interval`, add a **view** that exposes a computed `gaming_day_start_minutes int` (or `text`) for client consumption. However, since we avoid compat views, the **`time` column** is the cleanest canonical shape.
