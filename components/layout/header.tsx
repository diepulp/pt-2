"use client";

import { usePathname } from "next/navigation";
import React from "react";

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

/**
 * Route configuration for breadcrumb generation.
 * Maps path segments to display labels and optional parent routes.
 */
const routeConfig: Record<string, { label: string; parent?: string }> = {
  pit: { label: "Pit" },
  tables: { label: "Tables", parent: "pit" },
  sessions: { label: "Sessions", parent: "pit" },
  players: { label: "Players" },
  history: { label: "History", parent: "players" },
  loyalty: { label: "Loyalty" },
  promo: { label: "Promo Programs", parent: "loyalty" },
  rewards: { label: "Rewards", parent: "loyalty" },
  tiers: { label: "Tiers", parent: "loyalty" },
  compliance: { label: "Compliance" },
  reports: { label: "Reports" },
  "shift-dashboard": { label: "Shift Dashboard" },
  admin: { label: "Admin" },
  alerts: { label: "Alerts", parent: "admin" },
  settings: { label: "Settings" },
  casino: { label: "Casino", parent: "settings" },
  staff: { label: "Staff", parent: "settings" },
  thresholds: { label: "Thresholds", parent: "settings" },
  shifts: { label: "Shifts", parent: "settings" },
};

function generateBreadcrumbs(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs: { label: string; href: string; isLast: boolean }[] = [];

  let currentPath = "";
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    currentPath += `/${segment}`;
    const config = routeConfig[segment];
    const label =
      config?.label ??
      segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
    const isLast = i === segments.length - 1;

    breadcrumbs.push({ label, href: currentPath, isLast });
  }

  return breadcrumbs;
}

export function Header() {
  const pathname = usePathname();
  const selectedPitLabel = usePitDashboardStore((s) => s.selectedPitLabel);
  const breadcrumbs = generateBreadcrumbs(pathname);

  // Show pit label as additional context when on pit routes
  const isPitRoute = pathname.startsWith("/pit");

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 px-4">
      <Breadcrumb>
        <BreadcrumbList>
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.href}>
              {index > 0 && <BreadcrumbSeparator className="hidden md:block" />}
              <BreadcrumbItem className={index === 0 ? "hidden md:block" : ""}>
                {crumb.isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={crumb.href}>
                    {crumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {/* Show selected pit label after Pit breadcrumb */}
              {isPitRoute && crumb.href === "/pit" && selectedPitLabel && (
                <>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem className="hidden md:block">
                    <span className="text-accent font-medium">
                      {selectedPitLabel}
                    </span>
                  </BreadcrumbItem>
                </>
              )}
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex items-center gap-2">
        <ThemeSwitcher />
        <GamingDayIndicator />
      </div>
    </header>
  );
}
