# PT-2 Visual DNA — Exemplar Reference

**Established:** 2026-04-10
**Source:** `app/review/landing-zachman-dark/page.tsx`
**Lineage:** Linear.app design DNA adapted for casino operations B2B

This document defines the canonical visual language for all PT-2 marketing and public-facing surfaces. Every new page (login, drill-downs, supporting pages) should derive from these tokens.

---

## 1. Color System

### Backgrounds

| Token | Value | Usage |
|-------|-------|-------|
| `page-bg` | `#000212` | Page background — blue-black, not pure black |
| `surface-elevated` | `rgba(255,255,255,0.02)` | Cards, panels |
| `surface-hover` | `rgba(255,255,255,0.04)` | Interactive hover state |
| `nav-bg` | `#000212` at 80% opacity | Sticky nav with `backdrop-blur-xl` |
| `border-default` | `rgba(255,255,255,0.06)` | Card/section borders |
| `border-hover` | `rgba(255,255,255,0.08)` | Hover border intensity |
| `border-accent` | `hsl(189 94% 43% / 0.30)` | Active/selected borders |

### Text

| Token | Value | Usage |
|-------|-------|-------|
| `text-primary` | `#F7F8F8` | Headings, prominent labels |
| `text-secondary` | `#95A2B3` | Body text, descriptions |
| `text-tertiary` | `#95A2B3` at 70% | Supporting details, motion statements |
| `text-muted` | `#95A2B3` at 60% | Proof strip, footer |
| `text-mono-label` | `#95A2B3` at various | Monospace badges, counters |

### Brand Accent

| Token | Value | Usage |
|-------|-------|-------|
| `accent` | `hsl(189 94% 43%)` | PT-2 cyan — buttons, glows, labels |
| `accent-muted` | `accent` at 80% | Section labels, tab active state |
| `accent-subtle` | `accent` at 60% | Counter numbers, link arrows |
| `accent-glow-sm` | `0 0 16px hsl(189 94% 43% / 0.3)` | Logo hover, small elements |
| `accent-glow-lg` | `0 1px 40px hsl(189 94% 43% / 0.25)` | Primary CTA shadow |
| `accent-glow-lg-hover` | `0 1px 50px hsl(189 94% 43% / 0.35)` | Primary CTA hover shadow |
| `accent-surface` | `accent` at 6% | Active tab background |

### Selection

```css
selection:bg-accent/30
```

---

## 2. Typography

### Font Stack

- **Sans (body + headings):** DM Sans via `--font-sans` (loaded in root layout)
- **Mono (labels + counters):** JetBrains Mono via `--font-mono` / `font-mono` class

### Scale

| Element | Size | Weight | Extras |
|---------|------|--------|--------|
| Hero heading | `text-[1.75rem] leading-[1.15]` / `sm:text-4xl` / `md:text-5xl` / `lg:text-[3.5rem]` | `font-bold` | Gradient text treatment |
| Section heading | `text-3xl` / `sm:text-4xl` | `font-bold` | Gradient text treatment |
| CTA heading | `text-3xl` / `sm:text-4xl` / `lg:text-5xl` | `font-bold` | Gradient text treatment |
| Card title | `text-lg` | `font-semibold` | `text-[#F7F8F8]` |
| Trust statement | `text-[15px]` | `font-semibold` | `text-[#F7F8F8]` |
| Body / subtitle | `text-lg` or `text-[15px]` | normal | `text-[#95A2B3]` |
| Detail / proof | `text-sm` | normal | `text-[#95A2B3]/70`, `leading-relaxed` |
| Section label | `text-[11px]` | `font-medium` | `font-mono uppercase tracking-[0.15em] text-accent/80` |
| Counter | `text-[11px]` or `text-[10px]` | normal | `font-mono tracking-[0.12em] text-accent/60` |
| Badge | `text-[11px]` | `font-medium` | `font-mono tracking-[0.12em] text-[#95A2B3]` |
| Nav link | `text-[13px]` | normal | `text-[#95A2B3]` → hover `text-[#F7F8F8]` |
| Button text | `text-sm` or `text-[13px]` | `font-semibold` (primary) / `font-medium` (secondary) | `tracking-wide` |

