# PT-2 Architecture Integration Guide

**Purpose**: Connect frontend components to PT-2's service layer, DTOs, and data patterns
**Source**: SERVICE_TEMPLATE.md, SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md, DTO_CANONICAL_STANDARD.md

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend Layer (Your Components)                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Server Components          Client Components               │
│  ┌──────────────┐          ┌──────────────────┐           │
│  │ Direct call  │          │ TanStack Query   │           │
│  │ to service   │          │ + Server Actions │           │
│  └──────┬───────┘          └────────┬─────────┘           │
│         │                           │                       │
│         └───────────┬───────────────┘                       │
│                     │                                       │
├─────────────────────┼───────────────────────────────────────┤
│ Service Layer       │                                       │
├─────────────────────┼───────────────────────────────────────┤
│                     ▼                                       │
│          ┌──────────────────────┐                          │
│          │ Service Factory      │                          │
│          │ (Functional)         │                          │
│          │                      │                          │
│          │ • Supabase client    │                          │
│          │ • DTOs (types)       │                          │
│          │ • ServiceResult<T>   │                          │
│          └──────────┬───────────┘                          │
│                     │                                       │
├─────────────────────┼───────────────────────────────────────┤
│ Database Layer      │                                       │
├─────────────────────┼───────────────────────────────────────┤
│                     ▼                                       │
│          ┌──────────────────────┐                          │
│          │ Supabase             │                          │
│          │ (PostgreSQL + RLS)   │                          │
│          └──────────────────────┘                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Server Component Pattern (Preferred)

**When to use**: Static or streamed initial page load, no client interactivity needed

```typescript
// app/players/page.tsx (Server Component - default)
import { createClient } from '@/lib/supabase/server'
import { createPlayerService } from '@/services/player'

async function PlayersPage() {
  const supabase = await createClient()
  const playerService = createPlayerService(supabase)

  // ✅ Direct service layer access (no API route needed)
  const result = await playerService.list()

  if (!result.success) {
    return <ErrorDisplay error={result.error} />
  }

  // Pass data to Client Component if needed
  return <PlayersList initialPlayers={result.data} />
}

export default PlayersPage
```

**Key Points**:
- Server Components can call service layer directly
- No need for API routes for internal data
- Service returns `ServiceResult<T>` type
- Always handle error cases

---

## Client Component + TanStack Query Pattern

**When to use**: Interactive views, mutations, real-time updates, optimistic UI

### Query (Read)

```typescript
'use client'
import { useQuery } from '@tanstack/react-query'
import { playerKeys } from '@/services/player/keys'

function InteractivePlayers() {
  const { data: players, isLoading, error } = useQuery({
    queryKey: playerKeys.list(),
    queryFn: async () => {
      // Call API route (when Server Component not suitable)
      const response = await fetch('/api/players')
      if (!response.ok) throw new Error('Failed to fetch players')
      return response.json()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  if (isLoading) return <PlayersSkeleton />
  if (error) return <ErrorDisplay error={error} />

  return <PlayersList players={players} />
}
```

### Mutation (Write) - Use Server Actions

```typescript
'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createPlayerAction } from '@/app/actions/player/create-player-action'
import { playerKeys } from '@/services/player/keys'

function CreatePlayerForm() {
  const queryClient = useQueryClient()

  // ✅ Use Server Action (NOT fetch to API route)
  const createMutation = useMutation({
    mutationFn: createPlayerAction,
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: playerKeys.lists() })
    },
  })

  async function handleSubmit(formData: FormData) {
    const input = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
    }

    const result = await createMutation.mutateAsync(input)

    if (!result.success) {
      // Handle error
      toast.error(result.error.message)
    } else {
      toast.success('Player created!')
    }
  }

  return (
    <form action={handleSubmit}>
      <input name="name" required />
      <input name="email" type="email" required />
      <button type="submit" disabled={createMutation.isPending}>
        {createMutation.isPending ? 'Creating...' : 'Create Player'}
      </button>
    </form>
  )
}
```

---

## Service Layer Integration

### Service Structure

All PT-2 services follow this pattern:

```
services/{domain}/
├── keys.ts              # React Query key factories (REQUIRED)
├── {feature}.ts         # Service implementation
├── {feature}.test.ts    # Unit tests
└── README.md            # Service documentation
```

