# Governance Audit Template — Surface Provenance Certification

**Version:** 1.0.0
**Date:** 2026-03-09
**Source:** Slice 2 audit methodology (PRD-047 / EXEC-047)
**Purpose:** Reusable template for retroactive governance certification of PT-2 surfaces

> This template captures the audit methodology used in Slice 2 (Shift Dashboard V3) so that Slice 3 (Pit Dashboard) and future slices can follow the same process without reinvention.

---

## Overview

A surface provenance certification produces 5 governance artifacts:

| # | Artifact | Template |
|---|----------|----------|
| 1 | **Metric Inventory** | `docs/70-governance/audits/SLICE-{N}-{SURFACE}-METRIC-INVENTORY.md` |
| 2 | **Provenance Matrix Expansion** | Amend `docs/70-governance/METRIC_PROVENANCE_MATRIX.md` |
| 3 | **Surface Classification Declaration** | `docs/70-governance/examples/SLICE-{N}-{SURFACE}-DECLARATION.md` |
| 4 | **Consistency Audit** | `docs/70-governance/audits/SLICE-{N}-CONSISTENCY-AUDIT.md` |
| 5 | **SRM Cross-References** | Amend `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` §Governance Cross-References |

Artifacts are produced in order — each depends on the previous.

---

## Phase 1: Metric Inventory

### Input
- Component tree for the target surface
- Hooks directory for the target surface
- API routes serving the surface
- Service layer functions called by routes
- Database migrations defining RPCs

### Method

Trace every truth-bearing value from **UI Component → React Query Hook → HTTP Fetcher → API Route → Service Function → RPC → Database Table(s)**.

For each value, record:

| Field | Description |
|-------|------------|
| Value Name | Human-readable name of the displayed value |
| Component | File path + component name rendering the value |
| Props Consumed | Exact prop or DTO field accessed |
| Hook | React Query hook providing the data |
| HTTP Fetcher | Fetch function and HTTP route |
| API Route | Next.js route handler file |
| Service Function | Service layer function called by route |
| RPC | Database RPC name + security mode |
| Database Tables | Source tables accessed by the RPC |
| Formula | Computation logic (SQL expression or service-side logic) |
| Preliminary Truth Class | Raw Record, Derived Operational, Compliance-Interpreted, or Snapshot-Historical |
| Freshness | React Query staleTime / refetchInterval |
| Preliminary MEAS-ID | Proposed truth ID |

### Hybrid Granularity Rule

Apply the RFC-002 hybrid rule to determine row count:
- **Separate row** when source, freshness, reconciliation, or derivation path differs
- **Grouped row** only when provenance is identical and values differ by presentation

Document all split/group decisions with rationale.

### Output
- Inventory document with one section per MEAS row
- Summary table with MEAS-ID, metric name, truth class, source tables, owner
- Source table verification against SRM-registered ownership

---

## Phase 2: Provenance Matrix Expansion

### Input
- Phase 1 inventory (complete)
- Existing `METRIC_PROVENANCE_MATRIX.md`

### Method

For each MEAS row from the inventory, populate all 12 columns per §2 of the matrix:

| # | Column | How to populate |
|---|--------|----------------|
| 1 | Truth ID | Next available MEAS-XXX from §5.1 |
| 2 | Truth Class | From inventory preliminary classification |
| 3 | Metric Name | Human-readable from inventory |
| 4 | Business Meaning | What decision this value supports — write from operator perspective |
| 5 | Surface(s) | Which UI surfaces consume this metric |
| 6 | Formula / Rule | From inventory Formula field — include SQL expressions and aggregation logic |
| 7 | Source Tables | From inventory Database Tables field — SRM-registered only |
| 8 | Computation Layer | RPC name + security mode + any service-side processing |
| 9 | Freshness Category | Map React Query config to freshness category (e.g., staleTime:30s → Cached) |
| 10 | Invalidation Trigger | What state change requires refresh — derive from source table write operations |
| 11 | Reconciliation Path | How to verify the value against source truth — derive from formula |
| 12 | Owner | SRM-registered service owning the source tables |

### Checklist
- [ ] All 12 columns populated per row
- [ ] Source tables validated against SRM
- [ ] Summary View table updated
- [ ] SRM Cross-Reference table updated with new source tables
- [ ] Expansion protocol §5.1 updated (next available MEAS-ID)
- [ ] Version bumped
- [ ] Existing MEAS rows NOT modified

### Output
- Amended `METRIC_PROVENANCE_MATRIX.md` with new rows

---

## Phase 3: Surface Classification Declaration

### Input
- Phase 2 matrix rows (complete)
- Surface Classification Standard §5 mandatory fields
- Slice 1 or Slice 2 declaration as format template

### Method

Produce a declaration with the 4 mandatory fields from §5 of the Surface Classification Standard:

1. **Rendering Delivery** — select from proven pattern palette (RSC Prefetch, Client Shell, Hybrid) with rationale and §4 Q1 criteria
2. **Data Aggregation** — select from proven pattern palette (BFF RPC, BFF Summary, Simple Query, Client-side Fetch) with rationale and §4 Q2 criteria
3. **Rejected Patterns** — document why each non-selected pattern was rejected with specific clause citations
4. **Metric Provenance** — table of all MEAS rows with truth class, freshness, rendering implication, and reconciliation summary

### Validation Assessment

Verify:
- [ ] Both axes answered with measurable criteria
- [ ] Rejected patterns documented with clause citations
- [ ] All MEAS rows cited with truth class + freshness
- [ ] Provenance constraints are actionable (freshness drives caching/refresh decisions)
- [ ] No-fit clause not triggered (or escalation documented)

### Output
- Declaration document at `docs/70-governance/examples/SLICE-{N}-{SURFACE}-DECLARATION.md`

---

## Phase 4: Consistency Audit

### Input
- Phase 1 inventory + Phase 2 matrix rows
- Existing surface governance docs (if any)

### Method

Run 6 checks:

| # | Check | How to verify |
|---|-------|--------------|
| 1 | **Single derivation path** | For each MEAS row, confirm no other MEAS row computes the same business fact through a materially different path. Shared RPCs with declared distinctions (different columns, different null semantics) are acceptable. |
| 2 | **Rollup consistency** | For each multi-level metric (table → pit → casino), verify the aggregation function is identical at each level. Watch for worst-of vs. SUM vs. AVG inconsistencies. |
| 3 | **Freshness alignment** | Collect all React Query hooks for the surface. Verify staleTime and refetchInterval are consistent across metric families (or document intentional differences). |
| 4 | **Trust primitive alignment** | Map the codebase's trust/provenance types (e.g., `ProvenanceMetadata`) to matrix truth class and reconciliation columns. Verify 1:1 alignment. |
| 5 | **No ungoverned UI derivation** | Verify each component passes trust data through without recomputation. Display-only counting (e.g., `array.filter().length`) is acceptable. Recomputing grades, scores, or classifications is not. |
| 6 | **Existing doc reconciliation** | Cross-reference any existing domain governance docs against matrix rows. Verify they complement (different governance level) rather than conflict (contradictory declarations). |

**Duplicated derivation path definition:** Two or more truth-bearing metrics representing the same business fact are considered duplicated if they are computed through materially different source inputs, transformation logic, freshness windows, or reconciliation rules without an explicit declared distinction.

### Output
- Audit report with pass/fail per check
- Findings summary (0 duplicated derivation paths = pass)
- Non-blocking governance notes for follow-on work

---

## Phase 5: SRM Cross-References + Manifest

### Input
- All Phase 1-4 artifacts complete

### Method

1. Update SRM §Measurement Layer Governance Cross-References:
   - Update matrix reference to include new MEAS range
   - Add entries for declaration, inventory, and audit artifacts
   - Update summary text

2. Update `HARDENING-SLICE-MANIFEST.md`:
   - Set slice status to Complete
   - List all produced artifacts with descriptions
   - Document amendments to prior slices
   - Record key findings and corrections

### Output
- Amended SRM §Governance Cross-References
- Amended HARDENING-SLICE-MANIFEST.md

---

## Definition of Done Checklist

### Functional
- [ ] Metric inventory complete — every truth-bearing value cataloged with full derivation chain
- [ ] MEAS rows populated in Metric Provenance Matrix with all 12 columns
- [ ] Surface Classification Declaration passes §5 mandatory 4-field checklist
- [ ] Consistency audit documents zero unresolved duplicated derivation paths

### Governance
- [ ] SRM Governance Cross-References updated
- [ ] HARDENING-SLICE-MANIFEST.md updated
- [ ] Preliminary MEAS allocation validated against completed audit

### Integrity
- [ ] All source tables in provenance rows validated against SRM-registered ownership
- [ ] Existing surface governance docs reconciled — no contradictions with matrix rows
- [ ] Existing trust/provenance types align with matrix truth class and reconciliation semantics

---

## References

| Document | Path |
|----------|------|
| Metric Provenance Matrix | `docs/70-governance/METRIC_PROVENANCE_MATRIX.md` |
| Surface Classification Standard | `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md` |
| SRM | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` |
| Slice Manifest | `docs/00-vision/PT-ARCH-MAP/HARDENING-SLICE-MANIFEST.md` |
| Slice 2 Inventory (exemplar) | `docs/70-governance/audits/SLICE-2-SHIFT-METRIC-INVENTORY.md` |
| Slice 2 Audit (exemplar) | `docs/70-governance/audits/SLICE-2-CONSISTENCY-AUDIT.md` |
| Slice 2 Declaration (exemplar) | `docs/70-governance/examples/SLICE-2-SHIFT-DASHBOARD-DECLARATION.md` |
