---
id: SEC-003
title: Casino-Scoped RBAC Matrix
owner: Security
status: Draft
affects: [SEC-001, SEC-002]
created: 2025-11-02
last_review: 2025-11-02
---

## Purpose

Baseline the role-based access control model that complements the casino-scoped RLS policies. This matrix aligns staff roles and service claims with the data domains they can read or mutate, ensuring consistency across Supabase policies, JWT claims, and service-owned RPCs.

## Role Registry

| Role / Claim | Issuer | Description |
| --- | --- | --- |
| `dealer` | `staff_role` enum | Non-authenticated scheduling metadata only. Dealers are tracked in the system for operational visibility (dealer rotations, table assignments) but have ZERO application permissions |
| `pit_boss` | `staff_role` enum |Table-level operator; submits telemetry and session updates. Supervises tables; approves table configuration changes and reward escalations. |
| `admin` | `staff_role` enum | Casino administrator; manages staff and foundational configuration. |
| `cashier` | Service claim (`auth.jwt()` scope) | Initiates cashiering transactions through finance service RPCs. |
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
| **PlayerFinancialService**<br/>Read financial ledger | ◻️ | ◻️ | ✅ | ✅ | ✅ | ◻️ | ◻️ |
| **PlayerFinancialService**<br/>Record financial txn | ◻️ | ◻️ | ◻️ | ✅ (via `rpc_create_financial_txn`) | ◻️ | ◻️ | ◻️ |
| **MTLService**<br/>Read compliance ledger | ◻️ | ◻️ | ✅ | ◻️ | ✅ | ◻️ | ◻️ |
| **MTLService**<br/>Append compliance notes | ◻️ | ◻️ | ◻️ | ◻️ | ✅ | ◻️ | ◻️ |

Legend: ✅ allowed, ◻️ not permitted.

## Implementation Notes

- Map staff roles (`dealer`, `pit_boss`, `admin`) from Supabase JWT claims; ensure the `casino_id` claim is present for same-casino enforcement.
- Service claims (`cashier`, `compliance`, `reward_issuer`, `automation`) must be minted by the authentication gateway with explicit expiration and scoping to a single `casino_id`.
- Direct table grants should mirror the matrix; any deviation requires a Security-approved ADR.
- For capabilities mediated by RPCs, policies must validate both role/claim and `casino_id` parity before executing mutations.

## Review Checklist

- [ ] New roles or claims are registered here with issuing authority and purpose.
- [ ] Corresponding RLS policies in `SEC-001` reference the same claim names.
- [ ] Supabase policy definitions and automation tokens enforce the disallowances (`◻️`) above.
- [ ] Changes to ledger access trigger cross-review with finance/compliance owners.

