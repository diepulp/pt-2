# PlayerService - Identity Context

> **Bounded Context**: Player identity and casino enrollment
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §1007-1060](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
> **Status**: Implemented

## Ownership

**Tables** (2):
- `player` - Player identity
- `player_casino` - Multi-casino enrollment (shared with CasinoService)

**DTOs**:
- `PlayerDTO` - Public player profile (excludes PII like birth_date)
- `PlayerCreateDTO` - Enrollment input
- `PlayerEnrollmentDTO` - Casino membership status

## Pattern

**Thin CRUD Service** - Canonical DTOs using Pick/Omit from Database types

```typescript
export type PlayerDTO = Pick<
  Database['public']['Tables']['player']['Row'],
  'id' | 'first_name' | 'last_name' | 'created_at'
>;
```

## References

- [SRM §1007-1060](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- [DTO_CANONICAL_STANDARD.md](../../docs/25-api-data/DTO_CANONICAL_STANDARD.md) (Simple CRUD pattern)
