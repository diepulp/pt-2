# Memory Loading Guide

**Date**: 2025-11-03
**Version**: 2.0.0
**Status**: Production
**Owner**: Engineering Enablement

---

## Overview

PT-2 uses a **three-tier memory architecture** with multiple loading mechanisms depending on your environment (IDE vs CLI) and use case (automatic vs manual).

### Quick Decision Tree

```
Are you using Claude Code IDE?
├─ YES → Auto-loads via .claude/CLAUDE.md (no action needed)
└─ NO → Are you using Claude CLI/Codex?
    ├─ YES → Use --agents flag: claude --agents ./AGENTS.md
    └─ NO → Use manual command: /load-memory
```

---

## Memory Architecture (3 Tiers)

| Tier | Location | Size | Purpose | Loading |
|------|----------|------|---------|---------|
| **Memory** | `memory/` | 123 lines | Lightweight decisions + gotchas | Always loaded |
| **Context** | `context/` | 569 lines | Domain patterns from docs | Loaded via chatmode |
| **Docs** | `docs/` | Full corpus | Complete details | Read on-demand |

**Philosophy**:
- **Memory** = "What did we decide and why did it fail?"
- **Context** = "How do I implement this pattern?"
- **Docs** = "I need deep architectural rationale"

---

## Loading Mechanisms

### 1. IDE Auto-Load (Recommended for Claude Code)

**Status**: ✅ Production
**File**: `.claude/CLAUDE.md`
**When**: Automatically on session start
**Who**: Developers using Claude Code IDE

#### How It Works

`.claude/CLAUDE.md` uses native `@` reference syntax:

```markdown
# PT-2 Architecture Standards

<!-- Auto-load Memory Files -->
@memory/project.memory.md
@memory/anti-patterns.memory.md
@memory/architecture-decisions.memory.md
@memory/phase-status.memory.md
@memory/service-catalog.memory.md
@memory/domain-glossary.memory.md
```

#### What Gets Loaded

**Baseline (always)**:
- 6 memory files (123 lines total)
- Load time: <5 seconds
- Token cost: ~2.5k tokens (1.3% of budget)

**No action required** - works automatically when opening project in Claude Code IDE.

#### Verification

Start a new IDE session and check initial context:
- Should see memory file content in initial messages
- Total baseline: 123 lines
- If missing: Try `/load-memory` command

---

### 2. CLI Auto-Load (Recommended for Automation)

**Status**: ⚠️ Limited (No native file-based --agents support)
**File**: `AGENTS.md`
**When**: Manual context loading via `--append-system-prompt`
**Who**: Developers using Claude CLI, Codex, or automation scripts

#### How It Works

**Current Limitation**: Claude CLI's `--agents` flag expects inline JSON, NOT file paths.

**Workaround**: Use `--append-system-prompt` to load AGENTS.md content:

```bash
# Claude CLI - Load AGENTS.md content
claude --append-system-prompt "$(cat AGENTS.md)" "Implement loyalty points feature"

# With chatmode context (concatenate files)
claude \
  --append-system-prompt "$(cat .github/chatmodes/backend-dev.chatmode.md)" \
  --append-system-prompt "$(cat context/architecture.context.md)" \
  --append-system-prompt "$(cat context/governance.context.md)" \
  "Implement loyalty points feature"

# Print mode (non-interactive)
claude --print \
  --append-system-prompt "$(cat AGENTS.md)" \
  "Review RLS policies"
```

#### What Gets Loaded

**AGENTS.md hierarchy**:
```yaml
includes:
  instructions: .github/instructions/*.md (4 files)
  chatmodes: .github/chatmodes/*.md (3 files)
  prompts: .github/prompts/*.md (3 files)
  context: context/*.md (6 files, loaded via chatmode)
memory:
  - memory/anti-patterns.memory.md
  - memory/architecture-decisions.memory.md
  - memory/domain-glossary.memory.md
  - memory/phase-status.memory.md
  - memory/project.memory.md
  - memory/service-catalog.memory.md
```

