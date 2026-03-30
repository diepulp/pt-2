# ISSUE: rpc_compute_rolling_baseline — Ambiguous Column Reference

**Severity:** HIGH — blocks baseline computation and downstream persist/anomaly flows
**Discovered:** 2026-03-29 during E2E test development
**Status:** OPEN
**Affects:** PRD-055 (Shift Baseline Service)

## Symptom

Calling `rpc_compute_rolling_baseline` with `p_gaming_day` parameter returns:

```
PostgreSQL Error 42702
column reference "gaming_day" is ambiguous
It could refer to either a PL/pgSQL variable or a table column.
```

## Reproduction

```sql
SELECT * FROM rpc_compute_rolling_baseline(p_gaming_day := '2026-03-29');
```

Or via Supabase client:
```typescript
const { data, error } = await supabase.rpc('rpc_compute_rolling_baseline', {
  p_gaming_day: '2026-03-29',
});
// error.code === '42702'
```

## Root Cause

Inside the function body, the identifier `gaming_day` is used unqualified in a SQL statement where it could refer to either:
- A PL/pgSQL local variable (derived from `p_gaming_day` or `compute_gaming_day()`)
- A column on a table being queried (e.g., `table_metric_baseline.gaming_day`, `table_session.gaming_day`)

PostgreSQL raises 42702 when it cannot disambiguate.

## Migration Files

- `supabase/migrations/20260323165908_create_shift_baseline_service.sql` — original function
- `supabase/migrations/20260325020259_amend_rpcs_alert_maturity.sql` — amended version (PRD-056)

## Fix

Qualify all column references with their table alias (e.g., `tmb.gaming_day` instead of `gaming_day`) or rename the PL/pgSQL variable to avoid the collision (e.g., `v_target_day` instead of reusing `gaming_day`).

## Impact

- `POST /api/v1/shift-intelligence/compute-baselines` returns 500
- `rpc_persist_anomaly_alerts` internally calls `rpc_get_anomaly_alerts` which depends on computed baselines — the persist flow is degraded
- Anomaly detection cannot refresh baselines
