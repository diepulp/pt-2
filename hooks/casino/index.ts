/**
 * Casino React Query Hooks
 *
 * Hooks for casino-related data fetching using the new HTTP fetchers.
 * Uses RLS-scoped endpoints (no casinoId parameter needed for most queries).
 *
 * @see services/casino/http.ts - HTTP fetchers
 * @see services/casino/keys.ts - Query key factories
 * @see SPEC-PRD-000-casino-foundation.md
 */

export { useCasino, useCasinos } from './use-casino';
export {
  useCasinoSettings,
  useUpdateCasinoSettings,
} from './use-casino-settings';
export { useCasinoStaff } from './use-casino-staff';
export { useGamingDay } from './use-gaming-day';

// Re-export types for convenience
export type {
  CasinoDTO,
  CasinoSettingsDTO,
  StaffDTO,
  GamingDayDTO,
  CasinoListFilters,
  CasinoStaffFilters,
} from '@/services/casino/dtos';
