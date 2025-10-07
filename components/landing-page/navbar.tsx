"use client";

import { Button } from "@heroui/button";
import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from "@heroui/dropdown";
import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  NavbarMenu,
  NavbarMenuItem,
  NavbarMenuToggle,
} from "@heroui/navbar";
import { ChevronDown, Database } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ThemeToggle } from "@/components/landing-page/theme-toggle";
import { ThemeSwitcher } from "@/components/theme-switcher";

export function HeroNavbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navVariants = {
    hidden: { opacity: 0, y: -20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  const menuItems = [
    { name: "Features", href: "#features" },
    { name: "Benefits", href: "#benefits" },
    { name: "Testimonials", href: "#testimonials" },
    { name: "Pricing", href: "#pricing" },
  ];

  return (
    <motion.div initial="hidden" animate="visible" variants={navVariants}>
      <Navbar
        onMenuOpenChange={setIsMenuOpen}
        className={`transition-all duration-300 ${
          isScrolled
            ? "backdrop-blur-md bg-background/90 border-b"
            : "bg-transparent"
        }`}
        maxWidth="xl"
        position="sticky"
        isBordered={isScrolled}
        isBlurred={isScrolled}
      >
        <NavbarContent>
          <NavbarMenuToggle
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            className="sm:hidden"
          />
          <NavbarBrand>
            <Link href="/" className="flex items-center space-x-2">
              <Database className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold text-foreground">
                CasinoTrack Pro
              </span>
            </Link>
          </NavbarBrand>
        </NavbarContent>

        <NavbarContent className="hidden sm:flex gap-8" justify="center">
          <Dropdown>
            <NavbarItem>
              <DropdownTrigger>
                <Button
                  disableRipple
                  className="p-0 bg-transparent data-[hover=true]:bg-transparent"
                  endContent={<ChevronDown className="h-4 w-4" />}
                  radius="sm"
                  variant="light"
                >
                  Features
                </Button>
              </DropdownTrigger>
            </NavbarItem>
            <DropdownMenu
              aria-label="Features"
              className="w-[340px]"
              itemClasses={{
                base: "gap-4",
              }}
            >
              <DropdownItem
                key="player-tracking"
                description="Track every aspect of player behavior and gaming patterns"
              >
                Player Tracking
              </DropdownItem>
              <DropdownItem
                key="rewards-management"
                description="Create and manage comprehensive rewards programs"
              >
                Rewards Management
              </DropdownItem>
              <DropdownItem
                key="analytics-dashboard"
                description="Real-time analytics and performance insights"
              >
                Analytics Dashboard
              </DropdownItem>
              <DropdownItem
                key="marketing-tools"
                description="Targeted marketing campaigns and automation"
              >
                Marketing Tools
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
          {menuItems.map((item) => (
            <NavbarItem key={item.name}>
              <Link
                href={item.href}
                className="text-foreground/80 hover:text-foreground transition-colors"
              >
                {item.name}
              </Link>
            </NavbarItem>
          ))}
        </NavbarContent>

        <NavbarContent justify="end">
          <NavbarItem className="hidden sm:flex gap-2">
            <ThemeToggle />
            {/* <ThemeSwitcher /> */}
          </NavbarItem>
          <NavbarItem>
            <Button as={Link} color="primary" href="#contact" variant="flat">
              Request Demo
            </Button>
          </NavbarItem>
        </NavbarContent>

        <NavbarMenu>
          {menuItems.map((item, index) => (
            <NavbarMenuItem key={`${item.name}-${index}`}>
              <Link className="w-full text-foreground text-lg" href={item.href}>
                {item.name}
              </Link>
            </NavbarMenuItem>
          ))}
          <NavbarMenuItem>
            <div className="flex gap-2 mt-4">
              <ThemeToggle />
              <ThemeSwitcher />
            </div>
          </NavbarMenuItem>
          <NavbarMenuItem>
            <Button
              as={Link}
              color="primary"
              href="#contact"
              className="w-full"
              variant="flat"
            >
              Request Demo
            </Button>
          </NavbarMenuItem>
        </NavbarMenu>
      </Navbar>
    </motion.div>
  );
}

// Export with the original name for compatibility
export { HeroNavbar as Navbar };
