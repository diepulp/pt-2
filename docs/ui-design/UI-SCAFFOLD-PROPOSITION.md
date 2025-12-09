# UI Scaffold Proposition: PT-2 Root Layout System

**ID**: UI-SCAFFOLD-001
**Version**: 1.3.0
**Status**: DRAFT
**Created**: 2025-12-08
**Updated**: 2025-12-08
**Owner**: Frontend Design Skill

---

## Executive Summary

This proposition establishes the foundational UI scaffold for PT-2, aligning with the **Monochrome + One Accent** design system defined in `pt2-ui-design-system-prototype-style-guide.md`. The current implementation uses generic Geist fonts and boilerplate layouts. This proposal transforms PT-2 into a distinctive, professional casino pit management interface.

**Key Decision**: Use the **shadcn/ui Sidebar** component (`collapsible="icon"` variant) for navigation. This provides a production-ready, accessible, well-maintained sidebar with icon-collapse behavior, eliminating the need for custom implementation.



---

## Current State Analysis

### What Exists

| Element | Current State | Issue |
|---------|---------------|-------|
| **Root Layout** | Geist font, minimal structure | Generic starter kit aesthetic |
| **globals.css** | Tailwind v4 + shadcn tokens | Dark theme exists but not distinctive |
| **Protected Layout** | Simple nav + footer | Supabase starter kit branding |
| **Providers** | HeroUI + React Query + ThemeProvider | Good foundation, needs refinement |
| **Components** | shadcn/ui basics installed | Need design system customization |


### Problems to Solve

1. **Generic Typography**: Geist is safe but unremarkable
2. **Boilerplate Branding**: "Next.js Supabase Starter" text remains
3. **No Dashboard Shell**: Missing sidebar, header, content area structure
4. **Disconnected Tokens**: CSS variables don't fully align with design system
5. **Light Theme Default**: Design system specifies dark-first

---

## Proposed Architecture

### 1. Typography System

**Aesthetic Direction**: Industrial Precision with Warmth

Replace Geist with a distinctive pairing that signals "professional operations control room":

| Role | Font | Fallback | Rationale |
|------|------|----------|-----------|
| **Display/Headers** | **JetBrains Mono** | `ui-monospace, monospace` | Tech precision, excellent for numbers and IDs |
| **Body/UI** | **DM Sans** | `system-ui, sans-serif` | Modern, geometric sans with character |
| **Data/Tables** | **JetBrains Mono** | `ui-monospace, monospace` | Tabular figures, alignment |

**Why This Pairing**:
- JetBrains Mono has distinctive ligatures and excellent number rendering (critical for financial data)
- DM Sans is geometric but warmer than Geist, with distinctive lowercase `a` and `g`
- Both are Google Fonts with excellent variable font support

#### Font Loading Strategy (Next.js 16)

**Decision**: Use `next/font/google` (NOT `@fontsource`)

Per Next.js 16 official documentation, `next/font` provides:
- **Self-hosting**: Fonts are downloaded at build time and served from the same domain (no external network requests)
- **Zero layout shift**: Automatic `size-adjust` and fallback font configuration eliminates CLS
- **Privacy**: No requests sent to Google at runtime
- **Performance**: Optimal preloading with `<link rel="preload">` automatically injected

**Implementation**:

```tsx
// app/layout.tsx
import { JetBrains_Mono, DM_Sans } from 'next/font/google'

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} ${dmSans.variable} antialiased`}>
      <body>{children}</body>
    </html>
  )
}
```

**Tailwind v4 Integration** (globals.css):

```css
@import 'tailwindcss';

