import { Section } from '@/components/marketing/section';

const trustSignals = [
  {
    title: 'Audit trail by default',
    description:
      'Every mutation, every transaction, every access — logged with staff attribution and timestamps. No add-on, no configuration.',
  },
  {
    title: 'Title 31 awareness',
    description:
      'Currency activity capture, gaming-day-aware aggregation, and threshold monitoring built into the operational flow — not bolted on after the fact.',
  },
  {
    title: 'Row-level security',
    description:
      'Casino-scoped data isolation enforced at the database level. Staff see only their property. No shared logins, no leaky queries.',
  },
  {
    title: 'Immutable financial records',
    description:
      'Cash transactions, loyalty ledger entries, and rating slip financials are append-only. The record is the record.',
  },
];

export function ComplianceTrustSection() {
  return (
    <Section id="compliance">
      <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
        Compliance built in, not bolted on.
      </h2>
      <p className="mt-3 max-w-2xl text-base text-muted-foreground md:text-lg">
        Player Tracker isn&apos;t a compliance product — it&apos;s an operations
        platform that happens to be audit-grade. The controls are structural,
        not cosmetic.
      </p>
      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        {trustSignals.map((signal) => (
          <div key={signal.title} className="space-y-2">
            <h3 className="text-lg font-semibold">{signal.title}</h3>
            <p className="text-base text-muted-foreground">
              {signal.description}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}
