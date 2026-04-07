'use client';

/**
 * Cashier Console Tab Navigation
 *
 * 3-tab navigation for cashier screens:
 * 1. Patron Transactions (cash-out confirmation)
 * 2. Operational Confirmations (fill/credit fulfillment)
 * 3. Drop Acknowledgements (cage received stamps)
 *
 * @see PRD-033 Cashier Workflow MVP
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const tabs = [
  {
    label: 'Patron Transactions',
    href: '/cashier/patron-transactions',
  },
  {
    label: 'Operational Confirmations',
    href: '/cashier/operational-confirmations',
  },
  {
    label: 'Drop Acknowledgements',
    href: '/cashier/drop-acknowledgements',
  },
] as const;

export function CashierTabNav() {
  const pathname = usePathname();

  return (
    <nav className="flex border-b-2 border-border/50" aria-label="Cashier tabs">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors',
              'border-b-2 -mb-px',
              isActive
                ? 'border-accent text-accent'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-accent/30',
            )}
            style={{ fontFamily: 'monospace' }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
