---
id: SEC-003
title: Casino-Scoped RBAC Matrix
owner: Security
status: Active
affects: [SEC-001, SEC-005, ADR-017, ADR-024, ADR-025]
created: 2025-11-02
last_review: 2025-12-31
version: 1.4.0
---

## Purpose

Baseline the role-based access control model that complements the casino-scoped RLS policies. This matrix aligns staff roles and service claims with the data domains they can read or mutate, ensuring consistency across Supabase policies, JWT claims, and service-owned RPCs.

This matrix predates ADR-024; treat it as a baseline, not the final word on SECURITY DEFINER RPC allowlists.

## Role Registry

| Role / Claim | Issuer | Description |
| --- | --- | --- |
| `dealer` | `staff_role` enum | Non-authenticated scheduling metadata only. Dealers are tracked in the system for operational visibility (dealer rotations, table assignments) but have ZERO application permissions. |
| `pit_boss` | `staff_role` enum | Table-level operator; submits telemetry and session updates. Supervises tables; approves table configuration changes and reward escalations. |
| `admin` | `staff_role` enum | Casino administrator; manages staff and foundational configuration. |
| `cashier` | `staff_role` enum | Financial service role for cage operations, player transactions, and cashiering workflows. Uses same auth flow as pit_boss/admin (ADR-017). Role assignment restricted to admin-only workflows. |
| `compliance` | Service claim (`auth.jwt()` scope) | Reviews financial/MTL ledgers, appends compliance audit notes. |
| `reward_issuer` | Service claim (`auth.jwt()` scope) | Issues loyalty rewards via the mid-session reward RPC. |
| `automation` | Service claim (`auth.jwt()` scope) | Limited automation accounts for scheduled configuration updates. |

## RBAC Matrix

| Domain / Capability | dealer | pit_boss | admin | cashier | compliance | reward_issuer | automation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **CasinoService**<br/>Read staff & settings | ✅ | ✅ | ✅ | ◻️ | ◻️ | ◻️ | ✅ |
| **CasinoService**<br/>Update staff & settings | ◻️ | ◻️ | ✅ | ◻️ | ◻️ | ◻️ | ◻️ |
| **Player & Visit**<br/>Read enrollment/visits | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ◻️ |
| **Player & Visit**<br/>Write enrollment/visits | ◻️ | ◻️ | ✅ (override) | ◻️ | ◻️ | ◻️ | ◻️ |
| **TableContext**<br/>Read tables/settings | ✅ | ✅ | ✅ | ◻️ | ◻️ | ◻️ | ✅ |
| **TableContext**<br/>Write tables/settings | ◻️ | ✅ | ✅ | ◻️ | ◻️ | ◻️ | ◻️ |
| **RatingSlip**<br/>Read telemetry | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ◻️ |
| **RatingSlip**<br/>Update telemetry state | ✅ (own submissions) | ✅ | ✅ | ◻️ | ◻️ | ◻️ | ◻️ |
| **LoyaltyService**<br/>Read loyalty ledger/balances | ◻️ | ✅ | ✅ | ◻️ | ◻️ | ✅ | ◻️ |
| **LoyaltyService**<br/>Append rewards | ◻️ | ✅ (approve) | ✅ | ◻️ | ◻️ | ✅ | ◻️ |
| **LoyaltyService (Promo)**<br/>Read promo programs/coupons | ◻️ | ✅ | ✅ | ◻️ | ✅ | ◻️ | ◻️ |
| **LoyaltyService (Promo)**<br/>Issue promo coupon | ◻️ | ✅ | ✅ | ◻️ | ◻️ | ◻️ | ◻️ |
| **LoyaltyService (Promo)**<br/>Void/replace promo coupon | ◻️ | ✅ | ✅ | ◻️ | ◻️ | ◻️ | ◻️ |
| **LoyaltyService (Promo)**<br/>Query promo inventory | ◻️ | ✅ | ✅ | ◻️ | ✅ | ◻️ | ◻️ |
| **PlayerFinancialService**<br/>Read financial ledger | ◻️ | ✅ | ✅ | ✅ | ✅ | ◻️ | ◻️ |
| **PlayerFinancialService**<br/>Record financial txn | ◻️ | ⚠️ (table buy-ins only) | ✅ | ✅ (via `rpc_create_financial_txn`) | ◻️ | ◻️ | ◻️ |
| **MTLService**<br/>Read compliance ledger | ◻️ | ✅ | ✅ | ◻️ | ◻️ | ◻️ | ◻️ |
| **MTLService**<br/>Record entry (INSERT) | ◻️ | ✅ | ✅ | ✅ | ◻️ | ◻️ | ◻️ |
| **MTLService**<br/>Append audit notes | ◻️ | ✅ | ✅ | ◻️ | ◻️ | ◻️ | ◻️ |

