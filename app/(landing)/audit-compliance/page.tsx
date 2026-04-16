'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* ─────────────────────────────────────────────────────────
 * AUDIT COMPLIANCE — Supporting Page
 *
 * Expands the Audit Compliance operating loop from the homepage.
 *
 * Sections: Hero → Threshold Awareness → Permanent History
 *           → Attribution & Notes → Review & Print
 *           → Context Across the Day → CTA Chain
 *
 * Source: pt2-supporting-page-brief-audit-compliance.md
 * Reality: SYSTEM-REALITY-MAP.md (Compliance: 13/13 working)
 * ────────────────────────────────────────────────────────── */

/* ─── Intersection Observer hook ─── */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/* ─── Reveal wrapper ─── */
function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, inView } = useInView(0.1);
  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-700 ease-out',
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
        className,
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * Data
 * ────────────────────────────────────────────────────────── */

/** S2 — Threshold awareness */
const thresholdCapabilities = [
  {
    title: 'MTL threshold tracking',
    detail:
      'Multiple Transaction Log entries accumulate during the gaming day. Progressive alerts at $3,000 surface risk before the regulatory boundary.',
  },
  {
    title: 'CTR alerts at $10,000',
    detail:
      'Currency Transaction Report threshold triggers a visible banner during entry. The operator knows before the transaction posts, not after.',
  },
  {
    title: 'Gaming-day accumulation',
    detail:
      'Per-patron daily cash aggregates track against thresholds across the entire gaming day, not per-transaction. Resets at the configured day boundary.',
  },
];

/** S3 — Permanent history model */
const historyProperties = [
  {
    title: 'Financial records are permanent',
    detail:
      'Cash transactions, rating slip financials, and loyalty entries are append-only. No edits, no deletes, no overwrites.',
  },
  {
    title: 'Corrections create new entries',
    detail:
      'A void does not erase the original. It creates a linked reversal with its own timestamp, author, and reason.',
  },
  {
    title: 'Loyalty ledger is permanent',
    detail:
      'Points earned, redeemed, credited, and adjusted — every entry preserved. The balance is a running total, not an editable field.',
  },
  {
    title: 'Reversals stay in the record',
    detail:
      'The original entry, the reversal, the reason, and the audit note all remain visible. History is linked, not replaced.',
  },
];

/** S4 — Attribution and notes */
const attributionSteps = [
  {
    number: '01',
    action: 'Staff identity on every action',
    detail:
      'Buy-ins, cash-outs, rating changes, comp issuances, compliance entries — each one carries the identity of the person who recorded it.',
  },
  {
    number: '02',
    action: 'Void and reversal trail',
    detail:
      'Every reversal links back to the original. The reason is required. The audit note is permanent. The chain is unbroken.',
  },
  {
    number: '03',
    action: 'Audit notes where needed',
    detail:
      'Attach explanatory context to compliance records, cash events, or player interactions. Notes become part of the permanent record.',
  },
];

/** S5 — Review surfaces */
const reviewSurfaces = [
  {
    title: 'Compliance dashboard',
    detail:
      'Per-patron daily cash aggregates with threshold status. Navigate by gaming day, drill into individual patrons.',
  },
  {
    title: 'Per-patron aggregates',
    detail:
      'Total cash activity for each patron across the gaming day. Threshold proximity visible at a glance.',
  },
  {
    title: 'Gaming-day navigation',
    detail:
      'Review any past gaming day. The system understands that a casino day does not start at midnight.',
  },
  {
    title: 'Printable compliance records',
    detail:
      'Generate printable logs for internal review or regulatory inspection. The record travels outside the system when it needs to.',
  },
];

/** S6 — Context linkage */
const contextItems = [
  {
    title: 'Linked activity across the day',
    detail:
      'Compliance review is not about one isolated row. The system shows surrounding cash, session, and compliance events in sequence.',
  },
  {
    title: 'Player timeline context',
    detail:
      'When a patron needs investigation, the filterable timeline shows everything that happened — not just the flagged event.',
  },
  {
    title: 'Related financial and compliance events',
    detail:
      'Audit notes, voids, threshold crossings, and cash activity are visible together, not scattered across disconnected screens.',
  },
];

/** CTA chain */
const nextLoops = [
  {
    label: 'Cash Accountability',
    description: 'Every dollar attributed, every transaction traced.',
    href: '/cash-accountability',
  },
  {
    label: 'Session Tracking',
    description: 'Follow every player from check-in to cash-out.',
    href: '/session-tracking',
  },
  {
    label: 'Floor Oversight',
    description: 'See the floor as it is now, not after the shift is over.',
    href: '/floor-oversight',
  },
];

/* ─────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────── */

