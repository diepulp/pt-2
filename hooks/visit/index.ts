/**
 * Visit Hooks Barrel Export
 * Following PT-2 canonical architecture
 *
 * Exports all visit-related React Query hooks (queries and mutations)
 */

// Query hooks
export { useVisit } from "./use-visit";
export { useVisits } from "./use-visits";
export { useVisitSearch } from "./use-visit-search";

// Mutation hooks
export { useCreateVisit } from "./use-create-visit";
export { useUpdateVisit } from "./use-update-visit";
export type { UpdateVisitVariables } from "./use-update-visit";
export { useDeleteVisit } from "./use-delete-visit";
