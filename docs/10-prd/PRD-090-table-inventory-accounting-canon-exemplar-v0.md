---
id: PRD-090
title: Table Inventory Accounting Canon Exemplar
owner: Lead Architect
status: exec_authorized
affects: [ADR-059, ADR-060, ADR-061, SRL-TIA-001, ARCH-SRM]
created: 2026-05-29
last_review: 2026-06-01
patch_delta: PRD090-DA-007 (governance hardening — stale-FK null coverage, test spec gaps closed, DoD additions, status promotion)
phase: TIA Canon Exemplar
pattern: B
http_boundary: true
scope_authority: docs/issues/table-inventory-accounting-canon/planning/PRD-TIA-CANON-KICKOFF-DIRECTIVE.md
parent_fib: docs/issues/table-inventory-accounting-canon/planning/FIB-H-TABLE-INVENTORY-ACCOUNTING-CANONIZATION-v1-exemplar.md
legacy_consumer_disposition_strategy: docs/issues/table-inventory-accounting-canon/LEGACY-CONSUMER-DISPOSITION-STRATEGY-PRD-090.md
---

# PRD-090 — Table Inventory Accounting Canon Exemplar

**Subtitle:** Read-time `TableInventoryAccountingProjection`, Pit Terminal Rundown exemplar wiring, and legacy table-result suppression gate

**Containment boundary (one-line invariant):** *This PRD implements one read-time derivation module (`TableInventoryAccounting` within `TableContextService`), one canonical DTO (`TableInventoryAccountingProjection`), one API boundary, and the Pit Terminal Rundown as the first canonical consumer — plus hard suppression of all competing legacy table-result semantics on operator-visible surfaces; it does not implement posted-drop workflows, soft-count or count-room integration, `final_table_win_loss_cents`, reconciliation, outbox work, a persisted projection store, or any custody-authoritative total.*

---

## Authority Stack

```yaml
authority_stack:
  feature_intent_authority:
    - FIB-H-TIA-CANON-001
  semantic_admission_authority:
    - SRL-TIA-001-table-inventory-accounting.yaml
  terminology_authority:
    - TIA-CANON-THESAURUS-ZACHMAN.yaml
    - TABLE_INVENTORY_ACCOUNTING_UBIQUITOUS_LANGUAGE_BASELINE.md
  behavioral_decision_spine:
    - ADR-059  # ownership + frozen formula
    - ADR-060  # drop taxonomy + naming standard
    - ADR-061  # session-scope aggregation boundary
```

The PRD elaborates delivery, sequencing, and acceptance criteria. It does not alter the semantic meaning of any admitted term, the canonical formula, the drop taxonomy, the session-scope predicate, or the SRL laws.

---

## 1. Overview

- **Owner:** Lead Architect
- **Status:** EXEC-authorized
- **Summary:** PT-2's table-result semantics are split across two competing paths: the patched `table_win_cents` stub in the Pit Terminal Rundown (which returns opaque null when the telemetry-derived drop estimate is absent) and the `win_loss_inventory_cents`/`win_loss_estimated_cents` fields on the shift dashboard (which use gaming-day scope and a forbidden `COALESCE(SUM, 0)`). Both are wrong. This PRD closes the split-brain by implementing the canonical `TableInventoryAccounting` read-time derivation module — the sole owner of the three-result-state machine — wiring the Pit Terminal Rundown as its first consumer, and suppressing all competing legacy table-result representations on active operator-visible surfaces. The semantic model is already established through ADR-059/060/061 and SRL-TIA-001; this PRD converts that frozen canon into executable code and one deployed exemplar surface.

---

## 2. Problem & Goals

### 2.1 Problem

The system currently produces no correct table-result values. Three distinct failure modes exist:

1. **The Pit Terminal Rundown returns opaque null when the telemetry-derived drop estimate is absent.** `rpc_compute_table_rundown` contains a `-- "PATCHED behavior"` stub: when `drop_posted_at` is null, `table_win_cents` is null. There is no distinction between "the telemetry-derived drop estimate is legitimately absent" (which should produce `partial_table_result_cents`) and "opener or closer is unresolvable" (which should produce `integrity_failure`). The operator sees a blank with no explanation.

2. **The shift dashboard shows values derived from a forbidden source.** `win_loss_inventory_cents` and `win_loss_estimated_cents` in `ShiftTableMetricsDTO` are derived from `rpc_shift_table_metrics`, which (a) uses gaming-day scope instead of session scope, and (b) applies `COALESCE(SUM(...), 0)`, silently treating zero qualifying telemetry rows as a zero telemetry-derived drop estimate. Both are hard violations of ADR-061. These fields are active on operator-visible surfaces.

3. **No integrity discrimination.** When opener or closer is null (first session on a new table, force-closed session with no snapshot), this is an operational data integrity signal. The current code cannot surface it; it collapses silently into opaque null alongside a legitimately absent telemetry-derived drop estimate.

### 2.2 Goals

1. **Implement the canonical three-result-state machine.** `TableInventoryAccounting` produces exactly one of `telemetry_drop_formula`, `inventory_only`, or `integrity_failure` — never a fourth state, never opaque null.
2. **Wire the Pit Terminal Rundown as the first canonical consumer.** The Rundown renders `projected_table_win_loss_cents` (labeled "Projected Win/Loss") or `partial_table_result_cents` (labeled "Partial Table Result") or an integrity disclosure — based solely on `calculation_kind`.
3. **Suppress all competing legacy table-result representations.** `win_loss_inventory_cents`, `win_loss_estimated_cents`, `win_loss_estimated_total_cents`, `estimated_drop_buyins_cents`, and `table_win_cents` must not be visible on any active operator-visible surface when the exemplar lands.
4. **Close the `table_buyin_telemetry` SRM ownership gap.** Declare `table_buyin_telemetry` as a consumed input for `TableInventoryAccounting.telemetry_derived_drop_estimate_cents` in the SRM before implementation begins.
5. **Establish an executable test harness** that enforces ADR-059/060/061 and SRL-TIA-001 semantic laws at every future code change.

### 2.3 Non-Goals

- No posted-drop, counted-drop, or soft-count workflow.
- No external count-room or custody authority integration.
- No `final_table_win_loss_cents` — always null, never approximated.
- No custody-authoritative table result of any kind.
- No reconciliation engine.
- No outbox producer or consumer work.
- No persisted projection store (add only if a subsequent EXEC proves it necessary).
- No dashboard redesign.
- No `rpc_shift_table_metrics` reuse for `telemetry_derived_drop_estimate_cents`.
- No UI-side formula patch or component-local recomputation.
- No compatibility preservation for contradictory legacy DTOs, labels, or formulas.
- No generic table accounting bounded context (subdomain within `TableContextService` only).

---

## 3. Users & Use Cases

### 3.1 Primary Users

| Role | Context |
|---|---|
| Pit Boss | Monitors active tables from the Pit Terminal Rundown during a shift |
| Floor Supervisor | Reviews table performance and data integrity across multiple pits |

### 3.2 Use Cases

