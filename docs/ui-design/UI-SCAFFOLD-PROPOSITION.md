# UI Scaffold Proposition: PT-2 Root Layout System

**ID**: UI-SCAFFOLD-001
**Version**: 1.1.0
**Status**: DRAFT
**Created**: 2025-12-08
**Updated**: 2025-12-08
**Owner**: Frontend Design Skill

---

## Executive Summary

This proposition establishes the foundational UI scaffold for PT-2, aligning with the **Monochrome + One Accent** design system defined in `pt2-ui-design-system-prototype-style-guide.md`. The current implementation uses generic Geist fonts and boilerplate layouts. This proposal transforms PT-2 into a distinctive, professional casino pit management interface.

**Key Decision**: Adopt the proven `RetractableSidebar` pattern from PT-1 (`reference-pt-1/components/features/retractable-sidebar.tsx`) with design system alignment.

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
| **PT-1 Reference** | `RetractableSidebar` + `ui-store` | Proven pattern to migrate |

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

```
app/
├── layout.tsx                    # Root: fonts, providers, globals
├── globals.css                   # Design tokens, base styles
├── (public)/
│   ├── layout.tsx               # Public page layout (minimal)
│   ├── page.tsx                 # Landing page
│   └── auth/                    # Auth flows
└── (dashboard)/
    ├── layout.tsx               # Dashboard shell (sidebar + header)
    ├── page.tsx                 # Dashboard home (redirect to pit)
    ├── pit/
    │   ├── page.tsx             # Pit Dashboard (PRD-006)
    │   └── [tableId]/page.tsx   # Table detail
    ├── players/
    │   ├── page.tsx             # Player list
    │   └── [playerId]/page.tsx  # Player detail
    └── settings/
        └── page.tsx             # Casino settings

components/
├── ui/                          # shadcn/ui (existing)
├── layout/
│   ├── dashboard-shell.tsx      # Main layout wrapper
│   ├── retractable-sidebar.tsx  # Navigation sidebar (migrated from PT-1)
│   ├── header.tsx               # Top header bar
│   └── mobile-nav.tsx           # Responsive navigation (Phase 2)
└── shared/
    ├── logo.tsx                 # PT-2 branding
    ├── user-nav.tsx             # User dropdown
    └── gaming-day-indicator.tsx # Gaming day context (TEMP-001)

store/
└── ui-store.ts                  # UI state (sidebar, modals) - migrated from PT-1
```

---

## Implementation Components

### 4.1 Dashboard Shell Component

```tsx
// components/layout/dashboard-shell.tsx
interface DashboardShellProps {
  children: React.ReactNode
}

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <RetractableSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
```

### 4.2 Retractable Sidebar (Migrated from PT-1)

**Source**: `reference-pt-1/components/features/retractable-sidebar.tsx`

The PT-1 sidebar provides a production-tested pattern with:

#### Architecture Pattern

```tsx
// components/layout/retractable-sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, ReactNode, use } from 'react'
import {
  ChevronFirst, ChevronLast, LayoutDashboard, Table,
  UserCog, Settings, HelpCircle, MoreVertical
} from 'lucide-react'
import { useUIStore } from '@/store/ui-store'

interface SidebarContextType {
  expanded: boolean
}

const SidebarContext = createContext<SidebarContextType>({ expanded: true })

export function RetractableSidebar() {
  const isExpanded = useUIStore((state) => state.sidebar.isRetractableExpanded)
  const toggleSidebar = useUIStore((state) => state.toggleRetractableSidebar)
  const pathname = usePathname()

  return (
    <aside className="h-dvh sticky top-0">
      <nav className="h-full flex flex-col bg-background border-r border-border shadow-xs">
        {/* Toggle button */}
        <div className="p-4 pb-2 flex justify-between items-center">
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80
                       text-secondary-foreground transition-colors"
          >
            {isExpanded ? <ChevronFirst /> : <ChevronLast />}
          </button>
        </div>

        {/* Navigation items */}
        <SidebarContext value={{ expanded: isExpanded }}>
          <ul className="flex-1 px-3">
            <SidebarItem icon={<LayoutDashboard size={20} />} text="Dashboard" href="/dashboard" />
            <SidebarItem icon={<Table size={20} />} text="Pit" href="/pit" />
            <SidebarItem icon={<UserCog size={20} />} text="Players" href="/players" />
            <SidebarItem icon={<Settings size={20} />} text="Settings" href="/settings" />
            <SidebarItem icon={<HelpCircle size={20} />} text="Help" href="/help" />
          </ul>
        </SidebarContext>

        {/* Footer */}
        <div className="border-t border-border flex p-3">
          {/* User info or additional controls */}
        </div>
      </nav>
    </aside>
  )
}
```

