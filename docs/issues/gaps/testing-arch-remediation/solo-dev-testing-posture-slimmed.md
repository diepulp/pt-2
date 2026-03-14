# Solo-Developer Testing Posture — Slimmed-Down Governance Proposal

**Status:** Proposed  
**Date:** 2026-03-13  
**Purpose:** Strip enterprise-grade ceremony from the testing governance remediation while preserving the core correction required by the investigation.

---

## 1. Position

The current testing governance package is **too strict as an immediate operating posture for a single-developer workflow**.

That does **not** invalidate the investigation findings. The investigation still confirmed a critical technical defect:

- global `jsdom` masks correct server runtime behavior
- `test:ci` silently excludes integration classes
- CI has no actual Jest test step
- route-handler coverage is partially theatre
- the repo has been operating with ambiguous verification claims

Those defects require remediation.

What should be rejected is the assumption that a solo repository must immediately adopt full branch-protected, peer-reviewed, enterprise-style governance to restore honesty.

The correct near-term goal is narrower:

> **Restore truthful local verification first. Promote enforcement later.**

---

## 2. What Must Be Preserved

The following principles from the current governance work are valid and should remain:

1. **Correct runtime matters.**  
   Server-side tests must not run under `jsdom`.

2. **Scripts must be truthful.**  
   A command must not imply broad verification while silently excluding material test classes.

3. **Route-handler theatre must stop.**  
   Shallow mock-everything tests should not be treated as meaningful behavioral verification.

4. **At least one bounded context must be restored honestly.**  
   The repo needs one exemplar slice that proves implementation reality matches its claims.

5. **Local-only suites must be labeled honestly.**  
   If a suite is not run automatically, it is useful but advisory.

These are not enterprise rituals. They are the minimum intellectual hygiene required to stop lying about test posture.

---

## 3. What Should Be Deferred

The following items may be deferred without invalidating the remediation effort:

- mandatory peer review requirements
- explicit ownership language beyond a single steward
- immediate branch protection activation
- required-status-check enforcement on `main`
- CI integration-job rollout
- Playwright promotion to merge-blocking
- repo-wide conformance across all bounded contexts

These are enforcement mechanisms, not the first-order technical correction.

For a solo-developer workflow, treating them as immediate prerequisites creates unnecessary drag and risks turning a sharp remediation into governance pageantry.

---

## 4. Revised Solo-Developer Principle

Replace the current enforcement-first posture with this rule:

> A test layer counts as **trusted local verification** when it runs in the correct runtime, is invoked by a truthful command, and produces behaviorally meaningful assertions.

That is enough for the first remediation slice.

A test layer counts as **governance-grade merge protection** only when it is also executed automatically in CI and enforced through branch protection.

This preserves the conceptual distinction between:
- **truthful verification**
- **formal governance enforcement**

The former is required now.  
The latter can be promoted later.

---

## 5. Slimmed-Down Remediation Target

### Phase 1 — Restore Local Truth

Do this now:

- split Jest by runtime (`node`, `jsdom`, integration)
- remove or rename misleading `test:ci` behavior
- establish one bounded-context exemplar
- add one honest route-handler exemplar
- run the exemplar locally until it is trusted
- mark all other non-automated layers as advisory

**Exit condition:**  
One bounded context has a truthful, locally green test slice in the correct runtime, with at least one real behavioral canary.

### Phase 2 — Expand by Bounded Context

Do next:

- restore additional server-unit and integration tests one bounded context at a time
- extend shared helpers only where needed
- fix route-handler tests incrementally as affected surfaces are touched
- avoid big-bang rewrite fantasies

**Exit condition:**  
Multiple bounded contexts have honest local verification without pretending the whole repository is governed.

### Phase 3 — Add Lightweight Automation

Only after local trust exists:

- add CI execution for the restored exemplar slice
- keep it visible first, blocking later
- avoid pretending that one non-blocking job equals mature governance

**Exit condition:**  
The exemplar runs automatically and gives signal without forcing full branch-protection ceremony.

### Phase 4 — Promote Enforcement

Only when the signal is stable:

- enable branch protection if the workflow genuinely benefits
- make the trusted functional slice required
- then broaden the required set over time

**Exit condition:**  
At least one real functional layer blocks merge, because it has earned that authority.

---

## 6. Practical Operating Rules for a Solo Repo

1. **Do not claim “green” unless you say what is green.**  
   Distinguish:
   - static green
   - local functional green
   - CI green

2. **No silent exclusions.**  
   If a class of tests is skipped, excluded, or env-gated, state it plainly.

3. **No wrong-runtime execution.**  
   Passing under the wrong environment is false comfort.

4. **No new shallow handler theatre.**  
   Freeze the anti-pattern now.

5. **Prefer one honest slice over broad fake coverage.**  
   A single trusted bounded-context exemplar is worth more than dozens of misleading tests.

6. **Promotion is earned.**  
   Do not make tests merge-blocking before they are stable, truthful, and cheap enough to trust.

---

## 7. Recommended Edit to the Existing Governance Direction

The current standard and remediation should be reframed as two layers:

### Durable layer
Keep:
- runtime correctness
- truthfulness of scripts/config
- route-handler anti-theatre policy
- advisory vs enforced distinction
- incremental bounded-context restoration

### Deferred enforcement layer
Downgrade from immediate requirement to later promotion:
- branch protection
- required status checks
- mandatory PR approvals
- formal ownership/review process

This preserves the good part of the governance work while removing solo-dev absurdity.

---

## 8. Concrete Recommendation

Adopt this posture immediately:

- **Yes:** fix the harness
- **Yes:** establish one bounded-context exemplar
- **Yes:** validate implementation reality locally
- **Yes:** document advisory vs trusted-local status
- **Not yet:** enforce branch protection
- **Not yet:** require peer review
- **Not yet:** treat CI as the only meaningful source of truth

### Canonical first slice
Use the investigation-backed canary approach:
- one bounded context
- one integration canary
- one route-handler exemplar
- truthful scripts
- correct runtime split

That gives you a real foundation instead of a paper constitution.

---

## 9. Bottom Line

The repo does **not** need immediate enterprise governance to correct this defect.

It **does** need immediate honesty.

The right first move is:

> **Fix the runtime split, remove misleading script behavior, and prove one bounded context properly.**

After that, CI and branch protection can be added as promotion steps rather than treated as sacred rites performed before the test posture has earned them.
