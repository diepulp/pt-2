--- title: Workflow Prompt Template & Creation Guide
description: Comprehensive guide for creating new workflow prompts following PT-2 patterns
validation_gates: 0
estimated_time: N/A (template reference)
version: 1.0.0
last_updated: 2025-10-17
---

# Workflow Prompt Template & Creation Guide

## What is a Workflow Prompt?

A **workflow prompt** is a structured, reusable procedure that orchestrates chatmode sequences with validation gates to achieve deterministic, high-quality outcomes.

**Purpose**: Transform ad-hoc operations into systematic workflows

**Benefits**:

- **Repeatability**: Same process every time, consistent quality
- **Validation**: Built-in checkpoints prevent bad outcomes
- **Automation**: Memory updates, documentation generation
- **Efficiency**: 30-50% time reduction vs ad-hoc
- **Clarity**: Explicit chatmode boundaries and handoffs

---

## Workflow Anatomy

### YAML Frontmatter (Required)

```yaml
---
title: { Workflow Name (Action-Oriented) }
description: { One-sentence purpose and outcome }
chatmode_sequence:
  - { chatmode1 } # Phase 1 owner
  - { chatmode2 } # Phase 2 owner
validation_gates: { number }
estimated_time: { time range }
version: { semver }
last_updated: { YYYY-MM-DD }
context_files:
  - { memory or doc file 1 }
  - { memory or doc file 2 }
---
```

**Field Descriptions**:

- `title`: Action verb + noun (e.g., "Create Service", "Write Migration")
- `description`: What this workflow does and what it produces
- `chatmode_sequence`: Ordered list of chatmodes used
- `validation_gates`: Number of human approval checkpoints
- `estimated_time`: Realistic time range for completion
- `version`: Semantic versioning (1.0.0, 1.1.0, 2.0.0)
- `last_updated`: Date of last significant change
- `context_files`: Auto-loaded memory/docs for this workflow

### Workflow Structure (Recommended)

```markdown
# {Title}

## Overview

{Purpose, time estimate, expected outcome}

---

## Phase 1: {Name} ({Chatmode} Mode)

**Chatmode**: {chatmode}.chatmode.md
**Tools**: {List allowed tools}
**Output**: {Deliverables}

### Step 1.1: {Action}

{Instructions}

### Step 1.2: {Action}

{Instructions}

### Step 1.X: VALIDATION GATE X - {Gate Purpose}

🛑 **STOP: {What to present}**

{Checklist or review format}

**User must approve before proceeding.**

---

## Phase 2: {Name} ({Chatmode} Mode)

...

---

## Final Checklist

{Completion criteria}

---

## Success Metrics

{Quality/efficiency/outcomes}

---

## Troubleshooting

{Common issues and solutions}

---

## Anti-Patterns (DO NOT)

{Forbidden practices}

---

## Version History

{Change log table}
```

---

## Component Guidelines

### 1. Overview Section

**Purpose**: Set context and expectations

**Template**:

```markdown
## Overview

This workflow {purpose description}.

**Estimated Time**: {X-Y minutes/hours} ({phase breakdown})

**Outcome**: {Concrete deliverables}
```

**Example**:

```markdown
## Overview

This workflow creates database migrations following PT-2 standards with automated type regeneration.

**Estimated Time**: 30-60 minutes (migration creation → type gen → validation)

**Outcome**: Production-ready migration + regenerated types + passing schema verification
```

---

### 2. Phase Sections

**Structure**:

```markdown
## Phase {X}: {Name} ({Chatmode} Mode)

**Chatmode**: {chatmode}.chatmode.md
**Tools**: {Tool list}
**Input**: {Prerequisites}
**Output**: {Deliverables}

### Step {X}.{Y}: {Action}

{Detailed instructions}
```

**Best Practices**:

- ✅ Clear chatmode specification
- ✅ Explicit tool restrictions
- ✅ Input dependencies stated
- ✅ Output deliverables defined
- ✅ Steps numbered hierarchically (X.Y format)
- ✅ Action-oriented step names

**Anti-Patterns**:

- ❌ Vague phase names ("Do stuff")
- ❌ Missing chatmode specification
- ❌ Ambiguous steps
- ❌ No output defined

---

### 3. Validation Gates

**Purpose**: Human approval checkpoints to prevent bad outcomes

**Format**:

```markdown
### Step {X}.{Y}: VALIDATION GATE {N} - {Gate Purpose}

🛑 **STOP: {What to present}**

**Checklist**:
```

{Structured checklist or review format}

```

**User must explicitly approve before proceeding to Phase {X+1}.**
```

**Gate Types**:

**Type 1: Design Review** (Before implementation)

```
Purpose: Validate approach before building
When: After design/specification creation
Format: Design summary + alternatives + risks
Example: create-service.prompt.md Gate 1
```

