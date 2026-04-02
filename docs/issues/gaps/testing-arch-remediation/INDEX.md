# Testing Architecture Remediation — Index

**Issue**: ISSUE-C4D2AA48
**Date opened**: 2026-03-12
**Status**: EXEC-SPECs approved, ready for `/build` execution

---

## Reading Order

### Step 0 — Governance (establish before fixing anything)

| # | Document | Purpose |
|---|----------|---------|
| 0a | [testing-governance-posture-proposal.md](testing-governance-posture-proposal.md) | **Permanent rules.** Test taxonomy, environment contracts, enforcement tiers, green CI semantics, branch protection policy, exclusion/quarantine policy. This is the constitution — it outlives the remediation. |
| 0b | [testing-governance-remediation-delta.md](testing-governance-remediation-delta.md) | Three amendments to apply to the remediation doc: reorder branch protection first, freeze (don't blanket-skip) route handler tests, harden "advisory" definition. All three are incorporated in the posture proposal. |

**Gate**: Governance posture adopted before remediation moves execute.

---

### Step 1 — Investigation (what did we find?)

| # | Document | Purpose |
|---|----------|---------|
| 1a | [INVESTIGATION-REPORT.md](INVESTIGATION-REPORT.md) | Deep audit of integration tests. Validates/corrects original plan. Schema drift is 0.6/10 (not a real problem). Partial harness exists. 41 files not 39. |
| 1b | [FULL-SYSTEM-TEST-POSTURE.md](FULL-SYSTEM-TEST-POSTURE.md) | Expands scope beyond integration to all test categories. Unit tests compromised (81 wrong env, 67 theatre). E2E degraded. CI has zero functional gates. Root cause analysis of the five compounding failures. |

These are evidence documents. They inform the remediation but are not the remediation.

---

### Step 2 — Remediation (what do we do?)

| # | Document | Purpose |
|---|----------|---------|
| 2a | [TESTING-GOVERNANCE-REMEDIATION.md](TESTING-GOVERNANCE-REMEDIATION.md) | **The action document.** Truth table, 5 policy decisions, 8 ordered moves (17-25h), immediate enforcement action, anti-patterns to kill. Subject to delta corrections in 0b. |

---

### Step 3 — Execution (build-pipeline handoffs)

| # | Document | Purpose |
|---|----------|---------|
| 3a | [ROLLOUT-EXECUTION-STRATEGY.md](ROLLOUT-EXECUTION-STRATEGY.md) | **Rollout strategy.** Segments 8 moves into 3 EXEC-SPECs with dependency graph, parallelism map, file-conflict analysis, and build-pipeline command sequence. |
| 3b | [EXEC-SPEC-GOV-051](../../20-architecture/specs/TESTING-GOV-REMEDIATION/EXEC-SPEC-GOV-051.md) | **Segment 1: Testing Infrastructure Foundation.** Governance + branch protection + Jest split + CI test step. Must complete first. |
| 3c | [EXEC-SPEC-GOV-052](../../20-architecture/specs/TESTING-GOV-REMEDIATION/EXEC-SPEC-GOV-052.md) | **Segment 2: Test Honesty Restoration.** Hook triage + Cypress removal + route handler reclassification + exemplar. Parallel with 3d. |
| 3d | [EXEC-SPEC-GOV-053](../../20-architecture/specs/TESTING-GOV-REMEDIATION/EXEC-SPEC-GOV-053.md) | **Segment 3: CI Layer Expansion.** Playwright CI + integration CI + Supabase-in-CI + migration stabilization. Parallel with 3c. |

**Execution**: `/build EXEC-SPEC-GOV-051` → then `/build EXEC-SPEC-GOV-052` + `/build EXEC-SPEC-GOV-053` in parallel.

---

### Step 4 — Context-by-Context Rollout

| # | Document | Purpose |
|---|----------|---------|
| 4a | [CONTEXT-ROLLOUT-TEMPLATE.md](CONTEXT-ROLLOUT-TEMPLATE.md) | **Reusable rollout checklist.** Standard-aligned (ADR-044 / TESTING_GOVERNANCE_STANDARD §3-§12) template for promoting any bounded context to Trusted-Local verification tier. Derived from Casino exemplar (Slice One). |
| 4b | [slice-1/CASINO-EXEMPLAR-POSTURE.md](slice-1/CASINO-EXEMPLAR-POSTURE.md) | Casino layer health, verification tier, effectiveness classification (validated 2026-03-14) |
| 4c | [slice-1/CASINO-EXEMPLAR-VALIDATION-REPORT.md](slice-1/CASINO-EXEMPLAR-VALIDATION-REPORT.md) | **Pre-rollout validation.** Governance effectiveness audit, emergent error matrix (182 failures across 7 categories in 25 files), updated system posture. Answers three questions before bounded-context propagation. |
| 4d | [slice-1/CASINO-EXEMPLAR-COMPLETION-SUMMARY.md](slice-1/CASINO-EXEMPLAR-COMPLETION-SUMMARY.md) | Slice One delivery record |

---

### Parallel Track

| # | Document | Purpose |
|---|----------|---------|
| P1 | [migration-stabilization-parallel-artifact.md](migration-stabilization-parallel-artifact.md) | How to handle migration history during remediation. Do not block test restoration on migration archaeology. Establish a green baseline, not historical purity. |

---

### Step 5 — Remaining Services Remediation

| # | Document | Purpose |
|---|----------|---------|
| 5a | [REMAINING-SERVICES-REMEDIATION-PLAN.md](REMAINING-SERVICES-REMEDIATION-PLAN.md) | **Full-scope remediation plan.** Maps all 118 un-remediated test files across 13 service contexts + 3 infrastructure surfaces. Three-tier execution (Slice 3 completion → remaining services → infrastructure). Two-phase model per context: Phase A (rollout template) + Phase B (Mode C auth rewrite). Triggered by runtime FetchError exposing untested HTTP contract boundary in loyalty context. |

---

### Step 6 — Tier 3 Infrastructure Surfaces

| # | Document | Purpose |
|---|----------|---------|
| 6a | [LIB-SUPABASE-POSTURE.md](LIB-SUPABASE-POSTURE.md) | lib/supabase infrastructure surface posture. 10 files, 10/10 directives, 6/6 gates. Phase A + Phase B (Mode C) complete. |
| 6b | [LIB-SERVER-ACTIONS-POSTURE.md](LIB-SERVER-ACTIONS-POSTURE.md) | lib/server-actions middleware surface posture. 10 files, 10/10 directives, 3/3 gates. Phase A + Phase B (Mode C) complete. |
| 6c | [ROOT-TESTS-POSTURE.md](ROOT-TESTS-POSTURE.md) | Root `__tests__/` surface posture. 15 files, 15/15 directives, 8/8 gates. Phase A + Phase B (Mode C) complete. |
| 6d | [2026-04-01-tier3-phase-b-mode-c-rewrite-PRECIS.md](2026-04-01-tier3-phase-b-mode-c-rewrite-PRECIS.md) | Tier 3 Phase B implementation precis. Mode C auth rewrite across all three infrastructure surfaces. 16 implementation tasks. |

---

### Superseded

| # | Document | Status |
|---|----------|--------|
| — | [INTEGRATION-TEST-REMEDIATION-PLAN.md](INTEGRATION-TEST-REMEDIATION-PLAN.md) | **Superseded by 1a + 1b + 2a.** Original plan that scoped the problem as 39 broken integration tests. Investigation revealed systemic failure across all test categories. Retained as historical input — do not execute from this document. |

---

## Execution Cadence

```
0. Adopt governance posture (0a + 0b)
   ↓
1. Enable branch protection on main          ← Move 3 from 2a (do first)
   ↓
2. Split Jest config by environment           ← Move 1 from 2a
   ↓
3. Add unit test step to ci.yml              ← Move 2 from 2a
   ↓
4. Mark new CI checks as required            ← enabled by step 1
   ↓
5. Triage broken hook tests                  ← Move 4 from 2a
   ↓
6. Wire Playwright advisory → required       ← Move 5 from 2a
   ↓
7. Fix integration exclusion + CI Supabase   ← Move 6 from 2a (parallel: P1)
   ↓
8. Burn dead wood, establish exemplar        ← Moves 7 + 8 from 2a
```

Note: Step 1 (branch protection) is reordered ahead of CI changes per delta correction 0b. CI jobs without branch protection are advisory machinery, not enforcement.

---

## Scope Boundary

This remediation covers:
- test taxonomy and environment classification
- CI enforcement and branch protection
- honest naming and script semantics
- dead framework removal
- minimum merge gate establishment

This remediation does NOT cover:
- test content quality or assertion depth
- fixture factories or shared test data management
- coverage target calibration beyond minimum gate
- performance, visual regression, or load testing
- rewriting the 67 route handler theatre tests (frozen, not fixed)
- migration history cleanup (parallel track P1)

## N.B
docs/issues/gaps/testing-arch-remediation/
  ├── INDEX.md                                    ← Start here
  ├── testing-governance-posture-proposal.md       ← Step 0: Constitution
  ├── testing-governance-remediation-delta.md      ← Step 0: Amendments (referenced, not yet created)
  ├── INVESTIGATION-REPORT.md                      ← Step 1: Integration findings
  ├── FULL-SYSTEM-TEST-POSTURE.md                  ← Step 1: Full-system findings
  ├── TESTING-GOVERNANCE-REMEDIATION.md            ← Step 2: Action plan (8 moves)
  ├── ROLLOUT-EXECUTION-STRATEGY.md                ← Step 3: Execution strategy
  ├── CONTEXT-ROLLOUT-TEMPLATE.md                  ← Step 4: Reusable context rollout checklist
  ├── migration-stabilization-parallel-artifact.md ← Parallel track
  ├── INTEGRATION-TEST-REMEDIATION-PLAN.md         ← Superseded (historical)
  ├── LIB-SUPABASE-POSTURE.md                      ← Step 6: lib/supabase infra surface posture
  ├── LIB-SERVER-ACTIONS-POSTURE.md                ← Step 6: lib/server-actions infra surface posture
  ├── ROOT-TESTS-POSTURE.md                        ← Step 6: Root __tests__/ infra surface posture
  ├── 2026-04-01-tier3-phase-b-mode-c-rewrite-PRECIS.md ← Step 6: Phase B precis
  └── slice-1/                                     ← Casino exemplar (Slice One)
      ├── CASINO-EXEMPLAR-POSTURE.md               ← Layer health + verification tier
      ├── CASINO-EXEMPLAR-COMPLETION-SUMMARY.md     ← Delivery record
      ├── CASINO-EXEMPLAR-VALIDATION-REPORT.md      ← Pre-rollout validation + error matrix
      ├── COMPLETE-CASINO-EXEMPLAR-REVIEW.md         ← DA review
      ├── SLICE-ONE-POSTURE.md                       ← Initial posture (historical)
      ├── SLICE-ONE-RUNBOOK.md                       ← Local verification runbook
      └── slice-one-rollout-plan-solo-dev-testing-posture.md

docs/20-architecture/specs/TESTING-GOV-REMEDIATION/
  ├── EXEC-SPEC-GOV-051.md                         ← Segment 1: Infrastructure Foundation
  ├── EXEC-SPEC-GOV-052.md                         ← Segment 2: Test Honesty Restoration
  └── EXEC-SPEC-GOV-053.md                         ← Segment 3: CI Layer Expansion

