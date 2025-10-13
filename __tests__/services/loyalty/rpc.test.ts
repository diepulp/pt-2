/**
 * RPC Integration Tests - Priority 3
 * Following docs/phase-6/NEXT_STEPS.md specifications
 *
 * Tests database RPC functions that power loyalty operations
 */

import { supabase, createTestPlayer, cleanupTestData } from './test-utils'

describe('increment_player_loyalty RPC', () => {
  let testPlayerId: string

  beforeEach(async () => {
    testPlayerId = await createTestPlayer()
  })

  afterEach(async () => {
    await cleanupTestData(testPlayerId)
  })

  it('updates balance and tier correctly', async () => {
    const { data, error } = await supabase.rpc('increment_player_loyalty', {
      p_player_id: testPlayerId,
      p_delta_points: 500,
    })

    expect(error).toBeNull()
    expect(data).toBeDefined()
    expect(data?.[0]?.current_balance).toBe(500)
    expect(data?.[0]?.lifetime_points).toBe(500)
    expect(data?.[0]?.tier).toBe('BRONZE') // Still BRONZE (< 1000)
  })

  it('promotes tier when crossing SILVER threshold (1000)', async () => {
    // Accrue 1000 points (SILVER threshold)
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'increment_player_loyalty',
      {
        p_player_id: testPlayerId,
        p_delta_points: 1000,
      },
    )

    expect(rpcError).toBeNull()
    expect(rpcData?.[0]?.tier).toBe('SILVER') // Should promote to SILVER

    // Verify persistence
    const { data: loyaltyData } = await supabase
      .from('player_loyalty')
      .select('tier, current_balance, lifetime_points')
      .eq('player_id', testPlayerId)
      .single()

    expect(loyaltyData?.tier).toBe('SILVER')
    expect(loyaltyData?.current_balance).toBe(1000)
    expect(loyaltyData?.lifetime_points).toBe(1000)
  })

  it('promotes tier when crossing GOLD threshold (5000)', async () => {
    // Accrue 5000 points (GOLD threshold)
    const { data, error } = await supabase.rpc('increment_player_loyalty', {
      p_player_id: testPlayerId,
      p_delta_points: 5000,
    })

    expect(error).toBeNull()
    expect(data?.[0]?.tier).toBe('GOLD')
    expect(data?.[0]?.current_balance).toBe(5000)
    expect(data?.[0]?.lifetime_points).toBe(5000)
  })

  it('promotes tier when crossing PLATINUM threshold (20000)', async () => {
    // Accrue 20000 points (PLATINUM threshold)
    const { data, error } = await supabase.rpc('increment_player_loyalty', {
      p_player_id: testPlayerId,
      p_delta_points: 20000,
    })

    expect(error).toBeNull()
    expect(data?.[0]?.tier).toBe('PLATINUM')
    expect(data?.[0]?.current_balance).toBe(20000)
    expect(data?.[0]?.lifetime_points).toBe(20000)
  })

  it('handles negative deltas (redemptions)', async () => {
    // First, give 1000 points
    await supabase.rpc('increment_player_loyalty', {
      p_player_id: testPlayerId,
      p_delta_points: 1000,
    })

    // Then redeem 300 points
    const { data, error } = await supabase.rpc('increment_player_loyalty', {
      p_player_id: testPlayerId,
      p_delta_points: -300,
    })

    expect(error).toBeNull()
    expect(data?.[0]?.current_balance).toBe(700) // 1000 - 300
    expect(data?.[0]?.lifetime_points).toBe(1000) // Lifetime unchanged by redemptions
    expect(data?.[0]?.tier).toBe('SILVER') // Tier based on lifetime, not balance
  })

  it('maintains tier after redemption', async () => {
    // Accrue to SILVER tier
    await supabase.rpc('increment_player_loyalty', {
      p_player_id: testPlayerId,
      p_delta_points: 2000,
    })

    // Verify SILVER
    const { data: beforeData } = await supabase
      .from('player_loyalty')
      .select('tier')
      .eq('player_id', testPlayerId)
      .single()

    expect(beforeData?.tier).toBe('SILVER')

    // Redeem all available balance
    await supabase.rpc('increment_player_loyalty', {
      p_player_id: testPlayerId,
      p_delta_points: -2000,
    })

    // Tier should remain SILVER (based on lifetime_points)
    const { data: afterData } = await supabase
      .from('player_loyalty')
      .select('tier, current_balance, lifetime_points')
      .eq('player_id', testPlayerId)
      .single()

    expect(afterData?.tier).toBe('SILVER')
    expect(afterData?.current_balance).toBe(0)
    expect(afterData?.lifetime_points).toBe(2000)
  })

  it('accumulates points across multiple calls', async () => {
    // Multiple small accruals
    await supabase.rpc('increment_player_loyalty', {
      p_player_id: testPlayerId,
      p_delta_points: 200,
    })

    await supabase.rpc('increment_player_loyalty', {
      p_player_id: testPlayerId,
      p_delta_points: 300,
    })

    await supabase.rpc('increment_player_loyalty', {
      p_player_id: testPlayerId,
      p_delta_points: 500,
    })

    // Verify cumulative total
    const { data } = await supabase
      .from('player_loyalty')
      .select('current_balance, lifetime_points')
      .eq('player_id', testPlayerId)
      .single()

    expect(data?.current_balance).toBe(1000) // 200 + 300 + 500
    expect(data?.lifetime_points).toBe(1000)
  })

  it('handles zero delta gracefully', async () => {
    const { data, error } = await supabase.rpc('increment_player_loyalty', {
      p_player_id: testPlayerId,
      p_delta_points: 0,
    })

    expect(error).toBeNull()
    expect(data?.[0]?.current_balance).toBe(0)
    expect(data?.[0]?.tier).toBe('BRONZE')
  })

  it('calculates tier progress correctly', async () => {
    // BRONZE tier: 0-999, progress to 1000
    await supabase.rpc('increment_player_loyalty', {
      p_player_id: testPlayerId,
      p_delta_points: 250,
    })

    const { data: bronzeData } = await supabase
      .from('player_loyalty')
      .select('tier_progress')
      .eq('player_id', testPlayerId)
      .single()

    expect(bronzeData?.tier_progress).toBe(25) // 250/1000 = 25%

    // SILVER tier: 1000-4999, progress to 5000 (range of 4000)
    await supabase.rpc('increment_player_loyalty', {
      p_player_id: testPlayerId,
      p_delta_points: 750, // Total: 1000 (SILVER)
    })

    const { data: silverData } = await supabase
      .from('player_loyalty')
      .select('tier_progress')
      .eq('player_id', testPlayerId)
      .single()

    expect(silverData?.tier_progress).toBe(0) // Just reached SILVER, 0% to GOLD
  })

  it('prevents negative balance', async () => {
    // Try to redeem more than available
    const { data, error } = await supabase.rpc('increment_player_loyalty', {
      p_player_id: testPlayerId,
      p_delta_points: -500, // No balance to redeem
    })

    // RPC should either fail or clamp to 0
    if (error) {
      expect(error).toBeDefined()
    } else {
      expect(data?.[0]?.current_balance).toBeGreaterThanOrEqual(0)
    }
  })

  it('handles concurrent updates correctly', async () => {
    // Simulate concurrent point accruals
    const promises = [
      supabase.rpc('increment_player_loyalty', {
        p_player_id: testPlayerId,
        p_delta_points: 100,
      }),
      supabase.rpc('increment_player_loyalty', {
        p_player_id: testPlayerId,
        p_delta_points: 200,
      }),
      supabase.rpc('increment_player_loyalty', {
        p_player_id: testPlayerId,
        p_delta_points: 300,
      }),
    ]

    const results = await Promise.all(promises)

    // All should succeed
    results.forEach((result) => {
      expect(result.error).toBeNull()
    })

    // Final balance should be cumulative
    const { data } = await supabase
      .from('player_loyalty')
      .select('current_balance')
      .eq('player_id', testPlayerId)
      .single()

    expect(data?.current_balance).toBe(600) // 100 + 200 + 300
  })

  it('returns updated record in response', async () => {
    const { data, error } = await supabase.rpc('increment_player_loyalty', {
      p_player_id: testPlayerId,
      p_delta_points: 1500,
    })

    expect(error).toBeNull()
    expect(data?.[0]).toMatchObject({
      player_id: testPlayerId,
      current_balance: 1500,
      lifetime_points: 1500,
      tier: 'SILVER',
    })
    expect(data?.[0]?.tier_progress).toBeDefined()
    expect(data?.[0]?.updated_at).toBeDefined()
  })
})
