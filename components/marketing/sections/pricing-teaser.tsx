import Link from 'next/link';

import { Section } from '@/components/marketing/section';
import { Button } from '@/components/ui/button';

const included = [
  'Shift dashboard and floor overview',
  'Player profiles and visit tracking',
  'Rating slips and theoretical win',
  'Cash activity and threshold monitoring',
  'Loyalty points and rewards',
  'Operational logs and audit trail',
  'Role-based access control',
  'Ongoing updates and support',
];

export function PricingTeaserSection() {
  return (
    <Section id="pricing" muted>
      <div className="max-w-2xl">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          One product. One price per property.
        </h2>
        <p className="mt-3 text-base text-muted-foreground md:text-lg">
          No tiers. No modules. No per-seat pricing games. You get the full
          platform for each property you operate.
        </p>

        <div className="mt-8 space-y-6">
          <div>
            <h3 className="text-lg font-semibold">What&apos;s included</h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
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
          </div>

          <Button size="lg" asChild>
            <Link href="/contact">Talk to Us About Pricing</Link>
          </Button>
        </div>
      </div>
    </Section>
  );
}
