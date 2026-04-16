import Link from 'next/link';

import { Section } from '@/components/marketing/section';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-static';

const included = [
  'Shift dashboard and floor overview',
  'Player profiles and visit tracking',
  'Rating slips and theoretical win computation',
  'Cash activity capture and threshold monitoring',
  'Loyalty program — points, tiers, and rewards',
  'Operational logs with staff attribution',
  'MTL-style transaction log',
  'Role-based access control',
  'Row-level data isolation per property',
  'Guided setup wizard',
  'Player data import tools',
  'Ongoing updates and support',
];

export default function PricingPage() {
  return (
    <>
      <Section>
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          Pricing
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">
          One product. One price per property. No tiers, no modules, no per-seat
          fees.
        </p>
      </Section>

      <Section muted>
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
          What you get
        </h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {included.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2 text-base text-muted-foreground"
            >
              <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
              {item}
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <div className="max-w-xl">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            How pricing works
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            Player Tracker is priced per property. Every property gets the full
            platform — same features, same support, no upsells. We&apos;ll work
            with you to find the right arrangement for your operation.
          </p>
          <Button className="mt-6" size="lg" asChild>
            <Link href="/contact">Talk to Us About Pricing</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
