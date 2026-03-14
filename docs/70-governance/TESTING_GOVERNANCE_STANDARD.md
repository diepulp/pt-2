# Testing Governance Standard — Solo-Repo Transitional Profile

**Status:** Proposed
**Version:** 2.0.0
**Date:** 2026-03-13
**Owner:** Solo Steward
**Implements:** ADR-044 (Testing Governance Posture)
**Issue:** ISSUE-C4D2AA48
**Supersedes:** v1.0.0 (enterprise-first posture)

---

## §1 Purpose and Scope

This standard formalizes the standing testing governance posture for the project under a **solo-repo transitional profile**.

It defines the rules by which the project classifies test layers, assigns runtime environments, determines verification status, governs exclusions and quarantines, and interprets what "green" is allowed to mean.

This is not the remediation plan. Remediation documents define recovery work. This standard defines the durable rules that persist after remediation and prevent recurrence.

### Solo-Repo Transitional Profile

This standard recognizes that the repository is maintained by a single developer. Enterprise-grade ceremony — mandatory peer review, immediate branch protection, required-status-check enforcement — is deferred, not abandoned. The standard operates at two levels:

1. **Durable rules** that apply now regardless of team size (runtime correctness, script truthfulness, anti-theatre policy)
2. **Enforcement mechanisms** that are promoted when earned, not imposed as prerequisites

This distinction prevents governance pageantry from blocking the first-order correction: restoring honest local verification.

### Scope

This standard governs:

- test taxonomy and canonical layer definitions
- runtime environment contracts
- verification tiers and health-state vocabulary
- green CI / green local semantics
- route-handler and shallow test policy
- exclusion, skip, and quarantine policy
- change-control requirements for testing infrastructure
- periodic posture review triggers
- promotion criteria for enforcement mechanisms

It applies to all code in the repository and all test-related commands, configurations, CI jobs, and merge gates.

### Enforceability

Violations of durable rules are governance defects. Any configuration that violates a durable rule must be corrected or documented with an explicit exception and exit criteria.

Deferred enforcement mechanisms are not violations — they are promotion targets with documented criteria.

---

## §2 Governing Principle

Verification is a two-tier concept. The tiers are not interchangeable.

### Tier 1 — Trusted Local Verification

A test layer counts as **trusted local verification** when all three conditions are met:

1. It runs in its **correct runtime environment**
2. It is invoked by a **truthful command**
3. It produces **behaviorally meaningful assertions**

This is the minimum standard for honest testing. A layer that meets these conditions can be trusted by the developer who runs it. It is not governance-grade, but it is not theatre.

### Tier 2 — Governance-Grade Merge Protection

A test layer counts as **governance-grade merge protection** only when it additionally:

4. Is executed **automatically in CI**
5. Is enforced through **required branch-protection checks**

If conditions 4–5 are missing, the layer does not constitute formal release evidence. It may still be useful and trusted locally. It does not count as proof to stakeholders.

### Relationship Between Tiers

Tier 1 is required now. It is the first-order correction.

Tier 2 is a promotion target. Layers earn governance status by demonstrating stability and trust at Tier 1, then being wired into CI and enforcement.

No layer may be promoted to Tier 2 that has not first achieved Tier 1. Automating a broken or dishonest test layer creates the illusion of governance, not governance itself.

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

No test suite may run under an environment that materially distorts the runtime it claims to verify. This is a **durable rule** — it applies immediately, regardless of enforcement tier.

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

## §5 Verification Tiers and Health-State Vocabulary

### Verification Tiers

Every test layer must be assigned one of the following verification states. No layer may exist in an ambiguous or undeclared state.

**Trusted-Local:**
- Runs in the correct runtime environment
- Invoked by a truthful command
- Produces behaviorally meaningful assertions
- Trusted by the developer who runs it
- Does **not** block merge automatically
- Does **not** count as governance-grade release evidence
- **Does** count as honest verification for the developer's own confidence

Trusted-local is the first verification tier a restored layer should achieve. It is not a lesser form of "advisory" — it is a meaningful status that says: "this test is honest, runs correctly, and can be trusted locally."

**Required** (promotion target):
- Meets all trusted-local conditions
- Additionally executed automatically in CI on every PR
- Enforced through required branch-protection checks
- Must pass for merge
- Counts as governance-grade release evidence

Promotion to required is earned, not assumed. A layer must demonstrate stability at trusted-local before promotion.

