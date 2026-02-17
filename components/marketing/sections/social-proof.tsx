const principles = [
  'Designed by people who understand pit operations',
  'Optimized for speed under shift pressure',
  'Audit-first logging, not afterthought compliance',
  'Early access — honest about what\u2019s built and what\u2019s next',
];

export function SocialProofSection() {
  return (
    <section id="principles" className="py-16 md:py-20 lg:py-24">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl md:text-4xl font-semibold mb-10">
          Built with floor workflows in mind.
        </h2>
        <ul className="space-y-4 max-w-xl">
          {principles.map((principle) => (
            <li key={principle} className="flex items-start gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <span className="text-base md:text-lg text-muted-foreground">
                {principle}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
