---
id: PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION
title: "Phase 2 Optimization — Minimal Recognition + Entitlement Surface for Cross-Property Player Recognition"
status: Draft
date: 2026-03-13
related_to:
  - PHASE-2-SCOPE-REALIGNMENT
  - CROSS-PROPERTY-PLAYER-SHARING-INVESTIGATION
  - ADR-043
  - ADR-042 (Player Exclusion Architecture)
  - cross_property_player_recognition_loyalty_entitlement_scope_inset (entitlement scope expansion)
  - phase2_loyalty_accrual_redemption_alignment (accrual/redemption symmetry)
purpose: Reduce Phase 2 implementation complexity by limiting cross-property access to the minimum recognition + entitlement surface required for player discovery, loyalty visibility, safety signaling, and local activation/redemption.
---

# Phase 2 Optimization — Minimal Recognition + Entitlement Surface

## Executive Summary

Phase 2 originally proposed introducing company-scoped read capability across several player-adjacent domains (`player_casino`, `visit`, `player_loyalty`, `player_financial_transaction`). While technically valid, this approach expands the RLS blast radius unnecessarily.

The recognition + entitlement workflow needs to answer five questions:

1. Does this player exist anywhere within the company?
2. Is the player already enrolled at the current casino?
3. What loyalty entitlement does the player have across company properties?
4. Does this player have exclusions at sister properties?
5. If not enrolled locally, should staff activate the player?

Codebase analysis confirms these questions can be answered with **two RLS policy changes** (`player_casino` + `player_loyalty`) plus a **SECURITY DEFINER recognition RPC** that returns computed scalars for host context and safety signals — without broadening RLS on any operational table.

`player_loyalty` earns Tier 1 status because it is entitlement state at the enrollment grain (`current_balance`, `tier`) — not operational telemetry. It has a 1:1 FK with `player_casino` and contains no accrual detail, transaction history, or campaign mechanics. The `loyalty_ledger` (how points were earned) remains casino-scoped.

This document formalizes the optimized surface and the patterns that make it safe.

---

## Architectural Principles

> Recognition and loyalty entitlement cross the company boundary. Operational telemetry, financial records, and compliance records do not.

> Company-scoped reads may surface identity, enrollment, and loyalty entitlement. Operational telemetry remains property-scoped.

> The boundary is not usefulness; it is regulatory exposure.

> Accrual and redemption both execute locally. Their economic effect updates company-recognized entitlement. Their raw operational provenance remains property-scoped.

---

## Recognition + Entitlement Workflow Requirements

```
Staff at Casino B performs manual patron lookup
    │
    ▼
Company-wide player search (app.company_id)
Returns: identity, enrollment, company-usable loyalty entitlement, safety signals
    │
    ├─ State A: Player active locally
    │   → Company-usable loyalty entitlement visible
    │   → Proceed to local gaming workflow
    │   → Local redemption available where company policy permits
    │
    ├─ State B: Player exists at sister property, not active locally
    │   │  Company-usable loyalty entitlement visible
    │   │
    │   ├─ B1: No exclusions
    │   │   → UI: "Activate at this property"
    │   │   → Staff confirms → creates player_casino row at Casino B
    │   │   → Local redemption available after activation
    │   │
    │   └─ B2: Has sister exclusions (safety signal)
    │       → Warning: "This player has restrictions at another property"
    │       → Activation blocked or requires elevated role
    │
    └─ State C: Player not found
        → Standard new patron onboarding
```

`app.casino_id = staff.casino_id` throughout. No context switching. Redemption is a local write consuming company-visible entitlement.

---

## Minimal Recognition + Entitlement Surface

### Tier 1: RLS Policy Change (Required)

TWO tables require company-scoped read policies:

| Table | Change | Justification |
|---|---|---|
| `player` | None | Already global (no `casino_id`). No policy change needed. |
| `player_casino` | Company-scoped SELECT | Staff must see which sister properties recognize the player. Composite key `(player_id, casino_id)` with `status` and `enrolled_at`. Contains no operational telemetry. |
| `player_loyalty` | Company-scoped SELECT (entitlement projection) | Staff must see loyalty entitlement across company properties. 1:1 FK with `player_casino`. Cross-property exposure limited to entitlement-essential columns: `current_balance`, `tier`. Non-essential fields (`preferences`) may be excluded from the cross-property projection. |

