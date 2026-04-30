# FIB-H — Financial Telemetry Phase 1.2B-A — Service Canonicalization (STRICT)

status: DRAFT
date: 2026-04-30
owner: Financial Telemetry (Cross-context)

predecessor_fib: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-2-API-ENVELOPE.md
predecessor_phase: Phase 1.2A (API Transport Stabilization — EXEC-071, closed 2026-04-30)
scope_review: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b/phase-scope-containment.md

parent:
- PRD-074 — Financial Telemetry Wave 1 Phase 1.2B-A (Service Canonicalization — STRICT)
- PRD-071 Appendix D — Deferred scope register
- ROLLOUT-ROADMAP.md §3 Phase 1.2B
- ROLLOUT-TRACKER.json cursor.active_phase = "1.2B"

successor_slice: Phase 1.2B-B — Surface Alignment (UI migration + full OpenAPI expansion + full test matrices + runtime observability). Requires its own PRD + FIB pair after Phase 1.2B-A exit gate passes.

**Scope containment note:** A scope review (`phase-scope-containment.md`) identified that the original Phase 1.2B bundled canonicalization (cause) with surface alignment (consequences) into a single slice — the same failure pattern as PRD-070. This FIB governs **Phase 1.2B-A only**. Phase 1.2B-B is a distinct successor slice with its own PRD and FIB pair.

**Tracker discrepancy note:** `ROLLOUT-TRACKER.json pending_scope` lists component tests under Phase 1.2B. PRD-071 Appendix D and DEF-006 classify them as Phase 1.3. This FIB follows PRD-071 — component test birth is Phase 1.3.

---

# Scope Guardrail Block

**Governance reference:** `docs/70-governance/FIB_GENERATION_SCOPE_GUARDRAIL.md`

**One-line boundary:**  
This FIB changes service-layer financial semantics and DTO outbound validation; it does not align UI, expand route inventory, add observability, or build enforcement matrices.

**Primary change class:** Semantics

**Primary layer:** Service/Data

**Secondary layers allowed:**
- API contract artifact: pass-through documentation updates only for named existing OpenAPI path entries
- Enforcement artifact: focused assertion updates only in named existing Phase 1.2A route test files
- Governance artifact: `ROLLOUT-TRACKER.json` status updates only

Secondary layers may not add route logic, new OpenAPI path entries, new test files, new test matrices, UI changes, or runtime logging.

Secondary layer updates must be strictly shape-alignment to existing fields. No new fields, scenarios, coverage patterns, paths, schemas, or components may be introduced.

**Coverage mode:** Representative

Concrete in-scope service/data surfaces:
- `services/visit/crud.ts`
- `services/rating-slip/mappers.ts`
- `services/shift-intelligence/mappers.ts`
- `services/shift-intelligence/dtos.ts`

Concrete in-scope OpenAPI path entries:
- `GET /visits/{visit_id}/live-view`
- `GET /players/{player_id}/recent-sessions`
- `GET /shift-intelligence/anomaly-alerts`

Concrete in-scope route test files:
- `app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts`
- `app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts`

`GET /api/v1/shift-intelligence/alerts` may receive service DTO changes through `ShiftAlertDTO`, but Phase 1.2B-A may not birth a new OpenAPI path entry or route test for it unless a Phase 1.2A-authored path/test already exists. If EXEC-074 discovers additional Phase 1.2A-covered route surfaces, this FIB must be amended before touching them.

**Cross-class leakage ruling:**  
OpenAPI and route-test updates are permitted only because shipping the canonicalized service contract while leaving already-covered public contracts/test assertions stale would create an internally inconsistent and misleading slice. They are not full API expansion or enforcement work.

**OpenAPI kill-switch:**  
OpenAPI updates must not modify any paths, schemas, or components outside the explicitly named path entries, even if nearby inconsistencies are observed. Those findings go to Phase 1.2B-B or require FIB amendment.

