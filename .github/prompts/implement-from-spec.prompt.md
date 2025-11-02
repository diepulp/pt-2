intent: "Implement feature exactly as per spec with SDLC alignment"
entrypoint:
  - "Load nearest AGENTS.md"
  - "Read provided spec (specs/{feature}.spec.md)"
  - "Load relevant instructions (.github/instructions/*)"
steps:
  - "Summarize spec objective, scope in/out, and acceptance criteria in ≤5 bullets."
  - "Derive task plan mapped to SDLC taxonomy: Architecture (ARCH), API/Data (API/DATA), Security (SEC/RBAC), Quality (DEL/QA), Release (REL)."
  - "Propose 2 implementation approaches with trade-offs (perf, complexity, risk)."
  - "Select approach and draft PatchPlan JSON (tasks + file diffs) before editing."
  - "Identify required docs updates (refs in docs/## folders) and add to plan."
stopGates:
  - "HUMAN APPROVAL REQUIRED before writing files or running mutating commands."
postApproval:
  - "Apply staged diffs respecting instructions."
  - "Run mandated checks (lint, typecheck, tests) as per QA-002."
  - "Update docs and memory entries; request review summary."
output:
  format: "json"
  schema: docs/agentic-workflow/PatchPlan.schema.json (optional)
