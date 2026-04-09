/**
 * PII Denylist for Sentry Error Payloads
 *
 * Scrubs casino-sensitive and player PII fields from error event
 * payloads before transmission to Sentry. The denylist is a secondary
 * guard — the integration also prefers minimal capture of extras,
 * contexts, and tags to limit exposure surface.
 *
 * @see FIB-H-SENTRY-001 RULE-2
 * @see EXEC-063 DEC-004
 */

import type { ErrorEvent, EventHint } from '@sentry/nextjs';

// ---------------------------------------------------------------------------
// Denylist — fields that MUST be scrubbed from Sentry payloads
// ---------------------------------------------------------------------------

/** Player identity fields */
const PLAYER_IDENTITY = [
  'first_name',
  'last_name',
  'middle_name',
  'full_name',
  'email',
  'phone_number',
  'birth_date',
  'patron_first_name',
  'patron_last_name',
  'patron_date_of_birth',
  'recipient_email',
  'p_first_name',
  'p_last_name',
  'p_email',
  'p_birth_date',
  'player_first_name',
  'player_last_name',
  'player_birth_date',
] as const;

/** Financial / gaming metric fields */
const FINANCIAL = [
  'average_bet',
  'final_average_bet',
  'buy_in',
  'cash_out',
  'cash_out_observed_cents',
  'cash_out_observed_confirmed_total',
  'cash_out_observed_estimate_total',
  'cash_out_last_observed_at',
  'win_loss',
  'win_loss_cents',
  'win_loss_estimated_total_cents',
  'win_loss_inventory_total_cents',
  'ledger_balance',
  'current_balance',
  'balance_before',
  'balance_after',
  'min_points_balance',
] as const;

/** Staff identifier fields */
const STAFF_IDENTIFIERS = [
  'staff_id',
  'created_by_staff_id',
  'issued_by_staff_id',
  'replaced_by_staff_id',
  'voided_by_staff_id',
  'activated_by_staff_id',
  'closed_by_staff_id',
  'opened_by_staff_id',
  'paused_by_staff_id',
  'resumed_by_staff_id',
  'rolled_over_by_staff_id',
  'rundown_started_by_staff_id',
] as const;

/** Casino context fields (correlatable to player records) */
const CASINO_CONTEXT = ['casino_id'] as const;

/** Combined set for O(1) lookup */
const DENYLIST: ReadonlySet<string> = new Set<string>([
  ...PLAYER_IDENTITY,
  ...FINANCIAL,
  ...STAFF_IDENTIFIERS,
  ...CASINO_CONTEXT,
]);

const FILTERED = '[Filtered]';

// ---------------------------------------------------------------------------
// Recursive scrubber
// ---------------------------------------------------------------------------

function scrubObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(scrubObject);

  const record = obj as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(record)) {
    if (DENYLIST.has(key)) {
      result[key] = FILTERED;
    } else {
      result[key] = scrubObject(record[key]);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// beforeSend hook — registered in both client and server configs
// ---------------------------------------------------------------------------

export function beforeSend(
  event: ErrorEvent,
  _hint: EventHint,
): ErrorEvent | null {
  // Scrub extras
  if (event.extra) {
    event.extra = scrubObject(event.extra) as Record<string, unknown>;
  }

  // Scrub contexts
  if (event.contexts) {
    event.contexts = scrubObject(event.contexts) as typeof event.contexts;
  }

  // Scrub breadcrumb data
  if (event.breadcrumbs) {
    for (const crumb of event.breadcrumbs) {
      if (crumb.data) {
        crumb.data = scrubObject(crumb.data) as Record<string, unknown>;
      }
    }
  }

  // Scrub tags
  if (event.tags) {
    event.tags = scrubObject(event.tags) as Record<string, string>;
  }

  // Scrub user context (but preserve id for grouping)
  if (event.user) {
    const userId = event.user.id;
    event.user = scrubObject(event.user) as typeof event.user;
    if (userId) {
      event.user.id = userId;
    }
  }

  return event;
}
