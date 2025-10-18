---
title: Generate Session Handoff (Automated Memory Sync)
description: Auto-generate session handoff from memory with dual output
chatmode_sequence:
  - documenter # Memory analysis and handoff generation
validation_gates: 0
estimated_time: 10-15 minutes
version: 1.0.0
last_updated: 2025-10-17
context_files:
  - .claude/memory/phase-status.memory.md
  - .claude/memory/project-context.memory.md
  - .claude/memory/service-catalog.memory.md
---

# Session Handoff Workflow

## Overview

This workflow generates structured session handoff documents from memory files with automated memory updates.

**Estimated Time**: 10-15 minutes (memory analysis → handoff generation → memory update)

**Outcome**: Formatted SESSION_HANDOFF.md + updated phase-status.memory.md

---

## Phase 1: Memory Analysis & Handoff Generation (Documenter Mode)

**Chatmode**: `documenter.chatmode.md`
**Tools**: Read, Write, Edit
**Output**: SESSION_HANDOFF.md + updated memory

### Step 1.1: Load Current Memory State

```bash
# Read essential memory files
cat .claude/memory/phase-status.memory.md
cat .claude/memory/project-context.memory.md
cat .claude/memory/service-catalog.memory.md
```

**Extract**:

- Current phase and progress %
- Recently completed tasks
- In-progress items
- Known blockers
- Next actions planned

### Step 1.2: Identify Session Outcomes

**Determine**:

1. **What was completed this session?**
   - Services created
   - Migrations applied
   - ADRs written
   - Features implemented
   - Tests added

2. **What changed?**
   - New capabilities
   - Architecture decisions
   - Removed blockers
   - New blockers discovered

3. **What's in progress?**
   - Started but incomplete
   - Partially implemented
   - Needs follow-up

4. **What's next?**
   - Immediate priorities
   - Blocked items waiting on resolution
   - Phase transitions

### Step 1.3: Determine Handoff Location

**Phase-Based Locations**:

- Phase 1: `docs/phases/phase-1/SESSION_HANDOFF.md`
- Phase 2: `docs/phases/phase-2/SESSION_HANDOFF.md`
- Phase 3: `docs/phases/phase-3/SESSION_HANDOFF.md`
- Phase 4: `docs/phases/phase-4/SESSION_HANDOFF.md`

### Step 1.4: Generate Handoff Document

**Template**: Structured SESSION_HANDOFF.md

````markdown
# Session Handoff: {Phase Name}

**Date**: {YYYY-MM-DD}
**Session Duration**: {hours}
**Phase**: {Phase X - Name}
**Overall Progress**: {XX}%

---

## Executive Summary

{2-3 sentence overview of session outcomes and current state}

---

## Current Status

### Phase Progress

- **Phase {X}**: {Description} - {XX}% complete
- **Target**: {Milestone or deliverable}
- **On Track**: ✅ Yes / ⚠️ At Risk / ❌ Delayed

### Key Metrics

| Metric     | Current | Target   | Status     |
| ---------- | ------- | -------- | ---------- |
| {Metric 1} | {Value} | {Target} | {✅/⚠️/❌} |
| {Metric 2} | {Value} | {Target} | {✅/⚠️/❌} |

---

## Completed This Session

### {Category 1: Services/Features/Infrastructure}

✅ **{Item 1}** ({Date})

- {Achievement detail 1}
- {Achievement detail 2}
- Files: {list relevant files}
- Tests: {coverage or count}

✅ **{Item 2}** ({Date})

- {Achievement detail}
- {Impact statement}

### {Category 2: Documentation/ADRs}

✅ **{Item}** ({Date})

- {Description}
- Location: {file path}

### {Category 3: Bug Fixes/Improvements}

✅ **{Item}** ({Date})

- {Issue resolved}
- {Solution applied}

---

## In Progress

### {Task 1}

**Status**: {XX}% complete
**Started**: {Date}
**Target**: {Date or milestone}
**Blocker**: {None / Issue description}

**Remaining Work**:

- [ ] {Subtask 1}
- [ ] {Subtask 2}
- [ ] {Subtask 3}

### {Task 2}

**Status**: {XX}% complete
**Started**: {Date}
**Next Steps**: {Brief description}

---

## Blockers & Issues

### 🚨 Critical

