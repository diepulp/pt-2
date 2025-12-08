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
✅ React 19 + App Router (NOT Pages Router)
✅ Tailwind CSS v4 (NOT v3 syntax)
✅ shadcn/ui components via MCP (de-facto UI standard)
✅ Server Actions for mutations (NOT fetch to API routes)
✅ TanStack Query + service keys (NEVER hardcode keys)
✅ TypeScript strict mode
✅ Loading skeletons (NOT spinners)
✅ Lists > 100 items use virtualization
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

### Server Action + Form

```typescript
'use client'
import { useActionState } from 'react'
import { createPlayerAction } from '@/app/actions/player/create-player-action'

function CreateForm() {
  const [state, formAction, isPending] = useActionState(createPlayerAction, null)

  return (
    <form action={formAction}>
      <Input name="name" required />
      {state?.error && <Error>{state.error.message}</Error>}
      <Button disabled={isPending}>Create</Button>
    </form>
  )
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
