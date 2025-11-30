# PRD-000 — Casino Foundation Service

## 1. Overview
- **Owner:** Lead Architect
- **Status:** Draft
- **Summary:** CasinoService provides the root temporal authority and foundational context for all PT-2 operations. It owns casino configuration (gaming day boundaries, timezone, compliance thresholds), staff registry with role-based access, and serves as the single source of truth for `gaming_day` computation consumed by all downstream bounded contexts (Finance, MTL, TableContext, RatingSlip). This PRD **replaces** the legacy `app/actions/casino.ts` Server Actions with properly architected Route Handlers using the Phase 0 `withServerAction` middleware, and adds the critical `compute_gaming_day` database RPC required for TEMP-001/TEMP-002 compliance.

## 2. Problem & Goals

### 2.1 Problem

**Legacy Code Audit Findings (2025-11-29)**

The existing `app/actions/casino.ts` was written **before** Phase 0 horizontal infrastructure (PRD-HZ-001) and contains critical regressions:

| Issue | Severity | Current State | Required State |
|-------|----------|---------------|----------------|
| No middleware wrapper | CRITICAL | Raw async functions | `withServerAction(supabase, handler, options)` |
| Wrong return type | HIGH | `Promise<T>` / `throw Error` | `Promise<ServiceResult<T>>` |
| No auth context | CRITICAL | Anonymous Supabase client | `mwCtx.rlsContext.actorId`, `casinoId` |
| No RLS injection | CRITICAL | Implicit auth only | `SET LOCAL app.actor_id`, `app.casino_id` |
| Raw error throwing | HIGH | `throw new Error(...)` | Domain errors via `mapDatabaseError()` |
| No correlation ID | MEDIUM | None | `ctx.requestId` / `correlationId` |
| No idempotency | MEDIUM | None on mutations | `requireIdempotencyKey` + middleware |
| No audit logging | MEDIUM | None | Automatic via `withAudit` middleware |
| Client-side gaming day | CRITICAL | TypeScript implementation | Database RPC (TEMP-001/TEMP-002) |

**Impact**:
- Postgres error codes leak to UI (security + UX issue)
- No audit trail for compliance
- Gaming day drift between client/server (compliance risk)
- RLS bypass possible without proper context injection

### 2.2 Goals
- **G1**: Delete `app/actions/casino.ts` and replace with Route Handlers at `app/api/v1/casino/`
- **G2**: `compute_gaming_day` database RPC deployed and returning correct gaming day for any timestamp/casino pair
- **G3**: All casino routes use `withServerAction` middleware with proper RLS context injection
- **G4**: Staff CRUD enforces role model (pit_boss/admin authenticated; dealer non-authenticated)
- **G5**: CasinoSettings CRUD supports compliance thresholds (watchlist_floor: $3k, ctr_threshold: $10k)
- **G6**: Integration tests validate temporal authority works correctly across timezone boundaries

### 2.3 Non-Goals
- Casino UI dashboard (deferred to Phase 2)
- Game configuration management UI (post-MVP)
- Multi-casino roll-ups or corporate hierarchy features
- Staff scheduling or shift management workflows
- Audit log querying or visualization

## 3. Users & Use Cases
- **Primary users:** Casino Admin, Pit Boss

**Top Jobs:**
- As a **Casino Admin**, I need to configure gaming day boundaries (start time, timezone) so that all services calculate the correct gaming day.
- As a **Casino Admin**, I need to set compliance thresholds ($3k watchlist, $10k CTR) so that MTL monitoring operates correctly.
- As a **Pit Boss**, I need to see staff assigned to my casino so that I can manage table assignments.
- As a **Casino Admin**, I need to manage staff records (create pit_boss, admin, dealer) so that access control works correctly.

## 4. Scope & Feature List

### In Scope (MVP)

**Database Layer**
- Database RPC: `compute_gaming_day(p_casino_id, p_timestamp)` returning correct date
- RLS policies for `casino_settings` (admin write, pit_boss read)
- RLS policies for `staff` (admin write, pit_boss read same-casino)
- Check constraint: dealer role requires `user_id = NULL`