@theme inline {
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
}
```

This maps the CSS variables from `next/font` to Tailwind's default font family utilities (`font-sans`, `font-mono`).

### 2. Color Token Alignment

Align `globals.css` with the design system's **Cyan/Teal accent** (casino tech aesthetic):

```css
/* Proposed dark theme tokens */
:root.dark {
  /* Backgrounds - Near-black slate */
  --background: 222 47% 6%;        /* #020617 - Slate 950 */
  --background-subtle: 222 47% 8%; /* #030712 */
  --background-raised: 217 33% 10%; /* #0B1120 */

  /* Foreground - Off-white */
  --foreground: 210 40% 98%;       /* #F8FAFC - Slate 50 */
  --foreground-muted: 215 14% 65%; /* #9CA3AF */

  /* Accent - Cyan 400/500 */
  --accent: 189 94% 43%;           /* #06B6D4 */
  --accent-hover: 186 94% 49%;     /* #22D3EE */
  --accent-subtle: 187 92% 35%;    /* #0E7490 */

  /* Status Colors */
  --success: 142 76% 36%;          /* #22C55E */
  --warning: 45 93% 47%;           /* #FACC15 */
  --danger: 0 84% 60%;             /* #EF4444 */
}
```

### 3. Root Layout Structure

Transform from flat page to professional dashboard shell:

```
┌─────────────────────────────────────────────────────────────────┐
│  ROOT LAYOUT (app/layout.tsx)                                   │
│  - HTML setup, fonts, providers                                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  PUBLIC ROUTES (app/(public)/layout.tsx)                   │ │
│  │  - Landing page                                            │ │
│  │  - Auth flows                                              │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  DASHBOARD SHELL (app/(dashboard)/layout.tsx)              │ │
│  │  ┌──────┬────────────────────────────────────────────────┐ │ │
│  │  │ SIDE │  HEADER                                        │ │ │
│  │  │ BAR  ├────────────────────────────────────────────────┤ │ │
│  │  │      │  CONTENT AREA                                  │ │ │
│  │  │  64  │                                                │ │ │
│  │  │  px  │  - Page-specific content                       │ │ │
│  │  │      │  - Scrollable                                  │ │ │
│  │  │      │  - Responsive                                  │ │ │
│  │  │      │                                                │ │ │
│  │  └──────┴────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 4. File Structure

> **Note**: For complete route structure and page-to-service mappings, see **`UI-SITEMAP.md`**.

```
app/
├── layout.tsx                    # Root: fonts, providers, globals
├── globals.css                   # Design tokens, base styles
├── (public)/
│   ├── layout.tsx               # Public page layout (minimal)
│   ├── page.tsx                 # Landing page
│   └── auth/                    # Auth flows (login, sign-up, etc.)
└── (dashboard)/
    ├── layout.tsx               # Dashboard shell (sidebar + header)
    ├── page.tsx                 # Dashboard home (redirects to /pit)
    ├── pit/                     # Pit Operations (Primary)
    │   ├── page.tsx             # Pit Dashboard (PRD-006)
    │   └── tables/
    │       └── [tableId]/
    │           └── page.tsx     # Table detail view
    ├── players/                 # Player Management
    │   ├── page.tsx             # Player list/search
    │   └── [playerId]/
    │       └── page.tsx         # Player detail + visits + slips
    ├── visits/                  # Visit Management (Phase 2+)
    │   ├── page.tsx             # Active visits list
    │   └── [visitId]/
    │       └── page.tsx         # Visit detail with rating slips
    ├── loyalty/                 # Loyalty & Rewards (Phase 3)
    │   └── page.tsx             # Loyalty dashboard
    ├── compliance/              # MTL Compliance (Phase 3)
    │   └── page.tsx             # MTL entries, threshold alerts
    └── settings/                # Casino Settings
        ├── page.tsx             # Settings hub
        ├── casino/
        │   └── page.tsx         # Casino configuration
        ├── staff/
        │   └── page.tsx         # Staff management
        └── tables/
            └── page.tsx         # Table configuration

components/
├── ui/
│   └── sidebar.tsx              # shadcn/ui sidebar (installed via CLI)
├── layout/
│   ├── app-sidebar.tsx          # PT-2 sidebar configuration
│   ├── nav-main.tsx             # Main navigation items
│   ├── nav-user.tsx             # User menu in sidebar footer
│   ├── header.tsx               # Top header bar
│   └── bottom-nav.tsx           # Mobile bottom navigation
└── shared/
    ├── logo.tsx                 # PT-2 branding
    └── gaming-day-indicator.tsx # Gaming day context (TEMP-001)
```

