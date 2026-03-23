# DA Team Protocol

This document defines the team-based adversarial review protocol for EXEC-SPEC validation.
The protocol uses agent teams with inbox-based messaging (SendMessage) to enable cross-domain
finding verification, conflict resolution through reviewer negotiation, and informed synthesis.

---

## Architecture Overview

```
TeamCreate("da-review-{PRD-ID}")
    │
    ├── r1-security          (SECURITY_TENANCY)
    ├── r2-architecture      (ARCHITECTURE_BOUNDARIES)
    ├── r3-implementation    (IMPLEMENTATION_COMPLETENESS)
    ├── r4-test-quality      (TEST_QUALITY)
    ├── r5-performance       (PERFORMANCE_OPERABILITY)
    └── synthesis-lead       (SYNTHESIS — coordinator, not reviewer)
```

All 6 agents share a team task list and can message each other via `SendMessage`.
The synthesis-lead coordinates phases but does not review the spec itself.

---

## Two-Phase Protocol

### Phase 1: Independent Deep-Dive

Each reviewer completes their assigned sections independently with full ground-truth
verification (Step 1b from devils-advocate skill). This is the same as the previous
isolated-agent design, with one addition:

**Cross-domain routing via SendMessage:**

When a reviewer finds an issue outside their assigned sections, instead of writing a
one-liner "Cross-Domain Flag," they send a substantive message to the owning reviewer:

```
SendMessage(
  to="r1-security",
  message="Found RPC `rpc_update_rating` accepts casino_id as parameter at
    services/rating/crud.ts:147. Possible ADR-024 INV-8 violation — no
    spoofable parameters allowed. Needs your security assessment.
    git log shows no recent changes to this file.",
  summary="Cross-domain: possible INV-8 violation in rating RPC"
)
```

**What makes this better than a one-liner flag:**
- Includes file path, line number, and specific ADR reference
- Includes verification already done (git log check)
- The owning reviewer (r1-security) receives it in their inbox and can investigate
  with full context during Phase 2, rather than the generalist orchestrator trying
  to interpret a terse flag

**When Phase 1 is complete**, each reviewer MUST:
1. Update their task via `TaskUpdate(taskId=N, status="completed", description="<full review output>")`
   — include the complete Focused Verdict, assigned section findings, patch delta, and cross-domain flags
   in the task description. This is the **persistent record** that synthesis-lead reads from.
2. SendMessage to synthesis-lead confirming Phase 1 complete.

The synthesis-lead monitors the task list and triggers Phase 2.

### Phase 2: Cross-Pollination

Triggered by synthesis-lead when all 5 reviewer tasks show Phase 1 complete.

```
synthesis-lead broadcasts:
SendMessage(to="*", message="All Phase 1 reviews complete. Begin Phase 2:
  check your inbox for cross-domain findings from other reviewers.
  Investigate, confirm or refute, and send responses. You have one
  round of messaging — after responding to all inbox items, update
  your task with any additional findings.")
```

Each reviewer then:

1. **Reads incoming messages** from other reviewers
2. **Investigates** cross-domain flags that land in their domain
3. **Responds** with confirmation or refutation:

```
// R1 confirms R5's cross-domain finding
SendMessage(
  to="r5-performance",
  message="Confirmed: rpc_update_rating does accept casino_id as parameter.
    This IS an ADR-024 INV-8 violation (P0). Adding to my Section 4 findings
    with patch: derive casino_id from set_rls_context_from_staff() instead.",
  summary="Confirmed INV-8 violation in rating RPC"
)
```

4. **Negotiates conflicts** when they arise:

```
// R2 and R5 disagree — R2 wants abstraction, R5 says over-engineering
SendMessage(
  to="r5-performance",
  message="The DTO abstraction layer for loyalty prevents N+1 in the
    company-scoped query path (3 joins without it). Not over-engineering —
    it's a performance requirement. Propose joint recommendation: keep
    abstraction with perf justification, no separate adapter layer.",
  summary="Proposing joint recommendation on loyalty DTO abstraction"
)

// R5 responds
SendMessage(
  to="r2-architecture",
  message="Agreed — if the N+1 is real, the abstraction is justified.
    Joint recommendation: keep abstraction, document perf justification
    inline, remove the adapter layer mentioned in WS3.",
  summary="Agreed on joint recommendation"
)

// Both notify synthesis-lead
SendMessage(
  to="synthesis-lead",
  message="CONFLICT RESOLVED between r2-architecture and r5-performance:
    Loyalty DTO abstraction kept (perf-justified, prevents N+1).
    Adapter layer in WS3 removed. Joint recommendation.",
  summary="Conflict resolved: loyalty DTO abstraction"
)
```