**Advisory:**
- Useful to developers for feedback
- May run locally or in optional CI jobs
- Has **not** yet met trusted-local conditions (wrong runtime, stale assertions, or other gaps)
- Does **not** block merge
- Does **not** count as any form of verification evidence

Advisory means "exists but is not yet honest enough to be trusted." It is the default state for layers that have not been restored.

**Quarantined:**
- Known to be degraded or misleading
- Not accepted as any verification
- Explicitly labeled and documented
- Must have: named owner, reason, exit criteria, explicit non-governing statement

Quarantined layers are known liabilities under management.

**Deprecated:**
- Scheduled for removal or replacement
- No longer endorsed as a test strategy
- Must not receive net-new investment except to support transition/removal

### Health-State Vocabulary

**Disambiguation:** Verification tiers (above) describe a layer's **governance status** — what it is allowed to claim. Health states (below) describe a layer's **condition and reliability** — whether it can be trusted. A layer may be Trusted-Local (verification tier) yet Degraded (health state). The two dimensions are orthogonal.

Every major test layer must be describable using one of the following health states:

| State | Meaning |
|-------|---------|
| **Healthy** | Correct environment, reliable assertions, stable signal |
| **Degraded** | Provides some value but has known gaps or instability |
| **Compromised** | Structurally unsound (wrong environment, wrong assumptions); cannot be trusted even if passing |
| **Advisory** | Not yet restored to trusted-local status |
| **Quarantined** | Known unreliable/misleading, under active management with exit criteria |
| **Deprecated** | Transitional, being removed/replaced |

---

## §6 Green Semantics

The project must use precise language about verification status.

### Allowed Meanings

**"Local green"** may be used to mean: all trusted-local layers pass in the correct runtime on the developer's machine.

**"CI green"** may only be used to mean: all **required** checks passed in CI.

**"Compile green"** (or "static gates pass") may describe: lint + type-check + build passing, without implying functional verification.

### Prohibited Implications

The following claims are prohibited unless actually true:

> "Tests pass, therefore runtime behavior is verified."

Passing under the wrong runtime is false comfort, not verification.

> "CI is green, therefore runtime behavior is verified."

Passing static checks does **not** imply functional correctness, server-runtime correctness, DB/RLS correctness, workflow integrity, or integration health.

### Honest Status Reporting

When reporting test posture, always distinguish:
- What is **static green** (compiles, lints, type-checks)
- What is **local functional green** (trusted-local layers pass)
- What is **CI green** (required layers pass in CI)

No silent conflation of these categories.

---

## §7 Branch Protection Policy

### Target State

When the project's testing posture earns it, `main` should be protected with:

- All changes via pull request (direct push blocked)
- Required status checks (CI jobs designated as required)
- Up-to-date branch before merge
- Force push blocked
- Deletion blocked

### Transitional Posture

Branch protection is a **promotion target**, not an immediate prerequisite.

Promoting branch protection before the test harness is honest creates the illusion of governance without substance — a CI that enforces wrong-runtime tests or theatre assertions is worse than no enforcement, because it produces false confidence.

**Promotion criteria for branch protection:**

1. Jest environments are correctly split (node / jsdom / integration)
2. At least one bounded context has achieved trusted-local status
3. Unit test execution exists in CI (even as advisory)
4. The CI test signal has been stable for a reasonable observation period

Once these criteria are met, branch protection should be enabled and CI jobs promoted to required status checks.

### Governance Consequence

No test layer achieves governance-grade merge protection until branch protection makes it merge-blocking. A CI job without branch protection is advisory machinery, not enforcement. This remains true — the change is in sequencing, not in principle.

### Admin Bypass Policy

Any admin bypass of required checks must be exceptional, documented with reason and scope, and followed by a remediation or retrospective note. Standing admin bypass for convenience is prohibited.

---

## §8 Minimum Verification Floor

The project operates under a two-tier floor that corresponds to the verification tiers in §2.

### Local Verification Floor (applies now)

The minimum local verification floor must include:

1. Static checks passing (lint + type-check + build)
2. At least one bounded context with trusted-local functional tests in the correct runtime
3. At least one behavioral canary (not shallow mock-everything theatre)

A repository posture in which only static checks run is **verification-deficient** even at the local level.

### Governance Merge Floor (applies after promotion)

Once branch protection is active (§7), the minimum merge gate must include:

