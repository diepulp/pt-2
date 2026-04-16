import Link from 'next/link';

import { Button } from '@/components/ui/button';

import { ProductTabs } from './_components/product-tabs';
import { Reveal } from './_components/reveal';

/* ─────────────────────────────────────────────────────────
 * PT-2 LANDING PAGE — Narrative Spine
 *
 * Architecture: Hero → Operating Loops → Product → Trust → CTA
 * Visual DNA: Linear-inspired dark ground, glassmorphic surfaces,
 * gradient text, intersection-observer reveals.
 *
 * Direction doc: docs/00-vision/landing-page/pt2-landing-page-direction-narrative-spine.md
 * ────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────
 * Data
 * ────────────────────────────────────────────────────────── */

/** Operating Loops — narrative router, not feature inventory */
const operatingLoops = [
  {
    domain: 'Floor Oversight',
    outcome: 'See the floor as it is now, not after the shift is over.',
    motion:
      'Track tables, coverage, checkpoints, and exceptions as play moves.',
    href: '/floor-oversight',
  },
  {
    domain: 'Session Tracking',
    outcome: 'Follow every player from check-in to cash-out.',
    motion:
      'Manage visits, table moves, rating slips, and session continuity across breaks.',
    href: '/session-tracking',
  },
  {
    domain: 'Cash Accountability',
    outcome: 'Every dollar attributed, every transaction traced.',
    motion:
      'Record buy-ins with live threshold feedback. Process cash-outs and voids with audit trail.',
    href: '/cash-accountability',
  },
  {
    domain: 'Audit Compliance',
    outcome: 'During the shift, not after it.',
    motion:
      'Progressive MTL alerts, CTR banners at regulatory boundaries, per-patron daily aggregates.',
    href: '/audit-compliance',
  },
];

/** Product — UI proof surfaces */
const productSurfaces = [
  {
    label: 'Shift Dashboard',
    title: 'Live floor picture with checkpoint deltas',
    description:
      'Active tables, open sessions, cash activity, shift KPIs. Take mid-shift snapshots and see exactly how performance changes.',
  },
  {
    label: 'Player 360',
    title: 'Complete player profile in one screen',
    description:
      'Identity, visit history, rating slips, financial summary, loyalty tier and ledger, filterable interaction timeline.',
  },
  {
    label: 'Cash Threshold',
    title: 'Live compliance feedback as you type',
    description:
      'Buy-in recording shows proximity to thresholds in real time. Progressive MTL alerts at $3K, CTR banner at $10K.',
  },
  {
    label: 'Setup Wizard',
    title: 'Operational in one session',
    description:
      'Configure your property, import player records via CSV with column mapping and validation. No legacy migration project.',
  },
];

/** Trust — structural properties */
const trustProperties = [
  {
    statement: 'Every number is traceable',
    proof:
      'Permanent financial records. Append-only audit trail. Timestamps on every mutation.',
  },
  {
    statement: 'Every action is attributed',
    proof:
      'Staff identity on every operation. Four roles with database-level access control. No shared logins.',
  },
  {
    statement: 'Nothing gets rewritten',
    proof:
      'Corrections create new records with full lineage. The original entry is preserved.',
  },
  {
    statement: 'Anomalies surface during operations',
    proof:
      'Live threshold feedback. Shift checkpoint deltas show change, not just state.',
  },
];

