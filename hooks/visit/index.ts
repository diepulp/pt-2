/**
 * Visit React Query Hooks
 *
 * Hooks for visit-related data fetching using the new HTTP fetchers.
 * Uses RLS-scoped endpoints (no casinoId parameter needed).
 *
 * @see services/visit/http.ts - HTTP fetchers
 * @see services/visit/keys.ts - Query key factories
 * @see PRD-003 Player & Visit Management
 */

export { useActiveVisit } from "./use-active-visit";
export { useCloseVisit, useStartVisit } from "./use-visit-mutations";
export { useVisit, useVisits } from "./use-visits";

// Re-export types for convenience
export type {
  ActiveVisitDTO,
  CloseVisitDTO,
  VisitDTO,
  VisitListFilters,
  VisitWithPlayerDTO,
} from "@/services/visit/dtos";