---

## Implementation Components

### 4.1 Dashboard Layout (using shadcn/ui Sidebar)

**Install**: `npx shadcn@latest add sidebar`

The dashboard layout uses the shadcn/ui `SidebarProvider` and `SidebarInset` pattern for a professional, accessible layout:

```tsx
// app/(dashboard)/layout.tsx
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Header } from '@/components/layout/header'
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
```

### 4.2 Application Sidebar (shadcn/ui)

**Pattern**: `sidebar-07` - Collapsible to icons

The sidebar uses `collapsible="icon"` to collapse to a narrow icon-only rail, providing maximum content space while keeping navigation accessible.

```tsx
// components/layout/app-sidebar.tsx
'use client'

import * as React from 'react'
import {
  LayoutDashboard,
  Table2,
  Users,
  Gift,
  Shield,
  Settings,
} from 'lucide-react'

import { NavMain } from '@/components/layout/nav-main'
import { NavUser } from '@/components/layout/nav-user'
import { Logo } from '@/components/shared/logo'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'

// Navigation data - aligned with UI-SITEMAP.md
const navItems = [
  {
    title: 'Pit',
    url: '/pit',
    icon: Table2,
    isActive: true,
    phase: 2,
  },
  {
    title: 'Players',
    url: '/players',
    icon: Users,
    phase: 1,
  },
  {
    title: 'Loyalty',
    url: '/loyalty',
    icon: Gift,
    phase: 3,
    featureFlag: 'FEATURE_LOYALTY_UI',
  },
  {
    title: 'Compliance',
    url: '/compliance',
    icon: Shield,
    phase: 3,
    featureFlag: 'FEATURE_MTL_UI',
  },
  {
    title: 'Settings',
    url: '/settings',
    icon: Settings,
    phase: 1,
  },
]

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
  )
}
```

### 4.3 Navigation Main Component

```tsx
// components/layout/nav-main.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type LucideIcon } from 'lucide-react'

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

interface NavItem {
  title: string
  url: string
  icon: LucideIcon
  isActive?: boolean
  phase?: number
  featureFlag?: string
}

export function NavMain({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Navigation</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const isActive = pathname === item.url || pathname.startsWith(`${item.url}/`)

          return (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                tooltip={item.title}
                isActive={isActive}
              >
                <Link href={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
```

### 4.4 User Navigation Component

```tsx
// components/layout/nav-user.tsx
'use client'

import {
  BadgeCheck,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react'

import {
  Avatar,
  AvatarFallback,
} from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

export function NavUser() {
  const { isMobile } = useSidebar()
  // TODO: Get user from auth context
  const user = { name: 'Pit Boss', email: 'pitboss@casino.com', role: 'pit_boss' }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg">
                  {user.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.role}</span>
              </div>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">
                    {user.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <BadgeCheck className="mr-2 h-4 w-4" />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Sun className="mr-2 h-4 w-4" />
                Toggle Theme
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
```

### 4.5 Navigation Items (PT-2 Specific)

| Icon | Text | Route | Active Pattern | Phase | Notes |
|------|------|-------|----------------|-------|-------|
| `Table2` | Pit | `/pit` | startsWith | 2 | Primary - PRD-006 |
| `Users` | Players | `/players` | startsWith | 1 | PlayerService |
| `Gift` | Loyalty | `/loyalty` | startsWith | 3 | Feature-flagged |
| `Shield` | Compliance | `/compliance` | startsWith | 3 | Feature-flagged |
| `Settings` | Settings | `/settings` | exact | 1 | CasinoService |

### 4.6 Design System Token Alignment

The shadcn/ui sidebar uses CSS custom properties that align with our design system:

| shadcn Token | PT-2 Value | Notes |
|--------------|------------|-------|
| `--sidebar-background` | `hsl(222 47% 6%)` | Slate 950 |
| `--sidebar-foreground` | `hsl(210 40% 98%)` | Slate 50 |
| `--sidebar-primary` | `hsl(189 94% 43%)` | Cyan 500 accent |
| `--sidebar-accent` | `hsl(189 94% 43% / 0.1)` | Accent at 10% opacity |
| `--sidebar-border` | `hsl(217 33% 17%)` | Subtle border |

