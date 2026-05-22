## PRD-074: Financial Telemetry Wave 1 Phase 1.2B-A — Delivery Précis

### What This Was (And Was Not)

PRD-074 Phase 1.2B-A is a **service-layer canonicalization slice** — it retires BRIDGE-001, promotes shift-intelligence DTOs to typed `FinancialValue` unions, and shape-aligns the three named OpenAPI path entries authored in Phase 1.2A. It does **not** change UI render logic, expand OpenAPI coverage beyond the three named entries, or change database schema.

**One-line invariant enforced throughout:** *`FinancialValue.value` is now integer cents at the service boundary. `hold_percent` is never `FinancialValue` — it is a dimensionless ratio at every layer, all phases.*

**Split boundary:** Phase 1.2B-A closes the service and contract layers. Phase 1.2B-B owns `formatDollars → formatCents` UI render migration and the full 28-route OpenAPI expansion.

---

### BRIDGE-001 Retirement (preserved for Phase 1.2B-B handoff)

BRIDGE-001 is retired as of commit `e83a2c125cf24e33c0c533b9f8bc8e516154cec0`. Key consequences:

- `FinancialValue.value` is **integer cents** at the service boundary (e.g. `7500`, not `75.00`)
- `financialValueSchema.int()` is now active — fractional values are rejected at the mapper boundary
- UI renders in `start-from-previous.tsx` still call `formatDollars(field.value)` — **this is now incorrect** and must be migrated to `formatCents(field.value)` in Phase 1.2B-B
- `formatDollars` calls in UI components will silently display cents as dollars until Phase 1.2B-B ships

**Phase 1.2B-B must migrate:** `formatDollars(session.total_buy_in.value)` → `formatCents(session.total_buy_in.value)` in `start-from-previous.tsx` and any modal that reads these fields.

---

### Q-4 Mechanical Compatibility Exception (FIB-H amendment 2026-04-30)

`anomaly-alert-card.tsx` accessed `alert.baselineMedian.toFixed(1)` directly. After `AnomalyAlertDTO` promotion to a discriminated union, this is a TypeScript compile error because `baselineMedian` is `FinancialValue | number | null` (not `number | null`).

**Authorized fix:** A local `getBaselineNumber(v: FinancialValue | number): number` adapter reads `.value` for financial metrics and passes through bare numbers for `hold_percent`. Formatting, styling, layout, and precision are unchanged. The adapter is a mechanical shape bridge, not a display-semantic change.

---

### Artifacts Delivered (20 files across 4 workstreams)

**WS1 — BRIDGE-001 Service Retirement (`services/visit/`, `services/rating-slip/`)**
- `services/visit/crud.ts` — `centsToDollars` helper: removed `/100` from all three fields (`total_buy_in`, `total_cash_out`, `net`). Each now calls `financialValueSchema.parse({value: s.field, type: 'actual', source: '...', completeness: {...}})` — `int()` validation fires on construction
- `services/rating-slip/mappers.ts` — `toVisitLiveViewDTO`: removed `/100` from all three session fields. Replaced `satisfies FinancialValue` pattern with `financialValueSchema.parse()`. Null guard: `data.field ?? 0` (null DB value → 0-cent integer, not NaN)
- `services/rating-slip/__tests__/mappers.test.ts` — added `toVisitLiveViewDTO` test block: 5 tests proving integer pass-through (`session_total_buy_in: 7500 → value: 7500`), schema validation, completeness, and source provenance

**WS2 — Shift-Intelligence DTO Promotion + Mechanical Compat Fix**
- `services/shift-intelligence/dtos.ts` — `AnomalyAlertDTO` and `ShiftAlertDTO` refactored to discriminated unions on `metricType`. `FinancialMetricType = 'drop_total' | 'win_loss_cents' | 'cash_obs_total'` extracted. Financial variants carry `FinancialValue | null`; `hold_percent` variant retains `number | null` (DEF-NEVER). Both union type aliases carry `eslint-disable` for `no-manual-dto-interfaces` (RPC composites, not table projections)
- `services/shift-intelligence/schemas.ts` — outbound Zod schemas added at bottom: `financialMetricTypeSchema`, `alertBaseSchema`, `anomalyAlertDTOSchema` (`z.union`), `acknowledgmentSchema`, `shiftAlertBaseSchema`, `shiftAlertDTOSchema` (`z.union`). DEF-007 waiver lifted
- `services/shift-intelligence/mappers.ts` — `mapAnomalyAlertRow` and `mapShiftAlertRow` updated: `resolveShiftMetricAuthority` return captured (was discarded with `void`). `authority !== null` branch constructs `FinancialValue` via local `buildFV` helper using `financialValueSchema.parse()`. `authority === null` (`hold_percent`) branch retains bare numbers. Outbound schema parse call at end of each mapper validates the constructed DTO
- `services/shift-intelligence/__tests__/mappers.test.ts` — updated `'maps snake_case alert row'` test to expect `FinancialValue` objects (`{value: 15000, type: 'estimated', source: 'table_session.drop', completeness: {status: 'complete'}}`). Added `'hold_percent carve-out — retains bare number | null (DEF-NEVER)'` test. Total: 13/13 pass
- `components/shift-intelligence/anomaly-alert-card.tsx` — added `import type { FinancialValue } from '@/types/financial'`. Added `getBaselineNumber(v: FinancialValue | number): number` helper. Lines 110–111: `alert.baselineMedian.toFixed(1)` → `getBaselineNumber(alert.baselineMedian).toFixed(1)`, same for `baselineMad`

