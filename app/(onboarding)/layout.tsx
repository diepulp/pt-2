export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      {/* d3lt Branding Mark */}
      <div className="mb-8 flex flex-col items-center">
        <span
          className="text-lg tracking-wide text-accent/80"
          style={{ fontFamily: 'var(--font-michroma)' }}
        >
          d3lt
        </span>
        <div className="h-px w-12 bg-gradient-to-r from-transparent via-accent/25 to-transparent" />
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
