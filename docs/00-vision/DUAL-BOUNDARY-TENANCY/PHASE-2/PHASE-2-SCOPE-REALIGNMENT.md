---
id: PHASE-2-SCOPE-REALIGNMENT
title: "Phase 2 Scope Realignment — Cross-Property Player Recognition and Loyalty Entitlement"
status: Active
date: 2026-03-13
supersedes: PHASE-2-CONTEXT-REPORT (directional reframe — context report retains value as future Multi-Casino Staff Access reference)
triggered_by: Scope drift identified between PHASE-2-CONTEXT-REPORT and authoritative scope inset
authoritative_sources:
  - cross_property_player_recognition_scope_inset.md (scope boundary)
  - CROSS-PROPERTY-PLAYER-SHARING-INVESTIGATION.md (technical foundation)
  - cross-property-player-sharing-operational-addendum.md (operational workflow)
  - ADR-043 (Phase 1 foundation)
  - PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION.md (surface narrowing + exclusion safety signal)
  - cross_property_player_recognition_loyalty_entitlement_scope_inset.md (scope expansion — loyalty entitlement in scope)
  - phase2_loyalty_accrual_redemption_alignment.md (accrual/redemption symmetry — entitlement effect is global, provenance is local)
---

# Phase 2 Scope Realignment — Cross-Property Player Recognition and Loyalty Entitlement

## 1. The Drift

The investigation (`CROSS-PROPERTY-PLAYER-SHARING-INVESTIGATION.md` §5) defined a 4-phase roadmap:

| Investigation Phase | Label | Scope |
|---|---|---|
| Phase 1 | Company Foundation | Populate company, derive `app.company_id` |
| Phase 2 | Multi-Casino Staff Access | Junction table, tenant picker, staff switching |
| Phase 3 | Company-Scoped RLS | Dual-mode policies, cross-property reads |
| Phase 4 | Service Layer & API | Company-scoped CRUD, UI |

The context report (`PHASE-2-CONTEXT-REPORT.md`) adopted the investigation's Phase 2 label and elaborated it into a full staff-switching architecture: `staff_casino_access` junction table, `p_selected_casino_id` RPC parameter, tenant picker UI, ADR-024 INV-8 amendment for spoofable input, revocation semantics, JWT claims policy, and 8 security invariants — all oriented around **staff operating in multiple casinos**.

The scope inset (`cross_property_player_recognition_scope_inset.md`) — the authoritative scope boundary — states the opposite:

> **Explicit Non-Goals:**
> - staff switching active casino context
> - staff operating as another property
> - tenant switching UI
> - multi-casino operational sessions

> **Staff Context Remains Single-Casino:**
> `app.casino_id = staff.casino_id` — No tenant switching mechanism is introduced.

> **Scope Integrity Rule:**
> Cross-property functionality must expand recognition only. It must not expand operational authority.

The drift is a category error: the context report conflated the **means** (staff accessing multiple casinos) with the **end** (players visible across properties). The scope inset proves the latter does not require the former.

### Why Cross-Property Player Recognition Does NOT Require Multi-Casino Staff Access

Staff at Casino B already has:
- `app.casino_id` = their home casino (Casino B)
- `app.company_id` = their company (set by Phase 1, derived via `casino.company_id`)

To recognize a player enrolled at Casino A (a sister property under the same company):
1. A company-scoped RLS read policy checks `app.company_id` — not `app.casino_id`
2. Staff does NOT switch casino context. They remain Casino B staff
3. The player data is read-only across the company boundary
4. Any operational writes (local activation, new visit) happen at Casino B under Casino B's `app.casino_id`

The `app.company_id` session variable — already laid by Phase 1 — is the only tenancy primitive needed. No junction table. No tenant picker. No `p_selected_casino_id`.

---

## 2. Authoritative Phase 2 Scope

### What Phase 2 IS

**Cross-Property Player Recognition and Loyalty Entitlement**: Staff at their home casino can look up and recognize players enrolled at sister properties under the same company, view their company-usable loyalty entitlement, and locally redeem allowed entitlement through current-property workflows. Gaming action is local. Staff context is single-casino.

