---
id: PRD-056
title: Alert Maturity — Persistent Alerts, Deduplication & Quality (C-2/C-3)
owner: Engineering
status: Draft
affects: [ADR-046, ADR-018, ADR-024, SEC-NOTE-alert-maturity, PRD-055]
created: 2026-03-24
last_review: 2026-03-24
phase: Phase C-2/C-3 (Wedge C — Shift Intelligence)
pattern: A
http_boundary: true
scaffold_ref: docs/01-scaffolds/SCAFFOLD-005-alert-maturity.md
adr_refs: [ADR-046 (amendment §8 + §10)]
---

# PRD-056 — Alert Maturity: Persistent Alerts, Deduplication & Quality (C-2/C-3)

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Summary:** Phase C-1 (PRD-055) delivered baseline computation and ephemeral anomaly detection. This PRD delivers three capabilities that promote anomaly alerts from ephemeral RPC results to a production-quality operational system: (1) persistent alert storage with a forward-only state machine and deduplication, (2) auditable acknowledgment with role-gated actor attribution, and (3) alert quality telemetry that validates signal-to-noise ratio. Work is organized in two parallel tracks: Track A (C-2) delivers schema, RPCs, dedup, and `/admin/alerts` wiring; Track B (C-3) delivers context enrichment, shift dashboard wiring, and quality telemetry. This also delivers the `compute_failed` readiness state deferred from C-1.

---

## 2. Problem & Goals

### 2.1 Problem

Phase C-1 can detect per-table anomalies, but the alerts exist only as RPC response rows. Three operational gaps block production-quality shift intelligence:

1. **Ephemeral alerts.** `rpc_get_anomaly_alerts` returns anomaly data in the response payload. On page refresh, the alert is gone. A pit boss who reviews an alert at 2pm has no record at 3pm. No history, no state, no acknowledgment trail.

2. **Alert fatigue.** `useAnomalyAlerts` refetches every 30 seconds. Every refetch finding the same above-threshold condition produces the same alert — ~120 identical impressions per hour per anomalous table. No deduplication, no cooldown, no suppression.

3. **No quality signal.** Without metrics on false-positive rate, acknowledge latency, and suppression ratio, there is no evidence alerts are trustworthy. The Pilot Containment Protocol requires validated alert quality before any external notification channel ships.

Additionally, `compute_failed` was deferred from C-1 (ADR-046 §8 note). Without it, computation errors surface as `missing` — indistinguishable from "never computed." Operators cannot troubleshoot failures.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Anomaly alerts persist across page refreshes | `shift_alert` row survives browser reload with correct state |
| **G2**: Same anomaly fires at most once per cooldown window | Dedup key `(casino_id, table_id, metric_type, gaming_day)` + cooldown suppression reduces write load from ~120/hr to ~1/hr |
| **G3**: Acknowledgment creates an auditable record | `alert_acknowledgment` row with actor attribution derived from session context (ADR-024 INV-8) |
| **G4**: `compute_failed` is distinguishable from `missing` | `last_error IS NOT NULL` on `table_metric_baseline` produces distinct readiness state |
| **G5**: Alert quality telemetry is queryable | False-positive rate and acknowledge latency derivable from persisted data. Suppression ratio deferred — requires evaluation-cycle logging not in current data model |
| **G6**: Wedge C scorecard reaches GREEN | 85%+ after Track A, 92%+ after Track B |

### 2.3 Non-Goals

- External notification channels (Slack, email, SMS, push) — separate post-C3 effort, banned by Pilot Containment Protocol
- pg_cron baseline scheduler — manual trigger remains the pilot workaround
- Cash obs baseline cutover — static threshold authority remains (`rpc_shift_cash_obs_alerts`)
- Alert escalation chains — single-tier acknowledgment only
- Historical trend visualization charts
- Multi-casino alert aggregation (company-level rollup)
- ML-based anomaly detection
- `resolved` transition automation (auto-resolve on new gaming day) — CHECK includes the value; no RPC or UI ships

---

## 3. Users & Use Cases

- **Primary users:** Pit Boss, Admin

**Top Jobs:**

