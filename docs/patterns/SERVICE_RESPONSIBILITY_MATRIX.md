# Service Responsibility Matrix - Bounded Context Integrity

> **Version**: 2.3.0 (Complete Bounded Context Map)
> **Date**: 2025-10-19
> **Status**: CANONICAL - Complete Architecture with Foundational, Operational, Reward & Compliance Services
> **Previous Versions**:
> - [v2.2.0 TableContext (2025-10-19)](../../archive/SERVICE_RESPONSIBILITY_MATRIX_v2.2_tablecontext_2025-10-19.md)
> - [v2.1.0 MTL (2025-10-14)](../../archive/SERVICE_RESPONSIBILITY_MATRIX_v2.1_mtl_2025-10-14.md)
> - [v2.0.0 Loyalty (2025-10-12)](../../archive/SERVICE_RESPONSIBILITY_MATRIX_v2.0_loyalty_2025-10-12.md)
> - [v1.0 Pre-Loyalty (2025-10-06)](../../archive/SERVICE_RESPONSIBILITY_MATRIX_v1.0_pre-loyalty_2025-10-06.md)
> **Purpose**: Maintain bounded context integrity across all service domains

---

## Version History

| Version | Date | Changes | Rationale |
|---------|------|---------|-----------|
| **2.3.0** | 2025-10-19 | Added Casino (Foundational) service bounded context for property management, global configuration, timezone/gaming-day logic, staff management, and policy thresholds | Establishes Casino as the root authority for all operational domains, providing configuration inheritance and compliance policy to TableContext, MTL, RatingSlip, Loyalty, and Performance |
| 2.2.0 | 2025-10-19 | Added TableContext (Operational) service bounded context for gaming table lifecycle, configuration, dealer rotation, inventory tracking, and operational telemetry | Establishes clear ownership of table-level operational concerns and provides structured context for RatingSlip, MTL, and Performance domains |
| 2.1.0 | 2025-10-14 | Added MTL (Compliance) service bounded context, enhanced cross-domain correlation with rating_slip_id/visit_id, added audit note immutability pattern | Phase 6+ requires AML/CTR compliance tracking with contextual enrichment from Loyalty and RatingSlip domains |
| 2.0.0 | 2025-10-12 | Added Loyalty service bounded context, clarified point calculation ownership, updated integration patterns | Phase 6 requires Loyalty for point calculation policy (reward vs measurement separation) |
| 1.0.0 | 2025-10-06 | Initial version post-RatingSlip simplification, established Performance vs Finance separation | Bounded context integrity after domain coupling analysis |

---

## Executive Summary

**Critical Finding**: RatingSlip feature **cannot** be implemented without Loyalty service, as point calculation is a **reward policy** concern, not a measurement concern.

**Architectural Principle** (per LOYALTY_SERVICE_HANDOFF.md):
> *"If the logic describes how player activity becomes a reward, it belongs to LoyaltyService. If it describes how the activity occurred (bets, time, wins), it belongs to RatingSlipService."*

**Decision**: Phase 6 scope expanded to include Loyalty service as HORIZONTAL prerequisite infrastructure.

---

## Updated Bounded Context Map

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          CASINO TRACKER SYSTEM                              │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────┐        │
│  │               FOUNDATIONAL CONTEXT (Root Authority)             │        │
│  │                                                                 │        │
│  │  ┌──────────────┐                                              │        │
│  │  │   Casino     │  • Property registry                         │        │
│  │  │   Service    │  • Timezone & gaming day                     │        │
│  │  │              │  • Compliance thresholds (CTR, watchlist)    │        │
│  │  │              │  • Staff & access control                    │        │
│  │  │              │  • Corporate grouping                        │        │
│  │  │              │  • Game config templates                     │        │
│  │  │              │  • Audit oversight                           │        │
│  │  └──────┬───────┘                                              │        │
│  │         │                                                       │        │
│  └─────────┼───────────────────────────────────────────────────────┘        │
│            │ Provides configuration & policy to all contexts               │
│            ▼                                                                │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐               │
│  │   IDENTITY   │     │ OPERATIONAL  │     │   FINANCE    │               │
│  │   CONTEXT    │     │   CONTEXT    │     │   CONTEXT    │               │
│  │              │     │              │     │              │               │
│  │   Player     │     │ TableContext │     │   Player     │               │
│  │   Service    │     │   Service    │     │   Financial  │               │
│  │              │     │              │     │              │               │
│  │              │     │ • Tables     │     │              │               │
│  │              │     │ • Dealers    │     │              │               │
│  │              │     │ • Fills/drops│     │              │               │
│  │              │     │ • Chip counts│     │              │               │
│  │              │     │ • Alerts     │     │              │               │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘               │
│         │                    │                    │                        │
│         │                    │                    │                        │
│         ▼                    ▼                    ▼                        │
│  ┌───────────────────────────────────────────────────────────────┐        │
│  │            SESSION CONTEXT (Aggregate Root)                    │        │
│  │                                                                 │        │
│  │  ┌──────────────┐        ┌──────────────┐                     │        │
│  │  │    Visit     │───────▶│  RatingSlip  │─────┐               │        │
│  │  │   Service    │        │   Service    │     │               │        │
│  │  │              │        │ (Telemetry)  │◀────┼─── Table      │        │
│  │  └──────────────┘        └──────────────┘     │    context    │        │
│  │                                                │               │        │
│  └────────────────────────────────────────────────┼───────────────┘        │
│                                                   │                        │
│         ┌─────────────────────────────────────────┘                        │
│         │ Emits: RatingSlipCompletedEvent                                  │
│         │ (telemetry data: avgBet, duration, gameSettings)                 │
│         ▼                                                                  │
│  ┌──────────────┐                    ┌─────────────────┐                  │
│  │   REWARD     │                    │   COMPLIANCE    │                  │
│  │   CONTEXT    │                    │    CONTEXT      │◀─── Fills/drops  │
│  │              │  ◀────┐            │                 │     chip counts  │
│  │   Loyalty    │       │            │      MTL        │   ◀─ Casino      │
│  │   Service    │       └────────────│    Service      │      thresholds  │
│  │              │  Read-only         │                 │      gaming day  │
│  │              │  correlation       │ • CTR threshold │                  │
│  └──────┬───────┘  (contextual       │ • Watchlist     │                  │
│         │           enrichment)      │ • Gaming day    │                  │
│         │                            │ • Audit trail   │                  │
│         │  • Interprets telemetry    │                 │                  │
│         │  • Applies reward policy   └─────────────────┘                  │
│         │  • Calculates points                                            │
│         │  • Stores in LoyaltyLedger                                      │
│         │  • Updates tier progression                                     │
│         │                                                                  │
│         └──────────▶ Updates RatingSlip.points (denormalized cache)       │
│                                                                            │
│  Key Relationships:                                                        │
│  • Casino → All contexts (configuration & policy inheritance)             │
│  • TableContext → RatingSlip, MTL (operational telemetry)                 │
│  • Session/Telemetry → Loyalty, MTL (read-only consumption)              │
│  • Loyalty → MTL (contextual enrichment for compliance oversight)         │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Updated Service Responsibility Matrix

