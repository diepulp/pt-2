# PRD-007 — Table Context Service

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Approved
- **Created:** 2025-12-03
- **Approved:** 2025-12-07
- **Summary:** Implement TableContextService to manage gaming table lifecycle and chip custody operations. This service enables pit bosses to activate/deactivate tables, track dealer rotations, and maintain chip inventory through fills, credits, and drop events. TableContextService is a GATE-2 blocker required by Pit Dashboard (PRD-006) and provides operational telemetry for compliance reporting.

## 2. Problem & Goals

### 2.1 Problem

PT-2 needs to manage gaming table operations with accurate state tracking. Without TableContextService:
- No way to open/close tables for a gaming day
- No tracking of which dealer is assigned to which table
- No chip inventory management (fills from cage, credits back)
- No drop box custody chain (regulatory requirement)
- No foundation for Pit Dashboard table status display

The previous implementation was removed (2025-12-02) due to architectural non-compliance (~10% complete, did not follow Pattern B). This PRD defines a clean rebuild following Pattern B architecture.

### 2.2 Goals

1. **Table lifecycle management**: Activate/deactivate/close tables with state machine enforcement
2. **Dealer rotation tracking**: Record which dealer is at which table with timestamps
3. **Chip custody operations**: Fills, credits, inventory snapshots with idempotency
4. **Drop event logging**: Regulatory-compliant drop box custody chain
5. **Pattern B compliance**: Service follows SLAD §308-350 with selects.ts, mappers.ts, crud.ts

### 2.3 Non-Goals

- Table layout/placement (FloorLayoutService scope)
- Table limit changes, equipment events, incidents (Post-MVP per SRM_Addendum)
- Inter-table chip transfers (Post-MVP)
- Real-time subscriptions (PRD-006 Pit Dashboard scope)
- Count room operations (Finance bounded context)
- Performance metrics aggregation (PerformanceService scope)

## 3. Users & Use Cases

- **Primary users:** Pit Boss, Floor Supervisor (via API/UI)
- **System consumers:** RatingSlipService, PerformanceService, MTLService, Pit Dashboard

**Top Jobs:**

1. As a **Pit Boss**, I need to activate a table at the start of a gaming day so that players can be seated and rating slips can be created.

2. As a **Pit Boss**, I need to assign a dealer to a table so that there's an audit trail of who dealt at which table and when.

3. As a **Pit Boss**, I need to request a chip fill when a table is running low so that gameplay can continue.

4. As a **Pit Boss**, I need to log an inventory snapshot at table open/close so that chip counts are documented for reconciliation.

5. As a **Floor Supervisor**, I need to close a table at the end of a shift so that the table status reflects reality and no new slips can be created.

6. As a **Pit Dashboard**, I need to query active tables with their current dealer and status so that I can display real-time floor status.

## 4. Scope & Feature List

**P0 (Must-Have)**
- Activate table: Change status from `inactive` → `active`
- Deactivate table: Change status from `active` → `inactive` (no open slips allowed)
- Close table: Change status to `closed` (end of gaming day finalization)
- Get table by ID with current dealer
- List tables with filters (status, pit, game type)
- Assign dealer: Create dealer_rotation record
- End dealer rotation: Set ended_at on current rotation
- Log inventory snapshot: Record chipset at open/close/rundown
- Request fill: Idempotent chip fill from cage
- Request credit: Idempotent chip return to cage
- Log drop event: Record drop box removal with custody chain

**P1 (Should-Have)**
- Get active tables for casino (dashboard query)
- Get current dealer for table
- Get table inventory history
- Bulk close tables for end-of-day

**P2 (Nice-to-Have)**
- Table status history/audit trail

## 5. Requirements

### 5.1 Functional Requirements

- Table status transitions enforced:
  - `inactive` → `active` (via activate)
  - `active` → `inactive` (via deactivate, requires no open slips)
  - `active` → `closed` (via close)
  - `inactive` → `closed` (via close)
  - `closed` is terminal (no transitions out)