- As a **Pit Boss**, I need anomaly alerts to persist across page refreshes so that I can return to an alert after stepping away without losing context.
- As a **Pit Boss**, I need to acknowledge an alert with optional notes and a false-positive flag so that the acknowledgment creates an auditable record and suppresses repeat display.
- As a **Pit Boss**, I need the same anomaly to fire once per cooldown window (not 120 times/hour) so that I can focus on new anomalies rather than dismissing duplicates.
- As an **Admin**, I need alert quality telemetry (false-positive rate, acknowledge latency) so that I can validate signal quality before proposing external notification channels.
- As a **Pit Boss**, I need to see whether a baseline computation failed (vs. never ran) so that I can request recomputation rather than waiting indefinitely.

**Unhappy Paths:**

- As a **Pit Boss**, when two operators attempt to acknowledge the same alert simultaneously, I need the system to produce one transition and one audit record — not duplicate or inconsistent state.
- As a **Pit Boss**, when I'm a dealer or cashier, the acknowledge action must be denied — only pit_boss and admin roles can acknowledge.

---

## 4. Scope & Feature List

### 4.1 In Scope

**Track A (C-2): Schema + RPCs + Dedup + /admin/alerts Wiring**

- A1: Create `shift_alert` table with Pattern C hybrid RLS, composite UNIQUE dedup key, DELETE denial
- A2: Create `alert_acknowledgment` table with Pattern C hybrid RLS, append-only (no UPDATE/DELETE), DELETE denial
- A3: Alter `table_metric_baseline` — add `last_error text` column for `compute_failed` readiness state
- A4: Amend `rpc_compute_rolling_baseline` — populate `last_error` on failure, clear on success
- A5: Amend `rpc_get_anomaly_alerts` — return `compute_failed` readiness state (5-state model per ADR-046 §8 amendment)
- A6: Create `rpc_persist_anomaly_alerts()` — SECURITY DEFINER, UPSERTs anomaly results into `shift_alert` with dedup + cooldown suppression
- A7: Create `rpc_acknowledge_alert()` — SECURITY DEFINER, role-gated (pit_boss/admin), atomic state transition, actor attribution from session context
- A8: Route handlers: `POST /api/shift-intelligence/persist-alerts`, `POST /api/shift-intelligence/acknowledge-alert`, `GET /api/shift-intelligence/alerts`
- A9: Service layer extensions: `ShiftAlertDTO`, `AlertAcknowledgmentDTO`, schemas, mappers, `alerts.ts`, http wrappers
- A10: Wire `AnomalyAlertCard` + `BaselineCoverageBanner` into `/admin/alerts` page — replace in-memory dismiss with persistent acknowledge, show acknowledged alerts greyed out

**Track B (C-3): Context Enrichment + Dashboard Wiring + Quality Telemetry**

- B1: Amend `rpc_get_anomaly_alerts` — add context enrichment columns (session count, peak deviation, recommended action)
- B2: Wire `AnomalyAlertCard` + `useAnomalyAlerts` into shift dashboard `alerts-panel.tsx` alongside existing cash obs alerts
- B3: Wire `RecomputeBaselinesButton` into `/admin/settings`
- B4: `AlertQualityDTO` + query: false-positive rate, acknowledge latency (suppression ratio deferred — requires evaluation-cycle logging)
- B5: Grant posture audit: validate `REVOKE EXECUTE FROM PUBLIC` on all new RPCs, direct mutation grants revoked (added during PRD phase as explicit security checkpoint beyond SCAFFOLD-005 B1-B3)

### 4.2 Out of Scope

- External notifications — banned by Pilot Containment Protocol until quality telemetry validates signal
- pg_cron baseline scheduler — manual trigger is pilot workaround
- Cash obs baseline cutover — static threshold authority remains
- `resolved` state transition (auto-resolve, explicit resolve RPC) — CHECK includes it; no path ships
- Alert data retention/archival — volume low at pilot scale (~6K rows/month)
- `last_error` content sanitization — acceptable for staff-only visibility during pilot
- New top-level UI pages — wire into existing surfaces only

---

## 5. Requirements

### 5.1 Functional Requirements

