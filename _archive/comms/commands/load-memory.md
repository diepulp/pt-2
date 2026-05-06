# Load Memory Context

**Purpose**: Manually load all PT-2 memory files for immediate project context

**Usage**: `/load-memory`

---

## Instructions

Load all 6 memory files from the root `memory/` directory:

1. Read `memory/project.memory.md`
   - Recent decisions, patterns that worked, pitfalls, next steps

2. Read `memory/anti-patterns.memory.md`
   - Critical violations to avoid (enforcement checklist)

3. Read `memory/architecture-decisions.memory.md`
   - ADR index with quick reference to all 12 ADRs

4. Read `memory/phase-status.memory.md`
   - Current AI-native scaffold status, milestones, blockers

5. Read `memory/service-catalog.memory.md`
   - Quick index of 9 bounded contexts and ownership patterns

6. Read `memory/domain-glossary.memory.md`
   - Canonical terminology and definitions

---

## Confirmation

After loading all files, confirm:

✅ **Context Loaded**: All 6 memory files read successfully
✅ **Ready**: Can answer questions about:

- Current phase status
- Service architecture patterns
- Anti-patterns to avoid
- Recent decisions and lessons learned
- Domain terminology

**Total Context**: ~123 lines (vs 1,984 in old .claude/memory/)
**Load Time**: <5 seconds
**Session Ready**: Lightweight project context available

---

## When to Use

- **Auto-load failed**: If `.claude/CLAUDE.md` @ references didn't work
- **Context refresh**: When returning after break
- **Mid-session**: If memory seems incomplete
- **Troubleshooting**: Validate memory file integrity
- **Training**: Demonstrate memory infrastructure

---

## Automatic Loading (Recommended)

Instead of using this manual command, prefer automatic loading:

**Claude Code IDE**:
- Memory loads automatically via `.claude/CLAUDE.md` @ references
- No action needed on session start

**Claude CLI**:
```bash
# Load memory files via AGENTS.md
claude --append-system-prompt "$(cat AGENTS.md)" "your task"

# Or load memory files directly
claude --append-system-prompt "$(cat memory/*.md)" "your task"
```

**Note**: Claude CLI's `--agents` flag expects inline JSON, not file paths. Use `--append-system-prompt` to load file content instead.

---

## Full Documentation Fallback

If memory files are missing or corrupted, reference full docs:

- **Documentation index**: `docs/INDEX.md`
- **SDLC taxonomy**: `docs/patterns/SDLC_DOCS_TAXONOMY.md`
- **Architecture**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **ADRs**: `docs/80-adrs/ADR-*.md`

---

## Context Files (On-Demand Loading)

For deep dives on specific topics, load context files:

- `context/architecture.context.md` - SRM patterns, ADR index
- `context/governance.context.md` - Service templates, standards
- `context/quality.context.md` - Test patterns, quality gates
- `context/state-management.context.md` - React Query + Zustand
- `context/api-security.context.md` - RLS policies, RBAC
- `context/db.context.md` - Migration workflow

**Note**: These load automatically when using chatmodes (backend-dev, frontend-dev, reviewer)
