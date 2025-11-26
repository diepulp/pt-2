  ---
  🔄 Execution Flow Overview

  sequenceDiagram
      participant Dev as Developer
      participant CLI as Claude CLI
      participant Hooks as Hook Engine
      participant LLM as Claude Model
      participant FS as File System
      participant Logs as Telemetry Logs

      Dev->>CLI: claude --agents AGENTS.md --prompt implement.prompt.md
      CLI->>Hooks: UserPromptSubmit event
      Hooks->>Hooks: lint-prompt.sh validates structure
      Hooks-->>CLI: ✅ Prompt approved
      CLI->>FS: Load AGENTS.md + instructions + memory
      CLI->>LLM: Send aggregated context + user prompt
      LLM->>CLI: Response: "I'll create service X..."
      LLM->>CLI: Tool call: Write(service.ts)
      CLI->>Hooks: PreToolUse event (Write)
      Hooks->>Logs: Log to .agent/tool-usage.log
      Hooks->>FS: Check .agent/approval.log
      Hooks-->>CLI: ❌ DENIED - no approval
      CLI->>Dev: "Approval required. Add to .agent/approval.log"
      Dev->>FS: echo "APPROVED: Dev @ timestamp" >> .agent/approval.log
      Dev->>CLI: Retry
      CLI->>Hooks: PreToolUse event (Write)
      Hooks->>FS: Check .agent/approval.log
      Hooks-->>CLI: ✅ APPROVED
      CLI->>FS: Write service.ts
      CLI->>Hooks: PostToolUse event (Write)
      Hooks->>Hooks: format-and-test.sh runs lint/type/test
      Hooks-->>CLI: ✅ All checks pass
      CLI->>Dev: "File written successfully"
      CLI->>FS: Append to .agent/tool-usage.log

  ---
  🎯 Mechanism Breakdown

  1. Invocation Layer (Developer → CLI)

  claude \
    --project "$(pwd)" \                          # Sets $CLAUDE_PROJECT_DIR
    --agents "$(pwd)/.github/chatmodes/backend-dev.chatmode.md" \  # Context entry point
    --mcp-config "$(pwd)/.claude/config.yml" \    # MCP server configs (Serena, etc.)
    --output-format json \                        # Structured PatchPlan output
    --append-system-prompt "Load AGENTS.md and follow docs/70-governance/AI_NATIVE_WORKFLOW.md" \
    --max-turns 4                                 # Prevent infinite loops

  What Happens:
  1. CLI sets environment variable: CLAUDE_PROJECT_DIR=/home/diepulp/projects/pt-2
  2. Loads .github/chatmodes/backend-dev.chatmode.md (which references AGENTS.md)
  3. Connects to MCP servers (Serena for code navigation, Context7 for docs, etc.)
  4. Injects system prompt telling Claude to follow AI-native workflow rules
  5. Limits conversation to 4 turns to prevent runaway execution

  ---
  2. Context Loading Layer (CLI → File System)

  When --agents flag is provided, CLI follows this hierarchical loading pattern:

  # .github/chatmodes/backend-dev.chatmode.md
  role: "Senior Backend Engineer"
  inherit: "../../AGENTS.md"  # ← CLI loads this next
  allowedTools:
    - shell.exec
    - read
    - write
  constraints:
    - "Stay within backend paths: services/**, db/**"

  # AGENTS.md (compiled by scripts/compile_agents.mjs)
  includes:
    instructions:
      - .github/instructions/backend.instructions.md      # ← CLI loads
      - .github/instructions/security.instructions.md     # ← CLI loads
      - .github/instructions/testing.instructions.md      # ← CLI loads
    context:
      - context/db.context.md                             # ← CLI loads
      - context/api-security.context.md                   # ← CLI loads
  memory:
    - memory/project.memory.md                            # ← CLI loads
    - memory/anti-patterns.memory.md                      # ← CLI loads
    - memory/architecture-decisions.memory.md             # ← CLI loads

  Result: Single aggregated context sent to LLM with:
  - Role definition (backend engineer)
  - Behavioral rules (security, testing, backend patterns)
  - Domain knowledge (DB patterns, API security)
  - Historical decisions (project memory, anti-patterns, ADRs)

  ---
  3. Hook Lifecycle (CLI ↔ Hook Scripts)

  Hooks are defined in .claude/hooks/codex-hooks.json:

  {
    "hooks": {
      "UserPromptSubmit": [
        {
          "matcher": ".*",
          "hooks": [
            {
              "type": "command",
              "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/lint-prompt.sh"
            }
          ]
        }
      ],
      "PreToolUse": [
        {
          "matcher": "shell.exec",
          "hooks": [
            {
              "type": "command",
              "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/log-shell-command.sh"
            },
            {
              "type": "command",
              "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/prevent-destructive.sh"
            }
          ]
        },
        {
          "matcher": "write|edit",
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
          "matcher": "write|edit",
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

  Hook Execution Flow

  A) UserPromptSubmit Hook
  # Triggered when user sends a message
  User: "Implement loyalty points service"
    ↓
  lint-prompt.sh receives prompt text via stdin
    ↓
  Validates: Has heading? Has bullets? Has STOP gate?
    ↓
  Exit 0 (approve) or Exit 1 (deny with message)

  B) PreToolUse Hook (Example: Write Tool)
  # Triggered before Write tool executes
  LLM: Write(path="services/loyalty.ts", content="...")
    ↓
  require-approval.sh receives tool_input JSON via stdin
    ↓
  Checks: grep -q "APPROVED.*$(date +%Y-%m-%d)" .agent/approval.log
    ↓
  Exit 0 (allow) or Exit 1 (block with "Add approval entry")

  C) PreToolUse Hook (Example: Shell)
  # Triggered before Bash tool executes
  LLM: Bash(command="git reset --hard")
    ↓
  prevent-destructive.sh receives command via stdin
    ↓
  Checks: Does command match "rm -rf|reset --hard|push --force"?
    ↓
  Exit 1 (block) with "Destructive command denied"

  D) PostToolUse Hook
  # Triggered after Write/Edit succeeds
  File written: services/loyalty.ts
    ↓
  format-and-test.sh runs
    ↓
  npm run lint:check  # ESLint validation
  npm run type-check  # TypeScript validation
  npm run test        # Jest tests
    ↓
  Exit 0 (all pass) or Exit 1 (show errors)

  ---
  4. Skills API Layer (Encapsulated Workflows)

  Skills are mini-workflows packaged as .claude/skills/{name}/SKILL.md:

  # .claude/skills/rls-audit/SKILL.md
  ---
  name: rls-audit
  description: Inspect RLS policies for a given table and reference SEC-001
  parameters:
    - name: table_name
      type: string
      required: false
  ---

  # RLS Audit Skill

  ## Steps
  1. Read `docs/30-security/SEC-001-rls-policy-matrix.md`
  2. List policies for table (if provided) or all tables
  3. Validate:
     - Casino scoping (`casino_id` in USING clause)
     - Role alignment (admin, dealer, pit_boss)
     - No permissive catch-alls (`USING (true)`)
  4. Output audit report with gaps and remediation steps

  Invocation:
  # From prompt
  User: "Run rls-audit skill for players table"
    ↓
  LLM: Skill(command="rls-audit table_name=players")
    ↓
  CLI loads .claude/skills/rls-audit/SKILL.md
    ↓
  LLM follows steps in skill definition
    ↓
  Outputs audit report

  Alternative: CLI Direct
  claude --skill rls-audit --skill-args "table_name=players"

  ---
  5. Structured Outputs (Machine-Readable Plans)

  When --output-format json is set, LLM returns JSON conforming to schema:

  // PatchPlan.schema.json (referenced in CLI_PRESETS.md)
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "PatchPlan",
    "type": "object",
    "properties": {
      "tasks": {
        "type": "array",
        "items": { "type": "string" }
      },
      "files": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "path": { "type": "string" },
            "intent": { "type": "string" },
            "diff": { "type": "string" }
          },
          "required": ["path", "intent", "diff"]
        }
      },
      "risks": {
        "type": "array",
        "items": { "type": "string" }
      }
    },
    "required": ["tasks", "files"]
  }

  Execution:
  claude \
    --prompt .github/prompts/implement-from-spec.prompt.md \
    --output-format json \
    | tee .agent/last-plan.json

  Output (.agent/last-plan.json):
  {
    "tasks": [
      "Create loyalty service factory",
      "Define LoyaltyDTO types",
      "Implement points calculation",
      "Add integration tests"
    ],
    "files": [
      {
        "path": "services/loyalty/index.ts",
        "intent": "Service factory with explicit interface",
        "diff": "+export function createLoyaltyService(...)"
      },
      {
        "path": "services/loyalty/dto.ts",
        "intent": "Derive DTOs from Database types",
        "diff": "+export type LoyaltyDTO = Pick<Database..."
      }
    ],
    "risks": [
      "Schema change requires regenerating types",
      "Points calculation may conflict with existing ledger"
    ]
  }

  Post-Processing:
  # Automated approval workflow
  jq -r '.files[].path' .agent/last-plan.json | xargs git diff --cached --  # Preview
  read -p "Approve? (y/n): " approval
  if [[ $approval == "y" ]]; then
    echo "APPROVED: $USER @ $(date -Iseconds)" >> .agent/approval.log
    claude --apply .agent/last-plan.json  # Execute the plan
  fi

  ---
  6. Telemetry Layer (Audit Trail)

  All hook activity is logged to .agent/ directory:

  A) Tool Usage Log (.agent/tool-usage.log)
  2025-11-03T14:32:15Z    shell.exec      npm run lint:check
  2025-11-03T14:32:22Z    write           services/loyalty/index.ts
  2025-11-03T14:32:22Z    write           services/loyalty/dto.ts
  2025-11-03T14:32:30Z    shell.exec      npm run type-check
  2025-11-03T14:32:35Z    shell.exec      npm test services/loyalty

  B) Approval Log (.agent/approval.log)
  APPROVED: diepulp @ 2025-11-03T14:31:00Z
  APPROVED: diepulp @ 2025-11-03T16:45:00Z

  C) Blocked Commands (written to stderr, captured in CI logs)
  [2025-11-03T15:22:10Z] BLOCKED: git reset --hard (destructive command)
  [2025-11-03T15:30:45Z] BLOCKED: rm -rf node_modules (destructive command)

  ---
  🔬 Real-World Execution Example

  Scenario: Implement loyalty points feature from spec

  # 1. Developer invokes workflow
  claude \
    --agents .github/chatmodes/backend-dev.chatmode.md \
    --prompt .github/prompts/implement-from-spec.prompt.md \
    --output-format json \
    > .agent/loyalty-plan.json

  # 2. CLI loads context hierarchy
  # Loads: AGENTS.md → backend.instructions.md → security.instructions.md → db.context.md → project.memory.md

  # 3. UserPromptSubmit hook fires
  .claude/hooks/lint-prompt.sh
    ✅ Prompt has heading: "Implement loyalty points service"
    ✅ Prompt has acceptance criteria bullets
    ✅ Prompt includes STOP gate: "Stop before writing files"

  # 4. LLM processes spec and generates plan
  {
    "tasks": ["Create service", "Define DTOs", "Add tests"],
    "files": [
      {"path": "services/loyalty/index.ts", "diff": "..."},
      {"path": "services/loyalty/dto.ts", "diff": "..."}
    ]
  }

  # 5. Developer reviews plan
  jq -r '.files[].path' .agent/loyalty-plan.json
  # Output:
  # services/loyalty/index.ts
  # services/loyalty/dto.ts

  # 6. Developer approves
  echo "APPROVED: diepulp @ $(date -Iseconds)" >> .agent/approval.log

  # 7. Developer applies plan
  claude --apply .agent/loyalty-plan.json

  # 8. PreToolUse hooks fire for each file
  # Write(services/loyalty/index.ts)
    → log-shell-command.sh: Logs to .agent/tool-usage.log
    → require-approval.sh: Checks .agent/approval.log ✅
    → File written

  # Write(services/loyalty/dto.ts)
    → require-approval.sh: Checks .agent/approval.log ✅
    → File written

  # 9. PostToolUse hook fires
  .claude/hooks/format-and-test.sh
    → npm run lint:check ✅
    → npm run type-check ✅
    → npm test ✅

  # 10. Success! Telemetry captured
  cat .agent/tool-usage.log
  # 2025-11-03T17:15:00Z    write    services/loyalty/index.ts
  # 2025-11-03T17:15:01Z    write    services/loyalty/dto.ts
  # 2025-11-03T17:15:10Z    shell.exec    npm run lint:check
  # 2025-11-03T17:15:15Z    shell.exec    npm run type-check
  # 2025-11-03T17:15:25Z    shell.exec    npm test

  ---
  🔑 Key Mechanisms Summarized

  | Mechanism          | Purpose                         | Implementation                            | Output
           |
  |--------------------|---------------------------------|-------------------------------------------|-----------------------------
  ---------|
  | Context Loading    | Aggregate instructions + memory | --agents flag → hierarchical file loads   | Single rich context to LLM
           |
  | Hook Lifecycle     | Safety gates + observability    | Shell scripts triggered by CLI events     | Approval enforcement,
  telemetry logs |
  | Skills API         | Encapsulate workflows           | SKILL.md definitions loaded by Skill tool | Reusable mini-workflows
           |
  | Structured Outputs | Machine-readable plans          | --output-format json + JSON schema        | .agent/last-plan.json for
  automation |
  | Telemetry Capture  | Audit trail for compliance      | Hooks append to .agent/*.log files        | Weekly review logs, PR
  attachments   |

  ---
  🎓 Why This Design Works

  1. Deterministic Context: Same inputs (AGENTS.md + prompt) → same LLM context → predictable outputs
  2. Layered Safety: Multiple hooks prevent bad actions at different stages (lint → approve → execute → test)
  3. Audit Trail: Every tool use logged → compliance-ready workflow
  4. Composability: Skills + prompts + chat modes mix/match for different workflows
  5. LLM-Agnostic: Same primitives work with Claude CLI, Codex CLI, or any compatible agent

  ---
  📋 Outstanding Gaps (from CLI_PRESETS.md)

  ✅ Completed:
  - Hook scripts implemented (approval, destructive blocker, format/test)
  - Skills defined (rls-audit, docs-sync)
  - Telemetry logging operational

  🔴 Missing (blocks CI automation):
  - CI job to verify AGENTS.md references valid files
  - PatchPlan.schema.json creation
  - CLI usage documentation (docs/agentic-workflow/CLI_USAGE.md)
  - Missing chatmodes referenced  at `.github/chatmodes`

  ---