**Pit Boss — Projected result during rated play:**
As a Pit Boss, I need to see a labeled "Projected Win/Loss" on the Rundown for sessions where rated buy-in telemetry is present, so I know the table's estimated performance including the telemetry-derived drop estimate — clearly marked as non-final and non-custody.

**Pit Boss — Partial result during unrated play:**
As a Pit Boss, I need to see a labeled "Partial Table Result" on the Rundown for sessions where opener and closer are resolvable but no buy-in telemetry exists, so I can assess inventory movement without confusing it with a projected win/loss.

**Floor Supervisor — Integrity failure signal:**
As a Floor Supervisor, I need an explicit integrity disclosure on the Rundown when opener or closer is unresolvable (not a blank), so I can investigate which session is missing a required snapshot and dispatch corrective action.

**Floor Supervisor — No split-brain:**
As a Floor Supervisor, I need the same table-result semantics on every surface I look at, so I am never misled by a dashboard value that uses a different formula or scope than the Rundown.

---

## 4. Scope & Feature List

### 4.1 Suppression Boundary Definition

**Active operator-visible surface** means any UI route, dashboard, report, export, API response, or DTO field consumed by a pilot or operator workflow without developer-only access. The suppression gate in FR-8 and WS5 applies to all such surfaces.

Includes:
- Pit Terminal Rundown
- Shift dashboard (shift metrics, table metrics panels)
- Casino summary cards
- Any API response or DTO field backing those surfaces and returned to an operator-facing boundary

Excludes:
- Deleted routes
- Archived documentation
- Test fixtures
- Internal DTO fields that are not returned to any active operator-facing boundary (e.g., retained in an internal DTO for migration bookkeeping only, never serialized to the API response)

### 4.2 Legacy Consumer Disposition Strategy

PRD-090 does not migrate every legacy table-result consumer to `TableInventoryAccountingProjection`. The only required migrated consumer in this exemplar is the Pit Terminal Rundown.

All other active operator-visible consumers that currently render legacy table-result values must be explicitly classified before release. Allowed dispositions:

| Disposition | Meaning | Constraint |
|---|---|---|
| `consume_projection` | Surface consumes `TableInventoryAccountingProjection` | Required for the Pit Terminal Rundown exemplar |
| `suppress_rendering` | Surface does not yet consume the projection | Must not render or serialize forbidden legacy table-result fields or labels |
| `inactive_or_internal_only_with_reason` | Deleted route, archived code/doc, test, or internal-only field | Forbidden for any active operator-visible surface that renders or serializes legacy table-result values |

No active operator-visible surface may use `inactive_or_internal_only_with_reason` while continuing to render or serialize forbidden legacy table-result values. This clarification is binding for WS5 and supersedes any prior `outside_exemplar_boundary_with_reason` wording.

### In Scope

**Service derivation (WS2):**
- [ ] `TableInventoryAccounting` module exists at `services/table-context/table-inventory-accounting.ts`
- [ ] Module resolves opener and closer via dual-path lookup (FK → session-linked snapshot fallback; null after exhaustion → `integrity_failure`)
- [ ] Module computes `telemetry_derived_drop_estimate_cents` using the frozen session-scope SUM predicate (ADR-061 D2) — `RATED_BUYIN` and `GRIND_BUYIN` only, `RATED_ADJUSTMENT` excluded
- [ ] Null SUM result (zero qualifying rows) passes through as null — not COALESCEd to 0
- [ ] Three-result-state machine produces exactly `telemetry_drop_formula`, `inventory_only`, or `integrity_failure`
- [ ] Returns `TableInventoryAccountingProjection` DTO with all required semantic fields

**API boundary (WS3):**
- [ ] Route `GET /api/v1/table-context/table-sessions/{sessionId}/accounting-projection` exists
- [ ] Route returns `TableInventoryAccountingProjection` — no local formula logic in the route handler
- [ ] Route does not call `rpc_shift_table_metrics`

**Rundown wiring (WS4):**
- [ ] Pit Terminal Rundown consumes `TableInventoryAccountingProjection` exclusively
- [ ] `table_win_cents` stub and local formula removed from the Rundown path
- [ ] Renders "Projected Win/Loss" with non-custody qualifier when `calculation_kind = 'telemetry_drop_formula'`
- [ ] Renders "Partial Table Result" with missing telemetry-derived drop estimate disclosure when `calculation_kind = 'inventory_only'`
- [ ] Renders integrity disclosure only when `calculation_kind = 'integrity_failure'` — no result label
- [ ] No forbidden surface labels appear anywhere in the Rundown

**Legacy suppression (WS5):**
- [ ] `win_loss_inventory_cents`, `win_loss_estimated_cents`, `win_loss_estimated_total_cents`, `estimated_drop_buyins_cents`, `table_win_cents` are not rendered on any active operator-visible surface
- [ ] Suppression inventory is complete and each legacy field is classified as `consume_projection`, `suppress_rendering`, or `inactive_or_internal_only_with_reason`
- [ ] Suppression inventory is checked in at `docs/issues/table-inventory-accounting-canon/PRD-090-WS5-legacy-consumer-suppression-inventory.md` with each legacy consumer, disposition, reason, follow-up ticket, and verification evidence
- [ ] Automated suppression gate proves no active operator-visible surface renders or serializes forbidden legacy fields or labels

**Test harness (WS6):**
- [ ] DTO contract test, five-operand formula test, inventory-side derivation test, null-vs-zero test, `RATED_ADJUSTMENT` exclusion test, session-scope-only test, `rpc_shift_table_metrics` exclusion test, `integrity_failure` suppression test, consumer render-only test all pass

**SRM preflight (WS1):**
- [ ] `table_buyin_telemetry` ownership gap resolved in SRM (`TableContextService` consumes it as `telemetry_derived_drop_estimate_cents` input)
- [ ] SRM no longer describes `table_buyin_telemetry` as an unresolved ownership gap after WS1 exits

### Out of Scope

- Any formula, label, or field not defined in this PRD's authority stack
- Consumer migration beyond the Pit Terminal Rundown (migration plan deferred; visual suppression is not deferred)
- Any change to existing `table_buyin_telemetry` producers or write paths

---

## 5. Requirements

### 5.1 Functional Requirements

**FR-1 — Sole formula owner.**
`TableInventoryAccounting` within `TableContextService` is the only location in the codebase where a win/loss-like table result may be computed. No route handler, component, RPC, or dashboard may derive a competing value from raw inventory or telemetry inputs.

**FR-2 — Five-operand formula (telemetry_drop_formula state).**
When `drop_estimate_state = 'present'`:
```
projected_table_win_loss_cents =
  telemetry_derived_drop_estimate_cents
  + closing_inventory_cents
  + credits_cents
  - opening_inventory_cents
  - fills_cents
```
This formula is complete. No additional terms. No COALESCE. No gaming-day fallback.

**FR-3 — Inventory-side derivation (inventory_only state).**
When `drop_estimate_state = 'none_for_session'` and opener+closer are both resolvable:
```
partial_table_result_cents =
  closing_inventory_cents
  + credits_cents
  - opening_inventory_cents
  - fills_cents
```
`partial_table_result_cents` is the inventory-side table result when `telemetry_derived_drop_estimate_cents` is absent; it is not a win/loss formula and not an intermediate value toward `final_table_win_loss_cents`.

