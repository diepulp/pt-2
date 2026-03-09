# ADR-039 Metric Provenance Matrix

**Status:** Accepted
**Version:** 1.0.0
**Date:** 2026-03-07
**Owner:** Platform/Governance + Measurement Layer
**Implements:** ADR-041 D3 (Pragmatic Column Subset)

---

## 1. Purpose & Scope

This matrix declares the truth semantics for ADR-039's four measurement artifacts. It is the authoritative source for truth class, freshness, computation constraints, and reconciliation paths for each metric that surfaces display.

**Scope:** ADR-039 measurement artifacts only — 4 rows. This is not a comprehensive provenance registry for all PT-2 metrics. Slices 2-3 add their own rows through the expansion protocol (§5).

**What this matrix governs:**
- Truth class classification for each metric
- Freshness and invalidation constraints
- Source table provenance (SRM-registered)
- Reconciliation paths for verification
- Computation layer categories (not specific implementations)

**What this matrix does NOT govern:**
- Service shapes, RPC signatures, or API contracts (those are implementation decisions for EXEC-SPECs)
- Runtime enforcement or monitoring (document-time governance only)
- UI layout or component structure

**Provenance disclaimer:** Named sources referenced in the matrix rows (e.g., `measurement_audit_event_correlation_v`, `loyalty_liability_snapshot`) are descriptive links to already-ratified ADR-039 measurement artifacts. This document does not introduce new storage, view, or RPC commitments.

---

## 2. Column Definitions

12 pragmatic columns per ADR-041 D3. The remaining 10 columns from the Cross-Surface Provenance framework are deferred (see §5 Expansion Protocol).

| # | Column | Description | Example Values |
|---|--------|-------------|----------------|
| 1 | **Truth ID** | Stable identifier for the metric | `MEAS-001`, `MEAS-002` |
| 2 | **Truth Class** | Classification of truth semantics | Raw Record, Derived Operational, Compliance-Interpreted, Snapshot-Historical |
| 3 | **Metric Name** | Human-readable name | Theo Discrepancy, Rating Coverage |
| 4 | **Business Meaning** | What decision this value supports | Gap detection, compliance tracing |
| 5 | **Surface(s)** | Which UI surfaces consume this metric | `/admin/reports`, shift dashboard |
| 6 | **Formula / Rule** | Computation logic, units, filters, time windows | SQL expression, aggregation function |
| 7 | **Source Tables** | Authoritative tables/views/RPCs (SRM-registered) | `rating_slip`, `measurement_rating_coverage_v` |
| 8 | **Computation Layer** | Category of computation mechanism | SQL view, RPC, service mapper, materialized view, snapshot job |
| 9 | **Freshness Category** | How current the data must be | Live, Near-real-time, Request-time, Cached, Periodic, Snapshot |
| 10 | **Invalidation Trigger** | What state change requires refresh | Slip close, source table INSERT |
| 11 | **Reconciliation Path** | How the value is verified against source truth | Row-count parity, recalculation comparison |
| 12 | **Owner** | Service or domain responsible for correctness | TheoService, Measurement Layer, LoyaltyService |

### Truth Class Definitions

| Truth Class | Definition | Governance Implication |
|-------------|------------|----------------------|
| **Raw Record** | Direct database column value, no transformation | Source table is single source of truth; reconciliation is identity check |
| **Derived Operational** | Computed from raw records via deterministic formula | Formula must be reproducible; reconciliation compares materialized vs. recalculated |
| **Compliance-Interpreted** | Derived value with regulatory or compliance significance | May require additional governance columns in future (see §4); reconciliation must prove chain of custody |
| **Snapshot-Historical** | Point-in-time capture, not live | Freshness is periodic; reconciliation compares snapshot against live source at capture time |

### Freshness Category Definitions

| Category | Definition | Typical Use |
|----------|------------|-------------|
| **Live** | Reflects current database state at query time | Real-time displays |
| **Near-real-time** | Updated within seconds of source change | Event-driven refresh |
| **Request-time** | Computed fresh on each request via view or query | Operational dashboards |
| **Cached** | Computed and cached with explicit TTL | High-frequency reads |
| **Periodic** | Refreshed on a schedule (daily, hourly) | Snapshots, reports |
| **Snapshot** | Captured once, immutable after capture | Historical audits |

---

## 3. Matrix Table

### MEAS-001: Theo Discrepancy