**Shift-intelligence compensation guardrail:**  
Any discrepancy in `resolveShiftMetricAuthority` mapping or shift-intelligence `FinancialValue` construction must be resolved in service mappers and DTO schemas only. Route-level or UI-level compensation is prohibited.

**Atomicity test:**
- Ships without deferred work: yes. UI migration, full OpenAPI expansion, route matrix coverage, runtime observability, and component tests can wait for successor slices.
- Deferred work follows without rewrite: yes. Phase 1.2B-B consumes integer-cents DTOs and named contract updates without changing the service canonicalization boundary.
- Shipped contract remains truthful: yes, because only already-covered public contract/test surfaces are updated to match the new service semantics.

**Adjacent consequence ledger:**

| Temptation removed from MUST | Why adjacent | Disposition |
|------------------------------|--------------|-------------|
| UI `formatDollars` to `formatCents` migration | Integer cents make render migration necessary next | Phase 1.2B-B |
| Full 28-route OpenAPI expansion | Contract expansion becomes easier after DTO meaning stabilizes | Phase 1.2B-B |
| Full route test matrices | Enforcement belongs after stable semantics and surface alignment | Phase 1.2B-B / Phase 1.4 |
| Runtime deprecation observability | Logs observe a stable route contract, not the service mapper change itself | Phase 1.2B-B |

**Diff-size sanity check:**  
Expected logic-bearing files: 4 service/data files plus the authorized mechanical compatibility touch in `components/shift-intelligence/anomaly-alert-card.tsx`. Expected secondary artifact files: OpenAPI spec, two existing BRIDGE-001 route test files, one existing anomaly-alerts boundary test, and rollout tracker. Expected directory boundaries exceed one, so EXEC-074 must keep non-service files pass-through only and split if any secondary artifact requires new route inventory, new scenarios, styling/layout changes, or broad UI migration.

**Stop condition:**  
If implementation requires new test files, new OpenAPI paths, UI component edits, route-level compensation, or OpenAPI/schema/component changes outside the named entries, execution must stop and this FIB must be split or amended before proceeding.

**Mechanical Compatibility Exception (Amendment — 2026-04-30):**  
A limited exception is allowed for downstream consumers when a Phase 1.2B-A change alters the shape of an existing field but not its meaning.

Allowed:
- direct property access updates (e.g., `x.toFixed()` → `x.value.toFixed()`)
- null-safe access adjustments driven solely by the upstream shape change
- metric-type-aware property access where the same promoted field is intentionally discriminated (`FinancialValue | null` for financial metrics, bare `number | null` for `hold_percent`)
- no-op destructuring changes

Constraints:
- must not introduce new business logic, formatting rules, or UI behavior
- any branching must be limited to the existing metric-type discriminant and only to choose between `.value` and bare-number access
- must not expand beyond components directly consuming the affected fields
- must not modify styling, layout, or rendering semantics
- must remain a one-to-one mechanical adaptation of the upstream shape change

If the change requires interpretation, transformation, or new logic → STOP and defer to Phase 1.2B-B.

Authorized instance: `components/shift-intelligence/anomaly-alert-card.tsx` — `baselineMedian` and `baselineMad` display must read `FinancialValue.value` for `drop_total`, `win_loss_cents`, and `cash_obs_total`, and must keep bare-number access for `hold_percent`. Existing null-guards (`!= null`) remain in place. Formatting precision, labels, styling, and layout must not change.

---

# A. Identity

**Feature Name:**
Phase 1.2B-A — Service Canonicalization (STRICT)

**Intent:**
Remove `/100` from the two BRIDGE-001 mapper sites; enforce integer-cents Zod validation at DTO outbound; promote `AnomalyAlertDTO` and `ShiftAlertDTO` deferred numeric fields to `FinancialValue` via the `resolveShiftMetricAuthority` routing already in place. Update only the named existing OpenAPI path entries and route test files in the Scope Guardrail Block, plus the authorized mechanical compatibility touch in `anomaly-alert-card.tsx` — no new route expansion, broad UI migration, or observability wiring.

