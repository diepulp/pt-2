# DTO Catalog

**Status**: ASPIRATIONAL SPECIFICATION
**Implementation**: PARTIAL (VisitService 100%, RatingSlipService pending PRD-002)
**Effective**: 2025-12-06
**Source**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
**Canonical Standard**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
**Version**: 3.3.0

---

> **⚠️ IMPORTANT: This is an aspirational specification, not an inventory of existing code.**
>
> The `dtos.ts` files described below **DO NOT EXIST YET**. Current implementation uses:
> - **Inline DTOs** in feature files (e.g., `mid-session-reward.ts`)
> - **README documentation** for Pattern B services
>
> This catalog defines the **target architecture** for when services mature and DTOs are
> extracted to dedicated files. Use this as a guide when implementing `dtos.ts` files.
>
> **Current state**: See `docs/70-governance/SERVICE_TEMPLATE.md` § Implementation Status Overview

---

## Purpose

This catalog enumerates all Data Transfer Objects (DTOs) by bounded context, their owners, fields, consumers, and versioning. Each DTO represents a contract between services as defined in the Service Responsibility Matrix (SRM).

**Use this catalog when**:
- Implementing a new `dtos.ts` file (reference for field definitions)
- Understanding cross-context DTO dependencies
- Planning DTO extraction from inline definitions

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

> **Updated**: 2025-12-06 per EXEC-VSE-001 (Visit Service Evolution)

### Visit Archetypes

| `visit_kind` | Identity | Gaming | Loyalty | Use Case |
|--------------|----------|--------|---------|----------|
| `reward_identified` | Player exists | No | Redemptions only | Comps, vouchers, customer care |
| `gaming_identified_rated` | Player exists | Yes | Accrual eligible | Standard rated play |
| `gaming_ghost_unrated` | No player | Yes | Compliance only | Ghost gaming for finance/MTL |

### VisitKind (Enum)

**Owner**: VisitService
**File**: `services/visit/dtos.ts`
**Pattern**: Derived from Database enum
**Exposure**: UI, Internal

```typescript
type VisitKind = 'reward_identified' | 'gaming_identified_rated' | 'gaming_ghost_unrated';
```

---

### VisitDTO

**Owner**: VisitService
**File**: `services/visit/dtos.ts`
**Pattern**: Canonical
**Exposure**: Internal only
**SRM Reference**: §VisitService (Operational Session Context)

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `player_id` | `uuid` | **Yes** | Player FK (NULL for ghost visits) |
| `casino_id` | `uuid` | No | Casino FK |
| `visit_kind` | `visit_kind` | No | Visit archetype classification |
| `started_at` | `timestamptz` | No | Check-in timestamp |
| `ended_at` | `timestamptz` | Yes | Check-out timestamp (null if open) |

**Invariants**:
- `gaming_ghost_unrated` visits MUST have `player_id = NULL`
- All other visit kinds MUST have `player_id IS NOT NULL`
- Enforced by CHECK constraint `chk_visit_kind_player_presence`

**Consumers**:
- **Loyalty** (session context for ledger entries; filters by `visit_kind`)
- **Finance** (session association for transactions)
- **MTL** (compliance lineage)
- **RatingSlip** (session scoping; `visit_id` is NOT NULL)

---

### CreateRewardVisitDTO

**Owner**: VisitService
**File**: `services/visit/dtos.ts`
**Pattern**: Canonical (Pick from Insert)
**Exposure**: Internal only

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `player_id` | `uuid` | No | Identified player (required) |

**Use Case**: Comps, vouchers, customer care without gaming session.
Creates visit with `visit_kind = 'reward_identified'`.

---

### CreateGamingVisitDTO

**Owner**: VisitService
**File**: `services/visit/dtos.ts`
**Pattern**: Canonical (Pick from Insert)
**Exposure**: Internal only

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `player_id` | `uuid` | No | Identified player (required) |

**Use Case**: Standard rated play with loyalty accrual.
Creates visit with `visit_kind = 'gaming_identified_rated'`.

---

### CreateGhostGamingVisitDTO

**Owner**: VisitService
**File**: `services/visit/dtos.ts`
**Pattern**: Contract-First (RPC input)
**Exposure**: Internal only

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `table_id` | `uuid` | No | Gaming table where ghost play occurs |
| `notes` | `text` | Yes | Optional notes about the session |

**Use Case**: Tracking gaming activity for compliance (CTR/MTL) when player declines or cannot provide identification.
Creates visit with `visit_kind = 'gaming_ghost_unrated'` and `player_id = NULL`.

**Reference**: ADR-014 Ghost Gaming Visits

---

### ConvertRewardToGamingDTO

**Owner**: VisitService
**File**: `services/visit/dtos.ts`
**Pattern**: Contract-First (RPC input)
**Exposure**: Internal only

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `visit_id` | `uuid` | No | Visit to convert |

**Use Case**: Player came in for rewards, decided to play.
Transitions `visit_kind` from `reward_identified` to `gaming_identified_rated`.

---

### VisitWithPlayerDTO

**Owner**: VisitService
**File**: `services/visit/dtos.ts`
**Pattern**: Contract-First (joined response)
**Exposure**: UI, Internal

**Fields**: Extends `VisitDTO` with:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `player` | `object` | Yes | Embedded player details (null for ghost visits) |
| `player.id` | `uuid` | — | Player ID |
| `player.first_name` | `text` | — | Player first name |
| `player.last_name` | `text` | — | Player last name |

**Consumers**:
- UI (visit list displays)

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

