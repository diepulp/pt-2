// lib/print/print-reward.ts — Dispatch by family (R26-R29)

import { iframePrint } from './iframe-print';
import { buildCompSlipHtml } from './templates/comp-slip';
import { buildCouponHtml } from './templates/coupon';
import type { FulfillmentPayload, PrintJob } from './types';

/** Discriminate on payload.family, build the correct template, and print via iframe.
 *  Returns a PrintJob (promise + cleanup). */
export function printReward(payload: FulfillmentPayload): PrintJob {
  let html: string;

  switch (payload.family) {
    case 'points_comp':
      html = buildCompSlipHtml(payload);
      break;
    case 'entitlement':
      html = buildCouponHtml(payload);
      break;
    default: {
      const _exhaustive: never = payload;
      return {
        promise: Promise.resolve({
          success: false,
          error: `Unknown reward family: ${(_exhaustive as { family: string }).family}`,
        }),
        cleanup: () => {},
      };
    }
  }

  return iframePrint(html);
}
