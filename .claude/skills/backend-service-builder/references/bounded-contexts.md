# Bounded Context Rules

**Source**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` (SLAD v2.1.2)
**Registry**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (SRM - bounded context registry only)

> **Note**: SLAD is the authoritative source for service architecture patterns and implementation.
> SRM serves as the bounded context registry (table ownership, cross-service dependencies).

## Core Principle

**Each service owns specific tables and exposes DTOs. Services CANNOT directly access tables owned by other services.**

---

## Table Ownership (SRM Registry)

| Service           | Owned Tables                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **casino**        | `casino`, `casino_settings`, `company`, `staff`, `game_settings`, `audit_log`, `report`                                                  |
| **player**        | `player`, `player_casino`                                                                                                                |
| **visit**         | `visit`                                                                                                                                  |
| **loyalty**       | `player_loyalty`, `loyalty_ledger`, `loyalty_outbox`                                                                                     |
| **rating-slip**   | `rating_slip`                                                                                                                            |
| **finance**       | `player_financial_transaction`, `finance_outbox`                                                                                         |
| **mtl**           | `mtl_entry`, `mtl_audit_note`                                                                                                            |
| **table-context** | `gaming_table`, `gaming_table_settings`, `dealer_rotation`, `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_drop_event` |
| **floor-layout**  | `floor_layout`, `floor_layout_version`, `floor_pit`, `floor_table_slot`, `floor_layout_activation`                                       |

---

## Cross-Context Consumption Rules

### ❌ VIOLATION: Direct Table Access

```typescript
// services/loyalty/telemetry.ts
import type { Database } from "@/types/database.types";

// ❌ FORBIDDEN: Loyalty accessing rating_slip table directly
type RatingSlipRow = Database["public"]["Tables"]["rating_slip"]["Row"];
//                                                  ^^^^^^^^^^^
// ERROR: Service "loyalty" does not own table "rating_slip"
```

**Why forbidden?**

- Violates bounded context boundaries
- Creates tight coupling between services
- Breaks when rating-slip service changes schema

---

### ✅ CORRECT: Published DTO Consumption

```typescript
// Step 1: Rating-slip service publishes DTO
// services/rating-slip/dtos.ts
export interface RatingSlipTelemetryDTO {
  id: string;
  player_id: string;
  casino_id: string;
  average_bet: number | null;
  duration_seconds: number;
  game_type: "blackjack" | "poker" | "roulette" | "baccarat";
}

// Step 2: Loyalty service consumes DTO
// services/loyalty/mid-session-reward.ts
import type { RatingSlipTelemetryDTO } from "@/services/rating-slip/dtos";

function calculateReward(telemetry: RatingSlipTelemetryDTO): number {
  // ✅ Uses published contract, not raw database row
  return telemetry.average_bet * telemetry.duration_seconds * 0.01;
}
```

**Benefits**:

- Rating-slip controls what data is exposed
- Schema changes don't break consumers (DTO contract stable)
- Clear service boundaries

---

## DTO Publishing Pattern

### Owning Service Responsibility

```typescript
// services/{owner}/dtos.ts
/**
 * Public DTO - Consumed by other services
 *
 * Consumers: loyalty, finance
 * Stability: STABLE (breaking changes require migration plan)
 */
export interface RatingSlipTelemetryDTO {
  // Only expose fields needed by consumers
  id: string;
  player_id: string;
  average_bet: number | null;
  duration_seconds: number;
  // NOT exposed: internal_notes, risk_flags, etc.
}
```

### Consuming Service Responsibility

```typescript
// services/{consumer}/feature.ts
import type { RatingSlipTelemetryDTO } from "@/services/rating-slip/dtos";

// ✅ CORRECT: Use imported DTO type
function processRatingSlip(data: RatingSlipTelemetryDTO) {
  // Implementation
}

