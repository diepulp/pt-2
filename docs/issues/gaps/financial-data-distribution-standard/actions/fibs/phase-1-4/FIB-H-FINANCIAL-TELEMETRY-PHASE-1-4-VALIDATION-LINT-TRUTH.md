# FIB-H — Financial Telemetry Phase 1.4 — Validation: Lint Enforcement + Truth-Telling Tests

status: DRAFT
date: 2026-05-04
owner: Financial Telemetry (Cross-context)

predecessor_fib: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-3/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-3-UI-SPLIT-DISPLAY.md
predecessor_phase: Phase 1.3 — UI Layer: Split Display + Labels (EXEC-077, closed 2026-05-04, all WS1–WS8 gates passed)

successor_slice: Phase 1.5 — Rollout & Sign-off. Requires its own FIB + PRD pair.

---

# Scope Guardrail Block

**Governance reference:** `docs/70-governance/FIB_GENERATION_SCOPE_GUARDRAIL.md`

**One-line boundary:**
This FIB introduces CI guardrails — minimal ESLint rules and targeted test assertions — that prevent reintroduction of unlabeled financial values, forbidden labels, and misleading completeness rendering. It does not introduce exhaustive surface validation or new enforcement infrastructure.

**Primary change class:** Enforcement

Justification: Per GOV-FIB-001 §4, Enforcement governs "lint rules, CI gates, full contract matrices, Playwright assertions." Every deliverable in Phase 1.4 falls under this class without exception: the two ESLint custom rules, the `test:surface` Jest suite, the API route boundary tests, and the Playwright DOM assertions (including the I5 truth-telling subset) are all enforcement tooling applied to a contract that Phase 1.3 fully deployed. No semantic changes, no UI behavior changes, no service changes.

**Coverage mode:** Targeted (representative enforcement)

Justification:
- Lint rules activate globally — a rule that applies to some DTO files but not others produces no meaningful protection. Partial activation is self-defeating for Enforcement.
- Runtime validation (API tests, Playwright assertions) is intentionally limited to representative surfaces sufficient to prove invariants. Exhaustive surface validation is not the goal of a CI guardrail; it is a full regression suite and belongs to a different category of work.
- The `test:surface` script must include all existing and Phase 1.4-born test targets to serve as the exit gate runner, but the Phase 1.4-born targets are representative, not exhaustive.

**Primary layer:** Enforcement

**Layer budget:**
- New ESLint rule files: 2 (`.eslint-rules/no-forbidden-financial-label.js`, `.eslint-rules/no-unlabeled-financial-value.js`)
- `eslint.config.mjs` additions: 2 import lines + 2 scoped config blocks
- `package.json` addition: 1 new `test:surface` script
- New Jest test files: 1 (API boundary envelope test for 1–2 representative routes)
- New Playwright E2E test files: 1 (I5 truth-telling + minimal DOM assertion)
- Total logic-bearing files: 4–6
- Directory boundaries: `.eslint-rules/` (existing pattern), `e2e/` (existing Playwright directory), service `__tests__/` (existing pattern), `app/api/` test adjacency
- Bounded contexts: cross-cutting (lint rules span all financial service boundaries); financial-display (Playwright DOM assertions target migrated surfaces)

**§11 multi-boundary justification (GOV-FIB-001 §11):**
File count is within the 5–7 logic-file threshold. Two directory boundaries (`.eslint-rules/`, `e2e/`) are the minimum required to separate the lint rule implementation from the E2E test implementation — they cannot be co-located by convention. The Jest DTO tests follow the existing pattern of co-location with services (`services/**/` or `__tests__/`) and do not introduce a new boundary. No hidden multi-class scope is present.

**Cause vs consequence split:**

