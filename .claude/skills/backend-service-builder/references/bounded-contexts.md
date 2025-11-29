# Bounded Context Rules

**Source**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (SRM)
**Architecture**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` (SLAD v2.1.2)

---

## Core Rule

**Services can ONLY directly access tables they own. Cross-context data requires DTO imports.**

---

## Table Ownership Matrix

| Service | Owned Tables |
|---------|--------------|
| **casino** | `casino`, `casino_settings`, `company`, `staff`, `game_settings`, `audit_log`, `report` |
| **player** | `player`, `player_casino` |
| **visit** | `visit` |
| **loyalty** | `player_loyalty`, `loyalty_ledger`, `loyalty_outbox` |
| **rating-slip** | `rating_slip` |
| **finance** | `player_financial_transaction`, `finance_outbox` |
| **mtl** | `mtl_entry`, `mtl_audit_note` |
| **table-context** | `gaming_table`, `gaming_table_settings`, `dealer_rotation`, `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_drop_event` |
| **floor-layout** | `floor_layout`, `floor_layout_version`, `floor_pit`, `floor_table_slot`, `floor_layout_activation` |

---

## Cross-Context Access

### ❌ VIOLATION

```typescript
// services/loyalty/feature.ts
type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];
//                                                 ^^^^^^^^^^^
// ERROR: Loyalty does not own rating_slip
```

### ✅ CORRECT

```typescript
// Import published DTO from owning service
import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos';

function calculateReward(telemetry: RatingSlipTelemetryDTO): number {
  return telemetry.average_bet * telemetry.duration_seconds * 0.01;
}
```

---

## Service Dependencies

| Service | Consumes From | Publishes To |
|---------|---------------|--------------|
| **loyalty** | player, rating-slip, visit | UI, finance |
| **rating-slip** | player, visit, table-context | loyalty, finance |
| **finance** | player, visit, rating-slip | mtl, reports |
| **mtl** | player, casino, finance | compliance UI |
| **table-context** | casino, floor-layout | rating-slip |
| **floor-layout** | casino | table-context |

---

## Publishing DTOs

When your service is consumed by others, export public DTOs:

```typescript
// services/rating-slip/dtos.ts (or inline in feature file)
export interface RatingSlipTelemetryDTO {
  id: string;
  player_id: string;
  casino_id: string;
  average_bet: number | null;
  duration_seconds: number;
  game_type: 'blackjack' | 'poker' | 'roulette' | 'baccarat';
  // NOT exposed: internal_notes, risk_flags
}
```

---

## README Documentation

Every service README must include:

```markdown
## Bounded Context

**Owned Tables**: `table1`, `table2`
**Published DTOs**: `ServiceDTO`, `ServiceDetailDTO`
**Consumes**: Player service, Visit service
**Consumed By**: Loyalty service, Finance service
**SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §X-Y](...)
```

---

## Enforcement

ESLint rule `.eslint-rules/no-cross-context-db-imports.js` detects violations at build time.

---

## Full Reference

- **SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **SLAD**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- **DTO Standards**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
