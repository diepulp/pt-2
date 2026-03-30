# Feature Pipeline Intake — Wedge C Phase C-2/C-3: Alert Maturity & Automation

**Date:** 2026-03-23 | **Branch:** `wedge-c` | **Intake for:** Combined C-2 + C-3
**Predecessor:** PRD-055 / Phase C-1 (commit `8402d59`)
**Strategic context:** Hardening Report 2026-03-23 §III, §VIII

---

## 1. Problem Statement

Phase C-1 (PRD-055) delivered the baseline computation engine and anomaly alerting RPCs. Wedge C moved from AMBER (60%) to AMBER (80%). However, three operational gaps prevent the shift intelligence system from reaching production quality:

1. **Alerts are ephemeral.** Anomaly alerts exist only as RPC return values — they vanish on page refresh. No history, no persistent acknowledgment, no state machine. A pit boss who dismisses an alert loses that decision when they reload.

2. **Alert fatigue is unmitigated.** The same anomaly fires on every 30-second dashboard refetch cycle. No deduplication, no cooldown windows. A single above-threshold table generates ~120 duplicate alerts per hour.

3. **Baselines require manual trigger.** There is no scheduler — an admin must POST to `/compute-baselines` each gaming day. If forgotten, baselines go stale and all alerts degrade to `readiness_state: 'stale'` (fail-closed, no anomaly evaluation). Manual trigger is acceptable for pilot (admin clicks button each morning); automated scheduling is deferred.

These gaps are remedial, not architectural. The foundations (baseline engine, anomaly evaluation, UI components) are in place from C-1.

---

## 2. What Exists Now (C-1 Baseline)

| Layer | Artifact | Status |
|-------|----------|--------|
| Schema | `table_metric_baseline` (UPSERT-keyed, RLS Pattern C) | Operational |
| RPC | `rpc_compute_rolling_baseline` (DEFINER) | Operational — manual trigger only |
| RPC | `rpc_get_anomaly_alerts` (INVOKER) | Operational — ephemeral results |
| Service | `services/shift-intelligence/` (factory, DTOs, hooks) | Operational |
| API | POST `/compute-baselines`, GET `/anomaly-alerts` | Operational |
| UI | `AnomalyAlertCard`, `BaselineCoverageBanner`, `RecomputeBaselinesButton` | Created, not yet wired to pages |
| Hooks | `useAnomalyAlerts` (30s refetch), `useComputeBaselines` | Operational |
| Config | `casino_settings.alert_thresholds.baseline` | Consumed by compute RPC |
| SRM | v4.21.0 — ShiftIntelligenceService registered | Operational |

---

## 3. Desired Outcome

**Wedge C → GREEN (92%+).** All four wedges GREEN. The hardening narrative shifts from "baseline service missing" to "anomaly detection operational with production-grade alert lifecycle."

**Sellable claim unlocked:**

> "PT-2 detects drop, hold, and win/loss anomalies using statistical baselines, persists alert history with operator acknowledgment, deduplicates to prevent fatigue, and runs autonomously — with alert quality validated before any external notification channel is introduced."

---

## 4. Scope — Two Parallel Tracks

### Track A — Alert Persistence & Deduplication (C-2 deliverables)

| # | Deliverable | Description |
|---|-------------|-------------|
| A1 | `shift_alert` table | Persistent alert store with state machine: `open` → `acknowledged` → `resolved`. Casino-scoped RLS. Keyed on `(table_id, metric_type, gaming_day)` for natural dedup. |
| A2 | `alert_acknowledgment` table | Audit trail: who acknowledged, when, with what notes. FK to `shift_alert`. |
| A3 | `rpc_acknowledge_alert()` | SECURITY DEFINER. Transitions alert state, writes acknowledgment record. pit_boss/admin gated. |
| A4 | `rpc_persist_anomaly_alerts()` | SECURITY DEFINER. Called after `rpc_get_anomaly_alerts` — UPSERTs results into `shift_alert`. Dedup via composite key: same (table, metric, gaming_day) = same alert, updated severity. |
| A5 | Deduplication / cooldown | Alert suppression within configurable cooldown window (default 1 hour). Prevents fatigue from 30s refetch. Config: `casino_settings.alert_thresholds.cooldown_minutes`. |
| A6 | `compute_failed` readiness state | Add `last_error` column to `table_metric_baseline`. 5th readiness state distinguishes "never computed" from "computation failed." |
| A7 | `/admin/alerts` page wiring | Wire `AnomalyAlertCard` into existing alerts page. Persistent dismiss via `rpc_acknowledge_alert`. Alert history view. |

### Track B — Alert Quality & UI Wiring (C-3 independent deliverables)

| # | Deliverable | Description |
|---|-------------|-------------|
| B1 | Context enrichment | Enrich alert message with: contributing sessions count, peak deviation time window, recommended action text. Added to `rpc_get_anomaly_alerts` return columns. |
| B2 | Shift dashboard wiring | Wire `useAnomalyAlerts` + `AnomalyAlertCard` into existing shift dashboard page. Wire `RecomputeBaselinesButton` into `/admin/settings`. |
| B3 | Alert quality telemetry | False-positive rate, acknowledge latency, suppression ratio. Required to validate alert quality before any external notification channel ships. |

