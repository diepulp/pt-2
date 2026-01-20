/**
 * Threshold Notifications Hook
 *
 * Pure logic hook for threshold checking (warning, MTL, CTR) with toast notifications.
 * Evaluates both single-transaction amounts and cumulative daily totals against compliance thresholds.
 *
 * Threshold Tiers per PRD-MTL-UI-GAPS:
 * - none: < $2,500 (no notification)
 * - warning: ≥ $2,500, < $3,000 (approaching MTL threshold)
 * - watchlist_met: ≥ $3,000, ≤ $9,000 (MTL entry auto-created)
 * - ctr_near: > $9,000, ≤ $10,000 (approaching CTR)
 * - ctr_met: > $10,000 (CTR required - strictly > per 31 CFR § 1021.311)
 *
 * @see EXECUTION-SPEC-PRD-MTL-UI-GAPS.md WS2
 */

'use client';

import { useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';

import { DEFAULT_THRESHOLDS } from '@/services/mtl/mappers';

// ============================================================================
// Constants
// ============================================================================

/** Conversion factor from cents to dollars */
const CENTS_TO_DOLLARS = 100;

/** Warning threshold as percentage of MTL threshold (83.33% ≈ $2,500 of $3,000) */
const WARNING_THRESHOLD_RATIO = 5 / 6;

// ============================================================================
// Types
// ============================================================================

/**
 * Threshold level classification
 */
export type ThresholdLevel =
  | 'none'
  | 'warning'
  | 'watchlist_met'
  | 'ctr_near'
  | 'ctr_met';

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
  /** Warning threshold - approaching MTL (default $2,500) */
  warningThreshold: number;
  /** MTL threshold - house policy for transaction logging (default $3,000) */
  watchlistFloor: number;
  /** CTR threshold - strictly > triggers CTR filing (default $10,000) */
  ctrThreshold: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Convert thresholds from cents (database) to dollars (UI display).
 * Derived from DEFAULT_THRESHOLDS in mappers.ts to maintain single source of truth.
 */
const mtlThresholdDollars =
  DEFAULT_THRESHOLDS.watchlistFloor / CENTS_TO_DOLLARS;
const ctrThresholdDollars = DEFAULT_THRESHOLDS.ctrThreshold / CENTS_TO_DOLLARS;

const DEFAULT_CONFIG: ThresholdConfig = {
  /** Warning at ~83% of MTL threshold */
  warningThreshold: Math.floor(mtlThresholdDollars * WARNING_THRESHOLD_RATIO),
  /** MTL threshold from system defaults (converted from cents) */
  watchlistFloor: mtlThresholdDollars,
  /** CTR threshold from system defaults (converted from cents) */
  ctrThreshold: ctrThresholdDollars,
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
      level: 'ctr_met',
      shouldCreateMtl: true,
      requiresCtr: true,
      message: `CTR REQUIRED: Daily total of $${amount.toLocaleString()} exceeds $${config.ctrThreshold.toLocaleString()} threshold. A Currency Transaction Report must be filed per 31 CFR § 1021.311.`,
    };
  }

  // CTR Near: > 90% of CTR threshold
  if (amount > config.ctrThreshold * 0.9) {
    return {
      level: 'ctr_near',
      shouldCreateMtl: true,
      requiresCtr: false,
      message: `CTR threshold approaching: $${amount.toLocaleString()} of $${config.ctrThreshold.toLocaleString()} limit. Customer ID verification may be required soon.`,
    };
  }

  // MTL threshold met: >= $3,000 (house policy)
  if (amount >= config.watchlistFloor) {
    return {
      level: 'watchlist_met',
      shouldCreateMtl: true,
      requiresCtr: false,
      message: `MTL entry created: $${amount.toLocaleString()} transaction recorded for compliance tracking.`,
    };
  }

  // Warning: approaching MTL threshold ($2,500 - $3,000)
  if (amount >= config.warningThreshold) {
    return {
      level: 'warning',
      shouldCreateMtl: false,
      requiresCtr: false,
      message: `Approaching $${config.watchlistFloor.toLocaleString()} MTL threshold. Current total: $${amount.toLocaleString()}.`,
    };
  }

  // No threshold concerns
  return {
    level: 'none',
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
    case 'ctr_met':
      toast.error(result.message, {
        duration: TOAST_DURATION.error,
        id: 'ctr-met-notification',
      });
      break;

    case 'ctr_near':
      toast.warning(result.message, {
        duration: TOAST_DURATION.warning,
        id: 'ctr-near-notification',
      });
      break;

    case 'watchlist_met':
      toast.info(result.message, {
        duration: TOAST_DURATION.info,
        id: 'watchlist-notification',
      });
      break;

    case 'warning':
      toast.warning(result.message, {
        duration: TOAST_DURATION.warning,
        id: 'warning-notification',
      });
      break;

    case 'none':
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
  const lastNotifiedLevel = useRef<ThresholdLevel>('none');

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
        'none',
        'warning',
        'watchlist_met',
        'ctr_near',
        'ctr_met',
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
    lastNotifiedLevel.current = 'none';
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
