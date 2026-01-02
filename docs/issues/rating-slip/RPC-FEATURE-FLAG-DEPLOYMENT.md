# RPC Feature Flag Deployment Checklist

**Feature:** Rating Slip Modal BFF RPC (PRD-018)
**Flag:** `NEXT_PUBLIC_USE_MODAL_BFF_RPC`
**Impact:** 75% latency reduction for modal open (600ms → 150ms)

---

## Prerequisites

### 1. Database Migration Applied
Verify the RPC function exists:
```sql
SELECT proname FROM pg_proc WHERE proname = 'rpc_get_rating_slip_modal_data';
```

### 2. TypeScript Types Generated
After migration, regenerate types:
```bash
npm run db:types
```

### 3. RPC Service Verified
The RPC wrapper is already implemented at:
- `services/rating-slip-modal/rpc.ts` - Type-safe RPC wrapper
- `app/api/v1/rating-slips/[id]/modal-data/route.ts` - BFF endpoint with feature flag

---

## Deployment Steps

### Step 1: Enable in Development
```bash
# .env.local
NEXT_PUBLIC_USE_MODAL_BFF_RPC=true
```

### Step 2: Verify Locally
```bash
npm run dev

# Open a rating slip modal and check:
# 1. Modal opens correctly
# 2. All data loads (player, loyalty, financial, tables)
# 3. Check response headers for timing
curl -I "http://localhost:3000/api/v1/rating-slips/{id}/modal-data" \
  -H "Authorization: Bearer $TOKEN" \
  | grep -E "X-Query-(Path|Timings)"

# Expected output:
# X-Query-Path: rpc
# X-Query-Timings: {"rpc":95,"total":102}
```

### Step 3: Enable in Staging
```bash
# Vercel CLI
vercel env add NEXT_PUBLIC_USE_MODAL_BFF_RPC staging
# Enter: true

# Or via Vercel Dashboard:
# Project Settings > Environment Variables > Add
# Name: NEXT_PUBLIC_USE_MODAL_BFF_RPC
# Value: true
# Environment: Preview, Staging
```

### Step 4: Staging Validation
1. Open several rating slip modals
2. Verify sub-200ms response times in Network tab
3. Check all data sections load correctly:
   - Player identity
   - Loyalty balance and suggestion
   - Financial summary
   - Available tables with seat occupancy

### Step 5: Enable in Production
```bash
# Vercel CLI
vercel env add NEXT_PUBLIC_USE_MODAL_BFF_RPC production
# Enter: true

# Or via Vercel Dashboard > Production environment
```

---

## Rollback Procedure

If issues occur after enabling:

### Immediate Rollback
```bash
# Vercel CLI
vercel env rm NEXT_PUBLIC_USE_MODAL_BFF_RPC production

# Or set to false
vercel env add NEXT_PUBLIC_USE_MODAL_BFF_RPC production
# Enter: false
```

Redeploy to apply changes:
```bash
vercel --prod
```

### Rollback is Safe Because:
- Legacy path remains fully functional
- No database schema changes required
- Feature flag controls path at runtime

---

## Monitoring

### Success Metrics
After enabling, monitor for:

| Metric | Before | Expected After |
|--------|--------|----------------|
| Modal open p95 | ~700ms | <200ms |
| X-Query-Path header | "legacy" | "rpc" |
| DB round trips | 7+ | 1 |

### Response Headers to Check
```
X-Query-Path: rpc
X-Query-Timings: {"rpc":95,"total":102}
```

### Error Scenarios to Watch
1. `CASINO_MISMATCH` - RLS context issue
2. `UNAUTHORIZED` - Missing JWT context
3. `RATING_SLIP_NOT_FOUND` - Valid 404

---

## Related Documentation

- **RPC Implementation:** `services/rating-slip-modal/rpc.ts`
- **BFF Endpoint:** `app/api/v1/rating-slips/[id]/modal-data/route.ts`
- **Performance Analysis:** `docs/issues/rating-slip/PERF-ANALYSIS-RATING-SLIP.md`
- **PRD:** `docs/10-prd/PRD-018-rating-slip-modal-bff-rpc.md`
