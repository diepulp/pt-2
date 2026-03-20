/** @jest-environment node */

import { buildCouponHtml } from '../templates/coupon';
import type { EntitlementFulfillmentPayload } from '../types';

const PAYLOAD: EntitlementFulfillmentPayload = {
  family: 'entitlement',
  coupon_id: 'c-001',
  validation_number: 'VN-12345678',
  reward_id: 'r-002',
  reward_code: 'MATCH_50',
  reward_name: 'Match Play $50',
  face_value_cents: 5000,
  required_match_wager_cents: 5000,
  expires_at: '2026-04-01T00:00:00Z',
  player_name: 'Jane Player',
  player_id: 'p-002',
  player_tier: 'Gold',
  casino_name: 'Grand Casino',
  staff_name: 'John Staff',
  issued_at: '2026-03-20T15:30:00Z',
};

describe('buildCouponHtml', () => {
  it('contains casino name as header', () => {
    const html = buildCouponHtml(PAYLOAD);
    expect(html).toContain('Grand Casino');
  });

  it('validation number is present', () => {
    const html = buildCouponHtml(PAYLOAD);
    expect(html).toContain('VN-12345678');
  });

  it('formats face_value_cents correctly', () => {
    const html = buildCouponHtml(PAYLOAD);
    expect(html).toContain('$50.00');
  });

  it('shows match wager when required_match_wager_cents is not null', () => {
    const html = buildCouponHtml(PAYLOAD);
    expect(html).toContain('Match Wager');
    expect(html).toContain('$50.00');
  });

  it('omits match wager when required_match_wager_cents is null', () => {
    const html = buildCouponHtml({
      ...PAYLOAD,
      required_match_wager_cents: null,
    });
    expect(html).not.toContain('Match Wager');
  });

  it('shows expiry when expires_at is not null', () => {
    const html = buildCouponHtml(PAYLOAD);
    expect(html).toContain('Expires');
  });

  it('omits expiry when expires_at is null', () => {
    const html = buildCouponHtml({ ...PAYLOAD, expires_at: null });
    expect(html).not.toContain('Expires');
  });

  it('contains tier information', () => {
    const html = buildCouponHtml(PAYLOAD);
    expect(html).toContain('Gold');
  });

  it('contains staff name and timestamp', () => {
    const html = buildCouponHtml(PAYLOAD);
    expect(html).toContain('John Staff');
    expect(html).toContain('Issued by');
    expect(html).toContain('2026');
  });

  it('escapes HTML in all string fields', () => {
    const html = buildCouponHtml({
      ...PAYLOAD,
      player_name: '<img onerror=alert(1)>',
      casino_name: 'Casino "Royale"',
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&quot;Royale&quot;');
  });

  it('returns valid HTML document', () => {
    const html = buildCouponHtml(PAYLOAD);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('does NOT render player_id', () => {
    const html = buildCouponHtml(PAYLOAD);
    expect(html).not.toContain('p-002');
  });
});
