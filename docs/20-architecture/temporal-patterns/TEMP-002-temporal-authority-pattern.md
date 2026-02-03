# TEMP-002: Temporal Authority Pattern

**Status**: Active
**Version**: 1.2
**Owner**: CasinoService
**Applies to**: All services that depend on casino time/gaming day
**Last Updated**: 2026-02-02

> **Enforcement:** This pattern is enforced by [TEMP-003: Temporal Governance Enforcement](./TEMP-003-temporal-governance-enforcement.md). Banned patterns, the RSC safe path, and remediation checklists live there.
>
> **Registry:** See [INDEX.md](./INDEX.md) for the full temporal pattern registry.

---

## Purpose

Document the temporal authority pattern for PT-2, which establishes CasinoService as the single source of truth for all time-related configuration (timezone, gaming day start time) and defines how this temporal context propagates to dependent services.

---

## 1. Pattern Overview

### Definition

**Temporal Authority Pattern**: A centralized ownership model where one service (CasinoService) owns all temporal configuration (timezone, gaming day boundaries), and dependent services consume this configuration through well-defined read-only interfaces.

### Core Principle

**Single Source of Truth**: All temporal decisions (gaming day calculation, timezone conversions) MUST derive from `casino_settings` table owned exclusively by CasinoService.

---

## 2. Authority Hierarchy

### Ownership Tiers

```
┌─────────────────────────────────────────┐
│ TIER 1: Temporal Authority (CasinoService)│
│ - Owns casino_settings table            │
│ - EXCLUSIVE WRITE access                │
│ - Publishes CasinoSettingsDTO           │
└─────────────────┬───────────────────────┘
                  │ READ-ONLY
                  ↓
┌─────────────────────────────────────────┐
│ TIER 2: Temporal Consumers              │
│ - Finance, MTL, TableContext            │
│ - READ-ONLY via triggers/RPCs/DTOs      │
│ - NEVER write to casino_settings        │
└─────────────────┬───────────────────────┘
                  │ COMPUTED VALUES
                  ↓
┌─────────────────────────────────────────┐
│ TIER 3: Temporal Derivations            │
│ - Reporting, Analytics, UI              │
│ - Consume gaming_day from Tier 2        │
│ - Display timezone-adjusted timestamps  │
└─────────────────────────────────────────┘
```

---

## 3. Propagation Mechanisms

### 3A. Database Trigger Propagation (Tier 2 → Computed Columns)

**Use Case**: Auto-populate `gaming_day` columns in transactional tables

**Mechanism**:
- Trigger function reads `casino_settings.gaming_day_start_time` (type: `time`)
- Calls Layer 1 `compute_gaming_day(ts, gstart)` — the IMMUTABLE pure math function (see TEMP-001 §3.1)
- Sets `gaming_day` column before row insert/update

**Example** (Finance):
```sql
-- Trigger calls Layer 1 (pure math) directly
create or replace function set_fin_txn_gaming_day()
returns trigger language plpgsql as $$
declare
  gstart time;
begin
  -- READ-ONLY: Fetch from temporal authority
  select coalesce(gaming_day_start_time, time '06:00')
  into gstart
  from casino_settings
  where casino_id = new.casino_id;

  -- COMPUTE: Call Layer 1 pure math function
  new.gaming_day := compute_gaming_day(
    coalesce(new.created_at, now()),
    gstart
  );

  return new;
end$$;
```

**Characteristics**:
- ✅ **Consistency**: All writes see latest `casino_settings`
- ✅ **Transparency**: Application code unaware of computation
- ✅ **Performance**: Single DB lookup per transaction (cached by query planner)
- ⚠️ **Dependency**: Requires `casino_settings` row exists for `casino_id`

**Services Using Trigger Propagation**:
- Finance (`player_financial_transaction.gaming_day`)
- MTL (`mtl_entry.gaming_day`)
- Performance (`performance_metrics.gaming_day`)