Legend: ✅ allowed, ◻️ not permitted, ⚠️ conditional (see notes).

**Pit Boss Financial Write Constraints** (SEC-005 v1.1.0):
- `direction` MUST be `'in'` (buy-ins only)
- `tender_type` MUST be `'cash'` or `'chips'` (no markers)
- `visit_id` MUST be provided (linked to active session)

### MTL Authorization (ADR-025)

MTL uses `staff_role` for MVP authorization. The `compliance` service claim is reserved for future cross-casino or separation-of-duties requirements. See [ADR-025](../80-adrs/ADR-025-mtl-authorization-model.md) for the authoritative MTL access matrix.

## Implementation Notes

- **Staff roles** (`dealer`, `pit_boss`, `admin`, `cashier`) are stored in the `staff.role` column and validated via hybrid context (ADR-015 + ADR-017): `COALESCE(NULLIF(current_setting('app.staff_role', true), ''), auth.jwt() -> 'app_metadata' ->> 'staff_role')`. The `casino_id` scope is enforced via `COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid)`.
- **ADR-024 enforcement**: SECURITY DEFINER RPCs must call `set_rls_context_from_staff()` and enforce role allowlists inside the function body (do not rely on RLS to gate). Client-supplied actor ids must be ignored or removed; attribution comes from the derived context (`app.actor_id`).
- **Dealer role** remains non-authenticated scheduling metadata; dealer accounts do not authenticate into application RPCs.
- **Cashier role assignment** is restricted to admin-only workflows (Staff Admin UI). Direct SQL grants are prohibited in production.
- **Service claims** (`compliance`, `reward_issuer`, `automation`) must be minted by the authentication gateway with explicit expiration and scoping to a single `casino_id`.
- Direct table grants should mirror the matrix; any deviation requires a Security-approved ADR.
- For capabilities mediated by RPCs, policies must validate both role/claim and `casino_id` parity before executing mutations.

## Review Checklist

- [ ] New roles or claims are registered here with issuing authority and purpose.
- [ ] Corresponding RLS policies in `SEC-001` reference the same claim names.
- [ ] Supabase policy definitions and automation tokens enforce the disallowances (`◻️`) above.
- [ ] Changes to ledger access trigger cross-review with finance/compliance owners.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.4.0 | 2026-01-06 | **PRD-LOYALTY-PROMO**: Added LoyaltyService (Promo) capabilities - read programs/coupons, issue, void/replace, query inventory. pit_boss and admin have full access; compliance has read/inventory access for audit. |
| 1.3.0 | 2026-01-02 | **ADR-025 MTL Authorization**: MTL uses `staff_role` (pit_boss, cashier, admin) not compliance service-claim. Updated matrix rows; added carve-out section. |
| 1.2.0 | 2025-12-31 | **ADR-024 alignment**: Documented SECURITY DEFINER allowlist enforcement and derived actor attribution. |
| 1.1.0 | 2025-12-10 | **ADR-017 Compliance**: Promoted cashier from service claim to `staff_role` enum. Updated issuer and description. Updated implementation notes for staff role validation pattern. |
| 1.0.0 | 2025-11-02 | Initial version. |