### Governing Principles (from scope insets + addendum)

1. **Recognition and loyalty entitlement cross the company boundary. Operational telemetry, financial records, and compliance records do not.** (Loyalty entitlement scope inset)
2. **Staff context remains single-casino.** `app.casino_id = staff.casino_id`. No switching.
3. **Accrual and redemption both execute locally. Their economic effect updates company-recognized entitlement. Their raw operational provenance remains property-scoped.** (Accrual/Redemption Alignment Addendum)
4. **Prompted local activation (Option B).** Discovery does not imply local play authorization. Staff must explicitly activate the patron at the current property. (Addendum §4)
5. **Lookup source decoupled from tenancy rules.** `resolvePatron(input)` → `getLocalPatronStatus()` → `activatePatronLocally()` → `startLocalGamingSession()` remain distinct steps. (Addendum §12)

### What Phase 2 Delivers

| Deliverable | Layer | Description |
|---|---|---|
| Company-scoped RLS on `player_casino` | Database | Dual-mode SELECT policy — enrollment visibility across company |
| Company-scoped RLS on `player_loyalty` | Database | Dual-mode SELECT policy — entitlement/balance visibility across company (1:1 with `player_casino`) |
| Recognition + entitlement RPC | Database | `rpc_lookup_player_company(p_search_term)` — SECURITY DEFINER. Returns identity, enrollment, company-usable loyalty entitlement, last-visit scalar, exclusion safety signal |
| Local activation RPC | Database | `rpc_activate_player_locally(p_player_id)` — creates `player_casino` row at current casino (casino-scoped write) |
| Exclusion safety signal | Database | Boolean flag + severity from sister-property exclusions, computed inside SECURITY DEFINER (no `player_exclusion` RLS change) |
| Service-layer read methods | Service | `getPlayerAcrossCompany()`, `getEnrollmentHistory()`, `getCompanyLoyaltyEntitlement()` |
| Player search UI (company-aware) | Frontend | Three states: Found locally (A), Found across company (B — with exclusion sub-states B1/B2), Not found (C). Loyalty entitlement visible in States A and B. |
| Local redemption UX | Frontend | Redemption workflows consuming company-recognized entitlement through Casino B-local controls |
| Local activation UX | Frontend | "Activate at this property" confirmation flow; blocked/escalated when exclusion flag present |
| Audit events | Database | `company_lookup`, `local_activation`, `loyalty_redemption` event types |

### What Phase 2 Does NOT Deliver

| Capability | Why Not | Where It Lives |
|---|---|---|
| `staff_casino_access` junction table | Staff remains single-casino-bound | Separate future effort (if ever needed) |
| Tenant picker / casino switcher | No casino switching in this effort | Separate future effort |
| `p_selected_casino_id` RPC parameter | Violates scope inset; ADR-024 INV-8 stays intact | Not needed for company-scoped reads |
| ADR-024 INV-8 amendment | No client-supplied casino selection | INV-8 remains unchanged |
| JWT claims changes | No multi-casino staff concept | JWT stays as-is |
| `X-Selected-Casino-Id` header | No casino switching propagation | Not applicable |
| Revocation semantics | No access grants to revoke | Not applicable |
| Cross-casino operational writes | Prohibited by scope inset | Permanently out of scope for this effort |

---

## 3. Technical Foundation (What Phase 1 Already Provides)

Phase 1 (commit `e86e5eb`, ADR-043) laid exactly the infrastructure needed:

| Primitive | Status | Phase 2 Use |
|---|---|---|
| `company` table populated | Done | Company boundary for read policies |
| `casino.company_id` NOT NULL + RESTRICT FK | Done | JOIN path for RLS dual-mode |
| `app.company_id` session variable (SET LOCAL) | Done | RLS policy predicate for company-scoped reads |
| `RLSContext.companyId` in TypeScript | Done | Service-layer company awareness |
| `set_rls_context_from_staff()` derives company | Done | Authoritative context chain |

