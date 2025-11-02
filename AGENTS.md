# PT-2 Agent Context Map
inherit: none
appliesTo: ["**/*"]
includes:
  instructions:
    - .github/instructions/security.instructions.md
    - .github/instructions/backend.instructions.md
    - .github/instructions/frontend.instructions.md
    - .github/instructions/testing.instructions.md
  chatmodes:
    - .github/chatmodes/backend-dev.chatmode.md
    - .github/chatmodes/frontend-dev.chatmode.md
    - .github/chatmodes/reviewer.chatmode.md
  prompts:
    - .github/prompts/implement-from-spec.prompt.md
    - .github/prompts/debug-and-propose.prompt.md
    - .github/prompts/refactor.prompt.md
  context:
    - context/api-security.context.md
    - context/db.context.md
memory:
  - memory/project.memory.md
notes:
  - "See docs/patterns/SDLC_DOCS_TAXONOMY.md for documentation ownership."
  - "Subdirectories may supply their own AGENTS.md inheriting from this file."
