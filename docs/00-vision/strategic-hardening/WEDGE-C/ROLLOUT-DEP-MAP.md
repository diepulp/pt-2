# Wedge C — C-2/C-3 Rollout Dependency Map

**Status:** Updated 2026-03-23 (post-containment audit)
**Superseded by:** `INTAKE-C2-C3-ALERT-MATURITY.md` (canonical intake doc)

This document preserves the dependency analysis. For deliverables and scope, refer to the intake doc.

---

## Dependency Analysis

All C-2/C-3 work lives on the same branch (`wedge-c`).

| Deliverable | Depends on C-2? | Can Parallelize? |
|---|---|---|
| Context enrichment | Weakly — richer with alert history but works without | **Yes** (basic version) |
| Dashboard wiring | No — wires existing components | **Yes** |
| Alert quality telemetry | Partially — needs acknowledge data for latency metric | **After A3** |

## Execution Shape

1. **Parallel Track A** (C-2): `shift_alert` table + state machine + `rpc_acknowledge_alert` + dedup/cooldown + `compute_failed` column + `/admin/alerts` wiring
2. **Parallel Track B** (C-3): context enrichment + dashboard wiring + alert quality telemetry

Tracks A and B can run as concurrent workstreams. One PR, one branch, ~3 weeks.

## Explicitly Deferred (Pilot Containment Protocol)

- **pg_cron scheduler** — manual button click is the pilot workaround
- **Cash obs baseline cutover** — static thresholds are functional; new config flag adds variability without need
- **External notifications (Slack, email, etc.)** — separate post-C3 effort; see Hardening Report §III Pilot Containment Rule
