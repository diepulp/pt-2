'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { LandingNav } from '../_components/landing-nav';

/* ─────────────────────────────────────────────────────────
 * SESSION TRACKING — Supporting Page
 *
 * Expands the Session Tracking operating loop from the homepage.
 *
 * Sections: Hero → Start with Player → Rate Live Play
 *           → Session Continuity → Player Context → Floor Reality
 *           → CTA Chain
 *
 * Source: pt2-supporting-page-brief-session-tracking.md
 * Reality: SYSTEM-REALITY-MAP.md (Session: 7/7, Player: 10/10)
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

/** S2 — Start with the Player */
const playerStartCapabilities = [
  {
    title: 'Instant search',
    detail:
      'Find any player across the casino by name, card ID, or phone. Keyboard shortcut gets you there without leaving the floor view.',
  },
  {
    title: 'Recent players',
    detail:
      'Quick access to the players you just worked with. No re-searching between actions.',
  },
  {
    title: 'Visit check-in',
    detail:
      'Start the session. The visit records arrival time, gaming day, and anchors everything that follows.',
  },
  {
    title: 'Table assignment',
    detail:
      'Assign the player to a table and seat. The session record begins here — not from a blank form.',
  },
];

/** S3 — Rating lifecycle */
const ratingSteps = [
  {
    number: '01',
    action: 'Open the rating',
    detail:
      'Create a rating slip when play begins. Table, seat, and game are already set from the session context.',
  },
  {
    number: '02',
    action: 'Capture average bet',
    detail:
      "Record the player's average bet as play develops. This drives the theoretical win calculation.",
  },
  {
    number: '03',
    action: 'Pause when needed',
    detail:
      'Player steps away? Pause the rating. Play duration stops accumulating. The session stays open.',
  },
  {
    number: '04',
    action: 'Resume or close',
    detail:
      'Resume when the player returns, or close when play ends. Duration auto-calculates with pauses excluded.',
  },
];

/** S4 — Continuity mechanisms (signature section) */
const continuityMechanisms = [
  {
    title: 'Table moves',
    detail:
      'Player moves from one table to another. The session carries forward — one continuous record, not two disconnected slips.',
  },
  {
    title: 'Pause and resume',
    detail:
      'Sessions survive breaks. Pause when the player steps away, resume when they return. Play time adjusts automatically.',
  },
  {
    title: 'Start from previous',
    detail:
      'Returning player? Begin the new session with context from the last one. No re-entering information the system already has.',
  },
  {
    title: 'Visit continuation',
    detail:
      'A player who checked out and returns the same gaming day can continue the visit chain. The system sees it as one visit, not two.',
  },
];

/** S5 — Player context surfaces */
const contextSurfaces = [
  {
    title: 'Session history',
    detail:
      'Every visit, every rating slip, every table — connected back to the player over time.',
  },
  {
    title: 'Financial activity',
    detail:
      'Buy-ins, cash-outs, and cash velocity — visible in the context of active sessions.',
  },
  {
    title: 'Interaction timeline',
    detail:
      'Filterable chronological log of everything that happened with a player. Audit-grade context.',
  },
  {
    title: 'Summary metrics',
    detail:
      'Session value, engagement frequency, reward activity — the player picture, not just the current seat.',
  },
];

/** S6 — Floor reality items */
const floorRealities = [
  {
    title: 'Unidentified players',
    detail:
      'A player sits down before being identified. The system can track the session and attach the identity later.',
  },
  {
    title: 'Messy starts',
    detail:
      'Not every session begins with a clean check-in. The system accommodates operational disorder without breaking the record.',
  },
  {
    title: 'Exclusion awareness',
    detail:
      'Player status — blocked, alert, or monitored — surfaces during session handling, not after the fact.',
  },
];

