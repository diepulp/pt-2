---
id: GOV-121
title: Agent CLI Presets (Claude & Codex)
owner: Engineering Enablement
status: Draft
affects: [GOV-120, SEC-001, QA-002]
created: 2025-11-02
last_review: 2025-11-02
---

## Purpose

Provide ready-to-run CLI configurations that load the AI-native scaffold (`AGENTS.md`, instructions, prompts, context, memory) for any compliant assistant. These presets are LLM-agnostic: substitute the executable (`claude`, `codex`, etc.) while keeping the same arguments.

---

## 1. Claude CLI Preset

**⚠️ Important**: Claude CLI's `--agents` flag expects inline JSON, NOT file paths. Use `--append-system-prompt` to load context files.

### Basic Usage

```bash
# Load full context (AGENTS.md + chatmode)
claude \
  --append-system-prompt "$(cat AGENTS.md)" \
  --append-system-prompt "$(cat .github/chatmodes/backend-dev.chatmode.md)" \
  --print \
  "Implement loyalty points feature"

# Shorter: Just AGENTS.md
claude --append-system-prompt "$(cat AGENTS.md)" "Review RLS policies"

# With JSON output
claude \
  --append-system-prompt "$(cat AGENTS.md)" \
  --print \
  --output-format json \
  "Generate migration plan"
```

### Role-Specific Presets

**Backend Development**:
```bash
claude \
  --append-system-prompt "$(cat .github/chatmodes/backend-dev.chatmode.md)" \
  --append-system-prompt "$(cat context/architecture.context.md context/governance.context.md context/db.context.md context/api-security.context.md context/quality.context.md)" \
  --print \
  "Create loyalty service following ADR-008"
```

**Frontend Development**:
```bash
claude \
  --append-system-prompt "$(cat .github/chatmodes/frontend-dev.chatmode.md)" \
  --append-system-prompt "$(cat context/state-management.context.md context/governance.context.md context/quality.context.md context/api-security.context.md)" \
  --print \
  "Implement player dashboard with React Query"
```

**Code Review**:
```bash
claude \
  --append-system-prompt "$(cat .github/chatmodes/reviewer.chatmode.md)" \
  --append-system-prompt "$(cat context/architecture.context.md context/governance.context.md context/quality.context.md context/api-security.context.md)" \
  --print \
  "Review changes in PR #123"
```

### Wrapper Scripts (Recommended)

Create convenience scripts to avoid repetitive commands:

**`scripts/claude-backend.sh`**:
```bash
#!/bin/bash
claude \
  --append-system-prompt "$(cat .github/chatmodes/backend-dev.chatmode.md)" \
  --append-system-prompt "$(cat context/architecture.context.md context/governance.context.md context/db.context.md context/api-security.context.md context/quality.context.md)" \
  "$@"
```

**`scripts/claude-frontend.sh`**:
```bash
#!/bin/bash
claude \
  --append-system-prompt "$(cat .github/chatmodes/frontend-dev.chatmode.md)" \
  --append-system-prompt "$(cat context/state-management.context.md context/governance.context.md context/quality.context.md context/api-security.context.md)" \
  "$@"
```

**Usage**:
```bash
chmod +x scripts/claude-backend.sh scripts/claude-frontend.sh

# Now use simplified commands
./scripts/claude-backend.sh --print "Create loyalty service"
./scripts/claude-frontend.sh --print "Implement dashboard"
```

### Add Skills

```bash
mkdir -p .claude/skills/rls-audit
cat <<'MD' > .claude/skills/rls-audit/SKILL.md
---
name: rls-audit
description: Inspect RLS policies for a given table and reference SEC-001
---
```

Update `~/.claude/settings.json` (or project override) to enable the Skill tool:

```json
{
  "setting_sources": ["user", "project"],
  "allowed_tools": ["Skill", "Read", "Write", "Bash"]
}
```

### Hooks (Safety + Observability)

Append to `~/.claude/hooks.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '\\\"\\(.tool_input.command)\\\"' >> ~/.claude/bash-log.txt"
          }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/require-approval.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/format-and-test.sh"
          }
        ]
      }
    ]
  }
}
```

> Ensure the hook scripts exist under `.claude/hooks/` (see TODO below).

---

## 2. Future Enhancements

### Potential --agents File Support

If Claude CLI adds native file-based `--agents` support in the future:

```bash
# Future syntax (not yet implemented)
claude --agents-file ./AGENTS.md "your task"
```

Until then, use wrapper scripts or `--append-system-prompt` approach documented above.

