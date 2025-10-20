## Audit Execution Workflow — Lean Cut (.md)

**Verdict**: Solid core, slightly over-engineered. Keep the rigor where risk is real (UUID & money), trim ceremony/tooling elsewhere.

What’s Appropriately “Heavy”

MTL Patron UUID Migration (Wave 3)
High-risk change deserves phased, reversible steps and explicit monitoring.

Financial/Telemetry Boundary Decisions (Wave 2)
Clarifies ownership, avoids double-bookkeeping; deliberate treatment is warranted.

Where It’s Overbuilt (and How to Trim)

1. Too many bespoke validators up front
Start with one thin checker (tables present + duplicate ownership). Add more only if new gaps emerge.

2. Governance & sign-off ceremony
Replace ARB/CTO multi-gate approvals with one owner + one reviewer and a single PR checklist.

3. Separate “Docs Only” wave
Fold doc completion into acceptance criteria of the implementation waves; avoid a dedicated docs wave.

4. Materialized views by default
Begin with a plain view + indexes. Promote to materialized only if your p95 exceeds the budget.

5. Rigid sequential gates for doc-only tracks
Run naming/schema appendix and temporal-authority contract in parallel (no blocking gates).

## Lean Plan (Same Outcomes, Less Ceremony)
**Phase A (1 week)**: Decide & Document

- Update the Responsibility Matrix:

- Declare single temporal authority (e.g., Casino); MTL is read-only consumer.

- Add Schema Identifier Appendix (canonical table/enum names).

- Add Performance context section (purpose, inputs/outputs).

- Acceptance: One PR with a checklist proving no duplicate ownership and no orphaned entities.

**Phase B (1 week)**: Boundaries (Condensed Wave 2)

- Publish a Financial Data Ownership Table (each monetary field → owning service).

**Choose**: (A) Remove cash fields from RatingSlip or 
            (B) Keep with documented denorm.

- If (A): provide a compatibility view to preserve current queries; defer materialization.

**Phase C (2–3 weeks)**: Type Integrity (Keep the Rigor of Wave 3)

- Execute TEXT→UUID migration with backfill + dual-write.

- Keep monitoring windows minimal (e.g., 2–3 days), gate on discrepancy = 0% before cutover.

- Drop legacy columns after successful window.

**Minimal Tooling (Day-1 Utility, Not a Suite)**

- Single Type/Matrix Checker (TS):

- Extract tables from database.types.ts.

- Scan matrix for ownership claims.

- Fail on duplicates or missing coverage.

Expand only if it keeps catching real defects.

**Acceptance Criteria (Trimmed & Concrete)**

 ## Docs

- Matrix updated with Performance, Temporal Authority, Schema Appendix.

- No duplicate ownership; no orphaned tables.

**Finance Boundary**

- A single table enumerates each monetary field, its owning service, and the migration/denorm decision.

- UUID Migration

- TEXT→UUID complete; all views/queries updated.

- Dual-write discrepancy = 0% during the window.

- Legacy columns dropped post-cutover.

**Quick Checklis**t (Copy Into PR Description)

- [] Responsibility Matrix updated (Temporal Authority, Performance, Schema Appendix).
- [] Ownership audit passes (no duplicates, no orphaned).
- [] Financial Data Ownership Table finalized (remove vs. denorm decision recorded).
- [] Compat view added if removal chosen; perf OK (<100 ms p95).
- [] UUID migration plan executed (backfill, dual-write, monitors).
- [] Discrepancy 0% for N days; legacy columns dropped.
- [] All user-facing docs updated (readme/changelogs/migration notes).  

## Notes on Risk vs. Ceremony

Keep heavy ceremony: migrations that change identity, money, or legal/compliance semantics.

Keep it light: documentation-only tasks, naming, view vs. mat-view choices, and sign-off paths.