- **FR-1:** `shift_alert` table persists anomaly alerts with state machine (`open` → `acknowledged`). `resolved` is in CHECK for forward-compat but has no transition in MVP.
- **FR-2:** Composite UNIQUE on `(casino_id, table_id, metric_type, gaming_day)` — one alert per anomaly per gaming day. `rpc_persist_anomaly_alerts` uses `ON CONFLICT ... DO UPDATE` to update severity/deviation if magnitude changes.
- **FR-3:** Time-based cooldown: if `shift_alert.updated_at` is within `cooldown_minutes` of `now()`, skip UPSERT. Config: `casino_settings.alert_thresholds.cooldown_minutes` (default 60). Server-side floor of 5 minutes: if `cooldown_minutes` resolves to less than 5, use 5 (SEC Note T5/C5).
- **FR-4:** `rpc_persist_anomaly_alerts()` is SECURITY DEFINER. Calls `set_rls_context_from_staff()`. Internally evaluates anomalies then UPSERTs into `shift_alert` with explicit `WHERE casino_id = v_casino_id`.
- **FR-5:** Persist trigger is explicit — on page load + manual "Refresh Alerts" action. Not piggybacked on 30s refetch cycle.
- **FR-6:** `rpc_acknowledge_alert()` is SECURITY DEFINER. Role gate: `v_role IN ('pit_boss', 'admin')`. `acknowledged_by` derived from `app.actor_id` — no spoofable parameter (ADR-024 INV-8).
- **FR-7:** Atomic acknowledgment: `UPDATE shift_alert SET status = 'acknowledged' WHERE id = p_alert_id AND status = 'open'`. Zero rows updated = idempotent success (returns current state with `already_acknowledged: true`). `alert_acknowledgment` record written only after successful transition. No error on re-acknowledgment — concurrent or stale clients receive the same idempotent response.
- **FR-8:** `alert_acknowledgment` is append-only. No UPDATE or DELETE grants. Includes `is_false_positive boolean NOT NULL DEFAULT false`.
- **FR-9:** `table_metric_baseline.last_error` is nullable text, truncated to 500 chars. Populated on computation failure, cleared on success. When `last_error IS NOT NULL`, readiness state = `compute_failed`.
- **FR-10:** `rpc_get_anomaly_alerts` readiness derivation updated to 5 states: `ready`, `stale`, `missing`, `insufficient_data`, `compute_failed` (per ADR-046 §8 amendment).
- **FR-11:** `/admin/alerts` page displays both ephemeral cash obs alerts (from `rpc_shift_cash_obs_alerts`) and persistent baseline alerts (from `shift_alert`). Unified list with source indicator badge. Cash obs alerts render ephemerally; baseline alerts render from persisted state.
- **FR-12:** Alert quality telemetry derivable from persisted data: false-positive count via `COUNT(*) FILTER (WHERE is_false_positive)` on `alert_acknowledgment`, median acknowledge latency via `alert_acknowledgment.created_at - shift_alert.created_at`. Suppression ratio is **not** derivable from the current data model — `suppressed_count` is a per-cycle RPC return value, not persisted. Suppression ratio is deferred to post-MVP when evaluation-cycle logging exists. MVP telemetry: false-positive rate + acknowledge latency only.

### 5.2 Non-Functional Requirements

- **NFR-1:** Persist path completes within 500ms for 50 tables (with cooldown suppression, most UPSERTs skipped)
- **NFR-2:** Acknowledge path completes within 50ms (single UPDATE + INSERT)
- **NFR-3:** Alert read path (SELECT + LEFT JOIN) completes within 100ms. Index on `(casino_id, gaming_day, status)`.
- **NFR-4:** Quality telemetry query acceptable at 1-2s — not on critical dashboard path
- **NFR-5:** Both new RPCs: `REVOKE EXECUTE FROM PUBLIC`; `GRANT EXECUTE` to `authenticated` and `service_role` only
- **NFR-6:** No direct INSERT/UPDATE/DELETE grants on `shift_alert` or `alert_acknowledgment` for non-owner roles

> Architecture details: See RFC-005, ADR-046 (amendment §8 + §10), SEC Note (alert-maturity)
> DTO shapes: See RFC-005 §4.4 (`ShiftAlertDTO`, `AlertAcknowledgmentDTO`, `AlertQualityDTO`)
> API request/response contracts: See RFC-005 §4.5

---

## 6. UX / Flow Overview

