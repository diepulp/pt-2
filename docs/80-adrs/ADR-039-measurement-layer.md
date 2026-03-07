---
title: "ADR-039: Measurement Layer — Cross-Cutting Read Models for Structural Measurability"
adr_id: "ADR-039"
status: "Approved (conditional — see Approval Conditions)"
date: "2026-03-01"
owner: "Platform/Cross-Cutting"
decision_scope: "Cross-cutting measurement artifacts (no cross-context writes) that surface structural properties across bounded contexts"
amends: null
depends_on: "ADR-015, ADR-020, ADR-024"
related:
  - "docs/00-vision/strategic-hardening/ECONOMIC_DELTA_DISTILLATION.md"
  - "docs/00-vision/strategic-hardening/PT2_Marketing_Narrative_Replacement_Positioning.md"
  - "docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md"
  - "ADR-015-rls-connection-pooling-strategy.md"
  - "ADR-020-rls-track-a-mvp-strategy.md"
  - "ADR-024_DECISIONS.md"
  - "ADR-025-mtl-authorization-model.md"
  - "ADR-038-rundown-persistence-finalization-contract.md"
---

# ADR-039: Measurement Layer — Cross-Cutting Read Models for Structural Measurability

## Context

PT-2 computes deterministic financial truth: explicit theo formulas (`calculate_theo_from_snapshot`), immutable MTL derivation, append-only loyalty ledger, provenance-classified opening baselines, and authoritative actor enforcement via RLS and RPC gating (ADR-024).

However, **PT-2 does not yet formally surface what those values prove.**

The Economic Delta Distillation (2026-03-01) identified four structural advantages that exist in architecture but are not yet queryable through first-class read artifacts:

| Structural Advantage | Architecture Enables | Measurement Gap |
|---|---|---|
| Theo integrity | Deterministic computation, provenance-classified baselines | No legacy-reported theo for discrepancy surfacing; no persisted `computed_theo` on `rating_slip` |
| Audit traceability | Immutable MTL, append-only audit log, 61+ gated RPCs | No unified correlation query — auditor must manually join `rating_slip` → `player_financial_transaction` → `mtl_entry` → `loyalty_ledger` |
| Rating coverage | Per-table session lifecycle, rating slip lifecycle | No casino-wide aggregate rating coverage metric; no historical tracking |
| Loyalty liability | Append-only points ledger, signed delta model | No historical snapshots; no dollar valuation; no trend line |

Legacy systems cannot produce these measurements — their architecture (opaque calculation layers, mutable records, configuration-based compliance) makes it structurally impossible. PT-2's architecture makes it possible. The measurement surfaces simply haven't been activated.

### What This ADR Adds

- **D1:** Measurement Layer defined as a governed cross-cutting read-model concern
- **D2:** Four initial artifacts with explicit SRM ownership, derivation sources, and refresh strategies
- **D3:** `computed_theo_cents` materialized on `rating_slip` at close time (prerequisite for theo discrepancy measurement)
- **D4:** Cross-context view governance — how read models that span bounded contexts are permitted without violating SRM ownership rules

---

## Decision

### D1 — Measurement Layer as Cross-Cutting Read-Model Concern

**Context:** PT-2's SRM enforces strict bounded context ownership: services own tables, cross-context access happens via DTOs and RPCs, never via direct table reads. Measurement artifacts inherently span contexts — an audit correlation view must join `rating_slip` (RatingSlipService), `player_financial_transaction` (PlayerFinancialService), `mtl_entry` (MTLService), `loyalty_ledger` (LoyaltyService), and (optionally) `audit_log` (CasinoService) for actor/action traceability. This would normally violate SRM ownership boundaries.

**Decision:** The Measurement Layer is a **governed exception** to single-context table ownership, constrained as follows:

1. Measurement artifacts impose **no cross-context writes** — they may not mutate tables owned by another bounded context. Domain-owned materializations (columns written by the owning context's RPC, snapshot tables refreshed by the owning context's batch RPC) are permitted because write authority stays within the owning context's boundary.
2. Measurement artifacts may introduce: SQL views, materialized views, snapshot tables, and transitional ingestion columns.
3. Each artifact must declare: owning context, derivation source tables, refresh strategy, and RLS posture.
4. Cross-context views use PostgreSQL `security_invoker = true` (PG15+, supported by Supabase) so underlying table RLS policies are evaluated under the caller's identity. No SECURITY DEFINER bypass.
5. Measurement artifacts must be reproducible from domain truth — they are derived, not authoritative.

