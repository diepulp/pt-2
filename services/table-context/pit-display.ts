/**
 * Pit Display Module (ADR-047 D3, D5, D6)
 *
 * Session-only badge derivation for pit-facing surfaces.
 * derivePitDisplayBadge() accepts only SessionPhase | null | undefined —
 * no tableAvailability parameter. This is type-enforced surface separation.
 *
 * @see ADR-047 Operator–Admin Surface Separation
 * @see PRD-058 WS2
 */

import type { SessionPhase } from './dtos';

// === Pit Display States (session-derived only) ===

/** Live states + OPEN reserved for future custodial chain workflow (D3.1) */
export type PitDisplayState = 'IN_PLAY' | 'RUNDOWN' | 'CLOSED' | 'OPEN';

export const PIT_DISPLAY_LABELS: Record<PitDisplayState, string> = {
  IN_PLAY: 'In Play',
  RUNDOWN: 'Rundown',
  CLOSED: 'Closed',
  OPEN: 'Open', // D3.1: deferred — no code path produces this today
};

export interface PitDisplayBadge {
  state: PitDisplayState;
  label: string;
  /** Tailwind color token prefix */
  color: 'emerald' | 'amber' | 'blue' | 'zinc';
  /** Whether to show pulse ring animation */
  pulse: boolean;
  /** Whether to dim the badge */
  dimmed: boolean;
}

/**
 * D5: Pit surface badge derivation — single source of truth.
 *
 * Derives display state from session phase ONLY.
 * No tableAvailability parameter — pit surface pre-filters to active tables (D2),
 * making the parameter redundant and the separation type-enforced.
 *
 * @see ADR-047 D3 display state table
 * @see ADR-047 D7 scenarios S1–S6
 */
export function derivePitDisplayBadge(
  sessionPhase: SessionPhase | null | undefined,
): PitDisplayBadge {
  if (sessionPhase === 'ACTIVE') {
    return {
      state: 'IN_PLAY',
      label: 'In Play',
      color: 'emerald',
      pulse: true,
      dimmed: false,
    };
  }
  if (sessionPhase === 'RUNDOWN') {
    return {
      state: 'RUNDOWN',
      label: 'Rundown',
      color: 'amber',
      pulse: false,
      dimmed: false,
    };
  }
  if (sessionPhase === 'OPEN') {
    // D3.1: defensive compatibility branch — no code path produces OPEN today
    return {
      state: 'OPEN',
      label: 'Open',
      color: 'blue',
      pulse: false,
      dimmed: false,
    };
  }
  // null/undefined session → CLOSED (D3.2: derived monitoring state)
  return {
    state: 'CLOSED',
    label: 'Closed',
    color: 'zinc',
    pulse: false,
    dimmed: false,
  };
}