---

### 3B. RPC Parameter Propagation (Tier 2 → Tier 3)

**Use Case**: Server-side functions that need gaming day context

**Mechanism**:
- RPC function calls Layer 2 `compute_gaming_day(casino_id, timestamp)` — the casino-scoped wrapper (see TEMP-001 §3.2)
- Or: RPC reads `casino_settings` directly and calls Layer 1 pure math function
- Returns computed values or executes logic using gaming day

> **Function layering note:** RPCs that accept `casino_id` as a parameter call Layer 2 directly. The planned `rpc_current_gaming_day()` (Layer 3, TEMP-001 §3.3) will derive `casino_id` from RLS context instead, per ADR-024. See TEMP-003 §5 for the migration plan.

**Example** (MTL Threshold Check — uses Layer 2):
```sql
create or replace function rpc_check_daily_threshold(
  p_casino_id uuid,
  p_player_id uuid,
  p_check_date date default current_date
)
returns jsonb
language plpgsql
as $$
declare
  v_gaming_day date;
  v_total numeric;
  v_threshold numeric;
begin
  -- COMPUTE: Use Layer 2 casino-scoped wrapper
  v_gaming_day := compute_gaming_day(
    p_casino_id,
    p_check_date::timestamptz
  );

  -- Fetch threshold from casino_settings
  select ctr_threshold
  into v_threshold
  from casino_settings
  where casino_id = p_casino_id;

  -- AGGREGATE: Sum transactions for gaming day
  select coalesce(sum(amount), 0)
  into v_total
  from mtl_entry
  where casino_id = p_casino_id
    and player_id = p_player_id
    and gaming_day = v_gaming_day;

  return jsonb_build_object(
    'gaming_day', v_gaming_day,
    'total', v_total,
    'threshold', v_threshold,
    'exceeds', v_total >= v_threshold
  );
end$$;
```

**Characteristics**:
- ✅ **Encapsulation**: Gaming day logic hidden from application
- ✅ **Consistency**: Single read per RPC invocation
- ✅ **Testability**: Pure function behavior
- ⚠️ **Latency**: Adds ~1ms for settings lookup

**Services Using RPC Propagation**:
- MTL (threshold checks, compliance exports)
- Finance (daily balance aggregations)
- Reporting (gaming day range queries)

---

### 3C. DTO Propagation (Tier 1 → Tier 2 Application Layer)

**Use Case**: Application services need temporal config for business logic

**Mechanism**:
- CasinoService publishes `CasinoSettingsDTO`
- Consumer services import DTO type (not direct DB access)
- Application layer uses DTO to make temporal decisions

**Example** (Loyalty Service):
```typescript
// services/casino/dtos.ts (OWNED by CasinoService)
export interface CasinoSettingsDTO {
  casino_id: string;
  gaming_day_start_time: string; // HH:MM format
  timezone: string; // IANA timezone
  ctr_threshold: number;
  watchlist_floor: number;
}

// services/loyalty/gaming-day-calculator.ts (CONSUMER)
import type { CasinoSettingsDTO } from '@/services/casino/dtos';

export class GamingDayCalculator {
  constructor(private settings: CasinoSettingsDTO) {}

  /**
   * Calculate gaming day for a given timestamp
   * Uses casino-specific start time from temporal authority
   */
  getGamingDay(timestamp: Date): string {
    const [hours, minutes] = this.settings.gaming_day_start_time
      .split(':')
      .map(Number);

    // Create date in casino's timezone
    const localDate = new Intl.DateTimeFormat('en-US', {
      timeZone: this.settings.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(timestamp);

    // Apply gaming day boundary logic
    // (mirrors compute_gaming_day SQL function)
    // ...implementation...

    return gamingDayDate;
  }
}
```

