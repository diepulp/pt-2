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
