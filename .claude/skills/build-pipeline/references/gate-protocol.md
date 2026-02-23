# Gate Approval Protocol

This document specifies the UX and behavior for approval gates in the build pipeline.

---

## Gate Types

### Validation Gates

Run automatically after workstream completion:

| Gate ID | Command | Success Criteria |
|---------|---------|------------------|
| `schema-validation` | `npm run db:types` | Exit 0, types generated |
| `type-check` | `npm run type-check` | Exit 0, no errors |
| `lint` | `npm run lint -- {paths}` | Exit 0, no errors |
| `test-pass` | `npm test {paths}` | All tests pass |
| `build` | `npm run build` | Build succeeds |

### Approval Gates

Require human confirmation before proceeding:

| Gate | When | User Options |
|------|------|--------------|
| `spec-approval` | After EXECUTION-SPEC generation | y/n/edit |
| `phase-approval` | After each execution phase | y/n/inspect |
| `completion-approval` | Before MVP update | y/n/review |

---

## Gate UX Format

### EXECUTION-SPEC Approval

After generating the execution plan:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 EXECUTION-SPEC Generated: {PRD-ID} ({Service Name})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Workstreams:
  WS1: {Name} ({agent})
       → {output1}, {output2}
  WS2: {Name} ({agent}) [depends: WS1]
       → {output1}, {output2}
  ...

Execution Order:
  Phase 1: [{WS1}]           → {gate}
  Phase 2: [{WS2}, {WS3}]    → {gate}, {gate}
  Phase 3: [{WS4}]           → {gate}

External Dependencies:
  - {PRD-XXX}: {Service} (required for: {reason})

Estimated Complexity: {low/medium/high}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Approve execution plan? [y/n/edit]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**User Options**:
- `y` - Proceed with execution
- `n` - Abort pipeline
- `edit` - Modify EXECUTION-SPEC before proceeding

### Phase Completion Approval

After each execution phase completes:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Phase {N} Complete: {Phase Name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Workstreams Completed:
  ✅ WS{N}: {Name}
  ✅ WS{N}: {Name}

Artifacts Created:
  - {file_path_1}
  - {file_path_2}
  - {file_path_3}
  ... ({N} more files)

Validation: ✅ {gate_name} passed
  Command: {command}
  Result: {summary}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Next: Phase {N+1} ({Phase Name})
  - WS{N}: {Description}
  - WS{N}: {Description}

Continue? [y/n/inspect]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**User Options**:
- `y` - Continue to next phase
- `n` - Pause pipeline (can resume later)
- `inspect` - Show detailed file contents for review

### Phase Failure

When a workstream fails:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ Phase {N} Failed: {Phase Name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Failed Workstream: WS{N} ({Name})

Error:
  {error_type}: {error_message}
  Location: {file_path}:{line_number}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Completed Before Failure:
  ✅ WS{N}: {Name}
  ✅ WS{N}: {Name}

Preserved Artifacts:
  - {file_path_1}
  - {file_path_2}

Suggested Fix:
  {actionable_suggestion}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Checkpoint saved. Resume after fix with:
  /build {PRD-ID} --resume

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Pipeline Completion

When all phases complete successfully:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 Pipeline Complete: {PRD-ID} ({Service Name})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Summary:
  Phases Completed: {N}
  Workstreams: {N}
  Files Created: {N}
  Tests Passing: {N}

Artifacts:
  Migration:  {migration_path}
  Service:    services/{domain}/
  Routes:     app/api/v1/{domain}/
  Hooks:      hooks/{domain}/
  Tests:      {N} unit, {N} integration

Validation Gates:
  ✅ schema-validation
  ✅ type-check
  ✅ lint
  ✅ test-pass

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MVP Progress Updated:
  Service: {ServiceName} → implemented
  Phase {N}: {status}
  Completion: {percentage}%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Gate Behavior

### Validation Gate Execution

```python
def run_validation_gate(gate_id: str, paths: list[str]) -> GateResult:
    """
    Execute a validation gate command.

    Returns:
        GateResult with passed/failed status and details
    """
    gate_config = GATES[gate_id]
    command = gate_config.command.format(paths=' '.join(paths))

    result = subprocess.run(command, shell=True, capture_output=True)

    return GateResult(
        gate_id=gate_id,
        passed=result.returncode == 0,
        command=command,
        stdout=result.stdout.decode(),
        stderr=result.stderr.decode(),
        duration_ms=elapsed
    )
```

### Approval Gate Behavior

When an approval gate is reached:

1. **Display gate summary** using format above
2. **Wait for user input** via AskUserQuestion or direct prompt
3. **Process response**:
   - `y` → Continue pipeline
   - `n` → Save checkpoint, exit gracefully
   - `edit` → Open EXECUTION-SPEC for modification
   - `inspect` → Display detailed artifact contents

### Checkpoint Behavior

After each successful approval gate:

1. **Save state** to checkpoint file
2. **Include**:
   - Current phase number
   - Completed workstreams
   - Pending workstreams
   - Artifact paths
   - Timestamp
3. **Location**: `.claude/skills/build-pipeline/checkpoints/{PRD-ID}.json`

---

## Error Categorization

### Recognizable Errors

| Error Type | Pattern | Suggested Fix |
|------------|---------|---------------|
| Type mismatch | `Property 'x' does not exist` | Check DTO field inclusion |
| Import error | `Cannot find module` | Verify path and exports |
| RLS violation | `Row level security` | Check casino_id scoping |
| Lint error | `ESLint:` | Run `npm run lint:fix` |
| Test failure | `Expected X but got Y` | Review test expectations |

### Generic Errors

For unrecognized errors:
1. Display full error output
2. Show relevant file context
3. Suggest manual investigation
4. Preserve checkpoint for resume

---

## Implementation Notes

### AskUserQuestion Integration

For approval gates, use the AskUserQuestion tool:

```typescript
// Example gate approval question
{
  question: "Phase 2 complete. Continue to Phase 3 (Route Handlers)?",
  header: "Phase Gate",
  options: [
    { label: "Continue", description: "Proceed to next phase" },
    { label: "Pause", description: "Save checkpoint and exit" },
    { label: "Inspect", description: "Review created artifacts" }
  ],
  multiSelect: false
}
```

### Console Output

Gate displays use box-drawing characters for visual clarity:
- `━` (U+2501) for horizontal lines
- Standard emoji for status indicators
- Consistent width for alignment