**Chatmode determines context loading**:
- `backend-dev.chatmode.md` → Loads 5 context files (architecture, governance, db, api-security, quality)
- `frontend-dev.chatmode.md` → Loads 4 context files (state-management, governance, quality, api-security)
- `reviewer.chatmode.md` → Loads 4 context files (architecture, governance, quality, api-security)

#### Total Load

**Baseline** (always):
- Memory: 123 lines (~2.5k tokens)

**Context** (via chatmode):
- Backend: 5 files, ~400 lines (~8k tokens)
- Frontend: 4 files, ~350 lines (~7k tokens)
- Reviewer: 4 files, ~350 lines (~7k tokens)

**Total**: ~10-12k tokens (5-6% of budget)

#### Verification

```bash
# Test context loading
claude --append-system-prompt "$(cat AGENTS.md)" \
  --print \
  "List loaded context files"

# Should see:
# - All 6 memory files (from AGENTS.md)
# - Context files if chatmode loaded
# - Instructions from .github/instructions/
```

---

### 3. Manual Load (Fallback)

**Status**: ✅ Production
**File**: `.claude/commands/load-memory.md`
**When**: Auto-load fails or debugging
**Who**: Any environment

#### How It Works

Use `/load-memory` slash command:

```bash
# In any Claude session
/load-memory
```

#### What Gets Loaded

**Same as IDE auto-load**:
- 6 memory files from `memory/`
- 123 lines total
- ~2.5k tokens

#### Instructions

The command will prompt you to:
1. Read `memory/project.memory.md`
2. Read `memory/anti-patterns.memory.md`
3. Read `memory/architecture-decisions.memory.md`
4. Read `memory/phase-status.memory.md`
5. Read `memory/service-catalog.memory.md`
6. Read `memory/domain-glossary.memory.md`

Then confirm context is loaded.

#### When to Use

- ✅ Auto-load didn't work (IDE session start)
- ✅ Context refresh after long break
- ✅ Mid-session memory seems incomplete
- ✅ Debugging memory file integrity
- ✅ Training/demo purposes

---

## Context Loading (On-Demand)

Context files (569 lines) load **on-demand** via chatmodes, not automatically.

### Via Chatmode (Recommended)

**Backend Work**:
```bash
claude \
  --append-system-prompt "$(cat .github/chatmodes/backend-dev.chatmode.md)" \
  --append-system-prompt "$(cat context/architecture.context.md context/governance.context.md context/db.context.md context/api-security.context.md context/quality.context.md)" \
  "Create loyalty service"

# Loads: architecture, governance, db, api-security, quality contexts
```

**Frontend Work**:
```bash
claude \
  --append-system-prompt "$(cat .github/chatmodes/frontend-dev.chatmode.md)" \
  --append-system-prompt "$(cat context/state-management.context.md context/governance.context.md context/quality.context.md context/api-security.context.md)" \
  "Implement player dashboard"

# Loads: state-management, governance, quality, api-security contexts
```

**Code Review**:
```bash
claude \
  --append-system-prompt "$(cat .github/chatmodes/reviewer.chatmode.md)" \
  --append-system-prompt "$(cat context/architecture.context.md context/governance.context.md context/quality.context.md context/api-security.context.md)" \
  "Review PR #123"

# Loads: architecture, governance, quality, api-security contexts
```

### Manual Context Loading

If you need specific context without chatmode:

```bash
# In any session
Read context/architecture.context.md
Read context/state-management.context.md
```

---

## Troubleshooting

### Memory Not Loading in IDE

**Symptom**: IDE session starts without memory context

**Check**:
1. Verify `.claude/CLAUDE.md` has `@memory/` references
2. Verify `memory/` directory exists with 6 files
3. Try manual load: `/load-memory`
4. Check IDE logs for errors

**Fix**:
```bash
# Verify memory files exist
ls -lh memory/*.md

# Should show 6 files, ~123 lines total
wc -l memory/*.md

# Test manual load
/load-memory
```

### CLI Not Loading AGENTS.md

**Symptom**: Context not loading in CLI sessions