| Category | This FIB | Next FIB / Phase |
|---|---|---|
| Service output integer-cents (cause) | Complete — Phases 1.2B-A/B/C | — |
| API contract stable (cause) | Complete — Phase 1.2B-C | — |
| UI surface migrations to `<FinancialValue>` (cause) | Complete — Phase 1.3 | — |
| `<FinancialValue>` props contract frozen (cause) | Complete — Phase 1.3 EXEC-077 §WS1 | — |
| ESLint `no-forbidden-financial-label` (Enforcement) | **In scope** | — |
| ESLint `no-unlabeled-financial-value` (Enforcement) | **In scope** | — |
| `test:surface` script birth (Enforcement) | **In scope** | — |
| API route boundary envelope tests for 1–2 representative financial routes (Enforcement) | **In scope** | — |
| Playwright DOM authority-label presence assertions, representative surfaces only (Enforcement) | **In scope** | — |
| I5 truth-telling Playwright tests: partial + unknown completeness rendering (Enforcement) | **In scope** | — |
| `lib/format.ts` exported helper removal (`formatDollars`, `formatCents`) | Not in scope | Phase 1.5 or dedicated cleanup; lint guard this FIB produces enables safe removal |
| Full I1–I4 failure harness (atomicity, durability, idempotency, replayability) | Not in scope | Wave 2 — no outbox/projections exist |
| OpenAPI YAML lint / spectral contract validation | Not in scope | Separate toolchain decision; not part of ESLint flat config |
| Runtime usage tracking / structured logs per deprecated-label hit | Not in scope | Observability class; declared deferred since Phase 1.2B-C |
| `WAVE-2-PREP-DECISIONS.md` Q1–Q4 resolution documentation | Not in scope | Post-Phase 1.5, gating Wave 2 |
| Staged deploy / operator UX sign-off (Rollout) | Not in scope | Phase 1.5 |

**Adjacent consequence ledger (GOV-FIB-001 §6.6):**

| Temptation removed from MUST | Why adjacent | Disposition |
|---|---|---|
| `lib/format.ts` exported helper removal | Completing the "formatters consolidated into `<FinancialValue>`" story; feels like the natural final step of the migration | Not Enforcement — it is a cleanup consequence that becomes safe to perform once the lint guard is live. The lint rule this FIB produces will catch any new bare formatter call before it ships. Removal is a separate cut with its own blast-radius check. Deferred to Phase 1.5 cleanup or a named follow-on slice. |
| Full I1–I4 failure harness wiring (atomicity, crash recovery, duplicate delivery, replay) | The harness file is labeled EXEC-READY; it would feel complete to activate the whole thing here | Wave 2 mechanics only — `finance_outbox`, outbox consumer, and projections do not exist in Wave 1. Activating the harness in Phase 1.4 would require stubbing infrastructure that has no production equivalent. Deferred to Wave 2 as the Wave 2 exit gate. |
| OpenAPI YAML lint rule (validate `$ref: '#/components/schemas/FinancialValue'` presence) | A logical complement to `no-unlabeled-financial-value` at the schema level | Different toolchain (spectral, redocly, or custom YAML parser). Not part of the ESLint flat config pattern. Activating it requires a toolchain decision not scoped here. Deferred to a dedicated tooling slice or Phase 1.5 CI hardening. |
| Runtime usage tracking / structured logs per deprecated-label hit | "While wiring CI, also add observability on violations" pattern | Observability class — per GOV-FIB-001 §3 diagnostic sentence, adding observability to a lint enforcement slice is a documented adjacent bundling defect. Explicitly deferred since Phase 1.2B-C. |
| `WAVE-2-PREP-DECISIONS.md` creation for Q1–Q4 | These questions surface naturally during Wave 1 review; Phase 1.4 is the last implementation phase before Rollout | Documentation for Q1–Q4 is gated by Wave 1 sign-off (Phase 1.5); writing it in Phase 1.4 is premature and may conflict with operator feedback from Phase 1.5 walkthrough. |

Three items above represent cross-class work explicitly considered and removed: `lib/format.ts` removal is Infrastructure/cleanup, the I1–I4 harness is Infrastructure/Wave 2, and the observability logging is Observability — all differ from the Enforcement primary class.