These tables share the same grain (one row per player-casino enrollment) and together form the **enrollment + entitlement surface**. Their columns are identity and balance state — not operational telemetry.

**Why `player_loyalty` is safe for Tier 1:**
- `current_balance` (number) — aggregate balance, not individual transactions
- `tier` (text) — loyalty tier classification
- No `gaming_day`, no `visit_id`, no campaign mechanics, no accrual rules
- The `loyalty_ledger` (individual entries: points delta, campaign context, visit reference) remains casino-scoped

**Projection constraint:** Cross-property exposure of `player_loyalty` is justified by **redemption necessity**, not by table membership. If a column is not required for entitlement visibility or redemption decisions, it should not be part of the cross-property projection. `preferences` (JSON) is a candidate for exclusion — its contents are program metadata, not entitlement state.

**RLS pattern (same dual-mode for both tables):**

```sql
-- SELECT: Company-scoped read (dual-mode)
-- Applied to both player_casino and player_loyalty
CREATE POLICY {table}_select_company ON {table}
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      -- Path 1: Same casino (existing behavior)
      casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      OR
      -- Path 2: Same company (NEW — cross-property visibility)
      EXISTS (
        SELECT 1 FROM casino c
        WHERE c.id = {table}.casino_id
        AND c.company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
      )
    )
  );

-- INSERT/UPDATE/DELETE policies: UNCHANGED (casino-scoped)
```

### Tier 2: SECURITY DEFINER Scalar Extraction (Required)

Sensitive cross-property data (`visit`, `player_exclusion`) is accessed server-side by a SECURITY DEFINER RPC that returns only computed scalars. No RLS policy broadening on these tables.

**Recognition + entitlement summary RPC:**

```sql
-- Conceptual contract (exact implementation in ADR-044)
rpc_lookup_player_company(p_search_term text)
RETURNS TABLE (
  player_id            uuid,
  full_name            text,
  birth_date           date,
  enrolled_casinos     jsonb,     -- [{casino_id, casino_name, status, enrolled_at}]
  loyalty_entitlement  jsonb,     -- company-usable entitlement summary (exact shape per D7: single total, per-property, or hybrid)
  active_locally       boolean,   -- player_casino row exists at app.casino_id
  last_company_visit   timestamptz, -- scalar: MAX(visit.started_at) across company
  has_sister_exclusions boolean,  -- safety flag: active exclusions at any sister property
  max_exclusion_severity text     -- 'hard_block' | 'soft_alert' | 'monitor' | null
)
```

**How it works:**
- Calls `set_rls_context_from_staff()` to establish context (authoritative)
- Queries `player` globally (already global, no casino_id)
- Queries `player_casino` via company-scoped read policy (Tier 1) — enrollment data
- Queries `player_loyalty` via company-scoped read policy (Tier 1) — entitlement data
- Queries `visit` **inside SECURITY DEFINER** — reads cross-company rows, returns only `MAX(started_at)` as a scalar timestamp
- Queries `player_exclusion` **inside SECURITY DEFINER** — reads cross-company rows, returns only a boolean flag and severity level
- Returns narrow result set — no raw operational rows leave the function boundary

**Why this pattern:**
- `visit` contains operational telemetry (gaming_day, visit_kind, duration, visit_group_id) — exposing rows cross-property leaks competitive intelligence and regulatory data
- `player_exclusion` contains compliance data (jurisdiction, reason, enforcement type) — exposing rows cross-property leaks regulatory details
- Both tables have 5+ child tables with CRITICAL-sensitivity data (rating_slip, loyalty_ledger, pit_cash_observation, player_financial_transaction, mtl_entry) that would become indirectly queryable via JOINs if parent table RLS were broadened
- SECURITY DEFINER scalar extraction reads the data server-side and returns only the signal — no policy change, no row exposure, no child table risk

---

## Exclusion Safety Signal

### The Problem Recognition Creates

Before cross-property recognition, Casino B staff couldn't find a player enrolled only at Casino A. After recognition, they can find the player — but `player_exclusion` is casino-scoped (ADR-042 D1). This creates a gap:

```
Player banned at Casino A (hard_block)
  → Casino B staff performs company lookup
  → System finds player, shows enrollment at Casino A
  → No exclusion warning (exclusions are property-scoped)
  → Staff activates player locally at Casino B
  → Player who should have been flagged is now playing
```

### The Solution: Safety Signal, Not Data Sharing

The recognition RPC includes an exclusion safety flag computed inside SECURITY DEFINER:

| Signal | Type | Purpose |
|---|---|---|
| `has_sister_exclusions` | boolean | "This player has active exclusions at one or more sister properties" |
| `max_exclusion_severity` | text | Highest severity across sister properties: `hard_block`, `soft_alert`, `monitor`, or `null` |

**What the signal does NOT expose:**
- Which specific casino issued the exclusion
- The exclusion type (self-exclusion, trespass, regulatory, internal_ban, watchlist)
- The jurisdiction or external reference
- The reason text
- The enforcement details

Those remain property-scoped per ADR-042. The signal tells Casino B "proceed with caution" — the details are a matter for inter-property policy, not cross-property data leakage.

### UX Implication

State B in the recognition workflow gains a sub-state:

```
State B: Found at sister property, not active locally
    │
    ├─ B1: No exclusions → "Activate at this property"
    │
    └─ B2: Has sister exclusions → Warning banner:
          "This player has restrictions at another property.
           Contact management before activating."
          → Activation blocked or requires elevated role
```

The exact UX policy (block vs. warn vs. require pit boss override) is a product decision for PRD-051, not an architectural one. The system provides the signal; business rules determine the response.

---

## Explicitly Deferred Domains

The following tables MUST remain casino-scoped during Phase 2. They fail the Recognition Data Surface Rule — their rows represent operational telemetry, compliance obligations, or financial accounting.

| Table | Category | Why Excluded |
|---|---|---|
| `visit` | Operational telemetry | Contains `gaming_day`, `visit_kind`, duration, `visit_group_id`. Rows leak competitive intelligence and regulatory timing. Host context served via scalar extraction instead. |
| `rating_slip` | Game mechanics | Table position, average bet, game settings, house edge. Casino-specific operational data. Child of `visit`. |
| `loyalty_ledger` | Reward accounting | Points delta, campaign context, accrual rules, staff linkage, visit linkage. Property-specific reward policy. Child of `visit`. Raw ledger rows remain deferred; if cross-property redemption UX later requires loyalty history, it must be introduced as a sanitized projection, not broad raw ledger sharing. |
| `player_financial_transaction` | Financial accounting | Buy-in/cash-out amounts, transaction kind, direction. Property-scoped accounting. Child of `visit`. |
| `pit_cash_observation` | Financial telemetry | Exact cash movements in cents, observation source. CRITICAL sensitivity. Child of `visit`. |
| `mtl_entry` | Compliance/AML | Money transfer amounts and timing. Jurisdictional compliance data. Child of `visit`. |
| `player_exclusion` | Compliance | Exclusion type, jurisdiction, enforcement, reason. Safety signal served via scalar extraction instead. |
| `promo_coupon` | Reward rules | Casino-specific redemption rules. |
| `player_note`, `player_tag` | Operational context | Casino-specific staff observations. |

Note: `player_loyalty` is NOT deferred — it is Tier 1 (company-scoped RLS read). It contains entitlement state (`current_balance`, `tier`), not operational telemetry. The `loyalty_ledger` (individual accrual entries) remains casino-scoped in this list.

### The Visit Chain Problem

`visit` is the parent of 5 CRITICAL-sensitivity child tables. Broadening `visit` RLS to company-scoped reads would mean:

```
visit (company-scoped read)
  ├─ rating_slip (casino-scoped) ← JOIN still blocked by rating_slip RLS
  ├─ loyalty_ledger (casino-scoped) ← JOIN still blocked
  ├─ pit_cash_observation (casino-scoped) ← JOIN still blocked
  ├─ player_financial_transaction (casino-scoped) ← JOIN still blocked
  └─ mtl_entry (casino-scoped) ← JOIN still blocked
```

While child table RLS would block direct JOINs, exposing the parent `visit` rows still leaks:
- How many visits the player had at each property (count)
- When they visited (started_at, ended_at → timing patterns)
- What kind of visits (visit_kind → loyalty strategy inference)
- How long sessions lasted (duration → behavioral profiling)

This is not recognition context. It is operational intelligence. The scalar `last_company_visit` (a single timestamp) provides the host context needed without any of this exposure.

---

## Implementation Scope Comparison

### Original Broad Surface (from investigation §3)

| Table | Policy Change |
|---|---|
| `player_casino` | Company-scoped SELECT |
| `visit` | Company-scoped SELECT |
| `player_loyalty` | Company-scoped SELECT |
| `player_financial_transaction` | Company-scoped SELECT |

