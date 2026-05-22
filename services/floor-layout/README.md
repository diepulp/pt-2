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

## Pattern

**Pattern B: Canonical CRUD**

**Rationale**: Floor-layout service manages design configuration and approval workflow with straightforward CRUD operations on layout data. While activation includes an RPC (`rpc_activate_floor_layout`), the core responsibility is layout data management where DTOs mirror database schema 1:1. Layout structure changes flow directly from schema updates.

**Characteristics**:
- DTOs use `Pick<Database['public']['Tables']['floor_layout']['Row'], ...>`
- Minimal business logic (approval workflow handled in Server Actions)
- Event emission on activation (simple publish pattern)
- Schema changes auto-sync via type derivation

## Core Responsibilities

**OWNS**:
- Layout design (pits, sections, table placements)
- Review/approval workflow (`draft` → `review` → `approved`)
- Activation history and event emission

**DOES NOT OWN**:
- Real-time dealer assignments (dealer_rotation table, service pending)
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
- **Table Management** - `floor_layout.activated` events reconcile `gaming_table.pit` assignments
- **PerformanceService** - Layout metadata for dashboards
- **Reporting** - Historical activation lineage

## DTOs

- `FloorLayoutDTO` - Layout metadata
- `FloorLayoutVersionDTO` - Version record
- `FloorPitDTO` - Pit definition
- `FloorTableSlotDTO` - Table slot placement
- `FloorLayoutActivationDTO` - Activation event
- `BootstrapResult` / `BootstrapOutcome` - PRD-068 onboarding bootstrap envelope

## Pit Bootstrap (PRD-068)

`bootstrapCasinoPitLayout()` materializes the onboarding pit layout for the
caller's casino in a single atomic, idempotent RPC (`rpc_bootstrap_casino_pit_layout`).
Intended to be invoked at the tail of the onboarding setup server action after
`rpc_complete_casino_setup` succeeds.

**What it creates (first invocation, success path):**

1. `floor_layout` row (name `'Default'`, admin-owned)
2. `floor_layout_version` row with explicit `status = 'active'`
3. `floor_layout_activation` row with fixed
   `activation_request_id = 'prd068_pit_bootstrap_v1'`
4. One `floor_pit` per distinct non-empty `gaming_table.pit` value, normalized
   by `lower(btrim(pit))` and labeled with the first raw label encountered by
   `(created_at ASC, id ASC)` within each normalized group (DEC-001)
5. One `floor_table_slot` per pit-bearing `gaming_table`, binding
   `preferred_table_id = gt.id` and `game_type = gt.type` (DEC-002 identity
   map on `public.game_type` enum)

**Outcomes:**

| `outcome`               | Meaning                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `success`               | Bootstrap executed. `pits_created` / `slots_created` may be zero (see Recovery).                  |
| `already_bootstrapped`  | An active `floor_layout_activation` already exists for this casino. Idempotent no-op.             |

**Authorization:** RPC rejects non-admin callers with `FORBIDDEN_ADMIN_REQUIRED`.
Context is derived from the JWT via `set_rls_context_from_staff` — no params.

**Return shape (`BootstrapResult`):**

```ts
{
  ok: true,
  outcome: 'success' | 'already_bootstrapped',
  casino_id: string,
  layout_version_id: string,
  pits_created: number,        // count of floor_pit rows that exist for this version
  slots_created: number,       // count of floor_table_slot rows that exist for this version
  tables_without_pit: number,  // gaming_tables with null/empty pit — intentionally unassigned
}
```

### Recovery

The `activation_request_id = 'prd068_pit_bootstrap_v1'` is **fixed by design**
(Finding 6) — do NOT parameterize or change it. It acts as a secondary
idempotency guard behind the partial unique index on
`floor_layout_activation(casino_id) WHERE deactivated_at IS NULL`.

Operationally reasoned paths an admin may hit:

1. **Bootstrap succeeded with zero pits** (`outcome: 'success'` +
   `pits_created: 0`). This means the casino had no `gaming_table` rows with
   non-empty `pit` at the time of invocation. The activation now exists and a
   re-invocation returns `already_bootstrapped` without creating pits.
   **Remediation:** seed `gaming_table.pit` values *before* invoking bootstrap,
   or (post-bootstrap) use PRD-067's admin pit-configuration surface to add
   pits and slots to the already-active layout version.

2. **Bootstrap failed mid-transaction** (`BOOTSTRAP_FAILED` error raised by
   the onboarding server action; RPC raised or returned no data). The RPC is
   a single transaction — partial rows are rolled back. **Remediation:** an
   admin can safely retry `bootstrapCasinoPitLayout()` directly; idempotency
   guarantees either a clean materialization or an `already_bootstrapped`
   no-op.

3. **Onboarding completed before PRD-068 shipped** (legacy casino, no active
   layout). The RPC will execute the success path on first admin invocation.

## References

- [SRM §1580-1719](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- [SLAD §308-350](../../docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md)
- [PRD-068](../../docs/10-prd/PRD-068-pit-bootstrap-onboarding-materialization-v0.md)
- [EXEC-068](../../docs/21-exec-spec/EXEC-068-pit-bootstrap-onboarding-materialization.md)
