'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* ─────────────────────────────────────────────────────────
 * CASH ACCOUNTABILITY — Supporting Page
 *
 * Expands the Cash Accountability operating loop from the homepage.
 *
 * Sections: Hero → Record the Event → Preserve Exceptions
 *           → Confirm Movement → Table Context → Attribution
 *           → CTA Chain
 *
 * Source: pt2-supporting-page-brief-cash-accountability.md
 * Reality: SYSTEM-REALITY-MAP.md (Cash: 10/10 working)
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

/** S2 — Record the event */
const entryCapabilities = [
  {
    title: 'Buy-in recording',
    detail:
      'Record the buy-in at the table as it happens. Staff identity, amount, denomination, and table context captured at the point of entry.',
  },
  {
    title: 'Cash-out recording',
    detail:
      'Process cash-outs with the same attribution and context. Large-amount confirmation gates catch high-value events before they post.',
  },
  {
    title: 'Live threshold feedback',
    detail:
      'As the number is entered, the system shows proximity to compliance thresholds. Progressive alerts at $3K, CTR banner at $10K.',
  },
  {
    title: 'Staff attribution',
    detail:
      'Every cash event carries the identity of the person who recorded it. No shared logins, no unsigned entries.',
  },
];

/** S3 — Exceptions and reversals */
const exceptionSteps = [
  {
    number: '01',
    action: 'Void the transaction',
    detail:
      'Reverse a cash-out that should not have posted. The original entry is preserved — the void creates a new linked record.',
  },
  {
    number: '02',
    action: 'Capture the reason',
    detail:
      'Every void requires a reason. This is not optional. The system will not process a reversal without one.',
  },
  {
    number: '03',
    action: 'Attach an audit note',
    detail:
      'Add context that explains the situation. The note becomes part of the permanent record alongside the void.',
  },
];

/** S4 — Cross-floor confirmations */
const confirmationTypes = [
  {
    title: 'Fill confirmations',
    detail:
      'Chips move to a table. The cashier confirms the fill. Discrepancy notes capture any variance between request and delivery.',
  },
  {
    title: 'Credit confirmations',
    detail:
      'Chips return from a table. Same confirmation flow, same discrepancy handling, same attribution.',
  },
  {
    title: 'Drop acknowledgements',
    detail:
      'Drop box contents are acknowledged by the receiving party. The chain of custody is recorded, not assumed.',
  },
];

/** S5 — Table-level context */
const tableContext = [
  {
    title: 'Chip inventory',
    detail:
      'Inventory by denomination at the table level. Know what is on the table right now, not what was there at shift start.',
  },
  {
    title: 'Drop and fill tracking',
    detail:
      'Every drop, every fill, every credit — accumulated at the table and visible in the table context.',
  },
  {
    title: 'Bank summary',
    detail:
      'Opening inventory, current state, and net movement. The table-level financial picture during and after the shift.',
  },
  {
    title: 'Rundown report',
    detail:
      'End-of-shift table accounting. Chip count, drop total, fill total, and computed hold — structured for review.',
  },
];

/** S6 — Attribution qualities */
const attributionQualities = [
  {
    title: 'Who entered',
    detail: 'The staff member who recorded the original event.',
  },
  {
    title: 'Who confirmed',
    detail:
      'The staff member who acknowledged the movement on the receiving end.',
  },
  {
    title: 'What changed',
    detail:
      'Reversals, voids, and corrections — each linked to the original with full context.',
  },
  {
    title: 'What was noted',
    detail:
      'Discrepancy notes, audit notes, and reason captures — permanently attached.',
  },
];

/** CTA chain */
const nextLoops = [
  {
    label: 'Audit Compliance',
    description: 'During the shift, not after it.',
    href: '/review/landing-zachman-dark/audit-compliance',
  },
  {
    label: 'Floor Oversight',
    description: 'See the floor as it is now, not after the shift is over.',
    href: '/review/landing-zachman-dark/floor-oversight',
  },
  {
    label: 'Session Tracking',
    description: 'Follow every player from check-in to cash-out.',
    href: '/review/landing-zachman-dark/session-tracking',
  },
];

/* ─────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────── */