### Gradient Text Treatment (Signature)

Applied to all section headings and the CTA headline:

```css
background: linear-gradient(to right bottom, rgb(247 248 248) 30%, rgba(247 248 248 / 0.38));
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
background-clip: text;
```

White fades to 38% opacity toward bottom-right. Creates depth without color.

---

## 3. Spacing

### Section Rhythm (Mobile-First)

| Element | Mobile | Desktop |
|---------|--------|---------|
| Section padding | `py-16` | `sm:py-28` |
| CTA section padding | `py-20` | `sm:py-32` |
| Section header margin-bottom | `mb-10` | `sm:mb-20` |
| Section label margin-bottom | `mb-3` | `sm:mb-4` |
| Hero top padding | `pt-20` | `sm:pt-32` / `lg:pt-40` |
| Hero bottom padding | `pb-14` | `sm:pb-20` / `lg:pb-28` |
| CTA top margin | `mt-10` | `sm:mt-12` |
| Nav height | `h-14` (3.5rem) | same |
| Footer padding | `py-10` (2.5rem) | same |

### Content Width (Mobile-First)

| Element | Mobile | Desktop |
|---------|--------|---------|
| Max content width | — | `max-w-5xl` (64rem) |
| Hero max width | — | `max-w-3xl` (48rem) |
| CTA max width | — | `max-w-2xl` (42rem) |
| Section header max width | — | `max-w-2xl` |
| Horizontal padding | `px-5` (1.25rem) | `sm:px-6` (1.5rem) |

### Card Spacing (Mobile-First)

| Element | Mobile | Desktop |
|---------|--------|---------|
| Grid gap (operating loops) | `gap-px` with shared border container | same |
| Grid gap (product) | `gap-6` | same |
| Card padding | `p-6` | `sm:p-8` / `md:p-10` |
| Tab padding | `px-4 py-3.5` | same |

---

## 4. Components

### Buttons

**Primary (pill, glow):**
```
rounded-full bg-accent text-white hover:bg-accent/90
px-8 h-12 text-sm font-semibold tracking-wide
shadow-[0_1px_40px_hsl(189_94%_43%/0.25)]
hover:shadow-[0_1px_50px_hsl(189_94%_43%/0.35)]
transition-all duration-300
```

**Secondary (glassmorphic pill):**
```
rounded-full border border-white/[0.08] bg-white/[0.04]
text-[#95A2B3] hover:bg-white/[0.08] hover:text-[#F7F8F8]
backdrop-blur-sm px-8 h-12 text-sm font-medium tracking-wide
transition-all duration-300
```

**Nav CTA (compact pill):**
```
rounded-full bg-accent/90 text-white hover:bg-accent
hover:shadow-[0_0_20px_hsl(189_94%_43%/0.3)]
text-[13px] px-5 h-8
```

### Cards — Grid Pattern

Operating Loops and Trust use a **gap-px grid inside a bordered container**:

```
Container: rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03]
Cards:     bg-[#000212] p-8 sm:p-10
           transition-all duration-500 hover:bg-white/[0.02]
Grid:      grid gap-px sm:grid-cols-2
```

The `gap-px` + container `bg-white/[0.03]` creates subtle 1px separator lines between cards.

### Cards — Glassmorphic Panel

Product display panel:

```
rounded-2xl border border-white/[0.06] bg-white/[0.02]
transition-all duration-500 hover:border-accent/20
```

With hover glow overlay:
```css
background: radial-gradient(ellipse at center, hsl(189 94% 43% / 0.04), transparent 70%);
/* Applied via opacity transition on hover */
```

### Tab Selector

```
Active:   border-accent/30 bg-accent/[0.06]
Inactive: border-transparent hover:border-white/[0.06] hover:bg-white/[0.02]
```

### Navigation