The phase produces a canonicalized service layer that 1.2B-B can align surfaces against. It does not attempt to align those surfaces itself.

---

# B. Operator Problem

Phase 1.2A confirmed routes are honest pass-through but left two structural service-layer gaps:

1. **BRIDGE-001 — dollar-float values at canonical financial boundaries.** `services/visit/crud.ts` and `services/rating-slip/mappers.ts` divide DB integer cents by 100 before wrapping in `FinancialValue`. The DB stores integer cents; the service layer converts to dollar-floats; every consumer pays the inconsistency. Until removed, `financialValueSchema.int()` cannot be enforced, and the wire carries a unit lie that is documented but unresolved.

2. **Shift-intelligence deferred fields — bare numbers where `FinancialValue` belongs.** `AnomalyAlertDTO` and `ShiftAlertDTO` public numeric fields are bare `number | null`. `resolveShiftMetricAuthority` is already called in both mappers — as a void validation step, return value discarded. The routing is correct; the assignment is missing. Phase 1.2B-A converts the void-read to actual FinancialValue construction.

These are both service-layer gaps. They have no UI dependency, no OpenAPI dependency, and no observability dependency. Fixing them does not require touching any of those layers.

---

# C. Pilot Fit

This phase is REQUIRED because:

- BRIDGE-001 retirement unblocks Phase 1.2B-B's UI migration — `formatCents` must render integer cents, and integer cents must be confirmed at the mapper first.
- Shift-intelligence DTO promotion unblocks Phase 1.2B-B's OpenAPI expansion for shift-intelligence routes and Phase 1.3's anomaly-alert UI rendering with authority labels.
- Both changes are pure service-layer work — no cross-layer coupling, no discovery risk, no visual regression surface.

It does NOT require: broad UI changes, new route coverage, observability wiring, or component tests. The only UI-adjacent exception is the authorized metric-type-aware property access in `anomaly-alert-card.tsx`.

---

# D. Actor / Moment

**Actors:**
- Backend engineers modifying `services/visit/crud.ts`, `services/rating-slip/mappers.ts`, `services/shift-intelligence/mappers.ts`, `services/shift-intelligence/dtos.ts`

**Moments:**
- Service mapper returns `FinancialValue.value` as integer cents — no `/100` applied
- `financialValueSchema.int()` rejects fractional numeric values at DTO outbound; exact-value mapper/route assertions enforce cents-unit semantics
- `AnomalyAlertDTO` / `ShiftAlertDTO` fields carry `FinancialValue` objects for financial metric types — mapper constructs them from `resolveShiftMetricAuthority` return value
- Integer-value assertions replace key-presence-only assertions in the named existing Phase 1.2A route test files — CI fails on `/100` regression

---

# E. Containment Loop

## Entry

- Phase 1.2A exit gate passed (2026-04-30, EXEC-071, commit `46229a98`)
- BRIDGE-001 active: `services/visit/crud.ts` `centsToDollars` helper divides by 100 (~lines 527–545); `services/rating-slip/mappers.ts` `toVisitLiveViewDTO` divides by 100 (~lines 340–368)
- `mapAnomalyAlertRow` and `mapShiftAlertRow`: `void resolveShiftMetricAuthority(row.metric_type)` — return value discarded; fields assigned as bare numbers
- Named Phase 1.2A representative path entries: OpenAPI documents BRIDGE-001 as `value: number` and shift-intelligence as bare `number | null` — accurate for Phase 1.2A state, stale after 1.2B-A

## Transformation

