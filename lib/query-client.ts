import { QueryClient } from '@tanstack/react-query';

/**
 * Returns a QueryClient configured with the canonical defaults.
 * Keep this in sync with docs/patterns/HOOKS_STANDARD.md.
 */
export const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 300_000, // 5 minutes
        gcTime: 30 * 60_000, // 30 minutes
        retry: 2,
      },
      mutations: {
        retry: 0,
      },
    },
  });

export const queryClient = makeQueryClient();
