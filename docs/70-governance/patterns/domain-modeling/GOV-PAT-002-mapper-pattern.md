# GOV-PAT-002: Mapper Pattern

**Status**: Active
**Version**: 1.0
**Applies to**: All services with cross-context DTO publishing
**References**: SERVICE_TEMPLATE.md, SRM (DTO Policy), DTO_CANONICAL_STANDARD.md
**Last Updated**: 2025-11-17

---

## Purpose

Define when and how to use mappers.ts for DTO ↔ domain transformations to ensure:
- Bounded context isolation via DTO contracts
- Type-safe transformations between persistence and transport shapes
- Centralized mapping logic for testability
- Prevention of cross-context table leakage

---

## 1. Pattern Overview

### Definition

**Mapper Pattern**: Pure functions that transform between persistence shapes (database rows) and transport shapes (DTOs) while enforcing bounded context boundaries.

### Core Principles

1. **Centralize Transformations**: All DTO mapping in `services/{domain}/mappers.ts`
2. **Pure Functions**: Mappers are stateless, deterministic, and side-effect-free
3. **Bounded Context Enforcement**: Mappers only access tables owned by their service
4. **Type Safety**: Use generated `Database` types internally, export DTOs externally
5. **No Business Logic**: Mappers transform shape only, no calculations or side effects

---

## 2. Mapper Responsibilities

### DO: Mapper Implementation

#### ✅ 1. Centralize DTO ↔ Domain Transformations

```typescript
// services/loyalty/mappers.ts (INTERNAL USE ONLY)
import type { Database } from '@/types/database.types';
import type { PlayerLoyaltyDTO, LoyaltyLedgerEntryDTO } from './dtos';

// Internal type (persistence shape)
type LoyaltyRow = Database['public']['Tables']['player_loyalty']['Row'];
type LedgerRow = Database['public']['Tables']['loyalty_ledger']['Row'];

/**
 * Map persistence shape to published DTO
 * Excludes: preferences (internal-only field)
 */
export function toPlayerLoyaltyDTO(row: LoyaltyRow): PlayerLoyaltyDTO {
  return {
    player_id: row.player_id,
    casino_id: row.casino_id,
    balance: row.balance,
    tier: row.tier,
    // preferences field excluded (internal-only)
  };
}

/**
 * Map ledger row to DTO
 * Excludes: idempotency_key (internal-only)
 */
export function toLoyaltyLedgerEntryDTO(row: LedgerRow): LoyaltyLedgerEntryDTO {
  return {
    id: row.id,
    player_id: row.player_id,
    casino_id: row.casino_id,
    rating_slip_id: row.rating_slip_id,
    points_change: row.points_change,
    balance_after: row.balance_after,
    reason: row.reason,
    created_at: row.created_at,
    // idempotency_key excluded
  };
}

/**
 * Inverse mapper: DTO → partial row for updates
 * Used when application layer submits DTO changes
 */
export function toPartialLoyaltyRow(
  dto: Partial<PlayerLoyaltyDTO>
): Partial<LoyaltyRow> {
  return {
    balance: dto.balance,
    tier: dto.tier,
    // Only map fields that can be updated via public API
  };
}
```

#### ✅ 2. Keep Mapping Pure and Testable

```typescript
// services/rating-slip/mappers.ts
import type { Database } from '@/types/database.types';
import type { RatingSlipDTO, RatingSlipTelemetryDTO } from './dtos';

type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];

/**
 * CORRECT: Pure mapper function
 * - No side effects
 * - Deterministic
 * - Easily testable
 */
export function toRatingSlipDTO(row: RatingSlipRow): RatingSlipDTO {
  return {
    id: row.id,
    player_id: row.player_id,
    casino_id: row.casino_id,
    visit_id: row.visit_id,
    gaming_table_id: row.gaming_table_id,
    status: row.status,
    average_bet: row.average_bet,
    start_time: row.start_time,
    end_time: row.end_time,
    policy_snapshot: row.policy_snapshot,
  };
}

/**
 * CORRECT: Cross-context DTO mapper
 * Published for Loyalty/Finance consumption
 */
export function toTelemetryDTO(slip: RatingSlipRow): RatingSlipTelemetryDTO {
  // Calculate duration from timestamps (allowed in mapper)
  const durationMs = slip.end_time
    ? new Date(slip.end_time).getTime() - new Date(slip.start_time).getTime()
    : Date.now() - new Date(slip.start_time).getTime();

  const durationSeconds = Math.floor(durationMs / 1000);

  return {
    id: slip.id,
    player_id: slip.player_id,
    casino_id: slip.casino_id,
    average_bet: slip.average_bet,
    duration_seconds: durationSeconds,
    game_type: slip.policy_snapshot?.game_type || 'blackjack',
    // Omit: visit_id (FK not needed by consumers), policy_snapshot (internal)
  };
}

// INCORRECT: Mapper with side effects
export function toRatingSlipDTO_WRONG(row: RatingSlipRow): RatingSlipDTO {
  // ❌ WRONG: Mapper should not log
  console.log('Mapping rating slip:', row.id);

  // ❌ WRONG: Mapper should not mutate input
  row.average_bet = row.average_bet || 0;

  // ❌ WRONG: Mapper should not make async calls
  await auditLog.logAccess(row.id);

  return { /* ... */ };
}
```

