# PRD-007 TableContextService Implementation

**Completed**: 2025-12-07
**Commit**: 9a02d52
**Pattern**: A (Contract-First with manual DTOs)

## Summary
TableContextService implemented with 5 parallel workstreams using sub-agents:
- WS-1: Foundation (pt2-service-implementer)
- WS-2: Table Operations (pt2-service-implementer)
- WS-3: Chip Custody (pt2-service-implementer)
- WS-4: Transport Layer (api-expert)
- WS-5: Testing (pt2-service-implementer)

## Files Created (34 files, 6579 lines)

### Service Layer (services/table-context/)
- `dtos.ts` - GamingTableDTO, DealerRotationDTO, TableInventorySnapshotDTO, etc.
- `schemas.ts` - Zod validation schemas
- `keys.ts` - TanStack Query key factory
- `selects.ts` - Named column projections (GAMING_TABLE_SELECT, etc.)
- `mappers.ts` - 7 mapper families (toGamingTableDTO, toDealerRotationDTO, etc.)
- `crud.ts` - Table queries (getTableById, listTables, getActiveTables)
- `table-lifecycle.ts` - State machine (inactive↔active→closed)
- `dealer-rotation.ts` - assignDealer, endDealerRotation, getCurrentDealer
- `chip-custody.ts` - Fill/credit/drop/inventory operations
- `index.ts` - Service factory with explicit interface
- `http.ts` - API client functions

### Route Handlers (10 endpoints)
- `app/api/v1/tables/route.ts` - GET list tables
- `app/api/v1/tables/[tableId]/route.ts` - GET single table
- `app/api/v1/tables/activate/route.ts` - POST activate
- `app/api/v1/tables/deactivate/route.ts` - POST deactivate
- `app/api/v1/tables/close/route.ts` - POST close
- `app/api/v1/tables/dealer/route.ts` - POST assign, DELETE end rotation
- `app/api/v1/table-context/inventory-snapshots/route.ts` - POST snapshot
- `app/api/v1/table-context/fills/route.ts` - POST fill
- `app/api/v1/table-context/credits/route.ts` - POST credit
- `app/api/v1/table-context/drop-events/route.ts` - POST drop event

### Server Actions (5 files)
- `app/actions/table-context/activate-table.ts`
- `app/actions/table-context/deactivate-table.ts`
- `app/actions/table-context/close-table.ts`
- `app/actions/table-context/assign-dealer.ts`
- `app/actions/table-context/end-dealer-rotation.ts`

### Tests
- `services/table-context/__tests__/mappers.test.ts` - 62 passing tests

## Key Implementation Details

### State Machine
- Transitions: inactive↔active (bidirectional), active/inactive→closed (terminal)
- Cross-context validation: `hasOpenSlipsForTable()` from RatingSlipService
- Domain errors: TABLE_NOT_FOUND, TABLE_NOT_ACTIVE, TABLE_HAS_OPEN_SLIPS, TABLE_ALREADY_CLOSED

### ESLint Compliance
- Pattern A DTOs require `// eslint-disable-next-line custom-rules/no-manual-dto-interfaces`
- JSONB chipset assertions require `// eslint-disable-next-line custom-rules/no-dto-type-assertions`

### ChipsetPayload
- Type: `Record<string, number>` for chip denomination counts
- Used in: TableInventorySnapshotDTO, TableFillDTO, TableCreditDTO

## Lessons Learned
1. Pattern A (Contract-First) appropriate when DTOs have computed fields or JSONB payloads
2. Pre-commit hooks validate middleware import paths - use `@/lib/server-actions/middleware`
3. Parallel workstream execution via Task tool with sub-agents is highly effective