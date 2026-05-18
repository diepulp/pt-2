'use client';

import Link from 'next/link';

import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';

export function Logo() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild>
          <Link href="/pit">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <span
                className="text-[10px] tracking-wide"
                style={{ fontFamily: 'var(--font-michroma)' }}
              >
                d3lt
              </span>
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span
                className="truncate text-sm"
                style={{ fontFamily: 'var(--font-michroma)' }}
              >
                d3lt
              </span>
              <span className="truncate text-xs">Pit Station</span>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
