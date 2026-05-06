# Feature Intake Brief

## A. Feature identity
- **Feature name:** Shift-Intelligence Internal Authority Routing (WS7B)
- **Feature ID / shorthand:** FIB-H-FIN-SHIFT-001
- **Related wedge / phase / slice:** Financial Data Distribution — Wave 1 Phase 1.1 (internal service only; public field-shape change deferred to Phase 1.2)
- **Requester / owner:** Vladimir Ivanov
- **Date opened:** 2026-04-24
- **Priority:** P1 — Phase 1.1 closing dependency (WS7B gate; WS9 blocked until this closes)
- **Target decision horizon:** Phase 1.1 close
- **Supporting artifact:** `docs/issues/gaps/financial-data-distribution-standard/intake/FIB-S-FIN-SHIFT-001-shift-intelligence-authority-routing.json`
- **Lead-architect disposition:** Pending — intake stage
- **Parent PRD:** `docs/10-prd/PRD-070-financial-telemetry-wave1-phase1.1-service-dto-envelope-v0.md` (umbrella Phase 1.1)
- **Parent EXEC-SPEC:** `docs/21-exec-spec/PRD-070/EXEC-070-financial-telemetry-wave1-phase1.1-service-dto-envelope.md` (WS7B — redefined here)
- **WS7A decision record:** EXEC-070 § Planning Lock Resolution (routing rules frozen 2026-04-24)

## B. Operator problem statement
EXEC-070 WS7A froze the MetricType-to-authority routing rules for `services/shift-intelligence/` and issued a Phase 1.1 waiver deferring public DTO field-shape changes to Phase 1.2. WS7B was then deferred to this child spec because it is a distinct bounded context with a distinct pattern from FIB-FIN-CENTS-001 (internal routing helper + alert path parity, not shape conversion).

Three concrete defects now exist in `services/shift-intelligence/` that WS7B must close regardless of the public-shape deferral:

1. **No routing helper exists.** The four frozen routing rules (`drop_total → estimated / table_session.drop`, `win_loss_cents → estimated / table_session.inventory_win`, `cash_obs_total → estimated / pit_cash_observation.extrapolated`, `hold_percent → bare ratio, never wrapped`) are documented in EXEC-070 but are not implemented anywhere. Phase 1.2 cannot wrap the deferred public fields without this helper; building it in WS7B ensures the mapping is testable and auditable before wrapping begins.

2. **`getAlerts` assembles `ShiftAlertDTO` inline.** `services/shift-intelligence/alerts.ts` constructs the DTO directly (lines 127–157) without calling `mapShiftAlertRow`. This means the anomaly-alert path (via `mapAnomalyAlertRow`) and the persistent-alert path (via `getAlerts` inline assembly) are structurally divergent. When Phase 1.2 wraps the deferred public fields, two separate code paths must be updated instead of one mapper. EXEC-070 explicitly identifies this as a mandatory remediation regardless of deferral.

3. **`anomaly-alerts-route-boundary.test.ts` is stale.** The test fixture (line 46–50) and assertion (lines 119–130) reference `gamingDay` and `computedAt` keys that do not exist on the current `AnomalyAlertsResponseDTO`. The live response shape uses `baselineGamingDay` (string) and `baselineCoverage` (`{ withBaseline: number; withoutBaseline: number }`) per `services/shift-intelligence/dtos.ts`. The test passes against a mock that returns wrong-shape data, providing false assurance at the route boundary. EXEC-070 lists correction of this test as a mandatory WS7B / WS9 deliverable.

## C. Pilot-fit / current-slice justification
This slice is the internal correctness gate for `services/shift-intelligence/` that must close before WS9 (Phase 1.1 verification matrix) can run its full matrix. It is coherent as a single slice because: (a) all three deliverables live entirely within `services/shift-intelligence/` — no route handler, no UI, no SQL changes; (b) the routing helper is the single shared primitive both mapper paths (`mapAnomalyAlertRow` and `mapShiftAlertRow`) need before Phase 1.2 can wrap public fields; (c) the stale route-boundary test is a correctness defect, not a Phase 1.2 obligation — it must be fixed whenever the mapper path is touched, and WS7B is the correct time. Unlike FIB-FIN-CENTS-001, which performed shape conversion across service/route/UI layers, this slice performs no shape conversion. No public-facing DTO changes. No route changes. No bridge DTO is created or amended.

