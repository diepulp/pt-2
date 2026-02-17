/**
 * Amount Display Component
 *
 * Converts cents to formatted dollar display at UI boundary (ADR-031).
 * All amounts stored as integers (cents) in database and service layer.
 *
 * @see PRD-033 Cashier Workflow MVP
 */

interface AmountDisplayProps {
  cents: number;
  className?: string;
}

export function AmountDisplay({ cents, className }: AmountDisplayProps) {
  const dollars = (cents / 100).toFixed(2);
  return <span className={className}>${dollars}</span>;
}