**Check**:
1. Verify `AGENTS.md` exists at repo root
2. Check `AGENTS.md` syntax (run `npm run agents:check`)
3. Verify memory/ and context/ directories exist

**Fix**:
```bash
# Regenerate AGENTS.md
npm run agents:compile

# Validate
npm run agents:check

# Test with correct syntax
claude --append-system-prompt "$(cat AGENTS.md)" "List loaded files"
```

### Context Files Not Loading

**Symptom**: Memory loads but context doesn't

**Check**:
1. Using chatmode? Context only loads via chatmode
2. Verify chatmode file has `includes: context:` section
3. Verify context files exist in `context/`

**Fix**:
```bash
# Check context files exist
ls -lh context/*.md

# Should show 6 files
# Regenerate AGENTS.md to pick up context files
npm run agents:compile

# Load chatmode + context manually
claude \
  --append-system-prompt "$(cat .github/chatmodes/backend-dev.chatmode.md)" \
  --append-system-prompt "$(cat context/architecture.context.md)" \
  "test"
```

### Out of Sync Errors

**Symptom**: `npm run agents:check` fails

**Meaning**: `AGENTS.md` out of sync with source files

**Fix**:
```bash
# Regenerate
npm run agents:compile

# Validate
npm run agents:check

# Commit if changed
git add AGENTS.md
git commit -m "chore: regenerate AGENTS.md"
```

---

## Metrics & Validation

### Expected Memory Footprint

| Component | Files | Lines | Tokens | % of Budget |
|-----------|-------|-------|--------|-------------|
| Memory (baseline) | 6 | 123 | ~2.5k | 1.3% |
| Context (on-demand) | 6 | 569 | ~11k | 5.5% |
| **Total Loaded** | 12 | 692 | ~13.5k | ~7% |
| **Available** | - | - | ~186k | **93%** |

### Validation Checklist

**IDE Auto-Load**:
- [ ] New session shows memory content
- [ ] Total baseline: 123 lines
- [ ] Load time: <5 seconds
- [ ] Context budget: ~1.3% used

**CLI Manual Load**:
- [ ] `--append-system-prompt` loads AGENTS.md content
- [ ] Memory files included
- [ ] Chatmode/context loaded via additional `--append-system-prompt`
- [ ] Total: ~7% budget used

**Manual Load**:
- [ ] `/load-memory` command works
- [ ] All 6 files read successfully
- [ ] Confirmation message shown

**Sync**:
- [ ] `npm run agents:check` passes
- [ ] No drift between AGENTS.md and source files

---

## Best Practices

### For Developers

✅ **DO**:
- Let IDE auto-load handle memory (no manual intervention)
- Use chatmodes for role-specific context loading
- Run `npm run agents:compile` after adding/modifying primitives
- Validate with `npm run agents:check` before committing

❌ **DON'T**:
- Manually load memory unless auto-load fails
- Load all context files at once (use chatmodes)
- Edit AGENTS.md directly (use compiler script)
- Skip validation after changes

### For Memory Updates

**Weekly**:
- Update `memory/project.memory.md` with decisions/patterns
- Review `memory/phase-status.memory.md` for blockers

**Monthly**:
- Audit memory files vs actual state
- Prune stale entries
- Update metrics in `.claude/config.yml`

**After Major Changes**:
- Update relevant memory files
- Regenerate AGENTS.md: `npm run agents:compile`
- Validate: `npm run agents:check`
- Commit both changes together

---

## References

- **Memory Architecture V2**: `docs/agentic-workflow/MEMORY_ARCHITECTURE_V2.md`
- **AI-Native Framework**: `docs/agentic-workflow/AI-NATIVE-IMPLEMEMTATION-AID.md`
- **CLI Presets**: `docs/agentic-workflow/CLI_PRESETS.md`
- **SDLC Taxonomy**: `docs/patterns/SDLC_DOCS_TAXONOMY.md`
- **Config**: `.claude/config.yml`

---

**Next Review**: 2025-12-03
**Owner**: Engineering Enablement
**Status**: Production
