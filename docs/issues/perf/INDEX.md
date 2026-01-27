# Performance Issues

Tracked performance issues and optimization opportunities.

## Open Issues

| ID | Title | Severity | Component |
|----|-------|----------|-----------|
| [PERF-001](./SHIFT_DASHBOARD_HTTP_CASCADE.md) | Shift Dashboard HTTP Cascade | Medium | Shift Dashboard |

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
