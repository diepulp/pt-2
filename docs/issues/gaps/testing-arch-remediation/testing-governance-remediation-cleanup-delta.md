# Delta Patch — Clean Up `TESTING-GOVERNANCE-REMEDIATION.md`

## Verdict

Yes — the remediation document can be cleaned up without losing its value.

The current file is still a useful execution artifact, but it now mixes three different layers of authority:

- **ADR-044** = why the governance model exists
- **TESTING_GOVERNANCE_STANDARD.md** = standing law
- **TESTING-GOVERNANCE-REMEDIATION.md** = implementation plan

The cleanup goal is to restore the remediation doc to what it should be:

> an execution plan that implements the ADR and converges the repo toward the Standard.

That means keeping operational inventory, sequencing, and move-by-move work — while removing or shrinking duplicated policy language.

---

## What should stay

Keep these sections and ideas:

### 1. Test Layer Registry
Keep:
- file counts
- observed posture
- environment mismatches
- current CI status
- health verdicts

This is remediation-grade situational awareness, not standing law.

### 2. Observed summary
Keep:
- “1 of 8 test layers runs in CI”
- coverage thresholds exist but are not evaluated
- 81 server-side tests default to `jsdom`
- Playwright/Cypress status
- pre-commit bypassability

These are factual inputs to remediation.

### 3. Remediation rollout
Keep:
- ordered moves
- effort estimates
- dependency sequencing
- concrete config changes
- concrete CI steps
- tactical fixes for route handlers, hooks, integration configs, Playwright, Cypress, etc.

This is the core of the artifact.

### 4. Ownership specific to the remediation stream
Keep practical execution ownership if it is phrased as:
- who executes the remediation work
- how remediation work is distributed
- what teams/developers are expected to do during rollout

That is implementation governance for this effort, not permanent constitutional policy.

---

## What should be removed or demoted

These items should not be defined as if the remediation doc is a governing source of truth.

### 1. Remove the opening “Governing Principle”
Current opening duplicates the Standard’s constitutional litmus test.

That belongs in the Standard, not here.

### Replacement
Use a short conformance preamble instead:

> This remediation plan implements ADR-044 and is intended to bring the repository into conformance with `TESTING_GOVERNANCE_STANDARD.md`.

That is enough.

---

### 2. Rename “Policy Decisions” to something implementation-scoped
Current section title implies this document is making standing law.

It should not.

### Recommended rename
Replace:

> `## 2. Policy Decisions`

with something like:

> `## 2. Remediation Assumptions and Current Execution Targets`

or:

> `## 2. Implementation Targets for Initial Conformance`

That keeps the content practical and temporary.

---

### 3. Remove the embedded definition of “Advisory”
The remediation doc currently redefines advisory status in full prose.

That is a Standard concern.

### Recommended replacement
Keep the execution implication only:

> Integration tests and Playwright remain advisory during initial remediation until CI infrastructure exists to run them reliably.

Then add a pointer:

> Governance meaning of “advisory” is defined in `TESTING_GOVERNANCE_STANDARD.md`.

---

### 4. Remove the local re-definition of “Green CI”
The remediation doc currently defines “Green CI” and “compile gate” in standing-law terms.

That duplicates the Standard.

### Recommended replacement
Rephrase it operationally:

> During this remediation phase, the initial required CI target is lint + type-check + build + split unit test execution with coverage evaluation.

Then add:

> Semantic meaning of “Green CI” is governed by `TESTING_GOVERNANCE_STANDARD.md`.

This preserves the rollout target without re-legislating terminology.

---

### 5. Remove the local “minimum functional gate” doctrine
The remediation doc currently states what the minimum gate on `main` is in normative language.

That belongs in the Standard.

### Recommended replacement
Convert it into a remediation milestone:

> Initial conformance milestone: `main` branch protection enabled with required status checks and at least one functional test layer beyond static checks.

That makes it an implementation target, not a competing policy source.

---

### 6. Soften permanent ownership doctrine into rollout ownership
“The developer who touches a service owns making its tests honest” is useful as a remediation tactic, but if left as universal doctrine it starts to behave like policy.

### Recommended replacement
Use:

> During remediation, test honesty is restored incrementally in the services being actively touched. No centralized rewrite sprint is assumed.

That preserves the execution model without accidentally writing a permanent governance law.

---

## Section-by-section cleanup suggestion

## Header / Intro

### Current problem
The doc currently opens like a constitution.

### Recommended shape
Use:

