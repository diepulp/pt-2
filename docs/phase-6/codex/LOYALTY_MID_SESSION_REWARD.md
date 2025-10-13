🪙 Loyalty Service — Mid-Session Reward Update Strategy
Problem

Your base design emits RatingSlipCompleted → LoyaltyService → accrues points at session end.
However, you now need the ability to:

✅ Issue or adjust loyalty points while a session is still active — e.g., for real-time bonuses, promos, or staff overrides.

Principle

Keep LoyaltyService as the sole authority for points mutation,
but allow RatingSlipService (or any authorized domain) to emit interim events — not to compute, but to request accrual.

In DDD terms: “Domain events may be triggered at different lifecycle points, but the policy execution remains centralized.”

Approach Overview

| Concern                         | Solution                                                         |
| ------------------------------- | ---------------------------------------------------------------- |
| Maintain event-driven integrity | Keep events as triggers for all accruals.                        |
| Allow in-session updates        | Add a “provisional points” pathway.                              |
| Prevent double-counting         | Use `session_id` + `source_type` to uniquely key ledger entries. |
| Ensure idempotency              | `UPSERT` or deduplicate by composite keys.                       |

## Event Model
**Existing**

```json
{
  "type": "RATINGS_SLIP_COMPLETED",
  "data": { "playerId": "...", "averageBet": 200, "durationMinutes": 45 }
}

```

**New (In-Session Event)**

```json
{
  "type": "POINTS_UPDATE_REQUESTED",
  "data": {
    "playerId": "...",
    "sessionId": "...",
    "points": 300,
    "reason": "Mid-session bonus",
    "source": "manual" // or "promotion", "system"
  }
}
```

## Loyalty Service Handling
1. Unified Handler

Both end-of-session and mid-session events funnel through the same accruePoints pipeline.

```ts
// loyaltyService.ts
export async function accruePoints(event: PointsEvent) {
  const { playerId, points, sessionId, reason } = event.data;
  await ledger.insertUnique({
    player_id: playerId,
    session_id: sessionId,
    event_type: event.type,
    points_change: points,
    reason,
  });
  await playerLoyalty.updateBalance(playerId, points);
}
```

The insertUnique() ensures no duplicate accruals per event source.

2. Direct Invocation (Authorized Path)

Sometimes, event emission may be overkill (e.g., quick manual reward).
You can allow staff-facing tools to call the same logic directly:

```ts
await loyaltyService.manualReward({
  playerId,
  points: 200,
  reason: "Supervisor bonus",
  sessionId: currentSessionId,
});
```

3. Schema Adjustments
Loyalty Ledger:

```sql
ALTER TABLE loyalty_ledger
ADD COLUMN session_id UUID,
ADD COLUMN reason TEXT,
ADD COLUMN source TEXT DEFAULT 'system';
CREATE UNIQUE INDEX ON loyalty_ledger (session_id, event_type, source);
```

This enables mid-session accruals without double-counting at session close.
Event hangling logic

```mermaid
flowchart LR
  RS[RatingSlipService] -->|RatingSlipCompleted| L[LoyaltyService]
  RS -->|PointsUpdateRequested (mid-session)| L
  StaffPanel -->|ManualReward()| L
  L --> LL[(LoyaltyLedger)]
  L --> PL[(PlayerLoyalty)]
```

5. Anti-Pattern Avoidance
Anti-Pattern	Fix
RatingSlip updates loyalty balance directly	❌ Not allowed — emit event or call service
Multiple services writing to ledger	❌ LoyaltyService only
Mid-session points stored in RatingSlip	❌ Store all in loyalty_ledger with session link
Separate “bonus” ledger	❌ Keep unified ledger; use reason/source metadata

6. Implementation Notes

Session closure logic should still emit a final event (e.g., aggregate metrics).

Loyalty Service should ignore duplicates based on session_id + event_type + source.

The balance field in player_loyalty is always authoritative — recalculated from the ledger if needed.

✅ Summary Handoff
| Concern                | Resolution                                               |
| ---------------------- | -------------------------------------------------------- |
| Domain owner of points | LoyaltyService                                           |
| Mid-session issuance   | `POINTS_UPDATE_REQUESTED` event or `manualReward()` call |
| Source of truth        | `loyalty_ledger`                                         |
| Coupling               | Loose — all updates via events or service method         |
| Duplication control    | Composite index (session_id, event_type, source)         |
| Triggering contexts    | RatingSlip, StaffPanel, PromotionEngine                  |

📦 Implementation Order

Extend loyalty_ledger schema (session_id, reason, source).

Add unified accruePoints() handler.

Add manualReward() wrapper.

Register event listeners for:

RATINGS_SLIP_COMPLETED

POINTS_UPDATE_REQUESTED

Update player_loyalty on each accrual.

🧮 Mid-Session Reward → Total Points Update Flow
1. Data Source of Truth

loyalty_ledger — immutable event log of all point deltas.
Every accrual or reward (system or manual) is recorded here.

player_loyalty.total_points — cached aggregate, always derived from the ledger.

2. When a Mid-Session Reward Is Issued
Event emitted or API call:

```json
{
  "type": "POINTS_UPDATE_REQUESTED",
  "data": {
    "playerId": "uuid",
    "sessionId": "uuid",
    "points": 200,
    "reason": "Supervisor bonus",
    "source": "manual"
  }
}
```
LoyaltyService handles it:
```ts
// loyalty/business/accrual.ts
export async function accruePoints(event: PointsEvent) {
  const { playerId, sessionId, points, reason, source } = event.data;

  // 1️⃣ Log in ledger
  await supabase.from("loyalty_ledger").insert({
    player_id: playerId,
    session_id: sessionId,
    event_type: event.type,
    points_change: points,
    reason,
    source,
  });

  // 2️⃣ Increment cached total + tier progress
  await supabase.rpc("increment_player_loyalty", {
    player_id: playerId,
    delta_points: points,
  });
}
```

3. Total Points Adjustment Logic
Option A — Materialized View (recalculated nightly)

Rebuild totals from ledger for integrity.

Ideal for analytics and anti-fraud verification.

Option B — Live Update (preferred for PT runtime)

Use a lightweight RPC or SQL trigger:
```sql
CREATE OR REPLACE FUNCTION increment_player_loyalty(player_id UUID, delta_points INT)
RETURNS VOID AS $$
BEGIN
  UPDATE player_loyalty
  SET total_points = total_points + delta_points,
      tier_progress = calculate_tier_progress(total_points + delta_points),
      last_update = now()
  WHERE player_id = increment_player_loyalty.player_id;
END;
$$ LANGUAGE plpgsql;
```
This keeps player_loyalty always accurate, even mid-session.

4. Session End

When the RATINGS_SLIP_COMPLETED event arrives:

Loyalty simply adds the remaining earned points.

Since mid-session bonuses already exist in the ledger, they are additive — no overwrite or re-calc needed.

5.Summary
| Step                      | Description                                 | Effect                        |
| ------------------------- | ------------------------------------------- | ----------------------------- |
| Mid-session reward issued | Event or manual call                        | Inserts new ledger row        |
| Ledger insert             | Adds immutable entry                        | Preserves audit               |
| RPC update                | Increments total_points & recalculates tier | Keeps player snapshot current |
| End-session accrual       | Adds final earned points                    | Completes session accounting  |

✅ Final Behavior

Player sees real-time point increase.

Ledger remains the single source of truth.

No duplication at session close.

Tier logic automatically re-evaluates on each increment.