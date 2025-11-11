--- title: Complete Phase (Checklist-Based Sign-Off)
description: Systematic phase completion with quality gates and handoff
chatmode_sequence:
  - reviewer # Quality validation
  - documenter # Sign-off document creation
validation_gates: 1
estimated_time: 60-90 minutes
version: 1.0.0
last_updated: 2025-10-17
context_files:
  - .claude/memory/phase-status.memory.md
  - .claude/memory/project-context.memory.md
  - docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md
---

# Phase Completion Workflow

## Overview

This workflow provides systematic phase completion with quality validation and comprehensive sign-off documentation.

**Estimated Time**: 60-90 minutes (validation → sign-off creation → handoff)

**Outcome**: Phase sign-off document + updated memory + next phase kickoff

---

## Phase 1: Quality Validation (Reviewer Mode)

**Chatmode**: `reviewer.chatmode.md`
**Tools**: Read, Grep, Glob, Bash (read-only)
**Output**: Validation report

### Step 1.1: Load Phase Context

```bash
# Review phase definition
cat docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md | grep -A 50 "Phase {X}"

# Check memory state
cat .claude/memory/phase-status.memory.md

# Review session handoffs
cat docs/phases/phase-{X}/SESSION_HANDOFF*.md
```

### Step 1.2: Deliverables Checklist

**Phase-Specific Deliverables** (from PRD):

```markdown
Phase {X}: {Name}

- [ ] {Deliverable 1}
- [ ] {Deliverable 2}
- [ ] {Deliverable 3}
- [ ] {Deliverable 4}
```

**Verify Each Deliverable**:

```bash
# Example: Verify service exists
test -f services/{service}/index.ts && echo "✅ Service exists" || echo "❌ Missing"

# Example: Verify tests exist with coverage
npm test -- services/{service} --coverage

# Example: Verify documentation exists
test -f docs/services/{service}.md && echo "✅ Documented" || echo "⚠️ Missing docs"
```

### Step 1.3: Quality Gates Validation

**Quality Gate 1: Code Quality**

- [ ] All services follow SERVICE_TEMPLATE_QUICK pattern
- [ ] Zero anti-pattern violations
- [ ] No `console.*` in production code
- [ ] No deprecated code marked `@deprecated`
- [ ] TypeScript strict mode enabled, no `any` types

**Quality Gate 2: Test Coverage**

- [ ] Services ≥80% coverage
- [ ] UI components ≥70% coverage
- [ ] All tests passing
- [ ] Integration tests exist for critical paths
- [ ] Schema verification test passing (if DB changes)

**Quality Gate 3: Type Safety**

- [ ] Database types current (`npm run db:types` executed after migrations)
- [ ] No manual type redefinitions
- [ ] SupabaseClient<Database> typing throughout
- [ ] Explicit interfaces (no ReturnType inference)

**Quality Gate 4: Documentation**

- [ ] Service catalog updated
- [ ] SERVICE_RESPONSIBILITY_MATRIX current
- [ ] ADRs created for architectural decisions
- [ ] Memory files updated
- [ ] Session handoffs current

**Quality Gate 5: Architecture Compliance**

- [ ] Follows BALANCED_ARCHITECTURE_QUICK principles
- [ ] Bounded contexts clear and non-overlapping
- [ ] Over-engineering guardrail respected
- [ ] No premature abstractions

### Step 1.4: Run Comprehensive Tests

```bash
# Full test suite
npm test

# Type check
npm run type-check

# Linting
npm run lint

# Build verification
npm run build
```

### Step 1.5: VALIDATION GATE 1 - Phase Readiness Review

🛑 **STOP: Present validation report**

**Report Format**:

