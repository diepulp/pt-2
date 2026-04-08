export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      {/* PT-2 Branding Mark */}
      <div className="mb-8 flex items-center gap-3">
        <div className="h-8 w-8 rounded border-2 border-accent/50 bg-accent/10 flex items-center justify-center">
          <span
            className="text-sm font-bold text-accent"
            style={{ fontFamily: 'monospace' }}
          >
            PT
          </span>
        </div>
        <span
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          Pit Station
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
