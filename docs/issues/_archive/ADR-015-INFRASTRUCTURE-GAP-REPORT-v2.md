# ADR-015 Infrastructure Gap Report v2

**Generated:** 2025-12-12
**Previous Version:** 2025-12-11
**Reference:** docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md
**Audit Trigger:** SEC-006 RLS hardening migration (20251212080915)
**Auditor:** rls-expert skill

---

## Executive Summary

| Category | Status | Notes |
|----------|--------|-------|
| **Database RLS Policies** | ✅ COMPLIANT | SEC-006 migration applied |
| **FloorLayoutService RLS** | ✅ COMPLIANT | 5 tables hardened with Pattern C |
| **SEC-006 Hardened RPCs** | ✅ COMPLIANT | 7 RPCs with Template 5 validation |
| **Application Layer** | ⚠️ GAP IDENTIFIED | API routes missing `withServerAction` |
| **Rating Slip RPCs** | ✅ COMPLIANT | 5 RPCs hardened (SEC-007 migration) |
| **JWT Claims Sync** | ✅ COMPLIANT | Staff CRUD and trigger auto-sync |
| **Service Layer** | ⚠️ INCOMPLETE | FloorLayoutService missing service factory |

---

## Critical Severity (P0) - Immediate Action Required

### 1. API Routes Missing `withServerAction` Middleware

**Routes Affected (FULLY IMPLEMENTED - ACTIVE RISK):**

| Route | Methods | Issue |
|-------|---------|-------|
| `/api/v1/floor-layouts/route.ts` | GET, POST | No RLS context injection |
| `/api/v1/floor-layouts/[layoutId]/versions/route.ts` | GET | No RLS context injection |
| `/api/v1/floor-layout-activations/route.ts` | POST | No RLS context injection |

**Impact:**
- GET endpoints will **fail** with RLS errors (no context set)
- POST endpoints will **fail** with "RLS context not set" exception from SEC-006 hardened RPCs
- Example: `rpc_create_floor_layout` now validates `current_setting('app.casino_id')` but caller never sets it

**Code Pattern (Non-Compliant):**
```typescript
// app/api/v1/floor-layouts/route.ts (lines 28-68)
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);
  try {
    const query = parseQuery(request, listQuerySchema);
    const supabase = await createClient();  // ❌ No RLS context

    let dbQuery = supabase
      .from('floor_layout')
      .select('*')
      .eq('casino_id', query.casino_id);  // ❌ Relies on RLS but context not set
    // ...
  }
}
```

**Required Pattern (Compliant):**
```typescript
// Example from app/api/v1/financial-transactions/route.ts
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);
  try {
    const supabase = await createClient();
    const query = parseQuery(request, querySchema);

    const result = await withServerAction(  // ✅ Injects RLS context
      supabase,
      async (mwCtx) => {
        // Use mwCtx.supabase which has RLS context set
        const { data, error } = await mwCtx.supabase
          .from('table')
          .select('*');
        // ...
      },
      { domain: 'floor-layout', action: 'list', correlationId: ctx.requestId }
    );
    // ...
  }
}
```

**Remediation:**
- Update all 3 route files to use `withServerAction` middleware
- Follow pattern from `/api/v1/financial-transactions/route.ts`
- Test with RLS-enabled Supabase client

---

### 2. ~~Rating Slip RPCs Missing Context Validation~~ ✅ RESOLVED

**Status:** RESOLVED - Migration `20251212081000_sec007_rating_slip_rpc_hardening.sql` applied

**Functions Hardened:**

| Function | Migration | Status |
|----------|-----------|--------|
| `rpc_start_rating_slip` | `20251212081000_sec007_...` | ✅ Template 5 validation |
| `rpc_pause_rating_slip` | `20251212081000_sec007_...` | ✅ Template 5 validation |
| `rpc_resume_rating_slip` | `20251212081000_sec007_...` | ✅ Template 5 validation |
| `rpc_close_rating_slip` | `20251212081000_sec007_...` | ✅ Template 5 validation |
| `rpc_update_table_status` | `20251212081000_sec007_...` | ✅ Template 5 validation |

**Changes Made:**
- Added Template 5 context validation block to all 5 RPCs
- Validates `p_casino_id` matches `current_setting('app.casino_id')` or JWT claims
- Raises exception on context mismatch
- Dropped legacy 7-param `rpc_start_rating_slip` (with `p_player_id`)

---

## High Severity (P1) - Address This Sprint

### 3. FloorLayoutService Missing Service Factory

**Location:** `services/floor-layout/`

**Files Present:**
- `crud.ts` ✅
- `dtos.ts` ✅
- `keys.ts` ✅
- `mappers.ts` ✅
- `selects.ts` ✅

**Files Missing:**
- `index.ts` ❌ (service factory)
- `schemas.ts` ❌ (Zod validation schemas)

**Impact:**
- Service cannot be properly instantiated with typed interface
- API routes use CRUD functions directly instead of through service factory
- No consistent service interface for dependency injection

**Remediation:**
- Create `services/floor-layout/index.ts` with `createFloorLayoutService()` factory
- Follow pattern from `services/casino/index.ts`
- Create `services/floor-layout/schemas.ts` for input validation

---

### 4. Stub Routes Not Implemented

**Routes with TODO Placeholders (Lower Priority - Not Active Risk):**

