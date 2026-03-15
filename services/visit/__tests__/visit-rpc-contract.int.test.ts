/** @jest-environment node */

/**
 * Visit RPC Contract Tests (Integration Canary)
 *
 * Combines compile-time type assertions with runtime contract tests
 * for the Visit bounded context. Modeled on Player exemplar
 * (player-rpc-contract.int.test.ts).
 *
 * Environment: node (server-side schemas, no DOM dependencies).
 * Gating: Tests that require Supabase use describe.skip
 * when RUN_INTEGRATION_TESTS is unset. This file's tests are pure
 * schema/type/algorithm validation and run unconditionally.
 *
 * Test groups:
 * 1. Visit table type contract (compile-time)
 * 2. visit_kind enum assertion (compile-time)
 * 3. RPC type contract — rpc_start_or_resume_visit (compile-time)
 * 4. RPC type contract — rpc_get_player_recent_sessions (compile-time)
 * 5. RPC type contract — rpc_get_player_last_session_context (compile-time)
 * 6. RPC type contract — rpc_check_table_seat_availability (compile-time)
 * 7. ADR-024 compliance — no spoofable params (compile-time)
 * 8. Schema validation (runtime — Zod schemas)
 * 9. Mapper contract (runtime — row → DTO)
 *
 * @see ADR-024 Authoritative Context Derivation
 * @see ADR-026 Gaming Day Boundary
 * @see PRD-017 Visit Continuation
 * @see TESTING_GOVERNANCE_STANDARD.md §3.5
 */

import type { Database } from '@/types/database.types';

import {
  startVisitSchema,
  closeVisitSchema,
  visitKindSchema,
  createRewardVisitSchema,
  createGamingVisitSchema,
  createGhostGamingVisitSchema,
  convertRewardToGamingSchema,
  visitListQuerySchema,
  activeVisitQuerySchema,
  visitRouteParamsSchema,
  recentSessionsQuerySchema,
  startFromPreviousSchema,
} from '../schemas';
import {
  toVisitDTO,
  toVisitDTOOrNull,
  toVisitDTOList,
  toVisitWithPlayerDTO,
  toVisitWithPlayerDTOList,
  toActiveVisitDTO,
} from '../mappers';

// ============================================================================
// Type Aliases
// ============================================================================

type Tables = Database['public']['Tables'];
type RpcFunctions = Database['public']['Functions'];
type Enums = Database['public']['Enums'];

type VisitRow = Tables['visit']['Row'];
type VisitInsert = Tables['visit']['Insert'];

// ============================================================================
// 1. Visit Table Type Contract — Compile-Time Assertions
// ============================================================================

// --- visit table columns ---
type _AssertVisitColumns = VisitRow extends {
  id: string;
  casino_id: string;
  player_id: string | null;
  visit_kind: Enums['visit_kind'];
  started_at: string;
  ended_at: string | null;
  visit_group_id: string;
  gaming_day: string;
}
  ? true
  : never;
const _visitColumnsCheck: _AssertVisitColumns = true;

// --- visit insert requires casino_id, visit_group_id, gaming_day ---
type _AssertVisitInsertRequired = VisitInsert extends {
  casino_id: string;
  visit_group_id: string;
  gaming_day: string;
}
  ? true
  : never;
const _visitInsertCheck: _AssertVisitInsertRequired = true;

// --- player_id is optional on insert (ghost visits) ---
type _AssertPlayerIdOptionalOnInsert = VisitInsert extends {
  player_id?: string | null;
}
  ? true
  : never;
const _playerIdOptionalCheck: _AssertPlayerIdOptionalOnInsert = true;

// ============================================================================
// 2. visit_kind Enum Assertion — Compile-Time
// ============================================================================

type _AssertVisitKindEnum = Enums['visit_kind'] extends
  | 'reward_identified'
  | 'gaming_identified_rated'
  | 'gaming_ghost_unrated'
  ? true
  : never;
const _visitKindCheck: _AssertVisitKindEnum = true;

// ============================================================================
// 3. RPC Type Contract — rpc_start_or_resume_visit (Compile-Time)
// ============================================================================

