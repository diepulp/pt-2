/**
 * Query hook for searching visits by player information
 * Following PT-2 canonical architecture with React Query integration
 *
 * @pattern Query Key: ['visit', 'search', query]
 * @staleTime 5 minutes - Search results rarely change once performed
 * @see hooks/shared/use-service-query.ts for base template
 * @see docs/adr/ADR-003-state-management-strategy.md for query key patterns
 */

import { searchVisits } from "@/app/actions/visit-actions";
import { useServiceQuery } from "@/hooks/shared/use-service-query";
import type { VisitDTO } from "@/services/visit";

/**
 * Searches visits by player information (name or email)
 *
 * @param query - Search query string (undefined/empty disables the query)
 * @returns React Query result with matching visits
 *
 * Search matches against:
 * - Player first name (case-insensitive)
 * - Player last name (case-insensitive)
 * - Player email (case-insensitive)
 *
 * @example
 * ```typescript
 * // Basic search
 * function VisitSearch() {
 *   const [searchTerm, setSearchTerm] = useState('');
 *   const { data: visits, isLoading } = useVisitSearch(searchTerm);
 *
 *   return (
 *     <>
 *       <input
 *         value={searchTerm}
 *         onChange={(e) => setSearchTerm(e.target.value)}
 *         placeholder="Search by player name or email..."
 *       />
 *       {isLoading && <div>Searching...</div>}
 *       <VisitResults visits={visits || []} />
 *     </>
 *   );
 * }
 *
 * // Debounced search
 * function DebouncedVisitSearch() {
 *   const [query, setQuery] = useState('');
 *   const debouncedQuery = useDebounce(query, 300);
 *   const { data: visits } = useVisitSearch(debouncedQuery);
 *
 *   return <SearchInterface query={query} setQuery={setQuery} results={visits} />;
 * }
 * ```
 */
export function useVisitSearch(query: string | undefined) {
  // Trim query to prevent unnecessary whitespace searches
  const trimmedQuery = query?.trim();

  return useServiceQuery<VisitDTO[]>(
    ["visit", "search", trimmedQuery] as const,
    () => searchVisits(trimmedQuery!),
    {
      enabled: !!trimmedQuery && trimmedQuery.length > 0, // Only search with non-empty query
      staleTime: 1000 * 60 * 5, // 5 minutes - search results stable
    },
  );
}
