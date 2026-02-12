export default function DevSetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center bg-background">
      <div className="w-full bg-amber-500/10 border-b border-amber-500/30 px-4 py-1.5 text-center text-xs font-medium text-amber-700 dark:text-amber-400">
        DEV MODE — Stubbed actions, no RLS
      </div>
      <div className="flex-1 flex items-center justify-center w-full">
        <div className="w-full max-w-3xl p-6">{children}</div>
      </div>
    </div>
  );
}