**Route Handlers (replacing Server Actions)**
- `GET /api/v1/casino` - List casinos (paginated)
- `POST /api/v1/casino` - Create casino (idempotent)
- `GET /api/v1/casino/[id]` - Get casino by ID
- `PATCH /api/v1/casino/[id]` - Update casino (idempotent)
- `DELETE /api/v1/casino/[id]` - Delete casino
- `GET /api/v1/casino/settings` - Get casino settings (from RLS context)
- `PATCH /api/v1/casino/settings` - Update casino settings (idempotent)
- `GET /api/v1/casino/staff` - List staff for casino
- `POST /api/v1/casino/staff` - Create staff member (idempotent)
- `GET /api/v1/casino/gaming-day` - Compute gaming day via RPC

**Cleanup**
- Delete `app/actions/casino.ts`
- Update any UI code to use React Query + fetch

### Out of Scope
- Game settings management (future iteration)
- Company/corporate hierarchy features
- Staff authentication flows (handled by Supabase Auth)
- Bulk staff import

## 5. Requirements

### 5.1 Functional Requirements
- `compute_gaming_day(casino_id, timestamp)` returns the correct gaming day as `DATE` type
- Gaming day calculation: if timestamp is before `gaming_day_start_time` in casino timezone, return previous calendar day
- All mutations require `Idempotency-Key` header
- Staff with `role = 'dealer'` MUST have `user_id = NULL` (enforced by check constraint)
- Staff with `role IN ('pit_boss', 'admin')` MUST have `user_id` linked to `auth.users`
- All mutations write to `audit_log` with `correlation_id`
- All responses use `ServiceResult<T>` envelope

### 5.2 Non-Functional Requirements
- `compute_gaming_day` RPC executes in < 5ms p95
- Settings read is cacheable (stale-while-revalidate, 1h cache per React Query tier)
- All routes return `ServiceResult<T>` envelope via `withServerAction`
- RLS policies prevent cross-casino data access
- Domain errors returned (no Postgres error code leaks)

> Architecture details: See MVP-ROADMAP.md §1.1, SRM §882-1006, SLAD v2.1.2

## 6. UX / Flow Overview

**Flow 1: Configure Gaming Day Settings**
1. Admin opens casino settings panel
2. Admin updates `gaming_day_start_time` (e.g., "06:00") and `timezone` (e.g., "America/Los_Angeles")
3. UI calls `PATCH /api/v1/casino/settings` with `Idempotency-Key` header
4. `withServerAction` validates auth, injects RLS context, checks idempotency
5. Settings persisted, audit log written
6. All downstream gaming day calculations immediately use new settings

**Flow 2: Manage Staff**
1. Admin views staff list via `GET /api/v1/casino/staff`
2. Admin creates new staff member via `POST /api/v1/casino/staff`
3. Route validates role constraints (dealer → no user_id; pit_boss/admin → user_id required)
4. Staff record created with proper RLS scoping, audit logged

**Flow 3: Gaming Day Computation (Internal)**
1. Any service (Finance, MTL, RatingSlip) needs gaming day for a timestamp
2. Service calls `SELECT compute_gaming_day(casino_id, timestamp)` RPC
3. RPC reads `casino_settings` for that casino
4. RPC returns correct gaming day date based on timezone and start time

## 7. Dependencies & Risks

### 7.1 Dependencies
- **PRD-HZ-001** (Phase 0): `withServerAction` middleware MUST be deployed (✅ COMPLETE)
- **ServiceResult<T>** pattern MUST be available (✅ COMPLETE)
- **Error taxonomy** MUST be deployed (✅ COMPLETE)
- `casino_settings` table with `gaming_day_start_time`, `timezone`, `watchlist_floor`, `ctr_threshold` columns (verify schema)

