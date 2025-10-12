import { QueryClient } from "@tanstack/react-query";

/**
 * React Query client configuration for PT-2
 *
 * Configuration rationale:
 * - staleTime: 5 minutes - balances freshness with reduced network requests
 * - gcTime: 30 minutes - keeps warm caches available while bounding memory
 * - refetchOnWindowFocus: false - prevents unnecessary refetches in casino context
 * - queries.retry: 1 - single retry for transient failures
 * - mutations.retry: 0 - no retries for mutations to prevent duplicate operations
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
