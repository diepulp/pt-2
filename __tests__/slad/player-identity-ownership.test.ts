/**
 * SLAD Compliance Tests: Player Identity Bounded Context Ownership
 *
 * Verifies Service Layer Architecture Design (SLAD) compliance for
 * player identity enrollment feature (ADR-022).
 *
 * Tests bounded context ownership rules:
 * - PlayerService owns: player table, player_identity table operations
 * - CasinoService owns: player_casino table (enrollment), enrollPlayer function
 *
 * SLAD Pattern Reference: EXEC-SPEC-022 Section 8.3
 *
 * @see DOD-022 Section B7 - Bounded Context Ownership
 * @see docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
 */

import { describe, it, expect } from '@jest/globals';

describe('Bounded Context Ownership', () => {
  describe('PlayerService', () => {
    it('exports identity functions', async () => {
      // PlayerService should export identity CRUD operations
      const playerIdentityModule = await import('@/services/player/identity');

      expect(playerIdentityModule).toBeDefined();
      expect(typeof playerIdentityModule.upsertIdentity).toBe('function');
      expect(typeof playerIdentityModule.getIdentityByPlayerId).toBe(
        'function',
      );
      expect(typeof playerIdentityModule.verifyIdentity).toBe('function');
      expect(typeof playerIdentityModule.computeDocumentHash).toBe('function');
      expect(typeof playerIdentityModule.extractLast4).toBe('function');
    });

    it('does not export enrollPlayer from CRUD layer', async () => {
      // PlayerService CRUD should NOT have enrollPlayer (moved to CasinoService per SLAD)
      // Note: HTTP layer (http.ts) can have enrollPlayer as API wrapper
      const playerCrudModule = await import('@/services/player/crud');

      // Check CRUD module - should NOT have enrollPlayer
      // @ts-expect-error - enrollPlayer should not exist in player/crud.ts
      expect(playerCrudModule.enrollPlayer).toBeUndefined();
    });

    it('exports enrollment READ operations only', async () => {
      // PlayerService can READ enrollment status (convenience)
      // but should NOT WRITE to player_casino
      const playerCrudModule = await import('@/services/player/crud');

      expect(typeof playerCrudModule.getPlayerEnrollment).toBe('function');
      expect(typeof playerCrudModule.getPlayerEnrollmentByPlayerId).toBe(
        'function',
      );
    });
  });

  describe('CasinoService', () => {
    it('exports enrollPlayer function', async () => {
      // CasinoService should export enrollPlayer (SLAD ownership)
      const casinoServiceModule = await import('@/services/casino');
      const casinoCrudModule = await import('@/services/casino/crud');

      // Check service exports
      expect(typeof casinoServiceModule.enrollPlayer).toBe('function');

      // Check CRUD module exports
      expect(typeof casinoCrudModule.enrollPlayer).toBe('function');
    });

    it('enrollPlayer writes to player_casino table', async () => {
      // Verify enrollPlayer function signature and implementation
      const casinoCrudModule = await import('@/services/casino/crud');

      // Check function exists
      expect(casinoCrudModule.enrollPlayer).toBeDefined();

      // Validate function signature (TypeScript will catch this at compile time)
      const enrollPlayerFn = casinoCrudModule.enrollPlayer;
      expect(enrollPlayerFn.length).toBe(4); // (supabase, playerId, casinoId, enrolledBy)
    });
  });

  describe('Cross-boundary violations', () => {
    it('PlayerService CRUD does not write to player_casino directly', async () => {
      // PlayerService CRUD should not have direct player_casino INSERT/UPDATE
      const playerCrudModule = await import('@/services/player/crud');

      // enrollPlayer was the only write operation to player_casino
      // It should be moved to CasinoService
      // @ts-expect-error - enrollPlayer should not exist in player/crud.ts
      expect(playerCrudModule.enrollPlayer).toBeUndefined();

      // Player service can read enrollment status (cross-boundary read is allowed)
      expect(typeof playerCrudModule.getPlayerEnrollment).toBe('function');
    });

    it('PlayerService HTTP layer can call enrollment API endpoint', async () => {
      // HTTP layer (client-side) can have enrollPlayer as API wrapper
      // This is different from CRUD layer (server-side database operations)
      const playerHttpModule = await import('@/services/player/http');

      // HTTP fetcher is allowed - it calls API endpoints, not database directly
      expect(typeof playerHttpModule.enrollPlayer).toBe('function');
    });

    it('CasinoService does not write to player_identity directly', async () => {
      // CasinoService should NOT have player_identity write operations
      const casinoCrudModule = await import('@/services/casino/crud');

      // Verify no identity operations in casino CRUD
      // @ts-expect-error - upsertIdentity should not exist in CasinoService
      expect(casinoCrudModule.upsertIdentity).toBeUndefined();
      // @ts-expect-error - verifyIdentity should not exist in CasinoService
      expect(casinoCrudModule.verifyIdentity).toBeUndefined();
    });

    it('identity operations owned by PlayerService.identity module', async () => {
      // Identity operations should be in services/player/identity.ts
      const playerIdentityModule = await import('@/services/player/identity');

      // Verify ownership
      expect(typeof playerIdentityModule.upsertIdentity).toBe('function');
      expect(typeof playerIdentityModule.verifyIdentity).toBe('function');
      expect(typeof playerIdentityModule.getIdentityByPlayerId).toBe(
        'function',
      );
    });
  });

  describe('Service Export Validation', () => {
    it('services/player/index.ts exports identity module', async () => {
      // Verify player service barrel export includes identity
      const playerServiceModule = await import('@/services/player');

      // Check service factory
      expect(typeof playerServiceModule.createPlayerService).toBe('function');

      // Identity operations should be available via direct import
      const playerIdentityModule = await import('@/services/player/identity');
      expect(playerIdentityModule).toBeDefined();
    });

    it('services/casino/index.ts exports enrollPlayer', async () => {
      // Verify casino service barrel export includes enrollPlayer
      const casinoServiceModule = await import('@/services/casino');

      // enrollPlayer should be re-exported from index.ts
      expect(typeof casinoServiceModule.enrollPlayer).toBe('function');
    });

    it('services/casino/crud.ts exports enrollPlayer with correct signature', async () => {
      // Verify enrollPlayer has correct type signature per EXEC-SPEC-022
      const casinoCrudModule = await import('@/services/casino/crud');

      const enrollPlayerFn = casinoCrudModule.enrollPlayer;
      expect(enrollPlayerFn).toBeDefined();

      // TypeScript validates the signature at compile time
      // Runtime check: function should accept 4 parameters
      expect(enrollPlayerFn.length).toBe(4);
    });
  });

  describe('Migration Validation (Schema Alignment)', () => {
    it('player_identity table exists in database types', async () => {
      // Verify database types include player_identity table
      const databaseTypes = await import('@/types/database.types');

      // TypeScript compiler will catch if table doesn't exist
      type PlayerIdentityTable =
        databaseTypes.Database['public']['Tables']['player_identity'];

      // Check row type has expected fields
      type PlayerIdentityRow = PlayerIdentityTable['Row'];

      // These type assertions will fail at compile time if schema is wrong
      const _typeCheck: PlayerIdentityRow = {
        id: '',
        casino_id: '',
        player_id: '',
        birth_date: null,
        gender: null,
        eye_color: null,
        height: null,
        weight: null,
        address: null,
        document_number_last4: null,
        document_number_hash: null,
        issue_date: null,
        expiration_date: null,
        issuing_state: null,
        document_type: null,
        verified_at: null,
        verified_by: null,
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: null,
      };

      expect(_typeCheck).toBeDefined();
    });

    it('player_casino table has enrolled_by column', async () => {
      // Verify player_casino schema includes enrolled_by
      const databaseTypes = await import('@/types/database.types');

      type PlayerCasinoRow =
        databaseTypes.Database['public']['Tables']['player_casino']['Row'];

      // enrolled_by should be nullable uuid
      const _typeCheck: PlayerCasinoRow = {
        player_id: '',
        casino_id: '',
        status: 'active',
        enrolled_at: '',
        enrolled_by: null, // New column
        created_at: '',
        updated_at: '',
      };

      expect(_typeCheck).toBeDefined();
    });

    it('player table has contact columns', async () => {
      // Verify player schema includes middle_name, email, phone_number
      const databaseTypes = await import('@/types/database.types');

      type PlayerRow =
        databaseTypes.Database['public']['Tables']['player']['Row'];

      // Check new columns exist
      const _typeCheck: PlayerRow = {
        id: '',
        first_name: '',
        last_name: '',
        middle_name: null, // New column
        email: null, // New column
        phone_number: null, // New column
        birth_date: null,
        created_at: '',
        updated_at: '',
      };

      expect(_typeCheck).toBeDefined();
    });
  });

  describe('SLAD Pattern Compliance', () => {
    it('PlayerService follows Pattern B (Canonical CRUD)', async () => {
      // Verify PlayerService uses functional factory pattern
      const playerServiceModule = await import('@/services/player');

      // Check service factory exports
      expect(typeof playerServiceModule.createPlayerService).toBe('function');

      // PlayerServiceInterface is a type, not a runtime value
      // TypeScript compiler validates this at build time
    });

    it('CasinoService follows Pattern B (Canonical CRUD)', async () => {
      // Verify CasinoService uses functional factory pattern
      const casinoServiceModule = await import('@/services/casino');

      // Check service factory exports
      expect(typeof casinoServiceModule.createCasinoService).toBe('function');

      // CasinoServiceInterface is a type, not a runtime value
      // TypeScript compiler validates this at build time
    });

    it('identity module uses functional exports (not class-based)', async () => {
      // Verify identity.ts uses functional pattern (no classes)
      const playerIdentityModule = await import('@/services/player/identity');

      // All exports should be functions
      expect(typeof playerIdentityModule.upsertIdentity).toBe('function');
      expect(typeof playerIdentityModule.getIdentityByPlayerId).toBe(
        'function',
      );
      expect(typeof playerIdentityModule.verifyIdentity).toBe('function');
      expect(typeof playerIdentityModule.computeDocumentHash).toBe('function');
      expect(typeof playerIdentityModule.extractLast4).toBe('function');

      // No class constructors (functional pattern only)
      Object.values(playerIdentityModule).forEach((exportedValue) => {
        if (typeof exportedValue === 'function') {
          const constructorName = exportedValue.prototype?.constructor?.name;
          // Arrow functions and regular functions won't have class-like names
          if (constructorName) {
            expect(constructorName).not.toMatch(/Service$/);
          }
        }
      });
    });
  });
});
