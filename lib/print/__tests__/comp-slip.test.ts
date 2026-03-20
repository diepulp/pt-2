/** @jest-environment node */

import { buildCompSlipHtml } from '../templates/comp-slip';
import type { CompFulfillmentPayload } from '../types';

const PAYLOAD: CompFulfillmentPayload = {
  family: 'points_comp',
  ledger_id: '550e8400-e29b-41d4-a716-446655440000',
  reward_id: 'r-001',
  reward_code: 'MEAL_25',
  reward_name: 'Meal Comp $25',
  face_value_cents: 2500,
  points_redeemed: 500,
  balance_after: 1500,
  player_name: 'John Smith',
  player_id: 'p-001',
  casino_name: 'Grand Casino',
  staff_name: 'Jane Doe',
  issued_at: '2026-03-20T15:30:00Z',
};

describe('buildCompSlipHtml', () => {
  it('contains casino name as header', () => {
    const html = buildCompSlipHtml(PAYLOAD);
    expect(html).toContain('Grand Casino');
  });

  it('contains player name (escaped)', () => {
    const html = buildCompSlipHtml(PAYLOAD);
    expect(html).toContain('John Smith');
  });

  it('formats face_value_cents 2500 as $25.00', () => {
    const html = buildCompSlipHtml(PAYLOAD);
    expect(html).toContain('$25.00');
  });

  it('formats zero cents as $0.00', () => {
    const html = buildCompSlipHtml({ ...PAYLOAD, face_value_cents: 0 });
    expect(html).toContain('$0.00');
  });

  it('formats sub-dollar amount 50 as $0.50', () => {
    const html = buildCompSlipHtml({ ...PAYLOAD, face_value_cents: 50 });
    expect(html).toContain('$0.50');
  });

  it('displays points_redeemed as integer', () => {
    const html = buildCompSlipHtml(PAYLOAD);
    expect(html).toContain('500');
  });

  it('displays balance_after as integer', () => {
    const html = buildCompSlipHtml(PAYLOAD);
    expect(html).toContain('1500');
  });

  it('shows last 8 chars of ledger_id prominently', () => {
    const html = buildCompSlipHtml(PAYLOAD);
    // Last 8 chars of '550e8400-e29b-41d4-a716-446655440000'
    expect(html).toContain('55440000');
  });

  it('contains full ledger_id UUID', () => {
    const html = buildCompSlipHtml(PAYLOAD);
    expect(html).toContain('550e8400-e29b-41d4-a716-446655440000');
  });

  it('contains staff name in "Issued by" context', () => {
    const html = buildCompSlipHtml(PAYLOAD);
    expect(html).toContain('Jane Doe');
    expect(html).toContain('Issued by');
  });

  it('contains formatted timestamp', () => {
    const html = buildCompSlipHtml(PAYLOAD);
    // Should contain some date representation
    expect(html).toContain('2026');
  });

  it('escapes HTML in player_name with <script> injection', () => {
    const html = buildCompSlipHtml({
      ...PAYLOAD,
      player_name: '<script>alert("xss")</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('returns valid HTML document', () => {
    const html = buildCompSlipHtml(PAYLOAD);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('contains shared styles (system font family)', () => {
    const html = buildCompSlipHtml(PAYLOAD);
    expect(html).toContain('-apple-system');
  });

  it('does NOT render player_id', () => {
    const html = buildCompSlipHtml(PAYLOAD);
    expect(html).not.toContain('p-001');
  });
});
