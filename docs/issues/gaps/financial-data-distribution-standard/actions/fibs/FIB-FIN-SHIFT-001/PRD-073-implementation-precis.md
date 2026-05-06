## PRD-073: Shift-Intelligence Authority Routing — Delivery Précis

### What This Was (And Was Not)

PRD-073 is **Phase 1.1c — a service-layer-only cleanup slice** closing WS7B under EXEC-070. It implements the MetricType-to-authority routing helper whose rules were frozen in WS7A, unifies the two alert mapper paths, and corrects a stale route-boundary test. It does **not** wrap any public DTO numeric field in `FinancialValue`, add outbound Zod validation, or touch any route handler, UI component, or SQL migration.

**Why this was deferred from PRD-070 WS7B:** WS7A identified the routing rules and recorded them in JSDoc carve-outs. It could not finalize the *implementation path* because two competing assembly paths existed — `mapAnomalyAlertRow` in `mappers.ts` vs. the 36-line `as any` inline block in `getAlerts` in `alerts.ts`. WS7B closes that gap.

**One-line invariant enforced throughout:** *The routing helper expresses intent that Phase 1.2 will consume. Phase 1.1 records the path; it does not walk it.*

---

### Critical Phase Boundary Note

`resolveShiftMetricAuthority` is called via `void` prefix in both mappers — the return value is intentionally discarded. This is Phase 1.1 path unification: both alert flows route through the same switch to establish testability and freeze the mapping table. Phase 1.2 will assign the return value into `FinancialValue` fields on public DTOs.

- `void resolveShiftMetricAuthority(...)` prevents linter removal and marks intentional discard
- The `default: { const _exhaustive: never = metricType; throw new Error(...) }` pattern is a compile-time exhaustiveness gate — adding a fifth `MetricType` value without updating the switch is a type error
- No `FinancialValue` appears on any `AnomalyAlertDTO` or `ShiftAlertDTO` field in this slice

---

### Artifacts Delivered (5 files across 3 workstreams)

**WS1 — Routing Helper + Mapper Unification (`services/shift-intelligence/mappers.ts`)**
- Added `import type { FinancialAuthority } from '@/types/financial'`
- Added exported `resolveShiftMetricAuthority(metricType: MetricType)` — exhaustive switch over all 4 `MetricType` values: `drop_total → { type: 'estimated', source: 'table_session.drop' }`, `win_loss_cents → { type: 'estimated', source: 'table_session.inventory_win' }`, `cash_obs_total → { type: 'estimated', source: 'pit_cash_observation.extrapolated' }` (static-threshold invariant), `hold_percent → null` (bare ratio, never wrapped — RULE-2); `default` branch throws with `never` narrowing
- Added `void resolveShiftMetricAuthority(row.metric_type as MetricType)` call in both `mapAnomalyAlertRow` and `mapShiftAlertRow` before their return statements

**WS2 — `getAlerts` Delegation Refactor (`services/shift-intelligence/alerts.ts`)**
- Added `mapShiftAlertRow` to imports from `./mappers`
- Added module-level join types: `AlertAckQueryRow` (extends `alert_acknowledgment.Row` with `staff: { first_name: string | null; last_name: string | null } | null`) and `AlertQueryRow` (extends `shift_alert.Row` with `alert_acknowledgment: AlertAckQueryRow[] | null` and `gaming_table: { label: string } | null`)
- Replaced 36-line `as any` inline assembly with 10-line delegation: `row as unknown as AlertQueryRow` → pre-normalize `staff_name` from join object into the flat field `mapAcknowledgmentRow` expects → `mapShiftAlertRow(normalizedRow)` → spread `tableLabel` override
- Removed `eslint-disable-next-line @typescript-eslint/no-explicit-any` comment

**WS3 — Test Suite Corrections and Expansion (3 test files)**
- `__tests__/mappers.test.ts` — Added `resolveShiftMetricAuthority` to imports; added `describe('resolveShiftMetricAuthority')` with 5 cases covering all 4 `MetricType` values + unknown→throw (fail-closed invariant per DEC-6)
- `__tests__/alerts-mappers.test.ts` — Added `SupabaseClient`, `Database`, `getAlerts` imports; added `makeMockSupabase` factory (established `as unknown as SupabaseClient<Database>` cast pattern, matches 10+ existing test files); added `describe('getAlerts → mapShiftAlertRow delegation')` with 3 tests: `tableLabel` preserved from `gaming_table.label` join, `acknowledgedByName` assembled from `staff.first_name + last_name`, `acknowledgedByName` null when `staff: null`
- `__tests__/anomaly-alerts-route-boundary.test.ts` — Corrected `ALERTS_FIXTURE` envelope: removed stale `gamingDay`/`computedAt` fields, added `baselineGamingDay: '2026-03-22'` and `baselineCoverage: { withBaseline: 5, withoutBaseline: 2 }`; updated `toMatchObject` assertion to match live `AnomalyAlertsResponseDTO` shape

---

### Spec Governance

| Artifact | Status |
|----------|--------|
| FIB-H | `intake/FIB-FIN-SHIFT-001/FIB-H-FIN-SHIFT-001-shift-intelligence-authority-routing.md` — prose scope authority |
| FIB-S | `intake/FIB-FIN-SHIFT-001/FIB-S-FIN-SHIFT-001-shift-intelligence-authority-routing.json` — machine-readable authority |
| PRD-073 | `docs/10-prd/PRD-073-financial-telemetry-wave1-phase1.1c-shift-intelligence-authority-routing-v0.md` |
| EXEC-073 | `docs/21-exec-spec/PRD-073/EXEC-073-financial-telemetry-wave1-phase1.1c-shift-intelligence-authority-routing.md` (2 patch deltas applied) |
| Patch deltas assessed | `exec-patch-delta-01.md` — §2 rejected (VALID_METRIC_TYPES drift risk), §4 accepted (shadow grep gate), §6 accepted (fail-closed 5th test); `exec-patch-02.md` — §1 rejected (unreachable conditional assertion), §3 accepted (DEC-4 revision: hold_percent verified in mappers.test.ts only, not route-boundary test) |

---

### Validation Results

| Gate | Result |
|------|--------|
| `npm run type-check` | PASS (exit 0) |
| `mappers.test.ts` routing suite | 5 tests PASS |
| `alerts-mappers.test.ts` delegation suite | 3 tests PASS |
| `anomaly-alerts-route-boundary.test.ts` | 4/4 PASS (corrected fixture) |
| Full suite (8 suites / 95 tests) | 95/95 PASS |
| `FinancialValue` on public DTO fields | ABSENT (grep CLEAN) |
| `gamingDay`/`computedAt` at envelope level | ABSENT (grep CLEAN) |
| `as any` in `alerts.ts` | ABSENT (removed) |
| `resolveShiftMetricAuthority` exported | CONFIRMED (`mappers.ts`) |
| `void resolveShiftMetricAuthority` in both mappers | CONFIRMED (source inspection) |

---

### What Is Explicitly Deferred to Phase 1.2

- Assigning `resolveShiftMetricAuthority` return value into `FinancialValue` fields on `AnomalyAlertDTO` or `ShiftAlertDTO`
- Wrapping `observedValue`, `baselineMedian`, `baselineMad`, `thresholdValue` in `FinancialValue`
- Outbound Zod schema for any shift-intelligence DTO response shape
- WS9 verification matrix items 4 and 12 (EXEC-070) — now unblocked by WS7B close; require separate WS9 execution to produce the Phase 1.2 handoff package
