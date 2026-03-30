---
id: RFC-005
title: "Design Brief: Alert Maturity — Persistent Alerts, Deduplication & Quality (C-2/C-3)"
owner: engineering
status: Draft
date: 2026-03-24
affects: [ShiftIntelligenceService, CasinoService]
predecessor: RFC-004
---

# Design Brief / RFC: Alert Maturity — Persistent Alerts, Deduplication & Quality (C-2/C-3)

> Purpose: propose direction and alternatives with tradeoffs before anyone writes a PRD.
> Structure: funnel style (context -> scope -> overview -> details -> cross-cutting -> alternatives -> decisions required).

## 1) Context

### Problem

Phase C-1 (PRD-055) delivered the baseline computation engine and anomaly detection RPCs. The system can now detect per-table statistical anomalies for drop and hold metrics. However, three operational gaps block production-quality shift intelligence:

1. **Ephemeral alerts.** `rpc_get_anomaly_alerts` returns anomaly data as RPC result rows — they exist only in the response payload. On page refresh, the alert is gone. A pit boss who reviews an alert at 2pm has no record of that alert at 3pm. There is no history, no state, no acknowledgment trail.

2. **Alert fatigue.** `useAnomalyAlerts` refetches every 30 seconds. Every refetch that finds the same above-threshold condition produces the same alert. For a single anomalous table, this generates ~120 identical alert impressions per hour. There is no deduplication, no cooldown, no suppression.

3. **No quality signal.** Without metrics on false-positive rate, acknowledge latency, and suppression ratio, there is no evidence that alerts are trustworthy. The Pilot Containment Protocol requires validated alert quality before any external notification channel (email, Slack) can ship.

### Forces / Constraints

- The `shift_alert` table is a new write surface. It introduces RLS policies, a state machine, and SECURITY DEFINER RPCs — each carrying security overhead that must be justified.
- Existing UI components (`AnomalyAlertCard`, `BaselineCoverageBanner`, `RecomputeBaselinesButton`) are created but not yet wired to pages. The `/admin/alerts` page currently renders only static-threshold cash observation alerts via `AlertsPageClient`.
- The shift dashboard (`shift-dashboard/page.tsx`) prefetches three queries server-side. Adding anomaly alerts must not degrade the RSC prefetch pattern.
- `casino_settings.alert_thresholds` JSONB is the established config path. New config keys (e.g., `cooldown_minutes`) must nest under it.
- ADR-046 §8 defines a 4-state readiness model (`ready`, `stale`, `missing`, `insufficient_data`) for MVP and explicitly defers `compute_failed` to Phase C-2. This RFC must propose how to deliver that 5th state.
- Pilot Containment Protocol: no external notifications until alert quality telemetry validates signal. pg_cron deferred. Cash obs cutover banned.

### Prior Art

- `rpc_shift_cash_obs_alerts` — SECURITY INVOKER, returns ephemeral alert rows with severity/threshold/message. The current `/admin/alerts` page renders these via `AlertsPageClient` with client-side dismiss (non-persistent).
- `alerts-page-client.tsx` — client-side severity filtering, dismiss tracking (in-memory, lost on refresh), sorting by severity. This is the page that will integrate persistent alert display.
- `alert_acknowledgment` pattern precedent: `audit_log` table exists for other domain events but uses a different schema (action-based, not state-machine).
- `loyalty_ledger` — append-only, casino-scoped, FK-linked audit trail. Similar lifecycle to `alert_acknowledgment`.

## 2) Scope & Goals

- **In scope:**
  - `shift_alert` table with state machine (`open` → `acknowledged` → `resolved`)
  - `alert_acknowledgment` table (audit trail: who, when, notes)
  - `rpc_persist_anomaly_alerts()` — SECURITY DEFINER, UPSERTs anomaly results into `shift_alert` with dedup
  - `rpc_acknowledge_alert()` — SECURITY DEFINER, transitions state + writes audit row, role-gated
  - Deduplication via composite key `(casino_id, table_id, metric_type, gaming_day)` + time-based cooldown
  - `compute_failed` as 5th readiness state (extends ADR-046 §8)
  - `table_metric_baseline.last_error` column for error persistence
  - Context enrichment of `rpc_get_anomaly_alerts` (session count, peak deviation, recommended action)
  - Wire `AnomalyAlertCard` into `/admin/alerts` page with persistent acknowledge
  - Wire `useAnomalyAlerts` + `AnomalyAlertCard` into shift dashboard
  - Wire `RecomputeBaselinesButton` into `/admin/settings`
  - Alert quality telemetry (false-positive rate, acknowledge latency, suppression ratio)

