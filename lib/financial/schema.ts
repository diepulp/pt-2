import { z } from 'zod';

import type {
  CompletenessStatus,
  FinancialAuthority,
  FinancialValue,
} from '@/types/financial';

export const financialAuthoritySchema = z.enum([
  'actual',
  'estimated',
  'observed',
  'compliance',
]) satisfies z.ZodType<FinancialAuthority>;

export const completenessStatusSchema = z.enum([
  'complete',
  'partial',
  'unknown',
]) satisfies z.ZodType<CompletenessStatus>;

export const completenessSchema = z.object({
  status: completenessStatusSchema,
  coverage: z.number().min(0).max(1).optional(),
});

/**
 * Canonical validator for {@link FinancialValue}.
 *
 * `value` is always canonical cents (integer) at the service boundary.
 * `source` is a non-empty provenance identifier (e.g. `table_session.drop`).
 * `completeness.status` is always present — mappers that cannot determine
 * completeness must set it to `'unknown'` explicitly, never omit it.
 */
export const financialValueSchema = z.object({
  value: z.number().int(),
  type: financialAuthoritySchema,
  source: z.string().min(1),
  completeness: completenessSchema,
}) satisfies z.ZodType<FinancialValue>;