**Rationale — Why Not Per-Context Views:**

Views scoped to a single bounded context do not require this governance — any service may create views over its own tables. The Measurement Layer specifically addresses artifacts that span context boundaries, where the SRM has no existing precedent.

### D2 — Four Initial Artifacts with SRM Ownership Mapping

Each artifact is assigned to the bounded context that owns the majority of its derivation sources, or to Platform/Cross-Cutting for multi-context spans.

#### Artifact 1: `rating_slip.legacy_theo_cents` + `rating_slip.computed_theo_cents`

| Property | Value |
|---|---|
| **Type** | 2 columns on existing table (migration) |
| **Owning Context** | RatingSlipService (Telemetry) |
| **Source Tables** | `rating_slip` (self) |
| **Refresh Strategy** | `legacy_theo_cents` populated at import; `computed_theo_cents` materialized at slip close via `calculate_theo_from_snapshot` |
| **RLS Posture** | Inherits existing `rating_slip` Pattern C hybrid policies (ADR-020) |
| **Transitional** | `legacy_theo_cents` may be deprecated after migration phase; `computed_theo_cents` is permanent |

**Purpose:** Store legacy-reported theoretical win (in cents, per ADR-031 convention) during migration alongside PT-2's deterministic computation. Enables discrepancy surfacing:

```sql
SELECT AVG(ABS(computed_theo_cents - legacy_theo_cents)::numeric
           / NULLIF(legacy_theo_cents, 0))
FROM   rating_slip
WHERE  legacy_theo_cents IS NOT NULL
  AND  status = 'closed';
```

**Schema impact on SRM:** Two NULLABLE columns added to `rating_slip`. `computed_theo_cents` invariant: set once at close, immutable thereafter. `legacy_theo_cents` invariant: set once at import, immutable thereafter.

#### Artifact 2: `measurement_audit_event_correlation_v` (Cross-Context Read Model View)

| Property | Value |
|---|---|
| **Type** | SQL view in `public` schema with `security_invoker = true` |
| **Owning Context** | Platform/Cross-Cutting (Measurement Layer) |
| **Source Tables** | `rating_slip` (RatingSlipService), `player_financial_transaction` (PlayerFinancialService), `mtl_entry` (MTLService), `loyalty_ledger` (LoyaltyService), `audit_log` (CasinoService) |
| **Refresh Strategy** | Live — SQL view over current data |
| **RLS Posture** | `security_invoker = true` — each source table's RLS applies under caller identity |
| **Role Gate** | pit_boss, admin (route-level, matching ADR-025 MTL read access) |

**Purpose:** Provide end-to-end financial lineage: `rating_slip` → `player_financial_transaction` → `mtl_entry` → `loyalty_ledger` — correlated with the `audit_log` trail — in one query. Designed for auditor and regulator demonstration.

**Prerequisite:** `audit_log` must be append-only (immutable after insert). The Strategic Hardening Report identifies audit-log immutability as an open gap — this must be resolved before deploying the *audit-enriched* variant of the view. Until then, deploy the view **without** the `audit_log` join and amend it once the append-only invariant is enforced.

**Correlation key:** `rating_slip.id` is the FK held by downstream tables (`player_financial_transaction.rating_slip_id`, `mtl_entry.rating_slip_id`, `loyalty_ledger.rating_slip_id`). `audit_log` has no first-class FK to `rating_slip` — correlation uses `audit_log.details->>'rating_slip_id'` (JSONB text extraction, cast to `uuid` in the view). This is the established pattern: RPCs write `jsonb_build_object('rating_slip_id', v_result.id, ...)` into `audit_log.details`. Filter: `audit_log.domain = 'rating-slip'`. LEFT JOINs ensure slips with partial lineage are still visible.