### Using Service Keys (REQUIRED)

**Never hardcode query keys**. Always use the service's key factory:

```typescript
// services/player/keys.ts (maintained by backend team)
export const playerKeys = {
  all: ['player'] as const,
  lists: () => [...playerKeys.all, 'list'] as const,
  list: (filters?: PlayerFilters) => [...playerKeys.lists(), filters] as const,
  details: () => [...playerKeys.all, 'detail'] as const,
  detail: (id: string) => [...playerKeys.details(), id] as const,
}

// ✅ GOOD: Use key factory
const { data } = useQuery({
  queryKey: playerKeys.detail(playerId),
  queryFn: () => fetchPlayer(playerId),
})

// ❌ BAD: Hardcoded keys
const { data } = useQuery({
  queryKey: ['player', playerId],
  queryFn: () => fetchPlayer(playerId),
})
```

### Working with DTOs

**DTOs are the contract** between service layer and frontend. Import DTOs from the service:

```typescript
// ✅ GOOD: Import DTO from service
import type { PlayerDTO, CreatePlayerInput } from '@/services/player/types'

// ❌ BAD: Manually redefine types or use Database types directly
type Player = Database['public']['Tables']['player']['Row'] // Don't do this
```

### ServiceResult Pattern

All service methods return `ServiceResult<T>`:

```typescript
type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } }

// Always handle both cases
const result = await playerService.create(input)

if (result.success) {
  console.log('Player created:', result.data)
} else {
  console.error('Error:', result.error.code, result.error.message)
}
```

---

## Real-time Data Pattern

**Integration**: Supabase subscriptions + TanStack Query cache invalidation

```typescript
'use client'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { playerKeys } from '@/services/player/keys'

function usePlayerRealtimeSync(casinoId: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const supabase = createClient()

    // Subscribe to player changes for this casino
    const channel = supabase
      .channel(`casino:${casinoId}:players`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'player',
          filter: `casino_id=eq.${casinoId}`,
        },
        (payload) => {
          // Invalidate queries to trigger refetch
          queryClient.invalidateQueries({
            queryKey: playerKeys.lists()
          })

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            // Optionally set query data directly for better UX
            queryClient.setQueryData(
              playerKeys.detail(payload.new.id),
              payload.new
            )
          }
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [casinoId, queryClient])
}

// Use in component
function PlayersPage() {
  const { casinoId } = useCasino()

  // Set up real-time sync
  usePlayerRealtimeSync(casinoId)

  // Normal TanStack Query usage
  const { data: players } = useQuery({
    queryKey: playerKeys.list(),
    queryFn: fetchPlayers,
  })

  return <PlayersList players={players} />
}
```

---

## API Route Pattern (When Server Component Not Suitable)

```typescript
// app/api/players/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPlayerService } from '@/services/player'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const playerService = createPlayerService(supabase)

  const result = await playerService.list()

  if (!result.success) {
    return NextResponse.json(
      { error: result.error.message },
      { status: 400 }
    )
  }

  return NextResponse.json(result.data)
}
```

**Note**: Prefer Server Components over API routes for internal data. Use API routes only when:
- Called from Client Components that can't use Server Actions
- Need to expose public API endpoints
- Integrating with external services

---

## Form Handling with Server Actions

### useActionState Pattern (Recommended)

```typescript
'use client'
import { useActionState } from 'react'
import { createPlayerAction } from '@/app/actions/player/create-player-action'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function CreatePlayerForm() {
  const [state, formAction, isPending] = useActionState(createPlayerAction, null)

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name">Name</label>
        <Input id="name" name="name" required />
      </div>

      <div>
        <label htmlFor="email">Email</label>
        <Input id="email" name="email" type="email" required />
      </div>

      {state?.error && (
        <p className="text-red-500 text-sm">{state.error.message}</p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Player'}
      </Button>
    </form>
  )
}
```

---

## Authentication Context

```typescript
'use client'
import { createContext, use } from 'react'
import { User } from '@supabase/supabase-js'

const AuthContext = createContext<{ user: User | null } | null>(null)

export function useAuth() {
  const context = use(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

// Usage in components
function ProtectedComponent() {
  const { user } = useAuth()

  if (!user) {
    return <SignInPrompt />
  }

  return <Dashboard user={user} />
}
```

