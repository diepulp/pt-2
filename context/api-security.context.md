# API & Security Context
docs:
  - docs/25-api-data/README.md
  - docs/30-security/SEC-001-rls-policy-matrix.md
  - docs/30-security/SEC-002-casino-scoped-security-model.md
  - docs/30-security/SEC-003-rbac-matrix.md
  - docs/40-quality/QA-002-quality-gates.md
principles:
  - "JWT claims: casino_id mandatory; staff_role enumerations (`dealer`, `pit_boss`, `admin`), service claims (`cashier`, `compliance`, `reward_issuer`, `automation`)."
  - "Rate limiting defaults: 60 read / 10 write req/min/staff (docs/70-governance/FRONT_END_CANONICAL_STANDARD.md)."
  - "All mutations require idempotency keys or natural-key guards."
  - "RLS policies anchored on SRM ownership; refer to SEC-001 matrix row."
  - "Audit every mutation to `audit_log` with correlation IDs."
checklist:
  - "List endpoints/actions touched with method + path."
  - "Identify RBAC roles impacted and confirm policy updates."
  - "Note secrets or token flows introduced/modified."
