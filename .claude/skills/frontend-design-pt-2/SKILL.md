---
name: frontend-design-pt-2
description: Create distinctive, production-grade frontend interfaces with high design quality for PT-2 architecture. Use this skill when building web components, pages, or applications that require React 19, Next.js 16 App Router, Tailwind v4, or shadcn/ui. NOT for backend services, API routes, database migrations, or RLS policies.
license: Complete terms in LICENSE.txt
---

## Quick Start

**START HERE**: Read `references/QUICK_START.md` for implementation workflow and code templates.

### Pre-flight Check (Optional)

```bash
python .claude/skills/frontend-design-pt-2/scripts/check_primitive_freshness.py
```

---

## Overview

This skill guides creation of distinctive, production-grade frontend interfaces for PT-2 that avoid generic "AI slop" aesthetics while adhering to PT-2's technical architecture.

**Input**: Frontend requirements — a component, page, application, or interface to build, with context about purpose, audience, or constraints.

**Output**: Production-grade, visually striking code following PT-2 patterns.

---

## Reference Guide

Read these files **when needed** based on your task:

| When You Need | Read This |
|---------------|-----------|
| **Surface Classification (ADR-041) — new pages/surfaces** | `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md` |
| **Metric Provenance Matrix — truth class + freshness** | `docs/70-governance/METRIC_PROVENANCE_MATRIX.md` |
| **Shift Dashboards UI (cash obs telemetry)** | `references/shift-dashboards-context.md` |
| Implementation workflow, code templates | `references/QUICK_START.md` |
| **React 19 anti-patterns to AVOID** | `references/frontend-rules.md` → React 19 Anti-Patterns |
| React 19 hooks (`useTransition`, `useActionState`, `useOptimistic`) | `references/frontend-rules.md` → React 19 Hooks |
| State management (TanStack Query, Zustand) | `references/ADR-003-state-management-strategy.md` |
| Tailwind v4, shadcn setup, React 19 specifics | `references/pt2-technical-standards.md` |
| Service layer integration patterns | `references/pt2-architecture-integration.md` |
| Condensed technical rules checklist | `references/frontend-rules.md` |
| UI/UX design system and style guide | `references/pt2-ui-design-system-prototype-style-guide.md` |
| **Layout strategy, panels, modals, click-reduction** | `references/pt2-layout-strategy.md` |
| Session memory and pattern tracking | `references/memori-integration.md` |
| Context threshold and checkpoint management | `references/context-management.md` |

---

## PT-2 Visual DNA — Established Design Language

**This section is the primary visual reference.** PT-2 has an evolved brutalist-industrial aesthetic. Every new component MUST match these patterns — they are not suggestions, they are the established visual identity.

### Theme Tokens (from `app/globals.css`)

PT-2 uses a warm industrial light theme + zinc-based dark theme with a single teal/cyan accent:
- **Light**: Warm off-white background (`hsl(40 33% 98%)`), deep brown foreground (`hsl(24 10% 10%)`)
- **Dark**: Zinc 900 background (`hsl(240 5.9% 10%)`), Slate 50 foreground (`hsl(210 40% 98%)`)
- **Accent**: Deep teal (`hsl(189 94% 37%)` light / `hsl(189 94% 43%)` dark) — the ONLY accent color
- **60-30-10 rule**: 60% dark neutrals, 30% secondary neutrals, 10% teal accent

Use CSS variable classes (`bg-card`, `text-foreground`, `border-border`, `text-accent`, `bg-accent/5`) — NEVER hardcode hex values.

### Brutalist Typography Pattern (MANDATORY)

All section headers, stat labels, and panel titles use this pattern:

```tsx
// Section header — monospace, uppercase, tracking-widest, bold
<CardTitle
  className="text-sm font-bold uppercase tracking-widest"
  style={{ fontFamily: 'monospace' }}
>
  Active Slips ({count})
</CardTitle>

// Stat label — same pattern, muted color
<div
  className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
  style={{ fontFamily: 'monospace' }}
>
  Gaming Day
</div>

// Stat value — large monospace number
<div
  className="text-3xl sm:text-4xl font-bold tabular-nums text-foreground"
  style={{ fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}
>
  {value}
</div>
```

