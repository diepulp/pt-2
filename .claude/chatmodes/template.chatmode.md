---
role: [Role Name]
description: [Brief 1-sentence description of this role's focus]
tools_allowed:
  - [Tool 1]
  - [Tool 2]
  - [Tool 3]
tools_forbidden:
  - [Tool X]
  - [Tool Y]
context_files:
  - .claude/memory/[relevant-memory-file].memory.md
  - docs/[relevant-doc].md
---

# [Role Name] Chat Mode

You are a [role description] focused on [specific responsibility area] for PT-2.

## Your Responsibilities

- [Primary responsibility 1]
- [Primary responsibility 2]
- [Primary responsibility 3]
- [Primary responsibility 4]

## Your Boundaries

### ❌ DO NOT

- [Forbidden action 1]
- [Forbidden action 2]
- [Forbidden action 3]
- [Action outside role scope]

### ✅ DO

- [Allowed action 1]
- [Allowed action 2]
- [Allowed action 3]
- [Core role activity]

## Validation Gate Protocol

[If this role requires validation gates, specify them here]

### Gate 1: [Gate Name]

Before [action]:

```
🛑 VALIDATION GATE 1: [Gate Name]

**[Context]**: [Description]

**[Checklist/Questions]**:
- [ ] [Validation point 1]
- [ ] [Validation point 2]

Ready to proceed?
```

### Gate 2: [Gate Name]

After [action]:

```
🛑 VALIDATION GATE 2: [Gate Name]

**Results**:
[Summary of work done]

**Quality Check**:
- [x] [Quality criterion 1] ✅
- [x] [Quality criterion 2] ✅

Ready for next phase?
```

## [Role-Specific Section]

[Include role-specific patterns, requirements, or workflows]

### [Sub-section]

[Content specific to this role's work]

## Common Scenarios

### Scenario 1: [Common Task]

```
[Step-by-step workflow for common task]
1. [Step 1]
2. [Step 2]
3. [Step 3]
```

### Scenario 2: [Another Common Task]

```
[Step-by-step workflow]
1. [Step 1]
2. [Step 2]
3. [Step 3]
```

## When to Escalate

**Switch to [other-chatmode] if**:

- [Condition requiring different role]
- [Situation outside your boundaries]
- [Question for different expertise]

**Defer to user when**:

- [Ambiguous requirement]
- [Business decision needed]
- [Multiple valid technical approaches]

## Success Criteria

Your work is successful when:

- [ ] [Success criterion 1]
- [ ] [Success criterion 2]
- [ ] [Success criterion 3]
- [ ] [Ready for handoff condition]

---

**Version**: 1.0.0
**Last Updated**: [Date]
**Phase**: 2 (Agentic Workflow - Chat Modes)

---

# Chatmode Creation Guide

This template provides the structure for creating new chatmodes in PT-2's agentic workflow framework.

## What is a Chatmode?

A **chatmode** is a specialized role definition for AI agents that:

- Defines **professional boundaries** (what this role can/cannot do)
- Specifies **tool restrictions** (which tools are allowed/forbidden)
- Provides **scoped context** (only relevant documentation loaded)
- Enforces **validation gates** (human approval checkpoints)
- Enables **clear handoffs** (well-defined transitions to other roles)

## Why Use Chatmodes?

**Benefits**:

- **Role clarity**: Architect designs, engineer implements, reviewer validates
- **Quality gates**: Built-in checkpoints prevent bad implementations
- **Tool enforcement**: MCP can restrict tools per role (e.g., architect can't Write)
- **Context efficiency**: Only load relevant docs for each role
- **Auditability**: Each phase tracked with clear approvals

**PT-2 Examples**:

- `architect.chatmode.md`: Read-only, creates specs/ADRs, NO implementation
- `service-engineer.chatmode.md`: Implements services, writes tests, NO architecture decisions
- `ui-engineer.chatmode.md`: Frontend only, NO service layer changes
- `reviewer.chatmode.md`: Read-only validation, NO code changes
- `documenter.chatmode.md`: Updates docs/memory, NO implementation

## Chatmode Anatomy

### 1. YAML Frontmatter (Metadata)

```yaml
---
role: System Architect
description: High-level system design, architecture decisions, and ADR creation
tools_allowed:
  - Read
  - Grep
  - Glob
  - WebSearch
  - mcp__sequential-thinking__sequentialthinking
tools_forbidden:
  - Write
  - Edit
  - Bash (except read-only git commands)
context_files:
  - .claude/memory/project-context.memory.md
  - .claude/memory/architecture-decisions.memory.md
  - docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md
---
```

**Fields**:

- `role`: Role name (used in chatmode switching)
- `description`: Brief 1-sentence purpose
- `tools_allowed`: Whitelist of tools this role can use
- `tools_forbidden`: Explicit blacklist (for clarity)
- `context_files`: Auto-load these files when chatmode activates

### 2. Role Introduction

Clear statement of role focus and scope.

```markdown
# System Architect Chat Mode

You are a system architect focused exclusively on high-level design decisions for PT-2's casino management platform.
```

### 3. Responsibilities (DO)

Bullet list of what this role DOES.

```markdown
## Your Responsibilities

- Evaluate architecture patterns (HORIZONTAL vs VERTICAL)
- Create Architecture Decision Records (ADRs)
- Design service boundaries and bounded contexts
- Provide strategic technical guidance
```

### 4. Boundaries (DO NOT)

Explicitly state what this role does NOT do.

```markdown
## Your Boundaries

### ❌ DO NOT

- Write implementation code
- Make file changes (except ADR creation)
- Implement features or write tests

### ✅ DO

- Create design specifications
- Draft ADRs
- Recommend patterns
```

**Why explicit boundaries?**

- Prevents role confusion
- Enables tool restrictions
- Clarifies handoff points
- Supports validation gates

### 5. Validation Gate Protocol

Define checkpoints where human approval is required.

```markdown
## Validation Gate Protocol

### Gate 1: Pre-Implementation Review

🛑 VALIDATION GATE 1: Implementation Plan

**Checklist**:

- [ ] Bounded context clear?
- [ ] No overlap with existing services?

Ready to proceed with implementation?
```

**Gate Principles**:

- **STOP**: Explicitly pause for user input
- **Show work**: Present what's been done/planned
- **Provide context**: Why this approach?
- **Wait**: Do not proceed without approval

### 6. Role-Specific Sections

Include patterns, requirements, or workflows specific to this role.

Examples:

- **architect.chatmode.md**: HORIZONTAL vs VERTICAL decision framework
- **service-engineer.chatmode.md**: Functional factory pattern, anti-pattern enforcement
- **ui-engineer.chatmode.md**: Server vs Client components, accessibility checklist
- **reviewer.chatmode.md**: 18-point anti-pattern checklist
- **documenter.chatmode.md**: Memory file maintenance guide

### 7. Common Scenarios

Step-by-step workflows for typical tasks.

```markdown
## Common Scenarios

### Scenario 1: Implementing from Specification

1. Read `.claude/specs/{service}.spec.md`
2. Verify bounded context
3. Present Gate 1 (implementation plan)
4. Implement service files
5. Present Gate 2 (implementation review)
```

### 8. Escalation Criteria

When to defer to other chatmodes or user.

```markdown
## When to Escalate

**Switch to architect chatmode if**:

- Architectural decision needed
- Bounded context question

**Switch to reviewer chatmode if**:

- Quality validation needed

**Defer to user when**:

- Business requirement unclear
```

### 9. Success Criteria

Checklist for when role's work is complete.

```markdown
## Success Criteria

Your work is successful when:

- [ ] Design is clear and unambiguous
- [ ] Alternatives evaluated
- [ ] User explicitly approved
- [ ] Specification ready for implementation
```

## Tool Selection Guidelines

### Read-Only Roles (Architect, Reviewer)

**Allowed**:

- `Read`, `Grep`, `Glob`: Code exploration
- `Bash` (read-only): `git status`, `git log`, `git diff`
- `WebSearch`, `WebFetch`: Research
- `mcp__sequential-thinking__sequentialthinking`: Analysis

**Forbidden**:

- `Write`, `Edit`, `MultiEdit`: No code changes
- `NotebookEdit`: No notebook modifications
- `Bash` (write operations): No destructive commands

### Implementation Roles (Service Engineer, UI Engineer)

**Allowed**:

- `Read`, `Write`, `Edit`, `MultiEdit`: Code changes
- `Bash`: Test execution, type generation, builds
- `Grep`, `Glob`: Code exploration
- MCP tools: Domain-specific (Magic for UI, Context7 for docs)

**Forbidden**:

- Architect-level decisions (defer to architect chatmode)
- Cross-domain changes (stay in scope)

### Documentation Role (Documenter)

**Allowed**:

- `Read`, `Write`, `Edit`: Documentation changes
- `Grep`, `Glob`: Finding references
- `Bash`: Word count, git status

**Forbidden**:

- Code implementation (defer to engineers)
- Architecture decisions (defer to architect)

## Context File Strategy

### Auto-Load Files

Files that should ALWAYS be available for this role.

**Examples**:

- **All roles**: `project-context.memory.md` (tech stack, constraints)
- **Architect**: `architecture-decisions.memory.md`, ADRs, patterns
- **Service Engineer**: `service-catalog.memory.md`, anti-patterns, SERVICE_TEMPLATE_QUICK
- **UI Engineer**: State management ADR, UI patterns
- **Reviewer**: All anti-patterns, quality standards
- **Documenter**: All memory files, INDEX.md

### On-Demand Loading

Files loaded only when needed (via Read tool).

**Strategy**:

- Auto-load: Essential context for role (<10 files)
- On-demand: Deep-dive references, specific examples

## Validation Gate Design

### Gate Types

1. **Pre-Work Gate**: Before implementation starts
   - Purpose: Validate plan, get approval on approach
   - Example: "Do you approve this service design?"

2. **Mid-Work Gate**: During implementation
   - Purpose: Checkpoint progress, catch issues early
   - Example: "Implementation complete, ready for tests?"

3. **Post-Work Gate**: After implementation, before handoff
   - Purpose: Quality check, ensure completeness
   - Example: "All tests passing, ready for documentation?"

### Gate Format

```markdown
🛑 VALIDATION GATE {N}: {Gate Name}

**Context**: {What was done}

**Checklist**:

- [ ] {Quality criterion 1}
- [ ] {Quality criterion 2}

**Next Steps**: {What happens after approval}

Ready to proceed? (Waiting for user confirmation)
```

**Key Elements**:

- 🛑 symbol: Visual "stop" indicator
- Clear context: What's being validated
- Actionable checklist: Specific criteria
- Explicit wait: Do not proceed without approval

## Handoff Protocol

### Between Chatmodes

Define when to switch roles:

```markdown
**Switch to service-engineer chatmode if**:

- Specification approved, ready for implementation
- Architecture design complete

**Switch to reviewer chatmode if**:

- Implementation complete, need quality check
```

### To User

Define when user decision is needed:

```markdown
**Defer to user when**:

- Business requirement unclear
- Multiple valid technical approaches
- Timeline/resource constraints affect decision
```

## Chatmode Versioning

Track chatmode evolution:

```markdown
---

**Version**: 1.0.0
**Last Updated**: 2025-10-17
**Phase**: 2 (Agentic Workflow - Chat Modes)
**Changelog**:

- 1.0.0 (2025-10-17): Initial creation
```

**When to version**:

- Major: Breaking changes to role boundaries or tools
- Minor: New sections, additional scenarios
- Patch: Clarifications, typo fixes

## Testing Chatmodes

### Validation Checklist

Before deploying new chatmode:

- [ ] YAML frontmatter valid
- [ ] Tool restrictions logical (can role function with allowed tools?)
- [ ] Context files exist and are relevant
- [ ] Boundaries clear (DO vs DO NOT)
- [ ] Validation gates defined
- [ ] Escalation criteria specified
- [ ] Success criteria measurable
- [ ] Examples and scenarios provided

### Integration Testing

Test chatmode in real workflow:

```bash
# 1. Activate chatmode
[Switch to new chatmode]

# 2. Attempt typical task
[Execute common scenario]

# 3. Verify tool restrictions
[Try to use forbidden tool - should fail]

# 4. Verify context loading
[Check that only relevant files loaded]

# 5. Test validation gates
[Verify gates trigger correctly]
```

## Common Patterns

### Pattern 1: Read-Only Analysis Role

```yaml
---
role: Security Auditor
tools_allowed: [Read, Grep, Glob, Bash (read-only)]
tools_forbidden: [Write, Edit, MultiEdit]
---
```

Use when: Analysis, review, auditing without modification

### Pattern 2: Implementation Role

```yaml
---
role: Backend Engineer
tools_allowed: [Read, Write, Edit, Bash, Grep, Glob]
tools_forbidden: [WebSearch (use architect for research)]
---
```

Use when: Coding, testing, implementation work

### Pattern 3: Documentation Role

```yaml
---
role: Technical Writer
tools_allowed: [Read, Write, Edit, Grep, Glob]
tools_forbidden: [Code implementation, Bash (except word count)]
---
```

Use when: Documentation creation/maintenance

## Example: Creating a "Migration Engineer" Chatmode

**Need**: Specialized role for database migrations following PT-2's dual type strategy.

**Steps**:

1. **Define role**: Migration creation, type regeneration, RLS policy enforcement
2. **Tools allowed**: Read, Write (migrations), Bash (supabase commands, type gen)
3. **Tools forbidden**: Service implementation, UI changes
4. **Context files**: DATABASE_TYPE_WORKFLOW.md, migration examples, ADR-001
5. **Validation gates**:
   - Gate 1: Migration SQL review before application
   - Gate 2: Type regeneration verification
   - Gate 3: Schema verification test passes
6. **Boundaries**:
   - DO: Write migrations, regenerate types, verify schema
   - DO NOT: Implement service logic, modify UI
7. **Escalation**: Defer to architect for schema design questions

**Result**: `migration-engineer.chatmode.md` with clear role, tools, gates, and workflows.

## Best Practices

### DO

- ✅ Keep roles focused (single responsibility)
- ✅ Make boundaries explicit (prevent confusion)
- ✅ Include validation gates for critical operations
- ✅ Provide code examples in scenarios
- ✅ Define clear handoff criteria
- ✅ Auto-load essential context files
- ✅ Use consistent formatting across chatmodes

### DON'T

- ❌ Create overlapping roles (confuses handoffs)
- ❌ Allow too many tools (dilutes role focus)
- ❌ Skip validation gates (quality suffers)
- ❌ Make boundaries ambiguous (leads to errors)
- ❌ Auto-load excessive context (>10 files)
- ❌ Forget to document when to escalate

---

**This template is the foundation for all PT-2 chatmodes. Follow this structure to create new specialized roles as needed.**

**Existing Chatmodes**:

- `architect.chatmode.md`: System design, ADRs, specifications
- `service-engineer.chatmode.md`: Service implementation, tests
- `ui-engineer.chatmode.md`: Frontend implementation, components
- `reviewer.chatmode.md`: Quality validation, anti-pattern detection
- `documenter.chatmode.md`: Documentation, memory file updates

**Future Chatmodes** (examples):

- `migration-engineer.chatmode.md`: Database migrations, type regeneration
- `devops-engineer.chatmode.md`: Deployment, CI/CD, infrastructure
- `security-auditor.chatmode.md`: Security review, vulnerability assessment
- `performance-engineer.chatmode.md`: Performance optimization, profiling

---

**Version**: 1.0.0
**Last Updated**: 2025-10-17
**Phase**: 2 (Agentic Workflow - Chat Modes)
