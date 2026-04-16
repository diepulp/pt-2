import { Section } from '@/components/marketing/section';

const painPoints = [
  {
    problem: 'Weak floor visibility',
    detail:
      'Your shift dashboard is a spreadsheet. Knowing what happened on the floor means asking around or waiting for end-of-shift reports.',
  },
  {
    problem: 'Clumsy workflows',
    detail:
      'Rating slips on paper. Manual data entry after the fact. Double-handling that slows the pit down and introduces errors.',
  },
  {
    problem: 'Delayed reporting',
    detail:
      "You can't answer \"how did the floor do today?\" until someone runs a report hours later. By then it's yesterday's news.",
  },
  {
    problem: 'Manual reconciliation',
    detail:
      'Cash totals, chip fills, player activity — reconciling across binders and systems takes time nobody has.',
  },
  {
    problem: 'Expensive vendor lock-in',
    detail:
      'Your legacy vendor charges for every change. Adding a table, updating a threshold, or pulling a custom report costs time and money.',
  },
];

export function PainSection() {
  return (
    <Section id="pain" muted>
      <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
        What legacy systems cost you.
      </h2>
      <p className="mt-3 max-w-2xl text-base text-muted-foreground md:text-lg">
        The system works — until it doesn&apos;t. These are the operational
        costs that don&apos;t show up on the invoice.
      </p>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {painPoints.map((point) => (
          <div key={point.problem} className="space-y-2">
            <h3 className="text-lg font-semibold">{point.problem}</h3>
            <p className="text-base text-muted-foreground">{point.detail}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