**Flow 1: Pit Boss Views Persistent Alerts**
1. Pit boss opens `/admin/alerts` or shift dashboard
2. Page load triggers `POST /api/shift-intelligence/persist-alerts` (explicit persist)
3. `rpc_persist_anomaly_alerts` evaluates anomalies, UPSERTs new/updated alerts (skips cooldown-suppressed)
4. `GET /api/shift-intelligence/alerts?gaming_day=...` fetches persisted alerts with acknowledgment join
5. Page renders alerts: open alerts prominent, acknowledged alerts greyed out, source badge distinguishes baseline vs cash obs

**Flow 2: Pit Boss Acknowledges Alert**
1. Pit boss clicks "Acknowledge" on an open alert
2. Optional: adds notes and/or marks as false positive
3. `POST /api/shift-intelligence/acknowledge-alert` → `rpc_acknowledge_alert`
4. RPC validates role (pit_boss/admin), transitions `open → acknowledged` atomically, writes `alert_acknowledgment` row
5. UI updates alert to acknowledged state

**Flow 3: Concurrent / Stale Acknowledgment (Idempotent)**
1. Two operators click "Acknowledge" on same alert (concurrent or stale client)
2. First RPC call: `UPDATE ... WHERE status = 'open'` succeeds → writes acknowledgment record
3. Second RPC call: `UPDATE ... WHERE status = 'open'` matches zero rows → returns idempotent success with `already_acknowledged: true`
4. Result: one transition, one audit record, both callers receive success

**Flow 4: compute_failed Readiness State**
1. Admin triggers baseline recomputation
2. Computation fails for Table 7 (e.g., source RPC timeout)
3. `rpc_compute_rolling_baseline` populates `table_metric_baseline.last_error` with truncated error message
4. Next anomaly alert read: readiness state = `compute_failed` for Table 7
5. Dashboard shows "Computation failed" indicator with operator-safe error context — distinct from "No baseline available" (`missing`). Raw `last_error` text must follow SEC Note `last_error` Access Posture: staff-visible only, prefer controlled truncation over raw internals, never exposed on customer-facing surfaces

**Flow 5: Admin Views Alert Quality (Track B)**
1. Admin navigates to alerts page
2. Quality telemetry panel shows: total alerts, false-positive count, median acknowledge latency
3. Admin uses metrics to assess whether alert signal is trustworthy enough for notification channel proposal
4. Suppression ratio unavailable in MVP (requires evaluation-cycle logging) — deferred

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **PRD-055 (Phase C-1)** — `table_metric_baseline`, `rpc_compute_rolling_baseline`, `rpc_get_anomaly_alerts`, `services/shift-intelligence/` (all implemented, commit `8402d59`)
- **`rpc_shift_cash_obs_alerts`** — Existing cash obs alert RPC (coexists, unchanged)
- **`casino_settings.alert_thresholds`** — Existing JSONB config path (new `cooldown_minutes` key nests under it)
- **UI components** — `AnomalyAlertCard`, `BaselineCoverageBanner`, `RecomputeBaselinesButton` (created in C-1, unwired)
- **`alerts-page-client.tsx`** — Existing `/admin/alerts` page client component (currently renders cash obs alerts only)

### 7.2 Risks & Open Questions

- **Q3 (open):** Unified alert list display — how to visually distinguish ephemeral cash obs alerts from persistent baseline alerts. **Recommendation:** Source indicator badge. Deferred to implementation.
- **Alert volume at scale** — ~6K rows/month at pilot (50 tables × 4 metrics × 30 days). Retention/archival deferred. Trigger to address: >100K rows or query degradation.
- **Cooldown misconfiguration** — Setting `cooldown_minutes: 0` would disable suppression (every refetch UPSERTs). Mitigation: server-side minimum enforcement in RPC (floor at 5 minutes). Document in admin guide.
- **Track sequencing** — Track B depends on Track A completion (reads from `shift_alert`/`alert_acknowledgment` tables created in Track A). Within Track B, items B1-B5 are independent and parallelizable. No schema modifications in Track B. Natural checkpoint between tracks.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `shift_alert` persists anomaly alerts across page refreshes with correct state
- [ ] Composite UNIQUE dedup: same anomaly produces one alert per gaming day (severity updates via UPSERT)
- [ ] Time-based cooldown suppresses redundant UPSERTs within `cooldown_minutes`
- [ ] `rpc_acknowledge_alert` transitions `open → acknowledged` with auditable record
- [ ] `acknowledged_by` derived from `app.actor_id`, not parameter (ADR-024 INV-8)
- [ ] `is_false_positive` flag captured on acknowledgment
- [ ] `compute_failed` readiness state distinct from `missing` (via `last_error` column)
- [ ] `rpc_compute_rolling_baseline` populates `last_error` on failure, clears on success
- [ ] `/admin/alerts` displays both cash obs (ephemeral) and baseline (persistent) alerts with source badge
- [ ] Alert quality telemetry queryable: false-positive rate, acknowledge latency (suppression ratio deferred — no persisted evaluation-cycle data)

