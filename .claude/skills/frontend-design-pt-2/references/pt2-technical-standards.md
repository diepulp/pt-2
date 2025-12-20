# PT-2 Frontend Technical Standards

**Source**: `docs/70-governance/FRONT_END_CANONICAL_STANDARD.md` v2.1
**Stack**: React 19 + **Next.js 16** App Router + Tailwind CSS v4 + TypeScript + shadcn/ui

---

## Technology Stack (REQUIRED)

### Core Technologies
- **React 19** with React Compiler (automatic optimizations)
- **Next.js 16 App Router** (not Pages Router)
- **TypeScript** (strict mode enabled)
- **Tailwind CSS v4** (utility-first styling)
- **shadcn/ui** component library (copy-paste, not npm package)

### State Management
- **TanStack Query v5** - Server state (fetched data, async cache)
- **Zustand** - Ephemeral UI state (modals, wizards, toggles)
- **URL state** - Shareable filters and canonical views

### Data Fetching Patterns
- **Server Components**: Direct service layer access (default, preferred)
- **Client Components**: TanStack Query for interactive views
- **Mutations**: Server Actions (not fetch to API routes)
- **Real-time**: Supabase subscriptions + TanStack Query cache invalidation

---

## Tailwind CSS v4 Configuration

### Installation & Setup

```bash
npm install tailwindcss@next @tailwindcss/postcss@next
```

```json
// package.json
{
  "postcss": {
    "plugins": {
      "@tailwindcss/postcss": {}
    }
  }
}
```

### Global Styles Pattern

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  /* Custom design tokens */
  --color-primary: #3b82f6;
  --color-secondary: #8b5cf6;
  --color-accent: #f59e0b;

  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'Fira Code', ui-monospace, monospace;

  --spacing-xs: 0.5rem;
  --spacing-sm: 0.75rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
}

/* Custom utilities */
@utility container {
  margin-inline: auto;
  padding-inline: 2rem;
  max-width: 1280px;
}
```

### Important v4 Changes

| v3 | v4 | Reason |
|----|-----|--------|
| `shadow-sm` | `shadow-xs` | Scale consistency |
| `shadow` | `shadow-sm` | Scale consistency |
| `outline-none` | `outline-hidden` | Accessibility clarity |

### Utility-First Principles
- Compose utilities directly in JSX
- Use `@utility` directive for custom utilities (NOT `@layer` from v3)
- Auto-purging of unused styles (no manual config)
- Dark mode via `dark:` variant

---

## shadcn/ui Component Library (De-facto Standard)

**shadcn/ui is the de-facto UI standard for PT-2.** Access via MCP server (`mcp__shadcn__*` tools).

### MCP Server Access

```bash
# Available MCP tools
mcp__shadcn__list_components    # Browse available components
mcp__shadcn__get_component      # Get component details/code
mcp__shadcn__install_component  # Install to project
```

### Installation

```bash
npx shadcn@latest init
npx shadcn@latest add button form dialog table
```

### Registered Registries (components.json)

PT-2 has multiple component registries configured:

| Registry | URL | Purpose |
|----------|-----|---------|
| **shadcn/ui** | `https://ui.shadcn.com` | Core components (default) |
| **@aceternity** | `https://ui.aceternity.com` | Animated effects, backgrounds |
| **@originui** | `https://originui.com` | Alternative variants |
| **@shadcnui-blocks** | `https://shadcnui-blocks.com` | Pre-built page blocks |
| **@kokonutui** | `https://kokonutui.com` | Extended components |
| **@tweakcn** | `https://tweakcn.com` | Customized variants |

```bash
# Install from registries
npx shadcn@latest add button                    # default
npx shadcn@latest add @aceternity/background-beams
npx shadcn@latest add @kokonutui/card
```

### Why shadcn/ui
- **Copy-paste approach**: Full control over component code
- **Tailwind-native**: Integrates seamlessly with Tailwind v4
- **TypeScript-first**: Fully typed components
- **Customizable**: Modify components directly in your codebase
- **Production-ready**: Accessible, performant, well-tested
- **Multiple registries**: Extended options via @aceternity, @originui, etc.

### Component Usage Pattern

```typescript
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { Form, FormField, FormItem, FormLabel } from "@/components/ui/form"

function PlayerForm() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="default">Add Player</Button>
      </DialogTrigger>
      <DialogContent>
        <Form>
          <FormField name="name">
            <FormLabel>Player Name</FormLabel>
            {/* form controls */}
          </FormField>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

### Registry Selection Guide

- **Core UI** → Default shadcn/ui (Button, Input, Dialog, Table, etc.)
- **Distinctive aesthetics** → @aceternity (animated backgrounds, hero effects)
- **Style variants** → @originui, @tweakcn
- **Page layouts** → @shadcnui-blocks
- **Additional components** → @kokonutui

---

## Next.js 16 + React 19 Patterns

### Server Actions (REQUIRED for mutations)

```typescript
// app/actions/player/create-player-action.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { withServerAction } from '@/lib/server-actions/with-server-action-wrapper'
import { createPlayerService } from '@/services/player'
import { revalidateTag } from 'next/cache'