| Domain | Service | Owns | References | Aggregates | Responsibilities |
|--------|---------|------|------------|------------|------------------|
| **Foundational** 🆕 | `CasinoService` | • Casino registry<br>• **CasinoSettings** (timezone, gaming day)<br>• **Compliance thresholds** (CTR, watchlist)<br>• Game config templates<br>• Staff & access control<br>• Corporate grouping<br>• Audit logs<br>• Reports | • Company (FK, corporate parent) | • All operational domains<br>• Policy inheritance<br>• Configuration distribution | **Root authority for property management & global policy** |
| **Identity** | `PlayerService` | • Player profile<br>• Contact info<br>• Identity data | • Casino (FK, enrollment) | • Visits<br>• RatingSlips<br>• Loyalty | Identity management |
| **Operational** | `TableContextService` | • Gaming tables<br>• Table settings<br>• Dealer rotations<br>• Fills/drops/chips<br>• Inventory slips<br>• Break alerts<br>• Key control logs | • Casino (FK)<br>• Staff (FK, dealers) | • Performance metrics<br>• MTL events<br>• Table snapshots | **Table lifecycle & operational telemetry** |
| **Session** | `VisitService` | • Visit sessions<br>• Check-in/out<br>• Visit status | • Player (FK)<br>• Casino (FK) | • RatingSlips<br>• Financials<br>• MTL entries | Session lifecycle |
| **Telemetry** | `RatingSlipService` | • Average bet<br>• Time played<br>• Game settings<br>• Seat number<br>• **points** (cache) | • Player (FK)<br>• Visit (FK)<br>• Gaming Table (FK) | – | **Gameplay measurement** |
| **Reward** 🆕 | `LoyaltyService` | • **Points calculation logic**<br>• Loyalty ledger<br>• Tier status<br>• Tier rules<br>• Preferences | • Player (FK)<br>• RatingSlip (FK)<br>• Visit (FK) | • Points history<br>• Tier progression | **Reward policy & assignment** |
| **Finance** | `PlayerFinancialService` | • Cash in/out<br>• Chips tracking<br>• Reconciliation | • Player (FK)<br>• Visit (FK)<br>• RatingSlip (FK) | – | Financial tracking |
| **Compliance** 🆕 | `MTLService` | • **Cash transaction log**<br>• MTL entries (immutable)<br>• Audit notes<br>• Gaming day calculation<br>• Threshold detection<br>• Compliance exports | • Player (FK, optional)<br>• Casino (FK)<br>• Staff (FK)<br>• RatingSlip (FK, optional)<br>• Visit (FK, optional) | • Daily aggregates<br>• Threshold monitoring<br>• CTR/Watchlist detection | **AML/CTR compliance tracking** |

---

## Casino Service (NEW) - Foundational Context

### ✅ CasinoService (Root Authority & Global Policy)

**OWNS:**
- **Casino registry** (master records for licensed gaming establishments)
- **CasinoSettings** (timezone, gaming day start, compliance thresholds)
- `casino` table (canonical casino identity)
- `company` table (corporate ownership hierarchy)
- `gamesettings` table (game configuration templates)
- `Staff` table (staff registry and access control)
- `playercasino` table (player enrollment associations)
- `AuditLog` table (cross-domain event logging)
- `Report` table (administrative reports)
- Compliance threshold configuration (CTR floor $10k, watchlist floor $3k)
- Timezone and gaming day calculation logic
- Access control and authorization policies

**PROVIDES TO (All Downstream Contexts):**
- **TableContext**: Casino ID linkage, game config templates, staff authorization
- **Visit**: Casino jurisdiction, timezone for session timestamps, gaming day boundaries
- **RatingSlip**: Casino settings for gameplay telemetry normalization
- **MTL**: Gaming day start time, compliance thresholds (CTR, watchlist), timezone
- **Loyalty**: Casino-specific tier rules and point multipliers (future)
- **Performance**: Timezone and threshold normalization for metrics
- **Audit/Compliance**: Centralized audit logging and regulatory reporting