export default function CashAccountabilityPage() {
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
          <Link
            href="/review/landing-zachman-dark"
            className="flex items-center gap-2.5 group"
          >
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
              ['Overview', '/review/landing-zachman-dark'],
              ['Contact', '/review/landing-zachman-dark/contact'],
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

          <Button
            asChild
            size="sm"
            className="rounded-full bg-accent/90 text-white hover:bg-accent hover:shadow-[0_0_20px_hsl(189_94%_43%/0.3)] transition-all duration-300 text-[13px] px-5 h-8"
          >
            <Link href="/review/landing-zachman-dark/contact">
              Request a Demo
            </Link>
          </Button>
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
              href="/review/landing-zachman-dark"
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
              Cash movement recorded in real time
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-6 text-lg text-[#95A2B3] leading-relaxed max-w-xl mx-auto">
              Track buy-ins, cash-outs, fills, credits, drops, reversals, and
              table context without reconstructing the shift from memory.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S2: RECORD THE EVENT
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
                Record the Event
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
                Capture cash at the point of activity.
              </h2>
              <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                Cash accountability starts when the money moves, not when
                someone remembers to log it. Buy-ins, cash-outs, and threshold
                context — captured live, attributed immediately.
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
                    BUY-IN WITH THRESHOLD FEEDBACK
                  </p>
                  <p className="text-sm text-[#95A2B3]/50">
                    Live compliance proximity as the number is entered —
                    progressive MTL alerts at $3K, CTR banner at $10K
                  </p>
                </div>
              </div>
            </div>
          </Reveal>

          <div className="grid gap-px sm:grid-cols-2 rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03]">
            {entryCapabilities.map((cap, i) => (
              <Reveal key={cap.title} delay={i * 50}>
                <div className="flex flex-col p-8 sm:p-10 bg-[#000212] group transition-all duration-500 hover:bg-white/[0.015]">
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
         S3: PRESERVE EXCEPTIONS
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
            {/* Left — copy */}
            <div>
              <Reveal>
                <p className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-accent/80">
                  Exceptions
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
                  Mistakes stay part of the record.
                </h2>
                <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                  Reversals and corrections create new records with full
                  lineage. The original entry is preserved. The reason is
                  required. The audit note is permanent.
                </p>
              </Reveal>

              <Reveal delay={80}>
                <p className="mt-6 text-[15px] text-[#95A2B3]/70 leading-relaxed">
                  This is not a system that hides errors. It absorbs them into
                  the controlled record so the shift can be reviewed without
                  guesswork about what happened and why.
                </p>
              </Reveal>
            </div>

            {/* Right — void steps */}
            <div className="relative">
              <div className="absolute left-[15px] top-4 bottom-4 w-px bg-gradient-to-b from-accent/20 via-accent/10 to-transparent" />

              <div className="space-y-8">
                {exceptionSteps.map((step, i) => (
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
         S4: CONFIRM MOVEMENT ACROSS THE FLOOR
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
                Confirmations
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
                Cash moves between roles. The trail follows.
              </h2>
              <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                Fills, credits, and drops pass through handoff points. Each
                confirmation step is recorded — who sent, who received, and
                whether the amounts matched.
              </p>
            </div>
          </Reveal>

          {/* Flow indicator */}
          <Reveal delay={60}>
            <div className="mb-16 flex flex-wrap items-center justify-center gap-x-2 gap-y-3">
              {[
                'Pit Request',
                'Cashier Confirm',
                'Table Receive',
                'Discrepancy Note',
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
                      i === 1
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

          {/* Confirmation type cards */}
          <div className="grid gap-px sm:grid-cols-3 rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03]">
            {confirmationTypes.map((ct, i) => (
              <Reveal key={ct.title} delay={i * 60}>
                <div className="flex flex-col p-8 sm:p-10 bg-[#000212] group transition-all duration-500 hover:bg-white/[0.015] h-full">
                  <div
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background:
                        'radial-gradient(ellipse at center, hsl(189 94% 43% / 0.03), transparent 70%)',
                    }}
                  />
                  <div className="relative">
                    <h3 className="mb-2 text-[15px] font-semibold text-[#F7F8F8]">
                      {ct.title}
                    </h3>
                    <p className="text-[13px] leading-relaxed text-[#95A2B3]/60">
                      {ct.detail}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S5: TIE MONEY BACK TO THE TABLE
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
                Table Context
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
                Every dollar traces back to a table.
              </h2>
              <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                Cash events do not float loose. They accumulate at the table
                level — inventory, drops, fills, bank summary, and rundown. The
                shift review is grounded in where the money was.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-px sm:grid-cols-2 rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03]">
            {tableContext.map((item, i) => (
              <Reveal key={item.title} delay={i * 50}>
                <div className="flex flex-col p-8 sm:p-10 bg-[#000212] group transition-all duration-500 hover:bg-white/[0.015]">
                  <h3 className="mb-1.5 text-[15px] font-semibold text-[#F7F8F8]">
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
      </section>

      {/* ═══════════════════════════════════════════════════
         S6: ATTRIBUTION THAT HOLDS UP LATER
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
                  The record holds up because authorship was preserved.
                </h2>
                <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                  Every entry, confirmation, reversal, and note carries the
                  identity of who recorded it. When the shift is reviewed, you
                  can see who did what, not just what happened.
                </p>
              </Reveal>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {attributionQualities.map((aq, i) => (
                <Reveal key={aq.title} delay={i * 60}>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 group transition-all duration-500 hover:border-white/[0.10] hover:bg-white/[0.03]">
                    <h3 className="mb-1 text-[13px] font-semibold text-[#F7F8F8]">
                      {aq.title}
                    </h3>
                    <p className="text-[12px] leading-relaxed text-[#95A2B3]/60">
                      {aq.detail}
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
                Cash accountability is one operating loop. The system supports
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
                <Link href="/review/landing-zachman-dark/contact">
                  Book a walkthrough
                </Link>
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
