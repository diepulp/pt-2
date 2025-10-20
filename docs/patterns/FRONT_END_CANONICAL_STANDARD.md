Front-End Canonical Standard (v1.1)

Scope: React 19 + Next.js App Router + TypeScript
Authoritative ADR: ADR-003 State Management Strategy (React Query for server state + Zustand for ephemeral UI; URL state for shareable filters)

0) Ground rules

TypeScript with strict on.

ESLint + Prettier with Airbnb JavaScript + Airbnb React/JSX presets (enable eslint-plugin-react and eslint-plugin-react-hooks). Airbnb is widely adopted and compatible with our stack. 
GitHub
+1

Commit discipline: Conventional Commits; changelog automation.

1) React 19 & React Compiler

Default posture: Prefer compiler-driven optimizations; do not add useMemo/useCallback/memo preemptively. Hand memoize only after profiling shows a measurable win or to ensure referential stability in hot paths. 
React
+1

Reality check: Compiler reduces (not eliminates) the need for manual memoization; you should still understand memoization and rendering behavior. 
Developer Way
+1

Enabling: Follow the official React Compiler setup notes for your build tool (Babel/Vite/etc.). Track adoption in an ADR when enabling per package. 
FreeCodeCamp

PR rubric update: If you add manual memoization, attach a profiler screenshot or numbers. Otherwise, prefer compiler defaults. 
React

2) Next.js App Router: fetching & caching

Server Components: Prefer fetching with fetch/ORM directly in Server Components for static/streamed UI and leverage built-in caching semantics. 
Next.js

Client Components: Use TanStack Query for interactive views, mutations, optimistic UI, and live cache updates. Avoid duplicating the same query both server- and client-side. 
Next.js

Caching policy: Follow Next.js cache controls and revalidation guidance (ISR, route segment caching, request memoization). Document caching intent in code comments. 
Next.js

3) State management (consistent with ADR-003)

Single source of truth: ADR-003

Decision Table:

| Concern                                                                  | Canonical home           | Notes                                                                                              |
| ------------------------------------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------- |
| **Server state** (fetched data, async cache, background refresh)         | **TanStack Query**       | Server-state library; handles fetching, caching, invalidation, mutations, retries. ([TanStack][1]) |
| **Ephemeral UI state** (modals, wizards, local selections, view toggles) | **Zustand**              | Keep fast and local; avoid mixing fetched data into the UI store. ([zustand.docs.pmnd.rs][2])      |
| **Shareable/canonical filters** (should survive refresh, be linkable)    | **URL state**            | Derive query keys from URL; hydrate UI store from URL when needed. ([Next.js][3])                  |
| **Heavy/real-time updates** (push → UI)                                  | **TanStack Query cache** | Prefer `setQueryData`/`invalidateQueries` over duplicating state. ([TanStack][1])                  |

[1]: https://tanstack.com/query/v5/docs/react/guides/does-this-replace-client-state?utm_source=chatgpt.com "Does TanStack Query replace Redux, MobX or other ..."
[2]: https://zustand.docs.pmnd.rs/?utm_source=chatgpt.com "Zustand: Introduction"
[3]: https://nextjs.org/docs/app/getting-started/fetching-data?utm_source=chatgpt.com "Getting Started: Fetching Data"


Why this split works: TanStack Query is a server-state tool and does not replace client state managers; Zustand is ideal for small, fast, UI-only state. Use them together without overlap. 
TanStack

Mutation safety: Client retries are permitted where idempotent; pair with server-side idempotency keys for create/update actions. (Policy: retry=0 for non-idempotent endpoints.)

4) Component & context boundaries

Prop-drilling guardrail: 3+ levels of pass-through props require either: (a) local refactor, (b) stable Context (theme/auth/locale), or (c) elevate to Zustand if the state is “hot” or cross-cutting UI. Context is not for rapidly mutating app state. 
airbnb.io

Lift state only as needed; co-locate logic with the rendering component or nearest parent. Prefer composable hooks over sprawling global stores.

5) Performance budgets & review

Ship less JS: apply code-splitting/tree-shaking; keep third-party scripts lean. Track bundle size in CI.

Profile before optimizing: Use React DevTools Profiler to identify hot paths; optimize the hotspot, not the whole tree. (Attach proof when introducing manual memoization.)

CWV alignment: Treat LCP/CLS/INP as release gates; follow Next.js caching guidance to keep re-renders and network round-trips down. 
Next.js

6) Style & linting (Airbnb)

Enable: airbnb-base + airbnb/hooks + plugin:react/recommended + react-hooks rules; use Prettier for formatting only.

Hooks deps: Treat react-hooks/exhaustive-deps as authoritative; justify exceptions in PR.

Why Airbnb? It remains a widely referenced standard; orgs (e.g., Mozilla) base their React guides on it with local adjustments. 
GitHub
+1

7) Testing

Unit: pure logic and custom hooks.

Component (RTL): test behavior via roles/labels; avoid implementation details.

E2E Smoke: main flows only.

8) Documentation glue

This standard cites and defers to:

ADR-003: authoritative state strategy.

Next.js Docs: App Router fetching & caching. 
Next.js
+1

React 19 + Compiler docs/blog: optimization posture. 
React
+1

Airbnb JS/React guides: lint/style. 
GitHub
+1

TanStack Query docs and Zustand docs for library-specific patterns. 
TanStack
+1

9) PR template (excerpt)
- [] React Compiler first; any manual memoization includes profiler evidence. 
- [] State location checked: server ↔ client boundary respected (S: fetch/DB, C: TanStack Query).
- [] No prop-drilling > 2 levels unless justified; Context/Zustand considered.
- [] Bundle/CWV budget within limits; analyzer artifact attached.
- [] Lint/Type/Tests green; no unreviewed rule disables

Change log

v1.1 — Added React 19/Compiler posture, explicit Next App Router boundaries, and an ADR-003 cross-reference; clarified Query/Zustand split and URL state policy.