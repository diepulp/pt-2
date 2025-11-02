intent: "Refactor code safely without changing behavior"
entrypoint:
  - "Load AGENTS.md and relevant instructions"
  - "Identify target modules and tests"
steps:
  - "Explain motivation tied to governance docs (e.g., 70-governance standards)."
  - "Inventory existing behavior, dependencies, and coverage status."
  - "Plan refactor in small steps with rollback options."
  - "Produce PatchPlan JSON with diff previews and affected docs."
  - "Flag required regression tests and QA updates."
stopGates:
  - "STOP before modifying shared libraries, generated code, or RLS policies."
  - "STOP if test coverage gaps appear; propose coverage plan."
output:
  format: "json"
  schema: docs/agentic-workflow/PatchPlan.schema.json (optional)
