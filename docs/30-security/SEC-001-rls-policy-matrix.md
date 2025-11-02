---
id: SEC-001
title: Casino-Scoped RLS Policy Matrix
owner: Security
status: Draft
affects: []
created: 2025-11-02
last_review: 2025-11-02
---

## Overview

This matrix extracts the canonical Row-Level Security (RLS) expectations from the Service Responsibility Matrix (SRM) and consolidates them for every casino-scoped data set. Use it to verify that each schema change, policy, or RPC preserves the least-privilege model defined by the owning service.

## Core Principles

- Every casino-scoped table includes a non-null `casino_id` column that anchors ownership.
- Read policies constrain access to staff from the same `casino_id` and are further role-gated.
- Write paths are delegated to service-owned RPCs or role-specific policies; direct table writes must be disabled unless explicitly listed.
- Cross-context joins rely on declared foreign keys; implicit string-based joins are forbidden.
- Append-only ledgers (finance, loyalty, compliance) enforce idempotency and block deletes; corrections flow through supervised RPCs.

## Policy Matrix

| Context | Tables / Views | Read Access | Write Path | Notes |
| --- | --- | --- | --- | --- |
| CasinoService (Foundational) | `staff`, `casino_settings`, `report` | Staff in same `casino_id` (role-gated) | Admin (`staff_role = 'admin'`) and automation service accounts | `casino_settings` is the sole temporal authority; policies block cross-casino visibility. |
| Player & Visit (Identity & Session) | `player_casino`, `visit` | Casino staff in same `casino_id` | Enrollment/Visit services; admin override only | Membership writes funnel through enrollment workflows; prevents cross-property session leakage. |
| LoyaltyService (Reward) | `player_loyalty`, `loyalty_ledger` | Reward-authorized staff in same `casino_id` | `rpc_issue_mid_session_reward` (append-only) | RLS blocks direct ledger updates; idempotency enforced via `idempotency_key`. |
| TableContextService (Operational) | `game_settings`, `gaming_table`, `gaming_table_settings`, `dealer_rotation` | Operations staff for same `casino_id` | Admin + `pit_boss` roles | Trigger `assert_table_context_casino` enforces table/casino alignment. |
| RatingSlipService (Telemetry) | `rating_slip` | Casino staff in same `casino_id` | Authorized telemetry service roles | Policy snapshot and status updates limited to service-managed RPCs. |
| PlayerFinancialService (Finance) | `player_financial_transaction` | Finance & compliance roles scoped to `casino_id` | `rpc_create_financial_txn` (cashier/compliance services) | Append-only ledger; deletes disabled; gaming day derived via trigger. |
| MTLService (Compliance) | `mtl_entry`, `mtl_audit_note` | Compliance roles within `casino_id` | Cashier + compliance services with matching `casino_id` | Immutable cash transaction log; notes append-only; thresholds hinge on casino settings. |

## Policy Statement Template

```sql
-- Enable RLS and declare casino ownership
alter table <table_name> enable row level security;

-- Read policy
create policy "<table_name> read same casino"
  on <schema>.<table_name>
  for select
  using (
    casino_id = auth.jwt() ->> 'casino_id'
    and auth.jwt() ->> 'staff_role' in (<read_roles>)
  );

-- Write policy (example: append-only insert)
create policy "<table_name> insert authorized roles"
  on <schema>.<table_name>
  for insert
  with check (
    casino_id = auth.jwt() ->> 'casino_id'
    and auth.jwt() ->> 'staff_role' in (<write_roles>)
  );
```

Adapt the predicate to reference service-specific claims (e.g., cashier/compliance scopes) or RPC arguments when JWT context is insufficient.

## Verification Checklist

- [ ] Table DDL includes `casino_id` with the correct foreign key to `casino(id)`.
- [ ] RLS is enabled and defines explicit `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policies per matrix row.
- [ ] Service-owned RPCs (`rpc_issue_mid_session_reward`, `rpc_create_financial_txn`, etc.) validate `casino_id` alignment before writing.
- [ ] No direct table grants exist outside the listed write paths.
- [ ] Cross-context access uses declared foreign keys; implicit string joins are rejected during review.
- [ ] Ledger-style tables keep deletes disabled and route corrections through supervised flows.

