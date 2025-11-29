---
name: prd-author
description: Create and validate Product Requirements Documents (PRDs) following PRD-STD-001 standard. This skill should be used when creating new PRDs, reviewing existing PRDs for compliance, or helping structure product requirements for a release, phase, or bounded problem area. Ensures PRDs stay focused, concrete, and shippable. (project)
---

# PRD Author

Create Product Requirements Documents that stay small, concrete, and shippable per PRD-STD-001.

## When to Use This Skill

- Creating a new PRD for a release, phase, or problem area
- Reviewing an existing PRD for standard compliance
- Helping scope a PRD (determining what belongs vs. what should be separate)
- Writing or improving a Definition of Done

## Core Principles

A PRD describes a **specific, bounded slice** of the product:
- The **problem** it solves
- **Who** it is for
- **What** must exist for this slice to be "done"
- **How we will know** it worked

A PRD is **not**:
- Architecture spec (service layout, transport rules, code structure)
- QA / testing standard (coverage mandates, test tooling)
- Traceability matrix (full mapping stories → services → tables)
- SDLC playbook (TDD rituals, CI steps)
- Full product vision for multi-year roadmap

---

## PRD Creation Workflow

### Step 1: Scope Assessment

Before writing, determine appropriate scope:

1. **Ask clarifying questions:**
   - "What release/phase does this cover?"
   - "Who are the primary users for this slice?"
   - "What's the core problem being solved?"

2. **Validate scope is bounded:**
   - One release OR one phase OR one problem area
   - Not the entire product across phases
   - Not all bounded contexts at once

3. **If scope is too broad:**
   - Recommend splitting into multiple PRDs
   - Help identify natural boundaries

**Scope Decision Tree:**
```
Is scope > 1 release/phase? → Split into multiple PRDs
Does it span > 3 bounded contexts? → Split by context
Can it ship as a unit? → Good scope
Does "done" feel impossible? → Scope too broad
```

### Step 2: Gather Requirements

Collect information for each required section:

**Problem & Goals:**
- Clear problem statement (1-2 paragraphs)
- 3-5 observable, testable goals
- Explicit non-goals (out of scope)

**Users & Use Cases:**
- Primary user roles/personas
- 2-4 jobs per user: "As a [role], I need to [job] so that [outcome]"

**Scope & Features:**
- 5-15 testable feature bullets
- Each answerable with "yes, we did that" or "no"

### Step 3: Draft the PRD

Use the template from `references/prd-template.md`.

Fill in each section, following these rules:

| Section | Content | What to Avoid |
|---------|---------|---------------|
| Overview | 3-5 sentence summary | Lengthy descriptions |
| Problem | Clear pain/gap description | Vague aspirations |
| Goals | Observable outcomes | "Improve", "better", "enhance" |
| Non-Goals | Explicit exclusions | Empty or missing |
| Requirements | Behaviors that must exist | Schema/architecture details |
| UX/Flow | 3-7 bullet journey | Detailed UI specs |
| DoD | 5-12 binary checkboxes | Coverage percentages |

### Step 4: Write Definition of Done

Reference `references/dod-guide.md` for structure.

DoD must include items across these categories:
1. **Functionality** — User stories work E2E
2. **Data & Integrity** — No orphaned/stuck records
3. **Security & Access** — Role model enforced
4. **Testing** — Minimal tests per critical flow
5. **Operational Readiness** — Logs/metrics exist
6. **Documentation** — Runbooks/limitations documented

### Step 5: Validate Against Anti-Patterns

Check `references/anti-patterns.md` and run validation:

```bash
python scripts/validate_prd.py <path-to-prd.md>
```

Fix any errors before finalizing.

### Step 6: Link Related Documents

Add references to (not copies of):
- Vision / Strategy doc
- Architecture / SRM
- Schema / Types
- API Surface
- QA / Test Plan
- Observability / SLOs

---

## Quick Reference

### Required Sections Checklist

- [ ] Overview (name, owner, status, summary)
- [ ] Problem & Goals (problem, 3-5 goals, non-goals)
- [ ] Users & Use Cases (roles, jobs)
- [ ] Scope & Feature List (5-15 bullets)
- [ ] Requirements (functional, non-functional)
- [ ] UX / Flow Overview (3-7 bullets)
- [ ] Dependencies & Risks
- [ ] Definition of Done (5-12 items)
- [ ] Related Documents

### PRD ID Convention

Use pattern: `PRD-XXX-description`
- `PRD-001-mvp-table-rating`
- `PRD-002-loyalty-rewards`

### Common Anti-Patterns

| Anti-Pattern | Smell | Solution |
|--------------|-------|----------|
| Everything PRD | Multiple bounded contexts, all phases | Split into multiple PRDs |
| Architecture cramming | Service diagrams, class layouts | Move to ARCH docs, link |
| QA cramming | Coverage %, test tools | Move to QA standards |
| Traceability matrix | Story→Service→Table tables | Separate doc or generate |
| Vague goals | "Improve", "better" | Make observable/testable |

See `references/anti-patterns.md` for detailed guidance.

---

## Bundled Resources

| Resource | Purpose |
|----------|---------|
| `references/prd-template.md` | Copy-paste ready PRD template |
| `references/anti-patterns.md` | Common mistakes and how to avoid |
| `references/dod-guide.md` | Definition of Done examples and guidance |
| `scripts/validate_prd.py` | Validate PRD against standard |

---

## Integration with PT-2 Documentation

PRDs in this project live in `docs/10-prd/` and should reference:

- Vision: `docs/00-vision/VIS-001-VISION-AND-SCOPE.md`
- Architecture: `docs/20-architecture/` (SLAD, ADRs)
- Schema: `types/database.types.ts`
- QA: `docs/40-quality/`

---

## Standard Reference

Full standard: `docs/10-prd/PRD-STD-001_PRD_STANDARD.md`

---

## Memory Recording Protocol

This skill tracks execution outcomes to build pattern knowledge.

### Record Execution Outcomes

After completing PRD creation or review:

```python
from lib.memori import create_memori_client, SkillContext

memori = create_memori_client("skill:prd-author")
memori.enable()
context = SkillContext(memori)

context.record_skill_execution(
    skill_name="prd-author",
    task="Create PRD-002-loyalty-rewards",
    outcome="success",
    pattern_used="Workflow-based creation with scope validation",
    validation_results={
        "required_sections_present": True,
        "anti_patterns_detected": 0,
        "dod_items": 8
    },
    files_created=["docs/10-prd/PRD-002-loyalty-rewards.md"],
    lessons_learned=["Split loyalty and finance into separate PRDs"]
)
```

### Namespace Reference

- Client initialization: `create_memori_client("skill:prd-author")`
- Database user_id: `skill_prd_author`