```md
# Testing Governance Remediation

**Issue**: ISSUE-C4D2AA48  
**Date**: 2026-03-12  
**Prerequisites**: INVESTIGATION-REPORT.md, FULL-SYSTEM-TEST-POSTURE.md, ADR-044, TESTING_GOVERNANCE_STANDARD.md  
**Status**: Proposed — pending branch protection activation

## Purpose

This document is the remediation plan for bringing the repository into conformance with ADR-044 and `TESTING_GOVERNANCE_STANDARD.md`.

It does not define standing testing law.
It defines the ordered implementation work required to restore honest test execution, CI enforcement, and branch-protected merge gates.
```

That fixes the boundary immediately.

---

## Section 1 — Test Layer Registry

### Recommendation
Keep largely as-is.

Optional small tweak:
rename column `Verdict` to `Current Condition` for slightly less constitutional flavor.

---

## Section 2 — Replace “Policy Decisions”

### Recommended new section shape

```md
## 2. Initial Conformance Targets

This section describes the initial target state for remediation sequencing. Permanent governance definitions are owned by `TESTING_GOVERNANCE_STANDARD.md`.

### Target A — Required checks in the first conformance phase
Split unit execution (node + jsdom), lint, type-check, build, and coverage evaluation.

### Target B — Advisory layers during initial phase
Integration tests and Playwright remain advisory until their CI infrastructure exists.

### Target C — Branch protection milestone
`main` is protected before newly-added CI test jobs are treated as effective merge gates.

### Target D — Incremental replacement strategy
Shallow route-handler coverage is frozen and replaced incrementally as touched; no blanket rewrite is required.
```

This preserves intent while stripping standing-law duplication.

---

## Section 3 — Remediation Rollout

### Recommendation
Keep this section as the heart of the doc.

But scrub any wording that sounds like eternal doctrine.

#### Example cleanup
Replace:
> “CI jobs without branch protection are advisory machinery, not enforcement.”

with:
> “Branch protection is scheduled first so subsequent CI changes become effective merge gates upon introduction.”

Same operational meaning, less policy duplication.

---

## Route-handler language

### Current state
The route-handler correction is actually good and aligned with the Standard.

### Recommendation
Keep the practical rollout content, but add a standard reference instead of restating the theory.

Suggested wording:
> Route-handler remediation follows the shallow-test policy defined in `TESTING_GOVERNANCE_STANDARD.md`: freeze net-new shallow tests, retain honest smoke where useful, quarantine only misleading outliers, and replace incrementally with behavioral exemplars.

That is a good example of how the remediation doc should behave:
- **reference the law**
- **execute the plan**
- **avoid re-legislating it**

---

## Suggested removals summary

Remove or shrink these items from the current remediation doc:

- opening governing principle block
- full prose definition of advisory
- standing-law definition of green CI
- standing-law definition of minimum merge gate
- broad permanent ownership doctrine
- any language that reads like “this document defines what counts as governance”

---

## Suggested additions

Add these instead:

### 1. A conformance statement near the top
> This remediation plan implements ADR-044 and converges the repository toward conformance with `TESTING_GOVERNANCE_STANDARD.md`.

### 2. A source-of-truth boundary note
> Where this document references required, advisory, branch-protected, or green-CI semantics, the normative definitions live in `TESTING_GOVERNANCE_STANDARD.md`.

### 3. A success criteria section
This helps the doc remain execution-focused.

Example:

```md
## Success Criteria

This remediation stream is successful when:
- split Jest environments are active
- unit tests run in CI
- branch protection is enabled on `main`
- at least one functional layer blocks merge
- route-handler tests are no longer misrepresented as strong verification
- integration and E2E layers have explicit status and visible rollout path
```

That is remediation-grade and useful.

---

## Final recommended shape

The cleaned remediation doc should look roughly like this:

1. **Header**
2. **Purpose / Conformance statement**
3. **Current test layer registry**
4. **Initial conformance targets**
5. **Ordered remediation rollout**
6. **Success criteria**
7. **References to ADR + Standard + investigation artifacts**

That is enough.

---

## Final verdict

You do **not** need to throw the remediation doc away.

You need to **de-governance it**.

Keep:
- facts
- rollout
- move sequencing
- implementation targets

Remove or demote:
- standing-law definitions
- constitutional language
- duplicated policy semantics

The cleaned artifact should read like:

> “Here is how we get into conformance.”

Not:

> “Here is a second place where the law also lives.”
