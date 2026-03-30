# ADR-046: Stored Baselines for Shift Anomaly Detection

**Status:** Proposed
**Date:** 2026-03-23
**Supersedes:** None
**Feature:** shift-baseline-service (Wedge C Phase C-1)
**Patch:** 2026-03-23 — applied corrections from patch delta review (4 findings + 3 structural)
**Amendment:** 2026-03-24 — Phase C-2/C-3 alert maturity (§8 compute_failed readiness state, §10 alert persistence lifecycle)
**Amendment Artifacts:** RFC-005, SCAFFOLD-005, SEC Note (alert-maturity)

## Context

PT-2's shift intelligence system detects operational anomalies (drop spikes, hold deviations, cash observation outliers) by comparing current-shift values against expected ranges. The current approach uses **static thresholds** stored in `casino_settings.alert_thresholds` — a fixed dollar or percentage boundary that applies uniformly to all tables regardless of their historical behavior.

Static thresholds cannot distinguish between "normal for this high-limit table" and "anomalous for this $5-minimum table." This blocks 60% of the remaining Wedge C (Shift Intelligence) value: drop anomaly detection, hold deviation detection, and promotional issuance spike detection all require **relative deviation** from a table's own recent history.

The system needs rolling statistical baselines (median + MAD) computed over a configurable window of prior gaming days, enabling per-table adaptive anomaly thresholds.

### Forces

1. **Dashboard latency SLO** — The shift dashboard refetches every 30 seconds. Alert reads must complete within 200ms.
2. **Computation cost** — Median + MAD requires sorting. For 50 tables x 4 metrics x 7 gaming days of lookback = 200 sort operations per computation.
3. **Gaming day boundaries** — The rolling window uses gaming days (TEMP-001), not calendar days. Baselines must respect `casino_settings.gaming_day_start_time`.
4. **Phase C-2 baseline provenance** — Future alert persistence (Phase C-2) will need to record which baseline was used when an alert fired. Stored baselines provide a foundation for this; on-demand computation cannot, because the baseline shifts with each call as the window slides. The current schema uses UPSERT semantics for simplicity; Phase C-2 will introduce immutability or versioning as an additive migration when alert persistence requires it.
5. **Existing config** — `casino_settings.alert_thresholds.baseline` already defines `window_days: 7`, `method: "median_mad"`, `min_history_days: 3`. This config is deployed and admin-configurable but currently unread.

## Decision

**Store computed baselines in a `table_metric_baseline` table.** Baselines are computed once per gaming day (on demand via RPC) and stored with their computation parameters. The anomaly alert read path reads pre-computed baselines and compares them against live shift metrics.

### Key Properties

1. **Computation and read paths are separated.** The expensive statistical computation (1-5s per casino) runs at most once per gaming day. Dashboard reads hit the pre-computed table (<200ms).

2. **Gaming day is the natural recomputation boundary.** Baselines are keyed by `(casino_id, table_id, metric_type, gaming_day)`. A new gaming day produces a new baseline; the old one remains for audit.

3. **UPSERT idempotency for MVP.** Recomputing the same gaming day's baselines replaces the existing row (UPSERT). This is acceptable for Phase C-1 because no persistent alert references exist yet. Phase C-2 will introduce baseline immutability (versioned rows or a `baseline_run` parent table) as an additive schema migration when alert persistence requires stable provenance. The UPSERT key and RPC interface are designed to accommodate this addition without breaking changes.

4. **Computation parameters are recorded.** The `window_days` used at computation time is stored alongside the baseline, enabling reproducibility and audit.

5. **Manual recomputation for MVP.** Computation is triggered by an RPC call (via admin action or future scheduler). No automatic trigger for MVP — scheduling is additive (Phase C-3).

6. **Statistical method: median + MAD (scaled).** MAD is scaled by 1.4826 (consistency constant for normal distribution equivalence) and stored pre-scaled. Anomaly threshold = `median +/- (mad_multiplier * scaled_mad)`, where `mad_multiplier` is configurable per alert category in `casino_settings.alert_thresholds`.

7. **Sparse data produces an explicit flag, not a false alert.** When `sample_count < min_history_days`, the baseline is stored with the available data but consumers receive an `insufficient_data` signal.

