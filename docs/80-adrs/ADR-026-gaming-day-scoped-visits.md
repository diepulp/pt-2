# ADR-026: Gaming-Day-Scoped Visits

**Status:** Accepted
**Date:** 2026-01-16
**Owner:** Platform/Architecture
**Decision Scope:** Visit lifecycle and gaming day boundaries
**Amends:** SRM v4.0.0 (VisitService bounded context)
**Related:** ADR-024, ADR-025, PRD-MTL-UI-GAPS, ISSUE-GDC-001

---

## Context

### Problem Statement

The rating slip modal displays "Total Cash In" that includes amounts from prior gaming days when a player returns after the gaming day cutoff. This occurs because:

1. **Visit reuse across gaming days**: `startVisit()` returns an existing active visit regardless of when it was created
2. **Visit-scoped aggregation**: Financial totals are computed by `visit_id` without gaming day filtering

```
Gaming Day 1 (Jan 14):
  └── Visit V1 created, player buys in $500, visit remains active

Gaming Day 2 (Jan 15):
  └── Player seated → startVisit returns existing V1
  └── Modal shows $500 as "today's total" (INCORRECT)
```

### Compliance Risk

Operational thresholds (CTR/MTL) are gaming-day-scoped per FinCEN regulations:
- **CTR threshold**: $10,000 aggregate per gaming day per patron
- **MTL floor**: $3,000 aggregate per gaming day triggers logging

Presenting multi-day totals as "today" creates:
- False positives: Unnecessary escalation when yesterday's totals push over threshold
- False negatives: Staff distrust numbers or misinterpret them
- Audit risk: Compliance reports show incorrect daily totals

### Current State

| Table | Has `gaming_day`? | Mechanism |
|-------|-------------------|-----------|
| `player_financial_transaction` | ✅ Yes | Trigger-computed from `created_at` |
| `visit` | ❌ No | Missing |
| `rating_slip` | ❌ No | Derived in BFF from `start_time` |

The `player_financial_transaction.gaming_day` column exists with proper trigger computation, but there's no constraint preventing visits from spanning multiple gaming days.

---

## Decision

### Adopt Gaming-Day-Scoped Visits

A **visit** is the canonical container for a player's activity **within a single gaming day** at a casino.

### Domain Semantics

| Rule | Enforcement |
|------|-------------|
| One active visit per player per casino **per gaming day** | Unique partial index |
| Re-seating same gaming day resumes existing visit | `startVisit()` lookup |
| Crossing gaming day boundary creates new visit | Stale visit auto-close |
| Multi-day player history linked via `visit_group_id` | Existing column |

### Practical Consequences

- A player can have multiple visits over time (one per gaming day)
- A player has at most **one active visit** per casino per gaming day
- Re-seating a player later the same gaming day resumes the same visit
- Crossing the gaming day cutoff closes stale visits and creates a new one

---

## Data Model Changes

### 1. Add `gaming_day` Column to Visit

```sql
-- Add column (nullable for backfill)
ALTER TABLE visit ADD COLUMN gaming_day date;

-- Backfill existing rows using canonical timezone-aware RPC
UPDATE visit SET gaming_day = compute_gaming_day(visit.casino_id, visit.started_at);

-- Make NOT NULL after backfill
ALTER TABLE visit ALTER COLUMN gaming_day SET NOT NULL;
```

### 2. Add Trigger for Auto-Computation

```sql
-- Use canonical timezone-aware RPC (compute_gaming_day(casino_id, timestamp))
-- This pattern fetches gaming_day_start_time AND timezone from casino_settings,
-- converts timestamp to casino's local timezone, then computes gaming day boundary.
-- Reference: migration 20260116184731_fix_gaming_day_timezone_triggers.sql

CREATE OR REPLACE FUNCTION set_visit_gaming_day()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.gaming_day := compute_gaming_day(NEW.casino_id, COALESCE(NEW.started_at, now()));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_visit_gaming_day
  BEFORE INSERT OR UPDATE OF started_at ON visit
  FOR EACH ROW EXECUTE FUNCTION set_visit_gaming_day();
```

### 3. Add Unique Constraint

```sql
-- One active visit per player per casino per gaming day
CREATE UNIQUE INDEX uq_visit_player_gaming_day_active
  ON visit (casino_id, player_id, gaming_day)
  WHERE ended_at IS NULL AND player_id IS NOT NULL;

-- Index for efficient lookups
CREATE INDEX ix_visit_casino_gaming_day
  ON visit (casino_id, gaming_day);
```

