/** @jest-environment node */

/**
 * Close Reason Labels Tests (PRD-038A WS4)
 *
 * Validates label constants match the close_reason_type enum.
 */

import { CLOSE_REASON_LABELS, CLOSE_REASON_OPTIONS } from '../labels';

describe('CLOSE_REASON_LABELS', () => {
  it('has exactly 9 close reason entries with non-empty string labels', () => {
    const keys = Object.keys(CLOSE_REASON_LABELS);
    expect(keys).toHaveLength(9);

    for (const key of keys) {
      const label =
        CLOSE_REASON_LABELS[key as keyof typeof CLOSE_REASON_LABELS];
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('label keys match CLOSE_REASON_OPTIONS values exactly (minus cancelled)', () => {
    const labelKeys = Object.keys(CLOSE_REASON_LABELS).filter(
      (k) => k !== 'cancelled',
    );
    const optionValues = CLOSE_REASON_OPTIONS.map((o) => o.value);

    expect(optionValues).toEqual(labelKeys);

    // Also verify labels match
    for (const option of CLOSE_REASON_OPTIONS) {
      expect(option.label).toBe(CLOSE_REASON_LABELS[option.value]);
    }
  });
});
