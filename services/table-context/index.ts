/**
 * TableContextService Public API
 *
 * Export all public interfaces, types, and operations
 */

// State Machine
export { canTransition, validateTransition } from "./table-state-machine";
export type { TableTransitionResult } from "./table-state-machine";

// Table Operations
export {
  updateTableStatus,
  type UpdateTableStatusInput,
} from "./table-operations";

// Type Guards & DTOs
export { isValidGamingTableDTO, type GamingTableDTO } from "./type-guards";

// Query Keys
export { tableContextKeys } from "./keys";
export type {
  TableContextFilters,
  TableInventorySnapshotFilters,
  TableFillFilters,
  TableCreditFilters,
  TableDropEventFilters,
} from "./keys";
