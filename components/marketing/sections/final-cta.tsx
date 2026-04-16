import Link from 'next/link';

import { Section } from '@/components/marketing/section';
import { Button } from '@/components/ui/button';

export function FinalCTASection() {
  return (
    <Section muted className="text-center">
      <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
        Talk to us about your floor.
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-base text-muted-foreground md:text-lg">
        We&apos;ll walk through how Player Tracker fits your property — your
        tables, your workflows, your pain points. No pitch deck.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Button size="lg" asChild>
          <Link href="/contact">Book a Walkthrough</Link>
        </Button>
        <Button variant="outline" size="lg" asChild>
          <Link href="/pricing">See Pricing</Link>
        </Button>
      </div>
    </Section>
  );
}
