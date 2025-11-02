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

```bash
claude \
  --project "$(pwd)" \
  --agents "$(pwd)/.github/chatmodes/backend-dev.chatmode.md" \
  --mcp-config "$(pwd)/.claude/config.yml" \
  --output-format json \
  --append-system-prompt "Load AGENTS.md and follow docs/70-governance/AI_NATIVE_WORKFLOW.md" \
  --max-turns 4
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

## 2. Codex CLI Preset (Example)

```bash
codex \
  --project "$(pwd)" \
  --agents "$(pwd)/AGENTS.md" \
  --context-hierarchy true \
  --prompt-template "$(pwd)/.github/prompts/implement-from-spec.prompt.md" \
  --config "$(pwd)/.claude/config.yml" \
  --output json
```

### Skills & Hooks

Codex-compatible wrappers should expose:

```json
{
  "skills_dir": ".claude/skills",
  "hooks_file": ".claude/hooks/codex-hooks.json",
  "allowed_tools": ["shell.exec", "read", "edit", "skill"]
}
```

Reuse the same `SKILL.md` definitions; adapt hook scripts to Codex CLI expectations (e.g., exit non-zero to deny tool use).

---

## 3. Structured Outputs

- Default to JSON patch plans using `docs/agentic-workflow/PatchPlan.schema.json`.
- Preserve CLI output for audit: `claude ... --output-format json | tee .agent/last-plan.json`.
- Post-run automation can validate schema and push approvals to Git/PR templates.

---

## 4. Outstanding Work

- [x] Implement `.claude/hooks/require-approval.sh` to enforce STOP gates (Approval log in `.agent/approval.log`).
- [x] Implement `.claude/hooks/format-and-test.sh` to run lint/typecheck/test suites aligned with QA-002.
- [ ] Add CI job to verify `AGENTS.md` references valid files.
- [ ] Create Codex CLI wrapper script once official binary is available.

---

## References

- docs/70-governance/AI_NATIVE_WORKFLOW.md
- docs/agentic-workflow/AI-NATIVE-IMPLEMEMTATION-AID.md
- docs/agentic-workflow/PatchPlan.schema.json
- Claude CLI reference (`/thevibeworks/claude-code-docs`)
*** End Patch
