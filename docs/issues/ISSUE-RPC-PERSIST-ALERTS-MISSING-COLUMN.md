# ISSUE: rpc_persist_anomaly_alerts — Missing Column Reference

**Severity:** HIGH — blocks alert persistence flow
**Discovered:** 2026-03-29 during E2E test development
**Status:** OPEN
**Affects:** PRD-056 (Alert Maturity)

## Symptom

Calling `rpc_persist_anomaly_alerts` returns:

```
PostgreSQL Error 42703
column ts.table_id does not exist
```

## Reproduction

```sql
SELECT * FROM rpc_persist_anomaly_alerts(p_gaming_day := '2026-03-29');
```

Or via Supabase client:
```typescript
const { data, error } = await supabase.rpc('rpc_persist_anomaly_alerts', {
  p_gaming_day: '2026-03-29',
});
// error.code === '42703'
```

## Root Cause

The function internally calls `rpc_get_anomaly_alerts` and iterates over its results. The amended version of `rpc_get_anomaly_alerts` (from `20260325101146_add_alert_context_enrichment.sql`) references `ts.table_id` using a table alias `ts` that either:
- Does not exist in the FROM clause
- Was renamed or removed during the enrichment amendment
- References a CTE or subquery that was restructured

## Migration Files

- `supabase/migrations/20260325020300_create_alert_rpcs.sql` — `rpc_persist_anomaly_alerts`
- `supabase/migrations/20260325101146_add_alert_context_enrichment.sql` — amended `rpc_get_anomaly_alerts` with context enrichment (WS8)
- `supabase/migrations/20260325020259_amend_rpcs_alert_maturity.sql` — earlier amendment

## Fix

Audit the `rpc_get_anomaly_alerts` function body (as amended by the enrichment migration) and ensure all table aliases are consistent. The alias `ts` likely referred to `table_session` which may have been removed or renamed in the enrichment rewrite.

## Impact

- `POST /api/v1/shift-intelligence/persist-alerts` returns 500
- Anomaly alerts cannot be persisted to the `shift_alert` table
- The entire alert lifecycle (persist → read → acknowledge) is blocked at the persist step
- The acknowledge and read paths work independently (tested via direct seeding)
