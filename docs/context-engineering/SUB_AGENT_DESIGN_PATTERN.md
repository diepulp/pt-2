# Sub-Agent Design Pattern

**Version**: 1.0.0
**Date**: 2025-11-27
**Status**: CANONICAL
**Applies To**: All Claude Code sub-agents in `.claude/agents/`

---

## Purpose

This guide establishes the pattern for designing sub-agents that work seamlessly with skills. It resolves the problem of duplicated, drifting content by making sub-agents thin orchestration layers that consume freshness-validated skill primitives.

---

## The Problem

### Before This Pattern

```
Sub-agent invoked → Reads 300+ line embedded instructions
→ Instructions duplicate skill primitives
→ Content drifts from governance docs over time
→ No freshness validation
→ Inconsistent implementations
```

### After This Pattern

```
Sub-agent invoked → Reads 100-150 line orchestration file
→ Points to skill primitives (freshness-validated)
→ Single source of truth maintained
→ Consistent implementations
```

---

## Core Principles

### 1. Skills vs Sub-Agents

| Aspect | Skills | Sub-Agents |
|--------|--------|------------|
| **Purpose** | Automatic behaviors, context-loading | Isolated workflows |
| **Location** | `.claude/skills/{name}/` | `.claude/agents/{name}.md` |
| **Content** | Full primitives + references | Thin orchestration layer |
| **Invocation** | Via `Skill` tool | Via `Task` tool |
| **Context** | Loaded into main conversation | Runs in isolated subprocess |

### 2. Sub-Agent Should NOT Contain

- ❌ Full copies of governance documents
- ❌ Detailed code templates (>20 lines)
- ❌ Table ownership matrices (duplicate SRM)
- ❌ Pattern selection trees (duplicate QUICK_START)
- ❌ Content that exists in skill primitives

### 3. Sub-Agent SHOULD Contain

- ✅ Purpose statement (1-2 sentences)
- ✅ References to skill primitives to read first
- ✅ Critical constraints summary (DO/DO NOT lists)
- ✅ Workflow steps (pointing to primitives for details)
- ✅ Report format template
- ✅ Handoff protocol from upstream skills

---

## Standard Sub-Agent Structure