- **Out of scope:**
  - External notification channels (Slack, email, SMS, push)
  - pg_cron baseline scheduler
  - Cash obs baseline cutover
  - Alert escalation chains
  - Historical trend visualization charts
  - Multi-casino alert aggregation
  - ML-based anomaly detection

- **Success criteria:**
  - Anomaly alerts persist across page refreshes with correct state
  - Same anomaly fires at most once per cooldown window (default 60 min)
  - Acknowledgment creates an auditable record with actor attribution
  - `compute_failed` is distinguishable from `missing` in the readiness model
  - Alert quality telemetry is queryable from persisted data
  - Wedge C scorecard: GREEN (85%+ after Track A, 92%+ after Track B)

## 3) Proposed Direction (overview)

**Persistent alert table with forward-only state machine + separate acknowledgment audit table.** Anomaly results from the existing `rpc_get_anomaly_alerts` are persisted into `shift_alert` via a new `rpc_persist_anomaly_alerts` RPC. Deduplication is key-based (composite UNIQUE) with time-based cooldown suppression. Acknowledgment is a separate table (`alert_acknowledgment`) linked by FK, preserving the full audit trail independently from alert state.

The persist RPC is SECURITY DEFINER (writes to `shift_alert` require elevated context for cross-table reads). The acknowledge RPC is SECURITY DEFINER (must enforce role gate and derive actor from session context). Both follow ADR-024 authoritative context derivation.

## 4) Detailed Design

### 4.1 Data Model Changes

#### New Table: `shift_alert`

```
shift_alert
├── id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
├── casino_id       uuid NOT NULL REFERENCES casino(id)
├── table_id        uuid NOT NULL REFERENCES gaming_table(id)
├── metric_type     text NOT NULL  -- same enum as table_metric_baseline
├── gaming_day      date NOT NULL
├── status          text NOT NULL DEFAULT 'open'  -- CHECK: 'open' | 'acknowledged' | 'resolved'
├── severity        text NOT NULL  -- 'info' | 'warn' | 'critical'
├── observed_value  numeric NOT NULL
├── baseline_median numeric
├── baseline_mad    numeric
├── deviation_score numeric
├── direction       text  -- 'above' | 'below'
├── message         text
├── created_at      timestamptz NOT NULL DEFAULT now()
├── updated_at      timestamptz NOT NULL DEFAULT now()
├── UNIQUE (casino_id, table_id, metric_type, gaming_day)
└── INDEX idx_shift_alert_casino_day_status (casino_id, gaming_day, status)
```

#### New Table: `alert_acknowledgment`

```
alert_acknowledgment
├── id               uuid PRIMARY KEY DEFAULT gen_random_uuid()
├── casino_id        uuid NOT NULL REFERENCES casino(id)
├── alert_id         uuid NOT NULL REFERENCES shift_alert(id)
├── acknowledged_by  uuid NOT NULL REFERENCES staff(id)
├── notes            text
├── is_false_positive boolean NOT NULL DEFAULT false
├── created_at       timestamptz NOT NULL DEFAULT now()
└── INDEX idx_ack_alert_id (alert_id)
```

#### Alter Table: `table_metric_baseline`

```sql
ALTER TABLE table_metric_baseline ADD COLUMN last_error text;
-- NULL = no error (computation succeeded or never attempted)
-- Non-NULL = last computation error message (truncated to 500 chars)
-- Cleared on next successful computation for same (table_id, metric_type)
```

### 4.2 State Machine

**MVP ships 2 active states.** `resolved` is included in the CHECK constraint for forward-compatibility but has no transition path in MVP.

```
shift_alert.status (MVP):

  ┌──────────┐    rpc_acknowledge_alert    ┌──────────────┐
  │   open   │ ──────────────────────────→ │ acknowledged │
  └──────────┘                             └──────────────┘

  CHECK constraint allows: 'open' | 'acknowledged' | 'resolved'
  MVP transitions: open → acknowledged only
  resolved: dormant — no RPC, no auto-resolve, no UI. Avoids ALTER TYPE migration later.
```

- Forward-only transition enforced by RPC body logic (not CHECK — CHECK validates legal enum values only)
- `open → acknowledged`: via `rpc_acknowledge_alert` with atomic `WHERE status = 'open'`
- No backward transitions (`acknowledged → open` is forbidden)
- `resolved` transitions deferred: auto-resolve on new gaming day and explicit `rpc_resolve_alert` are post-MVP additions (see D3)