**DOES NOT OWN:**
- ❌ Table operational state → `TableContextService`
- ❌ Player sessions → `VisitService`
- ❌ Gameplay telemetry → `RatingSlipService`
- ❌ Cash transactions → `MTLService`
- ❌ Reward calculations → `LoyaltyService`

**BOUNDED CONTEXT**: "What are the operational parameters and policy boundaries of this casino property?"

**KEY PRINCIPLES:**
- **Root Authority**: All contexts inherit configuration and policy from Casino
- **Immutable Identity**: Casino properties are stable, foundational entities
- **Policy Distribution**: Thresholds and rules flow downstream, never upstream
- **Timezone Normalization**: Single source of truth for temporal calculations
- **Corporate Hierarchy**: Company grouping for multi-property operations

### Primary Responsibilities

| Area | Implementation | Description |
|------|----------------|-------------|
| **Casino Registry** | `casino` | Maintain canonical records for each licensed property |
| **Corporate Grouping** | `company` | Manage ownership hierarchies and brand grouping |
| **Global Configuration** | `CasinoSettings` | Persist timezone, gaming day start, compliance thresholds |
| **Game Templates** | `gamesettings` | Provide base configuration applied to gaming tables |
| **Staff Management** | `Staff` | Manage staff identities, roles, and access permissions |
| **Player Enrollment** | `playercasino` | Record player-to-casino associations for loyalty tracking |
| **Audit Oversight** | `AuditLog` | Log all regulated operations under casino scope |
| **Reporting** | `Report` | Generate operational reports (financial, regulatory, performance) |

### Schema (Core Entities)

```sql
-- Casino master registry
CREATE TABLE casino (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES company(id),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- Corporate ownership
CREATE TABLE company (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  legal_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Casino configuration (policy & thresholds)
CREATE TABLE "CasinoSettings" (
  id TEXT PRIMARY KEY,
  casino_id TEXT NOT NULL REFERENCES casino(id),
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  gaming_day_start TEXT NOT NULL DEFAULT '06:00',

  -- Compliance thresholds (consumed by MTL)
  watchlist_floor DECIMAL(10,2) NOT NULL DEFAULT 3000,
  ctr_threshold DECIMAL(10,2) NOT NULL DEFAULT 10000,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- Game configuration templates (consumed by TableContext)
CREATE TABLE gamesettings (
  id UUID PRIMARY KEY,
  casino_id TEXT REFERENCES casino(id),
  name TEXT NOT NULL,
  game_type TEXT NOT NULL,
  house_edge DECIMAL(5,2),
  average_rounds_per_hour INTEGER,
  points_conversion_rate DECIMAL(10,2) DEFAULT 10.0,
  point_multiplier DECIMAL(3,2) DEFAULT 1.0,
  seats_available INTEGER DEFAULT 7,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Staff registry and access control
CREATE TABLE "Staff" (
  id UUID PRIMARY KEY,
  casino_id TEXT NOT NULL REFERENCES casino(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL,
  employee_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- Player enrollment associations
CREATE TABLE playercasino (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES player(id),
  casino_id TEXT NOT NULL REFERENCES casino(id),
  enrolled_date DATE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(player_id, casino_id)
);

-- Cross-domain audit logging
CREATE TABLE "AuditLog" (
  id UUID PRIMARY KEY,
  casino_id TEXT NOT NULL REFERENCES casino(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES "Staff"(id),
  changes JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Administrative reports
CREATE TABLE "Report" (
  id UUID PRIMARY KEY,
  casino_id TEXT NOT NULL REFERENCES casino(id),
  report_type TEXT NOT NULL,
  date_range DATERANGE,
  data JSONB,
  generated_by UUID REFERENCES "Staff"(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Integration Boundaries

| Partner Context | Relationship | Data Flow | Description |
|-----------------|--------------|-----------|-------------|
| **TableContext** | Referential + Config source | → | Provides casino_id, game templates, staff authorization |
| **Player** | Referential | ←→ | Player enrollment associations via playercasino |
| **Visit** | Referential + Policy source | → | Provides casino jurisdiction, timezone, gaming day boundaries |
| **RatingSlip** | Referential | → | Inherits casino settings for telemetry normalization |
| **Loyalty** | Policy source | → | Provides casino-specific tier rules (future enhancement) |
| **MTL** | Policy source | → | Provides gaming day start, CTR/watchlist thresholds, timezone |
| **Performance** | Referential + Normalization | → | Uses timezone and thresholds for metric calculations |
| **Audit/Compliance** | Observer | ← | Receives events from all domains for centralized logging |
| **Staff/Auth** | Referential | ←→ | Role-based access control within casino jurisdiction |

### Configuration Inheritance Pattern

```typescript
// Example: MTL Service consuming Casino configuration
export async function recordMtlEntry(
  supabase: SupabaseClient<Database>,
  entry: MtlEntryInput
): Promise<ServiceResult<MtlEntry>> {

  // 1. Fetch casino configuration
  const { data: casinoSettings } = await supabase
    .from('CasinoSettings')
    .select('timezone, gaming_day_start, watchlist_floor, ctr_threshold')
    .eq('casino_id', entry.casino_id)
    .single();

  // 2. Calculate gaming day using casino timezone and start time
  const gamingDay = calculateGamingDay(
    entry.event_time,
    casinoSettings.timezone,
    casinoSettings.gaming_day_start
  );

  // 3. Insert MTL entry with inherited configuration
  const { data: mtlEntry } = await supabase
    .from('mtl_entry')
    .insert({
      ...entry,
      gaming_day: gamingDay,
      // Thresholds applied in downstream aggregation views
    })
    .select()
    .single();

  return { success: true, data: mtlEntry };
}
```

### Key Architectural Patterns

1. **Configuration Cascade**: Casino → CasinoSettings → All operational contexts
2. **Timezone Authority**: Single source for all temporal calculations
3. **Threshold Policy**: Compliance thresholds defined once, applied everywhere
4. **Staff Authorization**: Casino-scoped access control for all operations
5. **Audit Centralization**: All domain events logged under casino scope

---

## Loyalty Service (NEW) - Reward Context

### ✅ LoyaltyService (Reward Policy Engine)

**OWNS:**
- **Point calculation logic** (business rules, formula, multipliers)
- `loyalty_ledger` table (source of truth for all points transactions)
- `player_loyalty` table (current balance, tier status)
- `loyalty_tier` definitions (Gold, Silver, Bronze thresholds)
- Tier progression rules
- Point multipliers and conversion rates
- Reward preferences

**REFERENCES:**
- `player_id` - Who earned the points
- `rating_slip_id` - Source of gameplay telemetry
- `visit_id` - Session context

**DOES NOT OWN:**
- ❌ Gameplay telemetry (average_bet, time_played) → `RatingSlipService`
- ❌ Player identity → `PlayerService`
- ❌ Visit session → `VisitService`

**BOUNDED CONTEXT**: "What is this gameplay worth in rewards?"

### Schema (Minimal MVP)

```sql
-- Source of truth for all points transactions
CREATE TABLE loyalty_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES player(id),
  rating_slip_id UUID REFERENCES ratingslip(id),
  visit_id UUID REFERENCES visit(id),

  points_earned INTEGER NOT NULL,
  transaction_type TEXT NOT NULL, -- 'GAMEPLAY', 'BONUS', 'ADJUSTMENT'

  -- Telemetry snapshot (for audit trail)
  average_bet NUMERIC(10,2),
  duration_seconds INTEGER,
  game_type TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES staff(id)
);

