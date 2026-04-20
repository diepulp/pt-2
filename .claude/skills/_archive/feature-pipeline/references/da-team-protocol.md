# Feature-Pipeline DA Team Protocol

This document defines the team-based adversarial review protocol for PRD validation
in the feature-pipeline. The protocol uses agent teams with inbox-based messaging
(SendMessage) to verify cross-artifact coherence, scope discipline, and security
carry-forward across the 5 preceding design phases.

## Key Difference from Build-Pipeline DA

Build-pipeline reviews an EXEC-SPEC (implementation blueprint) — its DA team attacks
*how* something will be built. Feature-pipeline reviews a PRD (requirements document)
— its DA team attacks *what* is being specified, checking coherence across all design
artifacts produced in Phases 0-4.

| Aspect | Build-Pipeline DA | Feature-Pipeline DA |
|--------|-------------------|---------------------|
| Target | EXEC-SPEC | PRD + cross-artifact coherence |
| Team size | 6 (5 reviewers + synthesis) | 4 (3 reviewers + synthesis) |
| Primary risk | Implementation gaps | Scope creep, untestable criteria, security gaps |
| Verification | Code/migration verification | Artifact cross-referencing |

---

## Architecture

```
TeamCreate("da-prd-{PRD-ID}")
    │
    ├── r1-scope-security       (SCOPE_SECURITY)
    ├── r2-testability-arch     (TESTABILITY_ARCHITECTURE)
    ├── r3-cross-artifact       (CROSS_ARTIFACT_COHERENCE)
    └── synthesis-lead          (SYNTHESIS — coordinator, not reviewer)
```

---

## Reviewer Roles & Section Assignments

### R1: Scope & Security (`r1-scope-security`)

**Attack surface:**
- Scope creep: PRD acceptance criteria that exceed scaffold non-goals
- SEC note carry-forward: controls declared in SEC note that don't appear in PRD acceptance criteria
- Threat model gaps: attack vectors not covered by any acceptance criterion
- Data classification: PII/financial data handling not specified or contradicts SEC note

**Artifacts to cross-reference:** Scaffold (non-goals), SEC Note (controls, deferred risks), PRD (acceptance criteria, data classification)

### R2: Testability & Architecture (`r2-testability-arch`)

**Attack surface:**
- Untestable acceptance criteria: criteria that can't be verified by a test
- ADR alignment: PRD referencing ADR decisions that don't exist, or contradicting ADR decisions
- Bounded context ownership: PRD requiring writes to tables owned by another service (SRM violation)
- Surface classification: if new UI surface, mandatory fields declared per ADR-041

**Artifacts to cross-reference:** ADR(s) (decisions, invariants), SRM, FEATURE_BOUNDARY (ownership), PRD (acceptance criteria, adr_refs)

### R3: Cross-Artifact Coherence (`r3-cross-artifact`)

**Attack surface:**
- Contradictions between artifacts: scaffold says X is out-of-scope but PRD includes it
- Missing decisions: RFC identified decisions needed but no ADR exists for them
- Undefined behavior: PRD acceptance criteria that depend on behavior not specified in any artifact
- Non-functional requirements: missing error handling, performance, observability criteria
- Self-consistency: PRD overview/problem/non-goals contradicting the PRD body (acceptance criteria, authority table, out-of-scope list)

**Artifacts to cross-reference:** All 5 (Scaffold, RFC, SEC Note, ADR(s), PRD)

---

## Two-Phase Protocol

Same structure as build-pipeline DA team. See build-pipeline `references/da-team-protocol.md`
for the full messaging sequence. Key differences:

### Phase 1: Independent Review

Each reviewer reads their assigned artifacts and attacks from their angle. Cross-domain
findings are routed via `SendMessage` to the owning reviewer.

**Cross-domain routing table:**
| If you find issues about... | Send to |
|-----------------------------|---------|
| Scope creep, security gaps | `r1-scope-security` |
| Untestable criteria, ADR/SRM misalignment | `r2-testability-arch` |
| Cross-artifact contradictions, missing decisions | `r3-cross-artifact` |

**CRITICAL — Persist findings via TaskUpdate:**
When Phase 1 is complete, each reviewer MUST:
1. `TaskUpdate(taskId=N, status="completed", description="<full review output>")`
2. `SendMessage(to="synthesis-lead", message="Phase 1 complete")`

This lesson was learned from the build-pipeline test run: agents that only use
SendMessage without TaskUpdate lose their detailed findings. The synthesis-lead
reads from task descriptions, not ephemeral messages.

### Phase 2: Cross-Pollination

Same as build-pipeline: reviewers check inboxes, investigate cross-domain findings,
confirm/refute, negotiate conflicts.

---

## Reviewer Prompt Template

