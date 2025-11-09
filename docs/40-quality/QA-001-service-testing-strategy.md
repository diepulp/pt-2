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

## PRD-001 Traceability (Pilot MVP)

| PRD Story / Requirement | Test Expectations | Layer |
| --- | --- | --- |
| **US-003 Pause/Resume Slip** — derived `duration_seconds` (no stored `accumulated_seconds`) | Unit test the rating slip state machine to ensure pause/resume swaps server timestamps; integration test verifies duration calculation using seeded Supabase clock helpers; Cypress flow asserts UI reflects the derived seconds within 2 s. | Service, Integration, E2E |
| **US-004 Close Slip** — enforce `end_time` persistence + removal from Active view | Integration test for `rating_slip` close RPC ensures `end_time` is set, `status=closed`, and telemetry event emitted; E2E test confirms dashboard removes slip within SLA. | Integration, E2E |
| **US-005 Mid-Session Reward** — `rpc_issue_mid_session_reward` signature, idempotency, ledger-only rewards | Contract test covering RPC arguments (`p_casino_id`, `p_player_id`, `p_rating_slip_id`, `p_staff_id`, `p_points`, `p_idempotency_key`, `p_reason`), verifies ledger + `player_loyalty` commit in one transaction, rejects `status='closed'`, and replays idempotency key without duplicates; Cypress scenario confirms UI displays ledger-sourced reward entry. | Integration, Contract, E2E |
| **PRD §3.4 Telemetry Snapshot** — `seat_number`, `game_settings`, `policy_snapshot` | Unit test ensures factories persist the snapshot; schema verification test blocks deletions; UI regression test shows policy snapshot metadata on slip detail. | Unit, Schema, UI |
| **PRD §3.6 Finance Trigger** — `gaming_day` derived server-side | RPC contract test ensures `gaming_day` populated by `compute_gaming_day` trigger; integration suite runs with feature flag on/off to validate read paths. | Integration |
| **PRD §3.7 MTL Read-only** — CTR/watchlist indicators only | Authorization test ensures `mtl_entry` renders without loyalty data leakage; E2E smoke verifies compliance persona sees thresholds but cannot write. | Security, E2E |

QA reviewers must tag specs with the PRD story ID so the SDLC taxonomy chain (PRD ↔ ARCH ↔ QA) stays synchronized.

## Execution Guardrails

- **Typed doubles only** — Unit tests must use typed `SupabaseClient<Database>` doubles. No `any` or `ReturnType` inference.
- **RLS awareness** — Integration tests run against a seeded Supabase instance with RLS enabled to verify tenancy enforcement.
- **Seed helpers per domain** — Store fixtures next to the domain (`services/{domain}/__tests__/helpers.ts`). Avoid cross-domain fixture drift.
- **Schema verification** — `__tests__/schema-verification.test.ts` blocks drift between DTOs and database types; runs on every PR.
- **Regenerate types after migrations** — `npm run db:types-local` followed by schema verification before code review.

## Review Checklist

- [ ] Tests follow the unit → integration → E2E ratio above.
- [ ] Coverage reports meet or exceed layer targets.
- [ ] New migrations include schema verification assertions.
- [ ] Supabase client doubles remain typed; no `any` or `ReturnType` escapes.
- [ ] Critical flows updated in Cypress after feature changes.