-- Current player loyalty state
CREATE TABLE player_loyalty (
  player_id UUID PRIMARY KEY REFERENCES player(id),

  current_balance INTEGER NOT NULL DEFAULT 0,
  lifetime_points INTEGER NOT NULL DEFAULT 0,

  tier TEXT NOT NULL DEFAULT 'BRONZE', -- BRONZE, SILVER, GOLD, PLATINUM
  tier_progress INTEGER DEFAULT 0, -- Points toward next tier

  preferences JSONB, -- Reward preferences

  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tier definitions (config table)
CREATE TABLE loyalty_tier (
  tier TEXT PRIMARY KEY,
  threshold_points INTEGER NOT NULL,
  multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  benefits JSONB
);
```

---

## MTL Service (NEW) - Compliance Context

### ✅ MTLService (AML/CTR Compliance Engine)

**OWNS:**
- **Cash transaction logging** (immutable, write-once records)
- `mtl_entry` table (source of truth for all monetary transactions)
- `mtl_audit_note` table (append-only audit trail)
- `casino_settings` table (gaming day configuration, thresholds)
- Gaming day calculation logic (trigger-based)
- Threshold detection rules (watchlist >= $3k, CTR >= $10k)
- Compliance export generation (CSV reports)
- Aggregation views (`mtl_patron_aggregates`, `mtl_threshold_monitor`, `mtl_compliance_context`)

**REFERENCES:**
- `player_id` - Patron identification (when carded)
- `casino_id` - Venue context
- `recorded_by_employee_id` - Staff accountability
- `rating_slip_id` - Session context (optional)
- `visit_id` - Visit context (optional)

**READS (Contextual Enrichment):**
- `RatingSlip` - Session telemetry for behavioral correlation
- `Visit` - Session boundaries
- `Player` - Identity resolution
- `Loyalty Ledger` - Reward activity correlation (for compliance analysis)
- `Staff` - Audit trail and access control

**DOES NOT OWN:**
- ❌ Player identity → `PlayerService`
- ❌ Staff management → `StaffService`
- ❌ Visit sessions → `VisitService`
- ❌ Gaming telemetry → `RatingSlipService`
- ❌ Loyalty rewards → `LoyaltyService`

**BOUNDED CONTEXT**: "What cash/monetary transactions occurred for AML/CTR compliance?"

**KEY PRINCIPLES:**
- **Immutability**: Write-once entries, append-only audit notes
- **Read-Only Correlation**: Never writes to other domains (Loyalty, RatingSlip, etc.)
- **5+ Year Retention**: Long-term compliance archival
- **Gaming Day Normalization**: Automatic calculation via trigger
- **Threshold Detection**: Automated watchlist and CTR alerts

### Schema (Enhanced for Cross-Domain Correlation)

```sql
-- Core compliance transaction log (immutable)
CREATE TABLE mtl_entry (
  id BIGSERIAL PRIMARY KEY,
  casino_id TEXT NOT NULL REFERENCES casino(id),

  -- Patron identification (flexible for carded/uncarded)
  patron_id TEXT REFERENCES player(id),  -- When carded
  person_name TEXT,                      -- When uncarded
  person_last_name TEXT,
  person_description TEXT,

  -- Transaction details
  direction "MtlDirection" NOT NULL,     -- cash_in | cash_out
  area "MtlArea" NOT NULL,               -- pit | cage | slot | poker | kiosk
  tender_type "TenderType" NOT NULL DEFAULT 'cash',
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),

  -- Location context
  table_number TEXT,
  location_note TEXT,

  -- Timing
  event_time TIMESTAMPTZ NOT NULL,
  gaming_day DATE NOT NULL,              -- Auto-calculated via trigger

  -- Accountability
  recorded_by_employee_id UUID NOT NULL REFERENCES "Staff"(id),
  recorded_by_signature TEXT NOT NULL,
  notes TEXT,                            -- Legacy field (use mtl_audit_note instead)

  -- Cross-domain correlation (NEW)
  rating_slip_id UUID REFERENCES ratingslip(id),
  visit_id UUID REFERENCES visit(id),
  correlation_id TEXT,                   -- For distributed tracing
  idempotency_key TEXT UNIQUE,          -- Duplicate prevention

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- Append-only audit notes (enforces immutability)
CREATE TABLE mtl_audit_note (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mtl_entry_id BIGINT NOT NULL REFERENCES mtl_entry(id),
  note TEXT NOT NULL CHECK (length(trim(note)) > 0),
  created_by UUID NOT NULL REFERENCES "Staff"(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Casino configuration
CREATE TABLE casino_settings (
  id TEXT PRIMARY KEY,
  casino_id TEXT NOT NULL REFERENCES casino(id),
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  gaming_day_start TEXT NOT NULL DEFAULT '06:00',
  watchlist_floor DECIMAL(10,2) NOT NULL DEFAULT 3000,
  ctr_threshold DECIMAL(10,2) NOT NULL DEFAULT 10000,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);
```

### Contextual Enrichment View

```sql
-- Read-only view for compliance analysis
CREATE VIEW mtl_compliance_context AS
SELECT
  m.*,
  -- Session context (from RatingSlip)
  r.average_bet as session_avg_bet,
  r.accumulated_seconds as session_duration_seconds,
  -- Visit context
  v.check_in_date, v.check_out_date,
  -- Player identification
  p.first_name, p.last_name, p.card_number,
  -- Loyalty correlation (for compliance oversight)
  l.points_change, l.transaction_type as loyalty_tx_type,
  l.staff_id as loyalty_staff_id,
  -- Threshold status
  tm.threshold_status, tm.proximity_status,
  tm.watchlist_percentage, tm.ctr_percentage
FROM mtl_entry m
LEFT JOIN ratingslip r ON m.rating_slip_id = r.id
LEFT JOIN visit v ON m.visit_id = v.id
LEFT JOIN player p ON m.patron_id = p.id::text
LEFT JOIN loyalty_ledger l ON l.rating_slip_id = m.rating_slip_id
LEFT JOIN mtl_threshold_monitor tm ON tm.casino_id = m.casino_id
  AND tm.gaming_day = m.gaming_day;
```

---

## TableContext Service (NEW) - Operational Context

### ✅ TableContextService (Operational Telemetry & Lifecycle)

**OWNS:**
- **Table lifecycle management** (provision, activate, deactivate)
- `gamingtable` table (canonical registry)
- `gamingtablesettings` table (configuration)
- `DealerRotation` table (dealer assignments and rotations)
- `ChipCountEvent` table (chip verifications)
- `FillSlip` table (chip/cash fills)
- `DropEvent` table (cash removal events)
- `TableInventorySlip` table (aggregated inventory)
- `BreakAlert` table (operational alerts)
- `KeyControlLog` table (secure custody tracking)
- Performance metrics export (uptime, rotations, alert frequency)

**REFERENCES:**
- `casino_id` - Venue linkage
- `staff_id` - Dealer identity for rotations
- `table_id` - Gaming table reference

**PROVIDES TO (Downstream Consumers):**
- **RatingSlip**: Current table, dealer, and settings metadata snapshot
- **MTL**: Fill/drop/chip-count events with table context
- **Performance**: Table-level metrics, rotation durations, alert frequencies
- **Audit/Compliance**: KeyControlLog and operational event trails

**DOES NOT OWN:**
- ❌ Player sessions → `VisitService`
- ❌ Gameplay telemetry (bets, time) → `RatingSlipService`
- ❌ Reward calculations → `LoyaltyService`
- ❌ Compliance aggregation → `MTLService`

**BOUNDED CONTEXT**: "What is the operational state and activity of this gaming table?"

**KEY PRINCIPLES:**
- **Derived Context**: No dedicated `table_context` table; context is derived from related entities sharing `table_id`
- **Event-Based**: Table events (fills, drops, rotations) published for downstream consumption
- **Configuration Management**: Centralized table and game settings
- **Operational Telemetry**: Structured logs for compliance and performance analysis

### Primary Responsibilities

| Area | Implementation | Description |
|------|----------------|-------------|
| **Table Lifecycle** | `gamingtable` | Provision, activate, deactivate gaming tables |
| **Configuration** | `gamingtablesettings` | Manage per-table or template game settings |
| **Dealer Management** | `DealerRotation` | Record rotations and track duty cycles |
| **Inventory Logging** | `FillSlip`, `DropEvent`, `ChipCountEvent`, `TableInventorySlip` | Structured logs for compliance |
| **Alerting** | `BreakAlert` | Generate and acknowledge operational alerts |
| **Security** | `KeyControlLog` | Log secure key control operations |
| **Performance Export** | Derived views | Emit table activity metrics |
| **RatingSlip Integration** | Aggregated query | Provide table/settings snapshot |
| **MTL Hooks** | Event triggers | Publish transactional events for AML/CTR |

### Schema (Core Entities)

```sql
-- Canonical table registry
CREATE TABLE gamingtable (
  id UUID PRIMARY KEY,
  table_number TEXT NOT NULL,
  casino_id TEXT NOT NULL REFERENCES casino(id),
  pit TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Game configuration
CREATE TABLE gamingtablesettings (
  id UUID PRIMARY KEY,
  table_id UUID REFERENCES gamingtable(id),
  game_type TEXT NOT NULL,
  min_bet DECIMAL(10,2),
  max_bet DECIMAL(10,2),
  rotation_interval INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Dealer rotations
CREATE TABLE "DealerRotation" (
  id UUID PRIMARY KEY,
  table_id UUID REFERENCES gamingtable(id),
  dealer_id UUID REFERENCES "Staff"(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Inventory events
CREATE TABLE "FillSlip" (
  id UUID PRIMARY KEY,
  table_id UUID REFERENCES gamingtable(id),
  amount DECIMAL(12,2) NOT NULL,
  event_time TIMESTAMPTZ NOT NULL,
  staff_id UUID REFERENCES "Staff"(id)
);

CREATE TABLE "DropEvent" (
  id UUID PRIMARY KEY,
  table_id UUID REFERENCES gamingtable(id),
  amount DECIMAL(12,2) NOT NULL,
  event_time TIMESTAMPTZ NOT NULL,
  staff_id UUID REFERENCES "Staff"(id)
);

CREATE TABLE "ChipCountEvent" (
  id UUID PRIMARY KEY,
  table_id UUID REFERENCES gamingtable(id),
  chip_count DECIMAL(12,2) NOT NULL,
  discrepancy DECIMAL(12,2),
  event_time TIMESTAMPTZ NOT NULL,
  staff_id UUID REFERENCES "Staff"(id)
);

-- Operational alerts
CREATE TABLE "BreakAlert" (
  id UUID PRIMARY KEY,
  table_id UUID REFERENCES gamingtable(id),
  alert_type TEXT NOT NULL,
  threshold_minutes INTEGER,
  acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Security tracking
CREATE TABLE "KeyControlLog" (
  id UUID PRIMARY KEY,
  table_id UUID REFERENCES gamingtable(id),
  key_type TEXT NOT NULL,
  action TEXT NOT NULL, -- 'checkout', 'return'
  staff_id UUID REFERENCES "Staff"(id),
  event_time TIMESTAMPTZ NOT NULL
);
```

### Integration Boundaries

| Partner Context | Relationship | Data Flow | Description |
|-----------------|--------------|-----------|-------------|
| **Casino** | Referential | ←→ | Provides `casino_id` linkage for tables |
| **Staff** | Referential | ←→ | Dealer identity and authorization for rotations |
| **RatingSlip** | Upstream consumer | → | Consumes current table, dealer, and settings metadata |
| **MTL** | Downstream consumer | → | Consumes fill/drop/chip-count events |
| **Performance** | Downstream consumer | → | Receives table-level metrics, rotation durations, alert frequencies |
| **Audit/Compliance** | Observer | → | Receives KeyControlLog and operational events |

---

## RatingSlip Service (UPDATED) - Telemetry Context

### ✅ RatingSlipService (Gameplay Telemetry)

**OWNS:**
- `average_bet` - How much player wagered (INPUT for points)
- `start_time` / `end_time` - Duration of play (INPUT for points)
- `accumulated_seconds` - Time played (INPUT for points)
- `game_settings` - Game configuration (INPUT for points calculation)
- `seat_number` - Where player sat
- `status` - Rating slip lifecycle state

**STORES BUT DOESN'T OWN:**
- `points` - **Denormalized cache from Loyalty** (for query performance)
- Source of truth: `loyalty_ledger.points_earned`

**BOUNDED CONTEXT**: "What gameplay activity occurred?"

**Key Change**: RatingSlip.points becomes a **read-optimized cache**, NOT the source of truth.

---

## Integration Pattern: Client Orchestration

### Workflow: Complete Rating Slip with Points

```typescript
// Server Action: app/actions/ratingslip-actions.ts
export async function completeRatingSlip(id: string): Promise<ServiceResult<CompletionResult>> {
  return withServerAction('complete_rating_slip', async (supabase) => {

    // 1. End rating slip session (RatingSlip service)
    const ratingSlip = await ratingSlipService.endSession(id);

    if (!ratingSlip.success) {
      return ratingSlip; // Propagate error
    }

    // 2. Calculate and assign points (Loyalty service)
    const loyaltyResult = await loyaltyService.calculateAndAssignPoints({
      ratingSlipId: id,
      playerId: ratingSlip.data.playerId,
      visitId: ratingSlip.data.visit_id,

      // Telemetry inputs (from RatingSlip)
      averageBet: ratingSlip.data.average_bet,
      durationSeconds: ratingSlip.data.accumulated_seconds,
      gameSettings: ratingSlip.data.game_settings,
    });

    if (!loyaltyResult.success) {
      return loyaltyResult; // Propagate error
    }

    // 3. Update RatingSlip with calculated points (denormalized cache)
    await ratingSlipService.update(id, {
      points: loyaltyResult.data.pointsEarned
    });

    // 4. Invalidate React Query caches
    // (handled by withServerAction telemetry)

    return {
      success: true,
      data: {
        ratingSlip: ratingSlip.data,
        loyalty: loyaltyResult.data,
      }
    };
  });
}
```

### Key Principles

1. **Client orchestrates** - Server action coordinates both services
2. **Loyalty owns calculation** - Business logic in Loyalty.calculatePoints()
3. **RatingSlip caches result** - points field for fast queries
4. **LoyaltyLedger is source of truth** - Audit trail preserved

---

## Loyalty Service Implementation

### Service Structure (Following SERVICE_TEMPLATE.md)

```
services/loyalty/
├── index.ts           # Factory + interface
├── crud.ts            # CRUD for ledger, player_loyalty
├── business.ts        # ⭐ calculatePoints() logic ⭐
├── queries.ts         # getBalance(), getTier(), getHistory()
├── models.ts          # LoyaltyLedger, PlayerLoyalty types
└── translation/
    └── telemetry-mapper.ts  # Map RatingSlip → Loyalty input DTO
```

### Core Business Logic

```typescript
// services/loyalty/business.ts

interface PointsInput {
  averageBet: number;
  durationSeconds: number;
  gameSettings: GameSettings;
  playerTier?: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
}

/**
 * Calculate points from gameplay telemetry.
 * This is the SINGLE SOURCE OF TRUTH for point calculation policy.
 */
export function calculatePoints(input: PointsInput): number {
  const {
    averageBet,
    durationSeconds,
    gameSettings,
    playerTier = 'BRONZE'
  } = input;

  // 1. Calculate rounds played
  const durationHours = durationSeconds / 3600;
  const totalRounds = Math.round(
    durationHours * gameSettings.average_rounds_per_hour
  );

  // 2. Calculate theoretical win (house edge)
  const theoreticalWin = (averageBet * gameSettings.house_edge / 100) * totalRounds;

  // 3. Apply conversion rate and multipliers
  const conversionRate = gameSettings.points_conversion_rate ?? 10.0;
  const gameMultiplier = gameSettings.point_multiplier ?? 1.0;

  let pointsEarned = theoreticalWin * conversionRate * gameMultiplier;

  // 4. Apply tier multiplier
  const tierMultipliers = {
    BRONZE: 1.0,
    SILVER: 1.25,
    GOLD: 1.5,
    PLATINUM: 2.0
  };
  pointsEarned *= tierMultipliers[playerTier];

  // 5. Apply seat bonus (empty seats)
  const currentSeats = gameSettings.seats_available ?? 7;
  if (currentSeats < 7) {
    const emptySeats = 7 - currentSeats;
    const bonusFactor = 1 + (emptySeats * 0.05);
    pointsEarned *= bonusFactor;
  }

  // 6. Apply high-activity bonus
  const expectedRounds = gameSettings.average_rounds_per_hour;
  if (totalRounds > expectedRounds) {
    pointsEarned *= 1.1; // 10% bonus
  }

  return Math.round(pointsEarned);
}

/**
 * Calculate and assign points, updating all necessary tables.
 */
export async function calculateAndAssignPoints(
  supabase: SupabaseClient<Database>,
  input: {
    ratingSlipId: string;
    playerId: string;
    visitId: string | null;
    averageBet: number;
    durationSeconds: number;
    gameSettings: GameSettings;
  }
): Promise<ServiceResult<{
  pointsEarned: number;
  newBalance: number;
  tier: string;
}>> {
  return executeOperation('loyalty_assign_points', async () => {

    // 1. Get player's current tier
    const playerLoyalty = await getPlayerLoyalty(supabase, input.playerId);

    // 2. Calculate points using policy engine
    const pointsEarned = calculatePoints({
      averageBet: input.averageBet,
      durationSeconds: input.durationSeconds,
      gameSettings: input.gameSettings,
      playerTier: playerLoyalty?.tier ?? 'BRONZE'
    });

    // 3. Record in loyalty ledger (source of truth)
    await insertLedgerEntry(supabase, {
      player_id: input.playerId,
      rating_slip_id: input.ratingSlipId,
      visit_id: input.visitId,
      points_earned: pointsEarned,
      transaction_type: 'GAMEPLAY',
      average_bet: input.averageBet,
      duration_seconds: input.durationSeconds,
      game_type: input.gameSettings.name
    });

    // 4. Update player loyalty balance
    const newBalance = await updatePlayerBalance(
      supabase,
      input.playerId,
      pointsEarned
    );

    // 5. Check for tier progression
    const tier = await checkTierProgression(supabase, input.playerId, newBalance);

    return {
      success: true,
      data: {
        pointsEarned,
        newBalance,
        tier
      }
    };
  });
}
```

---

## Data Flow: RatingSlip Completion with Loyalty

```
┌──────────────────────────────────────────────────────────────────┐
│ User Action: Complete Rating Slip                                │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │ Server Action               │
         │ completeRatingSlip(id)      │
         └──────────┬──────────────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
         ▼                     ▼
┌─────────────────┐   ┌────────────────────┐
│ RatingSlipSvc   │   │   (blocked until   │
│ .endSession()   │   │    step 1 done)    │
│                 │   │                    │
│ Returns:        │   │                    │
│ • average_bet   │───┤                    │
│ • duration      │   │                    │
│ • game_settings │   │                    │
│ • player_id     │   │                    │
└─────────────────┘   │                    │
                      ▼                    │
         ┌────────────────────────┐        │
         │ LoyaltyService         │        │
         │ .calculateAndAssign()  │        │
         │                        │        │
         │ 1. Get player tier     │        │
         │ 2. calculatePoints()   │◀───────┘
         │ 3. Insert ledger       │
         │ 4. Update balance      │
         │ 5. Check tier progress │
         │                        │
         │ Returns:               │
         │ • pointsEarned         │
         └────────────┬───────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │ RatingSlipService      │
         │ .update(id, {          │
         │   points: calculated   │ ← Denormalized cache
         │ })                     │
         └────────────────────────┘
```

---

## Migration Path for Phase 6

### Option A: Expand Phase 6 (Recommended)

**New Phase 6 Scope**: Loyalty + RatingSlip + MTL

**Track 0: Loyalty Service (HORIZONTAL prerequisite)**
- Wave 0: Loyalty service implementation (6-8 hours)
  - Schema migrations
  - CRUD + business logic
  - calculatePoints() implementation
  - Server actions + hooks
  - Unit tests (>80% coverage)

**Track A: RatingSlip (VERTICAL with Loyalty)**
- Wave 1A: RatingSlip service extensions (1h)
- Wave 2A: RatingSlip actions + Loyalty integration (2.5h)
- Wave 3A: RatingSlip hooks + modal integration (2h)
- Wave 4A: E2E tests including point calculation (2.5h)

**Track B: MTL (VERTICAL independent)**
- Wave 1B: MTL actions (2h)
- Wave 2B: MTL hooks (2h)
- Wave 3B: MTL UI (4h)
- Wave 4B: Integration tests (2h)

**Estimated Total**: 24-26 hours (was 13h)
**Parallel Execution**: ~16-18 hours wall-clock

---

### Option B: Phase 5.5 Loyalty (Alternative)

**Insert new phase before Phase 6**:

**Phase 5.5: Loyalty Service** (8 hours)
- Standalone Loyalty implementation
- RatingSlip integration hooks
- Testing with mock data

**Phase 6: RatingSlip + MTL** (13 hours, unchanged)
- Proceeds as originally planned

**Total**: 21 hours (8h + 13h)

---

## Recommendation

**Choose Option A: Expand Phase 6**

**Rationale**:
1. ✅ Maintains logical grouping (Loyalty + RatingSlip are tightly coupled)
2. ✅ Enables parallel execution (Loyalty + MTL can run simultaneously)
3. ✅ Single integration validation wave at end
4. ✅ Cleaner for roadmap (no fractional phases)
5. ✅ Testing more comprehensive (end-to-end with real points)

---

## Updated Bounded Context Validation Checklist

Before adding ANY field or logic to a service, verify:

- [ ] **Single Responsibility**: Does this belong to this domain's core responsibility?
- [ ] **Ownership**: Is this service the source of truth for this data/logic?
- [ ] **Policy vs Measurement**: Is this describing "what happened" or "what it's worth"?
- [ ] **Dependencies**: Does this create coupling with another domain?

**Example: Point Calculation**:
```
Logic: calculatePoints(averageBet, duration, gameSettings)
Service: RatingSlipService?
Checklist:
- [ ] Single Responsibility? NO (RatingSlip = measurement, not valuation)
- [ ] Ownership? NO (Loyalty owns reward policy)
- [ ] Policy vs Measurement? POLICY (not measurement)
- [ ] Dependencies? YES (couples telemetry with reward rules)

Decision: ❌ Reject - belongs in LoyaltyService.business.ts
```

---

## Anti-Patterns to Avoid

### ❌ Point Calculation in RatingSlip

```typescript
// BAD: RatingSlip calculating its own points
class RatingSlipService {
  async endSession(id: string) {
    const slip = await this.getById(id);

    // ❌ Business policy in telemetry service
    const points = calculatePoints(
      slip.average_bet,
      slip.accumulated_seconds,
      slip.game_settings
    );

    return this.update(id, { points });
  }
}
```

### ✅ Correct: Client Orchestration

```typescript
// GOOD: Client orchestrates, Loyalty calculates
async function completeRatingSlip(id: string) {
  // 1. RatingSlip ends session (measurement)
  const ratingSlip = await ratingSlipService.endSession(id);

  // 2. Loyalty calculates points (policy)
  const loyalty = await loyaltyService.calculateAndAssignPoints({
    ratingSlipId: id,
    telemetry: ratingSlip.data
  });

  // 3. Cache result in RatingSlip (optimization)
  await ratingSlipService.update(id, {
    points: loyalty.data.pointsEarned
  });

  return { ratingSlip, loyalty };
}
```

---

## References

- [CASINO_SERVICE_RESPONSIBILITY.MD](./CASINO_SERVICE_RESPONSIBILITY.MD) - Casino bounded context specification
- [TABLE_CONTEXT_SERVICE_RESPONSIBILITY_MATRIX.md](./TABLE_CONTEXT_SERVICE_RESPONSIBILITY_MATRIX.md) - TableContext bounded context specification
- [LOYALTY_SERVICE_HANDOFF.md](../../docs/LOYALTY_SERVICE_HANDOFF.md) - Conceptual design
- [POINTS_CALCULATION_DEPENDENCY_ANALYSIS.md](../../docs/architecture/POINTS_CALCULATION_DEPENDENCY_ANALYSIS.md) - Technical validation
- [SERVICE_TEMPLATE.md](./SERVICE_TEMPLATE.md) - Implementation pattern
- [Phase 6 Detailed Workflow](../../docs/phase-6/PHASE_6_DETAILED_WORKFLOW.md) - Execution plan

---

**Document Version**: 2.3.0
**Created**: 2025-10-12
**Last Updated**: 2025-10-19 (Added Casino and TableContext Services)
**Status**: Architecture Decision - Ready for Implementation
**Next Action**: Complete bounded context map with all foundational, operational, reward, and compliance services
