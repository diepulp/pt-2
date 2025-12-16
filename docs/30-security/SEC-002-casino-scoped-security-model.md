---
id: SEC-002
title: Casino-Scoped Security Model
owner: Security
status: Active
affects: [SEC-001]
created: 2025-11-02
last_review: 2025-12-10
updated: 2025-12-10
related_adrs: [ADR-015, ADR-020]
---

## Purpose

Document the security boundaries that govern how PT-2 enforces least-privilege across casino properties. This model clarifies how roles, RLS policies, and service-owned interfaces combine to prevent cross-property data exposure while enabling compliant operations.

## Scope Anchors

- **Casino Identity (`casino`)** is the root authority; every operational table includes a `casino_id` foreign key.
- **Casino Settings (`casino_settings`)** is the single temporal authority for thresholds, timezone, and gaming-day windows; only the Casino service writes to it.
- **Player Enrollment (`player_casino`)** binds patrons to properties; session, telemetry, finance, and loyalty data inherit this linkage.
- **Service RPCs** (e.g., `rpc_issue_mid_session_reward`, `rpc_create_financial_txn`) act as the only approved mutation interfaces across casino boundaries.

## Role Model

| Role / Claim | Source | Primary Capabilities | Notes |
| --- | --- | --- | --- |
| `dealer` | `staff_role` enum | Read table assignments, submit telemetry | No direct ledger writes; inherits same-casino visibility. |
| `pit_boss` | `staff_role` enum | Manage table rotations, approve rewards | Grants write access within TableContext RLS policies. |
| `admin` | `staff_role` enum | Manage staff, casino configuration | Exclusive write on foundational tables (`casino_settings`, `staff`). |
| `cashier` | Service claim | Submit financial transactions | Routed through `rpc_create_financial_txn`; append-only, casino-scoped. |
| `compliance` | Service claim | Read finance/MTL ledgers, append compliance notes | Enables AML/CTR workflows; writes restricted to supervised RPCs. |
| `reward_issuer` | Service claim | Append loyalty ledger entries | Always mediated by `rpc_issue_mid_session_reward`; enforces casino match. |

## Access Control Patterns

- **RLS Everywhere:** Tables that include `casino_id` must enable RLS and implement per-role policies (see `SEC-001`).
- **Append-Only Ledgers:** Finance, loyalty, and compliance contexts disable deletes; corrections flow through idempotent RPCs and audit trails.
- **Trigger-Based Guards:** Functions such as `assert_table_context_casino` and `set_fin_txn_gaming_day()` enforce alignment between incoming data and casino ownership.
- **Policy Snapshots:** `rating_slip.policy_snapshot` captures the reward policy at issuance to support post-event audits without loosening RLS.
- **No Cross-Casino Joins:** Queries spanning properties must go through aggregated, pre-authorized views; ad hoc joins using free-form keys are rejected.

## RLS Context Injection (ADR-015, ADR-020)

**Status:** ✅ Implemented (Phase 1 + Phase 2)
**MVP Strategy (ADR-020):** Track A (Hybrid) is the MVP architecture. Track B (JWT-only) migration deferred until production validation prerequisites are met.

PT-2 uses a hybrid context injection strategy for RLS policies, ensuring compatibility with Supabase connection pooling (Supavisor transaction mode).

### Context Injection Mechanism

1. **Transaction-Wrapped RPC** - `set_rls_context()` injects `app.actor_id`, `app.casino_id`, and `app.staff_role` via `SET LOCAL` in a single atomic transaction.
2. **JWT Claims Fallback** - `auth.jwt() -> 'app_metadata' ->> 'casino_id'` provides fallback for direct client queries.

### Implementation Files

| Component | Location | Purpose |
|-----------|----------|---------|
| Context RPC | `set_rls_context()` (Migration `20251209183033`) | Transaction-wrapped SET LOCAL |
| TypeScript API | `lib/supabase/rls-context.ts` | `injectRLSContext()` wrapper |
| JWT Sync | `lib/supabase/auth-admin.ts` | `syncUserRLSClaims()` for Phase 2 |
| DB Trigger | `trg_sync_staff_jwt_claims` | Auto-sync JWT on staff changes |

### Policy Pattern (Pattern C - Hybrid)

```sql
create policy "table_read_hybrid"
  on {table_name} for select using (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

**See:** `SEC-001-rls-policy-matrix.md` for complete policy templates.
**ADR:** `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`

## Interaction Points

- **Service Responsibility Matrix (`ARCH-SRM`)** defines ownership and RLS expectations consumed by this model.
- **SEC-001** codifies the concrete policies and verification checklist required during schema changes.
- **Ops & Compliance Runbooks** (future SEC/OPS docs) should reference this model when defining incident response and escalation paths.

## Open Questions

- ~~Do we need a dedicated JWT claim for compliance staff versus services?~~ **RESOLVED (ADR-015 Phase 2):** JWT `app_metadata` now carries `casino_id`, `staff_id`, and `staff_role` for all authenticated staff. Compliance staff use the same claim structure.
- Should finance and compliance ledgers expose read-only views for cross-property auditors under special approval?
- Are temporal overrides (e.g., daylight saving changes) captured in `casino_settings` change history for forensic review?

Capture answers as ADRs or follow-up SEC docs as they are resolved.

## Changelog

- **2025-12-15**: Added ADR-020 reference. Track A Hybrid is MVP architecture per ADR-020.
- **2025-12-10**: Added RLS Context Injection section (ADR-015 Phase 1+2 implementation). Updated status to Active.
- **2025-11-02**: Initial draft created.