**Characteristics**:
- ✅ **Type Safety**: Compile-time enforcement via DTO contract
- ✅ **Bounded Context**: No direct DB imports in consuming services
- ✅ **Testability**: Easy to mock `CasinoSettingsDTO` in tests
- ⚠️ **Cache Staleness**: Application must handle DTO caching (see §5)

**Services Using DTO Propagation**:
- Loyalty (mid-session reward calculations)
- RatingSlip (telemetry normalization)
- TableContext (shift boundary detection)

---

## 4. Consumer Responsibilities

### Finance Service

**Consumes**:
- `casino_settings.gaming_day_start_time` (via trigger)
- `casino_settings.timezone` (via `CasinoSettingsDTO` for display)

**Responsibilities**:
- ✅ Use `gaming_day` column for all temporal queries
- ✅ Display timestamps in casino timezone (via DTO)
- ❌ NEVER write to `casino_settings`
- ❌ NEVER accept `gaming_day` as RPC/service input

**Query Pattern**:
```typescript
// CORRECT: Query by gaming_day
const dailyTotal = await supabase
  .from('player_financial_transaction')
  .select('amount')
  .eq('casino_id', casinoId)
  .eq('gaming_day', gamingDay)
  .sum('amount');

// INCORRECT: Query by calendar day
const dailyTotal = await supabase
  .from('player_financial_transaction')
  .select('amount')
  .eq('casino_id', casinoId)
  .gte('created_at', startOfDay)
  .lt('created_at', endOfDay)
  .sum('amount');
// ^ WRONG: Misses transactions near gaming day boundaries
```

---

### MTL Service

**Consumes**:
- `casino_settings.gaming_day_start_time` (via trigger)
- `casino_settings.ctr_threshold` (via `CasinoSettingsDTO`)
- `casino_settings.timezone` (for compliance export timestamps)

**Responsibilities**:
- ✅ Aggregate transactions by `gaming_day` for CTR reports
- ✅ Use casino timezone for compliance file generation
- ✅ Detect threshold breaches using casino-specific limits
- ❌ NEVER override gaming day calculation
- ❌ NEVER cache `casino_settings` >60s

**Threshold Check Pattern**:
```typescript
// CORRECT: Use DTO for threshold + gaming_day from DB
import type { CasinoSettingsDTO } from '@/services/casino/dtos';

async function checkDailyLimit(
  casinoId: string,
  playerId: string,
  settings: CasinoSettingsDTO
): Promise<{ exceeds: boolean; total: number }> {
  // Gaming day already computed by trigger in DB
  const { data } = await supabase
    .from('mtl_entry')
    .select('amount, gaming_day')
    .eq('casino_id', casinoId)
    .eq('player_id', playerId)
    .eq('gaming_day', 'today') // Placeholder; actual gaming day computed
    .sum('amount');

  return {
    exceeds: data.sum >= settings.ctr_threshold,
    total: data.sum,
  };
}

// INCORRECT: Hardcode threshold or gaming day logic
async function checkDailyLimit(casinoId: string, playerId: string) {
  const threshold = 10000; // ❌ WRONG: Should come from casino_settings
  const today = new Date().toISOString().split('T')[0]; // ❌ WRONG: Not gaming day

  const { data } = await supabase
    .from('mtl_entry')
    .select('amount')
    .eq('casino_id', casinoId)
    .eq('player_id', playerId)
    .gte('created_at', today)
    .sum('amount');

  return data.sum >= threshold;
}
```

---

### TableContext Service

**Consumes**:
- `casino_settings.gaming_day_start_time` (via `CasinoSettingsDTO`)
- `casino_settings.timezone` (for shift reports)

**Responsibilities**:
- ✅ Align telemetry snapshots to gaming day boundaries
- ✅ Display shift timings in casino timezone
- ❌ NEVER write temporal config
- ❌ NEVER compute gaming day independently