1. Static checks required (lint + type-check + build)
2. At least one required functional test layer beyond static checks
3. At least one runtime canary or behavioral gate

A repository posture in which merge is blocked only by compile-time checks is **governance-deficient** and must be corrected.

### Promotion Path

The local verification floor is achieved first. The governance merge floor is achieved by promoting trusted-local layers into CI and enforcing through branch protection. One does not skip to the governance floor without first establishing the local floor.

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

All test scripts, configuration files, and CI jobs must truthfully describe what they run. This is a **durable rule** — it applies immediately.

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

Tests may not silently disappear from verification.

### Skip Policy

A skipped test or suite must have:
- A written reason (in code comment or linked issue)
- A clear scope
- A visible marker in code or configuration
- A plan for resolution or a decision to deprecate

### Quarantine Policy

A quarantined suite or test layer must include:
- Reason for quarantine
- Named owner (solo steward in single-developer repos)
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
- Verification-tier changes (advisory → trusted-local → required)

### Required Disclosure

A change to testing posture must state:

1. What changed
2. Why it changed
3. Which test layers gained or lost verification status
4. Whether confidence increased, decreased, or stayed neutral
5. Any compensating control if confidence decreased
6. Exit criteria if the change introduces advisory or quarantined posture

In a solo-repo workflow, this disclosure lives in the commit message or PR description. No silent amputations.

---

## §13 Stewardship, Review, and Local-Only Suites

### Stewardship

Testing posture must have explicit stewardship. In a solo-developer repository, the sole maintainer is the steward. Stewardship responsibility includes:

- CI test enforcement configuration
- Test taxonomy and config integrity
- Quarantine registry maintenance
- Verification-tier promotion decisions
- Periodic posture review

Stewardship may be assigned to one person or a small set of maintainers. It must be explicit. Unowned governance becomes decorative text.

### Review Triggers

A testing posture review is required when any of the following occur:

- New test framework introduced or old framework retired
- Major CI pipeline changes
- Branch protection changes
- Major environment changes (Node version, Jest version, config restructure)
- Significant use of skips or ignore patterns added
- Advisory or trusted-local layer proposed for promotion
- Trusted-local or required layer degraded or quarantined
- Test taxonomy changed

### Periodic Review

Even without triggers, the project should review testing posture at major milestones:

- Are trusted-local layers still honest?
- Are advisory layers being mistaken for verification?
- Are quarantines still justified, or have they become permanent?
- Are test environments still correctly split?
- Does "local green" still mean what this standard says it means?
- Is the verification floor still above compile-only posture?

### Local-Only Suite Policy

Local-only suites can be valuable. At the trusted-local tier, they are honest verification. They are not governance-grade.

A local-only suite that meets trusted-local conditions is meaningful to the developer. Until it is run automatically in CI and enforced through branch protection, it must not be cited as formal release evidence.

Pre-commit hooks are developer conveniences, not controls. They are bypassable via `--no-verify` and must not be listed as governance in any security or compliance context.

---

## §14 Non-Conformance Rule

If test configurations, scripts, or runtime environments do not match the durable rules in this standard, the implementation is non-conformant and must be corrected or explicitly excepted with documented reason and exit criteria.

Deferred enforcement mechanisms (branch protection, required status checks) are not non-conformances — they are promotion targets with defined criteria in §7 and §8.

Drift between durable rules and actual implementation is a governance defect. Drift between promotion targets and current posture is expected during the transitional period.

---

## §15 Final Stance

The project may no longer rely on the existence of tests, local habit, or optimistic interpretation of CI to claim verification.

Verification is an earned status, not a vibe.

### What is required now

A test layer is **trusted local verification** when:
1. it runs in the correct environment,
2. it is invoked by a truthful command,
3. and it produces behaviorally meaningful assertions.

Prefer one honest slice over broad fake coverage. A single trusted bounded-context exemplar is worth more than dozens of misleading tests.

### What is required after promotion

A test layer is **governance-grade merge protection** only when it additionally:
4. executes automatically in CI,
5. and is enforced through required merge controls.

### What is explicitly deferred

The following enforcement mechanisms are promotion targets, not immediate requirements:

- Branch protection on `main`
- Required status checks
- Mandatory PR approvals
- Formal multi-reviewer process

These are added when the test posture has earned them — when local truth is established, CI signal is stable, and enforcement would protect real verification rather than automate theatre.

Everything that is not yet trusted-local may still be useful. It is not verification.
