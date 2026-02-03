# TEMP-001: Gaming Day Specification

**Status**: Active
**Version**: 1.2
**Owner**: CasinoService
**Applies to**: Finance, MTL, TableContext, Reporting
**Last Updated**: 2026-02-02

> **Enforcement:** This specification is enforced by [TEMP-003: Temporal Governance Enforcement](./TEMP-003-temporal-governance-enforcement.md). Banned patterns, CI gates, and remediation checklists live there.
>
> **Registry:** See [INDEX.md](./INDEX.md) for the full temporal pattern registry.

---

## Purpose

Define the canonical gaming day computation, timezone handling, and temporal authority pattern for PT-2. The gaming day is the fundamental temporal boundary for financial accounting, compliance reporting (MTL), and operational analytics.

---

## 1. Gaming Day Definition

A **gaming day** is a logical 24-hour period that begins at a casino-configurable time (default: 06:00 local time) and ends 24 hours later. This differs from calendar days to align with casino operational patterns (e.g., overnight gaming sessions).

### Core Properties

- **Source of Truth**: `casino_settings.gaming_day_start_time` (data type: `time`, default: `'06:00'`)
- **Timezone**: `casino_settings.timezone` (data type: `text`, default: `'America/Los_Angeles'`)
- **Computation**: Two-layer function contract (see §3):
  - Layer 1: `compute_gaming_day(ts timestamptz, gstart time) -> date` — IMMUTABLE pure math
  - Layer 2: `compute_gaming_day(p_casino_id uuid, p_timestamp timestamptz) -> date` — STABLE, reads `casino_settings`
  - Layer 3 (planned): `rpc_current_gaming_day(p_timestamp timestamptz) -> date` — derives casino from RLS context
- **Immutability**: Gaming day values MUST NOT be modified after transaction commit
- **Scope**: Casino-specific (each casino can have different start times and timezones)

---

## 2. Temporal Authority Pattern

### Authority Hierarchy

```
CasinoService (owns casino_settings)
    ↓ READ-ONLY
Finance, MTL, TableContext (consume via triggers/RPCs)
    ↓ COMPUTED
Reporting, Analytics (aggregate by gaming_day)
```

### Rules

1. **Single Writer**: Only `CasinoService` can write to `casino_settings.gaming_day_start_time` and `casino_settings.timezone`
2. **Consumption Pattern**: Downstream services MUST consume via:
   - Database triggers that auto-populate `gaming_day` columns
   - RPC functions that query `casino_settings` internally
   - Published `CasinoSettingsDTO` for application-layer logic
3. **No Overrides**: Services MUST NOT accept `gaming_day` as input; it is always derived
4. **Consistency Guarantee**: All transactions within a casino use the same gaming day calculation

---

## 3. Gaming Day Computation — Canonical Function Layering

The gaming day computation is split into two layers. Both exist in the database. Consumers must call the correct layer for their context.

### 3.1 Layer 1: Pure Math Function (IMMUTABLE)

```sql
-- Pure math: no side effects, no settings lookup, deterministic
create or replace function compute_gaming_day(
  ts timestamptz,
  gstart time          -- NOTE: type is TIME, not INTERVAL
) returns date
language sql immutable as $fn$
  select (date_trunc('day', ts - (gstart - time '00:00'))
          + (gstart - time '00:00'))::date
$fn$;
```

**Callers:** Triggers (which fetch `gstart` from `casino_settings` themselves).

**Properties:** `IMMUTABLE` — safe for index expressions. Takes raw `gstart` as `time` type. Does not read any table.

> **Migration note:** The original spec documented `gstart interval`. Migration `20251022003807` dropped the `interval` overload and replaced it with `time`. The `interval` signature no longer exists.

### 3.2 Layer 2: Casino-Scoped Wrapper (STABLE, SECURITY DEFINER)