**Atomicity test:**
1. Can this FIB ship without the deferred downstream work? Yes — lint rules, `test:surface`, and Playwright assertions are independently deployable. `lib/format.ts` helper removal is blocked on this FIB's lint guard existing, not the reverse. I1–I4 harness is entirely Wave 2. After Phase 1.4 ships, CI is red on any new violation; the system is correctly enforced.
2. Can the deferred downstream work begin after this FIB without rewriting it? Yes — `lib/format.ts` removal requires only that the lint rule exists (which this FIB provides) and a grep to confirm no remaining callers outside `<FinancialValue>`. Wave 2 harness begins from an outbox DDL and consumer, not from this FIB's lint rules.
3. Is the shipped FIB internally consistent and truthful? Yes — both lint rules are active in CI, the `test:surface` suite passes, and the I5 Playwright tests confirm completeness is never silently misrepresented. There is no "temporarily broken" state: the enforcement tooling applies to the already-stable surface contract immediately on merge.

**GOV-FIB-001 §7 red flags check:**
- "Must land atomically across service, API, UI, tests, and observability" — No. Enforcement layer only: lint rules + test files + script.
- "Includes both pattern proof and full inventory expansion" — No. Lint rules are global by nature; runtime tests are intentionally representative (not full-inventory). No pattern-proof → full-rollout bundling.
- "Includes both a semantic change and the UI migration that consumes it" — No. Semantics are complete (Phase 1.2B). UI migration is complete (Phase 1.3). This FIB enforces the stable result.
- "Claims one primary class but includes logic work from another class" — No. ESLint rules, Jest tests, and Playwright E2E tests are all Enforcement instruments. No service mappers, no component births, no API reshaping.
- "Claims representative but uses full-inventory language" — No. Coverage mode is declared Targeted (representative enforcement) with explicit justification; runtime tests name concrete representative surfaces, not categories.
- All remaining red flags: Not triggered.

---

# A. Identity

**Feature name:** Phase 1.4 — Validation: Lint Enforcement + Truth-Telling Tests

**Feature ID:** FIB-H-FIN-PHASE-1-4

**Related phase:** Wave 1 Phase 1.4 (successor to Phase 1.3 — UI Split Display + Labels, EXEC-077 closed 2026-05-04)

**Requester / owner:** Vladimir Ivanov

**Date opened:** 2026-05-04

**Priority:** P1 — Phase 1.4 lint and test enforcement is Wave 1 exit criterion 2 ("Lint rule red on violations, active in CI") and criterion 3 ("Truth-telling test suite passes, harness I5 subset"). Without Phase 1.4, the Phase 1.3 migration has no regression protection and Wave 1 cannot close.

**Target decision horizon:** Wave 1 Phase 1.4 — final implementation phase before Phase 1.5 Rollout & Sign-off.

---

# B. Operator Problem

Pit bosses and floor supervisors now see authority-labeled financial values across every PT-2 surface after Phase 1.3. That labeling is correct today. Without automated enforcement, nothing prevents a future code change from reintroducing a bare currency number in a service DTO, adding a forbidden label like `"Handle"` or `"Coverage quality"` back to a UI component, or — most critically — rendering `$0` or a blank field when the actual completeness state is `partial` or `unknown`. The operator would see a number that appears complete and authoritative but is silently misrepresenting incomplete data. The problem is not that violations exist now; the problem is that no CI gate prevents them from re-entering, and no automated test verifies that surfaces correctly communicate to operators when financial data is incomplete or not yet computed.

---

# Enforcement Philosophy (Phase 1.4 Constraint)

Phase 1.4 is a CI guardrail, not a validation system.

The goal is:
- fail fast on obvious violations (lint)
- verify contract integrity at the boundary (API test)
- prove truthfulness invariant at the surface (I5 Playwright)

The goal is NOT:
- exhaustive UI validation across all migrated surfaces
- semantic inference of all financial fields via heuristic AST patterns
- full-surface regression coverage (that is a dedicated QA regression suite)

Representative enforcement is sufficient as long as violations cannot silently pass CI. The lint rules make introduction of a violation a build failure. The representative tests prove the contract holds at the wire and that completeness is never silently misrepresented. Everything beyond that is useful but belongs to a different category of work.

---

# C. Pilot-fit / Current-Slice Justification

