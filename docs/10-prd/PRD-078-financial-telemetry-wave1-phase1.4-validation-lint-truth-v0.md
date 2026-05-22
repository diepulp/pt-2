---
id: PRD-078
title: Financial Telemetry - Wave 1 Phase 1.4 - Validation, Lint Enforcement, and Truth-Telling Tests
owner: Lead Architect (spec steward); Engineering (implementation)
status: Draft
affects:
  - PRD-070
  - PRD-071
  - PRD-072
  - PRD-073
  - PRD-074
  - PRD-075
  - PRD-076
  - PRD-077
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json
  - docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-FORBIDDEN-LABELS.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/SURFACE-RENDERING-CONTRACT.md
created: 2026-05-05
last_review: 2026-05-05
phase: Wave 1 Phase 1.4 - Validation: Lint Enforcement + Truth-Telling Tests
pattern: Enforcement-only; ESLint guardrails + representative API and E2E tests
http_boundary: true
parent_planning_ref: docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md
predecessor_prd: docs/10-prd/PRD-077-financial-telemetry-wave1-phase1.3-ui-split-display-v0.md
fib_h: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-4/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-4-VALIDATION-LINT-TRUTH.md
fib_s: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-4/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-4-VALIDATION-LINT-TRUTH.json
sdlc_category: Enforcement / QA
pipeline_chain: /prd-writer -> /lead-architect EXEC-078 -> /build-pipeline
---

# PRD-078 - Financial Telemetry - Wave 1 Phase 1.4 - Validation, Lint Enforcement, and Truth-Telling Tests

## 1. Overview

- **Owner:** Lead Architect (spec steward). Engineering owns implementation through `qa-specialist`, `api-builder` for route-boundary test alignment, and targeted ESLint rule work.
- **Status:** Draft
- **Summary:** Phase 1.4 adds the enforcement gate that protects the Wave 1 financial telemetry contract after Phase 1.3 migrated the production UI surfaces. This slice authors two custom ESLint rules, wires them into the existing flat config, adds a `test:surface` Jest runner, adds representative API boundary envelope tests, and adds Playwright assertions for authority-label visibility and I5 truth-telling. It is a CI guardrail, not a full regression suite: runtime tests are representative, while lint rules provide the broad failure boundary. It does not change service output, API contracts, DTO shapes, UI component props, database schema, observability, or deployment flow.

---

## 2. Problem & Goals

### 2.1 Problem

Pit bosses and floor supervisors now see authority-labeled financial values across the migrated PT-2 surfaces after Phase 1.3. That state is correct but not yet protected. A future change can still reintroduce forbidden labels such as "Handle" or "Coverage quality", type an already-migrated financial DTO field as a bare `number`, render a `FinancialValue.value` through a bare dollar formatter, or display `$0.00`/blank when the actual completeness state is `partial` or `unknown`.

The product problem is trust preservation. Operators do not care whether a regression originated in a DTO, formatter call, or component branch; they care that financial information remains visibly truthful. Phase 1.4 closes that gap by making regressions fail in CI and by proving the most important surface invariant: incomplete or unknown financial data must not look complete, settled, or zero.

### 2.2 Goals

| Goal | Observable Signal |
|------|-------------------|
| **G1 - Forbidden label enforcement** | `npm run lint` exits non-zero when production UI or DTO code reintroduces forbidden labels covered by `WAVE-1-FORBIDDEN-LABELS.md` |
| **G2 - Narrow financial DTO enforcement** | `npm run lint` exits non-zero when allowlisted financial DTO fields sourced from `WAVE-1-SURFACE-INVENTORY.md` and DTO definitions produced in EXEC-077 remain typed as `number` or `number | null` instead of `FinancialValue` |
| **G3 - Bare formatter enforcement** | `npm run lint` exits non-zero on direct `formatDollars(x.value)` or equivalent member-access calls where `.value` is accessed on an object imported or typed as `FinancialValue` from `types/financial.ts` |
| **G4 - Stable surface test gate** | `npm run test:surface` exists and runs the Phase 1.4 enforcement gate test set |
| **G5 - API envelope proof** | Representative financial API route tests assert `FinancialValue` envelope shape at explicitly enumerated financial field paths defined in the test fixture |
| **G6 - Truth-telling proof** | Playwright assertions prove at least one visible authority-labeled financial value within the primary financial display region of each representative surface and prove `partial`/`unknown` completeness does not render as `$0.00`, blank, or bare zero |
| **G7 - Wave 1 handoff readiness** | `npm run lint`, `npm run test:surface`, and `npm run e2e:playwright` exit 0; tracker cursor advances to Phase 1.5 |

