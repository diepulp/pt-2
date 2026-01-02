"use client";

import { GamingDayIndicator } from "@/components/shared/gaming-day-indicator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { usePitDashboardStore } from "@/store/pit-dashboard-store";

import { ThemeSwitcher } from "../theme-switcher";

export function Header() {
  const selectedPitLabel = usePitDashboardStore((s) => s.selectedPitLabel);

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink href="/pit">Pit Station</BreadcrumbLink>
          </BreadcrumbItem>
          {selectedPitLabel && (
            <>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem className="hidden md:block">
                <span className="text-accent font-medium">
                  {selectedPitLabel}
                </span>
              </BreadcrumbItem>
            </>
          )}
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>Dashboard</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto">
        <ThemeSwitcher />
        <GamingDayIndicator />
      </div>
    </header>
  );
}
