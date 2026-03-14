# Testing Governance Posture Proposal

## Purpose

This document formalizes the **standing testing governance posture** for the project.

It exists to prevent a recurrence of the failure mode already observed:

- tests existed but were misclassified
- CI was green without meaningful functional verification
- local-only suites decayed without governance consequences
- test exclusions and environment mistakes quietly undermined confidence

This artifact is not the remediation plan.

This artifact defines the **permanent rules** by which the project classifies test layers, assigns runtime environments, determines merge-blocking enforcement, governs exclusions and quarantines, and interprets what “green CI” is allowed to mean.

---

## Governing principle

A test layer counts as **project verification** only when it is:

1. run in its **correct environment**
2. executed **automatically in CI**
3. enforced through **required branch-protection checks**

If any of those conditions are missing, the layer does **not** count as governance-grade evidence of system quality.

It may still be useful to developers. It does not count as proof.

---

## Scope

This posture governs:

- test taxonomy
- runtime/environment contracts
- CI enforcement tiers
- branch-protection expectations
- test quarantine and exclusion policy
- change-control requirements for testing infrastructure
- health-state vocabulary for test layers

It applies to all code in the repository and all test-related commands, configurations, CI jobs, and merge gates.

---

## Canonical test taxonomy

The project recognizes the following canonical test layers.

## 1. Static checks
Purpose:
- catch syntax, typing, linting, and buildability issues

Examples:
- lint
- type-check
- build

Notes:
- these are important
- they are **not** functional verification

## 2. Unit tests
Purpose:
- verify pure logic in isolation
- avoid I/O and runtime coupling where possible

Characteristics:
- fast
- deterministic
- narrow scope
- minimal mocking necessary

## 3. Server-unit tests
Purpose:
- verify server-side logic under a Node runtime
- cover route logic, server utilities, service orchestration, and behavior that is not browser-based but may still use mocks/stubs

Characteristics:
- run in Node
- may mock I/O boundaries
- should test behavior, not merely exports existing

## 4. Component tests
Purpose:
- verify UI/component rendering and browser-oriented behavior

Characteristics:
- run in a browser-like environment such as `jsdom`
- appropriate for hooks/components that rely on DOM/browser APIs

## 5. Integration tests
Purpose:
- verify runtime contracts across real boundaries such as:
  - database
  - Supabase
  - RPCs
  - RLS
  - workers/pipelines
  - multi-table workflows

Characteristics:
- run in Node unless explicitly justified otherwise
- require real infrastructure or realistic local equivalents
- are slower and more operationally sensitive than unit tests

## 6. End-to-end (E2E) tests
Purpose:
- verify user-visible application flows through a running app

Characteristics:
- browser-driven
- exercise deployed or locally running application paths
- highest realism, highest setup cost

## 7. Smoke tests
Purpose:
- provide minimal runtime sanity checks that high-value surfaces are alive

Characteristics:
- intentionally small
- fast enough to be practical as a gate
- narrower than full integration or E2E coverage

---

## Environment contract

Each test layer must run in the environment appropriate to what it is proving.

## Mandatory environment rules

### `jsdom` or browser-like environments are allowed only for:
- component tests
- browser-hook tests
- UI behavior that genuinely depends on DOM/browser APIs

### `node` is required for:
- server-unit tests
- integration tests
- server-side logic unless there is a written justification for a different runtime

### E2E environments must:
- use a real browser automation framework
- run against a real or realistically provisioned application instance

---

## Environment governance rule

No test suite may run under an environment that materially distorts the runtime it claims to verify.

Examples of prohibited posture:
- database-backed integration tests under global `jsdom`
- server-route logic treated as browser tests by default
- browser tests silently inheriting Node-only assumptions without clear setup

Misclassification of environment is a governance defect, not merely a technical nuisance.

---

## Enforcement tiers

Every test layer must be assigned one of the following governance states.

## 1. Required
Meaning:
- executed automatically in CI
- enforced through required branch-protection checks
- must pass for merge

Required layers count as formal project verification.

## 2. Advisory
Meaning:
- useful to developers
- may run locally or in optional CI jobs
- does **not** block merge
- does **not** count as governance-grade release evidence

Advisory does not mean “kind of covered.”
It means “helpful, but non-governing.”

## 3. Quarantined
Meaning:
- known degraded or misleading
- not accepted as project verification
- explicitly labeled and documented
- subject to owner and exit criteria

Quarantined layers are not neutral. They are known liabilities under management.

## 4. Deprecated
Meaning:
- scheduled for removal or replacement
- no longer endorsed as a test strategy
- must not receive net-new investment except to support transition/removal

---

## Green CI semantics

The project must use precise language about CI status.

## Allowed meanings

### “Green CI”
May only be used to mean:
- all **required** checks passed

### “Compile green” or equivalent
May be used to describe:
- lint
- type-check
- build
without implying functional verification

---

## Prohibited language

The following implication is prohibited unless it is actually true:

> “CI is green, therefore runtime behavior is verified.”

Passing static checks does **not** imply:
- functional correctness
- server-runtime correctness
- DB/RLS correctness
- workflow integrity
- integration health

---

## Branch protection policy

`main` must be protected.

At minimum, branch protection must enforce:

- pull-request-based changes
- required status checks
- prohibition on merging with failing required checks
- prohibition on bypassing required checks except through explicitly authorized admin action

