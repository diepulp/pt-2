import { FeatureShowcase } from '@/components/marketing/feature-showcase';
import { Section } from '@/components/marketing/section';

const features = [
  {
    title: 'Shift dashboard',
    description:
      'Live overview of your floor — active tables, open sessions, cash activity, and shift KPIs. Everything a pit boss needs at the start of a shift, updated in real time.',
    screenshotAlt: 'Shift dashboard screenshot',
    reverse: false,
  },
  {
    title: 'Player 360',
    description:
      'Full player profile with visit history, ratings, buy-ins, theoretical win, and loyalty status. One screen replaces the binder, the spreadsheet, and the sticky note.',
    screenshotAlt: 'Player 360 screenshot',
    reverse: true,
  },
  {
    title: 'Table map and pit layout',
    description:
      'Visual representation of your floor — which tables are open, who is seated, and what the current activity looks like. Configure areas, games, and table positions to match your physical layout.',
    screenshotAlt: 'Pit map screenshot',
    reverse: false,
  },
  {
    title: 'Operational logs',
    description:
      'Structured, searchable event log with staff attribution. Cash transactions, threshold alerts, shift notes — captured as they happen, audit-ready by default.',
    screenshotAlt: 'Operational logs screenshot',
    reverse: true,
  },
];

export function ProductWalkthroughSection() {
  return (
    <Section id="how-it-works" muted>
      <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
        See what you&apos;re getting.
      </h2>
      <p className="mt-3 max-w-2xl text-base text-muted-foreground md:text-lg">
        Player Tracker is built for the way card rooms actually operate — from
        shift start to close.
      </p>
      <div className="mt-12 space-y-16">
        {features.map((feature) => (
          <FeatureShowcase
            key={feature.title}
            title={feature.title}
            description={feature.description}
            screenshotAlt={feature.screenshotAlt}
            reverse={feature.reverse}
          />
        ))}
      </div>
    </Section>
  );
}
