import { buildMidSessionRewardRpcInput } from '@/services/loyalty/mid-session-reward';

const baseInput = {
  casinoId: 'casino-123',
  playerId: 'player-123',
  ratingSlipId: 'slip-123',
  staffId: 'staff-123',
  points: 50,
  idempotencyKey: 'request-123',
  slipStatus: 'open',
} as const;

describe('Mid-session reward payload builder', () => {
  it('maps the domain payload to the RPC input format', () => {
    const payload = buildMidSessionRewardRpcInput({
      ...baseInput,
      reason: 'promotion',
    });

    expect(payload).toEqual({
      p_casino_id: baseInput.casinoId,
      p_player_id: baseInput.playerId,
      p_rating_slip_id: baseInput.ratingSlipId,
      p_staff_id: baseInput.staffId,
      p_points: baseInput.points,
      p_idempotency_key: baseInput.idempotencyKey,
      p_reason: 'promotion',
    });
  });

  it('defaults reason to mid_session when none is provided', () => {
    const payload = buildMidSessionRewardRpcInput(baseInput);
    expect(payload.p_reason).toBe('mid_session');
  });

  it('rejects reward issuance for closed slips', () => {
    expect(() =>
      buildMidSessionRewardRpcInput({
        ...baseInput,
        slipStatus: 'closed',
      }),
    ).toThrow('Mid-session rewards require rating slip status');
  });

  it('rejects negative or non-integer point totals', () => {
    expect(() =>
      buildMidSessionRewardRpcInput({
        ...baseInput,
        points: 0,
      }),
    ).toThrow('Reward points must be a positive integer');

    expect(() =>
      buildMidSessionRewardRpcInput({
        ...baseInput,
        points: 12.5,
      }),
    ).toThrow('Reward points must be an integer');
  });

  it('requires an idempotency key to enforce retry safety', () => {
    expect(() =>
      buildMidSessionRewardRpcInput({
        ...baseInput,
        idempotencyKey: '',
      }),
    ).toThrow('Mid-session rewards require an idempotency key');
  });
});
