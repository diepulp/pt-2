# Security Instructions (SEC/RBAC)
applyTo: ["**/*"]
scope: repository
docs:
  primary: docs/30-security/README.md
  supporting:
    - docs/30-security/SEC-001-rls-policy-matrix.md
    - docs/30-security/SEC-002-casino-scoped-security-model.md
    - docs/30-security/SEC-003-rbac-matrix.md
    - docs/30-security/SECURITY_TENANCY_UPGRADE.md
rules:
  - Enforce least privilege: every change touching data access must reference the applicable RLS policy from `SEC-001`.
  - Validate RBAC impact: confirm the affected roles in `SEC-003` and document updates when access shifts.
  - Handle secrets safely: prefer platform key stores; never log credentials or tokens.
  - Guarantee idempotency on write paths; add idempotency keys or conflict handling as needed.

rls_tenancy:
  - NO service keys in runtime (anon key + user context only).
  - ALL operations inject RLS context via SET LOCAL: getAuthContext() + injectRLSContext().
  - Canonical RLS pattern: auth.uid() = (select user_id from staff where id = current_setting('app.actor_id')::uuid) AND casino_id = current_setting('app.casino_id')::uuid.
  - NO complex OR trees in RLS policies (single deterministic path only).
  - RLS policies use current_setting() not JWT claims (avoids token bloat + stale claims).
  - Append-only ledgers (finance, loyalty, MTL) enforce RLS + block updates/deletes.

validation:
  checklist:
    - inputs_validated: "List user-facing inputs and the validation strategy (schema, zod, pg constraint)."
    - outputs_sanitized: "Confirm responses redact secrets and PII before logging or returning."
    - rls_reviewed: "Cite the `SEC-001` matrix row you verified or updated."
    - rbac_ack: "Note impacted roles from `SEC-003` or state 'none'."
    - rls_context: "Confirm withServerAction injects RLS context (getAuthContext + injectRLSContext)."
    - rls_pattern: "Verify RLS policies use canonical pattern (auth.uid + current_setting, no OR trees)."
    - service_keys: "Confirm NO service key usage in runtime code (grep SERVICE_ROLE_KEY)."
notes:
  - See docs/patterns/SDLC_DOCS_TAXONOMY.md §SEC/RBAC for lifecycle placement.
  - Migration to canonical RLS pattern staged per service (Priority: Finance → Loyalty → Visit → Others).