**FR-4 — Integrity failure discrimination.**
When `opening_inventory_cents` or `closing_inventory_cents` is null after all resolution paths are exhausted: both result fields are null, `calculation_kind = 'integrity_failure'`, `integrity_issues` is non-empty. Zero opener or closer is a valid explicit count and must not trigger `integrity_failure`.

**FR-5 — Result field exclusivity.**
At most one of `projected_table_win_loss_cents` or `partial_table_result_cents` is non-null per response. `final_table_win_loss_cents` is always null — typed as `null`, not `number | null`.

**FR-6 — Session-scope telemetry predicate.**
`telemetry_derived_drop_estimate_cents` uses exactly the frozen predicate (ADR-061 D2):
```sql
SUM(tbt.amount_cents)
FROM table_buyin_telemetry tbt
WHERE tbt.casino_id     = ts.casino_id
  AND tbt.table_id      = ts.gaming_table_id
  AND tbt.telemetry_kind IN ('RATED_BUYIN', 'GRIND_BUYIN')
  AND tbt.occurred_at  >= ts.opened_at
  AND tbt.occurred_at  <  COALESCE(ts.closed_at, NOW())
```
`rpc_shift_table_metrics` must not be called. Gaming-day scope must not be used. `COALESCE(SUM(...), 0)` is forbidden.

**FR-7 — Custody status invariant.**
`custody_status = 'non_custody_estimate'` always. `completeness.status = 'complete'` never upgrades it.

**FR-8 — Legacy surface suppression.**
When the exemplar lands, `win_loss_inventory_cents`, `win_loss_estimated_cents`, `win_loss_estimated_total_cents`, `estimated_drop_buyins_cents`, and `table_win_cents` must be suppressed (not visible, not deprecated-but-visible) on all active operator-visible surfaces.

Suppression does not require every legacy consumer to migrate to `TableInventoryAccountingProjection` in this slice. A legacy consumer may defer projection consumption only by using `suppress_rendering` or `inactive_or_internal_only_with_reason` per §4.2. Any active operator-visible render path or serialized operator-facing API response that still exposes a forbidden field or label fails FR-8.

### 5.2 Non-Functional Requirements

**NFR-1 — No schema migration required (conditional on WS1 index preflight).** Index `idx_tbt_kind` on `(casino_id, table_id, telemetry_kind, occurred_at)` is asserted to support the session-scope predicate. WS1 must verify its existence before WS2 begins. If verified: no new migration is required for baseline query performance. If absent: EXEC must add a minimal index migration before WS2 begins.

**NFR-2 — No persistence.** `TableInventoryAccounting` is a read-time derivation. It must not write to any table or emit to any outbox. Each call is stateless and side-effect-free.

**NFR-3 — No new bounded context.** `TableInventoryAccounting` is a subdomain of `TableContextService`, not a standalone bounded context.

**NFR-4 — SRL conformance.** All prose, identifiers, DTO fields, and test descriptions in this implementation must pass `scripts/semantic/srl_intake_lint.py` with `hard_fail_count = 0`. Unqualified drop shorthand that omits `telemetry-derived` is a hard lint failure.

**NFR-5 — Consumer render-only.** Surfaces receiving `TableInventoryAccountingProjection` must render `calculation_kind`, `projected_table_win_loss_cents`, and `partial_table_result_cents` as received. No surface-side recomputation from raw fields.

**NFR-6 — Stable open-session upper bound.** For open sessions, the derivation must use one stable upper-bound timestamp per request. Implementations may satisfy this by executing the derivation in one SQL statement/transaction using transaction-stable `NOW()`, or by capturing a single `upperBoundAt` timestamp and reusing it for every query in the derivation. Re-evaluating wall-clock time across multiple service queries in one projection derivation is forbidden.

---

## 6. UX / Flow Overview

### 6.1 Projected Win/Loss path (rated sessions)

1. Pit boss opens Pit Terminal Rundown for an active table session.
2. Rundown calls `GET /api/v1/table-context/table-sessions/{sessionId}/accounting-projection`.
3. Service resolves opener and closer snapshots; telemetry SUM returns a non-null value (`RATED_BUYIN` or `GRIND_BUYIN` rows exist in the session window).
4. `calculation_kind = 'telemetry_drop_formula'`; `projected_table_win_loss_cents` is set.
5. Rundown renders **"Projected Win/Loss: $X,XXX"** with qualifier: *"Includes telemetry-derived drop estimate. Non-custody. Not final."*

### 6.2 Partial Table Result path (unrated/no-telemetry sessions)

1. Same flow; telemetry SUM returns null (zero qualifying rows in the session window).
2. `calculation_kind = 'inventory_only'`; `partial_table_result_cents` is set.
3. Rundown renders **"Partial Table Result: $X,XXX"** with qualifier: *"Telemetry-derived drop estimate not available for this session."*

### 6.3 Integrity failure path (missing snapshot)

1. Service resolves snapshots; opener or closer returns null after both resolution paths are exhausted.
2. `calculation_kind = 'integrity_failure'`; both result fields are null; `integrity_issues` is non-empty.
3. Rundown renders integrity disclosure: *"Table result unavailable — [missing_opening_inventory_snapshot | missing_closing_inventory_snapshot]. Contact your supervisor."* No win/loss or partial label is shown.

### 6.4 Zero opener/closer (valid explicit count)

1. Snapshot exists with `total_cents = 0` (empty tray). Resolution succeeds.
2. Result flows through the normal `inventory_only` or `telemetry_drop_formula` path.
3. No integrity failure is triggered.

---

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Owner |
|---|---|---|
| ADR-059 accepted | CLOSED 2026-05-29 | Lead Architect |
| ADR-060 accepted | CLOSED 2026-05-29 | Lead Architect |
| ADR-061 accepted | CLOSED 2026-05-29 | Lead Architect |
| SRL-TIA-001 admitted to SRL | CLOSED 2026-05-29 | Lead Architect |
| `table_buyin_telemetry` SRM ownership gap | Must be resolved at WS1 (in-PRD preflight) | This PRD |
| `idx_tbt_kind` index | EXISTS — no migration required | (historical) |

### 7.2 Risks

**R1 — First-session opener null (GAP-TIA-5).**
The first `table_session` on a given table has `opening_inventory_snapshot_id = NULL` — no producer exists for a standalone opener at session-open time. The new service's dual-path resolution will route these sessions to `integrity_failure`. This is the correct outcome per the canon; however, it is a new operator-visible signal that did not exist before. The EXEC must define the `integrity_failure` disclosure message for this case and confirm with operations that the fallback display is acceptable.

*Mitigation:* `integrity_failure` with `integrity_issues = ['missing_opening_inventory_snapshot']` is rendered as an informative disclosure, not a blank. The PRD does not require adding a mandatory opener-capture step — that is deferred as a separate investigation.

**R2 — Legacy field suppression consumer impact.**
Suppressing `win_loss_inventory_cents` and `win_loss_estimated_cents` on the shift dashboard may surprise users who relied on those values. These fields are derived from gaming-day scope with forbidden COALESCE — they are wrong, not deprecated — but users do not know that.