### 4.3 Deduplication Strategy

Two complementary mechanisms:

1. **Key-based dedup (composite UNIQUE):** `(casino_id, table_id, metric_type, gaming_day)` ensures one alert row per anomaly per gaming day. `rpc_persist_anomaly_alerts` uses `ON CONFLICT ... DO UPDATE` to update severity/deviation if the anomaly persists but the magnitude changes.

2. **Time-based cooldown:** Even though key-based dedup prevents duplicate rows, the UPSERT itself is unnecessary if the anomaly hasn't changed. Cooldown suppresses re-evaluation: if `shift_alert.updated_at` is within `cooldown_minutes` of `now()`, skip the UPSERT entirely. This reduces write load from ~120 UPSERT attempts/hour/anomalous-table to ~1/hour.

Config: `casino_settings.alert_thresholds.cooldown_minutes` (integer, default 60).

### 4.4 Service Layer Extensions

Extend existing `services/shift-intelligence/`:

```
services/shift-intelligence/
├── dtos.ts          # ADD: ShiftAlertDTO, AlertAcknowledgmentDTO, AlertQualityDTO
├── schemas.ts       # ADD: acknowledgeAlertSchema, persistAlertsInputSchema
├── keys.ts          # ADD: shiftAlerts scope, alertQuality scope
├── mappers.ts       # ADD: mapShiftAlertRow, mapAcknowledgmentRow
├── alerts.ts        # NEW: persistAlerts(), acknowledgeAlert(), getAlerts(), getAlertQuality()
├── http.ts          # ADD: fetchPersistAlerts(), fetchAcknowledgeAlert(), fetchAlerts()
└── index.ts         # ADD: persistAlerts, acknowledgeAlert, getAlerts to service interface
```

**New DTOs:**

```typescript
interface ShiftAlertDTO {
  id: string;
  tableId: string;
  tableLabel: string;
  metricType: MetricType;
  gamingDay: string;
  status: 'open' | 'acknowledged' | 'resolved';
  severity: AlertSeverity;
  observedValue: number;
  baselineMedian: number | null;
  baselineMad: number | null;
  deviationScore: number | null;
  direction: 'above' | 'below' | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  acknowledgment: AlertAcknowledgmentDTO | null;  // joined on read
}

interface AlertAcknowledgmentDTO {
  acknowledgedBy: string;       // staff UUID
  acknowledgedByName: string;   // staff display name (joined)
  notes: string | null;
  isFalsePositive: boolean;
  createdAt: string;
}

interface AlertQualityDTO {
  totalAlerts: number;
  acknowledgedCount: number;
  falsePositiveCount: number;   // COUNT where alert_acknowledgment.is_false_positive = true
  medianAcknowledgeLatencyMs: number;
  suppressionRatio: number;     // cooldown-suppressed / total evaluations
  period: { start: string; end: string };
}
```

### 4.5 API Surface

#### `POST /api/shift-intelligence/persist-alerts`

Triggers alert persistence for the caller's casino. Called on dashboard load or explicit trigger.

```typescript
// Input
{ gaming_day?: string }  // defaults to current gaming day

// Output (ServiceHttpResult)
{
  data: {
    persisted_count: number;
    suppressed_count: number;  // cooldown-suppressed
    gaming_day: string;
  }
}
```

#### `POST /api/shift-intelligence/acknowledge-alert`

Acknowledges a single alert. Role-gated: `pit_boss` or `admin`.

```typescript
// Input
{ alert_id: string; notes?: string; is_false_positive?: boolean }

// Output (ServiceHttpResult)
{
  data: {
    alert_id: string;
    status: 'acknowledged';
    acknowledged_by: string;
  }
}
```

#### `GET /api/shift-intelligence/alerts?gaming_day=...&status=...`

Returns persisted alerts for a gaming day. Replaces ephemeral `rpc_get_anomaly_alerts` for the alert list view.

```typescript
// Output (ServiceHttpResult)
{
  data: {
    alerts: ShiftAlertDTO[];
    quality: AlertQualityDTO;   // Track B — included when available
  }
}
```

### 4.6 UI Integration

**`/admin/alerts` page (Track A):**
- `AlertsPageClient` already has severity filtering, sorting, and dismiss UX
- Replace in-memory dismiss with `rpc_acknowledge_alert` call
- Add alert history view (show `acknowledged` alerts greyed out)
- Integrate `BaselineCoverageBanner` at top of page

