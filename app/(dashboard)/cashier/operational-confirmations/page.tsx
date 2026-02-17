export const dynamic = 'force-dynamic';

import { OperationalConfirmationsView } from './operational-confirmations-view';

/**
 * Operational Confirmations Page
 *
 * Server component wrapper for the fill/credit confirmation view.
 *
 * @see PRD-033 Cashier Workflow MVP
 */
export default function OperationalConfirmationsPage() {
  return <OperationalConfirmationsView />;
}
