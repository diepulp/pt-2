---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality for PT-2 architecture. Use this skill when building web components, pages, or applications. Generates creative, polished code that follows PT-2 technical standards (React 19, Next.js App Router, Tailwind v4, shadcn/ui) while avoiding generic AI aesthetics.
license: Complete terms in LICENSE.txt
---

This skill guides creation of distinctive, production-grade frontend interfaces for the PT-2 project that avoid generic "AI slop" aesthetics while adhering to PT-2's technical architecture.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## PT-2 Architecture Context

**IMPORTANT**: This project follows specific technical standards. Before implementing any frontend code, consult the reference files:

- **`references/ADR-003-state-management-strategy.md`** - **AUTHORITATIVE** state management strategy (TanStack Query v5, Zustand, query key factories, cache invalidation, real-time)
- **`references/pt2-technical-standards.md`** - Technology stack requirements (React 19, Next.js App Router, Tailwind v4, shadcn/ui)
- **`references/pt2-architecture-integration.md`** - Service layer integration, DTOs, Server Actions, data patterns

**Quick Technical Requirements**:
- ✅ React 19 with App Router (NOT Pages Router)
- ✅ Tailwind CSS v4 utilities (NOT inline styles or v3 syntax)
- ✅ shadcn/ui components (copy-paste from registry)
- ✅ Server Actions for mutations (NOT fetch to API routes)
- ✅ TanStack Query for client-side data
- ✅ TypeScript strict mode

Read the reference files when technical implementation details are needed.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.

## Implementation Workflow for PT-2

Follow this workflow when building frontend interfaces for PT-2:

### 1. Understand Requirements & Design Direction
- Clarify the component/page purpose and audience
- Choose a bold aesthetic direction (see "Design Thinking" above)
- Identify any specific PT-2 domain context (players, visits, loyalty, etc.)

### 2. Consult Technical Standards

**Read `references/ADR-003-state-management-strategy.md` FIRST** (authoritative):
- TanStack Query v5 configuration and patterns
- Query key factories (REQUIRED - never hardcode keys)
- Cache invalidation strategies (hierarchical, direct updates)
- Pagination patterns (`placeholderData`, Infinite Query)
- Real-time → cache reconciliation (Supabase subscriptions)
- Zustand for ephemeral UI state only
- Mutation retry policies and idempotency

**Then read `references/pt2-technical-standards.md` for**:
- Tailwind v4 configuration and custom utilities
- shadcn/ui component installation and usage
- React 19 patterns (Server Actions, useActionState, useOptimistic)
- Performance requirements (virtualization, skeletons, staleTime)
- Code quality standards (ESLint, Prettier, testing)

### 3. Integrate with PT-2 Architecture
**Read `references/pt2-architecture-integration.md` for**:
- Choosing Server Component vs Client Component pattern
- Using service layer and DTOs correctly
- Implementing mutations with Server Actions
- Setting up TanStack Query with service keys
- Real-time data synchronization patterns
- Error handling with ServiceResult<T>

### 4. Implement with Creative Excellence
- Write production-grade code that follows PT-2 standards
- Apply your chosen aesthetic direction with precision
- Use shadcn/ui as foundation, customize for the aesthetic
- Ensure Tailwind v4 utilities create the desired visual impact
- Add animations and micro-interactions that delight

### 5. Verify Technical Compliance
- ✅ Uses Tailwind v4 syntax (not v3)
- ✅ Uses shadcn/ui components where appropriate
- ✅ Server Components for static content, Client Components for interactivity
- ✅ Server Actions for all mutations
- ✅ Service keys from `services/{domain}/keys.ts`
- ✅ DTOs imported from service types
- ✅ Lists > 100 items use virtualization
- ✅ Loading states use skeletons (not spinners)

### Common PT-2 Frontend Patterns

**Pattern: Interactive Data Table**
- Use shadcn/ui `<Table>` component
- Virtualize with `@tanstack/react-virtual` if > 100 rows
- Query data with TanStack Query + service keys
- Apply creative styling via Tailwind v4 utilities

**Pattern: Form with Server Action**
- Use shadcn/ui `<Form>` components
- Submit via Server Action with `useActionState`
- Show loading state during submission
- Style with bold, distinctive form design

**Pattern: Real-time Dashboard**
- Server Component for initial data
- Client Component with TanStack Query for interactivity
- Supabase subscription for real-time updates
- Invalidate queries on change events
- Creative, information-dense layout

**Pattern: Master-Detail View**
- Server Component for list (or Client + Query)
- Dynamic route for detail page `[id]/page.tsx`
- Prefetch on hover for instant navigation
- Distinctive visual hierarchy between list and detail

## Quick Reference: PT-2 + Aesthetics

Combine PT-2's technical requirements with exceptional design:

| Technical Requirement | Creative Opportunity |
|-----------------------|----------------------|
| Tailwind v4 utilities | Custom `@theme` tokens for distinctive color palettes |
| shadcn/ui components | Customize via Tailwind classes for unique visual identity |
| Server Actions | Loading states as micro-interaction moments |
| TanStack Query | Skeleton loading as part of aesthetic language |
| React 19 patterns | `useOptimistic` for delightful instant feedback |
| TypeScript strict | Type-safe design system tokens and variants |

## Resources Available

- **`references/ADR-003-state-management-strategy.md`** - **AUTHORITATIVE** state management ADR (TanStack Query v5, Zustand, patterns)
- **`references/pt2-technical-standards.md`** - Complete technical stack guide
- **`references/pt2-architecture-integration.md`** - Service integration patterns
- **PT-2 Documentation**: `docs/70-governance/FRONT_END_CANONICAL_STANDARD.md` (if deeper context needed)
- **shadcn/ui Registry**: https://ui.shadcn.com (for component installation)