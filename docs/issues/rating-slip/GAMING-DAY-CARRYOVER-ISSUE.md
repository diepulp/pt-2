# Rating Slip Gaming Day Data Carry-Over Issue

**Issue ID**: ISSUE-GDC-001
**Created**: 2026-01-16
**Status**: Resolved (ADR-026)
**Priority**: P0 (MTL Compliance Impact)
**Related**: PRD-MTL-UI-GAPS, ADR-015, ADR-024, **ADR-026**
**Resolution**: Option A adopted - see [ADR-026-gaming-day-scoped-visits.md](../../80-adrs/ADR-026-gaming-day-scoped-visits.md)

## Problem Statement

When a rating slip modal is reopened, it displays the total buy-in from previous sessions, including those from prior gaming days. This violates MTL compliance requirements where financial totals must be scoped to the current gaming day (CTR threshold: $10,000/day).

### Current Behavior (Problematic)

```
Gaming Day 1 (Jan 14):
  ├── Visit V1 created, player buys in $500
  ├── Visit V1 still active at end of day

Gaming Day 2 (Jan 15):
  ├── Player seated again → startVisit returns existing V1
  ├── New rating slip created, modal shows $500 total (from Day 1!)
  ├── Player buys in $300 more
  └── MTL threshold check sees $800 cumulative (correct for multi-day)
      BUT modal shows $800 as "today's total" (INCORRECT)
```

### Desired Behavior (MTL Compliant)

```
Gaming Day 1 (Jan 14):
  ├── Visit V1 created, player buys in $500
  ├── Visit V1 closed at end of gaming day

Gaming Day 2 (Jan 15):
  ├── Player seated → System checks for same-gaming-day visit
  │   └── None found → Create new Visit V2 (fresh $0 total)
  ├── Modal shows $0 total (correct for new gaming day)
  ├── Player buys in $300
  └── MTL threshold check sees $300 (correct for Jan 15)
      Note: visit_group_id links V1 and V2 for multi-day player history
```

---

## Root Cause Analysis

### Location 1: BFF RPC Financial Aggregation

**File**: `supabase/migrations/20251226123939_prd018_modal_bff_rpc.sql:246-258`

```sql
SELECT
  COALESCE(SUM(pft.amount) FILTER (WHERE pft.direction = 'in'), 0) AS total_in,
  COALESCE(SUM(pft.amount) FILTER (WHERE pft.direction = 'out'), 0) AS total_out,
  ...
FROM player_financial_transaction pft
WHERE pft.visit_id = v_slip.visit_id  -- NO GAMING DAY FILTER
  AND pft.casino_id = p_casino_id;
```

**Issue**: Financial summary aggregates ALL transactions for the visit, regardless of gaming day.

### Location 2: Visit Financial Summary View

**File**: `supabase/migrations/20251213180125_add_visit_financial_summary_view.sql`

```sql
CREATE OR REPLACE VIEW visit_financial_summary AS
SELECT
  pft.visit_id,
  pft.casino_id,
  COALESCE(SUM(CASE WHEN pft.direction = 'in' THEN pft.amount ELSE 0 END), 0) AS total_in,
  ...
FROM player_financial_transaction pft
GROUP BY pft.visit_id, pft.casino_id;  -- NO GAMING DAY FILTER
```

**Issue**: View aggregates by visit_id only, not by gaming_day.

### Location 3: Visit Creation Logic

**File**: `services/visit/crud.ts:201-245`

```typescript
export async function startVisit(...): Promise<StartVisitResultDTO> {
  // Check for existing active visit (idempotency)
  const existing = await getActiveVisitForPlayer(supabase, playerId);
  if (existing.visit) {
    return { visit: existing.visit, isNew: false };  // REUSES ACROSS GAMING DAYS
  }
  // ...
}
```

**Issue**: No gaming day check - reuses visits from previous gaming days.

### Location 4: No Gaming Day Constraint on Visits

**Current constraint**: One active visit per (player_id, casino_id)
**Missing constraint**: One active visit per (player_id, casino_id, gaming_day)

---

## Remediation Options

### Option A: Gaming-Day-Scoped Visit Isolation (Recommended)

**Principle**: One visit per player per gaming day. Previous gaming day visits auto-close at boundary or are explicitly closed.

#### Database Changes

```sql
-- 1. Add computed gaming_day column to visit
ALTER TABLE visit ADD COLUMN gaming_day date
  GENERATED ALWAYS AS (compute_gaming_day(started_at, casino_id)) STORED;

-- 2. Unique constraint: one active visit per player per gaming day
CREATE UNIQUE INDEX uq_visit_player_gaming_day_active
  ON visit (casino_id, player_id, gaming_day)
  WHERE ended_at IS NULL AND player_id IS NOT NULL;
```

#### Service Layer Changes

