'use client';

import { FileText, Shield } from 'lucide-react';

import {
  SettingsSidebarNav,
  type SettingsNavItem,
} from '@/components/admin/settings-sidebar-nav';
import { Separator } from '@/components/ui/separator';

const sidebarNavItems: SettingsNavItem[] = [
  {
    title: 'MTL Tracking',
    href: '/compliance',
    icon: Shield,
  },
  {
    title: 'Reports',
    href: '/compliance/reports',
    icon: FileText,
  },
];

export default function ComplianceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6 overflow-hidden bg-gradient-to-b from-transparent via-accent/5 to-transparent">
      {/* Page header */}
      <div className="space-y-1">
        <h1
          className="text-base font-bold uppercase tracking-widest"
          style={{ fontFamily: 'monospace' }}
        >
          Compliance
        </h1>
        <p className="text-xs text-muted-foreground">
          AML/CTR transaction monitoring and regulatory reporting.
        </p>
      </div>

      <Separator />

      {/* Two-column: sidebar nav + content */}
      <div className="flex flex-1 flex-col space-y-6 overflow-hidden lg:flex-row lg:space-x-12 lg:space-y-0">
        <aside className="top-0 w-full shrink-0 lg:sticky lg:w-52">
          <SettingsSidebarNav items={sidebarNavItems} />
        </aside>
        <div className="flex w-full min-w-0 flex-1 overflow-y-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