### 2.3 Non-Goals

- No service, mapper, route handler, DTO shape, schema, OpenAPI, or SQL migration changes.
- No UI surface migration, `<FinancialValue>` props change, new authority value, or new completeness status.
- No exhaustive Playwright coverage across all migrated surface families.
- No semantic AST heuristics for every numeric DTO field; DTO linting is allowlist-based for known financial DTO fields only.
- No OpenAPI YAML linting through spectral, redocly, or a custom YAML parser.
- No `lib/format.ts` exported helper removal; that cleanup becomes safer after the lint guard exists.
- No full Wave 2 I1-I4 failure harness activation; `finance_outbox`, outbox consumers, and projections do not exist in Wave 1.
- No runtime observability, structured logs, or telemetry events for deprecated-label hits.
- No staged deploy, operator UX sign-off, or Wave 2 prep decision document; those belong to Phase 1.5 or later.

---

## 3. Users & Use Cases

- **Primary operational users:** Pit bosses and floor supervisors who rely on visible authority and completeness to interpret financial values during live shift operations.
- **Primary technical users:** Developers changing financial DTOs, UI components, and app routes; QA engineers and CI gates enforcing regression protection; lead architect closing Wave 1 exit criteria.

**Top Jobs:**

- As a **pit boss**, I need partial or unknown financial values to be labeled truthfully so I do not treat incomplete data as complete or settled.
- As a **floor supervisor**, I need financial labels to remain stable after release so future UI changes do not reintroduce ambiguous terms such as "Handle" or "Coverage quality".
- As a **developer**, I need CI to fail on known financial presentation regressions before merge, rather than relying on manual review to catch every DTO or formatter mistake.
- As a **QA engineer**, I need a stable `test:surface` command that runs the Phase 1.4 enforcement gate test set without sweeping unrelated tests.
- As a **lead architect**, I need Phase 1.4 to enforce already-delivered contracts without expanding into service, API, UI, observability, or Wave 2 infrastructure work.

---

## 4. Scope & Feature List

### 4.1 Precondition Gate

Phase 1.3 must be closed before implementation begins: every in-scope production financial surface has migrated to the stable `FinancialValue` rendering contract; `<FinancialValue>` props are frozen; sentinel grep is clean; `npm run type-check`, `npm run lint`, and `npm run build` passed for EXEC-077. If implementation requires changing service output, OpenAPI shape, DTO shape, or `<FinancialValue>` props, this PRD halts and requires FIB amendment.

### 4.2 In Scope

**ESLint guardrails:**
- Birth `.eslint-rules/no-forbidden-financial-label.js` as a CJS ESLint rule following the existing `.eslint-rules/` pattern.
- Implement `WAVE-1-FORBIDDEN-LABELS.md` §4.1-4.5: `Handle` with derived-rename exception, `Win` qualifier whitelist, KPI-context-scoped `Coverage`, `Theo: 0` / `Theo: $0`, and DTO chip identifier patterns.
- Birth `.eslint-rules/no-unlabeled-financial-value.js` as a CJS ESLint rule with explicit, non-heuristic scope.
- In `services/**/dtos.ts`, flag only allowlisted known financial DTO fields sourced from the Phase 1.3 surface inventory (`WAVE-1-SURFACE-INVENTORY.md`) and DTO definitions produced in EXEC-077 that remain typed as `number` or `number | null`; this list must be explicitly declared in the rule file and not inferred at runtime.
- In `components/**/*.tsx` and `app/**/*.tsx`, flag direct `formatDollars(x.value)` or `formatDollars(field.value)` calls where the argument is a direct member access `.value` on an object imported or typed as `FinancialValue` from `types/financial.ts` (explicit import/type reference, not inferred).
- Import both rules into `eslint.config.mjs` and add scoped config blocks for production component/app files and `services/**/dtos.ts`, with test exclusions matching existing conventions.

