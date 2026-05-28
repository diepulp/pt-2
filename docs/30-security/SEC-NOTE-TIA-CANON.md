# SEC Note: Table Inventory Accounting Canonization

**Feature:** FIB-H-TIA-CANON-001  
**Date:** 2026-05-27  
**Author:** Architecture  
**Status:** Draft  
**RFC:** `docs/02-design/RFC-007-table-inventory-accounting-canonization.md`  
**Scaffold:** `docs/01-scaffolds/SCAFFOLD-TABLE-INVENTORY-ACCOUNTING-CANON.md`

---

## Scope

This slice is CLS-002 read-composition only. There are no new write surfaces, no new authoring RPCs, no new SECURITY DEFINER functions, and no new tables. The primary security surface is the **API response boundary** — specifically: casino-scope inheritance through the new service module, and the absence of suppressed legacy financial fields from serialized responses.

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|---|---|---|
| Table financial result values (`projected_table_win_loss_cents`, `partial_table_result_cents`) | Financial / Operational | Non-custody estimates of casino table performance; must not leak across casino tenants |
| Session inventory inputs (`table_inventory_snapshot`, `table_fill`, `table_credit`) | Operational | Chip movement records; casino-scoped; cross-tenant leakage is a tenancy violation |
| Telemetry inputs (`table_buyin_telemetry`) | Operational | Buy-in telemetry; casino-scoped; row presence for rated buy-ins reflects Finance relay state |
| Casino tenancy boundary | Compliance | Pattern C hybrid RLS (ADR-015); no cross-casino read must be possible through the new module |
| Custody/authority envelope (`custody_status`, `source_authority`) | Regulatory | PT-2 must not claim authoritative financial totals (ADR-053); `non_custody_estimate` must be present in every response |
| Suppressed legacy fields (`win_loss_inventory_cents`, `win_loss_estimated_cents`, `estimated_drop_buyins_cents`) | Operational | Must not appear in any serialized API response after P0 suppression; type removal alone does not guarantee response exclusion |

---

## Threats

| Threat | Impact | Likelihood | Priority |
|---|---|---|---|
| T1: Cross-casino table financial leakage | High | Low | P1 |
| T2: Legacy field survival in serialized response | Med | Med | P1 |
| T3: Custody claim absent or inflated at API boundary | Med | Low | P2 |
| T4: BFF route bypasses RLS context injection | High | Low | P1 |
| T5: Role-unauthorized access to table financial data | Med | Low | P2 |

### Threat Details

**T1: Cross-casino table financial leakage**
- **Description:** Staff at Casino A reads `TableInventoryAccountingProjection` values for Casino B's tables.
- **Attack vector:** `deriveProjection()` called without casino-scoped RLS context; `table_id` or `sessionId` belonging to a different casino resolves successfully.
- **Impact:** Tenancy isolation violation; regulatory exposure.

**T2: Legacy field survival in serialized response**
- **Description:** `win_loss_inventory_cents`, `win_loss_estimated_cents`, or `estimated_drop_buyins_cents` remain in the BFF response body after TypeScript DTO type removal, because an underlying service or query still selects them.
- **Attack vector:** P0 suppression removes the TypeScript field declaration but does not remove the underlying query projection or response serialization path.
- **Impact:** Operators receive competing win/loss-like values alongside the canonical DTO, defeating the split-brain resolution. The correct value is ambiguous.

**T3: Custody claim absent or inflated at API boundary**
- **Description:** `custody_status` field is omitted, null, or set to a value other than `'non_custody_estimate'` in a response.
- **Attack vector:** DTO serialization strips optional fields; or a future implementor sets `custody_status = 'authoritative'` without an ADR/FIB amendment.
- **Impact:** API consumers (or downstream integrations) may treat the value as an authoritative financial total, violating ADR-053.

**T4: BFF route bypasses RLS context injection**
- **Description:** The updated BFF route for the Pit Terminal Rundown calls `deriveProjection()` before `set_rls_context_from_staff()` establishes RLS context, or the route is restructured in a way that skips the context injection middleware.
- **Attack vector:** Refactoring the BFF route handler order; or the module being called from a code path that does not go through the standard auth middleware.
- **Impact:** All five source table reads execute without casino-scoped context; Supabase falls back to unauthenticated access or JWT-only claims without `SET LOCAL` isolation.

