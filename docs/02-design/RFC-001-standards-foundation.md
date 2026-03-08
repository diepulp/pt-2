---
id: RFC-001
title: "Design Brief: Hardening Slice 0 — Standards Foundation"
owner: architect
status: Draft
date: 2026-03-07
affects:
  - docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md
  - docs/70-governance/METRIC_PROVENANCE_MATRIX.md
---

# Design Brief / RFC: Hardening Slice 0 — Standards Foundation

> Purpose: define the structure, content, and enforceability criteria for two governance artifacts — the Surface Classification Standard and the ADR-039 Metric Provenance Matrix — before anyone writes a PRD.

## 1) Context

PT-2's measurement infrastructure (ADR-039) is complete: 5 migrations, 2 views, 1 RPC, 2 tables, theo materialization. Multiple production surfaces prove strong patterns exist (RSC prefetch on the shift dashboard, BFF RPC aggregation on the rating slip modal, BFF summary endpoint on the shift API, client-led forms in admin settings). But no standard governs pattern selection for new surfaces, and no provenance matrix governs the truth those surfaces display.

The gap is structural: the measurement data is live and queryable, the patterns are proven, but rendering delivery and data aggregation choices are ad hoc. Before Slice 1 builds the measurement UI, Slice 0 must establish the minimum governance that constrains those choices.

**Forces shaping this design:**
- The Over-Engineering Guardrail prohibits abstractions beyond what's needed now (YAGNI)
- The enforceability test from STANDARDS-FOUNDATION.md: "A standard without teeth is a shrine"
- 4 ADR-039 artifacts are the only provenance scope — no broader framework population
- The proven pattern palette is 4 patterns, not 1 — the standard must recognize all of them as complementary

## 2) Scope & Goals

- **In scope:**
  - Surface Classification Standard structure and content
  - ADR-039 Metric Provenance Matrix structure and 4 rows
  - Cross-references to SRM, governance index, and existing pattern implementations
- **Out of scope:**
  - Provenance rows beyond ADR-039's 4 artifacts
  - Runtime enforcement tooling or linters
  - Materialized view or snapshot pipeline design
  - New architectural patterns
- **Success criteria:**
  1. The Surface Classification Standard can force a rendering delivery + data aggregation pattern choice for any proposed surface
  2. The Provenance Matrix constrains freshness, computation layer, and reconciliation for Slice 1's 4 widgets
  3. A non-compliant EXEC-SPEC can be rejected by citing a specific standard clause

## 3) Proposed Direction (overview)

Produce two Markdown governance documents. The Surface Classification Standard is a **decision matrix** — two orthogonal axes (rendering delivery, data aggregation) with measurable selection criteria. The Provenance Matrix is a **12-column table** with 4 rows, instantiating the Cross-Surface Provenance framework for ADR-039's measurement artifacts only. Both documents are designed to be cited in EXEC-SPECs and PRDs as constraints.

## 4) Detailed Design

### 4.1 Surface Classification Standard

**Location:** `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md`

**Structure:**

```
1. Purpose & scope
2. Two-axis classification model
   2a. Rendering Delivery axis (how the page loads)
   2b. Data Aggregation axis (how data reaches the page)
3. Pattern catalogue (4 proven patterns with reference implementations)
4. Selection decision matrix
5. Declaration requirement for new surfaces
6. Compliance examples (pass/fail)
```

**Axis 1 — Rendering Delivery** (how the page loads):

| Pattern | When to Use | Selection Criteria | Reference Implementation |
|---|---|---|---|
| **RSC Prefetch + Hydration** | Server-seeded dashboards where initial paint matters | Read-heavy, ≥2 independent queries, visible above the fold | Shift Dashboard V3 (`app/(protected)/shift-dashboard/page.tsx`) |
| **Client Shell** | Interaction-heavy flows where server shaping adds no value | Form-driven, low-frequency, admin/config flows | Admin Settings (`app/(dashboard)/admin/settings/`) |

**Axis 2 — Data Aggregation** (how data reaches the page):