// ❌ WRONG: Re-define or access Database type
type LocalRatingSlip = Database["public"]["Tables"]["rating_slip"]["Row"];
```

---

## Service Dependencies (SRM Reference)

### Loyalty Service Dependencies

**Owns**: `player_loyalty`, `loyalty_ledger`, `loyalty_outbox`

**Consumes**:

- Player service → `PlayerDTO`
- Rating-slip service → `RatingSlipTelemetryDTO`
- Visit service → `VisitDTO`

**Publishes**:

- `PlayerLoyaltyDTO` (balance, tier)
- `LoyaltyLedgerDTO` (transaction history)

---

### Rating-Slip Service Dependencies

**Owns**: `rating_slip`

**Consumes**:

- Player service → `PlayerDTO`
- Visit service → `VisitDTO`
- Table-context service → `GamingTableDTO`

**Publishes**:

- `RatingSlipTelemetryDTO` (consumed by Loyalty, Finance)
- `RatingSlipDTO` (full details for UI)

---

## Cross-Context RPC Calls

**Pattern**: Services can call RPCs owned by other services

```typescript
// services/loyalty/mid-session-reward.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export async function rewardPlayer(
  supabase: SupabaseClient<Database>,
  input: MidSessionRewardInput,
) {
  // ✅ ALLOWED: Call RPC owned by loyalty service
  const { data, error } = await supabase.rpc("issue_mid_session_reward", {
    p_casino_id: input.casinoId,
    p_player_id: input.playerId,
    p_points: input.points,
  });

  if (error) {
    return { success: false, error };
  }

  return { success: true, data };
}
```

**RPC Ownership**: Documented in SRM alongside table ownership

---

## Enforcement

### ESLint Rule: Cross-Context DB Imports

**File**: `.eslint-rules/no-cross-context-db-imports.js`

**Detects**:

```typescript
// ❌ Will error during build
const row = Database["public"]["Tables"]["foreign_table"]["Row"];
//                                      ^^^^^^^^^^^^^^
// ERROR: Service does not own this table per SRM
```

**Fix**:

```typescript
// ✅ Import published DTO instead
import type { ForeignTableDTO } from "@/services/owner/dtos";
```

---

## Common Violations

### Violation 1: Convenience Shortcuts

```typescript
// ❌ TEMPTATION: "I just need one field from rating_slip"
type QuickAccess = Database["public"]["Tables"]["rating_slip"]["Row"];
const avgBet = data.average_bet;

// ✅ CORRECT: Use published DTO
import type { RatingSlipTelemetryDTO } from "@/services/rating-slip/dtos";
const avgBet = (data as RatingSlipTelemetryDTO).average_bet;
```

### Violation 2: Join Query Access

```typescript
// ❌ WRONG: Join accesses foreign table directly
const { data } = await supabase
  .from("player_loyalty")
  .select("*, rating_slip(*)") // ❌ Direct foreign table access
  .eq("player_id", playerId);

// ✅ CORRECT: Fetch via separate service call
const loyalty = await getLoyaltyData(playerId);
const ratingSlip = await getRatingSlipData(loyalty.rating_slip_id);
```

---

## Documentation Requirements

Every service README.md MUST document:

```markdown
## Bounded Context

**Owned Tables**: `table1`, `table2`

**Published DTOs**:

- `ServiceDTO` - Public interface for X
- `ServiceDetailDTO` - Detailed view for Y

**Dependencies**:

- **Consumes**: Player service (`PlayerDTO`), Visit service (`VisitDTO`)
- **Consumed By**: Loyalty service, Finance service

**SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §X-Y](...)
```

---

## Reference

- **SLAD (Source of Truth)**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` v2.1.2
- **SRM (Bounded Context Registry)**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **DTO Standards**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md` (cross-context rules)
- **ESLint Rule**: `.eslint-rules/no-cross-context-db-imports.js`
- **Service Template**: `docs/70-governance/SERVICE_TEMPLATE.md`
- **Full Documentation Repository**: `SDLC_DOCS_TAXONOMY.md`
