---
id: SEC-002
title: Casino-Scoped Security Model
owner: Security
status: Active
affects: [SEC-001]
created: 2025-11-02
last_review: 2025-12-25
updated: 2025-12-25
related_adrs: [ADR-015, ADR-020, ADR-023, ADR-024, ADR-030]
---

## Purpose

Document the security boundaries that govern how PT-2 enforces least-privilege across casino properties. This model clarifies how roles, RLS policies, and service-owned interfaces combine to prevent cross-property data exposure while enabling compliant operations.

## Multi-Tenancy Storage Model (ADR-023)

> **Official Stance: Pool Primary; Silo Optional**

PT-2 adopts a **Pool-based multi-tenancy model** as the default, with **Silo deployment as an explicit escape hatch** for regulated or high-risk customers.

| Model | Status | Description |
|-------|--------|-------------|
| **Pool** | Primary/Default | Single Supabase project per environment. Shared schema, tenant isolation via `casino_id` + RLS (hybrid Pattern C) + RPC governance |
| **Silo** | Optional Escape Hatch | Dedicated Supabase project per casino. Same schema/codebase, offered for jurisdictional or procurement requirements |
| **Bridge** | Deferred | Schema-per-tenant not selected; complexity without material risk reduction |

**Guardrails (Non-Negotiables):**

1. **Casino-scoped ownership** — Every tenant-owned row carries `casino_id`; cross-casino joins forbidden
2. **Hybrid RLS mandatory** — Policies use session context + JWT fallback (Pattern C per ADR-015); **write-path policies on critical tables require session vars only** (ADR-030 INV-030-5)
3. **SECURITY DEFINER governance** — RPCs must validate `p_casino_id` against context (ADR-018)
4. **Append-only ledgers** — Finance/loyalty/compliance: no deletes, idempotency enforced (ADR-021)
5. **Single source of truth for request context** — `ctx.rlsContext` populated only from `set_rls_context_from_staff()` return value; no independent derivation (ADR-030 INV-030-1)
6. **Authoritative claims lifecycle** — JWT claim sync/clear failures must be surfaced, never silently swallowed; claims cleared on staff deactivation (ADR-030 INV-030-2)
7. **Bypass knob lockdown** — `DEV_AUTH_BYPASS` requires `NODE_ENV=development` + `ENABLE_DEV_AUTH=true`; `skipAuth` restricted to test/seed paths with CI enforcement (ADR-030 INV-030-3, INV-030-4)

**See:** `docs/80-adrs/ADR-023-multi-tenancy-storage-model-selection.md` for full decision rationale.

## Scope Anchors

- **Casino Identity (`casino`)** is the root authority; every operational table includes a `casino_id` foreign key.
- **Casino Settings (`casino_settings`)** is the single temporal authority for thresholds, timezone, and gaming-day windows; only the Casino service writes to it.
- **Player Enrollment (`player_casino`)** binds patrons to properties; session, telemetry, finance, and loyalty data inherit this linkage.
- **Service RPCs** (e.g., `rpc_issue_mid_session_reward`, `rpc_create_financial_txn`, `rpc_issue_promo_coupon`, `rpc_void_promo_coupon`, `rpc_replace_promo_coupon`) act as the only approved mutation interfaces across casino boundaries. **ADR-024**: All client-callable RPCs must call `set_rls_context_from_staff()` and derive context authoritatively (no spoofable `casino_id`/`actor_id` inputs).

## Role Model

| Role / Claim | Source | Primary Capabilities | Notes |
| --- | --- | --- | --- |
| `dealer` | `staff_role` enum | Read table assignments, submit telemetry | No direct ledger writes; inherits same-casino visibility. |
| `pit_boss` | `staff_role` enum | Manage table rotations, approve rewards, issue/void/replace promo coupons | Grants write access within TableContext RLS policies. Promo operations via `rpc_issue_promo_coupon`, `rpc_void_promo_coupon`, `rpc_replace_promo_coupon`. |
| `admin` | `staff_role` enum | Manage staff, casino configuration, full promo program/coupon access | Exclusive write on foundational tables (`casino_settings`, `staff`). Full promo instrument admin. |
| `cashier` | `staff_role` enum | Submit financial transactions | Routed through `rpc_create_financial_txn`; append-only, casino-scoped. No promo access. |
| `compliance` | Service claim | Read finance/MTL ledgers, append compliance notes, read promo inventory | Enables AML/CTR workflows; writes restricted to supervised RPCs. Read-only promo access for audit via `rpc_promo_coupon_inventory`. |
| `reward_issuer` | Service claim | Append loyalty ledger entries | Always mediated by `rpc_issue_mid_session_reward`; enforces casino match. No promo coupon access. |

