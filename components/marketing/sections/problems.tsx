const problems = [
  {
    title: 'No more blank states',
    description:
      'Start Gateway routes every user to the correct next step — bootstrap, setup, or the app.',
  },
  {
    title: 'Fast player context',
    description:
      'Win/loss, buy-ins, visits, rewards — visible without hunting through binders or spreadsheets.',
  },
  {
    title: 'Shift continuity',
    description:
      'Standardized logs and consistent handover signals between shifts.',
  },
  {
    title: 'Audit posture',
    description: 'Append-only events where it matters. Changes leave a trail.',
  },
  {
    title: 'One tenant truth',
    description:
      'Staff binding and casino settings drive access and readiness. No shared logins.',
  },
];

export function ProblemsSection() {
  return (
    <section id="problems" className="py-16 md:py-20 lg:py-24 bg-muted/30">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl md:text-4xl font-semibold mb-10">
          What changes on day one.
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {problems.map((problem) => (
            <div key={problem.title} className="space-y-2">
              <h3 className="font-semibold text-lg">{problem.title}</h3>
              <p className="text-muted-foreground text-base">
                {problem.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