### 4. Update BFF RPC Financial Aggregation

```sql
-- Current (problematic):
WHERE pft.visit_id = v_slip.visit_id
  AND pft.casino_id = p_casino_id;

-- Fixed (gaming-day-scoped):
WHERE pft.visit_id = v_slip.visit_id
  AND pft.gaming_day = v_gaming_day
  AND pft.casino_id = p_casino_id;
```

---

## Service Layer Changes

### Principle: RPC-First Under RLS (No Client-Side UPDATE)

Because PT-2 uses **RLS + authoritative context injection** (ADR-024 / `set_rls_context_from_staff()`), the service layer must **not** depend on direct `.update()` calls to close visits/slips. In production, those updates will either be **blocked by privileges/RLS** or become a dangerous exception.

**Rule:** all state transitions in this flow happen via **SECURITY DEFINER RPCs** that:
- `PERFORM set_rls_context_from_staff();`
- derive `casino_id`, `actor_id`, `staff_role` from the validated context
- apply updates/inserts inside one transaction
- emit `audit_log` entries for closure/rollover

### RPC: `rpc_start_or_resume_visit(p_player_id uuid)`

Client-callable entry point used by `VisitService.startVisit()`.

**Inputs (spoof-resistant):**
- `p_player_id uuid` (target patron)

**Derivations (server-side):**
- `v_casino_id := current_setting('app.casino_id')::uuid`
- `v_actor_id  := current_setting('app.actor_id')::uuid`
- `v_gaming_day := compute_gaming_day(v_casino_id, now())` — canonical timezone-aware RPC

**Behavior:**
1. If an **active visit exists** for `(casino_id, player_id, gaming_day)` → return it (`resumed=true`).
2. Else:
   - Close **stale active visits** for prior gaming days.
   - Close any **active/paused rating slips** belonging to those stale visits (status='closed', end_time=now()).
   - Create new visit for `v_gaming_day` (inherit/establish `visit_group_id`).
   - Return it (`is_new=true`).

**Idempotency / race safety:**
- The unique partial index `uq_visit_player_gaming_day_active` is the safety rail.
- Use a transaction that attempts `INSERT`, and on `unique_violation` selects the existing same-day active visit.

#### SQL Sketch (pseudocode)

```sql
CREATE OR REPLACE FUNCTION public.rpc_start_or_resume_visit(
  p_player_id uuid
) RETURNS TABLE(
  visit public.visit,
  is_new boolean,
  resumed boolean,
  gaming_day date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_gaming_day date;
  v_existing public.visit;
  v_stale_group uuid;
  v_stale_visit_ids uuid[];
BEGIN
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id  := NULLIF(current_setting('app.actor_id',  true), '')::uuid;

  -- Use canonical timezone-aware RPC (no interval lookup needed)
  v_gaming_day := compute_gaming_day(v_casino_id, now());

  -- 1) resume if same-day active exists
  SELECT * INTO v_existing
    FROM visit
   WHERE casino_id = v_casino_id
     AND player_id = p_player_id
     AND gaming_day = v_gaming_day
     AND ended_at IS NULL
   LIMIT 1;

  IF FOUND THEN
    visit := v_existing;
    is_new := false;
    resumed := true;
    gaming_day := v_gaming_day;
    RETURN NEXT;
    RETURN;
  END IF;

  -- 2) close stale active visits (prior gaming days)
  -- capture group id (if any) from stale visit to preserve continuity
  SELECT visit_group_id, ARRAY_AGG(id)
    INTO v_stale_group, v_stale_visit_ids
    FROM visit
   WHERE casino_id = v_casino_id
     AND player_id = p_player_id
     AND ended_at IS NULL
     AND gaming_day <> v_gaming_day
   GROUP BY visit_group_id
   ORDER BY MAX(started_at) DESC
   LIMIT 1;

  -- close rating slips for stale visits
  -- Note: rating_slip has end_time (not ended_at), no close_reason column,
  -- and no direct player_id - we filter via visit_id
  IF v_stale_visit_ids IS NOT NULL THEN
    UPDATE rating_slip rs
       SET status = 'closed',
           end_time = now()
     WHERE rs.casino_id = v_casino_id
       AND rs.status IN ('open','paused')
       AND rs.visit_id = ANY(v_stale_visit_ids);

    UPDATE visit
       SET ended_at = now()
     WHERE id = ANY(v_stale_visit_ids);
  END IF;

  -- 3) create new visit (race safe via unique index)
  BEGIN
    INSERT INTO visit (casino_id, player_id, started_at, gaming_day, visit_group_id)
    VALUES (
      v_casino_id,
      p_player_id,
      now(),
      v_gaming_day,
      COALESCE(v_stale_group, gen_random_uuid())
    )
    RETURNING * INTO v_existing;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing
      FROM visit
     WHERE casino_id = v_casino_id
       AND player_id = p_player_id
       AND gaming_day = v_gaming_day
       AND ended_at IS NULL
     LIMIT 1;
  END;

  -- audit log (details column, not metadata)
  INSERT INTO audit_log (casino_id, actor_id, action, domain, details)
  VALUES (
    v_casino_id,
    v_actor_id,
    'visit_rollover',
    'visit',
    jsonb_build_object(
      'gaming_day', v_gaming_day,
      'new_visit_id', v_existing.id,
      'closed_visit_ids', v_stale_visit_ids
    )
  );

  visit := v_existing;
  is_new := true;
  resumed := false;
  gaming_day := v_gaming_day;
  RETURN NEXT;
END;
$$;
```

