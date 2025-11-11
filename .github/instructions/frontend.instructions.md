# Frontend Instructions (PRD + GOV)
applyTo: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "ui/**/*.{ts,tsx}"]
scope: frontend
docs:
  primary: docs/70-governance/FRONT_END_CANONICAL_STANDARD.md
  supporting:
    - docs/10-prd/README.md
    - docs/40-quality/QA-001-service-testing-strategy.md
    - docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md
    - docs/70-governance/UX_DATA_FETCHING_PATTERNS.md
    - docs/80-adrs/ADR-003-state-management-strategy.md
rules:
  - Follow React 19 patterns: server components by default, client components only when interaction or state is required.
  - Use shadcn UI primitives; avoid inline styling unless dynamic or documented.
  - Ensure accessibility: manage focus order, aria labels, keyboard navigation; meet WCAG AA budgets.
  - Integrate data through typed server actions + React Query hooks; keep cache keys scoped by `casino_id`.
  - Update acceptance criteria traceability—link UI work to PRD stories and QA plans.

ux_data_fetching:
  - Lists > 100 items MUST use virtualization (@tanstack/react-virtual).
  - Loading states show skeletons (not spinners) matching content layout.
  - Configure staleTime by data type: Hot (30s), Warm (5m), Cold (1h), Critical (0s).
  - Prefetch on hover for detail views + route navigation (SSR hydration).
  - Optimistic updates ONLY for idempotent operations (toggle flags, text fields).
  - NEVER optimistic updates for: financial transactions, loyalty rewards, state machines.
  - Real-time updates reconcile with TanStack Query cache (no direct state mutations).

state_management:
  - Server state in TanStack Query; ephemeral UI state in Zustand (ADR-003).
  - Query keys follow `[domain, operation, scope?, ...params]` pattern.
  - Mutations use server actions (not fetch to API routes).
  - URL state for shareable filters (survive refresh, linkable).

validation:
  checklist:
    - accessibility: "Document accessibility validation (keyboard/focus/ARIA) or list work remaining."
    - data_flow: "Confirm server action + query key touched and caching implications."
    - ui_tests: "List unit/E2E tests added/updated per QA-001 targets."
    - prd_trace: "Reference PRD feature ID or acceptance criteria satisfied."
    - virtualization: "If list > 100 items, confirm virtualization applied or document exception."
    - stale_time: "Document staleTime configuration (hot/warm/cold/critical) per data type."
    - optimistic_safety: "If optimistic updates used, confirm idempotency + low conflict risk."