- Dealer rotation:
  - Only one active rotation per table (ended_at IS NULL)
  - Assigning new dealer auto-ends previous rotation
- Chip custody:
  - Fills/credits require `request_id` for idempotency
  - Inventory snapshots capture chipset as JSONB (denomination → quantity)
  - Drop events require `drop_box_id` and witness staff
- All mutations require `casino_id` for RLS scoping

### 5.2 Non-Functional Requirements

- p95 mutation latency < 300ms
- All chip operations idempotent via unique constraint on `(casino_id, request_id)`
- Inventory snapshots immutable (append-only)

### 5.3 Architectural Requirements (SLAD §308-350)

**Service Structure (Pattern B with mappers.ts)**:
```
services/table-context/
├── __tests__/                    # Per ADR-002
│   └── table-context.service.test.ts
├── dtos.ts                       # Pick/Omit from Database types
├── schemas.ts                    # Zod validation (ADR-013)
├── selects.ts                    # Named column projections
├── mappers.ts                    # Row→DTO transformers (REQUIRED)
├── crud.ts                       # Database operations
├── index.ts                      # Service factory
├── keys.ts                       # React Query key factories
├── http.ts                       # HTTP fetchers
└── README.md
```

**Error Handling (ADR-012)**:
- Service throws `DomainError` on failure
- Domain error codes:
  - `TABLE_NOT_FOUND`
  - `TABLE_NOT_ACTIVE` (for operations requiring active table)
  - `TABLE_NOT_INACTIVE` (for activate)
  - `TABLE_ALREADY_CLOSED`
  - `TABLE_HAS_OPEN_SLIPS` (cannot deactivate with open rating slips)
  - `FILL_DUPLICATE_REQUEST`
  - `CREDIT_DUPLICATE_REQUEST`
  - `DEALER_ROTATION_NOT_FOUND`

**Type Safety**:
- Zero `as` type assertions
- All Row→DTO via mappers.ts
- RPC responses validated via generated types

> Architecture details live in SLAD and SRM. This PRD does not duplicate them.

## 6. UX / Flow Overview

**API Flow (no UI in this PRD)**:

```
Activate Table:
  POST /api/v1/tables/{tableId}/activate
  → Returns: GamingTableDTO with status=active

Deactivate Table:
  POST /api/v1/tables/{tableId}/deactivate
  → Returns: GamingTableDTO with status=inactive
  → Error 409: TABLE_HAS_OPEN_SLIPS if active rating slips exist

Close Table:
  POST /api/v1/tables/{tableId}/close
  → Returns: GamingTableDTO with status=closed

List Tables:
  GET /api/v1/tables?casino_id=X&status=active&pit=main
  → Returns: GamingTableWithDealerDTO[]

Get Table:
  GET /api/v1/tables/{tableId}
  → Returns: GamingTableWithDealerDTO

Assign Dealer:
  POST /api/v1/tables/{tableId}/dealer
  Body: { staff_id }
  → Returns: DealerRotationDTO

End Dealer Rotation:
  DELETE /api/v1/tables/{tableId}/dealer
  → Returns: DealerRotationDTO with ended_at

Log Inventory Snapshot:
  POST /api/v1/table-context/inventory-snapshots
  Body: { table_id, snapshot_type, chipset, counted_by?, verified_by? }
  → Returns: TableInventorySnapshotDTO

Request Fill:
  POST /api/v1/table-context/fills
  Body: { table_id, chipset, amount_cents, request_id, requested_by, ... }
  → Returns: TableFillDTO

Request Credit:
  POST /api/v1/table-context/credits
  Body: { table_id, chipset, amount_cents, request_id, authorized_by, ... }
  → Returns: TableCreditDTO

Log Drop Event:
  POST /api/v1/table-context/drop-events
  Body: { table_id, drop_box_id, seal_no, removed_by, witnessed_by, ... }
  → Returns: TableDropEventDTO
```

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| CasinoService (PRD-000) | COMPLETE | RLS context, casino_id |
| `gaming_table` table | EXISTS | Core table with status enum |
| `dealer_rotation` table | EXISTS | FK to gaming_table, staff |
| `table_inventory_snapshot` table | EXISTS | Via migration 20251108195341 |
| `table_fill` table | EXISTS | Via migration 20251108195341 |
| `table_credit` table | EXISTS | Via migration 20251108195341 |
| `table_drop_event` table | EXISTS | Via migration 20251108195341 |
| RPCs | EXISTS | `rpc_log_table_inventory_snapshot`, `rpc_request_table_fill`, `rpc_request_table_credit`, `rpc_log_table_drop` |
| Horizontal infrastructure | COMPLETE | withServerAction, ServiceResult, DomainError |

