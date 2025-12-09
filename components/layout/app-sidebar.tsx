"use client";

import { Table2, Users, Gift, Shield, Settings } from "lucide-react";
import * as React from "react";

import { NavMain } from "@/components/layout/nav-main";
import { NavUser } from "@/components/layout/nav-user";
import { Logo } from "@/components/shared/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

const navItems = [
  {
    title: "Pit",
    url: "/pit",
    icon: Table2,
  },
  {
    title: "Players",
    url: "/players",
    icon: Users,
  },
  {
    title: "Loyalty",
    url: "/loyalty",
    icon: Gift,
  },
  {
    title: "Compliance",
    url: "/compliance",
    icon: Shield,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <Logo />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