**WS3 — Contract Shape Alignment (three named path entries + three test files)**
- `docs/25-api-data/api-surface.openapi.yaml` — three named path entries updated:
  - `GET /visits/{visit_id}/live-view`: endpoint description updated to "BRIDGE-001 retired (Phase 1.2B-A)"; `session_total_buy_in/cash_out/net` descriptions updated to "integer cents"
  - `GET /players/{player_id}/recent-sessions`: same pattern on `total_buy_in/cash_out/net`
  - `GET /shift-intelligence/anomaly-alerts`: endpoint description updated; `observedValue/baselineMedian/baselineMad/thresholdValue` changed from `type: number` to `oneOf: [$ref FinancialValue, type: number]` with discriminated-shape description. Shared `FinancialValue` component not modified (Phase 1.2B-B scope)
- `app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts` — fixture updated from dollar floats (`value: 75.0`) to integer cents (`value: 7500`). Key-presence assertions (`typeof === 'number'`) replaced with integer-value assertions (`toBe(7500)`, `toBe(0)`, `toBe(-7500)`)
- `app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts` — same pattern: `value: 500.0 → 50000`, `value: 450.0 → 45000`, `value: -50.0 → -5000`
- `services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts` — `ALERTS_FIXTURE` updated: `drop_total` alert fields now carry `FinancialValue` objects; `hold_percent` alert added. `toHaveLength(1) → toHaveLength(2)`. DEC-5 test replaced with `'DEC-5 (EXEC-074): discriminated shape'` asserting `observedValue.value === 15000` for financial metric and `typeof observedValue === 'number'` for hold_percent

**WS4 — Rollout Tracker Closure**
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json` — DEF-001, DEF-002, DEF-003, DEF-007 closed with `commit_sha: e83a2c125cf24e33c0c533b9f8bc8e516154cec0`. BRIDGE-001 moved from `active_bridges` to `retired_bridges` with same SHA. Phase 1.2B entry updated to `partial_complete` with Phase 1.2B-A exit recorded. Cursor updated to reflect Phase 1.2B-A closed, Phase 1.2B-B pending.

---

### Spec Governance

| Artifact | Status |
|----------|--------|
| FIB-H | `actions/fibs/phase-1-2b/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-2B-CANONICALIZATION.md` — amended 2026-04-30 with Mechanical Compatibility Exception |
| FIB-S | `actions/fibs/phase-1-2b/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-2B-CANONICALIZATION.json` — frozen scope authority |
| PRD-074 | `docs/10-prd/PRD-074-financial-telemetry-wave1-phase1.2b-canonicalization-v0.md` |
| EXEC-074 | `docs/21-exec-spec/PRD-074/EXEC-074-financial-telemetry-wave1-phase1.2b-canonicalization.md` |

---

### Validation Results

| Gate | Result |
|------|--------|
| `npm run type-check` | PASS (exit 0) |
| `services/shift-intelligence/__tests__/mappers.test.ts` | 13/13 PASS |
| `services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts` | 5/5 PASS |
| `app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts` | 1/1 PASS |
| `app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts` | 1/1 PASS |
| `/100` in `services/visit/crud.ts` | ABSENT (grep CLEAN) |
| `/100` in `services/rating-slip/mappers.ts` | ABSENT (grep CLEAN) |
| `hold_percent` wrapped in `FinancialValue` | ABSENT (grep CLEAN — DEF-NEVER confirmed) |
| Pre-commit hooks (ESLint + Prettier + custom rules) | PASS |
| Implementation commit | `e83a2c125cf24e33c0c533b9f8bc8e516154cec0` |
| Tracker commit | `63dd8e26` |

---

### What Is Explicitly Deferred to Phase 1.2B-B

- **UI render migration**: `formatDollars(field.value)` → `formatCents(field.value)` in `start-from-previous.tsx`, rating-slip modal, and any other component reading `RecentSessionDTO`/`VisitLiveViewDTO` financial fields
- **Full 28-route OpenAPI expansion**: Only three named path entries were in scope for Phase 1.2B-A; the remaining 25 routes remain unannotated
- **Full 4-case route-boundary test matrices**: Unauthorized, invalid-params, 404, and pagination cases for live-view and recent-sessions routes
- **Runtime deprecation observability**: Structured log events per deprecated-field usage (was in PRD-074 pending scope)
- **`GET /api/v1/shift-intelligence/alerts` OpenAPI/route-boundary coverage**: No Phase 1.2A-authored path entry or route-boundary test exists; requires FIB amendment or successor slice (DEC-6 recorded in EXEC-074)
- **`components/schemas/FinancialValue` shared component contract amendment**: Named path-entry descriptions carry the Phase 1.2B-A note until the shared component is updated
