# Delta Patch — TESTING-GOVERNANCE-REMEDIATION.md

## Verdict

**Approved with targeted corrections.**

The artifact is directionally sound and should remain the governance anchor for the testing-remediation effort. The core framing is correct:

- tests existing is not the same as tests enforcing anything
- green CI currently overstates confidence
- branch protection and honest merge gates matter more than decorative suites
- test taxonomy and runtime environments must be made explicit

Three changes are recommended before treating the document as the governing baseline.

---

## 1) Reorder rollout: branch protection must become operationally first

### Problem
The artifact correctly states that branch protection is the highest-leverage governance move, but the rollout order places “add unit test step to CI” before “enable branch protection.”

That sequencing is backward in practice.

If `main` is not protected, then any newly-added CI check is still advisory. A failing check that does not block merge is governance theater.

### Correction
Change the rollout order so the sequence is:

1. **Enable branch protection on `main`**
2. **Add the new CI test job(s)**
3. **Mark those checks as required**
4. **Then expand scope of required checks over time**

### Suggested wording patch
Replace any wording that implies CI job creation alone improves governance with language like:

> CI jobs do not become governance until branch protection makes them merge-blocking.  
> Therefore, branch protection must be activated before new test checks are treated as effective gates.

### Why this matters
The repo’s central defect is not merely missing tests. It is that **proof has been optional**.  
Branch protection is the mechanism that converts policy from suggestion into enforcement.

---

## 2) Do not blanket-skip all route-handler tests; freeze the pattern and quarantine only the worst offenders

### Problem
The artifact is right that many route-handler tests are shallow and amount to coverage theater. However, blanket-converting all 67 to `describe.skip` risks throwing away the small amount of value they still provide, such as import/export smoke and catastrophic wiring breakage.

Not all theater is equally worthless. Some of it is just weak smoke coverage.

### Correction
Do **not** default to skipping the entire class immediately.

Instead:

- **freeze the anti-pattern**: forbid creation of new tests in the same shallow style
- **label existing tests honestly** as smoke where appropriate
- **quarantine only the worst offenders** that are actively misleading or noisy
- **introduce one exemplar route-handler pattern** that tests real behavior
- **replace legacy shallow tests incrementally** as touched

### Suggested wording patch
Replace any broad “skip these route-handler tests” direction with language like:

> Existing shallow route-handler tests should be reclassified as smoke coverage where they still provide minimal module/wiring assurance.  
> New tests in this pattern are prohibited.  
> Misleading or actively noisy tests may be quarantined, while real behavioral exemplars are introduced and legacy cases are replaced incrementally.

### Why this matters
You want to eliminate fake confidence **without** creating an unnecessary observability cliff.  
A controlled downgrade in test status is better than a mass disappearance that leaves nothing behind.

---

## 3) Harden the definition of “advisory”

### Problem
The artifact says integration and Playwright remain advisory until supporting CI infrastructure exists. That is correct, but it still leaves room for future ambiguity.

This repo has already suffered from exactly that sort of ambiguity:
- tests existed
- some people ran them locally
- CI was green
- therefore the system felt “covered”

That imprecision cannot be allowed to survive in the new governance language.

### Correction
Add an explicit definition of what **advisory** means.

### Suggested wording patch
Add a short policy clause such as:

> **Advisory test layers** are useful for developer feedback but do **not** constitute governance, release evidence, or merge protection.  
> A layer remains advisory until it is executed in CI and enforced through required branch-protection checks.

### Why this matters
This single clarification shuts down future self-deception.

Without it, local-only or optional suites can once again masquerade as “quality posture” even though they do not block unsafe merges.

---

## Optional tightening: make the merge-gate principle explicit

This is not a separate correction, but it would strengthen the artifact.

### Suggested addition
Include one concise governing statement near the top:

> A test layer counts toward project verification only when it is:
> 1. run in the correct environment,
> 2. executed automatically in CI,
> 3. and enforced through required merge checks.

This gives the whole document a clean litmus test.

---

## What should remain unchanged

The following parts of the artifact are already strong and should stay:

- the honest inventory of current test posture
- the split between existing tests and actually-enforced tests
- the decision to eliminate global `jsdom`
- the removal of lying `test:ci` exclusions
- the move toward split unit/server-unit/component/integration taxonomy
- the framing that branch protection is the minimum functional gate
- the stance that advisory layers stay advisory until infra exists

Those are good bones. Do not dilute them.

---

## Final recommendation

Apply these three changes and keep the artifact as the governing posture document:

1. **Branch protection first operationally**
2. **Freeze + relabel shallow route-handler smoke instead of blanket-skipping all of it**
3. **Define advisory explicitly so local-only tests cannot masquerade as governance again**

After that, the document is fit to anchor the testing-governance remediation stream.
