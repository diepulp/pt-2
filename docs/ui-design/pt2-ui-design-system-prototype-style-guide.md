# PT-2 UI Design System – Prototype Style Guide (Monochrome + Accent)

> **Scope:** Starting point for the Casino Player Tracker prototype.  
> **Goal:** Provide a consistent, stylish, and ergonomic design system using a black/white + one-accent approach, aligned with modern UI/UX best practices.

---

## 1. Visual Direction: Monochrome + One Accent

We are intentionally starting with a **neutral monochrome base** plus **one accent color**. This reduces visual noise and lets us focus on hierarchy, spacing, and interaction quality.

### 1.1 Palette Strategy

- **Base:** Dark theme with off-black backgrounds and off-white text.
- **Neutrals:** A grayscale ramp for surfaces, borders, and muted text.
- **Accent (Single Primary):** Used sparingly for primary actions and key highlights.

#### Rationale

- Fewer colors → easier to keep the UI coherent.
- Accent immediately signals **“this is important / clickable / primary”**.
- Contrast and accessibility are simpler to manage in a constrained palette.

### 1.2 Suggested Base Color Candidates

You can adjust later, but for the prototype we standardize **one set** to avoid bikeshedding.

**Backgrounds (Dark):**

- `bg.default`: `#020617` (near-black, dark slate)
- `bg.subtle`: `#030712`
- `bg.raised`: `#020617` or `#0B1120`

**Text:**

- `text.primary`: `#F9FAFB`
- `text.muted`: `#9CA3AF`
- `text.inverted`: `#020617` (for badges on light / accent surfaces)

**Accent Options (pick ONE for v1):**

- **Teal/Cyan (tech + calm):** `#22D3EE`
- **Amber/Gold (casino vibes):** `#FBBF24`
- **Electric Blue (analytics/instrumentation):** `#3B82F6`

> **Rule:** In v1, use **ONE** accent color across the app. Do not introduce “secondary accents” yet.

### 1.3 60-30-10 Rule (Visual Weight)

- **60%**: Base background + primary surfaces (dark neutrals)
- **30%**: Secondary neutrals (panels, cards, borders, muted text)
- **10%**: Accent (buttons, links, key KPIs, selected states)

This keeps the UI visually calm and avoids “Christmas tree dashboards.”

---

## 2. Design Tokens: Foundation Before Screens

UI/UX professionals define **tokens** before designing screens. This gives us a shared vocabulary for both Figma and code.

### 2.1 Color Tokens

Define tokens abstractly, not as raw hex values in the interface:

```ts
// theme/colors.ts (conceptual)
export const colors = {
  bg: {
    default: '#020617',
    subtle: '#030712',
    raised: '#0B1120',
  },
  text: {
    primary: '#F9FAFB',
    muted: '#9CA3AF',
    inverted: '#020617',
  },
  border: {
    subtle: '#1F2933',
    strong: '#4B5563',
  },
  accent: {
    default: '#22D3EE',
    hover: '#06B6D4',
    subtle: '#0E7490',
  },
  status: {
    success: '#22C55E',
    warning: '#FACC15',
    danger: '#EF4444',
  },
}
```

Key ideas:

- Use **semantic names** (`bg.default`, `text.muted`) instead of hex codes in components.
- Keep the accent ramp small: default, hover, subtle/background.

### 2.2 Spacing: 8-Point Grid

Adopt an **8-point grid** system:

- Base unit: **4px** (micro adjustments)
- Primary steps: **8, 12, 16, 24, 32, 40, 48, 64**

Example spacing tokens:

```ts
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
}
```

Rules:

- Use multiples of 4/8 for margins, paddings, gaps, and heights.
- Avoid arbitrary values (13px, 19px); snap to the grid for visual rhythm.

### 2.3 Typography

Use a **single primary UI typeface** (e.g., Inter, System UI, SF Pro, Roboto). Later we can add a display font if needed.

Suggested type scale:

- `h1`: 32–36px, semi-bold
- `h2`: 24–28px, semi-bold
- `h3`: 20–22px, medium
- `body`: 14–16px, regular
- `label/small`: 12–13px, medium

With line heights:

- Headings: `1.2–1.3`
- Body: `1.4–1.6`

Example tokenization:

```ts
export const typography = {
  fontFamily: {
    base: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
  },
  size: {
    h1: 32,
    h2: 24,
    h3: 20,
    body: 14,
    bodyLg: 16,
    small: 12,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },
}
```