*Mitigation:* WS5 must inventory all active surfaces before suppression. The EXEC defines each suppression as `suppress_rendering` (no value shown), `consume_projection` (replaced by canonical value), or `inactive_or_internal_only_with_reason` (deleted, archived, test-only, or internal-only and never returned to an operator-visible boundary). Surfaces where the rundown projection is not yet wired may defer projection consumption only if the legacy value is suppressed from render and serialized operator-facing API responses. They cannot continue showing or returning the legacy value after exemplar landing.

**R3 — `rpc_compute_table_rundown` callsite coupling.**
Existing code in `services/table-context/rundown.ts` calls `rpc_compute_table_rundown` which contains the `table_win_cents` stub. WS4 must replace this entire path with `TableInventoryAccountingProjection` consumption. The legacy RPC must not be called from the exemplar path post-delivery; whether to drop or retain it for non-exemplar callers is an EXEC decision.

*Quarantine constraint:* If retained, the legacy RPC must be quarantined from all active operator-visible, report, export, and API-exposed table-result paths (per §4.1). Retention as dead or internal-only code is allowed only if accompanied by tests proving no active caller consumes `table_win_cents` or any win/loss-like value from it.

### 7.3 Open Questions

| Question | Owner | Resolution target |
|---|---|---|
| Should the EXEC require a mandatory opener-capture step to eliminate first-session `integrity_failure`? | Lead Architect | EXEC-SPEC phase |

The legacy consumer disposition question is closed by §4.2 and `docs/issues/table-inventory-accounting-canon/LEGACY-CONSUMER-DISPOSITION-STRATEGY-PRD-090.md`: non-Rundown active operator-visible surfaces do not need to consume `TableInventoryAccountingProjection` in this slice, but they must not render or serialize forbidden legacy table-result values.

### 7.4 Financial Outbox Posture Clarification

PRD-090 does not implement or modify financial outbox producers, relay behavior, processed-message handling, replay logic, persisted projection stores, projection consumers, or event catalog entries.

PRD-090 is implementation-decoupled from the financial outbox.

However, PRD-090 depends on the stability of source tables whose row presence is shaped by the post-Wave-2 authoring and propagation posture, including:

- `table_buyin_telemetry`
- `table_fill`
- `table_credit`

The required posture check is therefore not an outbox implementation task, but a consumed-input confidence gate.

For this slice, the outbox posture is considered acceptable only if:

- `RATED_BUYIN` and `GRIND_BUYIN` rows are authored and queryable in `table_buyin_telemetry`
- Rated buy-in telemetry reaches `table_buyin_telemetry` through a stable accepted path
- Grind/unrated telemetry authoring is stable
- Fills and credits are queryable by `table_session_id`
- PRD-090 does not need to distinguish `bridge_pending` from `none_for_session` in this slice

PRD-090 must not compensate for unstable source posture by:

- Recomputing `telemetry_derived_drop_estimate_cents` directly from PFT
- Using `rpc_shift_table_metrics`
- Using gaming-day scoped aggregates
- Calling financial outbox relay APIs
- Introducing a persisted projection store
- Inventing `bridge_pending` semantics inside this exemplar

All five posture checks have been evaluated and returned ACCEPTABLE or DEFERRED (by design). See `docs/issues/table-inventory-accounting-canon/prd-090/OUTBOX-SEMANTIC-COMPATABILITY.md` for full evidence.

---

## 8. Definition of Done

The release is **Done** when:

**Functionality**
- [ ] `TableInventoryAccounting` module exists under `TableContextService` and produces `TableInventoryAccountingProjection` for all three result states
- [ ] Five-operand formula matches ADR-059 D2 exactly — no additional terms, no COALESCE
- [ ] Inventory-side derivation is active when `drop_estimate_state = 'none_for_session'` and opener+closer are resolvable
- [ ] Integrity failure produces non-null `integrity_issues` and suppresses both result fields
- [ ] Zero opener/closer does not trigger integrity failure
- [ ] Open sessions use `COALESCE(closed_at, NOW())` as the upper bound for the telemetry SUM

**Data & Integrity**
- [ ] `telemetry_derived_drop_estimate_cents` is derived exclusively from session-scoped `RATED_BUYIN` + `GRIND_BUYIN` rows — no `RATED_ADJUSTMENT`, no `rpc_shift_table_metrics`, no gaming-day scope
- [ ] Null telemetry SUM is preserved as null — no COALESCE to 0 anywhere in the derivation path
- [ ] `final_table_win_loss_cents` is typed as `null` and is always null at runtime
- [ ] `custody_status` is `non_custody_estimate` in every response
- [ ] `source_authority` uses `drop / snapshots / fills / credits` keys (not `inventory`)

**Security & Access**
- [ ] The new route enforces casino-scoped RLS via `set_rls_context_from_staff()` — no spoofable parameters
- [ ] No SECURITY DEFINER function is introduced without `SET search_path = ''` (pre-commit hook enforces)

**Testing**
- [ ] DTO contract test passes (required semantic fields, `source_authority` shape, `final_table_win_loss_cents` always null)
- [ ] Five-operand formula test passes (sign correctness per ADR-059)
- [ ] Inventory-side derivation test passes (`inventory_only` uses 4 operands; absent telemetry-derived drop estimate triggers partial path)
- [ ] Null-vs-zero test passes (zero qualifying rows → null, not 0; null and zero produce distinct `drop_estimate_state`)
- [ ] `RATED_ADJUSTMENT` exclusion test passes
- [ ] Session-scope-only test passes (rows outside session window excluded; same gaming-day but different session excluded)
- [ ] `rpc_shift_table_metrics` exclusion test passes
- [ ] `rpc_compute_table_rundown` exclusion test passes for the exemplar render path
- [ ] `integrity_failure` suppression test passes (both result fields null, `integrity_issues` non-empty)
- [ ] Consumer render-only test passes (Pit Terminal Rundown does not recompute from raw fields)
- [ ] Route tenant-isolation test passes (same `sessionId` from another casino returns no data)
- [ ] Route role matrix test passes (`pit_boss`, `floor_supervisor`, and `admin` allowed; inactive staff denied)
- [ ] Active-surface suppression gate passes (forbidden legacy fields and labels absent from active operator-visible render paths and serialized operator-facing API responses)

**Operational Readiness**
- [ ] `integrity_failure` state surfaces an observable signal in application logs with `session_id`, `casino_id`, `calculation_kind`, `integrity_issues`, and `request_id`
- [ ] Suppressed legacy fields are not rendered on any active operator-visible surface — confirmed via WS5 suppression inventory
- [ ] Operator-facing API responses for suppressed legacy consumers omit forbidden fields, confirmed by route serialization tests
- [x] STOP-004 operational necessity cleared: inapplicable — application is pre-production with no live operator-facing surfaces; suppression cannot disrupt real operational workflows. Sign-off requirement deferred to pre-production launch readiness review. (closed 2026-06-01)
- [ ] Shift report renders a canonical placeholder ("Table win/loss data unavailable during TIA canon migration") in the suppressed Win/Loss section — confirmed in PR review

