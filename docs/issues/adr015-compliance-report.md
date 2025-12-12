# ADR-015 RLS Compliance Report

**Generated:** 2025-12-11T19:55:35-08:00
**Scanner:** scripts/adr015-rls-scanner.sh
**Reference:** docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md

---

## Summary

| Metric | Value |
|--------|-------|
| Files Scanned | 26 |
| Files with Issues | 4 |
| Total Issues | 63 |

### Issue Breakdown

| Anti-Pattern | Count | Description |
|--------------|-------|-------------|
| BARE_CURRENT_SETTING | 30 | Missing COALESCE(NULLIF(...)) wrapper |
| MISSING_TRUE_PARAM | 3 | Missing `true` param (throws on null) |
| MISSING_AUTH_UID | 19 | Policy lacks `auth.uid() IS NOT NULL` |
| DEPRECATED_SET_LOCAL | 0 | SET LOCAL outside transaction-wrapped RPC |
| DIRECT_JWT_ONLY | 0 | JWT claim usage without session fallback |
| MISSING_ACTOR_HYBRID | 0 | app.actor_id missing COALESCE + JWT staff_id fallback |
| MISSING_ROLE_HYBRID | 11 | app.staff_role missing COALESCE + JWT staff_role fallback |

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

### 20251128221408_rating_slip_pause_tracking.sql

  - **Line 29** [BARE_CURRENT_SETTING]: `    casino_id = current_setting('app.casino_id')::uuid...`
  - **Line 34** [BARE_CURRENT_SETTING]: `    casino_id = current_setting('app.casino_id')::uuid...`
  - **Line 39** [BARE_CURRENT_SETTING]: `    casino_id = current_setting('app.casino_id')::uuid...`
  - **Line 29** [MISSING_TRUE_PARAM]: `    casino_id = current_setting('app.casino_id')::uuid...`
  - **Line 34** [MISSING_TRUE_PARAM]: `    casino_id = current_setting('app.casino_id')::uuid...`
  - **Line 39** [MISSING_TRUE_PARAM]: `    casino_id = current_setting('app.casino_id')::uuid...`
  - **Policy** [MISSING_AUTH_UID]: `rating_slip_pause_read_same_casino` lacks `auth.uid() IS NOT NULL`
  - **Policy** [MISSING_AUTH_UID]: `rating_slip_pause_write_pit_boss` lacks `auth.uid() IS NOT NULL`
  - **Policy** [MISSING_AUTH_UID]: `rating_slip_pause_update_pit_boss` lacks `auth.uid() IS NOT NULL`

### 20251129161956_prd000_casino_foundation.sql

  - **Line 83** [BARE_CURRENT_SETTING]: `    casino_id = current_setting('app.casino_id', true)::uuid...`
  - **Line 90** [BARE_CURRENT_SETTING]: `    casino_id = current_setting('app.casino_id', true)::uuid...`
  - **Line 91** [BARE_CURRENT_SETTING]: `    AND current_setting('app.staff_role', true) = 'admin'...`
  - **Line 94** [BARE_CURRENT_SETTING]: `    casino_id = current_setting('app.casino_id', true)::uuid...`
  - **Line 95** [BARE_CURRENT_SETTING]: `    AND current_setting('app.staff_role', true) = 'admin'...`
  - **Line 108** [BARE_CURRENT_SETTING]: `    casino_id = current_setting('app.casino_id', true)::uuid...`
  - **Line 115** [BARE_CURRENT_SETTING]: `    casino_id = current_setting('app.casino_id', true)::uuid...`
  - **Line 116** [BARE_CURRENT_SETTING]: `    AND current_setting('app.staff_role', true) = 'admin'...`
  - **Line 123** [BARE_CURRENT_SETTING]: `    casino_id = current_setting('app.casino_id', true)::uuid...`
  - **Line 124** [BARE_CURRENT_SETTING]: `    AND current_setting('app.staff_role', true) = 'admin'...`
  - **Line 131** [BARE_CURRENT_SETTING]: `    casino_id = current_setting('app.casino_id', true)::uuid...`
  - **Line 132** [BARE_CURRENT_SETTING]: `    AND current_setting('app.staff_role', true) = 'admin'...`
  - **Policy** [MISSING_AUTH_UID]: `casino_settings_read` lacks `auth.uid() IS NOT NULL`
  - **Policy** [MISSING_AUTH_UID]: `casino_settings_write` lacks `auth.uid() IS NOT NULL`
  - **Policy** [MISSING_AUTH_UID]: `staff_read` lacks `auth.uid() IS NOT NULL`
  - **Policy** [MISSING_AUTH_UID]: `staff_write` lacks `auth.uid() IS NOT NULL`
  - **Policy** [MISSING_AUTH_UID]: `staff_update` lacks `auth.uid() IS NOT NULL`
  - **Policy** [MISSING_AUTH_UID]: `staff_delete` lacks `auth.uid() IS NOT NULL`
  - **Line 91** [MISSING_ROLE_HYBRID]: `    AND current_setting('app.staff_role', true) = 'admin'...`
  - **Line 95** [MISSING_ROLE_HYBRID]: `    AND current_setting('app.staff_role', true) = 'admin'...`
  - **Line 116** [MISSING_ROLE_HYBRID]: `    AND current_setting('app.staff_role', true) = 'admin'...`
  - **Line 124** [MISSING_ROLE_HYBRID]: `    AND current_setting('app.staff_role', true) = 'admin'...`
  - **Line 132** [MISSING_ROLE_HYBRID]: `    AND current_setting('app.staff_role', true) = 'admin'...`