8. **Explicit baseline readiness states.** Consumers must distinguish among `ready`, `stale`, `missing`, `insufficient_data`, and `compute_failed`. Adaptive anomaly evaluation only runs for `ready` baselines. No silent substitution or fallback to a different gaming day's baseline without explicit consumer awareness.

   **`compute_failed` (Amendment — Phase C-2):** The 5th readiness state signals that baseline computation was attempted but produced an error. Implementation: a nullable `last_error text` column on `table_metric_baseline`. When `last_error IS NOT NULL`, the readiness state is `compute_failed` regardless of other column values. Cleared on next successful computation for the same `(table_id, metric_type)`. The read path (`rpc_get_anomaly_alerts`) adds one CASE branch to the readiness derivation:

   ```
   CASE
     WHEN b.last_error IS NOT NULL THEN 'compute_failed'
     WHEN b.id IS NULL THEN 'missing'
     WHEN b.gaming_day < current_gaming_day THEN 'stale'
     WHEN b.sample_count < min_history_days THEN 'insufficient_data'
     ELSE 'ready'
   END
   ```

   **Distinction from `missing`:** `missing` means no baseline row exists (computation never attempted). `compute_failed` means a row exists but the last computation produced an error — the operator can see *what* failed and trigger recomputation. This distinction is durable: it informs operator action (recompute vs. wait for first computation).

   **`last_error` constraints:** Truncated to 500 chars. Staff-visible only through approved operational/admin read paths. Not exposed on customer-facing surfaces. Sanitization deferred for pilot — exposure scope is constrained now.

9. **Fail-closed read semantics for MVP.** When no current-gaming-day baseline is available, the adaptive anomaly path does not silently substitute another day's baseline. The read model surfaces the readiness state so operators can see that baseline-backed anomaly detection is unavailable or degraded for specific tables or metrics.

### Canonical Metric Contracts

Each anomaly family binds to a single canonical metric definition and source. The source RPCs are documented in RFC-004 §4.1; the ADR freezes the semantic rules:

- Each `metric_type` maps to exactly one source RPC output column. ShiftIntelligenceService does not recompute or redefine metrics that belong to TableContextService or RatingSlipService.
- The **current gaming day is excluded** from the historical baseline window. Only completed prior gaming days contribute to the rolling median.
- Partial, incomplete, or telemetry-deficient gaming days (where `telemetry_quality = 'NONE'` or no table session existed) must be excluded from the baseline window or explicitly flagged. They must not silently degrade baseline quality.
- Null, zero, and missing-history are **distinct states** and must not be collapsed. A table with zero drop is different from a table with no drop data.

### Bounded Context

New bounded context: **ShiftIntelligenceService** (Operational category in SRM).

**Owns:**
- Stored baseline read models (`table_metric_baseline`)
- Anomaly evaluation orchestration
- Baseline computation lifecycle

**Does not own:**
- Underlying operational source metrics (TableContextService)
- Table lifecycle truth (TableContextService)
- Rating slip telemetry truth (RatingSlipService)
- Promotional issuance truth (LoyaltyService)
- Casino configuration truth (CasinoService)

**Reads cross-context via:** existing RPCs (`rpc_shift_table_metrics`, `rpc_shift_cash_obs_table`) and CasinoService config (`casino_settings.alert_thresholds`).

### Security Model

- **Compute RPC:** `SECURITY DEFINER`, with pinned `search_path = pg_catalog, public`, `REVOKE EXECUTE FROM PUBLIC`, and execution granted only to `authenticated` and `service_role`. The function derives actor and tenant context via `set_rls_context_from_staff()` and accepts no spoofable `casino_id`, `staff_id`, or equivalent scope parameters (ADR-024 INV-8). Actor attribution (`computed_by`) is derived exclusively from `app.actor_id` session context.
- **Cross-context reads:** Every source query inside the DEFINER must be explicitly constrained to the derived `casino_id`. ShiftIntelligenceService may read cross-context data for computation but does not become the source-of-truth owner of those domains. RLS is bypassed inside SECURITY DEFINER — manual scope enforcement via `WHERE casino_id = v_casino_id` is the only isolation mechanism.
- **Read RPC / read path:** `SECURITY INVOKER` under existing Pattern C / casino-scoped access rules.
- **Table posture:** `table_metric_baseline` uses Pattern C hybrid RLS (casino-scoped). DELETE denied via denial policy (`auth.uid() IS NOT NULL AND false`).
- **Governance requirements:** Migration review and CI security gates must validate grant posture (`REVOKE PUBLIC`), absence of spoofable context parameters, and expected function signatures. If multiple compute RPC overloads emerge, PostgREST disambiguation must be validated to prevent phantom overload bypass (per C-3 finding in hardening report).