```sql
-- Casino-scoped: reads casino_settings, delegates to Layer 1
create or replace function compute_gaming_day(
  p_casino_id uuid,
  p_timestamp timestamptz default now()
) returns date
language plpgsql stable security definer as $$
declare
  v_start_time time;
  v_timezone text;
  v_local_time timestamptz;
  v_local_date date;
  v_start_minutes int;
  v_current_minutes int;
begin
  select gaming_day_start_time::time, timezone
  into v_start_time, v_timezone
  from casino_settings
  where casino_id = p_casino_id;

  if not found then
    raise exception 'CASINO_SETTINGS_NOT_FOUND: No settings for casino %', p_casino_id
      using errcode = 'P0002';
  end if;

  v_local_time := p_timestamp at time zone v_timezone;
  v_local_date := v_local_time::date;
  v_start_minutes := extract(hour from v_start_time) * 60 + extract(minute from v_start_time);
  v_current_minutes := extract(hour from v_local_time) * 60 + extract(minute from v_local_time);

  if v_current_minutes < v_start_minutes then
    return v_local_date - 1;
  end if;

  return v_local_date;
end;
$$;
```

**Callers:** Route handlers, service layer, RPCs that need casino-scoped gaming day.

**Properties:** `STABLE, SECURITY DEFINER` — reads `casino_settings`, handles timezone conversion. Accepts `p_casino_id` as parameter (current API surface) or will be wrapped by `rpc_current_gaming_day()` which derives casino from RLS context.

### 3.3 Layer 3 (Planned): RLS-Context Wrapper

```sql
-- RLS-scoped: derives casino_id from session context, calls Layer 2
-- Per TEMP-003 §5, ADR-024
create or replace function rpc_current_gaming_day(
  p_timestamp timestamptz default now()
) returns date
language plpgsql stable security definer as $$
declare
  v_casino_id uuid;
begin
  v_casino_id := current_setting('app.casino_id', true)::uuid;
  return compute_gaming_day(v_casino_id, p_timestamp);
end;
$$;
```

**Callers:** Server helpers (`getServerGamingDay()`), RSC pages, future client-callable RPCs.

**Properties:** `STABLE, SECURITY DEFINER` — no spoofable `casino_id` parameter. Derives scope from RLS session vars per ADR-024. This is the function that `rpc_current_gaming_day()` will expose.

**Status:** Specified, not yet migrated. See PRD-027 WS1.

### 3.4 Caller Matrix

| Caller | Calls | Why |
|--------|-------|-----|
| **Triggers** (`set_fin_txn_gaming_day`, `set_visit_gaming_day`, etc.) | Layer 1 `compute_gaming_day(ts, gstart)` | Trigger already has `casino_id` from `NEW` row; fetches `gstart` from `casino_settings` directly |
| **Route handler** (`GET /api/v1/casino/gaming-day`) | Layer 2 `compute_gaming_day(casino_id, timestamp)` | Has `casino_id` from RLS middleware context |
| **Service layer** (`casino/index.ts`) | Layer 2 `compute_gaming_day(casino_id, timestamp)` | Service receives `casino_id` as parameter |
| **RSC pages** (future: `getServerGamingDay()`) | Layer 3 `rpc_current_gaming_day(timestamp)` | Derives casino from RLS context — no parameter bypass |

### 3.5 Algorithm Logic

Given a timestamp `ts` and gaming day start time `gstart`:

1. Convert `ts` to casino-local time using `casino_settings.timezone`
2. Compare local hour:minute against `gstart` hour:minute
3. If before `gstart` → gaming day = previous calendar date
4. If at or after `gstart` → gaming day = current calendar date

The Layer 1 pure math function uses an equivalent algebraic approach (shift-truncate-unshift) that works for any `gstart` value.

### 3.6 Example Scenarios

| Timestamp (UTC) | Casino TZ | Start Time | Gaming Day | Notes |
|----------------|-----------|------------|------------|-------|
| 2025-01-15 05:30 UTC | America/Los_Angeles (UTC-8) | 06:00 | 2025-01-14 | Before 6am local → previous gaming day |
| 2025-01-15 14:30 UTC | America/Los_Angeles (UTC-8) | 06:00 | 2025-01-15 | After 6am local → current gaming day |
| 2025-03-10 10:00 UTC | America/Los_Angeles | 06:00 | 2025-03-10 | DST transition handled by timestamptz |
| 2025-12-31 23:59 UTC | America/New_York (UTC-5) | 06:00 | 2025-12-31 | Year boundary during gaming day |

