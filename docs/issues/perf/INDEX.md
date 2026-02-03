# Performance Issues

Tracked performance issues and optimization opportunities.

## Open Issues

| ID | Title | Severity | Component |
|----|-------|----------|-----------|
| [PERF-001](./SHIFT_DASHBOARD_HTTP_CASCADE.md) | Shift Dashboard HTTP Cascade | Medium | Shift Dashboard |
| [PERF-003](./PERF-003-CASINO-WIDE-ACTIVITY-PANEL.md) | Casino-Wide Activity Panel Redundant Query | Medium | PanelContainer, ActivityPanel |
| [PERF-004](./PERF-004-RATING-SLIP-SAVE-WATERFALL.md) | Rating Slip Save Changes Sequential Waterfall | Medium-High | RatingSlipModal, useSaveWithBuyIn |
| [PERF-005](./PERF-005-RATING-SLIP-COMPREHENSIVE-PERFORMANCE-AUDIT.md) | Rating Slip Comprehensive Performance Audit | Critical | Rating Slip surface (28 findings, 4 P0) |
| [PERF-005b](./PERF-005b-DEFERRED-P2-REVIEW.md) | Deferred P2 Items — Review & Triage | Medium-High | Rating Slip + cross-context (7 deferred items, 2 promotion candidates) |
| [PERF-006](./PERF-006-PLAYER-360-RENDER-CASCADE-COMPREHENSIVE-AUDIT.md) | Player 360 Render Cascade — Comprehensive Audit | Critical | Player 360 dashboard (28 findings, 4 P0) |
| [PERF-007](./PERF-007-SHIFT-DASHBOARD-V3-COMPREHENSIVE-AUDIT.md) | Shift Dashboard V3 — Comprehensive Audit | Critical | Shift Dashboard V3 (54 findings, 3 P0, 11 P1) |

## Resolved Issues

| ID | Title | Resolution | Commit |
|----|-------|------------|--------|
| [PERF-002](./PIT_DASHBOARD_DATA_FLOW_INVESTIGATION.md) | Pit Dashboard Data Flow Inefficiency | [Verification Report](./PERF-002-VERIFICATION-REPORT.md) | `6b4552d` |

---

## Severity Definitions

- **Critical**: User-facing latency > 3s, blocking workflows
- **High**: User-facing latency > 1.5s, degraded experience
- **Medium**: User-facing latency > 800ms, noticeable delay
- **Low**: Sub-optimal but acceptable, optimization opportunity