**Shift dashboard (Track B):**
- Add `AnomalyAlertCard` list to existing `alerts-panel.tsx`
- Alongside current `rpc_shift_cash_obs_alerts` results (both alert types coexist)
- `useAnomalyAlerts` continues 30s refetch for live anomaly display; persist cycle is **not** piggybacked on refetch — persist is triggered on page load and via explicit "Refresh Alerts" action only (see Q1)

**`/admin/settings` (Track B):**
- Wire `RecomputeBaselinesButton` into shift settings section

### 4.7 Security Considerations

- **Tenant isolation:** Both new tables get Pattern C hybrid RLS for direct-read posture (casino-scoped). Additionally, every `SECURITY DEFINER` RPC derives `v_casino_id` from authoritative context and binds all reads/writes to the derived scope (`WHERE casino_id = v_casino_id`). RLS alone is not sufficient inside DEFINER code paths.
- **`rpc_persist_anomaly_alerts`:** SECURITY DEFINER. Calls `set_rls_context_from_staff()`. Internally calls `rpc_get_anomaly_alerts` then writes to `shift_alert` with explicit `WHERE casino_id = v_casino_id`.
- **`rpc_acknowledge_alert`:** SECURITY DEFINER. Role gate: `v_role IN ('pit_boss', 'admin')`. `acknowledged_by` derived from `app.actor_id` — no spoofable parameter (ADR-024 INV-8). Transition is atomic (`WHERE status = 'open'`) to handle concurrent acknowledgment safely.
- **Grant posture:** No direct `INSERT`, `UPDATE`, or `DELETE` grants on `shift_alert` or `alert_acknowledgment` for non-owner roles. Mutations available only through approved RPCs. `REVOKE EXECUTE FROM PUBLIC` on both new RPCs; grant to `authenticated` and `service_role` only.
- **`alert_acknowledgment` is append-only.** No UPDATE or DELETE grants. Immutable audit trail.
- **`shift_alert` state transitions:** Forward-only transitions enforced in RPC body logic, not by CHECK constraint (CHECK validates legal enum values only). Direct table mutation is unavailable to ordinary application roles.
- **DELETE denied** on both tables via RLS denial policy.

Full threat model in SEC Note: `docs/20-architecture/specs/alert-maturity/SEC_NOTE.md`.

## 5) Cross-Cutting Concerns

### Performance

- **Persist path:** `rpc_persist_anomaly_alerts` calls `rpc_get_anomaly_alerts` (existing, <200ms) then UPSERTs into `shift_alert`. With cooldown suppression, most UPSERTs are skipped. Expected: <500ms for 50 tables.
- **Acknowledge path:** Single UPDATE + INSERT (two rows). Expected: <50ms.
- **Read path (alerts list):** SELECT from `shift_alert` LEFT JOIN `alert_acknowledgment`. Index on `(casino_id, gaming_day, status)` covers the primary query. Expected: <100ms.
- **Quality telemetry:** Aggregate query over `shift_alert` + `alert_acknowledgment`. Acceptable to be slower (1-2s) — not on critical dashboard path.

### Migration Strategy

1. Alter `table_metric_baseline` — add `last_error` column
2. Amend `rpc_compute_rolling_baseline` — populate `last_error` on failure, clear on success
3. Amend `rpc_get_anomaly_alerts` — return `compute_failed` readiness state + context enrichment columns
4. Create `shift_alert` table with RLS policies
5. Create `alert_acknowledgment` table with RLS policies
6. Create `rpc_persist_anomaly_alerts()` SECURITY DEFINER
7. Create `rpc_acknowledge_alert()` SECURITY DEFINER
8. Wire route handlers
9. Wire UI components
10. No data migration — `shift_alert` starts empty, populates from first persist call

### Observability

- Persist RPC returns `persisted_count` and `suppressed_count` per cycle
- Alert quality telemetry (Track B) provides ongoing signal quality metrics
- `shift_alert` table provides a durable record of every anomaly detected — queryable for historical analysis

### Rollback Plan

- `shift_alert` and `alert_acknowledgment` can be dropped without affecting baseline computation or existing `rpc_shift_cash_obs_alerts`
- `last_error` column on `table_metric_baseline` is nullable and additive — no breaking change
- Context enrichment columns on `rpc_get_anomaly_alerts` are nullable — backward-compatible
- Existing `/admin/alerts` page continues to work with `rpc_shift_cash_obs_alerts` if new integration is reverted