/* ─────────────────────────────────────────────────────────
 * Page (Server Component)
 * ────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const year = new Date().getFullYear();

  return (
    <div className="bg-[#000212] text-[#F7F8F8] min-h-screen antialiased selection:bg-accent/30 overflow-x-hidden">
      {/* ── Subtle dot grid — fixed background texture ── */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.4) 0.5px, transparent 0.5px)',
            backgroundSize: '24px 24px',
            opacity: 0.04,
            animation: 'grid-fade 6s ease-in-out infinite',
          }}
        />
      </div>

      {/* ── Navigation ── */}
      <nav className="sticky top-0 z-50 bg-[#000212]/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex size-7 items-center justify-center rounded-lg bg-accent/90 transition-all duration-300 group-hover:bg-accent group-hover:shadow-[0_0_16px_hsl(189_94%_43%/0.3)]">
              <span className="text-[11px] font-bold tracking-tight text-white">
                PT
              </span>
            </div>
            <span className="text-sm font-medium tracking-tight text-[#F7F8F8]">
              Player Tracker
            </span>
          </Link>

          <div className="hidden items-center gap-7 md:flex">
            {[
              ['Operations', '#operations'],
              ['Product', '#product'],
              ['Trust', '#trust'],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                className="text-[13px] text-[#95A2B3] transition-colors duration-300 hover:text-[#F7F8F8]"
              >
                {label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/auth/login"
              className="hidden text-[13px] text-[#95A2B3] transition-colors duration-300 hover:text-[#F7F8F8] md:inline-block"
            >
              Sign in
            </Link>
            <Button
              asChild
              size="sm"
              className="rounded-full bg-accent/90 text-white hover:bg-accent hover:shadow-[0_0_20px_hsl(189_94%_43%/0.3)] transition-all duration-300 text-[13px] px-5 h-8"
            >
              <Link href="/contact">Request a Demo</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════
         S1: HERO
         ═══════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        {/* Hero glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(ellipse 60% 50% at 50% -5%, hsl(189 94% 43% / 0.12), transparent)',
              'radial-gradient(ellipse 90% 35% at 50% -15%, hsl(189 94% 43% / 0.05), transparent)',
            ].join(', '),
          }}
        />

        {/* Top accent line */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-px w-[min(500px,70vw)] -translate-x-1/2 bg-gradient-to-r from-transparent via-accent/25 to-transparent" />

        <div className="relative mx-auto max-w-3xl px-5 sm:px-6 pt-20 pb-14 sm:pt-32 sm:pb-20 lg:pt-40 lg:pb-28 text-center">
          {/* Badge */}
          <Reveal>
            <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm px-4 py-1.5">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent/60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
              </span>
              <span className="font-mono text-[11px] font-medium tracking-[0.12em] text-[#95A2B3]">
                OPERATIONAL INTELLIGENCE
              </span>
            </div>
          </Reveal>

          {/* Headline — gradient text */}
          <Reveal delay={80}>
            <h1 className="text-[1.75rem] leading-[1.15] font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-[3.5rem] lg:leading-[1.1]">
              <span className="block text-gradient-heading">
                Operational Intelligence System for casino management
              </span>
            </h1>
          </Reveal>

          {/* Subtitle */}
          <Reveal delay={160}>
            <p className="mt-6 text-lg text-[#95A2B3] leading-relaxed max-w-xl mx-auto">
              Floor oversight, session tracking, cash accountability, and audit
              compliance — unified in one system built for how your team
              actually works.
            </p>
          </Reveal>

          {/* Capability taxonomy strip */}
          <Reveal delay={240}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-1">
              {operatingLoops.map((loop, i) => (
                <span key={loop.domain} className="flex items-center">
                  {i > 0 && (
                    <span className="mx-3 text-white/[0.12] select-none">
                      /
                    </span>
                  )}
                  <span className="font-mono text-[11px] tracking-[0.1em] text-[#95A2B3]/70">
                    {loop.domain}
                  </span>
                </span>
              ))}
            </div>
          </Reveal>

          {/* CTAs */}
          <Reveal delay={320}>
            <div className="mt-10 sm:mt-12 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-accent text-white hover:bg-accent/90 px-8 h-12 text-sm font-semibold tracking-wide shadow-[0_1px_40px_hsl(189_94%_43%/0.25)] hover:shadow-[0_1px_50px_hsl(189_94%_43%/0.35)] transition-all duration-300 w-full sm:w-auto"
              >
                <Link href="/contact">Start operational setup</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="rounded-full border border-white/[0.08] bg-white/[0.04] text-[#95A2B3] hover:bg-white/[0.08] hover:text-[#F7F8F8] backdrop-blur-sm px-8 h-12 text-sm font-medium tracking-wide transition-all duration-300 w-full sm:w-auto"
              >
                <a href="#operations">See the operations</a>
              </Button>
            </div>
          </Reveal>

          {/* Proof strip — hero-adjacent trust scaffolding */}
          <Reveal delay={400}>
            <div className="mt-10 sm:mt-16 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-x-8 gap-y-2 sm:gap-y-3">
              {[
                'Traceable numbers',
                'Attributed actions',
                'Compliance-aware workflows',
              ].map((claim) => (
                <span
                  key={claim}
                  className="flex items-center gap-2 text-[13px] text-[#95A2B3]/60"
                >
                  <span className="inline-block size-1 rounded-full bg-accent/50" />
                  {claim}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S2: OPERATING LOOPS — Narrative Router
         ═══════════════════════════════════════════════════ */}
      <section id="operations" className="relative py-16 sm:py-28">
        {/* Section glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 20% 30%, hsl(189 94% 43% / 0.03), transparent)',
          }}
        />

        <div className="relative mx-auto max-w-5xl px-5 sm:px-6">
          <Reveal>
            <div className="mb-10 sm:mb-20 max-w-2xl">
              <p className="mb-3 sm:mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-accent/80">
                Operations
              </p>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-gradient-heading">
                What this system helps you do on a live casino floor.
              </h2>
            </div>
          </Reveal>

          <div className="grid gap-px sm:grid-cols-2 rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03]">
            {operatingLoops.map((loop, i) => (
              <Reveal key={loop.domain} delay={i * 80}>
                <a
                  href={loop.href}
                  className="group relative flex flex-col justify-between p-6 sm:p-8 md:p-10 bg-[#000212] transition-all duration-500 hover:bg-white/[0.02]"
                >
                  {/* Hover glow */}
                  <div
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background:
                        'radial-gradient(ellipse at center, hsl(189 94% 43% / 0.04), transparent 70%)',
                    }}
                  />

                  <div className="relative">
                    <p className="mb-4 font-mono text-[11px] tracking-[0.12em] text-accent/60">
                      {String(i + 1).padStart(2, '0')}
                    </p>
                    <h3 className="mb-3 text-lg font-semibold text-[#F7F8F8]">
                      {loop.domain}
                    </h3>
                    <p className="text-[15px] leading-relaxed text-[#F7F8F8]/90 mb-2">
                      {loop.outcome}
                    </p>
                    <p className="text-sm leading-relaxed text-[#95A2B3]/70">
                      {loop.motion}
                    </p>
                  </div>

                  <div className="relative mt-8">
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent/70 transition-all duration-300 group-hover:text-accent group-hover:gap-2.5">
                      Explore {loop.domain.toLowerCase()}
                      <svg
                        className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                        />
                      </svg>
                    </span>
                  </div>
                </a>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S3: PRODUCT — Visual Proof
         ═══════════════════════════════════════════════════ */}
      <section id="product" className="relative py-16 sm:py-28">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 50% 50% at 80% 50%, hsl(189 94% 43% / 0.03), transparent)',
          }}
        />

        <div className="relative mx-auto max-w-5xl px-5 sm:px-6">
          <Reveal>
            <div className="mb-10 sm:mb-20 max-w-2xl">
              <p className="mb-3 sm:mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-accent/80">
                Product
              </p>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-gradient-heading">
                What it looks like in operation.
              </h2>
              <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                Real surfaces built for real shift pressure. Not mockups.
              </p>
            </div>
          </Reveal>

          <ProductTabs surfaces={productSurfaces} />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S4: TRUST — Structural Credibility
         ═══════════════════════════════════════════════════ */}
      <section id="trust" className="relative py-16 sm:py-28">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 50% 60% at 50% 80%, hsl(189 94% 43% / 0.03), transparent)',
          }}
        />

        <div className="relative mx-auto max-w-5xl px-5 sm:px-6">
          <Reveal>
            <div className="mb-10 sm:mb-20 max-w-2xl">
              <p className="mb-3 sm:mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-accent/80">
                Trust
              </p>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-gradient-heading">
                Compliance built into the architecture, not bolted on.
              </h2>
              <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                These are structural properties of the system — not features you
                enable, not modules you purchase.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-px sm:grid-cols-2 rounded-2xl overflow-hidden border border-white/[0.06]">
            {trustProperties.map((prop, i) => (
              <Reveal key={prop.statement} delay={i * 60}>
                <div className="flex flex-col p-6 sm:p-8 md:p-10 bg-[#000212] group transition-all duration-500 hover:bg-white/[0.015]">
                  <div className="mb-4 flex size-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                    <div
                      className="size-1.5 rounded-full bg-accent/60 transition-all duration-500 group-hover:bg-accent group-hover:shadow-[0_0_8px_hsl(189_94%_43%/0.4)]"
                      style={{
                        animation: `glow-pulse ${3 + i * 0.5}s ease-in-out infinite`,
                      }}
                    />
                  </div>
                  <h3 className="mb-2 text-[15px] font-semibold text-[#F7F8F8]">
                    {prop.statement}
                  </h3>
                  <p className="text-sm leading-relaxed text-[#95A2B3]/70">
                    {prop.proof}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S5: CTA — Outcome-Anchored Close
         ═══════════════════════════════════════════════════ */}
      <section className="relative py-20 sm:py-32">
        {/* Bottom glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 60% at 50% 100%, hsl(189 94% 43% / 0.06), transparent)',
          }}
        />

        <div className="relative mx-auto max-w-2xl px-5 sm:px-6 text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              <span className="text-gradient-heading">
                Numbers you can stand behind.
              </span>
            </h2>
          </Reveal>

          <Reveal delay={80}>
            <p className="mx-auto mt-5 max-w-lg text-[15px] text-[#95A2B3] leading-relaxed">
              Talk to us about your floor. We&apos;ll walk through how Player
              Tracker fits your property — your tables, your workflows, your
              operation.
            </p>
          </Reveal>

          <Reveal delay={160}>
            <div className="mt-10 sm:mt-12 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-accent text-white hover:bg-accent/90 px-8 h-12 text-sm font-semibold tracking-wide shadow-[0_1px_40px_hsl(189_94%_43%/0.25)] hover:shadow-[0_1px_50px_hsl(189_94%_43%/0.35)] transition-all duration-300 w-full sm:w-auto"
              >
                <Link href="/contact">Book a walkthrough</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="rounded-full border border-white/[0.08] bg-white/[0.04] text-[#95A2B3] hover:bg-white/[0.08] hover:text-[#F7F8F8] backdrop-blur-sm px-8 h-12 text-sm font-medium tracking-wide transition-all duration-300 w-full sm:w-auto"
              >
                <a href="#operations">Back to operations</a>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.06] py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-5 sm:px-6 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="flex size-6 items-center justify-center rounded-md bg-accent/80">
              <span className="text-[9px] font-bold tracking-tight text-white">
                PT
              </span>
            </div>
            <span className="text-[12px] font-medium text-[#95A2B3]/60">
              Player Tracker
            </span>
          </div>
          <p className="text-[11px] text-[#95A2B3]/40">
            &copy; {year} Player Tracker. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
