/**
 * CompanyService DTOs
 *
 * Pattern B (Canonical CRUD): DTOs derived via Pick/Omit from Database types.
 * Manual interfaces only for RPC response types.
 *
 * @see docs/21-exec-spec/EXEC-060-company-registration-bootstrap.md
 */

import type { Database } from '@/types/database.types';

// === Base Row Types (for Pick/Omit derivation) ===

type CompanyRow = Database['public']['Tables']['company']['Row'];

// === Company DTOs ===

/** Public company profile */
export type CompanyDTO = Pick<
  CompanyRow,
  'id' | 'name' | 'legal_name' | 'created_at'
>;

// === Registration DTOs ===

/** Registration input (validated by Zod schema) */
export interface RegisterCompanyInput {
  company_name: string;
  legal_name?: string;
}

/** Registration RPC result */
export interface RegisterCompanyResult {
  company_id: string;
  registration_id: string;
}

/** Onboarding registration status (from RLS-filtered query) */
export interface OnboardingRegistrationDTO {
  id: string;
  user_id: string;
  company_id: string;
  status: string;
  created_at: string;
}