**Data & Integrity**
- [ ] `alert_acknowledgment` is append-only — no UPDATE or DELETE possible
- [ ] Forward-only state machine: `acknowledged → open` backward transition rejected
- [ ] Concurrent acknowledgment produces one transition + one audit record (atomic WHERE clause)
- [ ] No orphaned records (FK constraints on `alert_id`, `casino_id`). `alert_acknowledgment.casino_id` derived from parent alert inside RPC — cross-tenant mismatch impossible by construction

**Security & Access**
- [ ] Pattern C hybrid RLS on `shift_alert` and `alert_acknowledgment` (casino-scoped)
- [ ] DELETE denied on both tables via denial policy
- [ ] No direct INSERT/UPDATE/DELETE grants for non-owner roles on either table
- [ ] `rpc_persist_anomaly_alerts`: SECURITY DEFINER, `set_rls_context_from_staff()`, explicit `WHERE casino_id = v_casino_id`
- [ ] `rpc_acknowledge_alert`: SECURITY DEFINER, role gate (`pit_boss`/`admin`), actor binding
- [ ] `REVOKE EXECUTE FROM PUBLIC` on both new RPCs
- [ ] No spoofable `p_casino_id` or `p_staff_id` parameters
- [ ] `last_error` exposed only through staff-visible operational/admin read paths — not in public API responses or unauthenticated surfaces (SEC Note `last_error` Access Posture)

**Testing**
- [ ] Integration test: two-casino isolation — Casino A cannot read/acknowledge Casino B alerts
- [ ] Integration test: role gate denial — dealer/cashier cannot acknowledge
- [ ] Integration test: backward transition rejected (`acknowledged → open`)
- [ ] Integration test: concurrent acknowledgment atomicity
- [ ] Integration test: cooldown suppression — UPSERT skipped within window
- [ ] Integration test: `compute_failed` readiness state when `last_error IS NOT NULL`
- [ ] Contract test: `rpc_persist_anomaly_alerts` returns `persisted_count` + `suppressed_count`
- [ ] Contract test: `rpc_acknowledge_alert` returns alert_id + status + acknowledged_by
- [ ] Route handler test: role gate denies unauthorized roles
- [ ] Route handler test: persist-alerts returns correct shape
- [ ] Integration test: DELETE attempt on `shift_alert` and `alert_acknowledgment` rejected (SEC Note C6)
- [ ] Integration test: direct INSERT/UPDATE on both tables rejected for authenticated role (SEC Note C7)
- [ ] Integration test: cooldown floor enforced — `cooldown_minutes < 5` treated as 5 (SEC Note T5/C5)

**Operational Readiness**
- [ ] Persist RPC returns `persisted_count` and `suppressed_count` per cycle
- [ ] Alert quality telemetry (false-positive rate + acknowledge latency) derivable from persisted data
- [ ] Rollback: `shift_alert` and `alert_acknowledgment` droppable without affecting baseline computation or `rpc_shift_cash_obs_alerts`

**Documentation**
- [ ] SRM updated: ShiftIntelligenceService ownership extended to `shift_alert`, `alert_acknowledgment`
- [ ] Known limitation: `resolved` state dormant (no transition path in MVP)
- [ ] Known limitation: `last_error` not sanitized (staff-visible only)

---

## 9. Related Documents

