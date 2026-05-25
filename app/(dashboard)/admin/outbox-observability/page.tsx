import type { Metadata } from 'next';

import { OutboxObservabilityClient } from './OutboxObservabilityClient';

export const metadata: Metadata = {
  title: 'Outbox Observability | d3lt',
};

export default function OutboxObservabilityPage() {
  return <OutboxObservabilityClient />;
}
