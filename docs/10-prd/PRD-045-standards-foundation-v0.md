---
id: PRD-045
title: "Hardening Slice 0 — Standards Foundation"
owner: Platform / Governance
status: Proposed
affects: [ADR-041, ADR-039, SRM]
created: 2026-03-07
last_review: 2026-03-07
phase: "Hardening Area 1 — Surface Policy"
source: "docs/00-vision/PT-ARCH-MAP/STANDARDS-FOUNDATION.md"
pattern: GOVERNANCE
http_boundary: false
---

# PRD-045 — Hardening Slice 0: Standards Foundation

## 1. Overview

- **Owner:** Platform / Governance
- **Status:** Proposed
- **Summary:** Produce two governance artifacts — a Surface Classification Standard and an ADR-039 Metric Provenance Matrix — that constrain how future surfaces are built and what truth semantics they declare. Zero code, zero migrations. Deliverables are Markdown documents in `docs/70-governance/` that serve as hard rejection gates for non-compliant EXEC-SPECs. This is the prerequisite for Slice 1 (ADR-039 Measurement UI).

---

## 2. Problem & Goals

### 2.1 Problem

PT-2 already has proven rendering and aggregation patterns in production surfaces, but lacks a standard governing how those choices are declared, selected, and justified. ADR-039 shipped measurement database infrastructure (4 artifacts) with zero frontend consumers. Before Slice 1 builds UI against these artifacts:

1. **No standard governs pattern selection.** Engineers choose rendering delivery and data aggregation patterns based on familiarity, not measurable selection criteria.
2. **No provenance framework constrains truth semantics.** Metrics can be displayed without declaring their truth class, freshness, computation layer, or reconciliation path.
3. **No rejection mechanism exists.** Non-compliant EXEC-SPECs cannot be formally rejected — only informally challenged.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Surface Classification Standard exists and is enforceable | Standard contains a decision matrix with measurable selection criteria. At least one pass and one fail compliance example are documented. |
| **G2**: Provenance Matrix exists with 4 ADR-039 rows | Matrix contains 12 columns × 4 rows. Each row declares truth class, formula, source tables, computation layer, freshness, invalidation trigger, reconciliation path, and owner. |
| **G3**: Hard rejection gate is operational | The standard specifies 4 mandatory EXEC-SPEC declaration fields. A mock non-compliant EXEC-SPEC can be rejected by citing a specific clause. |
| **G4**: Slice 1 can cite both artifacts as constraints | Slice 1 EXEC-SPEC references Surface Classification Standard for rendering/aggregation choice and Provenance Matrix for metric truth semantics. |
| **G5**: Governance index is updated | Both artifacts live in `docs/70-governance/` (canonical home) and are cross-referenced from SRM §Measurement Layer. `docs/INDEX.md` updated only if it already exists and is maintained. |

### 2.3 Non-Goals

- Any database migration, RPC, service layer, API route, or UI component
- Provenance declarations beyond ADR-039's 4 measurement artifacts
- Retroactive governance of existing surfaces (Slices 2-3)
- Runtime enforcement tooling or automated linting
- New architectural patterns not already proven in the codebase
- Materialized view or snapshot pipeline design

---

## 3. Users & Use Cases

- **Primary users:** Engineers writing EXEC-SPECs, architects reviewing surface proposals

**Top Jobs:**

- As an **engineer**, I need clear selection criteria so I choose the right rendering and aggregation pattern for a new surface without guessing.
- As an **architect**, I need a formal rejection mechanism so I can return non-compliant EXEC-SPECs with a specific clause citation rather than an opinion.
- As a **Slice 1 implementer**, I need provenance declarations for the 4 ADR-039 metrics so I know the truth class, freshness, and reconciliation path before writing code.

---

## 4. Scope & Feature List

### 4.1 In Scope

**Deliverable 1: Surface Classification Standard** (`docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md`)