### Card & Panel Structure (MANDATORY)

Use the `Card` component with `border-2` (thick brutalist border). Never use raw divs for panel sections:

```tsx
// Standard panel — thick border, Card component, slot structure
<Card className="border-2 border-border/50">
  <CardHeader className="pb-3">
    <CardTitle
      className="text-sm font-bold uppercase tracking-widest"
      style={{ fontFamily: 'monospace' }}
    >
      Section Title
    </CardTitle>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>

// Accent variant — for primary/highlighted sections
<Card className="border-2 border-accent/50 bg-accent/5 hover:border-accent/70">
  ...
</Card>

// Empty state — dashed border
<Card className="border-2 border-dashed border-border/50 bg-muted/20">
  <CardContent className="flex flex-col items-center justify-center py-12">
    <div
      className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
      style={{ fontFamily: 'monospace' }}
    >
      Select a Table
    </div>
  </CardContent>
</Card>

// Error state
<Card className="border-2 border-destructive/50 bg-destructive/5">
  <CardContent className="flex items-center gap-3 py-6">
    <AlertCircle className="h-5 w-5 text-destructive" />
    <div
      className="text-xs font-bold uppercase tracking-widest text-destructive"
      style={{ fontFamily: 'monospace' }}
    >
      Error Loading Data
    </div>
  </CardContent>
</Card>
```

### Status Row Pattern

List items within panels follow the SlipCard pattern — thick border, state-dependent colors, status dot:

```tsx
// Active item row — accent border, status glow
<div className="group relative rounded-lg border-2 p-3 transition-all border-accent/30 bg-accent/5 hover:border-accent/50">
  {/* Status dot — top right with glow */}
  <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
  ...
</div>

// Warning item — yellow border
<div className="group relative rounded-lg border-2 p-3 transition-all border-yellow-500/50 bg-yellow-500/5">
  <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
  ...
</div>

// Neutral item — standard border
<div className="group relative rounded-lg border-2 p-3 transition-all border-border/30 bg-card/30 hover:border-accent/30">
  ...
</div>
```

### Button & Action Patterns

```tsx
// Action button — uppercase tracking, small, monospace feel
<Button
  variant="outline"
  size="sm"
  className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider"
>
  <Plus className="h-3 w-3" />
  New Slip
</Button>

// Destructive action
<Button
  variant="outline"
  size="sm"
  className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider text-destructive hover:text-destructive"
>
  <X className="h-3 w-3" />
  Close
</Button>
```

### Loading Skeleton Pattern

Skeletons match the component they replace, using `animate-pulse`:

```tsx
// Panel loading skeleton
<Card className="border-2 border-border/50">
  <CardHeader className="pb-3">
    <CardTitle
      className="text-sm font-bold uppercase tracking-widest"
      style={{ fontFamily: 'monospace' }}
    >
      Section Title
    </CardTitle>
  </CardHeader>
  <CardContent>
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/50" />
      ))}
    </div>
  </CardContent>
</Card>
```

### Badge Pattern

```tsx
// Severity badges — 10% background, matching text, 30% border
<Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">Blocked</Badge>
<Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30">Alert</Badge>
<Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">Monitor</Badge>
<Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">Active</Badge>

// Accent highlight badge
<div className="rounded-md border-2 border-accent/50 bg-accent/10 px-3 py-1 text-base font-bold text-accent"
  style={{ fontFamily: 'monospace' }}>
  {gamingDay}
</div>

// Inline status tag — paused state
<span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-yellow-600 dark:text-yellow-400">
  Paused
</span>
```

### Form & Dialog Pattern (MANDATORY)

All dialogs and forms follow a codified structure. This is the highest-regression surface in the codebase — dialogs live in per-domain directories so Mode A ("read adjacent components") does not naturally apply. Follow these patterns explicitly.

**Exemplar:** `components/admin/loyalty/promo-programs/create-program-dialog.tsx`

#### Dialog Title

```tsx
<DialogTitle
  className="text-sm font-bold uppercase tracking-widest"
  style={{ fontFamily: 'monospace' }}
>
  Create Promo Program
</DialogTitle>
<DialogDescription className="text-sm">
  Describe the dialog's purpose in one sentence.
</DialogDescription>
```

