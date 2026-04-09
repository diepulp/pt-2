/**
 * Mode C Auth Ceremony Helper
 *
 * Creates an authenticated anon client carrying a JWT with stamped app_metadata.
 * Does NOT create domain fixtures — caller owns all fixture lifecycle.
 *
 * @see FIB-H Section N — Auth Ceremony Helper Spec
 * @see ADR-024 — Authoritative context derivation
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

export interface ModeCSessionResult {
  /** Authenticated anon client with Bearer token */
  client: SupabaseClient<Database>;
  /** auth.users.id (for afterAll cleanup) */
  userId: string;
  /** Generated email (for diagnostics) */
  email: string;
  /** Deletes auth user only — caller must clean domain fixtures separately */
  cleanup: () => Promise<void>;
}

/**
 * Create a Mode C authenticated session for integration tests.
 *
 * End-to-end auth ceremony: creates auth user, stamps identity claims,
 * signs in, returns Bearer client. Does nothing else.
 *
 * @param serviceClient - Caller-provided service-role client (for admin auth ops)
 * @param identity - Claims to stamp into JWT app_metadata
 */
export async function createModeCSession(
  serviceClient: SupabaseClient<Database>,
  identity: {
    staffId: string;
    casinoId: string;
    staffRole: string;
  },
): Promise<ModeCSessionResult> {
  // Local-only safety — refuse to create auth users against remote Supabase
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    'http://127.0.0.1:54321';

  if (
    !supabaseUrl.includes('127.0.0.1') &&
    !supabaseUrl.includes('localhost')
  ) {
    throw new Error(
      `createModeCSession: SUPABASE_URL must be local (127.0.0.1 or localhost), got: ${supabaseUrl}`,
    );
  }

  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

  const password = 'mode-c-test-password-12345';
  const email = `test-mc-${identity.staffRole}-${Date.now()}@example.com`;

  // Step 1: Create auth user
  const { data: userData, error: createError } =
    await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createError || !userData?.user) {
    throw (
      createError ?? new Error('createModeCSession: failed to create auth user')
    );
  }
  const userId = userData.user.id;

  // Step 2: Stamp identity claims into app_metadata
  const { error: stampError } = await serviceClient.auth.admin.updateUserById(
    userId,
    {
      app_metadata: {
        staff_id: identity.staffId,
        casino_id: identity.casinoId,
        staff_role: identity.staffRole,
      },
    },
  );
  if (stampError) {
    await serviceClient.auth.admin.deleteUser(userId);
    throw stampError;
  }

  // Step 3: Sign in via throwaway anon client to obtain JWT
  const throwaway = createClient<Database>(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: sessionData, error: signInError } =
    await throwaway.auth.signInWithPassword({ email, password });
  if (signInError || !sessionData.session) {
    await serviceClient.auth.admin.deleteUser(userId);
    throw (
      signInError ??
      new Error('createModeCSession: sign-in returned no session')
    );
  }

  // Step 4: Create authenticated anon client with static Bearer token
  const client = createClient<Database>(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Step 5: Cleanup — deletes auth user only
  const cleanup = async () => {
    await serviceClient.auth.admin.deleteUser(userId);
  };

  return { client, userId, email, cleanup };
}
