import type {
  MidSessionRewardInput,
  MidSessionRewardRpcInput,
  MidSessionRewardReason,
  RatingSlipStatusForReward,
} from './dtos';

export type {
  MidSessionRewardInput,
  MidSessionRewardRpcInput,
  MidSessionRewardReason,
  RatingSlipStatusForReward,
};

const ELIGIBLE_STATUSES: readonly RatingSlipStatusForReward[] = [
  'open',
  'paused',
];

function assertEligibleStatus(
  status: string,
): asserts status is RatingSlipStatusForReward {
  // Use .some() to avoid `as` type assertion (ADR-012 compliance)
  if (!ELIGIBLE_STATUSES.some((s) => s === status)) {
    throw new Error(
      `Mid-session rewards require rating slip status to be one of ${ELIGIBLE_STATUSES.join(', ')}`,
    );
  }
}

function assertPositivePoints(points: number) {
  if (!Number.isFinite(points) || points <= 0) {
    throw new Error('Reward points must be a positive integer');
  }
  if (!Number.isInteger(points)) {
    throw new Error('Reward points must be an integer');
  }
}

function assertIdempotencyKey(key: string) {
  if (!key || key.trim().length === 0) {
    throw new Error('Mid-session rewards require an idempotency key');
  }
}

export function buildMidSessionRewardRpcInput(
  input: MidSessionRewardInput,
): MidSessionRewardRpcInput {
  assertEligibleStatus(input.slipStatus);
  assertPositivePoints(input.points);
  assertIdempotencyKey(input.idempotencyKey);

  return {
    p_casino_id: input.casinoId,
    p_player_id: input.playerId,
    p_rating_slip_id: input.ratingSlipId,
    p_points: input.points,
    p_idempotency_key: input.idempotencyKey,
    p_reason: input.reason ?? 'mid_session',
  };
}
