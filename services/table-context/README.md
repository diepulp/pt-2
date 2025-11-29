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

**Pattern A: Contract-First**

**Rationale**: Table-context manages complex operational workflows (chip custody, dealer rotation, inventory reconciliation) with strict dual-signer requirements and custody chain tracking. Domain contracts must remain stable for floor operations, compliance audits, and cage reconciliation systems. Chip custody telemetry, fill/credit workflows, and drop custody timelines are complex business rules requiring decoupling from database schema.

**Characteristics**:
- Manual DTO interfaces (custody chain contracts)
- RPC-based operations with idempotency keys
- Multi-table transactions (fill/credit/inventory)
- Event-driven floor layout integration
- Dual-signer validation business rules

---

## Table Lifecycle Operations

### Status Transitions

**Pattern**: Use `updateTableStatus()` to transition tables between statuses via RPC.

```typescript
import { updateTableStatus } from '@/services/table-context';

// Activate table for gaming day
const activeTable = await updateTableStatus(supabase, tableId, 'active');

// Temporarily close table (e.g., dealer break, maintenance)
const inactiveTable = await updateTableStatus(supabase, tableId, 'inactive');

// Permanently close table (end of gaming day)
const closedTable = await updateTableStatus(supabase, tableId, 'closed');
```

**Valid Transitions**:
- `inactive` → `active` (open table for play)
- `active` → `inactive` (temporary close: break, maintenance)
- `active` → `closed` (permanent close: end of day)
- `closed` → (terminal state, no transitions)

**Error Handling** (ADR-012 compliant):
```typescript
import { DomainError, isDomainError } from '@/lib/errors/domain-errors';

try {
  await updateTableStatus(supabase, tableId, 'closed');
} catch (error) {
  if (isDomainError(error)) {
    switch (error.code) {
      case 'TABLE_NOT_FOUND':
        // Handle missing table
        break;
      case 'TABLE_SETTINGS_INVALID':
        // Handle invalid transition (e.g., closed → active)
        console.error('Invalid transition:', error.details);
        break;
      default:
        // Handle other domain errors
    }
  }
  throw error; // Re-throw unknown errors
}
```

**React Query Integration**:
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tableContextKeys } from '@/services/table-context';

const updateStatusMutation = useMutation({
  mutationKey: tableContextKeys.updateStatus(tableId),
  mutationFn: (newStatus: 'active' | 'inactive' | 'closed') =>
    updateTableStatus(supabase, tableId, newStatus),
  onSuccess: (updatedTable) => {
    // Invalidate related queries
    queryClient.invalidateQueries({ queryKey: tableContextKeys.byTable(tableId) });
    queryClient.invalidateQueries({ queryKey: tableContextKeys.active(casinoId) });
  },
});
```

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

## References

- **SRM Section**: [§1275-1579](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- **SRM Addendum**: [SRM_Addendum_TableContext_PostMVP.md](../../docs/20-architecture/SRM_Addendum_TableContext_PostMVP.md)
- **Service Template**: [SERVICE_TEMPLATE.md](../../docs/70-governance/SERVICE_TEMPLATE.md)
- **Observability**: [OBSERVABILITY_SPEC.md](../../docs/50-ops/OBSERVABILITY_SPEC.md)