Phase 1.4 is two Wave 1 exit criteria: criterion 2 (lint rule active in CI, red on violations) and criterion 3 (truth-telling test suite passes against I5 harness subset). Without both, the Wave 1 → Wave 2 handoff gate cannot be passed regardless of how clean the current codebase is. Additionally, Phase 1.3 explicitly deferred enforcement to Phase 1.4 in its Adjacent Consequence Ledger and in EXEC-077's Phase 1.4 handoff section. Phase 1.3 produced the stable `<FinancialValue>` props contract — Phase 1.4 targets that contract with lint rules. Phase 1.3 migrated all surfaces — Phase 1.4 writes Playwright assertions against that stable, fully-migrated surface set. The dependency direction is satisfied: Enforcement must follow stable contract deployment (GOV-FIB-001 §14).

---

# D. Primary Actor and Operator Moment

**Primary actor (operational):** Pit boss / floor supervisor — the end user whose confidence in displayed financial data the enforcement protects.

**Primary actor (technical):** Developer committing code to the `pt-2` repository — the actor who is stopped at the CI boundary when a violation is introduced.

**When does this happen?** At CI time on every pull request touching financial service DTOs, UI components, or app routes. At E2E test time when surfaces are exercised with partial or unknown data states.

**Primary surface:** CI pipeline — `npm run lint` and `npm run test:surface`. Playwright E2E suite for I5 truth-telling. The PT-2 UI surfaces (all 13 migrated families) are tested targets, not modified artifacts.

**Trigger event:** A developer opens a pull request that modifies a financial DTO, UI component, or app route. The lint rules and test suite run and fail if a violation is present, surfacing the issue before merge. Separately, when the Playwright E2E suite runs against a surface with partial or unknown completeness data, the test asserts that the operator sees explicit completeness information rather than a misleading complete-looking display.

---

# E. Feature Containment Loop

1. Developer writes `.eslint-rules/no-forbidden-financial-label.js` following the existing flat-config plugin pattern in `.eslint-rules/` (CJS module, `create(context)` returning AST visitors), implementing sub-rules §4.1–4.5 from `WAVE-1-FORBIDDEN-LABELS.md` verbatim: `Handle` with derived-rename exception (§4.1), `Win` with qualifier whitelist (§4.2), `Coverage` KPI-context scoped to named file patterns and JSX elements (§4.3), `Theo: 0` / `Theo: $0` patterns (§4.4), and DTO chip identifier patterns on `services/**/dtos.ts` files (§4.5) → rule file exists, imports correctly as a CJS module.

2. Developer writes `.eslint-rules/no-unlabeled-financial-value.js` following the same pattern, implementing a deliberately simple rule: in `services/**/dtos.ts`, flag explicitly identified financial fields in DTOs (fields previously migrated in Phase 1.3) that remain typed as `number` or `number | null`; the DTO sub-rule operates on a maintained allowlist of known financial DTO fields, not all numeric fields; in `components/**/*.tsx` and `app/**/*.tsx`, flag direct `formatDollars(x.value)` or `formatDollars(field.value)` call expressions where the callee argument is a member access on a known `FinancialValue`-typed variable (explicit pattern only, not heuristic scan) → rule file exists; scope is narrow enough to be reliable without false-positives; the Playwright assertions cover what the rule cannot reach.

3. Developer imports both new rules into `eslint.config.mjs` at the top-level import block (matching the existing import pattern for all ten current rules) and adds two scoped config blocks: one targeting `components/**/*.{ts,tsx}`, `app/**/*.{ts,tsx}` for `no-forbidden-financial-label` and the `formatDollars`/`formatCents` sub-rule of `no-unlabeled-financial-value`; one targeting `services/**/dtos.ts` for the DTO currency-field sub-rule of `no-unlabeled-financial-value` and the chip-identifier sub-rule of `no-forbidden-financial-label` (§4.5). Test file glob exclusions follow the existing convention → `npm run lint` exits 0 on the current clean codebase; a test introduction of `label: 'Handle'` in a component file causes `npm run lint` to exit non-zero.

4. Developer adds `test:surface` script to `package.json` following the `test:slice:*` naming pattern: `jest --testPathPatterns='components/financial/__tests__|components/modals/rating-slip/__tests__|components/player-sessions/__tests__|__tests__/financial-surface'` (exact pattern TBD during EXEC-SPEC scaffolding to include Phase 1.4-born test files without sweeping unrelated test dirs) → `npm run test:surface` is a stable, invokable command that runs the Phase 1.4 enforcement gate test set.

