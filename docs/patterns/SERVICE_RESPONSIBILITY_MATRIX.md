# Service Responsibility Matrix - Bounded Context Integrity

> **Version**: 2.1.0 (with Loyalty & MTL Contexts)
> **Date**: 2025-10-14
> **Status**: CANONICAL - Phase 6+ Architecture with Loyalty & MTL Services
> **Previous Versions**:
> - [v2.0.0 Loyalty (2025-10-12)](../../archive/SERVICE_RESPONSIBILITY_MATRIX_v2.0_loyalty_2025-10-12.md)
> - [v1.0 Pre-Loyalty (2025-10-06)](../../archive/SERVICE_RESPONSIBILITY_MATRIX_v1.0_pre-loyalty_2025-10-06.md)
> **Purpose**: Maintain bounded context integrity across all service domains

---

## Version History

| Version | Date | Changes | Rationale |
|---------|------|---------|-----------|
| **2.1.0** | 2025-10-14 | Added MTL (Compliance) service bounded context, enhanced cross-domain correlation with rating_slip_id/visit_id, added audit note immutability pattern | Phase 6+ requires AML/CTR compliance tracking with contextual enrichment from Loyalty and RatingSlip domains |
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
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐               │
│  │   IDENTITY   │     │   LOCATION   │     │   FINANCE    │               │
│  │   CONTEXT    │     │   CONTEXT    │     │   CONTEXT    │               │
│  │              │     │              │     │              │               │
│  │   Player     │────▶│   Casino     │     │   Player     │               │
│  │   Service    │     │   Service    │     │   Financial  │               │
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
│  │  │              │        │ (Telemetry)  │     │               │        │
│  │  └──────────────┘        └──────────────┘     │               │        │
│  │                                                │               │        │
│  └────────────────────────────────────────────────┼───────────────┘        │
│                                                   │                        │
│         ┌─────────────────────────────────────────┘                        │
│         │ Emits: RatingSlipCompletedEvent                                  │
│         │ (telemetry data: avgBet, duration, gameSettings)                 │
│         ▼                                                                  │
│  ┌──────────────┐                    ┌─────────────────┐                  │
│  │   REWARD     │                    │   COMPLIANCE    │                  │
│  │   CONTEXT    │                    │    CONTEXT      │                  │
│  │              │  ◀────┐            │                 │                  │
│  │   Loyalty    │       │            │      MTL        │                  │
│  │   Service    │       └────────────│    Service      │                  │
│  │              │  Read-only         │                 │                  │
│  └──────┬───────┘  correlation       └────────┬────────┘                  │
│         │          (contextual               │                            │
│         │           enrichment)              │                            │
│         │                                    │                            │
│         │  • Interprets telemetry           │  • Cash transaction log    │
│         │  • Applies reward policy          │  • Gaming day calculation  │
│         │  • Calculates points              │  • Threshold detection     │
│         │  • Stores in LoyaltyLedger        │  • AML/CTR compliance      │
│         │  • Updates tier progression       │  • Immutable audit trail   │
│         │                                    │                            │
│         └──────────▶ Updates RatingSlip.points (denormalized cache)       │
│                                                                            │
│         Both services read from Session/Telemetry context (read-only)     │
│         MTL reads from Loyalty for contextual enrichment (compliance only) │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Updated Service Responsibility Matrix

| Domain | Service | Owns | References | Aggregates | Responsibilities |
|--------|---------|------|------------|------------|------------------|
| **Identity** | `PlayerService` | • Player profile<br>• Contact info<br>• Identity data | – | • Visits<br>• RatingSlips<br>• Loyalty | Identity management |
| **Location** | `CasinoService` | • Casino details<br>• Tables<br>• Game configs<br>• **Casino settings**<br>• Gaming day config | – | • Visits<br>• RatingSlips<br>• MTL entries | Venue management & configuration |
| **Session** | `VisitService` | • Visit sessions<br>• Check-in/out<br>• Visit status | • Player (FK)<br>• Casino (FK) | • RatingSlips<br>• Financials<br>• MTL entries | Session lifecycle |
| **Telemetry** | `RatingSlipService` | • Average bet<br>• Time played<br>• Game settings<br>• Seat number<br>• **points** (cache) | • Player (FK)<br>• Visit (FK)<br>• Gaming Table (FK) | – | **Gameplay measurement** |
| **Reward** 🆕 | `LoyaltyService` | • **Points calculation logic**<br>• Loyalty ledger<br>• Tier status<br>• Tier rules<br>• Preferences | • Player (FK)<br>• RatingSlip (FK)<br>• Visit (FK) | • Points history<br>• Tier progression | **Reward policy & assignment** |
| **Finance** | `PlayerFinancialService` | • Cash in/out<br>• Chips tracking<br>• Reconciliation | • Player (FK)<br>• Visit (FK)<br>• RatingSlip (FK) | – | Financial tracking |
| **Compliance** 🆕 | `MTLService` | • **Cash transaction log**<br>• MTL entries (immutable)<br>• Audit notes<br>• Gaming day calculation<br>• Threshold detection<br>• Compliance exports | • Player (FK, optional)<br>• Casino (FK)<br>• Staff (FK)<br>• RatingSlip (FK, optional)<br>• Visit (FK, optional) | • Daily aggregates<br>• Threshold monitoring<br>• CTR/Watchlist detection | **AML/CTR compliance tracking** |

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

- [LOYALTY_SERVICE_HANDOFF.md](../../docs/LOYALTY_SERVICE_HANDOFF.md) - Conceptual design
- [POINTS_CALCULATION_DEPENDENCY_ANALYSIS.md](../../docs/architecture/POINTS_CALCULATION_DEPENDENCY_ANALYSIS.md) - Technical validation
- [SERVICE_TEMPLATE.md](./SERVICE_TEMPLATE.md) - Implementation pattern
- [Phase 6 Detailed Workflow](../../docs/phase-6/PHASE_6_DETAILED_WORKFLOW.md) - Execution plan

---

**Document Version**: 1.0.0
**Created**: 2025-10-12
**Status**: Architecture Decision - Ready for Implementation
**Next Action**: Update Phase 6 workflow to include Loyalty service as Wave 0