**Type 2: Implementation Review** (Before testing)

```
Purpose: Validate code quality before proceeding
When: After implementation, before tests
Format: Files created + anti-pattern check + type safety
Example: create-service.prompt.md Gate 2
```

**Type 3: Quality Review** (Before deployment/finalization)

```
Purpose: Validate outcomes meet criteria
When: After testing, before documentation
Format: Test results + coverage + integration check
Example: create-service.prompt.md Gate 3
```

**Best Practices**:

- ✅ Clear gate purpose
- ✅ Structured review format
- ✅ Explicit approval requirement
- ✅ Actionable if gate fails

**Anti-Patterns**:

- ❌ Vague approval criteria
- ❌ No explicit stop point
- ❌ Missing failure recovery path

---

### 4. Final Checklist

**Purpose**: Comprehensive completion verification

**Template**:

```markdown
## Final Checklist

Before marking {workflow} complete:

- [ ] {Completion criterion 1}
- [ ] {Completion criterion 2}
- [ ] {Completion criterion 3}
- [ ] All validation gates passed
- [ ] Memory files updated
- [ ] Documentation current
- [ ] Changes committed
```

**Best Practices**:

- ✅ Measurable criteria
- ✅ Covers all deliverables
- ✅ Includes memory updates
- ✅ Requires documentation

---

### 5. Success Metrics

**Purpose**: Define what success looks like

**Template**:

```markdown
## Success Metrics

**Quality**:

- {Quality metric 1}
- {Quality metric 2}

**Efficiency**:

- {Time/effort metric}
- {Automation metric}

**Documentation**:

- {Doc completeness metric}
```

**Example**:

```markdown
## Success Metrics

**Quality**:

- Zero anti-pattern violations
- Test coverage ≥80%
- All validation gates passed

**Efficiency**:

- 2-4 hours total (vs 4-6 hours ad-hoc)
- 3 human approval checkpoints (vs continuous review)

**Documentation**:

- Memory files auto-updated
- No manual documentation debt
```

---

### 6. Troubleshooting

**Purpose**: Common failure modes and recovery paths

**Template**:

```markdown
## Troubleshooting

### {Issue Name}

**Symptoms**: {How to recognize}
**Causes**:

- {Cause 1}
- {Cause 2}

**Actions**:

1. {Recovery step 1}
2. {Recovery step 2}
```

**Best Practices**:

- ✅ Focus on most common issues
- ✅ Clear diagnostic symptoms
- ✅ Actionable recovery steps
- ✅ Escalation path if needed

---

### 7. Anti-Patterns

**Purpose**: Explicitly forbid bad practices

**Template**:

```markdown
## Anti-Patterns (DO NOT)

- ❌ {Bad practice 1}: {Why forbidden}
- ❌ {Bad practice 2}: {Why forbidden}
- ❌ {Bad practice 3}: {Why forbidden}
```

**Best Practices**:

- ✅ Specific, not general
- ✅ Rationale provided
- ✅ Aligned with PT-2 standards

---

## Workflow Creation Process

### Step 1: Identify Need

**When to create a workflow prompt**:

- ✅ Operation performed ≥3 times
- ✅ Multi-step process prone to errors
- ✅ Requires validation checkpoints
- ✅ Benefits from automation
- ✅ Needs consistent quality

**When NOT to create**:

- ❌ Simple single-step tasks
- ❌ Highly variable operations
- ❌ Already well-automated

### Step 2: Define Scope

**Questions**:

1. What is the purpose of this workflow?
2. What are the inputs?
3. What are the outputs?
4. What chatmodes are involved?
5. Where do validation gates belong?

### Step 3: Map Chatmode Sequence

**Example**: Create Service Workflow

```
User Request → Architect (Design) → Service Engineer (Impl)
  → Service Engineer (Test) → Documenter (Docs)

Gates:
  - Gate 1: After design (architect output)
  - Gate 2: After implementation (engineer output)
  - Gate 3: After testing (engineer output)
```

### Step 4: Design Validation Gates

**For each phase, ask**:

- Should user approve before proceeding?
- What are the failure modes?
- What evidence proves quality?

**Gate placement**:

- Before expensive operations (implementation, testing)
- After irreversible decisions (design approval)
- Before phase transitions (handoff points)

### Step 5: Write Workflow Document

Use this template structure:

1. YAML frontmatter
2. Overview
3. Phase sections with steps
4. Validation gates
5. Final checklist
6. Success metrics
7. Troubleshooting
8. Anti-patterns
9. Version history

### Step 6: Test Workflow

**Validation**:

- [ ] Execute workflow end-to-end
- [ ] Verify chatmode transitions work
- [ ] Confirm validation gates trigger
- [ ] Check memory updates occur
- [ ] Validate documentation generated

### Step 7: Document & Commit