The Transitional DTO Governance Caveat (`docs/issues/gaps/financial-data-distribution-standard/decisions/TRANSITIONAL-GOVERNANCE-CAVEAT.md`) is in scope as a reference: the bare-number fields on `AnomalyAlertDTO` and `ShiftAlertDTO` are **not** bridge DTOs under that caveat. The caveat covers the visit-surface envelope bridge declared by PRD-072. The shift-intelligence bare fields are pre-migration state; Phase 1.2 will wrap them directly without a bridge. This slice introduces no bridge DTO.

## D. Primary actor and operator moment
- **Primary actor:** (direct) backend-service-builder applying routing rules and mapper unification; (indirect) qa-specialist running the WS9 verification matrix
- **When does this happen?** During Phase 1.1b execution; no operator-visible behavior change — the public API response is identical before and after; the routing helper is internal infrastructure
- **Primary surface:** service layer only — `services/shift-intelligence/mappers.ts`, `services/shift-intelligence/alerts.ts`, `services/shift-intelligence/__tests__/`
- **Trigger event:** MetricType value on an RPC row → `resolveShiftMetricAuthority` returns authority metadata → mapper uses it internally → Phase 1.2 wraps the public DTO fields using the same helper

## E. Feature Containment Loop
1. `mapAnomalyAlertRow` receives an `AlertRow` from `rpc_get_anomaly_alerts`. `row.metric_type` is one of `'drop_total' | 'hold_percent' | 'cash_obs_total' | 'win_loss_cents'`.
2. `resolveShiftMetricAuthority(metricType)` (new function in `mappers.ts`, or extracted to a sibling file if both mappers and alerts need to import it) returns `{ type: FinancialAuthority; source: string }` for the three currency metrics and `null` for `hold_percent` (bare ratio, never wrapped).
3. `mapAnomalyAlertRow` uses the routing result internally. Public fields (`observedValue`, `baselineMedian`, etc.) remain typed as `number | null` per the Phase 1.2 deferral register in EXEC-070. No FinancialValue wrapper is applied to public fields in this slice.
4. `mapShiftAlertRow` in `mappers.ts` uses the same routing helper for its internal logic. This ensures both mapper paths are consistent and Phase 1.2 has a single update point.
5. `getAlerts` in `alerts.ts` is refactored to call `mapShiftAlertRow` from `mappers.ts` instead of inline assembly. The inline DTO construction block (lines 127–157) is deleted.
6. `anomaly-alerts-route-boundary.test.ts` fixture is corrected: `gamingDay` and `computedAt` keys removed; `baselineGamingDay` (string) and `baselineCoverage: { withBaseline: number; withoutBaseline: number }` added to match `AnomalyAlertsResponseDTO`. Assertions updated to assert `body.data.baselineGamingDay` and `body.data.baselineCoverage`.
7. `services/shift-intelligence/__tests__/mappers.test.ts` extended with explicit routing assertions for all four MetricType values: `drop_total` → `{ type: 'estimated', source: 'table_session.drop' }`, `win_loss_cents` → `{ type: 'estimated', source: 'table_session.inventory_win' }`, `cash_obs_total` → `{ type: 'estimated', source: 'pit_cash_observation.extrapolated' }`, `hold_percent` → `null`.
8. `services/shift-intelligence/__tests__/alerts-mappers.test.ts` extended with a test asserting that `mapShiftAlertRow` is the path called by `getAlerts` (integration-style or by verifying the shared mapper call).
9. WS9 items 4 and 12 (`npm run test:slice:shift-intelligence` and `anomaly-alerts-route-boundary.test.ts`) unblock.