export async function createPlayerAction(input: CreatePlayerInput) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  const result = await withServerAction(
    async () => {
      const playerService = createPlayerService(supabase)
      return playerService.create(input)
    },
    supabase,
    {
      action: 'create_player',
      userId: session?.user?.id,
      entity: 'player',
      metadata: { email: input.email }
    }
  )

  // Next.js 16: Revalidate with stale-while-revalidate
  revalidateTag('players', 'max')
  return result
}
```

### Dynamic Route Params (Next.js 16 Breaking Change)

```typescript
// Next.js 16: params is now a Promise - MUST await
export default async function PlayerPage({
  params,
}: {
  params: Promise<{ playerId: string }>
}) {
  const { playerId } = await params  // Required in Next.js 16

  const supabase = await createClient()
  const service = createPlayerService(supabase)
  const result = await service.getById(playerId)

  if (!result.success) return <ErrorDisplay error={result.error} />
  return <PlayerDetails player={result.data} />
}

// Layouts also receive params as Promise
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ casinoId: string }>
}) {
  const { casinoId } = await params
  return (
    <section>
      <CasinoHeader casinoId={casinoId} />
      {children}
    </section>
  )
}
```

### Next.js 16 Cache APIs (Stable)

```typescript
import { cacheTag, revalidateTag, updateTag } from 'next/cache'

// Tag cached data for invalidation
export async function getPlayers() {
  'use cache'
  cacheTag('players')
  const players = await db.query('SELECT * FROM players')
  return players
}

// unstable_cache still available for function-level caching
import { unstable_cache } from 'next/cache'

const getCachedPlayer = unstable_cache(
  async (playerId: string) => getPlayerById(playerId),
  ['player'],
  {
    tags: ['player'],
    revalidate: 3600,  // 1 hour
  }
)
```

### React 19 Hooks Reference

| Hook | Import | Purpose |
|------|--------|---------|
| `useActionState` | `react` | Form state + pending + action |
| `useFormStatus` | `react-dom` | Nested submit button state |
| `useOptimistic` | `react` | Optimistic UI updates |
| `use()` | `react` | Read promises/context in render |

```typescript
'use client'
import { use, useActionState, useOptimistic, Suspense } from 'react'
import { useFormStatus } from 'react-dom'
import { createPlayerAction } from '@/app/actions/player/create-player-action'

// useActionState returns [state, formAction, isPending] in React 19
function PlayerForm() {
  const [state, formAction, isPending] = useActionState(createPlayerAction, null)

  return (
    <form action={formAction}>
      <input name="email" type="email" required />
      <input name="name" required />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Player'}
      </button>
      {state?.error && <p className="text-red-500">{state.error.message}</p>}
    </form>
  )
}

// useFormStatus for nested submit buttons (must be inside <form>)
function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Submitting...' : 'Submit'}
    </button>
  )
}

// useOptimistic for instant UI feedback
function TodoList({ todos }: { todos: Todo[] }) {
  const [optimisticTodos, addOptimisticTodo] = useOptimistic(
    todos,
    (state, newTodo: string) => [...state, { id: 'temp', text: newTodo, pending: true }]
  )

  async function formAction(formData: FormData) {
    const text = formData.get('text') as string
    addOptimisticTodo(text)
    await createTodoAction({ text })
  }

  return (
    <form action={formAction}>
      <input name="text" required />
      <button>Add</button>
    </form>
  )
}

// use() hook — read promises directly in render (React 19)
function PlayerDetails({ playerPromise }: { playerPromise: Promise<Player> }) {
  const player = use(playerPromise)  // Suspends until resolved
  return <div>{player.name}</div>
}

// Parent wraps with Suspense
function PlayerPage({ id }: { id: string }) {
  const playerPromise = fetchPlayer(id)  // Start fetch immediately
  return (
    <Suspense fallback={<PlayerSkeleton />}>
      <PlayerDetails playerPromise={playerPromise} />
    </Suspense>
  )
}

// use() can read context conditionally (new in React 19)
function ConditionalTheme({ showTheme }: { showTheme: boolean }) {
  if (showTheme) {
    const theme = use(ThemeContext)  // Conditional context read allowed!
    return <div style={{ color: theme.primary }}>Themed</div>
  }
  return <div>Default</div>
}
```

### Streaming with Suspense (Next.js 16)

```typescript
import { Suspense } from 'react'
import { PlayerListSkeleton } from '@/components/skeletons'

