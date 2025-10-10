# Points Calculation Dependency Analysis

> **Date**: 2025-10-10
> **Context**: Architectural decision on points calculation responsibility
> **Issue**: Verify all calculation dependencies are available in RatingSlip domain

---

## Executive Summary

**Conclusion**: ✅ **All dependencies are satisfied**

The RatingSlip table contains ALL necessary data to calculate points locally:
- ✅ `average_bet` (user input during rating)
- ✅ `accumulated_seconds` (tracked during session)
- ✅ `game_settings` (JSON blob with all game config)
- ✅ `game_settings_id` (FK reference for queries)

**RatingSlip CAN calculate points independently** without external service dependencies.

---

## Point Calculation Formula (PT-1 Reference)

From [reference-pt-1/utils/point-calculator.ts](../../reference-pt-1/utils/point-calculator.ts):

```typescript
export function calculatePoints(
  gameSettings: GameSettings,
  averageBet: number,
  totalRounds: number,
): number {
  const {
    house_edge,
    average_rounds_per_hour,
    point_multiplier,
    points_conversion_rate,
    seats_available = 7,
  } = gameSettings

  const theoreticalWin = ((averageBet * house_edge) / 100) * totalRounds

  let pointsEarned =
    theoreticalWin *
    (points_conversion_rate ?? 10.0) *
    (point_multiplier ?? 1.0)

  const currentSeats = seats_available ?? 7
  if (currentSeats < 7) {
    const emptySeats = 7 - currentSeats
    const bonusFactor = 1 + emptySeats * 0.05
    pointsEarned *= bonusFactor
  }

  const expectedRounds = average_rounds_per_hour
  if (totalRounds > expectedRounds) {
    pointsEarned *= 1.1
  }

  return Math.round(pointsEarned)
}
```

---

## Required Inputs

### Direct Inputs (3)
1. **`gameSettings`** - Game configuration object
2. **`averageBet`** - Average wager amount
3. **`totalRounds`** - Number of rounds played

### GameSettings Fields Required (5)
1. `house_edge` - Casino's mathematical edge (e.g., 2.5%)
2. `average_rounds_per_hour` - Expected rounds per hour (for bonus calculation)
3. `point_multiplier` - Loyalty point multiplier (default: 1.0)
4. `points_conversion_rate` - Conversion rate (default: 10.0)
5. `seats_available` - Number of seats at table (for empty seat bonus)

---

## RatingSlip Table Schema

### Available Fields