---

## 4. Trigger-Based Propagation

### Finance Domain Example

```sql
-- Trigger function: reads casino_settings, calls Layer 1 pure math
create or replace function set_fin_txn_gaming_day()
returns trigger language plpgsql as $$
declare
  gstart time;
begin
  -- Fetch gaming day start for this casino
  select coalesce(gaming_day_start_time, time '06:00')
  into gstart
  from casino_settings
  where casino_id = new.casino_id;

  -- Compute and set gaming_day
  new.gaming_day := compute_gaming_day(
    coalesce(new.created_at, now()),
    gstart
  );

  return new;
end$$;

-- Attach to table
create trigger trg_fin_gaming_day
before insert or update on player_financial_transaction
for each row execute function set_fin_txn_gaming_day();
```

### MTL Domain Example

```sql
-- Canonical pattern: fetch gstart as TIME, call Layer 1
-- NOTE: Actual trg_mtl_entry_set_gaming_day() currently reimplements
-- boundary logic inline — see TEMP-003 §6.1 for remediation.
create or replace function set_mtl_gaming_day()
returns trigger language plpgsql as $$
declare
  gstart time;
begin
  select coalesce(gaming_day_start_time, time '06:00')
  into gstart
  from casino_settings
  where casino_id = new.casino_id;

  new.gaming_day := compute_gaming_day(
    coalesce(new.created_at, now()),
    gstart
  );

  return new;
end$$;

create trigger trg_mtl_gaming_day
before insert or update on mtl_entry
for each row execute function set_mtl_gaming_day();
```

### Trigger Design Principles

1. **Read-Only Access**: Triggers read `casino_settings` but never write to it
2. **Default Fallback**: Always provide `interval '06:00:00'` as fallback if settings missing
3. **Before Insert/Update**: Compute gaming day before row persistence
4. **Idempotent**: Re-running trigger produces same result for same inputs
5. **No Application Logic**: Pure calculation; no business rules in triggers

---

## 5. Timezone Handling

### Storage Strategy

- **All timestamps stored as `timestamptz`** (PostgreSQL timezone-aware type)
- **UTC internally**: PostgreSQL stores all `timestamptz` values as UTC
- **Local display**: Application layer converts using `casino_settings.timezone`

### DST (Daylight Saving Time) Handling

**Policy**: Use wall-clock time (local time) for gaming day boundaries.

**Rationale**:
- Gaming day start is defined in local casino time (e.g., "6:00 AM local")
- When DST transitions occur, the wall-clock time remains consistent
- PostgreSQL `timestamptz` automatically handles UTC offset changes

**Edge Cases**:

| Scenario | Behavior | Example |
|----------|----------|---------|
| **Spring Forward** (lose 1 hour) | Gaming day still starts at 6:00 AM local | 2025-03-09: 1:59 AM → 3:00 AM. Gaming day 2025-03-09 starts at wall-clock 6:00 AM (which is 14:00 UTC instead of usual 13:00 UTC) |
| **Fall Back** (gain 1 hour) | Gaming day still starts at 6:00 AM local | 2025-11-02: 1:59 AM → 1:00 AM. Gaming day 2025-11-02 starts at wall-clock 6:00 AM (which is 13:00 UTC instead of usual 14:00 UTC) |
| **Ambiguous Hour** (1:00-2:00 AM occurs twice) | Use first occurrence | Transactions during ambiguous hour map to the first UTC occurrence |

**Implementation Note**: PostgreSQL's `timestamptz` type handles DST automatically when timestamps are created with timezone context. The Layer 2 `compute_gaming_day(casino_id, timestamp)` function converts to casino-local time internally, so DST transitions are handled by PostgreSQL's timezone machinery. The Layer 1 pure math function operates on the algebraic shift-truncate pattern and is timezone-agnostic.

---

## 6. Leap Second Handling

**Policy**: Ignore leap seconds; rely on PostgreSQL's UTC implementation.

