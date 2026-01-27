/**
 * Service Role Supabase Client
 *
 * Creates a Supabase client using the service role key that bypasses RLS.
 * ONLY use this for:
 * - Development mode when no auth session exists
 * - Server-side operations that require RLS bypass (e.g., system tasks)
 *
 * WARNING: Never expose this client to the browser or use in production
 * without explicit authorization checks.
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { isDevMode } from "./dev-context";

/**
 * Create a Supabase client with service role privileges
 *
 * This client bypasses RLS completely. Use with caution.
 *
 * @returns SupabaseClient with service role privileges
 * @throws Error if service role key is not configured
 */
export function createServiceClient(): SupabaseClient<Database> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Check if we should use service client for dev mode
 *
 * Returns true only in development when DEV_AUTH_BYPASS is enabled.
 */
export function shouldUseDevServiceClient(): boolean {
  if (!isDevMode()) return false;
  if (process.env.DEV_AUTH_BYPASS === "false") return false;
  return true;
}