**Shift Alignment Pattern**:
```typescript
// CORRECT: Use CasinoSettingsDTO to determine shift boundaries
import type { CasinoSettingsDTO } from '@/services/casino/dtos';

function isShiftBoundary(
  timestamp: Date,
  settings: CasinoSettingsDTO
): boolean {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: settings.timezone,
    hour: 'numeric',
    hour12: false,
  }).format(timestamp);

  const [startHour] = settings.gaming_day_start_time.split(':').map(Number);

  // Shift boundaries typically align with gaming day start
  return Number(hour) === startHour;
}
```

---

### Reporting Service

**Consumes**:
- `gaming_day` columns (from Finance, MTL, Performance tables)
- `casino_settings.timezone` (via `CasinoSettingsDTO` for display)

**Responsibilities**:
- ✅ Query by `gaming_day` for daily reports
- ✅ Display timestamps in casino timezone
- ✅ Handle multi-property reports (different gaming days per casino)
- ❌ NEVER aggregate by calendar day for operational reports

**Multi-Property Report Pattern**:
```typescript
// CORRECT: Respect per-casino gaming days
async function generateMultiPropertyReport(
  casinoIds: string[],
  targetGamingDay: string
) {
  // Each casino's gaming_day column is already adjusted to their start time
  const reports = await Promise.all(
    casinoIds.map(async (casinoId) => {
      const { data: txns } = await supabase
        .from('player_financial_transaction')
        .select('amount, gaming_day')
        .eq('casino_id', casinoId)
        .eq('gaming_day', targetGamingDay); // Same logical day, different wall-clock times

      return {
        casinoId,
        gamingDay: targetGamingDay,
        total: txns.reduce((sum, t) => sum + t.amount, 0),
      };
    })
  );

  return reports;
}

// INCORRECT: Assume single timezone for all casinos
async function generateMultiPropertyReport(casinoIds: string[]) {
  const startOfDay = new Date().setHours(6, 0, 0, 0); // ❌ WRONG: Assumes all casinos use 6am Pacific
  // ...
}
```

---

## 5. Caching and Consistency

### Cache Policy

| Layer | Cacheable | TTL | Invalidation Trigger |
|-------|-----------|-----|---------------------|
| **Database Triggers** | No | N/A | Always read fresh `casino_settings` |
| **RPC Functions** | No | N/A | Always read fresh `casino_settings` |
| **Application DTOs** | Yes | ≤60s | `casino_settings` UPDATE |
| **UI Components** | Yes | ≤30s | React Query invalidation on settings change |

### Cache Invalidation Pattern

```typescript
// services/casino/service.ts
export async function updateCasinoSettings(
  casinoId: string,
  updates: Partial<CasinoSettingsDTO>
): Promise<ServiceResult<CasinoSettingsDTO>> {
  // Update casino_settings
  const result = await supabase
    .from('casino_settings')
    .update(updates)
    .eq('casino_id', casinoId)
    .select()
    .single();

  if (result.error) {
    return { success: false, error: result.error };
  }

  // Invalidate caches
  await Promise.all([
    // 1. React Query cache
    queryClient.invalidateQueries({
      queryKey: ['casino-settings', casinoId],
    }),

    // 2. Server-side cache (if using)
    cache.del(`casino-settings:${casinoId}`),

    // 3. Emit event for realtime subscribers
    supabase.channel('casino-settings').send({
      type: 'broadcast',
      event: 'settings-updated',
      payload: { casino_id: casinoId },
    }),
  ]);

  return { success: true, data: result.data };
}
```

### Consistency Expectations

**Strong Consistency** (Database Layer):
- Triggers always read latest `casino_settings` (no caching)
- Same transaction sees same gaming day calculation
- FK constraints prevent orphaned temporal references

**Eventual Consistency** (Application Layer):
- DTO caches may lag up to 60s
- UI displays may show stale gaming day boundaries briefly
- Acceptable for non-transactional operations (e.g., display-only)

