'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface SettingsNavItem {
  href: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface SettingsSidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  items: SettingsNavItem[];
}

function resolveActive(pathname: string, items: SettingsNavItem[]): string {
  // Match by last path segment
  for (const item of items) {
    const segment = item.href.split('/').pop()!;
    if (pathname.includes(segment)) return item.href;
  }
  return items[0]?.href ?? '';
}

export function SettingsSidebarNav({
  className,
  items,
  ...props
}: SettingsSidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const activeHref = resolveActive(pathname, items);

  return (
    <>
      {/* Mobile: Select dropdown */}
      <Select value={activeHref} onValueChange={(val) => router.push(val)}>
        <SelectTrigger className="lg:hidden">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.href} value={item.href}>
              {item.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Desktop: Vertical nav */}
      <ScrollArea className="hidden lg:block">
        <nav className={cn('flex flex-col space-y-1', className)} {...props}>
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                  'w-full justify-start gap-2.5 transition-colors duration-150',
                  isActive
                    ? 'border-l-2 border-accent bg-accent/10 text-accent hover:bg-accent/15 hover:text-accent'
                    : 'border-l-2 border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
    </>
  );
}
