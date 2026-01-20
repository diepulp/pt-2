'use client';

import { ChevronRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export interface NavChild {
  title: string;
  url: string;
}

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  badge?: number;
  children?: NavChild[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

interface NavMainProps {
  groups: NavGroup[];
}

export function NavMain({ groups }: NavMainProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <NavGroupSection key={group.label} group={group} pathname={pathname} />
      ))}
    </div>
  );
}

function NavGroupSection({
  group,
  pathname,
}: {
  group: NavGroup;
  pathname: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {/* Group label */}
      <div className="px-3 py-1.5">
        <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest">
          {group.label}
        </span>
      </div>

      {/* Group items */}
      <nav className="flex flex-col gap-0.5 px-2">
        {group.items.map((item) => (
          <NavItemComponent key={item.title} item={item} pathname={pathname} />
        ))}
      </nav>
    </div>
  );
}

function NavItemComponent({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) {
  const Icon = item.icon;
  const hasChildren = item.children && item.children.length > 0;

  // Check if this item or any child is active
  const isActive = pathname === item.url || pathname.startsWith(`${item.url}/`);
  const isChildActive = item.children?.some(
    (child) =>
      pathname === child.url ||
      pathname.startsWith(`${child.url}/`) ||
      // Handle query param URLs
      (child.url.includes('?') && pathname === child.url.split('?')[0]),
  );
  const isExpanded = isActive || isChildActive;

  if (!hasChildren) {
    // Simple nav item (no children)
    return (
      <Link
        href={item.url}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-75',
          isActive
            ? 'bg-sidebar-primary/10 text-sidebar-primary font-medium'
            : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate flex-1">{item.title}</span>
        {item.badge !== undefined && item.badge > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-sidebar-primary/10 px-1.5 text-[10px] font-medium text-sidebar-primary tabular-nums">
            {item.badge}
          </span>
        )}
      </Link>
    );
  }

  // Collapsible nav item with children
  return (
    <Collapsible defaultOpen={isExpanded}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-75',
            isActive || isChildActive
              ? 'bg-sidebar-primary/10 text-sidebar-primary font-medium'
              : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate flex-1 text-left">{item.title}</span>
          <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 [[data-state=open]>&]:rotate-90" />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-sidebar-border pl-3">
          {item.children!.map((child) => {
            // Handle query param URLs for active state
            const childPath = child.url.split('?')[0];
            const isChildItemActive =
              pathname === child.url ||
              pathname === childPath ||
              (child.url.includes('?') &&
                pathname === childPath &&
                child.url === `${pathname}${window?.location?.search || ''}`);

            return (
              <Link
                key={child.title}
                href={child.url}
                className={cn(
                  'flex items-center rounded-md px-3 py-1.5 text-sm transition-colors duration-75',
                  isChildItemActive
                    ? 'text-sidebar-primary font-medium'
                    : 'text-muted-foreground hover:text-sidebar-foreground',
                )}
              >
                <span className="truncate">{child.title}</span>
              </Link>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Legacy support: flat items without groups
interface NavMainLegacyProps {
  items: Omit<NavItem, 'children' | 'badge'>[];
}

export function NavMainLegacy({ items }: NavMainLegacyProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="text-[9px] text-muted-foreground/60 uppercase tracking-widest px-2">
        Navigation
      </div>
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const isActive =
            pathname === item.url || pathname.startsWith(`${item.url}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.title}
              href={item.url}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-75',
                isActive
                  ? 'bg-sidebar-primary/10 text-sidebar-primary font-medium'
                  : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.title}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
