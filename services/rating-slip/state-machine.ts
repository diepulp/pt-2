type RatingSlipStatus = 'open' | 'paused' | 'closed';

export interface PauseInterval {
  start: Date;
  end?: Date;
}

export interface RatingSlipTimeline {
  startTime: Date;
  endTime?: Date;
  status: RatingSlipStatus;
  pauses: PauseInterval[];
}

export function startSlip(startTime: Date): RatingSlipTimeline {
  return {
    startTime,
    status: 'open',
    pauses: [],
  };
}

function clonePauses(pauses: PauseInterval[]): PauseInterval[] {
  return pauses.map((pause) => ({ ...pause }));
}

function lastPause(timeline: RatingSlipTimeline): PauseInterval | undefined {
  return timeline.pauses[timeline.pauses.length - 1];
}

function assertChronology(reference: Date, next: Date, label: string) {
  if (next.getTime() <= reference.getTime()) {
    throw new Error(`${label} must be later than ${reference.toISOString()}`);
  }
}

function lastEventTimestamp(timeline: RatingSlipTimeline): Date {
  if (timeline.status === 'closed' && timeline.endTime) {
    return timeline.endTime;
  }

  const last = lastPause(timeline);
  if (!last) {
    return timeline.startTime;
  }

  if (timeline.status === 'paused' && !last.end) {
    return last.start;
  }

  return last.end ?? timeline.startTime;
}

export function pauseSlip(
  timeline: RatingSlipTimeline,
  pausedAt: Date,
): RatingSlipTimeline {
  if (timeline.status !== 'open') {
    throw new Error('Only open slips can be paused');
  }

  const reference = lastEventTimestamp(timeline);
  assertChronology(reference, pausedAt, 'Pause time');

  const pauses = clonePauses(timeline.pauses);
  pauses.push({ start: pausedAt });

  return {
    ...timeline,
    status: 'paused',
    pauses,
  };
}

export function resumeSlip(
  timeline: RatingSlipTimeline,
  resumedAt: Date,
): RatingSlipTimeline {
  if (timeline.status !== 'paused') {
    throw new Error('Only paused slips can be resumed');
  }

  const pauses = clonePauses(timeline.pauses);
  const currentPause = pauses.pop();
  if (!currentPause || currentPause.end) {
    throw new Error('No active pause interval to resume');
  }

  assertChronology(currentPause.start, resumedAt, 'Resume time');

  pauses.push({ ...currentPause, end: resumedAt });

  return {
    ...timeline,
    status: 'open',
    pauses,
  };
}

export function closeSlip(
  timeline: RatingSlipTimeline,
  closedAt: Date,
): RatingSlipTimeline {
  if (timeline.status === 'closed') {
    throw new Error('Slip is already closed');
  }

  const reference = lastEventTimestamp(timeline);
  assertChronology(reference, closedAt, 'Close time');

  const pauses = clonePauses(timeline.pauses);
  const currentPause = pauses.pop();
  if (timeline.status === 'paused') {
    if (!currentPause || currentPause.end) {
      throw new Error('Paused slip must have an open pause interval');
    }
    pauses.push({ ...currentPause, end: closedAt });
  } else if (currentPause) {
    pauses.push(currentPause);
  }

  return {
    ...timeline,
    status: 'closed',
    endTime: closedAt,
    pauses,
  };
}

function normalizePauseEnd(
  pause: PauseInterval,
  timeline: RatingSlipTimeline,
  asOf: Date,
): Date {
  if (pause.end) {
    return pause.end;
  }

  if (timeline.status === 'paused') {
    return asOf;
  }

  throw new Error('Encountered unterminated pause on a non-paused slip');
}

export function calculateDurationSeconds(
  timeline: RatingSlipTimeline,
  asOf = new Date(),
): number {
  const effectiveEnd =
    timeline.status === 'closed' && timeline.endTime ? timeline.endTime : asOf;

  if (effectiveEnd.getTime() < timeline.startTime.getTime()) {
    throw new Error('Timeline end precedes start');
  }

  const totalElapsedMs = effectiveEnd.getTime() - timeline.startTime.getTime();

  const pausedMs = timeline.pauses.reduce((sum, pause) => {
    const pauseEnd = normalizePauseEnd(pause, timeline, asOf);
    if (pauseEnd.getTime() < pause.start.getTime()) {
      throw new Error('Pause interval end precedes start');
    }

    const cappedEnd = Math.min(pauseEnd.getTime(), effectiveEnd.getTime());
    if (cappedEnd <= pause.start.getTime()) {
      return sum;
    }

    return sum + (cappedEnd - pause.start.getTime());
  }, 0);

  const activeMs = Math.max(0, totalElapsedMs - pausedMs);
  return Math.floor(activeMs / 1000);
}
