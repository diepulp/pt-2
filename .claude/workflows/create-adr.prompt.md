---
title: Create Architecture Decision Record (Systematic ADR)
description: Structured ADR creation with sequential thinking and alternatives evaluation
chatmode_sequence:
  - architect # Analysis and ADR creation
  - documenter # Memory update and documentation
validation_gates: 1
estimated_time: 45-90 minutes
version: 1.0.0
last_updated: 2025-10-17
context_files:
  - .claude/memory/architecture-decisions.memory.md
  - .claude/memory/project-context.memory.md
  - docs/adr/*.md
  - docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md
---

# Create ADR Workflow

## Overview

This workflow creates Architecture Decision Records following PT-2 standards with systematic analysis and alternatives evaluation.

**Estimated Time**: 45-90 minutes (analysis → ADR creation → documentation)

**Outcome**: Production-ready ADR with comprehensive rationale and memory updates

---

## Phase 1: Decision Analysis (Architect Mode)

**Chatmode**: `architect.chatmode.md`
**Tools**: Read, Grep, Glob, sequential-thinking MCP
**Output**: Analysis + ADR document

### Step 1.1: Understand Decision Context

**Gather Information**:

1. **Problem Statement**: What decision needs to be made?
2. **Constraints**: What limitations exist (technical, business, time)?
3. **Stakeholders**: Who is affected by this decision?
4. **Current State**: What is the existing approach (if any)?
5. **Success Criteria**: How will we know this decision was correct?

**Load Context**:

```
- Review .claude/memory/architecture-decisions.memory.md
- Review .claude/memory/project-context.memory.md
- Review existing ADRs in docs/adr/
- Review relevant sections of PRD
```

### Step 1.2: Systematic Analysis with Sequential Thinking

**Use**: `mcp__sequential-thinking__sequentialthinking`

**Analysis Framework**:

```
🔍 Sequential Thinking: ADR Analysis

Thought 1: Problem Definition
- What exactly are we deciding?
- Why does this decision matter now?
- What happens if we don't decide?

Thought 2: Current State Assessment
- What is the current approach (if any)?
- What problems does it create?
- What constraints does it impose?

Thought 3: Requirements Gathering
- What are the must-have requirements?
- What are the nice-to-have features?
- What are the non-negotiable constraints?

Thought 4: Option Generation
- What are ALL possible approaches?
- Include both conventional and unconventional options
- Don't pre-filter based on perceived viability

Thought 5: Option Analysis (For Each Option)
- Pros: What are the advantages?
- Cons: What are the disadvantages?
- Risks: What could go wrong?
- Effort: What is the implementation cost?
- Alignment: How well does it fit PT-2?

Thought 6: Comparative Evaluation
- Which option best meets requirements?
- Which option has lowest risk?
- Which option aligns with PT-2 principles?
- What are the key trade-offs?

Thought 7: Recommendation Synthesis
- What is the recommended approach?
- Why is it better than alternatives?
- What are the key trade-offs accepted?
- What mitigations address the downsides?

Thought 8: Validation
- Does this align with existing ADRs?
- Does this align with PRD constraints?
- Does this follow PT-2 architecture patterns?
- Are consequences clearly understood?
```

**Output**: Structured analysis with clear recommendation

### Step 1.3: Generate ADR Number

```bash
# List existing ADRs
ls -1 docs/adr/ | grep '^ADR-' | sort -V | tail -1

# Example output: ADR-003-state-management-strategy.md
# Next number: ADR-004
```

### Step 1.4: Create ADR Document

**Format**: `docs/adr/ADR-{number}-{kebab-case-title}.md`

**Template**:

```markdown
# ADR-{number}: {Title}

**Status**: Proposed | Accepted | Deprecated | Superseded
**Date**: {YYYY-MM-DD}
**Deciders**: {Team/Role}
**Related ADRs**: {list if any}

---

## Context

### Problem Statement

{What decision needs to be made and why?}

### Current State

{What is the existing approach or situation?}

### Constraints

- {Technical constraint 1}
- {Business constraint 2}
- {Time/resource constraint 3}

### Requirements

**Must Have**:

- {Requirement 1}
- {Requirement 2}

**Nice to Have**:

- {Feature 1}
- {Feature 2}

---

## Decision

We will {decision statement}.

### Rationale

{2-3 paragraph explanation of WHY this decision was made}

Key factors:

1. {Factor 1}
2. {Factor 2}
3. {Factor 3}

---

## Alternatives Considered

### Alternative 1: {Name}

**Description**: {Brief explanation}

**Pros**:

- {Advantage 1}
- {Advantage 2}

**Cons**:

- {Disadvantage 1}
- {Disadvantage 2}

**Why Not Chosen**: {Specific reason}

---

### Alternative 2: {Name}

**Description**: {Brief explanation}

**Pros**:

- {Advantage 1}
- {Advantage 2}

**Cons**:

- {Disadvantage 1}
- {Disadvantage 2}

**Why Not Chosen**: {Specific reason}

---

### Alternative 3: {Name} (if applicable)

**Description**: {Brief explanation}

**Pros**:

- {Advantage 1}

**Cons**:

- {Disadvantage 1}

**Why Not Chosen**: {Specific reason}

---

## Consequences

### Positive

- {Benefit 1}
- {Benefit 2}
- {Benefit 3}

### Negative

- {Trade-off 1}
- {Trade-off 2}

### Neutral

- {Change 1 that's neither good nor bad}

### Risks & Mitigations

| Risk     | Likelihood   | Impact       | Mitigation       |
| -------- | ------------ | ------------ | ---------------- |
| {Risk 1} | High/Med/Low | High/Med/Low | {How to address} |
| {Risk 2} | High/Med/Low | High/Med/Low | {How to address} |

---

## Implementation

### Phase 1: {Name} ({Timeframe})

- {Task 1}
- {Task 2}

### Phase 2: {Name} ({Timeframe})

- {Task 3}
- {Task 4}

### Success Criteria

- [ ] {Measurable criterion 1}
- [ ] {Measurable criterion 2}
- [ ] {Measurable criterion 3}

---

## References

- **PRD**: docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md (Section X)
- **Related Patterns**: docs/patterns/{pattern}.md
- **External**: {URL to relevant documentation}

---

## Revision History

| Version | Date   | Changes     | Author |
| ------- | ------ | ----------- | ------ |
| 1.0.0   | {date} | Initial ADR | {name} |

---

**Status**: {Current status}
**Last Updated**: {date}
```

### Step 1.5: VALIDATION GATE 1 - ADR Review

🛑 **STOP: Present ADR for approval**

**Review Format**:

```
🛑 VALIDATION GATE 1: ADR Review

ADR: ADR-{number}-{title}
Status: Proposed

Decision: {Brief decision statement}

Rationale (Key Points):
1. {Factor 1}
2. {Factor 2}
3. {Factor 3}

Alternatives Evaluated: {count}
  1. {Alternative 1} - Rejected because {reason}
  2. {Alternative 2} - Rejected because {reason}
  3. {Chosen approach} - Selected ✅

Consequences:
  Positive: {list key benefits}
  Negative: {list key trade-offs}
  Risks: {list with mitigations}

Implementation:
  Phase 1: {brief description}
  Phase 2: {brief description}

Alignment Check:
  - [x] Follows PT-2 architecture principles
  - [x] Consistent with existing ADRs
  - [x] Addresses PRD requirements
  - [x] Risks have mitigations
  - [x] Implementation plan clear

Questions Before Approval:
1. {Question 1 if any unclear aspects}
2. {Question 2 if any concerns}

Do you approve this ADR? (Reply "approved" to proceed)
```

**User must approve before proceeding to documentation phase.**

---

## Phase 2: Documentation & Memory Update (Documenter Mode)

**Chatmode**: `documenter.chatmode.md`
**Tools**: Read, Write, Edit
**Output**: Updated memory files

### Step 2.1: Update Architecture Decisions Memory

Add to `.claude/memory/architecture-decisions.memory.md`:

```markdown
### ADR-{number}: {Title}

**Date**: {YYYY-MM-DD}
**Status**: {Accepted/Proposed}

**Decision**: {One-sentence summary}

**Rationale**: {2-3 sentence explanation}

**Alternatives Rejected**:

- {Alternative 1}: {Brief reason}
- {Alternative 2}: {Brief reason}

**Key Consequences**:

- {Most important consequence 1}
- {Most important consequence 2}

**Implementation**: {Target phase/timeline}

**Full Document**: docs/adr/ADR-{number}-{title}.md
```

### Step 2.2: Update Related Documentation

If ADR affects specific patterns or processes:

**Example**: ADR about state management → Update relevant UI patterns
**Example**: ADR about service boundaries → Update SERVICE_RESPONSIBILITY_MATRIX

### Step 2.3: Update Phase Status (if applicable)

If ADR represents milestone or unblocks work:

`.claude/memory/phase-status.memory.md`:

```markdown
## Recently Completed

- ✅ ADR-{number}: {Title} ({date})
  - Approved {approach}
  - {count} alternatives evaluated
  - Implementation: {phase/timeline}
```

### Step 2.4: Final Summary

```
✅ ADR CREATION COMPLETE

ADR: ADR-{number}: {Title}
Status: {Approved/Proposed}

Decision: {Brief statement}

Analysis Method: Sequential thinking ({X} thoughts)
Alternatives Evaluated: {count}
Validation: ✅ Approved

Deliverables:
  - ADR Document: docs/adr/ADR-{number}-{title}.md
  - Memory Update: architecture-decisions.memory.md
  - Related Docs: {list if any}

Implementation Next Steps:
  - Phase 1: {brief}
  - Phase 2: {brief}

Cross-References:
  - Related ADRs: {list}
  - Affected Patterns: {list}
```

---

## Final Checklist

Before marking ADR complete:

- [ ] Sequential thinking analysis performed
- [ ] ≥2 alternatives evaluated with rationale
- [ ] Decision clearly stated
- [ ] Rationale explains WHY
- [ ] Consequences (positive + negative) documented
- [ ] Risks identified with mitigations
- [ ] Implementation plan present
- [ ] Success criteria measurable
- [ ] Aligns with PT-2 principles
- [ ] Consistent with existing ADRs
- [ ] ADR approved by user (Gate 1)
- [ ] architecture-decisions.memory.md updated
- [ ] Related documentation updated if needed
- [ ] ADR committed to repo

---

## Common ADR Scenarios

### Scenario 1: Technology Choice ADR

**Example**: "Should we use React Query or SWR for server state?"

**Analysis Focus**:

- Feature comparison
- Performance characteristics
- Developer experience
- Ecosystem maturity
- PT-2 alignment

### Scenario 2: Architecture Pattern ADR

**Example**: "Should we use HORIZONTAL or VERTICAL architecture for feature X?"

**Analysis Focus**:

- Bounded context analysis
- SERVICE_RESPONSIBILITY_MATRIX review
- BALANCED_ARCHITECTURE_QUICK framework
- Over-engineering guardrail check

### Scenario 3: Process/Workflow ADR

**Example**: "How should we handle database migrations?"

**Analysis Focus**:

- Current pain points
- Developer workflow impact
- Type safety implications
- Automation opportunities

### Scenario 4: Reversal ADR

**Example**: "Reverse ADR-002 test location strategy"

**Process**:

1. Create new ADR superseding old one
2. Explain why original decision no longer valid
3. Document new approach
4. Update old ADR status to "Superseded by ADR-XXX"

---

## Troubleshooting

### Cannot Identify Alternatives

**Symptoms**: Only one approach considered
**Action**: Use sequential thinking to brainstorm, research similar projects
**Minimum**: Must have 2 alternatives with clear rejection rationale

### Decision Unclear

**Symptoms**: Rationale weak, multiple interpretations possible
**Action**: Return to problem statement, use sequential thinking
**Goal**: Single sentence decision statement

### Consequences Uncertain

**Symptoms**: Risks not identified, impact unclear
**Action**: Deeper analysis, consult existing ADRs for precedent
**Tool**: Sequential thinking for systematic consequence analysis

### Implementation Plan Missing

**Symptoms**: ADR approved but no clear next steps
**Action**: Break down into phases, assign owners, set deadlines
**Format**: Phased approach with success criteria

---

## Success Metrics

**Quality**:

- Clear decision statement
- ≥2 alternatives with rejection rationale
- Consequences documented (positive + negative)
- Risks identified with mitigations
- Implementation plan with success criteria

**Process**:

- 45-90 minutes total
- Sequential thinking analysis
- 1 validation gate
- Memory auto-updated

**Alignment**:

- Consistent with existing ADRs
- Follows PT-2 principles
- Addresses PRD requirements

---

## Anti-Patterns (DO NOT)

- ❌ Single alternative considered ("no other options")
- ❌ Weak rationale ("seemed like a good idea")
- ❌ Missing consequences section
- ❌ No implementation plan
- ❌ Contradicts existing ADRs without explanation
- ❌ Generic/vague decision statement
- ❌ Risks not identified
- ❌ Alternatives without rejection rationale
- ❌ Skipping sequential thinking for complex decisions

---

## Version History

| Version | Date       | Changes                             |
| ------- | ---------- | ----------------------------------- |
| 1.0.0   | 2025-10-17 | Initial workflow creation (Phase 3) |

---

**Workflow Status**: Production Ready
**Last Updated**: 2025-10-17
**Maintained By**: Agentic Workflow Framework (Phase 3)
