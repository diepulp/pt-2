---
id: PRD-051
title: "Cross-Property Player Recognition and Loyalty Entitlement"
owner: Product + Lead Architect
status: Draft
affects: ADR-044, ADR-043, SEC-001, SEC-002, ARCH-SRM
created: 2026-03-13
last_review: 2026-03-13
phase: "Phase 2 (Dual-Boundary Tenancy)"
pattern: n/a (cross-cutting)
http_boundary: true
---

# PRD-051: Cross-Property Player Recognition and Loyalty Entitlement

## 1. Overview

**Owner:** Product + Lead Architect
**Status:** Draft
**Phase:** Phase 2 — Dual-Boundary Tenancy

Staff at their home casino can look up players enrolled at sister properties under the same company, view the player's portfolio loyalty entitlement, receive safety signals about sister-property exclusions, activate the player locally, and redeem allowed entitlement through local workflows. Staff never switches casino context. All decisions frozen in ADR-044.

## 2. Problem & Goals

### Problem Statement

After Phase 1 (ADR-043), the company entity exists and `app.company_id` is derived, but no feature consumes it. Staff at Casino B cannot discover a player enrolled only at Casino A, even when both casinos belong to the same company. This prevents patron recognition, loyalty service continuity, and creates a safety gap where excluded players can be activated at sister properties without warning.

### Goals

1. **Cross-property player recognition** — Staff at Casino B can find players enrolled at Casino A within the same company
2. **Loyalty entitlement visibility** — Staff sees the player's portfolio total and local redeemable balance
3. **Exclusion safety signals** — Staff is warned about sister-property exclusions with severity-based escalation
4. **Local activation** — Staff can activate a recognized player at the current property through a dedicated audited workflow
5. **Local redemption** — Staff can redeem loyalty entitlement through the current property's workflows, bounded by the local balance

### Non-Goals

1. Staff switching active casino context or operating as another property
2. Raw cross-property `visit`, `loyalty_ledger`, `rating_slip`, or financial data exposure
3. Company-wide exclusion propagation (safety signal only — not full detail sharing)
4. Card scanner / swipe interoperability (manual lookup only)
5. Cross-property balance pooling (redemption bounded by local balance, not portfolio total)
6. ADR-024 INV-8 amendment (no client-supplied casino selection needed)
7. `player_loyalty.preferences` cross-property exposure

## 3. Users & Use Cases

### Authority Model

This PRD uses business role labels that map to the `staff_role` enum as follows:

| Business Label | `staff_role` Enum Value(s) | Authority in This Feature |
|---|---|---|
| Floor Supervisor | `pit_boss` | Recognition, activation, redemption. Cannot override `soft_alert` exclusions. |
| Casino Manager | `admin` | All floor supervisor capabilities + override authority for `soft_alert` exclusions. |

All role checks in RPCs use `staff_role` enum values, not business labels. When this PRD says "elevated-role override," it means `staff_role = 'admin'`.

### Primary User: Floor Supervisor (`pit_boss`)

Staff at their assigned casino with enrollment and loyalty authority.

**Jobs:**

1. **Recognize returning patron** — "I know this player visits our sister property. Let me look them up so I can provide informed host service."
2. **Activate patron locally** — "This player is enrolled at Casino A but not here. Let me activate them at my property so they can play."
3. **Check loyalty entitlement** — "How many points does this player have? Can they redeem anything here?"
4. **Heed safety warnings** — "The system says this player has restrictions at another property. I need to escalate to a manager before proceeding."

### Secondary User: Casino Manager (`admin`)

Staff with elevated authority for override decisions.

**Jobs:**

1. **Override soft exclusion** — "This player has a `soft_alert` at a sister property. As manager, I'm authorized to override and allow activation."
2. **Review cross-property activity** — "I need to understand this player's portfolio presence for host service decisions."

## 4. Scope & Feature List

### Company-Scoped Player Lookup

- [ ] Staff can search for players by name across all casinos within their company
- [ ] Search returns RPC-derived summary: player identity, enrollment status per casino, portfolio loyalty entitlement, last-visit scalar (computed, not raw visit row), exclusion safety signal (computed boolean + severity, not raw exclusion data)
- [ ] Results are scoped to the caller's company boundary (no cross-company visibility)
- [ ] Single-casino staff (companies with 1 casino) see no behavioral change
- [ ] Search latency within existing RPC SLO (<200ms p95)

### Loyalty Entitlement Visibility

