# CasinoService - Foundational Context

> **Bounded Context**: "What staff can work at this casino and what are its operational settings?"
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §882-1006](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
> **Status**: Implemented (MVP-001 Phase 1, Section 1.1)

## Ownership

**Tables** (8):
- `casino` - Casino registry
- `casino_settings` - **EXCLUSIVE WRITE** - Single temporal authority (gaming day parameters, timezone)
- `company` - Corporate ownership hierarchy
- `staff` - Staff registry and access control (role assignment)
- `game_settings` - Game configuration templates
- `player_casino` - Player enrollment (shared with PlayerService)
- `audit_log` - Cross-domain event logging
- `report` - Administrative reports

## Pattern

**Pattern B: Canonical CRUD**

**Rationale**: Casino service provides foundational configuration and registry data (casino properties, settings, staff, game templates) with straightforward CRUD operations. DTOs mirror database schema 1:1 since configuration changes flow directly from schema updates. No complex business logic or domain transformations required.

**Characteristics**:
- DTOs use `Pick<Database['public']['Tables']['casino']['Row'], ...>`
- Minimal business logic (handled in Server Actions)
- Configuration and reference data management
- Schema changes auto-sync via type derivation

## Provides To (All Downstream Contexts)

- **TableContext**: Casino ID linkage, game config templates, staff authorization
- **Visit**: Casino jurisdiction, timezone, gaming day boundaries
- **RatingSlip**: Casino settings for gameplay telemetry normalization
- **MTL**: Gaming day start time, compliance thresholds, timezone
- **Loyalty**: Casino-specific tier rules (future)
- **All Services**: `casino_id` FK, staff references

## Temporal Authority

`casino_settings` is the **sole source** for:
- `gaming_day_start_time` (default: '06:00')
- `timezone` (default: 'America/Los_Angeles')
- `watchlist_floor`, `ctr_threshold` (compliance thresholds)

All downstream services that compute `gaming_day` reference `casino_settings`.

## DTOs

### Casino
- `CasinoDTO` - Casino identity (read operations)
- `CasinoCreateDTO` - Casino creation input
- `CasinoUpdateDTO` - Casino update input

### Settings
- `CasinoSettingsDTO` - Operational parameters (gaming day, timezone, thresholds)

### Staff
- `StaffDTO` - Staff record (RBAC)

### Game
- `GameSettingsDTO` - Game templates

## Server Actions

### Casino CRUD (`app/actions/casino.ts`)
```typescript
// List casinos with pagination
getCasinos(options?: { limit?: number; cursor?: string; status?: 'active' | 'inactive' })
  => Promise<{ casinos: CasinoDTO[]; nextCursor?: string }>

// Get single casino by ID
getCasinoById(id: string) => Promise<CasinoDTO | null>

// Create new casino
createCasino(input: CasinoCreateDTO) => Promise<CasinoDTO>

// Update existing casino
updateCasino(id: string, input: CasinoUpdateDTO) => Promise<CasinoDTO>

// Delete casino
deleteCasino(id: string) => Promise<void>
```

### Staff Operations
```typescript
// Get all active staff for a casino
getStaffByCasino(casinoId: string) => Promise<StaffDTO[]>
```

### Settings Operations
```typescript
// Get casino settings
getCasinoSettings(casinoId: string) => Promise<CasinoSettingsDTO | null>

// Compute current gaming day based on casino timezone and start time
computeGamingDay(casinoId: string, timestamp?: Date) => Promise<string>
```

## React Query Hooks (`hooks/use-casino.ts`)

### Casino CRUD Hooks
```typescript
// List casinos
useCasinos(filters?: CasinoFilters)

// Get single casino
useCasino(casinoId: string)

// Create casino (mutation)
useCreateCasino()

// Update casino (mutation)
useUpdateCasino()

// Delete casino (mutation)
useDeleteCasino()
```

### Staff Hooks
```typescript
// Get casino staff
useCasinoStaff(casinoId: string)
```

### Settings Hooks
```typescript
// Get casino settings
useCasinoSettings(casinoId: string)

// Get current gaming day (cached for 5 minutes)
useGamingDay(casinoId: string)
```

## Query Keys (`services/casino/keys.ts`)

```typescript
casinoKeys.root                         // ['casino']
casinoKeys.list(filters)                // ['casino', 'list', serialized(filters)]
casinoKeys.list.scope                   // ['casino', 'list']
casinoKeys.detail(casinoId)             // ['casino', 'detail', casinoId]
casinoKeys.staff(casinoId, filters)     // ['casino', 'staff', casinoId, serialized(filters)]
casinoKeys.settings(casinoId)           // ['casino', 'settings', casinoId]
casinoKeys.updateSettings(casinoId)     // ['casino', 'settings', casinoId, 'update']
```

## Usage Examples

### Create a Casino
```typescript
import { useCreateCasino } from '@/hooks/use-casino';

function CreateCasinoForm() {
  const createCasino = useCreateCasino();

  const handleSubmit = async (data) => {
    await createCasino.mutateAsync({
      name: 'New Casino',
      location: 'Las Vegas, NV',
      address: { street: '123 Main St', city: 'Las Vegas', state: 'NV', zip: '89101' },
      company_id: 'company-uuid',
      status: 'active',
    });
  };
}
```

### List Casinos
```typescript
import { useCasinos } from '@/hooks/use-casino';

function CasinoList() {
  const { data, isLoading } = useCasinos({ status: 'active' });

  if (isLoading) return <div>Loading...</div>;

  return data.casinos.map(casino => (
    <div key={casino.id}>{casino.name}</div>
  ));
}
```

### Update Casino
```typescript
import { useUpdateCasino } from '@/hooks/use-casino';

function EditCasinoForm({ casinoId }) {
  const updateCasino = useUpdateCasino();

  const handleSubmit = async (data) => {
    await updateCasino.mutateAsync({
      id: casinoId,
      data: { name: 'Updated Name' },
    });
  };
}
```

## References

- [SRM §882-1006](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- [SEC-001](../../docs/30-security/SEC-001-rls-policy-matrix.md) - RLS patterns
