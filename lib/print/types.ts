// lib/print/types.ts — Type definitions for the print module (no runtime code)

export type {
  FulfillmentPayload,
  CompFulfillmentPayload,
  EntitlementFulfillmentPayload,
} from '@/services/loyalty/dtos';

/** Result of a print attempt. Success means the print dialog was invoked,
 *  NOT that physical printing completed. */
export interface PrintResult {
  success: boolean;
  error?: string;
}

/** Distinguishes how a print was triggered — for future audit logging (R39A). */
export type PrintInvocationMode =
  | 'auto_attempt'
  | 'manual_print'
  | 'manual_reprint';

/** Observable state of the print hook. */
export type PrintState = 'idle' | 'printing' | 'success' | 'error';

/** Return value from iframePrint — pairs the async result with an
 *  idempotent cleanup function for React unmount handling. */
export interface PrintJob {
  promise: Promise<PrintResult>;
  cleanup: () => void;
}
