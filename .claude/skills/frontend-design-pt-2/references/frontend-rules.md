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

## React 19 Hooks

### useActionState (Forms)

```typescript
const [state, formAction, isPending] = useActionState(serverAction, null)

<form action={formAction}>
  <Button disabled={isPending}>{isPending ? 'Saving...' : 'Save'}</Button>
  {state?.error && <Error>{state.error.message}</Error>}
</form>
```

### useOptimistic (Idempotent Only)

```typescript
const [optimistic, addOptimistic] = useOptimistic(
  items,
  (state, newItem) => [...state, { ...newItem, pending: true }]
)
```

---

## Forbidden Patterns

| Pattern | Issue | Fix |
|---------|-------|-----|
| `console.*` | Production noise | Remove or use logger |
| `as any` | Type safety bypass | Proper typing |
| Manual `useMemo`/`useCallback` | React Compiler handles | Remove unless profiled |
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