---

## 3. Accessibility & Ergonomics

Accessibility and ergonomics are **core quality gates**, not optional polish.

### 3.1 Contrast

- Aim for **WCAG AA** as a baseline:
  - Text vs background: **≥ 4.5:1** contrast ratio for normal text.
  - Large text (≥18px or ≥14px bold): **≥ 3:1**.
- Check:
  - `text.primary` on `bg.default`
  - `text.primary` on accent buttons
  - Disabled/muted states still readable (especially for critical data).

Use contrast checker tools during palette lock-in and whenever you add a new color combination.

### 3.2 Hit Areas & Comfort

- Minimum interactive target size: **40–44px** in at least one dimension.
- Do not pack destructive actions tightly next to primary actions.
  - Example: “Void slip” is physically separated from “Submit rating” by at least one spacing step and group boundary.

### 3.3 Dark Theme Ergonomics

- Avoid pure black `#000000` with pure white `#FFFFFF` pairs; they cause eye strain.
- Use slightly softened blacks and slightly softened whites (as suggested above).

---

## 4. Dashboard UX Patterns (Player Tracker Context)

The application is a **real-time-ish, data-heavy dashboard**. Design it like a professional control panel.

### 4.1 Hierarchy: From Overview to Detail

On core screens (e.g., Floor Overview, Player Detail, Table Detail):

1. **Top region:** 3–5 global KPIs (gaming day health, AOV, active tables, active players).
2. **Middle region:** Charts, trend widgets, aggregated metrics by area/table.
3. **Bottom region:** Detailed tables and logs (player sessions, rating slips, MTL entries).

Questions to check hierarchy:

- Where does the eye go first? (Should be the high-level KPIs and primary actions.)
- Is it obvious what the **current context** is (e.g., “Casino X / Gaming day 2025-12-02”)?

### 4.2 Layered Data Density

- **First layer (always visible):** Essential identifiers and a few key figures
  - Player: name, player ID, tier, current table, time at table.
  - Table: game type, limits, occupancy, current rating slip state.
- **Second layer (on demand):** Detailed histories, logs, breakdowns
  - Expandable sections, modals, hovers/tooltips for long explanations.

Rule of thumb: If the information is needed every minute, it belongs in layer one; otherwise, layer two.

### 4.3 Real-Time Behavior: Calm UI

- Avoid flashing or blinking updates.
- For numeric changes:
  - Brief highlight (e.g., subtle background tint or numeric color change for 0.5–1s) then fade back.
- Show a **“Last updated at HH:MM”** label in all real-time views.
- Allow toggling between:
  - **Auto-refresh** (for live monitoring).
  - **Manual refresh** (for deep, focused analysis).

---

## 5. Component & Layout Patterns

Standardizing a small set of components improves consistency and speed.

### 5.1 Core Components for the Prototype

1. **Button**
2. **Card / Panel**
3. **Input (text, select)**
4. **Table**
5. **Tag/Pill (status)**
6. **Toast / Inline Alert**
7. **Modal / Dialog**

#### Button – State Design

States:

- Default
- Hover
- Active/Pressed
- Focus (keyboard + mouse focus)
- Disabled
- Loading (optional)

Example semantic variants:

- `primary` – accent background, white text.
- `secondary` – neutral background, white text.
- `ghost` – transparent background, subtle border.
- `danger` – red background.

Focus should be visible **beyond** just color change (outline, glow, or offset shadow).

#### Card / Panel

Use cards for:

- Player summaries
- Table summaries
- KPI tiles

Visual guidance:

- Use `bg.raised` for cards.
- Apply consistent padding (e.g., `space.lg` = 16px).
- Subtle shadow or border; not both heavy at the same time.

#### Table

- Use sticky left column for identifiers (name, table ID).
- Right-align numeric columns for scan-ability.
- Use:
  - Subtle row dividers **or**
  - Alternating row backgrounds with low contrast difference.

### 5.2 Layout & Spacing Rules

- Use **CSS grid or flex** with gaps aligned to the 8-point system.
- Maintain consistent vertical rhythm between repeated sections:
  - Section headings to content: `space.lg` (16px) or `space.xl` (24px).
  - Cards within a grid: `space.lg` (16px) gap.

---

## 6. Interaction & Motion

Motion is part of the system, not decoration.

### 6.1 Duration & Easing