**Concrete correlation columns (binding for migration):**
```sql
-- Base lineage (ships immediately):
LEFT JOIN player_financial_transaction pft ON pft.rating_slip_id = rs.id
LEFT JOIN mtl_entry me ON me.rating_slip_id = rs.id
LEFT JOIN loyalty_ledger ll ON ll.rating_slip_id = rs.id

-- Audit enrichment (blocked until audit_log append-only):
LEFT JOIN audit_log al
  ON (al.details->>'rating_slip_id')::uuid = rs.id
  AND al.domain = 'rating-slip'
```

**Schema note:** View is created in `public` schema (no separate `measurement` schema for MVP). Name prefix `measurement_` distinguishes from domain views.

#### Artifact 3: `measurement_rating_coverage_v` (Cross-Context Read Model View)

| Property | Value |
|---|---|
| **Type** | SQL view in `public` schema with `security_invoker = true` |
| **Owning Context** | Platform/Cross-Cutting (Measurement Layer) |
| **Source Tables** | `table_session` (TableContextService) *or equivalent ADR-038 lifecycle surface*, `rating_slip` (RatingSlipService) |
| **Refresh Strategy** | Live — SQL view over current data |
| **RLS Posture** | `security_invoker = true` — each source table's RLS applies under caller identity |
| **Role Gate** | pit_boss, admin (route-level) |

**Purpose:** Compute per-shift and per-casino table-time accounting with multi-bucket classification. Surfaces rating coverage, compliance completeness, and data-integrity gaps as first-class metrics — legacy systems do not compute this because they do not track table lifecycle independently of player sessions.

**Naming note:** The prior working title "telemetry completeness" was ambiguous — the Strategic Hardening Report uses that phrase to describe opening-baseline completeness, while this artifact measures operational time accounting across table-hours. The name `measurement_rating_coverage_v` precisely describes the primary use case (rating coverage), while the multi-bucket design supports compliance and operational views. A separate baseline-completeness view may be added in a future amendment if needed.

**Multi-bucket time accounting:**

PT-2 supports rated play, ghost/compliance-only tracking, idle table states, and temporary closures. A simplistic single-ratio metric misrepresents operational reality — ghost play is not missing data, idle time is not leakage. The view must expose time buckets per table per gaming day:

| Bucket | Definition |
|---|---|
| `open_seconds` | Total seconds the table was in an active lifecycle state |
| `rated_seconds` | Seconds covered by at least one rating slip |
| `ghost_seconds` | Seconds with ghost/compliance-only tracking (no player rating) |
| `idle_seconds` | Seconds the table was open but operationally idle |
| `untracked_seconds` | `open_seconds - rated_seconds - ghost_seconds - idle_seconds` (data integrity gap) |

**Derived ratios:**
```
rated_ratio     = rated_seconds / open_seconds        -- operational revenue visibility
accounted_ratio = (rated_seconds + ghost_seconds) / open_seconds  -- compliance completeness
untracked_ratio = untracked_seconds / open_seconds    -- data integrity gap
idle_ratio      = idle_seconds / open_seconds          -- operational inefficiency
```

Per gaming day, per casino. A `table_session` with `status IN ('ACTIVE','RUNDOWN','CLOSED')` during the gaming day counts as an active table. Ghost play counts as accounted time.

#### Artifact 4: `loyalty_liability_snapshot` (Materialized Snapshot Table)

| Property | Value |
|---|---|
| **Type** | New table + batch RPC |
| **Owning Context** | LoyaltyService (Reward Context) |
| **Source Tables** | `player_loyalty` (LoyaltyService), `loyalty_ledger` (LoyaltyService), `casino_settings` (CasinoService — read-only for redemption rate) |
| **Refresh Strategy** | Daily batch via SECURITY DEFINER RPC (`rpc_snapshot_loyalty_liability`); idempotent UPSERT keyed on `(casino_id, snapshot_date)` |
| **RLS Posture** | Pattern C hybrid policy on `casino_id` (ADR-020) |
| **Role Gate** | pit_boss, admin (route-level) |

**Purpose:** Materialize total outstanding loyalty liability per casino per day. Enable historical trending and executive reporting.

**Canonical vs valuated truth:** Points are the canonical source of truth — they are deterministic and derived solely from the append-only ledger. Dollar valuation is a policy-based derivation: it depends on a configurable redemption rate that may differ across properties, change over time, or be subject to executive override. The snapshot must clearly separate these two layers so consumers never conflate canonical truth with estimated valuation.

