/**
 * Rating Slip Modal Hooks
 *
 * TanStack Query hooks for rating slip modal operations.
 *
 * @see PRD-008 Rating Slip Modal Integration
 * @see EXECUTION-SPEC-PRD-008.md WS3
 */

export { useRatingSlipModalData } from './use-rating-slip-modal';
export type { RatingSlipModalDTO } from './use-rating-slip-modal';

export { useMovePlayer } from './use-move-player';
export type {
  MovePlayerInput,
  MovePlayerMutationInput,
  MovePlayerResponse,
} from './use-move-player';

export { useCloseWithFinancial } from './use-close-with-financial';
export type { CloseWithFinancialInput } from './use-close-with-financial';

export { useSaveWithBuyIn } from './use-save-with-buyin';
export type { SaveWithBuyInInput } from './use-save-with-buyin';