### 7.2 Risks & Open Questions
- **DST edge cases**: Gaming day calculation during DST transitions may have edge cases → Mitigate with comprehensive DST boundary tests
- **Timezone library**: PostgreSQL `AT TIME ZONE` handles DST correctly → Verify in integration tests
- **Migration coordination**: Deleting `app/actions/casino.ts` requires updating all callers → Audit callers before deletion
- **Test migration**: `services/casino/casino.test.ts` mocks Server Actions → Must rewrite as Route Handler integration tests

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `compute_gaming_day(casino_id, timestamp)` RPC deployed and returns correct date
- [ ] Gaming day computation works correctly for timestamps before/after gaming day start
- [ ] All Route Handlers deployed at `app/api/v1/casino/`
- [ ] Staff CRUD enforces role constraints (dealer vs authenticated roles)
- [ ] Legacy `app/actions/casino.ts` deleted

**Data & Integrity**
- [ ] Gaming day is consistent when computed from different services (Finance, MTL)
- [ ] No orphaned `casino_settings` records (1:1 with `casino`)
- [ ] Idempotency prevents duplicate casino/staff creation

**Security & Access**
- [ ] RLS prevents cross-casino settings access
- [ ] Only admin role can modify `casino_settings`
- [ ] Staff records scoped by `casino_id` in all queries
- [ ] No Postgres error codes leak to API responses

**Testing**
- [ ] Integration test: `compute_gaming_day` returns correct day for multiple timezones
- [ ] Integration test: DST boundary produces correct gaming day
- [ ] Integration test: Route Handlers with `withServerAction` middleware
- [ ] Unit tests for staff role validation logic

**Operational Readiness**
- [ ] All mutations logged to `audit_log` with `correlation_id`
- [ ] Errors return domain error codes (not Postgres codes)
- [ ] Request tracing via `x-request-id` header

**Documentation**
- [ ] `services/casino/README.md` updated with Route Handler reference
- [ ] SRM §882-1006 verified accurate
- [ ] React Query keys documentation updated

## 9. Related Documents
- **Vision / Strategy**: [VIS-001-VISION-AND-SCOPE.md](../00-vision/VIS-001-VISION-AND-SCOPE.md)
- **Architecture / SRM**: [SERVICE_RESPONSIBILITY_MATRIX.md](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md) §882-1006
- **MVP Roadmap**: [MVP-ROADMAP.md](../20-architecture/MVP-ROADMAP.md) §1.1
- **Service Layer (SLAD)**: [SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md](../20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md)
- **Service Template**: [SERVICE_TEMPLATE.md](../70-governance/SERVICE_TEMPLATE.md)
- **Temporal Patterns**: [TEMP-001, TEMP-002](../20-architecture/temporal-patterns/) (gaming day authority)
- **Schema / Types**: `types/database.types.ts`
- **Security / RLS**: [SEC-001-rls-policy-matrix.md](../30-security/SEC-001-rls-policy-matrix.md)
- **Horizontal Infrastructure**: [PRD-HZ-001](./PRD-HZ-001-gate0-horizontal-infrastructure.md) (Phase 0 prerequisite)
- **Edge Transport Policy**: [EDGE_TRANSPORT_POLICY.md](../20-architecture/EDGE_TRANSPORT_POLICY.md) (Route Handler vs Server Action)

---

## Appendix A: Legacy Code Audit

### Files to Delete
```
app/actions/casino.ts              # 222 lines - replace with Route Handlers
```

### Files to Update
```
services/casino/casino.test.ts     # Rewrite as integration tests for Route Handlers
services/casino/keys.ts            # Add new query keys for Route Handler endpoints
hooks/use-casino.ts                # Update to use fetch + React Query (if exists)
```

### Callers to Audit
Run before deletion:
```bash
grep -r "from '@/app/actions/casino'" --include="*.ts" --include="*.tsx"
grep -r "from \"@/app/actions/casino\"" --include="*.ts" --include="*.tsx"
```

---

## Appendix B: Implementation Plan

### WS1: Database Layer (P0) - Day 1

