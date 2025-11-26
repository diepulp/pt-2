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

- `CasinoDTO` - Casino identity
- `CasinoSettingsDTO` - Operational parameters
- `StaffDTO` - Staff record (RBAC)
- `GameSettingsDTO` - Game templates

## References

- [SRM §882-1006](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- [SEC-001](../../docs/30-security/SEC-001-rls-policy-matrix.md) - RLS patterns
