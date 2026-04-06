/**
 * CompanyService CRUD Operations
 *
 * Low-level database operations for company registration and status queries.
 * These functions can be used directly in server actions or through CompanyService.
 *
 * Pattern B (Canonical CRUD) per SLAD §341-342.
 *
 * @see docs/21-exec-spec/EXEC-060-company-registration-bootstrap.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import { safeErrorDetails } from '@/lib/errors/safe-error-details';
import type { Database } from '@/types/database.types';

import type {
  OnboardingRegistrationDTO,
  RegisterCompanyInput,
  RegisterCompanyResult,
} from './dtos';

/**
 * Register a new company via rpc_register_company.
 *
 * Creates a company row and a pending onboarding_registration in one transaction.
 * Relies on partial unique index for conflict detection (23505).
 */
export async function registerCompany(
  supabase: SupabaseClient<Database>,
  input: RegisterCompanyInput,
): Promise<RegisterCompanyResult> {
  const { data, error } = await supabase.rpc('rpc_register_company', {
    p_company_name: input.company_name,
    p_legal_name: input.legal_name,
  });

  if (error) {
    if (error.code === '23505') {
      throw new DomainError('REGISTRATION_CONFLICT');
    }
    throw new DomainError('INTERNAL_ERROR', error.message, {
      details: safeErrorDetails(error),
    });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new DomainError('INTERNAL_ERROR', 'Register RPC returned no data');
  }

  return {
    company_id: row.company_id,
    registration_id: row.registration_id,
  };
}

/**
 * Get the current user's pending registration status.
 *
 * Returns the pending registration row if one exists, or null.
 * RLS automatically filters to user_id = auth.uid() AND status = 'pending'.
 * Consumed rows are invisible via RLS SELECT policy.
 */
export async function getRegistrationStatus(
  supabase: SupabaseClient<Database>,
): Promise<OnboardingRegistrationDTO | null> {
  const { data, error } = await supabase
    .from('onboarding_registration')
    .select('id, user_id, company_id, status, created_at')
    .maybeSingle();

  if (error) {
    throw new DomainError('INTERNAL_ERROR', error.message, {
      details: safeErrorDetails(error),
    });
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    user_id: data.user_id,
    company_id: data.company_id,
    status: data.status,
    created_at: data.created_at,
  };
}
