/**
 * Return-To Navigation Utilities
 *
 * Provides secure encoding/decoding of returnTo URL parameters
 * for navigation between player search and detail views.
 *
 * NOTE: With PRD-022-PATCH-OPTION-B (embedded search), the returnTo
 * pattern is largely deprecated. Navigation now uses router.replace()
 * without building history. These utilities are retained for:
 * - Backward compatibility with existing bookmarks
 * - Security validation for any remaining redirect use cases
 * - Breadcrumb components that may still reference returnTo
 *
 * @see PRD-022 Player 360 Navigation Consolidation
 * @see PRD-022-PATCH-OPTION-B Embedded Search
 * @see WS8 Navigation Cleanup
 */

const VALID_PREFIX = "/players";
const DEFAULT_RETURN = "/players";

/**
 * Encode a return path for use in URL query params.
 * Only encodes paths that pass validation.
 *
 * @deprecated With embedded search (PRD-022-PATCH-OPTION-B), returnTo
 * is no longer needed for player navigation. Use router.replace() instead.
 */
export function encodeReturnTo(path: string): string {
  if (!validateReturnTo(path)) return encodeURIComponent(DEFAULT_RETURN);
  return encodeURIComponent(path);
}

/**
 * Decode and validate a returnTo param.
 * Returns DEFAULT_RETURN if invalid or missing.
 *
 * @deprecated With embedded search (PRD-022-PATCH-OPTION-B), returnTo
 * is no longer needed for player navigation. Use router.replace() instead.
 */
export function decodeReturnTo(encoded: string | null | undefined): string {
  if (!encoded) return DEFAULT_RETURN;
  try {
    const decoded = decodeURIComponent(encoded);
    return validateReturnTo(decoded) ? decoded : DEFAULT_RETURN;
  } catch {
    return DEFAULT_RETURN;
  }
}

/**
 * Security-first validation for returnTo paths.
 * Rejects open redirect attempts and path traversal.
 *
 * IMPORTANT: This function is NOT deprecated. Security validation
 * should always be used when accepting redirect URLs from any source.
 */
export function validateReturnTo(path: string): boolean {
  // Must start with valid prefix
  if (!path.startsWith(VALID_PREFIX)) return false;
  // Reject protocol-relative URLs (open redirect)
  if (path.startsWith("//")) return false;
  // Reject path traversal attempts
  if (path.includes("..")) return false;
  // Reject URLs with protocols
  if (/^[a-z]+:/i.test(path)) return false;
  return true;
}

/**
 * Build Player 360 URL.
 *
 * @deprecated With embedded search (PRD-022-PATCH-OPTION-B), use
 * simple `/players/${playerId}` URL construction instead. The returnTo
 * parameter is no longer needed since search is embedded in Player 360.
 */
export function buildPlayerDetailUrl(
  playerId: string,
  returnTo?: string,
): string {
  const base = `/players/${playerId}`;
  if (!returnTo) return base;
  return `${base}?returnTo=${encodeReturnTo(returnTo)}`;
}

/**
 * Build Player 360 URL with anchor hash.
 *
 * @deprecated With embedded search (PRD-022-PATCH-OPTION-B), use
 * simple `/players/${playerId}#${anchor}` URL construction instead.
 */
export function buildPlayerDetailUrlWithAnchor(
  playerId: string,
  anchor: string,
  returnTo?: string,
): string {
  const base = buildPlayerDetailUrl(playerId, returnTo);
  return `${base}#${anchor}`;
}

// === New simplified navigation helpers ===

/**
 * Build a simple Player 360 URL.
 * Preferred method for player navigation with embedded search.
 */
export function buildPlayerUrl(playerId: string): string {
  return `/players/${playerId}`;
}

/**
 * Build a Player 360 URL with anchor.
 * Preferred method for navigating to specific sections.
 */
export function buildPlayerUrlWithAnchor(
  playerId: string,
  anchor: string,
): string {
  return `/players/${playerId}#${anchor}`;
}