```
Sticky, z-50, bg-[#000212]/80 backdrop-blur-xl
border-b border-white/[0.06]
Inner: h-14 max-w-5xl
```

### Badge (Hero)

```
rounded-full border border-white/[0.08] bg-white/[0.03]
backdrop-blur-sm px-4 py-1.5
```

With animated ping dot:
```
animate-ping rounded-full bg-accent/60 (outer)
rounded-full bg-accent (inner)
```

---

## 5. Motion

### Intersection Observer Reveals

All content sections use a `Reveal` wrapper with `IntersectionObserver`:

- **Threshold:** 0.1 (triggers when 10% visible)
- **Animation:** `opacity-0 translate-y-6` → `opacity-100 translate-y-0`
- **Duration:** `duration-700 ease-out`
- **Stagger:** `delay` prop in 60-80ms increments per item
- **One-shot:** Observer disconnects after first intersection

### Background Animations

- **Dot grid:** `24px` spacing, `0.04` base opacity, 6s breathing cycle
- **Glow pulse (trust dots):** 3-4.5s per-item staggered cycle, opacity 0.4 → 0.8
- **Badge ping:** Standard Tailwind `animate-ping` on accent dot

### Hover Transitions

- **All hovers:** `transition-all duration-300` (fast) or `duration-500` (cards)
- **Links:** color transition `text-[#95A2B3]` → `text-[#F7F8F8]`
- **Arrow links:** `gap-1.5` → `gap-2.5` + `translate-x-0.5` on arrow icon
- **Logo:** glow shadow on hover
- **Cards:** background opacity shift + optional radial glow overlay

---

## 6. Background Treatments

### Page Texture

Fixed dot grid behind all content:
```css
background-image: radial-gradient(circle, rgba(255,255,255,0.4) 0.5px, transparent 0.5px);
background-size: 24px 24px;
opacity: 0.04;
```

### Section Glows

Subtle radial gradients per section, positioned asymmetrically:

```css
/* Operations — left-biased */
radial-gradient(ellipse 60% 50% at 20% 30%, hsl(189 94% 43% / 0.03), transparent)

/* Product — right-biased */
radial-gradient(ellipse 50% 50% at 80% 50%, hsl(189 94% 43% / 0.03), transparent)

/* Trust — bottom-centered */
radial-gradient(ellipse 50% 60% at 50% 80%, hsl(189 94% 43% / 0.03), transparent)

/* CTA — bottom glow */
radial-gradient(ellipse 60% 60% at 50% 100%, hsl(189 94% 43% / 0.06), transparent)
```

### Hero Glow

Stronger, tighter ellipses:
```css
radial-gradient(ellipse 60% 50% at 50% -5%, hsl(189 94% 43% / 0.12), transparent),
radial-gradient(ellipse 90% 35% at 50% -15%, hsl(189 94% 43% / 0.05), transparent)
```

### Top Accent Line

```css
h-px w-[min(500px,70vw)] bg-gradient-to-r from-transparent via-accent/25 to-transparent
```

### Grid Pattern (Product panel)

```css
background-image:
  linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px),
  linear-gradient(to bottom, rgba(255,255,255,0.5) 1px, transparent 1px);
background-size: 32px 32px;
opacity: 0.03;
```

---

## 7. Overscroll Fix

Inject via `<style>` tag in the page component to prevent white flash on rubber-band scroll:

```css
html, body { background-color: #000212; }
```

---

## 8. Section Architecture

Per the narrative-spine direction doc:

| # | Section | Job | Tone |
|---|---------|-----|------|
| 1 | **Hero** | Set category and frame | Confident, sparse |
| 2 | **Operating Loops** | Explain what can be done (narrative router) | Operational, outward links |
| 3 | **Product** | Show real UI surfaces (visual proof) | Credible, restrained |
| 4 | **Trust** | Establish structural credibility | Authoritative, terse |
| 5 | **CTA** | Close the page cleanly | Direct, outcome-oriented |

Each section has exactly one job. If a section tries to do more than one, it is bloated and should be split or moved to a supporting page.

