# FloorLayoutService - Design & Activation Context

> **Bounded Context**: "What does the gaming floor look like, and which layout is currently active?"
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §1580-1719](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
> **Status**: Implemented

## Ownership

**Tables** (5):
- `floor_layout` - Layout drafts and approval workflow
- `floor_layout_version` - Versioned design history
- `floor_pit` - Pit definitions within a version
- `floor_table_slot` - Table placements within a version
- `floor_layout_activation` - Activation event log

## Core Responsibilities

**OWNS**:
- Layout design (pits, sections, table placements)
- Review/approval workflow (`draft` → `review` → `approved`)
- Activation history and event emission

**DOES NOT OWN**:
- Real-time dealer assignments (TableContextService)
- Monetary data (PlayerFinancialService)
- Staff registry (CasinoService)

## Workflow

1. **Draft** created by floor manager
2. **Review** by operations team
3. **Approved** by casino management
4. **Activated** via `rpc_activate_floor_layout`
5. **Event** `floor_layout.activated` published

## Activation & Events

```typescript
const activation = await supabase.rpc('rpc_activate_floor_layout', {
  p_casino_id: casinoId,
  p_layout_version_id: versionId,
  p_activated_by: staffId,
  p_request_id: requestId // Idempotency
});

// Emits: floor_layout.activated
// Payload: { casino_id, layout_id, layout_version_id, activated_at, pits[], table_slots[] }
```

## Cross-Context Integration

**Provides To**:
- **TableContextService** - Consumes `floor_layout.activated` events to reconcile `gaming_table.pit` assignments
- **PerformanceService** - Layout metadata for dashboards
- **Reporting** - Historical activation lineage

## DTOs

- `FloorLayoutDTO` - Layout metadata
- `FloorLayoutVersionDTO` - Version record
- `FloorPitDTO` - Pit definition
- `FloorTableSlotDTO` - Table slot placement
- `FloorLayoutActivationDTO` - Activation event

## References

- [SRM §1580-1719](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- [SERVICE_TEMPLATE.md](../../docs/70-governance/SERVICE_TEMPLATE.md)
