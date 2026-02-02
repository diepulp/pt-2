'use client';

// Re-export UI hooks (PRD-013: Zustand state management)
export { useModal } from './ui/use-modal';
export { usePitDashboardUI } from './ui/use-pit-dashboard-ui';
export { usePlayerDashboard } from './ui/use-player-dashboard';
export {
  useRatingSlipModal,
  useAverageBetField,
  useNewBuyInField,
  useStartTimeField,
  useMovePlayerFields,
  useChipsTakenField,
} from './ui/use-rating-slip-modal';

// Re-export Sonner toast for standardized notifications
// Usage:
//   toast.success("Rating slip saved")
//   toast.error("Failed to save", { description: "Check connection" })
//   toast.info("Processing...")
//   toast.warning("Unsaved changes")
export { toast } from 'sonner';
