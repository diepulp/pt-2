import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function PricingTeaserSection() {
  return (
    <section id="pricing" className="py-16 md:py-20 lg:py-24 bg-muted/30">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl md:text-4xl font-semibold mb-10">
          Simple pricing.
        </h2>
        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Pilot / Early Access</CardTitle>
                <Badge variant="secondary">Current</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-base">
                Contact us to request access. We&apos;ll work with you to get
                operational.
              </p>
              <Button variant="outline" className="mt-4" asChild>
                <Link href="/contact">Contact us</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Standard</CardTitle>
                <Badge variant="outline">Coming soon</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-base">
                Per-casino pricing. Details available after pilot feedback.
              </p>
              <Button className="mt-4" asChild>
                <Link href="/start">Get started</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
