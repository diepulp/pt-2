# PlayerService - Identity Context

> **Bounded Context**: "Who is this player and what is their profile?"
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §1007-1060](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
> **Status**: Implemented (Phase 1 MVP-001 Section 1.2)

## Ownership

**Tables** (2):
- `player` - Player identity and profile
- `player_casino` - Player-casino enrollment relationship

**DTOs**:
- `PlayerDTO` - Player profile with identity fields
- `EnrollPlayerDTO` - Enrollment input (player creation + casino assignment)
- `PlayerCasinoDTO` - Casino membership status

## Pattern

**Pattern B: Canonical CRUD**

**Rationale**: Player service manages simple identity and enrollment CRUD operations. DTOs mirror database schema 1:1 with no complex business logic. Player profile changes flow directly from schema updates, making type derivation the safest approach to prevent schema drift.

**Characteristics**:
- DTOs use `Pick<Database['public']['Tables']['player']['Row'], ...>`
- Minimal business logic (handled in Server Actions)
- PII exclusion via explicit column selection
- Schema changes auto-sync via type derivation

**Example**:
```typescript
export type PlayerDTO = Pick<
  Database['public']['Tables']['player']['Row'],
  'id' | 'first_name' | 'last_name' | 'created_at'
>;
```

## Implementation

**Server Actions** (`app/actions/player.ts`):
- `enrollPlayer(data: EnrollPlayerDTO)` - Create player and enroll in casino
- `getPlayer(playerId: string)` - Fetch player by ID
- `getPlayerByCasino(casinoId: string, playerId: string)` - Fetch player with casino verification
- `isPlayerEnrolled(casinoId: string, playerId: string)` - Check enrollment status
- `getPlayersByCasino(casinoId: string, options?)` - Paginated player list for casino
- `updatePlayer(playerId: string, data: PlayerUpdateDTO)` - Update player profile
- `deletePlayer(playerId: string)` - Delete player and casino relationships
- `searchPlayers(query: string, casinoId?: string)` - Search players by name (optionally filtered by casino)

**React Hooks** (`hooks/use-player.ts`):
- `usePlayer(playerId)` - Query single player
- `usePlayerList(casinoId, options)` - Infinite query for player list
- `usePlayerEnrollment(casinoId, playerId)` - Query enrollment status
- `useEnrollPlayer()` - Mutation for player enrollment
- `useUpdatePlayer()` - Mutation for updating player profile
- `useDeletePlayer()` - Mutation for deleting player
- `useSearchPlayers(query, casinoId?)` - Query for searching players by name

## References

- [SRM §1007-1060](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- [DTO_CANONICAL_STANDARD.md](../../docs/25-api-data/DTO_CANONICAL_STANDARD.md) (Simple CRUD pattern)
- [PRD-001 Player Management System](../../docs/10-prd/PRD-001_Player_Management_System_Requirements.md)