## Access Control Patterns

- **RLS Everywhere:** Tables that include `casino_id` must enable RLS and implement per-role policies (see `SEC-001`).
- **Append-Only Ledgers:** Finance, loyalty, and compliance contexts disable deletes; corrections flow through idempotent RPCs and audit trails.
- **Trigger-Based Guards:** Functions such as `assert_table_context_casino` and `set_fin_txn_gaming_day()` enforce alignment between incoming data and casino ownership.
- **Policy Snapshots:** `rating_slip.policy_snapshot` captures the reward policy at issuance to support post-event audits without loosening RLS.
- **No Cross-Casino Joins:** Queries spanning properties must go through aggregated, pre-authorized views; ad hoc joins using free-form keys are rejected.

## RLS Context Injection (ADR-015, ADR-020, ADR-024, ADR-030)

**Status:** ✅ Implemented (Phase 1 + Phase 2) | ⚠️ ADR-030 hardening in progress
**MVP Strategy (ADR-020):** Track A (Hybrid) is the MVP architecture. Track B (JWT-only) migration deferred until production validation prerequisites are met.

PT-2 uses a hybrid context injection strategy for RLS policies, ensuring compatibility with Supabase connection pooling (Supavisor transaction mode).

**ADR-024 Security Requirements (client-callable RPCs)**:
- All RPCs MUST call `set_rls_context_from_staff()` as the first statement.
- RPCs MUST NOT accept `casino_id` or `actor_id` as input parameters.
- Context is derived from JWT + `staff` table lookup; only optional input is `correlation_id`.

**ADR-030 Auth Pipeline Hardening (in progress)**:
- **D1 — TOCTOU removal:** `set_rls_context_from_staff()` returns the derived context (`actor_id`, `casino_id`, `staff_role`). Middleware populates `ctx.rlsContext` strictly from this return value — no independent staff lookup for context derivation. This eliminates drift between app-layer and Postgres-layer context.
- **D2 — Claims lifecycle:** `syncUserRLSClaims()` / `clearUserRLSClaims()` failures are no longer silently swallowed. Staff deactivation or `user_id` removal triggers claim clearing.
- **D3 — Bypass lockdown:** `DEV_AUTH_BYPASS` requires dual gate (`NODE_ENV=development` + `ENABLE_DEV_AUTH=true`). `skipAuth` restricted to test/seed files by CI lint.
- **D4 — Write-path tightening:** INSERT/UPDATE/DELETE policies on critical tables require `app.casino_id` session variable (no JWT COALESCE fallback). SELECT retains fallback.

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

- **2026-01-29**: **ADR-030 Alignment**: Added guardrails #5–7 (single source of truth, authoritative claims lifecycle, bypass lockdown). Updated RLS Context Injection section with ADR-030 D1–D4 hardening decisions. Added ADR-030 to related ADRs.
- **2026-01-06**: **PRD-LOYALTY-PROMO**: Added promo instrument capabilities to Role Model (pit_boss: issue/void/replace; admin: full access; compliance: read/inventory). Added promo RPCs to Scope Anchors with ADR-024 compliance note. Also corrected cashier source from "Service claim" to "staff_role enum" per ADR-017.
- **2025-12-25**: Added Multi-Tenancy Storage Model section (ADR-023). Official stance: Pool Primary; Silo Optional.
- **2025-12-15**: Added ADR-020 reference. Track A Hybrid is MVP architecture per ADR-020.
- **2025-12-10**: Added RLS Context Injection section (ADR-015 Phase 1+2 implementation). Updated status to Active.
- **2025-11-02**: Initial draft created.
