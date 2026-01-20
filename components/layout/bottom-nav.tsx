'use client';

import { Table2, Users, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const navItems = [
  {
    title: 'Pit',
    url: '/pit',
    icon: Table2,
  },
  {
    title: 'Players',
    url: '/players',
    icon: Users,
  },
  {
    title: 'Settings',
    url: '/settings',
    icon: Settings,
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background md:hidden">
      <div className="flex h-16 items-center justify-around">
        {navItems.map((item) => {
          const isActive =
            pathname === item.url || pathname.startsWith(`${item.url}/`);

          return (
            <Link
              key={item.title}
              href={item.url}
              className={cn(
                'flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 px-3 py-2 text-xs transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