**Schema:**

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `casino_id` | uuid | NOT NULL, FK → casino | Casino scoping |
| `snapshot_date` | date | NOT NULL | Gaming day |
| `total_outstanding_points` | bigint | NOT NULL | **Canonical truth:** SUM of all player balances from append-only ledger |
| `estimated_monetary_value_cents` | bigint | NOT NULL | **Derived:** Points × valuation policy rate (cents, ADR-031). Label as "estimated" in all UI surfaces |
| `valuation_policy_version` | text | NOT NULL | Version identifier of the valuation policy used for this snapshot |
| `valuation_effective_date` | date | NOT NULL | Effective date of the valuation policy at snapshot time |
| `player_count` | integer | NOT NULL | Players with balance > 0 |
| `created_at` | timestamptz | NOT NULL, default now() | |
| — | — | UNIQUE | `(casino_id, snapshot_date)` |

**Derivation:** `total_outstanding_points = SUM(player_loyalty.balance) WHERE casino_id = $1`. Canonical — deterministic, reproducible from ledger alone. `estimated_monetary_value_cents = total_outstanding_points × cents_per_point` from the active valuation policy. Snapshots must record the policy version and effective date used, so valuations are reproducible even if the policy later changes.

**Valuation policy prerequisite:** A configurable valuation structure must exist (e.g., `loyalty_valuation_policy` table or `casino_settings` field) containing: `cents_per_point` (or inverse), optional tier overrides, effective date, and version identifier. If this structure does not yet exist, the batch RPC must create/reference it as part of the Phase 1 migration.

**UI constraint:** All dollar-denominated loyalty liability figures must be labeled "Estimated liability (policy-based valuation)" — never presented as canonical truth.

### D3 — `computed_theo_cents` Materialized at Slip Close

**Context:** `calculate_theo_from_snapshot` exists as a pure SQL function that computes theoretical win from a loyalty policy snapshot and slip inputs. Today, theo is computed on-the-fly and never stored. Measurement queries that aggregate theo across slips would need to recompute for every row — O(n) function calls per query.

**Decision:** `rpc_close_rating_slip` is extended to materialize `computed_theo_cents` on the rating slip row at close time. The value is computed once, stored, and immutable thereafter.

**Rationale — Why Materialize:**

| Approach | Rejected Because |
|---|---|
| Compute in view via `calculate_theo_from_snapshot` per row | O(n) function calls per aggregation query; prohibitively expensive for casino-wide discrepancy reports |
| Compute client-side | Violates "server is source of truth" principle; theo formula is domain logic |
| Trigger on rating_slip close | Same objection as ADR-038 D1: triggers add security ownership complexity (ADR-018 governance burden) for no functional benefit over inline RPC update |

**Invariant:** `computed_theo_cents` is NULL while slip is open, set once at close, immutable thereafter. Migration adds CHECK: `status != 'closed' OR computed_theo_cents IS NOT NULL` (closed slips must have theo).

### D4 — Cross-Context View Governance

**Context:** SRM §Cross-Context Consumption Rules (line 847) states: "Cross-context consumers interact via DTO-level APIs, service factories, or RPCs — never by reaching into another service's tables directly." Read-model views that JOIN across contexts technically violate this rule.

**Decision:** Cross-context **read-model views** are permitted under these constraints:

1. **No cross-context writes:** The view may only SELECT. No INSERT/UPDATE/DELETE rules or triggers. Domain-owned materializations (e.g., `computed_theo_cents` written by RatingSlipService's own RPC) are outside the view governance scope.
2. **`security_invoker = true`:** Underlying table RLS applies. No SECURITY DEFINER bypass.
3. **Declared in SRM:** Each cross-context view must be listed in the SRM under a "Measurement Layer" section with its source tables explicitly enumerated.
4. **No business logic:** Views perform JOINs and aggregations only. No computed business rules (e.g., no threshold comparisons, no eligibility checks). Business rules remain in owning context RPCs.
5. **No application writes:** Application code must never INSERT into tables based on measurement view outputs. Views are terminal read surfaces.
6. **Naming convention:** Cross-context measurement views use prefix `measurement_` (e.g., `measurement_audit_event_correlation_v`).

**SRM update required:** A new "Measurement Layer (Cross-Cutting Read Models)" section must be added to the SRM listing all cross-context views, their source tables, and owning context.

---

## Architectural Constraints

1. Measurement logic must not:
   - Introduce cross-context **write** dependencies
   - Mutate bounded context state
   - Bypass existing RPC guardrails (ADR-024)
   - Create alternative sources of truth

2. Measurement artifacts must:
   - Be reproducible from domain truth
   - Document derivation logic in migration comments
   - Follow ADR-031 (amounts in cents) for monetary values
   - Follow Pattern C hybrid RLS (ADR-020) for new tables
   - Use `security_invoker = true` for cross-context views

3. Economic or compliance claims must map to:
   - A specific measurement artifact declared in this ADR (or future amendments)
   - A queryable KPI derivable from that artifact
   - A deterministic derivation path traceable to source tables

4. Measurement must distinguish canonical truth from valuation:
   - Points balances, ledger sums, and event counts are canonical (deterministic, reproducible from domain state)
   - Dollar valuations, policy-applied rates, and estimated figures are derived (versioned, labeled, reproducible from canonical truth + policy state)
   - UI surfaces must clearly differentiate truth from estimation

5. Measurement must not misclassify valid operational states as defects:
   - Ghost/compliance-only tracking is accounted time, not a coverage gap
   - Idle table time is operational inefficiency, not data leakage
   - Only truly untracked time represents a data integrity gap

### `security_invoker = true` — Operational Gotchas

1. **PostgreSQL version requirement:** `security_invoker` is a PG15+ feature (`CREATE VIEW ... WITH (security_invoker = true)`). Verify with `SELECT version()` before migration.
2. **GRANTs still required:** `security_invoker` changes *whose* RLS policies are evaluated (caller, not view owner), but the caller must still hold `SELECT` on the view itself. Ensure `GRANT SELECT ON measurement_*_v TO authenticated;` (or role-specific grants) is included in migration scripts.
3. **PostgREST / Supabase exposure — DECIDED:** Views with `security_invoker = true` are auto-exposed by PostgREST like any other relation. Measurement views use **grant discipline** (not view-level RLS): `GRANT SELECT ON measurement_*_v TO authenticated;` combined with `security_invoker = true` ensures underlying table RLS applies. Direct PostgREST queries are permitted — the caller's RLS context (casino scoping, role) already constrains results. Route-level gating (pit_boss/admin) is enforced at the API layer as defense-in-depth but is not the sole access control mechanism. This follows the existing pattern used by all other views in PT-2 (e.g., `mtl_gaming_day_summary`, `visit_financial_summary`).
4. **Pre-PG15 fallback (not expected for PT-2):** On older Postgres, the equivalent effect requires the view to be owned by a non-superuser role that does not bypass RLS. This is not needed for PT-2's Supabase deployment but is documented for completeness.

---

## Implementation Plan

### Phase 1 (Database Schema)

| Artifact | Migration | Bounded Context | Dependencies |
|---|---|---|---|
| `rating_slip.legacy_theo_cents` | `ALTER TABLE rating_slip ADD COLUMN legacy_theo_cents bigint` | RatingSlipService | None |
| `rating_slip.computed_theo_cents` | `ALTER TABLE rating_slip ADD COLUMN computed_theo_cents bigint` + CHECK constraint | RatingSlipService | None |
| `measurement_audit_event_correlation_v` (base) | `CREATE VIEW ... WITH (security_invoker = true)` — **without** `audit_log` join | Platform | Phase 1 columns |
| `measurement_audit_event_correlation_v` (audit-enriched) | `CREATE OR REPLACE VIEW` adding `audit_log` LEFT JOIN | Platform | **Blocked until** `audit_log` append-only invariant is enforced (see Artifact 2 prerequisite) |
| `measurement_rating_coverage_v` | `CREATE VIEW ... WITH (security_invoker = true)` | Platform | Depends on finalized table-lifecycle contract (ADR-038) for the authoritative "active table-hours" source |
| `loyalty_valuation_policy` | `CREATE TABLE` + RLS policies + EXCLUDE constraint (one active per casino) | LoyaltyService | None |
| `loyalty_liability_snapshot` | `CREATE TABLE` + RLS policies + `rpc_snapshot_loyalty_liability` | LoyaltyService | `loyalty_valuation_policy` must exist |

### Phase 2 (Service Integration)

- Extend `rpc_close_rating_slip` to compute and store `computed_theo_cents`
- Add `rpc_snapshot_loyalty_liability` (SECURITY DEFINER, ADR-024, idempotent UPSERT)
- CSV import pipeline to populate `legacy_theo_cents` during data migration
- Read endpoints for measurement artifacts (route-level role gating)

### Phase 3 (SRM Update — Definition of Done)

Phase 3 is part of **Definition of Done**, not optional follow-up. ADR-039 status must not advance from "Approved" to "Accepted" until SRM registration is complete. No PR merges to main without SRM version bump in the same changeset.

- Add "Measurement Layer (Cross-Cutting Read Models)" section to SRM
- Register `measurement_audit_event_correlation_v` with source tables: `rating_slip`, `player_financial_transaction`, `mtl_entry`, `loyalty_ledger`, [`audit_log` — conditional]
- Register `measurement_rating_coverage_v` with source tables: `table_session`, `rating_slip`
- Register `loyalty_liability_snapshot` under LoyaltyService ownership
- Register `loyalty_valuation_policy` under LoyaltyService ownership
- Register `computed_theo_cents`, `legacy_theo_cents` as RatingSlipService schema invariants
- Bump SRM version

---

## Consequences

### Positive

- Structural advantages become demonstrable to executives, regulators, and prospects
- Economic value claims become queryable — every marketing claim maps to a measurement artifact
- Audit preparation time collapses from hours of manual reconciliation to a single correlated query
- Rating coverage becomes visible — unrated table-hours are no longer silent voids
- Loyalty liability tracking moves from quarterly spreadsheet estimates to daily computed snapshots
- Future features must include measurement surfaces by design (governance rule below)

### Negative / Trade-offs

- Slight increase in schema surface area (2 columns, 2 views, 1 table, 1 RPC)
- `legacy_theo_cents` introduces temporary dual-source storage during migration (explicitly transitional)
- `loyalty_liability_snapshot` requires daily refresh — additional operational concern
- Cross-context view governance creates a new SRM pattern that must be maintained
- `computed_theo_cents` adds a write to the `rpc_close_rating_slip` path (single additional UPDATE within existing transaction)

---

## Non-Goals

- Replace core reporting modules or domain dashboards
- Introduce BI tooling or ETL pipelines
- Implement anomaly detection or alerting (covered separately)
- Alter domain model boundaries or SRM ownership
- Create a separate `measurement` schema (MVP uses `public` schema with naming convention)

---

## Future Governance Rule

**No economic or compliance claim may be introduced into marketing materials, PRDs, or investor documents without a corresponding Measurement Layer artifact that makes the claim queryable.**

Enforcement: PRD review checklist must include "Measurement Layer artifact reference" for any claim asserting structural superiority over legacy systems.

---

## Approval Conditions

The following must hold for implementation to proceed:

1. **Artifact 2 audit enrichment is conditional.** The base correlation view ships without the `audit_log` join. The audit-enriched variant is blocked until `audit_log` append-only immutability is enforced (Strategic Hardening Report gap). Correlation key is concrete: `(audit_log.details->>'rating_slip_id')::uuid` filtered by `domain = 'rating-slip'`.
2. **Artifact 3 must bind to the ADR-038 lifecycle surface.** Do not implement against whatever table happens to exist today — the view must use the authoritative "active table-hours" surface declared by ADR-038's finalized contract (`table_session` with `status IN ('OPEN','ACTIVE','RUNDOWN')`).
3. **SRM update (Phase 3) is Definition of Done.** ADR-039 status must not advance to "Accepted" until SRM registration is complete. SRM version bump ships in the same changeset as the artifacts.
4. **PostgREST exposure uses grant discipline.** Measurement views are granted to `authenticated` role; underlying table RLS via `security_invoker = true` is the access control mechanism. Route-level role gating is defense-in-depth, not sole enforcement.
5. **Valuation policy is a separate table.** `loyalty_valuation_policy` (not a `casino_settings` field) stores `cents_per_point` with effective dating, version history, and admin-only writes. Prerequisite for Artifact 4.

---

## Status

Approved for implementation planning and Phase 1 migrations — subject to Approval Conditions above.