#### Section Headers (within forms)

Group related fields under section headers separated by `<Separator />`. Use a reusable `SectionHeader` component:

```tsx
function SectionHeader({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-accent" />
      <h4
        className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
        style={{ fontFamily: 'monospace' }}
      >
        {label}
      </h4>
    </div>
  );
}

// Usage — each logical group gets an icon + label
<SectionHeader icon={Tag} label="Program Identity" />
<SectionHeader icon={DollarSign} label="Financials" />
<SectionHeader icon={CalendarDays} label="Schedule" />
```

#### Form Structure & Spacing

```tsx
// Form-level: space-y-5 between section groups
<form onSubmit={handleSubmit} className="space-y-5">
  {/* ── Section 1 ── */}
  <div className="space-y-3">
    <SectionHeader icon={Tag} label="Identity" />
    {/* Fields within section: space-y-1.5 */}
    <div className="space-y-1.5">
      <Label className="text-sm text-muted-foreground">Name</Label>
      <Input className="font-mono" />
    </div>
  </div>

  <Separator />

  {/* ── Section 2 ── */}
  <div className="space-y-3">
    <SectionHeader icon={DollarSign} label="Financials" />
    <div className="grid grid-cols-2 gap-4">
      {/* grid for side-by-side fields */}
    </div>
  </div>
</form>
```

#### Labels

```tsx
// Standard label — muted text, text-sm
<Label htmlFor="field-id" className="text-sm text-muted-foreground">
  Field Name
</Label>

// Label with optional hint
<Label htmlFor="field-id" className="text-sm text-muted-foreground">
  End Date
  <span className="ml-1 text-xs text-muted-foreground/50">optional</span>
</Label>
```

#### Inputs, Selects, Textareas

```tsx
// Text input — font-mono
<Input id="name" className="font-mono" />

// Number/date input — font-mono tabular-nums
<Input id="amount" type="number" className="font-mono tabular-nums" />
<Input id="start-date" type="date" className="font-mono tabular-nums" />

// Select trigger — font-mono
<SelectTrigger id="method" className="font-mono">
  <SelectValue />
</SelectTrigger>

// Textarea — font-mono
<Textarea id="reason" className="font-mono" rows={3} />
```

#### Toggle Cards (radio-style selection)

```tsx
// Active toggle — accent border + dot with glow
<button className="rounded-lg border-2 px-3 py-2.5 text-left transition-all
  border-accent/50 bg-accent/5">
  <div className="flex items-center gap-2">
    <div className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_rgba(0,188,212,0.5)]" />
    <span className="text-xs font-bold uppercase tracking-widest text-accent"
      style={{ fontFamily: 'monospace' }}>
      Match Play
    </span>
  </div>
</button>

// Inactive toggle — muted border
<button className="rounded-lg border-2 px-3 py-2.5 text-left transition-all
  border-border/50 bg-card/30 hover:border-accent/30">
  ...
</button>
```

#### Error Messages

```tsx
// Field validation error
<p className="text-xs text-destructive">{error}</p>

// Submit error banner
<div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
  <p className="min-w-0 break-words text-xs text-destructive">{submitError}</p>
</div>
```

#### Dialog Footer (Actions)

```tsx
<DialogFooter className="gap-2 sm:gap-0">
  <Button
    type="button"
    variant="outline"
    size="sm"
    className="h-8 text-xs font-semibold uppercase tracking-wider"
    onClick={onCancel}
    disabled={isPending}
  >
    Cancel
  </Button>
  <Button
    type="submit"
    size="sm"
    className="h-8 gap-1.5 text-xs font-semibold uppercase tracking-wider"
    disabled={isPending}
  >
    {isPending ? 'Creating...' : 'Create Program'}
  </Button>
</DialogFooter>
```

### Dashboard Section Heading Pattern (MANDATORY)

Section headings in dashboards and panels (e.g., "Session Summary", "Activity", "Categories") must use the monospace heading treatment with an accent dot and a contextual badge:

```tsx
// Dashboard section heading — accent dot + monospace title + badge
<div className="flex items-center gap-2">
  <div className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_hsl(var(--accent)/0.5)]" />
  <h2
    className="text-lg font-bold uppercase tracking-widest"
    style={{ fontFamily: 'monospace' }}
  >
    Session Summary
  </h2>
  <span className="rounded-full bg-accent/10 border border-accent/20 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-accent">
    Snapshot
  </span>
</div>
```

