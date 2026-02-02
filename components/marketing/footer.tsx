import Link from 'next/link';

export function MarketingFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">
              Product
            </Link>
            <Link
              href="/pricing"
              className="hover:text-foreground transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/contact"
              className="hover:text-foreground transition-colors"
            >
              Contact
            </Link>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Player Tracker. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