- [ ] Recognition results include hybrid loyalty surface: `portfolio_total` (awareness) + `local_balance` / `redeemable_here` (actionable)
- [ ] Per-property breakdown shows balance and tier per casino enrollment
- [ ] `portfolio_total` is clearly presented as awareness context, not a pooled redeemable amount. UI label must use language like "Portfolio total (all properties)" — never "Available balance" or "Redeemable points" for the aggregate. Only `redeemable_here` may use actionable language.
- [ ] `redeemable_here` reflects the local balance only (local-row-only debit model per ADR-044 D6)

### Exclusion Safety Signals

- [ ] Recognition results include `has_sister_exclusions` and `max_exclusion_severity`
- [ ] `hard_block` severity: activation and redemption blocked in the UI; RPC enforcement server-side
- [ ] `soft_alert` severity: warning banner displayed; activation/redemption requires `admin` role override; override decision audited (FR-8)
- [ ] `monitor` severity: informational warning displayed; no workflow blocking
- [ ] No exclusion details (type, jurisdiction, reason) are exposed cross-property

### Local Activation

- [ ] "Activate at this property" action visible when player is found at sister property but not enrolled locally (State B)
- [ ] Activation creates `player_casino` row at the current casino
- [ ] Activation is idempotent (no-op if already enrolled)
- [ ] Activation is blocked or requires override when exclusion severity warrants (D5 policy)
- [ ] `local_activation` audit event logged

### Local Redemption

- [ ] Staff can initiate loyalty redemption for locally enrolled players
- [ ] Redemption debits the local `player_loyalty` balance only (not the portfolio total)
- [ ] Redemption is rejected if local balance is insufficient (no negative balances, no partial debits)
- [ ] Redemption is blocked or requires override when exclusion severity warrants (D5 policy)
- [ ] Local `loyalty_ledger` entry created at the acting casino
- [ ] `loyalty_redemption` audit event logged
- [ ] Updated entitlement state returned immediately after redemption

### Audit Trail

- [ ] `company_lookup` event logged when staff performs cross-property player search
- [ ] `local_activation` event logged with actor, player, casino, timestamp
- [ ] `loyalty_redemption` event logged with actor, player, casino, amount, timestamp

## 5. Requirements

### Functional Requirements

| ID | Requirement | Source |
|---|---|---|
| FR-1 | Recognition RPC returns results scoped to caller's company only | ADR-044 D4, SEC_NOTE C4 |
| FR-2 | Company-scoped SELECT on `player_casino` and `player_loyalty` only (no other tables) | ADR-044 D1, SEC_NOTE C11 |
| FR-3 | `visit` and `player_exclusion` accessed via SECURITY DEFINER scalar extraction only | ADR-044 D1, SEC_NOTE C2/C3 |
| FR-4 | Activation RPC enforces severity-based exclusion policy server-side | ADR-044 D3/D5 |
| FR-5 | Redemption debits local row only; portfolio total updates as consequence | ADR-044 D6 |
| FR-6 | All 3 RPCs call `set_rls_context_from_staff()` as first statement | ADR-024, SEC_NOTE C4 |
| FR-7 | Activation role-gated to `pit_boss` and `admin` | ADR-044 D3 |
| FR-8 | `soft_alert` override decisions audited with actor, player, casino, override reason, timestamp | ADR-044 D5 |

### Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-1 | Recognition RPC latency | <200ms p95 |
| NFR-2 | Zero behavioral change for single-casino staff | Pass: existing test suite unchanged |
| NFR-3 | No cross-company data leakage | Pass: integration test with multi-company fixtures |
| NFR-4 | Redemption atomicity | Pass: concurrent redemption test — no negative balances |

## 6. UX / Flow Overview

### Player Lookup Flow

1. Staff opens player search (existing search UI)
2. Staff enters search term (name, partial match)
3. System calls `rpc_lookup_player_company` with search term
4. Results displayed with per-player cards showing:
   - Name, DOB
   - Enrollment badges (which properties)
   - Portfolio loyalty: "Portfolio total (all properties): X pts" + "Available here: Y pts"
   - Last company visit timestamp
   - Exclusion warning indicator (if applicable)
   - "Active here" badge or "Activate at this property" action

### Three-State Recognition UX

