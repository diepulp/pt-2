/**
 * Surface Classification (ADR-041 §5.2):
 *   Rendering Delivery: Client Shell — pure form page; no server read at load time.
 *   Data Aggregation:   None — submit-only; no data consumed on render.
 *   Rejected: RSC Prefetch — nothing to prefetch for a public request form.
 *   Metric Provenance:  None — no truth-bearing metrics rendered.
 */

import Link from 'next/link';

import { RequestAccessForm } from '@/components/request-access-form';

export default function RequestAccessPage() {
  return (
    <div className="relative min-h-[70vh] overflow-hidden bg-[#000212]">
      {/* Dot grid texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.4) 0.5px, transparent 0.5px)',
          backgroundSize: '24px 24px',
          opacity: 0.04,
        }}
      />

      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 50% 50% at 50% 20%, hsl(189 94% 43% / 0.06), transparent)',
        }}
      />
      <div className="relative flex min-h-dvh items-center justify-center px-5 py-8 sm:px-6">
        <div className="w-full max-w-[600px]">
          <Link
            href="/"
            className="mb-8 flex flex-col items-center transition-opacity duration-300 hover:opacity-80"
          >
            <span
              className="text-lg tracking-wide text-[hsl(189_94%_43%)]/80"
              style={{ fontFamily: 'var(--font-michroma)' }}
            >
              d3lt
            </span>
            <div className="h-px w-full bg-gradient-to-r from-transparent via-[hsl(189_94%_43%)]/25 to-transparent" />
          </Link>
          <RequestAccessForm />
        </div>
      </div>
    </div>
  );
}