## F. Required outcomes
- **Routing helper implemented:** `resolveShiftMetricAuthority(metricType: MetricType): { type: FinancialAuthority; source: string } | null` covers all four `MetricType` values with the exact WS7A-frozen rules. Returns `null` for `hold_percent`.
- **Mapper path unified:** `mapAnomalyAlertRow` and `mapShiftAlertRow` both call `resolveShiftMetricAuthority`. `getAlerts` calls `mapShiftAlertRow` — the inline DTO assembly block is deleted.
- **`cash_obs_total` static-threshold behavior preserved:** `cash_obs_total` maps to `estimated / pit_cash_observation.extrapolated` and the test suite asserts it never triggers anomaly evaluation (preserving the `anomaly-evaluation.test.ts` intent: `shouldEvaluate = metricType !== 'cash_obs_total'` → `false`).
- **Stale test corrected:** `anomaly-alerts-route-boundary.test.ts` ALERTS_FIXTURE uses `baselineGamingDay`/`baselineCoverage`; assertions match `AnomalyAlertsResponseDTO` shape. Zero references to `gamingDay` (at response envelope level) or `computedAt` remain in this test file.
- **Routing test coverage:** `mappers.test.ts` has at least one explicit assertion per MetricType routing rule, including an assertion that `hold_percent` returns `null` (bare ratio invariant).
- **No public DTO change:** `AnomalyAlertDTO` and `ShiftAlertDTO` public fields remain typed exactly as they are in `dtos.ts`. No FinancialValue wrapper on public fields. No change to the response emitted by any route handler.
- **No new outbound Zod:** `schemas.ts` remains request-only per WS7A waiver. No `z.object({ observedValue: financialValueSchema... })` added.
- **Type-check passes:** `npm run type-check` exits 0 after all changes.
- **Test slice passes:** `npm run test:slice:shift-intelligence -- --runInBand` exits 0.
- **Boundary test passes:** `npx jest --runInBand --runTestsByPath services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts` exits 0.

## G. Explicit exclusions
- `AnomalyAlertDTO.observedValue`, `baselineMedian`, `baselineMad`, `thresholdValue` wrapping in `FinancialValue` — Phase 1.2, per GATE-070.6 and the Phase 1.2 Deferral Register in EXEC-070.
- `ShiftAlertDTO.observedValue`, `baselineMedian`, `baselineMad` wrapping — Phase 1.2, same gate.
- Outbound Zod schemas for `AnomalyAlertDTO` or `ShiftAlertDTO` — Phase 1.1 waiver per WS7A in `schemas.ts`.
- Route handler changes (`app/api/v1/shift-intelligence/anomaly-alerts/route.ts`, `app/api/v1/shift-intelligence/alerts/route.ts`) — Phase 1.2.
- UI component changes (`components/shift-intelligence/anomaly-alert-card.tsx`, `components/shift-dashboard/alerts-panel.tsx`, `components/admin-alerts/`) — Phase 1.2 + 1.3.
- `BaselineDTO` field migration — `medianValue`, `madValue`, `minValue`, `maxValue` do not currently cross a public HTTP boundary; out of Phase 1.1 exception set per EXEC-070 Planning Lock Resolution.
- SQL migrations — no schema changes for an internal routing helper; `rpc_get_anomaly_alerts` RPC signature and return type are unchanged.
- New bridge DTO declaration — this slice introduces no bridge DTOs under the Transitional DTO Governance Caveat. The existing bare-number fields are pre-migration state, not a transitional bridge.
- WS9 verification matrix execution — WS9 stays under parent EXEC-070 as the closing gate; it runs after this slice closes.
- `baseline.ts` and `baseline-computation.test.ts` — baseline service does not carry currency fields requiring envelope treatment in Phase 1.1.
- `http.ts` (`ServiceHttpResult` wrappers) — service HTTP layer is unchanged.
- `anomaly-evaluation.test.ts` inline logic functions — these test the anomaly detection algorithm expressed as local functions, not mapper paths. They remain as-is unless WS7B implementation reveals a structural conflict. If `anomaly-evaluation.test.ts` needs updating due to mapper refactoring, that is in scope; otherwise leave intact.

## H. Adjacent ideas considered and rejected
| Idea | Why it came up | Why it is out now |
|---|---|---|
| Bundle WS7B into FIB-FIN-CENTS-001 | All remaining Phase 1.1 work | Different bounded context, different pattern (mapper helper vs shape conversion); bundling would defeat the manageable-slice goal per EXEC-070 Amendment 1 rationale |
| Wrap `observedValue` et al. in `FinancialValue` now | Phase 1.2 will have to do it anyway | GATE-070.6 deferred explicitly because these fields cross live HTTP/UI boundaries; doing it now triggers the full route+UI+component-test bundle that Phase 1.2 owns |
| Add outbound Zod schema for `AnomalyAlertDTO` | Consistent with WS1 pattern | WS7A explicitly waived this; adding it now entangles internal routing (WS7B) with the deferred public-shape decision — reopen trigger rule applies |
| Leave `getAlerts` inline assembly, fix in Phase 1.2 | Smaller diff | EXEC-070 explicitly flags this as mandatory WS7B remediation regardless of deferral; leaving it creates two divergent update paths for Phase 1.2 |
| Declare a bridge DTO for bare-number shift-intelligence fields | Aligns with Transitional Governance Caveat pattern | The caveat covers intentional phase-bounded dollar-float bridges (PRD-072). Bare numbers in shift-intelligence are deferred canonical state, not a transitional bridge. Declaring a bridge here would create governance debt without adding correctness. |
| Fix stale route boundary test in WS9 instead of WS7B | WS9 is the verification gate anyway | WS9 cannot run item 12 at all if the fixture is wrong — fixing the test is a precondition for running it, not a phase-close nicety |
| Extract `resolveShiftMetricAuthority` to a shared `lib/financial/` helper | Keeps authority logic centralized | Shift-intelligence routing rules are service-private (source strings reference internal metric identifiers, not canonical DTO field names); elevating to `lib/` would imply broader applicability that doesn't exist yet |