### 7.2 Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| Concurrent status transitions | Database-level status check in transaction |
| Orphaned dealer rotations | Deactivate/close auto-ends active rotation |
| Missing RLS policies | Create policies for new service routes |

**Open Questions:**
1. Should closing a table require ending all dealer rotations first? → **Recommendation:** Auto-end active rotation on close
2. Should inventory snapshot be required before closing? → **Recommendation:** No, make it a pit boss responsibility (documented in SOP)

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Activate table changes status to active
- [ ] Deactivate table changes status to inactive (blocked if open slips)
- [ ] Close table changes status to closed
- [ ] Dealer assignment creates rotation, auto-ends previous
- [ ] Inventory snapshot logs chipset correctly
- [ ] Fill/credit operations are idempotent via request_id
- [ ] Drop event logs custody chain

**Data & Integrity**
- [ ] State machine enforced (no invalid transitions)
- [ ] Single active dealer rotation per table
- [ ] No orphaned rotations after table close

**Security & Access**
- [ ] RLS: Staff can only access tables for their casino
- [ ] All mutations require authenticated session

**Architecture Compliance**
- [ ] Pattern B structure: dtos.ts, schemas.ts, selects.ts, mappers.ts, crud.ts, index.ts
- [ ] Zero `as` type assertions
- [ ] Tests in `__tests__/` subdirectory (ADR-002)
- [ ] DomainError thrown on failures (ADR-012)

**Testing**
- [ ] Unit tests for state machine transitions
- [ ] Unit tests for dealer rotation logic
- [ ] Integration test: full table lifecycle (activate → assign dealer → fill → close)
- [ ] Integration test: idempotent fill/credit

**Documentation**
- [ ] Service README with supported operations
- [ ] DTOs documented with JSDoc

## 9. Related Documents

- **Vision / Strategy:** `docs/00-vision/VIS-001-VISION-AND-SCOPE.md`
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (§648 TableContextService)
- **SRM Addendum (Post-MVP):** `docs/20-architecture/SRM_Addendum_TableContext_PostMVP.md`
- **Service Layer (SLAD):** `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` §308-350
- **DTO Standard:** `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- **Error Handling:** `docs/80-adrs/ADR-012-error-handling-layers.md`
- **Test Location:** `docs/80-adrs/ADR-002-test-location-standard.md`
- **Zod Schemas:** `docs/80-adrs/ADR-013-zod-validation-schemas.md`
- **Schema / Types:** `types/database.types.ts` (gaming_table, dealer_rotation, table_* tables)
- **Chip Custody Migration:** `supabase/migrations/20251108195341_table_context_chip_custody.sql`
- **RLS Policy Matrix:** `docs/30-security/SEC-001-rls-policy-matrix.md`
- **MVP Roadmap:** `docs/20-architecture/MVP-ROADMAP.md` (Phase 2)
- **Pit Dashboard (Consumer):** `docs/10-prd/PRD-006-pit-dashboard.md`
- **Rating Slip (Related):** `docs/10-prd/PRD-002-rating-slip-service.md`

---

**Revision History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-03 | Lead Architect | Initial draft (clean rebuild) |