5. Developer authors API route boundary envelope tests for 1–2 representative financial routes sufficient to validate envelope shape at the API boundary: each test asserts the response body carries `FinancialValue`-shaped objects (integer `value`, non-null `type`, non-null `source`, non-null `completeness.status`) at the known financial field paths → runtime contract validation layer; representative coverage proves the contract holds at the wire without duplicating the exhaustive route matrices already delivered in Phase 1.2B-C.

6. Developer authors Playwright DOM assertion tests combined with the I5 truth-telling suite in a single E2E file (`e2e/financial-enforcement.spec.ts` or equivalent under the existing `e2e/` directory):
   - **Minimal DOM authority assertion (2–3 representative surfaces):** Navigate to one shift-dashboard-v3 surface and one player 360 surface; assert presence of at least one visible authority-labeled financial value on each representative surface.
   - **I5 Scenario 1 (partial):** Navigate to a player session with an open visit. Open the `start-from-previous` panel. Assert the DOM contains the partial-completeness badge text (`"Partial"` or equivalent per `<CompletenessBadge status="partial">`). Assert no `$0.00` or empty currency cell for `total_buy_in`, `total_cash_out`, or `net`.
   - **I5 Scenario 2 (unknown):** Navigate to a player 360 profile where the Theo estimate is `unknown`. Assert the DOM contains `"Not computed"` or `"Unknown"` near the Theo row. Assert the Theo row does not contain `$0.00` or bare zero.
   → Authority visibility proven on representative surfaces; I5 Wave 1 invariant verified; both concerns ship in a single E2E file to minimize test infrastructure overhead.

7. Developer runs full validation sequence: `npm run lint` (both new rules active, zero violations on clean codebase), `npm run test:surface` (all Jest targets pass), `npm run e2e:playwright` (Playwright E2E file passes) → all Phase 1.4 exit gate criteria met. Records output in implementation notes.

8. Developer updates `ROLLOUT-TRACKER.json`: advances cursor to `active_phase: "1.5"`, records Phase 1.4 exit date, EXEC reference, and commit SHA → handoff to Phase 1.5 Rollout & Sign-off.

---

# F. Required Outcomes

- ESLint `no-forbidden-financial-label` is active in CI: `npm run lint` exits non-zero on any forbidden label (`Handle`, unqualified `Win`, `Coverage quality`, `Theo: 0/$0`, `totalChipsOut`/`totalChipsIn`) appearing in production UI or DTO files; `npm run lint` exits 0 on the clean post-Phase-1.3 codebase
- ESLint `no-unlabeled-financial-value` is active in CI: `npm run lint` exits non-zero on allowlisted financial DTO fields in `services/**/dtos.ts` that remain typed as `number` or `number | null` instead of `FinancialValue`; exits 0 on the clean codebase
- `npm run test:surface` script exists and passes, covering: shared financial display component tests (Phase 1.3), DEF-006 component tests (Phase 1.3), and representative API route boundary envelope tests (Phase 1.4)
- Playwright DOM assertions pass on 2–3 representative surfaces, proving at least one visible authority-labeled financial value appears on each representative surface
- I5 truth-telling Playwright tests pass: `partial` completeness state renders explicit badge text (not `$0.00` or blank); `unknown` completeness state renders "Not computed" or "Unknown" (not `$0.00` or blank) — for `start-from-previous` and Theo surfaces
- `npm run lint`, `npm run test:surface`, and `npm run e2e:playwright` all exit 0 as the Phase 1.4 exit gate
- ROLLOUT-TRACKER.json updated with Phase 1.4 closure and cursor advanced to Phase 1.5

---

# G. Explicit Exclusions

**Wave 2 scope — not part of any Wave 1 phase:**
- Full I1–I4 failure harness scenarios (atomicity, crash recovery, duplicate delivery, replay determinism) — require `finance_outbox`, outbox consumer, and projections that do not exist in Wave 1
- `finance_outbox` DDL, outbox consumer worker, or projection refactor
- Wave 2 schema migrations

