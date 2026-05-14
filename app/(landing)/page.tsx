import Link from 'next/link';

import { Button } from '@/components/ui/button';

import { ProductTabs } from './_components/product-tabs';
import { Reveal } from './_components/reveal';

/* ─────────────────────────────────────────────────────────
 * PT-2 LANDING PAGE — Narrative Spine
 *
 * Architecture: Hero → Operational Domains → Product → Accountability → Intelligence → CTA
 * Visual DNA: Linear-inspired dark ground, glassmorphic surfaces,
 * gradient text, intersection-observer reveals.
 *
 * Direction doc: docs/00-vision/landing-page/pt2-landing-page-direction-narrative-spine.md
 * ────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────
 * Data
 * ────────────────────────────────────────────────────────── */

/** Operational Domains — one consequence per card, no feature enumerations */
const operationalDomains = [
  {
    domain: 'Floor Oversight',
    claim:
      'Monitor active tables and operational exceptions across all pits during the shift.',
    href: '/floor-oversight',
  },
  {
    domain: 'Session Tracking',
    claim:
      'Preserve player-session across table moves, breaks, and multi-day visits.',
    href: '/session-tracking',
  },
  {
    domain: 'Loyalty & Rewards',
    claim:
      'Points accrual, comp issuance, and tier entitlements — configured to your property’s economics, not a vendor default program.',
    href: null,
  },
  {
    domain: 'Cash Accountability',
    claim:
      'Record operational cash movement with attribution at every step — entries, voids, fills, and credits.',
    href: '/cash-accountability',
  },
  {
    domain: 'Audit Compliance',
    claim:
      'Surface regulatory thresholds and operational exceptions during the shift — not after it.',
    href: '/audit-compliance',
  },
];

/** Product — operational surface proof with floor-origin framing */
const productSurfaces = [
  {
    label: 'Shift Dashboard',
    title: 'Floor Operations → Operational Intelligence',
    description:
      'Live floor picture: active tables, open sessions, cash activity, shift KPIs — with checkpoint delta tracking that shows how performance changes, not just where it stands.',
    stub: '[Shift Dashboard — live floor picture with checkpoint delta tracking]',
  },
  {
    label: 'Player 360',
    title: 'Session Tracking → Operational Accountability',
    description:
      'Complete player operational record: identity, visit continuity, rating slips, financial activity, loyalty position, and a filterable interaction timeline.',
    stub: '[Player 360 — full player record with visit continuity and rating slip history]',
  },
  {
    label: 'Cash Threshold Monitor',
    title: 'Cash Accountability → Compliance',
    description:
      'Buy-in entry with live threshold proximity — MTL at $3K, CTR visibility at $10K. Compliance feedback at point of entry, not after end-of-day reconciliation.',
    stub: '[Cash Threshold Monitor — buy-in entry with live MTL and CTR proximity]',
  },
  {
    label: 'Pit Terminal',
    title: 'Floor Operations → Session Tracking → Cash Accountability',
    description:
      'One surface for active tables, player sessions, and floor activity during the shift. The seat map shows live occupancy across all pits.',
    stub: '[Pit Terminal — live seat map with active sessions and pit occupancy]',
  },
];

/** Accountability — operational trust record, 4 blocks */
const accountabilityBlocks = [
  {
    title: 'Attributed Activity',
    copy: 'Every supervisor action, void, adjustment, and operational change carries staff identity and timestamp. No shared logins. No unattributed changes.',
  },
  {
    title: 'Regulatory Visibility',
    copy: 'Progressive MTL and CTR thresholds integrated into operational workflows',
  },
  {
    title: 'Shift Continuity',
    copy: 'Operational data preserved across the gaming day. Sessions, checkpoints, and table events remain coherent across shift boundaries without manual reconciliation.',
  },
  {
    title: 'Operational Audit Trail',
    copy: 'Corrections create new records with full lineage. Voids carry the original entry, the correcting entry, and the reason. Nothing is overwritten.',
  },
];

