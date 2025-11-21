# LoyaltyService - Reward Context

> **Bounded Context**: "What is this gameplay worth in rewards?"
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §1061-1274](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
> **Status**: Implemented

---

## Ownership

**Tables** (3):
- `player_loyalty` - Per-casino balance and tier status
- `loyalty_ledger` - Append-only points transaction log
- `loyalty_outbox` - Async side effects (emails, partner webhooks)

**DTOs**:
- `PlayerLoyaltyDTO` - Public loyalty balance (excludes internal preferences)
- `LoyaltyLedgerEntryDTO` - Points transaction record
- `RatingSlipTelemetryDTO` (consumed from RatingSlipService)

**RPCs**:
- `rpc_issue_mid_session_reward` - Atomic reward issuance with idempotency
- `evaluate_mid_session_reward_policy` - Pure policy evaluation function

---

## Pattern

**Pattern A: Contract-First**

**Rationale**: Loyalty has complex business logic (point calculation rules, tier progression, idempotency guarantees) that requires domain contracts intentionally decoupled from database schema. DTOs are manually defined to maintain stable contracts for external consumers while allowing internal schema evolution.

**Characteristics**:
- Manual DTO interfaces (inline in feature files)
- Business logic in `mid-session-reward.ts`
- RPC-based operations with mappers
- Tests with ~80% coverage

---

## Core Responsibilities

**OWNS**:
- Point calculation logic (business rules, formulas, multipliers)
- Tier progression rules
- Reward preferences
- Ledger as single source of truth for all points transactions

**DOES NOT OWN**:
- Gameplay telemetry (belongs to RatingSlipService)
- Financial transactions (belongs to PlayerFinancialService)
- Staff registry (belongs to CasinoService)

**Canonical Stance** (SRM:1082-1083):
> **Loyalty is the sole source of truth for rewards.** `rating_slip` stores telemetry only and never caches reward balances.

---

## Cross-Context Dependencies

**Consumes**:
- `RatingSlipService` → `RatingSlipTelemetryDTO` (for mid-session reward calculation)
- `VisitService` → `VisitDTO` (session context for ledger entries)
- `CasinoService` → `StaffDTO` (who issued the reward)

**Provides**:
- `PlayerLoyaltyDTO` to UI/external APIs
- `LoyaltyLedgerEntryDTO` to reporting/analytics

---

## Key Patterns

### Mid-Session Reward Issuance

```typescript
// Server Action (with idempotency)
const result = await supabase.rpc('rpc_issue_mid_session_reward', {
  p_casino_id: casinoId,
  p_player_id: playerId,
  p_rating_slip_id: ratingSlipId,
  p_staff_id: staffId,
  p_points: calculatedPoints,
  p_idempotency_key: requestId, // Required for retry safety
  p_reason: 'mid_session'
});

// Returns: { ledger_id, balance_after }
```

### Idempotency Guarantee

- `idempotency_key` stored in `loyalty_ledger`
- Unique partial index: `ux_loyalty_ledger_idem`
- RPC returns existing record if key collision

### Outbox Pattern

- Mutations append to `loyalty_outbox` in same transaction
- Worker drains via `FOR UPDATE SKIP LOCKED`
- Retry with exponential backoff + dead-letter alerting

---

## Performance SLOs

| Operation | Target | Alert Threshold |
|-----------|--------|-----------------|
| `rpc_issue_mid_session_reward` | p95 < 100ms | > 150ms for 5min |
| Outbox processing lag | < 100 pending | > 500 |

**Reference**: [OBSERVABILITY_SPEC.md](../../docs/50-ops/OBSERVABILITY_SPEC.md)

---

## References

- **SRM Section**: [§1061-1274](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- **API Surface**: [API_SURFACE_MVP.md](../../docs/25-api-data/API_SURFACE_MVP.md) (Loyalty Domain)
- **Service Template**: [SERVICE_TEMPLATE.md](../../docs/70-governance/SERVICE_TEMPLATE.md)
- **DTO Standard**: [DTO_CANONICAL_STANDARD.md](../../docs/25-api-data/DTO_CANONICAL_STANDARD.md)
