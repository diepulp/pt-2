# PRD-056 Post-Implementation Precis — Alert Maturity

**Date:** 2026-03-25 | **Branch:** `wedge-c` | **Phase:** C-2/C-3 (Wedge C — Shift Intelligence)
**Spec:** PRD-056, EXEC-056, ADR-046 §8/§10 | **SRM:** v4.22.0
**Commit:** `f209b4e` | **Diff:** 25 files, +2,971 / -89 lines

---

## What Was Achieved

PRD-056 promoted anomaly alerts from **ephemeral RPC results** to a **production-quality operational system** with persistence, deduplication, auditable acknowledgment, and quality telemetry. This was the second and third capability phases (C-2, C-3) of Wedge C.

Before this build, anomaly alerts from `rpc_get_anomaly_alerts` existed only in memory — they vanished on page refresh, couldn't be tracked across shifts, and had no audit trail. Pit bosses had no way to acknowledge, annotate, or flag false positives.

### Wedge C Scorecard Impact

| Metric | Before (C-1) | After (C-2/C-3) | Movement |
|--------|-------------|-----------------|----------|
| Wedge C rating | AMBER (80%) | **GREEN (92%)** | +12pp |
| Alert lifecycle | Ephemeral (RPC-only) | **Persistent + forward-only state machine** | Gap closed |
| Acknowledgment | In-memory dismiss (lost on refresh) | **Auditable, role-gated, actor-attributed** | Gap closed |
| Deduplication | None (duplicate alerts per refresh) | **UPSERT + configurable cooldown** | New capability |
| Alert quality telemetry | None | **Aggregate stats + median ack latency** | New capability |
| Readiness states | 4-state | **5-state** (+ compute_failed) | Enhanced |
| Context enrichment | None | **Session count, peak deviation, recommended action** | New capability |

---

## What Exists Now

### Database Layer — 5 Migrations

| Artifact | Description |
|----------|-------------|
| `shift_alert` | Persistent anomaly alerts. Forward-only state machine (`open` → `acknowledged` → `resolved`). Dedup via UNIQUE on `(casino_id, table_id, metric_type, gaming_day)`. Pattern C RLS (SELECT only), DELETE denial, RPC-only mutation surface. |
| `alert_acknowledgment` | Append-only audit trail. Actor attribution via `acknowledged_by` (ADR-024 INV-8). Notes + false-positive flag. Pattern C RLS, DELETE denial. |
| `table_metric_baseline.last_error` | Nullable text column. Populated by compute RPC EXCEPTION handler (truncated 500 chars), cleared on success. Drives `compute_failed` readiness state. |
| `rpc_persist_anomaly_alerts()` | SECURITY DEFINER. Evaluates current anomalies via `rpc_get_anomaly_alerts`, UPSERTs to `shift_alert` with configurable cooldown (floor: 5 minutes). No role gate — any authenticated staff can trigger. Cooldown config from `casino_settings.alert_thresholds.cooldown_minutes`. |
| `rpc_acknowledge_alert()` | SECURITY DEFINER. Role-gated (pit_boss/admin). Three-step contract: existence check → status check → atomic UPDATE. Idempotent re-acknowledgment returns `already_acknowledged: true`. Writes `alert_acknowledgment` audit record. |
| `rpc_get_alert_quality()` | SECURITY INVOKER. Aggregate telemetry: total alerts, acknowledged count, false positive count, median acknowledge latency (via `percentile_cont`). Pattern C RLS enforces casino scope. |
| `rpc_get_anomaly_alerts()` (amended) | **5-state readiness** (`compute_failed` added). **DA P0-1 fix**: explicit `WHERE b.casino_id = v_casino_id` on `bl` CTE — tenant-safe in DEFINER calling chains. **Context enrichment**: `session_count`, `peak_deviation`, `recommended_action`. |
| `rpc_compute_rolling_baseline()` (amended) | `last_error` population on EXCEPTION, cleared on success. |