## 6) Alternatives Considered

### Alternative A: Client-Side Alert State (No Persistence)

- **Description:** Track alert state (dismissed/not) in Zustand store or localStorage. No new database tables.
- **Tradeoffs:** Zero migration cost, no RLS overhead. But state is per-device — a pit boss who dismisses on one terminal sees it as open on another. No audit trail. No quality telemetry possible (no persistent data to measure). Fails the "auditable acknowledgment" requirement.
- **Why not chosen:** Multi-terminal pit environment requires shared state. Audit trail is a regulatory-adjacent expectation. Alert quality telemetry is impossible without persistent data.

### Alternative B: Event Log (Append-Only Alert Events)

- **Description:** Instead of a mutable `shift_alert` table with state transitions, store immutable alert events: `alert_fired`, `alert_acknowledged`, `alert_resolved`. Current state derived by replaying events.
- **Tradeoffs:** Purest audit model — every state change is an immutable event. Supports future event-driven workflows (notifications via event consumers). But adds query complexity (aggregate latest state from event sequence), higher storage volume (~3x more rows), and the read path requires GROUP BY + window functions for current state.
- **Why not chosen:** Over-engineered for the use case. The state machine has 3 states and 2 transitions. The acknowledgment audit table provides the immutable audit trail without the query overhead. Event sourcing is appropriate when there are many state transitions or when event replay is a core feature — neither applies here.

### Alternative C: Columns on `shift_alert` Instead of Separate `alert_acknowledgment` Table

- **Description:** Add `acknowledged_by`, `acknowledged_at`, `acknowledgment_notes` columns directly on `shift_alert`.
- **Tradeoffs:** Simpler schema (one table, no FK join). But limits to one acknowledgment per alert — if multiple operators review the same alert, only the last one is recorded. Also mixes mutable operational state with immutable audit data in the same row, making it harder to enforce append-only semantics on the audit portion.
- **Why not chosen:** Separate table preserves the possibility of multiple acknowledgment records per alert (e.g., operator acknowledges, then supervisor re-acknowledges with different notes). Append-only semantics are cleaner to enforce on a separate table. The join cost is negligible for the read pattern.

### Alternative D: Dedup via Idempotency Token Instead of Composite Key

- **Description:** Client generates an idempotency token per alert evaluation cycle. Server deduplicates by token.
- **Tradeoffs:** Decouples dedup from data model — any alert shape can be deduplicated. But requires client-side token management, adds a column that has no business meaning, and the natural dedup key `(table, metric, gaming_day)` already exists and is semantically meaningful.
- **Why not chosen:** The composite key is the natural dedup boundary. One anomaly per table per metric per gaming day is the domain-correct granularity. Adding an artificial token adds complexity without semantic value.

## 7) Decisions Required

### D1: Alert Persistence Architecture

**Options:**
- (A) Client-side state (Zustand/localStorage)
- (B) **Persistent `shift_alert` table with forward-only state machine** ← recommended
- (C) Event log (append-only alert events)

**Recommendation:** Option B — persistent table with state machine.
**Rationale:** Multi-terminal shared state required. Audit trail required. Alert quality telemetry requires persistent data. State machine is minimal (3 states, 2 transitions) — event sourcing overhead is unjustified. The state machine and the separate `alert_acknowledgment` table together provide both operational state and immutable audit.
**ADR-worthy:** No as standalone — the intake characterises these gaps as "remedial, not architectural." The bounded context (ShiftIntelligenceService), security model (DEFINER + ADR-024), and computation architecture are already decided in ADR-046. Alert persistence is an extension of that existing decision space. → **ADR-046 amendment** (new §10: Alert Persistence Lifecycle — tables, state machine, dedup, acknowledgment model).

### D2: Deduplication Strategy

**Options:**
- (A) **Composite UNIQUE key + time-based cooldown** ← recommended
- (B) Idempotency token per evaluation cycle
- (C) Application-level dedup (check-then-insert in service layer)

**Recommendation:** Option A — composite key + cooldown.
**Rationale:** The domain-natural key `(casino_id, table_id, metric_type, gaming_day)` is the correct dedup boundary — one anomaly per table per metric per gaming day. Cooldown adds write suppression. Database-enforced via UNIQUE constraint, not application-level race-prone checks.
**ADR-worthy:** No — implementation detail within D1. Document in ADR-046 amendment §10 as a sub-decision.

### D3: `resolved` State in MVP

