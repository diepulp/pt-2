# ADR-006: RatingSlip Financial Field Removal

**Status**: Accepted — 2025-10-19  
**Decision A**: Remove financial fields from `ratingslip`; keep finance in PlayerFinancialService.

## Context

**SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §1720-1806](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md) (RatingSlipService)

The Service Responsibility Matrix establishes the canonical stance on rating slip boundaries:
- **DOES NOT STORE**: Reward balances or points; **Loyalty** remains the sole source of truth (SRM:1732-1733)
- **OWNS**: Telemetry only (`average_bet`, `start_time`, `end_time`, `game_settings`, `seat_number`, `status`, `policy_snapshot`) (SRM:1725-1730)
- **BOUNDED CONTEXT**: "What gameplay activity occurred?" (SRM:1735)

This ADR extends that principle to financial data:
- Monetary truth must live in `player_financial_transaction` (PFT) for auditability, reversals, and RLS isolation.
- `rating_slip` remains telemetry/performance only (no financial data, no reward balances).
- Backward compatibility is required for existing consumers.

## Decision

Remove `cash_in`, `chips_brought`, `chips_taken` from `ratingslip`. Provide a plain, backward-compatible view; add targeted indexes to PFT. Only materialize if p95 > 100 ms.

## Implementation

1.  **Views**

    ```sql
    CREATE OR REPLACE VIEW visit_financial_summary AS
    SELECT
      visit_id,
      COALESCE(SUM(cash_in), 0)::numeric         AS total_cash_in,
      COALESCE(SUM(chips_brought), 0)::numeric   AS total_chips_brought,
      COALESCE(SUM(chips_taken), 0)::numeric     AS total_chips_taken
    FROM player_financial_transaction
    GROUP BY visit_id;

    CREATE OR REPLACE VIEW ratingslip_with_financials AS
    SELECT r.*, vfs.total_cash_in AS cash_in,
           vfs.total_chips_brought AS chips_brought,
           vfs.total_chips_taken AS chips_taken
    FROM ratingslip r
    LEFT JOIN visit_financial_summary vfs ON vfs.visit_id = r.visit_id;
    ```

2.  **Indexes**

        ```sql
        CREATE INDEX IF NOT EXISTS idx_pft_visit_id       ON player_financial_transaction(visit_id);

    CREATE INDEX IF NOT EXISTS idx_pft_player_id ON player_financial_transaction(player_id);
    CREATE INDEX IF NOT EXISTS idx_pft_rating_slip_id ON player_financial_transaction(rating_slip_id);
    CREATE INDEX IF NOT EXISTS idx_pft_created_at_desc ON player_financial_transaction(created_at DESC);

    ```

    ```

3.  App/Query Updates
    Migrate reads to ratingslip_with_financials or explicit joins to visit_financial_summary.
4.  Performance SLO & Escalation
    Track p95 via pg_stat_statements. Promote visit_financial_summary to materialized only if p95 > 100 ms and freshness requirements allow
5.  RLS/Security
    PFT remains RLS-protected; expose aggregates via views (consider security_barrier) and grant SELECT only on the views to non-finance roles.
6.  Migration Order Create views & indexes → update readers → remove columns from ratingslip in a follow-up migration → keep the compatibility view through one deprecation cycle.

**Rollback**

Re-add dropped columns to ratingslip (nullable), backfill from visit_financial_summary, and drop views if necessary.
Because the compatibility view mirrors the legacy shape, reader rollbacks are non-breaking.

**Deprecation** 
Announce removal of the compatibility view in one release cycle; track consumers; delete once all have migrated.