- **Vision / Strategy**: `docs/00-vision/strategic-hardening/WEDGE-C/INTAKE-C2-C3-ALERT-MATURITY.md`
- **Feature Boundary**: `docs/20-architecture/specs/alert-maturity/FEATURE_BOUNDARY.md`
- **Feature Scaffold**: `docs/01-scaffolds/SCAFFOLD-005-alert-maturity.md`
- **Design Brief / RFC**: `docs/02-design/RFC-005-alert-maturity.md`
- **Architecture / SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **ADR**: `docs/80-adrs/ADR-046-shift-baseline-stored-computation.md` (amendment §8 + §10)
- **Security / SEC Note**: `docs/20-architecture/specs/alert-maturity/SEC_NOTE.md`
- **Security / RLS**: `docs/30-security/SEC-001-rls-policy-matrix.md`
- **Predecessor PRD**: `docs/10-prd/PRD-055-shift-baseline-service-v0.md` (Phase C-1)
- **Schema / Types**: `types/database.types.ts`
- **Pilot Containment**: `docs/60-release/pilot_containment_protocol.md`

---

## Appendix A: Schema Reference

### New Table: `shift_alert`

```sql
CREATE TABLE shift_alert (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id       uuid NOT NULL REFERENCES casino(id),
  table_id        uuid NOT NULL REFERENCES gaming_table(id),
  metric_type     text NOT NULL,
  gaming_day      date NOT NULL,
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'acknowledged', 'resolved')),
  severity        text NOT NULL CHECK (severity IN ('info', 'warn', 'critical')),
  observed_value  numeric NOT NULL,
  baseline_median numeric,
  baseline_mad    numeric,
  deviation_score numeric,
  direction       text CHECK (direction IN ('above', 'below')),
  message         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, table_id, metric_type, gaming_day)
);

CREATE INDEX idx_shift_alert_casino_day_status
  ON shift_alert (casino_id, gaming_day, status);

-- RLS
ALTER TABLE shift_alert ENABLE ROW LEVEL SECURITY;

CREATE POLICY casino_read ON shift_alert FOR SELECT
  USING (auth.uid() IS NOT NULL
    AND casino_id::text = COALESCE(
      current_setting('app.casino_id', true),
      ((auth.jwt()->'app_metadata'->>'casino_id'))
    ));

CREATE POLICY deny_delete ON shift_alert FOR DELETE
  USING (false);

-- No direct INSERT/UPDATE policies for authenticated role
-- Mutations only via SECURITY DEFINER RPCs
```

### New Table: `alert_acknowledgment`

```sql
CREATE TABLE alert_acknowledgment (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id        uuid NOT NULL REFERENCES casino(id),
  alert_id         uuid NOT NULL REFERENCES shift_alert(id),
  acknowledged_by  uuid NOT NULL REFERENCES staff(id),
  notes            text,
  is_false_positive boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);
-- casino_id is copied from the parent shift_alert.casino_id inside
-- rpc_acknowledge_alert — never supplied by the caller. Cross-tenant
-- mismatch is impossible by construction (RPC derives both alert lookup
-- and acknowledgment write from the same v_casino_id session variable).

CREATE INDEX idx_ack_alert_id ON alert_acknowledgment (alert_id);

-- RLS
ALTER TABLE alert_acknowledgment ENABLE ROW LEVEL SECURITY;

CREATE POLICY casino_read ON alert_acknowledgment FOR SELECT
  USING (auth.uid() IS NOT NULL
    AND casino_id::text = COALESCE(
      current_setting('app.casino_id', true),
      ((auth.jwt()->'app_metadata'->>'casino_id'))
    ));

CREATE POLICY deny_delete ON alert_acknowledgment FOR DELETE
  USING (false);
```

### Alter: `table_metric_baseline`

```sql
ALTER TABLE table_metric_baseline ADD COLUMN last_error text;
-- NULL = no error; non-NULL = last computation error (truncated 500 chars)
-- Cleared on next successful computation for same (table_id, metric_type)
```

---

## Appendix B: Implementation Plan

### Track A (C-2): Schema + RPCs + Dedup + Admin Alerts (P0)