export default function PlayersPage() {
  return (
    <div>
      {/* Static content renders immediately */}
      <header>
        <h1>Player Management</h1>
      </header>

      {/* Dynamic content streams when ready */}
      <Suspense fallback={<PlayerListSkeleton />}>
        <PlayerList />
      </Suspense>
    </div>
  )
}

// Async Server Component - data fetches on server
async function PlayerList() {
  const supabase = await createClient()
  const service = createPlayerService(supabase)
  const result = await service.list()

  if (!result.success) return <ErrorDisplay error={result.error} />
  return <PlayersTable players={result.data} />
}
```

---

## Performance Requirements

### UX Patterns (REQUIRED)

| Pattern | Requirement | Implementation |
|---------|-------------|----------------|
| **Lists > 100 items** | MUST use virtualization | `@tanstack/react-virtual` |
| **Loading states** | Use layout-aware skeletons | NOT spinners |
| **Data caching** | Configure `staleTime` by volatility | Hot (30s), Warm (5m), Cold (30m) |
| **Detail views** | Prefetch on hover | TanStack Query prefetching |
| **Optimistic updates** | ONLY for idempotent operations | Low conflict risk |

### Example: Virtualized List

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

function PlayerList({ players }: { players: Player[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: players.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 5,
  })

  return (
    <div ref={parentRef} className="h-[600px] overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map(virtualRow => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <PlayerCard player={players[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

### Example: Loading Skeleton

```typescript
function PlayerSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <div className="h-4 bg-gray-200 rounded w-1/2" />
      <div className="h-20 bg-gray-200 rounded" />
    </div>
  )
}

function PlayerPage() {
  const { data: player, isLoading } = useQuery({
    queryKey: playerKeys.detail(playerId),
    queryFn: () => fetchPlayer(playerId),
  })

  if (isLoading) return <PlayerSkeleton />

  return <PlayerDetails player={player} />
}
```

---

## Code Quality Standards

### ESLint + Prettier (REQUIRED)

```javascript
// .eslintrc.js
module.exports = {
  extends: [
    'airbnb',
    'airbnb/hooks',
    'plugin:@typescript-eslint/recommended'
  ],
  rules: {
    'react-hooks/exhaustive-deps': 'error', // Authoritative
    'react/react-in-jsx-scope': 'off', // React 19 auto-imports
  }
}
```

```json
// .prettierrc
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

### React Compiler

**Default**: Rely on React Compiler for optimizations; avoid manual `useMemo`/`useCallback`/`memo` unless profiling shows measurable wins.

```javascript
// next.config.js
module.exports = {
  experimental: {
    reactCompiler: true
  }
}
```

---

## Testing Requirements

### Component Tests (React Testing Library)

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

describe('PlayerForm', () => {
  it('submits form with valid data', async () => {
    const onSubmit = vi.fn()
    render(<PlayerForm onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText(/name/i), 'John Doe')
    await userEvent.type(screen.getByLabelText(/email/i), 'john@example.com')
    await userEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'John Doe',
      email: 'john@example.com'
    })
  })
})
```

---

## Key Anti-Patterns to AVOID

❌ **DO NOT use**:
- Pages Router (use App Router only)
- Tailwind v3 syntax (`@layer`, old class names)
- `fetch()` in Server Components for internal data (use service layer directly)
- `fetch()` in Client Components for mutations (use Server Actions)
- Manual memoization without profiling evidence
- Prop drilling > 2 levels without Context/Zustand
- Inline styles (use Tailwind utilities)
- Spinners for loading states (use skeletons)
- Non-virtualized lists > 100 items

---

## Next.js 16 Breaking Changes Summary

| Change | Before (Next.js 15) | After (Next.js 16) |
|--------|--------------------|--------------------|
| **Dynamic params** | `params: { id: string }` | `params: Promise<{ id: string }>` + `await` |
| **Cache tags** | `unstable_cacheTag` | `cacheTag` (stable) |
| **Revalidation** | `revalidateTag(tag)` | `revalidateTag(tag, 'max')` for stale-while-revalidate |
| **Immediate invalidation** | N/A | `updateTag(tag)` for read-your-own-writes |
| **useActionState** | `[state, formAction]` | `[state, formAction, pending]` |

---

## Quick Reference Links

- **Next.js 16 Docs**: https://nextjs.org/docs/app
- **React 19 Docs**: https://react.dev
- **Tailwind CSS v4**: https://tailwindcss.com
- **shadcn/ui**: https://ui.shadcn.com
- **TanStack Query**: https://tanstack.com/query/latest
- **Zustand**: https://zustand.docs.pmnd.rs
- **PT-2 Full Standard**: `docs/70-governance/FRONT_END_CANONICAL_STANDARD.md`
