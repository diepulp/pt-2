/** @jest-environment node */

/**
 * ReceiptDocument semantic snapshot (PRD-092 WS8 / ADR-062 D6)
 *
 * Proves the canonical `ReceiptDocument` faithfully carries the instrument's
 * semantic content for BOTH families and that the provenance hash is a stable
 * function of the document alone. Asserts the load-bearing fields explicitly
 * (instrument token, monetary value, expiry, terms, template identity, feed/cut)
 * rather than via a snapshot file, so the suite is `--ci`-clean with no committed
 * `.snap` artifact to drift.
 *
 * VALUE AUTHORITY (DA §5): value is rendered from `face_value_cents` only.
 *
 * @see PRD-092 / EXEC-092 WS8 / ADR-062 D6 (canonical document)
 */

import { describe, it, expect } from '@jest/globals';

import type {
  CompFulfillmentPayload,
  EntitlementFulfillmentPayload,
} from '@/services/loyalty/dtos';
import {
  buildReceiptDocument,
  ENTITLEMENT_TEMPLATE_ID,
  COMP_TEMPLATE_ID,
  TEMPLATE_VERSION,
} from '@/services/loyalty/printing/templates/build-receipt';
import {
  hashReceiptDocument,
  serializeReceiptDocumentCanonical,
} from '@/services/loyalty/printing/templates/hash';
import type {
  ReceiptBarcodeBlock,
  ReceiptBlock,
  ReceiptDocument,
  ReceiptTextBlock,
} from '@/services/loyalty/printing/templates/receipt-document';

const ENTITLEMENT: EntitlementFulfillmentPayload = {
  family: 'entitlement',
  coupon_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  validation_number: 'SNAP-ENT-9001',
  reward_id: 'r-ent',
  reward_code: 'MATCH25',
  reward_name: 'Match Play $25',
  face_value_cents: 2500,
  required_match_wager_cents: 2500,
  expires_at: '2026-12-31T23:59:59Z',
  player_name: 'Snapshot Player',
  player_id: 'p-1',
  player_tier: 'gold',
  casino_name: 'Snapshot Casino',
  staff_name: 'Snapshot Boss',
  issued_at: '2026-06-21T12:00:00Z',
};

const COMP: CompFulfillmentPayload = {
  family: 'points_comp',
  ledger_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  reward_id: 'r-comp',
  reward_code: 'COMP10',
  reward_name: 'Buffet Comp',
  face_value_cents: 1000,
  points_redeemed: 100,
  balance_after: 400,
  player_name: 'Snapshot Player',
  player_id: 'p-1',
  casino_name: 'Snapshot Casino',
  staff_name: 'Snapshot Boss',
  issued_at: '2026-06-21T12:00:00Z',
};

function texts(doc: ReceiptDocument): string[] {
  return doc.blocks
    .filter((b): b is ReceiptTextBlock => b.type === 'text')
    .map((b) => b.text);
}

function barcode(doc: ReceiptDocument): ReceiptBarcodeBlock | undefined {
  return doc.blocks.find((b): b is ReceiptBarcodeBlock => b.type === 'barcode');
}

function hasBlock(doc: ReceiptDocument, type: ReceiptBlock['type']): boolean {
  return doc.blocks.some((b) => b.type === type);
}

describe('ReceiptDocument semantic snapshot (WS8)', () => {
  describe('entitlement coupon', () => {
    const doc = buildReceiptDocument(ENTITLEMENT);

    it('carries the versioned template identity', () => {
      expect(doc.templateId).toBe(ENTITLEMENT_TEMPLATE_ID);
      expect(doc.templateVersion).toBe(TEMPLATE_VERSION);
    });

    it('renders monetary value from face_value_cents (DA §5)', () => {
      expect(texts(doc)).toContain('Value: $25.00');
    });

    it('renders match-wager terms and expiry', () => {
      expect(texts(doc)).toContain('Match wager: $25.00');
      expect(texts(doc)).toContain('Expires: 2026-12-31T23:59:59Z');
    });

    it('carries the instrument token as a scannable barcode (validation_number)', () => {
      const bc = barcode(doc);
      expect(bc?.data).toBe('SNAP-ENT-9001');
      expect(bc?.symbology).toBe('code128');
      expect(bc?.humanReadable).toBe(true);
    });

    it('includes feed + cut control blocks', () => {
      expect(hasBlock(doc, 'feed')).toBe(true);
      expect(hasBlock(doc, 'cut')).toBe(true);
    });
  });

  describe('points_comp slip', () => {
    const doc = buildReceiptDocument(COMP);

    it('carries the comp template identity', () => {
      expect(doc.templateId).toBe(COMP_TEMPLATE_ID);
      expect(doc.templateVersion).toBe(TEMPLATE_VERSION);
    });

    it('renders value, points redeemed, and balance', () => {
      const t = texts(doc);
      expect(t).toContain('Value: $10.00');
      expect(t).toContain('Points redeemed: 100');
      expect(t).toContain('Balance after: 400');
    });

    it('carries the ledger id as the instrument token (non-human-readable)', () => {
      const bc = barcode(doc);
      expect(bc?.data).toBe(COMP.ledger_id);
      expect(bc?.humanReadable).toBe(false);
    });
  });

  describe('provenance hash', () => {
    it('is a stable function of the document (same input → same hash)', () => {
      const a = hashReceiptDocument(buildReceiptDocument(ENTITLEMENT));
      const b = hashReceiptDocument(buildReceiptDocument(ENTITLEMENT));
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    it('differs between the two families', () => {
      expect(hashReceiptDocument(buildReceiptDocument(ENTITLEMENT))).not.toBe(
        hashReceiptDocument(buildReceiptDocument(COMP)),
      );
    });

    it('is insertion-order independent (canonical key ordering)', () => {
      const doc = buildReceiptDocument(ENTITLEMENT);
      const reordered: ReceiptDocument = {
        // Same data, keys declared in a different order.
        blocks: doc.blocks,
        templateVersion: doc.templateVersion,
        templateId: doc.templateId,
      };
      expect(serializeReceiptDocumentCanonical(reordered)).toBe(
        serializeReceiptDocumentCanonical(doc),
      );
      expect(hashReceiptDocument(reordered)).toBe(hashReceiptDocument(doc));
    });
  });
});
