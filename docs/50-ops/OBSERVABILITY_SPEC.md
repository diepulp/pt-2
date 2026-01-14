---
id: OPS-001
title: PT-2 Observability Specification
version: 1.1.0
status: Canonical
owner: SRE/Platform
created: 2025-11-10
last_review: 2025-12-20
affects: [ARCH-SRM, API-*, SEC-*]
---

# PT-2 Observability Specification

**Status**: Canonical
**Version**: 1.1.0
**Date**: 2025-12-20
**Owner**: SRE/Platform

---

## Overview

This document consolidates observability patterns from the Service Responsibility Matrix into a unified operational specification. All bounded contexts must emit telemetry following these standards to maintain visibility, debuggability, and SLO tracking across the platform.

**Core Principles**:
- **Correlation-first**: Every edge call carries `x-correlation-id`, propagated through all service layers
- **Audit by default**: All mutations emit canonical audit events
- **Domain-aligned KPIs**: Each service defines and tracks its own performance budgets
- **SLO-driven alerts**: Budget exhaustion triggers escalation, not arbitrary thresholds

---

## 1. Correlation & Tracing

**Reference**: [EDGE_TRANSPORT_POLICY.md](../20-architecture/EDGE_TRANSPORT_POLICY.md)

### 1.1 Correlation ID Requirements

**Headers** (required on all edge calls):
- `x-correlation-id`: UUID v4, generated at edge if missing
- `x-idempotency-key`: Required on mutations, persisted by owning service

**Propagation**:
```typescript
// Server Action / Route Handler
export async function mutateEntity(input: DTO) {
  const correlationId = headers().get('x-correlation-id') || uuidv4();
  const idempotencyKey = headers().get('x-idempotency-key');

  return withServerAction(correlationId, async (supabase) => {
    // Propagate to database session
    await supabase.rpc('set_correlation_context', {
      correlation_id: correlationId
    });

    // Service calls inherit correlation context
    return await entityService.mutate(input, idempotencyKey);
  });
}
```

**Database Propagation**:
```sql
-- Set correlation context for session
CREATE OR REPLACE FUNCTION set_correlation_context(correlation_id text)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('application_name', correlation_id, false);
$$;
```

**Usage**:
- RPCs read `current_setting('application_name')` to include in audit rows
- Logs include correlation ID for distributed tracing
- React Query hooks pass correlation ID from server components

---

## 2. Audit Logging

**Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §CasinoService.Contracts](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#casinoservice-foundational-context), `supabase/migrations/`

### 2.1 Canonical Audit Shape

All contexts emit audit events using this schema:

```typescript
interface AuditLogEntry {
  ts: string;                    // timestamptz
  actor_id: string;              // uuid (staff_id)
  casino_id: string;             // uuid (tenant scope)
  domain: string;                // 'loyalty' | 'finance' | 'mtl' | 'table-context' | ...
  action: string;                // 'create' | 'update' | 'delete' | 'issue_reward' | ...
  dto_before: JSONobject | null; // Snapshot before mutation
  dto_after: JSONobject | null;  // Snapshot after mutation
  correlation_id: string;        // From x-correlation-id header
  metadata?: JSONObject;         // Domain-specific context
}
```

### 2.2 Audit Emission Pattern

**Server Actions** (via `withServerAction`):
```typescript
// Automatically emits audit log for mutations
export const updatePlayer = withServerAction<UpdatePlayerDTO, PlayerDTO>(
  async (supabase, input, context) => {
    const before = await playerService.getById(supabase, input.id);
    const after = await playerService.update(supabase, input);

    // Audit emission handled by withServerAction wrapper
    return after;
  },
  {
    domain: 'player',
    action: 'update',
    requireIdempotencyKey: true
  }
);
```

**RPC Functions**:
```sql
-- Example: rpc_issue_mid_session_reward emits audit row
INSERT INTO audit_log (
  casino_id,
  actor_id,
  domain,
  action,
  dto_before,
  dto_after,
  correlation_id,
  created_at
) VALUES (
  p_casino_id,
  p_staff_id,
  'loyalty',
  'issue_mid_session_reward',
  null,
  jsonb_build_object(
    'ledger_id', v_ledger_id,
    'points', p_points,
    'rating_slip_id', p_rating_slip_id
  ),
  current_setting('application_name'), -- correlation_id
  now()
);
```

### 2.3 Audit Queries

**By Correlation ID** (trace full request):
```sql
SELECT * FROM audit_log
WHERE correlation_id = $1
ORDER BY created_at;
```

**By Domain** (service-specific events):
```sql
SELECT * FROM audit_log
WHERE domain = 'loyalty'
  AND casino_id = $1
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;
```

**By Actor** (staff action audit):
```sql
SELECT * FROM audit_log
WHERE actor_id = $1
  AND casino_id = $2
ORDER BY created_at DESC
LIMIT 100;
```

---

## 3. Service SLO Budgets

**Reference**: This specification is the canonical source for SLO budgets.

### 3.1 Performance Budgets by Service

| Service | Operation | SLO Target | Metric | Alert Threshold |
|---------|-----------|-----------|---------|-----------------|
| **RatingSlip** | Update telemetry | p95 < 80ms | `ratingslip_update_latency_p95` | > 100ms for 5min |
| **Loyalty** | Issue mid-session reward | p95 < 100ms | `loyalty_reward_latency_p95` | > 150ms for 5min |
| **TableContext** | Fill requested → completed | p95 < 2min | `table_fill_completion_time_p95` | > 3min for 3 occurrences |
| **TableContext** | Credit requested → completed | p95 < 2min | `table_credit_completion_time_p95` | > 3min for 3 occurrences |
| **TableContext** | Drop removed → delivered | p95 < 30min | `table_drop_delivery_time_p95` | > 45min for 1 occurrence |
| **Finance** | Create transaction | p95 < 50ms | `finance_create_txn_latency_p95` | > 75ms for 5min |
| **FloorLayout** | Activate layout | p95 < 200ms | `floor_layout_activation_latency_p95` | > 300ms for 1 occurrence |
| **ShiftDashboard** | Summary BFF | p95 < 300ms | `shift_dashboard_summary_latency_p95` | > 500ms for 5min |
| **ShiftDashboard** | Table metrics | p95 < 200ms | `shift_table_metrics_latency_p95` | > 300ms for 5min |
| **ShiftDashboard** | Pit metrics | p95 < 200ms | `shift_pit_metrics_latency_p95` | > 300ms for 5min |
| **ShiftDashboard** | Casino metrics | p95 < 150ms | `shift_casino_metrics_latency_p95` | > 250ms for 5min |

### 3.2 Tracking via pg_stat_statements

```sql
-- Enable pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Query RPC performance
SELECT
  calls,
  mean_exec_time,
  stddev_exec_time,
  max_exec_time,
  total_exec_time,
  query
FROM pg_stat_statements
WHERE query LIKE '%rpc_issue_mid_session_reward%'
ORDER BY mean_exec_time DESC;
```

### 3.3 Application-Level Metrics

```typescript
// Record operation latency
export async function withMetrics<T>(
  operation: string,
  domain: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;

    // Emit to observability platform (e.g., Datadog, Prometheus)
    metrics.histogram(`${domain}.${operation}.latency`, duration, {
      domain,
      operation,
      status: 'success'
    });

    return result;
  } catch (error) {
    const duration = performance.now() - start;
    metrics.histogram(`${domain}.${operation}.latency`, duration, {
      domain,
      operation,
      status: 'error'
    });
    throw error;
  }
}
```

---

## 4. Events & Cache Invalidation

**Reference**: [ADR-004-real-time-strategy.md](../80-adrs/ADR-004-real-time-strategy.md)

### 4.1 Domain Event Patterns

Events emitted by bounded contexts for cache invalidation and real-time updates:

| Service | Event Type | Payload Keys | React Query Invalidation |
|---------|-----------|--------------|--------------------------|
| **RatingSlip** | `ratingSlip.created` | `{casino_id, rating_slip_id, player_id, table_id}` | `['rating-slip', 'list', casino_id]` |
| **RatingSlip** | `ratingSlip.updated` | `{casino_id, rating_slip_id, status, average_bet}` | `['rating-slip', 'detail', rating_slip_id]` |
| **RatingSlip** | `ratingSlip.closed` | `{casino_id, rating_slip_id, player_id, end_time}` | `['rating-slip', 'list', casino_id]`, `['rating-slip', 'detail', rating_slip_id]` |
| **Loyalty** | `loyalty.reward_issued` | `{casino_id, player_id, ledger_id, points, balance_after}` | `['loyalty', 'balance', player_id]`, `['loyalty', 'ledger', player_id]` |
| **TableContext** | `table.fill_completed` | `{casino_id, table_id, fill_id, amount_cents}` | `['table-context', 'inventory', table_id]` |
| **TableContext** | `table.credit_completed` | `{casino_id, table_id, credit_id, amount_cents}` | `['table-context', 'inventory', table_id]` |
| **TableContext** | `table.drop_removed` | `{casino_id, table_id, drop_box_id, seal_no}` | `['table-context', 'drops', casino_id]` |
| **TableContext** | `table.drop_delivered` | `{casino_id, table_id, drop_box_id, delivered_at}` | `['table-context', 'drops', casino_id]` |
| **FloorLayout** | `floor_layout.activated` | `{casino_id, layout_id, layout_version_id, activated_at}` | `['floor-layout', 'active', casino_id]` |

### 4.2 Realtime Channel Naming

**Scoping by Tenant**:
- Global casino: `casino:{casino_id}`
- Entity-specific: `{casino_id}:{entity_type}:{entity_id}`

**Example Subscriptions**:
```typescript
// All rating slips for a casino
supabase
  .channel(`casino:${casinoId}:rating-slips`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'rating_slip',
    filter: `casino_id=eq.${casinoId}`
  }, (payload) => {
    queryClient.invalidateQueries(['rating-slip', 'list', casinoId]);
  })
  .subscribe();

// Specific rating slip detail
supabase
  .channel(`${casinoId}:rating-slip:${ratingSlipId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'rating_slip',
    filter: `id=eq.${ratingSlipId}`
  }, (payload) => {
    queryClient.setQueryData(['rating-slip', 'detail', ratingSlipId], payload.new);
  })
  .subscribe();
