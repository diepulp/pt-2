/** @jest-environment node */

/**
 * Player RPC Contract Tests (Integration Canary)
 *
 * Combines compile-time type assertions with runtime contract tests
 * for the Player bounded context. Modeled on Casino exemplar
 * (setup-wizard-rpc.int.test.ts).
 *
 * Environment: node (server-side schemas, no DOM dependencies).
 * Gating: Tests that require Supabase use describe.skip
 * when RUN_INTEGRATION_TESTS is unset. This file's tests are pure
 * schema/type/algorithm validation and run unconditionally.
 *
 * Test groups:
 * 1. Player table type contract (compile-time)
 * 2. RPC type contract — rpc_create_player (compile-time)
 * 3. Exclusion RPC type contract — rpc_get_player_exclusion_status (compile-time)
 * 4. Schema validation (runtime — Zod schemas)
 * 5. Mapper contract (runtime — row → DTO)
 *
 * @see ADR-022 Player Identity Enrollment
 * @see ADR-024 Authoritative Context Derivation
 * @see ADR-042 Player Exclusion Architecture
 * @see TESTING_GOVERNANCE_STANDARD.md §3.5
 */

import type { Database } from '@/types/database.types';

import {
  createPlayerSchema,
  playerIdentitySchema,
  playerRouteParamsSchema,
  updatePlayerSchema,
} from '../schemas';
import {
  createExclusionSchema,
  exclusionDetailParamsSchema,
  exclusionRouteParamsSchema,
  liftExclusionSchema,
} from '../exclusion-schemas';
import { toPlayerDTO, toPlayerDTOOrNull, toPlayerDTOList } from '../mappers';
import {
  toExclusionDTO,
  toExclusionDTOOrNull,
  toExclusionDTOList,
} from '../exclusion-mappers';

// ============================================================================
// Type Aliases
// ============================================================================

type Tables = Database['public']['Tables'];
type RpcFunctions = Database['public']['Functions'];
type Enums = Database['public']['Enums'];

type PlayerRow = Tables['player']['Row'];
type PlayerInsert = Tables['player']['Insert'];
type PlayerCasinoRow = Tables['player_casino']['Row'];
type PlayerExclusionRow = Tables['player_exclusion']['Row'];

// ============================================================================
// 1. Player Table Type Contract — Compile-Time Assertions
// ============================================================================

// --- player table columns ---
type _AssertPlayerColumns = PlayerRow extends {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  created_at: string;
  middle_name: string | null;
  email: string | null;
  phone_number: string | null;
}
  ? true
  : never;
const _playerColumnsCheck: _AssertPlayerColumns = true;

// --- player insert requires first_name, last_name ---
type _AssertPlayerInsertRequired = PlayerInsert extends {
  first_name: string;
  last_name: string;
}
  ? true
  : never;
const _playerInsertCheck: _AssertPlayerInsertRequired = true;

// --- player_casino columns ---
type _AssertPlayerCasinoColumns = PlayerCasinoRow extends {
  player_id: string;
  casino_id: string;
  status: string;
  enrolled_at: string;
}
  ? true
  : never;
const _playerCasinoCheck: _AssertPlayerCasinoColumns = true;

// --- player_exclusion columns ---
type _AssertExclusionColumns = PlayerExclusionRow extends {
  id: string;
  casino_id: string;
  player_id: string;
  exclusion_type: Enums['exclusion_type'];
  enforcement: Enums['exclusion_enforcement'];
  reason: string;
  created_by: string;
}
  ? true
  : never;
const _exclusionColumnsCheck: _AssertExclusionColumns = true;

// ============================================================================
// 2. RPC Type Contract — rpc_create_player (Compile-Time)
// ============================================================================

type CreatePlayerArgs = RpcFunctions['rpc_create_player']['Args'];

// Verify args: p_first_name, p_last_name, p_birth_date — no spoofable params
type _AssertCreatePlayerArgs = CreatePlayerArgs extends {
  p_first_name: string;
  p_last_name: string;
}
  ? true
  : never;
const _createPlayerArgsCheck: _AssertCreatePlayerArgs = true;

// ADR-024: No spoofable p_casino_id or p_actor_id
type _AssertNoCasinoIdParam = 'p_casino_id' extends keyof CreatePlayerArgs
  ? never
  : true;
const _noCasinoIdCheck: _AssertNoCasinoIdParam = true;

type _AssertNoActorIdParam = 'p_actor_id' extends keyof CreatePlayerArgs
  ? never
  : true;
const _noActorIdCheck: _AssertNoActorIdParam = true;

// ============================================================================
// 3. Exclusion RPC Type Contract (Compile-Time)
// ============================================================================

type ExclusionStatusArgs =
  RpcFunctions['rpc_get_player_exclusion_status']['Args'];

// Verify exclusion status RPC args — only p_player_id, no casino spoofing
type _AssertExclusionStatusArgs = ExclusionStatusArgs extends {
  p_player_id: string;
}
  ? true
  : never;
