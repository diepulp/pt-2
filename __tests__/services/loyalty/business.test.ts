/**
 * Business Logic Tests - Priority 1
 * Following docs/phase-6/NEXT_STEPS.md specifications
 *
 * Target: >80% coverage for services/loyalty/business.ts
 */

import {
  calculatePoints,
  calculateTier,
  calculateTierProgress,
  LOYALTY_TIERS,
  type PointsCalculationInput,
} from '@/services/loyalty/business'

import { createMockGameSettings } from './test-utils'

describe('calculatePoints', () => {
  const baseInput: PointsCalculationInput = {
    averageBet: 100,
    totalRounds: 60,
    gameSettings: createMockGameSettings(),
    playerTier: 'BRONZE',
  }

  it('matches PT-1 parity (baseline calculation)', () => {
    // Given: Standard gameplay session
    // averageBet: 100, rounds: 60, house_edge: 2.7%
    // theoreticalWin = 100 * 0.027 * 60 = 162
    // basePoints = 162 * 10 * 1.0 = 1620
    // BRONZE multiplier = 1.0 → 1620
    // No bonuses applied → 1620 points
    const points = calculatePoints(baseInput)

    expect(points).toBe(1620)
  })

  it('applies tier multipliers correctly', () => {
    // BRONZE: 1.0x multiplier
    const bronzePoints = calculatePoints({
      ...baseInput,
      playerTier: 'BRONZE',
    })
    expect(bronzePoints).toBe(1620) // 1620 * 1.0

    // SILVER: 1.25x multiplier
    const silverPoints = calculatePoints({
      ...baseInput,
      playerTier: 'SILVER',
    })
    expect(silverPoints).toBe(2025) // 1620 * 1.25

    // GOLD: 1.5x multiplier
    const goldPoints = calculatePoints({
      ...baseInput,
      playerTier: 'GOLD',
    })
    expect(goldPoints).toBe(2430) // 1620 * 1.5

    // PLATINUM: 2.0x multiplier
    const platinumPoints = calculatePoints({
      ...baseInput,
      playerTier: 'PLATINUM',
    })
    expect(platinumPoints).toBe(3240) // 1620 * 2.0
  })

  it('handles edge cases (zero bet, zero duration)', () => {
    // Zero bet should result in zero points
    const zeroBetPoints = calculatePoints({
      ...baseInput,
      averageBet: 0,
    })
    expect(zeroBetPoints).toBe(0)

    // Zero rounds should result in zero points
    const zeroRoundsPoints = calculatePoints({
      ...baseInput,
      totalRounds: 0,
    })
    expect(zeroRoundsPoints).toBe(0)
  })

  it('applies empty seat bonus correctly', () => {
    // Baseline: 7 seats (no bonus)
    const basePoints = calculatePoints({
      ...baseInput,
      gameSettings: createMockGameSettings({ seats_available: 7 }),
    })
    expect(basePoints).toBe(1620)

    // 6 seats: 1 empty seat = 5% bonus
    const oneSeatEmptyPoints = calculatePoints({
      ...baseInput,
      gameSettings: createMockGameSettings({ seats_available: 6 }),
    })
    expect(oneSeatEmptyPoints).toBe(1701) // 1620 * 1.05

    // 5 seats: 2 empty seats = 10% bonus
    const twoSeatsEmptyPoints = calculatePoints({
      ...baseInput,
      gameSettings: createMockGameSettings({ seats_available: 5 }),
    })
    expect(twoSeatsEmptyPoints).toBe(1782) // 1620 * 1.10

    // 3 seats: 4 empty seats = 20% bonus
    const fourSeatsEmptyPoints = calculatePoints({
      ...baseInput,
      gameSettings: createMockGameSettings({ seats_available: 3 }),
    })
    expect(fourSeatsEmptyPoints).toBe(1944) // 1620 * 1.20
  })

  it('applies high volume bonus correctly', () => {
    // Baseline: 60 rounds (equals average_rounds_per_hour, no bonus)
    const basePoints = calculatePoints({
      ...baseInput,
      totalRounds: 60,
      gameSettings: createMockGameSettings({ average_rounds_per_hour: 60 }),
    })
    expect(basePoints).toBe(1620)

    // High volume: 61 rounds (exceeds average, 10% bonus)
    const highVolumePoints = calculatePoints({
      ...baseInput,
      totalRounds: 61,
      gameSettings: createMockGameSettings({ average_rounds_per_hour: 60 }),
    })
    // theoreticalWin = 100 * 0.027 * 61 = 164.7
    // basePoints = 164.7 * 10 * 1.0 * 1.0 (BRONZE) * 1.10 (high volume) = 1811.7 → 1812
    expect(highVolumePoints).toBe(1812)

    // Very high volume: 100 rounds
    const veryHighVolumePoints = calculatePoints({
      ...baseInput,
      totalRounds: 100,
      gameSettings: createMockGameSettings({ average_rounds_per_hour: 60 }),
    })
    expect(veryHighVolumePoints).toBe(2970) // Base for 100 rounds * 1.10
  })

  it('combines multiple bonuses correctly', () => {
    // SILVER tier (1.25x) + empty seats (2 empty = 10%) + high volume (10%)
    const combinedBonusPoints = calculatePoints({
      ...baseInput,
      playerTier: 'SILVER',
      totalRounds: 61,
      gameSettings: createMockGameSettings({
        seats_available: 5,
        average_rounds_per_hour: 60,
      }),
    })

    // theoreticalWin = 100 * 0.027 * 61 = 164.7
    // basePoints = 164.7 * 10 * 1.0 = 1647
    // * SILVER (1.25) = 2058.75
    // * empty seats (1.10) = 2264.625
    // * high volume (1.10) = 2491.0875
    // Rounded = 2491
    expect(combinedBonusPoints).toBe(2491)
  })

  it('handles custom point multipliers', () => {
    // Double point multiplier (promotional event)
    const doublePointsSettings = createMockGameSettings({
      point_multiplier: 2.0,
    })

    const doublePoints = calculatePoints({
      ...baseInput,
      gameSettings: doublePointsSettings,
    })

    expect(doublePoints).toBe(3240) // 1620 * 2.0
  })

  it('handles custom conversion rates', () => {
    // Higher conversion rate (more generous rewards)
    const generousSettings = createMockGameSettings({
      points_conversion_rate: 20.0,
    })

    const generousPoints = calculatePoints({
      ...baseInput,
      gameSettings: generousSettings,
    })

    expect(generousPoints).toBe(3240) // 1620 * 2.0
  })

  it('rounds points to integer', () => {
    // Use values that produce non-integer results
    const fractionalPoints = calculatePoints({
      averageBet: 33,
      totalRounds: 17,
      gameSettings: createMockGameSettings(),
      playerTier: 'SILVER',
    })

    expect(Number.isInteger(fractionalPoints)).toBe(true)
  })
})

