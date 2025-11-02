# Security Instructions (SEC/RBAC)
applyTo: ["**/*"]
scope: repository
docs:
  primary: docs/30-security/README.md
  supporting:
    - docs/30-security/SEC-001-rls-policy-matrix.md
    - docs/30-security/SEC-002-casino-scoped-security-model.md
    - docs/30-security/SEC-003-rbac-matrix.md
rules:
  - Enforce least privilege: every change touching data access must reference the applicable RLS policy from `SEC-001`.
  - Validate RBAC impact: confirm the affected roles in `SEC-003` and document updates when access shifts.
  - Handle secrets safely: prefer platform key stores; never log credentials or tokens.
  - Guarantee idempotency on write paths; add idempotency keys or conflict handling as needed.
validation:
  checklist:
    - inputs_validated: "List user-facing inputs and the validation strategy (schema, zod, pg constraint)."
    - outputs_sanitized: "Confirm responses redact secrets and PII before logging or returning."
    - rls_reviewed: "Cite the `SEC-001` matrix row you verified or updated."
    - rbac_ack: "Note impacted roles from `SEC-003` or state 'none'."
notes:
  - See docs/patterns/SDLC_DOCS_TAXONOMY.md §SEC/RBAC for lifecycle placement.
