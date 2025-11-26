# TableContextService - Operational Telemetry & Lifecycle

> **Bounded Context**: "What is the operational state and chip custody posture of this gaming table?"
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §1275-1579](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
> **Status**: Implemented

---

## Ownership

**Tables** (7):
- **Lifecycle & Settings**:
  - `gaming_table` - Table registry
  - `gaming_table_settings` - Configuration history
  - `dealer_rotation` - Dealer assignments
- **Chip Custody** (non-monetary):
  - `table_inventory_snapshot` - Opening/closing/rundown counts
  - `table_fill` - Chip replenishment to table
  - `table_credit` - Chips returned from table to cage
  - `table_drop_event` - Drop box removal/delivery custody timeline

**DTOs**:
- `GamingTableDTO` - Table metadata
- `DealerRotationDTO` - Dealer assignment record
- `TableInventoryDTO` - Inventory snapshot
- `TableFillDTO`, `TableCreditDTO` - Custody transactions
- `TableDropDTO` - Drop box custody events

**RPCs**:
- `rpc_log_table_inventory_snapshot` - Record open/close/rundown counts
- `rpc_request_table_fill` - Idempotent fill request
- `rpc_request_table_credit` - Idempotent credit request
- `rpc_log_table_drop` - Drop custody event

---

## Pattern

**Pattern C: Hybrid (State Machine + CRUD)**

**Rationale**: Table-context manages both simple CRUD operations (table registry, metadata) AND complex state transitions (table lifecycle, break management, reservations). The state machine pattern provides clear business rules for table status transitions while CRUD operations handle basic table management. This hybrid approach balances simplicity for basic operations with sophistication for state management.

**Characteristics**:
- **State Machine**: Table lifecycle transitions (open/closed/break/reserved)
- **CRUD Operations**: Table registry management using canonical database types
- **Pattern B DTOs**: Pick/Omit from `Database['public']['Tables']['gaming_table']`
- **Server Actions**: Functional approach with `{ data, error }` result pattern
- **React Query Integration**: Type-safe hooks with automatic cache invalidation

---

## Core Responsibilities

**OWNS**:
- Table lifecycle management (provision, activate, deactivate)
- Dealer rotation tracking
- **Chip custody telemetry** (fills, credits, inventory, drop movement) - **NON-MONETARY**

**DOES NOT OWN**:
- **Monetary ledgers**: Drop count sheets, marker workflows (PlayerFinancialService)
- **Compliance/MTL**: CTR/SAR thresholds and filings (MTLService)
- **Loyalty**: Reward ledger/balance (LoyaltyService)
- **Floor design**: Layout drafting/versioning/approval (FloorLayoutService - only consumes activations)

---

## Cross-Context Dependencies

**Consumes**:
- `CasinoService` → `CasinoSettingsDTO` (gaming day temporal authority)
- `FloorLayoutService` → `floor_layout.activated` events (reconcile table pit assignments)

**Provides**:
- `GamingTableDTO` to **RatingSlipService** (table assignment FK)
- Table custody events to **PlayerFinancialService** (monetary reconciliation)
- Inventory discrepancies to **Compliance** (variance alerts)

---

## State Machine Implementation

### Table States

The service implements a state machine for table lifecycle management:

```typescript
type TableState = 'closed' | 'open' | 'break' | 'reserved';
```

**State Transitions**:
- `closed` → `open` (OPEN_TABLE)
- `closed` → `reserved` (RESERVE)
- `open` → `closed` (CLOSE_TABLE)
- `open` → `break` (START_BREAK)
- `break` → `open` (END_BREAK)
- `break` → `closed` (CLOSE_TABLE)
- `reserved` → `closed` (UNRESERVE)
- `reserved` → `open` (OPEN_TABLE)

### Usage Example

```typescript
import { useOpenTable, useStartTableBreak, useTableState } from '@/hooks/use-table-context';

function TableControls({ tableId }: { tableId: string }) {
  const { data: currentState } = useTableState(tableId);
  const openTable = useOpenTable();
  const startBreak = useStartTableBreak();

  return (
    <div>
      <p>Current State: {currentState}</p>
      {currentState === 'closed' && (
        <button onClick={() => openTable.mutate(tableId)}>
          Open Table
        </button>
      )}
      {currentState === 'open' && (
        <button onClick={() => startBreak.mutate(tableId)}>
          Start Break
        </button>
      )}
    </div>
  );
}
```

### Server Actions API

All server actions follow the `{ data, error }` pattern:

```typescript
// CRUD Operations
const result = await getTables(casinoId);
const table = await getTableById(tableId);
const newTable = await createTable({ casino_id, label, type, pit });
const updated = await updateTable(tableId, { label: 'New Label' });
const deleted = await deleteTable(tableId);

// State Management
const state = await getTableState(tableId);
const transitioned = await transitionTableState(tableId, { type: 'OPEN_TABLE' });

// Convenience Methods
const opened = await openTable(tableId);
const closed = await closeTable(tableId);
const onBreak = await startTableBreak(tableId);
const resumed = await endTableBreak(tableId);
const reserved = await reserveTable(tableId);
const unreserved = await unreserveTable(tableId);

// Error Handling
if (result.error) {
  console.error(result.error);
} else {
  console.log(result.data);
}
```

### React Query Hooks

All hooks use the centralized `tableContextKeys` for cache management:

```typescript
// Query Hooks
const { data: tables } = useTables(casinoId);
const { data: table } = useTable(tableId);
const { data: state } = useTableState(tableId);
const { data: slips } = useActiveRatingSlips(tableId);

// Mutation Hooks
const createTable = useCreateTable();
const updateTable = useUpdateTable();
const deleteTable = useDeleteTable();
const transitionState = useTransitionTableState();

// Convenience Mutation Hooks
const openTable = useOpenTable();
const closeTable = useCloseTable();
const startBreak = useStartTableBreak();
const endBreak = useEndTableBreak();
const reserve = useReserveTable();
const unreserve = useUnreserveTable();
```

---

## Key Patterns

### Idempotent Custody Operations

**Table Fill** (chips to table):
```typescript
const result = await supabase.rpc('rpc_request_table_fill', {
  p_casino_id: casinoId,
  p_table_id: tableId,
  p_chipset: { "25": 100, "100": 50 }, // denomination: count
  p_amount_cents: 750000, // $7,500
  p_requested_by: staffId,
  p_delivered_by: cageStaffId,
  p_received_by: dealerId,
  p_slip_no: 'F-2025-001',
  p_request_id: requestId // Idempotency key
});

// On conflict (casino_id, request_id): do update
```

**Table Credit** (chips to cage):
```typescript
const result = await supabase.rpc('rpc_request_table_credit', {
  p_casino_id: casinoId,
  p_table_id: tableId,
  p_chipset: { "25": 50, "100": 20 },
  p_amount_cents: 325000,
  p_authorized_by: pitBossId,
  p_sent_by: dealerId,
  p_received_by: cageStaffId,
  p_slip_no: 'C-2025-042',
  p_request_id: requestId
});
```

### Inventory Snapshot (Dual Signer)

```typescript
const snapshot = await supabase.rpc('rpc_log_table_inventory_snapshot', {
  p_casino_id: casinoId,
  p_table_id: tableId,
  p_snapshot_type: 'close', // 'open' | 'close' | 'rundown'
  p_chipset: inventoryCounts,
  p_counted_by: dealerId,
  p_verified_by: pitBossId,
  p_discrepancy_cents: -250, // Negative = short
  p_note: 'Variance under tolerance'
});
```

### Drop Custody Timeline

```typescript
// Drop removed from table
await supabase.rpc('rpc_log_table_drop', {
  p_casino_id: casinoId,
  p_table_id: tableId,
  p_drop_box_id: 'DB-042',
  p_seal_no: 'S-99172',
  p_removed_by: pitBossId,
  p_witnessed_by: dealerId,
  p_removed_at: new Date().toISOString(),
  p_gaming_day: '2025-11-10',
  p_seq_no: 1
});

// Later: Drop delivered to count room
// (Update via separate RPC or direct table update with delivered_at timestamp)
```

---

## Floor Layout Integration

**Pattern**: Listens to `floor_layout.activated` events and reconciles `gaming_table.pit` assignments

```typescript
// FloorLayoutService emits event
{
  event: 'floor_layout.activated',
  payload: {
    casino_id,
    layout_id,
    layout_version_id,
    pits: [...],
    table_slots: [...]
  }
}

// TableContext ingestion job:
// 1. Update gaming_table.pit for tables in new layout
// 2. Deactivate tables not in new layout
// 3. Activate tables in new layout slots
```

---

## Custody RLS & Roles

**Read**:
- `pit_boss`, `dealer`, `accounting_read`, `cage_read`, `compliance_read` (same casino)

**Write**:
- **Inventory/Fill/Credit/Drop**: `pit_boss`
- **Cage custody flows**: `cage` role
- **Count team**: Limited to drop delivery timestamps

**Trigger**: `assert_table_context_casino()` enforces `gaming_table.casino_id` = operation `casino_id`

---

## Performance SLOs & KPIs

| KPI | Target | Alert Threshold |
|-----|--------|-----------------|
| **Time-to-fill** (requested → completed) | p95 < 2min | > 3min (3x in 1hr) |
| **Time-to-credit** (requested → completed) | p95 < 2min | > 3min (3x in 1hr) |
| **Drop removed → delivered** | p95 < 30min | > 45min (1x) |
| **% closes with zero discrepancy** | > 95% | < 90% (weekly) |
| **Fills/credits per table/shift** | Baseline TBD | Anomaly detection |

**Reference**: [OBSERVABILITY_SPEC.md §5.1](../../docs/50-ops/OBSERVABILITY_SPEC.md)

---

## Events & Observability

**Events Emitted**:
- `table.fill_requested` → `table.fill_completed`
- `table.credit_requested` → `table.credit_completed`
- `table.drop_removed` → `table.drop_delivered`
- `table.inventory_open|close|rundown_recorded`

**Cache Invalidation**:
- React Query: `['table-context', 'inventory', table_id]`
- Realtime channel: `{casino_id}:table-context:{table_id}`

---

## Implementation Files

### Service Layer
- `services/table-context/keys.ts` - React Query key factories
- `services/table-context/table-state-machine.ts` - State machine logic
- `services/table-context/README.md` - This documentation

### Actions & Hooks
- `app/actions/table-context-actions.ts` - Server actions (CRUD + state transitions)
- `hooks/use-table-context.ts` - React Query hooks

### Database
- `types/database.types.ts` - Generated types from Supabase schema
- Table: `gaming_table` (columns: id, casino_id, label, type, status, pit, created_at)
- Enum: `table_status` = "inactive" | "active" | "closed"
- Enum: `game_type` = "blackjack" | "poker" | "roulette" | "baccarat"

---

## References

- **SRM Section**: [§1275-1579](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- **SRM Addendum**: [SRM_Addendum_TableContext_PostMVP.md](../../docs/20-architecture/SRM_Addendum_TableContext_PostMVP.md)
- **Service Template**: [SERVICE_TEMPLATE.md](../../docs/70-governance/SERVICE_TEMPLATE.md)
- **Observability**: [OBSERVABILITY_SPEC.md](../../docs/50-ops/OBSERVABILITY_SPEC.md)