### Alert Family Authority During MVP

During Phase C-1, both alert systems coexist with explicit authority boundaries:

| Alert Family | Authoritative System | Rationale |
|-------------|---------------------|-----------|
| Drop anomaly | **Baseline-aware** (`rpc_get_anomaly_alerts`) | Relative deviation required |
| Hold deviation | **Baseline-aware** (`rpc_get_anomaly_alerts`) | Relative deviation required |
| Cash observation spike | **Static threshold** (`rpc_shift_cash_obs_alerts`) | Existing, functional; static remains authoritative during MVP. Baselines computed and stored for future adoption. |
| Promotional issuance spike | **Deferred** | Source RPC (`rpc_shift_promo_issuance_table`) not yet available; `win_loss_cents` substituted as metric type |

The existing `rpc_shift_cash_obs_alerts` is not modified. When baseline coverage for cash observations is established and validated, the static-threshold RPC can be deprecated in a future phase.

10. **Alert Persistence Lifecycle (Amendment — Phase C-2/C-3).** Anomaly alerts are persisted in a `shift_alert` table with a forward-only state machine. Acknowledgment is recorded in a separate `alert_acknowledgment` audit table. Both tables are casino-scoped with Pattern C hybrid RLS and DELETE denied.

    **Tables:**
    - `shift_alert` — persistent alert store. Key columns: `casino_id`, `table_id`, `metric_type`, `gaming_day`, `status`, `severity`, `observed_value`, `baseline_median`, `baseline_mad`, `deviation_score`, `direction`, `message`. Composite UNIQUE on `(casino_id, table_id, metric_type, gaming_day)`.
    - `alert_acknowledgment` — append-only audit trail. Key columns: `casino_id`, `alert_id` (FK to `shift_alert`), `acknowledged_by` (derived from `app.actor_id`, not parameter), `notes`, `is_false_positive`.

    **State Machine (MVP — 2 active states):**
    ```
    open → acknowledged    (via rpc_acknowledge_alert, role-gated: pit_boss/admin)
    ```
    CHECK constraint allows `'open' | 'acknowledged' | 'resolved'`. `resolved` is dormant in MVP — included in CHECK to avoid future ALTER TYPE migration. No backward transitions. Forward-only enforcement is in RPC body logic, not CHECK (CHECK validates legal enum values only).

    **Deduplication:**
    - Key-based: composite UNIQUE `(casino_id, table_id, metric_type, gaming_day)` — one alert per anomaly per gaming day. `rpc_persist_anomaly_alerts` uses `ON CONFLICT ... DO UPDATE` to update severity/deviation if magnitude changes.
    - Time-based cooldown: if `shift_alert.updated_at` is within `cooldown_minutes` of `now()`, skip UPSERT. Config: `casino_settings.alert_thresholds.cooldown_minutes` (default 60). Reduces write load from ~120 UPSERTs/hour to ~1/hour per anomalous table.

    **RPCs:**
    - `rpc_persist_anomaly_alerts()` — SECURITY DEFINER. Calls `set_rls_context_from_staff()`, internally evaluates anomalies, then UPSERTs into `shift_alert` with explicit `WHERE casino_id = v_casino_id`. Persist trigger is explicit (page load + manual action), not piggybacked on 30s refetch.
    - `rpc_acknowledge_alert(p_alert_id, p_notes, p_is_false_positive)` — SECURITY DEFINER. Role gate: `v_role IN ('pit_boss', 'admin')`. `acknowledged_by` derived from `app.actor_id` (ADR-024 INV-8). Atomic transition: `UPDATE ... WHERE status = 'open'` — concurrent acknowledgment produces one transition + one audit record.

    **Grant Posture:**
    - No direct `INSERT`, `UPDATE`, or `DELETE` grants on `shift_alert` or `alert_acknowledgment` for non-owner roles.
    - `REVOKE EXECUTE FROM PUBLIC` on both new RPCs; grant to `authenticated` and `service_role` only.
    - Mutations available only through approved RPC entrypoints.

    **Explicit Deferrals:**
    - `resolved` transition (auto-resolve on new gaming day, explicit `rpc_resolve_alert`) — post-MVP.
    - Alert data retention/archival — volume is low at pilot scale (~6K rows/month); address when >100K rows.
    - `last_error` content sanitization — acceptable for staff-only visibility during pilot.

    **Relationship to §3 (UPSERT idempotency):** Phase C-1 noted that "Phase C-2 will introduce baseline immutability." This amendment does **not** change baseline immutability — baselines remain UPSERT for now. Alert persistence is a separate concern: `shift_alert` rows are UPSERTed (severity updates), while `alert_acknowledgment` rows are append-only and immutable. Baseline versioning remains a future additive migration if provenance tracking requires it.