```typescript
// services/visit/crud.ts
export async function startVisit(...): Promise<StartVisitResultDTO> {
  const currentGamingDay = await getGamingDay(supabase, casinoId);

  // Check for existing active visit IN THE SAME GAMING DAY
  const existing = await getActiveVisitForPlayerInGamingDay(
    supabase, playerId, currentGamingDay
  );

  if (existing.visit) {
    // Notify user: "Resuming existing session from today"
    return { visit: existing.visit, isNew: false, resumed: true };
  }

  // Close any stale active visits from previous gaming days
  await closeStaleVisits(supabase, playerId, currentGamingDay);

  // Create new visit for current gaming day
  return createNewVisit(...);
}
```

#### BFF RPC Changes

```sql
-- Filter financial aggregation by gaming day
WHERE pft.visit_id = v_slip.visit_id
  AND pft.gaming_day = v_gaming_day  -- ADD THIS
  AND pft.casino_id = p_casino_id;
```

**Pros**: Clean separation, clear audit trail, simple mental model
**Cons**: Requires migration of existing data, potential breaking change for long-running sessions

---

### Option B: Gaming-Day-Scoped Financial Aggregation Only

**Principle**: Visits can span gaming days, but financial totals shown in modal are scoped to current gaming day.

#### Database Changes

```sql
-- Add gaming-day-scoped view
CREATE OR REPLACE VIEW visit_financial_summary_by_gaming_day AS
SELECT
  pft.visit_id,
  pft.gaming_day,
  pft.casino_id,
  SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END) AS total_in,
  SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END) AS total_out,
  ...
FROM player_financial_transaction pft
GROUP BY pft.visit_id, pft.gaming_day, pft.casino_id;
```

#### DTO Changes

```typescript
financial: {
  totalCashIn: number;       // Visit-lifetime total (for reference)
  gamingDayTotalIn: number;  // Current gaming day only (for MTL)
  totalChipsOut: number;
  gamingDayChipsOut: number;
  netPosition: number;
  gamingDayNetPosition: number;
}
```

**Pros**: Less disruptive, visits remain intact, backward compatible
**Cons**: Dual totals may confuse users, doesn't address visit spanning issue

---

### Option C: Visit Close at Gaming Day Boundary (Automated)

**Principle**: Scheduled job closes all active visits at gaming day cutoff time.

#### Database Changes

```sql
-- Scheduled function (runs at gaming day boundary)
CREATE FUNCTION close_visits_at_gaming_day_boundary()
RETURNS void AS $$
BEGIN
  -- Close all active rating slips first
  UPDATE rating_slip SET status = 'closed', end_time = now()
  WHERE status IN ('open', 'paused')
    AND compute_gaming_day(start_time, casino_id) < compute_gaming_day(now(), casino_id);

  -- Then close visits
  UPDATE visit SET ended_at = now()
  WHERE ended_at IS NULL
    AND compute_gaming_day(started_at, casino_id) < compute_gaming_day(now(), casino_id);
END;
$$;

-- Supabase cron job (pg_cron)
SELECT cron.schedule('close-stale-visits', '0 6 * * *',
  'SELECT close_visits_at_gaming_day_boundary()');
```

**Pros**: Clean boundary enforcement, automatic
**Cons**: Requires cron setup, may interrupt active overnight sessions

---

## Recommended Approach: Hybrid A + C

1. **Immediate**: Implement Option A (gaming-day-scoped visit isolation)
2. **Safety net**: Implement Option C (automated boundary closure) as backup
3. **UI notification**: When player is seated and has a same-gaming-day visit, show notification

---

## Implementation Priority

| Component | Change | Priority | Effort |
|-----------|--------|----------|--------|
| `startVisit()` | Check for same-gaming-day visit, close stale visits | P0 | M |
| BFF RPC | Add gaming_day filter to financial aggregation | P0 | S |
| Modal UI | Show notification when resuming existing session | P1 | S |
| Database | Add gaming_day column to visit table | P1 | M |
| Cron job | Auto-close visits at boundary | P2 | M |
| DTOs | Add `gamingDayTotalIn` field | P2 | S |

---

## Related Files

### Database
- `supabase/migrations/20251226123939_prd018_modal_bff_rpc.sql` - BFF RPC
- `supabase/migrations/20251213180125_add_visit_financial_summary_view.sql` - Financial view

### Services
- `services/visit/crud.ts` - Visit creation logic
- `services/player-financial/crud.ts` - Financial aggregation
- `services/rating-slip-modal/rpc.ts` - Modal data RPC wrapper

### API Routes
- `app/api/v1/rating-slips/[id]/modal-data/route.ts` - BFF endpoint

### Components
- `components/modals/rating-slip/rating-slip-modal.tsx` - Modal component
- `components/modals/rating-slip/form-section-cash-in.tsx` - Cash-in display

---

## Acceptance Criteria

- [ ] New session for new gaming day shows $0 total (not historical)
- [ ] Session within same gaming day is reused with notification
- [ ] MTL threshold checks use gaming-day-scoped totals
- [ ] `visit_group_id` links related visits for player history
- [ ] Existing visits from previous gaming days are closed on new session start
- [ ] UI clearly indicates when resuming vs starting fresh
