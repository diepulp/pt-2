# Testing Governance Standard

**Status:** Proposed
**Version:** 1.0.0
**Date:** 2026-03-12
**Owner:** Engineering Lead
**Implements:** ADR-044 (Testing Governance Posture)
**Issue:** ISSUE-C4D2AA48

---

## §1 Purpose and Scope

This standard formalizes the standing testing governance posture for the project.

It defines the permanent rules by which the project classifies test layers, assigns runtime environments, determines merge-blocking enforcement, governs exclusions and quarantines, and interprets what "green CI" is allowed to mean.

This artifact is not the remediation plan. Remediation documents define how the project recovers from current deficiencies. This standard defines the durable rules that persist after remediation and prevent recurrence.

### Scope

This standard governs:

- test taxonomy and canonical layer definitions
- runtime environment contracts
- CI enforcement tiers and health-state vocabulary
- branch protection requirements
- green CI semantics and minimum merge gate
- route-handler and shallow test policy
- exclusion, skip, and quarantine policy
- change-control requirements for testing infrastructure
- periodic posture review triggers

It applies to all code in the repository and all test-related commands, configurations, CI jobs, and merge gates.

### Enforceability

Violations of this standard are governance defects. Any PR that introduces a violation — or any existing configuration that violates a rule — must be corrected or documented with an explicit exception and exit criteria.

---

## §2 Governing Principle

A test layer counts as **project verification** only when all three conditions are met:

1. It runs in its **correct runtime environment**
2. It is executed **automatically in CI**
3. It is enforced through **required branch-protection checks**

If any condition is missing, the layer does not constitute governance-grade evidence of system quality. It may still be useful to developers. It does not count as proof.

This is the litmus test. Every claim about test coverage, CI confidence, or release readiness must be evaluated against it.

---

## §3 Canonical Test Taxonomy

The project recognizes seven canonical test layers. Every test file must declare one primary canonical layer.

### 3.1 Static Checks

**Purpose:** Catch syntax, typing, linting, and buildability issues before runtime.

**Environment:** N/A (no runtime execution).

**Note:** Static checks are important. They are **not** functional verification. A codebase that only passes static checks has proven it compiles, not that it works.

### 3.2 Unit Tests (browser context)

**Purpose:** Verify UI rendering, component behavior, and browser-oriented hook logic.

**Required environment:** `jsdom` or equivalent browser-like runtime.

**Characteristics:** Fast, deterministic, narrow scope, minimal mocking.

### 3.3 Server-Unit Tests

**Purpose:** Verify server-side logic under a Node runtime — service business logic, data transforms, mapper correctness, schema validation, server utilities.

**Required environment:** `node`.

**Characteristics:** May mock I/O boundaries. Must test behavior, not merely that exports exist.

### 3.4 Route-Handler Tests

**Purpose:** Verify HTTP boundary layer — request validation, parameter handling, response status codes, response body shape, error paths.

**Rationale for distinct layer:** Route handlers are promoted to a canonical layer because they verify the HTTP boundary contract (status codes, body shape, error semantics) — concerns that are structurally different from server-unit logic. Without this distinction, HTTP-specific verification collapses into general server-unit tests and boundary behavior goes unasserted.

**Required environment:** `node`.

**Characteristics:** Should use real or minimally-mocked request/response objects. Must assert on observable HTTP behavior. See §9 for anti-pattern policy.

### 3.5 Integration Tests

**Purpose:** Verify runtime contracts across real boundaries — database round-trips, RPC execution, RLS enforcement, multi-table workflows, worker pipelines.

**Required environment:** `node` + running Supabase instance.

**Characteristics:** Slower than unit tests. Require real infrastructure or realistic local equivalents. Higher operational sensitivity.

### 3.6 End-to-End (E2E) Tests

**Purpose:** Verify user-visible application flows through a real running application.

**Required environment:** Real browser (Playwright) + running application + running Supabase.

**Characteristics:** Highest realism, highest setup cost. Browser-driven.

### 3.7 Smoke Tests

**Purpose:** Provide minimal runtime sanity checks that high-value surfaces are alive.

**Required environment:** `node`.

**Characteristics:** Intentionally small. Fast enough to be practical as a gate. Narrower than full integration or E2E coverage.

---

## §4 Environment Contract

Each test layer must run in the environment appropriate to what it is proving.

### Mandatory Environment Rules

| Layer | Required Environment | Rationale |
|-------|---------------------|-----------|
| Static checks | N/A | No runtime execution |
| Unit (browser) | `jsdom` | DOM/browser API dependency |
| Server-unit | `node` | Server runtime, no DOM |
| Route-handler | `node` | Server runtime, HTTP semantics |
| Integration | `node` + Supabase | Real DB, real RPCs, real RLS |
| E2E | Browser + app + Supabase | Full-stack realism |
| Smoke | `node` | Minimal runtime sanity |

### Environment Governance Rule

No test suite may run under an environment that materially distorts the runtime it claims to verify.

**Prohibited postures:**

