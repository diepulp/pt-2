---
id: GOV-012
title: "Pipeline Consolidation Spec — feature-pipeline + build-pipeline"
owner: Engineering
status: Accepted
date: 2026-02-22
affects: [feature-pipeline, prd-pipeline, GOV-010]
supersedes: current feature-pipeline (7-phase), prd-pipeline (4-phase), 7 commands
---

# Pipeline Consolidation Spec

## Problem

Feature development has two overlapping pipelines with misleading names and incorrect phase ordering:

1. **feature-pipeline** (outer, 7 phases) — lifecycle from SRM check to execution
2. **prd-pipeline** (inner, 4 phases) — EXEC-SPEC generation + workstream execution

Three issues:
- **Wrong order**: PRD (Phase 2) comes before ADR (Phase 4), violating GOV-010 gate rule
- **Missing stages**: No Feature Scaffold, no Design Brief/RFC
- **Misleading names**: "prd-pipeline" accepts any spec doc; "prd-execute" isn't PRD-specific
- **Command sprawl**: 7 commands for two pipelines (feature-start, feature-resume, feature-status, feature-gate, feature-freeze-adr, prd-execute, exec-spec-execute)

## Decision

Split into two pipelines with clean separation of concerns:
- **feature-pipeline** = design-time (produces *what* and *why*)
- **build-pipeline** = build-time (produces *how* and ships it)

Consolidate 7 commands into 3.

---

## Current State

### feature-pipeline (`.claude/skills/feature-pipeline/SKILL.md`)

```
Phase 0: SRM Check         → srm-ownership
Phase 1: Feature Brief     → brief-approved
Phase 2: PRD               → prd-approved        ← BEFORE ADR (wrong)
Phase 3: SEC Note          → sec-approved
Phase 4: ADR (if needed)   → adr-frozen           ← AFTER PRD (wrong)
Phase 5: EXEC-SPEC + DoD   → dod-executable
Phase 6: Execute           → implementation-complete
```

### prd-pipeline (`.claude/skills/prd-pipeline/SKILL.md`)

```
Phase 1: EXECUTION-SPEC Generation (lead-architect → expert consultation)
Phase 2: Approval Gate
Phase 3: Phased Workstream Execution (parallel Skill dispatch)
Phase 4: Completion
```

### Commands (7 total)

| Command | File | Routes to |
|---|---|---|
| `/feature-start` | `.claude/commands/feature-start.md` | feature-pipeline |
| `/feature-resume` | `.claude/commands/feature-resume.md` | feature-pipeline |
| `/feature-status` | `.claude/commands/feature-status.md` | feature-pipeline |
| `/feature-gate` | `.claude/commands/feature-gate.md` | feature-pipeline |
| `/feature-freeze-adr` | `.claude/commands/feature-freeze-adr.md` | feature-pipeline |
| `/prd-execute` | `.claude/commands/prd-execute.md` | prd-pipeline |
| `/exec-spec-execute` | `.claude/commands/exec-spec-execute.md` | prd-pipeline |

---

## Target State

### feature-pipeline — Design Only (6 phases)

```
Phase 0: SRM Check           → srm-ownership        (unchanged)
Phase 1: Feature Scaffold    → scaffold-approved     (REPLACES Feature Brief)
Phase 2: Design Brief / RFC  → design-approved       (NEW)
Phase 3: SEC Note            → sec-approved          (kept)
Phase 4: ADR(s)              → adr-frozen            (kept, now BEFORE PRD)
Phase 5: PRD                 → prd-approved           (MOVED from Phase 2 → 5)
HANDOFF → /build PRD-###
```

Terminal phase is 5. On `prd-approved`, feature-pipeline records handoff and instructs user to run `/build PRD-###`. No EXEC-SPEC generation, no workstream execution — that's build-pipeline's domain.

### build-pipeline — Execution Only (renamed from prd-pipeline)

