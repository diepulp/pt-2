# ADR-044: Testing Governance Posture

**Status:** Proposed
**Date:** 2026-03-12
**Owner:** Engineering Lead
**Related:** ADR-002 (Test File Organization), ADR-011 (Over-Engineering Guardrail — dual-artifact precedent), ADR-041 (Surface Governance — dual-artifact precedent)
**Implements:** `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md`
**Triggered by:** ISSUE-C4D2AA48 — systemic testing failure across all test categories

---

## Context

PT-2's testing infrastructure suffered five compounding failures that went undetected because no formal governance standard existed to define what "tested" means:

1. **Global `jsdom` environment** — `jest.config.js` applies browser runtime to all tests, misclassifying 81 server-side tests
2. **No CI test execution** — `ci.yml` runs lint/type-check/build only; "Tests run locally" was accepted as policy
3. **Silent exclusions** — `test:ci` excludes integration tests via `--testPathIgnorePatterns` while implying comprehensive coverage
4. **Unprotected main** — No branch protection; all CI results are advisory regardless of configuration
5. **Coverage theatre** — 67 route-handler tests mock everything and assert only that handler functions exist

The result: "green CI" meant the code compiles. Zero functional test layers blocked merge. No artifact defined what enforcement meant, how to classify test layers, or what "advisory" vs "required" implied.

A remediation plan (TESTING-GOVERNANCE-REMEDIATION.md) proposes 8 corrective moves. But without a governing standard, those moves have no permanent anchor. When remediation completes, what prevents regression into the same decay?

## Decision

The project adopts a formal **Testing Governance Posture** using a dual-artifact model.

- **ADR-044** records the durable decision to formalize testing governance as a standing part of repository architecture and delivery governance.
- **TESTING_GOVERNANCE_STANDARD.md** defines the operational source of truth for test-layer classification, runtime/environment contracts, enforcement tiers, CI and branch-protection semantics, quarantine/exclusion controls, and testing change-control expectations.

This model is adopted because remediation of current testing failures alone is insufficient; the project requires durable governance that defines what counts as verification, what must block merge, and how testing posture is controlled over time.

### Source-of-truth boundaries

ADR-044 governs the existence, purpose, and rationale of the testing governance model. TESTING_GOVERNANCE_STANDARD.md governs operational repository behavior. If operational detail changes while remaining within the ADR's decision boundaries, the Standard may be revised without amending the ADR.

## Rationale

### Why a governance standard, not just a remediation plan?

Remediation plans are temporal — they fix a current deficit and become historical. Governance standards are durable — they define permanent rules. The observed failure mode was not merely "tests are broken" but "no definition exists of what tested means." Fixing tests without establishing governance leaves the project vulnerable to the same decay.

### Why dual-artifact (ADR + Standard)?

This follows the established pattern: ADR-011 → OVER_ENGINEERING_GUARDRAIL, ADR-041 → SURFACE_CLASSIFICATION_STANDARD. The ADR records the architectural decision. The standard provides the operational rulebook. The testing governance scope exceeds ADR format. The Standard shall define the canonical test-layer taxonomy, the environment contract for each layer, enforcement tiers, merge-gate mechanics, and all operational policy.

### Why branch protection before CI gates?

A CI job on an unprotected branch is advisory machinery. Branch protection is the mechanism that converts policy from suggestion into enforcement. The standard codifies this ordering.

## Consequences

### Positive

- Every test layer has a declared governance tier — no ambiguity about what is enforced
- "Green CI" has a precise, auditable definition
- Advisory layers cannot masquerade as governance
- Remediation work has a permanent standard to conform to
- Regression prevention — the standard outlives the remediation

### Negative

- **Short-term delivery friction** — Some historically accepted signals (e.g., compile-only green CI) will no longer be treated as sufficient evidence of verification. Existing test scripts, CI jobs, and branch protections may need to be brought into conformance before the posture is fully credible.
- Overhead: PR disclosure requirements for testing-posture changes
- Transition: existing documentation (QA-001, CICD-PIPELINE-SPEC) needs annotation as aspirational/unimplemented
- Strictness: quarantine/skip documentation requirements add process

### Neutral

- Does not prescribe test content quality or assertion depth
- Does not mandate coverage targets beyond minimum merge gate
- Does not specify fixture factories, test data management, or E2E seed strategies

## Alternatives Considered

### Alternative 1: ADR-only (no separate standard)

**Rejected.** Testing governance spans 13+ policy sections (taxonomy, environment contracts, enforcement tiers, green CI semantics, branch protection, merge gates, route-handler policy, advisory definition, exclusion policy, change-control, health vocabulary, ownership, review triggers). This exceeds ADR scope. ADRs record decisions; they are not operational rulebooks.

### Alternative 2: Amend QA-001 (extend existing testing strategy)

**Rejected.** QA-001 prescribes aspirational targets (60/30/10 pyramid, 90% CRUD coverage) that were never enforced. It conflates desired state with governance. The governance standard must define what enforcement means, not what coverage should be.

### Alternative 3: Embed governance in CICD-PIPELINE-SPEC

**Rejected.** The pipeline spec documents CI topology and job ordering. Testing governance is broader — it covers taxonomy, environment contracts, branch protection, and health-state vocabulary independent of any specific CI implementation.

### Alternative 4: Remediation only, no standing governance artifact

**Rejected.** This option would address current failures without creating durable rules for what counts as governance-grade verification, what must block merge, how test layers are classified and enforced, or how exclusions and quarantines are controlled. It would allow the repository to drift back into ambiguous or non-enforced testing posture after the immediate remediation work concludes.

## References

- `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md` — operational rulebook (this ADR's implementing artifact)
- `docs/issues/gaps/testing-arch-remediation/INDEX.md` — remediation issue index
- `docs/issues/gaps/testing-arch-remediation/INVESTIGATION-REPORT.md` — deep audit findings
- `docs/issues/gaps/testing-arch-remediation/FULL-SYSTEM-TEST-POSTURE.md` — full posture assessment
- `docs/issues/gaps/testing-arch-remediation/TESTING-GOVERNANCE-REMEDIATION.md` — remediation action plan
- `docs/40-quality/QA-001-service-testing-strategy.md` — aspirational testing pyramid (not enforced)
- `docs/deployments/CICD-PIPELINE-SPEC.md` — pipeline spec (Gate 4 not implemented)