**Rationale**:
- Leap seconds occur infrequently (last: 2016-12-31)
- PostgreSQL `timestamptz` follows POSIX time (ignores leap seconds)
- Gaming day boundaries are not affected by sub-second precision

**Failure Mode**: None. Leap seconds do not impact date-level calculations.

---

## 7. Year Boundary Edge Cases

### Scenario: Gaming Day Spans Calendar Year

**Example**:
- Casino: Las Vegas (UTC-8)
- Gaming day start: 06:00
- Transaction: 2025-12-31 23:30 local time (07:30 UTC on 2026-01-01)

**Expected Behavior**:
- `created_at`: `2026-01-01 07:30:00+00` (UTC)
- `gaming_day`: `2025-12-31` (because transaction occurred before 6:00 AM local on 2026-01-01)

**Query Implications**:
```sql
-- Correct: Query by gaming_day
SELECT * FROM player_financial_transaction
WHERE casino_id = :casino_id
  AND gaming_day = '2025-12-31';

-- Incorrect: Query by calendar day
SELECT * FROM player_financial_transaction
WHERE casino_id = :casino_id
  AND DATE(created_at) = '2025-12-31';
-- ^ Misses transactions between midnight-6am local time on 2026-01-01
```

---

## 8. Failure Modes and Detection

### FM-1: Stale Casino Settings Cache

**Symptom**: Gaming day computed with outdated start time after CasinoService updates `casino_settings`.

**Detection**:
```sql
-- Audit query: check for gaming_day mismatches (uses Layer 2)
SELECT
  pft.id,
  pft.gaming_day AS stored_gaming_day,
  compute_gaming_day(pft.casino_id, pft.created_at) AS expected_gaming_day
FROM player_financial_transaction pft
WHERE pft.gaming_day != compute_gaming_day(pft.casino_id, pft.created_at)
LIMIT 10;
```

**Mitigation**:
- Triggers always read fresh `casino_settings` (no caching in DB layer)
- Application-layer caches for `CasinoSettingsDTO` MUST have TTL ≤ 60s
- Emit alert if audit query returns >0 rows

### FM-2: Missing Casino Settings

**Symptom**: Trigger fails to find `casino_settings` row for `casino_id`.

**Detection**: Trigger uses `coalesce(..., interval '06:00:00')` fallback.

**Mitigation**:
- Migration ensures `casino_settings` 1:1 relationship with `casino`
- FK constraint on `casino_settings.casino_id` prevents orphaned transactions
- Alert if fallback value used (log + metrics)

### FM-3: Timezone Change Mid-Day

**Symptom**: Transactions within same operational session map to different gaming days after timezone update.

**Detection**:
```sql
-- Check for timezone changes during active gaming day
SELECT
  casino_id,
  timezone,
  updated_at
FROM casino_settings
WHERE updated_at > NOW() - interval '24 hours'
  AND timezone IS DISTINCT FROM LAG(timezone) OVER (PARTITION BY casino_id ORDER BY updated_at);
```

**Mitigation**:
- **Prevent**: UI warns operators that timezone changes affect gaming day boundaries
- **Policy**: Schedule timezone changes during maintenance windows (before gaming day start)
- **Audit**: Log all `casino_settings` updates to `audit_log` with `before`/`after` snapshots

### FM-4: Application-Layer Gaming Day Override

**Symptom**: Service code accepts `gaming_day` as input parameter, bypassing trigger.

**Detection**: Code review + ESLint rule (future: static analysis)

**Mitigation**:
- **Write Contract**: RPC functions and service methods MUST NOT accept `gaming_day` parameter
- **DTO Validation**: Input DTOs for Finance/MTL MUST NOT include `gaming_day` field
- **CI Gate**: Schema validation rejects writes that bypass triggers

---

## 9. Schema Requirements

### Tables Using Gaming Day

| Table | Column | Type | Populated By | Index |
|-------|--------|------|--------------|-------|
| `player_financial_transaction` | `gaming_day` | `date not null` | `trg_fin_gaming_day` | `ix_fin_txn_casino_gaming_day` |
| `mtl_entry` | `gaming_day` | `date not null` | `trg_mtl_gaming_day` | `ix_mtl_casino_gaming_day` |
| `performance_metrics` | `gaming_day` | `date` | Application or trigger | `ix_perf_casino_gaming_day` |