1. **BRIDGE-001 retirement (service layer)**
   - Remove `/100` from `centsToDollars` in `services/visit/crud.ts`
   - Remove `/100` from `toVisitLiveViewDTO` in `services/rating-slip/mappers.ts`
   - Enable `financialValueSchema.int()` at DTO outbound boundary for `RecentSessionDTO` / `VisitLiveViewDTO`
   - Ordering enforced: `/100` removal precedes `int()` enforcement

2. **Shift-intelligence DTO type promotion (mapper layer)**
   - Promote `resolveShiftMetricAuthority` void-reads to active `FinancialValue` construction in `mapAnomalyAlertRow` and `mapShiftAlertRow`
   - Update `AnomalyAlertDTO` / `ShiftAlertDTO` type signatures per Q-1/Q-2 EXEC-SPEC resolution
   - Introduce outbound Zod schemas for both DTOs (DEF-007 waiver lifted)
   - `hold_percent` remains bare `number | null` — DEF-NEVER

3. **Minimal alignment on named existing contract/test artifacts**
   - Update OpenAPI only for the named path entries in the Scope Guardrail Block: BRIDGE-001 routes `value: number → integer`; shift-intelligence anomaly-alert fields bare `number | null → FinancialValue`
   - Update the named Phase 1.2A BRIDGE-001 route test files: replace key-presence-only assertions with integer-value assertions
   - Do not birth new shift-intelligence route test files in Phase 1.2B-A; replacing the stale DEC-5 assertion in the existing anomaly-alerts boundary test is allowed
   - `ROLLOUT-TRACKER.json`: DEF-001, DEF-002, DEF-003, DEF-007 closed; BRIDGE-001 `status: "retired"` with commit SHA

## Exit

- `FinancialValue.value` is integer cents for all `RecentSessionDTO` and `VisitLiveViewDTO` financial fields — no `/100` in any mapper
- `financialValueSchema.int()` enforces integer shape at DTO outbound; fractional numeric values fail Zod validation and exact-value tests enforce cents-unit semantics
- `AnomalyAlertDTO` / `ShiftAlertDTO` emit `FinancialValue` for financial metric types at the service boundary
- `hold_percent` confirmed bare `number | null` by grep
- Named existing OpenAPI path entries are accurate (no stale dollar-float or bare-number documentation on the listed surfaces)
- Phase 1.2B-B can proceed against a canonicalized service layer — UI migration, full OpenAPI expansion, test matrices, and observability wired in that slice

## Feedback Loop

- `financialValueSchema.int()` rejects fractional numeric values at DTO outbound — exact-value assertions enforce cents-unit semantics
- Integer-value assertions in the named existing route test files catch any `/100` regression immediately
- Phase 1.2B-B tests expand coverage; Phase 1.4 lint rules mechanically enforce invariants

---

# F. Required Outcomes

## MUST

- `/100` removed from `services/visit/crud.ts` `centsToDollars` and `services/rating-slip/mappers.ts` `toVisitLiveViewDTO`
- `financialValueSchema.int()` enforced at DTO outbound boundary for `RecentSessionDTO` / `VisitLiveViewDTO`; enforced *after* `/100` removal (ordering is mandatory)
- `resolveShiftMetricAuthority` return value assigned into `observedValue`, `baselineMedian`, `baselineMad`, `thresholdValue` in `mapAnomalyAlertRow`; into `observedValue`, `baselineMedian`, `baselineMad` in `mapShiftAlertRow`
- `AnomalyAlertDTO` / `ShiftAlertDTO` type signatures updated per Q-1/Q-2 EXEC-SPEC resolution
- Outbound Zod schemas introduced for `AnomalyAlertDTO` / `ShiftAlertDTO` (DEF-007 waiver lifted)
- `hold_percent` confirmed bare `number | null` at every layer — grep + test assertion (DEF-NEVER)
- OpenAPI updated only for the named existing path entries in the Scope Guardrail Block — BRIDGE-001 routes to `integer`; shift-intelligence anomaly-alert fields to `FinancialValue`
- Named Phase 1.2A BRIDGE-001 route test assertions updated to integer-value assertions
- No new OpenAPI path entries or route test files created for shift-intelligence alert surfaces in Phase 1.2B-A
- `ROLLOUT-TRACKER.json` updated: DEF-001, DEF-002, DEF-003, DEF-007 closed; BRIDGE-001 `status: "retired"` with commit SHA