- Database-backed integration tests under `jsdom`
- Server-route logic treated as browser tests by default
- A single global `testEnvironment` that silently misclassifies multiple test categories
- Browser tests silently inheriting Node-only assumptions without clear setup

Misclassification of environment is a governance defect, not merely a technical nuisance.

### Jest Configuration Contract

The project must use split Jest configurations or multi-project config to enforce environment boundaries:

| Config / Project | `testEnvironment` | Scope |
|-----------------|-------------------|-------|
| Browser project | `jsdom` | `components/**`, `hooks/**` |
| Node project | `node` | `services/**`, `lib/**`, `app/api/**`, `workers/**` |
| Integration config | `node` | `*.int.test.*`, `*.integration.test.*` |

A single global `testEnvironment` applying to all test files is prohibited.

---

## §5 Enforcement Tiers and Health-State Vocabulary

### Enforcement Tiers

Every test layer must be assigned one of the following governance states. No layer may exist in an ambiguous or undeclared state.

**Required:**
- Executed automatically in CI on every PR
- Enforced through required branch-protection checks
- Must pass for merge
- Counts as formal project verification

**Advisory:**
- Useful to developers for feedback
- May run locally or in optional CI jobs
- Does **not** block merge
- Does **not** count as governance-grade release evidence

Advisory does not mean "kind of covered." It means "helpful, but non-governing." A layer remains advisory until it is executed in CI **and** enforced through required branch-protection checks. No advisory layer may be cited as proof that the repository is functionally protected.

**Quarantined:**
- Known to be degraded or misleading
- Not accepted as project verification
- Explicitly labeled and documented
- Must have: named owner, reason, exit criteria, explicit non-governing statement

Quarantined layers are not neutral. They are known liabilities under management.

**Deprecated:**
- Scheduled for removal or replacement
- No longer endorsed as a test strategy
- Must not receive net-new investment except to support transition/removal

### Health-State Vocabulary

**Disambiguation:** Enforcement tiers (above) describe a layer's **governance status** — whether it blocks merge. Health states (below) describe a layer's **condition and reliability** — whether it can be trusted. A layer may be Required (enforcement tier) yet Degraded (health state). The two dimensions are orthogonal.

Every major test layer must be describable using one of the following health states:

| State | Meaning |
|-------|---------|
| **Healthy** | Correct environment, CI-executed if required, reliable as evidence |
| **Degraded** | Provides some value but has known gaps or instability |
| **Compromised** | Structurally unsound (wrong environment, wrong assumptions); cannot be trusted even if passing |
| **Advisory** | Useful to developers, not governance-enforced |
| **Quarantined** | Known unreliable/misleading, under active management with exit criteria |
| **Deprecated** | Transitional, being removed/replaced |

This vocabulary exists so the project can describe reality honestly instead of pretending every test layer is either fine or irrelevant.

---

## §6 Green CI Semantics

The project must use precise language about CI status.

### Allowed Meanings

**"Green CI"** may only be used to mean: all **required** checks passed.

**"Compile green"** (or "static gates pass") may describe: lint + type-check + build passing, without implying functional verification.

### Prohibited Implication

The following claim is prohibited unless it is actually true:

> "CI is green, therefore runtime behavior is verified."

Passing static checks does **not** imply functional correctness, server-runtime correctness, DB/RLS correctness, workflow integrity, or integration health.

---

## §7 Branch Protection Policy

`main` must be protected. This is non-negotiable.

### Minimum Requirements

- All changes via pull request (direct push blocked)
- Required status checks (CI jobs designated as required)
- At least 1 approving review
- Up-to-date branch before merge
- Force push blocked
- Deletion blocked

### Governance Consequence

No test layer is governance-effective until branch protection makes it merge-blocking. A CI job without branch protection is advisory machinery, not enforcement.

Branch protection must be activated **before** new CI test jobs are treated as effective gates. The ordering is:

1. Enable branch protection
2. Add CI test jobs
3. Mark those jobs as required status checks
4. Expand scope of required checks over time

Reversing this order creates the illusion of governance without enforcement.

### Admin Bypass Policy

Any admin bypass of required checks must be exceptional, documented with reason and scope, and followed by a remediation or retrospective note. Standing admin bypass for convenience is prohibited. If a bypass pattern becomes recurring, the underlying check or process must be fixed rather than routinely overridden.

---

## §8 Minimum Merge Gate

The project must never have **zero meaningful functional blockers** on merge.

### Governance Floor

The required set may evolve, but the minimum merge gate must include:

1. Static checks required (lint + type-check + build)
2. At least one required functional test layer beyond static checks
3. At least one runtime canary or behavioral gate

A repository posture in which merge is blocked only by compile-time checks is **governance-deficient** and must be corrected.

---

## §9 Route-Handler and Shallow Test Policy

### Definition

A shallow test is one that only proves a module imports, an export exists, or a handler is defined — without meaningfully verifying behavior.

### Policy

1. **Freeze the anti-pattern.** No new tests may follow the shallow mock-everything pattern. New route-handler tests must assert on response status, body shape, and error paths with minimal mocking.

