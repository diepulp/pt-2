import { Section } from '@/components/marketing/section';

const wins = [
  {
    title: 'Real-time floor picture',
    description:
      'See active tables, open sessions, and player activity from one dashboard — not from walking the floor or calling downstairs.',
  },
  {
    title: 'Shift-ready from day one',
    description:
      'Rating slips, visits, buy-ins, and cash events captured in the system as they happen. No double-entry, no transcription lag.',
  },
  {
    title: 'Instant operational answers',
    description:
      'How did the floor do this shift? Who was rated? What was the total cash-in? Answers in seconds, not hours.',
  },
  {
    title: 'One system, one truth',
    description:
      'Players, tables, ratings, loyalty, compliance — in one place. No more cross-referencing binders, spreadsheets, and legacy screens.',
  },
];

export function WhatChangesSection() {
  return (
    <Section id="what-changes">
      <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
        What changes on day one.
      </h2>
      <p className="mt-3 max-w-2xl text-base text-muted-foreground md:text-lg">
        Player Tracker replaces the patchwork. Here&apos;s what your floor gets
        immediately.
      </p>
      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        {wins.map((win) => (
          <div key={win.title} className="space-y-2">
            <h3 className="text-lg font-semibold">{win.title}</h3>
            <p className="text-base text-muted-foreground">{win.description}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