{None / List critical blockers requiring immediate attention}

### ⚠️ Important

**Blocker**: {Description}

- **Impact**: {What is blocked}
- **Resolution Path**: {How to unblock}
- **Owner**: {Who can resolve}
- **Estimated Resolution**: {Timeframe}

### 📝 Minor

{List minor issues or technical debt}

---

## Next Actions (Prioritized)

### Immediate (This Week)

1. **{Action 1}**
   - **Why**: {Rationale}
   - **Effort**: {Hours/days estimate}
   - **Depends On**: {Prerequisites}

2. **{Action 2}**
   - **Why**: {Rationale}
   - **Effort**: {Estimate}

3. **{Action 3}**
   - **Why**: {Rationale}

### Short-Term (Next 2 Weeks)

- {Action 4}
- {Action 5}
- {Action 6}

### Long-Term (This Phase)

- {Action 7}
- {Action 8}

---

## Technical Notes

### Architectural Decisions

- {Decision 1}: {Brief description and rationale}
- {Decision 2}: {Brief description}

### Implementation Details

- {Technical detail worth noting}
- {Pattern established}
- {Gotcha discovered}

### Performance Notes

- {Performance observation}
- {Optimization applied}

### Lessons Learned

- {Learning 1}
- {Learning 2}

---

## Context for Next Session

### Quick Start

```bash
# Commands to get up to speed
{command 1}
{command 2}
```
````

### Files to Review

- `{file1}` - {Why review}
- `{file2}` - {Why review}

### Key References

- {Document 1}: {Why relevant}
- {Document 2}: {Why relevant}

---

## Team Notes

### Cross-Team Dependencies

- {Team/Person}: {Dependency description}

### Questions for Stakeholders

1. {Question 1}
2. {Question 2}

### Decisions Needed

1. {Decision 1}: {Options and recommendation}
2. {Decision 2}: {Context}

---

## Appendix

### Session Statistics

- **Files Modified**: {count}
- **Lines Added**: {count}
- **Lines Removed**: {count}
- **Tests Added**: {count}
- **Test Coverage**: {XX}%
- **Commits**: {count}

### Git References

- **Branch**: {branch name}
- **Latest Commit**: {hash} - {message}
- **Commits This Session**: {list}

---

**Handoff Created**: {YYYY-MM-DD HH:MM}
**Next Session**: {Planned date or "TBD"}
**Document Version**: 1.0.0

````

### Step 1.5: Update phase-status.memory.md

**Sync memory with handoff content**:

```markdown
---
last_updated: {YYYY-MM-DD}
auto_load: true
scope: all_agents
---

# Phase Status Memory

## Current Phase

**Phase**: {X - Name}
**Progress**: {XX}%
**Target Completion**: {Date}
**Status**: {On Track / At Risk / Delayed}

## Recently Completed

- ✅ {Item 1} ({Date})
  - {Brief detail}
- ✅ {Item 2} ({Date})
  - {Brief detail}

## In Progress

- 🔄 {Task 1} ({XX}% complete)
  - Next: {Next step}
- 🔄 {Task 2} ({XX}% complete)
  - Blocker: {Issue if any}

## Blockers

### Critical (🚨)
{None / List}

### Important (⚠️)
- {Blocker 1}: {Resolution path}

## Next Actions (Prioritized)

1. {Action 1}
2. {Action 2}
3. {Action 3}

## Key Decisions This Phase

- {Decision 1}
- {Decision 2}

## Technical Notes

- {Note 1}
- {Note 2}

## Last Session

**Date**: {YYYY-MM-DD}
**Duration**: {hours}
**Handoff**: docs/phases/phase-{X}/SESSION_HANDOFF.md
````

### Step 1.6: Commit Handoff + Memory Update

```bash
# Stage both files
git add docs/phases/phase-{X}/SESSION_HANDOFF.md
git add .claude/memory/phase-status.memory.md

# Commit with structured message
git commit -m "$(cat <<'EOF'
docs(handoff): session handoff for {date}

Session Summary:
- Completed: {list key items}
- In Progress: {list}
- Next: {priorities}

Phase {X} Progress: {XX}%

Files Updated:
- docs/phases/phase-{X}/SESSION_HANDOFF.md
- .claude/memory/phase-status.memory.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Handoff Variants

