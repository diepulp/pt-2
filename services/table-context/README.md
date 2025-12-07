# TableContextService - Operational Telemetry Context

> **Bounded Context**: "What is the operational state and chip custody posture of this gaming table?"
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md section 298-333](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
> **Pattern**: A (Contract-First)
> **Status**: WS-1 Foundation Complete

## Ownership

**Tables**:
- `gaming_table` - Core table entity with status lifecycle
- `gaming_table_settings` - Table-specific settings (limits, rotation intervals)
- `dealer_rotation` - Dealer assignment history
- `table_inventory_snapshot` - Chip inventory at open/close/rundown
- `table_fill` - Chip fills from cage
- `table_credit` - Chip credits back to cage
- `table_drop_event` - Drop box custody chain

**DTOs**:
- `GamingTableDTO`, `GamingTableWithDealerDTO`
- `DealerRotationDTO`
- `TableInventorySnapshotDTO`
- `TableFillDTO`, `TableCreditDTO`
- `TableDropEventDTO`

**RPCs**:
- `rpc_log_table_inventory_snapshot`
- `rpc_request_table_fill`
- `rpc_request_table_credit`
- `rpc_log_table_drop`
- `rpc_update_table_status`

## Dependencies

**Consumes**:
- CasinoService (casino_id context, staff validation)

**Consumed By**:
- RatingSlipService (table_id FK)
- FloorLayoutService (floor_table_slot references)
- Pit Dashboard (PRD-006)

## Pattern Justification

Pattern A (Contract-First) selected because:
1. Complex state machine (inactive -> active -> closed)
2. Chip custody operations with idempotency requirements
3. Dealer rotation logic with auto-end on reassignment
4. Multiple RPCs with domain-specific validation
5. Cross-context consumption by Pit Dashboard

## Domain Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `TABLE_NOT_FOUND` | 404 | Gaming table does not exist |
| `TABLE_NOT_ACTIVE` | 409 | Operation requires active table |
| `TABLE_NOT_INACTIVE` | 409 | Activation requires inactive table |
| `TABLE_ALREADY_CLOSED` | 409 | Table is already closed (terminal state) |
| `TABLE_HAS_OPEN_SLIPS` | 409 | Cannot deactivate with open rating slips |
| `TABLE_FILL_REJECTED` | 409 | Fill request rejected |
| `TABLE_CREDIT_REJECTED` | 409 | Credit request rejected |
| `FILL_DUPLICATE_REQUEST` | 409 | Fill request_id already processed |
| `CREDIT_DUPLICATE_REQUEST` | 409 | Credit request_id already processed |
| `DEALER_ROTATION_NOT_FOUND` | 404 | No active dealer rotation to end |

## File Structure

```
services/table-context/
  dtos.ts              # Domain DTOs (Pattern A - manual interfaces)
  schemas.ts           # Zod validation schemas (HTTP boundary)
  keys.ts              # React Query key factories
  selects.ts           # Named column projections
  mappers.ts           # Row-to-DTO transformations
  http.ts              # HTTP fetchers for Route Handlers
  README.md            # This file
```

## Workstream Status

- [x] WS-1: Foundation (dtos, schemas, keys, selects, mappers, http, README)
- [ ] WS-2: Table Operations (lifecycle, dealer rotation, crud)
- [ ] WS-3: Chip Custody Operations (fills, credits, drops)
- [ ] WS-4: Transport Layer (Route Handlers, Server Actions)
- [ ] WS-5: Testing

## References

- [PRD-007 Table Context Service](../../docs/10-prd/PRD-007-table-context-service.md)
- [EXECUTION-SPEC-PRD-007](../../docs/20-architecture/specs/PRD-007/EXECUTION-SPEC-PRD-007.md)
- [SRM section 298-333](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- [SLAD section 308-348](../../docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md)
