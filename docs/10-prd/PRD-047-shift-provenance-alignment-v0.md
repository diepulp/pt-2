---
id: PRD-047
title: "Hardening Slice 2 — Shift Dashboard Provenance Alignment"
owner: Platform / Governance
status: Proposed
affects: [METRIC_PROVENANCE_MATRIX.md, SURFACE_CLASSIFICATION_STANDARD.md, SRM]
created: 2026-03-09
last_review: 2026-03-09
phase: "Hardening Area 1 — Surface Policy"
source: "docs/00-vision/PT-ARCH-MAP/STANDARDS-FOUNDATION.md (Slice 2)"
pattern: GOVERNANCE
http_boundary: false
---

# PRD-047 — Hardening Slice 2: Shift Dashboard Provenance Alignment

## 1. Overview

- **Owner:** Platform / Governance
- **Status:** Proposed
- **Summary:** Retroactive governance certification of the Shift Dashboard V3. Audit every truth-bearing metric, populate provenance matrix rows (MEAS-005+), produce a Surface Classification Declaration, and verify single-derivation-path compliance. Zero code changes — governance artifacts only. Proves the Slice 0/1 framework scales from 4 curated ADR-039 metrics to a real operational dashboard with 7+ metrics and pre-existing provenance primitives.

---

## 2. Problem & Goals

### 2.1 Problem

The governance framework (Surface Classification Standard + Metric Provenance Matrix) was piloted in Slices 0-1 on a small greenfield surface designed alongside the standards. That pilot exercised 4 curated measurement rows on a surface that was born into the framework. The framework's credibility requires proof that it works retroactively on a mature operational surface:

1. **Shift Dashboard metrics lack formal provenance.** The shift dashboard displays 7+ truth-bearing metrics (win/loss, estimated drop, fills, credits, coverage, alerts, visitors) with no formal truth class, freshness, or reconciliation declarations in the Metric Provenance Matrix.
2. **Existing provenance primitives are ungoverned.** `provenance.ts`, trust badges, and coverage bars exist in code but are not referenced by the governance framework. The shift dashboard has 5 domain-specific governance docs (`SHIFT_METRICS_CONTRACT_v1.md`, etc.) that overlap with but do not substitute for provenance matrix declarations.
3. **Framework scaling is unproven.** 4 rows on a friendly test case does not demonstrate that the 12-column matrix, the §5 declaration format, or the expansion protocol work at operational scale.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Complete shift metric inventory | Every truth-bearing value rendered by the shift dashboard is cataloged with its component source, hook, API route, service function, and database source. |
| **G2**: Provenance matrix expanded | MEAS-005+ rows populated in `METRIC_PROVENANCE_MATRIX.md` with all 12 columns per metric (or metric family where provenance is identical). |
| **G3**: Surface Classification Declaration | Shift Dashboard Declaration created in `docs/70-governance/examples/` passing all 4 mandatory fields from §5 of the Surface Classification Standard. |
| **G4**: Consistency audit passes | Zero unresolved duplicated derivation paths. Each business fact has exactly one authoritative derivation path. Any exceptions are explicitly documented with justification. |
| **G5**: SRM cross-references updated | SRM §Measurement Layer Governance Cross-References subsection links to shift provenance rows. |
| **G6**: Reusable audit template | The audit methodology is documented clearly enough for Slice 3 (Pit Dashboard) to follow without reinvention. |
| **G7**: Slice manifest updated | `HARDENING-SLICE-MANIFEST.md` Slice 2 section reflects all produced artifacts. |

### 2.3 Non-Goals

- Code changes to shift dashboard components, services, hooks, or API routes
- New database migrations, tables, views, or RPCs
- Provenance declarations for Pit Dashboard metrics (Slice 3)
- New trust UI components or modifications to existing ones
- Runtime delivery changes (caching, timeouts, freshness enforcement)
- New governance columns beyond the existing 12-column schema
- Materialized views or snapshot pipeline proposals

