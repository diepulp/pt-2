# Frontend Design - Quick Start

**Purpose**: Single entry point for creating distinctive, production-grade PT-2 interfaces.
**Read this first**, then reference other docs only as needed.

---

## Step 1: Choose Pattern

| Scenario | Pattern | Key Files |
|----------|---------|-----------|
| Static page load | Server Component | Direct service call |
| Interactive view | Client + TanStack Query | `keys.ts`, Server Action |
| Real-time updates | Supabase subscription | Cache invalidation |
| Form submission | Server Action + useActionState | `actions/{domain}/` |
| Large list (100+ items) | Virtualized list | `@tanstack/react-virtual` |

---

## Step 2: Pick Aesthetic Direction

**CRITICAL**: Choose ONE bold direction, not a safe blend.

**Reference**: `.claude/skills/frontend-design-pt-2/references/pt2-ui-design-system-prototype-style-guide.md` for UI/UX design system

| Direction | Characteristics |
|-----------|-----------------|
| Brutalist | Raw, exposed structure, monospace, harsh contrasts |
| Minimalist | Generous whitespace, typography-focused, subtle details |
| Maximalist | Dense information, layered textures, bold colors |
| Editorial | Magazine-inspired, strong typography hierarchy, grids |
| Retro-futuristic | Sci-fi inspired, neon accents, geometric shapes |

**Avoid AI Slop**:
- ❌ Inter/Roboto/Arial fonts
- ❌ Purple gradients on white
- ❌ Predictable card layouts
- ❌ Cookie-cutter components

---

## Step 3: Implementation Checklist

### Technical Standards (REQUIRED)

```
✅ React 19 + Next.js 16 App Router (NOT Pages Router)
✅ Tailwind CSS v4 (NOT v3 syntax)
✅ shadcn/ui components via MCP (de-facto UI standard)
✅ Server Actions for mutations (NOT fetch to API routes)
✅ TanStack Query + service keys (NEVER hardcode keys)
✅ TypeScript strict mode
✅ Loading skeletons (NOT spinners)
✅ Lists > 100 items use virtualization
✅ Dynamic params MUST be awaited (Next.js 16)
✅ Use cacheTag + revalidateTag('tag', 'max') for cache (Next.js 16)
```

### shadcn UI via MCP Server

Use `mcp__shadcn__*` tools to access components. Registries configured in `components.json`:

| Registry | Use Case |
|----------|----------|
| Default shadcn/ui | Core components (Button, Dialog, Form, Table) |
| @aceternity | Animated backgrounds, hero effects |
| @originui, @tweakcn | Alternative component variants |
| @shadcnui-blocks | Pre-built page layouts |
| @kokonutui | Extended component collection |

```bash
npx shadcn@latest add button dialog        # default registry
npx shadcn@latest add @aceternity/sparkles # from aceternity
```

### State Management Rules

| State Type | Solution |
|------------|----------|
| Server data | TanStack Query v5 |
| UI state (modals, toggles) | Zustand |
| Shareable filters | URL params |
| Form state | useActionState |

---

## Step 4: Code Templates

### Server Component (Default)

```typescript
// app/{domain}/page.tsx
import { createClient } from '@/lib/supabase/server'
import { createPlayerService } from '@/services/player'

export default async function PlayersPage() {
  const supabase = await createClient()
  const service = createPlayerService(supabase)
  const result = await service.list()

  if (!result.success) return <ErrorDisplay error={result.error} />
  return <PlayersList initialPlayers={result.data} />
}
```

### Dynamic Route Page (Next.js 16)

```typescript
// app/{domain}/[id]/page.tsx
// IMPORTANT: params is now a Promise in Next.js 16

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>  // Promise type required
}) {
  const { id } = await params  // MUST await params

  const supabase = await createClient()
  const service = createPlayerService(supabase)
  const result = await service.getById(id)

  if (!result.success) return <ErrorDisplay error={result.error} />
  return <PlayerDetails player={result.data} />
}
```

### Client Component + Query

```typescript
'use client'
import { useQuery } from '@tanstack/react-query'
import { playerKeys } from '@/services/player/keys'

function InteractiveList() {
  const { data, isLoading } = useQuery({
    queryKey: playerKeys.list(),
    queryFn: fetchPlayers,
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <ListSkeleton />
  return <List data={data} />
}
```

### React 19 `use()` Hook — Async Data in Client Components

```typescript
'use client'
import { use, Suspense } from 'react'

// use() unwraps promises directly in render (suspends until resolved)
function PlayerCard({ playerPromise }: { playerPromise: Promise<Player> }) {
  const player = use(playerPromise)  // React 19: read promise in render
  return (
    <Card>
      <CardHeader>{player.name}</CardHeader>
      <CardContent>{player.email}</CardContent>
    </Card>
  )
}

// Parent initiates fetch, passes promise to child
function PlayerSection({ playerId }: { playerId: string }) {
  // Start fetching immediately (before render)
  const playerPromise = fetchPlayer(playerId)

  return (
    <Suspense fallback={<PlayerSkeleton />}>
      <PlayerCard playerPromise={playerPromise} />
    </Suspense>
  )
}

// use() can also read context conditionally (new in React 19)
function ConditionalAuth() {
  const isLoggedIn = useIsLoggedIn()
  if (isLoggedIn) {
    const user = use(UserContext)  // Conditional context read allowed!
    return <UserProfile user={user} />
  }
  return <LoginPrompt />
}
```

