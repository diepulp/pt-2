'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { LandingNav } from '../_components/landing-nav';

/* ─────────────────────────────────────────────────────────
 * PT-2 CONTACT PAGE — Exemplar Visual DNA
 *
 * Conversion surface: walkthrough request form.
 * Same #000212 ground, gradient text, glassmorphic card,
 * intersection-observer reveals.
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

/* ─── Form field component ─── */
function Field({
  label,
  name,
  type = 'text',
  placeholder,
  required = true,
  textarea = false,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder: string;
  required?: boolean;
  textarea?: boolean;
}) {
  const id = `field-${name}`;
  const shared = cn(
    'w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3',
    'text-sm text-[#F7F8F8] placeholder:text-[#95A2B3]/40',
    'outline-none transition-all duration-300',
    'focus:border-accent/40 focus:bg-white/[0.05] focus:ring-1 focus:ring-accent/20',
    'hover:border-white/[0.12]',
  );

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-[13px] font-medium text-[#95A2B3]"
      >
        {label}
        {!required && (
          <span className="ml-1.5 text-[11px] text-[#95A2B3]/40">optional</span>
        )}
      </label>
      {textarea ? (
        <textarea
          id={id}
          name={name}
          rows={4}
          required={required}
          placeholder={placeholder}
          className={cn(shared, 'resize-none')}
        />
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          required={required}
          placeholder={placeholder}
          className={cn(shared, 'h-11')}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────── */

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="bg-[#000212] text-[#F7F8F8] min-h-screen antialiased selection:bg-accent/30">
      <style>{`
        html, body { background-color: #000212; }
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

      {/* ── Hero + Form ── */}
      <section className="relative">
        {/* Glow */}
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

        <div className="relative mx-auto max-w-5xl px-6 pt-24 pb-28 sm:pt-32 sm:pb-36">
          <div className="grid gap-16 lg:grid-cols-[1fr_420px] lg:gap-20 items-start">
            {/* Left — copy */}
            <div className="max-w-lg pt-4">
              <Reveal>
                <p className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-accent/80">
                  Get Started
                </p>
                <h1
                  className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-[1.12]"
                  style={{
                    background:
                      'linear-gradient(to right bottom, rgb(247 248 248) 30%, rgba(247 248 248 / 0.38))',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Talk to us about your floor.
                </h1>
              </Reveal>

              <Reveal delay={80}>
                <p className="mt-5 text-[15px] text-[#95A2B3] leading-relaxed">
                  We&apos;ll walk through how Player Tracker fits your property
                  — your tables, your workflows, your operation. No sales pitch.
                  Just an operational walkthrough.
                </p>
              </Reveal>

              <Reveal delay={160}>
                <div className="mt-10 space-y-5">
                  {[
                    {
                      label: 'Operational walkthrough',
                      detail:
                        'See the system configured for your floor — your games, your tables, your staff roles.',
                    },
                    {
                      label: 'Import assessment',
                      detail:
                        "Bring a sample export from your current system. We'll show you the migration path.",
                    },
                    {
                      label: 'Property-specific pricing',
                      detail:
                        'One product, one price per property. No tiers, no per-seat fees.',
                    },
                  ].map((item, i) => (
                    <div key={item.label} className="flex gap-3.5">
                      <div className="mt-1.5 flex size-5 shrink-0 items-center justify-center">
                        <div
                          className="size-1.5 rounded-full bg-accent/60"
                          style={{
                            animation: `glow-pulse ${3 + i * 0.4}s ease-in-out infinite`,
                          }}
                        />
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-[#F7F8F8]">
                          {item.label}
                        </p>
                        <p className="mt-0.5 text-[13px] text-[#95A2B3]/60 leading-relaxed">
                          {item.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>

            {/* Right — form card */}
            <Reveal delay={120}>
              <div className="relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 sm:p-10">
                {/* Card glow */}
                <div
                  className="pointer-events-none absolute inset-0 rounded-2xl"
                  style={{
                    background:
                      'radial-gradient(ellipse at 50% 0%, hsl(189 94% 43% / 0.04), transparent 60%)',
                  }}
                />

                {submitted ? (
                  /* ── Success state ── */
                  <div className="relative flex flex-col items-center py-12 text-center">
                    <div className="mb-5 flex size-12 items-center justify-center rounded-xl border border-accent/30 bg-accent/10">
                      <svg
                        className="size-6 text-accent"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m4.5 12.75 6 6 9-13.5"
                        />
                      </svg>
                    </div>
                    <h2 className="text-lg font-semibold text-[#F7F8F8]">
                      Request received.
                    </h2>
                    <p className="mt-2 max-w-xs text-sm text-[#95A2B3]/70 leading-relaxed">
                      We&apos;ll reach out within one business day to schedule
                      your walkthrough.
                    </p>
                    <Link
                      href="/"
                      className="mt-8 text-[13px] font-medium text-accent/70 transition-colors hover:text-accent"
                    >
                      Back to overview
                    </Link>
                  </div>
                ) : (
                  /* ── Form ── */
                  <form
                    className="relative space-y-5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setSubmitted(true);
                    }}
                  >
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="Name" name="name" placeholder="Your name" />
                      <Field
                        label="Email"
                        name="email"
                        type="email"
                        placeholder="you@property.com"
                      />
                    </div>

                    <Field
                      label="Property name"
                      name="property"
                      placeholder="e.g. Riverfront Card Room"
                      required={false}
                    />

                    <Field
                      label="How can we help?"
                      name="message"
                      placeholder="Tell us about your floor — number of tables, current system, what you're looking to improve."
                      textarea
                      required={false}
                    />

                    <Button
                      type="submit"
                      size="lg"
                      className="w-full rounded-xl bg-accent text-white hover:bg-accent/90 h-11 text-sm font-semibold tracking-wide shadow-[0_1px_40px_hsl(189_94%_43%/0.20)] hover:shadow-[0_1px_50px_hsl(189_94%_43%/0.30)] transition-all duration-300"
                    >
                      Request a walkthrough
                    </Button>

                    <p className="text-center text-[11px] text-[#95A2B3]/40 leading-relaxed">
                      No commitment. We&apos;ll respond within one business day.
                    </p>
                  </form>
                )}
              </div>
            </Reveal>
          </div>
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

      <style>{`
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
