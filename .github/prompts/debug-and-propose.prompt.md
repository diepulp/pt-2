intent: "Diagnose defects and recommend safe remediations"
entrypoint:
  - "Load AGENTS.md context"
  - "Gather failure evidence (logs, tests, user reports)"
steps:
  - "State the observed failure and impacted SDLC docs (e.g., SEC, QA)."
  - "Trace root cause with file:line references; note SRM domains."
  - "List 2–3 remediation options with risk analysis (security, data, ops)."
  - "Recommend the safest option aligned to SDLC taxonomy; justify."
  - "Outline validation plan (tests, docs, approvals)."
stopGates:
  - "Pause before applying code changes; seek approval."
  - "Explicit STOP for high-risk areas (RLS, migrations, public APIs)."
output:
  format: "markdown"
  sections:
    - Summary
    - RootCause
    - Options
    - Recommendation
    - ValidationPlan