---

## 9. Mobile-First Rules

All spacing, padding, and typography values are **mobile-first**. Desktop values layer on via `sm:` / `md:` / `lg:` breakpoints.

### Root Container

```
overflow-x-hidden
```

Every page root must include `overflow-x-hidden` to prevent radial gradient positioned elements from causing horizontal scroll.

### Padding Scale

- `px-5` base → `sm:px-6` on content containers
- `p-6` base → `sm:p-8` → `md:p-10` on cards
- `py-16` base → `sm:py-28` on sections

### Typography Scale

- Hero heading starts at `text-[1.75rem] leading-[1.15]` → scales to `lg:text-[3.5rem]`
- Section headings start at `text-3xl` → `sm:text-4xl`
- These are floor values, not maximum — never go below them

### Buttons

- `w-full sm:w-auto` on CTA buttons
- `flex-col items-stretch` → `sm:flex-row sm:items-center sm:justify-center` for button groups

### Product Tab Selector

- Horizontal scroll on mobile: `overflow-x-auto` with hidden scrollbar
- Scrollbar hiding: `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden`
- Tabs use `flex-shrink-0` + `whitespace-nowrap` for clean horizontal slide

### Product Panel

- `aspect-[4/3]` on mobile → `sm:aspect-[16/10]` on desktop
- Taller mobile ratio prevents content from being squeezed

### Proof Strip / Meta Lists

- Stack vertically on mobile: `flex-col sm:flex-row`
- Reduce gaps: `gap-y-2` on mobile → `sm:gap-y-3`
- Reduce top margin: `mt-10 sm:mt-16`

### Grid Cards

- All gap-px grids remain single-column on mobile (no `grid-cols-*` until `sm:`)
- Card padding reduces to `p-6` on mobile

### Testing

Verify at 320px, 375px, and 390px viewport widths. No horizontal scroll must appear.

---

## 10. Anti-Patterns (Do Not)

- Desktop-only spacing applied at base level (always start from mobile)
- `px-6` without `px-5` mobile base (1.5rem clips on 320px screens)
- Fixed aspect ratios that don't adapt (`aspect-[16/10]` without mobile alternative)
- Visible scrollbars on horizontal tab selectors
- `items-center` on mobile button groups (use `items-stretch` for full-width)
- Pure black (`#000000`) backgrounds — always use `#000212`
- Pure white (`#FFFFFF`) text — use `#F7F8F8`
- Inter, Roboto, Arial, system fonts — use DM Sans / JetBrains Mono
- Purple gradients — use cyan accent `hsl(189 94% 43%)`
- Hard divider lines between sections — use gradient bleed transitions
- Inline SVG icon clutter — let typography and spacing carry the hierarchy
- Feature-dump sections — each section has one job
- `border-white/10` (too bright) — use `border-white/[0.06]` or `border-white/[0.08]`
- Aggressive animations — one reveal per element, one-shot, no loops (except subtle background pulses)

---

## 11. Applying to New Surfaces

### Login / Auth Pages

- Same `#000212` ground, centered card with `rounded-2xl border-white/[0.06]`
- Logo + tagline above form
- Form inputs: `bg-white/[0.03] border-white/[0.08]` with focus ring `ring-accent/30`
- Primary submit button: pill glow pattern

### Drill-Down Pages (`/floor-oversight`, `/session-tracking`, etc.)

- Same nav, footer, background texture
- Hero: section-specific headline + subtitle (no badge, no CTAs)
- Content: mixed prose + product screenshots + feature detail cards
- CTA at bottom linking back to main or to contact

### Shared Components to Extract

When building the first supporting page, extract these from the exemplar:

1. `Reveal` component (intersection observer wrapper)
2. `GradientText` component (heading gradient treatment)
3. `GlassCard` component (bordered surface with hover glow)
4. `SectionHeader` component (label + gradient heading + subtitle)
5. `PillButton` variants (primary glow, secondary glass)
6. `LandingNav` component
7. `LandingFooter` component