| Pattern | When to Use | Selection Criteria | Reference Implementation |
|---|---|---|---|
| **BFF RPC Aggregation** (GOV-PAT-003) | Collapsing cross-context reads into one DB round trip | ≥3 bounded contexts, >100 calls/day, latency-sensitive | Rating Slip Modal (`rpc_get_rating_slip_modal_data`) |
| **BFF Summary Endpoint** | Combining multi-level rollups into one HTTP response | Multiple metric levels (casino/pit/table), reducing client round-trips | Shift Dashboard Summary (`/api/v1/shift-dashboards/summary/route.ts`) |
| **Simple Query / View** | Single-context read, low complexity | 1-2 tables, single bounded context, moderate frequency | Direct PostgREST or service-layer `.select()` |
| **Client-side Fetch** | Simple reads where aggregation adds no value | Single entity, low frequency, no cross-context join | Admin settings reads via `useCasinoSettings()` |

**Selection decision matrix** (the enforceability tool):

```
For any new surface, answer:

Q1: Rendering Delivery
  - Does the surface need server-seeded initial paint?
    YES → RSC Prefetch + Hydration
    NO  → Client Shell
  - Exception: if both apply (server seed + heavy interaction), use RSC
    for initial load, client-led for mutations (shift dashboard pattern)
  - NOTE: "Hybrid" means a declared composition of proven patterns (e.g.,
    RSC prefetch for initial paint + client-led for mutations), not a
    junk-drawer category. The EXEC-SPEC must name which proven patterns
    are composed and why. If the composition does not map cleanly to
    proven patterns, escalate via the no-fit clause.

Q2: Data Aggregation
  - How many bounded contexts does the surface read from?
    1-2 contexts → Simple Query / View or Client-side Fetch
    3+  contexts → BFF RPC or BFF Summary Endpoint
  - Is the data multi-level (casino → pit → table rollup)?
    YES → BFF Summary Endpoint
    NO  → BFF RPC Aggregation (if cross-context) or Simple Query (if not)
  - Expected call frequency?
    >100/day + latency-sensitive → BFF RPC (database round-trip optimization)
    <100/day or admin flow → Simple Query or Client-side Fetch acceptable
```

**Declaration requirement (hard rejection gate):** Every new surface EXEC-SPEC must include all four of the following. If any are missing, the spec is non-compliant and must be returned for amendment.

```
Surface Classification:
  Rendering Delivery: [RSC Prefetch | Client Shell | Hybrid]
  Data Aggregation:   [BFF RPC | BFF Summary | Simple Query | Client Fetch]
  Rejected Patterns:  [Which proven patterns were considered and why they don't fit]
  Metric Provenance:  [For each surfaced metric: provenance class + freshness class]
```

**No-fit escalation:** If no proven pattern cleanly fits the surface requirements, the EXEC-SPEC must stop and raise an ADR or standards amendment rather than inventing a local exception. The pattern palette grows through governed amendment, not ad hoc workarounds.

**Compliance examples:**

- PASS:
  ```
  Surface Classification:
    Rendering Delivery: RSC Prefetch (read-heavy dashboard, 4 independent queries above the fold)
    Data Aggregation:   BFF Summary Endpoint (4 metric levels from 6+ bounded contexts, >100 calls/day)
    Rejected Patterns:  Client Shell rejected — read-heavy dashboard needs server-seeded paint.
                        Simple Query rejected — 6+ bounded contexts requires BFF aggregation.
                        BFF RPC rejected — multi-level rollup (casino/pit/table) fits Summary pattern better.
    Metric Provenance:  MEAS-001 Derived Operational / Request-time;
                        MEAS-002 Compliance-Interpreted / Request-time;
                        MEAS-003 Derived Operational / Request-time;
                        MEAS-004 Snapshot-Historical / Periodic (daily)
  ```
- FAIL: "Measurement reports page uses client-side fetch for all 4 widgets." → Rejected: missing rejected-patterns rationale; missing metric provenance declarations; 6+ bounded contexts violates ≥3 → BFF rule; read-heavy dashboard violates RSC Prefetch selection criterion.

### 4.2 ADR-039 Metric Provenance Matrix

**Location:** `docs/70-governance/METRIC_PROVENANCE_MATRIX.md`

**Structure:**

```
1. Purpose & scope (ADR-039 only — 4 rows)
2. Column definitions (12 pragmatic columns)
3. Matrix table (4 rows)
4. Expansion protocol (how Slices 2-3 add rows/columns)
```

**12 columns** (Option A from scaffold).

**Compliance-class expansion note:** MEAS-002 is classified Compliance-Interpreted, which brushes against the truth class the scaffold warned could need wider treatment. The 12-column subset is correct for Slice 0 — these 4 rows do not yet require Interpretation Basis, Late Data Handling, or Consumer Tolerance. However, if Slice 1 implementation reveals that compliance review workflows around MEAS-002 need those dimensions, they are added to MEAS-002's row through governed matrix expansion (amend this document + update SRM cross-reference), not improvised locally in the EXEC-SPEC. The lean shape is intentional, not metaphysically complete.

