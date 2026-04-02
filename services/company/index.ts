/**
 * CompanyService
 *
 * Service factory for company registration and onboarding.
 * Follows functional factory pattern (no classes).
 *
 * Bounded Context: CompanyService (NEW — PRD-060)
 * Owns: company, onboarding_registration
 * RPCs: rpc_register_company
 *
 * @see docs/21-exec-spec/EXEC-060-company-registration-bootstrap.md
 * @see SERVICE_RESPONSIBILITY_MATRIX.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import * as crud from './crud';
import type {
  OnboardingRegistrationDTO,
  RegisterCompanyInput,
  RegisterCompanyResult,
} from './dtos';

// === Service Interface ===

/**
 * CompanyService interface — explicit, no ReturnType inference.
 * Pattern B (Canonical CRUD) per SLAD.
 */
export interface CompanyServiceInterface {
  /**
   * Register a new company and create a pending onboarding registration.
   * Throws REGISTRATION_CONFLICT (409) if user already has a pending registration.
   */
  registerCompany(input: RegisterCompanyInput): Promise<RegisterCompanyResult>;

  /**
   * Get the current user's pending registration status.
   * Returns null if no pending registration exists (consumed rows invisible via RLS).
   */
  getRegistrationStatus(): Promise<OnboardingRegistrationDTO | null>;
}

// === Service Factory ===

/**
 * Creates a CompanyService instance.
 *
 * @param supabase - Supabase client (auth context set by caller)
 */
export function createCompanyService(
  supabase: SupabaseClient<Database>,
): CompanyServiceInterface {
  return {
    registerCompany: (input) => crud.registerCompany(supabase, input),
    getRegistrationStatus: () => crud.getRegistrationStatus(supabase),
  };
}

// Re-export CRUD functions for direct use in server actions
export { getRegistrationStatus, registerCompany } from './crud';
