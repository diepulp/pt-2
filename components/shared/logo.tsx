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
            <div className="flex flex-col items-start">
              <span
                className="text-sm tracking-wide text-accent/80"
                style={{ fontFamily: 'var(--font-michroma)' }}
              >
                d3lt
              </span>
              <div className="h-px w-full bg-gradient-to-r from-transparent via-accent/25 to-transparent" />
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