| Section | Content |
|---------|---------|
| Purpose & scope | What the standard governs, what it doesn't |
| Two-axis classification | Rendering Delivery (RSC Prefetch, Client Shell, Hybrid) × Data Aggregation (BFF RPC, BFF Summary, Simple Query, Client Fetch) |
| Pattern catalogue | 4 proven patterns with reference implementation file paths, security mode annotation (INVOKER vs DEFINER), and when-to-use criteria |
| Selection decision matrix | Measurable criteria: bounded context count, call frequency, initial paint sensitivity, multi-level rollup, interaction density |
| Declaration requirement | 4 mandatory fields per EXEC-SPEC: rendering pattern, aggregation pattern, rejected patterns with rationale, metric provenance per surfaced metric |
| No-fit escalation | If no proven pattern fits, EXEC-SPEC stops and raises ADR/standards amendment |
| Hybrid clarification | Hybrid = declared composition of proven patterns, not a junk-drawer category |
| Compliance examples | At least 1 pass, 1 fail with specific rejection rationale |
| Edge Transport cross-ref | Link to `docs/20-architecture/EDGE_TRANSPORT_POLICY.md` for aggregation decisions |

**Deliverable 2: ADR-039 Metric Provenance Matrix** (`docs/70-governance/METRIC_PROVENANCE_MATRIX.md`)

| Section | Content |
|---------|---------|
| Purpose & scope | ADR-039 only — 4 rows. Expansion protocol for Slices 2-3. |
| Column definitions | 12 pragmatic columns per ADR-041 D3 |
| Matrix table | 4 rows: MEAS-001 (Theo Discrepancy), MEAS-002 (Audit Event Correlation), MEAS-003 (Rating Coverage), MEAS-004 (Loyalty Liability) |
| Compliance-class note | If Slice 1 reveals MEAS-002 needs interpretation-basis, late-data, or consumer-tolerance semantics, matrix must be amended before implementation proceeds |
| Expansion protocol | How to add rows (Slices 2-3) and columns (governed amendment triggered by implementation experience) |
| SRM cross-reference | Source tables validated against SRM §Measurement Layer |

**Deliverable 3: Cross-references**

| Location | Update |
|----------|--------|
| SRM §Measurement Layer | Add cross-reference to Provenance Matrix |
| `docs/INDEX.md` | Update only if already maintained; `docs/70-governance/` is the canonical home |
| ADR-041 | Already references both artifacts (created in Phase 4) |

### 4.2 Out of Scope

Per §2.3 Non-Goals. Explicitly: no code in any form. If a workstream produces code, it has exceeded scope.

---

## 5. Acceptance Criteria

### AC-1: Surface Classification Standard enforceability

- [ ] Decision matrix exists with measurable selection criteria for both axes
- [ ] Each proven pattern entry includes: name, when-to-use criteria, reference implementation path, security mode (INVOKER/DEFINER where applicable)
- [ ] Declaration requirement specifies 4 mandatory EXEC-SPEC fields
- [ ] At least 1 pass and 1 fail compliance example with specific clause citations
- [ ] No-fit escalation clause present: "stop and raise ADR/standards amendment"
- [ ] Hybrid defined as declared composition, not catch-all

### AC-2: Metric Provenance Matrix completeness

- [ ] 12 columns defined per ADR-041 D3
- [ ] 4 rows populated: MEAS-001, MEAS-002, MEAS-003, MEAS-004
- [ ] Each row: truth class declared, formula/rule specified, source tables reference SRM-registered objects, computation layer stated, freshness category assigned, invalidation trigger identified, reconciliation path defined, owner assigned
- [ ] Rows are authoritative on categories and constraints, not pre-committing implementation shapes (service signatures, API contracts)
- [ ] Compliance-class expansion note present for MEAS-002
- [ ] Expansion protocol documented (how to add rows, how to add columns)

### AC-3: Cross-references

- [ ] Both artifacts committed to `docs/70-governance/` (canonical home)
- [ ] SRM §Measurement Layer references the Provenance Matrix
- [ ] ADR-041 already cross-references both (verified)
- [ ] `docs/INDEX.md` updated only if it already exists and is actively maintained

### AC-4: Slice 1 readiness

- [ ] A mock Slice 1 Surface Classification declaration exists as a concrete artifact (appendix or companion file), applying the standard to the ADR-039 measurement UI surface
- [ ] The mock declaration includes all 4 mandatory fields (rendering, aggregation, rejected patterns, metric provenance)
- [ ] The 4 provenance rows provide enough constraint for Slice 1 to make rendering, freshness, and reconciliation decisions

---

## 6. Workstreams

| WS | Deliverable | Dependency | Estimated Effort |
|----|-------------|------------|------------------|
| WS1 | Surface Classification Standard | None | ~3h authoring |
| WS2 | ADR-039 Metric Provenance Matrix | None (parallel with WS1) | ~2h authoring |
| WS3 | Cross-references (SRM, index) | WS1 + WS2 complete | ~30min |
| WS4 | Slice 1 readiness validation | WS1 + WS2 + WS3 complete | ~30min |

