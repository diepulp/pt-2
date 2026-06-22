/**
 * Receipt builder (PRD-092 WS4)
 *
 * PURE transform: FROZEN `FulfillmentPayload` → canonical `ReceiptDocument`.
 * Reuses the upstream payload (services/loyalty/dtos.ts) verbatim — it is NOT
 * forked or redefined here.
 *
 * VALUE AUTHORITY (DA §5): monetary value is rendered ONLY from the payload's
 * `face_value_cents` (integer cents). It is NEVER re-derived from
 * `promo_coupon.face_value_amount` (numeric *dollars* — a different unit), and
 * the builder never reads the instrument source-of-truth at all. The resulting
 * document is the hash provenance root (`hash.ts`).
 *
 * The builder is side-effect free: no instrument mutation, no network, no
 * printer / OS / `window.print` calls. Templates are version-controlled code;
 * `TEMPLATE_VERSION` is immutable for a given `TEMPLATE_ID` and a content
 * change bumps the version.
 *
 * @see PRD-092 / EXEC-092 WS4
 * @see services/loyalty/dtos.ts (FulfillmentPayload — reused, not forked)
 */

import type { FulfillmentPayload } from '@/services/loyalty/dtos';

import type { ReceiptBlock, ReceiptDocument } from './receipt-document';

/**
 * Versioned template identities (code, not data). One template per instrument
 * family. Bump the version constant when a template's block output changes.
 */
export const ENTITLEMENT_TEMPLATE_ID = 'loyalty.entitlement_coupon';
export const COMP_TEMPLATE_ID = 'loyalty.points_comp_slip';
export const TEMPLATE_VERSION = 1;

/**
 * Format integer cents as a display dollar string. The ONLY value derivation in
 * the templating layer; operates strictly on `face_value_cents` (DA §5).
 */
function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = (abs % 100).toString().padStart(2, '0');
  return `${sign}$${dollars}.${remainder}`;
}

/** Standard non-authoritative footer — the 80mm layout is provisional (FIB DEP-3). */
function provisionalFooter(): ReceiptBlock[] {
  return [
    { type: 'feed', lines: 1 },
    { type: 'divider', char: '-' },
    {
      type: 'text',
      text: 'Provisional layout — not production-authoritative',
      align: 'center',
      size: 'normal',
    },
    { type: 'feed', lines: 2 },
    { type: 'cut', mode: 'partial' },
  ];
}

/** Shared header: casino name + reward title. */
function headerBlocks(casinoName: string, rewardName: string): ReceiptBlock[] {
  return [
    {
      type: 'text',
      text: casinoName,
      align: 'center',
      bold: true,
      size: 'large',
    },
    { type: 'divider', char: '=' },
    { type: 'text', text: rewardName, align: 'center', bold: true },
    { type: 'feed', lines: 1 },
  ];
}

/** Entitlement coupon template (`family === 'entitlement'`). */
function buildEntitlementDocument(
  payload: Extract<FulfillmentPayload, { family: 'entitlement' }>,
): ReceiptDocument {
  const blocks: ReceiptBlock[] = [
    ...headerBlocks(payload.casino_name, payload.reward_name),
    {
      type: 'text',
      text: `Value: ${formatCents(payload.face_value_cents)}`,
      align: 'center',
      size: 'large',
    },
  ];

  if (payload.required_match_wager_cents !== null) {
    blocks.push({
      type: 'text',
      text: `Match wager: ${formatCents(payload.required_match_wager_cents)}`,
      align: 'center',
    });
  }

  blocks.push(
    { type: 'divider', char: '-' },
    {
      type: 'text',
      text: `Player: ${payload.player_name} (${payload.player_tier})`,
    },
    { type: 'text', text: `Code: ${payload.reward_code}` },
  );

  if (payload.expires_at !== null) {
    blocks.push({ type: 'text', text: `Expires: ${payload.expires_at}` });
  }

  blocks.push(
    {
      type: 'text',
      text: `Issued: ${payload.issued_at} by ${payload.staff_name}`,
    },
    { type: 'feed', lines: 1 },
    {
      type: 'barcode',
      symbology: 'code128',
      data: payload.validation_number,
      humanReadable: true,
    },
    ...provisionalFooter(),
  );

  return {
    templateId: ENTITLEMENT_TEMPLATE_ID,
    templateVersion: TEMPLATE_VERSION,
    blocks,
  };
}

/** Points-comp slip template (`family === 'points_comp'`). */
function buildCompDocument(
  payload: Extract<FulfillmentPayload, { family: 'points_comp' }>,
): ReceiptDocument {
  const blocks: ReceiptBlock[] = [
    ...headerBlocks(payload.casino_name, payload.reward_name),
    {
      type: 'text',
      text: `Value: ${formatCents(payload.face_value_cents)}`,
      align: 'center',
      size: 'large',
    },
    { type: 'divider', char: '-' },
    { type: 'text', text: `Player: ${payload.player_name}` },
    { type: 'text', text: `Code: ${payload.reward_code}` },
    { type: 'text', text: `Points redeemed: ${payload.points_redeemed}` },
    { type: 'text', text: `Balance after: ${payload.balance_after}` },
    {
      type: 'text',
      text: `Issued: ${payload.issued_at} by ${payload.staff_name}`,
    },
    { type: 'feed', lines: 1 },
    {
      type: 'barcode',
      symbology: 'code128',
      data: payload.ledger_id,
      humanReadable: false,
    },
    ...provisionalFooter(),
  ];

  return {
    templateId: COMP_TEMPLATE_ID,
    templateVersion: TEMPLATE_VERSION,
    blocks,
  };
}

/**
 * Build the canonical `ReceiptDocument` for a fulfillment payload. PURE and
 * total over the frozen discriminated union — both families (DEC-003) route
 * through the controlled templating path.
 */
export function buildReceiptDocument(
  payload: FulfillmentPayload,
): ReceiptDocument {
  switch (payload.family) {
    case 'entitlement':
      return buildEntitlementDocument(payload);
    case 'points_comp':
      return buildCompDocument(payload);
    default: {
      // Exhaustiveness guard: a new family is a template-layer change, not a
      // silent fallthrough.
      const _exhaustive: never = payload;
      throw new Error(
        `Unsupported fulfillment family: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}