---

## 3. Users & Use Cases

- **Primary users:** Engineers writing future surface EXEC-SPECs; architects reviewing dashboard proposals

**Top Jobs:**

| Job | Actor |
|-----|-------|
| Verify shift dashboard metric has declared provenance | Architect reviewing surface |
| Determine correct freshness/reconciliation for a shift metric | Engineer building adjacent surface |
| Determine whether a rendered metric is authoritative, estimated, or telemetry-derived | Architect / engineer reviewing surface semantics |
| Replicate audit methodology for Pit Dashboard | Architect executing Slice 3 |

---

## 4. Scope & Constraints

### 4.1 In Scope

| Workstream | Deliverable |
|-----------|-------------|
| WS1: Metric Inventory | Component-by-component catalog of every truth-bearing value on the shift dashboard |
| WS2: Provenance Matrix Expansion | MEAS-005+ rows in `METRIC_PROVENANCE_MATRIX.md` using hybrid granularity (individual rows where provenance differs, grouped where identical) |
| WS3: Surface Classification Declaration | `docs/70-governance/examples/SLICE-2-SHIFT-DASHBOARD-DECLARATION.md` |
| WS4: Consistency Audit | Verify single-derivation-path compliance per auditable duplication definition |
| WS5: SRM Cross-References | Update SRM §Measurement Layer Governance Cross-References |
| WS6: Manifest Update | Update `HARDENING-SLICE-MANIFEST.md` Slice 2 section |

### 4.2 Hard Constraints

- **Zero code changes.** No table mutations, no new RPCs, no component changes, no migrations.
- **12-column schema.** New rows use existing columns per ADR-041 D3. Column expansion only through governed amendment if a concrete metric requires it.
- **§5 compliance.** Declaration must include all 4 mandatory fields (Rendering Delivery, Data Aggregation, Rejected Patterns, Metric Provenance).
- **SRM alignment.** All source tables traced to SRM-registered ownership (TableContextService, RatingSlipService, VisitService, etc.).

### 4.3 Truth ID Prefix

Slice 2 uses the existing `MEAS-XXX` prefix per the expansion protocol (§5.1). Whether future slices warrant a surface-scoped prefix (e.g., `SHIFT-XXX`) is a non-blocking governance note, not a Slice 2 gate.

---

## 5. Workstream Details

### WS1: Metric Inventory

**Input:** Shift dashboard component tree (`components/shift-dashboard-v3/`), hooks (`hooks/shift-dashboard/`), API routes (`app/api/v1/shift-dashboards/`), service layer (`services/table-context/shift-metrics/`)

**Method:** Trace each truth-bearing value from UI component → React Query hook → HTTP fetcher → API route → service function → RPC/query → database table.

**Component groups to audit:**

| Group | Components | Expected Truth-Bearing Values |
|-------|-----------|------------------------------|
| Left Rail | hero-win-loss-compact, secondary-kpi-stack, quality-summary-card | Win/loss (2 variants), drop (3 variants), fills, credits, coverage counts |
| Trust Layer | coverage-bar, metric-grade-badge, telemetry-quality-indicator | Coverage ratio, metric grade, quality tier |
| Center Panel | metrics-table, pit-table, alerts-strip | Per-pit/table breakdown, spike alerts |
| Charts | floor-activity-radar, win-loss-trend-chart | Rated/unrated counts, pit-level trend |
| Right Rail | telemetry-rail-panel, quality-detail-card | Cash observation rollups |
| Header | (layout area) | Active visitors summary |

**Output:** Catalog document listing each value, its derivation chain, and preliminary truth class assignment.

### WS2: Provenance Matrix Expansion

**Input:** WS1 catalog + existing provenance primitives (`provenance.ts`, `snapshot-rules.ts`)

**Method:** Apply hybrid granularity rule from RFC-002:
- **Separate row** when source, freshness, reconciliation, or derivation path differs
- **Grouped row** only when provenance is identical and values differ by presentation

