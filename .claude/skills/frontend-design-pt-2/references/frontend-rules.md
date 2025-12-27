# Frontend Design Rules

**Purpose**: Condensed rules for PT-2 frontend implementation.
**Source**: ADR-003, FRONT_END_CANONICAL_STANDARD, HOOKS_STANDARD

---

## Stack Requirements

| Technology | Version | Usage |
|------------|---------|-------|
| React | 19 | With Compiler (auto-optimization) |
| Next.js | App Router | Server/Client Components |
| Tailwind CSS | v4 | Utility-first styling |
| shadcn/ui | Latest | Copy-paste components |
| TanStack Query | v5 | Server state |
| Zustand | Latest | Ephemeral UI state |
| TypeScript | Strict | Type safety |

---

## State Management Boundaries

### TanStack Query (Server State)

```typescript
// REQUIRED: Use key factories
import { playerKeys } from '@/services/player/keys'

const { data } = useQuery({
  queryKey: playerKeys.detail(id),  // ✅ Factory
  // queryKey: ['player', id],      // ❌ Hardcoded
  queryFn: fetchPlayer,
  staleTime: 5 * 60 * 1000,
})
```

**Cache Timing**:
| Data Type | staleTime | gcTime |
|-----------|-----------|--------|
| Hot (live tables) | 30s | 5m |
| Warm (players, visits) | 5m | 30m |
| Cold (reports) | 30m | 1h |

### Zustand (UI State Only)

```typescript
// ✅ GOOD: Ephemeral UI state
const useUIStore = create<UIStore>()((set) => ({
  modal: { type: null, isOpen: false },
  openModal: (type, data) => set({ modal: { type, isOpen: true, data } }),
  sidebarCollapsed: false,
}))

// ❌ BAD: Server data in Zustand
const usePlayerStore = create()((set) => ({
  players: [],  // This should be in TanStack Query
}))
```

---

## Data Flow Patterns

### Pattern 1: Server Component (Default)

```typescript
// app/players/page.tsx
export default async function Page() {
  const supabase = await createClient()
  const service = createPlayerService(supabase)
  const result = await service.list()

  if (!result.success) return <Error error={result.error} />
  return <List data={result.data} />
}
```

### Pattern 2: Client + Server Action

```typescript
// Mutation via Server Action (NOT fetch)
const mutation = useMutation({
  mutationFn: createPlayerAction,  // ✅ Server Action
  // mutationFn: () => fetch('/api/players', { method: 'POST' }),  // ❌
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: playerKeys.lists() })
  },
})
```

### Pattern 3: Real-time Sync

```typescript
useEffect(() => {
  const channel = supabase
    .channel(`casino:${casinoId}:players`)
    .on('postgres_changes', { event: '*', table: 'player' }, () => {
      queryClient.invalidateQueries({
        queryKey: playerKeys.lists(),
        refetchType: 'active',  // Only active observers
      })
    })
    .subscribe()

  return () => channel.unsubscribe()
}, [casinoId])
```

---

## Performance Rules

### Lists > 100 Items

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

function VirtualList({ items }) {
  const parentRef = useRef(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 5,
  })
  // ... virtualized render
}
```

### Loading States

```typescript
// ✅ Layout-aware skeleton
function PlayerSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-4 bg-muted rounded w-3/4" />
      <div className="h-4 bg-muted rounded w-1/2" />
    </div>
  )
}

// ❌ Generic spinner
function Loading() {
  return <Spinner />  // Don't do this
}
```

---

## Type Safety Rules

### DTOs (REQUIRED)

```typescript
// ✅ Import from service
import type { PlayerDTO, CreatePlayerInput } from '@/services/player/types'

// ❌ Never use Database types directly
import type { Database } from '@/types/database.types'
type Player = Database['public']['Tables']['player']['Row']  // Don't
```

### ServiceResult Handling

```typescript
const result = await service.create(input)

if (!result.success) {
  // Handle error
  switch (result.error.code) {
    case 'VALIDATION_ERROR': ...
    case 'DUPLICATE_ENTRY': ...
    case 'UNAUTHORIZED': ...
  }
  return
}

// Use result.data
```

---

## React 19 Anti-Patterns (CRITICAL GUARDRAILS)

**These patterns cause regressions. NEVER use them.**

| Anti-Pattern | Why It's Wrong | Correct Pattern |
|--------------|----------------|-----------------|
| `useEffect` to sync state with props | Creates render loops, stale data, eslint-disable comments | Key-based reset or derived state |
| Manual `useState` for loading (`isSaving`) | Blocks UI, no concurrent rendering | `useTransition` with `isPending` |
| Mutations without optimistic updates | User waits for server confirmation | TanStack Query `onMutate` + rollback |
| `React.memo` on simple components | React 19 Compiler handles this | Remove unless profiled |
| `useMemo`/`useCallback` for trivial ops | Overhead without benefit | Direct computation or inline functions |
| Loading state props (`isSaving`, `isClosing`) | Prop drilling, component coupling | `useTransition` at action site |

### Key-Based Reset Pattern (Replaces useEffect Sync)

```typescript
// ❌ FORBIDDEN
useEffect(() => {
  setFormData(initialData)  // Sync anti-pattern
}, [initialData])