### Required Indexes

```sql
-- Finance: enable fast gaming day range queries
create index if not exists ix_fin_txn_casino_gaming_day
on player_financial_transaction (casino_id, gaming_day desc);

-- MTL: compliance reporting by gaming day
create index if not exists ix_mtl_casino_gaming_day
on mtl_entry (casino_id, gaming_day desc);

-- Performance: observability metrics by gaming day
create index if not exists ix_perf_casino_gaming_day
on performance_metrics (casino_id, gaming_day desc);
```

### Column Constraints

```sql
-- Gaming day columns must be NOT NULL (enforced by triggers)
ALTER TABLE player_financial_transaction
  ALTER COLUMN gaming_day SET NOT NULL;

ALTER TABLE mtl_entry
  ALTER COLUMN gaming_day SET NOT NULL;
```

---

## 10. Consumer Responsibilities

### Finance Service

- **Trigger**: `trg_fin_gaming_day` auto-populates `gaming_day` on insert/update
- **Query Pattern**: Always filter by `(casino_id, gaming_day)` for daily aggregations
- **RPC**: `rpc_create_financial_txn` MUST NOT accept `gaming_day` parameter
- **Reporting**: Daily balance summaries keyed by `gaming_day`, not calendar day

### MTL Service

- **Trigger**: `trg_mtl_gaming_day` auto-populates `gaming_day` on insert/update
- **Compliance**: CTR reports aggregated by `gaming_day` (regulatory requirement)
- **Threshold Detection**: Daily threshold breach checks use `gaming_day` boundaries
- **Export**: Gaming day boundaries determine transaction batching for compliance files

### TableContext Service

- **Telemetry Snapshots**: May align snapshots to gaming day boundaries for operational reports
- **Fill/Drop Events**: Track chip custody events within gaming day windows
- **Performance Metrics**: Aggregate table performance by `gaming_day` for shift reports

### Reporting Service

- **Daily Reports**: All financial and compliance reports keyed by `gaming_day`
- **Cross-Casino**: When aggregating multi-property data, align all casinos to their respective gaming days
- **Historical**: Gaming day provides stable identifier for historical queries (survives timezone changes)

---

## 11. Testing Requirements

### Unit Tests

```typescript
// Test compute_gaming_day function
describe('compute_gaming_day', () => {
  it('assigns transaction before 6am local to previous day', async () => {
    const ts = '2025-01-15T05:30:00-08:00'; // 5:30 AM PST
    const gstart = '06:00:00';
    const result = await db.rpc('compute_gaming_day', { ts, gstart });
    expect(result).toBe('2025-01-14');
  });

  it('assigns transaction after 6am local to current day', async () => {
    const ts = '2025-01-15T14:30:00-08:00'; // 2:30 PM PST
    const gstart = '06:00:00';
    const result = await db.rpc('compute_gaming_day', { ts, gstart });
    expect(result).toBe('2025-01-15');
  });

  it('handles DST spring forward correctly', async () => {
    const ts = '2025-03-09T10:00:00-07:00'; // After DST transition
    const gstart = '06:00:00';
    const result = await db.rpc('compute_gaming_day', { ts, gstart });
    expect(result).toBe('2025-03-09');
  });
});
```

### Integration Tests

```typescript
// Test trigger integration
describe('Finance gaming_day trigger', () => {
  it('auto-populates gaming_day on transaction insert', async () => {
    const txn = await financeService.createTransaction({
      casino_id: VEGAS_CASINO_ID,
      player_id: TEST_PLAYER_ID,
      amount: 100.00,
      tender_type: 'CASH_IN',
      // Note: gaming_day NOT provided
    });

    expect(txn.gaming_day).toBeDefined();
    expect(txn.gaming_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses casino-specific gaming day start time', async () => {
    // Update casino settings to use 04:00 start
    await casinoService.updateSettings(ATLANTIC_CITY_ID, {
      gaming_day_start_time: '04:00',
    });

    // Insert transaction at 3:30 AM local
    const txn = await financeService.createTransaction({
      casino_id: ATLANTIC_CITY_ID,
      player_id: TEST_PLAYER_ID,
      amount: 50.00,
      created_at: '2025-01-15T03:30:00-05:00',
    });

    // Should map to previous day (before 4am)
    expect(txn.gaming_day).toBe('2025-01-14');
  });
});
```