**Preliminary row plan** (provisional — the proposed MEAS-005 through MEAS-011 allocation is preliminary; WS1/WS2 may consolidate, split, or remove rows if trace validation shows identical provenance, different derivation semantics, or out-of-scope values):

| Proposed ID | Metric | Truth Class | Key Differentiator |
|-------------|--------|-------------|-------------------|
| MEAS-005 | Shift Win/Loss (Inventory) | Derived Operational | Source: snapshot pair deltas + fills + credits |
| MEAS-006 | Shift Win/Loss (Estimated) | Derived Operational | Source: telemetry-based drop; different grade semantics |
| MEAS-007 | Shift Estimated Drop | Derived Operational | Source: pit_cash_observation aggregation |
| MEAS-008 | Shift Fills & Credits | Raw Record (aggregated) | Direct sum from table_fill, table_credit |
| MEAS-009 | Snapshot Coverage & Metric Grade | Derived Operational | Derived via provenance.ts worst-of rollup |
| MEAS-010 | Cash Observation Alerts | Derived Operational | Spike detection with severity guardrails |
| MEAS-011 | Active Visitors Summary | Derived Operational | Cross-context read from VisitService (tentatively included — WS1 must confirm whether this is a governed dashboard fact or merely contextual chrome; if the latter, excluded from final row count without blocking Slice 2 completion) |

**Output:** Amended `METRIC_PROVENANCE_MATRIX.md` with all 12 columns populated per row.

### WS3: Surface Classification Declaration

**Input:** Existing shift dashboard architecture (RSC prefetch page, BFF summary endpoint, 3 prefetched queries)

**Output:** `docs/70-governance/examples/SLICE-2-SHIFT-DASHBOARD-DECLARATION.md` with:
- Rendering Delivery: RSC Prefetch + Hydration (3 prefetched queries above fold)
- Data Aggregation: BFF Summary Endpoint (casino → pits → tables rollup)
- Rejected Patterns: Client Shell, BFF RPC, Simple Query, Client-side Fetch (with rationale)
- Metric Provenance: All MEAS-005+ rows with truth class + freshness

### WS4: Consistency Audit

**Input:** WS1 catalog + WS2 provenance rows + existing shift governance docs

**Duplicated derivation path definition:** Two or more shift dashboard truth-bearing metrics representing the same business fact are considered duplicated if they are computed through materially different source inputs, transformation logic, freshness windows, or reconciliation rules without an explicit declared distinction.

