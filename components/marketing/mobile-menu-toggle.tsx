'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

export function MobileMenuToggle() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground"
        aria-label="Toggle menu"
      >
        {isOpen ? (
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
            />
          </svg>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-16 left-0 right-0 border-b bg-background p-4">
          <nav className="flex flex-col gap-4">
            <Link
              href="/#capabilities"
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setIsOpen(false)}
            >
              Product
            </Link>
            <Link
              href="/#how-it-works"
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setIsOpen(false)}
            >
              How it works
            </Link>
            <Link
              href="/pricing"
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setIsOpen(false)}
            >
              Pricing
            </Link>
            <Link
              href="/contact"
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setIsOpen(false)}
            >
              Contact
            </Link>
            <div className="flex flex-col gap-2 pt-2 border-t">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/signin">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/start">Get started</Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