### Codex CLI Integration

When Codex CLI becomes available, similar wrapper pattern:

```bash
# Hypothetical Codex syntax
codex \
  --context "$(cat AGENTS.md)" \
  --mode backend \
  "your task"
```

Actual Codex syntax may differ - update this section when official CLI is released.

### Skills & Hooks Integration

Both Claude CLI and future Codex CLI should support:

```json
{
  "skills_dir": ".claude/skills",
  "hooks_file": ".claude/hooks/codex-hooks.json",
  "allowed_tools": ["shell.exec", "read", "edit", "skill"]
}
```

Reuse the same `SKILL.md` definitions; adapt hook scripts to CLI expectations (e.g., exit non-zero to deny tool use).

Hook scripts (`require-approval.sh`, `log-shell-command.sh`, `prevent-destructive.sh`, `lint-prompt.sh`, `format-and-test.sh`) should work with both IDEs and CLIs. Ensure these hooks run in CI dry runs so telemetry (`.agent/tool-usage.log`) stays populated.

---

## 3. Structured Outputs

**JSON Output Mode**:
```bash
# Generate structured plan
claude \
  --append-system-prompt "$(cat AGENTS.md)" \
  --print \
  --output-format json \
  "Create migration plan for loyalty service" | tee .agent/last-plan.json

# Validate against schema
npx ajv validate \
  -s docs/agentic-workflow/PatchPlan.schema.json \
  -d .agent/last-plan.json
```

**Benefits**:
- Machine-parseable output for automation
- Audit trail in `.agent/` directory
- Schema validation before execution
- Integration with PR templates and approval workflows

---

## 4. Package.json Scripts (Recommended)

Add convenience commands to `package.json`:

```json
{
  "scripts": {
    "ai:backend": "./scripts/claude-backend.sh --print",
    "ai:frontend": "./scripts/claude-frontend.sh --print",
    "ai:review": "./scripts/claude-reviewer.sh --print",
    "ai:plan": "claude --append-system-prompt \"$(cat AGENTS.md)\" --print --output-format json"
  }
}
```

**Usage**:
```bash
npm run ai:backend "Create loyalty service"
npm run ai:frontend "Implement dashboard"
npm run ai:review "Review PR #123"
npm run ai:plan "Migration plan for loyalty" > .agent/plan.json
```

---

## 5. Outstanding Work

- [x] Implement `.claude/hooks/require-approval.sh` to enforce STOP gates (Approval log in `.agent/approval.log`).
- [x] Implement `.claude/hooks/format-and-test.sh` to run lint/typecheck/test suites aligned with QA-002.
- [x] Document correct CLI syntax (no `--agents` file loading, use `--append-system-prompt`)
- [ ] Create wrapper scripts (`scripts/claude-backend.sh`, etc.)
- [ ] Add package.json convenience scripts
- [ ] Add CI job to verify `AGENTS.md` references valid files
- [ ] Update when Codex CLI becomes available

---

## 6. Troubleshooting

### Error: unknown option '--prompt'

**Problem**: Using `--prompt` flag
**Solution**: Pass prompt as positional argument

```bash
# Wrong
claude --prompt "test"

# Correct
claude "test"
```

### Error: --agents expects JSON

**Problem**: Passing file path to `--agents`
**Solution**: Use `--append-system-prompt` instead

```bash
# Wrong
claude --agents ./AGENTS.md "test"

# Correct
claude --append-system-prompt "$(cat AGENTS.md)" "test"
```

### Context files too large

**Problem**: Concatenating all context exceeds token limit
**Solution**: Load only relevant context for task

```bash
# Don't load everything
claude --append-system-prompt "$(cat context/*.md)" "test"  # ❌ Too much

# Load only what's needed
claude --append-system-prompt "$(cat context/architecture.context.md)" "test"  # ✅
```

---

## References

- **Claude CLI Syntax Guide**: docs/agentic-workflow/CLI_USAGE_CORRECTED.md
- **Memory Loading Guide**: docs/agentic-workflow/MEMORY_LOADING_GUIDE.md
- **AI-Native Framework**: docs/agentic-workflow/AI-NATIVE-IMPLEMEMTATION-AID.md
- **PatchPlan Schema**: docs/agentic-workflow/PatchPlan.schema.json
- **AI Workflow**: docs/70-governance/AI_NATIVE_WORKFLOW.md
- **Claude CLI Help**: `claude --help`

---

**Status**: Production (Corrected)
**Last Updated**: 2025-11-03
