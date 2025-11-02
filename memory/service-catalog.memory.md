# Service Catalog Snapshot
last_verified: 2025-10-17
source: ".claude/memory/service-catalog.memory.md (full), docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md"
services:
  - name: CasinoService
    context: Foundational
    owns: ["casino", "casino_settings", "staff", "report"]
    notes: "Temporal authority for timezone, gaming day, compliance thresholds; exclusive write on casino_settings."
  - name: TableContextService
    context: Operational
    owns: ["gaming_table", "game_settings", "gaming_table_settings", "dealer_rotation"]
    notes: "Manages table lifecycle; RLS restricts write to admin/pit_boss."
  - name: VisitService
    context: Session
    owns: ["visit"]
    notes: "Handles check-in/out; ties sessions to casino scope."
  - name: RatingSlipService
    context: Telemetry
    owns: ["rating_slip"]
    notes: "Telemetry only; no reward balances; feeds loyalty RPC."
  - name: LoyaltyService
    context: Reward
    owns: ["loyalty_ledger", "player_loyalty"]
    notes: "Append-only ledger via rpc_issue_mid_session_reward; idempotency enforced."
  - name: PlayerFinancialService
    context: Finance
    owns: ["player_financial_transaction"]
    notes: "Cashier/compliance inserts via rpc_create_financial_txn; deletes disabled."
  - name: MTLService
    context: Compliance
    owns: ["mtl_entry", "mtl_audit_note"]
    notes: "AML/CTR monitoring; triggers derive gaming_day."
  - name: PerformanceService
    context: Observability
    owns: ["performance_metrics", "performance_alerts", "performance_thresholds", "performance_config"]
    notes: "Read-only observers; generates alerts across contexts."