WS1 and WS2 are independent and can be authored in parallel. WS3 and WS4 are sequential gates.

**WS4 concrete artifact:** WS4 must produce a mock Slice 1 Surface Classification declaration as an appendix to the Surface Classification Standard (or a companion file under the hardening slice spec folder). This declaration applies the standard to the ADR-039 measurement UI surface — proving the standard can classify a real surface, not merely describe itself. Without this artifact, "validated" is interpretive instead of reviewable.

---

## 7. Provenance Row Drafts (from RFC-001)

The RFC contains draft provenance row content for all 4 metrics. These drafts are **governance placeholders** — authoritative on truth class, business meaning, freshness, and reconciliation, but not pre-committing Slice 1 to specific service shapes or API contracts. Where draft rows reference existing ADR-039 artifacts by name (views, tables, columns), those references are descriptive of already-ratified measurement objects and do not constitute new implementation commitments introduced by this PRD. The PRD implementation finalizes these rows into the matrix.

| Truth ID | Truth Class | Metric | Freshness | Key constraint |
|---|---|---|---|---|
| MEAS-001 | Derived Operational | Theo Discrepancy | Request-time | Source: `rating_slip` columns (ratified ADR-039 D3) |
| MEAS-002 | Compliance-Interpreted | Audit Event Correlation | Request-time | Source: `measurement_audit_event_correlation_v` (SECURITY INVOKER — caller's RLS) |
| MEAS-003 | Derived Operational | Rating Coverage | Request-time | Source: `measurement_rating_coverage_v` (SECURITY INVOKER — caller's RLS) |
| MEAS-004 | Snapshot-Historical | Loyalty Liability | Periodic (daily) | Source: `loyalty_liability_snapshot` + `loyalty_valuation_policy` (ratified ADR-039 D5) |

---

## 8. Definition of Done

- [ ] All AC-1 through AC-4 acceptance criteria pass
- [ ] Both artifacts committed to `docs/70-governance/`
- [ ] ADR-041 cross-references verified
- [ ] SRM cross-reference added
- [ ] Zero code produced (if any code exists in the PR, the slice has failed)
- [ ] Hardening Slice Manifest updated (Slice 0 status → Complete, artifacts listed)

---

## 9. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Standard is too abstract to enforce | Medium | High (defeats purpose) | AC-1 requires pass/fail compliance examples; AC-4 requires a draft Slice 1 declaration proving actionability |
| Provenance rows over-specify implementation | Low | Medium (constrains Slice 1 unnecessarily) | Rows declare categories/constraints only; "implementation chooses layer" language in computation column |
| MEAS-002 compliance semantics need more columns than 12 | Medium | Low (governed expansion) | ADR-041 D3 amendment trigger: if Slice 1 needs interpretation-basis/late-data, matrix is amended before implementation proceeds |
| Decision matrix binary rendering axis is too coarse | Low | Low (no-fit escalation catches edge cases) | Hybrid is a declared composition; future ADR amendment can add gradations if Slices 2-3 reveal need |

---

## 10. References

| Document | Path |
|----------|------|
| Feature Boundary | `docs/20-architecture/specs/hardening-slice-0-standards-foundation/FEATURE_BOUNDARY.md` |
| Scaffold | `docs/01-scaffolds/SCAFFOLD-001-hardening-slice-0-standards-foundation.md` |
| RFC-001 | `docs/02-design/RFC-001-standards-foundation.md` |
| SEC Note | `docs/20-architecture/specs/hardening-slice-0-standards-foundation/SEC_NOTE.md` |
| ADR-041 | `docs/80-adrs/ADR-041-surface-governance-standard.md` |
| STANDARDS-FOUNDATION | `docs/00-vision/PT-ARCH-MAP/STANDARDS-FOUNDATION.md` |
| Cross-Surface Provenance Plan | `docs/00-vision/strategic-hardening/pt-cross-surface-metric-provenance-governance-plan.md` |
| ADR-039 Precis | `docs/00-vision/strategic-hardening/ADR-039 Measurement Layer — Overview Précis.md` |
| Over-Engineering Guardrail | `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` |
| Hardening Slice Manifest | `docs/00-vision/PT-ARCH-MAP/HARDENING-SLICE-MANIFEST.md` |
