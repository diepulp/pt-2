# MTLService - Compliance Context

> **Bounded Context**: "What cash/monetary transactions occurred for AML/CTR compliance?"
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §1978-2038](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
> **Status**: Implemented

## Ownership

**Tables** (2):
- `mtl_entry` - Immutable cash transaction log (write-once)
- `mtl_audit_note` - Append-only audit trail

## Pattern

**Pattern A: Contract-First**

**Rationale**: MTL (Monetary Transaction Log) is a compliance-driven service subject to strict AML/CTR regulatory requirements. Domain contracts must remain immutable and auditable, decoupled from database implementation. Threshold detection rules, gaming day calculation, and watchlist triggers are complex business logic requiring stable external contracts for regulatory reporting systems.

**Characteristics**:
- Manual DTO interfaces (compliance reporting contracts)
- Immutable records (write-once, no updates/deletes)
- Idempotency key enforcement
- Threshold detection business rules
- Temporal gaming day calculation via triggers

## Core Responsibilities

**OWNS**:
- Cash transaction logging (immutable records)
- Threshold detection rules (watchlist >= $3k, CTR >= $10k)
- Gaming day calculation (via `casino_settings` temporal authority)

**References**:
- `casino_settings` - READ-ONLY via database trigger
- Optional FKs: `staff`, `rating_slip`, `visit` (for lineage)

## Compliance Thresholds

**From `casino_settings`**:
- `watchlist_floor`: default $3,000
- `ctr_threshold`: default $10,000

Transactions meeting thresholds trigger compliance workflows.

## DTOs

- `MTLEntryDTO` - Cash transaction record
- `MTLAuditNoteDTO` - Compliance annotation

## Idempotency

`idempotency_key` column with partial unique index `ux_mtl_entry_idem`

## RLS

- **Read**: Compliance roles scoped to `casino_id`
- **Write**: Cashier + compliance services with matching `casino_id`
- **Deletes**: **Disabled** (append-only ledger)

## References

- [SRM §1978-2038](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- [SEC-001](../../docs/30-security/SEC-001-rls-policy-matrix.md) - Compliance RLS
