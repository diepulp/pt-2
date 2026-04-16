'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* ─────────────────────────────────────────────────────────
 * FLOOR OVERSIGHT — Supporting Page
 *
 * First exemplar supporting page per narrative-spine architecture.
 * Expands the Floor Oversight operating loop from the homepage.
 *
 * Sections: Hero → Floor Picture → Checkpoints → Drill Into Pit
 *           → Oversight in Practice → CTA Chain
 *
 * Source: pt2-supporting-page-brief-floor-oversight.md
 * Reality: SYSTEM-REALITY-MAP.md (9/9 features working)
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

/** S2 — Floor picture capabilities (from System Reality Map) */
const floorCapabilities = [
  {
    title: 'Casino-wide KPIs',
    detail:
      'Win/loss, handle, theo, sessions — aggregated across the entire floor in real time.',
  },
  {
    title: 'Coverage quality',
    detail:
      'See which tables are covered, which are idle, and where floor presence has gaps.',
  },
  {
    title: 'Cash observation alerts',
    detail:
      'Threshold alerts ranked by severity. Progressive indicators during the shift, not after.',
  },
  {
    title: 'Win/loss trend by pit',
    detail:
      'Performance direction by area. Spot movement before it compounds into a shift-level problem.',
  },
  {
    title: 'Floor activity radar',
    detail:
      'Rated vs. unrated play at a glance. Know where sessions are active and where play is untracked.',
  },
  {
    title: 'Active players list',
    detail:
      'Casino-wide roster of who is on the floor right now, at which table, with session status.',
  },
];

/** S3 — Checkpoint steps */
const checkpointSteps = [
  {
    number: '01',
    action: 'Mark the floor',
    detail:
      'Take a snapshot of current KPIs, win/loss, and coverage. The system freezes the state at that moment.',
  },
  {
    number: '02',
    action: 'Continue operating',
    detail:
      'The shift keeps moving. Players arrive, tables turn, cash flows. The checkpoint holds.',
  },
  {
    number: '03',
    action: 'Measure the delta',
    detail:
      'Compare now to then. See exactly what changed — which metrics moved, by how much, in which direction.',
  },
];

/** S4 — Pit drill-down capabilities */
const pitCapabilities = [
  {
    title: 'Table-level view',
    detail:
      'Every table in the pit with status, session count, and current activity.',
  },
  {
    title: 'Seat map',
    detail:
      'Visual seat positions showing occupancy, player identity, and rating status.',
  },
  {
    title: 'Player presence',
    detail:
      'Who is at the pit right now, what they are doing, and how long they have been there.',
  },
  {
    title: 'Inventory context',
    detail:
      'Chip counts, drop totals, and fill history — table-level financial awareness.',
  },
  {
    title: 'Table analytics',
    detail:
      'Performance metrics at the individual table level for focused inspection.',
  },
];

/** S5 — Operating rhythm steps */
const rhythmSteps = [
  {
    step: 'Arrive on shift',
    detail: 'Log in. Smart routing sends you straight to the shift dashboard.',
  },
  {
    step: 'See the floor',
    detail:
      'KPIs, coverage, alerts, and active players — the full picture in one view.',
  },
  {
    step: 'Set a checkpoint',
    detail:
      'Mark the floor state. You now have a baseline to measure the shift against.',
  },
  {
    step: 'Monitor the shift',
    detail:
      'Watch variance, coverage gaps, and alert escalation as the shift progresses.',
  },
  {
    step: 'Inspect where needed',
    detail:
      'Drill from the floor into a pit, from a pit into a table. Follow the signal.',
  },
];

/** CTA chain — next operating loops */
const nextLoops = [
  {
    label: 'Session Tracking',
    description: 'Follow every player from check-in to cash-out.',
    href: '/session-tracking',
  },
  {
    label: 'Cash Accountability',
    description: 'Every dollar attributed, every transaction traced.',
    href: '/cash-accountability',
  },
  {
    label: 'Audit Compliance',
    description: 'During the shift, not after it.',
    href: '/audit-compliance',
  },
];

/* ─────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────── */