---

## Technical Requirements (Summary)

Full details in `references/pt2-technical-standards.md`.

- React 19 with App Router (NOT Pages Router)
- Next.js 16 with async params (`await params` required)
- Tailwind CSS v4 utilities (NOT v3 syntax)
- shadcn/ui components via MCP server
- Server Actions for mutations (NOT fetch to API routes)
- TanStack Query for client-side data
- TypeScript strict mode

---

## React 19 Anti-Patterns (CRITICAL — Read Reference for Details)

**Full patterns with code examples**: `references/frontend-rules.md` → React 19 Anti-Patterns section

| Anti-Pattern | Correct Pattern |
|--------------|-----------------|
| `useEffect` to sync state with props | Key-based reset: `<Content key={dataId} />` |
| Manual `useState` for loading (`isSaving`) | `useTransition` with `isPending` |
| Mutations without optimistic updates | TanStack Query `onMutate` + rollback |
| `React.memo` / `useMemo` / `useCallback` on simple components | Remove — React 19 Compiler handles it |
| Loading state props (`isSaving`, `isClosing`) | `useTransition` colocated at action site |
| `eslint-disable exhaustive-deps` | Fix the pattern, don't suppress the lint |

**Rule**: If you need `eslint-disable` for exhaustive-deps, the pattern is wrong.

---

## React 19 Hooks (Quick Reference)

**Full code examples**: `references/frontend-rules.md` → React 19 Hooks section

| Hook | Import | When to Use |
|------|--------|-------------|
| `useTransition` | `react` | **All async button clicks** (MANDATORY) |
| `useActionState` | `react` | Server Action forms — returns `[state, formAction, isPending]` |
| `useFormStatus` | `react-dom` | Nested submit buttons (must be inside `<form>`) |
| `useOptimistic` | `react` | Instant UI feedback for idempotent operations |
| `use()` | `react` | Read promises/context in render (with Suspense) |

### shadcn/ui Access

Use `mcp__shadcn__*` tools. Fallback to `mcp__magic__*` if registries unavailable.

```bash
# Core components
npx shadcn@latest add button dialog form table

# From registries: @aceternity, @originui, @kokonutui, @tweakcn
npx shadcn@latest add @aceternity/background-beams
```

---

## Surface Classification Policy (ADR-041)

**Every new PT-2 surface must declare its classification before implementation.** This is a hard rejection gate (ADR-041 D1). If building a new page or surface, produce or prompt for the 4-field declaration below before writing component code.

**Source:** `docs/80-adrs/ADR-041-surface-governance-standard.md`
**Companion standards:** `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md`, `docs/70-governance/METRIC_PROVENANCE_MATRIX.md`

### 4-Field Declaration (MANDATORY for new surfaces)

Every new surface EXEC-SPEC must include all four fields. Missing fields = non-compliant:

```yaml
Surface Classification:
  Rendering Delivery: [RSC Prefetch + Hydration | Client Shell | Hybrid]
  Data Aggregation:   [BFF RPC | BFF Summary | Simple Query | Client Fetch]
  Rejected Patterns:  [Which proven patterns were considered and why rejected]
  Metric Provenance:  [For each metric: Truth ID, truth class, freshness class]
```

### Proven Pattern Palette (ADR-041 D2)

Select from this palette only. If no pattern fits, escalate via ADR amendment -- do not invent ad-hoc patterns.

**Rendering Delivery:**
| Pattern | When to Use |
|---------|-------------|
| **RSC Prefetch + Hydration** | Read-heavy dashboards, ≥2 independent queries above the fold |
| **Client Shell** | Form-driven, low-frequency admin flows |
| **Hybrid** | Both server paint AND client interaction — must name composed patterns and why |

**Data Aggregation:**
| Pattern | When to Use |
|---------|-------------|
| **BFF RPC Aggregation** (GOV-PAT-003) | ≥3 bounded contexts, single DB round-trip (SECURITY DEFINER) |
| **BFF Summary Endpoint** | Multi-level rollups (casino/pit/table), >100 calls/day |
| **Simple Query / View** | 1-2 tables, single bounded context |
| **Client-side Fetch** | Single entity, low frequency, no cross-context join |