**Consistency Guarantee**:
> All persisted `gaming_day` values are computed using the `casino_settings` state at transaction commit time. Application-layer staleness affects only display and non-critical business logic.

---

## 6. Failure Modes and Mitigation

### FM-1: Casino Settings Missing

**Symptom**: Trigger or RPC fails to find `casino_settings` row for `casino_id`.

**Root Cause**:
- New casino created without corresponding `casino_settings` row
- FK constraint not enforced
- Migration rollback issue

**Detection**:
```sql
-- Find casinos missing settings
SELECT c.id, c.name
FROM casino c
LEFT JOIN casino_settings cs ON cs.casino_id = c.id
WHERE cs.id IS NULL;
```

**Mitigation**:
1. **Preventive**: Migration ensures 1:1 relationship
   ```sql
   -- Enforce 1:1 relationship
   ALTER TABLE casino_settings
     ADD CONSTRAINT uq_casino_settings_casino_id
     UNIQUE (casino_id);
   ```

2. **Fallback**: Triggers use default values
   ```sql
   select coalesce(
     gaming_day_start_time::interval,
     interval '06:00:00' -- Default fallback
   ) into gstart
   from casino_settings
   where casino_id = new.casino_id;
   ```

3. **Alerting**: Emit metric when fallback used
   ```sql
   if gstart = interval '06:00:00' then
     perform pg_notify('casino-settings-missing', new.casino_id::text);
   end if;
   ```

---

### FM-2: Stale Application Cache

**Symptom**: Application displays incorrect gaming day boundaries after `casino_settings` update.

**Root Cause**:
- DTO cache TTL too long
- Cache invalidation failed
- React Query stale-while-revalidate delay

**Detection**:
```typescript
// Add staleness indicator to DTO
export interface CasinoSettingsDTO {
  // ... fields ...
  updated_at: string; // ISO timestamp
}

// Client-side staleness check
function isCasinoSettingsStale(dto: CasinoSettingsDTO): boolean {
  const ageMs = Date.now() - new Date(dto.updated_at).getTime();
  return ageMs > 60_000; // Stale if >60s old
}
```

**Mitigation**:
1. **Short TTL**: Limit DTO cache to 60s
   ```typescript
   const { data: settings } = useQuery({
     queryKey: ['casino-settings', casinoId],
     queryFn: () => fetchCasinoSettings(casinoId),
     staleTime: 60_000, // 60s
     cacheTime: 300_000, // 5min
   });
   ```

2. **Realtime Invalidation**: Subscribe to settings changes
   ```typescript
   useEffect(() => {
     const channel = supabase
       .channel('casino-settings')
       .on('broadcast', { event: 'settings-updated' }, (payload) => {
         if (payload.casino_id === casinoId) {
           queryClient.invalidateQueries(['casino-settings', casinoId]);
         }
       })
       .subscribe();

     return () => { channel.unsubscribe(); };
   }, [casinoId]);
   ```

3. **Optimistic Updates**: Show pending state during updates
   ```typescript
   const mutation = useMutation({
     mutationFn: updateCasinoSettings,
     onMutate: async (newSettings) => {
       // Optimistically update cache
       await queryClient.cancelQueries(['casino-settings', casinoId]);
       const previous = queryClient.getQueryData(['casino-settings', casinoId]);
       queryClient.setQueryData(['casino-settings', casinoId], newSettings);
       return { previous };
     },
     onError: (err, newSettings, context) => {
       // Rollback on error
       queryClient.setQueryData(['casino-settings', casinoId], context.previous);
     },
   });
   ```

---

### FM-3: Concurrent Settings Updates

**Symptom**: Two operators update `casino_settings` simultaneously, causing race condition.

**Root Cause**:
- No optimistic locking on `casino_settings`
- Multiple admin sessions
- No `updated_at` version check