**Cleanup consequent on this FIB — not in scope:**
- `lib/format.ts` exported helper removal (`formatDollars`, `formatCents`) — the lint guard this phase provides enables safe removal; the removal itself is a separate cut with its own consumer grep and blast-radius check. Deferred to Phase 1.5 or a named follow-on slice.

**Different toolchain — not in scope:**
- OpenAPI YAML lint rule (spectral, redocly, or custom YAML parser) — not part of the ESLint flat config pattern established in this codebase; requires a separate toolchain decision
- Screenshot-based visual regression tests — Phase 1.4 uses DOM assertions, not screenshot comparison

**Observability — deferred since Phase 1.2B-C:**
- Runtime usage tracking or structured log events per deprecated-label hit or forbidden-label detection — Observability class; GOV-FIB-001 §14 dependency order places Observability after Enforcement

**Wave 2 documentation:**
- `WAVE-2-PREP-DECISIONS.md` capturing Q1–Q4 resolution — this belongs to the Phase 1.5 retrospective and Wave 2 prep, not Phase 1.4 implementation

**Service / API / UI (prior phases — complete):**
- Service layer changes — Phases 1.1, 1.2A, 1.2B
- API contract / OpenAPI changes — Phase 1.2B-C (EXEC-076)
- UI surface migrations — Phase 1.3 (EXEC-077)
- `<FinancialValue>` component births or props changes — Phase 1.3 (EXEC-077 §WS1); the props contract is frozen and is a read-only input to Phase 1.4 lint rules

**Hard invariants (all phases — remain unchanged):**
- `hold_percent` is never `FinancialValue` — bare ratio, DEF-NEVER
- `average_bet`, policy thresholds (`min_bet`, `max_bet`, `watchlistFloor`, `ctrThreshold`), loyalty points, `current_segment_average_bet` — not wrapped; operator inputs / non-currency / policy config per WAVE-1-CLASSIFICATION-RULES §6; the `no-unlabeled-financial-value` rule must not flag these

---

# H. Adjacent Ideas Considered and Rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Wire `lib/format.ts` helper removal alongside the lint rule | The lint rule detects bare formatter calls; once the rule exists, the helpers could be deprecated immediately | Two distinct operations: the rule detects new violations; helper removal requires a consumer grep to confirm zero live callers outside `<FinancialValue>`. Bundling them creates a dependency within the phase: if the grep finds a missed consumer, the lint rule merge is blocked. Separate cuts allow lint rule to land independently. The rule this FIB produces is precisely the gate that makes future removal safe. |
| Activate the full `FAILURE-SIMULATION-HARNESS.md` in Phase 1.4 | The harness is labeled EXEC-READY and the I5 scenario is in scope; pulling in I1–I4 would complete the harness activation | I1–I4 harness scenarios require `finance_outbox` inserts, outbox consumer batch processing, crash simulation (`process.exit(1)` hooks), and projection DB tables — none of which exist in Wave 1. Writing the harness tests in Phase 1.4 against stubs would create tests that pass against the stub but provide no signal against production infrastructure. The Wave 1 I5 subset (completeness rendering) requires only Playwright DOM navigation against real surfaces. |
| OpenAPI contract lint via spectral | Would complement `no-unlabeled-financial-value` at the schema level; OpenAPI spec is stable | Different toolchain and CI integration path. The ESLint flat config pattern cannot enforce YAML schema structure. Adding spectral requires a separate CI step, configuration file, and ruleset definition — an Infrastructure-class addition. Not Enforcement within the ESLint boundary this FIB declares. |
| Add a `test:surface:watch` development companion script | Developers would benefit from a watch mode for the `test:surface` suite | Unnecessary scope. `jest --watch` already works; a named watch script adds no CI value. The FIB containment loop adds exactly one script (`test:surface`) — the exit gate runner. |
| Full surface Playwright coverage (all 13 migrated families) | Would guarantee every surface is continuously validated after Phase 1.3 | Rejected — Phase 1.4 is an enforcement gate, not a full UI validation system. Representative coverage (2–3 surfaces) is sufficient to prove the authority-label invariant while keeping CI fast and stable. Exhaustive surface Playwright coverage is a separate regression suite category and does not belong in an Enforcement FIB. |