No test layer is governance-effective until branch protection makes it merge-blocking.

A CI job without branch protection is advisory machinery, not enforcement.

---

## Minimum merge gate

The project must never again have **zero meaningful functional blockers** on merge.

The exact required set may evolve, but the governance floor must include:

- static checks required
- at least one required test layer beyond static checks
- at least one functional/runtime canary or equivalent meaningful behavioral gate

A repository posture in which merge is blocked only by compile-time checks is considered **governance-deficient** and must be corrected.

---

## Test configuration and script truthfulness

All test scripts, config files, and CI jobs must truthfully describe what they run.

## Rules

- script names must reflect actual scope
- exclusions must be explicit and documented
- no script may present itself as comprehensive while silently omitting major test classes
- local-only assumptions must be labeled as such
- test class boundaries must be clear in naming and config

Examples of prohibited posture:
- a `test:ci` command that silently excludes integration suites while implying global verification
- a single global environment that masks the true runtime needs of different test classes

---

## Test change-control policy

Any change that affects testing posture must be treated as governance-relevant.

This includes changes to:

- test configs
- environments
- test scripts
- CI jobs
- required checks
- exclusions / ignore patterns
- skip/quarantine status
- framework migration choices
- branch-protection-relevant behavior

## Required PR disclosure

A PR making such changes must state:

1. what changed
2. why it changed
3. which test layers gained or lost enforcement
4. whether confidence increased, decreased, or stayed neutral
5. any compensating control if confidence decreased
6. exit criteria if the change introduces advisory/quarantined posture

No silent amputations.

---

## Exclusion, skip, and quarantine policy

Tests may not silently disappear from governance.

## Skip policy
A skipped test or suite must have:
- a written reason
- a clear scope
- a visible marker in code or config
- a plan for resolution or a decision to deprecate

## Quarantine policy
A quarantined suite or test layer must include:
- reason for quarantine
- named owner
- date or milestone context
- exit criteria
- explicit statement that it is non-governing

## Ignore-pattern policy
Any ignore pattern that excludes a material test class from a normal command or CI job must be documented in the governing testing docs or CI notes.

Hidden exclusions are prohibited.

---

## Route-handler and shallow test policy

Tests that only prove:
- a module imports
- an export exists
- a handler is defined
without meaningfully verifying behavior
must not be presented as strong verification.

These tests may be retained as smoke only if they are labeled honestly as smoke.

Net-new shallow coverage-theater tests are prohibited.

When possible, shallow tests should be replaced with behavior-oriented exemplars over time.

---

## Health-state model for test layers

Every major test layer should be describable using one of the following health states:

## Healthy
- correct environment
- CI-executed if required
- reliable enough to trust as evidence

## Degraded
- provides some value
- known gaps or instability exist
- may require remediation but is not fully quarantined

## Advisory
- useful to developers
- not governance-enforced

## Quarantined
- known unreliable/misleading
- not accepted as evidence

## Deprecated
- transitional and being removed/replaced

This vocabulary exists so the project can describe reality honestly instead of pretending every test layer is either fine or irrelevant.

---

## Ownership

Testing posture must have explicit stewardship.

At minimum, the project must maintain ownership for:

- CI test enforcement
- test taxonomy and config integrity
- quarantine registry
- branch-protection expectations
- periodic posture review

Ownership may be assigned to one person or a small set of maintainers, but it must be explicit.

Unowned governance becomes decorative text.

---

## Review triggers

A testing posture review is required when any of the following occur:

- new test framework introduced
- old framework retired
- major CI pipeline changes
- branch protection changes
- major environment changes
- significant use of skips/ignore patterns added
- advisory layer proposed as a merge gate
- required layer degraded or quarantined
- test taxonomy changed

---

## Periodic posture review

Even without major changes, the project should review testing posture at defined intervals or major milestones.

Suggested review questions:

- Are required layers still meaningful?
- Are advisory layers being mistaken for governance?
- Are quarantines still justified?
- Are test environments still correctly split?
- Does green CI still mean what the docs say it means?
- Is the minimum merge gate still above compile-only theater?

---

## Policy on local-only suites

Local-only suites can be valuable, but they are not governance by default.

A local-only suite:
- may aid development
- may assist debugging
- may support later CI adoption

But until it is:
- run automatically in CI
- and required by branch protection

it must be described as **advisory**.

No local-only suite may be cited as proof that the repository is functionally protected.

---

## Policy on remediation vs governance

Remediation documents may define how the repo recovers from current deficiencies.

Governance documents define the durable rules that persist after remediation.

The project should maintain both when necessary, but remediation must not be mistaken for permanent law.

---

## Immediate adoption guidance

If adopted, this posture should drive the following immediate normalization work:

1. split test classes into truthful categories
2. remove global environment misclassification
3. make `main` branch protection real
4. ensure at least one functional layer is required for merge
5. label advisory and quarantined layers explicitly
6. eliminate hidden exclusions and misleading script semantics

---

## Final stance

The project may no longer rely on the existence of tests, local habit, or optimistic interpretation of CI to claim verification.

Verification is a governed status, not a vibe.

A test layer counts only when:
- it runs in the correct environment,
- executes automatically,
- and is enforced through required merge controls.

Everything else may still be useful.

It is not proof.
