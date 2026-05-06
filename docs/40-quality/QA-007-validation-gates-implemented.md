---
id: QA-007
title: Implemented Validation Gates for Agentic Workflows
owner: QA
status: Active
affects: [ARCH-001, ARCH-002, QA-002, GOV-001]
created: 2026-04-27
last_review: 2026-04-27
---

# QA-007 — Implemented Validation Gates for Agentic Workflows

## Purpose

Capture the validation gates that are **actually implemented today** across local authoring, pre-commit enforcement, and CI, and explain how those gates constrain PT-2's agentic workflows and code-quality posture.

Per the SDLC taxonomy, this document primarily belongs to **DEL/QA**, with direct dependencies on:

- **ARCH** — transport and middleware contract, SRM-aligned service patterns
- **API/DATA** — DTO/schema and contract integrity
- **SEC/RBAC** — RLS, RPC, and tenancy enforcement
- **GOV** — over-engineering and testing-governance rules

## Source Context

This document synthesizes implemented behavior from:

- `docs/patterns/SDLC_DOCS_TAXONOMY.md`
- `.husky/pre-commit`
- `.husky/pre-commit-api-sanity.sh`
- `.husky/pre-commit-migration-naming.sh`
- `.husky/pre-commit-migration-safety.sh`
- `.husky/pre-commit-rpc-lint.sh`
- `.husky/pre-commit-service-check.sh`
- `.husky/pre-commit-zustand-check.sh`
- `.husky/pre-commit-rls-write-path.sh`
- `.husky/pre-commit-search-path-safety.sh`
- `.github/workflows/ci.yml`
- `package.json`
- `docs/20-architecture/EDGE_TRANSPORT_POLICY.md`
- `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`
- `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md`

## Why These Gates Matter for Agentic Workflows

PT-2 does not rely on an agent to remember every house rule during implementation. Instead, the repository pushes those rules into automated gates that sit on the path from draft change to merge candidate.

That matters because the agentic workflow is multi-stage:

1. A design or build pipeline chooses an implementation path.
2. The agent writes code or migrations inside bounded contexts.
3. Validation gates reject work that violates transport, service, security, or testing rules.
4. CI re-runs merge-safety checks so local drift does not become branch drift.

In practice, the validation system acts as the **mechanical backstop** behind the architecture and governance docs.

## Validation Gate Topology

| Stage | Implemented Gate Type | Primary Purpose | Main Enforcement Surface |
| --- | --- | --- | --- |
| Authoring | Scripted commands | Fast feedback on lint, type safety, buildability, tests | `package.json` scripts |
| Pre-commit | Husky shell gates | Block invalid staged changes before commit | `.husky/pre-commit` |
| PR / CI | GitHub Actions checks | Re-run merge-safety checks in clean environment | `.github/workflows/ci.yml` |
| Advisory verification | Test jobs not yet required | Preserve honest visibility while harnesses stabilize | `test` and `e2e` CI jobs |

## 1. Authoring-Time Gates

These are the commands an agent or developer is expected to run while iterating.

| Command | Purpose | Quality Signal |
| --- | --- | --- |
| `npm run lint` | ESLint across tracked JS/TS files | Syntax, style, custom static invariants |
| `npm run type-check` | `tsc --noEmit --strict` | Type safety and interface consistency |
| `npm run build` | Next.js production build | App-router/build integration safety |
| `npm run test:unit:node` | Node-runtime Jest suite | Trusted-local server verification |
| `npm run test:integration:canary` | Integration suite behind `RUN_INTEGRATION_TESTS=true` | Real boundary verification |
| `npm run e2e:playwright` | Browser E2E harness | User-flow verification |
| `npm run db:types` | Regenerate remote database types | Schema/type synchronization |
| `npm run validate:matrix-schema` | SRM/schema ownership checks | Architecture/data-governance alignment |
| `npm run validate:adr-sync` | ADR sync validation | Documentation consistency |

### Agentic interpretation

- These commands are the **first-line feedback loop** for build agents.
- They map directly to the Testing Governance standard's distinction between **trusted-local** and **required** verification.
- They keep a generated change small enough to evaluate before CI, which aligns with the over-engineering guardrail's preference for lean, measurable corrections.

