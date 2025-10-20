### Bounded Context Audit

  - Loyalty separation and idempotent ledger remain solid, but multiple ownership and type mismatches still leak across
  domains.
  - Canonical schema (types/database.types.ts) shows telemetry, compliance, and finance seams that the matrix doc does not
  reconcile.
  - Report below captures validated issues plus additions needed to restore cohesion.

  # PT-2 Responsibility Matrix Integrity Audit (2025-10-20 snapshot)

  **Scope** · Review `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md` against canonical schema in `types/database.types.ts` and
  prior audit gaps.
  **Sources** · Matrix doc v2.3.0, `RESPONSIBILIY_MATRIX_AUDIT.md`, Supabase types (generated 2025-10-19).

  ---

  ## What’s Working
  - Reward policy boundary is crisp: Casino supplies configuration, Loyalty calculates and records (`docs/patterns/
  SERVICE_RESPONSIBILITY_MATRIX.md:139`, `types/database.types.ts:584`).
  - RatingSlip is now explicitly a telemetry cache; idempotency contract is stated and matches ledger schema.
  - Compliance context reiterates read-only enrichment posture and immutable write model.

  ---

  ## Verified Inconsistencies & Gaps
  1. **Configuration ownership duplication**
     Casino lists `CasinoSettings` as owned (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:126`), yet MTL also claims
  ownership of `casino_settings` (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:438`). Canonical types expose only one table
  (`types/database.types.ts:143`), so dual ownership violates the single temporal authority principle.

  2. **MTL patron type mismatch persists**
     Doc still casts `player.id::text` (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:562`), and schema confirms
  `mtl_entry.patron_id` is `string` (TEXT) (`types/database.types.ts:758`), contradicting the UUID-based identity contract
  outlined in the earlier audit.

  3. **Telemetry vs finance boundary erosion**
     Matrix positions RatingSlip as measurement-only, but canonical schema still stores `cash_in`, `chips_brought`,
  `chips_taken` on `ratingslip` (`types/database.types.ts:1509`). That overlaps with PlayerFinancialService ownership (`docs/
  patterns/SERVICE_RESPONSIBILITY_MATRIX.md:132`) and reintroduces double bookkeeping risk.

  4. **Visit financial aggregation ambiguity**
     Visit service continues to “Aggregate Financials” (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:129`) despite
  PlayerFinancialService claiming patron-level reconciliation, leaving no documented roll-up contract.

  5. **Performance context undefined**
     Matrix references Performance as a consumer in several tables (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:128`,
  `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:605`), but no bounded context or schema section exists. The Supabase types
  already include `performance_alerts` structures (`types/database.types.ts:842`), so the doc is incomplete.

  6. **Naming divergence**
     Casino section mixes `CasinoSettings`, `Staff`, `AuditLog`, while Supabase exposes both snake_case and quoted CamelCase
  tables (`types/database.types.ts:143`, `types/database.types.ts:176`). The doc should explicitly document actual table
  identifiers or standardize them—current wording leaves implementers guessing.

  7. **Temporal authority leakage**
     MTL section states it owns gaming-day logic (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:439`) instead of consuming
  Casino settings. That contradicts the very “read-only correlation” rule in the same section.

  8. **Legacy friction noted in prior audit remains**
     Performance schema still absent, idempotency contract undocumented for non-loyalty denorm writes, and naming
  inconsistencies show the original checklist items were not executed.

  ---

  ## Recommended Additions to Restore Integrity
  - **Temporal Authority Contract**: add an explicit paragraph under MTL clarifying it _references_ `casino_settings` and
  consumes a shared helper from Casino; move ownership bullet to Casino only.
  - **Patron Identity Migration Plan**: define a migration in the matrix (or linked appendix) to convert `mtl_entry.patron_id`
  to UUID and drop text casts, including rollout steps (backfill, view updates, client adjustments).
  - **Financial Data Boundary Table**: introduce a responsibility table listing which service stores which monetary
  fields (cash_in/out, chips, balances) and mandate removal of `cash_in/chips_*` from `ratingslip` in favour of
  `PlayerFinancialService`.
  - **Visit-to-Finance Interface Note**: document that Visit references financial aggregates via a read model (e.g.,
  `visit_financial_summary`) rather than owning records.
  - **Performance Context Section**: add a bounded context summary for Performance with the existing Supabase entities
  (`performance_alerts`, metrics enums) and clarify it is a read-model only service.
  - **Schema Identifier Appendix**: include a short appendix mapping service-owned entities to exact table names (quoted
  identifiers where needed) so docs align with `types/database.types.ts`.
  - **Consistency Checklist Refresh**: reissue the remediation checklist with owners/dates to ensure lingering items (naming,
  performance schema, patron UUID) are executed.

  ---

  ## Next Actions
  1. Update the matrix doc to reflect single ownership of temporal configuration and document the cross-service helper.
  2. Author a migration ADR for `mtl_entry.patron_id` → UUID and update the doc after acceptance.
  3. Plan refactor to eliminate cash fields from RatingSlip telemetry, moving them under PlayerFinancialService with a
  denormalized view if needed.
  4. Publish the missing Performance bounded context write-up, leveraging existing Supabase types.
  5. Add the schema identifier appendix and rerun a naming consistency sweep.

  Suggested follow-ups:

  1. Align documentation with the canonical schema before Phase 6 implementation begins.
  2. Schedule the patron UUID migration and RatingSlip cash-field extraction as prerequisites for compliance and finance
  workstreams.