> **Updated**: 2025-12-06 per EXEC-VSE-001 (Visit Service Evolution)
> - `visit_id` and `table_id` are now **NOT NULL** (Phase B hardening)
> - `player_id` column **REMOVED** - player identity derived from `visit.player_id`

### RatingSlipDTO

**Owner**: RatingSlipService
**File**: `services/rating-slip/lifecycle.ts`
**Pattern**: Canonical (full row)
**Exposure**: Internal only
**SRM Reference**: §RatingSlipService (Telemetry Context)

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `casino_id` | `uuid` | No | Casino FK (immutable) |
| `visit_id` | `uuid` | **No** | Session FK (immutable, always anchored to visit) |
| `table_id` | `uuid` | **No** | Gaming table FK (immutable, PT-2 = table games only) |
| `game_settings` | `jsonb` | Yes | Policy snapshot |
| `average_bet` | `numeric` | Yes | Wagering telemetry |
| `start_time` | `timestamptz` | No | Session start (immutable) |
| `end_time` | `timestamptz` | Yes | Session end |
| `status` | `text` | No | Lifecycle state: open, paused, closed |
| `policy_snapshot` | `jsonb` | Yes | Reward policy at play time |
| `seat_number` | `text` | Yes | Player seat position |

**Key Invariant**: Player identity is derived from `visit.player_id`. RatingSlip does NOT have its own `player_id` column.

**Consumers**:
- RatingSlip service (internal CRUD)
- Loyalty (via RatingSlipTelemetryDTO; eligibility filtered by `visit.visit_kind`)

---

### StartRatingSlipInput

**Owner**: RatingSlipService
**File**: `services/rating-slip/lifecycle.ts`
**Pattern**: Contract-First (input DTO)
**Exposure**: Internal only
**SRM Reference**: §RatingSlipService (Telemetry Context)

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `tableId` | `string` | No | Gaming table UUID |
| `visitId` | `string` | No | Visit session UUID (player derived from visit) |
| `seatNumber` | `string` | No | Player seat position |
| `gameSettings` | `Record<string, unknown>` | No | Game configuration snapshot |

**Note**: `playerId` removed - player identity is now derived from the visit's `player_id`.

**Consumers**:
- RatingSlip service (startSlip operation)

---

### RatingSlipCloseDTO

**Owner**: RatingSlipService
**File**: `services/rating-slip/lifecycle.ts`
**Pattern**: Canonical (extends RatingSlipDTO)
**Exposure**: Internal only
**SRM Reference**: Lines 60-73, 1831-1843

**Fields**: Extends `RatingSlipDTO` with:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `duration_seconds` | `number` | No | Active play duration (excludes pauses) |

**Consumers**:
- RatingSlip service (closeSlip operation)
- Loyalty (reward calculation input)

---

### RatingSlipTelemetryDTO

**Owner**: RatingSlipService
**File**: `services/rating-slip/dtos.ts`
**Pattern**: Hybrid (contract-first for cross-context)
**Exposure**: Internal (published to Loyalty/Finance)
**SRM Reference**: §RatingSlipService (Telemetry Context)

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Rating slip ID |
| `visit_id` | `uuid` | No | Session FK (for player_id resolution) |
| `casino_id` | `uuid` | No | Casino FK |
| `average_bet` | `number` | Yes | Average wager amount |
| `duration_seconds` | `number` | No | Play duration |
| `game_type` | `'blackjack' \| 'poker' \| 'roulette' \| 'baccarat'` | No | Game type |

**Note**: `player_id` removed from telemetry DTO - consumers should join via `visit_id` to get player identity.

**Excluded Fields**: `policy_snapshot`

**Consumers**:
- **Loyalty** (reward calculation input; must check `visit.visit_kind = 'gaming_identified_rated'`)
- **Finance** (optional gameplay context)

---

### HasOpenSlipsForTableResult

**Owner**: RatingSlipService  
**File**: `services/rating-slip/queries.ts`  
**Pattern**: Contract-First (published query result)  
**Exposure**: Internal (cross-context)  
**SRM Reference**: Cross-Context Consumption Table (TableContextService ← RatingSlipService)

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `hasOpenSlips` | `boolean` | No | `true` when any `rating_slip.status = 'open'` for the table/casino scope |

**Consumers**:
- **TableContext** (deactivate guard; prevents deactivation when open slips exist)

---

### RatingSlipPauseDTO

**Owner**: RatingSlipService
**File**: `services/rating-slip/dtos.ts`
**Pattern**: Canonical (full row)
**Exposure**: Internal only
**SRM Reference**: §RatingSlipService (Telemetry Context)

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `uuid` | No | Primary key |
| `rating_slip_id` | `uuid` | No | Parent rating slip FK |
| `casino_id` | `uuid` | No | Casino FK (RLS scoping) |
| `started_at` | `timestamptz` | No | Pause start timestamp |
| `ended_at` | `timestamptz` | Yes | Pause end (NULL = still paused) |
| `created_by` | `uuid` | Yes | Staff FK (actor tracking) |

**Invariants**:
- `ended_at IS NULL OR ended_at > started_at` (CHECK constraint)
- One row per pause interval (supports multiple pause/resume cycles)

**Consumers**:
- RatingSlipService (duration calculation via `rpc_get_rating_slip_duration`)

**Duration Formula**: `duration_seconds = (end_time - start_time) - SUM(ended_at - started_at)`

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

**Last Updated**: 2025-12-07
**Schema SHA**: efd5cd6d079a9a794e72bcf1348e9ef6cb1753e6