Add to `globals.css`:

```css
@layer base {
  :root {
    --sidebar-background: 222 47% 6%;
    --sidebar-foreground: 210 40% 98%;
    --sidebar-primary: 189 94% 43%;
    --sidebar-primary-foreground: 210 40% 98%;
    --sidebar-accent: 189 94% 43%;
    --sidebar-accent-foreground: 210 40% 98%;
    --sidebar-border: 217 33% 17%;
    --sidebar-ring: 189 94% 43%;
  }
}
```

### 4.7 Header Bar

Fixed header containing:
- Breadcrumb navigation
- Gaming day indicator (TEMP-001 compliant)
- Global search (optional, Phase 2+)
- Notifications bell
- User menu (profile, logout, theme toggle)

---

## shadcn/ui Components Required

Install these via CLI:

```bash
# Sidebar (includes dependencies)
npx shadcn@latest add sidebar

# Core UI
npx shadcn@latest add button card dialog dropdown-menu input label select skeleton table badge alert

# Layout
npx shadcn@latest add separator scroll-area tooltip avatar breadcrumb

# Navigation
npx shadcn@latest add tabs
```

**Sidebar Dependencies** (installed automatically with `sidebar`):
- `@radix-ui/react-slot`
- `class-variance-authority`
- `lucide-react`

---

## Motion & Interaction Guidelines

Per design system, motion should be:
- **Subtle**: 150-200ms transitions
- **Purposeful**: Confirm actions, guide attention
- **Calm**: No continuous animations in operational views

### Sidebar Animation

The shadcn/ui sidebar handles animations internally via CSS transitions. Key behaviors:

- **Expand/collapse**: `transition: width 200ms ease-linear` (built-in)
- **Icon mode**: Collapses to `--sidebar-width-icon: 48px`
- **Full mode**: Expands to `--sidebar-width: 256px`
- **Rail hover**: Shows full sidebar on rail hover (configurable)

Custom animation overrides can be applied via CSS custom properties:

```css
:root {
  --sidebar-width: 256px;
  --sidebar-width-icon: 48px;
}
```

---

## Accessibility Requirements

Per design system and WCAG AA:

| Requirement | Target | How |
|-------------|--------|-----|
| Contrast ratio | ≥ 4.5:1 (text) | Validate all token combinations |
| Hit areas | ≥ 44px | Sidebar nav items, buttons |
| Keyboard nav | Full | Focus rings, skip links |
| Screen readers | ARIA labels | Semantic HTML, landmarks |

---

## Implementation Phases

### Phase 1: Foundation (This Proposition)

1. **Typography Setup**
   - Configure JetBrains Mono + DM Sans in root layout
   - Define `--font-mono` and `--font-sans` variables
   - Update `globals.css` with font-family tokens

2. **Token Alignment**
   - Update dark theme tokens per design system
   - Add `--background-raised`, `--accent-subtle` tokens
   - Define status color tokens

3. **Route Group Structure**
   - Create `(public)` and `(dashboard)` route groups
   - Move auth routes under `(public)`
   - Set up dashboard layout skeleton

4. **shadcn/ui Sidebar Installation**
   - Install sidebar component: `npx shadcn@latest add sidebar`
   - Create `app-sidebar.tsx` with PT-2 navigation items
   - Create `nav-main.tsx` with active state detection
   - Create `nav-user.tsx` with user dropdown menu
   - Apply design system tokens (sidebar CSS variables)

5. **Dashboard Layout**
   - Create `(dashboard)/layout.tsx` with `SidebarProvider`
   - Implement header with `SidebarTrigger` and breadcrumbs
   - Configure `SidebarInset` for content area

### Phase 2: Polish (Post PRD-006)

- Mobile bottom navigation (fixed to viewport bottom)
- Breadcrumb navigation component
- Gaming day indicator component (TEMP-001)
- User navigation dropdown with theme toggle
- Keyboard shortcuts (expand/collapse sidebar)

