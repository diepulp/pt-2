---
id: PRD-073
title: "Financial Telemetry — Wave 1 Phase 1.1c — Shift-Intelligence Internal Authority Routing"
owner: Lead Architect
status: Draft
affects:
  - PRD-070
  - PRD-071
  - PRD-072
  - EXEC-070
  - docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-CLASSIFICATION-RULES.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-SURFACE-INVENTORY.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md
created: 2026-04-24
last_review: 2026-04-24
phase: Wave 1 Phase 1.1c — Shift-Intelligence Internal Authority Routing (WS7B)
pattern: Service-layer only — routing helper + mapper path unification + stale test remediation. No shape conversion. No bridge DTO.
http_boundary: false
fib_h: docs/issues/gaps/financial-data-distribution-standard/intake/FIB-FIN-SHIFT-001/FIB-H-FIN-SHIFT-001-shift-intelligence-authority-routing.md
fib_s: docs/issues/gaps/financial-data-distribution-standard/intake/FIB-FIN-SHIFT-001/FIB-S-FIN-SHIFT-001-shift-intelligence-authority-routing.json
ws7a_decision_record: "EXEC-070 § Planning Lock Resolution — routing rules frozen 2026-04-24"
companion_prd: PRD-072 (Phase 1.1b — visit surface envelope label; WS5/WS6 chain)
---

# PRD-073 — Financial Telemetry — Wave 1 Phase 1.1c — Shift-Intelligence Internal Authority Routing

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft

**Summary.** This PRD governs the bounded child slice that closes WS7B under `EXEC-070`: the
`MetricType`-to-authority routing helper for `services/shift-intelligence/`, plus the mapper path
unification it enables and the stale route-boundary test it requires. All deliverables are confined
to the `services/shift-intelligence/` service layer — no route handler changes, no UI changes, no
SQL migrations, no bridge DTO.

The routing rules were frozen in the WS7A Planning Lock (`EXEC-070 § Planning Lock Resolution`,
2026-04-24) but never implemented. Three concrete defects remain: (1) `resolveShiftMetricAuthority`
does not exist; (2) `getAlerts` in `alerts.ts` assembles `ShiftAlertDTO` inline instead of calling
`mapShiftAlertRow`, creating a divergent code path Phase 1.2 would have to update in two places;
(3) `anomaly-alerts-route-boundary.test.ts` asserts `gamingDay`/`computedAt` keys that do not
exist on the live `AnomalyAlertsResponseDTO` — the test passes against a wrong-shape mock and
provides false assurance. This PRD closes all three before WS9 runs its verification matrix.

No public-facing DTO field changes. No FinancialValue wrapping on `AnomalyAlertDTO` or
`ShiftAlertDTO` numeric fields — that is Phase 1.2 scope under a separate EXEC-SPEC. The public
response emitted by every route handler is byte-for-byte identical before and after this slice.

This PRD is the second and final Phase 1.1 child spec required before WS9 can close
Phase 1.1 entirely. The companion child spec is `PRD-072` (visit-surface envelope label, WS5/WS6
chain, complete as of commit `38d25cc1`).

---

## 2. Problem & Goals

### 2.1 Problem

`EXEC-070` WS7A froze the `MetricType`-to-authority routing rules for `services/shift-intelligence/`
and issued a Phase 1.1 waiver deferring public DTO field-shape changes to Phase 1.2. WS7B was then
deferred to this child spec because it is a distinct bounded context with a distinct pattern from the
visit-surface chain (internal routing helper + alert path parity, not shape conversion).

Three concrete defects exist in `services/shift-intelligence/` that this slice must close
regardless of the public-shape deferral:

**Defect 1 — No routing helper.** The four frozen routing rules are documented in EXEC-070
but are not implemented anywhere. Phase 1.2 cannot wrap the deferred public fields without this
helper; building it here ensures the mapping is testable and auditable before wrapping begins.

**Defect 2 — `getAlerts` inline assembly.** `services/shift-intelligence/alerts.ts` constructs
`ShiftAlertDTO` directly (lines 127–157) without calling `mapShiftAlertRow`. The anomaly-alert path
(via `mapAnomalyAlertRow`) and the persistent-alert path (via `getAlerts` inline) are structurally
divergent. When Phase 1.2 wraps the deferred public fields, two separate code paths must be updated
instead of one mapper. `EXEC-070` explicitly identifies this as mandatory remediation regardless
of deferral.