```
You are an adversarial reviewer for PT-2. Read the devils-advocate skill at
.claude/skills/devils-advocate/SKILL.md for the review methodology and severity rubric.

Adversarial review of PRD for {PRD_ID}:
  PRD: {prd_path}
  Scaffold: {scaffold_path}
  RFC: {rfc_path}
  SEC Note: {sec_note_path}
  ADR(s): {adr_paths}
  Feature Boundary: {boundary_path}

FOCUS: {REVIEWER_ROLE}

CRITICAL — Ground-truth verification:
You have full tool access (Read, Grep, Glob, Bash). Read ALL referenced artifacts,
not just the PRD. Cross-reference claims between artifacts. Check that ADR IDs
referenced in PRD frontmatter actually exist. Verify SRM ownership claims against
the actual SERVICE_RESPONSIBILITY_MATRIX.md.

HARD RULE — Reviewers may not amend ADR requirements:
If a PRD contradicts an ADR, the finding is: "PRD contradicts ADR-{ID} §{section} —
{requirement} required but absent." The remedy is: "restore the requirement or amend
the ADR." Choosing which option is the human's decision, not the reviewer's. Patch
deltas may suggest implementation approaches but must not reduce the requirement
surface. Collapsing, downgrading, or waiving an ADR requirement during review is
the exact failure mode adversarial review exists to prevent — when reviewers become
co-authors of the fix, they lose objectivity and the requirement disappears without
human authorization.

Framing language is in scope:
The PRD overview, problem statement, and goals table are contractual — they set
stakeholder expectations. If these sections claim the PRD delivers X but the
authority table, out-of-scope list, or acceptance criteria say X is deferred, that
is a P1 finding (overclaim). A PRD that sells more than it specifies will cause
implementation scope creep because teams build to the headline, not the spec.

## Review Scope

Produce these sections:
1. **Focused Verdict** — Ship / Ship w/ gates / Do not ship
2. **Findings** — Full depth analysis per your role's attack surface (see below)
3. **Patch Delta (Scoped)** — 3-5 actionable fixes
4. **Cross-Domain Flags** — Issues outside your role, routed via SendMessage

{ROLE_SPECIFIC_INSTRUCTIONS}

## Team Protocol

You are a named member of team "da-prd-{PRD-ID}".

**Phase 1 (Independent):** Complete your review. Route cross-domain findings
via SendMessage to the owning reviewer with file paths and evidence.

Cross-domain routing:
  Scope/security issues    → r1-scope-security
  Testability/architecture → r2-testability-arch
  Cross-artifact coherence → r3-cross-artifact

When Phase 1 is complete:
1. TaskUpdate(taskId=N, status="completed", description="<FULL review output>")
   — THIS IS CRITICAL. Your detailed findings must be persisted in the task.
2. SendMessage(to="synthesis-lead", message="Phase 1 complete")

**Phase 2 (Cross-Pollination):** Check inbox, investigate incoming findings,
confirm or refute with evidence, negotiate conflicts directly.

Team roster: r1-scope-security, r2-testability-arch, r3-cross-artifact, synthesis-lead
```

### Role-Specific Instructions

**For R1 (SCOPE_SECURITY):**
```
Attack these angles:
1. Read scaffold non-goals. For each PRD acceptance criterion, check it doesn't
   violate a non-goal. Flag scope creep with evidence (scaffold line vs PRD line).
2. Read SEC note controls. For each control, verify a corresponding acceptance
   criterion exists in the PRD. Flag security gaps where controls are declared
   but not tested.
3. Check data classification section. Verify PII/financial handling matches SEC note.
4. Check deferred risks in SEC note — are any silently un-deferred in the PRD?
```

**For R2 (TESTABILITY_ARCHITECTURE):**
```
Attack these angles:
1. For each acceptance criterion: can you write a test that proves it? If not,
   it's untestable — flag with P1.
2. Check PRD adr_refs frontmatter. Read each referenced ADR. Flag any PRD
   acceptance criterion that contradicts an ADR decision.
3. Read FEATURE_BOUNDARY.md and SRM. Verify PRD doesn't require writes to
   tables owned by another bounded context.
4. If new UI surface: verify Surface Classification fields (ADR-041).
5. Formula/computation precision: For each metric type with a distinct evaluation
   rule, verify that the PRD specifies exactly one unambiguous formula. If an
   appendix defines a general method and a functional requirement defines per-metric
   overrides, verify they don't contradict. Flag any metric type where a developer
   would have to guess which formula to implement — two different formulas for the
   same computation means the spec is untestable.
```

**For R3 (CROSS_ARTIFACT_COHERENCE):**
```
Attack these angles:
1. Read scaffold, then RFC, then ADR(s), then PRD — in order. Track the
   "decision thread" — decisions identified in scaffold → refined in RFC →
   locked in ADR → referenced in PRD. Flag any breaks in this thread.
2. Check for contradictions: scaffold says "not in scope" but PRD includes it,
   RFC proposes option A but ADR locks option B without explanation, etc.
3. Check for undefined behavior: PRD acceptance criteria that assume behavior
   not specified anywhere (error handling, edge cases, concurrency).
4. Check non-functional requirements: performance, observability, migration
   safety. If RFC mentioned these concerns but PRD has no criteria for them,
   flag as gap.
5. Self-consistency check: Read the PRD's overview, problem statement, and
   non-goals. For each claim in these framing sections, verify it is consistent
   with the body (acceptance criteria, authority table, out-of-scope list). Flag
   where the headline sells more than the body specifies, or where the out-of-scope
   list contradicts the UX flows. Internal contradictions — like "UI changes out
   of scope" while the body describes UI-visible flows — are P1 findings that
   cross-artifact review alone cannot catch.
```