---

## 12. Migration Checklist

When adding gaming day support to a new table:

- [ ] Add `gaming_day date not null` column
- [ ] Create trigger function that reads `casino_settings.gaming_day_start_time`
- [ ] Attach `BEFORE INSERT OR UPDATE` trigger to table
- [ ] Add index on `(casino_id, gaming_day desc)`
- [ ] Update service write contract to reject `gaming_day` input
- [ ] Add audit query to detect gaming day mismatches
- [ ] Document in `docs/65-migrations/MIG-001-migration-tracking-matrix.md`

---

## 13. Enforcement Addendum (added v1.1)

> **Full enforcement details:** [TEMP-003: Temporal Governance Enforcement](./TEMP-003-temporal-governance-enforcement.md)

### 13.1 Banned Patterns in Query Paths

The following patterns are **hard-banned** in any code that constructs a `gaming_day` value for database queries. These were previously implied by §2 Rule 3 ("No Overrides") but are now explicit after a P0 governance bypass incident.

- `new Date().toISOString().slice(0, 10)` — UTC calendar date ≠ gaming day
- `getUTCFullYear()` / `getUTCMonth()` / `getUTCDate()` arithmetic for business dates
- `new Date()` math to compute `gaming_day` — mints a second temporal authority
- Accepting `gaming_day` as RPC/service input — bypasses trigger-based derivation

**Allowed only in presentation:** `Intl.DateTimeFormat` with casino timezone for display formatting.

### 13.2 RSC Performance Path

Performance optimizations that bypass `useGamingDay()` to avoid client waterfalls **must** use the canonical RSC path defined in TEMP-003 §4.2 — not JS date math. The correct sequence:

1. Create server Supabase client
2. Set RLS context
3. Call `rpc_current_gaming_day()`
4. Pass `gaming_day` as prop

### 13.3 Antipattern Reference

The incident that triggered this addendum is documented in:

> [`docs/issues/ISSUE-GAMING-DAY-TIMEZONE-STANDARDIZATION.md`](../../issues/ISSUE-GAMING-DAY-TIMEZONE-STANDARDIZATION.md)

**Classification:** Governance failure — §2 Rule 3 and §4 were violated by a performance optimization that created a second temporal authority in JavaScript.

---

## 14. References

- **Temporal Authority Pattern**: [TEMP-002](./TEMP-002-temporal-authority-pattern.md) — Propagation & ownership model
- **Governance Enforcement**: [TEMP-003](./TEMP-003-temporal-governance-enforcement.md) — Banned patterns, CI gates, remediation
- **Temporal Pattern Registry**: [INDEX.md](./INDEX.md)
- **SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (lines 924, 943, 966, 1007-1008, 1930-1947, 2059, 2068)
- **Finance Schema**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#finance-domain` (lines 1898-1947)
- **MTL Schema**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#mtl-domain` (lines 2050-2105)
- **Casino Settings DTO**: `services/casino/dtos.ts`
- **API Surface**: `docs/25-api-data/API_SURFACE_MVP.md`
- **Antipattern Case Study**: [`ISSUE-GAMING-DAY-TIMEZONE-STANDARDIZATION`](../../issues/ISSUE-GAMING-DAY-TIMEZONE-STANDARDIZATION.md)

---

## 15. Changelog

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.2 | 2026-02-02 | Formalized two-layer function contract (§3), fixed `interval` → `time` signature drift, caller matrix | Lead Architect |
| 1.1 | 2026-02-02 | Enforcement addendum (§13), cross-links to TEMP-002/TEMP-003, antipattern ref | Lead Architect |
| 1.0 | 2025-11-17 | Initial specification extracted from SRM | System |

---

**End of Document**