4 tables, 4 policy rewrites, 4 shadow policies, 4 regression test suites. Each broadened table is a new vector for cross-property data leakage. `visit` alone has 5 critical child tables.

### Optimized Surface (this document)

| Component | Change |
|---|---|
| `player_casino` | Company-scoped SELECT (1 policy) |
| `player_loyalty` | Company-scoped SELECT (1 policy, same pattern) |
| Recognition + entitlement RPC | New SECURITY DEFINER function (scalars only for visit + exclusion) |
| Local activation RPC | New SECURITY DEFINER function (casino-scoped write) |

2 policy changes. 2 new RPCs. Zero broadening of operational tables.

### Reduction

| Dimension | Broad | Optimized |
|---|---|---|
| RLS policies modified | 4 | 2 |
| Shadow policies needed | 4 | 2 |
| Security audit scope | 4 tables + child exposure | 2 tables (enrollment grain) + 2 RPCs |
| Regression test suites | 4 table-level | 2 table + RPC contract tests |
| Risk of operational data leakage | HIGH (visit chain) | NONE (visit/exclusion via scalars only; loyalty is entitlement, not telemetry) |

---

## Future Expansion (If Needed)

Broader company-scoped visibility may later support:

| Capability | Mechanism | Phase |
|---|---|---|
| Cross-property financial summaries | Aggregate scalar RPC | Future |
| Cross-property analytics/dashboards | Company-scoped read on specific tables + dedicated ADR | Future |
| Company-wide exclusion propagation | Two-layer model per ADR-042 future work | Future |
| Loyalty history / provenance | Sanitized projection or derived summary of `loyalty_ledger` + dedicated ADR (never raw ledger sharing) | Future |

These capabilities should be introduced only when the business case exists. They belong to a separate architectural phase, not the recognition + entitlement MVP.

---

## Governance Rules

### Recognition + Entitlement Data Surface Rule

> Company-scoped reads may surface identity, enrollment, and loyalty entitlement. Operational telemetry, financial records, and compliance records remain property-scoped.

### Entitlement Boundary Rule

> Loyalty entitlement (`player_loyalty`: balance + tier) crosses the company boundary. Loyalty accounting (`loyalty_ledger`: individual entries, campaign context, accrual rules) does not. The distinction is: **what the player has** vs. **how the player earned it**.

### Scalar Extraction Rule

> When cross-property data is needed for host context or safety signaling, it must be accessed via SECURITY DEFINER scalar extraction — not by broadening RLS policies on operational tables. The function reads cross-company rows server-side and returns only computed signals.

### Exclusion Safety Rule

> Any recognition workflow that surfaces players from sister properties MUST include an exclusion safety signal. Expanding recognition visibility without expanding exclusion awareness creates a safety gap.

### Local Accrual and Redemption Rule

> Accrual and redemption both create local `loyalty_ledger` entries at the acting casino. Their economic effect updates `player_loyalty.current_balance` — the company-visible entitlement surface — so sister properties see truthful entitlement state. Neither action exposes or directly mutates sister-property ledger rows. Raw provenance (how points were earned or spent) remains property-scoped. Company-level entitlement is consumed through controlled loyalty rules, not by exposing another property's ledger internals.

---

## Relationship to Other Documents

| Document | Relationship |
|---|---|
| `PHASE-2-SCOPE-REALIGNMENT.md` | Parent — this document refines §4 (RLS Design Direction) |
| `cross_property_player_recognition_scope_inset.md` | Authoritative scope boundary (recognition) — this document implements its constraints |
| `cross_property_player_recognition_loyalty_entitlement_scope_inset.md` | Authoritative scope boundary (entitlement) — adds `player_loyalty` to required surface, enables local redemption |
| `CROSS-PROPERTY-PLAYER-SHARING-INVESTIGATION.md` | Technical foundation — this document narrows its Phase 3 surface |
| `cross-property-player-sharing-operational-addendum.md` | Workflow definition — this document adds exclusion sub-state to State B |
| `ADR-042` (Player Exclusion) | Exclusion architecture — D1 (property-scoped) creates the gap this document addresses |
| `phase2_loyalty_accrual_redemption_alignment.md` | Accrual/redemption symmetry — local events, company-visible entitlement effect, property-scoped provenance |
| `PHASE-2-CONTEXT-REPORT.md` | Superseded for Phase 2 — reclassified as Multi-Casino Staff Access reference |