```
GOV-010 prerequisite check → verify scaffold + ADR refs exist
Phase 1: EXEC-SPEC Generation (lead-architect scaffold → expert consultation)
Phase 2: Approval Gate
Phase 3: Phased Workstream Execution (parallel Skill dispatch)
Phase 4: Completion + DoD validation
```

DoD gate checking (currently feature-pipeline Phase 5) moves here — it belongs with execution.

### Commands (3 total, down from 7)

| Command | File | Routes to | Purpose |
|---|---|---|---|
| `/feature <name>` | `.claude/commands/feature.md` | feature-pipeline | Start new OR resume existing (idempotent) |
| `/feature-status` | `.claude/commands/feature-status.md` | feature-pipeline | Read-only status display |
| `/build <input>` | `.claude/commands/build.md` | build-pipeline | Implementation from any spec doc |

### Deleted commands

| Command | Absorbed by | Rationale |
|---|---|---|
| `/feature-start` | `/feature <name>` | Same intent — "work on this feature" |
| `/feature-resume` | `/feature <name>` | Smart detection: checkpoint exists → resume, else start |
| `/feature-gate` | `/feature <name>` | Pipeline re-checks current gate on resume |
| `/feature-freeze-adr` | `adr-frozen` gate | Gate validation rejects ADRs with impl detail |
| `/prd-execute` | `/build` | Renamed |
| `/exec-spec-execute` | `/build` | Folded in — same pipeline, different input format |

---

## Clean Boundary

| Concern | Owner | Artifacts |
|---|---|---|
| What problem, what options | feature-pipeline | Scaffold (`docs/01-scaffolds/`) |
| What approach + alternatives | feature-pipeline | RFC (`docs/02-design/`) |
| What security risks | feature-pipeline | SEC Note |
| What decisions are locked | feature-pipeline | ADR(s) (`docs/80-adrs/`) |
| What must be true | feature-pipeline | PRD (`docs/10-prd/`) |
| How to build it | build-pipeline | EXEC-SPEC (`docs/21-exec-spec/`) |
| Building it | build-pipeline | Code, migrations, tests |
| Proving it's done | build-pipeline | DoD gates, CI validation |

---

## Phase Details (feature-pipeline)

### Phase 0: SRM Check (unchanged)
- Load SRM, identify owning bounded context
- Output: ownership sentence + FEATURE_BOUNDARY.md
- Gate: `srm-ownership`

