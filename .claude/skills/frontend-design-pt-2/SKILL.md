---
name: frontend-design-pt-2
description: Create distinctive, production-grade frontend interfaces with high design quality for PT-2 architecture. Use this skill when building web components, pages, or applications that require React 19, Next.js 15 App Router, Tailwind v4, or shadcn/ui. NOT for backend services, API routes, database migrations, or RLS policies.
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
| Implementation workflow, code templates | `references/QUICK_START.md` |
| State management (TanStack Query, Zustand) | `references/ADR-003-state-management-strategy.md` |
| Tailwind v4, shadcn setup, React 19 specifics | `references/pt2-technical-standards.md` |
| Service layer integration patterns | `references/pt2-architecture-integration.md` |
| Condensed technical rules checklist | `references/frontend-rules.md` |
| UI/UX design system and style guide | `references/pt2-ui-design-system-prototype-style-guide.md` |
| Session memory and pattern tracking | `references/memori-integration.md` |
| Context threshold and checkpoint management | `references/context-management.md` |

---

## Technical Requirements (Summary)

Full details in `references/pt2-technical-standards.md`.

- React 19 with App Router (NOT Pages Router)
- Next.js 15 with async params (`await params` required)
- Tailwind CSS v4 utilities (NOT v3 syntax)
- shadcn/ui components via MCP server
- Server Actions for mutations (NOT fetch to API routes)
- TanStack Query for client-side data
- TypeScript strict mode

### shadcn/ui Access

Use `mcp__shadcn__*` tools. Fallback to `mcp__magic__*` if registries unavailable.

```bash
# Core components
npx shadcn@latest add button dialog form table

# From registries: @aceternity, @originui, @kokonutui, @tweakcn
npx shadcn@latest add @aceternity/background-beams
```

---

## Design Thinking

Before coding, commit to a BOLD aesthetic direction:

1. **Purpose**: What problem does this interface solve? Who uses it?
2. **Tone**: Pick an extreme — brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful, editorial, brutalist, art deco, soft/pastel, industrial
3. **Constraints**: Framework, performance, accessibility requirements
4. **Differentiation**: What makes this UNFORGETTABLE?

**CRITICAL**: Choose a clear conceptual direction and execute with precision. Bold maximalism and refined minimalism both work — the key is intentionality.

---

## Aesthetic Guidelines

### Focus On

- **Typography**: Distinctive, characterful fonts. Avoid Inter/Roboto/Arial. Pair display font with refined body font.
- **Color**: Commit to a cohesive palette. Dominant colors with sharp accents outperform timid distributions.
- **Motion**: High-impact moments — orchestrated page load with staggered reveals, scroll-triggering, surprising hover states. CSS-first, Motion library for React when needed.
- **Spatial Composition**: Asymmetry, overlap, diagonal flow, grid-breaking elements, generous negative space OR controlled density.
- **Atmosphere**: Gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, grain overlays.

### Avoid AI Slop

- Generic fonts (Inter, Roboto, Arial, system fonts)
- Purple gradients on white backgrounds
- Predictable card layouts
- Cookie-cutter components lacking context-specific character

### Match Complexity to Vision

- Maximalist designs need elaborate code with extensive animations
- Minimalist designs need restraint, precision, careful spacing and typography
- Elegance comes from executing the vision well

---

## Implementation Workflow

See `references/QUICK_START.md` for complete workflow:

1. **Choose Pattern** — Server Component, Client + Query, Real-time, Forms
2. **Pick Aesthetic Direction** — One bold choice, not a safe blend
3. **Implementation Checklist** — Technical standards validation
4. **Code Templates** — Copy-paste patterns for each scenario
5. **Validate** — Type check, lint, test

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

Key patterns:
- `revalidateTag(tag)` for Server Component cache
- `queryClient.invalidateQueries()` for TanStack Query
- Supabase realtime subscriptions for push updates
- 250-500ms batching for list invalidations

---

## Anti-Patterns

| Anti-Pattern | Correct Pattern |
|--------------|-----------------|
| `fetch()` in Server Component | Direct service call |
| `fetch()` for mutations | Server Action |
| Hardcoded query keys | Key factories from `keys.ts` |
| Database types in components | DTOs from service |
| Spinners for loading | Layout-aware skeletons |
| `params.id` without await | `const { id } = await params` |

---

## Session Continuity

For long-running sessions approaching context limits:
- See `references/context-management.md` for checkpoint protocol
- Use `/frontend-checkpoint save` before `/clear`
- Use `/frontend-checkpoint restore` after `/clear`

For tracking design decisions across sessions:
- See `references/memori-integration.md` for memory recording