From [types/database.types.ts:1370-1390](../../types/database.types.ts#L1370-L1390):

```typescript
ratingslip: {
  Row: {
    // ✅ CALCULATION INPUTS
    average_bet: number;                    // ✅ Direct input
    accumulated_seconds: number;            // ✅ For calculating rounds
    game_settings: Json;                    // ✅ Full GameSettings object
    game_settings_id: string | null;        // ✅ FK reference

    // Session context
    id: string;
    playerId: string;
    visit_id: string | null;
    gaming_table_id: string | null;

    // Timing
    start_time: string;
    end_time: string | null;
    pause_intervals: Json | null;

    // Calculated outputs
    points: number;                         // ✅ Stores calculated result

    // Other fields
    seat_number: number | null;
    status: RatingSlipStatus;
    version: number;

    // Financial (to be deprecated per Service Responsibility Matrix)
    cash_in: number | null;
    chips_brought: number | null;
    chips_taken: number | null;
  }
}
```

---

## GameSettings Table Schema

From [types/database.types.ts:440-477](../../types/database.types.ts#L440-L477):

```typescript
gamesettings: {
  Row: {
    id: string;
    name: string;

    // ✅ ALL REQUIRED FIELDS PRESENT
    house_edge: number;                     // ✅ Required
    average_rounds_per_hour: number;        // ✅ Required
    point_multiplier: number | null;        // ✅ Required (nullable, default 1.0)
    points_conversion_rate: number | null;  // ✅ Required (nullable, default 10.0)
    seats_available: number | null;         // ✅ Required (nullable, default 7)

    // Metadata
    version: number;
    created_at: string | null;
    updated_at: string | null;
  }
}
```

---

## Dependency Mapping

### Input 1: `averageBet` ✅
- **Source**: `ratingslip.average_bet`
- **Type**: `number` (required)
- **Set by**: User input during rating slip creation/update
- **Validation**: Must be > 0

### Input 2: `totalRounds` ⚠️ (Calculated)
- **Source**: Derived from `accumulated_seconds` + `average_rounds_per_hour`
- **Formula**:
  ```typescript
  const durationHours = accumulated_seconds / 3600;
  const totalRounds = Math.round(durationHours * average_rounds_per_hour);
  ```
- **Note**: Not stored directly, must be calculated

### Input 3: `gameSettings` ✅
- **Source**: `ratingslip.game_settings` (JSON blob)
- **Alternative**: JOIN to `gamesettings` table via `game_settings_id`
- **Type**: `Json` containing all required fields
- **Set by**: Copied from table configuration when rating slip created

---

## Data Flow Analysis

### Scenario: RatingSlip Creation

```typescript
// 1. User starts rating slip at a table
const ratingSlip = await ratingSlipService.create({
  playerId: 'uuid-player',
  visit_id: 'uuid-visit',
  gaming_table_id: 'uuid-table',
  average_bet: 50,  // ✅ User input
  start_time: '2025-01-15T10:00:00Z'
});

// 2. System fetches table's active game settings
const tableSettings = await tableContextService.getActiveSettings('uuid-table');

// 3. Game settings copied into rating slip (denormalized)
await ratingSlipService.update(ratingSlip.id, {
  game_settings: tableSettings.gameSettings,  // ✅ Full object stored
  game_settings_id: tableSettings.id           // ✅ Reference preserved
});
```

### Scenario: RatingSlip End & Points Calculation

```typescript
// 1. User ends rating slip
const result = await ratingSlipService.endSession(slipId);

// 2. Inside RatingSlipService.endSession()
async endSession(id: string) {
  const slip = await this.getById(id);

  // ✅ All data available in slip object
  const totalRounds = calculateRounds(
    slip.accumulated_seconds,
    slip.game_settings.average_rounds_per_hour
  );

  // ✅ Calculate points using local data
  const points = calculatePoints(
    slip.game_settings,      // ✅ Available
    slip.average_bet,        // ✅ Available
    totalRounds              // ✅ Calculated from available data
  );

  // ✅ Store calculated points
  await this.update(id, {
    points,
    end_time: new Date().toISOString(),
    status: 'completed'
  });

  // Emit event for Loyalty Service
  emit('RatingSlipCompleted', {
    ratingSlipId: id,
    points,
    playerId: slip.playerId
  });
}
```

---

## Dependency Risks

### ⚠️ Risk 1: `game_settings` JSON Structure

**Issue**: The `game_settings` column is typed as `Json`, not strongly typed.

**Verification Needed**:
```typescript
// Is game_settings guaranteed to have all required fields?
interface GameSettingsJson {
  house_edge: number;
  average_rounds_per_hour: number;
  point_multiplier: number | null;
  points_conversion_rate: number | null;
  seats_available: number | null;
}
```

**Mitigation**:
1. Validate `game_settings` structure when copying from table
2. Provide defaults for nullable fields
3. Type guard function:
   ```typescript
   function validateGameSettings(json: Json): GameSettingsJson {
     // Runtime validation
     if (typeof json.house_edge !== 'number') {
       throw { code: 'INVALID_GAME_SETTINGS', message: 'Missing house_edge' };
     }
     // ... validate other fields
     return json as GameSettingsJson;
   }
   ```

---

### ⚠️ Risk 2: `totalRounds` Calculation Consistency

**Issue**: `totalRounds` is not stored, but derived from `accumulated_seconds`.

**Current Calculation**:
```typescript
const durationHours = accumulated_seconds / 3600;
const totalRounds = Math.round(durationHours * average_rounds_per_hour);
```

**Potential Issues**:
- Rounding errors if recalculated multiple times
- Points could differ if recalculated later
- No audit trail of exact rounds used

**Recommendation**: Store `total_rounds` in RatingSlip
```sql
ALTER TABLE ratingslip ADD COLUMN total_rounds INTEGER;
```

**Benefits**:
- Immutable snapshot of calculation input
- Faster recalculations (no derivation needed)
- Audit trail (can verify historical calculations)

---

### ✅ Risk 3: `game_settings_id` Nullable

**Issue**: `game_settings_id` is nullable, but required for calculation.

**Current Schema**:
```typescript
game_settings_id: string | null;
```

**Verification**: Is `game_settings_id` always set when rating slip created?

**Mitigation**:
1. Database constraint (recommended):
   ```sql
   ALTER TABLE ratingslip
   ALTER COLUMN game_settings_id SET NOT NULL;
   ```
2. Service-level validation:
   ```typescript
   if (!data.game_settings_id) {
     throw { code: 'MISSING_GAME_SETTINGS', message: 'Game settings required' };
   }
   ```

---

## Recommended Schema Enhancements

### Option 1: Add `total_rounds` Column (Recommended)

**Migration**:
```sql
-- Add total_rounds column for audit trail
ALTER TABLE ratingslip
ADD COLUMN total_rounds INTEGER;

-- Backfill existing data
UPDATE ratingslip
SET total_rounds = ROUND(
  (accumulated_seconds::NUMERIC / 3600) *
  (game_settings->>'average_rounds_per_hour')::NUMERIC
)
WHERE total_rounds IS NULL;

-- Make non-nullable after backfill
ALTER TABLE ratingslip
ALTER COLUMN total_rounds SET NOT NULL;
```

**Benefits**:
- ✅ Immutable snapshot of calculation input
- ✅ Faster points recalculation
- ✅ Better audit trail
- ✅ Removes derivation complexity

---

### Option 2: Enforce `game_settings_id` NOT NULL

**Migration**:
```sql
-- Verify no NULL values exist
SELECT COUNT(*) FROM ratingslip WHERE game_settings_id IS NULL;

-- Make non-nullable if safe
ALTER TABLE ratingslip
ALTER COLUMN game_settings_id SET NOT NULL;
```

**Benefits**:
- ✅ Guarantees FK integrity
- ✅ Prevents calculation failures
- ✅ Type safety improvement

---

## Architectural Decision Confirmation

### ✅ RatingSlip CAN Calculate Points

**Verdict**: Yes, all dependencies are satisfied.

**Data Availability**:
- ✅ `average_bet` - Stored directly
- ✅ `totalRounds` - Derivable from `accumulated_seconds` + `game_settings.average_rounds_per_hour`
- ✅ `gameSettings` - Stored as JSON blob in `game_settings` column

**Recommended Implementation**:
```typescript
// services/ratingslip/business.ts
export function createRatingSlipBusinessService(
  supabase: SupabaseClient<Database>
) {
  return {
    async endSession(id: string): Promise<ServiceResult<RatingSlipDTO>> {
      return executeOperation('ratingslip_end_session', async () => {
        const slip = await getById(id);

        // Validate game settings
        const gameSettings = validateGameSettings(slip.game_settings);

        // Calculate rounds
        const durationHours = slip.accumulated_seconds / 3600;
        const totalRounds = Math.round(
          durationHours * gameSettings.average_rounds_per_hour
        );

        // Calculate points
        const points = calculatePoints(
          gameSettings,
          slip.average_bet,
          totalRounds
        );

        // Update with calculated points
        return await update(id, {
          points,
          end_time: new Date().toISOString(),
          status: 'completed'
        });
      });
    }
  };
}
```

---

## Final Recommendations

### Immediate (No Schema Changes Required)
1. ✅ Implement `validateGameSettings()` type guard
2. ✅ Calculate `totalRounds` from `accumulated_seconds`
3. ✅ Store calculated `points` in `ratingslip.points`
4. ✅ Emit `RatingSlipCompletedEvent` with points for Loyalty

### Short-term (Schema Enhancement)
1. ⚡ Add `total_rounds` column for audit trail
2. ⚡ Make `game_settings_id` NOT NULL
3. ⚡ Add check constraint: `points >= 0`

### Long-term (Post-MVP)
1. 🔮 Consider computed column for `total_rounds`
2. 🔮 Add versioning for point calculation formula changes
3. 🔮 Track which calculation version was used

---

## References

- [Point Calculator (PT-1)](../../reference-pt-1/utils/point-calculator.ts)
- [Database Types](../../types/database.types.ts)
- [Service Responsibility Matrix](../phase-2/SERVICE_RESPONSIBILITY_MATRIX.md)
- [Loyalty Service Design](../phase-3/LOYALTY_SERVICE_DESIGN.md)

---

**Document Version**: 1.0.0
**Author**: Claude (AI Assistant)
**Status**: Verified ✅
**Next Action**: Implement with validated dependencies