2. **Reclassify existing tests honestly.** Existing shallow tests are reclassified as **smoke coverage** — they verify import resolution and handler instantiation, nothing more. They must not be presented as strong verification.

3. **Quarantine worst offenders only.** Tests that are actively misleading or producing noise may be individually quarantined with documented reason and exit criteria. Blanket-skipping an entire test class is prohibited.

4. **Introduce an exemplar.** At least one route-handler test must demonstrate the correct pattern — real request objects, real handler invocation, status/body/error assertions. This becomes the template for replacement.

5. **Replace incrementally.** Existing shallow tests are replaced with behavior-oriented tests as their routes are touched. No blanket rewrite required.

Net-new shallow coverage-theatre tests are prohibited.

---

## §10 Test Configuration and Script Truthfulness

All test scripts, configuration files, and CI jobs must truthfully describe what they run.

### Rules

- Script names must reflect actual scope
- Exclusion patterns must be explicit and documented
- No script may present itself as comprehensive while silently omitting major test classes
- Local-only assumptions must be labeled as such
- Test class boundaries must be clear in naming and configuration

### Prohibited Postures

- A `test:ci` command that silently excludes test categories while implying global verification
- A single global environment that masks the true runtime needs of different test classes
- CI configuration that claims "tests run locally" as justification for zero CI test execution
- Coverage thresholds defined but never evaluated because no CI job invokes them
- Documentation that claims a test gate exists when it was never implemented

---

## §11 Exclusion, Skip, and Quarantine Policy

Tests may not silently disappear from governance.

### Skip Policy

A skipped test or suite must have:
- A written reason (in code comment or linked issue)
- A clear scope
- A visible marker in code or configuration
- A plan for resolution or a decision to deprecate

### Quarantine Policy

A quarantined suite or test layer must include:
- Reason for quarantine
- Named owner
- Date or milestone context
- Exit criteria
- Explicit statement that it is non-governing

### Ignore-Pattern Policy

Any ignore pattern that excludes a material test class from a normal command or CI job must be documented in the governing testing docs or CI configuration comments.

Hidden exclusions are prohibited.

### Conditional-Skip Policy

Tests gated by environment variables must document which variable controls execution, default behavior, how to enable locally, and whether CI sets the variable. Tests gated-off by default and not activated in CI are effectively advisory.

---

## §12 Test Change-Control Policy

Any change that affects testing posture must be treated as governance-relevant.

### Covered Changes

- Test configuration files and environment settings
- Test scripts in `package.json`
- CI workflow files
- Required status checks configuration
- Exclusion/ignore patterns and skip markers
- Quarantine status changes
- Framework migration decisions
- Branch-protection-relevant behavior

### Required PR Disclosure

A PR making testing-posture changes must state:

1. What changed
2. Why it changed
3. Which test layers gained or lost enforcement
4. Whether confidence increased, decreased, or stayed neutral
5. Any compensating control if confidence decreased
6. Exit criteria if the change introduces advisory or quarantined posture

No silent amputations.

---

## §13 Ownership, Review, and Local-Only Suites

### Ownership

Testing posture must have explicit stewardship. At minimum, the project must maintain ownership for:

- CI test enforcement configuration
- Test taxonomy and config integrity
- Quarantine registry maintenance
- Branch-protection configuration
- Periodic posture review

Ownership may be assigned to one person or a small set of maintainers, but it must be explicit. Unowned governance becomes decorative text.

### Review Triggers

A testing posture review is required when any of the following occur:

- New test framework introduced or old framework retired
- Major CI pipeline changes
- Branch protection changes
- Major environment changes (Node version, Jest version, config restructure)
- Significant use of skips or ignore patterns added
- Advisory layer proposed for promotion to required
- Required layer degraded or quarantined
- Test taxonomy changed

### Periodic Review

Even without triggers, the project should review testing posture at major milestones:

- Are required layers still meaningful?
- Are advisory layers being mistaken for governance?
- Are quarantines still justified, or have they become permanent?
- Are test environments still correctly split?
- Does green CI still mean what this standard says it means?
- Is the minimum merge gate still above compile-only posture?

### Local-Only Suite Policy

Local-only suites can be valuable. They are not governance.

A local-only suite may aid development and debugging, but until it is run automatically in CI and required by branch protection, it must be described as **advisory**.

No local-only suite may be cited as proof that the repository is functionally protected.

Pre-commit hooks are developer conveniences, not controls. They are bypassable via `--no-verify` and must not be listed as governance in any security or compliance context.

---

## §14 Non-Conformance Rule

If CI configuration, test scripts, or branch-protection settings do not match this standard, the implementation is non-conformant and must be corrected or explicitly excepted with documented reason and exit criteria. Drift between this standard and actual enforcement is itself a governance defect.

---

## §15 Final Stance

The project may no longer rely on the existence of tests, local habit, or optimistic interpretation of CI to claim verification.

Verification is a governed status, not a vibe.

A test layer counts only when:
1. it runs in the correct environment,
2. it executes automatically,
3. and it is enforced through required merge controls.

Everything else may still be useful. It is not proof.
