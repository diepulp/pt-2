import Link from 'next/link';

import { Button } from '@/components/ui/button';

export function FinalCTASection() {
  return (
    <section id="start" className="py-16 md:py-20 lg:py-24 bg-muted/30">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl md:text-4xl font-semibold mb-4">
          Get operational in one guided path.
        </h2>
        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          Start Gateway routes you to the right step — bootstrap, setup, or
          straight into the app. No blank screens, no guessing.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button size="lg" asChild>
            <Link href="/start">Get started</Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/signin">Sign in</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
