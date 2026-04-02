/**
 * CompanyService Zod Validation Schemas
 *
 * @see docs/21-exec-spec/EXEC-060-company-registration-bootstrap.md
 */

import { z } from 'zod';

/** Schema for company registration */
export const registerCompanySchema = z.object({
  company_name: z
    .string()
    .min(1, 'Company name is required')
    .max(200, 'Company name must be 200 characters or less'),
  legal_name: z
    .string()
    .max(200, 'Legal name must be 200 characters or less')
    .optional(),
});
