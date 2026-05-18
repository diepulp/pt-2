export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      {/* d3lt Branding Mark */}
      <div className="mb-8 flex items-center gap-3">
        <div className="h-8 w-8 rounded border-2 border-accent/50 bg-accent/10 flex items-center justify-center">
          <span
            className="text-[10px] tracking-wide text-accent"
            style={{ fontFamily: 'var(--font-michroma)' }}
          >
            d3lt
          </span>
        </div>
        <span
          className="text-sm tracking-wide text-muted-foreground"
          style={{ fontFamily: 'var(--font-michroma)' }}
        >
          d3lt
        </span>
      </div>

      <div className="w-full max-w-3xl px-6">{children}</div>

      {/* Footer */}
      <div className="mt-12 pb-8">
        <p
          className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40"
          style={{ fontFamily: 'monospace' }}
        >
          Casino Pit Management System
        </p>
      </div>
    </div>
  );
}