### Metric Provenance
Any truth-bearing metric displayed on a surface **MUST** be registered in `docs/70-governance/METRIC_PROVENANCE_MATRIX.md` (currently MEAS-001–012). Each metric has declared:
- **Truth Class** (Raw Record / Derived Operational / Compliance-Interpreted / Snapshot-Historical)
- **Freshness** — constrains caching and refresh strategy (e.g., Cached 30s → staleTime: 30_000)
- **Reconciliation Path** — how the value is verified against source truth

**Exemplars:** `docs/70-governance/examples/SLICE-1-MEASUREMENT-UI-DECLARATION.md`, `docs/70-governance/examples/SLICE-2-SHIFT-DASHBOARD-DECLARATION.md`

**Component rule:** Components display trust metadata (grade badges, coverage bars, quality indicators) but MUST NOT recompute trust. Display-only counting is acceptable; recomputing grades or scores is not.

---

## PT-2 Layout Patterns

**CRITICAL**: Before building PT-2 interfaces, read `references/pt2-layout-strategy.md`.

PT-2 follows a **loop-centric, low-click workflow** optimized for pit operations:
- **Right panels** replace detail pages (keep list visible)
- **Modals** only for irreversible/high-risk actions
- **Command Palette** (Ctrl/⌘+K) for muscle-memory access
- **Inline row actions** — show 2-3 primary actions, overflow the rest

---

## Design Thinking

**There are two modes.** Pick the right one based on what you're building:

### Mode A: Extending an Existing Surface (DEFAULT)

When adding components to an existing page/panel (e.g., adding a tile to Player 360 compliance panel, adding a badge to an existing header):

1. **Read 2-3 adjacent components** in the same surface directory. Note their Card usage, typography patterns, spacing, border-width, color tokens.
2. **Match exactly.** Your new component must look like it was written in the same session as its siblings. Same Card structure, same monospace headers, same `border-2`, same `tracking-widest`.
3. **No creative divergence.** The design decision was already made. Your job is consistency.

### Mode B: New Surface / New Page (GREENFIELD ONLY)

When creating an entirely new page or surface that doesn't live inside an existing layout:

1. **Purpose**: What problem does this interface solve? Who uses it?
2. **Tone**: PT-2's established tone is **brutalist-industrial** — monospace typography, thick borders, teal accent, high contrast, data-forward. New surfaces should extend this, not diverge from it.
3. **Differentiation**: What makes this surface serve its specific workflow well? (Not "unforgettable" — "purpose-built for the task.")

**CRITICAL**: Even in greenfield mode, the PT-2 Visual DNA patterns above are the baseline. You're extending a cohesive system, not starting from scratch.

---

## Aesthetic Guidelines

### PT-2 Visual Identity

PT-2 is a **brutalist-industrial data application** for casino pit operations. The design is intentionally:

- **Monospace-forward**: All section headers, stat labels, panel titles use `fontFamily: 'monospace'` + `font-bold uppercase tracking-widest`. This is the signature pattern — it signals "serious operational software."
- **Thick-bordered**: Cards use `border-2` (not `border`). This is the brutalist thickness convention.
- **Teal-accented**: One accent color (`--accent: hsl(189 94% 37%)`). Used for primary actions, key KPIs, selected states, active indicators. 10% rule — accent appears sparingly.
- **Data-dense but calm**: Large readable monospace numbers, clear status indicators, minimal decoration. No animation for decoration's sake.
- **Dark-mode-first**: Designed for the casino floor — low eye strain, high contrast where it matters.

### What Goes Wrong (and How to Fix It)