**Surface test runner:**
- Add `test:surface` to `package.json` following the existing `test:slice:*` naming pattern.
- Configure the script to run Phase 1.3 shared financial component tests, DEF-006 component tests, and the Phase 1.4-born API boundary envelope test file.
- Keep the script as the single Phase 1.4 enforcement gate runner for this test set; do not add a watch companion script.

**Representative API boundary tests:**
- Birth one Jest test file for 1-2 representative financial API routes sufficient to validate envelope shape at the API boundary.
- Assert `FinancialValue`-shaped response fields at explicitly enumerated financial field paths defined in the test fixture (for example, `total_buy_in`, `total_cash_out`, `net`, or equivalent route-specific fields): integer `value`, non-null `type`, non-null `source`, and non-null `completeness.status`.
- Keep coverage representative. The goal is envelope-shape validation at the wire, not taxonomy symmetry or exhaustive route matrix duplication.

**Representative Playwright assertions:**
- Birth one Playwright E2E file under `e2e/` combining DOM authority-label presence assertions and the I5 truth-telling subset.
- On 2-3 representative surfaces, assert at least one visible authority-labeled financial value appears within the primary financial display region of each surface.
- For an open-visit `start-from-previous` path, assert `partial` completeness renders explicit badge text and does not render `$0.00` or blank for `total_buy_in`, `total_cash_out`, or `net`.
- For a player 360 Theo-unknown path, assert the Theo row renders "Not computed" or "Unknown" and does not render `$0.00` or bare zero.

**Tracker and release handoff:**
- Run and record `npm run lint`, `npm run test:surface`, and `npm run e2e:playwright`.
- Update `ROLLOUT-TRACKER.json` with Phase 1.4 closure, cursor advanced to `active_phase: "1.5"`, exit date, EXEC-078 reference, and commit SHA.
- Keep `ROLLOUT-PROGRESS.md` synchronized with Phase 1.4 closure status.

### 4.3 Out of Scope

- Any service layer, API handler, OpenAPI, DTO shape, SQL, or UI component contract change.
- Any migration of additional UI surfaces or full-surface Playwright regression suite.
- Any lint rule that infers financial meaning from field-name heuristics such as suffixes.
- Any rule behavior that flags `hold_percent`, `average_bet`, policy thresholds (`min_bet`, `max_bet`, `watchlistFloor`, `ctrThreshold`), loyalty points, or `current_segment_average_bet`.
- Any cleanup of `formatDollars` or `formatCents` exports from `lib/format.ts`.
- Any runtime observability or Wave 2 outbox/projection/failure-harness work.

---

## 5. Requirements

### 5.1 Functional Requirements