**Columns:**

| # | Column | Description |
|---|---|---|
| 1 | Truth ID | Stable identifier (e.g., `MEAS-001`) |
| 2 | Truth Class | From governance plan: Raw Record / Derived Operational / Compliance-Interpreted / Snapshot-Historical |
| 3 | Metric Name | Human-readable name |
| 4 | Business Meaning | What decision this value supports |
| 5 | Surface(s) | Which UI surfaces consume it |
| 6 | Formula / Rule | Computation logic, units, filters, time windows |
| 7 | Source Tables | Authoritative tables/views/RPCs |
| 8 | Computation Layer | SQL view / RPC / service mapper / materialized view / snapshot job |
| 9 | Freshness Category | Live / Near-real-time / Request-time / Cached / Periodic / Snapshot |
| 10 | Invalidation Trigger | What state change requires refresh |
| 11 | Reconciliation Path | How the value is verified against source truth |
| 12 | Owner | Service or domain responsible for correctness |

**4 rows (draft governance placeholders — PRD finalizes).** These rows are authoritative about truth class, business meaning, freshness category, and reconciliation path. Source table and computation layer references reflect *existing ratified infrastructure* (ADR-039 migrations, SRM §Measurement Layer). They do not pre-commit Slice 1 to specific service shapes, RPC signatures, or API contracts — those are implementation decisions for the EXEC-SPEC.