export default function AuditCompliancePage() {
  return (
    <div className="bg-[#000212] text-[#F7F8F8] min-h-screen antialiased selection:bg-accent/30">
      <style>{`
        html, body { background-color: #000212; }
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>

      {/* ── Dot grid ── */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.4) 0.5px, transparent 0.5px)',
            backgroundSize: '24px 24px',
            opacity: 0.04,
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
              ['Overview', '/'],
              ['Contact', '/contact'],
            ].map(([label, href]) => (
              <Link
                key={label}
                href={href}
                className="text-[13px] text-[#95A2B3] transition-colors duration-300 hover:text-[#F7F8F8]"
              >
                {label}
              </Link>
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
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(ellipse 60% 50% at 50% -5%, hsl(189 94% 43% / 0.10), transparent)',
              'radial-gradient(ellipse 90% 35% at 50% -15%, hsl(189 94% 43% / 0.04), transparent)',
            ].join(', '),
          }}
        />

        <div className="pointer-events-none absolute left-1/2 top-0 h-px w-[min(500px,70vw)] -translate-x-1/2 bg-gradient-to-r from-transparent via-accent/25 to-transparent" />

        <div className="relative mx-auto max-w-3xl px-6 pt-28 pb-20 sm:pt-36 sm:pb-24 text-center">
          <Reveal>
            <Link
              href="/"
              className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm px-4 py-1.5 transition-colors hover:border-white/[0.12]"
            >
              <svg
                className="size-3.5 text-[#95A2B3]/60"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
                />
              </svg>
              <span className="font-mono text-[11px] tracking-[0.12em] text-[#95A2B3]">
                OPERATIONS
              </span>
            </Link>
          </Reveal>

          <Reveal delay={80}>
            <h1
              className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]"
              style={{
                background:
                  'linear-gradient(to right bottom, rgb(247 248 248) 30%, rgba(247 248 248 / 0.38))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Records that hold up under review
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-6 text-lg text-[#95A2B3] leading-relaxed max-w-xl mx-auto">
              Track thresholds, preserve attribution, record corrections without
              overwriting history, and review the day with the context intact.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S2: THRESHOLD AWARENESS DURING THE DAY
         ═══════════════════════════════════════════════════ */}
      <section className="relative py-28">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 20% 30%, hsl(189 94% 43% / 0.03), transparent)',
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6">
          <Reveal>
            <div className="mb-20 max-w-2xl">
              <p className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-accent/80">
                Live Awareness
              </p>
              <h2
                className="text-3xl font-bold tracking-tight sm:text-4xl"
                style={{
                  background:
                    'linear-gradient(to right bottom, rgb(247 248 248) 30%, rgba(247 248 248 / 0.38))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Compliance starts during the shift, not after it.
              </h2>
              <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                Threshold risk surfaces while operations are live. Progressive
                alerts accumulate across the gaming day so operators know before
                the boundary is crossed, not after.
              </p>
            </div>
          </Reveal>

          {/* Threshold flow */}
          <Reveal delay={60}>
            <div className="mb-16 flex flex-wrap items-center justify-center gap-x-2 gap-y-3">
              {[
                'Activity Begins',
                '$3,000 MTL Alert',
                '$10,000 CTR Banner',
                'Gaming Day Close',
              ].map((stage, i) => (
                <span key={stage} className="flex items-center">
                  {i > 0 && (
                    <svg
                      className="mx-1 size-3.5 text-accent/30"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.25 4.5l7.5 7.5-7.5 7.5"
                      />
                    </svg>
                  )}
                  <span
                    className={cn(
                      'rounded-full border px-3.5 py-1 font-mono text-[11px] tracking-[0.08em]',
                      i === 1 || i === 2
                        ? 'border-accent/30 bg-accent/[0.06] text-accent/80'
                        : 'border-white/[0.08] bg-white/[0.02] text-[#95A2B3]/60',
                    )}
                  >
                    {stage}
                  </span>
                </span>
              ))}
            </div>
          </Reveal>

          <div className="grid gap-px sm:grid-cols-3 rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03]">
            {thresholdCapabilities.map((cap, i) => (
              <Reveal key={cap.title} delay={i * 60}>
                <div className="flex flex-col p-8 sm:p-10 bg-[#000212] group transition-all duration-500 hover:bg-white/[0.015] h-full">
                  <div className="mb-4 flex size-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                    <div
                      className="size-1.5 rounded-full bg-accent/60 transition-all duration-500 group-hover:bg-accent group-hover:shadow-[0_0_8px_hsl(189_94%_43%/0.4)]"
                      style={{
                        animation: `glow-pulse ${3 + i * 0.4}s ease-in-out infinite`,
                      }}
                    />
                  </div>
                  <h3 className="mb-1.5 text-[15px] font-semibold text-[#F7F8F8]">
                    {cap.title}
                  </h3>
                  <p className="text-[13px] leading-relaxed text-[#95A2B3]/60">
                    {cap.detail}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S3: PERMANENT HISTORY
         ═══════════════════════════════════════════════════ */}
      <section className="relative py-28">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 50%, hsl(189 94% 43% / 0.04), transparent)',
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6">
          <Reveal>
            <div className="mb-20 max-w-2xl mx-auto text-center">
              <p className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-accent/80">
                Permanent History
              </p>
              <h2
                className="text-3xl font-bold tracking-tight sm:text-4xl"
                style={{
                  background:
                    'linear-gradient(to right bottom, rgb(247 248 248) 30%, rgba(247 248 248 / 0.38))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Nothing gets rewritten.
              </h2>
              <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                Reviewable history exists because the system preserves changes
                instead of overwriting them. Corrections link to originals.
                Reversals stay in the record. The past is not editable.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-px sm:grid-cols-2 rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03]">
            {historyProperties.map((prop, i) => (
              <Reveal key={prop.title} delay={i * 60}>
                <div className="flex flex-col p-8 sm:p-10 bg-[#000212] group transition-all duration-500 hover:bg-white/[0.015]">
                  <div
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background:
                        'radial-gradient(ellipse at center, hsl(189 94% 43% / 0.03), transparent 70%)',
                    }}
                  />
                  <div className="relative">
                    <h3 className="mb-2 text-[15px] font-semibold text-[#F7F8F8]">
                      {prop.title}
                    </h3>
                    <p className="text-[13px] leading-relaxed text-[#95A2B3]/60">
                      {prop.detail}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S4: ATTRIBUTION AND NOTES
         ═══════════════════════════════════════════════════ */}
      <section className="relative py-28">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 50% 60% at 80% 40%, hsl(189 94% 43% / 0.04), transparent)',
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6">
          <div className="grid gap-16 lg:grid-cols-[1fr_1fr] lg:gap-20 items-start">
            <div>
              <Reveal>
                <p className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-accent/80">
                  Attribution
                </p>
                <h2
                  className="text-3xl font-bold tracking-tight sm:text-4xl"
                  style={{
                    background:
                      'linear-gradient(to right bottom, rgb(247 248 248) 30%, rgba(247 248 248 / 0.38))',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Every record has an author.
                </h2>
                <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                  A record is only defensible if someone can tell who created
                  it, who changed it, and what context was attached at the time.
                  The system preserves authorship and annotation as part of the
                  permanent record.
                </p>
              </Reveal>

              <Reveal delay={80}>
                <p className="mt-6 text-[15px] text-[#95A2B3]/70 leading-relaxed">
                  Four roles with database-level access control. No shared
                  logins. No unsigned entries. When the record is questioned,
                  the answer is in the record.
                </p>
              </Reveal>
            </div>

            <div className="relative">
              <div className="absolute left-[15px] top-4 bottom-4 w-px bg-gradient-to-b from-accent/20 via-accent/10 to-transparent" />

              <div className="space-y-8">
                {attributionSteps.map((step, i) => (
                  <Reveal key={step.number} delay={i * 100}>
                    <div className="relative flex gap-5">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/[0.06] z-10">
                        <span className="font-mono text-[10px] font-medium text-accent/80">
                          {step.number}
                        </span>
                      </div>
                      <div className="pt-0.5">
                        <h3 className="mb-1.5 text-[15px] font-semibold text-[#F7F8F8]">
                          {step.action}
                        </h3>
                        <p className="text-[13px] leading-relaxed text-[#95A2B3]/60">
                          {step.detail}
                        </p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S5: REVIEW AND PRINT
         ═══════════════════════════════════════════════════ */}
      <section className="relative py-28">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 50% 50% at 30% 60%, hsl(189 94% 43% / 0.03), transparent)',
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6">
          <Reveal>
            <div className="mb-20 max-w-2xl">
              <p className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-accent/80">
                Review
              </p>
              <h2
                className="text-3xl font-bold tracking-tight sm:text-4xl"
                style={{
                  background:
                    'linear-gradient(to right bottom, rgb(247 248 248) 30%, rgba(247 248 248 / 0.38))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Navigate the record, not reconstruct it.
              </h2>
              <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                The system organizes operational records for inspection.
                Compliance dashboard, per-patron aggregates, gaming-day
                navigation, and printable logs — a review surface, not a data
                sink.
              </p>
            </div>
          </Reveal>

          {/* Screenshot placeholder */}
          <Reveal delay={60}>
            <div className="group relative mb-16 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] transition-all duration-500 hover:border-accent/20">
              <div
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={{
                  background:
                    'radial-gradient(ellipse at center, hsl(189 94% 43% / 0.04), transparent 70%)',
                }}
              />
              <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.5) 1px, transparent 1px)',
                  backgroundSize: '32px 32px',
                }}
              />
              <div className="relative flex aspect-[16/9] items-center justify-center p-10">
                <div className="text-center">
                  <p className="font-mono text-[10px] tracking-[0.15em] text-accent/50 mb-4">
                    COMPLIANCE DASHBOARD
                  </p>
                  <p className="text-sm text-[#95A2B3]/50">
                    Per-patron daily cash aggregates with threshold alerts,
                    gaming-day navigation, and printable records
                  </p>
                </div>
              </div>
            </div>
          </Reveal>

          <div className="grid gap-px sm:grid-cols-2 rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03]">
            {reviewSurfaces.map((surface, i) => (
              <Reveal key={surface.title} delay={i * 50}>
                <div className="flex flex-col p-8 sm:p-10 bg-[#000212] group transition-all duration-500 hover:bg-white/[0.015]">
                  <h3 className="mb-1.5 text-[15px] font-semibold text-[#F7F8F8]">
                    {surface.title}
                  </h3>
                  <p className="text-[13px] leading-relaxed text-[#95A2B3]/60">
                    {surface.detail}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S6: CONTEXT ACROSS THE DAY
         ═══════════════════════════════════════════════════ */}
      <section className="relative py-28">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 50% 50% at 70% 80%, hsl(189 94% 43% / 0.03), transparent)',
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6">
          <div className="grid gap-16 lg:grid-cols-[1fr_1fr] lg:gap-20 items-start">
            <div>
              <Reveal>
                <p className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-accent/80">
                  Context
                </p>
                <h2
                  className="text-3xl font-bold tracking-tight sm:text-4xl"
                  style={{
                    background:
                      'linear-gradient(to right bottom, rgb(247 248 248) 30%, rgba(247 248 248 / 0.38))',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Review needs surrounding events, not isolated rows.
                </h2>
                <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                  Compliance review is rarely about one transaction. The system
                  preserves the surrounding sequence of events needed to
                  understand what actually happened.
                </p>
              </Reveal>
            </div>

            <div className="space-y-4">
              {contextItems.map((item, i) => (
                <Reveal key={item.title} delay={i * 80}>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 group transition-all duration-500 hover:border-white/[0.10] hover:bg-white/[0.03]">
                    <h3 className="mb-1.5 text-[14px] font-semibold text-[#F7F8F8]">
                      {item.title}
                    </h3>
                    <p className="text-[13px] leading-relaxed text-[#95A2B3]/60">
                      {item.detail}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S7: CTA CHAIN
         ═══════════════════════════════════════════════════ */}
      <section className="relative py-28">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 60% at 50% 100%, hsl(189 94% 43% / 0.05), transparent)',
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6">
          <Reveal>
            <div className="mb-16 text-center max-w-2xl mx-auto">
              <h2
                className="text-3xl font-bold tracking-tight sm:text-4xl"
                style={{
                  background:
                    'linear-gradient(to right bottom, rgb(247 248 248) 30%, rgba(247 248 248 / 0.38))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Continue exploring.
              </h2>
              <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                Audit compliance is one operating loop. The system supports
                three more.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-px sm:grid-cols-3 rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03]">
            {nextLoops.map((loop, i) => (
              <Reveal key={loop.label} delay={i * 60}>
                <Link
                  href={loop.href}
                  className="group relative flex flex-col justify-between p-8 bg-[#000212] transition-all duration-500 hover:bg-white/[0.02]"
                >
                  <div
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background:
                        'radial-gradient(ellipse at center, hsl(189 94% 43% / 0.03), transparent 70%)',
                    }}
                  />
                  <div className="relative">
                    <h3 className="mb-2 text-[15px] font-semibold text-[#F7F8F8]">
                      {loop.label}
                    </h3>
                    <p className="text-[13px] leading-relaxed text-[#95A2B3]/60">
                      {loop.description}
                    </p>
                  </div>
                  <div className="relative mt-6">
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent/70 transition-all duration-300 group-hover:text-accent group-hover:gap-2.5">
                      Explore
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
                </Link>
              </Reveal>
            ))}
          </div>

          <Reveal delay={200}>
            <div className="mt-16 text-center">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-accent text-white hover:bg-accent/90 px-8 h-12 text-sm font-semibold tracking-wide shadow-[0_1px_40px_hsl(189_94%_43%/0.25)] hover:shadow-[0_1px_50px_hsl(189_94%_43%/0.35)] transition-all duration-300"
              >
                <Link href="/contact">Book a walkthrough</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.06] py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
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
            &copy; {new Date().getFullYear()} Player Tracker. All rights
            reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