**Defect 3 — Stale route-boundary test.** `anomaly-alerts-route-boundary.test.ts` fixture (line
46–50) and assertions (lines 119–130) reference `gamingDay` and `computedAt` keys that do not exist
on the live `AnomalyAlertsResponseDTO`. The live shape uses `baselineGamingDay` (string) and
`baselineCoverage: { withBaseline: number; withoutBaseline: number }` per
`services/shift-intelligence/dtos.ts`. The test passes against a wrong-shape mock. WS9 item 12
cannot be discharged at all until the fixture is correct — this is a precondition for running WS9,
not a phase-close nicety.

### 2.2 Goals

| Goal | Observable signal |
|------|------------------|
| **G1** — `resolveShiftMetricAuthority` implemented with all four WS7A-frozen routing rules | `mappers.ts` exports the function; exhaustive switch with compile-time check; `mappers.test.ts` asserts all four branches |
| **G2** — Both mapper paths unified through the routing helper | `mapAnomalyAlertRow` and `mapShiftAlertRow` both call `resolveShiftMetricAuthority`; no other `MetricType`-to-authority derivation exists in the service |
| **G3** — `getAlerts` delegates DTO construction to `mapShiftAlertRow` | Inline assembly block (lines 127–157 of `alerts.ts`) deleted; `alerts-mappers.test.ts` verifies delegation |
| **G4** — `anomaly-alerts-route-boundary.test.ts` asserts the correct `AnomalyAlertsResponseDTO` shape | Zero references to `gamingDay` (at response envelope level) or `computedAt`; `baselineGamingDay` + `baselineCoverage` asserted; test exits 0 |
| **G5** — Routing rule coverage is explicit and per-value | `mappers.test.ts` has at least one assertion per `MetricType`, including `hold_percent → null` |
| **G6** — `cash_obs_total` static-threshold invariant preserved | Test suite asserts `shouldEvaluate = false` for `cash_obs_total`; routing source confirmed as `pit_cash_observation.extrapolated` |
| **G7** — Public DTO shapes unchanged throughout | Grep confirms `AnomalyAlertDTO` and `ShiftAlertDTO` numeric fields remain typed as `number \| null`; no `FinancialValue` in `dtos.ts` for these fields |

### 2.3 Non-Goals

> **Phase discipline (patch-delta enforced):** Phase 1 defines truth. Phase 2 moves truth.
> This slice operates exclusively in the semantic layer — authority classification and labeling.
> It does not touch propagation, aggregation, or event infrastructure in any form.
> See `patch-delta.md` §1–6 for the full topology-separation rationale.

**Phase 1.2 deferrals (public shape changes):**
- **Wrapping `AnomalyAlertDTO.observedValue`, `baselineMedian`, `baselineMad`, `thresholdValue` in `FinancialValue`.** Phase 1.2, per GATE-070.6 and the Phase 1.2 Deferral Register in EXEC-070.
- **Wrapping `ShiftAlertDTO.observedValue`, `baselineMedian`, `baselineMad` in `FinancialValue`.** Phase 1.2.
- **Adding outbound Zod schemas to `schemas.ts`.** WS7A explicitly waived this; reopening requires a lead-architect EXEC-SPEC amendment.
- **Route handler changes.** `app/api/v1/shift-intelligence/` routes are unchanged; the public response shape is byte-identical before and after.
- **UI component changes.** `components/shift-intelligence/`, `components/shift-dashboard/`, `components/admin-alerts/` — Phase 1.2 + 1.3 scope.

**Infrastructure / topology (Wave 2 deferrals):**
- **Event propagation.** This slice does not define, imply, or partially implement any event propagation mechanism.
- **Outbox structures.** No outbox records, event payloads, or streaming messages are introduced. `FinancialValue` is a semantic descriptor only — it MUST NOT be reused as an event payload, outbox record, or streaming message.
- **Projection design.** No projection schema or downstream consumer contract is influenced.
- **Aggregation or reconciliation.** This slice does not compute totals, perform cross-stream reconciliation, or unify PFT vs GRIND financial streams. Those are Wave 2 concerns.
- **Financial stream unification (PFT / GRIND / TBT).** Authority classification in this slice labels existing values; it does not merge or reconcile streams. TBT deprecation is a Wave 2 trigger-deprecation item (Blast Radius Assessment §1).