---

# I. Dependencies and Assumptions

- Phase 1.3 exit gate ✅ (EXEC-077, 2026-05-04): all 13 surface families migrated; `<FinancialValue>` props contract frozen in `components/financial/FinancialValue.tsx`; sentinel grep CLEAN; `npm run type-check`, `npm run lint`, `npm run build` all exit 0
- `components/financial/FinancialValue.tsx` — frozen props contract from EXEC-077 §WS1 is the lint rule target; Phase 1.4 reads this contract, does not modify it
- `WAVE-1-FORBIDDEN-LABELS.md §4` — regex specifications §4.1–4.5 are the authoritative input for `no-forbidden-financial-label`; the FIB does not re-derive the patterns
- `.eslint-rules/` directory and flat-config import pattern — ten rules already shipped; Phase 1.4 follows the established pattern exactly (CJS module, `create(context)` export, imported and scoped in `eslint.config.mjs`)
- `e2e/` directory exists with Playwright config — Phase 1.4 adds test files under this directory; no new Playwright config required
- Local Supabase instance available for Playwright E2E (partial/unknown completeness scenarios require a player with an open visit and a player with a rating-slip-gapped Theo; seed data must support these states — EXEC-SPEC to verify seed coverage)
- The `no-unlabeled-financial-value` rule is intentionally simple and operates only on explicit DTO definitions, avoiding heuristic pattern inference to maintain reliability. The Playwright assertions cover the render boundary that the rule cannot reach.

---

# J. Out-of-Scope but Likely Next

- **Phase 1.5** — Rollout & Sign-off: staged deploy preview → staging → production; release notes citing all five frozen ADRs; operator UX validation (pit boss walkthrough on interpretability); Supabase advisor clean check; Wave 1 retrospective.
- **`lib/format.ts` cleanup** — once Phase 1.4 lint guard is live, a targeted consumer grep will confirm whether `formatDollars`/`formatCents` exports are safe to remove. Can land as a clean-up commit in Phase 1.5 or as a named follow-on.

---

# K. Expansion Trigger Rule

Amend this brief if any downstream artifact proposes:
- Changes to `<FinancialValue>` component props or `types/financial.ts` type definitions (Phase 1.3 frozen — requires Phase 1.3 amendment first)
- Full I1–I4 failure harness activation (Wave 2 only — requires outbox/projections infrastructure)
- OpenAPI YAML lint tooling (separate toolchain decision, not ESLint)
- New surface families beyond those enumerated in WAVE-1-SURFACE-INVENTORY.md §5.2 (scope expansion requires amendment)
- Service layer, API contract, or DTO shape changes (prior phases closed — any change reopens Phase 1.1 or 1.2 scope)
- Wrapping `hold_percent`, `average_bet`, policy thresholds, or loyalty points as `FinancialValue` (DEF-NEVER and CLASSIFICATION-RULES §6 hard invariants — not Enforcement scope)
- New authority classes or completeness status values (frozen ADR set governs; requires superseding ADR)

---

# L. Scope Authority Block

**Intake version:** v0

**Frozen for downstream design:** Yes

**Downstream expansion allowed without amendment:** No

**Open questions allowed to remain unresolved at scaffold stage:**
- Exact `test:surface` Jest `--testPathPatterns` value — depends on Phase 1.4 test file naming conventions decided during EXEC-SPEC scaffolding. The set of included targets is defined by this FIB; the exact regex is an implementation detail for `/lead-architect`.
- Whether the API route boundary envelope tests (Step 6) run as Jest/JSDOM simulations or against the local Supabase instance — the EXEC-SPEC decides based on whether the route handlers are testable without a live DB at acceptable CI cost. Both modes are acceptable; the FIB requires the tests exist and pass.
- Playwright seed data verification — EXEC-SPEC must confirm local seed provides a player with an open visit (partial completeness scenario) and a player with a Theo-unknown state (unknown completeness scenario). If seed gaps exist, the EXEC-SPEC must include a seed data patch as a WS0 prerequisite.

**Human approval / sign-off:** Vladimir Ivanov / 2026-05-04