```bash
git add .claude/workflows/{workflow}.prompt.md
git commit -m "feat(workflow): add {workflow} systematic workflow"
```

---

## Common Workflow Patterns

### Pattern 1: Creation Workflows

**Purpose**: Create new artifact (service, migration, ADR)

**Structure**:

```
Phase 1: Design/Planning (Architect)
  Gate 1: Design Review
Phase 2: Implementation (Engineer)
  Gate 2: Implementation Review
Phase 3: Validation (Engineer/Reviewer)
  Gate 3: Quality Review
Phase 4: Documentation (Documenter)
```

**Examples**:

- create-service.prompt.md
- write-migration.prompt.md
- create-adr.prompt.md

---

### Pattern 2: Automation Workflows

**Purpose**: Automate repetitive documentation

**Structure**:

```
Phase 1: Data Gathering (Documenter)
Phase 2: Document Generation (Documenter)
Phase 3: Memory Update (Documenter)
```

**Examples**:

- session-handoff.prompt.md

---

### Pattern 3: Validation Workflows

**Purpose**: Systematic quality verification

**Structure**:

```
Phase 1: Validation (Reviewer)
  Gate 1: Readiness Review
Phase 2: Documentation (Documenter)
```

**Examples**:

- phase-completion.prompt.md

---

### Pattern 4: Orchestration Workflows

**Purpose**: Coordinate multi-chatmode sequences

**Structure**:

```
Phase 1: Coordinator identifies subtasks
Phase 2: Spawn specialized chatmodes for each subtask
Phase 3: Aggregate results
```

**Future Example**:

- refactor-codebase.prompt.md

---

## Best Practices

### DO ✅

1. **Be Explicit**
   - State chatmode transitions clearly
   - Specify tool restrictions
   - Define deliverables precisely

2. **Build Validation In**
   - Minimum 1 gate for important workflows
   - Gates before expensive operations
   - Structured review formats

3. **Automate Memory**
   - Update memory files as part of workflow
   - Maintain cross-session continuity
   - Document where to update

4. **Provide Context**
   - List required context files in frontmatter
   - Load memory before operations
   - Reference PT-2 standards

5. **Make Deterministic**
   - Same inputs → same outputs
   - Clear success criteria
   - Measurable outcomes

6. **Enable Recovery**
   - Troubleshooting section
   - Clear failure modes
   - Rollback strategies

### DO NOT ❌

1. **Skip Validation Gates**
   - Don't let agents proceed unchecked
   - Don't assume quality

2. **Create Vague Steps**
   - Avoid "do stuff" instructions
   - No ambiguous outcomes

3. **Ignore Memory Updates**
   - Don't let memory drift
   - Always update after changes

4. **Overcomplicate**
   - Simple workflows for simple tasks
   - Don't force phases if unnecessary

5. **Forget Anti-Patterns**
   - Explicitly forbid bad practices
   - Align with PT-2 standards

---

## Example: Creating "Deploy Feature" Workflow

### Step 1: Define Scope

**Purpose**: Deploy completed feature to production
**Inputs**: Feature branch, passing tests
**Outputs**: Production deployment, monitoring setup
**Chatmodes**: Reviewer → Service Engineer → Documenter

### Step 2: Map Phases

```
Phase 1: Pre-Deployment Review (Reviewer)
  - Validate tests passing
  - Check coverage targets
  - Review security implications
  Gate 1: Deployment Approval

Phase 2: Deployment (Service Engineer)
  - Create production migration
  - Deploy to staging
  - Smoke test staging
  - Deploy to production
  Gate 2: Production Validation

Phase 3: Post-Deployment (Documenter)
  - Update deployment log
  - Create monitoring alerts
  - Update memory with new capabilities
```

### Step 3: Write Workflow

````markdown
---
title: Deploy Feature to Production
description: Systematic feature deployment with pre/post-deployment validation
chatmode_sequence:
  - reviewer
  - service-engineer
  - documenter
validation_gates: 2
estimated_time: 45-90 minutes
version: 1.0.0
last_updated: 2025-10-17
context_files:
  - .claude/memory/phase-status.memory.md
  - docs/deployment/DEPLOYMENT_CHECKLIST.md
---

# Deploy Feature Workflow

## Overview

This workflow deploys a completed feature to production with validation gates.

**Estimated Time**: 45-90 minutes (review → deploy → monitor)

**Outcome**: Feature live in production + monitoring + documentation

---

## Phase 1: Pre-Deployment Review (Reviewer Mode)

**Chatmode**: reviewer.chatmode.md
**Tools**: Read, Grep, Bash (read-only)
**Output**: Deployment approval decision

### Step 1.1: Validate Tests

```bash
npm test
npm run type-check
npm run lint
```
````

### Step 1.2: Check Coverage

```bash
npm test -- --coverage
```