### Phase Timing

- **Phase 1**: No time constraint — reviewers work at their own pace
- **Phase 2**: One round of messaging. After responding to all inbox items and
  updating findings, reviewers go idle. Synthesis-lead proceeds when all
  reviewers are idle after Phase 2 broadcast.

---

## Reviewer Prompt Template

Use this template for each of the 5 reviewer agents:

```
You are an adversarial reviewer for PT-2. Read the devils-advocate skill at
.claude/skills/devils-advocate/SKILL.md and follow its Focused Review Mode.

Adversarial review of EXEC-SPEC for {PRD_ID}:
  Specification: {exec_spec_path}
  Workstreams: {workstream_summary}
  Bounded Contexts: {bounded_contexts}

FOCUS: {REVIEWER_ROLE}
SECTIONS: {assigned_section_numbers}
CONTEXT FILES: {domain_context_files}

Use Focused Review Mode. Attack ONLY your assigned sections with full depth.

CRITICAL — Ground-truth verification:
You have full tool access (Read, Grep, Glob, Bash). Before filing any
"missing implementation" or "missing migration" finding, SEARCH the codebase
to confirm it is actually missing. Use `git log --oneline -20 -- <path>` to
check recent changes on relevant files. Never file a "missing X" finding
without first searching for X.

## Team Protocol

You are a named member of team "da-review-{PRD-ID}". You can message other
reviewers and the synthesis-lead via SendMessage.

**Phase 1 (Independent):** Complete your assigned sections. When you find
issues OUTSIDE your assigned sections, send a targeted message to the owning
reviewer — include file paths, line numbers, ADR references, and what you
need them to investigate. Do NOT just flag it as a one-liner.

Cross-domain routing table:
  Sections 1, 4 (security/threats) → r1-security
  Sections 5, 8 (data model/scope) → r2-architecture
  Sections 2, 3 (ambiguities/gaps) → r3-implementation
  Section 7 (test holes)           → r4-test-quality
  Section 6 (perf/operability)     → r5-performance

When Phase 1 is complete:
1. Mark your task as completed AND persist your full review output:
   TaskUpdate(taskId=N, status="completed", description="<your complete
   Focused Verdict, assigned section findings with severity labels,
   Patch Delta, and Cross-Domain Flags>")
   This is CRITICAL — synthesis-lead reads your findings from the task
   description. If you only send messages without updating the task,
   your detailed findings are lost.
2. SendMessage to synthesis-lead confirming Phase 1 complete.

**Phase 2 (Cross-Pollination):** After synthesis-lead announces Phase 2,
check your inbox. For each incoming cross-domain finding:
  1. Investigate it with the same rigor as your own findings
  2. Confirm or refute with evidence
  3. Send your response to the originating reviewer
  4. If you and another reviewer disagree, negotiate directly via
     messaging and send the joint recommendation to synthesis-lead

After responding to all inbox items, go idle. Synthesis-lead will proceed.

Team roster:
  r1-security, r2-architecture, r3-implementation,
  r4-test-quality, r5-performance, synthesis-lead
```

---

## Synthesis-Lead Prompt Template