- [ ] WS-A1: Migration — create `shift_alert`, `alert_acknowledgment` tables with RLS + grants
- [ ] WS-A2: Migration — alter `table_metric_baseline` add `last_error`
- [ ] WS-A3: Migration — amend `rpc_compute_rolling_baseline` (populate/clear `last_error`)
- [ ] WS-A4: Migration — amend `rpc_get_anomaly_alerts` (5-state readiness model only; context enrichment is WS-B1)
- [ ] WS-A5: Migration — create `rpc_persist_anomaly_alerts()` SECURITY DEFINER
- [ ] WS-A6: Migration — create `rpc_acknowledge_alert()` SECURITY DEFINER
- [ ] WS-A7: Service layer — DTOs, schemas, mappers, `alerts.ts`, http wrappers
- [ ] WS-A8: Route handlers — persist-alerts, acknowledge-alert, alerts (GET)
- [ ] WS-A9: UI — wire `AnomalyAlertCard` + `BaselineCoverageBanner` into `/admin/alerts`
- [ ] WS-A10: Tests — integration (isolation, role gate, state machine, cooldown, compute_failed), contract, route handler

### Track B (C-3): Context Enrichment + Dashboard + Telemetry (P1)

- [ ] WS-B1: Migration — amend `rpc_get_anomaly_alerts` context enrichment columns (session count, peak deviation, recommended action)
- [ ] WS-B2: UI — wire `AnomalyAlertCard` + `useAnomalyAlerts` into shift dashboard `alerts-panel.tsx`
- [ ] WS-B3: UI — wire `RecomputeBaselinesButton` into `/admin/settings`
- [ ] WS-B4: Service layer — `AlertQualityDTO`, quality query, keys
- [ ] WS-B5: Grant posture audit — validate REVOKE/GRANT on all new RPCs and tables

### Track Dependencies

```
Track A: WS-A1 → WS-A2 → WS-A3 → WS-A4 → WS-A5 → WS-A6 → WS-A7 → WS-A8 → WS-A9 → WS-A10
Track B: WS-B1 ─┐
         WS-B2 ─┤ (parallel, no cross-deps within B)
         WS-B3 ─┤
         WS-B4 ─┤
         WS-B5 ─┘
Track B depends on Track A completion (reads from shift_alert/alert_acknowledgment tables).
```

---

## Appendix C: Error Codes

Per SRM Error Taxonomy:

**ShiftIntelligence Domain**
- `SHIFT_ALERT_NOT_FOUND` (404) — alert_id does not exist or not in caller's casino
- `SHIFT_ACKNOWLEDGE_UNAUTHORIZED` (403) — caller role not `pit_boss` or `admin`
- `SHIFT_PERSIST_FAILED` (500) — persist RPC encountered an unexpected error

> **Note:** No 409 for already-acknowledged alerts. Per FR-7, re-acknowledgment is an idempotent success (returns current state with `already_acknowledged: true`). This avoids split semantics between concurrent race and stale-client re-ack.

---

## Appendix D: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-03-24 | Engineering | Initial draft from feature pipeline Phase 5. Derived from RFC-005, SEC Note, ADR-046 amendment §8+§10, SCAFFOLD-005. |
| 0.2.0 | 2026-03-24 | Engineering | DA review patch (0 P0, 4 P1, 5 P2, 3 P3): move context enrichment to Track B (P1-1), add SEC Note C6/C7 integration tests to DoD (P1-2), add cooldown floor to FR-3 + DoD (P1-3), add `last_error` access constraint to DoD (P1-4), fix FEATURE_BOUNDARY dedup key (P2-1), add DTO/API cross-references (P2-3/P2-4), add `resolved` deferral to checkpoint non-goals (P2-5), merge A10/A11 (P3-1), acknowledge B5 as PRD-phase addition (P2-2) |
| 0.3.0 | 2026-03-24 | Engineering | Human review corrections: (1) fix telemetry SQL — `COUNT(*) FILTER (WHERE is_false_positive)`, drop suppression ratio from MVP (no persisted evaluation-cycle data), (2) fix track decomposition contradiction — §7.2 now states Track B depends on Track A, WS-A4 stripped of context enrichment (owned by WS-B1), (3) unify acknowledgment semantics — re-ack is idempotent success (`already_acknowledged: true`), remove SHIFT_ALERT_ALREADY_ACKNOWLEDGED 409, (4) add `alert_acknowledgment.casino_id` derivation note — copied from parent alert inside RPC, cross-tenant mismatch impossible by construction, (5) Flow 4 error context now cross-references SEC Note `last_error` Access Posture |
