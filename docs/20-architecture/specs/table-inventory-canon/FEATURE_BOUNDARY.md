# Feature Boundary: Table Inventory Accounting Canonization

> **Ownership Sentence:** This feature belongs to **TableContextService** (subdomain: `TableInventoryAccounting`) and reads from `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_buyin_telemetry`, and `table_session` without writing new domain facts; cross-context table-result consumption goes through the **`TableInventoryAccountingProjection`** DTO only — all downstream surfaces (Pit Terminal Rundown, shift dashboard, metrics) are consumers, not formula owners.

---

## Bounded Context

- **Owner service:**
  - **TableContextService** (`TableInventoryAccounting` subdomain) — declares canonical formula ownership, DTO authority (`TableInventoryAccountingProjection`), and completeness state; does not acquire new write authority over existing authoring tables.

- **Writes:**
  - *None* — this is a read-composition feature (CLS-002 with `canonical_derived_model` qualifier). Existing authoring tables remain owned by TableContextService with no new mutations in this slice.

- **Reads:**
  - `table_inventory_snapshot` — opener and closer inventory counts (opening_inventory_cents, closing_inventory_cents)
  - `table_fill` — chips moved cage → table (fills_cents)
  - `table_credit` — chips moved table → cage (credits_cents)
  - `table_session` — session lifecycle context (session_id, gaming_day, casino_id, status, opened_at, closed_at)
  - `table_buyin_telemetry` — session-scoped aggregate (RATED_BUYIN + GRIND_BUYIN rows, filtered to session window) → `telemetry_derived_drop_estimate_cents`. **Source RESOLVED** (2026-05-27, classification YAML `open_question_L_telemetry_source`): same underlying data as `rpc_shift_table_metrics.estimated_drop_buyins_cents`, re-scoped from gaming-day to single session. Must carry `source_authority.drop = 'telemetry_derived_estimate'` and `custody_status = non_custody_estimate`. Implementation gap: no session-scoped aggregation exists in the current rundown path — must be added to the `TableInventoryAccounting` service module.

- **Cross-context contracts:**
  - `TableInventoryAccountingProjection` — canonical read model (not `ProjectionDTO`; DTO suffix dropped per FIB §P.4). Carries: `projected_table_win_loss_cents`, `partial_table_result_cents`, `final_table_win_loss_cents` (always null), `completeness` envelope (`status`, `missing_inputs`, `integrity_issues`), `calculation_kind`, `custody_status`, `source_authority`
  - Published to: Pit Terminal Rundown (exemplar), shift dashboard (subsequent consumer after exemplar proves canon)

---

## SRM Validation

All read tables are owned by **TableContextService** (SRM v4.26.0):
- `table_inventory_snapshot` ✅ TableContextService
- `table_fill` ✅ TableContextService
- `table_credit` ✅ TableContextService
- `table_buyin_telemetry` ✅ TableContextService (authoring operational table; Finance owns only relay/projection side effects per SRM v4.26.0 changelog)
- `table_session` ✅ TableContextService

No table owned by another service is written. No new bounded context is introduced — `TableInventoryAccounting` is a subdomain declaration within the existing `TableContextService` boundary (per FIB-H §P.2).

**SRM update required:** Add `TableInventoryAccounting` subdomain entry under TableContextService at Phase 5 PRD approval.

---

## Scope Anchors (FIB-H v1, frozen 2026-05-27)

- **In scope:** Pit Terminal Rundown as exemplar; `TableInventoryAccountingProjection`; canonical formula for `projected_table_win_loss_cents` and `partial_table_result_cents`; legacy stream retirement
- **Out of scope:** `final_table_win_loss_cents`; external custody/count-room integration; drop posting workflow; shift dashboard as first exemplar; any new surface not backed by the canonical DTO
- **Classification:** CLS-002 `read_composition` with `canonical_derived_model` qualifier; secondary CLS-006 `surface_value`
- **Transport:** Read-time derivation (service layer → BFF/API → Pit Terminal Rundown)

---

**Gate:** `srm-ownership` — Ownership sentence written; all read tables confirmed owned by TableContextService; no writes introduced; no cross-context write authority claimed.
