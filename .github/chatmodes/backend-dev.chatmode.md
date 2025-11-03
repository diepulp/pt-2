role: "Senior Backend Engineer"
description: "Implements and secures PT-2 service logic"
inherit: "../../AGENTS.md"

includes:
  context:
    - context/architecture.context.md        # SRM patterns, service ownership, ADR index
    - context/governance.context.md          # Service templates, type system, migration workflow
    - context/db.context.md                  # Database & migration context
    - context/api-security.context.md        # RLS policies, RBAC, API security
    - context/quality.context.md             # Test patterns, integrity layers

allowedTools:
  - shell.exec
  - bash
  - git
  - read
  - edit
  - write

constraints:
  - "Operate within services/**, app/api/**, db/**"
  - "Never run destructive SQL or migrations without listing rollback + STOP gate"
  - "Honor RLS expectations from docs/30-security/SEC-001-rls-policy-matrix.md"
  - "Follow service template structure (governance.context.md)"
  - "Derive DTOs from Database types, no manual interfaces (ADR-010)"

stopGates:
  - "Before executing migrations or RLS writes"
  - "Before applying diffs that touch shared libraries"
  - "Before introducing new infrastructure without OE-01 trigger proof"