## 2. Pre-Commit Gates Implemented with Husky

The root hook at `.husky/pre-commit` executes a fixed gate chain before `lint-staged`.

### 2.1 Migration naming gate

**Hook:** `.husky/pre-commit-migration-naming.sh`

Blocks migration files that violate the release naming standard:

- filename must match `YYYYMMDDHHMMSS_description.sql`
- rejects fabricated placeholder or round timestamps
- warns on suspicious sequential timestamps

**Agentic effect:** an agent cannot casually invent migration filenames; temporal ordering becomes part of enforced delivery hygiene.

### 2.2 Migration safety gate

**Hook:** `.husky/pre-commit-migration-safety.sh`

Blocks or warns on high-risk migration patterns, including:

- `sync_remote_changes.sql`
- policy changes without explicit review markers
- potential RLS regressions against ADR-015 / ADR-024 style expectations

**Agentic effect:** migration-writing agents are forced to respect tenancy and policy continuity rather than treat SQL as an ungoverned output channel.

### 2.3 RPC and context-injection gate

**Hook:** `.husky/pre-commit-rpc-lint.sh`

Validates staged RPC migrations for:

- required `set_rls_context_from_staff()` usage
- banned spoofable identity parameters such as `p_actor_id`
- improper `p_casino_id` usage under the authoritative-context model

**Agentic effect:** generated RPCs must conform to the system's RLS model, preventing agents from bypassing the authoritative context-derivation contract.

### 2.4 API transport sanity gate

**Hook:** `.husky/pre-commit-api-sanity.sh`

Checks `app/api/v1/**/route.ts` for the platform transport contract:

- service-response helpers imported
- deprecated wrappers rejected
- mutating routes must use `withServerAction`
- idempotency extraction required
- centralized validation expectations enforced

This directly supports the edge transport policy in `docs/20-architecture/EDGE_TRANSPORT_POLICY.md`.

**Agentic effect:** route-generating agents are constrained to the same middleware, idempotency, and HTTP-envelope model as human-authored routes.

### 2.5 Service anti-pattern gate

**Hook:** `.husky/pre-commit-service-check.sh`

Prevents service-layer drift by checking for:

- `ReturnType<typeof ...Service>` inference
- DTO-pattern mismatches by service classification
- missing service structure expectations such as `mappers.ts`
- route/service architectural anti-patterns

**Agentic effect:** service-builder agents cannot silently collapse explicit contracts into inferred or cross-context shortcuts.

### 2.6 Zustand pattern gate

**Hook:** `.husky/pre-commit-zustand-check.sh`

Checks client-state patterns, including:

- devtools middleware presence
- action naming discipline
- `useShallow` on object selectors
- direct component-store imports that bypass selector hooks

**Agentic effect:** frontend agents are forced to preserve the approved state-management posture rather than generate ad hoc local patterns.

### 2.7 RLS write-path gate

**Hook:** `.husky/pre-commit-rls-write-path.sh`

Protects ADR-034 write-path rules for staged files and ensures restricted tables keep approved mutation paths.

**Agentic effect:** write operations remain aligned with the approved security topology even when generated incrementally.

### 2.8 Search-path safety gate

**Hook:** `.husky/pre-commit-search-path-safety.sh`

Blocks risky function changes where `search_path` is tightened without rewriting function bodies for schema qualification.

**Agentic effect:** database-hardening changes cannot introduce runtime breakage through partial edits.

### 2.9 `lint-staged`

After the custom Husky gates pass, `npx lint-staged` runs and applies `eslint --fix` to staged JS/TS files.

**Agentic effect:** trivial static issues are normalized automatically, but only after the architecture/security gates accept the change shape.

## 3. CI / PR Gates Implemented in GitHub Actions

The primary merge-safety workflow is `.github/workflows/ci.yml`.

### 3.1 Required merge-safety job: `checks`

The `checks` job currently runs:

- checkout + pinned Node setup via `.nvmrc`
- `npm install`
- **env drift guard** for banned runtime variable names
- `npm run lint`
- `npm run type-check`
- `npm run build`