**Exemplar Proof**
- [ ] All three result states (telemetry_drop_formula, inventory_only, integrity_failure) are exercised in tests under deterministic fixture data (from classification YAML §P.6)
- [ ] Pit Terminal Rundown is confirmed as the first end-to-end canonical consumer
- [ ] Legacy surface suppression gate passes (WS5 exit gate satisfied)

**Documentation**
- [ ] `table_buyin_telemetry` added to `TableContextService` consumed inputs in SRM (WS1 exit gate)
- [ ] SRM no longer marks the `table_buyin_telemetry` consumed-input posture as an unresolved ownership gap
- [ ] `TableInventoryAccountingProjection` DTO is documented at the service boundary
- [ ] PRD added to `docs/INDEX.md`

---

## 9. Related Documents

| Document | Role |
|---|---|
| `docs/issues/table-inventory-accounting-canon/planning/PRD-TIA-CANON-KICKOFF-DIRECTIVE.md` | Primary scope authority — delivery mode, invariants, workstream definitions |
| `docs/issues/table-inventory-accounting-canon/LEGACY-CONSUMER-DISPOSITION-STRATEGY-PRD-090.md` | Binding clarification for non-Rundown legacy consumer dispositions and WS5 suppression semantics |
| `docs/issues/table-inventory-accounting-canon/prd-090/OUTBOX-SEMANTIC-COMPATABILITY.md` | Financial outbox posture evidence — implementation-decoupled, source-stability checks ACCEPTABLE, WS3 conformance note |
| `docs/issues/table-inventory-accounting-canon/PRD-090-REFRACTOR-BLAST-RADIUS-MAP.yaml` | Pre-EXEC containment map — direct scope, blast radius vectors, DA findings, EXEC stop conditions, required preflight outputs |
| `docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml` | Root semantic authority — admitted terms, key semantic laws, disambiguation |
| `docs/80-adrs/ADR-059-table-inventory-accounting-canon-ownership-and-formula.md` | Ownership, frozen formula, DTO minimum contract, three-result-state model |
| `docs/80-adrs/ADR-060-drop-taxonomy-and-naming-standard.md` | Drop vocabulary, telemetry kind enumeration, naming prohibitions, allowed labels |
| `docs/80-adrs/ADR-061-session-scope-aggregation-boundary.md` | Session-scope predicate, null SUM semantics, `rpc_shift_table_metrics` exclusion |
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | SRM — `TableContextService` section (table_buyin_telemetry gap noted at §SRL extension) |
| `docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md` | SRL governance layer — SRL-TIA-001 admission record |
| `docs/issues/table-inventory-accounting-canon/planning/TABLE_INVENTORY_ACCOUNTING_UBIQUITOUS_LANGUAGE_BASELINE.md` | Canonical vocabulary — drop taxonomy, forbidden collapse list, naming rules |
| `docs/issues/table-inventory-accounting-canon/planning/TABLE-INVENTORY-GAP-FINDINGS.md` | Full gap analysis — snapshot producers, formula stub, legacy stream inventory |
| `docs/issues/table-inventory-accounting-canon/split-brain/WIN-LOSS-NEED-SYSTEM-POSTURE-05-26.MD` | Win/loss split-brain posture as of 2026-05-26 |
| `docs/issues/table-inventory-accounting-canon/split-brain/DROP-POSTURE-05-26.md` | Drop terminology posture as of 2026-05-26 |
| `scripts/semantic/srl_intake_lint.py` | Semantic ambiguity preflight scanner — run before any SRL-adjacent artifact review |
| `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` | Service layer patterns (Pattern B) |
| `docs/30-security/SEC-001-rls-policy-matrix.md` | RLS policy matrix — `TableContextService` section |

---

## Appendix A: Implementation Plan

Six workstreams. Each has a declared exit gate. WS1 is a preflight — it must complete before WS2 begins. WS2–WS4 may proceed sequentially. WS5 runs in parallel with WS2–WS4 (inventory can start at any time; suppression commits must be delivered with WS4). WS6 runs continuously alongside WS2–WS4.

### WS1 — SRM / Preflight Closure

Resolve pre-implementation governance blockers.

**Required actions:**
- Confirm ADR-059, ADR-060, ADR-061 status = `Accepted` (DONE as of 2026-05-29).
- Update SRM `TableContextService` owned-tables row to include `table_buyin_telemetry` as a consumed input for `TableInventoryAccounting.telemetry_derived_drop_estimate_cents`.
- Confirm `TableInventoryAccounting` is a subdomain of `TableContextService` — not a standalone bounded context.
- **Index preflight:** Verify `idx_tbt_kind` on `(casino_id, table_id, telemetry_kind, occurred_at)` exists (or an equivalent covering index with the same leading columns). If absent or non-covering, the EXEC must add a minimal index migration before WS2 implementation begins. The no-migration-required posture in NFR-1 depends on this verification passing.
- **Financial outbox posture:** Confirm that no outbox schema, producer, relay, replay, or event-catalog changes are required for PRD-090; and that source-table stability checks for `table_buyin_telemetry`, `table_fill`, and `table_credit` have passed (see §7.4 and `docs/issues/table-inventory-accounting-canon/prd-090/OUTBOX-SEMANTIC-COMPATABILITY.md`).

**Exit gate:**
```yaml
WS1_exit_gate:
  adr_status: accepted                        # all three ADRs
  table_buyin_telemetry_ownership_gap: resolved_in_srm
  no_new_bounded_context: true
  idx_tbt_kind_verified_or_equivalent: true   # fail = EXEC must add index migration
  financial_outbox_posture:
    implementation_decoupled: true
    source_stability_dependency_satisfied: true
    outbox_changes_required: false
  no_live_pre_prd038_session_exists: true
    # Verify: SELECT COUNT(*) FROM table_session
    #   WHERE opened_at < '2026-02-24'
    #   AND (closed_at IS NULL OR closed_at > NOW() - INTERVAL '1 day');
    # Expected: 0. If non-zero: block WS2 and escalate.
    # Rationale: table_fill/table_credit.session_id added in PRD-038 migration
    # (20260224123748). Rows without session_id are excluded from session-scoped
    # SUM. Pre-PRD-038 sessions cannot be detected at runtime without violating
    # ADR-061 session-scope predicate. Guard is a one-time deployment verification.
```

---

### WS2 — TableInventoryAccounting Read-Time Derivation

**Target file:** `services/table-context/table-inventory-accounting.ts`
(single file first; extract to a folder only if a second file becomes necessary)