### Variant 1: End-of-Phase Handoff

**Additional Sections**:

```markdown
## Phase Completion Summary

### Deliverables

- [ ] {Deliverable 1}: {Status}
- [ ] {Deliverable 2}: {Status}

### Success Criteria

- [ ] {Criterion 1}: {Met/Not Met}
- [ ] {Criterion 2}: {Met/Not Met}

### Sign-Off Checklist

- [ ] All phase objectives completed
- [ ] Documentation up to date
- [ ] Tests passing
- [ ] No critical blockers
- [ ] Ready for next phase
```

### Variant 2: Mid-Sprint Handoff

**Focus**: Tactical status, immediate priorities

**Abbreviated Template**:

```markdown
# Quick Handoff: {Date}

## Done Today

- {Item 1}
- {Item 2}

## In Flight

- {Task 1}: {Status}

## Next Up

1. {Action 1}
2. {Action 2}

## Blockers

{None / Brief list}
```

### Variant 3: Emergency Handoff

**Trigger**: Unexpected interruption, critical issue

**Additional Sections**:

```markdown
## Emergency Context

**Issue**: {Critical problem description}
**Impact**: {What is affected}
**Investigation So Far**: {Steps taken}
**Current Hypothesis**: {Best guess at cause}
**Rollback Options**: {How to revert if needed}

## Immediate Actions Required

1. {Urgent action 1}
2. {Urgent action 2}
```

---

## Automation Opportunities

### Trigger-Based Handoff Generation

**Auto-generate when**:

- End of work day (scheduled)
- Phase completion detected
- User requests: `/handoff`, `create handoff`
- Git commit count threshold (e.g., 10+ commits)

### Data Sources for Automation

**Extract from**:

- Git log: commits this session
- Test coverage reports: coverage %
- Memory files: current state
- Todo list: in-progress items
- File changes: git diff --stat

---

## Common Scenarios

### Scenario 1: Standard End-of-Day Handoff

**Trigger**: User requests handoff at session end
**Process**:

1. Load phase-status.memory.md
2. Extract completed items from session
3. Identify in-progress work
4. List next priorities
5. Generate standard handoff
6. Update memory
7. Commit both files

### Scenario 2: Phase Transition Handoff

**Trigger**: Phase completion detected
**Process**:

1. Use end-of-phase variant
2. Add completion summary
3. Check all success criteria
4. Generate sign-off checklist
5. Update memory with phase status
6. Link to next phase kickoff

### Scenario 3: Multi-Day Work Handoff

**Trigger**: Long-running feature spanning sessions
**Process**:

1. Emphasize in-progress section
2. Detail remaining subtasks
3. Note blockers and dependencies
4. Provide detailed context for resumption
5. Link to relevant specifications/ADRs

---

## Final Checklist

Before completing handoff workflow:

- [ ] Current phase status accurate
- [ ] Completed items listed with dates
- [ ] In-progress items with % completion
- [ ] Blockers identified with resolution paths
- [ ] Next actions prioritized (1-2-3 format)
- [ ] Technical notes captured
- [ ] Memory updated to match handoff
- [ ] Both files committed together
- [ ] Descriptive commit message

---

## Success Metrics

**Completeness**:

- All session outcomes documented
- Nothing lost between sessions
- Clear next steps for resumption

**Efficiency**:

- 10-15 minutes to generate
- Automated from memory (no manual recall)
- Dual output (handoff + memory)
- Consistent format every time

**Usefulness**:

- New session starts <2 minutes
- No context loss between sessions
- Clear priorities for next work

---

## Anti-Patterns (DO NOT)

- ❌ Manual handoff writing from memory
- ❌ Incomplete sections ("TBD", "TODO")
- ❌ Vague next actions ("continue work on X")
- ❌ Missing blocker resolution paths
- ❌ Out-of-sync memory file
- ❌ Committing handoff without memory update
- ❌ Generic timestamps (use actual dates/times)
- ❌ Skipping technical notes section

---

## Version History

| Version | Date       | Changes                             |
| ------- | ---------- | ----------------------------------- |
| 1.0.0   | 2025-10-17 | Initial workflow creation (Phase 3) |

---

**Workflow Status**: Production Ready
**Last Updated**: 2025-10-17
**Maintained By**: Agentic Workflow Framework (Phase 3)