**Detection**:
```sql
-- Check for rapid updates (potential conflict)
SELECT
  casino_id,
  count(*) as update_count,
  max(updated_at) - min(updated_at) as time_span
FROM (
  SELECT casino_id, updated_at
  FROM casino_settings
  WHERE updated_at > NOW() - interval '1 minute'
) recent_updates
GROUP BY casino_id
HAVING count(*) > 1;
```

**Mitigation**:
1. **Optimistic Locking**: Use `updated_at` for version check
   ```typescript
   async function updateCasinoSettings(
     casinoId: string,
     updates: Partial<CasinoSettingsDTO>,
     expectedUpdatedAt: string
   ): Promise<ServiceResult<CasinoSettingsDTO>> {
     const { data, error } = await supabase
       .from('casino_settings')
       .update({ ...updates, updated_at: new Date().toISOString() })
       .eq('casino_id', casinoId)
       .eq('updated_at', expectedUpdatedAt) // Optimistic lock
       .select()
       .single();

     if (error || !data) {
       return {
         success: false,
         error: { code: 'CONCURRENT_UPDATE', message: 'Settings modified by another user' },
       };
     }

     return { success: true, data };
   }
   ```

2. **Advisory Locks**: PostgreSQL-level locking
   ```sql
   create or replace function lock_casino_settings(p_casino_id uuid)
   returns void language plpgsql as $$
   begin
     -- Advisory lock (released at transaction end)
     perform pg_advisory_xact_lock(hashtext(p_casino_id::text));
   end$$;
   ```

3. **Audit Trail**: Log all settings changes
   ```sql
   create trigger audit_casino_settings_updates
   after update on casino_settings
   for each row
   execute function log_to_audit_log();
   ```

---

### FM-4: Timezone Change During Active Gaming Day

**Symptom**: Transactions in the same operational session map to different gaming days after timezone change.

**Root Cause**:
- Operator changed `casino_settings.timezone` mid-day
- No validation on timing of timezone changes

**Detection**:
```sql
-- Find timezone changes during casino operating hours
SELECT
  cs.casino_id,
  cs.timezone,
  cs.updated_at,
  CASE
    WHEN EXTRACT(HOUR FROM cs.updated_at AT TIME ZONE cs.timezone) BETWEEN 8 AND 23
    THEN 'RISKY: Changed during operating hours'
    ELSE 'SAFE: Changed during maintenance window'
  END as risk_level
FROM casino_settings cs
WHERE cs.updated_at > NOW() - interval '7 days'
  AND cs.timezone IS DISTINCT FROM LAG(cs.timezone) OVER (
    PARTITION BY cs.casino_id ORDER BY cs.updated_at
  );
```

**Mitigation**:
1. **UI Warning**: Prompt operator before timezone change
   ```typescript
   function validateTimezoneChange(currentTime: Date, casinoSettings: CasinoSettingsDTO): ValidationResult {
     const hour = new Intl.DateTimeFormat('en-US', {
       timeZone: casinoSettings.timezone,
       hour: 'numeric',
       hour12: false,
     }).format(currentTime);

     if (Number(hour) >= 8 && Number(hour) <= 23) {
       return {
         valid: false,
         warning: 'Changing timezone during operating hours may affect gaming day boundaries. Schedule this change during maintenance window.',
       };
     }

     return { valid: true };
   }
   ```

2. **Policy Enforcement**: Restrict timezone changes to maintenance windows
   ```sql
   create or replace function validate_timezone_change()
   returns trigger language plpgsql as $$
   begin
     if OLD.timezone is distinct from NEW.timezone then
       -- Require explicit override flag for mid-day changes
       if coalesce(current_setting('app.allow_timezone_change', true), 'false') != 'true' then
         raise exception 'Timezone changes must be scheduled during maintenance windows';
       end if;
     end if;
     return NEW;
   end$$;
   ```