## Alternatives Considered

### On-Demand Computation (No Storage)

Compute median+MAD on every alert RPC call. Simpler schema but O(n log n) sort per metric per table on every 30-second dashboard refetch. Violates the 200ms read SLO. Cannot provide even a foundation for stable baseline references for future alert persistence.

**Rejected:** Performance incompatible with dashboard refresh cadence.

### Hybrid (Compute + Cache with TTL)

First access computes and stores; subsequent reads use cached baselines until TTL expiry. Introduces cache invalidation complexity, race conditions on concurrent first-access, and partial-cache states.

**Rejected:** Gaming day boundaries already provide a natural recomputation cadence. TTL-based invalidation adds complexity without benefit.

### PostgreSQL Materialized View

Use `CREATE MATERIALIZED VIEW` with `REFRESH CONCURRENTLY`. Native PostgreSQL, no custom table management. But materialized views lack per-row metadata (no `computed_by`, no `window_days` audit trail). Full-table lock during refresh conflicts with concurrent reads. No UPSERT — always full recomputation.

**Rejected:** Lacks audit metadata and has problematic lock behavior for concurrent dashboard reads.

## Consequences

### Positive

- Dashboard alert reads are consistently fast (<200ms) regardless of baseline computation cost
- Stored baselines provide a foundation for Phase C-2 alert persistence to build immutable provenance on top of (via additive versioning migration)
- Recomputation parameters are auditable (`window_days`, `computed_by`, `computed_at`)
- Gaming day cadence prevents baseline drift within a shift — the baseline used at 8am is the same one used at 11pm
- New bounded context (ShiftIntelligenceService) cleanly separates anomaly detection from source data ownership, with explicit "does not own" boundary
- Explicit readiness states prevent false operator confidence in anomaly coverage

### Negative

- New table (`table_metric_baseline`) adds a write surface requiring RLS policies and SECURITY DEFINER governance
- Baselines can be stale if recomputation hasn't run for the current gaming day — consumers must check `gaming_day` freshness
- Manual recomputation trigger (MVP) requires operator action or a future scheduler to keep baselines current
- Missing or stale baselines must surface as explicit system state; silent fallback would create false operator confidence in anomaly coverage
- New bounded context registration required in SRM
- (Amendment) Two new tables (`shift_alert`, `alert_acknowledgment`) and two new SECURITY DEFINER RPCs add write surfaces requiring RLS policies, grant posture management, and security review
- (Amendment) `last_error` exposes internal computation diagnostics — must be constrained to staff-visible paths only

### Neutral

- Existing `rpc_shift_cash_obs_alerts` (static thresholds) is not modified — both alerting approaches coexist with explicit authority boundaries per alert family
- Table growth is bounded: one row per (table, metric, gaming_day) — ~200 rows per day for a 50-table casino x 4 metrics, with natural aging as old gaming days become irrelevant

## References

- RFC-004: `docs/02-design/RFC-004-shift-baseline-service.md`
- Feature Boundary: `docs/20-architecture/specs/shift-baseline-service/FEATURE_BOUNDARY.md`
- SEC Note: `docs/20-architecture/specs/shift-baseline-service/SEC_NOTE.md`
- TEMP-001: Gaming Day Specification
- ADR-018: SECURITY DEFINER Governance
- ADR-024: Authoritative Context Derivation
- ADR-039: Measurement Layer (cross-cutting read model precedent)
- Patch Delta: `ADR-046_patch_delta_2026-03-23.md` (external review)
- RFC-005: `docs/02-design/RFC-005-alert-maturity.md` (C-2/C-3 design brief)
- SCAFFOLD-005: `docs/01-scaffolds/SCAFFOLD-005-alert-maturity.md` (C-2/C-3 scaffold)
- SEC Note (alert-maturity): `docs/20-architecture/specs/alert-maturity/SEC_NOTE.md`
- Feature Boundary (alert-maturity): `docs/20-architecture/specs/alert-maturity/FEATURE_BOUNDARY.md`
