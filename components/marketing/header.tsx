import Link from 'next/link';

import { Button } from '@/components/ui/button';

import { MobileMenuToggle } from './mobile-menu-toggle';

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-lg font-semibold">
          Player Tracker
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex">
          <Link
            href="/#how-it-works"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Product
          </Link>
          <Link
            href="/pricing"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Pricing
          </Link>
          <Link
            href="/contact"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Contact
          </Link>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/signin">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/contact">Request a Demo</Link>
          </Button>
        </div>

        <MobileMenuToggle />
      </div>
    </header>
  );
}