#### ✅ 3. Enforce DTO Contracts from Owning Context

```typescript
// services/casino/mappers.ts
import type { Database } from '@/types/database.types';
import type { CasinoSettingsDTO } from './dtos';

type CasinoSettingsRow = Database['public']['Tables']['casino_settings']['Row'];

/**
 * CORRECT: Casino service owns casino_settings
 * Published DTO enforces what other services can see
 */
export function toCasinoSettingsDTO(row: CasinoSettingsRow): CasinoSettingsDTO {
  return {
    casino_id: row.casino_id,
    gaming_day_start_time: row.gaming_day_start_time,
    timezone: row.timezone,
    ctr_threshold: row.ctr_threshold,
    watchlist_floor: row.watchlist_floor,
    // Excludes: internal fields like created_at, updated_at (not needed by consumers)
  };
}

// Other services MUST use CasinoSettingsDTO, not direct DB access
// ✅ CORRECT (in MTL service):
// import type { CasinoSettingsDTO } from '@/services/casino/dtos';

// ❌ INCORRECT (in MTL service):
// import type { Database } from '@/types/database.types';
// type Settings = Database['public']['Tables']['casino_settings']['Row'];
```

---

### DON'T: Mapper Anti-Patterns

#### ❌ 1. Inline Mapping in Controllers/Server Actions

```typescript
// INCORRECT: Inline mapping in server action
export async function createPlayerAction(data: CreatePlayerDTO) {
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from('player')
    .insert(data)
    .select('*')
    .single();

  // ❌ WRONG: Inline DTO mapping in controller
  const dto: PlayerDTO = {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone,
  };

  return dto;
}

// CORRECT: Use mapper from service
export async function createPlayerAction(data: CreatePlayerDTO) {
  const supabase = await createClient();
  const playerService = createPlayerService(supabase);

  // ✅ CORRECT: Service handles mapping internally
  const result = await playerService.create(data);
  return result;
}
```

#### ❌ 2. Map Across Bounded Contexts

```typescript
// INCORRECT: MTL service mapping RatingSlip rows directly
// services/mtl/mappers.ts
import type { Database } from '@/types/database.types';

// ❌ WRONG: MTL accessing rating_slip table directly
type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];

export function enrichMTLEntry(
  mtlEntry: MTLEntryRow,
  ratingSlipRow: RatingSlipRow // ❌ WRONG: Cross-context leakage
): EnrichedMTLDTO {
  return {
    ...mtlEntry,
    average_bet: ratingSlipRow.average_bet, // ❌ WRONG
  };
}

// CORRECT: Use published DTO from RatingSlip service
// services/mtl/business.ts
import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos';
import { createRatingSlipService } from '@/services/rating-slip';

export function createMTLBusiness(supabase: SupabaseClient<Database>) {
  const ratingSlipService = createRatingSlipService(supabase);

  return {
    enrichEntry: async (mtlEntry: MTLEntryRow) => {
      // ✅ CORRECT: Call RatingSlip service for DTO
      const slip = await ratingSlipService.getById(mtlEntry.rating_slip_id);

      if (slip.success) {
        return {
          ...mtlEntry,
          average_bet: slip.data.average_bet, // ✅ CORRECT: Use published DTO
        };
      }

      return mtlEntry;
    },
  };
}
```

#### ❌ 3. Mixing Persistence Shape and Transport in Same Mapper