type StartOrResumeArgs = RpcFunctions['rpc_start_or_resume_visit']['Args'];

// Verify args: only p_player_id — no spoofable params
type _AssertStartOrResumeArgs = StartOrResumeArgs extends {
  p_player_id: string;
}
  ? true
  : never;
const _startOrResumeArgsCheck: _AssertStartOrResumeArgs = true;

// ADR-024: No spoofable p_casino_id in rpc_start_or_resume_visit
type _AssertStartNoCasinoId = 'p_casino_id' extends keyof StartOrResumeArgs
  ? never
  : true;
const _startNoCasinoIdCheck: _AssertStartNoCasinoId = true;

// ============================================================================
// 4. RPC Type Contract — rpc_get_player_recent_sessions (Compile-Time)
// ============================================================================

type RecentSessionsArgs =
  RpcFunctions['rpc_get_player_recent_sessions']['Args'];

type _AssertRecentSessionsArgs = RecentSessionsArgs extends {
  p_player_id: string;
}
  ? true
  : never;
const _recentSessionsArgsCheck: _AssertRecentSessionsArgs = true;

// ADR-024: No spoofable p_casino_id
type _AssertRecentSessionsNoCasinoId =
  'p_casino_id' extends keyof RecentSessionsArgs ? never : true;
const _recentSessionsNoCasinoIdCheck: _AssertRecentSessionsNoCasinoId = true;

// ============================================================================
// 5. RPC Type Contract — rpc_get_player_last_session_context (Compile-Time)
// ============================================================================

type LastSessionContextArgs =
  RpcFunctions['rpc_get_player_last_session_context']['Args'];

type _AssertLastSessionContextArgs = LastSessionContextArgs extends {
  p_player_id: string;
}
  ? true
  : never;
const _lastSessionContextArgsCheck: _AssertLastSessionContextArgs = true;

// ADR-024: No spoofable p_casino_id
type _AssertLastSessionNoCasinoId =
  'p_casino_id' extends keyof LastSessionContextArgs ? never : true;
const _lastSessionNoCasinoIdCheck: _AssertLastSessionNoCasinoId = true;

// ============================================================================
// 6. RPC Type Contract — rpc_check_table_seat_availability (Compile-Time)
// ============================================================================

type TableSeatAvailArgs =
  RpcFunctions['rpc_check_table_seat_availability']['Args'];

type _AssertTableSeatAvailArgs = TableSeatAvailArgs extends {
  p_table_id: string;
  p_seat_number: number;
}
  ? true
  : never;
const _tableSeatAvailArgsCheck: _AssertTableSeatAvailArgs = true;

// ============================================================================
// 7. ADR-024 Compliance — No Spoofable Params (Compile-Time)
// ============================================================================

// rpc_start_or_resume_visit
type _AssertStartNoActorId = 'p_actor_id' extends keyof StartOrResumeArgs
  ? never
  : true;
const _startNoActorIdCheck: _AssertStartNoActorId = true;

// rpc_check_table_seat_availability
type _AssertTableSeatNoCasinoId = 'p_casino_id' extends keyof TableSeatAvailArgs
  ? never
  : true;
const _tableSeatNoCasinoIdCheck: _AssertTableSeatNoCasinoId = true;

// ============================================================================
// 8. Schema Validation Tests (Runtime)
// ============================================================================