---

## Common Integration Patterns

### Pattern 1: List View with Filters

```typescript
'use client'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { playerKeys } from '@/services/player/keys'

function PlayersPage() {
  // Filters from URL (shareable, canonical)
  const searchParams = useSearchParams()
  const filters = {
    status: searchParams.get('status') || 'active',
    search: searchParams.get('search') || '',
  }

  // Query with URL-derived filters
  const { data: players, isLoading } = useQuery({
    queryKey: playerKeys.list(filters),
    queryFn: () => fetchPlayers(filters),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <PlayersListSkeleton />

  return <PlayersList players={players} filters={filters} />
}
```

### Pattern 2: Master-Detail View

```typescript
'use client'
import { useQuery } from '@tanstack/react-query'
import { playerKeys } from '@/services/player/keys'

function PlayerDetailPage({ params }: { params: { id: string } }) {
  const { data: player, isLoading } = useQuery({
    queryKey: playerKeys.detail(params.id),
    queryFn: () => fetchPlayer(params.id),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <PlayerDetailSkeleton />
  if (!player) return <NotFound />

  return (
    <div>
      <PlayerHeader player={player} />
      <PlayerTransactions playerId={player.id} />
      <PlayerVisits playerId={player.id} />
    </div>
  )
}
```

### Pattern 3: Optimistic Update (Idempotent Only)

```typescript
'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updatePlayerAction } from '@/app/actions/player/update-player-action'
import { playerKeys } from '@/services/player/keys'

function UpdatePlayerForm({ player }: { player: PlayerDTO }) {
  const queryClient = useQueryClient()

  const updateMutation = useMutation({
    mutationFn: updatePlayerAction,

    // Optimistic update (safe because update is idempotent)
    onMutate: async (updatedData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: playerKeys.detail(player.id) })

      // Snapshot previous value
      const previousPlayer = queryClient.getQueryData(playerKeys.detail(player.id))

      // Optimistically update
      queryClient.setQueryData(playerKeys.detail(player.id), updatedData)

      return { previousPlayer }
    },

    // Rollback on error
    onError: (err, variables, context) => {
      if (context?.previousPlayer) {
        queryClient.setQueryData(
          playerKeys.detail(player.id),
          context.previousPlayer
        )
      }
    },

    // Refetch on success
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playerKeys.detail(player.id) })
    },
  })

  return <PlayerForm player={player} onSubmit={updateMutation.mutate} />
}
```

---

## Error Handling

### Service Layer Errors

```typescript
const result = await playerService.create(input)

if (!result.success) {
  // Service layer error codes
  switch (result.error.code) {
    case 'VALIDATION_ERROR':
      toast.error('Invalid input: ' + result.error.message)
      break
    case 'DUPLICATE_ENTRY':
      toast.error('Player already exists')
      break
    case 'UNAUTHORIZED':
      toast.error('You do not have permission')
      break
    default:
      toast.error('An error occurred: ' + result.error.message)
  }
}
```

### TanStack Query Errors

```typescript
const { data, error, isError } = useQuery({
  queryKey: playerKeys.detail(id),
  queryFn: () => fetchPlayer(id),
  retry: 3,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
})

if (isError) {
  return <ErrorDisplay error={error} />
}
```

---

## Quick Checklist

When building PT-2 frontend components:

- ✅ Use Server Components by default (direct service layer access)
- ✅ Use Client Components + TanStack Query for interactivity
- ✅ Use Server Actions for all mutations (not fetch to API routes)
- ✅ Always use service key factories (never hardcode query keys)
- ✅ Import DTOs from service types (never redefine or use Database types directly)
- ✅ Handle `ServiceResult<T>` success/error cases
- ✅ Use real-time via subscriptions + cache invalidation
- ✅ Store shareable state in URL
- ✅ Virtualize lists > 100 items
- ✅ Use loading skeletons (not spinners)
- ✅ Configure `staleTime` by data volatility

---

## Additional Resources

- **Service Template**: `docs/70-governance/SERVICE_TEMPLATE.md`
- **Service Layer Architecture**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- **DTO Standard**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- **Server Actions Architecture**: `docs/70-governance/SERVER_ACTIONS_ARCHITECTURE.md`
