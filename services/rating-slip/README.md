# RatingSlipService - Telemetry Context

> **Bounded Context**: "What gameplay activity occurred?"
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §1720-1806](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
> **Status**: Implemented

---

## Ownership

**Tables** (1):
- `rating_slip` - Gameplay telemetry and session state

**DTOs**:
- `RatingSlipDTO` - Internal full row access
- `RatingSlipTelemetryDTO` - Published cross-context contract (consumed by Loyalty)

**State Machine**:
- `open` → `paused` → `resumed` → `closed` → `archived`

---

## Core Responsibilities

**OWNS**:
- `average_bet` - How much player wagered (INPUT for Loyalty points calculation)
- `start_time` / `end_time` - Duration of play
- `game_settings` - Game configuration snapshot
- `seat_number` - Player position
- `status` - Rating slip lifecycle state
- `policy_snapshot` - Reward policy at time of play (for audit)

**DOES NOT STORE**:
- ❌ Reward balances or points → **Loyalty** is the sole source of truth (SRM:1732-1733)
- ❌ Financial transactions → **PlayerFinancialService** owns monetary data (ADR-006)

---

## Cross-Context Dependencies

**Consumes**:
- `CasinoService` → `CasinoDTO` (jurisdiction, casino_id)
- `PlayerService` → `PlayerDTO` (who is playing)
- `TableContextService` → `GamingTableDTO` (where gameplay occurred)
- `VisitService` → `VisitDTO` (session context)

**Provides**:
- `RatingSlipTelemetryDTO` to **LoyaltyService** (for mid-session rewards)
- `RatingSlipDTO` to **MTLService** (optional compliance FK)
- `RatingSlipDTO` to **PlayerFinancialService** (legacy compat FK)

---

## Key Patterns

### Telemetry Updates

```typescript
// State-safe update (enforced by state machine)
const result = await ratingSlipService.updateTelemetry({
  id: ratingSlipId,
  average_bet: 50.00,
  status: 'paused'
});
```

### Mid-Session Reward Eligibility

**Guard**: Mid-session rewards only when `status ∈ ('open', 'paused')`

```sql
-- Enforced by rpc_issue_mid_session_reward
SELECT 1 FROM rating_slip
WHERE id = p_rating_slip_id
  AND player_id = p_player_id
  AND casino_id = p_casino_id
  AND status IN ('open', 'paused');

IF NOT FOUND THEN
  RAISE EXCEPTION 'Rating slip not eligible for mid-session reward';
END IF;
```

### Policy Snapshot

`policy_snapshot` captures casino reward thresholds at slip creation for audit trails:
```json
{
  "mid_session_enabled": true,
  "min_average_bet": 25,
  "min_duration_minutes": 30,
  "points_per_dollar": 1
}
```

---

## State Transition Rules

```
created → open → paused ⇄ resumed → closed → archived
                 ↓
              (mid-session rewards allowed while open/paused)
```

**Immutable After Creation**:
- `player_id`
- `casino_id`
- `start_time`

**Required at Close**:
- `end_time` must be set
- `status` must transition to `closed`

---

## Realtime & Cache

**Events Emitted**:
- `ratingSlip.created` → Invalidates `['rating-slip', 'list', casino_id]`
- `ratingSlip.updated` → Invalidates `['rating-slip', 'detail', rating_slip_id]`
- `ratingSlip.closed` → Invalidates both list + detail

**Broadcast Throttling**:
- ✅ State transitions (OPEN → PAUSED → CLOSED)
- ❌ High-frequency telemetry updates (use 1-5s snapshots or poll + ETag)

**Reference**: [OBSERVABILITY_SPEC.md §4](../../docs/50-ops/OBSERVABILITY_SPEC.md)

---

## Performance SLOs

| Operation | Target | Alert Threshold |
|-----------|--------|-----------------|
| Telemetry UPDATE | p95 < 80ms | > 100ms for 5min |
| State transition errors | < 0.01% | > 0.1% |

---

## References

- **SRM Section**: [§1720-1806](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- **ADR-006**: [Rating Slip Field Removal](../../docs/80-adrs/ADR-006-rating-slip-field-removal.md)
- **Service Template**: [SERVICE_TEMPLATE.md](../../docs/70-governance/SERVICE_TEMPLATE.md)
- **DTO Standard**: [DTO_CANONICAL_STANDARD.md](../../docs/25-api-data/DTO_CANONICAL_STANDARD.md) (Hybrid pattern)