3. **Audit + Notification**: Alert stakeholders of timezone changes
   ```typescript
   async function updateTimezone(casinoId: string, newTimezone: string) {
     // Log to audit trail
     await auditLog.create({
       domain: 'casino',
       action: 'TIMEZONE_CHANGE',
       actor_id: currentUserId,
       casino_id: casinoId,
       dto_before: { timezone: currentSettings.timezone },
       dto_after: { timezone: newTimezone },
       correlation_id: requestId,
     });

     // Notify stakeholders
     await notifications.send({
       recipients: ['finance-team', 'compliance-team'],
       subject: `Casino ${casinoId} timezone changed`,
       body: `Timezone updated from ${currentSettings.timezone} to ${newTimezone}. Gaming day boundaries will adjust accordingly.`,
     });

     // Apply change
     return await updateCasinoSettings(casinoId, { timezone: newTimezone });
   }
   ```

---

## 7. Testing Strategy

### Unit Tests (Temporal Authority Behavior)

```typescript
describe('Temporal Authority Pattern', () => {
  describe('CasinoService (Authority)', () => {
    it('updates gaming_day_start_time successfully', async () => {
      const result = await casinoService.updateSettings(CASINO_ID, {
        gaming_day_start_time: '04:00',
      });

      expect(result.success).toBe(true);
      expect(result.data.gaming_day_start_time).toBe('04:00');
    });

    it('prevents non-CasinoService writes to casino_settings', async () => {
      // Simulate cross-service write attempt
      const { error } = await supabase
        .from('casino_settings')
        .update({ gaming_day_start_time: '08:00' })
        .eq('casino_id', CASINO_ID);

      // Should be blocked by RLS policy
      expect(error).toBeDefined();
      expect(error.code).toBe('42501'); // insufficient_privilege
    });
  });

  describe('Consumer Services', () => {
    it('Finance reads gaming_day_start_time via trigger', async () => {
      const txn = await financeService.createTransaction({
        casino_id: CASINO_ID,
        player_id: PLAYER_ID,
        amount: 100.0,
        created_at: '2025-01-15T05:30:00-08:00', // Before 6am
      });

      // gaming_day computed by trigger reading casino_settings
      expect(txn.gaming_day).toBe('2025-01-14');
    });

    it('MTL imports CasinoSettingsDTO (not direct DB access)', async () => {
      // This should compile (DTO import allowed)
      const settingsDTO: CasinoSettingsDTO = await casinoService.getSettings(CASINO_ID);

      // This should NOT compile (direct DB access forbidden)
      // @ts-expect-error - ESLint rule: no-cross-context-db-imports
      const dbRow: Database['public']['Tables']['casino_settings']['Row'] = {};
    });
  });
});
```

### Integration Tests (Propagation Mechanisms)

```typescript
describe('Temporal Propagation Integration', () => {
  it('propagates gaming_day_start_time change to Finance trigger', async () => {
    // Setup: Create transaction with default 06:00 start
    const txn1 = await financeService.createTransaction({
      casino_id: CASINO_ID,
      player_id: PLAYER_ID,
      amount: 50.0,
      created_at: '2025-01-15T05:30:00-08:00', // 5:30am
    });
    expect(txn1.gaming_day).toBe('2025-01-14'); // Before 6am → previous day

    // Change gaming day start to 04:00
    await casinoService.updateSettings(CASINO_ID, {
      gaming_day_start_time: '04:00',
    });

    // New transaction at same time
    const txn2 = await financeService.createTransaction({
      casino_id: CASINO_ID,
      player_id: PLAYER_ID,
      amount: 50.0,
      created_at: '2025-01-15T05:30:00-08:00', // 5:30am
    });
    expect(txn2.gaming_day).toBe('2025-01-15'); // After 4am → current day
  });

  it('invalidates DTO cache after settings update', async () => {
    // Fetch and cache settings
    const settings1 = await casinoService.getSettings(CASINO_ID);
    expect(settings1.gaming_day_start_time).toBe('06:00');

    // Update settings
    await casinoService.updateSettings(CASINO_ID, {
      gaming_day_start_time: '05:00',
    });

    // Wait for cache invalidation (max 60s TTL)
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Refetch should return updated value
    const settings2 = await casinoService.getSettings(CASINO_ID);
    expect(settings2.gaming_day_start_time).toBe('05:00');
  });
});
```