const _exclusionStatusArgsCheck: _AssertExclusionStatusArgs = true;

type _AssertExclusionNoCasinoId =
  'p_casino_id' extends keyof ExclusionStatusArgs ? never : true;
const _exclusionNoCasinoIdCheck: _AssertExclusionNoCasinoId = true;

// ============================================================================
// 4. Enum Type Assertions
// ============================================================================

type _AssertExclusionTypeEnum = Enums['exclusion_type'] extends
  | 'self_exclusion'
  | 'trespass'
  | 'regulatory'
  | 'internal_ban'
  | 'watchlist'
  ? true
  : never;
const _exclusionTypeCheck: _AssertExclusionTypeEnum = true;

type _AssertExclusionEnforcementEnum = Enums['exclusion_enforcement'] extends
  | 'hard_block'
  | 'soft_alert'
  | 'monitor'
  ? true
  : never;
const _exclusionEnforcementCheck: _AssertExclusionEnforcementEnum = true;

// ============================================================================
// 5. Schema Validation Tests (Runtime)
// ============================================================================

describe('Player Schema Contract', () => {
  describe('createPlayerSchema', () => {
    it('accepts valid input with required fields', () => {
      const result = createPlayerSchema.safeParse({
        first_name: 'John',
        last_name: 'Doe',
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional birth_date', () => {
      const result = createPlayerSchema.safeParse({
        first_name: 'John',
        last_name: 'Doe',
        birth_date: '1990-05-15',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing required fields', () => {
      expect(createPlayerSchema.safeParse({}).success).toBe(false);
      expect(createPlayerSchema.safeParse({ first_name: 'John' }).success).toBe(
        false,
      );
    });
  });

  describe('updatePlayerSchema', () => {
    it('accepts partial update with single field', () => {
      expect(
        updatePlayerSchema.safeParse({ first_name: 'Updated' }).success,
      ).toBe(true);
    });

    it('rejects empty object', () => {
      expect(updatePlayerSchema.safeParse({}).success).toBe(false);
    });

    it('validates email format when provided', () => {
      expect(updatePlayerSchema.safeParse({ email: 'invalid' }).success).toBe(
        false,
      );
      expect(
        updatePlayerSchema.safeParse({ email: 'valid@example.com' }).success,
      ).toBe(true);
    });
  });

  describe('playerRouteParamsSchema', () => {
    it('accepts valid UUID', () => {
      expect(
        playerRouteParamsSchema.safeParse({
          playerId: '550e8400-e29b-41d4-a716-446655440000',
        }).success,
      ).toBe(true);
    });

    it('rejects invalid UUID', () => {
      expect(
        playerRouteParamsSchema.safeParse({ playerId: 'not-a-uuid' }).success,
      ).toBe(false);
    });
  });

  describe('playerIdentitySchema', () => {
    it('accepts valid identity payload', () => {
      const result = playerIdentitySchema.safeParse({
        documentNumber: 'DL12345678',
        birthDate: '1985-03-20',
        gender: 'm',
        documentType: 'drivers_license',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid gender value', () => {
      expect(
        playerIdentitySchema.safeParse({ gender: 'invalid' }).success,
      ).toBe(false);
    });

    it('validates height format', () => {
      expect(playerIdentitySchema.safeParse({ height: '6-01' }).success).toBe(
        true,
      );
      expect(playerIdentitySchema.safeParse({ height: '6ft' }).success).toBe(
        false,
      );
    });
  });
});

describe('Exclusion Schema Contract', () => {
  const validExclusion = {
    player_id: '11111111-1111-1111-1111-111111111111',
    exclusion_type: 'internal_ban',
    enforcement: 'hard_block',
    reason: 'Disruptive behavior',
  };

  describe('createExclusionSchema', () => {
    it('accepts valid minimal input', () => {
      expect(createExclusionSchema.safeParse(validExclusion).success).toBe(
        true,
      );
    });

    it('rejects invalid exclusion_type', () => {
      expect(
        createExclusionSchema.safeParse({
          ...validExclusion,
          exclusion_type: 'invalid',
        }).success,
      ).toBe(false);
    });

    it('validates all exclusion_type enum values', () => {
      const types = [
        'self_exclusion',
        'trespass',
        'regulatory',
        'internal_ban',
        'watchlist',
      ];
      for (const type of types) {
        expect(
          createExclusionSchema.safeParse({
            ...validExclusion,
            exclusion_type: type,
          }).success,
        ).toBe(true);
      }
    });

    it('validates all enforcement enum values', () => {
      const enforcements = ['hard_block', 'soft_alert', 'monitor'];
      for (const enforcement of enforcements) {
        expect(
          createExclusionSchema.safeParse({
            ...validExclusion,
            enforcement,
          }).success,
        ).toBe(true);
      }
    });
  });

  describe('liftExclusionSchema', () => {
    it('accepts valid lift reason', () => {
      expect(
        liftExclusionSchema.safeParse({
          lift_reason: 'Ban period expired',
        }).success,
      ).toBe(true);
    });

    it('rejects empty lift_reason', () => {
      expect(liftExclusionSchema.safeParse({ lift_reason: '' }).success).toBe(
        false,
      );
    });
  });

  describe('exclusionRouteParamsSchema', () => {
    it('accepts valid playerId', () => {
      expect(
        exclusionRouteParamsSchema.safeParse({
          playerId: '11111111-1111-1111-1111-111111111111',
        }).success,
      ).toBe(true);
    });
  });

  describe('exclusionDetailParamsSchema', () => {
    it('requires both playerId and exclusionId', () => {
      expect(
        exclusionDetailParamsSchema.safeParse({
          playerId: '11111111-1111-1111-1111-111111111111',
          exclusionId: '22222222-2222-2222-2222-222222222222',
        }).success,
      ).toBe(true);

      expect(
        exclusionDetailParamsSchema.safeParse({
          playerId: '11111111-1111-1111-1111-111111111111',
        }).success,
      ).toBe(false);
    });
  });
});

// ============================================================================
// 6. Mapper Contract (Runtime)
// ============================================================================

describe('Player Mapper Contract', () => {
  const playerRow = {
    id: '11111111-1111-1111-1111-111111111111',
    first_name: 'John',
    last_name: 'Doe',
    birth_date: '1990-01-15',
    created_at: '2025-01-01T00:00:00Z',
    middle_name: null,
    email: null,
    phone_number: null,
  };

  it('toPlayerDTO maps all fields correctly', () => {
    const dto = toPlayerDTO(playerRow);
    expect(dto).toEqual(playerRow);
    expect(dto).not.toBe(playerRow); // new object
  });

  it('toPlayerDTOOrNull returns null for null input', () => {
    expect(toPlayerDTOOrNull(null)).toBeNull();
  });

  it('toPlayerDTOOrNull maps non-null row', () => {
    const dto = toPlayerDTOOrNull(playerRow);
    expect(dto).not.toBeNull();
    expect(dto!.id).toBe(playerRow.id);
  });

  it('toPlayerDTOList maps array', () => {
    const dtos = toPlayerDTOList([playerRow, { ...playerRow, id: 'p2' }]);
    expect(dtos).toHaveLength(2);
    expect(dtos[0].id).toBe(playerRow.id);
    expect(dtos[1].id).toBe('p2');
  });
});

describe('Exclusion Mapper Contract', () => {
  const exclusionRow = {
    id: '11111111-1111-1111-1111-111111111111',
    casino_id: '22222222-2222-2222-2222-222222222222',
    player_id: '33333333-3333-3333-3333-333333333333',
    exclusion_type: 'internal_ban',
    enforcement: 'hard_block',
    effective_from: '2026-03-01T00:00:00Z',
    effective_until: null,
    review_date: null,
    reason: 'Test exclusion',
    external_ref: null,
    jurisdiction: null,
    created_by: '44444444-4444-4444-4444-444444444444',
    created_at: '2026-03-01T00:00:00Z',
    lifted_by: null,
    lifted_at: null,
    lift_reason: null,
  };

  it('toExclusionDTO maps all fields', () => {
    const dto = toExclusionDTO(exclusionRow);
    expect(dto.id).toBe(exclusionRow.id);
    expect(dto.exclusion_type).toBe('internal_ban');
    expect(dto.enforcement).toBe('hard_block');
    expect(dto).not.toBe(exclusionRow);
  });

  it('toExclusionDTOOrNull returns null for null', () => {
    expect(toExclusionDTOOrNull(null)).toBeNull();
  });

  it('toExclusionDTOList maps array', () => {
    const dtos = toExclusionDTOList([exclusionRow]);
    expect(dtos).toHaveLength(1);
  });
});

// ============================================================================
// 7. Compile-Time Type Assertion Runtime Verification
// ============================================================================

describe('RPC Type Contract (compile-time assertions)', () => {
  it('player table type assertions pass', () => {
    expect(_playerColumnsCheck).toBe(true);
    expect(_playerInsertCheck).toBe(true);
    expect(_playerCasinoCheck).toBe(true);
  });

  it('rpc_create_player type assertions pass', () => {
    expect(_createPlayerArgsCheck).toBe(true);
    expect(_noCasinoIdCheck).toBe(true);
    expect(_noActorIdCheck).toBe(true);
  });

  it('exclusion type assertions pass', () => {
    expect(_exclusionColumnsCheck).toBe(true);
    expect(_exclusionStatusArgsCheck).toBe(true);
    expect(_exclusionNoCasinoIdCheck).toBe(true);
  });

  it('enum assertions pass', () => {
    expect(_exclusionTypeCheck).toBe(true);
    expect(_exclusionEnforcementCheck).toBe(true);
  });
});