```typescript
// INCORRECT: Mapper that mixes concerns
export function toPlayerDTO_WRONG(row: PlayerRow): PlayerDTO & { _metadata: any } {
  return {
    // DTO fields
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone,

    // ❌ WRONG: Leaking internal metadata
    _metadata: {
      created_at: row.created_at,
      updated_at: row.updated_at,
      internal_notes: row.internal_notes,
    },
  };
}

// CORRECT: Separate DTOs for different purposes
// services/player/dtos.ts
export interface PlayerDTO {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
}

export interface PlayerDetailDTO extends PlayerDTO {
  created_at: string; // Include timestamps only in detail view
  visit_count: number; // Aggregate data
}

// services/player/mappers.ts
export function toPlayerDTO(row: PlayerRow): PlayerDTO {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone,
  };
}

export function toPlayerDetailDTO(
  row: PlayerRow,
  visitCount: number
): PlayerDetailDTO {
  return {
    ...toPlayerDTO(row),
    created_at: row.created_at,
    visit_count: visitCount,
  };
}
```

#### ❌ 4. Pulling Tables from Other Services to Enrich DTOs

```typescript
// INCORRECT: Finance service enriching DTO with Visit table data
// services/finance/mappers.ts
export async function enrichFinancialTxnDTO_WRONG(
  txn: FinancialTxnRow,
  supabase: SupabaseClient<Database>
): Promise<EnrichedFinancialTxnDTO> {
  // ❌ WRONG: Directly querying visit table owned by VisitService
  const { data: visit } = await supabase
    .from('visit')
    .select('status')
    .eq('id', txn.visit_id)
    .single();

  return {
    ...txn,
    visit_status: visit.status, // ❌ WRONG: Cross-context table access
  };
}

// CORRECT: Use VisitService to get DTO
// services/finance/business.ts
import { createVisitService } from '@/services/visit';

export function createFinanceBusiness(supabase: SupabaseClient<Database>) {
  const visitService = createVisitService(supabase);

  return {
    enrichTransaction: async (txn: FinancialTxnRow) => {
      // ✅ CORRECT: Call VisitService for DTO
      const visit = await visitService.getById(txn.visit_id);

      if (visit.success) {
        return {
          ...toFinancialTxnDTO(txn),
          visit_status: visit.data.status, // ✅ CORRECT: Use DTO
        };
      }

      return toFinancialTxnDTO(txn);
    },
  };
}
```

---

## 3. Mapper Patterns by Service Type

### Pattern A: Simple Services (CRUD-only)

For services with simple CRUD operations and no cross-context publishing:

```typescript
// services/player/dtos.ts
import type { Database } from '@/types/database.types';

// Canonical DTO (derived from table)
export type PlayerDTO = Database['public']['Tables']['player']['Row'];

// No mappers.ts needed; use table shape directly
```

**When to use**:
- Service owns table exclusively
- No sensitive fields to exclude
- No cross-context consumers
- DTO shape matches persistence shape exactly

**Example Services**: Player, Visit (basic cases)

---

### Pattern B: Bounded Context Services (Complex Business Logic)

For services with complex logic and cross-context DTO publishing:

```typescript
// services/loyalty/dtos.ts
/**
 * PlayerLoyaltyDTO - Public loyalty balance
 *
 * Exposure: UI, external APIs
 * Excludes: preferences (internal-only)
 * Owner: LoyaltyService (SRM:343-373)
 */
export interface PlayerLoyaltyDTO {
  player_id: string;
  casino_id: string;
  balance: number;
  tier: string | null;
}

// services/loyalty/mappers.ts (INTERNAL USE ONLY)
import type { Database } from '@/types/database.types';

type LoyaltyRow = Database['public']['Tables']['player_loyalty']['Row'];

export function toPlayerLoyaltyDTO(row: LoyaltyRow): PlayerLoyaltyDTO {
  return {
    player_id: row.player_id,
    casino_id: row.casino_id,
    balance: row.balance,
    tier: row.tier,
    // preferences excluded
  };
}
```

**When to use**:
- Service owns complex domain logic
- DTOs exclude sensitive/internal fields
- Cross-context consumers need published contracts
- Mapper enforces DTO allowlist

**Example Services**: Loyalty, Finance, MTL, TableContext

---

### Pattern C: Hybrid Services (Telemetry Publishing)

For services that publish telemetry/events to other contexts:

```typescript
// services/rating-slip/dtos.ts
import type { Database } from '@/types/database.types';

// Internal DTO (full row for owned operations)
export type RatingSlipDTO = Database['public']['Tables']['rating_slip']['Row'];

// Published DTO (cross-context contract for Loyalty/Finance)
export interface RatingSlipTelemetryDTO {
  id: string;
  player_id: string;
  casino_id: string;
  average_bet: number | null;
  duration_seconds: number;
  game_type: 'blackjack' | 'poker' | 'roulette' | 'baccarat';
  // Omits: policy_snapshot (internal), visit_id (FK not needed)
}

// services/rating-slip/mappers.ts
export function toTelemetryDTO(slip: RatingSlipRow): RatingSlipTelemetryDTO {
  const durationSeconds = calculateDuration(slip);

  return {
    id: slip.id,
    player_id: slip.player_id,
    casino_id: slip.casino_id,
    average_bet: slip.average_bet,
    duration_seconds: durationSeconds,
    game_type: slip.policy_snapshot?.game_type || 'blackjack',
  };
}
```

**When to use**:
- Service owns telemetry data
- Multiple consumers need event payloads
- Published DTO is subset/transform of persistence shape
- Cross-context consumers should not see full row

**Example Services**: RatingSlip, TableContext (telemetry feeds)

---

## 4. Column Exposure Policy

### Rule: DTOs MUST Document Exposure Scope

**Required JSDoc Template**:

```typescript
/**
 * {ServiceName}DTO - {Purpose}
 *
 * Exposure: {UI | Admin UI | External API | Internal only}
 * Excludes: {field1 (reason), field2 (reason), ...}
 * Owner: {ServiceName} (SRM:{line-ref})
 */
export interface ServiceNameDTO {
  // ...fields
}
```

### Sensitive Tables (MUST Use Allowlist)

| Table | Excluded Fields | Reason |
|-------|----------------|--------|
| `player` | `birth_date`, `ssn`, `internal_notes`, `risk_score` | PII / internal risk assessment |
| `staff` | `employee_id`, `email`, `ssn` | PII / internal identifiers |
| `player_financial_transaction` | `idempotency_key` | Internal-only implementation detail |
| `loyalty_ledger` | `idempotency_key` | Internal-only implementation detail |
| `casino_settings` | `created_at`, `updated_at` | Internal timestamps (consumers use gaming day) |

**Example**:

```typescript
// services/player/dtos.ts
/**
 * PlayerDTO - Public player profile
 *
 * Exposure: UI, external APIs
 * Excludes: birth_date (PII), ssn (PII), internal_notes (staff-only), risk_score (compliance-only)
 * Owner: PlayerService (SRM:61)
 */
export interface PlayerDTO {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  // Excludes: birth_date, ssn, internal_notes, risk_score
}
```

---

## 5. Type Import Restrictions

### Rule: `types/database.types.ts` MUST Only Be Imported In:

1. Service-owned `mappers.ts` files (internal use)
2. Service-owned `dtos.ts` files (for canonical pattern services)
3. RPC parameter builders (internal to service)

### Forbidden Locations:

- ❌ `app/` directory (route handlers, server actions)
- ❌ `components/` directory (UI components)
- ❌ `lib/` directory (shared utilities)
- ❌ Cross-service imports (e.g., loyalty importing from `services/rating-slip/mappers.ts`)

**Example**:

```typescript
// ✅ CORRECT: Mapper imports Database types
// services/loyalty/mappers.ts
import type { Database } from '@/types/database.types'; // ✅ OK
type LoyaltyRow = Database['public']['Tables']['player_loyalty']['Row'];

// ✅ CORRECT: Server action imports DTO
// app/actions/loyalty.ts
import type { PlayerLoyaltyDTO } from '@/services/loyalty/dtos'; // ✅ OK

// ❌ INCORRECT: Server action imports Database types
// app/actions/loyalty.ts
import type { Database } from '@/types/database.types'; // ❌ FORBIDDEN
type LoyaltyRow = Database['public']['Tables']['player_loyalty']['Row'];
```

---

## 6. Testing Pattern

### Unit Tests (Mapper Purity)

