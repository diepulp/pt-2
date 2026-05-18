'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const dynamic = 'force-static';

function useInView(threshold = 0.1) {
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

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, inView } = useInView();
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

const included = [
  'Shift dashboard and floor overview',
  'Player profiles and visit tracking',
  'Rating slips and theoretical win computation',
  'Cash activity capture and threshold monitoring',
  'Loyalty program — points, tiers, and rewards',
  'Operational logs with staff attribution',
  'MTL-style transaction log',
  'Role-based access control',
  'Row-level data isolation per property',
  'Guided setup wizard',
  'Player data import tools',
  'Ongoing updates and support',
];

export default function PricingPage() {
  return (
    <div className="bg-[#000212] text-[#F7F8F8] min-h-screen antialiased selection:bg-accent/30 overflow-x-hidden">
      <style>{`html, body { background-color: #000212; }`}</style>

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
      <nav className="fixed inset-x-0 top-0 z-50 bg-[#000212]/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <img
              src="/Gemini_Generated_Image_dil7iddil7iddil7.png"
              alt="d3lt logo"
              className="size-7 transition-all duration-300 group-hover:brightness-125 [mix-blend-mode:hard-light]"
            />
            <span className="text-lg font-medium tracking-tight text-[#F7F8F8]">
              d3lt
            </span>
          </Link>

          <div className="hidden items-center gap-7 md:flex">
            {(
              [
                ['Operations', '/#operations'],
                ['Accountability', '/#accountability'],
                ['Intelligence', '/#intelligence'],
                ['Pricing', '/pricing'],
              ] as [string, string][]
            ).map(([label, href]) => (
              <a
                key={label}
                href={href}
                className={cn(
                  'text-[13px] transition-colors duration-300 hover:text-[#F7F8F8]',
                  href === '/pricing' ? 'text-[#F7F8F8]' : 'text-[#95A2B3]',
                )}
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

      {/* ── Content ── */}
      <div className="relative mx-auto max-w-5xl px-5 sm:px-6 pt-32 pb-28 sm:pt-40 sm:pb-36">
        {/* Hero */}
        <Reveal>
          <h1
            className="text-4xl font-bold tracking-tight sm:text-5xl"
            style={{
              background:
                'linear-gradient(to right bottom, rgb(247 248 248) 30%, rgba(247 248 248 / 0.38))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Pricing
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] text-[#95A2B3] leading-relaxed">
            One product. One price per property. No tiers, no modules, no
            per-seat fees.
          </p>
        </Reveal>

        {/* What you get */}
        <Reveal delay={80}>
          <div className="mt-16 sm:mt-24">
            <h2
              className="text-2xl font-bold tracking-tight sm:text-3xl"
              style={{
                background:
                  'linear-gradient(to right bottom, rgb(247 248 248) 30%, rgba(247 248 248 / 0.38))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              What you get
            </h2>
            <ul className="mt-6 grid gap-px sm:grid-cols-2 lg:grid-cols-3 rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03]">
              {included.map((item, i) => (
                <Reveal key={item} delay={i * 35}>
                  <li className="flex items-start gap-3 px-6 py-5 bg-[#000212] text-[13px] text-[#95A2B3] leading-relaxed group transition-colors duration-300 hover:bg-white/[0.015]">
                    <span className="mt-1.5 block size-1.5 shrink-0 rounded-full bg-accent/50 group-hover:bg-accent transition-colors duration-300" />
                    {item}
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>
        </Reveal>

        {/* How pricing works */}
        <Reveal delay={120}>
          <div className="mt-16 sm:mt-24 max-w-xl">
            <h2
              className="text-2xl font-bold tracking-tight sm:text-3xl"
              style={{
                background:
                  'linear-gradient(to right bottom, rgb(247 248 248) 30%, rgba(247 248 248 / 0.38))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              How pricing works
            </h2>
            <p className="mt-4 text-[15px] text-[#95A2B3] leading-relaxed">
              Player Tracker is priced per property. Every property gets the
              full platform — same features, same support, no upsells. We'll
              work with you to find the right arrangement for your operation.
            </p>
            <Button
              asChild
              size="lg"
              className="mt-6 rounded-full bg-accent text-white hover:bg-accent/90 px-8 h-12 text-sm font-semibold tracking-wide shadow-[0_1px_40px_hsl(189_94%_43%/0.25)] hover:shadow-[0_1px_50px_hsl(189_94%_43%/0.35)] transition-all duration-300 w-full sm:w-auto"
            >
              <Link href="/contact">Talk to Us About Pricing</Link>
            </Button>
          </div>
        </Reveal>
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.06] py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-5 sm:px-6 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="flex size-6 items-center justify-center rounded-md bg-accent/80">
              <span className="text-[9px] font-bold tracking-tight text-white" />
            </div>
            <span className="text-[12px] font-medium text-[#95A2B3]/60">
              d3lt
            </span>
          </div>
          <p className="text-[11px] text-[#95A2B3]/40">
            &copy; {new Date().getFullYear()} d3lt. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
