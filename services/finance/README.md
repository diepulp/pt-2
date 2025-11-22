# PlayerFinancialService - Finance Context

> **Bounded Context**: Player financial transactions and monetary ledgers
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §1807-1977](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
> **Status**: Implemented

## Ownership

**Tables** (2):
- `player_financial_transaction` - Monetary ledger (append-only)
- `finance_outbox` - Async side effects

## Pattern

**Pattern A: Contract-First**

**Rationale**: Financial transactions require strict compliance rules, audit trails, and idempotency guarantees. Domain contracts must remain stable for external systems (payment gateways, accounting) while allowing internal schema evolution. Gaming day computation and monetary ledger logic are complex business rules requiring decoupling from database schema.

**Characteristics**:
- Manual DTO interfaces (financial transaction contracts)
- RPC-based operations (`rpc_create_financial_txn`)
- Idempotency key handling
- Outbox pattern for async webhooks

## Core Responsibilities

**OWNS**:
- Monetary transaction recording (cash in, chips, markers)
- Gaming day computation (via `casino_settings.gaming_day_start_time`)
- Financial outbox for payment gateway webhooks

**Idempotency**:
- `idempotency_key` column with partial unique index
- `rpc_create_financial_txn` handles on conflict

## Key Patterns

### Gaming Day Trigger

`gaming_day` is **derived automatically** by trigger:
```sql
CREATE TRIGGER trg_fin_gaming_day
BEFORE INSERT OR UPDATE ON player_financial_transaction
FOR EACH ROW EXECUTE FUNCTION set_fin_txn_gaming_day();
```

**Application callers MUST omit `gaming_day`** - it is populated by database.

### Idempotent Transaction Creation

```typescript
const txnId = await supabase.rpc('rpc_create_financial_txn', {
  p_casino_id: casinoId,
  p_player_id: playerId,
  p_amount: 500.00,
  p_tender_type: 'cash',
  p_idempotency_key: requestId,
  p_visit_id: visitId, // Optional
  p_rating_slip_id: ratingSlipId // Optional (legacy compat)
});
```

## Cross-Context

**Consumes**:
- `VisitService` → `VisitDTO` (session FK)
- `RatingSlipService` → `RatingSlipDTO` (legacy compat FK)

## References

- [SRM §1807-1977](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- [ADR-006](../../docs/80-adrs/ADR-006-rating-slip-field-removal.md) - Financial field removal from rating_slip
