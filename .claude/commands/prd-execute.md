---
description: Execute a PRD or specification document through the automated pipeline with gate approvals
arguments:
  - name: spec-input
    description: >
      PRD identifier (e.g., PRD-003), file path to specification document
      (e.g., docs/issues/perf/INVESTIGATION.md), or --resume to continue from last gate.
      Accepts PRDs, investigation docs, issue specs, or any implementation specification.
---

# PRD Execution Pipeline

Execute the specified PRD or specification document through the automated implementation pipeline.

## Invocation

```
/prd-execute PRD-003
/prd-execute PRD-003 --resume
/prd-execute docs/issues/perf/PIT_DASHBOARD_DATA_FLOW_INVESTIGATION.md
/prd-execute docs/10-prd/PRD-022-player-360-navigation.md
```

## Workflow

This command invokes the `prd-pipeline` skill to orchestrate:

1. **EXECUTION-SPEC Generation** - Parse specification document, generate workstream plan via lead-architect
2. **Gate Approval** - Review and approve the execution plan
3. **Phased Execution** - Execute workstreams with capability agents (Skills)
4. **Validation Gates** - Pause after each phase for human review
5. **MVP Update** - Record completion in MVPProgressContext

## Arguments

- `$ARGUMENTS` - One of:
  - PRD identifier (e.g., `PRD-003`) - resolves to `docs/10-prd/PRD-003*.md`
  - File path to specification document (e.g., `docs/issues/perf/INVESTIGATION.md`)
  - `--resume` to continue from last checkpoint

## Supported Input Types

| Input Format | Example | Resolution |
|--------------|---------|------------|
| PRD identifier | `PRD-003` | `docs/10-prd/PRD-003*.md` |
| Investigation doc | `docs/issues/perf/INVESTIGATION.md` | Direct path |
| Issue spec | `docs/issues/ISSUE-XXX.md` | Direct path |
| EXEC-SPEC | `EXEC-SPEC-022` | `docs/20-architecture/specs/*/EXEC-SPEC-022.md` |

## Behavior

- **Gate approval**: Pauses after each phase for human review
- **Preserve on failure**: Completed artifacts are kept; use `--resume` to continue
- **Parallel execution**: Independent workstreams run in parallel where possible

## Action

Invoke the `prd-pipeline` skill with the provided specification input:

```
Use the prd-pipeline skill to execute $ARGUMENTS through the implementation pipeline.

If $ARGUMENTS is "--resume", continue from the last saved checkpoint.

If $ARGUMENTS is a file path (contains "/" or ends with ".md"):
  - Use the file path directly as the specification document
  - Extract spec ID from filename for checkpoint naming

If $ARGUMENTS matches PRD-XXX pattern:
  - Resolve to docs/10-prd/PRD-XXX*.md

If $ARGUMENTS matches EXEC-SPEC-XXX pattern:
  - Resolve to docs/20-architecture/specs/*/EXEC-SPEC-XXX.md

Follow the gate approval protocol - pause after each phase for human review.
Preserve all artifacts on failure to allow manual fix and resume.
```