### Phase 1: Feature Scaffold (REPLACES Feature Brief)
- Uses template: `docs/01-scaffolds/TEMPLATE.md`
- Output: `docs/01-scaffolds/SCAFFOLD-###-{feature}.md`
- Must include: intent, constraints, options (2-4), decision to make, open questions
- Gate: `scaffold-approved` — if you can't list 2+ options with tradeoffs, you haven't thought enough
- Delegates to: inline (orchestrator can do this — it's a framing doc, not domain-specific)

### Phase 2: Design Brief / RFC (NEW)
- Uses template: `docs/02-design/TEMPLATE.md`
- Output: `docs/02-design/RFC-###-{feature}.md`
- Must include: context, proposed direction, detailed design sketch, alternatives, decisions that need ADRs
- Gate: `design-approved` — if you can't name the decisions that need ADRs, the design is incomplete
- Delegates to: `lead-architect` skill

### Phase 3: SEC Note (unchanged)
- Template: `references/sec-note-template.md`
- Must include: assets, threats, controls, deferred risks
- Gate: `sec-approved`

### Phase 4: ADR(s) (kept at Phase 4, now BEFORE PRD)
- Delegates to: `lead-architect` skill
- Only for durable decisions (mechanism choices, security invariants, access control)
- Implementation detail goes to EXEC-SPEC (enforced by gate)
- Gate: `adr-frozen` — ADR contains only context/decision/consequences, no SQL/code

### Phase 5: PRD (MOVED from Phase 2 → 5)
- Delegates to: `prd-writer` skill
- Now has scaffold, RFC, SEC note, and ADR(s) as input context
- PRD MUST reference ADR IDs for mechanism decisions
- Gate: `prd-approved` — if changing a library requires rewriting the PRD, reject it
- **Terminal phase**: on approval, output handoff instruction

### Handoff
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Feature Design Complete: {feature-name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Artifacts:
  ✅ Scaffold: docs/01-scaffolds/SCAFFOLD-###-{slug}.md
  ✅ RFC:      docs/02-design/RFC-###-{slug}.md
  ✅ SEC Note: docs/20-architecture/specs/{feature}/SEC_NOTE.md
  ✅ ADR(s):   docs/80-adrs/ADR-###-{slug}.md
  ✅ PRD:      docs/10-prd/PRD-###-{slug}.md

Next: /build PRD-###
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Phase Details (build-pipeline)

### GOV-010 Prerequisite Check (NEW, at entry)
When input is a PRD:
1. Check PRD frontmatter for `scaffold_ref` and `adr_refs`
2. Verify referenced files exist
3. If missing: warn and require explicit waiver

```
⚠️  GOV-010 Gate Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRD-027 prerequisite check:
  ✅ Scaffold: docs/01-scaffolds/SCAFFOLD-001-csv-import.md
  ❌ No ADR references (adr_refs not in frontmatter)

Options:
  1. Add ADR references and re-run
  2. Override with waiver reason
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Phase 1-4: Unchanged from current prd-pipeline
- EXEC-SPEC generation (lead-architect scaffold → expert consultation)
- Approval gate
- Phased workstream execution (parallel Skill dispatch)
- Completion + DoD validation

### EXEC-SPEC Output Location Change
- Current: `docs/20-architecture/specs/{PRD-ID}/EXECUTION-SPEC-{PRD-ID}.md`
- New: `docs/21-exec-spec/EXEC-###-{slug}.md`

---

## Checkpoint Schema Updates

### feature-pipeline checkpoint
```json
{
  "feature_id": "csv-player-import",
  "current_phase": 3,
  "status": "in_progress",
  "gates_passed": ["srm-ownership", "scaffold-approved", "design-approved"],
  "gates_pending": ["sec-approved", "adr-frozen", "prd-approved"],
  "artifacts": {
    "feature_boundary": "docs/20-architecture/specs/csv-player-import/FEATURE_BOUNDARY.md",
    "scaffold": "docs/01-scaffolds/SCAFFOLD-001-csv-player-import.md",
    "design_brief": "docs/02-design/RFC-001-csv-player-import.md",
    "sec_note": null,
    "adr": null,
    "prd": null
  },
  "timestamp": "2026-02-22T10:00:00Z"
}
```

### build-pipeline checkpoint
Unchanged from current prd-pipeline checkpoint format, except:
- Location stays: `.claude/skills/build-pipeline/checkpoints/{ID}.json`
- Adds `gov010_check` field: `"passed"` | `"waived:{reason}"` | `"pending"`

---

## `/feature` Command — Smart Detection Logic

```
/feature <argument>

If argument == "status":
  → display status (read-only)

If checkpoint exists for <argument>:
  → resume from last phase
  → re-check current gate if previously failed

If no checkpoint exists:
  → start new pipeline at Phase 0
  → create checkpoint
```

---

## `/build` Command — Input Resolution

```
/build <argument>

If argument == "--resume":
  → load most recent checkpoint, continue

If argument matches PRD-XXX:
  → resolve to docs/10-prd/PRD-XXX*.md
  → run GOV-010 prerequisite check

If argument matches EXEC-###:
  → resolve to docs/21-exec-spec/EXEC-###*.md
  → skip EXEC-SPEC generation (already exists)

If argument is a file path:
  → use directly
  → run GOV-010 check if it's a PRD
```

---

## Implementation Plan

### Files to Create
| File | Purpose |
|---|---|
| `.claude/commands/feature.md` | Unified feature command (start/resume) |
| `.claude/commands/build.md` | Build command (replaces prd-execute + exec-spec-execute) |
| `.claude/skills/build-pipeline/SKILL.md` | Renamed + updated skill |

### Files to Update
| File | Changes |
|---|---|
| `.claude/skills/feature-pipeline/SKILL.md` | Reorder phases, replace Feature Brief with Scaffold, add RFC phase, remove EXEC-SPEC/Execute phases, add handoff |
| `.claude/commands/feature-status.md` | Update gate names in description |
| `.claude/skills/build-pipeline/references/*` | Copy from prd-pipeline, update paths |
| `.claude/skills/build-pipeline/context/*` | Copy from prd-pipeline (unchanged) |
| `.claude/skills/build-pipeline/scripts/*` | Copy from prd-pipeline, update EXEC-SPEC path |

### Files to Delete
| File | Absorbed by |
|---|---|
| `.claude/commands/feature-start.md` | `/feature` |
| `.claude/commands/feature-resume.md` | `/feature` |
| `.claude/commands/feature-gate.md` | `/feature` (auto gate re-check on resume) |
| `.claude/commands/feature-freeze-adr.md` | `adr-frozen` gate |
| `.claude/commands/prd-execute.md` | `/build` |
| `.claude/commands/exec-spec-execute.md` | `/build` |

### Skill folder operations
1. Copy `.claude/skills/prd-pipeline/` → `.claude/skills/build-pipeline/`
2. Update SKILL.md in build-pipeline (rename, add GOV-010 check, update EXEC-SPEC output path)
3. Keep `.claude/skills/prd-pipeline/` as deprecated alias (optional, for transition)

### Cross-references to update
| Location | Update |
|---|---|
| `.claude/CLAUDE.md` Skills section | Replace prd-pipeline → build-pipeline, add /feature and /build |
| `docs/INDEX.md` | Update skill references |
| `docs/70-governance/FEATURE-DEVELOPMENT-GATE.md` | Add /feature and /build command references |
| feature-pipeline SKILL.md Phase 6 delegation | Remove — pipeline ends at Phase 5 |

---

## Trigger Word Updates

### build-pipeline (was prd-pipeline)
Current triggers: "execute a PRD", "run /prd-execute", "implement PRD-XXX"
New triggers: "build", "run /build", "implement", "execute spec", "implement PRD-XXX", "generate EXECUTION-SPEC"

### feature-pipeline
Current triggers: "start a feature", "feature pipeline"
New triggers: "feature", "start feature", "design feature", "run /feature", "feature pipeline"

---

## What Does NOT Change

- **build-pipeline internals**: 4-phase orchestration, expert routing, parallel Skill dispatch, checkpoint management
- **Executor registry**: backend-service-builder, api-builder, rls-expert, frontend-design-pt-2, e2e-testing, qa-specialist
- **Validation script**: validate-execution-spec.py (update file path only)
- **Context injection**: architecture.context.md, governance.context.md, quality.context.md
- **Gate protocol**: gate-protocol.md UX patterns
- **Skill delegation chain**: lead-architect for scaffolding, domain experts for refinement

---

## References

- GOV-010: Feature Development Gate (`docs/70-governance/FEATURE-DEVELOPMENT-GATE.md`)
- GOV-011: Workflow Optimization Playbook (`docs/70-governance/WORKFLOW-OPTIMIZATION-SCAFFOLD-RFC-ADR-PRD-EXEC.md`)
- SDLC Taxonomy: `docs/patterns/SDLC_DOCS_TAXONOMY.md`
- Current feature-pipeline: `.claude/skills/feature-pipeline/SKILL.md`
- Current prd-pipeline: `.claude/skills/prd-pipeline/SKILL.md`
