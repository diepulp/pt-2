'use client';

// lib/print/hooks/use-print-reward.ts — React hook for print state machine (R30-R35)

import { useState, useRef, useEffect } from 'react';

import { printReward } from '../print-reward';
import type {
  FulfillmentPayload,
  PrintInvocationMode,
  PrintState,
} from '../types';

interface UsePrintRewardReturn {
  print: (payload: FulfillmentPayload, mode?: PrintInvocationMode) => void;
  state: PrintState;
  error: string | null;
  reset: () => void;
}

/** Hook that manages print lifecycle with idle/printing/success/error states.
 *
 *  - Inserts a 2x rAF yield before the blocking print() call so the
 *    "Printing..." spinner can paint.
 *  - Stores the PrintJob cleanup handle and calls it on unmount to
 *    prevent orphaned iframes.
 *  - Re-callable: calling print() again resets to 'printing' immediately. */
export function usePrintReward(): UsePrintRewardReturn {
  const [state, setState] = useState<PrintState>('idle');
  const [error, setError] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount — remove orphaned iframes
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const print = (payload: FulfillmentPayload, _mode?: PrintInvocationMode) => {
    // Clean up any previous print job
    cleanupRef.current?.();
    cleanupRef.current = null;

    setState('printing');
    setError(null);

    // Yield to the browser so React can paint the "Printing..." state
    // before the blocking window.print() dialog appears
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const job = printReward(payload);
        cleanupRef.current = job.cleanup;

        job.promise.then((result) => {
          if (result.success) {
            setState('success');
          } else {
            setState('error');
            setError(result.error ?? 'Print failed');
          }
        });
      });
    });
  };

  const reset = () => {
    setState('idle');
    setError(null);
  };

  return { print, state, error, reset };
}
