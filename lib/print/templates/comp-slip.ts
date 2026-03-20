// lib/print/templates/comp-slip.ts — Comp slip HTML template builder (R8-R13)

import { escapeHtml } from '../escape-html';
import type { CompFulfillmentPayload } from '../types';

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

/** Build a self-contained HTML document for printing a comp slip.
 *  All string fields are HTML-escaped. player_id is NOT rendered. */
export function buildCompSlipHtml(payload: CompFulfillmentPayload): string {
  const casino = escapeHtml(payload.casino_name);
  const player = escapeHtml(payload.player_name);
  const reward = escapeHtml(payload.reward_name);
  const staff = escapeHtml(payload.staff_name);
  const shortRef = payload.ledger_id.slice(-8).toUpperCase();
  const fullRef = escapeHtml(payload.ledger_id);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Comp Slip</title>
<style>${getSharedStyles()}
  .ref-short {
    font-family: 'Courier New', Courier, monospace;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 1px;
    text-align: center;
    margin: 6px 0 2px 0;
  }
  .ref-full {
    font-family: 'Courier New', Courier, monospace;
    font-size: 8px;
    color: #888;
    text-align: center;
    word-break: break-all;
  }
</style>
</head>
<body>
  <h2 class="text-center bold">${casino}</h2>
  <div class="text-center small">COMP SLIP</div>
  <hr>

  <div class="row">
    <span class="row-label">Player</span>
    <span class="row-value">${player}</span>
  </div>

  <div class="row">
    <span class="row-label">Reward</span>
    <span class="row-value">${reward}</span>
  </div>

  <div class="row">
    <span class="row-label">Value</span>
    <span class="row-value bold">${formatCents(payload.face_value_cents)}</span>
  </div>

  <hr>

  <div class="row">
    <span class="row-label">Points Redeemed</span>
    <span class="row-value">${payload.points_redeemed}</span>
  </div>

  <div class="row">
    <span class="row-label">Balance After</span>
    <span class="row-value">${payload.balance_after}</span>
  </div>

  <hr>

  <div class="row">
    <span class="row-label">Issued by</span>
    <span class="row-value">${staff}</span>
  </div>

  <div class="row">
    <span class="row-label">Date</span>
    <span class="row-value">${formatTimestamp(payload.issued_at)}</span>
  </div>

  <hr>

  <div class="text-center small">Reference</div>
  <div class="ref-short">${shortRef}</div>
  <div class="ref-full">${fullRef}</div>
</body>
</html>`;
}
