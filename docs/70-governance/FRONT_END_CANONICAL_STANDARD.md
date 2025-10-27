Front-End Canonical Standard (v2.1)

**Scope:** React 19 + Next.js App Router + Tailwind CSS v4 + TypeScript
**Authoritative ADRs:**
- ADR-003: State Management Strategy (TanStack Query for server state + Zustand for ephemeral UI; URL state for shareable filters)
- ADR-004: Styling Architecture (Tailwind CSS v4 utility-first approach)

---

## 0) Ground Rules

**TypeScript:** Strict mode enabled (`strict: true`).

**ESLint + Prettier:** Airbnb JavaScript + Airbnb React/JSX presets (enable `eslint-plugin-react` and `eslint-plugin-react-hooks`). Airbnb is widely adopted and compatible with our stack. [GitHub](https://github.com/airbnb/javascript)

**Commit Discipline:** Conventional Commits; changelog automation.

---

## 1) React 19 & React Compiler

**Default Posture:** Prefer compiler-driven optimizations; do not add `useMemo`/`useCallback`/`memo` preemptively. Hand-memoize only after profiling shows a measurable win or to ensure referential stability in hot paths. [React Compiler Docs](https://react.dev/learn/react-compiler)

**Reality Check:** Compiler reduces (not eliminates) the need for manual memoization; you must still understand memoization and rendering behavior. [Developer Way](https://www.developerway.com)

**Enabling:**

```bash
npm install react-compiler-runtime
```

```javascript
// next.config.js
module.exports = {
  experimental: {
    reactCompiler: true
  }
}
```

Follow the official React Compiler setup notes for your build tool. Track adoption in an ADR when enabling per package. [React Compiler Setup](https://react.dev/learn/react-compiler)

**React 19 New Features:**

**Server Actions:**

Server Actions follow the architecture defined in `70-governance/SERVER_ACTIONS_ARCHITECTURE.md`:
- Organized by domain in `app/actions/{domain}/`
- Use service layer for database operations
- Wrapped with `withServerAction` for error mapping and audit logging
- Named with `-action.ts` suffix

```typescript
// app/actions/player/create-player-action.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { withServerAction } from '@/lib/server-actions/with-server-action-wrapper'
import { createPlayerService } from '@/services/player'
import type { ServiceResult } from '@/services/shared/types'

export async function createPlayerAction(input: CreatePlayerInput): Promise<ServiceResult<Player>> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  return withServerAction(
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
}

// app/components/PlayerForm.tsx
'use client'

import { createPlayerAction } from '@/app/actions/player/create-player-action'
import { useActionState } from 'react'

export function PlayerForm() {
  const [state, formAction] = useActionState(createPlayerAction, null)

  return (
    <form action={formAction}>
      <input name="email" type="email" required />
      <input name="name" required />
      <button type="submit">Create Player</button>
      {state?.error && <p className="text-red-500">{state.error.message}</p>}
    </form>
  )
}
```

**New Hooks:**
- `use()` — Read resources (promises, context) inside components
- `useOptimistic()` — Optimistic UI updates during async actions
- `useActionState()` — Handle form submission state

```typescript
'use client'
import { useOptimistic } from 'react'
import { createTodoAction } from '@/app/actions/todo/create-todo-action'

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
    <>
      <ul>
        {optimisticTodos.map(todo => (
          <li key={todo.id} className={todo.pending ? 'opacity-50' : ''}>
            {todo.text}
          </li>
        ))}
      </ul>
      <form action={formAction}>
        <input name="text" required />
        <button type="submit">Add</button>
      </form>
    </>
  )
}
```

**PR Rubric Update:** If you add manual memoization, attach a profiler screenshot or numbers. Otherwise, prefer compiler defaults. Use Server Actions for mutations; use new React 19 hooks where applicable.

---

## 2) Next.js App Router: Data Fetching & Caching

**Server Components (Default):** Use service layer directly in Server Components for static/streamed UI. Server Components can access the database directly without API routes. [Next.js Data Fetching](https://nextjs.org/docs/app/building-your-application/data-fetching)

```typescript
// app/players/page.tsx (Server Component)
import { createClient } from '@/lib/supabase/server'
import { createPlayerService } from '@/services/player'

async function PlayersPage() {
  const supabase = await createClient()
  const playerService = createPlayerService(supabase)

  // Direct database access via service layer
  const result = await playerService.list()

  if (!result.success) {
    return <ErrorDisplay error={result.error} />
  }

  return <PlayersList players={result.data} />
}

export default PlayersPage
```

**For External APIs (when needed):**

```typescript
// app/external-data/page.tsx (Server Component)
async function ExternalDataPage() {
  const data = await fetch('https://external-api.example.com/data', {
    next: { revalidate: 3600 } // ISR: revalidate every hour
  }).then(res => res.json())

  return <ExternalDataDisplay data={data} />
}
```

**Client Components:** Use TanStack Query for interactive views, mutations, optimistic UI, and live cache updates. For mutations, use Server Actions (not fetch). For queries, use API routes only when Server Components aren't suitable. [TanStack Query Docs](https://tanstack.com/query/latest)

```typescript
'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createPlayerAction } from '@/app/actions/player/create-player-action'

function InteractivePlayers() {
  // Query: Fetch from API route (when server component not suitable)
  const { data: players } = useQuery({
    queryKey: ['players'],
    queryFn: () => fetch('/api/players').then(r => r.json())
  })

  const queryClient = useQueryClient()

  // Mutation: Use Server Action (NOT fetch)
  const createMutation = useMutation({
    mutationFn: createPlayerAction,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['players'] })
  })

  return <PlayersList players={players} onCreate={createMutation.mutate} />
}
```

**Architecture Decision:**
- **Server Components**: Direct service layer access (no API routes needed)
- **Client Queries**: API routes → service layer (when needed)
- **Client Mutations**: Server Actions → service layer (preferred)
- **External APIs**: Use `fetch()` with Next.js caching options

**Caching Policy:** Follow Next.js cache controls and revalidation guidance (ISR, route segment caching, request memoization). Document caching intent in code comments. [Next.js Caching](https://nextjs.org/docs/app/building-your-application/caching)

---

## 3) State Management (Consistent with ADR-003)

**Single Source of Truth:** ADR-003

**Decision Table:**

| Concern | Canonical Home | Notes |
|---------|----------------|-------|
| **Server state** (fetched data, async cache, background refresh) | **TanStack Query** | Server-state library; handles fetching, caching, invalidation, mutations, retries. ([TanStack Query](https://tanstack.com/query/v5/docs/react/guides/does-this-replace-client-state)) |
| **Ephemeral UI state** (modals, wizards, local selections, view toggles) | **Zustand** | Keep fast and local; avoid mixing fetched data into the UI store. ([Zustand Docs](https://zustand.docs.pmnd.rs/)) |
| **Shareable/canonical filters** (should survive refresh, be linkable) | **URL state** | Derive query keys from URL; hydrate UI store from URL when needed. ([Next.js useSearchParams](https://nextjs.org/docs/app/api-reference/functions/use-search-params)) |
| **Heavy/real-time updates** (push → UI) | **TanStack Query cache** | Prefer `setQueryData`/`invalidateQueries` over duplicating state. ([TanStack Query](https://tanstack.com/query/latest)) |

**Why This Split Works:** TanStack Query is a server-state tool and does not replace client state managers; Zustand is ideal for small, fast, UI-only state. Use them together without overlap. [TanStack Query Philosophy](https://tanstack.com/query/latest/docs/react/guides/does-this-replace-client-state)

**Mutation Safety:** Client retries are permitted where idempotent; pair with server-side idempotency keys for create/update actions. Policy: `retry: 0` for non-idempotent endpoints.

```typescript
// Idempotent mutation with retry
const updateMutation = useMutation({
  mutationFn: (data) => fetch('/api/update', {
    method: 'PUT',
    headers: { 'Idempotency-Key': data.id },
    body: JSON.stringify(data)
  }),
  retry: 3 // Safe to retry
})

// Non-idempotent mutation without retry
const createMutation = useMutation({
  mutationFn: (data) => fetch('/api/create', { method: 'POST', body: JSON.stringify(data) }),
  retry: 0 // Do not retry creates
})
```

---

## 4) Tailwind CSS v4 Styling Architecture

**Installation & Configuration:**

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

**Global Styles:**

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
@utility tab-4 {
  tab-size: 4;
}

@utility container {
  margin-inline: auto;
  padding-inline: 2rem;
  max-width: 1280px;
}
```

**Integration with Next.js:**

```typescript
// app/layout.tsx
import './globals.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white dark:bg-gray-950 text-gray-950 dark:text-white font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
```

**Utility-First Principles:**
- Compose utilities directly in JSX
- Create component abstractions for repeated patterns
- Use `@utility` directive for custom utilities (not `@layer` from v3)

```typescript
// ✅ GOOD: Compose utilities
<button className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors">
  Click Me
</button>

// ✅ GOOD: Extract repeated patterns
function Button({ children, variant = 'primary' }: ButtonProps) {
  const baseClasses = "px-4 py-2 rounded-md transition-colors"
  const variantClasses = {
    primary: "bg-primary text-white hover:bg-primary/90",
    secondary: "bg-secondary text-white hover:bg-secondary/90"
  }

  return (
    <button className={`${baseClasses} ${variantClasses[variant]}`}>
      {children}
    </button>
  )
}
```

**Tailwind v4 Class Name Changes:**

| v3 | v4 | Reason |
|----|-----|--------|
| `shadow-sm` | `shadow-xs` | Improved scale consistency |
| `shadow` | `shadow-sm` | Improved scale consistency |
| `outline-none` | `outline-hidden` | Accessibility clarity |
| `blur-sm` | Updated scale | Improved scale consistency |
| `rounded-sm` | Updated scale | Improved scale consistency |

**Dark Mode:**

```typescript
// Use Tailwind's dark: variant
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  <h1 className="text-2xl font-bold">Hello World</h1>
  <p className="text-gray-600 dark:text-gray-400">Welcome to our app</p>
</div>
```

**Component Library Integration (shadcn/ui):**
- Use shadcn/ui for pre-built, customizable components
- Components are Tailwind-native and type-safe
- Copy-paste approach (not npm package) for full control

```bash
npx shadcn@latest init
npx shadcn@latest add button
```

**Performance:**
- Tailwind v4 auto-purges unused styles (no manual config needed)
- Use arbitrary values sparingly: `w-[347px]` (prefer theme values)
- Leverage `@source inline()` for dynamic class generation when needed

```css
/* app/globals.css */
@import "tailwindcss";
@source inline("text-brand-500 bg-brand-500"); /* Safelist dynamic classes */
```

**Responsive Design:**

```typescript
// Mobile-first approach
<div className="
  grid
  grid-cols-1
  gap-4
  sm:grid-cols-2
  md:grid-cols-3
  lg:grid-cols-4
">
  {/* ... */}
</div>
```

---

## 5) Component & Context Boundaries

**Prop-Drilling Guardrail:** 3+ levels of pass-through props require either:
- (a) Local refactor
- (b) Stable Context (theme/auth/locale)
- (c) Elevate to Zustand if the state is "hot" or cross-cutting UI

Context is not for rapidly mutating app state. [Airbnb React Style Guide](https://airbnb.io/javascript/react/)

```typescript
// ❌ BAD: Prop drilling 3+ levels
<Parent data={data}>
  <Child data={data}>
    <GrandChild data={data}>
      <GreatGrandChild data={data} />
    </GrandChild>
  </Child>
</Parent>

// ✅ GOOD: Context for stable data
const DataContext = createContext<Data | null>(null)

function Parent({ data }: { data: Data }) {
  return (
    <DataContext.Provider value={data}>
      <Child />
    </DataContext.Provider>
  )
}

function GreatGrandChild() {
  const data = use(DataContext) // React 19 use() hook
  return <div>{data.value}</div>
}
```

**State Co-location:** Lift state only as needed; co-locate logic with the rendering component or nearest parent. Prefer composable hooks over sprawling global stores.

---

## 6) Performance Budgets & Review

**Ship Less JS:**
- Apply code-splitting/tree-shaking
- Keep third-party scripts lean
- Track bundle size in CI with `@next/bundle-analyzer`

```javascript
// next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true'
})

module.exports = withBundleAnalyzer({
  // ... other config
})
```

**Profile Before Optimizing:** Use React DevTools Profiler to identify hot paths; optimize the hotspot, not the whole tree. Attach proof when introducing manual memoization.

**Core Web Vitals Alignment:** Treat LCP/CLS/INP as release gates; follow Next.js caching guidance to keep re-renders and network round-trips down. [Next.js Performance](https://nextjs.org/docs/app/building-your-application/optimizing)

**Image Optimization:**

```typescript
import Image from 'next/image'

// ✅ GOOD: Use Next.js Image component
<Image
  src="/hero.jpg"
  alt="Hero image"
  width={1200}
  height={600}
  priority
  className="rounded-lg"
/>
```

**Tailwind Performance:**
- v4 automatically optimizes CSS output
- Unused styles purged at build time
- No manual PurgeCSS configuration needed

---

## 7) Style & Linting (Airbnb + React 19)

**ESLint Configuration:**

```javascript
// .eslintrc.js
module.exports = {
  extends: [
    'airbnb',
    'airbnb/hooks',
    'plugin:react/recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  rules: {
    'react-hooks/exhaustive-deps': 'error', // Authoritative
    'react/react-in-jsx-scope': 'off', // React 19 auto-imports
    'react/function-component-definition': ['error', {
      namedComponents: 'function-declaration'
    }]
  }
}
```

**Hooks Dependencies:** Treat `react-hooks/exhaustive-deps` as authoritative; justify exceptions in PR with detailed comment.

**Prettier Integration:**

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

Note: `prettier-plugin-tailwindcss` automatically sorts Tailwind classes for consistency.

**Why Airbnb?** It remains a widely referenced standard; organizations (e.g., Mozilla) base their React guides on it with local adjustments. [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)

---

## 8) Testing

**Unit Tests:**
- Pure logic and custom hooks
- Vitest for test runner
- Test business logic, not implementation details

```typescript
// utils/formatCurrency.test.ts
import { describe, it, expect } from 'vitest'
import { formatCurrency } from './formatCurrency'

describe('formatCurrency', () => {
  it('formats USD correctly', () => {
    expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56')
  })
})
```

**Component Tests (React Testing Library):**
- Test behavior via roles/labels
- Avoid implementation details
- Use `screen.getByRole()`, not `container.querySelector()`

```typescript
// components/LoginForm.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { LoginForm } from './LoginForm'

describe('LoginForm', () => {
  it('submits form with valid data', async () => {
    const onSubmit = vi.fn()
    render(<LoginForm onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText(/email/i), 'user@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password123'
    })
  })
})
```

**E2E Smoke Tests:**
- Main flows only (login, checkout, critical paths)
- Playwright for E2E
- Run in CI before production deployments

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test('user can sign in', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('user@example.com')
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: /sign in/i }).click()

  await expect(page).toHaveURL('/dashboard')
  await expect(page.getByText(/welcome back/i)).toBeVisible()
})
```

---

## 9) Documentation Glue

This standard cites and defers to:

- **ADR-003:** Authoritative state strategy (TanStack Query + Zustand)
- **ADR-004:** Styling architecture (Tailwind CSS v4)
- **SERVER_ACTIONS_ARCHITECTURE.md:** Server Actions implementation pattern (docs/patterns/)
- **Next.js Docs:** App Router fetching & caching ([Next.js Docs](https://nextjs.org/docs))
- **React 19 Docs:** Compiler, Server Actions, new hooks ([React Docs](https://react.dev))
- **Tailwind v4 Docs:** Configuration, theming, utilities ([Tailwind CSS](https://tailwindcss.com))
- **Airbnb JS/React Guides:** Lint/style baseline ([Airbnb Style Guide](https://github.com/airbnb/javascript))
- **TanStack Query Docs:** Server state patterns ([TanStack Query](https://tanstack.com/query/latest))
- **Zustand Docs:** Client state patterns ([Zustand](https://zustand.docs.pmnd.rs/))
- **shadcn/ui:** Component library patterns ([shadcn/ui](https://ui.shadcn.com))

---

## 10) PR Template (Updated)

**React 19 Checklist:**
- [ ] React Compiler first; any manual memoization includes profiler evidence
- [ ] Server Actions used for mutations (follow SERVER_ACTIONS_ARCHITECTURE.md pattern)
- [ ] Server Actions organized in `app/actions/{domain}/` with `-action.ts` suffix
- [ ] Server Actions use `withServerAction` wrapper for error handling and audit logging
- [ ] New React 19 hooks (`use`, `useOptimistic`, `useActionState`) used where applicable
- [ ] No deprecated React patterns (string refs, legacy context, etc.)

**State Management Checklist:**
- [ ] State location checked: server ↔ client boundary respected
- [ ] Server Components use service layer directly (no fetch for internal data)
- [ ] Client mutations use Server Actions (not fetch to API routes)
- [ ] Server state in TanStack Query; ephemeral UI state in Zustand
- [ ] URL state used for shareable filters/views
- [ ] No prop-drilling > 2 levels unless justified; Context/Zustand considered

**Tailwind v4 Checklist:**
- [ ] No inline styles; Tailwind utilities used throughout
- [ ] Custom utilities defined via `@utility` (not `@layer` from v3)
- [ ] Dark mode variants (`dark:`) applied where needed
- [ ] Responsive variants used correctly (mobile-first approach)
- [ ] shadcn/ui components used for complex UI patterns

**Performance Checklist:**
- [ ] Bundle/CWV budget within limits; analyzer artifact attached
- [ ] Code-splitting applied for large features
- [ ] Images optimized via Next.js `<Image>` component
- [ ] No unnecessary client components (Server Components preferred)

**Quality Checklist:**
- [ ] Lint/Type/Tests green; no unreviewed rule disables
- [ ] Component tests cover user behavior (not implementation)
- [ ] E2E smoke tests pass for affected flows
- [ ] Accessibility checked (semantic HTML, ARIA labels, keyboard navigation)

---

## Change Log

**v2.1 (2025-01-19):**
- ✅ **CRITICAL:** Aligned with SERVER_ACTIONS_ARCHITECTURE.md pattern
- ✅ Removed `fetch()` from server-side examples (use service layer directly)
- ✅ Updated Server Actions to use `withServerAction` wrapper pattern
- ✅ Clarified Server Components use service layer directly (no API routes)
- ✅ Updated Client Components to use Server Actions for mutations (not fetch)
- ✅ Added SERVER_ACTIONS_ARCHITECTURE.md to documentation references
- ✅ Updated `useOptimistic` example to use actual server action
- ✅ Enhanced PR template with Server Actions architecture checklist

**v2.0 (2025-01-19):**
- ✅ **CRITICAL:** Added comprehensive Tailwind CSS v4 section (previously missing)
- ✅ Enhanced React 19 guidance with Server Actions, `use()`, `useOptimistic()`, `useActionState()` hooks
- ✅ Added Tailwind v4 configuration patterns (`@theme`, `@utility`, PostCSS setup)
- ✅ Integrated shadcn/ui component library guidance
- ✅ Updated PR template with Tailwind v4 and React 19 checklist items
- ✅ Added official documentation references for all technologies
- ✅ Clarified performance budgets for both React and Tailwind
- ✅ Enhanced testing section with Vitest and Playwright examples
- ✅ Added ESLint/Prettier configuration examples
- ✅ Included v4 class name migration guide
- ✅ Added dark mode and responsive design patterns
- ✅ Updated ADR references to include ADR-004 for styling

**v1.1 (Previous):**
- Added React 19/Compiler posture
- Explicit Next App Router boundaries
- ADR-003 cross-reference
- Clarified Query/Zustand split and URL state policy
