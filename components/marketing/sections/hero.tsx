import Link from 'next/link';

import { Button } from '@/components/ui/button';

export function HeroSection() {
  return (
    <section className="py-20 md:py-28 lg:py-32">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="space-y-6">
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
              Replace your legacy table games system.
            </h1>
            <p className="max-w-[540px] text-base text-muted-foreground md:text-lg">
              Player Tracker is a full replacement system of record for table
              games operations — built for card rooms ready to move past aging
              software and manual workarounds.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/contact">Request a Demo</Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="#how-it-works">See How It Works</Link>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Already ready to explore?{' '}
              <Link
                href="/start"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Start setup
              </Link>
            </p>
          </div>
          <div className="hidden lg:flex lg:items-center lg:justify-center">
            <div className="flex aspect-[4/3] w-full max-w-[500px] items-center justify-center rounded-lg border bg-muted/50">
              <span className="text-sm text-muted-foreground">
                Shift dashboard screenshot
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