export default function FloorOversightPage() {
  return (
    <div className="bg-[#000212] text-[#F7F8F8] min-h-screen antialiased selection:bg-accent/30">
      <style>{`
        html, body { background-color: #000212; }
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @keyframes line-grow {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
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
              Live floor visibility during the shift
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-6 text-lg text-[#95A2B3] leading-relaxed max-w-xl mx-auto">
              See KPIs, coverage, alerts, and change over time from one
              operating surface. Not a report you read tomorrow — a view you use
              now.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S2: THE FLOOR PICTURE
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
                The Floor Picture
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
                The whole floor, right now.
              </h2>
              <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                A property-wide oversight surface built for live operations. Not
                retrospective reporting — a current-state view of every metric
                that matters during the shift.
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
                    SHIFT DASHBOARD
                  </p>
                  <p className="text-sm text-[#95A2B3]/50">
                    Casino-wide floor view with KPIs, coverage, alerts, and
                    activity radar
                  </p>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Capability grid */}
          <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-3 rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03]">
            {floorCapabilities.map((cap, i) => (
              <Reveal key={cap.title} delay={i * 50}>
                <div className="flex flex-col p-7 sm:p-8 bg-[#000212] group transition-all duration-500 hover:bg-white/[0.015]">
                  <div className="mb-3 flex size-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                    <div
                      className="size-1.5 rounded-full bg-accent/60 transition-all duration-500 group-hover:bg-accent group-hover:shadow-[0_0_8px_hsl(189_94%_43%/0.4)]"
                      style={{
                        animation: `glow-pulse ${3 + i * 0.3}s ease-in-out infinite`,
                      }}
                    />
                  </div>
                  <h3 className="mb-1.5 text-[14px] font-semibold text-[#F7F8F8]">
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
         S3: CHECKPOINTS — Differentiated Mechanism
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
                  Checkpoints
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
                  Measure change, not just state.
                </h2>
                <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                  A checkpoint is a mid-shift snapshot. Mark the floor at any
                  moment, then measure exactly what changed since that point. No
                  legacy system does this.
                </p>
              </Reveal>

              <Reveal delay={80}>
                <p className="mt-6 text-[15px] text-[#95A2B3]/70 leading-relaxed">
                  This is not passive observation after the fact. It is an
                  active management rhythm — freeze a baseline, continue
                  operating, then compare. The delta tells you what the raw
                  numbers cannot.
                </p>
              </Reveal>
            </div>

            {/* Right — steps with vertical connector */}
            <div className="relative">
              {/* Vertical connector line */}
              <div className="absolute left-[15px] top-4 bottom-4 w-px bg-gradient-to-b from-accent/20 via-accent/10 to-transparent" />

              <div className="space-y-8">
                {checkpointSteps.map((step, i) => (
                  <Reveal key={step.number} delay={i * 100}>
                    <div className="relative flex gap-5">
                      {/* Step indicator */}
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
         S4: DRILL INTO THE PIT
         ═══════════════════════════════════════════════════ */}
      <section className="relative py-28">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 30% 70%, hsl(189 94% 43% / 0.03), transparent)',
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6">
          <Reveal>
            <div className="mb-20 max-w-2xl">
              <p className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-accent/80">
                Drill-Down
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
                From the floor to the table.
              </h2>
              <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                Oversight is not just summary metrics. It leads to actionable
                inspection — from property view to pit, from pit to table, from
                table to seat.
              </p>
            </div>
          </Reveal>

          {/* Drill-down flow indicator */}
          <Reveal delay={60}>
            <div className="mb-16 flex flex-wrap items-center justify-start gap-x-2 gap-y-3">
              {[
                'Shift Dashboard',
                'Pit Dashboard',
                'Table View',
                'Seat Map',
              ].map((level, i) => (
                <span key={level} className="flex items-center">
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
                      i === 0
                        ? 'border-accent/30 bg-accent/[0.06] text-accent/80'
                        : 'border-white/[0.08] bg-white/[0.02] text-[#95A2B3]/60',
                    )}
                  >
                    {level}
                  </span>
                </span>
              ))}
            </div>
          </Reveal>

          {/* Pit screenshot placeholder */}
          <Reveal delay={100}>
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
                    PIT DASHBOARD
                  </p>
                  <p className="text-sm text-[#95A2B3]/50">
                    Table-level view with seat map, player list, inventory, and
                    analytics
                  </p>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Pit capabilities */}
          <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-3 rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03]">
            {pitCapabilities.map((cap, i) => (
              <Reveal key={cap.title} delay={i * 50}>
                <div className="flex flex-col p-7 sm:p-8 bg-[#000212] group transition-all duration-500 hover:bg-white/[0.015]">
                  <h3 className="mb-1.5 text-[14px] font-semibold text-[#F7F8F8]">
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
         S5: OVERSIGHT IN PRACTICE — Operating Rhythm
         ═══════════════════════════════════════════════════ */}
      <section className="relative py-28">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 50% 50% at 70% 50%, hsl(189 94% 43% / 0.03), transparent)',
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6">
          <Reveal>
            <div className="mb-20 max-w-2xl">
              <p className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-accent/80">
                In Practice
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
                A shift, start to finish.
              </h2>
              <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                This is not a feature walkthrough. It is the actual operating
                rhythm of a floor supervisor using the system during a live
                shift.
              </p>
            </div>
          </Reveal>

          {/* Horizontal step sequence */}
          <div className="grid gap-px sm:grid-cols-5 rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03]">
            {rhythmSteps.map((item, i) => (
              <Reveal key={item.step} delay={i * 70}>
                <div className="relative flex flex-col p-6 sm:p-7 bg-[#000212] group transition-all duration-500 hover:bg-white/[0.015] h-full">
                  {/* Step number */}
                  <span className="mb-4 font-mono text-[10px] tracking-[0.12em] text-accent/40">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mb-2 text-[14px] font-semibold text-[#F7F8F8]">
                    {item.step}
                  </h3>
                  <p className="text-[12px] leading-relaxed text-[#95A2B3]/60">
                    {item.detail}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S6: CTA CHAIN — Next Operating Loops
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
                Floor oversight is one operating loop. The system supports three
                more.
              </p>
            </div>
          </Reveal>

          {/* Loop cards */}
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

          {/* Primary CTA */}
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
