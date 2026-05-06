---
description: Run validation for a specific feature pipeline gate
arguments:
  - name: gate-name
    description: Gate to validate (srm-ownership, brief-approved, prd-approved, sec-approved, adr-frozen, dod-executable, implementation-complete)
---

# Feature Gate Validation

Run validation checks for a specific gate in the feature pipeline.

## Invocation

```
/feature-gate srm-ownership
/feature-gate dod-executable
/feature-gate implementation-complete
```

## Arguments

- `$ARGUMENTS` - Gate name to validate

## Valid Gates

| Gate | Phase | Validation |
|------|-------|------------|
| `srm-ownership` | 0 | Ownership sentence exists and references SRM |
| `brief-approved` | 1 | Feature Brief has 5+ non-goals |
| `prd-approved` | 2 | PRD has testable acceptance criteria |
| `sec-approved` | 3 | SEC note covers assets/threats/controls |
| `adr-frozen` | 4 | ADR contains only durable decisions |
| `dod-executable` | 5 | Every acceptance criterion has a CI command |
| `implementation-complete` | 6 | All DoD gates pass in CI |

## Action

Execute the following workflow for `$ARGUMENTS`:

### Step 1: Load Active Feature

Find the most recent feature checkpoint from `.claude/skills/feature-pipeline/checkpoints/`

If no checkpoint found:
- Display: "No active feature pipeline. Use `/feature-start <name>` to begin."
- Exit

### Step 2: Validate Gate

#### Gate: srm-ownership

Check `FEATURE_BOUNDARY.md`:
- [ ] Ownership sentence is present
- [ ] Owning service(s) are identified
- [ ] Tables/RPCs modified are listed
- [ ] Cross-context contracts are specified
- [ ] References SRM document

#### Gate: brief-approved

Check `FEATURE_BRIEF.md`:
- [ ] Goal statement is present
- [ ] Primary actor is identified
- [ ] Primary scenario is defined
- [ ] Non-goals section has 5+ items
- [ ] Bounded context matches Feature Boundary
- [ ] Success metric is defined

#### Gate: prd-approved

Check PRD document:
- [ ] User flows documented (happy path + unhappy paths)
- [ ] Acceptance criteria are testable statements
- [ ] Out of scope section present
- [ ] Data classification defined

#### Gate: sec-approved

Check SEC note:
- [ ] Assets section lists what must be protected
- [ ] Threats section enumerates attack vectors
- [ ] Controls section lists mitigations
- [ ] Deferred risks are explicitly documented

#### Gate: adr-frozen

Check ADR:
- [ ] Contains only durable decisions (no implementation SQL)
- [ ] Security invariants defined
- [ ] Alternatives considered documented
- [ ] EXEC-SPEC and DoD files exist separately

#### Gate: dod-executable

Check DoD file:
- [ ] Every functional criterion has a test file and CI command
- [ ] Every security criterion has a test file and CI command
- [ ] Critical gates are marked
- [ ] CI integration command is runnable

```bash
# Test that DoD gates are executable
npm test -- -t "{feature-pattern}"
```

#### Gate: implementation-complete

Run all DoD gates:
```bash
# Execute all CI commands from DoD file
npm run type-check
npm run lint
npm test -- -t "{feature-pattern}"
npm run build
```

All must pass for gate to be approved.

### Step 3: Present Results

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gate Validation: $ARGUMENTS
Feature: {feature_id}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Checks:
  ✅ {check_1}
  ✅ {check_2}
  ❌ {check_3} - {reason}
  ⚠️ {check_4} - {warning}

Result: {PASS | FAIL}

{If PASS}
Gate approved. Run `/feature-resume` to continue to next phase.

{If FAIL}
Fix the issues above and run `/feature-gate $ARGUMENTS` again.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 4: Update Checkpoint (on PASS)

If validation passes:
1. Add gate to `gates_passed`
2. Remove from `gates_pending`
3. Update timestamp

## References

- Main skill: `.claude/skills/feature-pipeline/SKILL.md`
- Gate definitions: `.claude/skills/feature-pipeline/commands.yaml`