**Migration: `YYYYMMDDHHMMSS_compute_gaming_day_rpc.sql`**
```sql
-- compute_gaming_day RPC
-- Single source of truth for gaming day calculation (TEMP-001, TEMP-002)
CREATE OR REPLACE FUNCTION compute_gaming_day(
  p_casino_id uuid,
  p_timestamp timestamptz DEFAULT now()
) RETURNS date
LANGUAGE plpgsql STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_start_time time;
  v_timezone text;
  v_local_time timestamptz;
  v_local_date date;
  v_start_minutes int;
  v_current_minutes int;
BEGIN
  SELECT gaming_day_start_time, timezone
  INTO v_start_time, v_timezone
  FROM casino_settings
  WHERE casino_id = p_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASINO_SETTINGS_NOT_FOUND: No settings for casino %', p_casino_id;
  END IF;

  -- Convert timestamp to casino's local timezone
  v_local_time := p_timestamp AT TIME ZONE v_timezone;
  v_local_date := v_local_time::date;

  -- Compare current time to gaming day start
  v_start_minutes := EXTRACT(HOUR FROM v_start_time) * 60 + EXTRACT(MINUTE FROM v_start_time);
  v_current_minutes := EXTRACT(HOUR FROM v_local_time) * 60 + EXTRACT(MINUTE FROM v_local_time);

  -- If before gaming day start, use previous calendar day
  IF v_current_minutes < v_start_minutes THEN
    RETURN v_local_date - 1;
  END IF;

  RETURN v_local_date;
END;
$$;

-- Staff role constraint
ALTER TABLE staff ADD CONSTRAINT chk_staff_dealer_no_user
  CHECK (
    (role = 'dealer' AND user_id IS NULL) OR
    (role IN ('pit_boss', 'admin') AND user_id IS NOT NULL)
  );
```

**RLS Policies**
```sql
-- casino_settings: Admin write, pit_boss/admin read
CREATE POLICY casino_settings_read ON casino_settings
  FOR SELECT USING (
    casino_id = current_setting('app.casino_id', true)::uuid
  );

CREATE POLICY casino_settings_write ON casino_settings
  FOR ALL USING (
    casino_id = current_setting('app.casino_id', true)::uuid
    AND current_setting('app.staff_role', true) = 'admin'
  );

-- staff: Admin write, pit_boss read same-casino
CREATE POLICY staff_read ON staff
  FOR SELECT USING (
    casino_id = current_setting('app.casino_id', true)::uuid
  );

CREATE POLICY staff_write ON staff
  FOR ALL USING (
    casino_id = current_setting('app.casino_id', true)::uuid
    AND current_setting('app.staff_role', true) = 'admin'
  );
```

### WS2: Route Handlers (P0) - Day 2-3

**Directory Structure**
```
app/api/v1/casino/
├── route.ts                    # GET (list), POST (create)
├── [id]/
│   └── route.ts                # GET (detail), PATCH (update), DELETE
├── settings/
│   └── route.ts                # GET, PATCH (casino settings)
├── staff/
│   └── route.ts                # GET (list), POST (create)
└── gaming-day/
    └── route.ts                # GET (compute via RPC)
```

**Example: `app/api/v1/casino/settings/route.ts`**
```typescript
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  createRequestContext,
  errorResponse,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database.types';

type CasinoSettingsRow = Database['public']['Tables']['casino_settings']['Row'];

export type CasinoSettingsDTO = Pick<
  CasinoSettingsRow,
  | 'id'
  | 'casino_id'
  | 'gaming_day_start_time'
  | 'timezone'
  | 'watchlist_floor'
  | 'ctr_threshold'
>;

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const casinoId = mwCtx.rlsContext!.casinoId;

        const { data, error } = await mwCtx.supabase
          .from('casino_settings')
          .select('id, casino_id, gaming_day_start_time, timezone, watchlist_floor, ctr_threshold')
          .eq('casino_id', casinoId)
          .single();

        if (error) throw error;

        return {
          ok: true as const,
          code: 'OK' as const,
          data: data as CasinoSettingsDTO,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'casino',
        action: 'settings.get',
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse(ctx, result.data);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}

const updateSettingsSchema = z.object({
  gaming_day_start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timezone: z.string().optional(),
  watchlist_floor: z.number().positive().optional(),
  ctr_threshold: z.number().positive().optional(),
});

export async function PATCH(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await request.json();
    const input = updateSettingsSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const casinoId = mwCtx.rlsContext!.casinoId;

        const { data, error } = await mwCtx.supabase
          .from('casino_settings')
          .update(input)
          .eq('casino_id', casinoId)
          .select('id, casino_id, gaming_day_start_time, timezone, watchlist_floor, ctr_threshold')
          .single();

        if (error) throw error;

        return {
          ok: true as const,
          code: 'OK' as const,
          data: data as CasinoSettingsDTO,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'casino',
        action: 'settings.update',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse(ctx, result.data);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
```

