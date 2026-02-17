import { TimelineStep } from '../timeline-step';

const steps = [
  {
    title: 'Sign in',
    description: 'Secure authentication via email and password.',
  },
  {
    title: 'Bootstrap',
    description:
      'If you\u2019re new, create your casino workspace and bind your staff account.',
  },
  {
    title: 'Initial setup',
    description:
      'Configure basics — tables, areas, game defaults, staff roles. When ready, the app opens.',
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-16 md:py-20 lg:py-24 bg-muted/30">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl md:text-4xl font-semibold mb-10">
          One guided path to operational.
        </h2>
        <div className="max-w-xl">
          {steps.map((s, i) => (
            <TimelineStep
              key={s.title}
              step={i + 1}
              title={s.title}
              description={s.description}
              isLast={i === steps.length - 1}
            />
          ))}
        </div>
        <p className="text-sm text-muted-foreground mt-6 max-w-xl">
          Player Tracker never guesses where you belong — it checks the database
          and routes you correctly.
        </p>
      </div>
    </section>
  );
}