> **Note:** The rating slip closure uses `end_time` (not `ended_at`) and filters via `visit_id` since `rating_slip` has no direct `player_id` column. For more sophisticated closure logic (e.g., computing final duration), consider calling `rpc_close_rating_slip` in a loop instead of direct UPDATE.

### VisitService.startVisit() (TypeScript)

`VisitService.startVisit()` becomes a thin wrapper around the RPC.

```ts
export async function startVisit(
  supabase: SupabaseClient<Database>,
  playerId: string,
): Promise<StartVisitResultDTO> {
  const { data, error } = await supabase.rpc('rpc_start_or_resume_visit', {
    p_player_id: playerId,
  });

  if (error) throw error;

  // data is a single-row result with { visit, is_new, resumed, gaming_day }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    visit: row.visit,
    isNew: row.is_new,
    resumed: row.resumed,
    gamingDay: row.gaming_day,
  };
}
```

### Rating Slip Boundary Rule (Explicit)

**INV-RS-1:** A rating slip is **visit-scoped**. Therefore, when a gaming day rolls over:
- any active/paused slip on the stale visit is **closed** (status='closed', end_time=now())
- the closure is audited via `audit_log` with `closed_visit_ids` in details
- the new gaming-day visit receives a **new slip** when gameplay begins (optionally linked via `rating_slip_group_id` or `visit_group_id`)

This preserves the prior day’s data as immutable history while preventing “today” totals from inheriting yesterday’s session context.


---

## UI Changes

### Modal Notification

When resuming an existing same-day visit:

```tsx
{modalData.resumed && (
  <div className="p-3 bg-blue-950/30 border border-blue-800/50 rounded-lg text-sm">
    <Info className="h-4 w-4 inline mr-2" />
    Resuming session from earlier today. Existing buy-in: ${totalCashIn}
  </div>
)}
```

### Gaming Day Display

Surface gaming day in modal header:

```tsx
<DialogDescription>
  Gaming Day: {formatDate(modalData.slip.gamingDay)}
</DialogDescription>
```

---

## Security Invariants

**INV-1:** Visit `gaming_day` is computed via `compute_gaming_day(casino_id, started_at)` — the canonical timezone-aware RPC that respects casino's cutoff time AND timezone

**INV-2:** At most one active visit per `(casino_id, player_id, gaming_day)` tuple

**INV-3:** Financial aggregations for "today" use `gaming_day` filter

**INV-4:** Stale visit closure is automatic on new gaming day seat action

**INV-5:** `visit_group_id` preserves multi-day player history linkage

**INV-6:** Rating slips do not span gaming days: stale visit slips are closed at rollover; new gaming-day visit gets a new slip

---

## Migration Plan

### Phase 0: Database Schema (Day 1)

```bash
# Generate migration
date +%Y%m%d%H%M%S  # e.g., 20260116180000

# Create: 20260116XXXXXX_adr026_gaming_day_scoped_visits.sql
```

Migration contents:
1. Add `visit.gaming_day` column (nullable)
2. Add trigger `set_visit_gaming_day()`
3. Backfill existing visits
4. Set NOT NULL constraint
5. Add unique partial index
6. Update BFF RPC financial aggregation

