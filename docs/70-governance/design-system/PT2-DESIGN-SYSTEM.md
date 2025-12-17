# PT-2 Design System

## Refined Dark Industrial Aesthetic

> **Philosophy**: High-end casino control room meets Bloomberg terminal. Sharp geometric elements, monospace numbers for financial data, and subtle cyan glow effects.

This design system defines PT-2's distinctive visual language—professional, data-dense, and unmistakably premium.

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Color Palette](#color-palette)
3. [Typography](#typography)
4. [Spatial Composition](#spatial-composition)
5. [Component Patterns](#component-patterns)
6. [Visual Effects](#visual-effects)
7. [Motion & Interaction](#motion--interaction)
8. [Code Examples](#code-examples)

---

## Design Philosophy

### Core Principles

| Principle | Description |
|-----------|-------------|
| **Data Density** | Operations dashboards show maximum information without clutter |
| **Professional Gravitas** | Premium feel suitable for high-stakes casino operations |
| **Functional Beauty** | Every visual element serves a purpose |
| **Ambient Awareness** | Subtle cues indicate system state without demanding attention |

### Tone Keywords

- **Industrial** — Raw, utilitarian, functional
- **Refined** — Polished, premium, intentional
- **Technical** — Data-focused, precise, professional
- **Ambient** — Subtle glows, soft transitions, atmospheric

### Anti-Patterns to Avoid

- Generic AI aesthetics (purple gradients on white)
- Overused fonts (Inter, Roboto, Arial)
- Flat, lifeless cards without depth
- Evenly-distributed timid color palettes
- Cookie-cutter component patterns

---

## Color Palette

### Primary Colors (Dark Theme)

```css
:root {
  /* Base */
  --background: 222 47% 11%;        /* #0f172a - Slate 900 */
  --foreground: 210 40% 98%;        /* #f8fafc - Slate 50 */

  /* Cards & Surfaces */
  --card: 222 47% 11%;              /* Same as background */
  --card-foreground: 210 40% 98%;

  /* Accent - THE SIGNATURE COLOR */
  --accent: 189 94% 43%;            /* #06b6d4 - Cyan 500 */
  --accent-foreground: 222 47.4% 11.2%;

  /* Muted & Secondary */
  --muted: 217.2 32.6% 17.5%;       /* Slate 800 */
  --muted-foreground: 215 20.2% 65.1%;

  /* Borders */
  --border: 217.2 32.6% 17.5%;      /* Slate 800 */
}
```

### Semantic Colors

| Purpose | Color | Tailwind Class | Usage |
|---------|-------|----------------|-------|
| **Positive/Success** | Emerald 400 | `text-emerald-400` | Positive variance, completed status |
| **Negative/Warning** | Red 400 | `text-red-400` | Negative variance, overdue status |
| **Neutral/Pending** | Amber 400 | `text-amber-400` | Pending approval, warning states |
| **Accent/Active** | Cyan 500 | `text-accent` | Active elements, primary actions |
| **Info/Scheduled** | Cyan 400 | `text-cyan-400` | Scheduled events, informational |

### Casino Chip Denomination Colors

Industry-standard color coding for chip denominations:

| Denomination | Color | CSS Classes |
|--------------|-------|-------------|
| $5 | Red | `bg-red-900/80 border-red-500 text-red-100` |
| $25 | Green | `bg-emerald-900/80 border-emerald-500 text-emerald-100` |
| $100 | Black/Slate | `bg-slate-800 border-slate-400 text-slate-100` |
| $500 | Purple | `bg-violet-900/80 border-violet-500 text-violet-100` |
| $1000 | Orange/Gold | `bg-amber-900/80 border-amber-500 text-amber-100` |

---

## Typography

### Font Stack

```css
:root {
  --font-sans: 'DM Sans', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}
```

### Usage Guidelines

| Context | Font | Weight | Size | Tracking |
|---------|------|--------|------|----------|
| **Headings** | DM Sans | 600 (semibold) | text-lg to text-xl | `tracking-tight` |
| **Body Text** | DM Sans | 400 (normal) | text-sm | Default |
| **Labels** | DM Sans | 500 (medium) | text-xs | `uppercase tracking-wider` |
| **Financial Data** | JetBrains Mono | 700 (bold) | text-lg to text-2xl | `tracking-tight` |
| **Metadata** | JetBrains Mono | 400 (normal) | text-xs | Default |
| **Badges** | JetBrains Mono | 500 (medium) | text-xs | Default |

### Key Pattern: Monospace for Numbers

**Always use monospace (`font-mono`) for:**
- Currency values: `$12,450`
- Percentages: `+8.2%`
- Counts: `2,400 chips`
- Time values: `2:15:32 PM`
- IDs: `Fill Slip #001`

```tsx
<span className="font-mono text-2xl font-bold tracking-tight">
  ${totalValue.toLocaleString()}
</span>
```

---

## Spatial Composition

### Card Structure

```
┌─────────────────────────────────────────────┐
│▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│ ← LED accent strip (0.5px)
│                                             │
│  [Icon]  SECTION TITLE        [Badge +2.1%]│ ← Header with badge
│                                             │
│  ┌─────────────┐  ┌─────────────┐          │
│  │  $57,000    │  │  3,370      │          │ ← Stats grid
│  │  Total Value│  │  Total Chips│          │
│  └─────────────┘  └─────────────┘          │
│                                             │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ ← Subtle grid overlay
└─────────────────────────────────────────────┘
```

### Spacing Scale

| Element | Padding | Gap |
|---------|---------|-----|
| Page | `p-6` | `space-y-6` |
| Cards | `p-4` to `p-5` | `space-y-3` to `space-y-4` |
| Card Headers | `pb-3` | `gap-3` |
| List Items | `p-4` | `space-y-3` |
| Inline Elements | `px-2.5 py-1` | `gap-1.5` to `gap-2` |

### Border Opacity Pattern

Use reduced opacity borders for depth without harsh lines:

```tsx
// Standard border
className="border border-border/40"

// Hover state
className="hover:border-border/60"

// Accent border
className="border-accent/30"
```

---

## Component Patterns

### 1. LED Accent Strip

Signature element—a thin gradient line at the top of cards:

```tsx
{/* Top LED accent strip */}
<div className={cn(
  'absolute top-0 left-0 right-0 h-0.5',
  isPositive
    ? 'bg-gradient-to-r from-transparent via-cyan-500 to-transparent'
    : 'bg-gradient-to-r from-transparent via-red-500 to-transparent'
)} />
```

### 2. Status Indicator Bar

Vertical bar on left edge indicating status:

```tsx
{/* Status indicator bar */}
<div className={cn(
  'absolute left-0 top-0 bottom-0 w-1',
  status === 'completed' && 'bg-emerald-500',
  status === 'overdue' && 'bg-red-500',
  status === 'scheduled' && 'bg-cyan-500'
)} />
```

### 3. Icon Container

Consistent icon wrapper with accent background:

```tsx
<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 border border-accent/20">
  <Package className="h-5 w-5 text-accent" />
</div>
```

### 4. Section Header

Uppercase, tracked labels:

```tsx
<h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
  Bank Summary
</h3>
```

### 5. Stat Display

Large monospace values with muted labels:

```tsx
<div className="space-y-1">
  <div className="flex items-center gap-2 text-muted-foreground">
    <Banknote className="h-4 w-4" />
    <span className="text-xs uppercase tracking-wide">Total Value</span>
  </div>
  <div className="font-mono text-2xl font-bold tracking-tight text-foreground">
    ${totalValue.toLocaleString()}
  </div>
</div>
```

### 6. Variance Badge

Contextual color based on positive/negative:

```tsx
<div className={cn(
  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono',
  isPositive
    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
    : 'bg-red-500/10 text-red-400 border border-red-500/30'
)}>
  {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
  <span>{isPositive ? '+' : ''}{variance.toFixed(1)}%</span>
</div>
```

### 7. Action Button (Accent)

Primary action with accent colors:

```tsx
<Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
  <Calculator className="h-4 w-4 mr-2" />
  Count Chips
</Button>
```

### 8. Dashed Add Button

Secondary action for creating new items:

```tsx
<Button
  variant="outline"
  size="sm"
  className="h-8 border-dashed border-accent/30 text-accent hover:bg-accent/10 hover:border-accent"
>
  <Plus className="h-3.5 w-3.5 mr-1.5" />
  Schedule Drop
</Button>
```

---

## Visual Effects

### 1. Grid Pattern Overlay

Adds subtle depth and technical feel:

```tsx
{/* Subtle grid pattern overlay */}
<div
  className="absolute inset-0 pointer-events-none opacity-[0.03]"
  style={{
    backgroundImage: 'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
    backgroundSize: '20px 20px'
  }}
/>
```

### 2. Backdrop Blur

Frosted glass effect on headers and overlays:

```tsx
className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
```

### 3. Casino Chip Edge Pattern

Dashed inner ring mimicking chip edges:

```tsx
className={cn(
  'relative flex items-center justify-center',
  'w-14 h-14 rounded-full',
  'before:absolute before:inset-1 before:rounded-full',
  'before:border before:border-dashed before:border-white/20'
)}
```

### 4. Hover Glow Effect

Left accent line appears on hover:

```tsx
{/* Left accent line */}
<div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-transparent via-accent/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
```

### 5. Card Gradient Background

Subtle directional gradient:

```tsx
className="bg-gradient-to-r from-card/80 to-card/40"
```

---

## Motion & Interaction

### Transition Defaults

```tsx
// Standard transition
className="transition-all duration-300"

// Color-only transition
className="transition-colors"

// Opacity transition
className="transition-opacity"
```

### Hover States

| Element | Effect |
|---------|--------|
| Cards | `hover:border-accent/30 hover:bg-card/60` |
| Buttons | `hover:bg-accent/10` |
| Icons | `hover:text-accent` |
| Chips | `hover:scale-105 hover:shadow-xl` |

### Active Tab Styling

```tsx
className={cn(
  'data-[state=active]:bg-accent/10',
  'data-[state=active]:text-accent',
  'data-[state=active]:border-accent/30',
  'data-[state=active]:shadow-sm'
)}
```

### Pulse Animation

For live indicators:

```tsx
<div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
```

---

## Code Examples

### Complete Card Component

```tsx
function StatCard({
  icon: Icon,
  label,
  value,
  change,
  positive
}: StatCardProps) {
  return (
    <div className={cn(
      'relative overflow-hidden p-4 rounded-lg',
      'border border-border/40 bg-card/50',
      'backdrop-blur-sm'
    )}>
      {/* Accent strip */}
      <div className={cn(
        'absolute top-0 left-0 right-0 h-0.5',
        positive
          ? 'bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent'
          : 'bg-gradient-to-r from-transparent via-amber-500/50 to-transparent'
      )} />

      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Icon className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wide">{label}</span>
          </div>
          <div className="font-mono text-xl font-bold text-foreground">
            {value}
          </div>
        </div>
        <div className={cn(
          'px-2 py-0.5 rounded text-xs font-mono',
          positive
            ? 'bg-emerald-500/10 text-emerald-400'
            : 'bg-amber-500/10 text-amber-400'
        )}>
          {change}
        </div>
      </div>

      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: 'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }}
      />
    </div>
  )
}
```

### Panel Header Pattern

```tsx
<div className="flex items-center justify-between p-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
  <div className="flex items-center gap-3">
    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 border border-accent/20">
      <Package className="h-5 w-5 text-accent" />
    </div>
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Inventory Management</h2>
      <p className="text-sm text-muted-foreground">
        BJ-01 • Last updated: 2:15:32 PM
      </p>
    </div>
  </div>

  <div className="flex items-center gap-2">
    <Button variant="outline" size="sm" className="text-muted-foreground">
      <RefreshCw className="h-4 w-4 mr-2" />
      Refresh
    </Button>
    <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
      <Calculator className="h-4 w-4 mr-2" />
      Count Chips
    </Button>
  </div>
</div>
```

---

## Reference Implementation

See the pit panels components for complete examples:

```
components/pit-panels/
├── panel-container.tsx      # Collapsible vertical nav + content
├── inventory-panel.tsx      # Main inventory view
├── analytics-panel.tsx      # Metrics dashboard
├── bank-summary.tsx         # Summary card with LED accent
├── chip-counts-display.tsx  # Chip inventory list
├── chip-denomination.tsx    # Casino chip badge
├── drop-events-display.tsx  # Timeline display
└── fill-slips-display.tsx   # Document cards
```

**Live Preview**: `/review/pit-panels`

---

## Checklist for New Components

When building new components, verify:

- [ ] Uses dark theme colors (`bg-card/50`, `border-border/40`)
- [ ] Financial data uses `font-mono`
- [ ] Labels use `uppercase tracking-wider text-muted-foreground`
- [ ] Cards have subtle border opacity (`border/40`)
- [ ] Interactive elements have hover states
- [ ] Status uses semantic colors (emerald/red/amber/cyan)
- [ ] Consider LED accent strip for key cards
- [ ] Consider grid overlay for depth
- [ ] Icons paired with accent colors
- [ ] Backdrop blur on overlays/headers

---

*Design system established December 2024. Review route: `/review/pit-panels`*
