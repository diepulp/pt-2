Scaffold Plan

  - Establish the repo scaffold from docs/agentic-workflow/AI-NATIVE-IMPLEMEMTATION-AID.md:14 by creating .github/
    instructions, .github/chatmodes, .github/prompts, context/, memory/, specs/, and a root AGENTS.md; migrate current .claude
    guidance into these agentic primitives while leaving compatibility shims during transition.
  - Author the foundational instruction sets (security, backend, frontend, testing) as *.instructions.md, pulling rule content
    from .claude/CLAUDE.md:6 and other memory files, and add validation checklists that mirror the stop-gates described in §5 of the
    aid.
  - Create role-specific chat modes (backend-dev, frontend-dev, reviewer) that map the behaviors already captured in .claude/agents/
    *.md; include tool constraints and scope filters so Context Engineering can auto-select the right rules.
  - Draft prompt workflows such as implement-from-spec.prompt.md and debug-and-propose.prompt.md that encode the multi-step gating
    logic and staged outputs recommended in §§2.3 and 4, enforcing STOP gates before write actions.
  - Seed reusable spec/memory/context templates (feature.spec.md, project.memory.md, api-security.context.md) so every workflow has
    deterministic inputs and domain context, accelerating decision logging and retrieval.

  Enhance Context Engineering

  - Replace the monolithic .claude/CLAUDE.md entry point with hierarchical AGENTS.md files (root and per-domain) that enumerate
    included instructions, contexts, and memory as illustrated in §3; keep .claude/CLAUDE.md as an index that points agents toward the
    compiled hierarchy during migration.
  - Rebuild .claude/config.yml:4 to reference the new memory directory and add context_strategy: hierarchical_agents, ensuring Claude CLI sessions follow the same loading order as IDE agents.
  - Introduce an automated “agents compiler” script (hooked to CI) that regenerates AGENTS.md from the instructions/chatmodes
    directories so configuration drift is detected early.

  Claude CLI, Skills, and Hooks

  - Use Claude CLI’s --agents flag (/thevibeworks/claude-code-docs:cli-reference.md) to load project-defined subagents that mirror the
    chat modes; package them into claude_args presets for repeatable workflows (--max-turns, --mcp-config, --output-format json for
    structured PatchPlan responses).
  - Stand up a .claude/skills/ tree that wraps routine tasks (e.g., “RLS Audit”, “Docs Sync”) in SKILL.md definitions; expose them via
    the Skills API (/thevibeworks/claude-code-docs:skills-guide.md) so both CLI and SDK sessions can invoke them as tools.
  - Configure hook matchers (/thevibeworks/claude-code-docs:hooks-guide.md) for PreToolUse events to enforce validation gates
    —e.g., deny destructive Bash commands, require human approval before Write|Edit, and log tool usage for audit traces; add
    UserPromptSubmit hooks that lint prompts against the Markdown engineering template before the run starts.
  - Combine hooks with structured outputs by defaulting CLI runs to --output-format json and capturing plans to .agent/patch-
    plan.json; post-hook scripts can auto-open the plan, run diff previews, or trigger spec/task syncs for compound decision support.
  - Let MPC-aware sessions leverage setting_sources=["user","project"] and allowed_tools=["Skill"] (/thevibeworks/claude-code-

  .claude Directory Improvements

  - Restore and normalize memory files (phase-status, service-catalog, domain glossary) that were deleted, then convert them into the
    memory/ directory referenced by the new scaffold with concise, high-signal entries.
  - Introduce .claude/hooks/ scripts that validate coverage thresholds, doc updates, and stop-gate acknowledgements post tool use,
    aligning with the reliability patterns in §6.
  - Deprecate ad-hoc agent descriptions in .claude/agents/ once their content is ported into the new chat mode templates, retaining
  2. Prioritize writing the instruction/chatmode/prompt templates and compiling AGENTS.md.

  Status & Adoption (2025-11-03)

  - ✅ `scripts/compile_agents.mjs` generates canonical `AGENTS.md`; run `npm run agents:compile` locally and `npm run agents:check` in CI to prevent drift.
  - ✅ Codex hooks defined in `.claude/hooks/codex-hooks.json` enforce approval gates, log `shell.exec` usage to `.agent/tool-usage.log`, and deny destructive commands up front.
  - ✅ Skills published under `.claude/skills/` (`rls-audit`, `docs-sync`) cover the routine security and documentation workflows called out in the aid.
  - 📈 Success metrics: (1) 100 % of sessions record approvals + shell usage, (2) `agents:check` passes on mainline CI, (3) hook audit log reviewed weekly for blocked destructive attempts.
  - 📋 Adoption steps: add a CI job (`agent-context-guard`) that runs `npm run agents:check`, collect approval/tool logs in PR templates, and review telemetry alongside QA gates.
