/** @jest-environment node */

/**
 * Loyalty HTTP -> Route Serialization Contract
 *
 * Proves that http.ts key transformations produce output
 * the route handler's Zod schema accepts. Prevents the
 * valuation serialization bug class (ISSUE-C4D2AA48).
 */

import { updateValuationPolicySchema } from '../schemas';
import type { UpdateValuationPolicyInput } from '../dtos';

describe('HTTP -> Route serialization contract', () => {
  it('updateValuationRate body matches route schema', () => {
    const input: UpdateValuationPolicyInput = {
      centsPerPoint: 5,
      effectiveDate: '2026-04-01',
      versionIdentifier: 'admin-2026-04-01',
    };

    // Replicate the transformation from http.ts:updateValuationRate
    const body = {
      cents_per_point: input.centsPerPoint,
      effective_date: input.effectiveDate,
      version_identifier: input.versionIdentifier,
    };

    const result = updateValuationPolicySchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it('rejects camelCase keys (the bug this test prevents)', () => {
    const camelCaseBody = {
      centsPerPoint: 5,
      effectiveDate: '2026-04-01',
      versionIdentifier: 'admin-2026-04-01',
    };

    const result = updateValuationPolicySchema.safeParse(camelCaseBody);
    expect(result.success).toBe(false);
  });
});