// ✅ CORRECT: Key-based reset forces remount
<ModalContent key={dataId} initialData={initialData} />
```

### TanStack Query Optimistic Updates

```typescript
const mutation = useMutation({
  mutationFn: updatePlayer,
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey: playerKeys.detail(id) })
    const previous = queryClient.getQueryData(playerKeys.detail(id))
    queryClient.setQueryData(
      playerKeys.detail(id),
      (old: PlayerDTO | undefined) => old ? { ...old, ...newData } : old
    )
    return { previous }
  },
  onError: (err, newData, context) => {
    if (context?.previous) {
      queryClient.setQueryData(playerKeys.detail(id), context.previous)
    }
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: playerKeys.detail(id) })
})
```

---

## React 19 Hooks

### Quick Reference

| Hook | Import | Purpose |
|------|--------|---------|
| `useTransition` | `react` | **Non-blocking async operations (MANDATORY for buttons)** |
| `useActionState` | `react` | Form state + pending + action |
| `useFormStatus` | `react-dom` | Nested submit button state |
| `useOptimistic` | `react` | Optimistic UI updates |
| `use()` | `react` | Read promises/context in render |

### useTransition (Non-Blocking Async — MANDATORY)

```typescript
import { useTransition } from 'react'

function SaveButton({ onSave }: { onSave: () => Promise<void> }) {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      disabled={isPending}
      onClick={() => startTransition(async () => await onSave())}
    >
      {isPending ? 'Saving...' : 'Save'}
    </Button>
  )
}
```

**REQUIRED for**: All async button clicks, saves, closes, navigation

### useActionState (Forms)

```typescript
// React 19: Returns [state, formAction, isPending]
const [state, formAction, isPending] = useActionState(serverAction, null)

<form action={formAction}>
  <Input name="name" required />
  {state?.errors?.name && <FieldError>{state.errors.name}</FieldError>}
  <Button disabled={isPending}>{isPending ? 'Saving...' : 'Save'}</Button>
</form>
```

### useFormStatus (Nested Submit)

```typescript
import { useFormStatus } from 'react-dom'

// MUST be inside <form> element
function SubmitButton({ children }) {
  const { pending } = useFormStatus()
  return <Button disabled={pending}>{pending ? 'Saving...' : children}</Button>
}
```

### useOptimistic (Idempotent Only)

```typescript
const [optimistic, addOptimistic] = useOptimistic(
  items,
  (state, newItem) => [...state, { ...newItem, pending: true }]
)

// Use in form action
async function handleSubmit(formData) {
  addOptimistic({ id: 'temp', text: formData.get('text'), pending: true })
  await createAction(formData)
}
```

### use() Hook (Read Resources in Render)

```typescript
import { use, Suspense } from 'react'

// Read promise in render (suspends until resolved)
function PlayerCard({ playerPromise }: { playerPromise: Promise<Player> }) {
  const player = use(playerPromise)  // Suspends here
  return <div>{player.name}</div>
}

// Wrap with Suspense
<Suspense fallback={<Skeleton />}>
  <PlayerCard playerPromise={fetchPlayer(id)} />
</Suspense>

// Conditional context read (new in React 19)
if (showTheme) {
  const theme = use(ThemeContext)  // Allowed conditionally!
}
```

### When to Use What

| Need | Solution |
|------|----------|
| Form with Server Action | `useActionState` |
| Reusable submit button | `useFormStatus` |
| Instant UI feedback | `useOptimistic` |
| One-time promise in render | `use()` + Suspense |
| Conditional context | `use(Context)` |
| Cached server data | TanStack Query |

---

## Forbidden Patterns

| Pattern | Issue | Fix |
|---------|-------|-----|
| `console.*` | Production noise | Remove or use logger |
| `as any` | Type safety bypass | Proper typing |
| `useEffect` to sync state with props | Render loops, stale data | Key-based reset or derived state |
| Manual `useState` for loading | Blocks UI, no concurrency | `useTransition` with `isPending` |
| `React.memo` on simple components | React 19 Compiler handles | Remove unless profiled |
| `useMemo`/`useCallback` for trivial ops | Overhead without benefit | Direct computation |
| Loading state props (`isSaving`) | Prop drilling, coupling | `useTransition` at action site |
| Mutations without optimistic updates | Slow perceived performance | TanStack Query `onMutate` |
| `eslint-disable exhaustive-deps` | Masking useEffect problems | Fix the pattern instead |
| Prop drilling > 2 levels | Poor composition | Context or Zustand |
| `fetch()` for mutations | Bypass Server Actions | Use Server Action |
| Inline styles | Inconsistent styling | Tailwind utilities |
| Pages Router | Deprecated pattern | App Router only |

---

## Aesthetic Guardrails

### Fonts to Avoid
- Inter, Roboto, Arial, system fonts
- Generic "safe" choices

### Colors to Avoid
- Purple gradients on white backgrounds
- Overused pastels without intention
- "Corporate blue" defaults

### Layouts to Avoid
- Predictable card grids
- Cookie-cutter dashboards
- Same layout every time

### Instead Do
- Choose distinctive display fonts
- Commit to a bold color palette
- Use unexpected layouts (asymmetry, overlap, diagonal flow)
- Add texture (noise, gradients, patterns)