| Truth ID | Truth Class | Metric Name | Business Meaning | Surface(s) | Formula / Rule | Source Tables | Computation Layer | Freshness | Invalidation | Reconciliation | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|
| MEAS-001 | Derived Operational | Theo Discrepancy | Surfaces gap between legacy-reported and PT-2 computed theo per slip | `/admin/reports` | `ABS(computed_theo_cents - legacy_theo_cents) / NULLIF(legacy_theo_cents, 0)` | `rating_slip` (columns: `legacy_theo_cents`, `computed_theo_cents`) | SQL query on indexed columns (implementation chooses layer) | Request-time | Slip close (theo materialization on close is ratified — ADR-039 D3) | Compare materialized theo against `theo.ts` recalculation from slip inputs | TheoService / RatingSlipService |
| MEAS-002 | Compliance-Interpreted | Audit Event Correlation | End-to-end financial lineage: slip → PFT → MTL → loyalty for compliance tracing | `/admin/reports` | 4-table JOIN: `rating_slip → player_financial_transaction → mtl_entry → loyalty_ledger` | `measurement_audit_event_correlation_v` (ratified SECURITY INVOKER view — ADR-039 D4) | SQL view (live, caller's RLS) | Request-time | Any source table INSERT (PFT creation, MTL trigger, loyalty accrual) | Row-count parity: each slip → expected PFT count → expected MTL count → expected ledger entries | Measurement Layer (cross-cutting) |
| MEAS-003 | Derived Operational | Rating Coverage | Percentage of table-session time with active rating slips — quantifies untracked gaps | `/admin/reports`, shift dashboard (future) | `rated_seconds / open_seconds` per table session; aggregate as `AVG(rated_ratio)` | `measurement_rating_coverage_v` (ratified SECURITY INVOKER view — ADR-039 D4) | SQL view (live, caller's RLS) | Request-time | Slip open/close, table session open/close | `rated_seconds + untracked_seconds ≈ open_seconds` (time accounting identity) | Measurement Layer (cross-cutting) |
| MEAS-004 | Snapshot-Historical | Loyalty Liability | Daily snapshot of outstanding loyalty points and estimated dollar value per casino | `/admin/reports` | `SUM(current_balance)` across active players × versioned valuation policy | `loyalty_liability_snapshot`, `loyalty_valuation_policy` (ratified tables — ADR-039 D5) | Snapshot mechanism (existing RPC is one option; EXEC-SPEC decides invocation shape) | Periodic (daily) | Loyalty accrual/redemption; valuation policy update | `total_points` vs `SUM(player_loyalty.current_balance)` for snapshot date | LoyaltyService |

### 4.3 API surface

N/A — documentation-only deliverable.

### 4.4 UI/UX flow

N/A — documentation-only deliverable. Slice 1 consumes these artifacts.

### 4.5 Security considerations

- **RLS impact:** None. No database changes.
- **RBAC requirements:** None. Governance documents are developer-facing.
- **Audit trail:** Documents are version-controlled in git. Changes tracked via standard PR review.
- **Note for Slice 1:** MEAS-002 (audit correlation view) and MEAS-003 (rating coverage view) use `SECURITY INVOKER` — caller's RLS applies. No privilege escalation. MEAS-004 (loyalty liability RPC) is `SECURITY DEFINER` — already governed by ADR-018.

## 5) Cross-Cutting Concerns

- **Performance implications:** None (no runtime changes).
- **Migration strategy:** N/A.
- **Observability / monitoring:** N/A.
- **Rollback plan:** Revert the two Markdown files.

## 6) Alternatives Considered

### Alternative A: Single Combined Document

- Description: Merge the Surface Classification Standard and Provenance Matrix into one document.
- Tradeoffs: Simpler to navigate initially, but mixes governance concerns (pattern policy vs. metric truth).
- Why not chosen: The two axes solve different problems. Surface classification governs *how* to build; provenance governs *what truth* to display. Keeping them separate allows the Surface Classification Standard to be cited by non-measurement surfaces (Slices 2-3, pit dashboard refactor) without dragging in irrelevant provenance rows.

### Alternative B: ADR Instead of Governance Standard

- Description: Codify the surface classification as an ADR (decision record) rather than a governance standard.
- Tradeoffs: ADRs are immutable decisions; a governance standard can evolve with column additions and new rows.
- Why not chosen: The surface classification is a living catalogue that grows with the codebase (new patterns, new reference implementations). An ADR should capture the *decision to adopt* the standard, not the standard itself. Phase 4 may produce an ADR amendment to formalize adoption.

## 7) Decisions Required

1. **Decision:** Where should the Provenance Matrix live?
   **Options:** `docs/20-architecture/METRIC_PROVENANCE_MATRIX.md` | `docs/70-governance/METRIC_PROVENANCE_MATRIX.md`
   **Resolved:** `docs/70-governance/`. The matrix governs truth delivery — that is governance in function even though it describes architecture. Both deliverables share the same home. Architecture docs cross-link to them.

2. **Decision:** Should Phase 4 produce a new ADR or amend an existing one?
   **Options:** New ADR-041 "Surface Governance Standard" | Amend ADR-039 with governance section
   **Recommendation:** Defer to Phase 4 analysis. If the standard introduces a durable architectural decision (e.g., "all new surfaces must declare classification"), that warrants a new ADR. If it merely documents existing practice, an ADR amendment or no ADR may suffice.

## 8) Open Questions

- Should the Edge Transport Policy (`docs/20-architecture/EDGE_TRANSPORT_POLICY.md`) be cross-referenced in the data aggregation axis? **Provisional yes** — the BFF patterns are transport-layer decisions.
- Should the Provenance Matrix include a "Known Risks" column for the initial 4 rows? **Provisional no** — defer to the full 22-column expansion in Slices 2-3 unless a specific risk surfaces during Slice 1 build.
- ~~Where should the Provenance Matrix live?~~ **Resolved:** `docs/70-governance/`. See §7 Decisions Required.

## Links

- Feature Scaffold: `docs/01-scaffolds/SCAFFOLD-001-hardening-slice-0-standards-foundation.md`
- Feature Boundary: `docs/20-architecture/specs/hardening-slice-0-standards-foundation/FEATURE_BOUNDARY.md`
- ADR(s): (Phase 4)
- PRD: (Phase 5)

## References

- STANDARDS-FOUNDATION.md: `docs/00-vision/PT-ARCH-MAP/STANDARDS-FOUNDATION.md`
- Cross-Surface Provenance Governance: `docs/00-vision/strategic-hardening/pt-cross-surface-metric-provenance-governance-plan.md`
- ADR-039 Precis: `docs/00-vision/strategic-hardening/ADR-039 Measurement Layer — Overview Précis.md`
- SRM §Measurement Layer: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (line ~837)
- Over-Engineering Guardrail: `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`
- Edge Transport Policy: `docs/20-architecture/EDGE_TRANSPORT_POLICY.md`
- Reference implementations:
  - RSC Prefetch: `app/(protected)/shift-dashboard/page.tsx`
  - BFF RPC: `services/rating-slip-modal/rpc.ts`, migration `20251226123939_prd018_modal_bff_rpc.sql`
  - BFF Summary: `app/api/v1/shift-dashboards/summary/route.ts`
  - Client-led: `components/admin/threshold-settings-form.tsx`
