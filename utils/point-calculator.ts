import type { GameSettings } from '@/utils/supabase/types'

export function calculatePoints(
  gameSettings: GameSettings,
  averageBet: number,
  totalRounds: number,
): number {
  const {
    house_edge,
    average_rounds_per_hour,
    point_multiplier,
    points_conversion_rate,
    seats_available = 7,
  } = gameSettings

  const theoreticalWin = ((averageBet * house_edge) / 100) * totalRounds

  let pointsEarned =
    theoreticalWin *
    (points_conversion_rate ?? 10.0) *
    (point_multiplier ?? 1.0)

  const currentSeats = seats_available ?? 7
  if (currentSeats < 7) {
    const emptySeats = 7 - currentSeats
    const bonusFactor = 1 + emptySeats * 0.05
    pointsEarned *= bonusFactor
  }

  const expectedRounds = average_rounds_per_hour
  if (totalRounds > expectedRounds) {
    pointsEarned *= 1.1
  }

  return Math.round(pointsEarned)
}