```
🛑 VALIDATION GATE 1: Phase {X} Readiness Review

Phase: {X - Name}
Target Completion: {Date}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DELIVERABLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ {Deliverable 1}
   - {Evidence}
   - Location: {path}

✅ {Deliverable 2}
   - {Evidence}
   - Location: {path}

❌ {Deliverable 3} - INCOMPLETE
   - Issue: {Description}
   - Action: {What needs to be done}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUALITY GATES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Gate 1: Code Quality
  - [x] Service patterns: ✅ PASS
  - [x] Anti-patterns: ✅ ZERO violations
  - [x] No console.*: ✅ PASS
  - [x] Type safety: ✅ PASS

Gate 2: Test Coverage
  - [x] Services: 92% (≥80%) ✅
  - [x] UI: 78% (≥70%) ✅
  - [x] All passing: ✅ {X}/{X} tests
  - [x] Integration: ✅ PASS

Gate 3: Type Safety
  - [x] DB types current: ✅ PASS
  - [x] No manual types: ✅ PASS
  - [x] Explicit interfaces: ✅ PASS

Gate 4: Documentation
  - [x] Service catalog: ✅ CURRENT
  - [x] ADRs created: ✅ {count} ADRs
  - [x] Memory updated: ✅ SYNCED

Gate 5: Architecture
  - [x] Balanced architecture: ✅ PASS
  - [x] Bounded contexts: ✅ CLEAR
  - [x] No over-engineering: ✅ PASS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEST RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Test Suites: {X} passed, {X} total
Tests:       {X} passed, {X} total
Coverage:
  Lines:      XX% ✅
  Branches:   XX% ✅
  Functions:  XX% ✅

Build:       ✅ SUCCESS
Type Check:  ✅ PASS
Lint:        ✅ PASS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCKERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Critical (🚨): {None / List}
Important (⚠️): {None / List}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
READINESS ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Deliverables Complete: {X}/{Y} (XX%)
Quality Gates Passed:  {X}/{5}
Blockers:              {count} critical, {count} important

Overall Status: ✅ READY / ⚠️ AT RISK / ❌ NOT READY

Recommendation: {Proceed to sign-off / Address blockers first}

If not ready, complete the following before sign-off:
1. {Action 1}
2. {Action 2}

Ready to proceed with phase completion? (Reply "proceed" if ready)
```

**User must approve before proceeding to sign-off creation.**

---

## Phase 2: Sign-Off Document Creation (Documenter Mode)

**Chatmode**: `documenter.chatmode.md`
**Tools**: Read, Write, Edit
**Output**: Phase sign-off document

### Step 2.1: Create Sign-Off Document

**Location**: `docs/phases/phase-{X}/PHASE_{X}_SIGNOFF.md`

**Template**:

```markdown
# Phase {X}: {Name} - Completion Sign-Off

**Date**: {YYYY-MM-DD}
**Phase**: {X - Name}
**Status**: ✅ **COMPLETE** / ⚠️ **COMPLETE WITH EXCEPTIONS** / ❌ **INCOMPLETE**
**Duration**: {weeks/months}

---

## Executive Summary

{2-3 paragraph summary of phase outcomes, key achievements, and overall success}

**Key Achievement**: {Most important outcome}

---

## Objectives & Outcomes

### Primary Objective ✅/❌

{Objective description}

**Result**: {Outcome}

### Secondary Objectives ✅/❌

- ✅ {Objective 1}: {Outcome}
- ✅ {Objective 2}: {Outcome}
- ⚠️ {Objective 3}: {Outcome with caveat}
- ❌ {Objective 4}: {Not achieved, explanation}

---

## Deliverables

### {Category 1: Services/Features}

**Delivered**:

1. ✅ **{Deliverable 1}**
   - Location: {path}
   - Tests: {coverage}
   - Documentation: {link}
   - Status: Production ready

2. ✅ **{Deliverable 2}**
   - Location: {path}
   - Tests: {coverage}
   - Status: Production ready

**Deferred**:

- ⏸️ **{Deliverable X}**: {Reason for deferral}

### {Category 2: Documentation}

**Delivered**:

- ✅ {Document 1}: {link}
- ✅ {Document 2}: {link}

### {Category 3: Infrastructure}

**Delivered**:

- ✅ {Infrastructure item 1}
- ✅ {Infrastructure item 2}

---

## Metrics & Validation

### Deliverable Completion

- **Planned**: {count}
- **Delivered**: {count}
- **Deferred**: {count}
- **Completion Rate**: {XX}%

### Quality Metrics

| Metric                   | Target | Actual  | Status |
| ------------------------ | ------ | ------- | ------ |
| Test Coverage (Services) | ≥80%   | XX%     | ✅/❌  |
| Test Coverage (UI)       | ≥70%   | XX%     | ✅/❌  |
| Anti-Pattern Violations  | 0      | {count} | ✅/❌  |
| Type Safety              | 100%   | XX%     | ✅/❌  |
| Documentation Current    | 100%   | XX%     | ✅/❌  |

### Quality Gates

| Gate | Criterion                  | Status |
| ---- | -------------------------- | ------ |
| 1    | Code quality standards met | ✅/❌  |
| 2    | Test coverage targets met  | ✅/❌  |
| 3    | Type safety validated      | ✅/❌  |
| 4    | Documentation complete     | ✅/❌  |
| 5    | Architecture compliance    | ✅/❌  |

**Total**: {X}/5 gates passed ({XX}%)

---

## Success Criteria Met

✅ **{Criterion 1}**: {Evidence}
✅ **{Criterion 2}**: {Evidence}
✅ **{Criterion 3}**: {Evidence}
❌ **{Criterion 4}**: {Reason not met}

**Overall Assessment**: ✅ **MEETS EXPECTATIONS** / ⚠️ **PARTIAL** / ❌ **DOES NOT MEET**

---

## Key Achievements

1. **{Achievement 1}**
   - {Detail}
   - {Impact}

2. **{Achievement 2}**
   - {Detail}
   - {Impact}

3. **{Achievement 3}**
   - {Detail}
   - {Impact}

---

## Challenges & Solutions

### {Challenge 1}

**Issue**: {Description}
**Impact**: {Effect on timeline/quality}
**Solution**: {How addressed}
**Outcome**: {Result}

### {Challenge 2}

**Issue**: {Description}
**Solution**: {How addressed}

---

## Technical Debt

### Intentional Debt (Planned)

- {Debt 1}: {Reason and plan to address}
- {Debt 2}: {Reason and plan to address}

### Unintentional Debt (Discovered)

- {Debt 1}: {Priority and plan}
- {Debt 2}: {Priority and plan}

---

## Files Modified/Created

### New Files ({count} total)
```