describe('calculateTier', () => {
  it('returns BRONZE for 0-999 points', () => {
    expect(calculateTier(0)).toBe('BRONZE')
    expect(calculateTier(500)).toBe('BRONZE')
    expect(calculateTier(999)).toBe('BRONZE')
  })

  it('promotes to SILVER at exactly 1000 points', () => {
    expect(calculateTier(1000)).toBe('SILVER')
  })

  it('maintains SILVER for 1000-4999 points', () => {
    expect(calculateTier(1001)).toBe('SILVER')
    expect(calculateTier(2500)).toBe('SILVER')
    expect(calculateTier(4999)).toBe('SILVER')
  })

  it('promotes to GOLD at exactly 5000 points', () => {
    expect(calculateTier(5000)).toBe('GOLD')
  })

  it('maintains GOLD for 5000-19999 points', () => {
    expect(calculateTier(5001)).toBe('GOLD')
    expect(calculateTier(10000)).toBe('GOLD')
    expect(calculateTier(19999)).toBe('GOLD')
  })

  it('promotes to PLATINUM at exactly 20000 points', () => {
    expect(calculateTier(20000)).toBe('PLATINUM')
  })

  it('maintains PLATINUM for 20000+ points', () => {
    expect(calculateTier(20001)).toBe('PLATINUM')
    expect(calculateTier(50000)).toBe('PLATINUM')
    expect(calculateTier(1000000)).toBe('PLATINUM')
  })

  it('matches tier threshold definitions', () => {
    // Verify tier boundaries match LOYALTY_TIERS constants
    expect(calculateTier(LOYALTY_TIERS.BRONZE.minPoints)).toBe('BRONZE')
    expect(calculateTier(LOYALTY_TIERS.SILVER.minPoints)).toBe('SILVER')
    expect(calculateTier(LOYALTY_TIERS.GOLD.minPoints)).toBe('GOLD')
    expect(calculateTier(LOYALTY_TIERS.PLATINUM.minPoints)).toBe('PLATINUM')
  })
})

describe('calculateTierProgress', () => {
  it('calculates progress to next tier (BRONZE to SILVER)', () => {
    // BRONZE: 0-999, SILVER starts at 1000
    expect(calculateTierProgress(0)).toBe(0) // 0/1000 = 0%
    expect(calculateTierProgress(250)).toBe(25) // 250/1000 = 25%
    expect(calculateTierProgress(500)).toBe(50) // 500/1000 = 50%
    expect(calculateTierProgress(750)).toBe(75) // 750/1000 = 75%
    expect(calculateTierProgress(999)).toBe(100) // 999/1000 = 99.9% → 100%
  })

  it('calculates progress to next tier (SILVER to GOLD)', () => {
    // SILVER: 1000-4999, GOLD starts at 5000 (range = 4000)
    expect(calculateTierProgress(1000)).toBe(0) // 0/4000 = 0%
    expect(calculateTierProgress(2000)).toBe(25) // 1000/4000 = 25%
    expect(calculateTierProgress(3000)).toBe(50) // 2000/4000 = 50%
    expect(calculateTierProgress(4000)).toBe(75) // 3000/4000 = 75%
  })

  it('calculates progress to next tier (GOLD to PLATINUM)', () => {
    // GOLD: 5000-19999, PLATINUM starts at 20000 (range = 15000)
    expect(calculateTierProgress(5000)).toBe(0) // 0/15000 = 0%
    expect(calculateTierProgress(8750)).toBe(25) // 3750/15000 = 25%
    expect(calculateTierProgress(12500)).toBe(50) // 7500/15000 = 50%
    expect(calculateTierProgress(16250)).toBe(75) // 11250/15000 = 75%
  })

  it('returns 100% for PLATINUM tier (max tier)', () => {
    expect(calculateTierProgress(20000)).toBe(100)
    expect(calculateTierProgress(50000)).toBe(100)
    expect(calculateTierProgress(1000000)).toBe(100)
  })

  it('returns integer percentage', () => {
    // Verify all results are integers
    const progressValues = [0, 333, 777, 1234, 5678, 12345, 25000]

    progressValues.forEach((points) => {
      const progress = calculateTierProgress(points)
      expect(Number.isInteger(progress)).toBe(true)
      expect(progress).toBeGreaterThanOrEqual(0)
      expect(progress).toBeLessThanOrEqual(100)
    })
  })
})
