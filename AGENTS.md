# PT-2 Agent Context Map
inherit: none
appliesTo: ["**/*"]

includes:
  instructions:
    - .github/instructions/backend.instructions.md
    - .github/instructions/frontend.instructions.md
    - .github/instructions/security.instructions.md
    - .github/instructions/testing.instructions.md
  chatmodes:
    - .github/chatmodes/backend-dev.chatmode.md
    - .github/chatmodes/frontend-dev.chatmode.md
    - .github/chatmodes/reviewer.chatmode.md
  prompts:
    - .github/prompts/debug-and-propose.prompt.md
    - .github/prompts/implement-from-spec.prompt.md
    - .github/prompts/refactor.prompt.md
  context:
    - context/api-security.context.md
    - context/architecture.context.md
    - context/db.context.md
    - context/governance.context.md
    - context/quality.context.md
    - context/state-management.context.md

memory:
  - memory/anti-patterns.memory.md
  - memory/architecture-decisions.memory.md
  - memory/domain-glossary.memory.md
  - memory/phase-status.memory.md
  - memory/project.memory.md
  - memory/service-catalog.memory.md

notes:
  - "See docs/patterns/SDLC_DOCS_TAXONOMY.md for documentation ownership."
  - "Subdirectories may supply their own AGENTS.md inheriting from this file."
  - "Supabase migrations MUST follow docs/60-release/MIGRATION_NAMING_STANDARD.md (YYYYMMDDHHMMSS_descriptive_name.sql)."