**Required items:**
- Accept `table_session_id`; resolve `table_session` row (casino_id, gaming_table_id, opened_at, closed_at).
- Resolve opener FK-first: `table_session.opening_inventory_snapshot_id → COALESCE(table_inventory_snapshot.total_cents::bigint, chipset_total_cents(table_inventory_snapshot.chipset))`; fallback: latest `table_inventory_snapshot` where `session_id = table_session.id` and `snapshot_type = 'open'`. Null from COALESCE after both paths exhausted → `integrity_failure`. A null `total_cents` column alone does not trigger `integrity_failure` — the chipset fallback must be attempted first. Stale-FK rule: if the FK-resolved snapshot has `session_id` set and it does not match `table_session.id`, treat the FK as stale and fall through to the session-linked fallback without returning the stale result. A snapshot with `session_id IS NULL` (authored before PRD-038 added the column) is also treated as stale and falls through to the session-linked fallback. The WS1 gate `no_live_pre_prd038_session_exists` prevents this case in production; the implementation must not rely solely on the deployment guard.
- Resolve closer FK-first: `table_session.closing_inventory_snapshot_id → COALESCE(table_inventory_snapshot.total_cents::bigint, chipset_total_cents(table_inventory_snapshot.chipset))`; fallback: latest `table_inventory_snapshot` where `session_id = table_session.id` and `snapshot_type = 'close'`. Null from COALESCE after both paths exhausted → `integrity_failure`. A null `total_cents` column alone does not trigger `integrity_failure`. Stale-FK rule applies identically — both the `session_id` mismatch case and the `session_id IS NULL` (pre-PRD-038) case fall through to the session-linked fallback.
- Resolve fills: `COALESCE(SUM(table_fill.amount_cents), 0)` where `table_fill.session_id = table_session.id`. Zero fills is a valid count; COALESCE to 0 is required and semantically distinct from the telemetry null-preservation rule. `table_session.fills_total_cents` must not be used — it is an informational MVP aggregate without canonical formula authority. Known historical coverage limit: rows authored before PRD-038 (2026-02-24) may have `session_id = NULL` and are excluded from this SUM; see WS1 exit gate `no_live_pre_prd038_session_exists`.
- Resolve credits: `COALESCE(SUM(table_credit.amount_cents), 0)` where `table_credit.session_id = table_session.id`. Same rule as fills.
- Compute `telemetry_derived_drop_estimate_cents` using frozen session-scope predicate (ADR-061 D2). Preserve null from zero-row SUM — no COALESCE.
- For open sessions, evaluate `COALESCE(closed_at, NOW())` once per derivation by using one SQL statement/transaction or one captured `upperBoundAt` timestamp across all service queries.
- Apply three-result-state logic.
- Return `TableInventoryAccountingProjection`.
- No writes. No outbox. No side effects.

**Exit gate:**
```yaml
WS2_exit_gate:
  projection_generated_by_service_only: true
  snapshot_resolution_uses_actual_snapshot_type_values: true
  open_session_upper_bound_stable_per_request: true
  no_persistence: true
  no_side_effects: true
  no_consumer_recomputation: true
  no_integer_cast_in_snapshot_resolution: true    # COALESCE(total_cents::bigint, chipset_total_cents()) — no ::integer downcast
  fills_credits_source_predicate_declared: true   # session-scoped SUM on table_fill/table_credit; COALESCE to 0
  stale_fk_fallthrough_rule_implemented: true     # FK snapshot with mismatched session_id OR session_id IS NULL falls through to session-linked fallback
```

---

### WS3 — API / BFF Boundary

**Target route:** `GET /api/v1/table-context/table-sessions/{sessionId}/accounting-projection`

**Required items:**
- Route handler calls `TableInventoryAccounting` service.
- Returns `TableInventoryAccountingProjection` serialized to JSON.
- No formula logic in the route handler.
- No call to `rpc_shift_table_metrics`.
- RLS context derived from JWT via `set_rls_context_from_staff()` — no spoofable parameters.
- Route accepts no `casino_id`, `actor_id`, or role parameters.
- Route authorizes read access for `pit_boss`, `floor_supervisor`, and `admin`; inactive staff are denied by authoritative context derivation.
- `table_session` query in the service includes `casino_id = current_setting('app.casino_id')::uuid` as an explicit predicate in addition to RLS (defense-in-depth per ADR-015 Pattern C). Cross-casino `sessionId` returns HTTP 404, not `200 { calculation_kind: 'integrity_failure' }`.

**Exit gate:**
```yaml
WS3_exit_gate:
  api_returns_projection: true
  route_local_formula: false
  rpc_shift_table_metrics_used: false
  no_spoofable_identity_params: true
  route_role_matrix_verified: true
  tenant_isolation_verified: true
  explicit_casino_id_predicate_in_query: true  # defense-in-depth; not RLS-only
  cross_casino_response_is_404: true           # not integrity_failure
```

---

### WS4 — Pit Terminal Rundown Exemplar Wiring

**Required items:**
- Replace `table_win_cents` stub and `rpc_compute_table_rundown` local formula with `TableInventoryAccountingProjection` consumption via the WS3 route.
- Render based on `calculation_kind`:
  - `telemetry_drop_formula` → **"Projected Win/Loss"** + qualifier: *"Includes telemetry-derived drop estimate. Non-custody. Not final."*
  - `inventory_only` → **"Partial Table Result"** + qualifier: *"Telemetry-derived drop estimate not available for this session."*
  - `integrity_failure` → integrity disclosure only; neither result label rendered.
- Forbidden labels that must not appear: "Win/Loss" (unqualified), "Final Win/Loss", "Estimated Win/Loss", "Total Drop", "Posted Drop", "Settled Result", "Reconciled Result".

**Exit gate:**
```yaml
WS4_exit_gate:
  pit_terminal_rundown_consumes_projection: true
  local_formula_removed: true
  forbidden_labels_absent: true
```

---

### WS5 — Legacy Alias Suppression Inventory

Inventory all active operator-visible surfaces and API fields using legacy table-result semantics. Classify each:

```yaml
disposition_options:
  - consume_projection                    # replace with canonical projection
  - suppress_rendering                    # hide value; field may remain in internal DTO only if not serialized operator-facing
  - inactive_or_internal_only_with_reason # deleted, archived, test-only, or internal-only and never operator-visible
```

**`consume_projection` is required when:**
- The consumer is the Pit Terminal Rundown exemplar path.
- The surface remains active and must continue showing a table-result value in this slice.

**`suppress_rendering` is permitted only when:**
- The surface does not yet consume the projection.
- The forbidden field or label is removed from the active operator-visible render path.
- Any backing DTO/API field is either not serialized to an operator-facing boundary or is removed from that boundary.
- A named follow-up ticket is filed when full migration remains necessary.

**`inactive_or_internal_only_with_reason` is permitted only when:**
- The surface is deleted, archived, test-only, or internal-only per §4.1.
- The field is never returned to an active operator-visible boundary.

**`inactive_or_internal_only_with_reason` is forbidden when:**
- An active operator-visible surface continues rendering or serializing the legacy value. Labeling it "deprecated" while still displaying or returning it is not suppression.

**Required inventory artifact:**
- The EXEC must check in `docs/issues/table-inventory-accounting-canon/PRD-090-WS5-legacy-consumer-suppression-inventory.md` listing every legacy consumer, file/path or API boundary, disposition, reason, follow-up ticket if applicable, and verification evidence.
- The inventory must include active UI routes, reports, PDF templates, CSV/export paths, API routes, route DTOs, and any v2/v3 dashboard components that are reachable by pilot or operator workflows.