| Directory | Routes | Status |
|-----------|--------|--------|
| `/api/v1/casinos/` | 3 routes | Stub - returns null |
| `/api/v1/finance/` | 2 routes | Stub - returns null |
| `/api/v1/loyalty/` | 3 routes | Stub - returns null |
| `/api/v1/mtl/` | 3 routes | Stub - returns null |

**Note:** These routes have `void supabase` and return hardcoded empty responses. They are not active security risks but will need `withServerAction` when implemented.

---

## Medium Severity (P2) - Schedule for Next Iteration

### 5. `compute_gaming_day` RPC - Read-Only Assessment

**Location:** `20251129161956_prd000_casino_foundation.sql:11`

**Status:** Likely low risk (read-only function returning computed date)

**Recommendation:** Audit to confirm it only reads from `casino_settings` and doesn't write data. If read-only, context validation may be optional.

---

### 6. JWT Sync Functions - System Assessment

**Functions:**
- `sync_staff_jwt_claims()` - `20251210001858_adr015_backfill_jwt_claims.sql:26`
- `sync_staff_jwt_claims_trigger()` - `20251210001858_adr015_backfill_jwt_claims.sql:98`

**Status:** These are system-level functions for JWT claims synchronization. They operate on `auth.users` metadata and are called via triggers.

**Recommendation:** These don't need casino context validation as they're internal system operations triggered by staff CRUD.

---

## Compliance Summary Matrix (Updated)

| Category | Previous Status | Current Status | Delta |
|----------|-----------------|----------------|-------|
| Tables with RLS Enabled | 28/33 | 33/33 | +5 (floor layout tables) |
| Pattern C (Hybrid) Policies | 90% | 98% | +8% |
| RPC Context Validation | 2/13 | 14/14 | +12 (SEC-006 + SEC-007) |
| API Route RLS Middleware | Unknown | 32/35 | 3 routes need fix |
| Append-Only Ledger Policies | 60% | 100% | +40% (SEC-006) |

---

## Remediation Priority

### Immediate (P0) - Before Next Deployment

| ID | Task | Owner | Est. Effort | Status |
|----|------|-------|-------------|--------|
| WS1 | Update floor-layout API routes with `withServerAction` | backend-developer | 2h | ⏳ PENDING |
| ~~WS2~~ | ~~Harden 5 rating slip RPCs with Template 5~~ | ~~rls-expert~~ | ~~2h~~ | ✅ DONE |
| ~~WS3~~ | ~~Create SEC-007 migration~~ | ~~rls-expert~~ | ~~1h~~ | ✅ DONE |

### This Sprint (P1)

| ID | Task | Owner | Est. Effort |
|----|------|-------|-------------|
| WS4 | Create `services/floor-layout/index.ts` service factory | backend-developer | 1h |
| WS5 | Create `services/floor-layout/schemas.ts` | backend-developer | 30m |
| WS6 | Update SEC-006 audit document with completion status | lead-architect | 30m |

### Next Iteration (P2)

| ID | Task | Owner | Est. Effort |
|----|------|-------|-------------|
| WS7 | Implement stub routes with proper `withServerAction` | backend-developer | 4h |
| WS8 | Audit `compute_gaming_day` for context needs | rls-expert | 30m |
| WS9 | Add pre-commit hook for SECURITY DEFINER validation | devops | 1h |

---

## Verification Checklist

After P0 remediation:

- [ ] Floor layout GET endpoints return data with RLS context
- [ ] Floor layout POST endpoints succeed with authenticated user
- [ ] `rpc_start_rating_slip` throws on mismatched `p_casino_id`
- [ ] `rpc_pause_rating_slip` throws on mismatched `p_casino_id`
- [ ] `rpc_resume_rating_slip` throws on mismatched `p_casino_id`
- [ ] `rpc_close_rating_slip` throws on mismatched `p_casino_id`
- [ ] `rpc_update_table_status` throws on mismatched `p_casino_id`
- [ ] Cross-tenant rating slip creation fails
- [ ] Integration tests pass for rating slip service

---

## Root Cause Analysis (Updated)

### SEC-006 Addressed:
- FloorLayoutService RLS policies ✅
- Floor layout RPCs (2) ✅
- Chip custody RPCs (4) ✅
- Loyalty RPC (1) ✅
- Append-only ledger denial policies ✅

### SEC-006 Missed:
- **API route layer** - Database policies exist but routes don't inject context
- **Rating slip RPCs** - Not audited in original SEC-006 scope
- **Service factory pattern** - FloorLayoutService incomplete

### Systemic Issue:
The original ADR-015 compliance patch focused on database-layer fixes. The application layer (API routes) was not systematically audited for `withServerAction` usage. This gap was discovered during the post-SEC-006 audit.

---

## References

- `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`
- `docs/80-adrs/ADR-018-security-definer-governance.md`
- `docs/30-security/SEC-006-rls-strategy-audit-2025-12-11.md`
- `docs/30-security/SEC-001-rls-policy-matrix.md`
- `lib/server-actions/with-server-action-wrapper.ts`
- `app/api/v1/financial-transactions/route.ts` (compliant reference)

---

## Changelog

| Date | Change |
|------|--------|
| 2025-12-11 | Initial infrastructure gap report |
| 2025-12-12 | **v2** - Post-SEC-006 audit identifying API route gaps and rating slip RPC vulnerabilities |
| 2025-12-12 | **SEC-007 Applied** - Rating slip RPCs hardened with Template 5 context validation (5 functions) |
