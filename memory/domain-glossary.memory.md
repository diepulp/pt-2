# Domain Glossary Snapshot
last_updated: 2025-10-17
sources:
  - .claude/memory/domain-glossary.memory.md
  - docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md
  - docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
terms:
  casino_id: "Primary tenancy key; all casino-scoped tables include it."
  gaming_day: "Derived from casino_settings.gaming_day_start_time; used for finance/MTL aggregation."
  rating_slip: "Telemetry record of gameplay (no reward balances)."
  loyalty_ledger: "Append-only ledger storing reward transactions."
  visit: "Session entity representing patron time-on-property."
  staff_role: "Enum {dealer, pit_boss, admin}; extended by service claims (cashier, compliance, reward_issuer)."
  audit_log: "Cross-domain event log capturing mutation context & correlation IDs."
  rpc_issue_mid_session_reward: "Canonical Supabase RPC for issuing loyalty rewards atomically."
