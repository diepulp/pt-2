# Load Memory Context

**Purpose**: Load all PT-2 memory files for immediate project context

**Usage**: `/load-memory`

---

## Instructions

Load all 6 memory files to establish full project context:

1. Read `.claude/memory/project-context.memory.md`
   - Tech stack, constraints, current status

2. Read `.claude/memory/anti-patterns.memory.md`
   - Critical violations to avoid (enforcement checklist)

3. Read `.claude/memory/architecture-decisions.memory.md`
   - ADR summaries and key architectural decisions

4. Read `.claude/memory/phase-status.memory.md`
   - Current work, completed phases, next steps

5. Read `.claude/memory/service-catalog.memory.md`
   - All 7 services with operations and patterns

6. Read `.claude/memory/domain-glossary.memory.md`
   - Canonical terminology and definitions

---

## Confirmation

After loading all files, confirm:

✅ **Context Loaded**: All 6 memory files read successfully
✅ **Ready**: Can answer questions about:

- Current phase status
- Service architecture patterns
- Anti-patterns to avoid
- Tech stack and constraints
- Domain terminology

**Total Context**: ~11,441 words (vs 203k full docs)
**Load Time**: <10 seconds target
**Session Ready**: Full project context available

---

## When to Use

- **Session start**: If auto-load didn't work
- **Context refresh**: When returning after break
- **Mid-session**: If memory seems incomplete
- **Troubleshooting**: Validate memory file integrity
- **Training**: Demonstrate memory infrastructure

---

## Fallback

If memory files are missing or corrupted, fall back to:

- Full PRD: `docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md`
-
- Documentation index: `docs/INDEX.md`