This is the implemented CI floor for pull requests to `main`.

### 3.2 Advisory test job: `test`

The `test` job runs Node-runtime Jest tests but is marked `continue-on-error: true`.

That means:

- the repository still surfaces test failures in CI
- but the current governance posture treats this job as **advisory**, not hard merge protection

This is consistent with `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md`, which distinguishes honest **trusted-local** verification from promoted **required** enforcement.

### 3.3 Advisory E2E job: `e2e`

The `e2e` job provisions Playwright and local Supabase, then runs selected browser/API flows, also with `continue-on-error: true`.

This preserves visibility into full-stack regressions without claiming a stronger enforcement posture than the harness currently supports.

## 4. TypeScript Validation Posture

TypeScript validation is implemented in more than one place:

- `package.json` defines `type-check` as `tsc --noEmit --strict`
- CI runs `npm run type-check` in the main `checks` job
- local workflows and specs repeatedly cite `npm run type-check` as a completion gate

This makes TS validation a **system-wide invariant**, not a convenience script.

### Why it matters for agents

- It blocks contract drift across services, hooks, routes, and DTO consumers.
- It forces generated code to respect explicit interfaces instead of relying on informal runtime assumptions.
- It complements Husky's pattern-specific checks by catching cross-file breakage that shell greps cannot detect.

## 5. Relationship to the Edge Transport Policy

The edge transport policy defines the allowed ingress and middleware chain. The implemented gates operationalize that policy:

- API sanity checks enforce route-handler structure and middleware usage.
- CI lint/type/build checks catch broken transport integrations.
- Testing governance expects route handlers and middleware to be verified in the correct runtime.
- DTO and shared-schema expectations connect transport code back to API/DATA governance.

In other words, the policy is the contract; the gates are the enforcement path.

## 6. Relationship to the Over-Engineering Guardrail

The over-engineering guardrail is not only a review philosophy. Parts of it are reinforced by gate design:

- service anti-pattern checks prevent convenience abstractions from replacing explicit service contracts
- transport-policy gates keep new endpoints on the shared platform path instead of spawning bespoke wrappers
- testing-governance posture avoids fake confidence by separating advisory verification from required protection
- migration and RPC checks prevent “just add infrastructure/SQL” drift that bypasses established patterns

Together, these gates favor **small, governed, reversible changes** over speculative architecture.

## 7. Implemented vs. Aspirational Gates

The repository contains quality-gate intent that is broader than the currently enforced CI floor.

### Implemented today

- Husky pre-commit gate chain
- ESLint via `npm run lint`
- strict TypeScript via `npm run type-check`
- Next.js build via `npm run build`
- advisory unit-test CI job
- advisory E2E CI job

### Declared elsewhere but not fully enforced as hard CI today

- coverage thresholds as mandatory merge blockers
- full integration suites as always-required PR gates
- performance budgets as release-blocking automation
- docs-sync enforcement as an automated hard gate

This distinction matters for agentic transparency: agents should report the **actual enforcement state**, not the aspirational one.

## 8. Practical Guidance for Agentic Build Flows

When an agent implements code in PT-2, the expected validation sequence is:

1. Run targeted local checks relevant to the changed surface.
2. Run `npm run type-check` and `npm run lint`.
3. Run build or targeted tests when the change touches runtime behavior.
4. Stage changes and let Husky enforce architecture/security/pattern gates.
5. Treat CI `checks` as the clean-room merge-safety confirmation.
6. Treat advisory `test` and `e2e` failures as real signals, even when they are not yet required.

## 9. Summary

PT-2 already implements a meaningful validation system for agentic engineering:

- **Husky gates** stop invalid staged changes before commit.
- **Linters and strict TS** provide repo-wide static correctness checks.
- **CI checks** re-run merge-safety gates in a clean environment.
- **Advisory test layers** preserve honest signal without overstating enforcement.
- **Architecture and governance docs** are translated into executable constraints instead of remaining prose-only standards.

That combination is the real code-quality guardrail for the system's agentic workflows.
