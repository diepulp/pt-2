---
title: "Shift Severity Allow-Lists v1"
doc_kind: api-data-contract
version: v1.0
status: active
created: 2026-02-02
applies_to: services/table-context/shift-cash-obs/
related:
  - SHIFT_SNAPSHOT_RULES_v1.md
  - TRUST_LAYER_RULES.md
  - SHIFT_METRICS_UX_CONTRACT_v1.md
---

# Shift Severity Allow-Lists v1

Defines the allowed alert types, severity computation rules, and guardrails that prevent false-critical alerts from weak telemetry data.

---

## 1. Allowed Alert Directions (MVP)

| Direction | Allowed | Rationale |
|-----------|---------|-----------|
| `cash_out` | YES | Observable at the table (player cashing out chips) |
| `cash_in` | NO | Not tracked in MVP (no buy-in observation events) |

**Invariant**: Any alert with a direction not in the allow-list MUST be rejected before severity computation.

---

## 2. Allowed Alert Kinds (MVP)

| Alert Kind | Allowed | Source |
|------------|---------|--------|
| `cash_out_observed_spike_telemetry` | YES | `rpc_shift_cash_obs_alerts` |

**Invariant**: Alerts with an `alert_type` not in this list MUST be filtered out before reaching the UI.

---

## 3. Default Thresholds

| Entity Type | Default Threshold | Unit | Notes |
|-------------|-------------------|------|-------|
| `table` | 500000 | cents ($5,000) | Per-table spike threshold |
| `pit` | 2000000 | cents ($20,000) | Per-pit aggregate spike threshold |

**MVP**: Thresholds are hardcoded constants. Future: configurable per-casino via settings table.

### 3.1 Threshold Application

An alert fires when:
```
observed_value > threshold_for_entity_type
```

The `observed_value` is the `cash_out_observed_estimate_total` for the entity within the shift window.

---

## 4. Severity Computation

### 4.1 Base Severity

Base severity is determined by the ratio of observed value to threshold:

| Ratio | Base Severity |
|-------|---------------|
| > 2.0x threshold | `critical` |
| > 1.0x threshold | `warn` |
| <= 1.0x threshold | `info` (no alert fires) |

### 4.2 Severity Downgrade Rules

**CRITICAL GUARDRAIL**: Severity MUST be downgraded based on telemetry quality of the source entity.

| Telemetry Quality | Max Allowed Severity | Rationale |
|-------------------|---------------------|-----------|
| `GOOD_COVERAGE` | `critical` | Full trust in telemetry signal |
| `LOW_COVERAGE` | `warn` | Insufficient data to justify critical |
| `NONE` | `info` | No telemetry data; alert is speculative |

### 4.3 Downgrade Algorithm

```
function computeSeverity(base_severity, telemetry_quality):
  max_severity = MAX_SEVERITY_MAP[telemetry_quality]
  return min(base_severity, max_severity)
```

Where severity ordering is: `info < warn < critical`.

### 4.4 Downgrade Tracking

When severity is downgraded, the alert MUST carry:
- `original_severity`: The base severity before downgrade
- `downgraded`: `true` if `severity != original_severity`
- `downgrade_reason`: `'low_coverage' | 'no_coverage'`

This enables the UI to show the downgrade context (e.g., "Would be critical, but telemetry coverage is low").

---

## 5. No False-Critical Invariant

**The system MUST NEVER produce a `critical` severity alert when:**

1. `telemetry_quality` of the source entity is `'LOW_COVERAGE'` or `'NONE'`
2. The alert kind is not in the allow-list
3. The alert direction is not in the allow-list

### 5.1 Test Coverage Requirements

The following scenarios MUST have explicit test cases:

| Scenario | Expected Severity |
|----------|-------------------|
| Table with GOOD_COVERAGE, value > 2x threshold | `critical` |
| Table with LOW_COVERAGE, value > 2x threshold | `warn` (downgraded) |
| Table with NONE quality, value > 2x threshold | `info` (downgraded) |
| Table with GOOD_COVERAGE, value > 1x but < 2x | `warn` |
| Table with LOW_COVERAGE, value > 1x but < 2x | `warn` |
| Table with NONE quality, value > 1x but < 2x | `info` (downgraded) |
| Pit with mixed table quality (worst-of) | Severity based on worst table quality |

---

## 6. Pit-Level Alert Quality

For pit-level alerts, the telemetry quality used for severity computation is the **worst-of** across all tables in the pit:

```
pit_quality = MIN(table.telemetry_quality for all tables in pit)
```

This ensures that a pit with even one table lacking telemetry cannot produce a false-critical alert.

---

## 7. Implementation Mapping

| Component | File | Responsibility |
|-----------|------|----------------|
| Severity computation | `services/table-context/shift-cash-obs/severity.ts` | Pure functions: `computeAlertSeverity()`, `downgradeForQuality()` |
| Allow-list validation | `services/table-context/shift-cash-obs/severity.ts` | `isAllowedAlertKind()`, `isAllowedDirection()` |
| Alert enrichment | `services/table-context/shift-cash-obs.ts` | Apply severity guardrails in `getShiftCashObsAlerts()` |
| Tests | `services/table-context/__tests__/shift-cash-obs-guardrails.test.ts` | All scenarios from section 5.1 |

---

## 8. Future Extensions

| Feature | Status | Notes |
|---------|--------|-------|
| Configurable thresholds | Deferred | Per-casino settings table |
| `cash_in` direction | Deferred | Requires buy-in observation events |
| Statistical baselines | Deferred | z-score-based thresholds replace static values |
| Pattern alerts | Deferred | Repeated near-threshold behavior |
