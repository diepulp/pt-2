/**
 * Test utilities for Loyalty Service testing
 * Following docs/phase-6/NEXT_STEPS.md specifications
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

// Use local Supabase for tests with service role to bypass RLS
export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
)

/**
 * Create a test player with loyalty record
 * @returns Player ID
 */
export async function createTestPlayer(name?: string): Promise<string> {
  // Create player with required fields
  const timestamp = Date.now()
  const { data: player, error: playerError } = await supabase
    .from('player')
    .insert({
      firstName: name || 'Test',
      lastName: `Player-${timestamp}`,
      email: `test-${timestamp}@example.com`,
    })
    .select('id')
    .single()

  if (playerError) throw playerError

  // Initialize loyalty record
  const { error: loyaltyError } = await supabase.from('player_loyalty').insert({
    player_id: player.id,
    tier: 'BRONZE',
    current_balance: 0,
    lifetime_points: 0,
    tier_progress: 0,
  })

  if (loyaltyError) throw loyaltyError

  return player.id
}

/**
 * Clean up test data for a player
 * @param playerId - Player UUID to clean up
 */
export async function cleanupTestData(playerId: string): Promise<void> {
  // Delete in order due to foreign key constraints
  await supabase.from('loyalty_ledger').delete().eq('player_id', playerId)
  await supabase.from('player_loyalty').delete().eq('player_id', playerId)
  await supabase.from('player').delete().eq('id', playerId)
}

/**
 * Create mock game settings for testing
 */
export function createMockGameSettings(
  overrides?: Partial<{
    house_edge: number
    average_rounds_per_hour: number
    point_multiplier: number
    points_conversion_rate: number
    seats_available: number
  }>,
) {
  return {
    house_edge: 2.7,
    average_rounds_per_hour: 60,
    point_multiplier: 1.0,
    points_conversion_rate: 10.0,
    seats_available: 7,
    name: 'Test Roulette',
    ...overrides,
  }
}
