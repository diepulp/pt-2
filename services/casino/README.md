# CasinoService - Foundational Context

> **Bounded Context**: "What are the operational parameters and policy boundaries of this casino property?"
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §882-1006](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
> **Status**: Implemented

## Ownership

**Tables** (8):
- `casino` - Casino registry
- `casino_settings` - **EXCLUSIVE WRITE** - Single temporal authority
- `company` - Corporate ownership hierarchy
- `staff` - Staff registry and access control
- `game_settings` - Game configuration templates
- `player_casino` - Player enrollment (shared with PlayerService)
- `audit_log` - Cross-domain event logging
- `report` - Administrative reports

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