### 20251129230733_prd003_player_visit_rls.sql

  - **Line 27** [BARE_CURRENT_SETTING]: `      AND pc.casino_id = (current_setting('app.casino_id', true))::uuid...`
  - **Line 34** [BARE_CURRENT_SETTING]: `    current_setting('app.staff_role', true) IN ('admin', 'pit_boss')...`
  - **Line 43** [BARE_CURRENT_SETTING]: `      AND pc.casino_id = (current_setting('app.casino_id', true))::uuid...`
  - **Line 45** [BARE_CURRENT_SETTING]: `    AND current_setting('app.staff_role', true) = 'admin'...`
  - **Line 58** [BARE_CURRENT_SETTING]: `    casino_id = (current_setting('app.casino_id', true))::uuid...`
  - **Line 64** [BARE_CURRENT_SETTING]: `    casino_id = (current_setting('app.casino_id', true))::uuid...`
  - **Line 65** [BARE_CURRENT_SETTING]: `    AND current_setting('app.staff_role', true) IN ('pit_boss', 'admin')...`
  - **Line 71** [BARE_CURRENT_SETTING]: `    casino_id = (current_setting('app.casino_id', true))::uuid...`
  - **Line 72** [BARE_CURRENT_SETTING]: `    AND current_setting('app.staff_role', true) = 'admin'...`
  - **Line 85** [BARE_CURRENT_SETTING]: `    casino_id = (current_setting('app.casino_id', true))::uuid...`
  - **Line 91** [BARE_CURRENT_SETTING]: `    casino_id = (current_setting('app.casino_id', true))::uuid...`
  - **Line 92** [BARE_CURRENT_SETTING]: `    AND current_setting('app.staff_role', true) IN ('pit_boss', 'admin')...`
  - **Line 98** [BARE_CURRENT_SETTING]: `    casino_id = (current_setting('app.casino_id', true))::uuid...`
  - **Line 99** [BARE_CURRENT_SETTING]: `    AND current_setting('app.staff_role', true) IN ('pit_boss', 'admin')...`
  - **Policy** [MISSING_AUTH_UID]: `player_select_enrolled` lacks `auth.uid() IS NOT NULL`
  - **Policy** [MISSING_AUTH_UID]: `player_insert_admin` lacks `auth.uid() IS NOT NULL`
  - **Policy** [MISSING_AUTH_UID]: `player_update_enrolled` lacks `auth.uid() IS NOT NULL`
  - **Policy** [MISSING_AUTH_UID]: `player_casino_select_same_casino` lacks `auth.uid() IS NOT NULL`
  - **Policy** [MISSING_AUTH_UID]: `player_casino_insert_staff` lacks `auth.uid() IS NOT NULL`
  - **Policy** [MISSING_AUTH_UID]: `player_casino_update_admin` lacks `auth.uid() IS NOT NULL`
  - **Policy** [MISSING_AUTH_UID]: `visit_select_same_casino` lacks `auth.uid() IS NOT NULL`
  - **Policy** [MISSING_AUTH_UID]: `visit_insert_staff` lacks `auth.uid() IS NOT NULL`
  - **Policy** [MISSING_AUTH_UID]: `visit_update_staff` lacks `auth.uid() IS NOT NULL`
  - **Line 34** [MISSING_ROLE_HYBRID]: `    current_setting('app.staff_role', true) IN ('admin', 'pit_boss')...`
  - **Line 45** [MISSING_ROLE_HYBRID]: `    AND current_setting('app.staff_role', true) = 'admin'...`
  - **Line 65** [MISSING_ROLE_HYBRID]: `    AND current_setting('app.staff_role', true) IN ('pit_boss', 'admin')...`
  - **Line 72** [MISSING_ROLE_HYBRID]: `    AND current_setting('app.staff_role', true) = 'admin'...`
  - **Line 92** [MISSING_ROLE_HYBRID]: `    AND current_setting('app.staff_role', true) IN ('pit_boss', 'admin')...`
  - **Line 99** [MISSING_ROLE_HYBRID]: `    AND current_setting('app.staff_role', true) IN ('pit_boss', 'admin')...`

### 20251209023430_fix_staff_rls_bootstrap.sql

  - **Line 14** [BARE_CURRENT_SETTING]: `    OR casino_id = (current_setting('app.casino_id', true))::uuid  -- Normal cas...`
  - **Policy** [MISSING_AUTH_UID]: `staff_read` lacks `auth.uid() IS NOT NULL`

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

---

## Next Actions

- [ ] Create remediation migration with timestamp format: `YYYYMMDDHHMMSS_adr015_*.sql`
- [ ] Update non-compliant policies to Pattern C
- [ ] Run `npx supabase migration up` to apply
- [ ] Run `npm run db:types` to regenerate types
- [ ] Re-run this scanner to verify compliance
