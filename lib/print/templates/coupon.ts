// lib/print/templates/coupon.ts — Coupon HTML template builder (R14-R21)

import { escapeHtml } from '../escape-html';
import type { EntitlementFulfillmentPayload } from '../types';

import { getSharedStyles } from './shared-styles';

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

/** Build a self-contained HTML document for printing an entitlement coupon.
 *  Validation number is the most visually prominent element.
 *  All string fields are HTML-escaped. player_id is NOT rendered. */
export function buildCouponHtml(
  payload: EntitlementFulfillmentPayload,
): string {
  const casino = escapeHtml(payload.casino_name);
  const player = escapeHtml(payload.player_name);
  const reward = escapeHtml(payload.reward_name);
  const staff = escapeHtml(payload.staff_name);
  const tier = escapeHtml(payload.player_tier);
  const validationNum = escapeHtml(payload.validation_number);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Coupon</title>
<style>${getSharedStyles()}
  .validation-box {
    border: 2px solid #000;
    padding: 8px 12px;
    margin: 10px 0;
    text-align: center;
  }
  .validation-number {
    font-family: 'Courier New', Courier, monospace;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 2px;
  }
  .validation-label {
    font-size: 8px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 4px;
  }
</style>
</head>
<body>
  <h2 class="text-center bold">${casino}</h2>
  <div class="text-center small">REWARD COUPON</div>
  <hr>

  <div class="validation-box">
    <div class="validation-label">Validation Number</div>
    <div class="validation-number">${validationNum}</div>
  </div>

  <div class="row">
    <span class="row-label">Player</span>
    <span class="row-value">${player}</span>
  </div>

  <div class="row">
    <span class="row-label">Tier</span>
    <span class="row-value">${tier}</span>
  </div>

  <div class="row">
    <span class="row-label">Reward</span>
    <span class="row-value">${reward}</span>
  </div>

  <div class="row">
    <span class="row-label">Value</span>
    <span class="row-value bold">${formatCents(payload.face_value_cents)}</span>
  </div>
${
  payload.required_match_wager_cents !== null
    ? `
  <div class="row">
    <span class="row-label">Match Wager</span>
    <span class="row-value">${formatCents(payload.required_match_wager_cents)}</span>
  </div>
`
    : ''
}${
    payload.expires_at !== null
      ? `
  <div class="row">
    <span class="row-label">Expires</span>
    <span class="row-value">${formatDate(payload.expires_at)}</span>
  </div>
`
      : ''
  }
  <hr>

  <div class="row">
    <span class="row-label">Issued by</span>
    <span class="row-value">${staff}</span>
  </div>

  <div class="row">
    <span class="row-label">Date</span>
    <span class="row-value">${formatTimestamp(payload.issued_at)}</span>
  </div>
</body>
</html>`;
}
