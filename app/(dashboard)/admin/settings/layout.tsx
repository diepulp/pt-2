'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SETTINGS_TABS = [
  {
    value: 'thresholds',
    label: 'Alert Thresholds',
    href: '/admin/settings/thresholds',
  },
  { value: 'shifts', label: 'Shifts', href: '/admin/settings/shifts' },
] as const;

function getActiveTab(pathname: string): string {
  if (pathname.includes('/shifts')) return 'shifts';
  return 'thresholds';
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeTab = getActiveTab(pathname);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure casino alert thresholds and shift boundaries.
        </p>
      </div>

      <Tabs value={activeTab}>
        <TabsList>
          {SETTINGS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} asChild>
              <Link href={tab.href}>{tab.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {children}
    </div>
  );
}
