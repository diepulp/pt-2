/**
 * Player Identity Constraint Tests (ADR-022 WS5)
 *
 * Tests database-level constraints for player_identity table:
 * - Foreign key constraints
 * - Unique constraints
 * - Check constraints (gender)
 *
 * PREREQUISITES:
 * - Migrations 20251225120000-20251225120006 must be applied
 * - Local Supabase running: `npx supabase start`
 * - SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 *
 * @see docs/20-architecture/specs/ADR-022/EXEC-SPEC-022.md Section 2
 * @see docs/20-architecture/specs/ADR-022/DOD-022.md Section A
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { computeDocumentHash } from '@/services/player/identity';
import type { Database } from '@/types/database.types';

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe('player-identity Database Constraints (ADR-022)', () => {
  let serviceClient: SupabaseClient<Database>;

  let casinoId: string;
  let staffId: string;
  let userId: string;
  let playerId: string;

  beforeAll(async () => {
    serviceClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // Create test user
    const { data: user } = await serviceClient.auth.admin.createUser({
      email: `test-constraints-${Date.now()}@example.com`,
      password: 'test-password',
      email_confirm: true,
    });
    userId = user!.user.id;

    // Create test casino
    const { data: casino } = await serviceClient
      .from('casino')
      .insert({ name: 'Constraint Test Casino' })
      .select('id')
      .single();
    casinoId = casino!.id;

    // Create test staff
    const { data: staff } = await serviceClient
      .from('staff')
      .insert({
        user_id: userId,
        casino_id: casinoId,
        role: 'pit_boss',
        name: 'Test Staff',
        status: 'active',
      })
      .select('id')
      .single();
    staffId = staff!.id;

    // Create test player
    const { data: player } = await serviceClient
      .from('player')
      .insert({
        first_name: 'Constraint',
        last_name: 'Test',
        birth_date: '1980-01-01',
      })
      .select('id')
      .single();
    playerId = player!.id;

    // Enroll player
    await serviceClient.from('player_casino').insert({
      player_id: playerId,
      casino_id: casinoId,
      status: 'active',
      enrolled_by: staffId,
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
    await serviceClient.auth.admin.deleteUser(userId);
  });

  describe('A1. Foreign Key Constraints', () => {
    it('FK: (casino_id, player_id) must exist in player_casino', async () => {
      // Create player without enrollment
      const { data: unenrolledPlayer } = await serviceClient
        .from('player')
        .insert({
          first_name: 'Unenrolled',
          last_name: 'Player',
          birth_date: '1990-01-01',
        })
        .select('id')
        .single();

      // Try to create identity without enrollment
      const { error } = await serviceClient.from('player_identity').insert({
        casino_id: casinoId,
        player_id: unenrolledPlayer!.id,
        created_by: staffId,
      });

      expect(error).toBeDefined();
      expect(error?.code).toBe('23503'); // foreign_key_violation
      expect(error?.message).toContain('fk_player_identity_enrollment');

      // Cleanup
      await serviceClient
        .from('player')
        .delete()
        .eq('id', unenrolledPlayer!.id);
    });

    it('FK: casino_id must exist in casino table', async () => {
      const { error } = await serviceClient.from('player_identity').insert({
        casino_id: '00000000-0000-0000-0000-000000000000',
        player_id: playerId,
        created_by: staffId,
      });

      expect(error).toBeDefined();
      expect(error?.code).toBe('23503'); // foreign_key_violation
      expect(error?.message).toContain('player_identity_casino_id_fkey');
    });

    it('FK: player_id must exist in player table', async () => {
      const { error } = await serviceClient.from('player_identity').insert({
        casino_id: casinoId,
        player_id: '00000000-0000-0000-0000-000000000000',
        created_by: staffId,
      });

      expect(error).toBeDefined();
      expect(error?.code).toBe('23503'); // foreign_key_violation
      expect(error?.message).toContain('player_identity_player_id_fkey');
    });

    it('FK: created_by must exist in staff table', async () => {
      const { error } = await serviceClient.from('player_identity').insert({
        casino_id: casinoId,
        player_id: playerId,
        created_by: '00000000-0000-0000-0000-000000000000',
      });

      expect(error).toBeDefined();
      expect(error?.code).toBe('23503'); // foreign_key_violation
      expect(error?.message).toContain('player_identity_created_by_fkey');
    });

    it('FK: updated_by must exist in staff table when set', async () => {
      // Create identity
      const { data: identity } = await serviceClient
        .from('player_identity')
        .insert({
          casino_id: casinoId,
          player_id: playerId,
          created_by: staffId,
        })
        .select()
        .single();

      // Try to update with invalid updated_by
      const { error } = await serviceClient
        .from('player_identity')
        .update({ updated_by: '00000000-0000-0000-0000-000000000000' })
        .eq('id', identity!.id);

      expect(error).toBeDefined();
      expect(error?.code).toBe('23503'); // foreign_key_violation
      expect(error?.message).toContain('player_identity_updated_by_fkey');

      // Cleanup
      await serviceClient
        .from('player_identity')
        .delete()
        .eq('id', identity!.id);
    });

    it('FK: verified_by must exist in staff table when set', async () => {
      // Create identity
      const { data: identity } = await serviceClient
        .from('player_identity')
        .insert({
          casino_id: casinoId,
          player_id: playerId,
          created_by: staffId,
        })
        .select()
        .single();

      // Try to update with invalid verified_by
      const { error } = await serviceClient
        .from('player_identity')
        .update({
          verified_by: '00000000-0000-0000-0000-000000000000',
          verified_at: new Date().toISOString(),
        })
        .eq('id', identity!.id);

      expect(error).toBeDefined();
      expect(error?.code).toBe('23503'); // foreign_key_violation
      expect(error?.message).toContain('player_identity_verified_by_fkey');

      // Cleanup
      await serviceClient
        .from('player_identity')
        .delete()
        .eq('id', identity!.id);
    });
  });

  describe('A2. Unique Constraints', () => {
    it('UNIQUE: (casino_id, player_id) prevents duplicate enrollments', async () => {
      // Create first identity
      const { data: identity1 } = await serviceClient
        .from('player_identity')
        .insert({
          casino_id: casinoId,
          player_id: playerId,
          created_by: staffId,
          birth_date: '1980-01-01',
        })
        .select()
        .single();

      // Try to create second identity for same player in same casino
      const { error } = await serviceClient.from('player_identity').insert({
        casino_id: casinoId,
        player_id: playerId,
        created_by: staffId,
        birth_date: '1980-01-01',
      });

      expect(error).toBeDefined();
      expect(error?.code).toBe('23505'); // unique_violation
      expect(error?.message).toContain('player_identity_pkey');

      // Cleanup
      await serviceClient
        .from('player_identity')
        .delete()
        .eq('id', identity1!.id);
    });

    it('UNIQUE: (casino_id, document_number_hash) prevents duplicate documents', async () => {
      // Create second player
      const { data: player2 } = await serviceClient
        .from('player')
        .insert({
          first_name: 'Second',
          last_name: 'Player',
          birth_date: '1985-05-15',
        })
        .select('id')
        .single();

      await serviceClient.from('player_casino').insert({
        player_id: player2!.id,
        casino_id: casinoId,
        status: 'active',
        enrolled_by: staffId,
      });

      const documentHash = computeDocumentHash('D1234567');

      // Create first identity with document hash
      const { data: identity1 } = await serviceClient
        .from('player_identity')
        .insert({
          casino_id: casinoId,
          player_id: playerId,
          created_by: staffId,
          document_number_hash: documentHash,
          document_number_last4: '4567',
        })
        .select()
        .single();

      // Try to create second identity with same document hash
      const { error } = await serviceClient.from('player_identity').insert({
        casino_id: casinoId,
        player_id: player2!.id,
        created_by: staffId,
        document_number_hash: documentHash,
        document_number_last4: '4567',
      });

      expect(error).toBeDefined();
      expect(error?.code).toBe('23505'); // unique_violation
      expect(error?.message).toContain('ux_player_identity_doc_hash');

      // Cleanup
      await serviceClient
        .from('player_identity')
        .delete()
        .eq('id', identity1!.id);
      await serviceClient
        .from('player_casino')
        .delete()
        .eq('player_id', player2!.id);
      await serviceClient.from('player').delete().eq('id', player2!.id);
    });

    it('UNIQUE: document_hash constraint allows NULL (multiple players without documents)', async () => {
      // Create two players without documents
      const { data: player2 } = await serviceClient
        .from('player')
        .insert({
          first_name: 'NoDoc',
          last_name: 'One',
          birth_date: '1985-05-15',
        })
        .select('id')
        .single();

      const { data: player3 } = await serviceClient
        .from('player')
        .insert({
          first_name: 'NoDoc',
          last_name: 'Two',
          birth_date: '1990-10-10',
        })
        .select('id')
        .single();

      await serviceClient.from('player_casino').insert([
        {
          player_id: player2!.id,
          casino_id: casinoId,
          status: 'active',
          enrolled_by: staffId,
        },
        {
          player_id: player3!.id,
          casino_id: casinoId,
          status: 'active',
          enrolled_by: staffId,
        },
      ]);

      // Create identities with NULL document_number_hash
      const { data: identity1, error: error1 } = await serviceClient
        .from('player_identity')
        .insert({
          casino_id: casinoId,
          player_id: player2!.id,
          created_by: staffId,
          document_number_hash: null,
        })
        .select()
        .single();

      const { data: identity2, error: error2 } = await serviceClient
        .from('player_identity')
        .insert({
          casino_id: casinoId,
          player_id: player3!.id,
          created_by: staffId,
          document_number_hash: null,
        })
        .select()
        .single();

      // Both should succeed (NULL is not considered duplicate)
      expect(error1).toBeNull();
      expect(error2).toBeNull();
      expect(identity1).toBeDefined();
      expect(identity2).toBeDefined();

      // Cleanup
      await serviceClient
        .from('player_identity')
        .delete()
        .eq('id', identity1!.id);
      await serviceClient
        .from('player_identity')
        .delete()
        .eq('id', identity2!.id);
      await serviceClient
        .from('player_casino')
        .delete()
        .eq('player_id', player2!.id);
      await serviceClient
        .from('player_casino')
        .delete()
        .eq('player_id', player3!.id);
      await serviceClient.from('player').delete().eq('id', player2!.id);
      await serviceClient.from('player').delete().eq('id', player3!.id);
    });
  });

  describe('A3. Check Constraints', () => {
    it('CHECK: gender must be m, f, or x', async () => {
      // Valid values
      const validGenders = ['m', 'f', 'x'];

      for (const gender of validGenders) {
        const { data: player } = await serviceClient
          .from('player')
          .insert({
            first_name: 'Gender',
            last_name: `Test-${gender}`,
            birth_date: '1990-01-01',
          })
          .select('id')
          .single();

        await serviceClient.from('player_casino').insert({
          player_id: player!.id,
          casino_id: casinoId,
          status: 'active',
          enrolled_by: staffId,
        });

        const { data, error } = await serviceClient
          .from('player_identity')
          .insert({
            casino_id: casinoId,
            player_id: player!.id,
            created_by: staffId,
            gender,
          })
          .select()
          .single();

        expect(error).toBeNull();
        expect(data?.gender).toBe(gender);

        // Cleanup
        await serviceClient.from('player_identity').delete().eq('id', data!.id);
        await serviceClient
          .from('player_casino')
          .delete()
          .eq('player_id', player!.id);
        await serviceClient.from('player').delete().eq('id', player!.id);
      }
    });

    it('CHECK: gender rejects invalid values', async () => {
      const invalidGenders = ['male', 'female', 'M', 'F', 'X', 'other', ''];

      for (const gender of invalidGenders) {
        const { error } = await serviceClient.from('player_identity').insert({
          casino_id: casinoId,
          player_id: playerId,
          created_by: staffId,
          gender: gender as 'm' | 'f' | 'x',
        });

        expect(error).toBeDefined();
        expect(error?.code).toBe('23514'); // check_violation
        expect(error?.message).toContain('gender');
      }
    });

    it('CHECK: gender allows NULL', async () => {
      const { data: player } = await serviceClient
        .from('player')
        .insert({
          first_name: 'No',
          last_name: 'Gender',
          birth_date: '1990-01-01',
        })
        .select('id')
        .single();

      await serviceClient.from('player_casino').insert({
        player_id: player!.id,
        casino_id: casinoId,
        status: 'active',
        enrolled_by: staffId,
      });

      const { data, error } = await serviceClient
        .from('player_identity')
        .insert({
          casino_id: casinoId,
          player_id: player!.id,
          created_by: staffId,
          gender: null,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.gender).toBeNull();

      // Cleanup
      await serviceClient.from('player_identity').delete().eq('id', data!.id);
      await serviceClient
        .from('player_casino')
        .delete()
        .eq('player_id', player!.id);
      await serviceClient.from('player').delete().eq('id', player!.id);
    });
  });

  describe('A4. NOT NULL Constraints', () => {
    it('NOT NULL: casino_id is required', async () => {
      const { error } = await serviceClient.from('player_identity').insert({
        // @ts-expect-error Testing database constraint
        casino_id: null,
        player_id: playerId,
        created_by: staffId,
      });

      expect(error).toBeDefined();
      expect(error?.code).toBe('23502'); // not_null_violation
      expect(error?.message).toContain('casino_id');
    });

    it('NOT NULL: player_id is required', async () => {
      const { error } = await serviceClient.from('player_identity').insert({
        casino_id: casinoId,
        // @ts-expect-error Testing database constraint
        player_id: null,
        created_by: staffId,
      });

      expect(error).toBeDefined();
      expect(error?.code).toBe('23502'); // not_null_violation
      expect(error?.message).toContain('player_id');
    });

    it('NOT NULL: created_by is required', async () => {
      const { error } = await serviceClient.from('player_identity').insert({
        casino_id: casinoId,
        player_id: playerId,
        // @ts-expect-error Testing database constraint
        created_by: null,
      });

      expect(error).toBeDefined();
      expect(error?.code).toBe('23502'); // not_null_violation
      expect(error?.message).toContain('created_by');
    });
  });

  describe('A5. Composite Constraints', () => {
    it('Composite FK: (casino_id, player_id) validates both fields together', async () => {
      // Create second casino and player
      const { data: casino2 } = await serviceClient
        .from('casino')
        .insert({ name: 'Second Casino' })
        .select('id')
        .single();

      const { data: player2 } = await serviceClient
        .from('player')
        .insert({
          first_name: 'Other',
          last_name: 'Player',
          birth_date: '1990-01-01',
        })
        .select('id')
        .single();

      // Enroll player2 in casino1 (NOT casino2)
      await serviceClient.from('player_casino').insert({
        player_id: player2!.id,
        casino_id: casinoId,
        status: 'active',
        enrolled_by: staffId,
      });

      // Try to create identity with mismatched (casino2, player2)
      // player2 is enrolled in casino1, not casino2
      const { error } = await serviceClient.from('player_identity').insert({
        casino_id: casino2!.id,
        player_id: player2!.id,
        created_by: staffId,
      });

      expect(error).toBeDefined();
      expect(error?.code).toBe('23503'); // foreign_key_violation
      expect(error?.message).toContain('fk_player_identity_enrollment');

      // Cleanup
      await serviceClient
        .from('player_casino')
        .delete()
        .eq('player_id', player2!.id);
      await serviceClient.from('player').delete().eq('id', player2!.id);
      await serviceClient.from('casino').delete().eq('id', casino2!.id);
    });
  });
});
