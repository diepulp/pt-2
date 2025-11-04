# Coding Standards Snapshot (PT-2)
last_updated: 2025-11-03
sources:
  - docs/70-governance/HOOKS_STANDARD.md (React Query patterns)
  - docs/70-governance/FRONT_END_CANONICAL_STANDARD.md (frontend stack)
  - docs/70-governance/SERVER_ACTIONS_ARCHITECTURE.md

## React Query Hooks (Cross-Cutting: Frontend + Backend Interface)

location: `/hooks/<domain>/` with domain-based organization
patterns:
  query_client_defaults:
    - Single QueryClient in bootstrap with 5min staleTime, 30min gcTime, retry=2
    - Leave refetchOnWindowFocus=true (default) unless demonstrated flicker
  naming:
    - File: `use-<domain-thing>-<operation>.ts` (e.g., `use-player-list.ts`)
    - Hook: `use<DomainThing><Operation>` (e.g., `usePlayerList`)
    - Keys: Import from `services/<domain>/keys.ts` (never inline arrays)
  key_factories:
    - One factory per domain in `services/<domain>/keys.ts`
    - Provide `.scope` for broad invalidations (e.g., `playerKeys.list.scope`)
    - Serialize filters with sorted keys for deterministic cache keys
  query_template:
    - Use `select` to stabilize projected shape (reduce re-renders)
    - Gate execution with `enabled: Boolean(requiredParam)` for optional IDs
    - Override staleTime/gcTime only with rationale; defaults sufficient for most
  mutation_template:
    - Prefer surgical cache updates (`setQueryData`, `setQueriesData`)
    - Invalidate narrowly (specific list key, not entire domain root)
    - Use `mutationKey` from domain factory for DevTools grouping
    - Set `retry: 0` for non-idempotent endpoints
  infinite_queries:
    - Dedicated key entry (e.g., `playerKeys.infinite(filters)`)
    - Surface `hasNextPage`, `isFetchingNextPage`, `fetchNextPage()` in UI
  testing:
    - Fresh QueryClient per test to isolate caches
    - Mock network with MSW for realistic boundaries
    - Assert key stability, pagination behavior, invalidation patterns
  boundaries:
    - `/hooks/ui/**` = Zustand only (no fetch/service calls)
    - `/hooks/<domain>/**` = React Query only (no Zustand)
    - ESLint enforces separation

## Frontend Stack (React 19 + Next.js + Tailwind v4)

react_19:
  compiler:
    - Prefer compiler-driven optimizations; manual memoization requires profiler proof
    - Enable via `experimental.reactCompiler: true` in next.config.js
  server_actions:
    - Organized in `app/actions/{domain}/` with `-action.ts` suffix
    - Use `withServerAction` wrapper for error mapping + audit logging
    - Mutations via Server Actions (not fetch to API routes)
    - Call service layer directly; return `ServiceResult` envelope
  new_hooks:
    - `use()` for reading promises/context in components
    - `useOptimistic()` for instant UI updates during mutations
    - `useActionState()` for form submission state

data_fetching:
  server_components:
    - Default posture; use service layer directly (no API routes)
    - Access database via Supabase client in Server Components
    - Apply Next.js cache controls (revalidate, ISR, route segment caching)
  client_components:
    - Queries: API routes → service layer (when Server Components not suitable)
    - Mutations: Server Actions → service layer (preferred)
    - Use TanStack Query for cache management and optimistic UI

state_management: # ADR-003
  server_state: TanStack Query (fetched data, async cache, background refresh)
  ephemeral_ui: Zustand (modals, wizards, local selections, view toggles)
  shareable_filters: URL state (survive refresh, be linkable)
  realtime_updates: TanStack Query cache (setQueryData/invalidateQueries)
  mutation_safety:
    - Client retries permitted for idempotent endpoints
    - Pair with server-side idempotency keys (use resource ID or UUID)
    - Set `retry: 0` for non-idempotent creates

tailwind_v4:
  installation: '@tailwindcss/postcss@next' with PostCSS plugin
  theming: Use `@theme` directive for design tokens (not v3 `@layer`)
  utilities: Compose directly in JSX; extract repeated patterns as components
  dark_mode: Use `dark:` variant (e.g., `bg-white dark:bg-gray-900`)
  component_library: shadcn/ui for pre-built, Tailwind-native components
  performance: Auto-purges unused styles; no manual PurgeCSS config
  class_changes: # v3 → v4 migration
    - `shadow-sm` → `shadow-xs`
    - `outline-none` → `outline-hidden`

component_patterns:
  prop_drilling: 3+ levels require Context/Zustand (not pass-through)
  context: Only for stable data (theme/auth/locale); not rapidly mutating state
  state_colocation: Lift only as needed; prefer composable hooks over global stores

performance:
  bundle_analysis: Track with @next/bundle-analyzer in CI
  profiling: Use React DevTools Profiler; optimize hot paths only
  core_web_vitals: LCP/CLS/INP as release gates
  images: Next.js `<Image>` component with width/height/priority
  code_splitting: Apply for large features; Server Components by default

linting:
  eslint: Airbnb + airbnb/hooks + TypeScript presets
  rules:
    - `react-hooks/exhaustive-deps: error` (authoritative)
    - `react/react-in-jsx-scope: off` (React 19 auto-imports)
  prettier:
    - prettier-plugin-tailwindcss (auto-sort classes)
    - 2-space tabs, single quotes, 100 char width

testing:
  unit: Vitest for pure logic and custom hooks
  component: React Testing Library (test behavior via roles/labels)
  e2e: Playwright for critical paths (login, checkout)
  coverage: Focus on business logic, not implementation details

definition_of_done:
  hooks:
    - [ ] Uses domain key factory (no inline arrays)
    - [ ] Respects QueryClient defaults (override with rationale)
    - [ ] Invalidation in onSuccess or setQueriesData
    - [ ] Pure function signature (serializable filters)
    - [ ] Unit test present (query + mutation sample per domain)
  frontend:
    - [ ] Server Actions for mutations (follow SERVER_ACTIONS_ARCHITECTURE.md)
    - [ ] Server Components by default; client components justified
    - [ ] Tailwind utilities (no inline styles)
    - [ ] Dark mode variants where applicable
    - [ ] Accessibility verified (semantic HTML, ARIA, keyboard nav)
    - [ ] Bundle/CWV within budget; analyzer artifact if manual memoization

cross_references:
  - ADR-003: State Management Strategy (TanStack Query + Zustand + URL)
  - ADR-004: Styling Architecture (Tailwind CSS v4)
  - ADR-007: Observability (server action wrapper pattern)
  - SERVER_ACTIONS_ARCHITECTURE.md: Mutation patterns
  - HOOKS_STANDARD.md: Complete React Query patterns reference
  - FRONT_END_CANONICAL_STANDARD.md: Full frontend stack guide (708 lines)