**Options:**
- (A) **Ship MVP with 2 states (`open`, `acknowledged`) only** ← recommended
- (B) Ship with 3 states (`open`, `acknowledged`, `resolved`) including auto-resolve logic

**Recommendation:** Option A — 2-state MVP.
**Rationale:** `resolved` requires a trigger mechanism (auto-resolve on new gaming day, or explicit RPC). Auto-resolve adds a write-path side effect to the persist cycle that complicates the dedup logic. The CHECK constraint can include `resolved` in the enum (forward-compatible), but no transition path to it ships in MVP. Operators need `open` → `acknowledged` — that's the core workflow. `resolved` is additive.
**ADR-worthy:** No — document as an explicit deferral in ADR-046 amendment §10. The CHECK constraint includes `resolved` to avoid a future ALTER TYPE migration.

### D4: `compute_failed` Readiness State

**Options:**
- (A) **Add `last_error` column to `table_metric_baseline`** ← recommended
- (B) Separate `baseline_computation_log` table with per-run error records
- (C) Overload `sample_count = -1` to signal failure

**Recommendation:** Option A — `last_error` column.
**Rationale:** Minimal schema change (one nullable text column). Cleared on success, populated on failure. The readiness state derivation in `rpc_get_anomaly_alerts` adds one CASE branch. Option B is over-engineered (full computation log is a future observability feature, not needed for a readiness flag). Option C is a sentinel value anti-pattern.
**ADR-worthy:** Yes — this extends ADR-046 §8's readiness model from 4 states to 5. The distinction between `missing` and `compute_failed` is a durable semantic decision. → **ADR-046 amendment** (amend §8 only, not a new ADR — the readiness model is part of the existing baseline storage decision).

### D5: Acknowledgment Model

**Options:**
- (A) Columns on `shift_alert` (`acknowledged_by`, `acknowledged_at`, `notes`)
- (B) **Separate `alert_acknowledgment` table** ← recommended
- (C) Event log entries

**Recommendation:** Option B — separate table.
**Rationale:** Append-only semantics are cleaner to enforce on a dedicated table (DELETE denied, no UPDATE). Supports multiple acknowledgments per alert if needed. Keeps mutable operational state (`shift_alert.status`) separate from immutable audit data. The join cost is negligible.
**ADR-worthy:** No — implementation detail within D1. Document in ADR-046 amendment §10.

## 8) Open Questions

- **Q1 (resolved):** Persist trigger is explicit — on page load + manual "Refresh Alerts" action. Not piggybacked on 30s refetch. See §4.6.
- **Q2 (resolved):** `is_false_positive boolean NOT NULL DEFAULT false` added to `alert_acknowledgment` schema. No text parsing. See §4.1 and §4.5.
- **Q3:** How should the `/admin/alerts` page display both static-threshold cash obs alerts (ephemeral, from `rpc_shift_cash_obs_alerts`) and persistent baseline anomaly alerts (from `shift_alert`)? **Recommendation:** Unified list with a source indicator badge. Cash obs alerts continue to render ephemerally; baseline alerts render from persisted state. No merge into a single table.

## Links

- Feature Scaffold: `docs/01-scaffolds/SCAFFOLD-005-alert-maturity.md`
- Feature Boundary: `docs/20-architecture/specs/alert-maturity/FEATURE_BOUNDARY.md`
- Intake: `docs/00-vision/strategic-hardening/WEDGE-C/INTAKE-C2-C3-ALERT-MATURITY.md`
- SEC Note: `docs/20-architecture/specs/alert-maturity/SEC_NOTE.md`
- ADR(s): ADR-046 amendment (pending — §8 compute_failed readiness state + §10 alert persistence lifecycle)
- PRD: (pending Phase 5)

## References

- Predecessor RFC: `docs/02-design/RFC-004-shift-baseline-service.md`
- Predecessor ADR: `docs/80-adrs/ADR-046-shift-baseline-stored-computation.md`
- ADR-018: SECURITY DEFINER Governance
- ADR-024: Authoritative Context Derivation (INV-8: actor binding)
- Existing: `rpc_get_anomaly_alerts` (C-1, SECURITY INVOKER)
- Existing: `rpc_compute_rolling_baseline` (C-1, SECURITY DEFINER)
- Existing: `rpc_shift_cash_obs_alerts` (migration `20260107020746`)
- Existing: `services/shift-intelligence/` (C-1 service layer)
- Existing: `components/shift-intelligence/` (C-1 UI components, unwired)
- Existing: `components/admin-alerts/` (current alerts page components)