| Drift Pattern | Why It Happens | Correct Pattern |
|---------------|---------------|-----------------|
| Raw `<div>` with `border rounded-lg p-3` | Ignoring Card component | Use `<Card className="border-2">` with CardHeader/CardContent |
| `font-medium text-xs tracking-wide` | Close but not matching | `font-bold text-sm uppercase tracking-widest` + `fontFamily: 'monospace'` |
| `border` (thin) | Default Tailwind | `border-2` (brutalist thickness) |
| Plain text headers | No monospace identity | Add `style={{ fontFamily: 'monospace' }}` |
| `text-[10px]` for everything | Over-shrinking text | Match adjacent component sizes — typically `text-xs` for labels, `text-sm` for titles |
| Inline date formatting | Utility not extracted | Follow adjacent component patterns for consistency |
| Generic loading skeleton | Not matching component shape | Skeleton must mirror the component's Card/header/content structure |
| Bare `<DialogTitle>` | No form pattern awareness | `text-sm font-bold uppercase tracking-widest` + monospace |
| Bare `<Label>` without color class | Default Label has no muted color | `className="text-sm text-muted-foreground"` |
| `<Input>` without `font-mono` | Default Input uses system font | Add `className="font-mono"` (text) or `"font-mono tabular-nums"` (numbers/dates) |
| Flat form with `space-y-4` | No section grouping | Section headers + `<Separator />` + `space-y-5` between groups |
| Unsized dialog buttons | Default Button too tall for dialogs | `size="sm" className="h-8 text-xs font-semibold uppercase tracking-wider"` |
| Dashboard heading as `text-sm font-semibold` | Missing monospace/badge treatment | `text-lg font-bold uppercase tracking-widest` + monospace + accent dot + badge |

### Decoration Discipline

- Every visual element must earn its place — no gradient meshes, noise textures, or overlays in operational surfaces
- Motion is functional only: hover state transitions (`transition-all duration-200`), status pulses (`animate-pulse` for warnings), active glows (`shadow-[0_0_8px_...]`)
- Icons reinforce meaning, never replace labels. Use lucide-react consistently.

---

## Implementation Workflow

See `references/QUICK_START.md` for complete workflow:

1. **Surface Discovery** (Mode A only) — Read 2-3 adjacent components in the target directory. Extract: Card vs div usage, border width, typography pattern, spacing tokens, color conventions. Your output must match.
2. **Choose Pattern** — Server Component, Client + Query, Real-time, Forms
3. **Apply Visual DNA** — Use Card component with `border-2`, monospace headers with `font-bold uppercase tracking-widest`, status rows with `border-2 p-3`, badges with `10%/30%` opacity pattern
4. **Implementation Checklist** — Technical standards validation
5. **Code Templates** — Copy-paste patterns from PT-2 Visual DNA section above
6. **Validate** — Type check, lint, test
7. **Design Consistency Check** — See checklist below
8. **React 19 Compliance Check** — See checklist below

### Design Consistency Checklist (MANDATORY)

Before marking implementation complete, verify ALL visual patterns match PT-2 Visual DNA:

**Panels & Cards:**
- [ ] **Card component used** — Panels/tiles use `<Card>` with `CardHeader`/`CardContent`, not raw `<div>` with padding
- [ ] **`border-2` on cards** — Thick brutalist border, not thin `border`
- [ ] **Monospace headers** — Section titles use `font-bold uppercase tracking-widest` + `style={{ fontFamily: 'monospace' }}`
- [ ] **Status colors follow pattern** — `bg-{color}-500/10 text-{color}-400 border-{color}-500/30` (10%/30% opacity convention)
- [ ] **Loading skeletons match structure** — Skeleton mirrors the component's Card/header/content shape, not generic rectangles
- [ ] **Empty states use dashed Card** — `border-2 border-dashed border-border/50` with monospace label
- [ ] **Buttons follow action pattern** — `text-xs font-semibold uppercase tracking-wider` for action buttons
- [ ] **Adjacent component consistency** — New component visually matches siblings in the same surface/panel

**Forms & Dialogs (if applicable):**
- [ ] **Dialog title styled** — `text-sm font-bold uppercase tracking-widest` + monospace (not bare `<DialogTitle>`)
- [ ] **Section headers present** — Related fields grouped with icon + monospace section header + `<Separator />`
- [ ] **Labels styled** — `className="text-sm text-muted-foreground"` (not bare `<Label>`)
- [ ] **Inputs use `font-mono`** — Text: `font-mono`, numbers/dates: `font-mono tabular-nums`
- [ ] **Select triggers use `font-mono`** — `<SelectTrigger className="font-mono">`
- [ ] **Textareas use `font-mono`** — `<Textarea className="font-mono" />`
- [ ] **Form spacing** — `space-y-5` between sections, `space-y-3` within sections, `space-y-1.5` between label and input
- [ ] **Dialog footer buttons** — `size="sm" className="h-8 text-xs font-semibold uppercase tracking-wider"`
- [ ] **Optional fields marked** — `<span className="ml-1 text-xs text-muted-foreground/50">optional</span>`