## I. Dependencies and assumptions
- **WS7A decision record landed:** EXEC-070 § Planning Lock Resolution contains the frozen routing rules. These are the authoritative source for this slice — do not re-derive or alter them.
- **WS1 primitives landed:** `lib/financial/schema.ts` exports `financialAuthoritySchema`; `types/financial.ts` exports `FinancialAuthority`. `resolveShiftMetricAuthority` must use these types for the return value — not redefine them.
- **`FinancialAuthority` union:** includes `'estimated'` as a valid value per `types/financial.ts`. Verify before implementation.
- **No aliased `gamingDay` field on route response:** the `anomaly-alerts/route.ts` handler passes through whatever `getAnomalyAlerts` returns. After correcting the test fixture, the test will assert against the actual response shape — no route change needed.
- **`mappers.ts` is the single mapper file for this bounded context:** both `mapAnomalyAlertRow` (anomaly path) and `mapShiftAlertRow` (persistent alert path) live there. `alerts.ts` imports from `mappers.ts` already (for `mapPersistResult`, `mapAcknowledgeResult`, `mapAlertQualityResult`). Importing `mapShiftAlertRow` from `mappers.ts` inside `alerts.ts` is already the established pattern.
- **`getAlerts` inline assembly is the only divergent path:** no other function in `alerts.ts` assembles a `ShiftAlertDTO` inline. The refactor is localized to lines 127–157 of `alerts.ts`.
- **No SQL migration required:** `rpc_get_anomaly_alerts` already returns `metric_type` as a string column; the routing helper is pure TypeScript.
- **`test:slice:shift-intelligence` npm script exists:** confirmed from EXEC-070 WS9 verification matrix. The slice script runs `services/shift-intelligence/__tests__/` suite.

## J. Out-of-scope but likely next
- WS9 — Phase 1.1 verification matrix full run across all slices (items 4 and 12 unblock after this FIB closes); produces Phase 1.2 handoff package under parent EXEC-070.
- Phase 1.2 shift-intelligence API cleanup slice — wraps `AnomalyAlertDTO.observedValue`, `baselineMedian`, `baselineMad`, `thresholdValue` and `ShiftAlertDTO.observedValue`, `baselineMedian`, `baselineMad` using the routing helper built here; updates the route handlers; adds outbound Zod per the waiver-reopen procedure; coordinates UI component updates.
- Phase 1.2 broad API envelope migration across remaining routes.
- Phase 1.3 `<FinancialValue>` / `<AttributionRatio>` / `<CompletenessBadge>` component rollout.

## K. Expansion trigger rule
Amend this brief if any downstream artifact proposes: (a) wrapping `AnomalyAlertDTO` or `ShiftAlertDTO` public numeric fields in `FinancialValue` during this slice (Phase 1.2 scope — requires EXEC-SPEC amendment reopening GATE-070.6); (b) adding outbound Zod schemas to `schemas.ts` for `AnomalyAlertDTO` or related response types (WS7A waiver must be formally reopened with lead-architect sign-off before execution); (c) route handler changes in `app/api/v1/shift-intelligence/` (Phase 1.2 scope); (d) UI component changes in `components/shift-intelligence/` or `components/shift-dashboard/` (Phase 1.2 + 1.3 scope); (e) declaring a bridge DTO for shift-intelligence numeric fields under the Transitional Governance Caveat (Phase 1.2 will do a direct wrap, not a bridge); (f) parallel execution of anomaly mapper and alert mapper refactoring touching `mappers.ts` and `alerts.ts` simultaneously without the serialization invariant being explicit in the EXEC-SPEC; (g) widening scope to include `BaselineDTO` numeric fields in the routing implementation (not in Phase 1.1 exception set).
