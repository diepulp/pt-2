# RLS Investigation Findings Report

**Date:** 2025-12-14
**Investigator:** Claude (Lead Architect Session)
**Related Issues:** ISSUE-B3C8BA48, ISSUE-5AD0182D, ISSUE-04905F8D

---

## Executive Summary

The `GET /api/v1/rating-slips/{id}/modal-data` endpoint returns 500 errors due to **broken RLS policy patterns** in the PRD-004 Loyalty Service migrations. The root cause is a missing `NULLIF` wrapper and incorrect JWT path in COALESCE expressions.

**Error captured:**
```json
{
  "code": "22P02",
  "error": "invalid input syntax for type uuid: \"\"",
  "requestId": "5854eaa6-5fdf-4555-8744-d1dfa496839a"
}
```

---

## Root Cause Analysis

### Primary Bug Location

**File:** `supabase/migrations/20251213003000_prd004_loyalty_service_schema.sql`

**Broken Pattern (Lines 198-201, 242-245, etc.):**
```sql
casino_id = COALESCE(
  current_setting('app.casino_id', true)::uuid,  -- BUG 1
  (auth.jwt()->>'casino_id')::uuid               -- BUG 2
)
```

### Bug Details

| Bug | Issue | Impact |
|-----|-------|--------|
| **BUG 1: Missing NULLIF** | `current_setting` returns `''` (empty string) when unset | Casting `''::uuid` throws PostgreSQL error 22P02 |
| **BUG 2: Wrong JWT Path** | JWT casino_id is at `app_metadata.casino_id`, not root | Fallback returns NULL, doesn't help when BUG 1 fails |

### Correct Pattern (ADR-015 Pattern C)

```sql
casino_id = COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
)
```

---

## ADR-015 Scanner Results

**Total Issues Found:** 63

| Migration | Issues | Categories |
|-----------|--------|------------|
| `20251213000820_prd004_loyalty_rls_cashier_role.sql` | 12 | BARE_CURRENT_SETTING, DIRECT_JWT_ONLY, MISSING_ROLE_HYBRID |
| `20251213003000_prd004_loyalty_service_schema.sql` | 15 | BARE_CURRENT_SETTING, MISSING_AUTH_UID, MISSING_ROLE_HYBRID |
| `20251213010000_prd004_loyalty_rpcs.sql` | 20 | BARE_CURRENT_SETTING, DIRECT_JWT_ONLY, MISSING_ROLE_HYBRID |
| `20251213190000_adr015_fix_rpc_context_injection.sql` | 16 | BARE_CURRENT_SETTING, DIRECT_JWT_ONLY, MISSING_ROLE_HYBRID |

### Issue Categories

| Anti-Pattern | Count | Description |
|--------------|-------|-------------|
| BARE_CURRENT_SETTING | 33 | Missing `NULLIF(..., '')` wrapper before `::uuid` cast |
| DIRECT_JWT_ONLY | 12 | Using `auth.jwt()->>'casino_id'` instead of `auth.jwt()->'app_metadata'->>'casino_id'` |
| MISSING_ROLE_HYBRID | 16 | `app.staff_role` without JWT `staff_role` fallback |
| MISSING_AUTH_UID | 2 | Policies without `auth.uid() IS NOT NULL` guard |

---

## Affected Code Paths

### modal-data Endpoint Flow

```
GET /api/v1/rating-slips/{id}/modal-data
  └─ withServerAction (auth middleware)
     └─ ratingSlipService.getById()        ✓ Works (rating_slip RLS is fixed)
     └─ visitService.getById()             ✓ Works (visit RLS is fixed)
     └─ loyaltyService.getBalance()        ✗ FAILS (player_loyalty RLS broken)
     └─ loyaltyService.evaluateSuggestion() ✗ FAILS (loyalty_ledger RLS broken)
```

### Why Rating Slip Works But Loyalty Fails

- **rating_slip** table: Policies fixed in `20251209183401_adr015_hybrid_rls_policies.sql`
- **player_loyalty** table: Created in `20251213003000_prd004_loyalty_service_schema.sql` with broken patterns
- **loyalty_ledger** table: Same migration, same broken patterns

---

## Evidence

### Network Request (Chrome DevTools)

```
reqid=48 GET /api/v1/rating-slips/d1000000-0000-0000-0000-000000000004/modal-data [failed - 500]
```

### Response Body

```json
{
  "ok": false,
  "code": "INTERNAL_ERROR",
  "status": 500,
  "error": "invalid input syntax for type uuid: \"\"",
  "details": {
    "code": "22P02",
    "details": null,
    "hint": null,
    "message": "invalid input syntax for type uuid: \"\""
  }
}
```

### JWT Token Analysis

The authenticated user's JWT contains valid `app_metadata`:
```json
{
  "app_metadata": {
    "casino_id": "ca000000-0000-0000-0000-000000000001",
    "staff_id": "5a000000-0000-0000-0000-000000000001",
    "staff_role": "pit_boss"
  }
}
```

The fallback **would work** if the JWT path was correct (`auth.jwt()->'app_metadata'->>'casino_id'`).

---

## Remediation Plan

### Immediate Fix (P0)

Create migration: `YYYYMMDDHHMMSS_adr015_prd004_loyalty_rls_fix.sql`

1. **Fix loyalty_ledger policies** (4 policies)
2. **Fix player_loyalty policies** (4 policies)
3. **Fix loyalty_config policies** (if any)

### Pattern to Apply

**For casino_id checks:**
```sql
casino_id = COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
)
```

**For staff_role checks:**
```sql
COALESCE(
  NULLIF(current_setting('app.staff_role', true), ''),
  (auth.jwt() -> 'app_metadata' ->> 'staff_role')
) IN ('pit_boss', 'admin')
```

### Post-Fix Validation

1. Run `npm run db:types` to regenerate TypeScript types
2. Re-run ADR-015 scanner: `bash scripts/adr015-rls-scanner.sh`
3. Test modal-data endpoint in browser
4. Run integration tests: `npm test -- --grep "loyalty"`

---

## Related Documentation

- [ADR-015: RLS Connection Pooling Strategy](../80-adrs/ADR-015-rls-connection-pooling-strategy.md)
- [ADR-015 Compliance Report](./adr015-compliance-report.md)
- [ISSUE-B3C8BA48: E2E test suite fails to catch RLS issues](./ISSUE-B3C8BA48-E2E-TEST-RESOLUTION.md)

---

## Appendix: Full Scanner Output

See `docs/issues/adr015-compliance-report.md` for the complete line-by-line breakdown of all 63 issues.
