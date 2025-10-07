"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

let browserInstance: SupabaseClient<Database> | null = null;

/**
 * Create a Supabase client for Client Components
 * This client is cached and reused for subsequent calls
 * @returns SupabaseClient
 */
export function createBrowserComponentClient(): SupabaseClient<Database> {
  if (typeof window === "undefined") {
    // Return a more complete mock client for build-time/server-side rendering
    const mockClient = {
      from: () => ({
        select: () => Promise.resolve({ data: [], error: null }),
        insert: () => Promise.resolve({ data: [], error: null }),
        update: () => Promise.resolve({ data: [], error: null }),
        delete: () => Promise.resolve({ data: [], error: null }),
        upsert: () => Promise.resolve({ data: [], error: null }),
      }),
      auth: {
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
        getSession: () =>
          Promise.resolve({ data: { session: null }, error: null }),
        signOut: () => Promise.resolve({ error: null }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => {} } },
        }),
      },
      channel: () => ({
        on: () => ({ subscribe: () => ({}) }),
        unsubscribe: () => {},
        subscribe: () => Promise.resolve("SUBSCRIBED"),
      }),
      rpc: () => Promise.resolve({ data: null, error: null }),
      storage: {
        from: () => ({
          upload: () => Promise.resolve({ data: null, error: null }),
          download: () => Promise.resolve({ data: null, error: null }),
        }),
      },
      realtime: {
        channel: () => ({
          on: () => ({ subscribe: () => ({}) }),
          unsubscribe: () => {},
        }),
      },
    };

    return mockClient as unknown as SupabaseClient<Database>;
  }

  if (browserInstance) {
    return browserInstance;
  }

  browserInstance = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ) satisfies SupabaseClient<Database>;

  return browserInstance;
}

// export function createBrowserComponentClient() {
//   return createBrowserClient<Database>(

//     process.env.NEXT_PUBLIC_SUPABASE_URL!,
//     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
//   )
// }

// Optional: Add method to cleanup the client instance if needed
export function cleanupClientInstance() {
  browserInstance = null;
}
