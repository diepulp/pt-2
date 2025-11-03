# Claude CLI Usage Guide (Corrected)

**Date**: 2025-11-03
**Status**: Production
**Issue**: Previous docs had incorrect `--agents ./AGENTS.md` syntax

---

## ⚠️ Important Corrections

**WRONG** (from previous docs):
```bash
claude --agents ./AGENTS.md --prompt "test"
# Error: unknown option '--prompt'
# Error: --agents expects JSON, not file path
```

**CORRECT**:
```bash
# Basic usage (prompt as argument)
claude "test"

# With print mode (non-interactive)
claude --print "test"

# With system prompt
claude --system-prompt "You are a backend engineer" "test"
```

---

## Claude CLI Syntax Reference

### Basic Commands

```bash
# Interactive session (default)
claude "Your prompt here"

# Print mode (non-interactive, for pipes)
claude --print "Your prompt here"

# Continue most recent conversation
claude --continue "Follow-up question"

# Resume specific conversation
claude --resume [sessionId] "Your prompt"
```

### System Prompts

```bash
# Replace system prompt
claude --system-prompt "You are a backend engineer" "Your task"

# Append to default system prompt
claude --append-system-prompt "Additional context" "Your task"
```

### Output Formats

```bash
# Text output (default)
claude --print "test"

# JSON output (structured)
claude --print --output-format json "test"

# Streaming JSON
claude --print --output-format stream-json "test"
```

### Model Selection

```bash
# Use specific model alias
claude --model sonnet "test"
claude --model opus "test"
claude --model haiku "test"

# Use full model name
claude --model claude-sonnet-4-5-20250929 "test"
```

### Tools

```bash
# Allow specific tools
claude --allowed-tools "Bash,Edit,Read" --print "test"

# Disable all tools
claude --tools "" --print "test"

# Use default tools
claude --tools "default" --print "test"
```

---

## Loading Memory in CLI

### Problem: No File-Based --agents Flag

Claude CLI's `--agents` flag expects **inline JSON**, NOT a file path:

```bash
# This does NOT work
claude --agents ./AGENTS.md "test"  # ❌ Error

# This works (inline JSON)
claude --agents '{"reviewer": {"description": "Code reviewer", "prompt": "Review code carefully"}}' "test"  # ✅
```

### Solution: Use --append-system-prompt

To load AGENTS.md content, read the file and pass via system prompt:

```bash
# Option 1: Append AGENTS.md content
claude --append-system-prompt "$(cat AGENTS.md)" "Your task"

# Option 2: Load memory files
claude --append-system-prompt "$(cat memory/*.md)" "Your task"

# Option 3: Load specific context
claude --append-system-prompt "$(cat context/architecture.context.md)" "Your task"
```

---

## Recommended CLI Workflows

### Backend Development

```bash
# Load backend context
claude --append-system-prompt "$(cat .github/chatmodes/backend-dev.chatmode.md)" \
  --append-system-prompt "$(cat context/architecture.context.md)" \
  --append-system-prompt "$(cat context/governance.context.md)" \
  --print \
  "Create loyalty service following ADR-008"
```

### Frontend Development

```bash
# Load frontend context
claude --append-system-prompt "$(cat .github/chatmodes/frontend-dev.chatmode.md)" \
  --append-system-prompt "$(cat context/state-management.context.md)" \
  --append-system-prompt "$(cat context/governance.context.md)" \
  --print \
  "Implement player dashboard with React Query"
```

### Code Review

```bash
# Load reviewer context
claude --append-system-prompt "$(cat .github/chatmodes/reviewer.chatmode.md)" \
  --append-system-prompt "$(cat context/architecture.context.md)" \
  --append-system-prompt "$(cat context/quality.context.md)" \
  --print \
  "Review changes in PR #123"
```

---

## Helper Scripts (Recommended)

Since the CLI syntax is verbose, create wrapper scripts:

### Backend CLI Script

```bash
#!/bin/bash
# scripts/claude-backend.sh

cat <<'PROMPT' | claude --append-system-prompt "$(cat .github/chatmodes/backend-dev.chatmode.md)" --append-system-prompt "$(cat context/architecture.context.md context/governance.context.md context/db.context.md context/api-security.context.md context/quality.context.md)" "$@"
PROMPT
```

Usage:
```bash
chmod +x scripts/claude-backend.sh
./scripts/claude-backend.sh "Create loyalty service"
```

### Frontend CLI Script

```bash
#!/bin/bash
# scripts/claude-frontend.sh

claude --append-system-prompt "$(cat .github/chatmodes/frontend-dev.chatmode.md)" \
  --append-system-prompt "$(cat context/state-management.context.md context/governance.context.md context/quality.context.md context/api-security.context.md)" \
  "$@"
```

Usage:
```bash
chmod +x scripts/claude-frontend.sh
./scripts/claude-frontend.sh --print "Implement player dashboard"
```

### Reviewer CLI Script

```bash
#!/bin/bash
# scripts/claude-reviewer.sh

claude --append-system-prompt "$(cat .github/chatmodes/reviewer.chatmode.md)" \
  --append-system-prompt "$(cat context/architecture.context.md context/governance.context.md context/quality.context.md context/api-security.context.md)" \
  "$@"
```

Usage:
```bash
chmod +x scripts/claude-reviewer.sh
./scripts/claude-reviewer.sh --print "Review PR #123"
```

---

## IDE vs CLI Comparison

| Feature | IDE (Claude Code) | CLI (claude command) |
|---------|-------------------|----------------------|
| **Memory Loading** | Auto via `@memory/` refs | Manual via `--append-system-prompt` |
| **AGENTS.md** | Future support | No file loading yet |
| **Chatmodes** | Load automatically | Read file + pass to `--append-system-prompt` |
| **Context Files** | Load via chatmode | Read files + concatenate |
| **Interactivity** | Full IDE features | Interactive or `--print` mode |
| **Best For** | Development workflow | Automation, CI/CD, scripts |

---

## Migration from Old Docs

### Old (Incorrect)

```bash
# This was documented but doesn't work
claude --agents ./AGENTS.md --prompt "test"
```

### New (Correct)

```bash
# Prompt as argument (no --prompt flag)
claude "test"

# Load context manually
claude --append-system-prompt "$(cat AGENTS.md)" "test"

# Or use wrapper script
./scripts/claude-backend.sh "test"
```

---

## Future Enhancements

### Potential --agents File Support

If Claude CLI adds file-based `--agents` support in the future:

```bash
# Future (not yet implemented)
claude --agents-file ./AGENTS.md "test"
```

Until then, use `--append-system-prompt` or wrapper scripts.

---

## Troubleshooting

### Error: unknown option '--prompt'

**Problem**: Using `--prompt` flag
**Solution**: Pass prompt as argument

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

- **Claude CLI Help**: `claude --help`
- **Memory Loading Guide**: `docs/agentic-workflow/MEMORY_LOADING_GUIDE.md`
- **CLI Presets**: `docs/agentic-workflow/CLI_PRESETS.md` (needs update)
- **AI-Native Framework**: `docs/agentic-workflow/AI-NATIVE-IMPLEMEMTATION-AID.md`

---

**Next Steps**:
1. Create wrapper scripts for common workflows
2. Update CLI_PRESETS.md with correct syntax
3. Update MEMORY_LOADING_GUIDE.md CLI sections
4. Add to package.json scripts for convenience

**Status**: Production (Corrected)
**Last Updated**: 2025-11-03