### Security Posture (SEC Note Controls Verified)

| Control | Implementation |
|---------|---------------|
| C1: Tenant isolation | Pattern C RLS + manual `WHERE casino_id = v_casino_id` in DEFINER bodies |
| C2: Role gate | `pit_boss`/`admin` in `rpc_acknowledge_alert` |
| C3: Actor binding | `app.actor_id` from `set_rls_context_from_staff()` (ADR-024 INV-8) |
| C4: Forward-only state | `WHERE status = 'open'` in UPDATE clause |
| C5: Cooldown floor | `GREATEST(5, config_value)` — 5-minute minimum |
| C6: DELETE denied | `USING (false)` on both tables |
| C7: RPC-only mutation | `REVOKE ALL FROM PUBLIC/anon; GRANT SELECT TO authenticated` |

### Service Layer — `services/shift-intelligence/`

| File | PRD-056 Additions |
|------|-------------------|
| `dtos.ts` | `ShiftAlertDTO`, `AlertAcknowledgmentDTO`, `PersistAlertsResultDTO`, `AcknowledgeAlertResultDTO`, `AlertQualityDTO`, `AlertStatus`, `AlertsQuery`, `PersistAlertsInput`, `AcknowledgeAlertInput`. `ReadinessState` extended with `compute_failed`. |
| `schemas.ts` | `persistAlertsInputSchema`, `acknowledgeAlertSchema`, `alertsQuerySchema` |
| `keys.ts` | `shiftAlerts` scope (gamingDay, status), `alertQuality` scope (startDate, endDate) |
| `mappers.ts` | `mapShiftAlertRow`, `mapAcknowledgmentRow`, `mapPersistResult`, `mapAcknowledgeResult`, `mapAlertQualityResult`. Existing `mapAnomalyAlertRow` extended with `sessionCount`, `peakDeviation`, `recommendedAction`. |
| `alerts.ts` | **New module.** `persistAlerts()`, `acknowledgeAlert()`, `getAlerts()`, `getAlertQuality()`. Error mapping: `SHIFT_ALERT_NOT_FOUND` → NOT_FOUND, `SHIFT_ACKNOWLEDGE_UNAUTHORIZED` → FORBIDDEN. |
| `http.ts` | `fetchPersistAlerts`, `fetchAcknowledgeAlert`, `fetchAlerts`, `fetchAlertQuality`. **BASE path corrected** from `/api/shift-intelligence` to `/api/v1/shift-intelligence` (DA P1-3). |
| `index.ts` | `ShiftIntelligenceServiceInterface` extended with `persistAlerts`, `acknowledgeAlert`, `getAlerts`, `getAlertQuality`. All new DTOs re-exported. |

### API Routes — 3 New Endpoints

| Method | Path | Role Gate | Idempotency | Description |
|--------|------|-----------|-------------|-------------|
| POST | `/api/v1/shift-intelligence/persist-alerts` | None (any staff) | Required | Sync anomaly results to `shift_alert` |
| POST | `/api/v1/shift-intelligence/acknowledge-alert` | pit_boss, admin | Required | Acknowledge alert with notes + false-positive flag |
| GET | `/api/v1/shift-intelligence/alerts` | None | N/A | Query persistent alerts by gaming_day and optional status filter |

### UI Components

| Component | Purpose |
|-----------|---------|
| `acknowledge-alert-dialog.tsx` | Dialog with notes textarea + false-positive checkbox. `useTransition` for submit (React 19). Invalidates `shiftAlerts` query on success. |
| `alerts-page-client.tsx` (modified) | Unified alert list: **Baseline Alerts** section (persistent, with source badge + acknowledge button) above **Cash Observation Alerts** section (ephemeral, with dismiss). Persist-on-mount trigger. Refresh Alerts button. |
| `alerts-panel.tsx` (modified) | Shift dashboard panel extended with baseline alerts section. Persist-on-mount. Refresh button. Acknowledge via shared dialog. Source badge distinguishes baseline vs cash obs. |
| `use-shift-alerts.ts` | React Query hooks: `useShiftAlerts` (query), `usePersistAlerts` (mutation), `useAcknowledgeAlert` (mutation with cache invalidation). |

