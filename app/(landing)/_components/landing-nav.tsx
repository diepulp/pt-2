import Link from 'next/link';

import { Button } from '@/components/ui/button';

export function LandingNav() {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 bg-[#000212]/80 backdrop-blur-xl border-b border-white/[0.06]">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex flex-col items-start transition-opacity duration-300 hover:opacity-80"
        >
          <span
            className="text-lg tracking-wide text-[hsl(189_94%_43%)]/80"
            style={{ fontFamily: 'var(--font-michroma)' }}
          >
            d3lt
          </span>
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[hsl(189_94%_43%)]/25 to-transparent" />
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
  );
}
