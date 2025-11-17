# DTO Catalog

**Status**: Active (extracted from SRM v3.1.0)
**Effective**: 2025-11-17
**Source**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
**Canonical Standard**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`

## Purpose

This catalog enumerates all Data Transfer Objects (DTOs) by bounded context, their owners, fields, consumers, and versioning. Each DTO represents a contract between services as defined in the Service Responsibility Matrix (SRM).

## Conventions

- **File Naming**: `services/{service}/dtos.ts` (plural)
- **Type System**: All DTOs derive from `types/database.types.ts` unless contract-first pattern
- **Versioning**: DTOs are versioned implicitly through migrations (tracked in MIG-001)
- **Exposure**: Each DTO documents exposure scope (UI, External API, Internal only)

---

## CasinoService DTOs

### CasinoDTO

**Owner**: CasinoService
**File**: `services/casino/dtos.ts`
**Pattern**: Canonical (Pick from Database)
**Exposure**: UI, External API
**SRM Reference**: Lines 60-73

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `name` | `text` | No | Casino display name |
| `location` | `text` | Yes | Physical address/city |
| `company_id` | `uuid` | Yes | Parent company FK |
| `status` | `text` | Yes | Operational status |
| `address` | `text` | Yes | Full street address |
| `created_at` | `timestamptz` | No | Creation timestamp |

**Consumers**:
- All services (casino_id FK reference)
- Admin UI (casino management)
- Reports (casino context)

---

### CasinoSettingsDTO

**Owner**: CasinoService
**File**: `services/casino/dtos.ts`
**Pattern**: Canonical (Pick from Database)
**Exposure**: Internal only
**SRM Reference**: Lines 60-73

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `casino_id` | `uuid` | No | Casino FK |
| `gaming_day_start_time` | `interval` | Yes | Gaming day boundary (default: '06:00:00') |
| `created_at` | `timestamptz` | No | Creation timestamp |

**Consumers**:
- TableContext (gaming day authority)
- Finance (gaming day calculation)
- MTL (temporal alignment)

---

### StaffDTO

**Owner**: CasinoService
**File**: `services/casino/dtos.ts`
**Pattern**: Canonical with allowlist
**Exposure**: UI (role-gated)
**SRM Reference**: Lines 60-73

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `casino_id` | `uuid` | No | Casino FK |
| `user_id` | `uuid` | Yes | Auth user FK (null for dealers) |
| `first_name` | `text` | No | Staff first name |
| `last_name` | `text` | No | Staff last name |
| `role` | `staff_role` | No | Enum: dealer, pit_boss, admin |
| `status` | `staff_status` | No | Enum: active, inactive |
| `created_at` | `timestamptz` | No | Creation timestamp |

**Excluded Fields**: `employee_id`, `email`, `ssn` (PII, admin-only)

**Consumers**:
- All services (staff_id FK for actor tracking)
- RLS context (auth.uid() → staff lookup)
- Audit logs (actor identification)

---

### GameSettingsDTO

**Owner**: CasinoService
**File**: `services/casino/dtos.ts`
**Pattern**: Canonical
**Exposure**: Internal only
**SRM Reference**: Lines 1386-1399

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `casino_id` | `uuid` | No | Casino FK |
| `game_type` | `game_type` | No | Enum: blackjack, poker, roulette, baccarat |
| `min_bet` | `numeric` | Yes | Minimum wager |
| `max_bet` | `numeric` | Yes | Maximum wager |
| `rotation_interval_minutes` | `int` | Yes | Dealer rotation cadence |

**Consumers**:
- TableContext (table settings template)
- RatingSlip (game configuration snapshot)

---

## PlayerService DTOs

### PlayerDTO

**Owner**: PlayerService
**File**: `services/player/dtos.ts`
**Pattern**: Canonical with allowlist
**Exposure**: UI, External API
**SRM Reference**: Lines 60-73, 1116-1122

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `first_name` | `text` | No | Player first name |
| `last_name` | `text` | No | Player last name |
| `created_at` | `timestamptz` | No | Registration timestamp |

**Excluded Fields**: `birth_date`, `ssn`, `internal_notes`, `risk_score` (PII/internal)

**Consumers**:
- Visit (session association)
- Loyalty (rewards eligibility)
- Finance (transaction linkage)
- MTL (compliance tracking)
- RatingSlip (gameplay telemetry)

---

### PlayerCreateDTO

**Owner**: PlayerService
**File**: `services/player/dtos.ts`
**Pattern**: Canonical (Pick from Insert)
**Exposure**: Internal only
**SRM Reference**: Lines 187-190

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `first_name` | `text` | No | Player first name |
| `last_name` | `text` | No | Player last name |
| `birth_date` | `date` | Yes | Date of birth (for age verification) |

---

### PlayerEnrollmentDTO

**Owner**: PlayerService
**File**: `services/player/dtos.ts`
**Pattern**: Canonical
**Exposure**: Internal only
**SRM Reference**: Lines 60-73, 1124-1130

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `player_id` | `uuid` | No | Player FK (composite PK) |
| `casino_id` | `uuid` | No | Casino FK (composite PK) |
| `status` | `text` | No | Enrollment status (default: 'active') |
| `enrolled_at` | `timestamptz` | No | Enrollment timestamp |

**Consumers**:
- Visit (enrollment verification)
- Loyalty (per-casino rewards)

---

## VisitService DTOs

### VisitDTO

**Owner**: VisitService
**File**: `services/visit/dtos.ts`
**Pattern**: Canonical
**Exposure**: Internal only
**SRM Reference**: Lines 60-73, 1132-1138

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `player_id` | `uuid` | No | Player FK |
| `casino_id` | `uuid` | No | Casino FK |
| `started_at` | `timestamptz` | No | Check-in timestamp |
| `ended_at` | `timestamptz` | Yes | Check-out timestamp (null if open) |

**Consumers**:
- **Loyalty** (session context for ledger entries)
- **Finance** (session association for transactions)
- **MTL** (compliance lineage)
- **RatingSlip** (session scoping)

---

## LoyaltyService DTOs

### PlayerLoyaltyDTO

**Owner**: LoyaltyService
**File**: `services/loyalty/dtos.ts`
**Pattern**: Contract-First (domain interface)
**Exposure**: UI, External API
**SRM Reference**: Lines 135-140, 1192-1200

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `player_id` | `uuid` | No | Player FK (composite PK) |
| `casino_id` | `uuid` | No | Casino FK (composite PK) |
| `balance` | `int` | No | Current points balance |
| `tier` | `text` | Yes | Loyalty tier (e.g., Bronze, Silver, Gold) |

**Excluded Fields**: `preferences` (internal-only), `updated_at` (implementation detail)

**Consumers**:
- UI (player balance display)
- Loyalty RPCs (reward issuance)

---

### LoyaltyLedgerEntryDTO

**Owner**: LoyaltyService
**File**: `services/loyalty/dtos.ts`
**Pattern**: Contract-First
**Exposure**: UI (read-only), Audit
**SRM Reference**: Lines 60-73, 1204-1221

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `casino_id` | `uuid` | No | Casino FK |
| `player_id` | `uuid` | No | Player FK |
| `rating_slip_id` | `uuid` | Yes | Source telemetry FK |
| `visit_id` | `uuid` | Yes | Session FK |
| `staff_id` | `uuid` | Yes | Issuing staff FK |
| `points_earned` | `int` | No | Points delta (can be negative for corrections) |
| `reason` | `loyalty_reason` | No | Enum: mid_session, session_end, manual_adjustment, promotion, correction |
| `average_bet` | `numeric` | Yes | Snapshot from rating slip |
| `duration_seconds` | `int` | Yes | Snapshot from rating slip |
| `game_type` | `game_type` | Yes | Snapshot from rating slip |
| `created_at` | `timestamptz` | No | Issuance timestamp |

**Excluded Fields**: `idempotency_key` (internal-only)

**Consumers**:
- UI (ledger history)
- Audit (reward tracking)
- Reports (loyalty analytics)

---

## RatingSlipService DTOs

### RatingSlipDTO

**Owner**: RatingSlipService
**File**: `services/rating-slip/dtos.ts`
**Pattern**: Canonical (full row)
**Exposure**: Internal only
**SRM Reference**: Lines 60-73, 1831-1843

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `player_id` | `uuid` | No | Player FK (immutable) |
| `casino_id` | `uuid` | No | Casino FK (immutable) |
| `visit_id` | `uuid` | Yes | Session FK |
| `table_id` | `uuid` | Yes | Gaming table FK |
| `game_settings` | `jsonb` | Yes | Policy snapshot |
| `average_bet` | `numeric` | Yes | Wagering telemetry |
| `start_time` | `timestamptz` | No | Session start (immutable) |
| `end_time` | `timestamptz` | Yes | Session end |
| `status` | `text` | No | Lifecycle state: open, paused, closed |
| `policy_snapshot` | `jsonb` | Yes | Reward policy at play time |

**Consumers**:
- RatingSlip service (internal CRUD)
- Loyalty (via RatingSlipTelemetryDTO)

---

### RatingSlipTelemetryDTO

**Owner**: RatingSlipService
**File**: `services/rating-slip/dtos.ts`
**Pattern**: Hybrid (contract-first for cross-context)
**Exposure**: Internal (published to Loyalty/Finance)
**SRM Reference**: Lines 214-222

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Rating slip ID |
| `player_id` | `uuid` | No | Player FK |
| `casino_id` | `uuid` | No | Casino FK |
| `average_bet` | `number` | Yes | Average wager amount |
| `duration_seconds` | `number` | No | Play duration |
| `game_type` | `'blackjack' \| 'poker' \| 'roulette' \| 'baccarat'` | No | Game type |

**Excluded Fields**: `policy_snapshot`, `visit_id` (not needed by consumers)

**Consumers**:
- **Loyalty** (reward calculation input)
- **Finance** (optional gameplay context)

---

## FinanceService DTOs

### FinancialTransactionDTO

**Owner**: FinanceService
**File**: `services/finance/dtos.ts`
**Pattern**: Canonical
**Exposure**: UI (role-gated), Audit
**SRM Reference**: Lines 60-73, 1907-1918

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `player_id` | `uuid` | No | Player FK |
| `casino_id` | `uuid` | No | Casino FK |
| `visit_id` | `uuid` | Yes | Session FK (read-only) |
| `rating_slip_id` | `uuid` | Yes | Compat FK (legacy) |
| `amount` | `numeric` | No | Transaction amount |
| `tender_type` | `text` | Yes | Payment method (cash, chip, marker, etc.) |
| `created_at` | `timestamptz` | No | Transaction timestamp |
| `gaming_day` | `date` | Yes | Gaming day (trigger-derived) |

**Excluded Fields**: `idempotency_key` (internal-only)

**Consumers**:
- UI (cashier transactions, player financials)
- MTL (compliance reconciliation)
- Reports (gaming day aggregates)

---

## MTLService DTOs

### MTLEntryDTO

**Owner**: MTLService
**File**: `services/mtl/dtos.ts`
**Pattern**: Canonical
**Exposure**: Internal only (compliance)
**SRM Reference**: Lines 60-73, 2078-2092

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `patron_uuid` | `uuid` | No | Player FK |
| `casino_id` | `uuid` | No | Casino FK |
| `staff_id` | `uuid` | Yes | Staff FK |
| `rating_slip_id` | `uuid` | Yes | Optional lineage FK |
| `visit_id` | `uuid` | Yes | Optional lineage FK |
| `amount` | `numeric` | No | Transaction amount |
| `direction` | `text` | No | Transaction direction (in, out) |
| `area` | `text` | Yes | Casino area |
| `created_at` | `timestamptz` | No | Transaction timestamp |

**Excluded Fields**: `idempotency_key` (internal-only)

**Consumers**:
- Compliance UI (CTR/SAR reporting)
- Audit (regulatory tracking)

---

### MTLAuditNoteDTO

**Owner**: MTLService
**File**: `services/mtl/dtos.ts`
**Pattern**: Canonical
**Exposure**: Internal only (compliance)
**SRM Reference**: Lines 60-73, 2094-2100

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `mtl_entry_id` | `uuid` | No | MTL entry FK |
| `staff_id` | `uuid` | Yes | Staff FK |
| `note` | `text` | No | Audit note content |
| `created_at` | `timestamptz` | No | Note timestamp |

**Consumers**:
- Compliance UI (audit trail)

---

## TableContextService DTOs

### GamingTableDTO

**Owner**: TableContextService
**File**: `services/table-context/dtos.ts`
**Pattern**: Canonical
**Exposure**: UI, Internal
**SRM Reference**: Lines 60-73, 1403-1411

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `casino_id` | `uuid` | No | Casino FK |
| `label` | `text` | No | Table identifier (e.g., "BJ-12") |
| `pit` | `text` | Yes | Floor pit assignment |
| `type` | `game_type` | No | Enum: blackjack, poker, roulette, baccarat |
| `status` | `table_status` | No | Enum: inactive, active, closed |
| `created_at` | `timestamptz` | No | Creation timestamp |

**Consumers**:
- RatingSlip (table assignment FK)
- FloorLayout (slot placement)
- UI (table management, floor view)

---

### DealerRotationDTO

**Owner**: TableContextService
**File**: `services/table-context/dtos.ts`
**Pattern**: Canonical
**Exposure**: Internal, UI
**SRM Reference**: Lines 60-73, 1427-1437

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `casino_id` | `uuid` | No | Casino FK |
| `table_id` | `uuid` | No | Gaming table FK |
| `staff_id` | `uuid` | Yes | Dealer FK (can be null) |
| `started_at` | `timestamptz` | No | Rotation start |
| `ended_at` | `timestamptz` | Yes | Rotation end (null if active) |

**Consumers**:
- UI (dealer scheduling)
- Reports (dealer performance)

---

### TableInventoryDTO

**Owner**: TableContextService
**File**: `services/table-context/dtos.ts`
**Pattern**: Canonical
**Exposure**: Internal, UI
**SRM Reference**: Lines 60-73, 1492-1504

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `casino_id` | `uuid` | No | Casino FK |
| `table_id` | `uuid` | No | Gaming table FK |
| `snapshot_type` | `text` | No | Enum: open, close, rundown |
| `chipset` | `jsonb` | No | Chip denominations and counts |
| `counted_by` | `uuid` | Yes | Staff FK |
| `verified_by` | `uuid` | Yes | Staff FK |
| `discrepancy_cents` | `int` | No | Variance from expected (default: 0) |
| `note` | `text` | Yes | Audit note |
| `created_at` | `timestamptz` | No | Snapshot timestamp |

**Consumers**:
- UI (inventory management)
- Audit (custody tracking)

---

### TableFillDTO

**Owner**: TableContextService
**File**: `services/table-context/dtos.ts`
**Pattern**: Canonical
**Exposure**: Internal, UI
**SRM Reference**: Lines 60-73, 1506-1520

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `casino_id` | `uuid` | No | Casino FK |
| `table_id` | `uuid` | No | Gaming table FK |
| `request_id` | `text` | No | Idempotency key (unique per casino) |
| `chipset` | `jsonb` | No | Chip denominations and counts |
| `amount_cents` | `int` | No | Total fill amount |
| `requested_by` | `uuid` | Yes | Staff FK |
| `delivered_by` | `uuid` | Yes | Staff FK |
| `received_by` | `uuid` | Yes | Staff FK |
| `slip_no` | `text` | Yes | Fill slip number |
| `created_at` | `timestamptz` | No | Request timestamp |

**Consumers**:
- UI (fill tracking)
- Audit (chip custody)

---

### TableCreditDTO

**Owner**: TableContextService
**File**: `services/table-context/dtos.ts`
**Pattern**: Canonical
**Exposure**: Internal, UI
**SRM Reference**: Lines 60-73, 1522-1536

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `casino_id` | `uuid` | No | Casino FK |
| `table_id` | `uuid` | No | Gaming table FK |
| `request_id` | `text` | No | Idempotency key (unique per casino) |
| `chipset` | `jsonb` | No | Chip denominations and counts |
| `amount_cents` | `int` | No | Total credit amount |
| `authorized_by` | `uuid` | Yes | Staff FK |
| `sent_by` | `uuid` | Yes | Staff FK |
| `received_by` | `uuid` | Yes | Staff FK |
| `slip_no` | `text` | Yes | Credit slip number |
| `created_at` | `timestamptz` | No | Request timestamp |

**Consumers**:
- UI (credit tracking)
- Audit (chip custody)

---

### TableDropDTO

**Owner**: TableContextService
**File**: `services/table-context/dtos.ts`
**Pattern**: Canonical
**Exposure**: Internal, UI
**SRM Reference**: Lines 60-73, 1538-1553

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `casino_id` | `uuid` | No | Casino FK |
| `table_id` | `uuid` | No | Gaming table FK |
| `seal_no` | `text` | Yes | Drop box seal number |
| `drop_box_id` | `text` | Yes | Drop box identifier |
| `gaming_day` | `date` | Yes | Gaming day |
| `seq_no` | `int` | Yes | Sequence number |
| `removed_by` | `uuid` | Yes | Staff FK |
| `witnessed_by` | `uuid` | Yes | Staff FK |
| `removed_at` | `timestamptz` | No | Removal timestamp |
| `delivered_at` | `timestamptz` | Yes | Delivery timestamp |
| `delivered_scan_at` | `timestamptz` | Yes | Scan timestamp |
| `note` | `text` | Yes | Custody note |

**Consumers**:
- UI (drop tracking)
- Audit (custody timeline)
- Finance (drop count reconciliation)

---

## FloorLayoutService DTOs

### FloorLayoutDTO

**Owner**: FloorLayoutService
**File**: `services/floor-layout/dtos.ts`
**Pattern**: Canonical
**Exposure**: UI (admin), Internal
**SRM Reference**: Lines 60-73, 1685-1696

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `casino_id` | `uuid` | No | Casino FK |
| `name` | `text` | No | Layout name |
| `description` | `text` | Yes | Layout description |
| `status` | `floor_layout_status` | No | Enum: draft, review, approved, archived |
| `created_by` | `uuid` | No | Staff FK |
| `reviewed_by` | `uuid` | Yes | Staff FK |
| `approved_by` | `uuid` | Yes | Staff FK |
| `created_at` | `timestamptz` | No | Creation timestamp |
| `updated_at` | `timestamptz` | No | Update timestamp |

**Consumers**:
- UI (layout management)
- FloorLayout service (approval workflow)

---

### FloorLayoutVersionDTO

**Owner**: FloorLayoutService
**File**: `services/floor-layout/dtos.ts`
**Pattern**: Canonical
**Exposure**: UI (admin), Internal
**SRM Reference**: Lines 60-73, 1698-1708

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `layout_id` | `uuid` | No | Floor layout FK |
| `version_no` | `int` | No | Version number (unique per layout) |
| `status` | `floor_layout_version_status` | No | Enum: draft, pending_activation, active, retired |
| `layout_payload` | `jsonb` | No | Layout geometry/metadata |
| `notes` | `text` | Yes | Version notes |
| `created_by` | `uuid` | No | Staff FK |
| `created_at` | `timestamptz` | No | Creation timestamp |

**Consumers**:
- UI (version history)
- FloorLayout service (activation)

---

### FloorPitDTO

**Owner**: FloorLayoutService
**File**: `services/floor-layout/dtos.ts`
**Pattern**: Canonical
**Exposure**: UI, Internal
**SRM Reference**: Lines 60-73, 1710-1718

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `layout_version_id` | `uuid` | No | Layout version FK |
| `label` | `text` | No | Pit label (e.g., "Pit A") |
| `sequence` | `int` | No | Display order (default: 0) |
| `capacity` | `int` | Yes | Table capacity |
| `geometry` | `jsonb` | Yes | Pit geometry |
| `metadata` | `jsonb` | Yes | Additional pit metadata |

**Consumers**:
- UI (floor visualization)
- TableContext (pit assignment)

---

### FloorTableSlotDTO

**Owner**: FloorLayoutService
**File**: `services/floor-layout/dtos.ts`
**Pattern**: Canonical
**Exposure**: UI, Internal
**SRM Reference**: Lines 60-73, 1720-1730

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `layout_version_id` | `uuid` | No | Layout version FK |
| `pit_id` | `uuid` | Yes | Pit FK |
| `slot_label` | `text` | No | Slot identifier |
| `game_type` | `game_type` | No | Enum: blackjack, poker, roulette, baccarat |
| `preferred_table_id` | `uuid` | Yes | Gaming table FK (preferred assignment) |
| `coordinates` | `jsonb` | Yes | Slot coordinates |
| `orientation` | `text` | Yes | Slot orientation |
| `metadata` | `jsonb` | Yes | Additional slot metadata |

**Consumers**:
- UI (floor visualization)
- TableContext (table placement)

---

### FloorLayoutActivationDTO

**Owner**: FloorLayoutService
**File**: `services/floor-layout/dtos.ts`
**Pattern**: Canonical
**Exposure**: Internal, Audit
**SRM Reference**: Lines 60-73, 1732-1741

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `casino_id` | `uuid` | No | Casino FK |
| `layout_version_id` | `uuid` | No | Layout version FK |
| `activated_by` | `uuid` | No | Staff FK |
| `activated_at` | `timestamptz` | No | Activation timestamp |
| `deactivated_at` | `timestamptz` | Yes | Deactivation timestamp |
| `activation_request_id` | `text` | No | Idempotency key (unique per casino) |

**Consumers**:
- **TableContext** (layout activation events)
- UI (activation history)
- Audit (layout changes)

---

## Cross-Context Consumption Matrix

| DTO | Owner | Primary Consumers | Use Case |
|-----|-------|-------------------|----------|
| `RatingSlipTelemetryDTO` | RatingSlip | Loyalty, Finance | Mid-session rewards, gameplay context |
| `VisitDTO` | Visit | Loyalty, Finance, MTL, RatingSlip | Session context, compliance lineage |
| `CasinoSettingsDTO` | Casino | TableContext, Finance, MTL | Gaming day authority, temporal alignment |
| `GamingTableDTO` | TableContext | RatingSlip, FloorLayout | Table assignment, slot placement |
| `FloorLayoutActivationDTO` | FloorLayout | TableContext, Performance | Layout sync, table activation/deactivation |
| `PlayerDTO` | Player | Visit, Loyalty, Finance, MTL, RatingSlip | Player identity across contexts |
| `StaffDTO` | Casino | All services | Actor tracking, audit logs |

---

## Versioning Strategy

**Schema Version**: Tracked via migrations (`docs/65-migrations/MIG-001-migration-tracking-matrix.md`)
**DTO Versioning**: Implicit through migration timestamps
**Breaking Changes**: Require new migration + SRM update
**Type Regeneration**: `npm run db:types` after every migration (MANDATORY)

---

## Validation & Enforcement

**ESLint Rules**:
- `no-manual-dto-interfaces` - Prevents manual DTO definitions
- `no-cross-context-db-imports` - Enforces bounded context access
- `dto-column-allowlist` - Validates sensitive field exposure

**Pre-commit Hooks**: Validates DTO compliance before commit
**CI Gates**: Type check + ESLint validation in CI pipeline

---

## References

- **SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **DTO Standard**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- **Type System**: `types/database.types.ts`
- **Migration Tracking**: `docs/65-migrations/MIG-001-migration-tracking-matrix.md`

---

**Last Updated**: 2025-11-17
**Schema SHA**: efd5cd6d079a9a794e72bcf1348e9ef6cb1753e6
