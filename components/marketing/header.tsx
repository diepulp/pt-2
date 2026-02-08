import Link from 'next/link';

import { Button } from '@/components/ui/button';

import { MobileMenuToggle } from './mobile-menu-toggle';

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
        <Link href="/" className="font-semibold text-lg">
          Player Tracker
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link
            href="/#capabilities"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Product
          </Link>
          <Link
            href="/#how-it-works"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            How it works
          </Link>
          <Link
            href="/pricing"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/contact"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Contact
          </Link>
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/signin">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/start">Get started</Link>
          </Button>
        </div>

        <MobileMenuToggle />
      </div>
    </header>
  );
}