Phase 2 consumes these primitives. It does not need new tenancy infrastructure.

---

## 4. RLS Design Direction

> Full analysis: [`PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION.md`](PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION.md)

### Recognition + Entitlement Data Surface Rule

> **Company-scoped reads may surface identity, enrollment, and loyalty entitlement. Operational telemetry, financial records, and compliance records remain property-scoped.**

Any table whose rows represent casino-specific game mechanics, compliance obligations, financial accounting, or operational telemetry is excluded from company-scoped reads — regardless of whether the data "would be useful." The boundary is not usefulness; it is regulatory exposure. Cross-property visibility of rating slips, compliance records, or table-level telemetry creates jurisdictional liability that no read-only flag mitigates.

Loyalty entitlement (`player_loyalty`) crosses the boundary because it represents what the player **has earned** — a balance/tier state at the enrollment grain. The `loyalty_ledger` (how the player earned it — individual accrual entries, campaign context, points delta) does not cross the boundary because it represents operational accounting.

Raw `loyalty_ledger` rows remain deferred. If cross-property redemption UX later requires loyalty history or provenance, it must be introduced as a sanitized projection or derived summary — not as broad raw ledger sharing. The presence of `points_delta` data does not justify cross-property exposure of campaign metadata, staff linkage, visit linkage, or raw operational provenance.

### Two-Tier Recognition + Entitlement Surface

Phase 2 uses two distinct mechanisms to provide cross-property data — RLS policy broadening only where safe, SECURITY DEFINER scalar extraction everywhere else:

**Tier 1 — RLS Policy Change (2 tables):**

| Table | Change | Why Safe |
|---|---|---|
| `player` | None needed | Already global (no `casino_id`) |
| `player_casino` | Company-scoped SELECT | Enrollment metadata only (`player_id`, `casino_id`, `status`, `enrolled_at`). No operational telemetry. |
| `player_loyalty` | Company-scoped SELECT (entitlement projection) | Entitlement state at enrollment grain. Cross-property exposure limited to columns required for entitlement visibility: `current_balance`, `tier`. 1:1 FK with `player_casino`. No accrual detail, no transaction history. Non-essential fields (`preferences`) may be excluded from the cross-property projection. |

**Tier 2 — SECURITY DEFINER Scalar Extraction (0 policy changes):**

| Source Table | Signal Returned | Why Not RLS |
|---|---|---|
| `visit` | `last_company_visit` (single timestamp) | Rows contain `gaming_day`, `visit_kind`, duration, `visit_group_id` — operational telemetry. 5 child tables (`rating_slip`, `loyalty_ledger`, `pit_cash_observation`, `player_financial_transaction`, `mtl_entry`) with CRITICAL-sensitivity data. |
| `player_exclusion` | `has_sister_exclusions` (boolean) + `max_exclusion_severity` (text) | Rows contain exclusion type, jurisdiction, enforcement, reason — compliance data per ADR-042. Safety signal is a recognition obligation; detail exposure is not. |

The recognition summary RPC reads these tables inside SECURITY DEFINER and returns only computed scalars. No cross-property rows leave the function boundary.

### Exclusion Safety Signal

Cross-property recognition creates a safety gap: a player banned at Casino A can be discovered and activated at Casino B without warning, because `player_exclusion` is casino-scoped (ADR-042 D1). The recognition RPC closes this gap by including an exclusion flag — not the compliance details, just the signal.

State B in the workflow gains a sub-state:

| Sub-state | Condition | UX |
|---|---|---|
| B1 | No sister exclusions | "Activate at this property" |
| B2 | Has sister exclusions | Warning banner + activation blocked or requires elevated role |

### Tables That Remain Casino-Only

