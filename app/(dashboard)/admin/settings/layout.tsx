'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SETTINGS_TABS = [
  {
    value: 'operations',
    label: 'Casino Operations',
    href: '/admin/settings/operations',
  },
  {
    value: 'anomaly-detection',
    label: 'Anomaly Detection',
    href: '/admin/settings/anomaly-detection',
  },
  { value: 'loyalty', label: 'Loyalty', href: '/admin/settings/loyalty' },
] as const;

function getActiveTab(pathname: string): string {
  if (pathname.includes('/anomaly-detection')) return 'anomaly-detection';
  if (pathname.includes('/loyalty')) return 'loyalty';
  return 'operations';
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
      <div className="space-y-1">
        <h1
          className="text-base font-bold uppercase tracking-widest"
          style={{ fontFamily: 'monospace' }}
        >
          Settings
        </h1>
        <p className="text-xs text-muted-foreground">
          Configure casino operations, anomaly detection, and loyalty economics.
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