---

## MUST NOT

- Migrate `formatDollars` → `formatCents` on any UI component — **Phase 1.2B-B**
- Expand OpenAPI beyond the concrete path entries named in the Scope Guardrail Block — **Phase 1.2B-B**
- Build full 4-case test matrices (`recent-sessions`, `live-view` auth/404/pagination scenarios) — **Phase 1.2B-B**
- Wire runtime structured log events for deprecated-field usage — **Phase 1.2B-B**
- Audit BRIDGE-001 consumer components (Q-4) as implementation work — **Phase 1.2B-B**. EXEC-074 may only apply the authorized `anomaly-alert-card.tsx` metric-type-aware property-access fix for promoted shift-intelligence fields.
- Re-author `type`, `source`, or `completeness` at any route handler (RULE-1 inherited)
- Wrap `hold_percent` in `FinancialValue` — DEF-NEVER
- Enforce `financialValueSchema.int()` before `/100` removal
- Add route-handler logic to construct `FinancialValue` for shift-intelligence fields — mapper change only
- Compensate for shift-intelligence mapping discrepancies in route handlers or UI components — service mapper / DTO schema correction only
- Build Phase 1.3 UI components (`FinancialValue.tsx`, `AttributionRatio.tsx`, `CompletenessBadge.tsx`)
- Birth component test files (`rating-slip-modal.test.tsx`, etc.) — Phase 1.3
- Implement Phase 1.4 ESLint rules
- Touch Wave 2 infrastructure

---

# G. Explicit Exclusions

**Phase 1.2B-B scope (successor slice — own PRD + FIB required):**
- `formatDollars` → `formatCents` UI render migration (`start-from-previous.tsx`, `start-from-previous-modal.tsx`, and any additional consumers discovered by Q-4 audit)
- Full OpenAPI expansion — 28 remaining Bucket B routes not covered in Phase 1.2A
- Full contract test matrices — 4-case matrices for `recent-sessions` and `live-view`; route-boundary tests for remaining 28 routes
- Runtime deprecation observability — structured log event per deprecated-field usage
- BRIDGE-001 consumer audit (Q-4) as an active delivery obligation

**Phase 1.3 scope:**
- `components/financial/FinancialValue.tsx`, `AttributionRatio.tsx`, `CompletenessBadge.tsx`
- Broad forbidden-label removal from rendered UI surfaces
- Formatter consolidation (`lib/format.ts`, 18+ local variants)
- Component test birth: `rating-slip-modal.test.tsx`, `start-from-previous.test.tsx`, `start-from-previous-modal.test.tsx`

**Phase 1.4 scope:**
- ESLint `no-unlabeled-financial-value` and `no-forbidden-financial-label`
- I5 truth-telling harness subset
- CI red on envelope regression (mechanical enforcement)

**Wave 2 scope:**
- `finance_outbox` DDL and producers (GAP-F1)
- Class B authoring store, outbox consumer workers, projection refactors

**All phases:**
- `hold_percent` FinancialValue wrapping — ever (DEF-NEVER)
- New financial semantics or service mapper classifications, except bug correction to the already-approved `resolveShiftMetricAuthority` mapping under the Expansion Trigger Rule

---

# H. Adjacent Rejected Ideas

