import Link from 'next/link';

export function MarketingFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm font-semibold">Player Tracker</p>
            <p className="mt-2 text-sm text-muted-foreground">
              The table games system your card room has been waiting for.
            </p>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold">Product</p>
            <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link href="/#how-it-works" className="hover:text-foreground">
                How it works
              </Link>
              <Link href="/#compliance" className="hover:text-foreground">
                Compliance
              </Link>
              <Link href="/pricing" className="hover:text-foreground">
                Pricing
              </Link>
            </nav>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold">Company</p>
            <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link href="/contact" className="hover:text-foreground">
                Contact
              </Link>
              <Link href="/signin" className="hover:text-foreground">
                Sign in
              </Link>
            </nav>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold">Legal</p>
            <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
              <span>Privacy Policy</span>
              <span>Terms of Service</span>
            </nav>
          </div>
        </div>

        <div className="mt-10 border-t pt-6">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Player Tracker. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
