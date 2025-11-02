---
id: QA-001
title: Service & Layered Testing Strategy
owner: QA
status: Draft
affects: [SEC-001, ARCH-SRM]
created: 2025-11-02
last_review: 2025-11-02
---

## Purpose

Define the end-to-end testing approach for PT-2 across data, service, action, and UI layers. This strategy consolidates expectations from the architecture analyses and the PT-2 Service Standard so every feature team delivers the same baseline of confidence.

## Testing Pyramid

```
              /\
             /  \  E2E Tests (Cypress)
            /    \  • Complete workflows (10%)
           /------\
          /        \  Integration Tests (Jest)
         /          \  • Service + DB (20%)
        /            \  • Action orchestration (10%)
       /--------------\
      /                \  Unit Tests (Jest + RTL)
     /                  \  • Service logic (40%)
    /                    \  • UI components (10%)
   /______________________\
```

**Target distribution**
- **60 % Unit tests** — Service logic (40 %), UI components (10 %), DTO transforms/validation (10 %).
- **30 % Integration tests** — Service + database (20 %), server actions (10 %).
- **10 % E2E tests** — Critical flows (Player CRUD, Visit lifecycle, Rating Slip issuance).

## Layer Playbook

| Layer | Mandatory Test Types | Scope | Mock Boundary | Tooling |
| --- | --- | --- | --- | --- |
| Data (Supabase) | Schema verification, migration smoke | Constraints, RLS, triggers | None (real DB) | Supabase CLI, SQL scripts |
| Service | Unit (default), targeted integration | CRUD, domain rules, error mapping | Unit: typed Supabase double<br>Integration: real Supabase test DB | Vitest/Jest |
| Action (Server Actions/Route Handlers) | Integration | Service orchestration, cache/authorization hooks | Mock downstream services | Vitest/Jest + MSW |
| UI (React) | Unit + E2E | Component rendering, focus order, user journeys | Mock server actions & React Query | RTL, Cypress |

## Coverage Targets

| Layer / Module | Minimum Coverage | Notes |
| --- | --- | --- |
| Migrations & schema checks | 100 % | Every constraint, trigger, policy exercised in CI |
| Service CRUD modules | 90 % | Include happy path + domain errors (`NOT_FOUND`, duplicates) |
| Service business workflows | 85 % | State machines, temporal checks, concurrency |
| Service transforms/DTO mappers | 100 % | Deterministic — snapshot or golden tests |
| Action layer | 80 % | Ensure cache invalidation, header contracts, RBAC mapping |
| UI components | 70 % | Focus on accessibility (labels, keyboard) |
| End-to-end suites | 100 % of critical flows | Automate Player CRUD, Visit closeout, Rating Slip reward |

CI fails if module coverage drops below the target for its layer.

## Execution Guardrails

- **Typed doubles only** — Unit tests must use typed `SupabaseClient<Database>` doubles. No `any` or `ReturnType` inference.
- **RLS awareness** — Integration tests run against a seeded Supabase instance with RLS enabled to verify tenancy enforcement.
- **Seed helpers per domain** — Store fixtures next to the domain (`services/{domain}/__tests__/helpers.ts`). Avoid cross-domain fixture drift.
- **Schema verification** — `__tests__/schema-verification.test.ts` blocks drift between DTOs and database types; runs on every PR.
- **Regenerate types after migrations** — `npm run db:types` followed by schema verification before code review.

## Review Checklist

- [ ] Tests follow the unit → integration → E2E ratio above.
- [ ] Coverage reports meet or exceed layer targets.
- [ ] New migrations include schema verification assertions.
- [ ] Supabase client doubles remain typed; no `any` or `ReturnType` escapes.
- [ ] Critical flows updated in Cypress after feature changes.

