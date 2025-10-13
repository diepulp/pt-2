/**
 * CRUD Integration Tests - Priority 2 & 4
 * Following docs/phase-6/NEXT_STEPS.md specifications
 *
 * Includes CRITICAL idempotency tests for financial integrity
 */

import { createLoyaltyCrudService } from '@/services/loyalty/crud'
import { supabase, createTestPlayer, cleanupTestData } from './test-utils'

describe('Loyalty CRUD Service', () => {
  let testPlayerId: string
  const crudService = createLoyaltyCrudService(supabase)

  beforeEach(async () => {
    testPlayerId = await createTestPlayer()
  })

  afterEach(async () => {
    await cleanupTestData(testPlayerId)
  })

  // ─────────────────────────────────────────────────────────────
  // PRIORITY 2: IDEMPOTENCY TESTS (CRITICAL FOR FINANCIAL INTEGRITY)
  // ─────────────────────────────────────────────────────────────

  describe('createLedgerEntry idempotency', () => {
    it('soft-succeeds on duplicate session_id', async () => {
      // First call
      const result1 = await crudService.createLedgerEntry({
        player_id: testPlayerId,
        session_id: 'session-abc-123',
        points_change: 500,
        transaction_type: 'GAMEPLAY',
        reason: 'Test gameplay session',
      })

      expect(result1.success).toBe(true)
      expect(result1.data?.points_change).toBe(500)

      // Duplicate call (same session_id)
      const result2 = await crudService.createLedgerEntry({
        player_id: testPlayerId,
        session_id: 'session-abc-123', // SAME
        points_change: 500,
        transaction_type: 'GAMEPLAY',
        reason: 'Test gameplay session',
      })

      // Should soft-succeed (not throw error)
      expect(result2.success).toBe(true)

      // ⚠️ CRITICAL CHECK: Verify only ONE ledger entry exists
      const { data: ledgerEntries } = await supabase
        .from('loyalty_ledger')
        .select('*')
        .eq('session_id', 'session-abc-123')

      expect(ledgerEntries?.length).toBe(1) // ← MUST be 1, not 2
      expect(ledgerEntries?.[0].points_change).toBe(500)
    })

    it('allows different transaction_types for same session', async () => {
      // GAMEPLAY transaction for session-abc-456
      const result1 = await crudService.createLedgerEntry({
        player_id: testPlayerId,
        session_id: 'session-abc-456',
        points_change: 300,
        transaction_type: 'GAMEPLAY',
        reason: 'Gameplay points',
      })

      expect(result1.success).toBe(true)

      // MANUAL_BONUS for same session (different transaction_type)
      const result2 = await crudService.createLedgerEntry({
        player_id: testPlayerId,
        session_id: 'session-abc-456', // SAME session
        points_change: 100,
        transaction_type: 'MANUAL_BONUS', // DIFFERENT type
        reason: 'Host discretionary bonus',
      })

      // Should succeed (different transaction_type allowed)
      expect(result2.success).toBe(true)

      // Verify TWO entries exist (one per transaction_type)
      const { data: ledgerEntries } = await supabase
        .from('loyalty_ledger')
        .select('*')
        .eq('session_id', 'session-abc-456')
        .order('created_at', { ascending: true })

      expect(ledgerEntries?.length).toBe(2)
      expect(ledgerEntries?.[0].transaction_type).toBe('GAMEPLAY')
      expect(ledgerEntries?.[0].points_change).toBe(300)
      expect(ledgerEntries?.[1].transaction_type).toBe('MANUAL_BONUS')
      expect(ledgerEntries?.[1].points_change).toBe(100)
    })

    it('prevents duplicate GAMEPLAY points for same rating_slip_id', async () => {
      const ratingSlipId = 'rating-slip-789'

      // First accrual
      const result1 = await crudService.createLedgerEntry({
        player_id: testPlayerId,
        session_id: ratingSlipId,
        rating_slip_id: ratingSlipId,
        points_change: 750,
        transaction_type: 'GAMEPLAY',
        reason: `Points from rating slip ${ratingSlipId}`,
      })

      expect(result1.success).toBe(true)

      // Duplicate attempt (same rating_slip_id)
      const result2 = await crudService.createLedgerEntry({
        player_id: testPlayerId,
        session_id: ratingSlipId,
        rating_slip_id: ratingSlipId,
        points_change: 750,
        transaction_type: 'GAMEPLAY',
        reason: `Points from rating slip ${ratingSlipId}`,
      })

      expect(result2.success).toBe(true) // Soft success

      // Verify only ONE entry
      const { data: ledgerEntries } = await supabase
        .from('loyalty_ledger')
        .select('*')
        .eq('rating_slip_id', ratingSlipId)

      expect(ledgerEntries?.length).toBe(1)
    })

    it('handles concurrent duplicate submissions gracefully', async () => {
      const sessionId = 'concurrent-session-999'

      // Simulate concurrent submissions
      const promises = [
        crudService.createLedgerEntry({
          player_id: testPlayerId,
          session_id: sessionId,
          points_change: 200,
          transaction_type: 'GAMEPLAY',
          reason: 'Concurrent test 1',
        }),
        crudService.createLedgerEntry({
          player_id: testPlayerId,
          session_id: sessionId,
          points_change: 200,
          transaction_type: 'GAMEPLAY',
          reason: 'Concurrent test 2',
        }),
        crudService.createLedgerEntry({
          player_id: testPlayerId,
          session_id: sessionId,
          points_change: 200,
          transaction_type: 'GAMEPLAY',
          reason: 'Concurrent test 3',
        }),
      ]

      const results = await Promise.all(promises)

      // All should soft-succeed
      results.forEach((result) => {
        expect(result.success).toBe(true)
      })

      // But only ONE entry should exist
      const { data: ledgerEntries } = await supabase
        .from('loyalty_ledger')
        .select('*')
        .eq('session_id', sessionId)

      expect(ledgerEntries?.length).toBe(1)
    })
  })

  // ─────────────────────────────────────────────────────────────
  // PRIORITY 4: CRUD OPERATION TESTS
  // ─────────────────────────────────────────────────────────────

  describe('initializePlayerLoyalty', () => {
    it('creates initial loyalty record with correct defaults', async () => {
      // Create new player without loyalty
      const { data: newPlayer } = await supabase
        .from('player')
        .insert({ name: 'New Player' })
        .select('id')
        .single()

      const playerId = newPlayer!.id

      // Initialize loyalty
      const result = await crudService.initializePlayerLoyalty(playerId)

      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({
        player_id: playerId,
        tier: 'BRONZE',
        current_balance: 0,
        lifetime_points: 0,
        tier_progress: 0,
      })

      // Cleanup
      await supabase.from('player_loyalty').delete().eq('player_id', playerId)
      await supabase.from('player').delete().eq('id', playerId)
    })

    it('fails gracefully on duplicate initialization', async () => {
      // testPlayerId already has loyalty record from beforeEach

      const result = await crudService.initializePlayerLoyalty(testPlayerId)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('LOYALTY_ALREADY_EXISTS')
    })
  })

  describe('getPlayerLoyalty', () => {
    it('retrieves loyalty record successfully', async () => {
      const result = await crudService.getPlayerLoyalty(testPlayerId)

      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({
        player_id: testPlayerId,
        tier: 'BRONZE',
        current_balance: 0,
        lifetime_points: 0,
      })
    })

    it('throws error if loyalty record not found', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const result = await crudService.getPlayerLoyalty(nonExistentId)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('LOYALTY_NOT_FOUND')
    })
  })

  describe('updatePlayerLoyalty', () => {
    it('updates fields correctly', async () => {
      const updates = {
        current_balance: 1500,
        lifetime_points: 2000,
        tier: 'SILVER',
        tier_progress: 50,
      }

      const result = await crudService.updatePlayerLoyalty(
        testPlayerId,
        updates,
      )

      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({
        player_id: testPlayerId,
        ...updates,
      })

      // Verify persistence
      const verifyResult = await crudService.getPlayerLoyalty(testPlayerId)
      expect(verifyResult.data).toMatchObject(updates)
    })

    it('updates partial fields (selective update)', async () => {
      // Initial state
      await crudService.updatePlayerLoyalty(testPlayerId, {
        current_balance: 1000,
        lifetime_points: 1000,
        tier: 'SILVER',
      })

      // Update only current_balance
      const result = await crudService.updatePlayerLoyalty(testPlayerId, {
        current_balance: 1500,
      })

      expect(result.success).toBe(true)
      expect(result.data?.current_balance).toBe(1500)
      expect(result.data?.tier).toBe('SILVER') // Unchanged
    })

    it('throws error for non-existent player', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const result = await crudService.updatePlayerLoyalty(nonExistentId, {
        current_balance: 100,
      })

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('LOYALTY_NOT_FOUND')
    })

    it('handles negative balance correctly', async () => {
      // Set initial balance
      await crudService.updatePlayerLoyalty(testPlayerId, {
        current_balance: 1000,
      })

      // Redemption reduces balance
      const result = await crudService.updatePlayerLoyalty(testPlayerId, {
        current_balance: 700,
      })

      expect(result.success).toBe(true)
      expect(result.data?.current_balance).toBe(700)
    })
  })

  describe('createLedgerEntry', () => {
    it('creates ledger entry with all fields', async () => {
      const entry = {
        player_id: testPlayerId,
        points_change: 500,
        transaction_type: 'GAMEPLAY',
        reason: 'Test gameplay',
        source: 'system',
        event_type: 'RATING_SLIP_FINALIZED',
        session_id: 'session-123',
        rating_slip_id: 'slip-456',
        visit_id: 'visit-789',
      }

      const result = await crudService.createLedgerEntry(entry)

      expect(result.success).toBe(true)
      expect(result.data).toMatchObject(entry)
      expect(result.data?.id).toBeDefined()
      expect(result.data?.created_at).toBeDefined()
    })

    it('creates entry with minimal required fields', async () => {
      const entry = {
        player_id: testPlayerId,
        points_change: 250,
        transaction_type: 'MANUAL_BONUS',
        reason: 'Host discretion',
      }

      const result = await crudService.createLedgerEntry(entry)

      expect(result.success).toBe(true)
      expect(result.data?.player_id).toBe(testPlayerId)
      expect(result.data?.points_change).toBe(250)
      expect(result.data?.source).toBe('system') // Default
    })

    it('handles negative points (redemptions)', async () => {
      const entry = {
        player_id: testPlayerId,
        points_change: -300,
        transaction_type: 'REDEMPTION',
        reason: 'Redeemed for free play',
      }

      const result = await crudService.createLedgerEntry(entry)

      expect(result.success).toBe(true)
      expect(result.data?.points_change).toBe(-300)
    })

    it('records multiple transactions chronologically', async () => {
      // Create multiple entries
      await crudService.createLedgerEntry({
        player_id: testPlayerId,
        points_change: 100,
        transaction_type: 'GAMEPLAY',
        reason: 'Session 1',
        session_id: 'session-1',
      })

      await crudService.createLedgerEntry({
        player_id: testPlayerId,
        points_change: 200,
        transaction_type: 'GAMEPLAY',
        reason: 'Session 2',
        session_id: 'session-2',
      })

      await crudService.createLedgerEntry({
        player_id: testPlayerId,
        points_change: -50,
        transaction_type: 'REDEMPTION',
        reason: 'Redeemed reward',
        session_id: 'redemption-1',
      })

      // Verify all entries exist
      const { data: ledgerEntries } = await supabase
        .from('loyalty_ledger')
        .select('*')
        .eq('player_id', testPlayerId)
        .order('created_at', { ascending: true })

      expect(ledgerEntries?.length).toBe(3)
      expect(ledgerEntries?.[0].points_change).toBe(100)
      expect(ledgerEntries?.[1].points_change).toBe(200)
      expect(ledgerEntries?.[2].points_change).toBe(-50)
    })
  })
})
