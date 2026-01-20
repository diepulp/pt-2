/**
 * CTR Banner Component
 *
 * Persistent warning banner displayed when CTR threshold (>$10,000) is exceeded.
 * Provides regulatory reference and FinCEN filing information.
 *
 * Per 31 CFR § 1021.311, casinos must file a Currency Transaction Report
 * for each transaction in currency of more than $10,000.
 *
 * @see EXECUTION-SPEC-PRD-MTL-UI-GAPS.md WS5
 */

'use client';

import { AlertTriangle, ExternalLink, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ============================================================================
// Constants
// ============================================================================

/**
 * FinCEN CTR filing information link
 */
const FINCEN_CTR_URL = 'https://www.fincen.gov/resources/filing-information';

/**
 * Session storage key for CTR banner dismissal
 * Scoped by gaming_day to reset daily
 */
const DISMISS_STORAGE_KEY_PREFIX = 'ctr-banner-dismissed-';

// ============================================================================
// Types
// ============================================================================

export interface CtrBannerProps {
  /** Daily total amount that triggered CTR (should be > $10,000) */
  dailyTotal: number;
  /** Patron name for display (optional) */
  patronName?: string;
  /** Gaming day this CTR applies to */
  gamingDay?: string;
  /** Additional CSS classes */
  className?: string;
  /** Callback when banner is dismissed */
  onDismiss?: () => void;
  /** Whether to allow dismissal (default: true) */
  dismissible?: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * CTR Banner
 *
 * Displays when a patron's daily total exceeds the $10,000 CTR threshold.
 * Shows the amount, regulatory reference, and link to FinCEN filing information.
 *
 * Dismissal is stored in session storage with gaming_day scope to reset daily.
 *
 * @example
 * ```tsx
 * {requiresCtr && (
 *   <CtrBanner
 *     dailyTotal={12500}
 *     patronName="John Smith"
 *     gamingDay="2026-01-16"
 *     onDismiss={() => setShowBanner(false)}
 *   />
 * )}
 * ```
 */
export function CtrBanner({
  dailyTotal,
  patronName,
  gamingDay,
  className,
  onDismiss,
  dismissible = true,
}: CtrBannerProps) {
  // Check session storage for previous dismissal
  const storageKey = gamingDay
    ? `${DISMISS_STORAGE_KEY_PREFIX}${gamingDay}`
    : DISMISS_STORAGE_KEY_PREFIX;

  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(storageKey) === 'true';
  });

  const handleDismiss = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(storageKey, 'true');
    }
    setIsDismissed(true);
    onDismiss?.();
  }, [storageKey, onDismiss]);

  // Don't render if dismissed
  if (isDismissed) {
    return null;
  }

  // Format the amount
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(dailyTotal);

  return (
    <Alert
      variant="destructive"
      className={cn('border-red-500 bg-red-50 dark:bg-red-950/30', className)}
      role="alert"
      aria-live="assertive"
    >
      <AlertTriangle className="h-5 w-5" aria-hidden="true" />
      <div className="flex-1">
        <AlertTitle className="text-red-800 dark:text-red-200 font-semibold">
          CTR Required - Currency Transaction Report
        </AlertTitle>
        <AlertDescription className="text-red-700 dark:text-red-300 space-y-2">
          <p>
            {patronName ? (
              <>
                <span className="font-medium">{patronName}</span>&apos;s daily
                total of{' '}
                <span className="font-mono font-bold">{formattedAmount}</span>{' '}
                exceeds the $10,000 threshold.
              </>
            ) : (
              <>
                Daily total of{' '}
                <span className="font-mono font-bold">{formattedAmount}</span>{' '}
                exceeds the $10,000 threshold.
              </>
            )}
          </p>
          <p className="text-sm">
            Per <span className="font-medium">31 CFR § 1021.311</span>, a
            Currency Transaction Report must be filed for each transaction in
            currency of more than $10,000.
          </p>
          <p className="text-sm flex items-center gap-1">
            <a
              href={FINCEN_CTR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline hover:no-underline font-medium"
            >
              FinCEN Filing Information
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">(opens in new window)</span>
            </a>
          </p>
        </AlertDescription>
      </div>
      {dismissible && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-red-700 hover:text-red-900 hover:bg-red-100 dark:text-red-300 dark:hover:text-red-100 dark:hover:bg-red-900/50"
          onClick={handleDismiss}
          aria-label="Dismiss CTR notification"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </Alert>
  );
}
