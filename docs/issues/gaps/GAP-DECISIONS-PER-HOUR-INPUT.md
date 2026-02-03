# GAP-DECISIONS-PER-HOUR-INPUT

**Created:** 2026-01-29
**Status:** Open
**Related PRD:** None (new feature scope)
**Discovered During:** GAP-PLAYER-360-PANELS-BACKEND-DATA (WS5 Theo Estimate)
**Severity:** High
**Category:** Telemetry / Data Input

---

## Summary

The theo calculation formula requires `decisions_per_hour` as a key input, but there is no mechanism for pit bosses to supply this value during live play. The current system uses a static casino-level default per game type (e.g., blackjack = 60, poker = 30), seeded via database migration. Pit bosses cannot observe and log the actual pace of play for a specific table or session.

**Formula:** `theo = average_bet × (house_edge / 100) × (duration_hours) × decisions_per_hour`

The accuracy of the theo estimate — and therefore loyalty point accrual — depends directly on how closely `decisions_per_hour` reflects actual table pace.

---

## Current State

### Data Flow (Static Defaults Only)

```
game_settings TABLE (database seed, no UI)
│  casino_id + game_type → decisions_per_hour
│  blackjack: 60, poker: 30, roulette: 40
│
└──→ rpc_start_rating_slip (snapshots at creation)
        ↓
     rating_slip.policy_snapshot.loyalty.decisions_per_hour
        ↓
     Loyalty accrual RPC: v_theo := v_avg_bet * (v_house_edge / 100) * v_duration_hours * v_decisions_per_hour
```

### Key Files

| File                                                                    | Role                                                                         |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `supabase/migrations/20251126131051_game_settings_theo_fields.sql`      | Defines `decisions_per_hour` column (DEFAULT 70)                             |
| `supabase/migrations/20251227170749_fix_policy_snapshot_population.sql` | Snapshots into `policy_snapshot.loyalty` — explicitly blocks caller override |
| `supabase/seed.sql`                                                     | Seeds static defaults per game type                                          |
| `services/rating-slip/crud.ts:206-212`                                  | `rpc_start_rating_slip` call — no decisions_per_hour passed                  |
| `components/dashboard/new-slip-modal.tsx:240-245`                       | Slip creation UI — no input field                                            |
| `lib/theo.ts:101-114`                                                   | `calculateTheoFromDuration()` — consumes the value                           |

### RPC Design Constraint

The `rpc_start_rating_slip` migration explicitly documents that `p_game_settings` is for "runtime state (average_bet), NOT policy values." The RPC always reads `decisions_per_hour` from the `game_settings` table lookup:

```sql
-- TABLE-AUTHORITATIVE: game_settings table is canonical source.
-- p_game_settings is for runtime state (average_bet), NOT policy values
SELECT gs.house_edge, gs.decisions_per_hour, ...
INTO v_game_settings_lookup
FROM gaming_table gt
LEFT JOIN game_settings gs ON gs.game_type = gt.type AND gs.casino_id = gt.casino_id
WHERE gt.id = p_table_id;
```

---

## What's Missing

### 1. Pit Boss Input — Per-Slip Decisions/Hr Override

**Problem:** In live casino operations, decisions per hour vary by:

- Dealer speed
- Number of players at the table
- Game variant and side bets
- Table activity level

Pit bosses observe and track pace of play as part of standard player rating. The system has no field to capture this.

**Required:**

- Input field on rating slip creation/update for observed decisions/hr (slider, toggle, with game pace percenatges to provide manual input mechanism and UI for pit bosses to log the decisions per hour accurately)
- Optional override — falls back to game_settings default when not provided
- Stored on the rating slip (either in `game_settings` JSON or as a dedicated column)

### 2. RPC Override Path

**Problem:** `rpc_start_rating_slip` intentionally ignores caller-supplied policy values.

**Required:**

- Allow optional `decisions_per_hour` override in `p_game_settings`
- Snapshot logic: `COALESCE(p_override, game_settings_table, 70)`
- Track override source in `_source`: `"decisions_per_hour": "pit_boss_override"`

### 3. Game Settings Admin UI

**Problem:** No UI exists to configure `game_settings` table values. Casino managers cannot adjust per-game-type defaults without direct database access.

**Required:**

- Admin page for game settings management
- CRUD for `decisions_per_hour`, `house_edge` per game type
- Audit trail for changes (affects future theo/loyalty calculations)

### 4. Mid-Session Update

**Problem:** If pace changes during a session (e.g., table fills up, dealer rotation), the snapshotted value becomes stale.

**Required (stretch):**

- Allow pit boss to update decisions/hr on an active rating slip
- Re-snapshot or store as running observation
- Consider: does theo recalculate from updated value, or only apply prospectively?

---

## Impact

| System                         | Impact of Static Default                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| **Theo Estimate (Player 360)** | Approximate — may overstate or understate by 20-50% depending on actual pace                    |
| **Loyalty Point Accrual**      | Points earned are proportional to theo — inaccurate decisions/hr propagates to incorrect points |
| **Comp Calculations**          | If comps are theo-based, same inaccuracy applies                                                |
| **Player Value Assessment**    | Pit supervisor sees estimated value, not observed value                                         |

---

## Interim Mitigation

GAP-PLAYER-360-PANELS WS5 implements theo using the **best available data** — the casino-configured default from `policy_snapshot.loyalty.decisions_per_hour`. This is:

- Correct for the data model as built
- Acceptable as a v0 estimate
- Clearly labeled as "Theo Estimate" (not "Theo Actual") in the UI

---

## Recommended Implementation Order

### Phase 1: Admin Configuration

- Build game settings admin UI
- Allow casino managers to set per-game-type defaults
- This alone improves accuracy by letting casinos tune their own defaults

### Phase 2: Pit Boss Override at Slip Creation

- Add optional `decisions_per_hour` field to rating slip creation form
- Modify RPC to accept and snapshot caller-supplied override
- Track source in `_source` audit trail

### Phase 3: Mid-Session Update (Stretch)

- Allow updating decisions/hr on active slips
- Define prospective vs retroactive recalculation policy

---

## Acceptance Criteria

- [ ] Pit bosses can input observed decisions/hr when creating a rating slip
- [ ] Value is snapshotted into `policy_snapshot.loyalty` with `_source: "pit_boss_override"`
- [ ] Falls back to `game_settings` table default when not provided
- [ ] Casino managers can configure per-game-type defaults via admin UI
- [ ] Theo calculation uses observed value when available

---

## Related Documents

- GAP-PLAYER-360-PANELS-BACKEND-DATA (parent — WS5 discovered this gap)
- `lib/theo.ts` — Theo calculation functions
- `supabase/migrations/20251227170749_fix_policy_snapshot_population.sql` — Snapshot RPC
- `supabase/migrations/20251126131051_game_settings_theo_fields.sql` — game_settings schema
- `supabase/migrations/20251213010000_prd004_loyalty_rpcs.sql` — Loyalty accrual uses decisions_per_hour