### WS3: React Query Keys Update (P1) - Day 3

**Update `services/casino/keys.ts`**
```typescript
import { serializeKeyFilters } from '@/services/shared/key-utils';

export type CasinoListFilters = {
  status?: 'active' | 'inactive';
  cursor?: string;
  limit?: number;
};

export type CasinoStaffFilters = {
  status?: 'active' | 'inactive';
  role?: 'dealer' | 'pit_boss' | 'admin';
  authenticated?: boolean;
  cursor?: string;
  limit?: number;
};

const ROOT = ['casino'] as const;

export const casinoKeys = {
  root: ROOT,

  // Casino CRUD
  list: Object.assign(
    (filters: CasinoListFilters = {}) =>
      [...ROOT, 'list', serializeKeyFilters(filters)] as const,
    { scope: [...ROOT, 'list'] as const },
  ),
  detail: (casinoId: string) => [...ROOT, 'detail', casinoId] as const,

  // Settings (scoped to authenticated user's casino)
  settings: () => [...ROOT, 'settings'] as const,

  // Staff
  staff: Object.assign(
    (filters: CasinoStaffFilters = {}) =>
      [...ROOT, 'staff', serializeKeyFilters(filters)] as const,
    { scope: [...ROOT, 'staff'] as const },
  ),

  // Gaming day computation
  gamingDay: (timestamp?: string) =>
    [...ROOT, 'gaming-day', timestamp ?? 'now'] as const,
};
```

### WS4: Testing (P1) - Day 4

**Integration Tests: `services/casino/casino.int.test.ts`**
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

describe('Casino Route Handlers', () => {
  describe('GET /api/v1/casino/settings', () => {
    it('returns settings for authenticated user casino', async () => {
      // Test with withServerAction middleware
    });

    it('returns 401 for unauthenticated request', async () => {
      // Test auth middleware
    });
  });

  describe('PATCH /api/v1/casino/settings', () => {
    it('requires idempotency key', async () => {
      // Test idempotency middleware
    });

    it('prevents cross-casino update via RLS', async () => {
      // Test RLS injection
    });
  });

  describe('compute_gaming_day RPC', () => {
    it('returns correct day for timestamp after gaming day start', async () => {
      // e.g., 10:00 AM with 06:00 start → same calendar day
    });

    it('returns previous day for timestamp before gaming day start', async () => {
      // e.g., 02:00 AM with 06:00 start → previous calendar day
    });

    it('handles DST spring forward correctly', async () => {
      // Test America/Los_Angeles on March DST transition
    });

    it('handles DST fall back correctly', async () => {
      // Test America/Los_Angeles on November DST transition
    });
  });
});
```

### WS5: Cleanup & Documentation (P1) - Day 5

- [ ] Delete `app/actions/casino.ts`
- [ ] Delete or rewrite `services/casino/casino.test.ts` (mock-based tests no longer valid)
- [ ] Update `services/casino/README.md` with Route Handler references
- [ ] Run `grep` audit to ensure no remaining imports
- [ ] Update any UI components to use React Query hooks

---

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-11-29 | Lead Architect | Initial draft - retrofit existing casino service with Phase 0 infrastructure |
| 1.1.0 | 2025-11-29 | Lead Architect | **Major revision** - Legacy audit findings added; changed from "retrofit Server Actions" to "replace with Route Handlers"; added detailed migration plan with code examples |