```typescript
// services/loyalty/mappers.test.ts
import { describe, it, expect } from 'vitest';
import { toPlayerLoyaltyDTO } from './mappers';
import type { Database } from '@/types/database.types';

type LoyaltyRow = Database['public']['Tables']['player_loyalty']['Row'];

describe('Loyalty mappers', () => {
  it('maps loyalty row to DTO', () => {
    const row: LoyaltyRow = {
      id: 'l1',
      player_id: 'p1',
      casino_id: 'c1',
      balance: 500,
      tier: 'SILVER',
      preferences: { email_opt_in: true }, // internal field
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };

    const dto = toPlayerLoyaltyDTO(row);

    expect(dto).toEqual({
      player_id: 'p1',
      casino_id: 'c1',
      balance: 500,
      tier: 'SILVER',
    });

    // Ensure internal fields excluded
    expect(dto).not.toHaveProperty('preferences');
    expect(dto).not.toHaveProperty('created_at');
    expect(dto).not.toHaveProperty('updated_at');
  });

  it('excludes preferences (internal-only field)', () => {
    const row: LoyaltyRow = {
      id: 'l1',
      player_id: 'p1',
      casino_id: 'c1',
      balance: 1000,
      tier: 'GOLD',
      preferences: { sms_alerts: false },
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };

    const dto = toPlayerLoyaltyDTO(row);

    // Preferences should not be in DTO
    expect('preferences' in dto).toBe(false);
  });
});
```

### Integration Tests (Cross-Context DTO Consumption)

```typescript
// services/loyalty/__tests__/cross-context.int.test.ts
import { describe, it, expect } from 'vitest';
import { createLoyaltyService } from '@/services/loyalty';
import { createRatingSlipService } from '@/services/rating-slip';
import { createClient } from '@/lib/supabase/server';

describe('Loyalty cross-context DTO consumption', () => {
  it('consumes RatingSlipTelemetryDTO (not direct DB access)', async () => {
    const supabase = await createClient();
    const loyaltyService = createLoyaltyService(supabase);
    const ratingSlipService = createRatingSlipService(supabase);

    // Create rating slip
    const slip = await ratingSlipService.create({
      player_id: TEST_PLAYER_ID,
      casino_id: TEST_CASINO_ID,
      gaming_table_id: TEST_TABLE_ID,
      average_bet: 25.00,
    });

    // ✅ CORRECT: Loyalty uses RatingSlipTelemetryDTO
    const reward = await loyaltyService.issueMidSessionReward(
      slip.data.id,
      // telemetry comes from RatingSlip service, not direct DB query
    );

    expect(reward.success).toBe(true);
  });

  it('rejects direct DB imports at compile time', () => {
    // This should NOT compile (caught by ESLint)
    // @ts-expect-error - ESLint rule: no-cross-context-db-imports
    const row: Database['public']['Tables']['rating_slip']['Row'] = {};
  });
});
```

---

## 7. Mapper Lifecycle

### Creation Phase (Service Development)

1. **Define DTO Contract**: Document exposed fields and exclusions
2. **Create Mapper**: Implement `toXDTO()` and `toPartialXRow()` functions
3. **Wire to Service**: Service factory calls mapper before returning results
4. **Test**: Unit test mapper purity and field exclusions

### Consumption Phase (Cross-Context Integration)

1. **Import Published DTO**: `import type { XDTO } from '@/services/x/dtos';`
2. **Call Service Method**: Use service factory to get DTO (not direct DB query)
3. **Trust DTO Contract**: DTO shape is guaranteed by owning service
4. **No Re-Mapping**: Consuming service uses DTO as-is (no re-transformation)

### Evolution Phase (DTO Version Changes)

1. **Breaking Change**: Add new DTO version (e.g., `PlayerDTOv2`)
2. **Dual Support**: Maintain both versions during transition period
3. **Deprecation Notice**: Mark old DTO `@deprecated` with sunset date
4. **Migration**: Update consumers to new DTO version
5. **Removal**: Delete old DTO and mapper after sunset period

---

## 8. Checklist

When creating a new mapper:

- [ ] Define DTO interface with JSDoc (exposure, excludes, owner)
- [ ] Create mapper in `services/{domain}/mappers.ts`
- [ ] Mapper is pure (no side effects, no async, no mutations)
- [ ] Mapper only accesses tables owned by service
- [ ] Mapper excludes sensitive/internal fields per policy
- [ ] Add unit tests for mapper purity and field exclusions
- [ ] Document cross-context consumers in DTO JSDoc
- [ ] Verify no direct `Database` imports in consuming services

---

## 9. References

- **SRM (DTO Policy)**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (lines 50-299)
- **DTO Standard**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- **Service Template**: `docs/70-governance/SERVICE_TEMPLATE.md` (lines 62-98)
- **Type Import Restrictions**: SRM (lines 264-278)
- **Column Exposure Policy**: SRM (lines 239-262)
- **DTO Catalog**: `docs/25-api-data/DTO_CATALOG.md`

---

## 10. Changelog

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-17 | Initial specification extracted from SRM DTO policy | System |

---

**End of Document**