**Audit checklist:**
1. Single derivation path per business fact (per auditable definition above)
2. Rollup consistency (pit/casino aggregations use same rules as table-level)
3. Freshness alignment (all metrics share BFF summary endpoint's 30s staleTime)
4. Trust primitive alignment (`ProvenanceMetadata` type ↔ matrix truth class/reconciliation)
5. No ungoverned UI derivation (components display, not recompute)
6. Existing doc reconciliation (5 shift docs in `docs/25-api-data/` complement, not conflict with, matrix rows)

**Output:** Audit findings document with pass/fail per check, plus any recommendations for follow-on work.

### WS5: SRM Cross-References

**Input:** WS2 completed rows

**Output:** SRM §Measurement Layer Governance Cross-References table updated to reference shift provenance. If shift metrics warrant a separate SRM subsection (e.g., §TableContextService Governance Cross-References), that is an acceptable alternative.

### WS6: Manifest Update

**Output:** `HARDENING-SLICE-MANIFEST.md` Slice 2 section populated with status, artifacts, and any amendments to prior slices.

---

## 6. Definition of Done

### Functional
- [ ] **DOD-F1:** Shift dashboard metric inventory complete — every truth-bearing value cataloged with full derivation chain
- [ ] **DOD-F2:** MEAS-005+ rows populated in `METRIC_PROVENANCE_MATRIX.md` with all 12 columns
- [ ] **DOD-F3:** Surface Classification Declaration at `docs/70-governance/examples/SLICE-2-SHIFT-DASHBOARD-DECLARATION.md` passes §5 mandatory 4-field checklist
- [ ] **DOD-F4:** Consistency audit documents zero unresolved duplicated derivation paths
- [ ] **DOD-F5:** Preliminary MEAS-005+ allocation validated against the completed audit; any follow-on naming concerns recorded as non-blocking governance notes

### Governance
- [ ] **DOD-G1:** SRM Governance Cross-References updated to link shift provenance
- [ ] **DOD-G2:** HARDENING-SLICE-MANIFEST.md Slice 2 section reflects all artifacts
- [ ] **DOD-G3:** Output yields a documented, reusable governance audit template for Slice 3

### Integrity
- [ ] **DOD-I1:** All source tables in provenance rows validated against SRM-registered ownership
- [ ] **DOD-I2:** Existing shift governance docs (`docs/25-api-data/SHIFT_*.md`) reconciled — no contradictions with matrix rows
- [ ] **DOD-I3:** Existing `ProvenanceMetadata` type and derivation functions align with matrix truth class and reconciliation semantics

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Matrix row explosion (12+ rows for shift alone) | Medium | Low | Hybrid granularity rule: group where provenance is identical |
| Existing shift docs contradict matrix declarations | Low | Medium | WS4 audit reconciles; contradictions resolved before merge |
| Framework scaling failure (12 columns insufficient) | Low | High | Governed column expansion per ADR-041 D3 if concrete metric requires it |
| Audit finds duplicated derivation paths requiring code fixes | Medium | Medium | Findings become follow-on PRD/issue, not Slice 2 scope creep |
| MEAS prefix semantically misleading for non-measurement metrics | Medium | Low | WS2 resolves prefix decision; amendment to §5.1 if needed |

---

## 8. Dependencies

| Dependency | Status | Impact if Missing |
|-----------|--------|-------------------|
| ADR-041 (Surface Governance Standard) | Accepted | Cannot produce compliant declarations |
| METRIC_PROVENANCE_MATRIX.md (Slice 0) | Complete | No matrix to expand |
| SURFACE_CLASSIFICATION_STANDARD.md (Slice 0) | Complete | No standard to declare against |
| SLICE-1-MEASUREMENT-UI-DECLARATION.md (Slice 1) | Complete | No template for declaration format |
| Shift Dashboard V3 codebase | Complete (production) | Nothing to audit |

All documented prerequisites exist and no hard blockers are known. The main execution risk is reconciliation across existing shift governance documents and current dashboard derivation paths.

---

## 9. References

| Document | Path |
|----------|------|
| Feature Boundary | `docs/20-architecture/specs/hardening-slice-2-shift-provenance/FEATURE_BOUNDARY.md` |
| Feature Scaffold | `docs/01-scaffolds/SCAFFOLD-001-shift-provenance-alignment.md` |
| Design Brief / RFC | `docs/02-design/RFC-002-shift-provenance-alignment.md` |
| SEC Note | `docs/30-security/SEC-NOTE-hardening-slice-2-shift-provenance.md` |
| ADR-041 | `docs/80-adrs/ADR-041-surface-governance-standard.md` |
| Standards Foundation | `docs/00-vision/PT-ARCH-MAP/STANDARDS-FOUNDATION.md` |
| Slice Manifest | `docs/00-vision/PT-ARCH-MAP/HARDENING-SLICE-MANIFEST.md` |
| Metric Provenance Matrix | `docs/70-governance/METRIC_PROVENANCE_MATRIX.md` |
| Surface Classification Standard | `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md` |
| Shift Metrics Contract | `docs/25-api-data/SHIFT_METRICS_CONTRACT_v1.md` |
| Shift Provenance Rollup Algo | `docs/25-api-data/SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md` |
| Cross-Surface Provenance Plan | `docs/00-vision/strategic-hardening/pt-cross-surface-metric-provenance-governance-plan.md` |
| SRM v4.18.0 | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` |
