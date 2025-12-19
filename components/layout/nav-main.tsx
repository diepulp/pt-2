"use client";

import { type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

export function NavMain({ items }: { items: NavItem[] }) {
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
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-75",
                isActive
                  ? "bg-sidebar-primary/10 text-sidebar-primary font-medium"
                  : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
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
