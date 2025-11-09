import {
  calculateDurationSeconds,
  closeSlip,
  pauseSlip,
  resumeSlip,
  startSlip,
} from '@/services/rating-slip/state-machine';

describe('Rating Slip State Machine', () => {
  it('derives duration from start to close without pauses', () => {
    const start = new Date('2025-05-05T10:00:00Z');
    const end = new Date('2025-05-05T10:20:00Z');

    const opened = startSlip(start);
    const closed = closeSlip(opened, end);

    expect(calculateDurationSeconds(closed)).toBe(20 * 60);
  });

  it('stops accruing time while paused and resumes afterwards', () => {
    const opened = startSlip(new Date('2025-05-05T10:00:00Z'));
    const paused = pauseSlip(opened, new Date('2025-05-05T10:10:00Z'));
    const resumed = resumeSlip(paused, new Date('2025-05-05T10:20:00Z'));
    const closed = closeSlip(resumed, new Date('2025-05-05T10:40:00Z'));

    // 40 min total - 10 min paused = 30 min active
    expect(calculateDurationSeconds(closed)).toBe(30 * 60);
  });

  it('returns derived duration for a paused slip without resuming', () => {
    const opened = startSlip(new Date('2025-05-05T10:00:00Z'));
    const paused = pauseSlip(opened, new Date('2025-05-05T10:10:00Z'));

    expect(
      calculateDurationSeconds(paused, new Date('2025-05-05T10:30:00Z')),
    ).toBe(10 * 60);
  });

  it('allows closing a paused slip and keeps duration frozen at pause time', () => {
    const opened = startSlip(new Date('2025-05-05T10:00:00Z'));
    const paused = pauseSlip(opened, new Date('2025-05-05T10:10:00Z'));
    const closed = closeSlip(paused, new Date('2025-05-05T10:25:00Z'));

    expect(calculateDurationSeconds(closed)).toBe(10 * 60);
  });

  it('prevents invalid transitions such as pausing twice in a row', () => {
    const opened = startSlip(new Date('2025-05-05T10:00:00Z'));
    const paused = pauseSlip(opened, new Date('2025-05-05T10:05:00Z'));

    expect(() =>
      pauseSlip(paused, new Date('2025-05-05T10:06:00Z')),
    ).toThrow('Only open slips can be paused');
  });
});