---

## Synthesis-Lead Prompt Template

```
You are the synthesis lead for the DA review team on {PRD_ID}. You
coordinate the review but do NOT review the PRD yourself.

Read the team config at ~/.claude/teams/da-prd-{PRD-ID}/config.json
to discover your teammates.

Your responsibilities:

1. Monitor Phase 1 — check TaskList periodically. When all 3 reviewer
   tasks show completed, read their findings via TaskGet(taskId=N).
   Broadcast Phase 2 start.

2. Detect conflicts between reviewers. Route resolution requests.

3. Collect Phase 2 results from reviewer messages.

4. Produce consolidated report:
   - Consolidated Verdict (PASS/WARN/BLOCK)
   - Per-Reviewer Summary table
   - Merged P0/P1 Findings (deduplicated, max 10)
   - Resolved Conflicts (joint recommendations)
   - Unresolved Conflicts (for human decision)
   - Unified Patch Delta (max 10 bullets)

5. Deliver report:
   TaskUpdate(taskId=N, status="completed", description="<full report>")
   Also SendMessage to team lead with summary.

Team roster: r1-scope-security, r2-testability-arch, r3-cross-artifact
```

---

## Focused Review Protocol (Tier 1)

When the magnitude assessment selects Tier 1, deploy 1-2 targeted reviewers instead
of the full 4-agent team. No synthesis-lead — the reviewer(s) produce an inline verdict
directly to the orchestrator.

### Reviewer Selection Logic

Select reviewers based on which signal categories contributed to the magnitude score:

| Signals that fired | Reviewer(s) | Rationale |
|-------------------|-------------|-----------|
| Security signals only (PII, DEFINER, threats, deferred risks) | R1 (`r1-scope-security`) | Security surface is the primary complexity |
| Architecture signals only (ADRs >= 2, cross-context, write tables) | R2 (`r2-testability-arch`) | ADR alignment and bounded context are the primary concerns |
| Both security + architecture signals | R1 + R2 | Two-domain complexity warrants two reviewers |
| Complexity signals only (UI surface, no security/architecture) | R3 (`r3-cross-artifact`) | Internal consistency is the primary risk |
| Mixed signals (no clear category dominance) | R1 + R3 | Scope discipline + coherence cover the broadest surface |

### Focused Review Dispatch

No team creation needed — spawn 1-2 independent agents:

```
Agent(name="focused-r1", prompt="<reviewer prompt with SCOPE_SECURITY role>")
// and optionally:
Agent(name="focused-r2", prompt="<reviewer prompt with TESTABILITY_ARCHITECTURE role>")
```

Use the same reviewer prompt template as the full team (including the hard rules on ADR
amendment, framing language, self-consistency, and computation precision). The only
differences:

1. **No team_name** — agents don't need SendMessage since there are at most 2 reviewers
2. **No Phase 2** — with 1-2 reviewers, cross-pollination is unnecessary
3. **No synthesis-lead** — the orchestrator reads the verdict directly from TaskGet
4. **Inline verdict** — reviewer completes via TaskUpdate, orchestrator extracts verdict

### Focused Review Gate Logic

Same as full team but simpler:
- All reviewers "Ship" → **PASS**
- Any "Ship w/ gates" (no P0) → **WARN** — present findings, human decides
- Any "Do not ship" (P0 found) → **BLOCK** — enter retry protocol (same as full team)

### Checkpoint Recording

Record `da_review.magnitude_tier = "focused_review"` and `da_review.team_results` with
only the reviewers that ran. The `team_name` field is null for focused reviews.

---

## Checkpoint Schema Additions

The `da_review` field in the feature-pipeline checkpoint gains team fields:

```json
{
  "da_review": {
    "ran": true,
    "verdict": "ship_with_gates",
    "p0_count": 0,
    "p1_count": 3,
    "attempt": 1,
    "override_reason": null,
    "team_name": "da-prd-PRD-053",
    "team_results": [
      {
        "reviewer": "scope_security",
        "verdict": "ship_with_gates",
        "p0_count": 0,
        "p1_count": 1,
        "key_findings": ["SEC note control X not covered by acceptance criteria"]
      },
      {
        "reviewer": "testability_architecture",
        "verdict": "ship",
        "p0_count": 0,
        "p1_count": 0,
        "key_findings": []
      },
      {
        "reviewer": "cross_artifact_coherence",
        "verdict": "ship_with_gates",
        "p0_count": 0,
        "p1_count": 2,
        "key_findings": ["RFC decision D3 has no corresponding ADR", "Scaffold non-goal violated"]
      }
    ],
    "cross_artifact_findings": 3,
    "resolved_conflicts": [],
    "unresolved_conflicts": []
  }
}
```
