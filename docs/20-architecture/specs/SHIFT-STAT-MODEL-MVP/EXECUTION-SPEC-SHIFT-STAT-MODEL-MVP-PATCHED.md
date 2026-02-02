---
prd: SHIFT-STAT-MODEL-MVP
prd_title: "Shift Dashboard Statistical Model — Phase 1 MVP Hardening (Guardrails First)"
service: TableContextService
doc_kind: execution-spec
doc_version: v0.3
last_updated: 2026-02-02
status: draft

# PATCH SUMMARY (v0.3)
# This patch makes the spec implementation-ready by pulling the following into Phase 1 as hard gates:
# - Snapshot truth rules (preconditions, null_policy, null_reasons, coverage math)
# - Read-model audit harness (table→pit→casino reconciliation + filter enforcement)
# - Severity allow-lists + defaults + tests (no false-critical)
# - Deterministic provenance rollup algorithm + tests (no "weighting" ambiguity)
# - Doc-first trust rules + UX contract, before UI wiring

workstreams:

  WS0:
    name: Contracts & Audit Baselines (Doc-First)
    description: >
      Lock the Phase 1 truth contract before coding: snapshot rules, provenance algorithm,
      severity allow-lists/defaults, and the read-model audit plan. This prevents "implement then discover"
      churn and guarantees a single source of truth for trust semantics.
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - docs/25-api-data/SHIFT_SNAPSHOT_RULES_v1.md
      - docs/25-api-data/SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md
      - docs/25-api-data/SHIFT_SEVERITY_ALLOWLISTS_v1.md
      - docs/25-api-data/SHIFT_READ_MODEL_AUDIT_v1.md
      - docs/25-api-data/TRUST_LAYER_RULES.md
      - docs/25-api-data/SHIFT_METRICS_UX_CONTRACT_v1.md
    gate: type-check
    estimated_complexity: low

  WS1:
    name: Metric Contract & Provenance Propagation
    description: >
      Formalize metric definitions into a versioned contract; add provenance metadata to DTOs and
      guarantee propagation through BFF/hook composites.
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS0]
    outputs:
      - docs/25-api-data/SHIFT_METRICS_CONTRACT_v1.md
      - services/table-context/shift-metrics/provenance.ts
      - services/table-context/shift-metrics/dtos.ts
      - services/table-context/shift-metrics/service.ts
      - services/table-context/dtos.ts
      - app/api/v1/shift-dashboards/summary/route.ts
      - app/api/v1/shift-dashboards/cash-observations/summary/route.ts
      - services/table-context/__tests__/shift-provenance-rollup.test.ts
    gate: type-check
    estimated_complexity: medium

  WS2:
    name: Snapshot Preconditions & Coverage Semantics (Enforced)
    description: >
      Implement snapshot-derived metric prerequisites; standardize snapshot gap signaling and coverage computation.
      Must match SHIFT_SNAPSHOT_RULES_v1.md.
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS0]
    outputs:
      - services/table-context/shift-metrics/snapshot-rules.ts
      - services/table-context/shift-metrics/service.ts
      - services/table-context/shift-metrics/dtos.ts
      - services/table-context/__tests__/shift-metrics-snapshot-gaps.test.ts
    gate: test-pass
    estimated_complexity: medium

  WS3:
    name: Alert Payload Standardization + Severity Guardrails
    description: >
      Enrich CashObsSpikeAlertDTO; enforce allow-list + coverage-aware severity; prevent false-critical alerts
      from weak telemetry. Must match SHIFT_SEVERITY_ALLOWLISTS_v1.md.
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS0]
    outputs:
      - services/table-context/dtos.ts
      - services/table-context/shift-cash-obs/severity.ts
      - services/table-context/shift-cash-obs.ts
      - services/table-context/__tests__/shift-cash-obs-guardrails.test.ts
    gate: test-pass
    estimated_complexity: low

  WS4:
    name: Read-Model Audit Harness
    description: >
      Add a deterministic audit harness to validate that table→pit→casino rollups reconcile, and that
      direction/filters are enforced. This is a validation layer, not new RPCs.
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS0, WS1, WS2, WS3]
    outputs:
      - scripts/audit/shift-read-model-audit.sql
      - services/table-context/__tests__/shift-read-model-audit.test.ts
    gate: test-pass
    estimated_complexity: medium

  WS5:
    name: Trust UI Primitives
    description: >
      Build composable trust UI components — grade badges, quality indicators, provenance tooltips, coverage bar.
      Must conform to TRUST_LAYER_RULES.md and SHIFT_METRICS_UX_CONTRACT_v1.md.
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS0, WS1, WS2, WS3]
    outputs:
      - components/shift-dashboard-v3/trust/metric-grade-badge.tsx
      - components/shift-dashboard-v3/trust/telemetry-quality-indicator.tsx
      - components/shift-dashboard-v3/trust/provenance-tooltip.tsx
      - components/shift-dashboard-v3/trust/missing-data-warning.tsx
      - components/shift-dashboard-v3/trust/coverage-bar.tsx
      - components/shift-dashboard-v3/trust/index.ts
      - components/shift-dashboard-v3/__tests__/trust-primitives.test.tsx
    gate: type-check
    estimated_complexity: medium

  WS6:
    name: V3 Dashboard Quality Integration
    description: >
      Wire trust primitives into V3 three-panel layout — header coverage bar, KPI grade badges,
      alert severity cues, metrics table quality columns.
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS4, WS5]
    outputs:
      - components/shift-dashboard-v3/shift-dashboard-v3.tsx
      - components/shift-dashboard-v3/layout/shift-dashboard-header.tsx
      - components/shift-dashboard-v3/left-rail/hero-win-loss-compact.tsx
      - components/shift-dashboard-v3/left-rail/secondary-kpi-stack.tsx
      - components/shift-dashboard-v3/left-rail/quality-summary-card.tsx
      - components/shift-dashboard-v3/center/alerts-strip.tsx
      - components/shift-dashboard-v3/center/metrics-table.tsx
      - components/shift-dashboard-v3/right-rail/quality-detail-card.tsx
    gate: build
    estimated_complexity: high