1. `no-forbidden-financial-label` must be active in `npm run lint` for production UI and DTO files and must fail on forbidden labels covered by `WAVE-1-FORBIDDEN-LABELS.md` §4.1-4.5.
2. `no-forbidden-financial-label` must preserve declared exceptions, including derived-rename handling for `Handle` and qualifier whitelisting for `Win`.
3. `no-unlabeled-financial-value` must be active in `npm run lint` for `services/**/dtos.ts`, `components/**/*.tsx`, and `app/**/*.tsx` according to scoped config blocks.
4. `no-unlabeled-financial-value` must flag allowlisted financial DTO fields sourced from `WAVE-1-SURFACE-INVENTORY.md` and DTO definitions produced in EXEC-077 that remain typed as `number` or `number | null` instead of `FinancialValue`; the allowlist must be explicitly declared in the rule file and not inferred at runtime.
5. `no-unlabeled-financial-value` must not flag numeric fields outside the maintained allowlist, including `hold_percent`, `average_bet`, policy thresholds, loyalty points, and `current_segment_average_bet`.
6. `no-unlabeled-financial-value` must flag direct `formatDollars(x.value)` or `formatDollars(field.value)` calls where the argument is a direct member access `.value` on an object imported or typed as `FinancialValue` from `types/financial.ts` through an explicit import or type reference, not inferred from naming or runtime heuristics.
7. Both new ESLint rules must be CJS modules exporting `create(context)` and must follow the existing local rule import pattern in `eslint.config.mjs`.
8. `test:surface` must be present in `package.json` and must run the Phase 1.4 enforcement gate test set without sweeping unrelated test directories.
9. Representative API boundary tests must assert `FinancialValue` envelope shape at explicitly enumerated financial field paths defined in the test fixture, such as `total_buy_in`, `total_cash_out`, `net`, or equivalent route-specific fields: integer `value`, non-null `type`, non-null `source`, and non-null `completeness.status`.
10. Playwright DOM assertions must prove at least one visible authority-labeled financial value within the primary financial display region of each representative surface under test.
11. I5 partial-completeness assertions must prove `start-from-previous` shows explicit `Partial` or equivalent text and does not render `$0.00` or blank for `total_buy_in`, `total_cash_out`, or `net`.
12. I5 unknown-completeness assertions must prove player 360 Theo displays "Not computed" or "Unknown" and does not render `$0.00` or bare zero.
13. `ROLLOUT-TRACKER.json` must record Phase 1.4 closure and advance the cursor to Phase 1.5.

### 5.2 Non-Functional Requirements

1. `npm run lint` must exit 0 on the clean post-Phase-1.3 codebase.
2. `npm run test:surface` must exit 0 on the clean post-Phase-1.3 codebase.
3. `npm run e2e:playwright` must exit 0 for the Phase 1.4 Playwright file or equivalent suite invocation.
4. Rule implementation must avoid heuristic financial-field inference; DTO enforcement uses a maintained allowlist.
5. Runtime tests must stay representative to keep CI stable and fast.
6. No production code may introduce `as any`, `console.*`, or type imports outside `types/remote/database.types.ts` where database types are needed.
7. The slice must remain independently shippable before Phase 1.5 cleanup, rollout, or Wave 2 infrastructure begins.

> Architecture details: Service, API, and UI contracts are frozen inputs from PRD-070 through PRD-077. This PRD adds enforcement only.

---

## 6. UX / Flow Overview

This slice does not change user-facing navigation or screen behavior. It protects the already-migrated operator experience through CI and test flows:

- A developer opens a pull request touching financial DTOs, UI components, or app routes.
- `npm run lint` fails if the change reintroduces a forbidden financial label, an allowlisted financial DTO field typed as a bare number, or a direct formatter call against `FinancialValue.value`.
- `npm run test:surface` runs the Phase 1.4 enforcement gate test set, including shared financial display tests, DEF-006 component tests, and representative API envelope tests.
- Playwright navigates representative migrated surfaces and confirms that visible authority-labeled financial values appear.
- Playwright exercises the I5 partial and unknown completeness paths so incomplete financial data remains visibly truthful rather than appearing as zero, blank, or complete.
- After all gates pass, Phase 1.4 can close and Phase 1.5 rollout/sign-off can begin.

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **Phase 1.3 closure:** EXEC-077 closed 2026-05-04 with all in-scope surfaces migrated and `<FinancialValue>` props frozen.
- **Forbidden label source:** `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-FORBIDDEN-LABELS.md` §4 is the authority for forbidden-label patterns and exceptions.
- **Rendering contract:** `docs/issues/gaps/financial-data-distribution-standard/actions/SURFACE-RENDERING-CONTRACT.md` defines authority and completeness semantics enforced by this phase.
- **Existing lint infrastructure:** `.eslint-rules/` and `eslint.config.mjs` already contain local rule patterns that Phase 1.4 must follow.
- **Existing test infrastructure:** Jest, Playwright, and the existing `e2e/` directory must be used without adding new test infrastructure.
- **Seed data:** Playwright I5 scenarios require local or CI data containing an open visit for partial completeness and a Theo-unknown player 360 state.