```
You are the synthesis lead for the DA review team on {PRD_ID}. You
coordinate the review but do NOT review the spec yourself.

Read the team config at ~/.claude/teams/da-review-{PRD-ID}/config.json
to discover your teammates.

Your responsibilities:

**1. Monitor Phase 1 Completion**
Check TaskList periodically. When all 5 reviewer tasks show completed:
  - Read each reviewer's findings using TaskGet(taskId=N) — the full
    review output is persisted in the task description. This is your
    primary data source for consolidation, not messages.
  - Broadcast Phase 2 start:
    SendMessage(to="*", message="All Phase 1 reviews complete. Begin
    Phase 2: check your inbox for cross-domain findings. Investigate,
    confirm or refute, and send responses.")

**2. Detect and Route Conflicts**
If you notice contradictions between reviewers' findings (e.g., R2
recommends adding something that R5 flagged as over-engineering):
  SendMessage(to="r2-architecture", message="CONFLICT: Your finding #3
  recommends adding X. r5-performance flagged X as PT-OE-01 violation.
  Please message r5-performance directly to negotiate a joint
  recommendation, then send the resolution to me.")

**3. Collect Phase 2 Results**
After all reviewers go idle post-Phase 2:
  - Read any conflict resolution messages sent to you
  - Collect updated findings from reviewer messages

**4. Produce Consolidated Report**
Generate the final synthesis with these sections:

  ## Consolidated Verdict
  [PASS | WARN | BLOCK]
  - All 5 "Ship" → PASS
  - Any "Ship w/ gates" (no P0) → WARN
  - Any "Do not ship" (P0 found) → BLOCK

  ## Per-Reviewer Summary
  | Reviewer | Verdict | P0 | P1 | Key Finding |
  (1-2 lines each)

  ## Merged Findings (P0/P1)
  Deduplicated by root cause, severity = max of reporters.
  Cross-domain findings verified in Phase 2 are marked [VERIFIED].
  Max 15 items.

  ## Resolved Conflicts
  Joint recommendations from reviewer negotiations.

  ## Unresolved Conflicts
  Contradictions that reviewers could not resolve — flagged for human decision.

  ## Unified Patch Delta
  Merged from all reviewer patch deltas, max 15 bullets.
  Remove duplicates. Prioritize P0 fixes first.

**5. Deliver Report**
You MUST persist the full consolidated report via TaskUpdate:
  TaskUpdate(taskId=N, status="completed", description="<full report>")
The orchestrator reads the report from the task description — if you
only send it via SendMessage, the detailed findings are lost.
Also send a summary message to the team lead via SendMessage.

Team roster:
  r1-security, r2-architecture, r3-implementation,
  r4-test-quality, r5-performance
```

---

## Checkpoint Schema Additions

The `adversarial_review` field in the checkpoint gains these team-specific fields:

```typescript
adversarial_review?: {
  // ... existing fields ...
  verdict: "ship" | "ship_with_gates" | "do_not_ship" | "overridden";
  p0_count: number;
  p1_count: number;
  attempt: number;
  findings_path?: string;
  override_reason?: string;

  // DA Team results (5 reviewers)
  team_results?: Array<{
    reviewer: string;
    verdict: "ship" | "ship_with_gates" | "do_not_ship";
    p0_count: number;
    p1_count: number;
    key_findings: string[];
  }>;

  // Team-based additions
  team_name?: string;                    // e.g., "da-review-PRD-053"
  cross_domain_findings?: number;        // count of cross-domain messages sent
  cross_domain_verified?: number;        // count confirmed in Phase 2
  cross_domain_refuted?: number;         // count refuted in Phase 2
  resolved_conflicts?: Array<{
    between: [string, string];           // e.g., ["r2-architecture", "r5-performance"]
    subject: string;                     // what they disagreed about
    resolution: string;                  // joint recommendation
  }>;
  unresolved_conflicts?: string[];       // flagged for human decision
};
```

---

## Why This Architecture Works

### Problem 1: Dead-Drop Cross-Domain Flags → Solved

Before: Reviewer writes one-liner flag → orchestrator interprets it (poorly).
After: Reviewer sends substantive message to domain owner → domain owner investigates
and confirms/refutes with evidence. Only verified findings enter the consolidated report.

### Problem 2: Conflicts Punted to Human → Mostly Solved

Before: All contradictions flagged as `conflict` for human decision.
After: Reviewers negotiate directly and produce joint recommendations. Only truly
irreconcilable disagreements reach the human. Expected reduction: 60-80% of conflicts
resolved by reviewers.

### Problem 3: Redundant Codebase Verification → Reduced

Before: All 5 agents independently grep the same files.
After: Cross-domain messages include verification already done ("git log shows no
recent changes to this file"), reducing duplicate work. Not fully eliminated — reviewers
still independently verify their own sections — but Phase 2 prevents re-verification
of cross-domain findings.

### Problem 4: No Iterative Depth → Solved

Before: R4 can't know about R1's P0 security finding until post-hoc synthesis.
After: R1 messages R4 during Phase 1 ("check if test plan covers this attack vector").
R4 investigates during Phase 2 and adds test hole finding if warranted. The test quality
review is informed by the security review.

### Problem 5: Shallow Synthesis → Solved

Before: Generalist orchestrator deduplicates by text matching.
After: Synthesis-lead coordinates with domain experts. Dedup verified by finding owners.
Conflicts resolved by the reviewers who understand the trade-offs, not by pattern matching.