execution_phases:
  - name: "Phase 1 — Guardrails Before Feature Coding"
    parallel: [WS0, WS1, WS2, WS3, WS4]
    gates: [type-check, test-pass]
    notes:
      - "No new metrics beyond contract enforcement until WS4 passes."
      - "If audits fail, fix math/filters before UI work proceeds."

  - name: "Phase 2 — Trust UI Primitives"
    parallel: [WS5]
    gates: [type-check]

  - name: "Phase 3 — UI Integration & Validation"
    parallel: [WS6]
    gates: [type-check, build]

gates:
  type-check:
    command: npm run type-check
    success_criteria: "Exit code 0, no type errors"

  test-pass:
    command: npm test services/table-context/__tests__/shift-
    success_criteria: "All targeted tests pass"

  build:
    command: npm run build
    success_criteria: "Exit code 0, no build errors"
---

# EXECUTION-SPEC — SHIFT-STAT-MODEL-MVP (Patched v0.3)

## What changed and why

Open questions surfaced that materially affect correctness and operator trust. This patch makes those concerns **Phase 1 gates**, not optional follow-ups:

- **Snapshots**: inventory win/loss requires aligned opening/closing snapshots, with explicit null policy when missing.
- **Read-model audit**: table→pit→casino reconciliation must be provably correct before UX wiring.
- **Severity guardrails**: no false-critical alerts from weak telemetry or out-of-scope signal kinds.
- **Trust rules**: grade/quality/provenance must be deterministic and portable across panels.
- **Provenance propagation**: provenance must survive BFF composition, or the UI cannot explain numbers.

## Phase 1 scope decisions (must ship)

### Must ship

1) **Snapshot rules (contract + enforcement)**
- Publish `SHIFT_SNAPSHOT_RULES_v1.md` defining:
  - opening/closing snapshot selection rules per shift window
  - staleness thresholds (if applicable)
  - null_policy and `null_reasons` keys (missing_opening, missing_closing, misaligned, partial_coverage)
  - coverage computation rules and rollup semantics
- Implement snapshot rules in `snapshot-rules.ts` and enforce them in DTO outputs.

2) **Deterministic provenance rollup algorithm**
- Publish `SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md` defining exactly how:
  - table → pit → casino provenance is chosen
  - grade/quality upgrades/downgrades occur
  - coverage impacts rollup trust
- Add a test suite proving rollup behavior (`shift-provenance-rollup.test.ts`).

3) **Severity allow-lists + defaults + tests**
- Publish `SHIFT_SEVERITY_ALLOWLISTS_v1.md` defining:
  - allowed directions / kinds for spike detection
  - default thresholds
  - downgrade rules when coverage is LOW/NONE
- Prove “no false-critical” by tests (`shift-cash-obs-guardrails.test.ts`).

4) **Read-model audit harness**
- Provide `shift-read-model-audit.sql` and a test wrapper that proves:
  - rollups reconcile (table→pit, pit→casino)
  - direction filters are enforced
  - coverage-aware fields do not masquerade as authoritative
- Treat audit failures as blockers, not warnings.

5) **Trust rules + UX contract (doc-first)**
- Publish `TRUST_LAYER_RULES.md` and `SHIFT_METRICS_UX_CONTRACT_v1.md`:
  - what the UI may compare/show when grades differ
  - when to show warnings vs suppress comparisons
  - provenance tooltip content requirements

### May defer (Phase 2+)

- Utilization (open/idle minutes) requiring table-status events
- Statistical baselines (7/30d) and z-score anomaly detection
- Theo/hold modeling requiring count room + game settings integration
- Cross-dashboard share widgets beyond trust contract

## Definition of Done — Phase 1

- [ ] `SHIFT_SNAPSHOT_RULES_v1.md` published and enforced in DTOs (null_policy + null_reasons + coverage)
- [ ] `SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md` published; provenance rollup tests pass
- [ ] `SHIFT_SEVERITY_ALLOWLISTS_v1.md` published; guardrail tests prevent false-critical
- [ ] Read-model audit harness exists; reconciliation tests pass
- [ ] Provenance/grade/quality preserved through BFF routes (no field drops)
- [ ] Gates green: type-check + test-pass