**T5: Role-unauthorized access to table financial data**
- **Description:** A staff role that should not see table financial results (e.g. a restricted dealer role) accesses the Pit Terminal Rundown BFF route.
- **Attack vector:** No new role gate is introduced by this slice; if the existing BFF route has insufficient role gating, this slice inherits the gap.
- **Impact:** Unauthorized disclosure of operational financial data.

---

## Controls

| Threat | Control | Implementation |
|---|---|---|
| T1 | Pattern C hybrid RLS on all five source tables | Existing policies; `casino_id = current_setting('app.casino_id')` enforced at DB layer. No new policies required — must be evidenced per C1 detail below. |
| T2 | Integration test asserting suppressed fields are absent from response body | SEC gate requires a test that serializes the BFF response and asserts `win_loss_inventory_cents`, `win_loss_estimated_cents`, `estimated_drop_buyins_cents` are not present as keys — not just typed as `undefined`. |
| T3 | `custody_status` non-optional in DTO; ADR-A freezes value | `custody_status: 'non_custody_estimate'` typed as a literal (not `string`); ADR-A declares this value immutable for this slice. Omission is a type error, not a runtime gap. |
| T4 | BFF route auth middleware order verified in SEC review | SEC review must confirm `set_rls_context_from_staff()` is called before `deriveProjection()` in the updated route handler. Must be verifiable in code review, not just assumed from existing middleware chain. |
| T5 | Existing BFF route role gate inherited | SEC review confirms the existing role gate on the Pit Terminal Rundown BFF route is sufficient; this slice introduces no new role surface. |

### Control Details

**C1: RLS casino-scope evidence (T1)**
- **Type:** Preventive
- **Location:** Database — existing RLS policies on all five source tables
- **Enforcement:** Database layer; `set_rls_context_from_staff()` sets `app.casino_id` from JWT (ADR-024)
- **Evidenced by (SEC approval requires one of):**
  - (a) Policy inventory excerpt for all five source tables showing a casino-scoped `SELECT` policy (`casino_id = current_setting('app.casino_id')`); or
  - (b) Cross-casino negative integration test: staff authenticated to Casino A cannot derive a `TableInventoryAccountingProjection` for a table/session belonging to Casino B. Option (b) is preferred — it proves runtime behavior, not schema declaration.

**C2: Response body assertion (T2 — legacy field survival)**
- **Type:** Detective / Preventive
- **Location:** Integration test on BFF route
- **Enforcement:** Test suite (CI gate)
- **Tested by:** Call the actual Pit Terminal Rundown BFF route using its real HTTP method → recursively scan the full serialized JSON response body and assert `win_loss_inventory_cents`, `win_loss_estimated_cents`, `estimated_drop_buyins_cents` are absent at any nesting depth. Top-level key checks are insufficient — legacy fields may survive nested inside table row objects, metrics arrays, or legacy payload wrappers. TypeScript `Pick`/`Omit` alone does not prevent serialization leakage if the underlying query still selects these columns.

**C3: `custody_status` runtime presence (T3)**
- **Type:** Preventive / Detective
- **Location:** Integration test on BFF route response body
- **Enforcement:** Test suite (CI gate)
- **Tested by:** Same integration test as C2 must also assert `custody_status` is present in the response body and equals `'non_custody_estimate'` for both the projected result fixture (all inputs present) and the partial result fixture (drop absent). TypeScript literal type enforcement is compile-time only; a mapper or object spread can silently drop the field at runtime.

**C4: RLS context injection order (T4)**
- **Type:** Preventive
- **Location:** BFF route handler
- **Enforcement:** Code review + ADR-024 middleware pattern
- **Tested by:** Integration test: call rundown route without valid staff JWT → confirm 401/403 response (not a data response). Confirms middleware is active.

**C5: Role gate verification (T5)**
- **Type:** Preventive
- **Location:** BFF route middleware / RBAC model
- **Enforcement:** Code review + SEC review documentation
- **Tested by:** SEC review must document the allowed staff roles for the Pit Terminal Rundown BFF route. If the current RBAC model includes a role that should not access table financial operational results (e.g. a restricted dealer role), at least one negative test or code citation must demonstrate that role receives a 401/403 — not a data response.

---

## Deferred Risks (Explicitly Accepted at Baseline)

