---
id: SCAFFOLD-005
title: "Feature Scaffold: Alert Maturity — Persistent Alerts, Dedup & Quality (C-2/C-3)"
owner: lead-architect
status: Draft
date: 2026-03-24
---

# Feature Scaffold: Alert Maturity — Persistent Alerts, Dedup & Quality (C-2/C-3)

> Timebox: 30-60 minutes. If it's longer, you're drifting into a design doc.

**Feature name:** alert-maturity
**Owner / driver:** lead-architect
**Stakeholders (reviewers):** rls-expert, backend-service-builder, devils-advocate
**Status:** Draft
**Last updated:** 2026-03-24
**Predecessor:** PRD-055 / Phase C-1 (commit `8402d59`)

## 1) Intent (what outcome changes?)

- **User story:** As a pit boss, I need anomaly alerts to persist across page refreshes, deduplicate to prevent fatigue, and carry enough context to act on — so that I can trust the alert system as a reliable operational signal rather than dismissing it as noise.
- **Success looks like:** Wedge C moves from AMBER (80%) to GREEN (92%+). Alerts survive reload, same anomaly fires once per cooldown window, acknowledged alerts leave an audit trail, and alert quality telemetry validates signal-to-noise ratio before any notification channel ships.

## 2) Constraints (hard walls)

- **Security / tenancy:** All new tables casino-scoped via Pattern C hybrid RLS (ADR-020). New RPCs use `set_rls_context_from_staff()` (ADR-024). `rpc_acknowledge_alert` gated to `pit_boss`/`admin` roles.
- **Domain:** ShiftIntelligenceService is sole owner of `shift_alert` and `alert_acknowledgment` (SRM v4.22.0). Dedup via composite key `(table_id, metric_type, gaming_day)` — same anomaly = same alert, updated severity.
- **Operational:** No new pages — wire into existing `/admin/alerts` and shift dashboard. Config nests under existing `casino_settings.alert_thresholds` JSONB path. Manual baseline trigger remains the pilot workaround.
- **Pilot containment:** External notifications (Slack, email) are banned until alert quality telemetry validates signal. pg_cron deferred. Cash obs baseline cutover banned.

## 3) Non-goals (what we refuse to do in this iteration)

- External notification channels (Slack, email, SMS, push) — separate post-C3 effort
- pg_cron baseline scheduler — manual trigger is the pilot workaround
- Cash obs baseline cutover — static threshold authority remains
- Alert escalation chains — single-tier only
- Historical trend visualization charts
- Multi-casino alert aggregation (company-level rollup)
- ML-based anomaly detection

## 4) Inputs / Outputs (thin interface, not design)

- **Inputs:**
  - Anomaly alert results from `rpc_get_anomaly_alerts` (existing C-1 RPC)
  - Staff acknowledgment actions (pit boss clicks dismiss with optional note)
  - `casino_settings.alert_thresholds.cooldown_minutes` config value
- **Outputs:**
  - `shift_alert` rows with state machine (`open` → `acknowledged` → `resolved`)
  - `alert_acknowledgment` audit records
  - `table_metric_baseline.last_error` for `compute_failed` readiness state
  - Enriched alert context (session count, peak deviation, recommended action)
  - Alert quality telemetry (false-positive rate, acknowledge latency, suppression ratio)
- **Canonical contract(s):** `ShiftAlertDto`, `AlertAcknowledgmentDto` (new DTOs in `services/shift-intelligence/dtos.ts`)

## 5) Options (2-4 max; force tradeoffs)

### Option A: Two parallel tracks (recommended — matches intake)

Track A (C-2): schema + RPCs + dedup + `/admin/alerts` wiring. Track B (C-3): context enrichment + dashboard wiring + quality telemetry. Fully independent, parallelizable.

- **Pros:** Maximum velocity — no blocking dependencies between tracks. Wedge C hits GREEN (85%) after Track A alone. Natural checkpoint between C-2 and C-3.
- **Cons:** Two sets of migrations in one branch. Slightly more complex PR review.
- **Risk:** Low — both tracks touch the same bounded context with no cross-context writes.

### Option B: Sequential single track

All deliverables (A1-A7, B1-B3) in linear order. Schema → RPCs → dedup → UI → enrichment → telemetry.

- **Pros:** Simplest mental model. Each step builds on the previous.
- **Cons:** Slower — B1-B3 blocked by A7 completion. No intermediate GREEN checkpoint.
- **Risk:** Low, but ~50% longer wall-clock time.

### Recommendation: **Option A** — parallel tracks match the intake and maximize throughput.

## 6) First action after approval

1. SRM v4.21.0 → v4.22.0: extend ShiftIntelligenceService ownership to `shift_alert`, `alert_acknowledgment`
2. Write PRD-056 (Alert Maturity & Automation) with Track A/B workstreams
3. SEC note for new SECURITY DEFINER RPCs + RLS policies
4. ADR amendment to ADR-046 (add alert persistence lifecycle) or standalone if too large
5. EXEC-SPEC-056 with parallel track execution plan