All operational, compliance, and financial tables. Full classification in the [optimization document](PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION.md#explicitly-deferred-domains).

### Security Requirements

- `app.company_id` is derived server-side (Phase 1, ADR-024 INV-8 intact)
- Company-scoped read path activates ONLY when `app.company_id IS NOT NULL`
- Single-casino users see zero behavioral change (Path 1 matches as before)
- Write policies are untouched — casino-scoped enforcement preserved
- Shadow policies recommended before production rollout
- 4-agent security review before merge (per ADR-043 risk section)
- SECURITY DEFINER RPCs must be reviewed under ADR-018 governance

---

## 5. Operational Workflow (from Addendum)

```
Staff at Casino B performs manual patron lookup
    │
    ▼
Recognition RPC searches player within app.company_id boundary
Returns: identity, enrollment, company-usable loyalty entitlement, safety signals
    │
    ├─ State A: Found, active at Casino B
    │   → Company-usable loyalty entitlement visible
    │   → Proceed to local gaming workflow
    │   → Local redemption available where company policy permits
    │
    ├─ State B: Found at sister property, not active at Casino B
    │   │  Company-usable loyalty entitlement visible
    │   │
    │   ├─ B1: No sister exclusions
    │   │   → UI: "Activate at this property"
    │   │   → Staff confirms → creates player_casino row at Casino B
    │   │   → Local redemption available after activation
    │   │
    │   └─ B2: Has sister exclusions (safety signal from RPC)
    │       → Warning: "This player has restrictions at another property"
    │       → Activation blocked or requires elevated role (product decision)
    │
    └─ State C: Not found
        → Standard new patron onboarding
```

Staff never leaves Casino B's operational context. `app.casino_id` is Casino B throughout. `app.company_id` expands the read and entitlement horizon, not the operational authority.

**Local accrual and redemption accounting**: Both accrual and redemption create local `loyalty_ledger` entries at the acting casino. Their economic effect updates `player_loyalty.current_balance` — the company-visible entitlement surface — so sister properties see truthful entitlement state. Neither action exposes or directly mutates sister-property ledger rows. Raw provenance (how points were earned or spent) remains property-scoped.

---

## 6. ADR-024 Impact (Phase 2)

| ADR-024 Element | Phase 2 Change |
|---|---|
| INV-8 (no spoofable parameters) | **NO CHANGE.** No `p_selected_casino_id`. No client-supplied casino selection. |
| `set_rls_context_from_staff()` signature | **NO CHANGE.** Phase 1 already added `company_id` to return type. |
| `app.company_id` session variable | **CONSUMED.** Now referenced by RLS read policies. |
| Context derivation chain | **UNCHANGED.** `auth.uid() → staff → casino → company` (same as Phase 1). |

This is significant: Phase 2 as scoped here requires **zero amendments to ADR-024**. The Phase 1 foundation is sufficient. The context report's D1-D4 decisions (all centered on `p_selected_casino_id`) are not needed.

---

## 7. Revised Phase Roadmap

The investigation's phases need resequencing to match the actual intent:

| Phase | Scope | Status | Notes |
|---|---|---|---|
| **Phase 1** | Company Foundation | **DONE** (e86e5eb) | ADR-043. `company` populated, `app.company_id` derived. |
| **Phase 2** | Cross-Property Player Recognition + Loyalty Entitlement | **THIS EFFORT** | Company-scoped read RLS (`player_casino`, `player_loyalty`), player lookup, loyalty visibility, local activation + redemption. Staff stays single-casino. |
| Phase 3 (if needed) | Multi-Casino Staff Operations | Future — separate ADR | Junction table, tenant picker, staff switching. Only if business requires staff operating across casinos. |
| Phase 4 (if needed) | Company-Scoped Operational Dashboards | Future — separate ADR | Cross-property reporting, aggregated views. |

Phase 3 (Multi-Casino Staff Access) may never be needed. The scope inset explicitly defers it as a separate architectural effort. The context report's work product remains valuable as reference material IF Phase 3 is ever pursued.

---

## 8. What the Context Report Gets Right (Preserved Value)

Despite the scope drift, the context report contains valuable analysis that should be preserved as reference for any future Multi-Casino Staff Access effort:

- `staff_casino_access` junction table design (§2.1)
- `p_selected_casino_id` validation pattern (§2.4)
- Threat model for staff-switching scenarios (§4, T1-T8)
- Security invariants for multi-casino operations (INV-P2-1 through INV-P2-8)
- Revocation semantics analysis (D2)
- Frontend tenant picker architecture (§7)

These are correct answers to a question Phase 2 does not ask.

---

## 9. Artifacts for Phase 2 ADR

This realignment provides the groundwork for:

| Artifact | Purpose | Key Input |
|---|---|---|
| **ADR-044** | Cross-Property Player Recognition — formal decisions on recognition surface, scalar extraction pattern, exclusion safety signal, local activation | This document §4, §6 + [Optimization](PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION.md) |
| **PRD-051** | Product requirements for company-aware player search + three-state UX + exclusion sub-states | This document §5, Addendum §7, Optimization §Exclusion Safety Signal |
| **SEC_NOTE** | Threat model for company-scoped read expansion + SECURITY DEFINER scalar extraction | [Optimization](PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION.md) §Tier 2, §Visit Chain Problem |

### Recommended Entry Point

```
/feature-start "Dual-Boundary Tenancy Phase 2 — Cross-Property Player Recognition and Loyalty Entitlement"
```

### Pre-ADR Decisions Required

| ID | Decision | Options | Recommendation | Status |
|---|---|---|---|---|
| D1 | Which tables get company-scoped read policies? | Full set vs. minimal | **`player_casino` + `player_loyalty`.** Enrollment metadata + entitlement state. All other cross-property data via SECURITY DEFINER scalar extraction. | Resolved by [Optimization](PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION.md) + [Loyalty Entitlement Inset](cross_property_player_recognition_loyalty_entitlement_scope_inset.md) |
| D2 | How does host context (last visit) cross the boundary? | RLS dual-mode on `visit` vs. scalar in recognition RPC | **Scalar extraction.** `visit` rows contain operational telemetry and parent 5 CRITICAL child tables. RPC returns `last_company_visit` timestamp only. | Resolved by [Optimization](PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION.md) |
| D3 | Local activation via RPC or service action? | New RPC vs. existing `player_casino` INSERT path | New audited RPC — captures activation intent distinctly from enrollment | Open |
| D4 | Loyalty entitlement — Phase 2 or defer? | Include vs. defer | **Include.** `player_loyalty` is entitlement state at the enrollment grain (balance + tier), not operational telemetry. Required by business capability per loyalty entitlement scope inset. | Resolved |
| D5 | Exclusion safety signal — what severity triggers what UX? | Block activation vs. warn vs. require elevated role | Product decision for PRD-051. System provides the signal; business rules determine response. | Open (product) |
| D6 | Local redemption workflow — how does Casino B consume company entitlement? | Direct balance mutation vs. ledger entry vs. redemption RPC | Casino B creates a local `loyalty_ledger` entry (casino-scoped write) that debits the company-visible balance. Exact mechanics require loyalty domain analysis. | Open (architecture) |
| D7 | Canonical redemption surface — what does the player see? | **A**: Single company-usable total / **B**: Per-property balances visible cross-property / **C**: Hybrid (company total + optional property breakdown) | ADR-044 must freeze this. Determines whether `player_loyalty` rows are presented individually per casino or aggregated. | Open (product + architecture) |

---

## 10. Disposition of PHASE-2-CONTEXT-REPORT.md

The context report is **not retracted**. It is **reclassified**:

- **Original classification**: Phase 2 groundwork
- **New classification**: Future reference for Multi-Casino Staff Access (Phase 3+, if pursued)
- **Rename recommendation**: `MULTI-CASINO-STAFF-ACCESS-REFERENCE.md` (to prevent future scope confusion)

The context report's title ("Multi-Casino Staff Access + Tenant Picker") was accurate to its content. The problem was interpreting that content as Phase 2 scope when the authoritative documents define Phase 2 as Cross-Property Player Recognition.