**Requirements**:

- [ ] All tests passing
- [ ] Coverage ≥80% services
- [ ] Coverage ≥70% UI

### Step 1.3: Security Review

- [ ] No secrets in code
- [ ] RLS policies updated
- [ ] Input validation present

### Step 1.4: VALIDATION GATE 1 - Deployment Approval

🛑 **STOP: Review deployment readiness**

**Checklist**:

```
Feature: {name}
Branch: {branch}

Tests: {X}/{Y} passing
Coverage: XX%
Security: ✅ / ⚠️

Ready to deploy? (Reply "deploy" to proceed)
```

---

## Phase 2: Deployment (Service Engineer Mode)

{Deployment steps...}

### Step 2.X: VALIDATION GATE 2 - Production Validation

{Validation format...}

---

## Phase 3: Post-Deployment (Documenter Mode)

{Documentation steps...}

---

{Additional sections: Final Checklist, Success Metrics, etc.}

````

---

## Workflow Versioning

### When to Increment Version

**Patch (1.0.X → 1.0.Y)**:
- Typo fixes
- Clarification of existing steps
- Minor wording improvements

**Minor (1.X.0 → 1.Y.0)**:
- New optional steps
- Additional troubleshooting guidance
- Enhanced validation formats

**Major (X.0.0 → Y.0.0)**:
- New/removed validation gates
- Chatmode sequence changes
- Breaking changes to workflow structure

### Version History Format

```markdown
## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | YYYY-MM-DD | Added Gate 3, changed chatmode sequence |
| 1.1.0 | YYYY-MM-DD | Enhanced troubleshooting, added examples |
| 1.0.0 | YYYY-MM-DD | Initial workflow creation |
````

---

## Testing Workflows

### Validation Checklist

Before committing new workflow:

- [ ] YAML frontmatter valid
- [ ] All required sections present
- [ ] Chatmode sequence makes sense
- [ ] Validation gates have clear criteria
- [ ] Final checklist comprehensive
- [ ] Success metrics measurable
- [ ] Troubleshooting addresses common issues
- [ ] Anti-patterns PT-2 aligned
- [ ] Tested end-to-end (if possible)

### Dry Run Process

1. **Read workflow aloud**: Does it make sense?
2. **Execute mentally**: Can you follow each step?
3. **Check gates**: Are approval criteria clear?
4. **Validate outputs**: Are deliverables defined?
5. **Test if possible**: Run workflow for real

---

## Integration with Chatmodes

### Chatmode Selection

**Match workflow phase to chatmode expertise**:

- Design/Architecture → architect.chatmode.md
- Service Implementation → service-engineer.chatmode.md
- UI Implementation → ui-engineer.chatmode.md
- Quality Review → reviewer.chatmode.md
- Documentation → documenter.chatmode.md

### Tool Restrictions

**Respect chatmode tool boundaries**:

- Architect: Read-only (NO Write/Edit)
- Reviewer: Read-only (NO Write/Edit)
- Engineers: Implementation (Write/Edit allowed)
- Documenter: Documentation (Write/Edit for docs only)

### Context Loading

**Specify context files in frontmatter**:

```yaml
context_files:
  - .claude/memory/project-context.memory.md # Always load
  - .claude/memory/service-catalog.memory.md # If working with services
  - docs/patterns/SERVICE_TEMPLATE_QUICK.md # Patterns needed
```

---

## Template Checklist

When creating a new workflow using this template:

- [ ] Copy YAML frontmatter, fill in all fields
- [ ] Write clear overview with time estimate
- [ ] Define phase structure with chatmodes
- [ ] Add validation gates (≥1 for important workflows)
- [ ] Create final checklist
- [ ] Define success metrics
- [ ] Add troubleshooting section
- [ ] List anti-patterns
- [ ] Add version history table
- [ ] Test workflow (dry run minimum)
- [ ] Commit to .claude/workflows/

---

## References

### Existing Workflows (Examples)

- **create-service.prompt.md**: Complex multi-phase with 3 gates
- **write-migration.prompt.md**: Database workflow with automation
- **create-adr.prompt.md**: Structured decision-making
- **session-handoff.prompt.md**: Documentation automation
- **phase-completion.prompt.md**: Quality validation

### Related Documentation

- **Chatmodes**: .claude/chatmodes/\*.chatmode.md
- **Memory Files**: .claude/memory/\*.memory.md
- **Strategy**: docs/agentic-workflow/agentic-workflow-strategy.md

---

## Version History

| Version | Date       | Changes                             |
| ------- | ---------- | ----------------------------------- |
| 1.0.0   | 2025-10-17 | Initial template creation (Phase 3) |

---

**Template Status**: Production Ready
**Last Updated**: 2025-10-17
**Maintained By**: Agentic Workflow Framework (Phase 3)
