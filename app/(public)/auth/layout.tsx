import Link from 'next/link';

/**
 * Auth layout — Visual DNA dark shell for all authentication pages.
 * Matches the landing page's #000212 ground, dot-grid texture,
 * cyan ambient glow, and PT-2 brand mark.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-[#000212] overflow-x-hidden selection:bg-[hsl(189_94%_43%)]/30">
      {/* Prevent white flash on rubber-band scroll */}
      <style>{`html, body { background-color: #000212; }`}</style>

      {/* Dot grid texture */}
      <div
        className="fixed inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.4) 0.5px, transparent 0.5px)',
          backgroundSize: '24px 24px',
          opacity: 0.04,
        }}
      />

      {/* Ambient top glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 50% 40% at 50% 0%, hsl(189 94% 43% / 0.08), transparent)',
        }}
      />

      {/* Content */}
      <div className="relative flex min-h-svh flex-col items-center justify-center px-5 py-16 sm:px-6">
        {/* Brand mark */}
        <Link
          href="/"
          className="mb-10 flex flex-col items-center gap-3 transition-opacity duration-300 hover:opacity-80"
        >
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-[hsl(189_94%_43%)]/80">
            Player Tracker
          </span>
          <div className="h-px w-20 bg-gradient-to-r from-transparent via-[hsl(189_94%_43%)]/25 to-transparent" />
        </Link>

        {/* Form area */}
        <div className="w-full max-w-[420px]">{children}</div>

        {/* Footer link */}
        <div className="mt-10">
          <Link
            href="/"
            className="text-[13px] text-[#95A2B3]/50 transition-colors duration-300 hover:text-[#95A2B3]"
          >
            &larr; Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