**Automated suppression gate:**
- Add a grep/test gate that fails if active operator-visible code or serialized operator-facing API responses contain forbidden legacy render fields or labels after WS5.
- Add route serialization tests for `/api/v1/shift-dashboards/metrics/tables`, `/api/v1/shift-dashboards/metrics/pits`, and `/api/v1/shift-dashboards/metrics/casino` proving forbidden fields are absent from operator-facing JSON after suppression.

**Minimum search targets:**

| Legacy name | Expected disposition |
|---|---|
| `win_loss_inventory_cents` | suppress_rendering (shift dashboard) |
| `win_loss_estimated_cents` | suppress_rendering (shift dashboard) |
| `win_loss_estimated_total_cents` | suppress_rendering (casino shift metrics) |
| `estimated_drop_buyins_cents` | suppress_rendering and suppress_serialization (ShiftTableMetricsDTO/operator-facing API responses) |
| `table_win_cents` | consume_TableInventoryAccountingProjection (Rundown — done in WS4) |
| `source_authority.inventory` | delete (non-canonical key deleted by ADR-060 D3) |
| `"Estimated Win/Loss"` (label) | suppress_rendering |
| `"Win/Loss"` (unqualified label) | suppress_rendering |

**Exit gate:**
```yaml
WS5_exit_gate:
  active_surface_inventory_complete: true
  inventory_artifact_checked_in: true
  shift_metric_operator_api_serialization_suppressed: true
  no_competing_active_formula_survives: true
  no_forbidden_surface_label_survives: true
  no_forbidden_serialized_api_field_survives: true
  automated_suppression_gate_passes: true
  type_check_passes_after_legacy_api_001: true    # npm run type-check must pass after ShiftTableMetricsDTO field removal — provenance.ts build-break obligation (LEGACY-CONSUMERS-CLASSIFICATION-MAPPING.yaml exec_note)
```

---

### WS6 — Test and Enforcement Harness

**Required tests** (all must pass before certification):

| Test ID | What it proves |
|---|---|
| `tia.dto_contract` | Required semantic fields present; `source_authority` uses drop/snapshots/fills/credits; `final_table_win_loss_cents` always null |
| `tia.five_operand_formula` | Projected formula signs match ADR-059; no alternate formula path |
| `tia.inventory_side_derivation` | `inventory_only` uses 4 operands; absent telemetry-derived drop estimate produces `partial_table_result_cents` |
| `tia.snapshot_resolution` | FK-first opener/closer resolution works; session-linked fallback queries `snapshot_type = 'open'` (opener) and `snapshot_type = 'close'` (closer) only — `OPENING`/`CLOSING` must not appear in any generated query (schema CHECK constraint prohibits those values); never queries nonexistent `snapshot_kind`; a snapshot with `total_cents IS NULL` and a non-empty `chipset` resolves to a non-null cents value via `chipset_total_cents()` fallback and does not trigger `integrity_failure`; stale-FK fallthrough: a snapshot with non-null `session_id` mismatching the current session falls through to session-linked fallback; a snapshot with `session_id IS NULL` (pre-PRD-038) also falls through — both verified with distinct fixtures; high-value chipset fixture (≥ 2,147,483,648 cents, exceeding `INT_MAX`) resolves correctly via `chipset_total_cents()::bigint` without overflow |
| `tia.null_vs_zero` | Zero qualifying rows → null; qualifying rows summing to 0 → 0; distinct `drop_estimate_state` |
| `tia.rated_adjustment_exclusion` | `RATED_ADJUSTMENT` rows do not affect `telemetry_derived_drop_estimate_cents` |
| `tia.session_scope_only` | Rows outside session window excluded; same gaming-day but outside session excluded; open session uses one stable NOW()/captured upper bound per derivation |
| `tia.rpc_exclusion` | `TableInventoryAccounting` does not call or wrap `rpc_shift_table_metrics`; Pit Terminal Rundown exemplar path does not call `rpc_compute_table_rundown` |
| `tia.integrity_failure_suppression` | Missing opener or closer sets `integrity_failure`; both result fields null; no result label rendered |
| `tia.consumer_render_only` | Pit Terminal Rundown does not recompute from raw fields; active surface suppression gate passes |
| `tia.route_tenant_isolation` | Cross-casino `sessionId` access returns no projection data |
| `tia.route_role_matrix` | `pit_boss`, `floor_supervisor`, and `admin` can read projections; inactive staff cannot |
| `tia.active_surface_suppression_gate` | Forbidden legacy fields and labels are absent from active operator-visible render paths and serialized operator-facing API responses |
| `tia.shift_metric_api_suppression` | Shift table/pit/casino metric API responses omit `win_loss_inventory_cents`, `win_loss_estimated_cents`, `win_loss_estimated_total_cents`, `estimated_drop_buyins_cents`, and equivalent forbidden aliases after suppression |
| `tia.snapshot_resolution_zero_tray` | Snapshot with `total_cents = 0` resolves as zero-tray (not `integrity_failure`); `calculation_kind = 'inventory_only'`, `opening_inventory_cents = 0`, `closing_inventory_cents = 0` |
| `tia.integrity_failure_log_emission` | mock the application logger, invoke service with a missing opener fixture; assert mock was called with all five fields: `session_id`, `casino_id`, `calculation_kind`, `integrity_issues`, `request_id` — enforces ADR-059 D5 observability requirement in CI without relying on stdout scraping |
| `tia.route_tenant_isolation_404` | Cross-casino `sessionId` returns HTTP 404, not `200 { calculation_kind: 'integrity_failure' }` — information-leak prevention |
| `tia.route_role_matrix_cross_casino` | `admin` JWT from Casino A + Casino B `sessionId` → 404; `admin` from Casino A + own-casino `sessionId` → 200 |
| `tia.rpc_compute_table_rundown_fate` | EXEC commits to drop-or-quarantine before WS6 sign-off: if dropped, migration is the proof; if quarantined, grep test proves no active operator path calls `rpc_compute_table_rundown` |

**Exit gate:**
```yaml
WS6_exit_gate:
  all_required_tests_pass: true
  no_semantic_regression: true
```

---

## Appendix B: Canonical DTO Minimum Contract

As specified in ADR-059 D3 (amended by ADR-060 D3). The EXEC may add identity and raw echo fields but must not remove or weaken these semantic fields.

```ts
interface TableInventoryAccountingProjection {
  // Result fields — at most one non-null per response
  projected_table_win_loss_cents:  number | null   // non-null only when calculation_kind = 'telemetry_drop_formula'
  partial_table_result_cents:       number | null   // non-null only when calculation_kind = 'inventory_only'
  final_table_win_loss_cents:       null             // always null in this slice; typed as null

  // Raw telemetry fact (never rendered directly on surfaces)
  telemetry_derived_drop_estimate_cents: number | null

  // Raw inventory inputs (echo for auditability; consumers must not re-derive results from these)
  // Nullability constraint: null only when calculation_kind = 'integrity_failure' (see note below)
  opening_inventory_cents: number | null
  closing_inventory_cents: number | null
  fills_cents:    number  // COALESCE(SUM(table_fill.amount_cents), 0) — zero fills is a valid count; null SUM must not pass through
  credits_cents:  number  // COALESCE(SUM(table_credit.amount_cents), 0) — same rule; semantically distinct from telemetry null-preservation

  // Discriminator
  drop_estimate_state: 'present' | 'none_for_session'

  // Calculation discriminator and completeness envelope
  calculation_kind: 'telemetry_drop_formula' | 'inventory_only' | 'integrity_failure'
  completeness: {
    included_inputs: ReadonlyArray<
      | 'opening_inventory'
      | 'closing_inventory'
      | 'fills'
      | 'credits'
      | 'telemetry_drop_estimate'
    >
    missing_inputs: ReadonlyArray<'drop_estimate'>  // only valid normal missing input
    status: 'complete' | 'partial' | 'integrity_failure'
  }
  integrity_issues: string[]  // empty when calculation_kind !== 'integrity_failure'

  // Authority envelope
  custody_status: 'non_custody_estimate'  // always in this slice; never upgraded
  source_authority: {
    drop:      'telemetry_derived_estimate' | 'none'
    snapshots: 'table_inventory_snapshot'   // opener and closer only
    fills:     'table_fill'
    credits:   'table_credit'
  }
}
```