---

## 8. RSC / Performance Safe Path (added v1.1)

> **Full enforcement details:** [TEMP-003 §4: Performance Without Temporal Drift](./TEMP-003-temporal-governance-enforcement.md#4-performance-without-temporal-drift)

### 8.1 The Problem

Performance optimizations that bypass `useGamingDay()` to avoid client-side waterfall cascades can accidentally create a **second temporal authority** in JavaScript. This is the exact failure mode that caused the P0 Player 360 incident.

The waterfall being optimized:
```
useAuth → useGamingDay() → usePlayerSummary(gamingDay) → useGamingDaySummary
```

The **wrong** fix: replace the RPC with a JS function that computes gaming day using `new Date()`.

### 8.2 The Only Allowed RSC Path

React Server Components that need `gaming_day` without client waterfalls **must** follow this sequence:

1. Create server Supabase client
2. Set RLS context (`set_rls_context_from_staff()` or equivalent)
3. Call `rpc_current_gaming_day()` — derives scope from session context, not parameters
4. Fetch dashboard data using the `gaming_day` returned by the DB
5. Pass `gaming_day` down as props to client components

This removes the waterfall without violating the temporal authority hierarchy defined in §2.

### 8.3 Banned Patterns

The following are **hard-banned** in query paths (see TEMP-003 §3 for the full table):

- `new Date().toISOString().slice(0, 10)` — UTC date ≠ gaming day
- `getUTC*()` math for business dates
- `new Date()` arithmetic to compute `gaming_day`
- Accepting `gaming_day` as RPC/service input

### 8.4 Antipattern Reference

> [`docs/issues/ISSUE-GAMING-DAY-TIMEZONE-STANDARDIZATION.md`](../../issues/ISSUE-GAMING-DAY-TIMEZONE-STANDARDIZATION.md)

---

## 9. Migration Checklist

When adding temporal authority dependency to a new service:

- [ ] Identify temporal config needed (gaming_day_start_time, timezone, etc.)
- [ ] Choose propagation mechanism (trigger, RPC, DTO)
- [ ] Import `CasinoSettingsDTO` type (not direct DB access)
- [ ] Implement cache invalidation for DTO consumers
- [ ] Add audit queries to detect temporal mismatches
- [ ] Document temporal dependencies in service README
- [ ] Add integration tests for temporal propagation

---

## 10. References

- **Gaming Day Specification**: [TEMP-001](./TEMP-001-gaming-day-specification.md) — Canonical computation spec
- **Governance Enforcement**: [TEMP-003](./TEMP-003-temporal-governance-enforcement.md) — Banned patterns, CI gates, remediation
- **Temporal Pattern Registry**: [INDEX.md](./INDEX.md)
- **SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (lines 924, 943, 976-977, 2059)
- **CasinoService**: `services/casino/`
- **DTO Standard**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- **Service Template**: `docs/70-governance/SERVICE_TEMPLATE.md`
- **Antipattern Case Study**: [`ISSUE-GAMING-DAY-TIMEZONE-STANDARDIZATION`](../../issues/ISSUE-GAMING-DAY-TIMEZONE-STANDARDIZATION.md)

---

## 11. Changelog

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.2 | 2026-02-02 | Fixed function signatures (`interval` → `time`), Layer 1/2 references in §3A/3B | Lead Architect |
| 1.1 | 2026-02-02 | RSC safe path (§8), cross-links to TEMP-001/TEMP-003, antipattern ref | Lead Architect |
| 1.0 | 2025-11-17 | Initial specification extracted from SRM | System |

---

**End of Document**
