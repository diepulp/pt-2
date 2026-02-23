---
description: Build from any specification document (PRD, EXEC-SPEC, investigation doc) through the automated pipeline
arguments:
  - name: spec-input
    description: >
      PRD identifier (e.g., PRD-003), EXEC-SPEC identifier (e.g., EXEC-003),
      file path to specification document, or --resume to continue from last checkpoint.
---

# Build Pipeline

Execute the specified specification document through the automated implementation pipeline.

## Invocation

```
/build PRD-003
/build PRD-003 --resume
/build EXEC-003
/build docs/issues/perf/INVESTIGATION.md
/build docs/10-prd/PRD-022-feature-name.md
/build --resume
```

## Arguments

- `$ARGUMENTS` - One of:
  - PRD identifier (e.g., `PRD-003`) - resolves to `docs/10-prd/PRD-003*.md`
  - EXEC-SPEC identifier (e.g., `EXEC-003`) - resolves to `docs/21-exec-spec/EXEC-003*.md` (skips generation)
  - File path to specification document
  - `--resume` to continue from last checkpoint

## Input Resolution

```
If $ARGUMENTS == "--resume":
  -> load most recent checkpoint, continue

If $ARGUMENTS matches PRD-XXX:
  -> resolve to docs/10-prd/PRD-XXX*.md
  -> run GOV-010 prerequisite check

If $ARGUMENTS matches EXEC-###:
  -> resolve to docs/21-exec-spec/EXEC-###*.md
  -> skip EXEC-SPEC generation (already exists)

If $ARGUMENTS is a file path:
  -> use directly
  -> run GOV-010 check if it's a PRD
```

## Workflow

This command invokes the `build-pipeline` skill to orchestrate:

1. **GOV-010 Prerequisite Check** - Verify scaffold + ADR refs exist (for PRDs)
2. **EXECUTION-SPEC Generation** - Parse specification, generate workstream plan via lead-architect
3. **Gate Approval** - Review and approve the execution plan
4. **Phased Execution** - Execute workstreams with executor skills
5. **Validation Gates** - Pause after each phase for human review
6. **DoD Validation** - Prove it's done with CI gates
7. **MVP Update** - Record completion in MVPProgressContext

## Supported Input Types

| Input Format | Example | Resolution |
|--------------|---------|------------|
| PRD identifier | `PRD-003` | `docs/10-prd/PRD-003*.md` |
| EXEC-SPEC ID | `EXEC-003` | `docs/21-exec-spec/EXEC-003*.md` |
| PRD file path | `docs/10-prd/PRD-022-feature.md` | Direct path |
| Investigation doc | `docs/issues/perf/INVESTIGATION.md` | Direct path |
| Issue spec | `docs/issues/ISSUE-XXX.md` | Direct path |
| Any spec path | `docs/21-exec-spec/EXEC-003-csv-import.md` | Direct path |

## Behavior

- **GOV-010 check**: For PRD inputs, verifies scaffold and ADR prerequisites
- **Gate approval**: Pauses after each phase for human review
- **Preserve on failure**: Completed artifacts are kept; use `--resume` to continue
- **Parallel execution**: Independent workstreams run in parallel where possible

## Action

**BLOCKING REQUIREMENT: Invoke the `build-pipeline` skill via the Skill tool.**

DO NOT attempt to execute the pipeline logic inline. The `build-pipeline` skill
contains orchestration logic, expert routing, and checkpoint management that
MUST run through the skill's workflow.

**Required tool call:**
```
Skill(skill="build-pipeline", args="$ARGUMENTS")
```

The build-pipeline skill handles GOV-010 checks, gate approvals, expert routing, and checkpoint management.

## References

- Main skill: `.claude/skills/build-pipeline/SKILL.md`
- GOV-010: `docs/70-governance/FEATURE-DEVELOPMENT-GATE.md`
- Checkpoint location: `.claude/skills/build-pipeline/checkpoints/`