### Phase 1: Service Layer (Day 2)

1. Implement RPC `rpc_start_or_resume_visit(p_player_id uuid)` (SECURITY DEFINER)
   - Calls `set_rls_context_from_staff()`
   - Resumes same-day active visit OR closes stale visit+slip and creates new visit
   - Writes `audit_log` entry for rollover

2. Update `services/visit/startVisit()` to call the RPC
   - Remove client-side `.update()` closure logic (no direct UPDATEs under RLS)
   - Return `{ visit, isNew, resumed, gamingDay }` from RPC output

3. Ensure rating-slip creation logic uses the **new visit**
   - On first action that opens a slip, create a new slip for the current visit

4. Regenerate Supabase types (`npm run db:types`) and update DTOs

### Phase 2: UI Integration (Day 3)

1. Update modal to display gaming day
2. Add "resuming session" notification
3. Test gaming day boundary scenarios

### Phase 3: Cleanup Job (Optional, Post-MVP)

```sql
-- Scheduled function for safety net (runs per casino)
-- Uses canonical timezone-aware RPC pattern
CREATE FUNCTION close_visits_at_gaming_day_boundary(p_casino_id uuid)
RETURNS void AS $$
DECLARE
  v_current_gaming_day date;
BEGIN
  -- Use canonical timezone-aware RPC
  v_current_gaming_day := compute_gaming_day(p_casino_id, now());

  -- Close stale rating slips first
  UPDATE rating_slip rs
     SET status = 'closed',
         end_time = now()
   WHERE rs.casino_id = p_casino_id
     AND rs.status IN ('open', 'paused')
     AND rs.visit_id IN (
       SELECT v.id FROM visit v
        WHERE v.casino_id = p_casino_id
          AND v.ended_at IS NULL
          AND v.gaming_day < v_current_gaming_day
     );

  -- Then close visits
  UPDATE visit
     SET ended_at = now()
   WHERE casino_id = p_casino_id
     AND ended_at IS NULL
     AND gaming_day < v_current_gaming_day;
END;
$$ LANGUAGE plpgsql;
```

---

## Consequences

### Positive

- **Compliance correct by default**: Gaming-day totals are unambiguous
- **Structural invariant**: Unique index prevents multi-day visit reuse
- **Simpler aggregations**: `SUM(...) WHERE visit_id = X` is now day-scoped
- **Reduced regression risk**: No need to remember gaming_day filter everywhere
- **Audit clarity**: Each gaming day has distinct visit records

### Negative

- **Semantic blast radius**: Code assuming "one active visit forever" must change
- **Additional column**: `visit.gaming_day` adds storage (minimal)
- **Boundary handling**: Cross-midnight sessions need explicit handling

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Existing code assumes visit spans days | Inventory affected call sites; update DTO naming (`today_visit_id`) |
| Gaming day cutoff confusion | Always use `compute_gaming_day(casino_id, timestamp)` — the canonical timezone-aware RPC |
| Cross-midnight active sessions | Auto-close stale on first action; link via `visit_group_id` |
| Active rating slip at boundary | Close slip (status='closed', end_time=now()) with visit; new slip on new visit |

---

## Open Questions

1. **Boundary trigger**: Should rollover be automatic on first action after cutoff (recommended), or explicit "Roll to new gaming day" prompt?

2. **Rating slip continuity**: Should we add `rating_slip_group_id` to link slips across gaming day boundary, or reuse `visit_group_id`?

3. **Lifetime totals display**: Should modal show both "Today" and "Lifetime" totals, or just "Today"?

---

## Acceptance Criteria

- [ ] New session for new gaming day shows $0 total (not historical)
- [ ] Session within same gaming day is reused with notification
- [ ] Unique constraint prevents duplicate active visits per gaming day
- [ ] MTL threshold checks use gaming-day-scoped totals
- [ ] `visit_group_id` links related visits for player history
- [ ] Existing visits from previous gaming days are closed on new session start
- [ ] Regression test reproduces and verifies fix for carry-over scenario

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-16 | Initial ADR - Gaming-Day-Scoped Visits adopted |
| 1.0.1 | 2026-01-16 | Schema alignment audit: fixed timezone-aware RPC pattern, corrected rating_slip columns (end_time not ended_at, no close_reason), fixed audit_log column (details not metadata), updated cleanup job |
