import { QueryClient } from '@tanstack/react-query';

/**
 * Domain-Tiered Stale Times
 *
 * Categorizes data freshness requirements by domain type:
 * - REFERENCE: Data that rarely changes (casino settings, floor layouts)
 * - TRANSACTIONAL: Data that changes with user actions (rating slips, ledgers)
 * - REALTIME: Data that changes frequently (table status, active visits)
 */
export const STALE_TIMES = {
  /** Reference data - rarely changes (5 minutes) */
  REFERENCE: 5 * 60 * 1000,

  /** Transactional data - changes with user actions (30 seconds) */
  TRANSACTIONAL: 30 * 1000,

  /** Real-time data - changes frequently (10 seconds) */
  REALTIME: 10 * 1000,
} as const;

/**
 * Type for stale time keys
 */
export type StaleTimeCategory = keyof typeof STALE_TIMES;

/**
 * Domain-specific stale time mappings
 *
 * Maps query key domains to appropriate stale time categories.
 * Add new domains here as services are implemented.
 */
export const DOMAIN_STALE_TIMES: Record<string, number> = {
  // Reference data (5 min) - rarely changes
  // DEPLOYED:
  casino: STALE_TIMES.REFERENCE,
  'casino-settings': STALE_TIMES.REFERENCE,
  'floor-layout': STALE_TIMES.REFERENCE,
  // PLANNED (not yet in SRM):
  'game-settings': STALE_TIMES.REFERENCE,
  'game-types': STALE_TIMES.REFERENCE,

  // Transactional data (30 sec) - changes with user actions
  // DEPLOYED:
  player: STALE_TIMES.TRANSACTIONAL,
  visit: STALE_TIMES.TRANSACTIONAL,
  'rating-slip': STALE_TIMES.TRANSACTIONAL,
  loyalty: STALE_TIMES.TRANSACTIONAL,
  'loyalty-ledger': STALE_TIMES.TRANSACTIONAL,
  mtl: STALE_TIMES.TRANSACTIONAL,
  // PLANNED (not yet in SRM):
  finance: STALE_TIMES.TRANSACTIONAL,
  staff: STALE_TIMES.TRANSACTIONAL,

  // Real-time data (10 sec) - changes frequently
  // DEPLOYED:
  table: STALE_TIMES.REALTIME,
  'table-context': STALE_TIMES.REALTIME,
  'active-visit': STALE_TIMES.REALTIME,
  'pit-overview': STALE_TIMES.REALTIME,
};

/**
 * Get stale time for a query key domain
 *
 * @param domain - The domain identifier (first segment of query key)
 * @returns Stale time in milliseconds
 */
export function getStaleTimeForDomain(domain: string): number {
  return DOMAIN_STALE_TIMES[domain] ?? STALE_TIMES.TRANSACTIONAL;
}

/**
 * Create QueryClient with PT-2 canonical defaults
 *
 * Configuration aligned with:
 * - docs/70-governance/HOOKS_STANDARD.md
 * - ADR-003 state management strategy
 *
 * @returns Configured QueryClient instance
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Default to transactional stale time
        staleTime: STALE_TIMES.TRANSACTIONAL,

        // Keep unused data in cache for 30 minutes
        gcTime: 30 * 60 * 1000,

        // Retry failed queries twice
        retry: 2,

        // Don't refetch on window focus (prevents unexpected refetches)
        refetchOnWindowFocus: false,

        // Refetch on reconnect - heals after network blips on casino floor (ADR-003)
        refetchOnReconnect: true,
      },
      mutations: {
        // Don't retry mutations (they should be idempotent)
        retry: 0,
      },
    },
  });
}

/**
 * Browser-side QueryClient singleton
 */
let browserQueryClient: QueryClient | undefined;

/**
 * Get QueryClient instance
 *
 * Server-side: Creates new instance each request (no shared state)
 * Client-side: Returns singleton (shared across components)
 *
 * @returns QueryClient instance
 */
export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // Server: always create new client to avoid shared state
    return makeQueryClient();
  }

  // Browser: use singleton
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

/**
 * Reset browser QueryClient (for testing)
 */
export function resetQueryClient(): void {
  browserQueryClient = undefined;
}
