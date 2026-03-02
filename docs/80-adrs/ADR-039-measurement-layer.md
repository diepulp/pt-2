---
title: "ADR-039: Measurement Layer — Cross-Cutting Read Models for Structural Measurability"
adr_id: "ADR-039"
status: "Proposed"
date: "2026-03-01"
owner: "Platform/Cross-Cutting"
decision_scope: "Read-only measurement artifacts that surface structural properties across bounded contexts"
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
| Telemetry coverage | Per-table session lifecycle, rating slip lifecycle | No casino-wide aggregate coverage metric; no historical tracking |
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

**Context:** PT-2's SRM enforces strict bounded context ownership: services own tables, cross-context access happens via DTOs and RPCs, never via direct table reads. Measurement artifacts inherently span contexts — an audit correlation view must join `rating_slip` (RatingSlipService), `player_financial_transaction` (PlayerFinancialService), `mtl_entry` (MTLService), and `loyalty_ledger` (LoyaltyService). This would normally violate SRM ownership boundaries.

**Decision:** The Measurement Layer is a **governed exception** to single-context table ownership, constrained as follows:

1. Measurement artifacts are **read-only** — they may not mutate any domain table.
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

#### Artifact 2: `measurement.audit_event_correlation_v` (Cross-Context Read Model View)

| Property | Value |
|---|---|
| **Type** | SQL view with `security_invoker = true` |
| **Owning Context** | Platform/Cross-Cutting (Measurement Layer) |
| **Source Tables** | `rating_slip` (RatingSlipService), `player_financial_transaction` (PlayerFinancialService), `mtl_entry` (MTLService), `loyalty_ledger` (LoyaltyService) |
| **Refresh Strategy** | Live — SQL view over current data |
| **RLS Posture** | `security_invoker = true` — each source table's RLS applies under caller identity |
| **Role Gate** | pit_boss, admin (route-level, matching ADR-025 MTL read access) |

**Purpose:** Provide end-to-end financial lineage: `rating_slip` → `player_financial_transaction` → `mtl_entry` → `loyalty_ledger` — in one query. Designed for auditor and regulator demonstration.

**Correlation key:** `rating_slip.id` is the FK held by all three downstream tables (`player_financial_transaction.rating_slip_id`, `mtl_entry.rating_slip_id`, `loyalty_ledger.rating_slip_id`). LEFT JOINs ensure slips with partial lineage are still visible.

**Schema note:** View is created in `public` schema (no separate `measurement` schema for MVP). Name prefix `measurement_` distinguishes from domain views.

#### Artifact 3: `measurement.telemetry_completeness_v` (Cross-Context Read Model View)

| Property | Value |
|---|---|
| **Type** | SQL view with `security_invoker = true` |
| **Owning Context** | Platform/Cross-Cutting (Measurement Layer) |
| **Source Tables** | `table_session` (TableContextService), `rating_slip` (RatingSlipService) |
| **Refresh Strategy** | Live — SQL view over current data |
| **RLS Posture** | `security_invoker = true` — each source table's RLS applies under caller identity |
| **Role Gate** | pit_boss, admin (route-level) |

**Purpose:** Compute per-shift and per-casino rating coverage ratio: what fraction of active table-hours had at least one rating slip. Surfaces rating coverage as a first-class metric — legacy systems do not compute this because they do not track table lifecycle independently of player sessions.

**Coverage formula:**
```
coverage_ratio = tables_with_ratings / total_active_tables
```
Per gaming day, per casino. A `table_session` with `status IN ('ACTIVE','RUNDOWN','CLOSED')` during the gaming day counts as an active table. A table is "covered" if at least one `rating_slip` exists referencing its `gaming_table_id` during the session window.

#### Artifact 4: `loyalty_liability_snapshot` (Materialized Snapshot Table)

| Property | Value |
|---|---|
| **Type** | New table + batch RPC |
| **Owning Context** | LoyaltyService (Reward Context) |
| **Source Tables** | `player_loyalty` (LoyaltyService), `loyalty_ledger` (LoyaltyService) |
| **Refresh Strategy** | Daily batch via SECURITY DEFINER RPC (`rpc_snapshot_loyalty_liability`); idempotent UPSERT keyed on `(casino_id, snapshot_date)` |
| **RLS Posture** | Pattern C hybrid policy on `casino_id` (ADR-020) |
| **Role Gate** | pit_boss, admin (route-level) |

**Purpose:** Materialize total outstanding loyalty liability per casino per day. Enable historical trending and executive reporting.

**Schema:**

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `casino_id` | uuid | NOT NULL, FK → casino | Casino scoping |
| `snapshot_date` | date | NOT NULL | Gaming day |
| `total_outstanding_points` | bigint | NOT NULL | SUM of all player balances |
| `total_monetary_value_cents` | bigint | NOT NULL | Points × redemption rate (cents, ADR-031) |
| `player_count` | integer | NOT NULL | Players with balance > 0 |
| `created_at` | timestamptz | NOT NULL, default now() | |
| — | — | UNIQUE | `(casino_id, snapshot_date)` |

**Derivation:** `total_outstanding_points = SUM(player_loyalty.balance) WHERE casino_id = $1`. Single-context — no cross-context reads. Monetary conversion uses casino-level redemption rate from `casino_settings`.

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

1. **Read-only:** The view may only SELECT. No INSERT/UPDATE/DELETE rules or triggers.
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

---

## Implementation Plan

### Phase 1 (Database Schema)

| Artifact | Migration | Bounded Context | Dependencies |
|---|---|---|---|
| `rating_slip.legacy_theo_cents` | `ALTER TABLE rating_slip ADD COLUMN legacy_theo_cents bigint` | RatingSlipService | None |
| `rating_slip.computed_theo_cents` | `ALTER TABLE rating_slip ADD COLUMN computed_theo_cents bigint` + CHECK constraint | RatingSlipService | None |
| `measurement_audit_event_correlation_v` | `CREATE VIEW ... WITH (security_invoker = true)` | Platform | Phase 1 columns |
| `measurement_telemetry_completeness_v` | `CREATE VIEW ... WITH (security_invoker = true)` | Platform | None |
| `loyalty_liability_snapshot` | `CREATE TABLE` + RLS policies + `rpc_snapshot_loyalty_liability` | LoyaltyService | None |

### Phase 2 (Service Integration)

- Extend `rpc_close_rating_slip` to compute and store `computed_theo_cents`
- Add `rpc_snapshot_loyalty_liability` (SECURITY DEFINER, ADR-024, idempotent UPSERT)
- CSV import pipeline to populate `legacy_theo_cents` during data migration
- Read endpoints for measurement artifacts (route-level role gating)

### Phase 3 (SRM Update)

- Add "Measurement Layer (Cross-Cutting Read Models)" section to SRM
- Register `loyalty_liability_snapshot` under LoyaltyService ownership
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

## Status

Proposed — Pending architectural review and implementation planning.
