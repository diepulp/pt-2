/**
 * Threshold Notifications Hook
 *
 * Pure logic hook for threshold checking (warning, watchlist, CTR) with toast notifications.
 * Evaluates both single-transaction amounts and cumulative daily totals against compliance thresholds.
 *
 * Threshold Tiers per PRD-MTL-UI-GAPS:
 * - none: < $2,500 (no notification)
 * - warning: ≥ $2,500, < $3,000 (approaching watchlist)
 * - watchlist_met: ≥ $3,000, ≤ $9,000 (auto-create MTL)
 * - ctr_near: > $9,000, ≤ $10,000 (approaching CTR)
 * - ctr_met: > $10,000 (CTR required - strictly > per 31 CFR § 1021.311)
 *
 * @see EXECUTION-SPEC-PRD-MTL-UI-GAPS.md WS2
 * @see services/mtl/mappers.ts - DEFAULT_THRESHOLDS
 */

"use client";

import { useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";

import { DEFAULT_THRESHOLDS } from "@/services/mtl/mappers";

// ============================================================================
// Types
// ============================================================================

/**
 * Threshold level classification
 */
export type ThresholdLevel =
  | "none"
  | "warning"
  | "watchlist_met"
  | "ctr_near"
  | "ctr_met";

/**
 * Result of threshold evaluation
 */
export interface ThresholdCheckResult {
  /** Current threshold level */
  level: ThresholdLevel;
  /** Whether this amount should trigger MTL entry creation */
  shouldCreateMtl: boolean;
  /** Whether CTR reporting is required (>$10,000) */
  requiresCtr: boolean;
  /** User-facing notification message (null if none needed) */
  message: string | null;
}

/**
 * Threshold configuration (can be customized per casino)
 */
export interface ThresholdConfig {
  /** Warning threshold - "approaching watchlist" (default $2,500) */
  warningThreshold: number;
  /** Watchlist floor - internal tracking threshold (default $3,000) */
  watchlistFloor: number;
  /** CTR threshold - strictly > triggers CTR (default $10,000) */
  ctrThreshold: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ThresholdConfig = {
  warningThreshold: 2500,
  watchlistFloor: DEFAULT_THRESHOLDS.watchlistFloor, // $3,000
  ctrThreshold: DEFAULT_THRESHOLDS.ctrThreshold, // $10,000
};

// ============================================================================
// Threshold Evaluation Functions
// ============================================================================

/**
 * Evaluate threshold level for a given amount.
 *
 * IMPORTANT: CTR uses strictly > ("more than $10,000") per 31 CFR § 1021.311
 *
 * @param amount - The amount to check (single transaction or cumulative)
 * @param config - Optional threshold configuration (defaults to DEFAULT_CONFIG)
 * @returns ThresholdCheckResult with level, flags, and message
 */
export function checkThreshold(
  amount: number,
  config: ThresholdConfig = DEFAULT_CONFIG,
): ThresholdCheckResult {
  // CTR: strictly > ("more than $10,000") per 31 CFR § 1021.311
  if (amount > config.ctrThreshold) {
    return {
      level: "ctr_met",
      shouldCreateMtl: true,
      requiresCtr: true,
      message: `CTR REQUIRED: Daily total of $${amount.toLocaleString()} exceeds $${config.ctrThreshold.toLocaleString()} threshold. A Currency Transaction Report must be filed per 31 CFR § 1021.311.`,
    };
  }

  // CTR Near: > 90% of CTR threshold
  if (amount > config.ctrThreshold * 0.9) {
    return {
      level: "ctr_near",
      shouldCreateMtl: true,
      requiresCtr: false,
      message: `CTR threshold approaching: $${amount.toLocaleString()} of $${config.ctrThreshold.toLocaleString()} limit. Customer ID verification may be required soon.`,
    };
  }

  // Watchlist: >= internal threshold ($3,000)
  if (amount >= config.watchlistFloor) {
    return {
      level: "watchlist_met",
      shouldCreateMtl: true,
      requiresCtr: false,
      message: `Watchlist threshold met: $${amount.toLocaleString()}. MTL entry created automatically.`,
    };
  }

  // Warning: >= warning threshold but < watchlist ($2,500 - $3,000)
  if (amount >= config.warningThreshold) {
    return {
      level: "warning",
      shouldCreateMtl: false,
      requiresCtr: false,
      message: `Approaching watchlist threshold: $${amount.toLocaleString()} of $${config.watchlistFloor.toLocaleString()} watchlist floor.`,
    };
  }

  // No threshold concerns
  return {
    level: "none",
    shouldCreateMtl: false,
    requiresCtr: false,
    message: null,
  };
}

/**
 * Check threshold for a cumulative daily total including a new transaction.
 *
 * @param currentDailyTotal - Existing daily total before new transaction
 * @param newAmount - Amount of new transaction being recorded
 * @param config - Optional threshold configuration
 * @returns ThresholdCheckResult based on projected total
 */
export function checkCumulativeThreshold(
  currentDailyTotal: number,
  newAmount: number,
  config: ThresholdConfig = DEFAULT_CONFIG,
): ThresholdCheckResult {
  const projectedTotal = currentDailyTotal + newAmount;
  return checkThreshold(projectedTotal, config);
}

// ============================================================================
// Toast Notification Functions
// ============================================================================

/**
 * Duration constants for toast notifications (milliseconds)
 */
const TOAST_DURATION = {
  info: 5000,
  warning: 7000,
  error: 10000, // CTR notifications stay longer
} as const;

/**
 * Display toast notification for threshold result.
 *
 * @param result - ThresholdCheckResult from checkThreshold()
 * @param options - Optional configuration for notification behavior
 */
export function notifyThreshold(
  result: ThresholdCheckResult,
  options: { skipToast?: boolean } = {},
): void {
  if (options.skipToast || !result.message) {
    return;
  }

  switch (result.level) {
    case "ctr_met":
      toast.error(result.message, {
        duration: TOAST_DURATION.error,
        id: "ctr-met-notification",
      });
      break;

    case "ctr_near":
      toast.warning(result.message, {
        duration: TOAST_DURATION.warning,
        id: "ctr-near-notification",
      });
      break;

    case "watchlist_met":
      toast.info(result.message, {
        duration: TOAST_DURATION.info,
        id: "watchlist-notification",
      });
      break;

    case "warning":
      toast.warning(result.message, {
        duration: TOAST_DURATION.warning,
        id: "warning-notification",
      });
      break;

    case "none":
    default:
      // No notification for 'none' level
      break;
  }
}

// ============================================================================
// React Hook
// ============================================================================

/**
 * Hook for threshold checking with notification tracking.
 *
 * Provides functions to evaluate amounts against thresholds and display
 * appropriate toast notifications. Tracks which notifications have been
 * shown to prevent duplicates within a session.
 *
 * @param config - Optional threshold configuration (defaults to system thresholds)
 * @returns Object with check and notify functions
 *
 * @example
 * ```tsx
 * function BuyInForm({ playerId, currentDailyTotal }: Props) {
 *   const { checkAndNotify } = useThresholdNotifications();
 *   const [amount, setAmount] = useState(0);
 *
 *   const handleSubmit = () => {
 *     const result = checkAndNotify(currentDailyTotal, amount);
 *     if (result.shouldCreateMtl) {
 *       // Auto-create MTL entry
 *     }
 *     // Proceed with buy-in
 *   };
 * }
 * ```
 */
export function useThresholdNotifications(config?: Partial<ThresholdConfig>) {
  // Memoize config to prevent unnecessary re-renders
  const mergedConfig = useMemo<ThresholdConfig>(
    () => ({
      ...DEFAULT_CONFIG,
      ...config,
    }),
    [config?.warningThreshold, config?.watchlistFloor, config?.ctrThreshold],
  );

  // Track last notified level to prevent duplicate toasts
  const lastNotifiedLevel = useRef<ThresholdLevel>("none");

  /**
   * Check threshold and notify user if level changed.
   * Prevents duplicate notifications for the same level.
   */
  const checkAndNotify = useCallback(
    (currentDailyTotal: number, newAmount: number): ThresholdCheckResult => {
      const result = checkCumulativeThreshold(
        currentDailyTotal,
        newAmount,
        mergedConfig,
      );

      // Only notify if level escalated (higher severity than last notification)
      const levelOrder: ThresholdLevel[] = [
        "none",
        "warning",
        "watchlist_met",
        "ctr_near",
        "ctr_met",
      ];
      const currentLevelIndex = levelOrder.indexOf(result.level);
      const lastLevelIndex = levelOrder.indexOf(lastNotifiedLevel.current);

      if (currentLevelIndex > lastLevelIndex) {
        notifyThreshold(result);
        lastNotifiedLevel.current = result.level;
      }

      return result;
    },
    [mergedConfig],
  );

  /**
   * Check threshold without notification (for display purposes).
   */
  const check = useCallback(
    (currentDailyTotal: number, newAmount: number): ThresholdCheckResult => {
      return checkCumulativeThreshold(
        currentDailyTotal,
        newAmount,
        mergedConfig,
      );
    },
    [mergedConfig],
  );

  /**
   * Reset notification tracking (e.g., when patron changes).
   */
  const resetNotificationState = useCallback(() => {
    lastNotifiedLevel.current = "none";
  }, []);

  return {
    /** Check cumulative threshold and show toast if level escalated */
    checkAndNotify,
    /** Check cumulative threshold without notification */
    check,
    /** Check single amount against thresholds */
    checkThreshold: (amount: number) => checkThreshold(amount, mergedConfig),
    /** Reset notification tracking state */
    resetNotificationState,
    /** Current threshold configuration */
    config: mergedConfig,
  };
}