### 7.2 Risks

| Risk | Mitigation |
|------|------------|
| DTO lint scope catches legitimate numeric fields | Use a maintained allowlist of known financial DTO fields sourced from the Phase 1.3 surface inventory (`WAVE-1-SURFACE-INVENTORY.md`) and DTO definitions produced in EXEC-077; declare the list explicitly in the rule file and do not infer from numeric type or field-name suffixes |
| Playwright assertions become semantic validators | Assert presence of at least one visible authority-labeled financial value within the primary financial display region of each representative surface; keep detailed semantic truth checks limited to I5 partial/unknown cases |
| Representative route tests are mistaken for taxonomy coverage | State route selection as shape validation only; do not require class symmetry or exhaustive route matrices |
| Seed data does not include I5 states | EXEC-SPEC must verify seed coverage and add only minimal prerequisite seed data if needed |
| Formatter cleanup is bundled into enforcement | Defer `lib/format.ts` export removal until after this lint guard lands |
| OpenAPI linting is pulled into this phase | Defer YAML lint tooling to a separate toolchain decision; keep Phase 1.4 inside existing ESLint/Jest/Playwright boundaries |

### 7.3 Open Questions for EXEC-078

- Which exact financial DTO fields belong in the maintained allowlist for `no-unlabeled-financial-value`, sourced from `WAVE-1-SURFACE-INVENTORY.md` and DTO definitions produced in EXEC-077, and explicitly declared in the rule file?
- Which 1-2 representative financial API routes are cheapest and most stable for boundary envelope tests?
- Which existing seeded records provide the open-visit and Theo-unknown Playwright scenarios, or what minimal seed patch is required?
- What exact `jest --testPathPatterns` value keeps `test:surface` focused on the Phase 1.4 enforcement gate test set?

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `.eslint-rules/no-forbidden-financial-label.js` exists, is wired into `eslint.config.mjs`, and fails on forbidden-label fixtures or test introductions.
- [ ] `.eslint-rules/no-unlabeled-financial-value.js` exists, is wired into `eslint.config.mjs`, and fails on allowlisted financial DTO fields typed as `number` or `number | null`.
- [ ] `test:surface` exists in `package.json` and runs the Phase 1.4 enforcement gate test set.
- [ ] Representative API boundary tests assert `FinancialValue` envelope shape at explicitly enumerated financial field paths defined in the test fixture.
- [ ] Playwright assertions prove visible authority-labeled financial values within primary financial display regions and I5 partial/unknown truth-telling behavior.

**Data & Integrity**
- [ ] No service output, API contract, DTO shape, database schema, or `<FinancialValue>` props are changed.
- [ ] Allowlisted DTO enforcement excludes ratios, policy thresholds, loyalty points, and other non-currency unit systems.

**Security & Access**
- [ ] New tests preserve existing auth and RLS setup patterns; no test bypass is introduced into production code.
- [ ] No new privilege path, spoofable authority input, or client-controlled completeness override is introduced.

**Testing**
- [ ] `npm run lint` exits 0 on the clean post-Phase-1.3 codebase.
- [ ] Introducing a representative forbidden label, bare DTO number field, or direct formatter misuse causes `npm run lint` to exit non-zero.
- [ ] `npm run test:surface` exits 0.
- [ ] `npm run e2e:playwright` exits 0 for the Phase 1.4 enforcement test file or equivalent suite invocation.

