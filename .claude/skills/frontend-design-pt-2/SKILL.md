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
| Implementation workflow, code templates | `references/QUICK_START.md` |
| React 19 hooks (`use()`, `useActionState`, `useOptimistic`) | `references/frontend-rules.md` → React 19 Hooks |
| State management (TanStack Query, Zustand) | `references/ADR-003-state-management-strategy.md` |
| Tailwind v4, shadcn setup, React 19 specifics | `references/pt2-technical-standards.md` |
| Service layer integration patterns | `references/pt2-architecture-integration.md` |
| Condensed technical rules checklist | `references/frontend-rules.md` |
| UI/UX design system and style guide | `references/pt2-ui-design-system-prototype-style-guide.md` |
| **Layout strategy, panels, modals, click-reduction** | `references/pt2-layout-strategy.md` |
| Session memory and pattern tracking | `references/memori-integration.md` |
| Context threshold and checkpoint management | `references/context-management.md` |

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

## React 19 Patterns (CRITICAL)

React 19 introduces new hooks and patterns. **Use these idiomatically**.

### Core React 19 Hooks

| Hook | Purpose | When to Use |
|------|---------|-------------|
| `useActionState` | Form state + pending + action | All Server Action forms |
| `useFormStatus` | Nested submit button state | Reusable submit components |
| `useOptimistic` | Optimistic UI updates | Idempotent operations only |
| `use()` | Read promises/context in render | Async data in Client Components |

### `use()` Hook — Read Resources in Render

```typescript
'use client'
import { use, Suspense } from 'react'

// use() unwraps promises directly in render
function PlayerDetails({ playerPromise }: { playerPromise: Promise<Player> }) {
  const player = use(playerPromise)  // Suspends until resolved
  return <div>{player.name}</div>
}

// Parent passes promise, child uses Suspense
function PlayerPage({ id }: { id: string }) {
  const playerPromise = fetchPlayer(id)  // Start fetching immediately
  return (
    <Suspense fallback={<PlayerSkeleton />}>
      <PlayerDetails playerPromise={playerPromise} />
    </Suspense>
  )
}

// use() also reads context conditionally
function ConditionalTheme({ showTheme }: { showTheme: boolean }) {
  if (showTheme) {
    const theme = use(ThemeContext)  // Allowed in React 19!
    return <div style={{ color: theme.primary }}>Themed</div>
  }
  return <div>Default</div>
}
```

### `useActionState` — Server Action Forms

```typescript
'use client'
import { useActionState } from 'react'

function CreatePlayerForm() {
  // Returns: [state, formAction, isPending]
  const [state, formAction, isPending] = useActionState(
    createPlayerAction,
    null  // Initial state
  )

  return (
    <form action={formAction}>
      <Input name="name" required />
      <Input name="email" type="email" required />

      {/* Field-level errors from state */}
      {state?.errors?.name && <FieldError>{state.errors.name}</FieldError>}

      {/* Form-level errors */}
      {state?.error && <FormError>{state.error.message}</FormError>}

      {/* Success feedback */}
      {state?.success && <SuccessMessage>Player created!</SuccessMessage>}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Player'}
      </Button>
    </form>
  )
}
```

### `useFormStatus` — Nested Submit Components

```typescript
'use client'
import { useFormStatus } from 'react-dom'

// Must be INSIDE a <form> element
function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending, data, method, action } = useFormStatus()

  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving...' : children}
    </Button>
  )
}

// Usage in form
function PlayerForm() {
  return (
    <form action={createPlayerAction}>
      <Input name="name" />
      <SubmitButton>Create Player</SubmitButton>  {/* Gets pending state */}
    </form>
  )
}
```

### `useOptimistic` — Instant UI Feedback

```typescript
'use client'
import { useOptimistic } from 'react'

function TodoList({ todos }: { todos: Todo[] }) {
  const [optimisticTodos, addOptimistic] = useOptimistic(
    todos,
    (state, newTodo: Todo) => [...state, { ...newTodo, pending: true }]
  )

  async function handleAdd(formData: FormData) {
    const text = formData.get('text') as string
    // Show immediately
    addOptimistic({ id: 'temp', text, pending: true })
    // Then persist
    await createTodoAction({ text })
  }

  return (
    <form action={handleAdd}>
      <Input name="text" />
      <Button type="submit">Add</Button>
      <ul>
        {optimisticTodos.map(todo => (
          <li key={todo.id} className={todo.pending ? 'opacity-50' : ''}>
            {todo.text}
          </li>
        ))}
      </ul>
    </form>
  )
}
```

### Server Action Patterns

```typescript
// app/actions/player/create-player-action.ts
'use server'
import { revalidateTag, updateTag } from 'next/cache'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
})

export type CreatePlayerState = {
  success?: boolean
  error?: { message: string }
  errors?: { name?: string; email?: string }
}

export async function createPlayerAction(
  prevState: CreatePlayerState | null,
  formData: FormData
): Promise<CreatePlayerState> {
  // 1. Parse and validate
  const parsed = schema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
  })

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
    }
  }

  // 2. Execute mutation
  const result = await createPlayer(parsed.data)

  if (!result.success) {
    return { error: result.error }
  }

  // 3. Invalidate cache
  revalidateTag('players', 'max')  // Next.js 16 stale-while-revalidate

  return { success: true }
}
```

### shadcn/ui Access

Use `mcp__shadcn__*` tools. Fallback to `mcp__magic__*` if registries unavailable.

```bash
# Core components
npx shadcn@latest add button dialog form table

# From registries: @aceternity, @originui, @kokonutui, @tweakcn
npx shadcn@latest add @aceternity/background-beams
```

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