```

### 4.3 React Query Invalidation Patterns

**invalidateByDomainEvent** helper:
```typescript
export function invalidateByDomainEvent(
  queryClient: QueryClient,
  eventType: string,
  payload: Record<string, unknown>
) {
  const invalidationMap: Record<string, string[][]> = {
    'ratingSlip.created': [
      ['rating-slip', 'list', payload.casino_id]
    ],
    'ratingSlip.updated': [
      ['rating-slip', 'detail', payload.rating_slip_id]
    ],
    'ratingSlip.closed': [
      ['rating-slip', 'list', payload.casino_id],
      ['rating-slip', 'detail', payload.rating_slip_id]
    ],
    'loyalty.reward_issued': [
      ['loyalty', 'balance', payload.player_id],
      ['loyalty', 'ledger', payload.player_id]
    ],
    // ... other mappings
  };

  const queries = invalidationMap[eventType] || [];
  queries.forEach(queryKey => {
    queryClient.invalidateQueries(queryKey);
  });
}
```

### 4.4 Broadcast Throttling

**State Transitions Only**:
- ✅ `OPEN → PAUSED → CLOSED` (rating slip status changes)
- ✅ `requested → completed` (custody operations)
- ❌ High-frequency snapshots (inventory counts every 100ms)

**Periodic Snapshots**:
- Aggregate server-side with 1-5s debounce
- Poll + ETag for high-cardinality dashboards

---

## 5. Service-Specific KPIs

**Reference**: This specification is the canonical source for service KPIs.

### 5.1 TableContextService KPIs

| KPI | Description | Target | Alert |
|-----|-------------|--------|-------|
| **Time-to-fill** | Fill requested → delivered & received | p95 < 2min | > 3min (3x in 1hr) |
| **Fills/credits per table/shift** | Custody operation frequency | Baseline TBD | Anomaly detection |
| **Drop removed → delivered SLA** | Drop box custody timeline | p95 < 30min | > 45min (1x) |
| **% closes with zero discrepancy** | Inventory accuracy | > 95% | < 90% (weekly) |

### 5.2 LoyaltyService KPIs

| KPI | Description | Target | Alert |
|-----|-------------|--------|-------|
| **Reward issuance latency** | `rpc_issue_mid_session_reward` duration | p95 < 100ms | > 150ms (5min) |
| **Outbox processing lag** | `loyalty_outbox` pending count | < 100 | > 500 |
| **Idempotency collision rate** | Duplicate idempotency keys | < 0.1% | > 1% |

### 5.3 RatingSlipService KPIs

| KPI | Description | Target | Alert |
|-----|-------------|--------|-------|
| **Telemetry update latency** | Rating slip UPDATE duration | p95 < 80ms | > 100ms (5min) |
| **State transition errors** | Invalid state changes rejected | < 0.01% | > 0.1% |
| **Open slips > 8 hours** | Potential orphaned sessions | < 5% | > 10% |

---

## 6. Error Budgets & Alerting

### 6.1 SLO Budget Calculation

**Monthly Budget** (99.9% uptime):
- **Error budget**: 43.2 minutes downtime per month
- **Budget consumption**: Track failed requests / total requests
- **Alert when**: 50% of budget consumed in <50% of month

### 6.2 Alert Escalation Policy

| Severity | Condition | Escalation | Response Time |
|----------|-----------|------------|---------------|
| **P1 - Critical** | > 90% budget consumed OR core RPC failing | Page on-call + Slack #incidents | < 15 min |
| **P2 - High** | > 75% budget consumed OR degraded perf | Slack #alerts | < 1 hour |
| **P3 - Medium** | SLO breach but budget OK | Slack #alerts | < 4 hours |
| **P4 - Low** | Trending toward budget exhaustion | Email + Slack | Next business day |

### 6.3 Example Alerts

**Loyalty Reward Latency**:
```yaml
alert: LoyaltyRewardLatencyHigh
expr: histogram_quantile(0.95, loyalty_reward_latency_p95) > 150
for: 5m
labels:
  severity: P2