**Operational Readiness**
- [ ] `ROLLOUT-TRACKER.json` records Phase 1.4 closure, `active_phase: "1.5"`, exit date, EXEC-078 reference, and commit SHA.
- [ ] `ROLLOUT-PROGRESS.md` is synchronized with the Phase 1.4 closure state.

**Documentation**
- [ ] EXEC-078 records exact lint rule scopes, DTO allowlist source, test route choices, `test:surface` command, and validation output.
- [ ] Known limitations are documented: representative runtime coverage, no OpenAPI YAML lint, no full I1-I4 harness, and no `lib/format.ts` helper removal.

---

## 9. Related Documents

- **FIB-H:** `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-4/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-4-VALIDATION-LINT-TRUTH.md`
- **FIB-S:** `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-4/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-4-VALIDATION-LINT-TRUTH.json`
- **Predecessor PRD:** `docs/10-prd/PRD-077-financial-telemetry-wave1-phase1.3-ui-split-display-v0.md`
- **Surface Rendering Contract:** `docs/issues/gaps/financial-data-distribution-standard/actions/SURFACE-RENDERING-CONTRACT.md`
- **Forbidden Labels:** `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-FORBIDDEN-LABELS.md`
- **Rollout Roadmap:** `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md`
- **Rollout Tracker:** `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json`
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **QA Standards:** `docs/40-quality/`
- **Governance:** `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`

---

## Appendix A: Implementation Workstreams

### WS1: Forbidden Label Rule

- [ ] Implement `.eslint-rules/no-forbidden-financial-label.js`.
- [ ] Cover `Handle`, `Win`, `Coverage`, `Theo: 0/$0`, and DTO chip identifier cases from `WAVE-1-FORBIDDEN-LABELS.md`.
- [ ] Wire the rule into `eslint.config.mjs` with production globs and test exclusions.

### WS2: Unlabeled Financial Value Rule

- [ ] Implement `.eslint-rules/no-unlabeled-financial-value.js`.
- [ ] Define the maintained allowlist of known financial DTO fields sourced from the Phase 1.3 surface inventory (`WAVE-1-SURFACE-INVENTORY.md`) and DTO definitions produced in EXEC-077; this list must be explicitly declared in the rule file and not inferred at runtime.
- [ ] Flag allowlisted DTO fields still typed as `number` or `number | null`.
- [ ] Flag direct formatter member-access calls where `.value` is accessed on an object imported or typed as `FinancialValue` from `types/financial.ts` through an explicit import or type reference.

### WS3: Jest Surface Gate

- [ ] Add `test:surface` to `package.json`.
- [ ] Birth representative API boundary envelope tests.
- [ ] Confirm the command runs the Phase 1.4 enforcement gate test set only.

### WS4: Playwright Truth-Telling Gate

- [ ] Birth `e2e/financial-enforcement.spec.ts` or equivalent.
- [ ] Assert visible authority-labeled financial values on representative surfaces.
- [ ] Assert I5 partial and unknown completeness truth-telling cases.

### WS5: Validation and Tracker Closure

- [ ] Run `npm run lint`.
- [ ] Run `npm run test:surface`.
- [ ] Run `npm run e2e:playwright`.
- [ ] Update rollout tracker and progress artifacts with Phase 1.4 closure.

---

## Appendix B: Explicit Expansion Triggers

Amend this PRD and its governing FIB before implementation continues if any downstream artifact proposes:

- Changing `<FinancialValue>` props, `types/financial.ts`, service DTO shapes, route handler outputs, or OpenAPI schemas.
- Flagging all numeric DTO fields rather than the maintained financial-field allowlist.
- Requiring taxonomy-symmetric route selection instead of route-agnostic representative envelope-shape validation.
- Requiring Playwright to assert every rendered currency value against a nearby authority label.
- Adding OpenAPI YAML lint tooling, runtime observability, `lib/format.ts` helper removal, SQL migrations, or Wave 2 I1-I4 harness work.

---

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v0 | 2026-05-05 | PRD Writer | Initial PRD from Phase 1.4 FIB-H/FIB-S |