#### SidebarItem Component (Design System Aligned)

```tsx
interface SidebarItemProps {
  icon: ReactNode
  text: string
  href: string
  alert?: boolean
}

function SidebarItem({ icon, text, href, alert }: SidebarItemProps) {
  const { expanded } = use(SidebarContext)
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link href={href}>
      <li className={`
        relative flex items-center py-2 px-3 my-1
        font-medium rounded-md cursor-pointer
        transition-colors group
        ${active
          ? 'bg-accent/10 text-accent'           /* Accent for active state */
          : 'hover:bg-muted text-muted-foreground hover:text-foreground'
        }
      `}>
        {icon}
        <span className={`
          overflow-hidden transition-all duration-200
          ${expanded ? 'w-52 ml-3' : 'w-0'}
        `}>
          {text}
        </span>

        {/* Alert indicator */}
        {alert && (
          <div className={`
            absolute right-2 w-2 h-2 rounded-full bg-accent
            ${expanded ? '' : 'top-2'}
          `} />
        )}

        {/* Tooltip when collapsed */}
        {!expanded && (
          <div className={`
            absolute left-full rounded-md px-2 py-1 ml-6
            bg-popover text-popover-foreground text-sm border border-border shadow-md
            invisible opacity-0 -translate-x-3 transition-all duration-150
            group-hover:visible group-hover:opacity-100 group-hover:translate-x-0
            z-50
          `}>
            {text}
          </div>
        )}
      </li>
    </Link>
  )
}
```

#### Design System Alignment Changes

| PT-1 Original | Design System Aligned | Rationale |
|---------------|----------------------|-----------|
| `bg-primary/10 text-primary` | `bg-accent/10 text-accent` | Cyan accent per 60-30-10 rule |
| `shadow-sm` | `shadow-xs` | Tailwind v4 scale |
| `hover:bg-accent` | `hover:bg-muted` | Reserve accent for primary actions |
| Hardcoded routes | PT-2 route structure | Dashboard, Pit, Players, Settings |

#### UI Store Integration

Migrate the sidebar state management from PT-1's `ui-store.ts`:

```typescript
// store/ui-store.ts (simplified for sidebar)
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SidebarState {
  isRetractableExpanded: boolean
  toggleRetractableSidebar: () => void
  setRetractableSidebarExpanded: (expanded: boolean) => void
}

export const useUIStore = create<SidebarState>()(
  persist(
    (set) => ({
      isRetractableExpanded: true,
      toggleRetractableSidebar: () =>
        set((state) => ({ isRetractableExpanded: !state.isRetractableExpanded })),
      setRetractableSidebarExpanded: (expanded) =>
        set({ isRetractableExpanded: expanded }),
    }),
    {
      name: 'pt2-ui-storage',
      partialize: (state) => ({ isRetractableExpanded: state.isRetractableExpanded }),
    }
  )
)
```

#### Navigation Items (PT-2 Specific)

| Icon | Text | Route | Active Pattern | Phase |
|------|------|-------|----------------|-------|
| `LayoutDashboard` | Dashboard | `/dashboard` | exact | 1 |
| `Table` | Pit | `/pit` | startsWith | 1 (PRD-006) |
| `UserCog` | Players | `/players` | startsWith | 1 |
| `Settings` | Settings | `/settings` | exact | 1 |
| `HelpCircle` | Help | `/help` | exact | 2 |
| `BarChart3` | Analytics | `/analytics` | startsWith | 3 |