annotations:
  summary: "Loyalty reward issuance p95 > 150ms"
  description: "Mid-session reward RPC exceeding SLO target (100ms)"
```

**Rating Slip Update Latency**:
```yaml
alert: RatingSlipUpdateLatencyHigh
expr: histogram_quantile(0.95, ratingslip_update_latency_p95) > 100
for: 5m
labels:
  severity: P2
annotations:
  summary: "Rating slip updates p95 > 100ms"
  description: "Telemetry update RPC exceeding SLO target (80ms)"
```

---

## 7. Runbook References

**Placeholder**: Operational runbooks to be created under `50-ops/runbooks/`:

- `runbook-loyalty-outbox-stuck.md` - Drain stuck loyalty_outbox
- `runbook-correlation-trace.md` - Trace request via correlation_id
- `runbook-slo-breach.md` - Investigate SLO budget exhaustion
- `runbook-audit-investigation.md` - Query audit_log for compliance
- `runbook-table-inventory-discrepancy.md` - Investigate chip custody variance

---

## 8. References

- **Service Responsibility Matrix**: [SERVICE_RESPONSIBILITY_MATRIX.md](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md) (CasinoService owns `audit_log`)
- **Edge Transport Policy**: [EDGE_TRANSPORT_POLICY.md](../20-architecture/EDGE_TRANSPORT_POLICY.md)
- **Real-time Strategy**: [ADR-004-real-time-strategy.md](../80-adrs/ADR-004-real-time-strategy.md)
- **Error Taxonomy**: [ERROR_TAXONOMY_AND_RESILIENCE.md](../70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md)
- **Audit Log Schema**: `supabase/migrations/` (search: `create table audit_log`)

---

**Document Status**: v1.1.0 - Canonical observability specification
**Last Updated**: 2025-12-20
**Next Review**: After first production deployment
**Owner**: SRE/Platform