```markdown
---
name: {agent-name}
description: {One-line description for agent registry}
tools: {Required tools list}
model: {sonnet|opus|haiku}
---

# {Agent Title}

## Purpose
{1-2 sentence description of what this agent does}

**Tech Stack**: {Key technologies}

---

## First: Load Skill Primitives

Before starting, read these files in order:

```
1. .claude/skills/{skill}/references/QUICK_START.md  ← {Purpose}
2. .claude/skills/{skill}/references/{file}.md       ← {Purpose}
3. .claude/skills/{skill}/references/{file}.md       ← {Purpose}
```

**Optional freshness check**:
```bash
python .claude/skills/{skill}/scripts/check_primitive_freshness.py
```

---

## Constraints (Critical)

### DO
- {Essential requirement 1}
- {Essential requirement 2}
- {Essential requirement 3}

### DO NOT
- ❌ {Anti-pattern 1}
- ❌ {Anti-pattern 2}
- ❌ {Anti-pattern 3}

---

## Workflow

### Step 1: {First Action}
{Brief description, point to primitive for details}

### Step 2: {Second Action}
{Brief description, point to primitive for details}

### Step 3: {Third Action}
{Brief description, point to primitive for details}

### Step 4: Validate
```bash
{Validation commands}
```

---

## Key Reference Files

| File | Purpose |
|------|---------|
| `{path}` | {Purpose} |
| `.claude/skills/{skill}/references/*` | {Purpose} |

---

## Report Format

After completing, report:

```markdown
## {Task Type} Complete

### {Entity}: {Name}
**Status**: {Completed|Partial|Blocked}

### Files Created/Modified
- [ ] `{file1}`
- [ ] `{file2}`

### Validation Results
- [ ] {Check 1}
- [ ] {Check 2}

### Notes/Issues
{Any blockers or decisions made}
```

---

## Handoff from {Upstream Skill/Agent}

When invoked after `{skill-name}` skill:
1. Read the {artifact type} provided
2. Verify alignment with skill primitives
3. Execute workflow above
4. Report back with status

**Gate**: {Validation gate before completion}
```

---

## Size Guidelines

| Section | Target Lines |
|---------|--------------|
| Front matter + Purpose | 15-20 |
| Load Primitives | 10-15 |
| Constraints | 15-20 |
| Workflow | 30-40 |
| Reference Files | 10-15 |
| Report Format | 20-30 |
| Handoff Protocol | 10-15 |
| **Total** | **100-150** |

**Rule**: If sub-agent exceeds 200 lines, content is likely duplicated from skills.

---

## Skill-to-Agent Handoff Protocol

### Architecture → Implementation Flow

```
┌─────────────────────────────────────────────────────────────┐
│  SKILL: lead-architect                                       │
│  ├── Produces: Architecture brief, pattern selection         │
│  └── Handoff: "Implement per Pattern A with these specs"     │
│                           │                                   │
│                           ▼                                   │
│  SUB-AGENT: pt2-service-implementer                          │
│  ├── Reads: Architecture brief from lead-architect           │
│  ├── Loads: backend-service-builder skill primitives         │
│  ├── Implements: Per QUICK_START workflow                    │
│  └── Reports: Implementation status                          │
└─────────────────────────────────────────────────────────────┘
```

### Handoff Data Contract

The upstream skill/agent should provide:

```markdown
## Handoff to {Agent Name}

### Task
{What to implement}

### Pattern
{A|B|C} - {Rationale}

### Owned Tables
{List from SRM}

### Dependencies
- **Consumes**: {DTOs from other services}
- **Consumed By**: {Services that will use this}

### Constraints
{Any special requirements}

### Acceptance Criteria
- [ ] {Criterion 1}
- [ ] {Criterion 2}
```

---

## Freshness Validation

Sub-agents should optionally run freshness checks before starting:

```bash
# Check that skill primitives are in sync with governance docs
python .claude/skills/{skill}/scripts/check_primitive_freshness.py
```

If freshness check fails:
1. Review which source documents changed
2. Check if primitive updates are needed
3. Proceed with caution or escalate

---

## Example: pt2-service-implementer

### Before (328 lines)
- Embedded SRM table (15 lines)
- Embedded pattern selection tree (18 lines)
- Embedded code templates (100+ lines)
- Embedded workflow steps (50+ lines)
- No freshness validation
- No skill handoff protocol

### After (153 lines)
- Points to `bounded-contexts.md` for SRM
- Points to `QUICK_START.md` for pattern selection
- Points to `service-patterns.md` for templates
- Summarized workflow with primitive references
- Includes freshness check command
- Explicit handoff protocol from lead-architect

### Key Changes

```diff
- ## Bounded Context Ownership (SRM)
- | Service | Owned Tables |
- |---------|--------------|
- | **casino** | `casino`, `casino_settings`... |
- ... (15 lines of table)

+ ## First: Load Skill Primitives
+ 1. .claude/skills/backend-service-builder/references/QUICK_START.md
+ 2. .claude/skills/backend-service-builder/references/bounded-contexts.md
+ 3. .claude/skills/backend-service-builder/references/dto-rules.md
```

---

## Creating a New Sub-Agent

### Step 1: Identify the Skill

Which skill provides the primitives this agent needs?
- `backend-service-builder` → Service implementation (`pt2-service-implementer`)
- `lead-architect` → Architecture design
- `frontend-design` → UI components (`pt2-frontend-implementer`)
- `api-builder` → API endpoints

### Step 2: Use the Template

Copy the standard structure above and fill in:
- Agent name and description
- Skill primitive references
- Critical constraints (condensed from skill)
- Workflow steps (pointing to primitives)
- Report format
- Handoff protocol

### Step 3: Validate Size

If agent exceeds 200 lines:
- Extract duplicated content to skill primitives
- Replace with references
- Keep only orchestration logic

### Step 4: Test the Flow

1. Invoke upstream skill
2. Verify handoff data is produced
3. Invoke sub-agent
4. Verify it loads primitives correctly
5. Verify output matches skill patterns

---

## Anti-Patterns

| Anti-Pattern | Correct Pattern |
|--------------|-----------------|
| Copy SRM table into agent | Reference `bounded-contexts.md` |
| Embed 50-line code template | Reference `service-patterns.md` |
| Duplicate pattern selection tree | Reference `QUICK_START.md` |
| No freshness validation | Include freshness check command |
| No handoff protocol | Define explicit handoff contract |
| 300+ line agent file | Keep under 150 lines |

---

## Governance

### Ownership
- **Pattern Owner**: Lead Architect
- **Implementation**: Agent maintainers
- **Validation**: Code review

### Change Process

1. Identify content that belongs in skills
2. Move to appropriate skill primitive
3. Update agent to reference primitive
4. Verify freshness manifest tracks source
5. Test full workflow

---

## References

- **Skill Primitive Standardization**: `docs/context-engineering/SKILL_PRIMITIVE_STANDARDIZATION_GUIDE.md`
- **Backend Service Builder**: `.claude/skills/backend-service-builder/`
- **Lead Architect**: `.claude/skills/lead-architect/`
- **Frontend Design**: `.claude/skills/frontend-design/`
- **Example Agents**:
  - `.claude/agents/pt2-service-implementer.md` (backend)
  - `.claude/agents/pt2-frontend-implementer.md` (frontend)

---

**End of Guide**
