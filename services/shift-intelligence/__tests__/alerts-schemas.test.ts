/**
 * PRD-056 Alert Maturity Schema Validation Tests
 * Tests Zod schemas for alert endpoints.
 *
 * @jest-environment node
 */

import {
  acknowledgeAlertSchema,
  alertsQuerySchema,
  persistAlertsInputSchema,
} from '../schemas';

describe('Alert Maturity Schemas', () => {
  describe('persistAlertsInputSchema', () => {
    it('accepts empty body', () => {
      const result = persistAlertsInputSchema.parse({});
      expect(result).toEqual({});
    });

    it('accepts optional gaming_day', () => {
      const result = persistAlertsInputSchema.parse({
        gaming_day: '2026-03-25',
      });
      expect(result.gaming_day).toBe('2026-03-25');
    });

    it('rejects invalid date format', () => {
      expect(() =>
        persistAlertsInputSchema.parse({ gaming_day: 'not-a-date' }),
      ).toThrow();
    });
  });

  describe('acknowledgeAlertSchema', () => {
    it('accepts valid acknowledge input', () => {
      const result = acknowledgeAlertSchema.parse({
        alert_id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.alert_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('accepts with notes and false_positive', () => {
      const result = acknowledgeAlertSchema.parse({
        alert_id: '550e8400-e29b-41d4-a716-446655440000',
        notes: 'Verified as legitimate spike',
        is_false_positive: false,
      });
      expect(result.notes).toBe('Verified as legitimate spike');
      expect(result.is_false_positive).toBe(false);
    });

    it('rejects missing alert_id', () => {
      expect(() => acknowledgeAlertSchema.parse({})).toThrow();
    });

    it('rejects invalid UUID for alert_id', () => {
      expect(() =>
        acknowledgeAlertSchema.parse({ alert_id: 'not-a-uuid' }),
      ).toThrow();
    });

    it('rejects notes exceeding 1000 chars', () => {
      expect(() =>
        acknowledgeAlertSchema.parse({
          alert_id: '550e8400-e29b-41d4-a716-446655440000',
          notes: 'x'.repeat(1001),
        }),
      ).toThrow();
    });
  });

  describe('alertsQuerySchema', () => {
    it('accepts gaming_day only', () => {
      const result = alertsQuerySchema.parse({ gaming_day: '2026-03-25' });
      expect(result.gaming_day).toBe('2026-03-25');
      expect(result.status).toBeUndefined();
    });

    it('accepts gaming_day with status filter', () => {
      const result = alertsQuerySchema.parse({
        gaming_day: '2026-03-25',
        status: 'open',
      });
      expect(result.status).toBe('open');
    });

    it('accepts acknowledged status', () => {
      const result = alertsQuerySchema.parse({
        gaming_day: '2026-03-25',
        status: 'acknowledged',
      });
      expect(result.status).toBe('acknowledged');
    });

    it('rejects missing gaming_day', () => {
      expect(() => alertsQuerySchema.parse({})).toThrow();
    });

    it('rejects invalid status value', () => {
      expect(() =>
        alertsQuerySchema.parse({
          gaming_day: '2026-03-25',
          status: 'resolved',
        }),
      ).toThrow();
    });
  });
});