| Risk | Reason for Deferral | Trigger to Address |
|---|---|---|
| `bridge_pending` telemetry gap detection | Finance relay-lag truth requires cross-context DTO contract that does not exist. System cannot distinguish `none_for_session` from `bridge_pending` at baseline. Per FIB-H-TIA-CANON-001 exclusions. | When Finance cross-context DTO contract is published (Phase 2.3a) |
| Rate limiting on Pit Terminal Rundown BFF route | No new threat surface introduced by this slice; rate limiting on the rundown route is a pre-existing gap not in scope here. | Before production deployment of any public-facing surface |
| Audit log for table financial reads | No write path; read audit trail not required at baseline for operational estimates. | Before production or customer/regulatory-facing deployment if read-access auditability becomes a contractual, compliance, or internal-control requirement |

---

## Data Storage Justification

No new data is stored by this slice. `TableInventoryAccountingProjection` is a read-time derived value — it is not persisted at baseline.

| Derived value | Storage form | Justification |
|---|---|---|
| `projected_table_win_loss_cents` | Not stored — computed at request time | Read-time derivation; algebraically idempotent from canonical inputs |
| `partial_table_result_cents` | Not stored — computed at request time | Same |
| `telemetry_derived_drop_estimate_cents` | Not stored — aggregated at request time from `table_buyin_telemetry` | No COALESCE to 0; null means `none_for_session` |

---

## RLS Summary

No new RLS policies are introduced. Existing policies on all five source tables already enforce casino-scope isolation. This table confirms existing coverage — it is a verification, not a grant.

| Table | SELECT | INSERT | UPDATE | DELETE | New policy? |
|---|---|---|---|---|---|
| `table_inventory_snapshot` | Casino-scoped staff | Not via this module | Not via this module | Not via this module | No |
| `table_fill` | Casino-scoped staff | Not via this module | Not via this module | Not via this module | No |
| `table_credit` | Casino-scoped staff | Not via this module | Not via this module | Not via this module | No |
| `table_buyin_telemetry` | Casino-scoped staff | Not via this module | Not via this module | Not via this module | No |
| `table_session` | Casino-scoped staff | Not via this module | Not via this module | Not via this module | No |

All SELECT policies enforce `casino_id = current_setting('app.casino_id')` (Pattern C hybrid, ADR-015). `set_rls_context_from_staff()` sets this value from the JWT `staff_id` claim — not from user-supplied parameters (ADR-024).

---

## SEC Review Confirmation Requirements

Per RFC-007 §4.5, the SEC review must explicitly confirm:

- [ ] No new RLS policies required — existing Pattern C hybrid covers all five source tables
- [ ] No new SECURITY DEFINER function introduced by this slice
- [ ] BFF route auth inheritance verified (not assumed) — `set_rls_context_from_staff()` is called before `deriveProjection()` in the updated handler
- [ ] Casino-scope preservation confirmed — all reads remain casino-scoped; no cross-casino leakage path introduced by the new module
- [ ] Legacy field absence verified at response body level — suppression targets (`win_loss_inventory_cents`, `win_loss_estimated_cents`, `estimated_drop_buyins_cents`) are absent from serialized API responses, confirmed by integration test assertion on response body keys

---

## Validation Gate

- [ ] All assets classified
- [ ] All threats have controls or explicit deferral
- [ ] No new data stored — confirmed, no storage justification required beyond derived-value declaration
- [ ] No new SECURITY DEFINER functions — confirmed
- [ ] **RLS coverage evidenced** — policy inventory excerpt for all five source tables showing casino-scoped SELECT, OR cross-casino negative integration test (C1; option b preferred)
- [ ] **Allowed roles for rundown route documented** — SEC review names permitted roles; negative test or code citation produced for any disallowed role (C5)
- [ ] **BFF auth inheritance order verified** — `set_rls_context_from_staff()` confirmed called before `deriveProjection()` in the updated route handler (C4)
- [ ] **Legacy field recursive-scan absence test** — response body recursively scanned for `win_loss_inventory_cents`, `win_loss_estimated_cents`, `estimated_drop_buyins_cents` at any nesting depth (C2)
- [ ] **`custody_status` runtime presence asserted** — integration test confirms field is present and equals `'non_custody_estimate'` for projected and partial result fixtures (C3)