**Inventory echo field nullability constraints:**

| Field | Null when | Non-null when |
|---|---|---|
| `opening_inventory_cents` | `calculation_kind = 'integrity_failure'` AND `integrity_issues` includes `'missing_opening_inventory_snapshot'` | `telemetry_drop_formula` or `inventory_only` — must be a number; zero is valid |
| `closing_inventory_cents` | `calculation_kind = 'integrity_failure'` AND `integrity_issues` includes `'missing_closing_inventory_snapshot'` | `telemetry_drop_formula` or `inventory_only` — must be a number; zero is valid |

In `telemetry_drop_formula` and `inventory_only` states both inventory echo fields must be numbers. A null in either field outside `integrity_failure` is an implementation error.

---

## Appendix C: Semantic Invariant Summary

| Invariant | Rule | Authority |
|---|---|---|
| `at_most_one_result_field_non_null` | At most one of `projected_table_win_loss_cents`, `partial_table_result_cents` non-null; `final_table_win_loss_cents` always null | L1 / ADR-059 D5 |
| `drop_estimate_state_null_is_not_zero` | `'present'` iff `telemetry_derived_drop_estimate_cents` non-null (including 0). Null ≠ zero — never COALESCE | L2 / ADR-061 D6 |
| `integrity_failure_suppresses_result_labels` | `integrity_failure` implies both result fields null, `integrity_issues` non-empty, no result label rendered | L3 / ADR-059 D5 |
| `custody_status_permanent` | `custody_status = 'non_custody_estimate'` always; `completeness.status = 'complete'` never upgrades it | L4 / ADR-059 D3 |
| `consumers_render_only` | No surface, RPC, or component derives its own table win/loss-like value from raw inputs | L5 / ADR-059 D3 |
| `no_unqualified_drop_shorthand` | All prose and identifiers use `telemetry_derived_drop_estimate_cents` or "telemetry-derived drop estimate" | L6 / SRL-TIA-001 |

---

## Appendix D: Version History

| Version | Date | Author | Changes |
|---|---|---|---|
| v0 | 2026-05-29 | Lead Architect | Initial draft |
| v1 | 2026-05-29 | Lead Architect | DA patch PRD090-DA-001: P0 drop shorthand eliminated (7 sites); FR-3 renamed to Inventory-side derivation; tia.partial_formula → tia.inventory_side_derivation; §4.1 suppression boundary definition added; WS5 outside_exemplar_boundary_with_reason hardened; R3 quarantine constraint added; Appendix B inventory echo nullability constraints added; WS1 index preflight added; NFR-1 conditioned on WS1 verification |
| v2 | 2026-05-30 | Lead Architect | DA patch PRD090-DA-002: ADR-059/060/061 Accepted verified; legacy consumer disposition strategy folded in; `outside_exemplar_boundary_with_reason` replaced with `inactive_or_internal_only_with_reason`; WS5 inventory artifact and automated suppression gate required; WS3 route auth/tenant tests added; `rpc_compute_table_rundown` exemplar exclusion, route role matrix, active-surface suppression, serialized API suppression, and structured integrity logging gates added |
| v3 | 2026-05-30 | Lead Architect | DA patch PRD090-DA-003: Snapshot resolution corrected to actual `table_inventory_snapshot.snapshot_type` values; stable open-session upper-bound requirement added; WS5 inventory artifact path fixed; active API serialization suppression and route tests added for shift metric legacy fields; SRM ownership gap closed in companion patch |
| v4 | 2026-05-30 | Lead Architect | DA patch PRD090-DA-004 (P0 remediation): WS2 snapshot value changed from `total_cents` direct read to `COALESCE(total_cents, chipset_total_cents(chipset)::integer)` — `total_cents` is nullable (added in ADR-027 migration with no DEFAULT); null `total_cents` alone must not trigger `integrity_failure`; fallback `snapshot_type` predicates corrected from `IN ('open', 'OPENING')` / `IN ('close', 'CLOSING')` to `= 'open'` / `= 'close'` — `OPENING`/`CLOSING` are prohibited by the schema CHECK constraint and can never exist; `tia.snapshot_resolution` test updated to assert absence of uppercase variants and presence of chipset fallback |
| v5 | 2026-06-01 | Lead Architect | Add §7.4 Financial Outbox Posture Clarification — encodes that PRD-090 is implementation-decoupled from the financial outbox but source-stability dependent; adds prohibited compensation list; references OUTBOX-SEMANTIC-COMPATABILITY.md; adds WS1 required action and `financial_outbox_posture` exit gate entry; adds reference in §9 |
| v6 | 2026-06-01 | Lead Architect | DA patch PRD090-DA-006 (P0 remediation): WS2 snapshot COALESCE promoted to `COALESCE(total_cents::bigint, chipset_total_cents())` — no unsafe `::integer` downcast; fills/credits source declared as session-scoped SUM on `table_fill`/`table_credit` with COALESCE to 0; `table_session.fills_total_cents` rejected as canonical source; stale-FK fallthrough rule added to opener/closer resolution; WS3 defense-in-depth `casino_id` explicit predicate required; cross-casino `sessionId` response specified as HTTP 404; WS1 exit gate `no_live_pre_prd038_session_exists` added; WS2 exit gate three items added; WS3 exit gate two items added; WS6 seven test IDs added; Appendix B fills/credits COALESCE semantics documented |
| v7 | 2026-06-01 | Lead Architect | DA patch PRD090-DA-007 (governance hardening): stale-FK rule extended to cover `session_id IS NULL` (pre-PRD-038) snapshots on both opener and closer resolution paths; WS2 exit gate comment updated to reflect null case; WS5 exit gate adds `type_check_passes_after_legacy_api_001: true`; `tia.snapshot_resolution` test description extended with stale-FK-null fixture, stale-FK-mismatch fixture, and high-value ($1M+) chipset bigint fixture; `tia.integrity_failure_log_emission` test specifies logger-mock mechanism (mock app logger, assert on mock call — no stdout scraping); §8 DoD Operational Readiness adds STOP-004 sign-off item and shift report canonical placeholder item; status promoted from `Draft` to `exec_authorized`; `patch_delta` updated to DA-007 |
