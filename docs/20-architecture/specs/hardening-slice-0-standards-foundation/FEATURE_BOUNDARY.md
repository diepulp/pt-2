# Feature Boundary Statement: Hardening Slice 0 — Standards Foundation

> **Ownership Sentence:** This feature belongs to the **Measurement Layer** (cross-cutting read models, SRM §Measurement Layer) and **Platform/Governance** (docs/70-governance). It writes **zero database tables** — deliverables are governance artifacts only. Cross-context reads reference all 4 ADR-039 measurement artifacts via their declared source table provenance in the SRM.

---

## Feature Boundary Statement

- **Owner service(s):**
  - **Measurement Layer (ADR-039)** — cross-cutting read model governance; provenance declarations for 4 measurement artifacts
  - **Platform/Governance** (`docs/70-governance/`) — surface classification standard and provenance matrix governing rendering delivery, data aggregation policy, and truth semantics

- **Writes:**
  - None. This is a documentation-only slice. No migrations, no RPCs, no service layer code.

- **Reads (for provenance declaration inputs):**
  - `measurement_theo_discrepancy_daily` — source: `rating_slip`, `gaming_table` (TheoService + TableContextService)
  - `measurement_audit_event_correlation_v` — source: `rating_slip`, `player_financial_transaction`, `mtl_entry`, `loyalty_ledger` (4 bounded contexts)
  - `measurement_rating_coverage_v` — source: `table_session`, `rating_slip` (TableContextService + RatingSlipService)
  - `loyalty_liability` (table) — source: `loyalty_ledger`, `player_loyalty` (LoyaltyService)

- **Cross-context contracts:**
  - Measurement Layer read models (SRM §Measurement Layer — registered views with source table provenance)
  - Proven Pattern Palette (RSC Prefetch, BFF RPC GOV-PAT-003, BFF Summary, Client-led) — referenced, not created

- **Non-goals (top 5):**
  1. Any database migration, RPC, or schema change
  2. Any service layer, API route, or component code
  3. Provenance declarations beyond the 4 ADR-039 measurement artifacts (Slices 2-3 expand the matrix)
  4. Observability, E2E CI, or caching standards (Hardening Areas 2, 3, 4 — separate tracks)
  5. Defining new architectural patterns — the standard recognizes the existing proven palette, not inventing new ones

- **DoD gates:** Functional / Governance / Enforceability (see DOD below)

---

## Goal

Establish the minimum viable governance artifacts (Surface Classification Standard + ADR-039 Metric Provenance Matrix) that constrain how subsequent slices build and audit measurement surfaces.

## Primary Actor

**Agent/Architect** (produces governance artifacts that constrain future EXEC-SPECs and surface implementations)

## Primary Scenario

Architect examines proven codebase patterns and ADR-039 measurement infrastructure, produces a Surface Classification Standard that governs rendering delivery and data aggregation choices per surface class, and instantiates the Cross-Surface Metric Provenance framework for ADR-039's 4 artifacts with concrete truth class, freshness, computation layer, and reconciliation declarations.

## Success Metric

Both standards are concrete enough to **reject a bad EXEC-SPEC** — the Surface Classification Standard can force a rendering/fetch choice, and the Provenance Matrix can constrain freshness and reconciliation decisions for Slice 1's measurement UI widgets.

---

## Document Structure

| Document | Purpose | Location |
|----------|---------|----------|
| **Feature Boundary** | Scope definition (this file) | `docs/20-architecture/specs/hardening-slice-0-standards-foundation/FEATURE_BOUNDARY.md` |
| **Scaffold** | Options exploration | `docs/01-scaffolds/SCAFFOLD-XXX-hardening-slice-0.md` |
| **RFC** | Design brief | `docs/02-design/RFC-XXX-standards-foundation.md` |
| **SEC Note** | Security assessment | `docs/20-architecture/specs/hardening-slice-0-standards-foundation/SEC_NOTE.md` |
| **PRD** | Acceptance criteria | `docs/10-prd/PRD-XXX-standards-foundation.md` |

---

**Gate:** If you can't write the ownership sentence, you're not ready to design.
