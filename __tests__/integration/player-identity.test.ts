/**
 * Player Identity Integration Tests (ADR-022 WS5)
 *
 * Tests player_identity service layer operations including:
 * - Identity creation via upsertIdentity
 * - Document hash uniqueness constraint
 * - Immutability trigger (casino_id, player_id, created_by)
 * - Auto-populated fields (updated_at, updated_by)
 * - Actor binding enforcement
 *
 * PREREQUISITES:
 * - Migrations 20251225120000-20251225120006 must be applied
 * - Local Supabase running: `npx supabase start`
 * - SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 *
 * @see docs/20-architecture/specs/ADR-022/EXEC-SPEC-022.md Section 8
 * @see docs/20-architecture/specs/ADR-022/DOD-022.md Section C
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { injectRLSContext } from '@/lib/supabase/rls-context';
import type { PlayerIdentityInput } from '@/services/player/dtos';
import {
  upsertIdentity,
  getIdentityByPlayerId,
  verifyIdentity,
  computeDocumentHash,
  extractLast4,
} from '@/services/player/identity';
import type { Database } from '@/types/database.types';

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe('player-identity Integration Tests (ADR-022)', () => {
  let serviceClient: SupabaseClient<Database>;
  let pitBossClient: SupabaseClient<Database>;
  let adminClient: SupabaseClient<Database>;

  let casinoId: string;
  let pitBossId: string;
  let adminId: string;
  let userId1: string;
  let userId2: string;
  let playerId: string;

  beforeAll(async () => {
    serviceClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // Create test users
    const { data: user1 } = await serviceClient.auth.admin.createUser({
      email: `test-pit-boss-${Date.now()}@example.com`,
      password: 'test-password',
      email_confirm: true,
    });
    userId1 = user1!.user.id;

    const { data: user2 } = await serviceClient.auth.admin.createUser({
      email: `test-admin-${Date.now()}@example.com`,
      password: 'test-password',
      email_confirm: true,
    });
    userId2 = user2!.user.id;

    // Create test casino
    const { data: casino } = await serviceClient
      .from('casino')
      .insert({ name: 'Test Casino' })
      .select('id')
      .single();
    casinoId = casino!.id;

    // Create test staff
    const { data: pitBoss } = await serviceClient
      .from('staff')
      .insert({
        user_id: userId1,
        casino_id: casinoId,
        role: 'pit_boss',
        name: 'Pit Boss',
        status: 'active',
      })
      .select('id')
      .single();
    pitBossId = pitBoss!.id;

    const { data: admin } = await serviceClient
      .from('staff')
      .insert({
        user_id: userId2,
        casino_id: casinoId,
        role: 'admin',
        name: 'Admin',
        status: 'active',
      })
      .select('id')
      .single();
    adminId = admin!.id;

    // Create authenticated clients with RLS context
    pitBossClient = createClient<Database>(supabaseUrl, supabaseServiceKey);
    adminClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

    await injectRLSContext(pitBossClient, {
      actorId: pitBossId,
      casinoId,
      staffRole: 'pit_boss',
    });

    await injectRLSContext(adminClient, {
      actorId: adminId,
      casinoId,
      staffRole: 'admin',
    });

    // Create test player
    const { data: player } = await serviceClient
      .from('player')
      .insert({
        first_name: 'John',
        last_name: 'Doe',
        birth_date: '1980-01-01',
      })
      .select('id')
      .single();
    playerId = player!.id;

    // Enroll player in casino
    await serviceClient.from('player_casino').insert({
      player_id: playerId,
      casino_id: casinoId,
      status: 'active',
      enrolled_by: pitBossId,
    });
  });

  afterAll(async () => {
    // Cleanup test data
    await serviceClient
      .from('player_identity')
      .delete()
      .eq('casino_id', casinoId);
    await serviceClient
      .from('player_casino')
      .delete()
      .eq('casino_id', casinoId);
    await serviceClient.from('player').delete().eq('id', playerId);
    await serviceClient.from('staff').delete().eq('casino_id', casinoId);
    await serviceClient.from('casino').delete().eq('id', casinoId);
    await serviceClient.auth.admin.deleteUser(userId1);
    await serviceClient.auth.admin.deleteUser(userId2);
  });

  describe('C1. Document Hash Functions', () => {
    it('computeDocumentHash produces consistent SHA-256 hash', () => {
      const doc1 = 'D1234567';
      const doc2 = 'd1234567'; // lowercase
      const doc3 = '  D1234567  '; // with whitespace

      const hash1 = computeDocumentHash(doc1);
      const hash2 = computeDocumentHash(doc2);
      const hash3 = computeDocumentHash(doc3);

      // All should produce same hash (normalized to uppercase, trimmed)
      expect(hash1).toBe(hash2);
      expect(hash1).toBe(hash3);

      // Hash should be 64 hex characters (SHA-256)
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('computeDocumentHash produces different hashes for different documents', () => {
      const hash1 = computeDocumentHash('D1234567');
      const hash2 = computeDocumentHash('D7654321');

      expect(hash1).not.toBe(hash2);
    });

    it('extractLast4 returns last 4 alphanumeric characters', () => {
      expect(extractLast4('D1234567')).toBe('4567');
      expect(extractLast4('D-1234-567')).toBe('4567');
      expect(extractLast4('ABC-DEF-123')).toBe('F123');
      expect(extractLast4('XY')).toBe('XY'); // Less than 4
    });
  });

  describe('C2. Identity Creation via upsertIdentity', () => {
    it('creates new identity with document hash and last4', async () => {
      const input: PlayerIdentityInput = {
        documentNumber: 'D1234567',
        birthDate: '1980-01-01',
        gender: 'm',
        eyeColor: 'brown',
        height: '6-01',
        weight: '180',
        documentType: 'drivers_license',
        issueDate: '2020-01-01',
        expirationDate: '2025-01-01',
        issuingState: 'NV',
        address: {
          street: '123 Main St',
          city: 'Las Vegas',
          state: 'NV',
          postalCode: '89101',
        },
      };

      const identity = await upsertIdentity(
        pitBossClient,
        casinoId,
        playerId,
        input,
        pitBossId,
      );

      expect(identity).toBeDefined();
      expect(identity.id).toBeDefined();
      expect(identity.casino_id).toBe(casinoId);
      expect(identity.player_id).toBe(playerId);
      expect(identity.birth_date).toBe('1980-01-01');
      expect(identity.gender).toBe('m');
      expect(identity.eye_color).toBe('brown');
      expect(identity.height).toBe('6-01');
      expect(identity.weight).toBe('180');
      expect(identity.document_number_last4).toBe('4567');
      expect(identity.document_type).toBe('drivers_license');
      expect(identity.issue_date).toBe('2020-01-01');
      expect(identity.expiration_date).toBe('2025-01-01');
      expect(identity.issuing_state).toBe('NV');
      expect(identity.created_by).toBe(pitBossId);
      expect(identity.created_at).toBeDefined();
      expect(identity.updated_at).toBeDefined();

      // Camel-cased convenience fields
      expect(identity.casinoId).toBe(casinoId);
      expect(identity.playerId).toBe(playerId);
      expect(identity.birthDate).toBe('1980-01-01');
      expect(identity.eyeColor).toBe('brown');
      expect(identity.documentNumberLast4).toBe('4567');
      expect(identity.documentType).toBe('drivers_license');

      // Address should be structured
      expect(identity.address).toEqual({
        street: '123 Main St',
        city: 'Las Vegas',
        state: 'NV',
        postalCode: '89101',
      });
    });

    it('upserts existing identity (idempotent)', async () => {
      const input: PlayerIdentityInput = {
        documentNumber: 'D1234567',
        birthDate: '1980-01-01',
        gender: 'm',
      };

      // First insert
      const identity1 = await upsertIdentity(
        pitBossClient,
        casinoId,
        playerId,
        input,
        pitBossId,
      );

      // Second insert (should update, not create new)
      const updatedInput: PlayerIdentityInput = {
        documentNumber: 'D1234567',
        birthDate: '1980-01-01',
        gender: 'm',
        eyeColor: 'blue', // New field
      };

      const identity2 = await upsertIdentity(
        pitBossClient,
        casinoId,
        playerId,
        updatedInput,
        pitBossId,
      );

      // Same ID (upserted)
      expect(identity2.id).toBe(identity1.id);
      expect(identity2.eye_color).toBe('blue');
    });

    it('creates identity without document number (optional)', async () => {
      // Create second player for this test
      const { data: player2 } = await serviceClient
        .from('player')
        .insert({
          first_name: 'Jane',
          last_name: 'Smith',
          birth_date: '1985-05-15',
        })
        .select('id')
        .single();

      await serviceClient.from('player_casino').insert({
        player_id: player2!.id,
        casino_id: casinoId,
        status: 'active',
        enrolled_by: pitBossId,
      });

      const input: PlayerIdentityInput = {
        birthDate: '1985-05-15',
        gender: 'f',
      };

      const identity = await upsertIdentity(
        pitBossClient,
        casinoId,
        player2!.id,
        input,
        pitBossId,
      );

      expect(identity.document_number_last4).toBeNull();
      expect(identity.birth_date).toBe('1985-05-15');
      expect(identity.gender).toBe('f');

      // Cleanup
      await serviceClient
        .from('player_identity')
        .delete()
        .eq('id', identity.id);
      await serviceClient
        .from('player_casino')
        .delete()
        .eq('player_id', player2!.id);
      await serviceClient.from('player').delete().eq('id', player2!.id);
    });

    it('throws PLAYER_NOT_FOUND when enrollment missing (FK violation)', async () => {
      // Create player without enrollment
      const { data: player3 } = await serviceClient
        .from('player')
        .insert({
          first_name: 'Bob',
          last_name: 'Test',
          birth_date: '1990-01-01',
        })
        .select('id')
        .single();

      const input: PlayerIdentityInput = {
        birthDate: '1990-01-01',
        gender: 'm',
      };

      await expect(
        upsertIdentity(pitBossClient, casinoId, player3!.id, input, pitBossId),
      ).rejects.toThrow('Player must be enrolled before adding identity');

      // Cleanup
      await serviceClient.from('player').delete().eq('id', player3!.id);
    });
  });

  describe('C3. Document Hash Uniqueness Constraint', () => {
    it('prevents duplicate document numbers in same casino', async () => {
      // Create second player
      const { data: player2 } = await serviceClient
        .from('player')
        .insert({
          first_name: 'Jane',
          last_name: 'Duplicate',
          birth_date: '1990-05-15',
        })
        .select('id')
        .single();

      await serviceClient.from('player_casino').insert({
        player_id: player2!.id,
        casino_id: casinoId,
        status: 'active',
        enrolled_by: pitBossId,
      });

      // First player identity with document
      const input1: PlayerIdentityInput = {
        documentNumber: 'UNIQUEDOC123',
        birthDate: '1980-01-01',
        gender: 'm',
      };

      await upsertIdentity(
        pitBossClient,
        casinoId,
        playerId,
        input1,
        pitBossId,
      );

      // Try to create second player with same document number
      const input2: PlayerIdentityInput = {
        documentNumber: 'UNIQUEDOC123', // Same document
        birthDate: '1990-05-15',
        gender: 'f',
      };

      await expect(
        upsertIdentity(pitBossClient, casinoId, player2!.id, input2, pitBossId),
      ).rejects.toThrow('Document number already registered in this casino');

      // Cleanup
      await serviceClient
        .from('player_casino')
        .delete()
        .eq('player_id', player2!.id);
      await serviceClient.from('player').delete().eq('id', player2!.id);
    });
  });

  describe('C4. Immutability Trigger', () => {
    let identityId: string;

    beforeAll(async () => {
      // Create identity for immutability tests
      const input: PlayerIdentityInput = {
        documentNumber: 'IMMUTABLE123',
        birthDate: '1980-01-01',
        gender: 'm',
      };

      const identity = await upsertIdentity(
        pitBossClient,
        casinoId,
        playerId,
        input,
        pitBossId,
      );
      identityId = identity.id;
    });

    it('prevents casino_id modification', async () => {
      // Create second casino
      const { data: casino2 } = await serviceClient
        .from('casino')
        .insert({ name: 'Second Casino' })
        .select('id')
        .single();

      const { error } = await serviceClient
        .from('player_identity')
        .update({ casino_id: casino2!.id })
        .eq('id', identityId);

      expect(error).toBeDefined();
      expect(error?.code).toBe('23514'); // check_violation
      expect(error?.message).toContain('casino_id is immutable');

      // Cleanup
      await serviceClient.from('casino').delete().eq('id', casino2!.id);
    });

    it('prevents player_id modification', async () => {
      // Create second player
      const { data: player2 } = await serviceClient
        .from('player')
        .insert({
          first_name: 'Other',
          last_name: 'Player',
          birth_date: '1990-01-01',
        })
        .select('id')
        .single();

      const { error } = await serviceClient
        .from('player_identity')
        .update({ player_id: player2!.id })
        .eq('id', identityId);

      expect(error).toBeDefined();
      expect(error?.code).toBe('23514'); // check_violation
      expect(error?.message).toContain('player_id is immutable');

      // Cleanup
      await serviceClient.from('player').delete().eq('id', player2!.id);
    });

    it('prevents created_by modification', async () => {
      const { error } = await serviceClient
        .from('player_identity')
        .update({ created_by: adminId })
        .eq('id', identityId);

      expect(error).toBeDefined();
      expect(error?.code).toBe('23514'); // check_violation
      expect(error?.message).toContain('created_by is immutable');
    });

    it('allows mutable field updates', async () => {
      const { data, error } = await serviceClient
        .from('player_identity')
        .update({ eye_color: 'green', height: '6-02' })
        .eq('id', identityId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.eye_color).toBe('green');
      expect(data?.height).toBe('6-02');
    });
  });

  describe('C5. Auto-populated Fields', () => {
    it('auto-populates updated_at on UPDATE', async () => {
      const input: PlayerIdentityInput = {
        documentNumber: 'UPDATETEST123',
        birthDate: '1980-01-01',
        gender: 'm',
      };

      const identity = await upsertIdentity(
        pitBossClient,
        casinoId,
        playerId,
        input,
        pitBossId,
      );

      const originalUpdatedAt = identity.updated_at;

      // Wait 100ms to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Update via service client to bypass service layer
      const { data } = await serviceClient
        .from('player_identity')
        .update({ eye_color: 'blue' })
        .eq('id', identity.id)
        .select()
        .single();

      expect(data?.updated_at).toBeDefined();
      expect(new Date(data!.updated_at).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime(),
      );
    });

    it('auto-populates updated_by from RLS context on UPDATE', async () => {
      const input: PlayerIdentityInput = {
        documentNumber: 'ACTORTEST123',
        birthDate: '1980-01-01',
        gender: 'm',
      };

      const identity = await upsertIdentity(
        pitBossClient,
        casinoId,
        playerId,
        input,
        pitBossId,
      );

      expect(identity.created_by).toBe(pitBossId);
      expect(identity.updated_by).toBeNull(); // Initially null on INSERT

      // Update as admin (different actor)
      await adminClient
        .from('player_identity')
        .update({ eye_color: 'hazel' })
        .eq('id', identity.id);

      // Verify updated_by changed to admin
      const { data } = await serviceClient
        .from('player_identity')
        .select('updated_by')
        .eq('id', identity.id)
        .single();

      expect(data?.updated_by).toBe(adminId);
    });
  });

  describe('C6. Actor Binding', () => {
    it('created_by matches actorId on INSERT', async () => {
      const input: PlayerIdentityInput = {
        documentNumber: 'BINDINGTEST123',
        birthDate: '1980-01-01',
        gender: 'm',
      };

      const identity = await upsertIdentity(
        pitBossClient,
        casinoId,
        playerId,
        input,
        pitBossId,
      );

      expect(identity.created_by).toBe(pitBossId);
    });

    it('rejects spoofed created_by (RLS WITH CHECK)', async () => {
      const { error } = await pitBossClient.from('player_identity').insert({
        casino_id: casinoId,
        player_id: playerId,
        created_by: adminId, // Spoofed actor
        birth_date: '1980-01-01',
      });

      expect(error).toBeDefined();
      expect(error?.code).toBe('42501'); // RLS policy violation
    });
  });

  describe('C7. getIdentityByPlayerId', () => {
    it('retrieves identity by player_id', async () => {
      const input: PlayerIdentityInput = {
        documentNumber: 'GETBYID123',
        birthDate: '1980-01-01',
        gender: 'm',
      };

      await upsertIdentity(pitBossClient, casinoId, playerId, input, pitBossId);

      const identity = await getIdentityByPlayerId(pitBossClient, playerId);

      expect(identity).toBeDefined();
      expect(identity?.player_id).toBe(playerId);
      expect(identity?.casino_id).toBe(casinoId);
    });

    it('returns null when identity not found', async () => {
      // Create player without identity
      const { data: player2 } = await serviceClient
        .from('player')
        .insert({
          first_name: 'No',
          last_name: 'Identity',
          birth_date: '1990-01-01',
        })
        .select('id')
        .single();

      await serviceClient.from('player_casino').insert({
        player_id: player2!.id,
        casino_id: casinoId,
        status: 'active',
        enrolled_by: pitBossId,
      });

      const identity = await getIdentityByPlayerId(pitBossClient, player2!.id);

      expect(identity).toBeNull();

      // Cleanup
      await serviceClient
        .from('player_casino')
        .delete()
        .eq('player_id', player2!.id);
      await serviceClient.from('player').delete().eq('id', player2!.id);
    });
  });

  describe('C8. verifyIdentity', () => {
    it('marks identity as verified', async () => {
      const input: PlayerIdentityInput = {
        documentNumber: 'VERIFY123',
        birthDate: '1980-01-01',
        gender: 'm',
      };

      const identity = await upsertIdentity(
        pitBossClient,
        casinoId,
        playerId,
        input,
        pitBossId,
      );

      expect(identity.verified_at).toBeNull();
      expect(identity.verified_by).toBeNull();

      const verified = await verifyIdentity(
        pitBossClient,
        identity.id,
        pitBossId,
      );

      expect(verified.verified_at).toBeDefined();
      expect(verified.verified_by).toBe(pitBossId);
    });

    it('throws PLAYER_NOT_FOUND when identity not found', async () => {
      await expect(
        verifyIdentity(pitBossClient, 'non-existent-id', pitBossId),
      ).rejects.toThrow();
    });
  });
});