**When to use `use()` vs TanStack Query:**
| Scenario | Solution |
|----------|----------|
| One-time async data in render | `use()` with Suspense |
| Cached data with refetch/mutations | TanStack Query |
| Conditional context reading | `use(Context)` |
| Server data with complex state | TanStack Query |

### Server Action + Form (React 19 / Next.js 16)

```typescript
'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createPlayerAction } from '@/app/actions/player/create-player-action'

function CreateForm() {
  // React 19: useActionState returns [state, formAction, pending]
  const [state, formAction, isPending] = useActionState(createPlayerAction, null)

  return (
    <form action={formAction}>
      <Input name="name" required />
      {state?.error && <Error>{state.error.message}</Error>}
      <Button disabled={isPending}>
        {isPending ? 'Creating...' : 'Create'}
      </Button>
    </form>
  )
}

// Alternative: useFormStatus for nested submit buttons
function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving...' : children}
    </Button>
  )
}
```

### Server Action with Cache Revalidation (Next.js 16)

```typescript
// app/actions/player/create-player-action.ts
'use server'
import { revalidateTag, updateTag } from 'next/cache'

export async function createPlayerAction(prevState: unknown, formData: FormData) {
  const result = await createPlayer({
    name: formData.get('name') as string,
  })

  if (result.success) {
    // Next.js 16: Use 'max' profile for stale-while-revalidate
    revalidateTag('players', 'max')
  }

  return result
}

// For immediate expiration (read-your-own-writes):
export async function updatePlayerAction(id: string, formData: FormData) {
  const result = await updatePlayer(id, formData)

  if (result.success) {
    // Next.js 16: updateTag for immediate cache expiration
    updateTag('players')
    updateTag(`player-${id}`)
  }

  return result
}
```

---

## Step 5: Validate

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Test component
npm test -- --grep "ComponentName"
```

### Pre-Completion Checklist

- [ ] Aesthetic is distinctive (not generic AI)
- [ ] Tailwind v4 syntax used (`shadow-xs` not `shadow-sm`)
- [ ] Service keys from `services/{domain}/keys.ts`
- [ ] DTOs from service types (not Database types)
- [ ] Loading states use skeletons
- [ ] Large lists virtualized
- [ ] Error states handled with ServiceResult

---

## Quick Reference: Tailwind v4 Changes

| v3 | v4 | Reason |
|----|-----|--------|
| `shadow-sm` | `shadow-xs` | Scale consistency |
| `shadow` | `shadow-sm` | Scale consistency |
| `outline-none` | `outline-hidden` | Accessibility |
| `@layer` | `@utility` | New directive |

---

## Quick Reference: Next.js 16 Breaking Changes

| Before (Next.js 15) | After (Next.js 16) | Notes |
|--------------------|--------------------|-------|
| `params: { id: string }` | `params: Promise<{ id: string }>` | Must `await params` |
| `unstable_cacheTag` | `cacheTag` | Stable API (no prefix) |
| `revalidateTag(tag)` | `revalidateTag(tag, 'max')` | Stale-while-revalidate semantics |
| N/A | `updateTag(tag)` | Immediate cache expiration |
| `middleware.ts` | `proxy.ts` | Renamed convention |
| `[state, formAction]` | `[state, formAction, pending]` | useActionState returns pending |

---

## Anti-Patterns

| Anti-Pattern | Correct Pattern |
|--------------|-----------------|
| `fetch()` in Server Component | Direct service call |
| `fetch()` for mutations | Server Action |
| Hardcoded query keys | Key factories from `keys.ts` |
| Database types in components | DTOs from service |
| Spinners for loading | Layout-aware skeletons |
| `console.*` in production | Remove or use logger |
| Manual memoization | Trust React Compiler |
| `params.id` without await | `const { id } = await params` (Next.js 16) |
| `revalidateTag(tag)` alone | `revalidateTag(tag, 'max')` for stale-while-revalidate |
| Manual cache expiration | `updateTag(tag)` for immediate invalidation |

---

## Need More Detail?

| Topic | Reference |
|-------|-----------|
| State management (TanStack Query, Zustand) | `ADR-003-state-management-strategy.md` |
| Technical stack specifics | `pt2-technical-standards.md` |
| Service layer integration | `pt2-architecture-integration.md` |
| Full frontend standard | `docs/70-governance/FRONT_END_CANONICAL_STANDARD.md` |
| Event catalog & cache invalidation | `docs/35-integration/INT-002-event-catalog.md` |
| Real-time strategy | `docs/80-adrs/ADR-004-real-time-strategy.md` |