### Tests — 83 Passing (3 New Suites)

| Suite | Count | Coverage |
|-------|-------|----------|
| `alerts-mappers.test.ts` | 11 | `mapPersistResult`, `mapAcknowledgeResult`, `mapAlertQualityResult` — zero/null/default handling |
| `alerts-schemas.test.ts` | 9 | `persistAlertsInputSchema`, `acknowledgeAlertSchema`, `alertsQuerySchema` — valid/invalid/edge cases |
| `grant-posture-audit.test.ts` | 7 | RLS enabled, RPC grants, DELETE denial, mutation denial structural verification |
| Pre-existing suites | 56 | All green, no regressions |

### Documentation

| Document | Change |
|----------|--------|
| SRM v4.22.0 | `shift_alert`, `alert_acknowledgment` added to ShiftIntelligenceService Owns. 3 new RPCs, 3 new API routes, schema invariants, business rules updated. |

---

## What Is NOT Here (Explicitly Deferred)

| Item | Reason | Reference |
|------|--------|-----------|
| `resolved` state transition | Type-only for forward-compat — no UI, transition logic, or test ships | PRD-056 §4.1 |
| External notifications | Banned by Pilot Containment Protocol | Pilot Containment Audit |
| pg_cron for scheduled persist | Banned by Pilot Containment Protocol | Pilot Containment Audit |
| Cash obs cutover to persistent model | Separate effort post-C3 | ROLLOUT-DEP-MAP |
| Alert escalation chains | Post-MVP | PRD-056 §5 |
| Suppression ratio in quality telemetry | Requires evaluation-cycle logging | PRD-056 §4.3 |
| ML anomaly detection | Out of scope | PRD-056 §5 |

---

## DA Review Findings Honored

The Tier 1 focused review (R1 Security, R3 Implementation) produced 1 P0 and 5 P1 findings. All were patched into the EXEC-SPEC before execution:

| ID | Finding | Resolution |
|----|---------|------------|
| **P0-1** | `bl` CTE in `rpc_get_anomaly_alerts` missing `WHERE casino_id` — DEFINER calling chain bypasses RLS | Added explicit `WHERE b.casino_id = v_casino_id` |
| P1-1 | Grant revocation scope (anon) inconsistent with C-1 | Aligned: `REVOKE FROM PUBLIC` + `REVOKE FROM anon` |
| P1-2 | Cooldown seed missing from migration | Added `UPDATE casino_settings SET alert_thresholds ||= '{"cooldown_minutes": 60}'` |
| P1-3 | http.ts BASE path mismatch (`/api/shift-intelligence` vs `/api/v1/`) | Corrected to `/api/v1/shift-intelligence` |
| P1-4 | `acknowledgedByName` requires staff join | Added `LEFT JOIN staff ON aa.acknowledged_by = staff.id` in `getAlerts()` |
| P1-5 | SRM acceptance criteria missing | SRM v4.22.0 updated with all new artifacts |

---

## Dependency Chain

```
PRD-055 (C-1: Baselines)
  └─ PRD-056 (C-2/C-3: Alert Maturity)  ← YOU ARE HERE
       └─ Future: Alert Escalation, Cash Obs Cutover, Notification Layer
```

---

## Gates Passed

| Gate | Evidence |
|------|----------|
| `npm run db:types-local` | exit 0, all 5 migrations applied |
| `tsc --noEmit` | exit 0, 0 errors |
| `eslint --quiet` | exit 0, 0 errors (after auto-fix) |
| `jest services/shift-intelligence/` | 83/83 pass, 7/7 suites |
| Pre-commit hooks | Migration naming, RPC self-injection, lint-staged all passed |
