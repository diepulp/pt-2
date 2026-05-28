import Link from 'next/link';

import { DevLoginForm } from '@/components/dev-login-form';
import { MagicLinkForm } from '@/components/magic-link-form';
import { RequestAccessForm } from '@/components/request-access-form';

/**
 * Surface Classification (ADR-041 §5.2):
 *   Rendering Delivery: Client Shell — no server read at load time; both child
 *                        forms are 'use client' with their own action state.
 *   Data Aggregation:   None — submit-only surfaces; no data consumed on render.
 *   Rejected: RSC Prefetch — nothing to prefetch for public auth forms.
 *   Metric Provenance:  None — no truth-bearing metrics rendered.
 */

export default function SignInPage() {
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#000212]">
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
            'radial-gradient(ellipse 70% 50% at 50% 15%, hsl(189 94% 43% / 0.07), transparent)',
        }}
      />

      <div className="relative flex min-h-dvh flex-col items-center justify-center px-5 py-10 sm:px-8">
        {/* Logo + back link */}
        <div className="mb-8 w-full max-w-5xl">
          <Link
            href="/"
            className="inline-flex flex-col items-start transition-opacity duration-300 hover:opacity-80"
          >
            <span
              className="text-lg tracking-wide text-[hsl(189_94%_43%)]/80"
              style={{ fontFamily: 'var(--font-michroma)' }}
            >
              d3lt
            </span>
            <div className="h-px w-full bg-gradient-to-r from-transparent via-[hsl(189_94%_43%)]/25 to-transparent" />
          </Link>
        </div>

        {/* Page heading */}
        <div className="mb-8 w-full max-w-5xl">
          <h1
            className="text-2xl font-bold sm:text-[1.75rem]"
            style={{
              background:
                'linear-gradient(to right bottom, rgb(247 248 248) 30%, rgba(247,248,248,0.38))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Pilot access is invite-only
          </h1>
          <p className="mt-2 text-[15px] text-[#95A2B3]">
            Request access first — once approved, you&apos;ll receive a sign-in
            link by email.
          </p>
        </div>

        {/* Two-panel layout */}
        <div className="w-full max-w-5xl">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_48px_1fr] lg:gap-0">
            {/* ── Panel A: Request Pilot Access (Step 01) ── */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  className="text-xs font-bold uppercase tracking-widest text-[hsl(189_94%_43%)]/70"
                  style={{ fontFamily: 'monospace' }}
                >
                  01
                </span>
                <span
                  className="text-xs font-bold uppercase tracking-widest text-[#95A2B3]"
                  style={{ fontFamily: 'monospace' }}
                >
                  Request Pilot Access
                </span>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(189_94%_43%/0.25)] bg-[hsl(189_94%_43%/0.06)] px-2.5 py-0.5">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-[hsl(189_94%_43%)] opacity-60" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-[hsl(189_94%_43%)]" />
                  </span>
                  <span
                    className="text-[10px] font-medium uppercase tracking-widest text-[hsl(189_94%_43%)]/80"
                    style={{ fontFamily: 'monospace' }}
                  >
                    Closed Pilot
                  </span>
                </div>
              </div>
              <RequestAccessForm />
            </div>

            {/* ── Divider — desktop only ── */}
            <div className="hidden lg:flex flex-col items-center justify-center gap-3 px-4">
              <div className="h-16 w-px bg-white/[0.06]" />
              <span
                className="text-[10px] font-medium uppercase tracking-widest text-[#95A2B3]/30"
                style={{ fontFamily: 'monospace' }}
              >
                then
              </span>
              <div className="flex-1 w-px bg-white/[0.06]" />
            </div>

            {/* ── Mobile divider ── */}
            <div className="flex items-center gap-4 lg:hidden">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <span
                className="text-[10px] font-medium uppercase tracking-widest text-[#95A2B3]/30"
                style={{ fontFamily: 'monospace' }}
              >
                then
              </span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>

            {/* ── Panel B: Sign In (Step 02) ── */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  className="text-xs font-bold uppercase tracking-widest text-[#95A2B3]/40"
                  style={{ fontFamily: 'monospace' }}
                >
                  02
                </span>
                <span
                  className="text-xs font-bold uppercase tracking-widest text-[#95A2B3]/60"
                  style={{ fontFamily: 'monospace' }}
                >
                  Sign In
                </span>
                <span
                  className="text-[10px] font-medium text-[#95A2B3]/30"
                  style={{ fontFamily: 'monospace' }}
                >
                  — after approval
                </span>
              </div>
              <MagicLinkForm />
              {isDev && <DevLoginForm />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
