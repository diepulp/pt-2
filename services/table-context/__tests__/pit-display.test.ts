/** @jest-environment node */

import { derivePitDisplayBadge, PIT_DISPLAY_LABELS } from '../pit-display';
import type { PitDisplayState } from '../pit-display';

describe('derivePitDisplayBadge (ADR-047 D7)', () => {
  // Normative scenarios S1–S6
  describe('normative scenarios', () => {
    it('S1: ACTIVE → IN_PLAY, emerald, pulse', () => {
      const badge = derivePitDisplayBadge('ACTIVE');
      expect(badge).toEqual({
        state: 'IN_PLAY',
        label: 'In Play',
        color: 'emerald',
        pulse: true,
        dimmed: false,
      });
    });

    it('S2: RUNDOWN → RUNDOWN, amber, no pulse', () => {
      const badge = derivePitDisplayBadge('RUNDOWN');
      expect(badge).toEqual({
        state: 'RUNDOWN',
        label: 'Rundown',
        color: 'amber',
        pulse: false,
        dimmed: false,
      });
    });

    it('S3: null (no session opened today) → CLOSED, zinc', () => {
      const badge = derivePitDisplayBadge(null);
      expect(badge).toEqual({
        state: 'CLOSED',
        label: 'Closed',
        color: 'zinc',
        pulse: false,
        dimmed: false,
      });
    });

    it('S4: null (session closed earlier this shift) → CLOSED, zinc', () => {
      const badge = derivePitDisplayBadge(null);
      expect(badge.state).toBe('CLOSED');
      expect(badge.label).toBe('Closed');
      expect(badge.color).toBe('zinc');
    });

    it('S5: null (gaming day rollover gap) → CLOSED, zinc', () => {
      const badge = derivePitDisplayBadge(undefined);
      expect(badge.state).toBe('CLOSED');
      expect(badge.label).toBe('Closed');
    });

    it('S6: RUNDOWN (mid-shift spot check) → RUNDOWN, amber', () => {
      const badge = derivePitDisplayBadge('RUNDOWN');
      expect(badge.state).toBe('RUNDOWN');
      expect(badge.color).toBe('amber');
    });
  });

  // Defensive compatibility branch SF1
  describe('defensive compatibility branch', () => {
    it('SF1: OPEN → OPEN, blue (forward-compat, not normative for MVP)', () => {
      const badge = derivePitDisplayBadge('OPEN');
      expect(badge).toEqual({
        state: 'OPEN',
        label: 'Open',
        color: 'blue',
        pulse: false,
        dimmed: false,
      });
    });
  });

  // CLOSED session phase should also map to CLOSED display state
  describe('edge cases', () => {
    it('CLOSED session phase → CLOSED display (filtered from current-session query)', () => {
      // In practice, CLOSED sessions are filtered by the RPC, so sessionPhase
      // arrives as null. But if somehow passed, it should still map to CLOSED.
      const badge = derivePitDisplayBadge('CLOSED');
      expect(badge.state).toBe('CLOSED');
    });
  });

  describe('PIT_DISPLAY_LABELS', () => {
    it('covers all PitDisplayState values', () => {
      const states: PitDisplayState[] = [
        'IN_PLAY',
        'RUNDOWN',
        'CLOSED',
        'OPEN',
      ];
      for (const state of states) {
        expect(PIT_DISPLAY_LABELS[state]).toBeDefined();
        expect(typeof PIT_DISPLAY_LABELS[state]).toBe('string');
      }
    });
  });

  describe('type safety', () => {
    it('derivePitDisplayBadge does NOT accept tableAvailability (compile-time only)', () => {
      // This test documents the type constraint from ADR-047 D5.
      // derivePitDisplayBadge signature: (sessionPhase: SessionPhase | null | undefined)
      // It does NOT accept a tableAvailability parameter — verified at compile time.
      expect(derivePitDisplayBadge.length).toBe(1); // single parameter
    });
  });
});