---

## 5. Dependency Map

```
Track A (C-2)                    Track B (C-3 independent)
─────────────                    ────────────────────────
A1: shift_alert table            B1: context enrichment
A2: alert_acknowledgment         B2: dashboard wiring
A3: rpc_acknowledge_alert        B3: alert quality telemetry
A4: rpc_persist_anomaly
A5: dedup/cooldown
A6: compute_failed
A7: /admin/alerts wiring
```

**Tracks A and B are fully independent and parallelizable.**

> **Pilot Containment Rule:** External notification work (email, Slack, or any other channel) is deferred until alert persistence, acknowledgment, and deduplication are complete AND alert quality telemetry (B5) validates that alerts are not noisy. The first channel, if any, is email; Slack is optional and requires explicit customer/operator demand. Notification ships as a separate post-C3 effort — see Hardening Report §III for slicing (C-3A foundation → C-3B email → C-3C Slack optional).

---

## 6. Non-Goals (Explicit Exclusions)

- **All external notification channels (Slack, email, SMS, push)** — Deferred to separate post-C3 effort, not part of Wedge C completion claim. Alert quality must be validated first. See Pilot Containment Rule above.
- **pg_cron baseline scheduler** — Manual recomputation is the pilot workaround (admin clicks button each morning). Automated scheduling deferred to post-pilot. See Pilot Containment Protocol: "manual workaround exists for 4 weeks → Defer."
- **Cash obs baseline cutover** — Static threshold authority (`rpc_shift_cash_obs_alerts`) is functional and remains authoritative. Cutover introduces a new axis of variability (config flag, new code path) for something that works today. Banned until after pilot.
- **Alert escalation chains** — Single-tier notification. No manager escalation.
- **Historical trend visualization** — Alert history stored but no chart UI in this phase.
- **Multi-casino alert aggregation** — Casino-scoped only. Company-level rollup deferred.
- **ML-based anomaly detection** — Statistical (median+MAD) only. No model training.

---

## 7. Constraints

| Constraint | Source | Impact |
|------------|--------|--------|
| Same worktree (`trees/wedge-c`) | User directive | Single branch, one PR for all C-1/C-2/C-3 work |
| PR deferred | User directive | No PR until all phases implemented |
| No new pages | Over-Engineering Guardrail | Wire into existing `/admin/alerts` and shift dashboard |
| `casino_settings` JSONB schema | Existing pattern | New config keys must nest under `alert_thresholds` |
| ShiftIntelligenceService owns `shift_alert` | SRM v4.21.0 | Bounded context extension — update SRM to v4.22.0 |
| Manual baseline trigger for pilot | Pilot Containment Protocol | Admin clicks "Recompute Baselines" each morning. pg_cron deferred to post-pilot. |

---

## 8. Acceptance Criteria (Definition of Done)

- [ ] `shift_alert` table with state machine, RLS, DELETE denial
- [ ] `rpc_acknowledge_alert()` with pit_boss/admin gate
- [ ] Alert deduplication: same (table, metric, gaming_day) fires once per cooldown window
- [ ] `compute_failed` readiness state functional in `rpc_get_anomaly_alerts`
- [ ] `/admin/alerts` page shows persistent anomaly alerts with acknowledge button
- [ ] Shift dashboard shows anomaly alerts inline
- [ ] Alert context enrichment (session count, peak deviation, recommended action)
- [ ] Alert quality telemetry operational (false-positive rate, acknowledge latency)
- [ ] All new RPCs follow ADR-024 context derivation
- [ ] SRM updated to v4.22.0
- [ ] Type check, lint, tests pass
- [ ] Wedge C scorecard: GREEN (85%+) after Track A, GREEN (92%+) after Track B complete

---

## 9. Estimated Timeline

| Week | Tracks | Gate |
|------|--------|------|
| 1 | A1-A4 (schema + RPCs) + B1 (context enrichment) | Schema deployed, RPCs callable |
| 2 | A5-A7 (dedup + UI wiring) + B2-B3 (dashboard wiring + quality telemetry) | Wedge C → GREEN (85%) |
| 3 | Integration testing + quality validation + PR | Wedge C → GREEN (92%+), PR ready |

**Compressed from 5-6 weeks sequential to ~3 weeks via Track A/B parallelism. Notification channels are a separate post-C3 effort.**

---

## 10. Pipeline Entry Point

This intake feeds the feature pipeline at **Phase 0 (SRM-First Ownership)**:
- SRM scope: extend ShiftIntelligenceService to own `shift_alert`, `alert_acknowledgment`
- ADR: likely amendment to ADR-046 (add alert persistence lifecycle) rather than new ADR
- PRD: PRD-056 (Alert Maturity & Automation)
- EXEC-SPEC: EXEC-056 with 2 parallel tracks

**Ready for `/feature` pipeline entry.**