| Idea | Reason Rejected |
|------|----------------|
| Bundle UI migration into Phase 1.2B-A alongside unit canonicalization | This is the PRD-070 failure pattern: conflating cause (canonicalize units) with consequences (align surfaces). UI migration introduces component surface coupling, Q-4 discovery risk, and visual regression surface — a different problem class than mapper changes. Phase 1.2B-A canonicalizes; Phase 1.2B-B aligns. |
| Expand all 34 OpenAPI routes in Phase 1.2B-A | OpenAPI coverage is not required to canonicalize units. It is required to validate and enforce contracts (Phase 1.4 prep). Full expansion belongs in Phase 1.2B-B. Attempting it in 1.2B-A turns a focused service-layer slice into weeks of drift. |
| Wire runtime deprecation observability in Phase 1.2B-A | Observability is a surface-layer concern (route handlers emit log events). Phase 1.2B-A must not touch route handlers. Logging belongs in 1.2B-B. |
| Build full 4-case test matrices in Phase 1.2B-A | Full contract coverage is validation-layer work (Phase 1.4 in spirit, Phase 1.2B-B in sequencing). Phase 1.2B-A needs only integer-value regression guards in the named existing route test files — enough to confirm `/100` was removed and `int()` is enforced. |
| Enforce `financialValueSchema.int()` before removing `/100` | Zod `z.number().int()` rejects fractional numeric values, not semantic dollar units. Enforcing before removal is still invalid because BRIDGE-001 can emit fractional dollars; ordering is mandatory: remove `/100` → then enable `int()` and exact-value assertions. |
| Wrap `hold_percent` in FinancialValue with an `is_ratio` flag | Dimensionless ratio — not currency. `resolveShiftMetricAuthority` returns `null` for it; the exhaustive switch throws on unknown `MetricType` — compile-time gate. DEF-NEVER. |
| Birth component tests in Phase 1.2B-A (per tracker pending_scope) | PRD-071 Appendix D and DEF-006 classify component test birth as Phase 1.3. The tracker `pending_scope` listing is a stale draft artifact. PRD-071 is authoritative. |

---

# I. Dependencies / Assumptions

## Dependencies

- Phase 1.2A exit gate ✅ 2026-04-30 (EXEC-071, commit `46229a98`) — routes confirmed pass-through; OpenAPI `FinancialValue` component defined; named representative path entries and route tests established
- `resolveShiftMetricAuthority` implemented (PRD-073) — returns `{ type: FinancialAuthority; source: string } | null` for all `MetricType` values; `hold_percent → null`. Called as void in both mapper functions; Phase 1.2B-A promotes to assignment
- `lib/financial/schema.ts` `financialValueSchema` — `z.number().int()` present; not yet enforced at DTO boundary
- DB storage confirmed integer cents: `player_financial_transaction.amount` and `rpc_get_visit_live_view` / `rpc_get_player_recent_sessions` returns are integer cents before the `/100` conversion — removal produces integer-cents `FinancialValue` without additional mapper logic
- PRD-074 not yet drafted — EXEC-SPEC blocked on `/prd-writer` invocation (per ROLLOUT-TRACKER cursor)

## Assumptions

- No route handler performs financial math (confirmed Phase 1.2A WS1 grep — CLEAN); removing `/100` from service mappers is sufficient to canonicalize the wire without touching any route
- `resolveShiftMetricAuthority` exhaustive switch with `never` default is the compile-time gate for `hold_percent`; no runtime guard needed beyond it
- The concrete surfaces named in the Scope Guardrail Block are sufficient as the regression surface for Phase 1.2B-A; full 28-route expansion (Phase 1.2B-B) does not need to be atomic with unit canonicalization

---

# J. Likely Next

## Phase 1.2B-B (immediate successor — own PRD + FIB pair)

Builds on the canonicalized service layer this phase produces:
- `formatDollars` → `formatCents` UI render migration — stable because units are confirmed integer cents
- Full 28-route OpenAPI expansion — stable because FinancialValue shape is confirmed at service boundary
- Full 4-case test matrices for `recent-sessions` and `live-view`
- Route-boundary tests for remaining 28 routes
- Runtime structured log events per deprecated-field usage
- BRIDGE-001 consumer audit (Q-4) executed as a delivery obligation

