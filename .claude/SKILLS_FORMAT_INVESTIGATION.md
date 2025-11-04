# Skills Format Investigation

**Date**: 2025-11-03
**Status**: ⚠️ Non-Standard Format Detected

---

## Issue

Skills in `.claude/skills/` directory use custom `SKILL.md` format that is **NOT documented in official Claude Code documentation**.

## Evidence

### Skills Directory Structure
```
.claude/skills/
├── docs-sync/
│   └── SKILL.md
└── rls-audit/
    └── SKILL.md
```

### Format Used
```yaml
---
name: skill-name
description: Skill description
inputs:
  param_name:
    type: string
    required: false
---

## Execution Checklist
1. Step one
2. Step two
```

### Context7 Research (Official Docs)

Searched Claude Code documentation (/anthropics/claude-code) - **ZERO mentions** of:
- `.claude/skills/` directory
- `SKILL.md` format
- Skills configuration

**Official formats documented**:
- ✅ Plugins (`.claude-plugin/plugin.json`)
- ✅ Commands (`.md` files in commands/)
- ✅ Agents (`.md` files in agents/)
- ✅ Hooks (`hooks.json`)
- ✅ MCP Servers (`mcpServers` config)

---

## Hypothesis: MCP Server Integration

Skills appear to be loaded via MCP (Model Context Protocol):

**Evidence**:
1. `.claude/settings.local.json` has `"enableAllProjectMcpServers": true`
2. Skills appear with `<location>managed</location>` tag
3. Slow loading time suggests external server parsing

**Likely mechanism**:
- Custom/built-in MCP server scans `.claude/skills/`
- Parses SKILL.md files
- Exposes via Skill tool
- Shows as "managed" resources

---

## Risks

❌ **Not officially documented** - May break in future updates
❌ **Slow loading** - Inefficient parsing/discovery
❌ **No validation** - Silent failures possible
❌ **No error messages** - Hard to debug issues
⚠️ **Custom format** - No official spec to validate against

---

## Recommendations

### Option 1: Convert to Official Plugins (Recommended)

**Structure**:
```
.claude/plugins/docs-sync/
├── .claude-plugin/
│   └── plugin.json
└── commands/
    └── docs-sync.md
```

**plugin.json**:
```json
{
  "name": "docs-sync",
  "version": "1.0.0",
  "description": "Validate architecture documentation",
  "commands": ["docs-sync"]
}
```

**Benefits**:
- ✅ Officially supported
- ✅ Faster loading (native system)
- ✅ Better error handling
- ✅ Future-proof

### Option 2: Document Current Implementation

If keeping skills format:

1. **Identify MCP server source**:
   - Check `~/.claude/settings.json` for mcpServers
   - Check if third-party tool (ccb?) provides skill support
   - Document exact loading mechanism

2. **Add validation**:
   - Create JSON schema for SKILL.md format
   - Add pre-commit hook to validate
   - Test skill loading on fresh Claude Code install

3. **Performance optimization**:
   - Profile skill loading time
   - Cache parsed skills if possible
   - Consider lazy loading

---

## Action Items

- [ ] Check `~/.claude/settings.json` for MCP configuration
- [ ] Identify what's providing skill support (ccb? custom MCP server?)
- [ ] Test skills on clean Claude Code installation
- [ ] Either:
  - [ ] Convert to official plugin format
  - [ ] Document custom implementation fully
- [ ] Add skill format to project documentation
- [ ] Consider performance improvements

---

## References

- **Claude Code Official Docs**: /anthropics/claude-code (via Context7)
- **Plugin Structure**: https://context7.com/anthropics/claude-code
- **MCP Servers**: https://modelcontextprotocol.io
- **Project Settings**: `.claude/settings.local.json`

---

**Status**: Investigation incomplete - need to identify skill loading source
**Priority**: Medium (working but non-standard)
**Owner**: Engineering Enablement