**Unchanged surfaces:**
- **SQL migrations.** `rpc_get_anomaly_alerts` already returns `metric_type` as a string column; the routing helper is pure TypeScript.
- **Bridge DTO declaration.** This slice introduces no bridge DTOs. The bare-number fields are pre-migration state, not a transitional bridge under the Transitional Governance Caveat (which covers `PRD-072`'s dollar-float bridge only).
- **`BaselineDTO` numeric fields.** `medianValue`, `madValue`, `minValue`, `maxValue` are not in the Phase 1.1 exception set per EXEC-070 Planning Lock Resolution.
- **WS9 verification matrix execution.** WS9 stays under parent `EXEC-070`; it runs after this slice closes.
- **`baseline.ts` and `baseline-computation.test.ts`.** No currency envelope treatment required in Phase 1.1.
- **`http.ts` `ServiceHttpResult` wrappers.** Service HTTP layer is unchanged.

---

## 3. Users & Use Cases

**Primary users:** Backend engineers and QA specialists executing the Phase 1.1 close path and the
WS9 verification matrix.

**Top Jobs:**

- As a **backend engineer** executing WS7B, I need the MetricType-to-authority routing table to be implemented as a typed helper with exhaustive switch coverage so that both mapper paths (`mapAnomalyAlertRow` and `mapShiftAlertRow`) use a single source of truth — and Phase 1.2 can call the same helper at the `FinancialValue` construction site without re-deriving routing rules.
- As a **backend engineer** maintaining `alerts.ts`, I need `getAlerts` to delegate DTO construction to `mapShiftAlertRow` so that the persistent-alert path and the anomaly-alert path are structurally convergent — one mapper update in Phase 1.2 covers both flows.
- As a **QA specialist** running WS9, I need `anomaly-alerts-route-boundary.test.ts` to assert the live `AnomalyAlertsResponseDTO` shape (`baselineGamingDay`, `baselineCoverage`) so that WS9 item 12 can discharge and the verification matrix can complete.
- As a **reviewer**, I need the public response shape to be unchanged, no new bridge DTO, and no outbound Zod — a purely internal correctness slice with a bounded, auditable diff.

---

## 4. Scope & Feature List

### 4.1 In Scope

**CAP-1 — MetricType-to-authority routing helper**

Implement `resolveShiftMetricAuthority(metricType: MetricType): { type: FinancialAuthority; source: string } | null` using the four WS7A-frozen rules:

| `MetricType` | `type` | `source` | Note |
|---|---|---|---|
| `drop_total` | `'estimated'` | `'table_session.drop'` | |
| `win_loss_cents` | `'estimated'` | `'table_session.inventory_win'` | |
| `cash_obs_total` | `'estimated'` | `'pit_cash_observation.extrapolated'` | Static-threshold invariant: never anomaly-evaluated |
| `hold_percent` | — | — | Returns `null`; bare ratio, never wrapped |

Implemented as an exhaustive switch with compile-time exhaustiveness check (no implicit `default`
that would allow a future `MetricType` value to be silently misrouted). `FinancialAuthority` is
imported from `types/financial.ts` — not redefined.

Location: `services/shift-intelligence/mappers.ts`, or extracted to
`services/shift-intelligence/authority-routing.ts` if both `mappers.ts` and `alerts.ts` need to
import it directly. Decision at EXEC-SPEC time.

**CAP-2 — Unified mapper path for both alert flows**

Both mapper functions call `resolveShiftMetricAuthority` internally. The routing result is
consumed internally — it is not emitted on any public DTO field in this slice.

- `mapAnomalyAlertRow` (anomaly-alert path): add internal routing call. Public `AnomalyAlertDTO`
  output shape unchanged — `observedValue`, `baselineMedian`, `baselineMad`, `thresholdValue`
  remain typed as `number | null`.
- `mapShiftAlertRow` (persistent-alert path): add internal routing call. Public `ShiftAlertDTO`
  output shape unchanged — `observedValue`, `baselineMedian`, `baselineMad` remain `number | null`.
- `getAlerts` in `alerts.ts`: refactor to call `mapShiftAlertRow` from `mappers.ts`. Delete inline
  DTO construction block (lines 127–157). This is the only divergent assembly path; no other
  function in `alerts.ts` constructs `ShiftAlertDTO` inline.

**CAP-3 — Stale route-boundary test remediation**

Correct `services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts`:

- Remove `gamingDay` and `computedAt` keys from `ALERTS_FIXTURE`.
- Add `baselineGamingDay: string` and `baselineCoverage: { withBaseline: number; withoutBaseline: number }` to the fixture, matching `AnomalyAlertsResponseDTO` in `services/shift-intelligence/dtos.ts`.
- Update assertions: `body.data.baselineGamingDay` (string) and `body.data.baselineCoverage` (object with `withBaseline`/`withoutBaseline`).
- Consider adding a second fixture alert with `metricType: 'hold_percent'` to verify the null-routing branch passes through the route without error (open question Q-4; recommended by FIB governance).
- Zero references to `gamingDay` (at response envelope level) or `computedAt` may remain after correction.

**CAP-4 — Routing rule test coverage**

Extend `services/shift-intelligence/__tests__/mappers.test.ts` with an explicit routing assertion
suite: one test case per `MetricType` value, one explicit `hold_percent → null` assertion (bare
ratio invariant), one `cash_obs_total` static-threshold assertion (confirms `shouldEvaluate = false`
for the `cash_obs_total` metric per the existing `anomaly-evaluation.test.ts` intent).

Extend `services/shift-intelligence/__tests__/alerts-mappers.test.ts` with a test asserting that
`getAlerts` delegates `ShiftAlertDTO` construction through `mapShiftAlertRow` (mapper unification
verified — integration-style or by asserting the shared mapper call).

### 4.2 Out of Scope

- `AnomalyAlertDTO` / `ShiftAlertDTO` public numeric field type changes — Phase 1.2.
- Outbound Zod validation (`financialValueSchema`) for any shift-intelligence DTO — WS7A waiver.
- Route handler changes (`app/api/v1/shift-intelligence/`) — Phase 1.2.
- UI changes (`components/shift-intelligence/`, `components/shift-dashboard/`, `components/admin-alerts/`) — Phase 1.2 + 1.3.
- `services/shift-intelligence/dtos.ts` changes — public DTO shapes frozen.
- `services/shift-intelligence/schemas.ts` changes — remains request-only per WS7A waiver.
- SQL migrations — no DDL or RPC changes.
- Bridge DTO declaration — this slice introduces none.
- `baseline.ts`, `baseline-computation.test.ts` — no Phase 1.1 obligation.
- `http.ts` — `ServiceHttpResult` wrappers unchanged.
- WS9 verification matrix execution — stays under parent `EXEC-070`.

---

## 5. Requirements

### 5.1 Functional Requirements

**FR-1.** `resolveShiftMetricAuthority` MUST implement an exhaustive switch over all four `MetricType` values using the exact WS7A-frozen routing rules. The function signature MUST be
`resolveShiftMetricAuthority(metricType: MetricType): { type: FinancialAuthority; source: string } | null`. No new `MetricType` union definition — import the existing union from
`services/shift-intelligence/dtos.ts`.

**FR-2.** `hold_percent` MUST return `null` from `resolveShiftMetricAuthority`. It is a bare ratio
and MUST NOT be wrapped in `FinancialValue` at any service layer in Phase 1.1 or Phase 1.2. This is
a hard invariant frozen by the WS7A planning gate.

**FR-3.** `cash_obs_total` MUST map to `{ type: 'estimated', source: 'pit_cash_observation.extrapolated' }`. The static-threshold invariant (`shouldEvaluate = false` for `cash_obs_total`) MUST be preserved and explicitly asserted in the test suite.

**FR-4.** `mapAnomalyAlertRow` and `mapShiftAlertRow` MUST both call `resolveShiftMetricAuthority`. The routing result MUST be used internally. It MUST NOT be emitted on any public DTO field in this slice. Public `AnomalyAlertDTO` and `ShiftAlertDTO` field types are unchanged.

**FR-5.** `getAlerts` in `alerts.ts` MUST call `mapShiftAlertRow` from `mappers.ts`. The inline DTO construction block (lines 127–157) MUST be deleted. No other function in `alerts.ts` may construct `ShiftAlertDTO` fields inline after this change.

**FR-6.** `anomaly-alerts-route-boundary.test.ts` MUST assert `baselineGamingDay` (string) and `baselineCoverage: { withBaseline: number; withoutBaseline: number }` on the anomaly-alerts response. Zero references to `gamingDay` (at response envelope level) or `computedAt` may remain in this file after correction.

**FR-7.** `mappers.test.ts` MUST contain at least one explicit assertion for each of the four `MetricType` routing rules, including an assertion that `hold_percent` returns `null`.

**FR-8.** `alerts-mappers.test.ts` MUST contain at least one assertion verifying that `getAlerts` produces `ShiftAlertDTO` via `mapShiftAlertRow` (mapper unification path confirmed).

**FR-9.** `FinancialAuthority` MUST be imported from `types/financial.ts`. It MUST NOT be redefined or re-declared within the `services/shift-intelligence/` bounded context.

**FR-10.** `schemas.ts` MUST remain request-only. No outbound Zod schema for `AnomalyAlertDTO`, `ShiftAlertDTO`, or any shift-intelligence response type may be added. Reopening the WS7A waiver requires a lead-architect EXEC-SPEC amendment before any such schema is added.

**FR-11.** No FinancialValue wrapper may be applied to any public DTO numeric field in `dtos.ts` during this slice. The public response emitted by the route handlers MUST be byte-identical to the pre-slice response.

### 5.2 Non-Functional Requirements

- The slice is bounded entirely within `services/shift-intelligence/`. No route, UI, SQL, or cross-service file changes.
- `npm run type-check` must exit 0. `npm run test:slice:shift-intelligence -- --runInBand` must exit 0. `npx jest --runInBand --runTestsByPath services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts` must exit 0.
- No `as any`, no duplicate `FinancialAuthority` or `MetricType` definitions, no inline financial authority authorship outside the routing helper.
- If `resolveShiftMetricAuthority` is used by both `mappers.ts` and `alerts.ts`, it MUST be extracted to a sibling file (`authority-routing.ts`) to avoid a circular import. This decision is made at EXEC-SPEC authoring time.
- **Envelope role restriction (patch-delta §2):** `FinancialValue` is a semantic descriptor. The routing result produced by `resolveShiftMetricAuthority` is consumed internally for labeling purposes only. It MUST NOT act as an event payload, drive propagation logic, participate in aggregation, perform reconciliation, or encode any system behavior beyond describing value + authority + completeness.
- `ROLLOUT-PROGRESS.md` MUST record this PRD as the WS7B child spec owner and update Phase 1.1 status when implementation completes.

> Architecture references: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`, `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`, `types/financial.ts`, `lib/financial/schema.ts`.

---

## 6. UX / Flow Overview

This slice has no operator-visible UX change. The flows below describe the internal data path and
verification path.

**Flow 1 — Anomaly-alert routing path**
1. `rpc_get_anomaly_alerts` returns a row with `metric_type: MetricType`.
2. `mapAnomalyAlertRow` calls `resolveShiftMetricAuthority(row.metric_type)`.
3. Routing result is used internally. `AnomalyAlertDTO` public fields (`observedValue`, `baselineMedian`, etc.) remain bare `number | null`.
4. Route handler passes `AnomalyAlertsResponseDTO` through unchanged. Consumer receives the same response shape as before this slice.

**Flow 2 — Persistent-alert routing path**
1. `getAlerts` retrieves rows from the `shift_alerts` table.
2. `getAlerts` calls `mapShiftAlertRow` (not inline assembly) for each row.
3. `mapShiftAlertRow` calls `resolveShiftMetricAuthority(row.metric_type)` internally.
4. `ShiftAlertDTO` public fields remain bare `number | null`.
5. Route handler emits the same response shape as before.

**Flow 3 — Phase 1.2 readiness**
1. Phase 1.2 calls `resolveShiftMetricAuthority` at the `FinancialValue` construction site inside each mapper.
2. One helper covers both mapper paths — no routing re-derivation required.

**Flow 4 — Verification (WS9 gate)**
1. `npm run type-check` exits 0 — no type regressions.
2. `npm run test:slice:shift-intelligence -- --runInBand` exits 0 — WS9 item 4 unblocked.
3. `npx jest --runInBand --runTestsByPath ...anomaly-alerts-route-boundary.test.ts` exits 0 — WS9 item 12 unblocked.

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **WS7A decision record landed** — EXEC-070 § Planning Lock Resolution contains the four frozen routing rules. These are the authoritative source — do not re-derive or alter them.
- **WS1 primitives landed** — `lib/financial/schema.ts` exports `financialAuthoritySchema`; `types/financial.ts` exports `FinancialAuthority`. `resolveShiftMetricAuthority` must use `FinancialAuthority` for the return type annotation. Verify `'estimated'` is a valid value before implementation.
- **PRD-072 (Phase 1.1b) complete** — visit-surface chain shipped (commit `38d25cc1`); WS5/WS6 blockers cleared from WS9. This is the sole remaining blocker.
- **Parent phase governance** — `PRD-070` remains the Phase 1.1 umbrella. This PRD is a bounded child slice; it does not replace the parent close gate.
- **Phase 1.1 contingency** — Phase 1.1 does not close when this slice lands alone. WS9 must still run its full verification matrix. When WS9 exits, Phase 1.1 is done and Phase 1.2 handoff package is produced.
- **Phase 1.2 successor** — the public-field wrapping work intentionally deferred here (`AnomalyAlertDTO` and `ShiftAlertDTO` numeric fields) must be captured in a separate FIB/PRD chain for the Phase 1.2 shift-intelligence API cleanup slice before Phase 1.2 begins.

### 7.2 Blast Radius Awareness

`docs/issues/gaps/financial-data-distribution-standard/actions/BLAST-RADIUS-ASSESSMENT.md` enumerates
Wave 1 scope threats. Two items directly bear on this slice:

**Item 7 — `as unknown as` mocks hide reshape breakage.**
The assessment identified that tests using `as unknown as { rpc: jest.Mock }` can pass against a
wrong-shape mock while real integrations break. The stale `anomaly-alerts-route-boundary.test.ts`
is a concrete instance of exactly this pattern — it has been passing against a mock that returns
`gamingDay`/`computedAt` keys that do not exist on the live response. CAP-3 (stale test
remediation) directly addresses this. After correction, the test must assert the actual
`AnomalyAlertsResponseDTO` shape with no `as unknown as` bypass near envelope fields.
The EXEC-SPEC must prohibit introducing new `as unknown as` escapes in any test file touched
by this slice.

**Item 3 — Delta math on bare currency amounts.**
`services/table-context/shift-checkpoint/mappers.ts:114-127` subtracts `win_loss_cents` values
inline. This is **not** in scope for PRD-073 (confined to `services/shift-intelligence/`), but
it is a known adjacency: if the EXEC-073 implementer is also touching `services/table-context/`
for any reason, they must not apply `resolveShiftMetricAuthority` or any envelope logic there —
that surface is a separate Phase 1.1 exception already handled. The routing helper built here
is service-private to `services/shift-intelligence/` by explicit FIB decision; it does not
generalize to the table-context delta math pattern.

All other blast radius items (24 API routes, 167+ UI components, 30+ local formatters, trigger
deprecations) are outside the bounded scope of this slice and are not at risk here. This slice
touches five files, all within `services/shift-intelligence/`.

### 7.3 Risks & Open Questions

| Risk | Mitigation |
|------|-----------|
| Executor re-derives routing rules instead of using frozen WS7A table | EXEC-SPEC carries the frozen table verbatim; deviation is an expansion trigger |
| `hold_percent → null` invariant missed, returning a zero authority struct | Explicit test assertion pins the null return; type signature forces callers to handle `null` |
| `resolveShiftMetricAuthority` elevated to `lib/financial/` prematurely | FIB-H § H explicitly rejects this; routing source strings are service-private identifiers |
| `anomaly-evaluation.test.ts` broken by mapper refactoring | Open question Q-3 in FIB governance; amendment in scope only if a structural conflict is revealed |
| `as unknown as` bypass introduced in corrected boundary test | Blast Radius Item 7; EXEC-SPEC must prohibit it explicitly |
| Outbound Zod added incidentally during mapper refactoring | FR-10 prohibition; EXEC-SPEC must carry it as a hard prohibition |
| Parallel edit of `mappers.ts` and `alerts.ts` causing intermediate inconsistency | EXEC-SPEC must serialize these two workstreams explicitly |
| Scope creep into Phase 1.2 public-field wrapping | Expansion trigger rule from FIB-K applies; any wrapping proposal is an EXEC-SPEC amendment event |
| **R6 — Premature topology coupling (patch-delta §7)** | Phase 1 work begins encoding assumptions about event structure, propagation, or downstream consumers — locking future architecture and invalidating outbox decoupling. **Mitigation:** any construct that implies event structure (event IDs, aggregate IDs, outbox columns, propagation hooks) is an automatic scope rejection. Envelope is terminal representation in Phase 1. All propagation deferred to Wave 2. |
| **R7 — Shadow authority / split brain (forward risk, Phase 1.2 watch)** | Routing result is internal-only in Phase 1.1. Risk: a future caller re-derives authority independently from `MetricType` (UI branch, second service, ad-hoc switch) rather than calling `resolveShiftMetricAuthority`. Split brain returns silently. **Phase 1.1 mitigation:** DoD grep gate (no independent switch on `MetricType` → authority). **Phase 1.2 obligation:** when public fields are wrapped in `FinancialValue`, the envelope carries `type`+`source` explicitly — internal routing becomes visible and re-derivation becomes unnecessary. The Phase 1.2 EXEC-SPEC MUST include an explicit rule: no caller may derive authority from `MetricType` except through `resolveShiftMetricAuthority`. |
| **R8 — Envelope infrastructuralization at Phase 1.2 wrap site** | The moment `resolveShiftMetricAuthority` is called at the `FinancialValue` construction site in Phase 1.2, there is pressure to wire the routing result somewhere beyond description — a computed field, a downstream signal, a propagation hook. That is the exact misstep that turns the envelope from semantic descriptor into system infrastructure. **Mitigation:** the Phase 1.2 EXEC-SPEC must restate the patch-delta §2 envelope role restriction at the wrap site, with `FinancialValue` construction treated as a labeling act, not a behavioral trigger. |

**Open questions (to resolve at EXEC-SPEC time):**

| ID | Question | Recommendation |
|----|----------|----------------|
| Q-1 | Should `resolveShiftMetricAuthority` live in `mappers.ts` or extracted `authority-routing.ts`? | Keep in `mappers.ts` if only `mappers.ts` calls it. Extract to `authority-routing.ts` if `alerts.ts` needs a direct import (avoid circular import). |
| Q-2 | Should the routing result be discarded (Phase 1.1 internal call only) or embedded on a non-public field for Phase 1.2 readiness? | Discard in Phase 1.1. Do not smuggle routing metadata into the DTO shape. Phase 1.2 calls the same helper at the `FinancialValue` construction site. |
| Q-3 | Does `anomaly-evaluation.test.ts` need amendment as part of WS7B? | Only if mapper refactoring creates a structural conflict. Leave intact unless the conflict is revealed during implementation. |
| Q-4 | Should the corrected route-boundary test add a `hold_percent` fixture alert to verify the null-routing branch? | Yes — add a second alert with `metricType: 'hold_percent'` to exercise the null path at the route boundary without asserting FinancialValue (which does not exist in Phase 1.1). |

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `resolveShiftMetricAuthority(metricType: MetricType)` is implemented with all four WS7A-frozen routing rules, returning `null` for `hold_percent` and `{ type: FinancialAuthority; source: string }` for the three currency metrics
- [ ] `mapAnomalyAlertRow` and `mapShiftAlertRow` both call `resolveShiftMetricAuthority` internally; routing result is not emitted on any public DTO field
- [ ] `getAlerts` in `alerts.ts` calls `mapShiftAlertRow`; inline DTO assembly block (lines 127–157) is deleted; no inline `ShiftAlertDTO` construction remains in `alerts.ts`

**Data & Integrity**
- [ ] `AnomalyAlertDTO` and `ShiftAlertDTO` numeric public fields (`observedValue`, `baselineMedian`, `baselineMad`, `thresholdValue`) remain typed as `number | null` in `dtos.ts` — no `FinancialValue` wrapper applied in this slice
- [ ] `cash_obs_total` static-threshold invariant preserved: test suite asserts `shouldEvaluate = false` and routing source is `pit_cash_observation.extrapolated`
- [ ] `hold_percent → null` invariant is explicitly asserted; bare-ratio identity is preserved

**Security & Access**
- [ ] No new caller-controlled financial authority authorship at any layer
- [ ] Existing auth/RLS posture on shift-intelligence routes unchanged
- [ ] No bridge DTO declared — `AnomalyAlertDTO` and `ShiftAlertDTO` bare-number fields are pre-migration state, not a transitional bridge

**Testing**
- [ ] `mappers.test.ts` contains at least one routing assertion per `MetricType` value (four cases), including explicit `hold_percent → null` assertion
- [ ] `alerts-mappers.test.ts` contains at least one assertion verifying `getAlerts` → `mapShiftAlertRow` delegation
- [ ] Grep confirms no file outside `resolveShiftMetricAuthority` switches on `MetricType` to produce authority-like output — single derivation point enforced, no silent bypass
- [ ] `anomaly-alerts-route-boundary.test.ts` fixture uses `baselineGamingDay`/`baselineCoverage`; zero references to `gamingDay`/`computedAt` at response envelope level remain
- [ ] `npx jest --runInBand --runTestsByPath services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts` exits 0
- [ ] `npm run test:slice:shift-intelligence -- --runInBand` exits 0

**Operational Readiness**
- [ ] `npm run type-check` exits 0; no type regressions in `services/shift-intelligence/`
- [ ] EXEC-SPEC documents serialized workstream ordering for `mappers.ts` → `alerts.ts` changes
- [ ] EXEC-SPEC carries hard prohibitions: no outbound Zod, no FinancialValue on public DTO fields, no route/UI changes, no bridge DTO

**Documentation**
- [ ] `ROLLOUT-PROGRESS.md` Phase 1.1 table updated: WS7B status changed from `🟦 Intake drafted` to implementation status
- [ ] `PRD-070` references `PRD-073` as the WS7B child spec
- [ ] Phase 1.2 deferrals explicitly documented: `AnomalyAlertDTO`/`ShiftAlertDTO` public field wrapping, outbound Zod reopening, route/UI changes
- [ ] WS9 items 4 and 12 confirmed unblocked after slice completes

---

## 9. Related Documents

**Governing intake artifacts**
- `docs/issues/gaps/financial-data-distribution-standard/intake/FIB-FIN-SHIFT-001/FIB-H-FIN-SHIFT-001-shift-intelligence-authority-routing.md`
- `docs/issues/gaps/financial-data-distribution-standard/intake/FIB-FIN-SHIFT-001/FIB-S-FIN-SHIFT-001-shift-intelligence-authority-routing.json`

**Parent and sibling PRDs**
- `docs/10-prd/PRD-070-financial-telemetry-wave1-phase1.1-service-dto-envelope-v0.md` — Phase 1.1 umbrella
- `docs/10-prd/PRD-071-financial-telemetry-wave1-phase1.2-api-envelope-at-wire-v0.md` — Phase 1.2 successor
- `docs/10-prd/PRD-072-financial-telemetry-wave1-phase1.1b-visit-anchored-cents-envelope-v0.md` — Phase 1.1b companion (visit surface)

**Execution**
- `docs/21-exec-spec/PRD-070/EXEC-070-financial-telemetry-wave1-phase1.1-service-dto-envelope.md` — WS7A decision record and WS7B scope; WS9 verification matrix
- `docs/21-exec-spec/PRD-073/` — EXEC-073 to be authored (next action after PRD acceptance)

**Standards and governance**
- `docs/issues/gaps/financial-data-distribution-standard/decisions/TRANSITIONAL-GOVERNANCE-CAVEAT.md` — confirms shift-intelligence bare fields are pre-migration state, not bridge DTOs
- `docs/issues/gaps/financial-data-distribution-standard/actions/BLAST-RADIUS-ASSESSMENT.md` — Wave 1 scope threat registry; Items 7 (`as unknown as` test escapes) and 3 (delta math on bare currency) are directly relevant to this slice (see §7.2)
- `docs/issues/gaps/financial-data-distribution-standard/intake/FIB-FIN-SHIFT-001/patch-delta.md` — Scope containment patch; non-goals §2.3, envelope role restriction §5.2, and R6 §7.3 in this PRD are direct applications of that patch
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-CLASSIFICATION-RULES.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-SURFACE-INVENTORY.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md`
- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`

**Shared primitives consumed (not created) by this slice**
- `types/financial.ts` — `FinancialAuthority` (return type of `resolveShiftMetricAuthority`)
- `lib/financial/schema.ts` — `financialAuthoritySchema` (available if outbound Zod is reopened in Phase 1.2; not used in Phase 1.1)

---

## Appendix A: Frozen Routing Rules (WS7A Source of Truth)

These rules are the authoritative implementation specification for `resolveShiftMetricAuthority`.
Do not re-derive from first principles. Source: `EXEC-070 § WS7 — Shift-Intelligence Expert Outcome`.

| `MetricType` | Return type | Return source | Notes |
|---|---|---|---|
| `drop_total` | `'estimated'` | `'table_session.drop'` | |
| `win_loss_cents` | `'estimated'` | `'table_session.inventory_win'` | |
| `cash_obs_total` | `'estimated'` | `'pit_cash_observation.extrapolated'` | Static-threshold invariant; anomaly evaluation disabled |
| `hold_percent` | `null` | `null` | Bare ratio — never wrapped; Phase 1.1 and Phase 1.2 hard invariant |

---

## Appendix B: Files in Scope

| File | Change type |
|------|-------------|
| `services/shift-intelligence/mappers.ts` | Add `resolveShiftMetricAuthority`; add routing call in `mapAnomalyAlertRow` and `mapShiftAlertRow` |
| `services/shift-intelligence/alerts.ts` | Refactor `getAlerts` to call `mapShiftAlertRow`; delete inline assembly block (lines 127–157) |
| `services/shift-intelligence/__tests__/mappers.test.ts` | Add routing assertion suite (4 MetricType cases + `hold_percent null` + `cash_obs_total` static-threshold) |
| `services/shift-intelligence/__tests__/alerts-mappers.test.ts` | Add `getAlerts → mapShiftAlertRow` delegation assertion |
| `services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts` | Correct fixture (`baselineGamingDay`/`baselineCoverage`); update assertions |
| `services/shift-intelligence/authority-routing.ts` *(optional)* | Extract `resolveShiftMetricAuthority` here if both `mappers.ts` and `alerts.ts` need to import it |

**Files explicitly not in scope (any change is an expansion trigger):**

| File | Reason |
|------|--------|
| `services/shift-intelligence/dtos.ts` | Public DTO shapes frozen |
| `services/shift-intelligence/schemas.ts` | Remains request-only per WS7A waiver |
| `app/api/v1/shift-intelligence/` | Route handlers unchanged; Phase 1.2 |
| `components/shift-intelligence/` | Phase 1.2 + 1.3 |
| `components/shift-dashboard/` | Phase 1.2 + 1.3 |
| `components/admin-alerts/` | Phase 1.2 + 1.3 |
| `supabase/migrations/` | No SQL changes required |

---

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v0 | 2026-04-24 | Vladimir Ivanov | Initial draft from FIB-FIN-SHIFT-001 intake |
