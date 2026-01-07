# PlayerFinancialService - Finance Context

> **Bounded Context**: Player financial transactions and monetary ledgers
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §PlayerFinancialService](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
> **Status**: IMPLEMENTED (PRD-009, 2025-12-11)

## Ownership

**Tables**:
- `player_financial_transaction` - Monetary ledger (append-only)

**Planned (Post-MVP)**:
- `finance_outbox` - Async side effects (ADR-016)

## Pattern

**Pattern A: Contract-First**

**Rationale**: Financial transactions require strict compliance rules, audit trails, and idempotency guarantees. Domain contracts must remain stable for external systems while allowing internal schema evolution.

**Characteristics**:
- Manual DTO interfaces (strict compliance contracts)
- RPC-based operations (`rpc_create_financial_txn`)
- Idempotency key handling
- Role-based validation (pit_boss, cashier, admin)

## Module Structure

| File | Purpose |
|------|---------|
| `index.ts` | Service factory + re-exports |
| `dtos.ts` | Contract-first DTO interfaces |
| `schemas.ts` | Zod validation (role-scoped) |
| `mappers.ts` | Row → DTO transformations |
| `crud.ts` | Database operations |
| `http.ts` | Client-side HTTP fetchers |
| `keys.ts` | React Query key factory |
| `selects.ts` | Supabase column selections |

## Core Responsibilities

**OWNS**:
- Monetary transaction recording (cash in, chips, markers)
- Gaming day computation (via `casino_settings.gaming_day_start_time`)
- Visit financial summary aggregation

**Key Invariants**:
- All transactions are append-only (immutable after creation)
- Transactions must be associated with an active visit (`visit_id` NOT NULL)
- Amount must always be positive (direction indicates flow)
- RPC handles idempotency and validation

## Role Capabilities (ADR-017)

| Role | Read | Write | Constraints |
|------|------|-------|-------------|
| `admin` | Yes | Yes | Full access |
| `cashier` | Yes | Yes | Cage operations: cash-outs, marker settlements |
| `pit_boss` | Yes | Limited | Table buy-ins only: `direction='in'`, `tender_type IN ('cash','chips')` |
| `compliance` | Yes | No | Read-only for audit |
| `dealer` | No | No | No access |

## API Surface

**Route Handlers**:
- `GET /api/v1/financial-transactions` - List with filters
- `POST /api/v1/financial-transactions` - Create (requires Idempotency-Key)
- `GET /api/v1/financial-transactions/[id]` - Get by ID
- `GET /api/v1/visits/[visitId]/financial-summary` - Visit totals

## Cross-Context Consumption

**Consumes**:
- `VisitService` → `visit_id` FK (required)
- `CasinoService` → `gaming_day_start_time` for gaming day derivation

**Consumed By**:
- `MTLService` → Reconciliation via triggers

## References

- [SRM §PlayerFinancialService](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- [PRD-009](../../docs/10-prd/PRD-009-player-financial-service.md)
- [EXEC-SPEC-PRD-009](../../docs/20-architecture/specs/PRD-009/EXECUTION-SPEC-PRD-009.md)
- [ADR-017 Cashier Role](../../docs/80-adrs/ADR-017-cashier-role-implementation.md)