## Phase 1.3 (after Phase 1.2B-B exit gate)

- `components/financial/FinancialValue.tsx` — integer-cents contract stable from 1.2B-A; render surfaces aligned from 1.2B-B
- `components/financial/AttributionRatio.tsx`, `CompletenessBadge.tsx`
- Broad forbidden-label removal from rendered DOM
- Formatter consolidation: `lib/format.ts`
- Component test birth: `rating-slip-modal.test.tsx`, `start-from-previous.test.tsx`, `start-from-previous-modal.test.tsx`

## Phase 1.4 (after Phase 1.3)

- ESLint `no-unlabeled-financial-value` and `no-forbidden-financial-label`
- I5 truth-telling harness subset
- Deprecation observability dashboards wired to Phase 1.2B-B log events

---

# K. Expansion Trigger Rule

Expansion is allowed ONLY if:

- `resolveShiftMetricAuthority` is found to return an incorrect authority for a `MetricType` — requires a mapper correction before proceeding, but still service-layer scope
- Q-1 or Q-2 resolution reveals a DTO shape that requires a small additional mapper field — still service-layer scope, EXEC-SPEC amendment required

Expansion is NOT allowed for:

- UI component migration — Phase 1.2B-B, regardless of how small the change appears
- New OpenAPI route entries beyond the concrete path entries named in the Scope Guardrail Block — Phase 1.2B-B
- Additional test cases beyond integer-value regression guards on existing routes — Phase 1.2B-B
- Observability wiring of any kind — Phase 1.2B-B

---

# L. Scope Authority Block

## Governing Rule

Phase 1.2B-A canonicalizes what the service layer produces. It removes `/100` conversions, enforces integer-cents Zod validation, and promotes deferred DTO types using the routing already implemented. It then makes the smallest possible update to the existing 6 tested routes so their OpenAPI and tests accurately reflect the new state. It does nothing else.

## Hard Constraints

- `/100` removed from both mapper files before `financialValueSchema.int()` is enabled — ordering is mandatory
- `hold_percent` is bare `number | null` at every layer in every phase — DEF-NEVER
- Route handlers remain transport only — no service-layer logic moves to routes
- UI migration, full OpenAPI expansion, test matrices, and runtime logging belong to Phase 1.2B-B
- Component test birth belongs to Phase 1.3
- Secondary layer edits are shape-alignment only: no new fields, scenarios, coverage patterns, paths, schemas, or components
- Shift-intelligence mapping discrepancies are corrected only in service mappers / DTO schemas

## Rejection Criteria

Reject implementation if it:
- Retains `/100` in either mapper file after the BRIDGE-001 workstream
- Leaves `observedValue`, `baselineMedian`, `baselineMad`, or `thresholdValue` as bare `number | null` in `AnomalyAlertDTO` for financial metric types
- Wraps `hold_percent` values in `FinancialValue` under any framing
- Enforces `financialValueSchema.int()` before `/100` removal
- Migrates any `formatDollars` call site in UI components
- Adds OpenAPI path entries beyond the concrete path entries named in the Scope Guardrail Block
- Wires runtime log events for deprecated-field usage
- Builds Phase 1.3 UI components or births component test files
- Adds route-handler logic to construct `FinancialValue`
- Modifies OpenAPI paths, schemas, or components outside the explicitly named path entries
- Adds new test scenarios, test files, or coverage patterns
- Applies route-level or UI-level compensation for shift-intelligence mapper issues

---

## One-line invariant

If a change removes `/100`, promotes a deferred DTO type, or performs named pass-through contract/test updates required to keep this slice truthful — and nothing else — it is in scope.
If it touches UI, expands OpenAPI beyond the named path entries, builds test matrices, births test files, or wires observability, it belongs in Phase 1.2B-B.

---
