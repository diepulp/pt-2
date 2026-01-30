/**
 * Navigation Utilities
 *
 * Barrel export for navigation-related utilities.
 *
 * @see PRD-022 Player 360 Navigation Consolidation
 * @see PRD-022-PATCH-OPTION-B Embedded Search
 */

// New simplified navigation (PRD-022-PATCH-OPTION-B)
export { buildPlayerUrl, buildPlayerUrlWithAnchor } from './return-to';

// Legacy navigation utilities (deprecated but retained for compatibility)
export {
  buildPlayerDetailUrl,
  buildPlayerDetailUrlWithAnchor,
  decodeReturnTo,
  encodeReturnTo,
  validateReturnTo,
} from './return-to';
