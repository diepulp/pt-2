Good question. Let me do this properly — the failures are instructive.

## Feature-Pipeline Retrograde: DA Review Performance

### What the DA team caught (credit where due)

The DA team performed well on its **primary mission** — detecting ADR-046 temporal drift. All three reviewers independently identified the same 2 P0s (fail-closed contradiction, readiness model regression) and 7 P1s. Cross-pollination was clean, zero conflicts, unanimous convergence. The two-phase protocol worked. The team-based architecture (vs. single-reviewer Skill invocation) proved its value — the cross-artifact findings could not have been produced by a single reviewer reading only the PRD.

Attempt 2 correctly verified all fixes and found 2 real new P1s (config key paths, ADR authority table wording).

### What the human review caught that the DA team missed

| Finding | Severity | Which reviewer should have caught it | Why they didn't |
|---------|----------|--------------------------------------|-----------------|
| `compute_failed` collapse into `missing` | Blocker | R3 (coherence) or R2 (ADR alignment) | **Reviewers co-authored the fix** instead of flagging the contradiction |
| UI scope contradiction | Blocker | R3 (coherence) — self-consistency | **No intra-document consistency check** in the protocol |
| Promo issuance overclaim | Blocker | R3 (coherence) — headline vs body | **Headline/framing language excluded** from review scope |
| Hold formula ambiguity | Blocker | R2 (testability) — "which formula?" | **Config key verification ≠ semantic verification** |

### Root cause analysis

**1. Reviewers became co-authors**

This is the most damaging failure. When R1+R2 jointly proposed "collapse `compute_failed` into `missing` for MVP simplicity," the synthesis lead accepted it as a "resolved conflict." But the ADR explicitly requires 5 states. The DA team downgraded an ADR requirement during review — the exact thing adversarial review exists to prevent.

The skill's prompt says "produce patch delta with actionable fixes," which incentivizes reviewers to propose solutions. The line between "flag contradiction + suggest fix" and "negotiate away the requirement" is blurry. In this case, the team crossed it.

**Fix:** Add a hard rule to `da-team-protocol.md`:

> **Reviewers may not amend, downgrade, or waive ADR requirements.** If a PRD contradicts an ADR, the finding is: "PRD contradicts ADR-046 §8 — `compute_failed` required but absent." The remedy is: "restore the state or amend the ADR." Choosing which option is the human's decision, not the reviewer's. Patch deltas may suggest implementation approaches but must not reduce the requirement surface.

**2. No intra-document consistency check**

All three reviewers focused on **cross-artifact** coherence (PRD vs scaffold, PRD vs ADR, PRD vs SEC Note). None checked the **PRD against itself**. The UI scope contradiction — "UI changes out of scope" in §4.2 while §6 describes 5 UI-visible flows — is a within-document logical error. The promo issuance overclaim — overview says "unlocks promo issuance" while authority table says "Deferred" — is also internal.

R3's attack surface says "contradictions between artifacts" but doesn't mention contradictions **within** an artifact. The protocol assumes internal consistency but doesn't verify it.

**Fix:** Add to R3's role-specific instructions:

> **5. Self-consistency check:** Read the PRD's overview, problem statement, and non-goals. For each claim in these framing sections, verify it is consistent with the body (acceptance criteria, authority table, out-of-scope list). Flag where the headline sells more than the body specifies, or where the out-of-scope list contradicts the UX flows.

**3. Headline language excluded from review scope**

The reviewers treated §1 (Overview) and §2 (Problem & Goals) as context-setting preamble and focused their energy on §4 (Scope), §5 (Requirements), and §8 (DoD). But the overview is part of the contract — it sets expectations for stakeholders, and when it overclaims, implementation teams build to the headline rather than the spec.

The protocol's attack angles all reference "acceptance criteria," "controls," and "ADR decisions." None reference "overview claims," "problem statement framing," or "expected-value language."

**Fix:** Add to the reviewer prompt template:

> **Framing language is in scope.** The PRD overview, problem statement, and goals table are contractual — they set stakeholder expectations. If these sections claim the PRD delivers X but the authority table, out-of-scope list, or acceptance criteria say X is deferred, that is a P1 finding (overclaim). A PRD that sells more than it specifies will cause implementation scope creep.

**4. Config verification ≠ semantic verification**

R2 verified that `hold_deviation.deviation_pp` exists in deployed config. R1 confirmed the key paths are correct. But neither asked: "FR-15 says hold uses `deviation_pp`, while Appendix B says all anomalies use `median + mad_multiplier * scaled_mad`. Which formula actually applies to hold?" They verified the **inputs** exist but not that the **computation** is defined.

This is a testability failure — R2's job is literally "can you write a test for this?" A test for hold anomaly evaluation requires knowing the formula. Two different formulas in the same document = untestable.

**Fix:** Add to R2's role-specific instructions:

> **5. Formula/computation precision:** For each metric type with a distinct evaluation rule, verify that the PRD specifies exactly one unambiguous formula. If Appendix B defines a general method and FR-15 defines per-metric overrides, verify they don't contradict. Flag any metric type where a developer would have to guess which formula to implement.

### Structural pipeline issue: temporal sequencing

The root cause of the entire first DA review was that **PRD-055 was written before ADR-046 was patched**. The feature-pipeline doesn't enforce ordering constraints — it allows Phase 5 (PRD) to proceed even when Phase 4 artifacts (ADR) have been modified after Phase 5 began. This is a pipeline design gap.

**Fix:** Add a pre-gate check to the `prd-approved` gate:

> **Temporal integrity check:** Before running the DA team, compare the `modified` timestamp of all Phase 0-4 artifacts against the PRD's `created` timestamp. If any upstream artifact was modified after the PRD was written, flag it:
>
> ```
> [TEMPORAL WARNING] ADR-046 modified after PRD-055 was written.
> PRD may not reflect current ADR state. Recommend PRD refresh before DA review.
> ```
>
> This check runs before the DA team deploys, saving an entire review cycle.

### Summary: skill improvement priorities

| Priority | Change | Impact | Effort |
|----------|--------|--------|--------|
| **P0** | "Reviewers may not amend ADR requirements" hard rule | Prevents the most dangerous failure mode | Low — 2 sentences in protocol |
| **P1** | Add intra-document consistency check to R3 | Catches internal contradictions (UI scope, overclaim) | Low — 1 attack angle addition |
| **P1** | Add framing language to review scope | Catches headline overclaims | Low — 1 paragraph in prompt template |
| **P1** | Add formula precision check to R2 | Catches ambiguous computation specs | Low — 1 attack angle addition |
| **P2** | Temporal integrity pre-gate check | Saves a full DA review cycle when upstream artifacts change | Medium — needs timestamp comparison logic |

The DA team caught what it was designed to catch (cross-artifact drift) and missed what it wasn't designed to catch (self-consistency, overclaim, semantic precision, requirement downgrades). The fixes are all prompt-level — the team architecture is sound, the protocol works, the failure is in the attack surface definition.

Want me to apply these fixes to `da-team-protocol.md` and the feature-pipeline skill now?