{Category 1}:

1. {file path} ({lines} lines)
2. {file path} ({lines} lines)

{Category 2}:

1. {file path} ({lines} lines)

```

### Modified Files ({count} total)
- {file path}: {description of changes}
- {file path}: {description of changes}

---

## Lessons Learned

### What Went Well ✅
1. {Success factor 1}
2. {Success factor 2}
3. {Success factor 3}

### What Could Be Improved ⚠️
1. {Improvement area 1}
2. {Improvement area 2}

### Process Improvements for Next Phase
1. {Improvement 1}
2. {Improvement 2}

---

## Next Steps

### Immediate (Before Phase {X+1} Start)
1. {Action 1}
2. {Action 2}
3. {Action 3}

### Phase {X+1} Preparation
- **Phase Name**: {Name}
- **Target Start**: {Date}
- **Prerequisites**: {What must be done first}
- **Key Objectives**: {Brief list}

### Handoff Items
- {Item 1}: {Who owns, what needs to happen}
- {Item 2}: {Who owns, what needs to happen}

---

## Team Sign-Off

**Phase {X} Status**: ✅ **APPROVED - PRODUCTION READY** / ⚠️ **CONDITIONAL APPROVAL** / ❌ **NOT APPROVED**

**Approved By**: {Team/Role}
**Date**: {YYYY-MM-DD}
**Next Phase**: {Phase X+1 - Name}

**Blocking Issues**: {None / List}
**Risks**: {None / List with mitigation}
**Confidence Level**: {High / Medium / Low}

**Recommendation**: {Proceed to next phase / Address issues first / Other}

---

**Document Status**: Final
**Last Updated**: {YYYY-MM-DD}
**Version**: 1.0.0
**Sign-Off**: {Complete / Pending}

---

## References

- **Phase Definition**: docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md (Phase {X})
- **Session Handoffs**: docs/phases/phase-{X}/SESSION_HANDOFF*.md
- **Memory Files**: .claude/memory/phase-status.memory.md
- **Quality Standards**: docs/patterns/*

---

**END OF PHASE {X} SIGN-OFF**
```

### Step 2.2: Update Memory Files

**Update phase-status.memory.md**:

```markdown
## Current Phase

**Phase**: {X+1 - Name}
**Progress**: 0%
**Started**: {Date}
**Previous Phase**: {X - Name} (✅ COMPLETE)

## Phase {X} Completion ({Date})

**Status**: ✅ Complete
**Duration**: {weeks}
**Deliverables**: {X}/{Y} delivered
**Quality Gates**: {X}/5 passed
**Sign-Off**: docs/phases/phase-{X}/PHASE\_{X}\_SIGNOFF.md
```

**Update project-context.memory.md**:

```markdown
## Current Phase

- **Phase**: {X+1 - Name}
- **Status**: {XX}% complete
- **Previous**: Phase {X} completed {date}
```

### Step 2.3: Create Next Phase Kickoff (Optional)

If transitioning to next phase, create kickoff document:

**Location**: `docs/phases/phase-{X+1}/KICKOFF.md`

```markdown
# Phase {X+1}: {Name} - Kickoff

**Start Date**: {YYYY-MM-DD}
**Target Completion**: {YYYY-MM-DD}
**Previous Phase**: Phase {X} (✅ Complete)

## Objectives

### Primary

{Objective}

### Secondary

- {Objective 1}
- {Objective 2}

## Deliverables

1. {Deliverable 1}
2. {Deliverable 2}
3. {Deliverable 3}

## Success Criteria

- [ ] {Criterion 1}
- [ ] {Criterion 2}
- [ ] {Criterion 3}

## Prerequisites (from Phase {X})

- [x] {Prerequisite 1} ✅
- [x] {Prerequisite 2} ✅

## First Actions

1. {Action 1}
2. {Action 2}
3. {Action 3}

---

**Status**: Ready to Begin
```

### Step 2.4: Commit Sign-Off + Memory Updates

```bash
# Stage all phase completion files
git add docs/phases/phase-{X}/PHASE_{X}_SIGNOFF.md
git add .claude/memory/phase-status.memory.md
git add .claude/memory/project-context.memory.md
git add docs/phases/phase-{X+1}/KICKOFF.md

# Commit with comprehensive message
git commit -m "$(cat <<'EOF'
docs(phase): Phase {X} completion sign-off

Phase: {X - Name}
Status: ✅ COMPLETE
Duration: {weeks}

Deliverables: {X}/{Y} ({XX}%)
Quality Gates: {X}/5 passed
Test Coverage: XX%

Key Achievements:
- {Achievement 1}
- {Achievement 2}
- {Achievement 3}

Next Phase: {X+1 - Name}
Target Start: {date}

Files:
- docs/phases/phase-{X}/PHASE_{X}_SIGNOFF.md
- .claude/memory/phase-status.memory.md
- docs/phases/phase-{X+1}/KICKOFF.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Final Checklist

Before marking phase complete:

- [ ] All deliverables completed or deferred with rationale
- [ ] 5/5 quality gates passed (or exceptions documented)
- [ ] Test coverage meets targets
- [ ] Zero critical blockers
- [ ] Documentation complete and current
- [ ] Memory files updated
- [ ] Sign-off document created
- [ ] Validation gate passed (Gate 1)
- [ ] Next phase kickoff created
- [ ] All files committed
- [ ] Team approval obtained

---

## Success Metrics

**Completeness**:

- All phase objectives addressed
- Deliverables documented with evidence
- Quality gates validated
- Lessons learned captured

**Quality**:

- Systematic validation process
- Evidence-based assessment
- Clear readiness criteria
- Transparent gaps/exceptions

**Efficiency**:

- 60-90 minutes for sign-off process
- Automated validation checks
- Structured documentation
- Clear next phase transition

---

## Anti-Patterns (DO NOT)

- ❌ Skipping quality gate validation
- ❌ Missing deliverables without explanation
- ❌ Vague success criteria ("mostly done")
- ❌ Ignoring technical debt
- ❌ Incomplete lessons learned
- ❌ Missing next phase preparation
- ❌ Sign-off without user approval
- ❌ Memory files out of sync with sign-off

---

## Version History

| Version | Date       | Changes                             |
| ------- | ---------- | ----------------------------------- |
| 1.0.0   | 2025-10-17 | Initial workflow creation (Phase 3) |

---

**Workflow Status**: Production Ready
**Last Updated**: 2025-10-17
**Maintained By**: Agentic Workflow Framework (Phase 3)