### Phase 3: Enhancements

- Global search (Cmd+K)
- Notification system
- Real-time status indicators in sidebar
- Analytics nav item (feature-flagged)

---

## Dependencies

| Dependency | Purpose | Action |
|------------|---------|--------|
| `next/font/google` | Typography (JetBrains Mono, DM Sans) | Built-in to Next.js 16 |
| shadcn/ui `sidebar` | Navigation sidebar with collapse | Install via CLI |
| shadcn/ui `avatar` | User avatar in nav | Install via CLI |
| shadcn/ui `dropdown-menu` | User menu dropdown | Install via CLI |
| shadcn/ui `breadcrumb` | Header breadcrumbs | Install via CLI |
| shadcn/ui `tooltip` | Collapsed sidebar hints | Included with sidebar |

> **Note**: No external font packages required. `next/font/google` self-hosts fonts at build time.
> **Note**: shadcn/ui sidebar manages its own state via React context (`SidebarProvider`). No Zustand store needed for sidebar state.

---

## Validation Checklist

Before merging:

- [ ] Dark theme is default (system preference respected)
- [ ] Typography renders correctly (fonts load)
- [ ] Color contrast passes WCAG AA
- [ ] shadcn/ui sidebar expands/collapses correctly via `SidebarTrigger`
- [ ] Sidebar collapses to icon-only mode (`collapsible="icon"`)
- [ ] Sidebar state persists across page refreshes (cookie-based, built-in)
- [ ] Collapsed sidebar shows tooltips on hover (`tooltip` prop on `SidebarMenuButton`)
- [ ] Active nav item highlighted via `isActive` prop
- [ ] `SidebarRail` allows hover-to-expand when collapsed
- [ ] Header renders with `SidebarTrigger` and breadcrumbs
- [ ] `SidebarInset` content area scrolls independently
- [ ] No console errors
- [ ] Mobile viewport: sidebar becomes off-canvas sheet (built-in responsive)
- [ ] Existing pages still render under new route groups

---

## Resolved Questions

1. **Multi-Casino Support**: ~~Should sidebar show casino switcher, or is this header-level?~~
   - **RESOLVED**: Deferred. Out of scope for single-casino pilot per MVP-ROADMAP.md. Multi-casino support to be addressed in future phases.

2. **Mobile Navigation**: ~~Sheet sidebar vs bottom nav for mobile pit use?~~
   - **RESOLVED**: Use **bottom navigation** for mobile. Better suited for pit floor use where quick access to primary actions (Pit, Players, Settings) is critical. Bottom nav provides thumb-friendly access on handheld devices.

3. **Font Loading Strategy**: ~~next/font vs @fontsource for optimal LCP?~~
   - **RESOLVED**: Use **`next/font/google`** per Next.js 16 official documentation. Provides self-hosting at build time, zero CLS via automatic fallback configuration, no runtime requests to Google, and optimal preloading. See Section 1 "Font Loading Strategy" for implementation details.

---

## References

- **`docs/ui-design/UI-SITEMAP.md`** - Route structure, page-to-service mappings (companion doc)
- `docs/ui-design/pt2-ui-design-system-prototype-style-guide.md` - Design system
- `docs/20-architecture/MVP-ROADMAP.md` - PRD-006 Pit Dashboard context
- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` - Bounded context ownership
- `docs/70-governance/FRONT_END_CANONICAL_STANDARD.md` - Technical standards
- `.claude/skills/frontend-design/references/QUICK_START.md` - Implementation patterns
- [shadcn/ui Sidebar Documentation](https://ui.shadcn.com/docs/components/sidebar) - Official component docs
- [sidebar-07 Block](https://ui.shadcn.com/blocks#sidebar-07) - Icon-collapse pattern reference

---

## Approval

| Role | Name | Status |
|------|------|--------|
| Lead Architect | - | Pending |
| Product Owner | - | Pending |
| Frontend Lead | - | Pending |

---

*Document generated by Frontend Design Skill*
