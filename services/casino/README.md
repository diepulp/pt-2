# CasinoService - Foundational Context

> **Bounded Context**: "What staff can work at this casino and what are its operational settings?"
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
> **Specification**: [SPEC-PRD-000-casino-foundation.md](../../docs/20-architecture/specs/PRD-000/SPEC-PRD-000-casino-foundation.md)
> **Status**: WS2 Complete (Service Layer)

## Pattern

**Pattern B: Canonical CRUD**

CasinoService follows Pattern B per SLAD requirements:

- DTOs derived via `Pick`/`Omit` from `Database` types (no manual interfaces except RPC responses)
- No separate `mappers.ts` required
- Schema changes auto-sync via type derivation
- Minimal business logic (validation in Route Handlers)

## File Structure

```
services/casino/
├── dtos.ts          # DTO type definitions (Pick/Omit from Database)
├── schemas.ts       # Zod validation schemas
├── keys.ts          # React Query key factories with .scope pattern
├── http.ts          # HTTP fetcher functions using fetchJSON
├── README.md        # This documentation
└── casino.test.ts   # Unit tests (legacy, to be migrated)
```

## Ownership

**Tables** (8):
| Table | Access | Description |
|-------|--------|-------------|
| `casino` | CRUD | Casino registry |
| `casino_settings` | **EXCLUSIVE WRITE** | Temporal authority (gaming day, timezone) |
| `company` | CRUD | Corporate ownership hierarchy |
| `staff` | CRUD | Staff registry with role assignment |
| `game_settings` | CRUD | Game configuration templates |
| `player_casino` | SHARED | Player enrollment (with PlayerService) |
| `audit_log` | WRITE | Cross-domain event logging |
| `report` | CRUD | Administrative reports |

## DTOs

All DTOs use Pick/Omit from `Database['public']['Tables'][...]`:

| DTO | Description | Source |
|-----|-------------|--------|
| `CasinoDTO` | Public casino profile | `casino.Row` |
| `CreateCasinoDTO` | Casino creation input | `casino.Insert` |
| `UpdateCasinoDTO` | Casino update input | Partial of CreateCasinoDTO |
| `CasinoSettingsDTO` | Operational parameters | `casino_settings.Row` |
| `UpdateCasinoSettingsDTO` | Settings update input | `casino_settings.Update` |
| `StaffDTO` | Staff record (excludes email) | `staff.Row` |
| `CreateStaffDTO` | Staff creation input | `staff.Insert` |
| `GamingDayDTO` | RPC response (manual interface) | compute_gaming_day RPC |

## Query Keys

Uses `.scope` pattern for surgical invalidation:

```typescript
import { casinoKeys } from '@/services/casino/keys';

// List with filters (includes .scope)
casinoKeys.list({ status: 'active' })
casinoKeys.list.scope  // Invalidate all list queries

// Staff list with filters (includes .scope)
casinoKeys.staff({ role: 'dealer' })
casinoKeys.staff.scope  // Invalidate all staff queries

// Detail and settings
casinoKeys.detail(casinoId)
casinoKeys.settings()
casinoKeys.gamingDay(timestamp?)
```

## HTTP Fetchers

All fetchers use `fetchJSON` from `@/lib/http/fetch-json`:

```typescript
import {
  getCasinos,
  getCasino,
  createCasino,
  updateCasino,
  deleteCasino,
  getCasinoSettings,
  updateCasinoSettings,
  getCasinoStaff,
  createStaff,
  getGamingDay,
} from '@/services/casino/http';
```

All mutations include `idempotency-key` header automatically.

## Validation Schemas

Staff role constraint (PRD-000 section 3.3):

```typescript
import { createStaffSchema } from '@/services/casino/schemas';

// Enforces:
// - Dealer: Must NOT have user_id (non-authenticated)
// - Pit Boss/Admin: MUST have user_id (authenticated)
```

## Temporal Authority

`casino_settings` is the **sole source** for:

| Field | Default | Description |
|-------|---------|-------------|
| `gaming_day_start_time` | '06:00' | When gaming day begins |
| `timezone` | 'America/Los_Angeles' | Casino timezone |
| `watchlist_floor` | 3000 | Compliance threshold |
| `ctr_threshold` | 10000 | CTR reporting threshold |

All downstream services consume via `compute_gaming_day` RPC or published DTOs.

## Provides To (Downstream Contexts)

- **TableContextService**: Casino ID linkage, game config templates, staff authorization
- **VisitService**: Casino jurisdiction, timezone, gaming day boundaries
- **RatingSlipService**: Casino settings for gameplay telemetry normalization
- **MTLService**: Gaming day start time, compliance thresholds, timezone
- **LoyaltyService**: Casino-specific tier rules (future)
- **FinanceService**: Gaming day for transaction grouping
- **All Services**: `casino_id` FK, staff references

## API Endpoints

Route Handlers at `app/api/v1/casino/`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/casino` | List casinos |
| POST | `/api/v1/casino` | Create casino |
| GET | `/api/v1/casino/[id]` | Get casino by ID |
| PATCH | `/api/v1/casino/[id]` | Update casino |
| DELETE | `/api/v1/casino/[id]` | Delete casino |
| GET | `/api/v1/casino/settings` | Get casino settings |
| PATCH | `/api/v1/casino/settings` | Update casino settings |
| GET | `/api/v1/casino/staff` | List staff |
| POST | `/api/v1/casino/staff` | Create staff |
| GET | `/api/v1/casino/gaming-day` | Compute gaming day |

## References

- [SPEC-PRD-000](../../docs/20-architecture/specs/PRD-000/SPEC-PRD-000-casino-foundation.md) - Full specification
- [SRM](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md) - Bounded context rules
- [SEC-001](../../docs/30-security/SEC-001-rls-policy-matrix.md) - RLS policy patterns
- [SLAD](../../docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md) - Service patterns