- Hover/focus transitions: **150–200ms**.
- Modals/toasts: **200–250ms**.
- Use easing curves that start quickly and end slowly (ease-out).
- Avoid overshooting, bouncing, or elaborate animations in core operational views.

### 6.2 Where to Use Motion

Use motion to:

- Confirm actions (button press → subtle scale or background shift).
- Indicate content changes (cards fading in/out, table rows updating).
- Guide navigation transitions.

Do **not**:

- Animate continuously in operational dashboards.
- Use auto-playing animations or carousels on critical views.

---

## 7. Iconography & State Language

Consistency in icon and state design drives perceived professionalism.

### 7.1 Icon System

- Use a single icon set (e.g., outline icons at ~1.5–2px stroke).
- Use icons to reinforce meaning, not replace labels.

Standard meanings:

- Checkmark + green → success/confirmed.
- Triangle + amber → warning/attention.
- Circle + red or stop icon → error/critical.

### 7.2 State Language

Define visual language for component states:

- **Default:** Neutral styling.
- **Hover:** Slight increase in contrast or elevation.
- **Active/Pressed:** Darker shade or inset shadow.
- **Focus:** High-contrast outline (e.g., 2px accent ring).
- **Disabled:** Lower contrast and no shadow/interaction.
- **Error:** Red border/background + clear messaging.

Document this per component (button, input, tag, table row).

---

## 8. Prototyping Workflow (Step-by-Step)

Use this as the **recommended workflow** when creating new screens or flows.

### Step 1 – Lock Tokens

- Agree on:
  - Color ramp (neutrals + one accent).
  - Spacing scale (8-point grid).
  - Type scale & line heights.
- Encode tokens in both:
  - Figma (or design tool of choice).
  - Code (Tailwind config/theme file).

### Step 2 – Grayscale Wireframes

- Design screens **only in grayscale**:
  - Layout, hierarchy, component placement.
- Build 3–4 core flows:
  - Floor Overview (casino-level view).
  - Player Detail.
  - Table Detail + rating slip lifecycle.
  - MTL/log audit view (if included in MVP).

### Step 3 – Hierarchy Review

- Eye-tracking test (manual):
  - What do you notice first? second? third?
- Ensure:
  - Context is clear (casino, gaming day, area).
  - Primary actions stand out even without color.

### Step 4 – Add Accent & States

- Apply accent to:
  - Primary buttons.
  - Key KPIs.
  - Interactive focus states.
- Add hover/press/focus states for all major components.

### Step 5 – Accessibility Pass

- Run contrast checks for all main combinations.
- Validate hit area sizes and spacing.
- Adjust tokens if any critical element fails readability or contrast.

### Step 6 – Implement in Code

- Map tokens to Tailwind (if using Tailwind):

```js
// tailwind.config.js (conceptual)
module.exports = {
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#020617',
          subtle: '#030712',
          raised: '#0B1120',
        },
        text: {
          primary: '#F9FAFB',
          muted: '#9CA3AF',
          inverted: '#020617',
        },
        accent: {
          DEFAULT: '#22D3EE',
          hover: '#06B6D4',
          subtle: '#0E7490',
        },
      },
      spacing: {
        1: 4,
        2: 8,
        3: 12,
        4: 16,
        6: 24,
        8: 32,
      },
      borderRadius: {
        lg: '12px',
        xl: '16px',
      },
    },
  },
}
```

- Create a minimal **component library** in the codebase:
  - `Button`, `Card`, `Input`, `Table`, `Tag`, `Modal`, `Toast`.
  - Enforce usage of tokens and variants within these components.

---

## 9. Summary: Design System Principles for the Prototype

1. **Constrain first, decorate later:** Monochrome + one accent, limited component set.
2. **Tokens before screens:** Colors, spacing, typography defined upfront.
3. **Dark, calm dashboard:** Optimized for long sessions and quick scanning.
4. **Hierarchical, layered information:** Overview → detail; essentials first, logs later.
5. **Accessible and ergonomic by design:** Contrast, hit areas, motion as quality gates.
6. **Small, opinionated components:** Button, Card, Input, Table, Tag, Toast, Modal as the core building blocks.
7. **Repeatability:** Same tokens and rules applied in both Figma and code to avoid drift.

This document should serve as the **stylistic foundation** for the PT-2 prototype. Any new screen, feature, or component should be able to justify itself against these principles and tokens before being accepted into the system.