| Column | Value |
|--------|-------|
| **Truth ID** | MEAS-001 |
| **Truth Class** | Derived Operational |
| **Metric Name** | Theo Discrepancy |
| **Business Meaning** | Surfaces gap between legacy-reported and PT-2 computed theo per rating slip. Enables operators to detect and investigate discrepancies in theoretical win calculations. |
| **Surface(s)** | `/admin/reports` |
| **Formula / Rule** | `ABS(computed_theo_cents - legacy_theo_cents) / NULLIF(legacy_theo_cents, 0)` |
| **Source Tables** | `rating_slip` (columns: `legacy_theo_cents`, `computed_theo_cents`) |
| **Computation Layer** | SQL query on indexed columns (implementation chooses layer) |
| **Freshness Category** | Request-time |
| **Invalidation Trigger** | Slip close (theo materialization on close is ratified — ADR-039 D3) |
| **Reconciliation Path** | Compare materialized theo against `theo.ts` recalculation from slip inputs |
| **Owner** | TheoService / RatingSlipService |

### MEAS-002: Audit Event Correlation

| Column | Value |
|--------|-------|
| **Truth ID** | MEAS-002 |
| **Truth Class** | Compliance-Interpreted |
| **Metric Name** | Audit Event Correlation |
| **Business Meaning** | End-to-end financial lineage: rating slip → player financial transaction → MTL entry → loyalty ledger. Enables compliance tracing of the complete financial chain for regulatory audit. |
| **Surface(s)** | `/admin/reports` |
| **Formula / Rule** | 4-table JOIN: `rating_slip → player_financial_transaction → mtl_entry → loyalty_ledger` |
| **Source Tables** | `measurement_audit_event_correlation_v` (ratified SECURITY INVOKER view — ADR-039 D4) |
| **Computation Layer** | SQL view (live, caller's RLS applies) |
| **Freshness Category** | Request-time |
| **Invalidation Trigger** | Any source table INSERT (PFT creation, MTL trigger, loyalty accrual) |
| **Reconciliation Path** | Row-count parity: each slip → expected PFT count → expected MTL count → expected ledger entries |
| **Owner** | Measurement Layer (cross-cutting) |

### MEAS-003: Rating Coverage

| Column | Value |
|--------|-------|
| **Truth ID** | MEAS-003 |
| **Truth Class** | Derived Operational |
| **Metric Name** | Rating Coverage |
| **Business Meaning** | Percentage of table-session time with active rating slips. Quantifies untracked gaps where players were at tables but not being rated. |
| **Surface(s)** | `/admin/reports`, pit dashboard, shift dashboard (future) |
| **Formula / Rule** | `rated_seconds / open_seconds` per table session; aggregate as `AVG(rated_ratio)` |
| **Source Tables** | `measurement_rating_coverage_v` (ratified SECURITY INVOKER view — ADR-039 D4) |
| **Computation Layer** | SQL view (live, caller's RLS applies) |
| **Freshness Category** | Request-time |
| **Invalidation Trigger** | Slip open/close, table session open/close |
| **Reconciliation Path** | `rated_seconds + untracked_seconds ≈ open_seconds` (time accounting identity) |
| **Owner** | Measurement Layer (cross-cutting) |

### MEAS-004: Loyalty Liability

| Column | Value |
|--------|-------|
| **Truth ID** | MEAS-004 |
| **Truth Class** | Snapshot-Historical |
| **Metric Name** | Loyalty Liability |
| **Business Meaning** | Daily snapshot of outstanding loyalty points and estimated dollar value per casino. Supports financial reporting and liability tracking. |
| **Surface(s)** | `/admin/reports` |
| **Formula / Rule** | `SUM(current_balance)` across active players × versioned valuation policy |
| **Source Tables** | `loyalty_liability_snapshot`, `loyalty_valuation_policy` (ratified tables — ADR-039 D5) |
| **Computation Layer** | Snapshot mechanism (existing RPC is one option; EXEC-SPEC decides invocation shape) |
| **Freshness Category** | Periodic (daily) |
| **Invalidation Trigger** | Loyalty accrual/redemption; valuation policy update |
| **Reconciliation Path** | `total_points` vs `SUM(player_loyalty.current_balance)` for snapshot date |
| **Owner** | LoyaltyService |

### Summary View

| Truth ID | Truth Class | Metric | Freshness | Owner |
|----------|-------------|--------|-----------|-------|
| MEAS-001 | Derived Operational | Theo Discrepancy | Request-time | TheoService / RatingSlipService |
| MEAS-002 | Compliance-Interpreted | Audit Event Correlation | Request-time | Measurement Layer |
| MEAS-003 | Derived Operational | Rating Coverage | Request-time | Measurement Layer |
| MEAS-004 | Snapshot-Historical | Loyalty Liability | Periodic (daily) | LoyaltyService |

---

## 4. Compliance-Class Expansion Note (MEAS-002)

MEAS-002 is classified **Compliance-Interpreted**, which is the most governance-sensitive truth class in this matrix. The Compliance-Interpreted class brushes against dimensions that the full Cross-Surface Provenance framework captures but this 12-column subset intentionally defers.

**Current assessment:** The 12-column subset is correct for Slice 0. These 4 rows do not yet require Interpretation Basis, Late Data Handling, or Consumer Tolerance columns.

**Trigger for expansion:** If Slice 1 implementation reveals that compliance review workflows around MEAS-002 need any of the following dimensions, they are added to MEAS-002's row through governed matrix expansion:

- **Interpretation Basis** — what regulatory framework or policy drives the compliance interpretation
- **Late Data Handling** — how the metric handles retroactive corrections or late-arriving transactions
- **Consumer Tolerance** — acceptable staleness or error margin for compliance consumers

**Expansion mechanism:** Amend this document + update SRM cross-reference. Do NOT improvise these semantics locally in the EXEC-SPEC.

**Design intent:** The lean 12-column shape is intentional, not metaphysically complete. The risk that MEAS-002 may need additional columns is acknowledged and mitigated by the governed expansion protocol — not by pre-populating columns with speculative "n/a" values.

---

## 5. Expansion Protocol

### 5.1 Adding Rows (Slices 2-3)

When future slices introduce new measurement artifacts:

1. Assign a new Truth ID following the `MEAS-XXX` pattern (next available: MEAS-005)
2. Populate all 12 columns per the definitions in §2
3. Validate source tables against SRM §Measurement Layer registered artifacts
4. Submit as a governed amendment to this document via PR
5. Update SRM cross-reference if new source tables are introduced

**Scope discipline:** Only add rows for metrics that have ratified database infrastructure (ADR-approved views, tables, or RPCs). Do not add rows for speculative or planned-but-unbuilt metrics.

### 5.2 Adding Columns

When a concrete metric requires dimensions beyond the current 12 columns:

1. Identify the specific row(s) that need the additional column
2. Reference the deferred column from the Cross-Surface Provenance framework (§5.3)
3. Submit as a governed amendment to this document
4. Update SRM cross-reference
5. Update the column count in §2

**Trigger rule (ADR-041 D3):** Columns are added per-row through governed matrix amendment when a concrete metric requires them. Expansion is triggered by implementation experience, not by speculative completeness.

### 5.3 Deferred Columns

The following 10 columns from the Cross-Surface Provenance framework are deferred from this initial matrix. They may be added per-row as needed:

| # | Deferred Column | When to Add |
|---|----------------|-------------|
| 13 | Consumer Class | When metric has distinct consumer categories with different access patterns |
| 14 | Consumer Tolerance | When staleness or error margin must be declared for compliance |
| 15 | Late Data Handling | When retroactive corrections affect metric accuracy |
| 16 | Interpretation Basis | When regulatory framework drives compliance interpretation |
| 17 | Required Filters/Scope | When metric requires mandatory filtering (e.g., date range, casino scope) |
| 18 | Historical Semantics | When point-in-time vs. current-state distinction matters |
| 19 | Audit/Reconciliation Path (detail) | When reconciliation path needs sub-steps documented |
| 20 | Known Risks | When specific risks to metric accuracy are identified |
| 21 | Notes | When additional context is needed |
| 22 | Status | When metrics have lifecycle states (draft, active, deprecated) |

---

## 6. SRM Cross-Reference

Source tables referenced in this matrix are validated against SRM §Measurement Layer (`docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`, line 837):

| Source Table / View | SRM Registration | Security Mode |
|--------------------|-----------------|---------------|
| `rating_slip` | RatingSlipService owned table | Row-level (RLS) |
| `measurement_audit_event_correlation_v` | Measurement Layer registered view | SECURITY INVOKER |
| `measurement_rating_coverage_v` | Measurement Layer registered view | SECURITY INVOKER |
| `loyalty_liability_snapshot` | LoyaltyService owned table | Row-level (RLS) |
| `loyalty_valuation_policy` | LoyaltyService owned table | Row-level (RLS) |

All source tables are registered in the SRM as owned artifacts. SECURITY INVOKER views apply caller's RLS — no privilege escalation. The `loyalty_liability_snapshot` RPC uses SECURITY DEFINER, governed by ADR-018.

---

## 7. References

| Document | Path |
|----------|------|
| ADR-039 (Measurement Layer) | `docs/80-adrs/ADR-039-measurement-layer.md` |
| ADR-041 (Surface Governance Standard) | `docs/80-adrs/ADR-041-surface-governance-standard.md` |
| RFC-001 (Standards Foundation Design) | `docs/02-design/RFC-001-standards-foundation.md` |
| Cross-Surface Provenance Plan | `docs/00-vision/strategic-hardening/pt-cross-surface-metric-provenance-governance-plan.md` |
| Surface Classification Standard | `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md` |
| SRM §Measurement Layer | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (line 837) |
| Over-Engineering Guardrail | `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` |
| ADR-039 Precis | `docs/00-vision/strategic-hardening/ADR-039 Measurement Layer — Overview Précis.md` |
