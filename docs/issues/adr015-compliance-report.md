# ADR-015 RLS Compliance Report

**Generated:** 2025-12-12T02:20:02-08:00
**Scanner:** scripts/adr015-rls-scanner.sh
**Reference:** docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md

---

## Summary

| Metric | Value |
|--------|-------|
| Files Scanned | 19 |
| Files Superseded | 4 |
| Files with Issues | 0 |
| Total Issues | 0 |

### Issue Breakdown

| Anti-Pattern | Count | Description |
|--------------|-------|-------------|
| BARE_CURRENT_SETTING | 0 | Missing COALESCE(NULLIF(...)) wrapper |
| MISSING_TRUE_PARAM | 0 | Missing `true` param (throws on null) |
| MISSING_AUTH_UID | 0 | Policy lacks `auth.uid() IS NOT NULL` |
| DEPRECATED_SET_LOCAL | 0 | SET LOCAL outside transaction-wrapped RPC |
| DIRECT_JWT_ONLY | 0 | JWT claim usage without session fallback |
| MISSING_ACTOR_HYBRID | 0 | app.actor_id missing COALESCE + JWT staff_id fallback |
| MISSING_ROLE_HYBRID | 0 | app.staff_role missing COALESCE + JWT staff_role fallback |

---

## Compliant Pattern (ADR-015 Pattern C)

```sql
CREATE POLICY "table_read_hybrid"
  ON {table_name} FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

**Requirements:**
1. `auth.uid() IS NOT NULL` - Ensures authenticated user
2. `current_setting('app.X', true)` - Silent fail if unset
3. `NULLIF(..., '')` - Treat empty string as null
4. `COALESCE(..., auth.jwt() -> 'app_metadata' ->> 'X')` - JWT fallback
5. For actor/role checks: include JWT staff_id/staff_role fallback in the COALESCE

---

## Anti-Patterns Detected


**No issues detected.** All scanned migrations are ADR-015 compliant.

---

## Remediation Steps

1. **For BARE_CURRENT_SETTING**: Wrap with `COALESCE(NULLIF(current_setting('app.X', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'X')::uuid)`

2. **For MISSING_TRUE_PARAM**: Add `true` as second parameter: `current_setting('app.X', true)`

3. **For MISSING_AUTH_UID**: Add `auth.uid() IS NOT NULL AND` at start of USING/WITH CHECK clause

4. **For DEPRECATED_SET_LOCAL**: Use `set_rls_context()` RPC instead (ADR-015 Phase 1)

---

## Excluded (Known Compliant)

The following migrations implement ADR-015 and are excluded from regression scanning:

- 20251209183033_adr015_rls_context_rpc.sql
- 20251209183401_adr015_hybrid_rls_policies.sql
- 20251210001858_adr015_backfill_jwt_claims.sql
- 20251211153228_adr015_rls_compliance_patch.sql
- 20251211161847_adr015_add_cashier_role.sql
- 20251211170030_adr015_finance_rls_hybrid.sql
- 20251211172516_adr015_financial_rpc_hardening.sql
- 20251212080915_sec006_rls_hardening.sql
- 20251212081000_sec007_rating_slip_rpc_hardening.sql

---

## Superseded (Policies Replaced)

The following legacy migrations contained non-compliant policies that were **replaced** by later Pattern C migrations.
The database has compliant policies; these files are historical records only.

| Legacy Migration | Fixed By |
|------------------|----------|
| 20251128221408_rating_slip_pause_tracking.sql | 20251209183401_adr015_hybrid_rls_policies.sql |
| 20251129161956_prd000_casino_foundation.sql | 20251211153228_adr015_rls_compliance_patch.sql |
| 20251129230733_prd003_player_visit_rls.sql | 20251209183401_adr015_hybrid_rls_policies.sql |
| 20251209023430_fix_staff_rls_bootstrap.sql | 20251211153228_adr015_rls_compliance_patch.sql |

---

## Next Actions

All migrations compliant. No action required.