**Dashboard Section Headings (if applicable):**
- [ ] **Monospace treatment** — `text-lg font-bold uppercase tracking-widest` + monospace
- [ ] **Accent dot** — `h-1.5 w-1.5 rounded-full bg-accent` with glow shadow
- [ ] **Contextual badge** — `rounded-full bg-accent/10 border-accent/20` pill label

**If any checkbox fails, fix before committing.**

### React 19 Compliance Checklist (MANDATORY)

Before marking implementation complete, verify ALL:

- [ ] **No `useEffect` sync patterns** — State from props uses key-based reset or computed during render
- [ ] **No manual loading states** — All async buttons use `useTransition`, not `useState(false)`
- [ ] **Mutations have optimistic updates** — TanStack Query `onMutate` with rollback on error
- [ ] **No unnecessary memoization** — `React.memo`, `useMemo`, `useCallback` only for profiled expensive ops
- [ ] **No loading state props** — `useTransition` colocated with action, not passed as props
- [ ] **No `eslint-disable exhaustive-deps`** — If needed, the pattern is wrong; fix it

**If any checkbox fails, fix before committing.**

### State Management Rules

| State Type | Solution |
|------------|----------|
| Server data | TanStack Query v5 |
| UI state (modals, toggles) | Zustand |
| Shareable filters | URL params |
| Form state | useActionState |

---

## Real-Time & Cache Invalidation

**Canonical Reference**: `docs/35-integration/INT-002-event-catalog.md`

For real-time UI updates, use event catalog patterns with TanStack Query cache invalidation. See `references/QUICK_START.md` for code templates.

### Next.js 16 Cache APIs

| Function | Use Case | Behavior |
|----------|----------|----------|
| `cacheTag('tag')` | Tag cached data in `'use cache'` functions | Stable API (no `unstable_` prefix) |
| `revalidateTag('tag', 'max')` | Background revalidation | Stale-while-revalidate semantics |
| `updateTag('tag')` | Immediate expiration | Read-your-own-writes scenarios |

Key patterns:
- `revalidateTag(tag, 'max')` for Server Component cache (stale-while-revalidate)
- `updateTag(tag)` for immediate cache expiration in Server Actions
- `queryClient.invalidateQueries()` for TanStack Query
- Supabase realtime subscriptions for push updates
- 250-500ms batching for list invalidations

---

## Anti-Patterns

| Anti-Pattern | Correct Pattern |
|--------------|-----------------|
| `useEffect` to sync state with props | Key-based reset or derived state |
| Manual `useState` for loading (`isSaving`) | `useTransition` with `isPending` |
| Mutations without optimistic updates | TanStack Query `onMutate` + rollback |
| `React.memo` on simple components | Remove (React 19 Compiler handles) |
| `useMemo`/`useCallback` for trivial ops | Direct computation or inline functions |
| Loading state props (`isSaving`, `isClosing`) | `useTransition` at action site |
| `eslint-disable exhaustive-deps` | Fix the pattern (key-based reset) |
| `fetch()` in Server Component | Direct service call |
| `fetch()` for mutations | Server Action |
| Hardcoded query keys | Key factories from `keys.ts` |
| Database types in components | DTOs from service |
| Spinners for loading | Layout-aware skeletons |
| `params.id` without await | `const { id } = await params` (Next.js 16) |
| `revalidateTag(tag)` alone | `revalidateTag(tag, 'max')` for stale-while-revalidate |
| Manual cache expiration | `updateTag(tag)` for immediate invalidation |

---

## Session Continuity

For long-running sessions approaching context limits:
- See `references/context-management.md` for checkpoint protocol
- Use `/frontend-checkpoint save` before `/clear`
- Use `/frontend-checkpoint restore` after `/clear`

For tracking design decisions across sessions:
- See `references/memori-integration.md` for memory recording
