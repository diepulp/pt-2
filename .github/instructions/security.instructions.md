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
  - ALL operations inject RLS context via `getAuthContext()` + `injectRLSContext()` calling `set_rls_context()` (ADR-015 transaction-wrapped).
  - Canonical RLS pattern (ADR-015 Pattern C): `auth.uid() IS NOT NULL` AND casino/staff resolution via `COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid)` and `COALESCE(NULLIF(current_setting('app.actor_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid)`.
  - NO complex OR trees in RLS policies (single deterministic path only).
  - JWT app_metadata (`casino_id`, `staff_id`, `staff_role`) is required fallback for pooling; keep claims lean.
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
