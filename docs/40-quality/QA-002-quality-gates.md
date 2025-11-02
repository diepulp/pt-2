---
id: QA-002
title: CI/CD Quality Gates
owner: QA
status: Draft
affects: [QA-001, GOV-001]
created: 2025-11-02
last_review: 2025-11-02
---

## Purpose

Codify the non-negotiable quality gates that every PT-2 change must satisfy before merge or release. These gates consolidate enforcement rules from the architecture slicing consensus, the integrity framework, and the service standard.

## Pipeline Overview

| Stage | Gate | Pass Criteria | Enforcement |
| --- | --- | --- | --- |
| Pre-commit | Lint & type safety | ESLint with custom rules (`no ReturnType`, no cross-context imports), `tsc --noEmit` clean | Husky + `npm run lint`, `npm run typecheck` |
| Pre-commit | Schema drift guard | `npm run db:types` executed after migrations; schema verification test passes | Husky hook, `__tests__/schema-verification.test.ts` |
| PR (CI) | Test suite | `npm run test:coverage` with all suites green | GitHub Actions |
| PR (CI) | Coverage thresholds | >80 % overall; service modules ≥90 %, DTO mappers 100 % | Jest coverage config (`--coverageThreshold`) |
| PR (CI) | RLS/scope assertions | Integration suite verifies `casino_id` tenancy and policy enforcement | Tagged integration tests (`npm run test:int`) |
| Merge | Docs sync | Related docs updated (`docs/INDEX.md`, domain-specific READMEs) or checkbox justified | PR template |
| Release | Production readiness | Lighthouse: LCP ≤2.5 s, TBT ≤200 ms; bundle size ≤250 KB; all ops runbooks updated | Release checklist |

## Non-Negotiable Gates

- **Explicit service interfaces** — `export interface FooService` required; CI lints for `ReturnType<typeof createFooService>`.
- **Typed Supabase clients** — All services and tests depend on `SupabaseClient<Database>`; eslint rule blocks untyped clients.
- **ServiceResult envelope** — Mutations must return `ServiceResult<T>`; action layer performs HTTP mapping. PR reviewers reject deviations.
- **Coverage ≥80 %** — Derived from architecture slicing consensus; Jest `coverageThreshold` enforces fail-fast.
- **Single source of truth** — `types/database.types.ts` regenerated every migration; schema verification test ensures DTO alignment.

## Gate Automation Details

1. **Schema Verification Test**
   - Location: `__tests__/schema-verification.test.ts`.
   - Blocks DTO vs schema drift and deprecated column usage.
   - Runs on every PR and whenever migrations change.

2. **Coverage Thresholds**
   - Command: `npm run test:coverage`.
   - Thresholds are encoded in `package.json` to prevent manual bypass.
   - Reports uploaded as CI artifacts for review.

3. **Integration Test Tagging**
   - Command: `npm run test:int`.
   - Must exercise `rpc_create_financial_txn`, `rpc_issue_mid_session_reward`, and RLS-enforced reads.
   - Failing integration tests block merges even if unit coverage passes.

4. **Lighthouse & Bundle Budget**
   - Command: `npm run lint:perf` (wrapper around Lighthouse CI + bundle analyzer).
   - Thresholds: LCP ≤2.5 s, TBT ≤200 ms, JS ≤250 KB.
   - Required before release branches are cut.

## Review Checklist

- [ ] Coverage report uploaded and above thresholds.
- [ ] Schema verification test executed after migrations.
- [ ] RLS integration suite updated when new tables/policies ship.
- [ ] Performance and accessibility budgets checked for UI-heavy changes.
- [ ] Docs updated or “no doc changes” reason captured in PR template.

