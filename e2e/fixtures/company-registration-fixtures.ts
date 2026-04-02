/**
 * PRD-060: Company Registration E2E Fixtures
 *
 * Creates bare auth users (no staff, no company) for testing
 * the registration-to-bootstrap flow.
 *
 * Fixture note: These scenarios create users at the "brand new operator"
 * state — authenticated but with no staff binding, no company, no casino.
 * This is the starting point for the registration flow.
 */

import { randomUUID } from 'crypto';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export function createServiceClient() {
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface RegistrationScenario {
  userId: string;
  email: string;
  password: string;
  cleanup: () => Promise<void>;
}

/**
 * Creates a bare auth user with no staff binding, no company.
 * This is the "brand new operator" state for registration testing.
 *
 * Uses UUID-based email for collision resistance (QA-006 §4).
 */
export async function createRegistrationScenario(): Promise<RegistrationScenario> {
  const supabase = createServiceClient();
  const uniqueId = randomUUID().slice(0, 8);
  const email = `test-reg-${uniqueId}@example.com`;
  const password = 'test-password-123!';

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`Failed to create test user: ${error?.message}`);
  }

  const userId = data.user.id;

  return {
    userId,
    email,
    password,
    cleanup: async () => {
      const svc = createServiceClient();

      // 1. Clean up staff + casino + casino_settings (if bootstrap completed)
      const { data: staffRows } = await svc
        .from('staff')
        .select('id, casino_id')
        .eq('user_id', userId);

      if (staffRows?.length) {
        for (const staff of staffRows) {
          await svc.from('staff').delete().eq('id', staff.id);
          await svc
            .from('casino_settings')
            .delete()
            .eq('casino_id', staff.casino_id);
          const { data: casino } = await svc
            .from('casino')
            .select('company_id')
            .eq('id', staff.casino_id)
            .single();
          await svc.from('casino').delete().eq('id', staff.casino_id);
          if (casino?.company_id) {
            // Don't delete company yet — registration cleanup handles it
          }
        }
      }

      // 2. Clean up registration rows + associated companies
      const { data: regRows } = await svc
        .from('onboarding_registration')
        .select('id, company_id')
        .eq('user_id', userId);

      if (regRows?.length) {
        for (const reg of regRows) {
          await svc.from('onboarding_registration').delete().eq('id', reg.id);
          // Delete company created by registration (may already be deleted by cascade)
          if (reg.company_id) {
            await svc.from('company').delete().eq('id', reg.company_id);
          }
        }
      }

      // 3. Delete auth user last
      await svc.auth.admin.deleteUser(userId);
    },
  };
}

/**
 * Creates a user with an existing pending registration.
 * For testing redirect guards and CONFLICT scenarios.
 */
export async function createRegistrationWithPendingScenario(): Promise<
  RegistrationScenario & { companyId: string; registrationId: string }
> {
  const scenario = await createRegistrationScenario();
  const supabase = createServiceClient();

  // Sign in as the user to call RPC (needs real JWT for auth.uid())
  const { data: signIn } = await supabase.auth.signInWithPassword({
    email: scenario.email,
    password: scenario.password,
  });

  if (!signIn.session) {
    throw new Error('Failed to sign in test user for pending registration');
  }

  // Create authenticated client with this user's token
  const userClient = createClient<Database>(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${signIn.session.access_token}`,
      },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await userClient.rpc('rpc_register_company', {
    p_company_name: 'Test Pending Company',
  });

  if (error) {
    throw new Error(`Failed to create pending registration: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    ...scenario,
    companyId: row.company_id,
    registrationId: row.registration_id,
  };
}