/** Intelligence — floor-origin insights, 4 blocks */
const intelligenceBlocks = [
  {
    title: 'Shift Performance',
    copy: 'Active table performance, session value, cash velocity, and coverage quality visible at the shift level.',
  },
  {
    title: 'Checkpoint Analysis',
    copy: 'Mid-shift snapshots show how performance changes, not just where it stands. Delta tracking from any prior checkpoint.',
  },
  {
    title: 'Anomaly Detection',
    copy: 'Operational exceptions surface during the shift: coverage gaps, threshold proximity, unrated sessions, table activity patterns.',
  },
  {
    title: 'Trend Visibility',
    copy: 'Shift patterns visible because floor activity has been captured continuously — not compiled after the fact.',
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
      <nav className="fixed inset-x-0 top-0 z-50 bg-[#000212]/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex size-7 items-center justify-center rounded-lg bg-accent/90 transition-all duration-300 group-hover:bg-accent group-hover:shadow-[0_0_16px_hsl(189_94%_43%/0.3)]">
              <span className="text-[11px] font-bold tracking-tight text-white"></span>
            </div>
            <span className="text-lg font-medium tracking-tight text-[#F7F8F8]">
              d3lt
            </span>
          </Link>

          <div className="hidden items-center gap-7 md:flex">
            {[
              ['Operations', '#operations'],
              ['Accountability', '#accountability'],
              ['Intelligence', '#intelligence'],
              ['Pricing', '/pricing'],
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
              <Link href="/contact">Request an operational walkthrough</Link>
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
                CASINO OPERATIONAL INTELLIGENCE
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
              Built for casino operational leadership — from live floor
              supervision to audit-ready operational history.
            </p>
          </Reveal>

          {/* CTAs */}
          <Reveal delay={240}>
            <div className="mt-10 sm:mt-12 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-accent text-white hover:bg-accent/90 px-8 h-12 text-sm font-semibold tracking-wide shadow-[0_1px_40px_hsl(189_94%_43%/0.25)] hover:shadow-[0_1px_50px_hsl(189_94%_43%/0.35)] transition-all duration-300 w-full sm:w-auto"
              >
                <Link href="/contact">Request an operational walkthrough</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="rounded-full border border-white/[0.08] bg-white/[0.04] text-[#95A2B3] hover:bg-white/[0.08] hover:text-[#F7F8F8] backdrop-blur-sm px-8 h-12 text-sm font-medium tracking-wide transition-all duration-300 w-full sm:w-auto"
              >
                <a href="#operations">Explore operational domains</a>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S2: OPERATIONAL DOMAINS — Narrative Router
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
                Tables, sessions, cash, compliance, and loyalty — managed during
                the shift.
              </h2>
            </div>
          </Reveal>

          <div className="grid gap-px sm:grid-cols-2 rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03]">
            {operationalDomains.map((domain, i) => {
              const isInformational = !domain.href;
              const hoverGlow = (
                <div
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  style={{
                    background:
                      'radial-gradient(ellipse at center, hsl(189 94% 43% / 0.04), transparent 70%)',
                  }}
                />
              );

              const cardInner = isInformational ? (
                /* Loyalty stripe — standard vertical layout, content centered in the span */
                <>
                  {hoverGlow}
                  <div className="relative w-full max-w-md">
                    <p className="mb-4 font-mono text-[11px] tracking-[0.12em] text-accent/60">
                      {String(i + 1).padStart(2, '0')}
                    </p>
                    <h3 className="mb-3 text-lg font-semibold text-[#F7F8F8]">
                      {domain.domain}
                    </h3>
                    <p className="text-[15px] leading-relaxed text-[#F7F8F8]/90">
                      {domain.claim}
                    </p>
                  </div>
                </>
              ) : (
                /* Linked card — standard vertical layout with arrow CTA */
                <>
                  {hoverGlow}
                  <div className="relative">
                    <p className="mb-4 font-mono text-[11px] tracking-[0.12em] text-accent/60">
                      {String(i + 1).padStart(2, '0')}
                    </p>
                    <h3 className="mb-3 text-lg font-semibold text-[#F7F8F8]">
                      {domain.domain}
                    </h3>
                    <p className="text-[15px] leading-relaxed text-[#F7F8F8]/90">
                      {domain.claim}
                    </p>
                  </div>
                  <div className="relative mt-8">
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent/70 transition-all duration-300 group-hover:text-accent group-hover:gap-2.5">
                      Explore {domain.domain.toLowerCase()}
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
                </>
              );

              return (
                <Reveal
                  key={domain.domain}
                  delay={i * 80}
                  className={isInformational ? 'sm:col-span-2' : ''}
                >
                  {domain.href ? (
                    <a
                      href={domain.href}
                      className="group relative flex flex-col justify-between p-6 sm:p-8 md:p-10 bg-[#000212] transition-all duration-500 hover:bg-white/[0.02]"
                    >
                      {cardInner}
                    </a>
                  ) : (
                    <div className="group relative flex flex-col justify-center p-6 sm:p-8 md:p-10 bg-[#000212] transition-all duration-500 hover:bg-white/[0.02]">
                      {cardInner}
                    </div>
                  )}
                </Reveal>
              );
            })}
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
                What operational leadership sees during a shift.
              </h2>
              <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                From the shift dashboard to the buy-in panel — surfaces that
                reflect the floor as it operates.
              </p>
            </div>
          </Reveal>

          <ProductTabs surfaces={productSurfaces} />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S4: OPERATIONAL ACCOUNTABILITY
         ═══════════════════════════════════════════════════ */}
      <section id="accountability" className="relative py-16 sm:py-28">
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
                Accountability
              </p>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-gradient-heading">
                Activity tied to people, tables, and the gaming day.
              </h2>
              <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                Floor activity, cash movement, corrections, and compliance
                thresholds stay connected to staff identity, table context, and
                gaming-day scope.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-px sm:grid-cols-2 rounded-2xl overflow-hidden border border-white/[0.06]">
            {accountabilityBlocks.map((block, i) => (
              <Reveal key={block.title} delay={i * 60}>
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
                    {block.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-[#95A2B3]/70">
                    {block.copy}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S5: OPERATIONAL INTELLIGENCE
         ═══════════════════════════════════════════════════ */}
      <section id="intelligence" className="relative py-16 sm:py-28">
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
                Intelligence
              </p>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-gradient-heading">
                See what changed across the shift.
              </h2>
              <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                Because floor activity is captured continuously across tables,
                sessions, and cash movement, shift visibility reflects what is
                happening on the floor as it happens.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-px sm:grid-cols-2 rounded-2xl overflow-hidden border border-white/[0.06]">
            {intelligenceBlocks.map((block, i) => (
              <Reveal key={block.title} delay={i * 60}>
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
                    {block.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-[#95A2B3]/70">
                    {block.copy}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S6: CTA — Conversion Close
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
                Evaluate the platform through your operational reality.
              </span>
            </h2>
          </Reveal>

          <Reveal delay={80}>
            <p className="mx-auto mt-5 max-w-lg text-[15px] text-[#95A2B3] leading-relaxed">
              Walk through live operational workflows, accountability surfaces,
              and floor-control scenarios with your team.
            </p>
          </Reveal>

          <Reveal delay={160}>
            <div className="mt-10 sm:mt-12 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-accent text-white hover:bg-accent/90 px-8 h-12 text-sm font-semibold tracking-wide shadow-[0_1px_40px_hsl(189_94%_43%/0.25)] hover:shadow-[0_1px_50px_hsl(189_94%_43%/0.35)] transition-all duration-300 w-full sm:w-auto"
              >
                <Link href="/contact">Request an operational walkthrough</Link>
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
              d3lt
            </span>
          </div>
          <p className="text-[11px] text-[#95A2B3]/40">
            &copy; {year} by Liminal Tech. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