### 4.3 Header Bar

Fixed header containing:
- Breadcrumb navigation
- Gaming day indicator (TEMP-001 compliant)
- Global search (optional, Phase 2+)
- Notifications bell
- User menu (profile, logout, theme toggle)

---

## shadcn/ui Components Required

Install these via MCP or CLI:

```bash
# Core UI
npx shadcn@latest add button card dialog dropdown-menu input label select skeleton table badge alert

# Layout
npx shadcn@latest add separator scroll-area sheet tooltip

# Navigation (from extended registries if needed)
npx shadcn@latest add navigation-menu tabs
```

---

## Motion & Interaction Guidelines

Per design system, motion should be:
- **Subtle**: 150-200ms transitions
- **Purposeful**: Confirm actions, guide attention
- **Calm**: No continuous animations in operational views

### Sidebar Animation

```css
/* Sidebar expand/collapse */
.sidebar-collapsed { width: 64px; }
.sidebar-expanded { width: 240px; }
.sidebar-transition { transition: width 200ms ease-out; }

/* Nav item hover */
.nav-item:hover {
  background-color: hsl(var(--accent) / 0.1);
  transition: background-color 150ms ease-out;
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

4. **Retractable Sidebar Migration**
   - Migrate `RetractableSidebar` from PT-1
   - Apply design system token alignment (accent colors, shadows)
   - Create simplified `ui-store.ts` with Zustand persist
   - Configure PT-2 navigation routes

5. **Dashboard Shell**
   - Implement `DashboardShell` wrapper component
   - Implement header with placeholder slots
   - Create content area with proper scrolling

### Phase 2: Polish (Post PRD-006)

- Mobile responsive navigation (sheet-based)
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
| `@fontsource/jetbrains-mono` | Display font | Install |
| `@fontsource/dm-sans` | Body font | Install |
| `zustand` | UI state (sidebar) | Already installed |
| shadcn/ui `sheet` | Mobile nav | Install via MCP |
| shadcn/ui `scroll-area` | Content scroll | Install via MCP |
| shadcn/ui `tooltip` | Collapsed sidebar hints | Install via MCP |

---

## Validation Checklist

Before merging:

- [ ] Dark theme is default (system preference respected)
- [ ] Typography renders correctly (fonts load)
- [ ] Color contrast passes WCAG AA
- [ ] Retractable sidebar expands/collapses correctly
- [ ] Sidebar state persists across page refreshes (localStorage)
- [ ] Collapsed sidebar shows tooltips on hover
- [ ] Active nav item uses accent color (`bg-accent/10 text-accent`)
- [ ] Header renders with placeholder slots
- [ ] Content area scrolls independently
- [ ] No console errors
- [ ] Mobile viewport tested (sidebar hidden or sheet-based)
- [ ] Existing pages still render under new route groups

---

## Open Questions

1. **Multi-Casino Support**: Should sidebar show casino switcher, or is this header-level?
2. **Mobile Navigation**: Sheet sidebar vs bottom nav for mobile pit use?
3. **Font Loading Strategy**: next/font vs @fontsource for optimal LCP?

---

## References

- `docs/ui-design/pt2-ui-design-system-prototype-style-guide.md` - Design system
- `docs/20-architecture/MVP-ROADMAP.md` - PRD-006 Pit Dashboard context
- `docs/70-governance/FRONT_END_CANONICAL_STANDARD.md` - Technical standards
- `.claude/skills/frontend-design/references/QUICK_START.md` - Implementation patterns
- `reference-pt-1/components/features/retractable-sidebar.tsx` - Sidebar source
- `reference-pt-1/store/ui-store.ts` - UI store pattern source

---

## Approval

| Role | Name | Status |
|------|------|--------|
| Lead Architect | - | Pending |
| Product Owner | - | Pending |
| Frontend Lead | - | Pending |

---

*Document generated by Frontend Design Skill*