describe('Visit Schema Contract', () => {
  describe('visitKindSchema', () => {
    it('accepts all valid visit_kind values', () => {
      expect(visitKindSchema.safeParse('reward_identified').success).toBe(true);
      expect(visitKindSchema.safeParse('gaming_identified_rated').success).toBe(
        true,
      );
      expect(visitKindSchema.safeParse('gaming_ghost_unrated').success).toBe(
        true,
      );
    });

    it('rejects invalid visit_kind', () => {
      expect(visitKindSchema.safeParse('invalid_kind').success).toBe(false);
      expect(visitKindSchema.safeParse('').success).toBe(false);
    });
  });

  describe('startVisitSchema', () => {
    it('accepts valid player_id', () => {
      const result = startVisitSchema.safeParse({
        player_id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing player_id', () => {
      expect(startVisitSchema.safeParse({}).success).toBe(false);
    });

    it('rejects invalid UUID', () => {
      expect(
        startVisitSchema.safeParse({ player_id: 'not-a-uuid' }).success,
      ).toBe(false);
    });
  });

  describe('closeVisitSchema', () => {
    it('accepts empty object (defaults to server time)', () => {
      expect(closeVisitSchema.safeParse({}).success).toBe(true);
    });

    it('accepts valid ended_at timestamp', () => {
      expect(
        closeVisitSchema.safeParse({
          ended_at: '2026-03-14T10:00:00.000Z',
        }).success,
      ).toBe(true);
    });

    it('rejects invalid timestamp', () => {
      expect(
        closeVisitSchema.safeParse({ ended_at: 'not-a-date' }).success,
      ).toBe(false);
    });
  });

  describe('createRewardVisitSchema', () => {
    it('accepts valid player_id', () => {
      expect(
        createRewardVisitSchema.safeParse({
          player_id: '550e8400-e29b-41d4-a716-446655440000',
        }).success,
      ).toBe(true);
    });

    it('rejects missing player_id', () => {
      expect(createRewardVisitSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('createGamingVisitSchema', () => {
    it('accepts valid player_id', () => {
      expect(
        createGamingVisitSchema.safeParse({
          player_id: '550e8400-e29b-41d4-a716-446655440000',
        }).success,
      ).toBe(true);
    });
  });

  describe('createGhostGamingVisitSchema', () => {
    it('accepts valid table_id', () => {
      expect(
        createGhostGamingVisitSchema.safeParse({
          table_id: '550e8400-e29b-41d4-a716-446655440000',
        }).success,
      ).toBe(true);
    });

    it('accepts optional notes', () => {
      const result = createGhostGamingVisitSchema.safeParse({
        table_id: '550e8400-e29b-41d4-a716-446655440000',
        notes: 'High-value player declined ID',
      });
      expect(result.success).toBe(true);
    });

    it('rejects notes exceeding 500 chars', () => {
      expect(
        createGhostGamingVisitSchema.safeParse({
          table_id: '550e8400-e29b-41d4-a716-446655440000',
          notes: 'x'.repeat(501),
        }).success,
      ).toBe(false);
    });

    it('rejects missing table_id', () => {
      expect(createGhostGamingVisitSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('convertRewardToGamingSchema', () => {
    it('accepts valid visit_id', () => {
      expect(
        convertRewardToGamingSchema.safeParse({
          visit_id: '550e8400-e29b-41d4-a716-446655440000',
        }).success,
      ).toBe(true);
    });

    it('rejects invalid UUID', () => {
      expect(
        convertRewardToGamingSchema.safeParse({ visit_id: 'bad' }).success,
      ).toBe(false);
    });
  });

  describe('visitListQuerySchema', () => {
    it('accepts empty object (all defaults)', () => {
      expect(visitListQuerySchema.safeParse({}).success).toBe(true);
    });

    it('accepts full filter set', () => {
      const result = visitListQuerySchema.safeParse({
        player_id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'active',
        visit_kind: 'gaming_identified_rated',
        from_date: '2026-01-01',
        to_date: '2026-12-31',
        limit: 50,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid status', () => {
      expect(
        visitListQuerySchema.safeParse({ status: 'unknown' }).success,
      ).toBe(false);
    });

    it('rejects limit > 100', () => {
      expect(visitListQuerySchema.safeParse({ limit: 101 }).success).toBe(
        false,
      );
    });
  });

  describe('activeVisitQuerySchema', () => {
    it('requires player_id', () => {
      expect(
        activeVisitQuerySchema.safeParse({
          player_id: '550e8400-e29b-41d4-a716-446655440000',
        }).success,
      ).toBe(true);
      expect(activeVisitQuerySchema.safeParse({}).success).toBe(false);
    });
  });

  describe('visitRouteParamsSchema', () => {
    it('accepts valid UUID visitId', () => {
      expect(
        visitRouteParamsSchema.safeParse({
          visitId: '550e8400-e29b-41d4-a716-446655440000',
        }).success,
      ).toBe(true);
    });

    it('rejects invalid UUID', () => {
      expect(
        visitRouteParamsSchema.safeParse({ visitId: 'not-a-uuid' }).success,
      ).toBe(false);
    });
  });

  describe('recentSessionsQuerySchema', () => {
    it('accepts empty object (defaults)', () => {
      expect(recentSessionsQuerySchema.safeParse({}).success).toBe(true);
    });

    it('accepts limit and cursor', () => {
      expect(
        recentSessionsQuerySchema.safeParse({ limit: 10, cursor: 'abc' })
          .success,
      ).toBe(true);
    });

    it('rejects limit > 100', () => {
      expect(recentSessionsQuerySchema.safeParse({ limit: 101 }).success).toBe(
        false,
      );
    });
  });

  describe('startFromPreviousSchema', () => {
    const valid = {
      player_id: '11111111-1111-1111-1111-111111111111',
      source_visit_id: '22222222-2222-2222-2222-222222222222',
      destination_table_id: '33333333-3333-3333-3333-333333333333',
      destination_seat_number: 3,
    };

    it('accepts valid input', () => {
      expect(startFromPreviousSchema.safeParse(valid).success).toBe(true);
    });

    it('accepts optional game_settings_override', () => {
      expect(
        startFromPreviousSchema.safeParse({
          ...valid,
          game_settings_override: { min_bet: 25 },
        }).success,
      ).toBe(true);
    });

    it('rejects seat_number > 20', () => {
      expect(
        startFromPreviousSchema.safeParse({
          ...valid,
          destination_seat_number: 21,
        }).success,
      ).toBe(false);
    });

    it('rejects missing required fields', () => {
      expect(startFromPreviousSchema.safeParse({}).success).toBe(false);
      expect(
        startFromPreviousSchema.safeParse({ player_id: valid.player_id })
          .success,
      ).toBe(false);
    });
  });
});

// ============================================================================
// 9. Mapper Contract (Runtime)
// ============================================================================

describe('Visit Mapper Contract', () => {
  const visitRow = {
    id: '11111111-1111-1111-1111-111111111111',
    player_id: '22222222-2222-2222-2222-222222222222',
    casino_id: '33333333-3333-3333-3333-333333333333',
    visit_kind: 'gaming_identified_rated' as const,
    started_at: '2026-03-14T10:00:00Z',
    ended_at: null,
    visit_group_id: '11111111-1111-1111-1111-111111111111',
    gaming_day: '2026-03-14',
  };

  it('toVisitDTO maps all fields correctly', () => {
    const dto = toVisitDTO(visitRow);
    expect(dto).toEqual(visitRow);
    expect(dto).not.toBe(visitRow); // new object
  });

  it('toVisitDTOOrNull returns null for null input', () => {
    expect(toVisitDTOOrNull(null)).toBeNull();
  });

  it('toVisitDTOOrNull maps non-null row', () => {
    const dto = toVisitDTOOrNull(visitRow);
    expect(dto).not.toBeNull();
    expect(dto!.id).toBe(visitRow.id);
  });

  it('toVisitDTOList maps array', () => {
    const dtos = toVisitDTOList([visitRow, { ...visitRow, id: 'v2' }]);
    expect(dtos).toHaveLength(2);
    expect(dtos[0].id).toBe(visitRow.id);
    expect(dtos[1].id).toBe('v2');
  });

  it('toVisitDTO preserves null player_id for ghost visits', () => {
    const ghostRow = {
      ...visitRow,
      player_id: null,
      visit_kind: 'gaming_ghost_unrated' as const,
    };
    const dto = toVisitDTO(ghostRow);
    expect(dto.player_id).toBeNull();
    expect(dto.visit_kind).toBe('gaming_ghost_unrated');
  });
});

describe('Visit With Player Mapper Contract', () => {
  const visitWithPlayerRow = {
    id: '11111111-1111-1111-1111-111111111111',
    player_id: '22222222-2222-2222-2222-222222222222',
    casino_id: '33333333-3333-3333-3333-333333333333',
    visit_kind: 'gaming_identified_rated' as const,
    started_at: '2026-03-14T10:00:00Z',
    ended_at: null,
    visit_group_id: '11111111-1111-1111-1111-111111111111',
    gaming_day: '2026-03-14',
    player: {
      id: '22222222-2222-2222-2222-222222222222',
      first_name: 'John',
      last_name: 'Doe',
    },
  };

  it('toVisitWithPlayerDTO maps all fields including player', () => {
    const dto = toVisitWithPlayerDTO(visitWithPlayerRow);
    expect(dto.id).toBe(visitWithPlayerRow.id);
    expect(dto.player).toEqual({
      id: '22222222-2222-2222-2222-222222222222',
      first_name: 'John',
      last_name: 'Doe',
    });
  });

  it('toVisitWithPlayerDTO handles null player (ghost visit)', () => {
    const ghostRow = {
      ...visitWithPlayerRow,
      player_id: null,
      visit_kind: 'gaming_ghost_unrated' as const,
      player: null,
    };
    const dto = toVisitWithPlayerDTO(ghostRow);
    expect(dto.player).toBeNull();
    expect(dto.player_id).toBeNull();
  });

  it('toVisitWithPlayerDTOList maps array', () => {
    const dtos = toVisitWithPlayerDTOList([visitWithPlayerRow]);
    expect(dtos).toHaveLength(1);
    expect(dtos[0].player).not.toBeNull();
  });
});

describe('Active Visit Mapper Contract', () => {
  const visitRow = {
    id: '11111111-1111-1111-1111-111111111111',
    player_id: '22222222-2222-2222-2222-222222222222',
    casino_id: '33333333-3333-3333-3333-333333333333',
    visit_kind: 'gaming_identified_rated' as const,
    started_at: '2026-03-14T10:00:00Z',
    ended_at: null,
    visit_group_id: '11111111-1111-1111-1111-111111111111',
    gaming_day: '2026-03-14',
  };

  it('toActiveVisitDTO with row returns has_active_visit: true', () => {
    const dto = toActiveVisitDTO(visitRow);
    expect(dto.has_active_visit).toBe(true);
    expect(dto.visit).not.toBeNull();
    expect(dto.visit!.id).toBe(visitRow.id);
  });

  it('toActiveVisitDTO with null returns has_active_visit: false', () => {
    const dto = toActiveVisitDTO(null);
    expect(dto.has_active_visit).toBe(false);
    expect(dto.visit).toBeNull();
  });
});

// ============================================================================
// 10. Compile-Time Type Assertion Runtime Verification
// ============================================================================

describe('RPC Type Contract (compile-time assertions)', () => {
  it('visit table type assertions pass', () => {
    expect(_visitColumnsCheck).toBe(true);
    expect(_visitInsertCheck).toBe(true);
    expect(_playerIdOptionalCheck).toBe(true);
  });

  it('visit_kind enum assertion passes', () => {
    expect(_visitKindCheck).toBe(true);
  });

  it('rpc_start_or_resume_visit type assertions pass', () => {
    expect(_startOrResumeArgsCheck).toBe(true);
    expect(_startNoCasinoIdCheck).toBe(true);
    expect(_startNoActorIdCheck).toBe(true);
  });

  it('rpc_get_player_recent_sessions type assertions pass', () => {
    expect(_recentSessionsArgsCheck).toBe(true);
    expect(_recentSessionsNoCasinoIdCheck).toBe(true);
  });

  it('rpc_get_player_last_session_context type assertions pass', () => {
    expect(_lastSessionContextArgsCheck).toBe(true);
    expect(_lastSessionNoCasinoIdCheck).toBe(true);
  });

  it('rpc_check_table_seat_availability type assertions pass', () => {
    expect(_tableSeatAvailArgsCheck).toBe(true);
    expect(_tableSeatNoCasinoIdCheck).toBe(true);
  });
});
