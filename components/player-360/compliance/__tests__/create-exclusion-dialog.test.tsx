/**
 * CreateExclusionDialog Date Payload Contract Tests
 *
 * Primary regression guard: verifies that date fields are submitted
 * as YYYY-MM-DD strings (not ISO 8601 datetime) to match the server
 * dateSchema() contract.
 *
 * Tests the handleSubmit payload-building contract directly, following
 * the same pattern as new-slip-modal-exclusion.test.tsx (Radix Select
 * portals don't work in JSDOM, so we test the transformation logic).
 *
 * @see DATE-MISMATCH.md — commit 14e02c5 regression analysis
 * @see lib/validation/date.ts — canonical dateSchema()
 */

/** @jest-environment node */

import { createExclusionSchema } from '@/services/player/exclusion-schemas';

/**
 * Mirrors the exact payload-building logic from CreateExclusionDialog.handleSubmit.
 * If handleSubmit changes, this contract test must be updated to match.
 */
function buildMutationInput(formValues: {
  exclusion_type: string;
  enforcement: string;
  reason: string;
  effective_from?: string;
  effective_until?: string;
  review_date?: string;
  external_ref?: string;
  jurisdiction?: string;
}) {
  return {
    exclusion_type: formValues.exclusion_type,
    enforcement: formValues.enforcement,
    reason: formValues.reason,
    effective_from: formValues.effective_from || undefined,
    effective_until: formValues.effective_until || null,
    review_date: formValues.review_date || null,
    external_ref: formValues.external_ref || null,
    jurisdiction: formValues.jurisdiction || null,
  };
}

/**
 * THE REGRESSION PATTERN (commit 14e02c5):
 * These converters were added to handleSubmit, converting YYYY-MM-DD → ISO datetime.
 * They conflict with the server's dateSchema() which expects YYYY-MM-DD.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const REGRESSION_toISO = (v: string | undefined): string | undefined =>
  v ? new Date(`${v}T00:00:00`).toISOString() : undefined;

const PLAYER_ID = '11111111-1111-1111-1111-111111111111';

describe('CreateExclusionDialog date payload contract', () => {
  describe('YYYY-MM-DD passthrough (current — correct)', () => {
    it('date fields pass through as YYYY-MM-DD strings', () => {
      const input = buildMutationInput({
        exclusion_type: 'trespass',
        enforcement: 'hard_block',
        reason: 'Test reason',
        effective_from: '2026-04-01',
        effective_until: '2026-12-31',
        review_date: '2026-06-15',
      });

      expect(input.effective_from).toBe('2026-04-01');
      expect(input.effective_until).toBe('2026-12-31');
      expect(input.review_date).toBe('2026-06-15');

      // Must NOT contain time component
      expect(input.effective_from).not.toContain('T');
      expect(input.effective_until).not.toContain('T');
      expect(input.review_date).not.toContain('T');
    });

    it('empty date strings become undefined/null per schema contract', () => {
      const input = buildMutationInput({
        exclusion_type: 'internal_ban',
        enforcement: 'soft_alert',
        reason: 'Minimal',
        effective_from: '',
        effective_until: '',
        review_date: '',
      });

      expect(input.effective_from).toBeUndefined();
      expect(input.effective_until).toBeNull();
      expect(input.review_date).toBeNull();
    });

    it('payload with dates passes server createExclusionSchema validation', () => {
      const input = buildMutationInput({
        exclusion_type: 'trespass',
        enforcement: 'hard_block',
        reason: 'Test reason',
        effective_from: '2026-04-01',
        effective_until: '2026-12-31',
        review_date: '2026-06-15',
      });

      const result = createExclusionSchema.safeParse({
        ...input,
        player_id: PLAYER_ID,
      });

      expect(result.success).toBe(true);
    });

    it('payload without dates passes server createExclusionSchema validation', () => {
      const input = buildMutationInput({
        exclusion_type: 'internal_ban',
        enforcement: 'monitor',
        reason: 'Watchlist addition',
        effective_from: '',
        effective_until: '',
        review_date: '',
      });

      const result = createExclusionSchema.safeParse({
        ...input,
        player_id: PLAYER_ID,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('ISO datetime REJECTED by server schema (regression pattern)', () => {
    it('toISO-converted dates are rejected by createExclusionSchema', () => {
      // This is exactly what commit 14e02c5 did — convert YYYY-MM-DD to ISO
      const isoDate = REGRESSION_toISO('2026-04-01');
      expect(isoDate).toContain('T'); // e.g. "2026-04-01T07:00:00.000Z"

      const result = createExclusionSchema.safeParse({
        player_id: PLAYER_ID,
        exclusion_type: 'trespass',
        enforcement: 'hard_block',
        reason: 'Test reason',
        effective_from: isoDate,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map(
          (i: { message: string }) => i.message,
        );
        expect(messages).toContain('effective_from must be YYYY-MM-DD format');
      }
    });
  });
});
