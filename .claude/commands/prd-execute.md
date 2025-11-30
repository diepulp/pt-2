---
description: Execute a PRD through the automated pipeline with gate approvals
arguments:
  - name: prd-id
    description: PRD identifier (e.g., PRD-003) or --resume to continue from last gate
---

# PRD Execution Pipeline

Execute the specified PRD through the automated implementation pipeline.

## Invocation

```
/prd-execute PRD-003
/prd-execute PRD-003 --resume
```

## Workflow

This command invokes the `prd-pipeline` skill to orchestrate:

1. **EXECUTION-SPEC Generation** - Parse PRD, generate workstream plan via lead-architect
2. **Gate Approval** - Review and approve the execution plan
3. **Phased Execution** - Execute workstreams with capability agents
4. **Validation Gates** - Pause after each phase for human review
5. **MVP Update** - Record completion in MVPProgressContext

## Arguments

- `$ARGUMENTS` - PRD identifier (e.g., `PRD-003`) or `--resume` to continue

## Behavior

- **Gate approval**: Pauses after each phase for human review
- **Preserve on failure**: Completed artifacts are kept; use `--resume` to continue
- **Parallel execution**: Independent workstreams run in parallel where possible

## Action

Invoke the `prd-pipeline` skill with the provided PRD identifier:

```
Use the prd-pipeline skill to execute $ARGUMENTS through the implementation pipeline.

If $ARGUMENTS is "--resume", continue from the last saved checkpoint.
Otherwise, treat $ARGUMENTS as a PRD identifier and begin fresh execution.

Follow the gate approval protocol - pause after each phase for human review.
Preserve all artifacts on failure to allow manual fix and resume.
```
