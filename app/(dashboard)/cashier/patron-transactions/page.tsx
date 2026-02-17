import { PatronTransactionsView } from './patron-transactions-view';

export const dynamic = 'force-dynamic';

/**
 * Patron Transactions Page
 *
 * Cash-out confirmation flow: player search, visit selection,
 * amount confirmation, void/replacement.
 *
 * @see PRD-033 WS5 Patron Transactions
 * @see GAP-PRD033-PATRON-CASHOUT-UI
 */
export default function PatronTransactionsPage() {
  return <PatronTransactionsView />;
}
