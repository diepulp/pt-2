# RatingSlipService - Telemetry Context

> **Bounded Context**: "What gameplay activity occurred?"
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §1720-1806](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
> **Status**: Implemented

---

## Ownership

**Tables** (2):
- `rating_slip` - Gameplay telemetry and session state
- `rating_slip_pause` - Pause interval tracking for duration calculations

**DTOs & Response Types**:
- `RatingSlipDTO` - Internal full row access (canonical, derived from Database)
- `RatingSlipCloseResponse` - Extends RatingSlipDTO with computed duration_seconds
- `StartRatingSlipInput` - Input for starting new rating slips
- `RatingSlipTelemetryDTO` - Published cross-context contract (consumed by Loyalty)

**State Machine**:
```
created → open → paused ⇄ resumed → closed → archived
                 ↓
              (mid-session rewards allowed while open/paused)
```

**RPC Functions**:
- `rpc_start_rating_slip` - Create new rating slip
- `rpc_pause_rating_slip` - Pause active gameplay
- `rpc_resume_rating_slip` - Resume paused gameplay
- `rpc_close_rating_slip` - Finalize rating slip with telemetry
- `rpc_get_rating_slip_duration` - Calculate active play duration

---

## Pattern

**Pattern C: Hybrid**

**Rationale**: Rating-slip has mixed complexity combining state machine logic (Pattern A) with telemetry CRUD operations (Pattern B). State transitions require domain rules and guard conditions (Pattern A characteristics), while telemetry updates (average_bet, duration) are straightforward data updates (Pattern B characteristics). This hybrid approach allows both manual DTOs for cross-context contracts (`RatingSlipTelemetryDTO`) and canonical DTOs for internal operations.

**Characteristics**:
- **Pattern A aspects**: State machine transitions, policy snapshots, cross-context DTO publishing (`RatingSlipTelemetryDTO`)
- **Pattern B aspects**: Telemetry field updates (average_bet, duration), basic CRUD operations
- Mix of manual and derived DTOs as appropriate per feature
- State transition guards enforce business rules

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

## Rating Slip Lifecycle Operations

### startSlip

Creates a new rating slip in "open" state. Captures game settings and policy snapshot at time of start.

```typescript
const slip = await startSlip(supabase, casinoId, actorId, {
  playerId: "...",
  tableId: "...",
  visitId: "...",
  seatNumber: "1",
  gameSettings: { minBet: 25, maxBet: 500 }
});
```

**Domain Errors**:
- `VISIT_NOT_OPEN` - Visit session is not open
- `TABLE_NOT_ACTIVE` - Gaming table is not active
- `RATING_SLIP_INVALID_STATE` - Player already has active slip

### pauseSlip

Pauses active gameplay, creating a pause interval. Status transitions from "open" to "paused".

```typescript
const slip = await pauseSlip(supabase, casinoId, actorId, ratingSlipId);
```

**Domain Errors**:
- `RATING_SLIP_NOT_OPEN` - Can only pause open slips
- `RATING_SLIP_NOT_FOUND` - Rating slip does not exist

### resumeSlip

Resumes gameplay after a pause. Status transitions from "paused" to "open".

```typescript
const slip = await resumeSlip(supabase, casinoId, actorId, ratingSlipId);
```

**Domain Errors**:
- `RATING_SLIP_NOT_PAUSED` - Can only resume paused slips
- `RATING_SLIP_NOT_FOUND` - Rating slip does not exist

### closeSlip

Finalizes rating slip, setting end_time and calculating duration. Optionally captures final average bet.

```typescript
const result = await closeSlip(supabase, casinoId, actorId, ratingSlipId, 75.50);
// result.duration_seconds includes active play time (excludes pauses)
```

**Domain Errors**:
- `RATING_SLIP_NOT_FOUND` - Rating slip does not exist
- `RATING_SLIP_ALREADY_CLOSED` - Slip is already closed

### getDuration

Calculates active play duration in seconds, accounting for pause intervals.

```typescript
const duration = await getDuration(supabase, ratingSlipId, "2025-11-28T10:00:00Z");
// Returns duration in seconds (excludes paused time)
```

**Domain Errors**:
- `RATING_SLIP_NOT_FOUND` - Rating slip does not exist

---

## Domain Error Codes

All lifecycle operations throw `DomainError` on failure (ADR-012).

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VISIT_NOT_OPEN` | 400 | Visit must be active to start rating slip |
| `TABLE_NOT_ACTIVE` | 400 | Table must be active to start rating slip |
| `RATING_SLIP_NOT_OPEN` | 409 | Can only pause open slips |
| `RATING_SLIP_NOT_PAUSED` | 409 | Can only resume paused slips |
| `RATING_SLIP_INVALID_STATE` | 409 | Invalid state transition (e.g., duplicate active slip) |
| `RATING_SLIP_ALREADY_CLOSED` | 409 | Cannot modify closed slip |
| `RATING_SLIP_NOT_FOUND` | 404 | Rating slip does not exist |
| `INTERNAL_ERROR` | 500 | RPC validation failed or unexpected error |

---

## Performance SLOs

| Operation | Target | Alert Threshold |
|-----------|--------|-----------------|
| Telemetry UPDATE | p95 < 80ms | > 100ms for 5min |
| State transition errors | < 0.01% | > 0.1% |
| Lifecycle RPC calls | p95 < 100ms | > 150ms for 5min |

---

## References

- **SRM Section**: [§1720-1806](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- **ADR-006**: [Rating Slip Field Removal](../../docs/80-adrs/ADR-006-rating-slip-field-removal.md)
- **ADR-012**: [Error Handling Layers](../../docs/80-adrs/ADR-012-error-handling-layers.md)
- **Service Template**: [SERVICE_TEMPLATE.md](../../docs/70-governance/SERVICE_TEMPLATE.md)
- **DTO Standard**: [DTO_CANONICAL_STANDARD.md](../../docs/25-api-data/DTO_CANONICAL_STANDARD.md) (Hybrid pattern)
