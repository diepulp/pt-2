# VisitService - Session Context

> **Bounded Context**: Player visit sessions
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §1007-1060](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
> **Status**: Implemented

## Ownership

**Tables** (1):
- `visit` - Player session tracking (casino jurisdiction, started_at, ended_at)

**DTOs**:
- `VisitDTO` - Session record

## Cross-Context

**Consumed By**:
- **LoyaltyService** - Session context for ledger entries
- **PlayerFinancialService** - Associate transactions with sessions
- **MTLService** - Compliance tracking (optional FK)

## Pattern

**Thin CRUD Service** - Canonical DTOs using Pick/Omit

## References

- [SRM §1007-1060](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
