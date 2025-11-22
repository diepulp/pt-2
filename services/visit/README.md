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

**Pattern B: Canonical CRUD**

**Rationale**: Visit service manages simple session tracking (player check-in/check-out) with straightforward CRUD operations. DTOs mirror database schema 1:1 since session data flows directly from table structure. No complex business logic or domain transformations required.

**Characteristics**:
- DTOs use `Pick<Database['public']['Tables']['visit']['Row'], ...>`
- Minimal business logic (session start/end handled in Server Actions)
- Session lifecycle tracking (started_at, ended_at timestamps)
- Schema changes auto-sync via type derivation

## References

- [SRM §1007-1060](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