/** CTA chain — adjacent operating loops */
const nextLoops = [
  {
    label: 'Floor Oversight',
    description: 'See the floor as it is now, not after the shift is over.',
    href: '/floor-oversight',
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

export default function SessionTrackingPage() {
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
      <LandingNav />

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
              Track the session, not just the seat
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-6 text-lg text-[#95A2B3] leading-relaxed max-w-xl mx-auto">
              Follow play from check-in through rating, pauses, moves, and
              closeout without breaking continuity. One coherent record,
              regardless of how the floor moves.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S2: START WITH THE PLAYER
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
                Find the Player
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
                Every session starts with a player, not a form.
              </h2>
              <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                Locate the player instantly, see their current context, and
                anchor the session. The operating surface is built for speed,
                not data entry.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-px sm:grid-cols-2 rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03]">
            {playerStartCapabilities.map((cap, i) => (
              <Reveal key={cap.title} delay={i * 60}>
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
         S3: RATE LIVE PLAY
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
                  Rate Live Play
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
                  Rating happens while play happens.
                </h2>
                <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                  Open a rating when play begins, capture average bet as it
                  develops, pause when the player steps away, close when the
                  session ends. Duration auto-calculates with pauses excluded.
                </p>
              </Reveal>

              <Reveal delay={80}>
                <p className="mt-6 text-[15px] text-[#95A2B3]/70 leading-relaxed">
                  Theoretical win computes from the session data — table, game,
                  average bet, and actual play time. The rating slip is not a
                  report filed afterward. It is a live record managed in motion.
                </p>
              </Reveal>
            </div>

            {/* Right — rating lifecycle steps */}
            <div className="relative">
              <div className="absolute left-[15px] top-4 bottom-4 w-px bg-gradient-to-b from-accent/20 via-accent/10 to-transparent" />

              <div className="space-y-8">
                {ratingSteps.map((step, i) => (
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
         S4: SESSION CONTINUITY — Signature Section
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
                Continuity
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
                Players move. The session doesn&apos;t break.
              </h2>
              <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                Table moves, pauses, breaks, returns — the system treats it as
                one continuous session, not disconnected fragments patched
                together after the fact.
              </p>
            </div>
          </Reveal>

          {/* Continuity flow indicator */}
          <Reveal delay={60}>
            <div className="mb-16 flex flex-wrap items-center justify-center gap-x-2 gap-y-3">
              {['Check-in', 'Table A', 'Pause', 'Table B', 'Close'].map(
                (stage, i) => (
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
                        i === 0 || i === 4
                          ? 'border-accent/30 bg-accent/[0.06] text-accent/80'
                          : 'border-white/[0.08] bg-white/[0.02] text-[#95A2B3]/60',
                      )}
                    >
                      {stage}
                    </span>
                  </span>
                ),
              )}
            </div>
          </Reveal>

          {/* Mechanism cards */}
          <div className="grid gap-px sm:grid-cols-2 rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03]">
            {continuityMechanisms.map((mech, i) => (
              <Reveal key={mech.title} delay={i * 60}>
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
                      {mech.title}
                    </h3>
                    <p className="text-[13px] leading-relaxed text-[#95A2B3]/60">
                      {mech.detail}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         S5: PLAYER CONTEXT OVER TIME
         ═══════════════════════════════════════════════════ */}
      <section className="relative py-28">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 50% 50% at 70% 60%, hsl(189 94% 43% / 0.03), transparent)',
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6">
          <Reveal>
            <div className="mb-20 max-w-2xl">
              <p className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-accent/80">
                Player Context
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
                The session record stays with the player.
              </h2>
              <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                Active session handling and longer-term player context are
                connected. Every session adds to the player picture — not as a
                profile page, but as operational history.
              </p>
            </div>
          </Reveal>

          {/* Screenshot placeholder — Player 360 */}
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
                    PLAYER 360
                  </p>
                  <p className="text-sm text-[#95A2B3]/50">
                    Identity, sessions, financials, loyalty, and filterable
                    interaction timeline — one screen
                  </p>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Context surfaces */}
          <div className="grid gap-px sm:grid-cols-2 rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03]">
            {contextSurfaces.map((surface, i) => (
              <Reveal key={surface.title} delay={i * 50}>
                <div className="flex flex-col p-7 sm:p-8 bg-[#000212] group transition-all duration-500 hover:bg-white/[0.015]">
                  <h3 className="mb-1.5 text-[14px] font-semibold text-[#F7F8F8]">
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
         S6: REAL FLOOR IRREGULARITIES
         ═══════════════════════════════════════════════════ */}
      <section className="relative py-28">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 50% 50% at 30% 80%, hsl(189 94% 43% / 0.03), transparent)',
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6">
          <div className="grid gap-16 lg:grid-cols-[1fr_1fr] lg:gap-20 items-start">
            <div>
              <Reveal>
                <p className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-accent/80">
                  Floor Reality
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
                  Not every session starts clean.
                </h2>
                <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
                  The system handles the operational mess of a live casino floor
                  without breaking the record. Unidentified players, imperfect
                  starts, returning context — all accounted for.
                </p>
              </Reveal>
            </div>

            <div className="space-y-4">
              {floorRealities.map((item, i) => (
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
         S7: CTA CHAIN — Next Operating Loops
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
                Session tracking is one operating loop. The system supports
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
