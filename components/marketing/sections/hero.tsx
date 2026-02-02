import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function HeroSection() {
  return (
    <section id="hero" className="py-16 md:py-20 lg:py-24">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
              Player Tracker: shift-ready operations for table games.
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-[600px]">
              Track play, rewards, visits, and floor activity in one place —
              built for pit bosses and shift managers who need answers fast.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button size="lg" asChild>
                <Link href="/start">Get started</Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="#how-it-works">How it works</Link>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              We&apos;ll route you to the right step automatically.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant="secondary">Built for card rooms</Badge>
              <Badge variant="secondary">Role-based access</Badge>
              <Badge variant="secondary">Audit-first logs</Badge>
            </div>
          </div>
          <div className="hidden lg:flex items-center justify-center">
            <div className="w-full max-w-[500px] aspect-[4/3] rounded-lg border bg-muted/50 flex items-center justify-center">
              <span className="text-sm text-muted-foreground font-mono">
                Product screenshot placeholder
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
