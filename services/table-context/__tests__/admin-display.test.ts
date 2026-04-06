/** @jest-environment node */

import {
  deriveAdminDisplayBadge,
  ADMIN_DISPLAY_LABELS,
} from '../admin-display';
import type { AdminDisplayState } from '../admin-display';

describe('deriveAdminDisplayBadge (ADR-047 D7)', () => {
  // Admin scenarios A1–A3
  it('A1: active → ON_FLOOR, "On Floor", emerald', () => {
    const badge = deriveAdminDisplayBadge('active');
    expect(badge).toEqual({
      state: 'ON_FLOOR',
      label: 'On Floor',
      color: 'emerald',
    });
  });

  it('A2: inactive → OFFLINE, "Offline", amber', () => {
    const badge = deriveAdminDisplayBadge('inactive');
    expect(badge).toEqual({
      state: 'OFFLINE',
      label: 'Offline',
      color: 'amber',
    });
  });

  it('A3: closed → RETIRED, "Retired", zinc', () => {
    const badge = deriveAdminDisplayBadge('closed');
    expect(badge).toEqual({
      state: 'RETIRED',
      label: 'Retired',
      color: 'zinc',
    });
  });

  describe('ADMIN_DISPLAY_LABELS', () => {
    it('covers all AdminDisplayState values', () => {
      const states: AdminDisplayState[] = ['ON_FLOOR', 'OFFLINE', 'RETIRED'];
      for (const state of states) {
        expect(ADMIN_DISPLAY_LABELS[state]).toBeDefined();
        expect(typeof ADMIN_DISPLAY_LABELS[state]).toBe('string');
      }
    });
  });
});