- **State A** — Player found, active at current casino: standard player card with loyalty info. Redemption available.
- **State B1** — Player found at sister property, no exclusions: "Activate at this property" button. Loyalty entitlement visible. Activation creates local enrollment.
- **State B2** — Player found at sister property, has exclusions: warning banner with severity-appropriate message. `hard_block`: activation disabled. `soft_alert`: activation requires `admin` override (override decision audited per FR-8). `monitor`: informational warning only.
- **State C** — Player not found: standard new patron onboarding flow (unchanged).

### Redemption Flow

1. Staff selects "Redeem" on an enrolled player
2. System shows `redeemable_here` balance (local balance, not portfolio total)
3. Staff enters amount and reason
4. System calls `rpc_redeem_loyalty_locally`
5. On success: updated balance shown immediately
6. On failure (insufficient balance): error with current local balance shown

## 7. Dependencies & Risks

### Dependencies

| Dependency | Type | Status |
|---|---|---|
| ADR-043 Phase 1 (company foundation) | Required | Implemented (e86e5eb) |
| ADR-044 (all decisions frozen) | Required | Accepted |
| `player_exclusion` table + RPCs (ADR-042) | Required for exclusion signal | On `player-exclusion` branch — not yet merged |
| LoyaltyService (`player_loyalty`, `loyalty_ledger`) | Required | Implemented |
| CasinoService (`player_casino`) | Required | Implemented |

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| `player_exclusion` branch not merged | Exclusion safety signal unavailable | Implement recognition + entitlement first; add exclusion signal after merge. Feature is still valuable without it but safety gap remains open. |
| UX confusion between `portfolio_total` and `redeemable_here` | Staff attempts redemption for more than local balance | Clear visual separation: "Portfolio: 12,500 pts" vs "Available here: 4,500 pts". Redemption UI shows only local balance. |
| Company-scoped RLS performance | Query latency increase | EXISTS subquery on indexed `casino.company_id`. Benchmark during implementation. |

## 8. Definition of Done

### Slice 1 — Core Recognition + Entitlement (shippable independently)

- [ ] `rpc_lookup_player_company` returns correct results scoped to caller's company
- [ ] `rpc_activate_player_locally` creates enrollment with idempotency and audit trail
- [ ] `rpc_redeem_loyalty_locally` debits local balance atomically with balance guard
- [ ] Company-scoped SELECT policies exist only on `player_casino` and `player_loyalty` (CI gate)
- [ ] No RLS policy on `visit`, `player_exclusion`, or any other table references `app.company_id` (CI gate)
- [ ] Cross-company isolation verified (Company X staff sees zero Company Y data)
- [ ] Single-casino staff experience unchanged (existing test suite passes)
- [ ] Recognition search latency <200ms p95
- [ ] Concurrent redemption does not produce negative balances
- [ ] Audit events logged for lookup, activation, and redemption
- [ ] `soft_alert` override decisions are audited (actor, player, casino, override reason, timestamp)
- [ ] Shadow policies tested before production rollout

### Slice 2 — Exclusion Safety Signal (ships after `player-exclusion` branch merge)

- [ ] Recognition RPC includes `has_sister_exclusions` and `max_exclusion_severity` in response
- [ ] `hard_block` severity blocks activation and redemption server-side
- [ ] `soft_alert` severity requires `admin` role override; override decision audited
- [ ] `monitor` severity produces warning only; no workflow blocking
- [ ] Integration test: exclusion at Casino A → recognition from Casino B returns correct signal

**Slice 1 is shippable without Slice 2.** Recognition, entitlement, activation, and redemption deliver value independently. However, the exclusion safety gap (player banned at Casino A discoverable but unflagged at Casino B) remains open until Slice 2 ships. This risk is accepted and documented in §7.

## 9. Related Documents

| Document | Purpose |
|---|---|
| ADR-044 | Frozen architectural decisions (D1–D7) |
| ADR-043 | Phase 1 foundation (company entity, `app.company_id`) |
| SEC_NOTE | Threat model (11 threats, 11 controls, 13 merge criteria) |
| Feature Boundary | SRM ownership + scope |
| Feature Brief | 1-page alignment |
| PHASE-2-SCOPE-REALIGNMENT | Scope definition + drift correction |
| PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION | Surface design + exclusion safety |
| Pre-Decision Freeze Inset | D3/D5/D6/D7 freeze rationale |
| Loyalty Entitlement Scope Inset | Loyalty in scope justification |
| Accrual/Redemption Alignment | Symmetric accounting rule |
| Operational Addendum | Workflow definition (Option B, 3 UX states) |
