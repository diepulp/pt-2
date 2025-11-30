# PRD-000 Casino Foundation: Parallel Execution Workflows

---
id: WORKFLOW-PRD-000
title: Parallel Execution Workflows for Casino Foundation
spec: SPEC-PRD-000-casino-foundation.md
version: 1.0.0
status: Ready
created: 2025-11-29
author: Backend Service Builder
---

## Overview

This document provides **detailed, self-contained workflows** for each workstream defined in SPEC-PRD-000. Each workflow is designed for **parallel execution by expert sub-agents** with minimal coordination overhead.

### Execution Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PARALLEL EXECUTION PHASES                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHASE 1 (Parallel - No Dependencies)                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                         │
│  │    WS1      │  │    WS2      │  │    WS5a     │                         │
│  │  Database   │  │  Service    │  │   Audit     │                         │
│  │   Layer     │  │   Layer     │  │  (grep)     │                         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                         │
│         │                │                │                                 │
│         └────────────────┼────────────────┘                                 │
│                          ▼                                                  │
│  PHASE 2 (Parallel - After WS1+WS2 Complete)                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  WS3-A      │  │  WS3-B      │  │  WS3-C      │  │  WS3-D      │        │
│  │ Casino CRUD │  │  Settings   │  │   Staff     │  │ Gaming Day  │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                │
│         └────────────────┴────────────────┴────────────────┘                │
│                                   ▼                                         │
│  PHASE 3 (Parallel - After WS3 Complete)                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                         │
│  │  WS4-A      │  │  WS4-B      │  │  WS5b       │                         │
│  │ Unit Tests  │  │ Integration │  │  Cleanup    │                         │
│  │             │  │   Tests     │  │  + UI       │                         │
│  └─────────────┘  └─────────────┘  └─────────────┘                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Coordination Points

| Checkpoint | Blocking | Signal |
|------------|----------|--------|
| CP-1 | WS1 migration applied | `npm run db:types` succeeds, types regenerated |
| CP-2 | WS2 service files created | All TS files compile without errors |
| CP-3 | WS3 route handlers deployed | `npm run build` succeeds |
| CP-4 | WS4 tests passing | `npm test` exits 0 |

---

## WS1: Database Layer

**Agent Type**: `pt2-service-implementer`
**Priority**: 0 (Blocking - must complete before WS3)
**Estimated Duration**: 3.75 hours
**Dependencies**: None

### Agent Prompt

```
TASK: Create database migration for PRD-000 Casino Foundation

CONTEXT:
You are implementing the database layer for CasinoService per SPEC-PRD-000.
This includes:
1. compute_gaming_day RPC function
2. Staff role constraint (chk_staff_role_user_id)
3. RLS policies for casino_settings and staff tables

SPEC REFERENCE: docs/20-architecture/specs/PRD-000/SPEC-PRD-000-casino-foundation.md §3

DELIVERABLES:
1. Migration file: supabase/migrations/{timestamp}_prd000_casino_foundation.sql
2. Regenerated types: types/database.types.ts
3. Passing schema verification

DETAILED STEPS:

STEP 1: Generate Migration Timestamp
- Run: date +"%Y%m%d%H%M%S"
- Store result for migration filename

STEP 2: Create Migration File
- Path: supabase/migrations/{timestamp}_prd000_casino_foundation.sql
- Contents (copy from SPEC §3.2, §3.3, §3.4):

```sql
-- PRD-000: Casino Foundation Database Migration
-- Purpose: compute_gaming_day RPC, staff role constraint, RLS policies

-- =============================================================================
-- 1. compute_gaming_day RPC Function
-- =============================================================================
-- TEMP-001: Single source of truth for gaming day calculation
-- All downstream services MUST use this for temporal alignment

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
  -- Fetch casino settings
  SELECT gaming_day_start_time::time, timezone
  INTO v_start_time, v_timezone
  FROM casino_settings
  WHERE casino_id = p_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASINO_SETTINGS_NOT_FOUND: No settings for casino %', p_casino_id
      USING ERRCODE = 'P0002';
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

COMMENT ON FUNCTION compute_gaming_day IS 'TEMP-001: Single source of truth for gaming day calculation. Used by Finance, MTL, and all services requiring temporal alignment.';

-- =============================================================================
-- 2. Staff Role Constraint
-- =============================================================================
-- PRD-000: Dealers cannot have user_id (non-authenticated)
-- pit_boss/admin must have user_id linked to auth.users

ALTER TABLE staff ADD CONSTRAINT chk_staff_role_user_id
  CHECK (
    (role = 'dealer' AND user_id IS NULL) OR
    (role IN ('pit_boss', 'admin') AND user_id IS NOT NULL)
  );

COMMENT ON CONSTRAINT chk_staff_role_user_id ON staff IS 'PRD-000: Dealers cannot have user_id (non-authenticated); pit_boss/admin must have user_id linked to auth.users';

-- =============================================================================
-- 3. RLS Policies - casino_settings
-- =============================================================================

ALTER TABLE casino_settings ENABLE ROW LEVEL SECURITY;

-- Read: Any authenticated staff member in same casino can read
CREATE POLICY casino_settings_read ON casino_settings
  FOR SELECT USING (
    casino_id = current_setting('app.casino_id', true)::uuid
  );

-- Write: Only admin role can modify settings
CREATE POLICY casino_settings_write ON casino_settings
  FOR ALL USING (
    casino_id = current_setting('app.casino_id', true)::uuid
    AND current_setting('app.staff_role', true) = 'admin'
  )
  WITH CHECK (
    casino_id = current_setting('app.casino_id', true)::uuid
    AND current_setting('app.staff_role', true) = 'admin'
  );

-- =============================================================================
-- 4. RLS Policies - staff
-- =============================================================================

-- Staff read: Same casino
CREATE POLICY staff_read ON staff
  FOR SELECT USING (
    casino_id = current_setting('app.casino_id', true)::uuid
  );

-- Staff write: Admin only
CREATE POLICY staff_write ON staff
  FOR INSERT WITH CHECK (
    casino_id = current_setting('app.casino_id', true)::uuid
    AND current_setting('app.staff_role', true) = 'admin'
  );

CREATE POLICY staff_update ON staff
  FOR UPDATE USING (
    casino_id = current_setting('app.casino_id', true)::uuid
    AND current_setting('app.staff_role', true) = 'admin'
  );

CREATE POLICY staff_delete ON staff
  FOR DELETE USING (
    casino_id = current_setting('app.casino_id', true)::uuid
    AND current_setting('app.staff_role', true) = 'admin'
  );

-- =============================================================================
-- 5. Notify PostgREST to reload schema
-- =============================================================================
NOTIFY pgrst, 'reload schema';
```

STEP 3: Apply Migration
- Run: npx supabase migration up
- Verify: No errors in output

STEP 4: Regenerate Types
- Run: npm run db:types
- Verify: types/database.types.ts updated with compute_gaming_day RPC

STEP 5: Verify Schema
- Run: npm run type-check
- Run: npm test -- schema-verification (if exists)

VALIDATION CHECKLIST:
- [ ] Migration file follows YYYYMMDDHHMMSS_description.sql naming
- [ ] compute_gaming_day RPC exists and returns date type
- [ ] Staff constraint rejects dealer+user_id combination
- [ ] Staff constraint requires user_id for pit_boss/admin
- [ ] RLS policies enable for casino_settings
- [ ] RLS policies enable for staff table
- [ ] Types regenerated successfully
- [ ] No TypeScript compilation errors

SUCCESS SIGNAL:
Output "WS1-COMPLETE: Migration applied, types regenerated" when done.

ERROR HANDLING:
- If migration fails: Check for existing constraints/policies and DROP before CREATE
- If constraint already exists: ALTER TABLE staff DROP CONSTRAINT IF EXISTS chk_staff_role_user_id; first
- If RLS policies exist: DROP POLICY IF EXISTS before CREATE POLICY
```

### Expected Outputs

| Artifact | Path | Validation |
|----------|------|------------|
| Migration | `supabase/migrations/{ts}_prd000_casino_foundation.sql` | File exists, valid SQL |
| Types | `types/database.types.ts` | Contains `compute_gaming_day` function type |
| Schema | Database | RPC callable, constraint enforced |

---

## WS2: Service Layer

**Agent Type**: `pt2-service-implementer`
**Priority**: 0 (Blocking - must complete before WS3)
**Estimated Duration**: 4 hours
**Dependencies**: None (can run parallel with WS1)

### Agent Prompt

```
TASK: Create CasinoService layer files for PRD-000

CONTEXT:
You are implementing the service layer for CasinoService per SPEC-PRD-000.
CasinoService follows Pattern B (Canonical CRUD) with DTOs derived via Pick/Omit.

SPEC REFERENCE: docs/20-architecture/specs/PRD-000/SPEC-PRD-000-casino-foundation.md §4, §6

PATTERN: B (Canonical CRUD)
- DTOs use Pick/Omit from Database types (NOT manual interfaces)
- No mappers needed (schema auto-propagates)
- keys.ts and README.md required

DELIVERABLES:
1. services/casino/dtos.ts - DTO type definitions
2. services/casino/schemas.ts - Zod validation schemas
3. services/casino/keys.ts - React Query key factories
4. services/casino/http.ts - HTTP fetcher functions
5. services/casino/README.md - Service documentation

DETAILED STEPS:

STEP 1: Create DTOs (services/casino/dtos.ts)
- MUST use Pick/Omit from Database types (Pattern B requirement)
- Copy from SPEC §4.2

```typescript
// services/casino/dtos.ts

import type { Database } from '@/types/database.types';

type CasinoRow = Database['public']['Tables']['casino']['Row'];
type CasinoSettingsRow = Database['public']['Tables']['casino_settings']['Row'];
type StaffRow = Database['public']['Tables']['staff']['Row'];

// === Casino DTOs ===

/** Public casino profile */
export type CasinoDTO = Pick<
  CasinoRow,
  'id' | 'name' | 'location' | 'status' | 'created_at'
>;

/** Casino creation input */
export type CreateCasinoDTO = Pick<
  Database['public']['Tables']['casino']['Insert'],
  'name' | 'location' | 'address' | 'company_id'
>;

/** Casino update input */
export type UpdateCasinoDTO = Partial<CreateCasinoDTO>;

// === Casino Settings DTOs ===

/** Public casino settings (excludes internal fields) */
export type CasinoSettingsDTO = Pick<
  CasinoSettingsRow,
  | 'id'
  | 'casino_id'
  | 'gaming_day_start_time'
  | 'timezone'
  | 'watchlist_floor'
  | 'ctr_threshold'
>;

/** Settings update input */
export type UpdateCasinoSettingsDTO = Partial<Pick<
  Database['public']['Tables']['casino_settings']['Update'],
  'gaming_day_start_time' | 'timezone' | 'watchlist_floor' | 'ctr_threshold'
>>;

// === Staff DTOs ===

/** Public staff profile (excludes email for privacy) */
export type StaffDTO = Pick<
  StaffRow,
  'id' | 'first_name' | 'last_name' | 'role' | 'status' | 'employee_id' | 'casino_id'
>;

/** Staff creation input */
export type CreateStaffDTO = Pick<
  Database['public']['Tables']['staff']['Insert'],
  'first_name' | 'last_name' | 'role' | 'employee_id' | 'email' | 'casino_id' | 'user_id'
>;

// === Gaming Day DTO ===

/** Gaming day computation result */
export interface GamingDayDTO {
  gaming_day: string;  // ISO date string (YYYY-MM-DD)
  casino_id: string;
  computed_at: string; // ISO timestamp
  timezone: string;
}

// === Filter Types (for keys.ts) ===

export type CasinoListFilters = {
  status?: 'active' | 'inactive';
  cursor?: string;
  limit?: number;
};

export type CasinoStaffFilters = {
  status?: 'active' | 'inactive';
  role?: 'dealer' | 'pit_boss' | 'admin';
  cursor?: string;
  limit?: number;
};
```

STEP 2: Create Zod Schemas (services/casino/schemas.ts)
- Copy from SPEC §4.3
- Ensure staff role constraint is validated in Zod

```typescript
// services/casino/schemas.ts

import { z } from 'zod';

export const createCasinoSchema = z.object({
  name: z.string().min(1).max(255),
  location: z.string().max(255).nullable().optional(),
  address: z.record(z.unknown()).nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
});

export const updateCasinoSchema = createCasinoSchema.partial();

export const updateCasinoSettingsSchema = z.object({
  gaming_day_start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/,
    'Must be HH:MM or HH:MM:SS format').optional(),
  timezone: z.string().min(1).max(64).optional(),
  watchlist_floor: z.number().positive().optional(),
  ctr_threshold: z.number().positive().optional(),
});

export const createStaffSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  role: z.enum(['dealer', 'pit_boss', 'admin']),
  employee_id: z.string().max(50).nullable().optional(),
  email: z.string().email().nullable().optional(),
  user_id: z.string().uuid().nullable().optional(),
}).refine(
  (data) => {
    // Dealer must NOT have user_id; pit_boss/admin MUST have user_id
    if (data.role === 'dealer') {
      return data.user_id === null || data.user_id === undefined;
    }
    return data.user_id !== null && data.user_id !== undefined;
  },
  {
    message: 'Dealer role cannot have user_id; pit_boss/admin must have user_id',
    path: ['user_id'],
  }
);

export const gamingDayQuerySchema = z.object({
  timestamp: z.string().datetime().optional(),
});

// Query param schemas
export const casinoListQuerySchema = z.object({
  status: z.enum(['active', 'inactive']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const staffListQuerySchema = z.object({
  status: z.enum(['active', 'inactive']).optional(),
  role: z.enum(['dealer', 'pit_boss', 'admin']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});
```

STEP 3: Create Query Keys (services/casino/keys.ts)
- Use .scope pattern for surgical invalidation
- Copy from SPEC §6.1

```typescript
// services/casino/keys.ts

import { serializeKeyFilters } from '@/services/shared/key-utils';
import type { CasinoListFilters, CasinoStaffFilters } from './dtos';

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

  // Settings (scoped to authenticated user's casino via RLS)
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

// Re-export filter types for consumers
export type { CasinoListFilters, CasinoStaffFilters } from './dtos';
```

STEP 4: Create HTTP Fetchers (services/casino/http.ts)
- Use fetchJSON from lib/http/fetch-json
- Copy from SPEC §6.2

```typescript
// services/casino/http.ts

import { fetchJSON } from '@/lib/http/fetch-json';
import type {
  CasinoDTO,
  CasinoSettingsDTO,
  StaffDTO,
  GamingDayDTO,
  CreateCasinoDTO,
  UpdateCasinoDTO,
  UpdateCasinoSettingsDTO,
  CreateStaffDTO,
  CasinoListFilters,
  CasinoStaffFilters,
} from './dtos';

const BASE = '/api/v1/casino';

// === Casino CRUD ===

export async function getCasinos(filters: CasinoListFilters = {}) {
  const params = new URLSearchParams(
    Object.entries(filters)
      .filter(([, v]) => v != null)
      .map(([k, v]) => [k, String(v)])
  );
  const query = params.toString();
  return fetchJSON<{ items: CasinoDTO[]; cursor: string | null }>(
    query ? `${BASE}?${query}` : BASE
  );
}

export async function getCasino(id: string) {
  return fetchJSON<CasinoDTO>(`${BASE}/${id}`);
}

export async function createCasino(input: CreateCasinoDTO) {
  return fetchJSON<CasinoDTO>(BASE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': crypto.randomUUID(),
    },
    body: JSON.stringify(input),
  });
}

export async function updateCasino(id: string, input: UpdateCasinoDTO) {
  return fetchJSON<CasinoDTO>(`${BASE}/${id}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': crypto.randomUUID(),
    },
    body: JSON.stringify(input),
  });
}

export async function deleteCasino(id: string) {
  return fetchJSON<void>(`${BASE}/${id}`, {
    method: 'DELETE',
    headers: {
      'idempotency-key': crypto.randomUUID(),
    },
  });
}

// === Settings ===

export async function getCasinoSettings() {
  return fetchJSON<CasinoSettingsDTO>(`${BASE}/settings`);
}

export async function updateCasinoSettings(input: UpdateCasinoSettingsDTO) {
  return fetchJSON<CasinoSettingsDTO>(`${BASE}/settings`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': crypto.randomUUID(),
    },
    body: JSON.stringify(input),
  });
}

// === Staff ===

export async function getCasinoStaff(filters: CasinoStaffFilters = {}) {
  const params = new URLSearchParams(
    Object.entries(filters)
      .filter(([, v]) => v != null)
      .map(([k, v]) => [k, String(v)])
  );
  const query = params.toString();
  return fetchJSON<{ items: StaffDTO[]; cursor: string | null }>(
    query ? `${BASE}/staff?${query}` : `${BASE}/staff`
  );
}

export async function createStaff(input: CreateStaffDTO) {
  return fetchJSON<StaffDTO>(`${BASE}/staff`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': crypto.randomUUID(),
    },
    body: JSON.stringify(input),
  });
}

// === Gaming Day ===

export async function getGamingDay(timestamp?: string) {
  const params = timestamp ? `?timestamp=${encodeURIComponent(timestamp)}` : '';
  return fetchJSON<GamingDayDTO>(`${BASE}/gaming-day${params}`);
}
```

STEP 5: Create Service README (services/casino/README.md)

```markdown
# CasinoService - Root Authority

> **Bounded Context**: Casino configuration and operational parameters
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §659-750](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
> **Pattern**: B (Canonical CRUD)

## Ownership

**Tables**: `casino`, `casino_settings`, `company`, `staff`, `game_settings`, `audit_log`, `report`
**DTOs**: CasinoDTO, CasinoSettingsDTO, StaffDTO, GamingDayDTO
**RPCs**: `compute_gaming_day(casino_id, timestamp)`

## Dependencies

**Consumes**: None (root authority)
**Consumed By**: PlayerService, VisitService, TableContextService, RatingSlipService, LoyaltyService, FinanceService, MTLService

## Key Concepts

### Gaming Day Computation
- Single source of truth via `compute_gaming_day` RPC
- Considers casino timezone and gaming_day_start_time
- If current local time < start time → previous calendar day

### Staff Role Model
- `dealer`: Non-authenticated, physical table presence
- `pit_boss`: Authenticated, requires user_id
- `admin`: Authenticated, requires user_id, full access

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/v1/casino | List casinos |
| POST | /api/v1/casino | Create casino |
| GET | /api/v1/casino/[id] | Get casino |
| PATCH | /api/v1/casino/[id] | Update casino |
| DELETE | /api/v1/casino/[id] | Delete casino |
| GET | /api/v1/casino/settings | Get settings |
| PATCH | /api/v1/casino/settings | Update settings |
| GET | /api/v1/casino/staff | List staff |
| POST | /api/v1/casino/staff | Create staff |
| GET | /api/v1/casino/gaming-day | Compute gaming day |
```

STEP 6: Verify All Files Compile
- Run: npm run type-check
- Ensure no TypeScript errors in services/casino/*

VALIDATION CHECKLIST:
- [ ] All DTOs use Pick/Omit (no manual interfaces except GamingDayDTO)
- [ ] Zod schemas match DTO structure
- [ ] Staff role constraint validated in createStaffSchema
- [ ] keys.ts uses serializeKeyFilters
- [ ] keys.ts has .scope on list operations
- [ ] http.ts uses fetchJSON, not fetch
- [ ] All mutations include idempotency-key header
- [ ] README.md documents Pattern B, SRM reference
- [ ] npm run type-check passes

SUCCESS SIGNAL:
Output "WS2-COMPLETE: Service layer files created" when done.
```

### Expected Outputs

| Artifact | Path | Validation |
|----------|------|------------|
| DTOs | `services/casino/dtos.ts` | Uses Pick/Omit, compiles |
| Schemas | `services/casino/schemas.ts` | Valid Zod, role constraint |
| Keys | `services/casino/keys.ts` | Has .scope, uses shared utils |
| HTTP | `services/casino/http.ts` | Uses fetchJSON |
| README | `services/casino/README.md` | Pattern B documented |

---

## WS3: Route Handlers (Split into 4 Parallel Sub-tasks)

**Agent Type**: `pt2-service-implementer`
**Priority**: 0 (After WS1 + WS2)
**Total Duration**: 8.5 hours
**Dependencies**: WS1 (migration), WS2 (DTOs/schemas)

### WS3-A: Casino CRUD Routes

**Duration**: 4 hours
**Files**: `app/api/v1/casino/route.ts`, `app/api/v1/casino/[id]/route.ts`

```
TASK: Implement Casino CRUD Route Handlers

CONTEXT:
Create Route Handlers for casino list/create and detail/update/delete.
All handlers use withServerAction middleware for auth, RLS, audit.

SPEC REFERENCE: docs/20-architecture/specs/PRD-000/SPEC-PRD-000-casino-foundation.md §5.2.1-5.2.5

PREREQUISITE CHECK:
- Verify services/casino/dtos.ts exists
- Verify services/casino/schemas.ts exists
- Run: npm run type-check (must pass)

DELIVERABLES:
1. app/api/v1/casino/route.ts (GET list, POST create)
2. app/api/v1/casino/[id]/route.ts (GET detail, PATCH update, DELETE)

FILE 1: app/api/v1/casino/route.ts

```typescript
import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import type { CasinoDTO, CreateCasinoDTO } from '@/services/casino/dtos';
import {
  createCasinoSchema,
  casinoListQuerySchema,
} from '@/services/casino/schemas';

const CASINO_SELECT = 'id, name, location, status, created_at';

/**
 * GET /api/v1/casino
 * List casinos (admin only, multi-casino operators)
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const params = casinoListQuerySchema.parse({
      status: searchParams.get('status') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        let query = mwCtx.supabase
          .from('casino')
          .select(CASINO_SELECT)
          .order('created_at', { ascending: false })
          .limit(params.limit);

        if (params.status) {
          query = query.eq('status', params.status);
        }

        if (params.cursor) {
          query = query.lt('created_at', params.cursor);
        }

        const { data, error } = await query;

        if (error) throw error;

        const items = data as CasinoDTO[];
        const cursor = items.length === params.limit
          ? items[items.length - 1].created_at
          : null;

        return {
          ok: true as const,
          code: 'OK' as const,
          data: { items, cursor },
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'casino',
        action: 'list',
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

/**
 * POST /api/v1/casino
 * Create new casino (admin only)
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody<CreateCasinoDTO>(request);

    const input = createCasinoSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const { data, error } = await mwCtx.supabase
          .from('casino')
          .insert(input)
          .select(CASINO_SELECT)
          .single();

        if (error) {
          if (error.code === '23505') {
            throw new Error('CASINO_ALREADY_EXISTS');
          }
          throw error;
        }

        return {
          ok: true as const,
          code: 'OK' as const,
          data: data as CasinoDTO,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'casino',
        action: 'create',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse(ctx, result.data, 201);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
```

FILE 2: app/api/v1/casino/[id]/route.ts

```typescript
import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import type { CasinoDTO, UpdateCasinoDTO } from '@/services/casino/dtos';
import { updateCasinoSchema } from '@/services/casino/schemas';

const CASINO_SELECT = 'id, name, location, status, created_at';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/casino/[id]
 * Get casino by ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const ctx = createRequestContext(request);
  const { id } = await params;

  try {
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const { data, error } = await mwCtx.supabase
          .from('casino')
          .select(CASINO_SELECT)
          .eq('id', id)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            throw new Error('CASINO_NOT_FOUND');
          }
          throw error;
        }

        return {
          ok: true as const,
          code: 'OK' as const,
          data: data as CasinoDTO,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'casino',
        action: 'get',
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

/**
 * PATCH /api/v1/casino/[id]
 * Update casino
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const ctx = createRequestContext(request);
  const { id } = await params;

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody<UpdateCasinoDTO>(request);

    const input = updateCasinoSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const { data, error } = await mwCtx.supabase
          .from('casino')
          .update(input)
          .eq('id', id)
          .select(CASINO_SELECT)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            throw new Error('CASINO_NOT_FOUND');
          }
          throw error;
        }

        return {
          ok: true as const,
          code: 'OK' as const,
          data: data as CasinoDTO,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'casino',
        action: 'update',
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

/**
 * DELETE /api/v1/casino/[id]
 * Delete casino (soft delete via status='inactive')
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const ctx = createRequestContext(request);
  const { id } = await params;

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Soft delete - set status to inactive
        const { error } = await mwCtx.supabase
          .from('casino')
          .update({ status: 'inactive' })
          .eq('id', id);

        if (error) {
          if (error.code === 'PGRST116') {
            throw new Error('CASINO_NOT_FOUND');
          }
          throw error;
        }

        return {
          ok: true as const,
          code: 'OK' as const,
          data: undefined,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'casino',
        action: 'delete',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse(ctx, undefined, 204);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
```

VALIDATION:
- Run: npm run type-check
- Run: npm run build (should succeed)

SUCCESS SIGNAL:
Output "WS3-A-COMPLETE: Casino CRUD routes created" when done.
```

### WS3-B: Settings Route

**Duration**: 1.5 hours
**Files**: `app/api/v1/casino/settings/route.ts`

```
TASK: Implement Casino Settings Route Handler

SPEC REFERENCE: docs/20-architecture/specs/PRD-000/SPEC-PRD-000-casino-foundation.md §5.2.6-5.2.7

DELIVERABLE: app/api/v1/casino/settings/route.ts

```typescript
import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import type { CasinoSettingsDTO, UpdateCasinoSettingsDTO } from '@/services/casino/dtos';
import { updateCasinoSettingsSchema } from '@/services/casino/schemas';

const SETTINGS_SELECT = 'id, casino_id, gaming_day_start_time, timezone, watchlist_floor, ctr_threshold';

/**
 * GET /api/v1/casino/settings
 * Get settings for authenticated user's casino
 */
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
          .select(SETTINGS_SELECT)
          .eq('casino_id', casinoId)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            throw new Error('CASINO_SETTINGS_NOT_FOUND');
          }
          throw error;
        }

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

/**
 * PATCH /api/v1/casino/settings
 * Update casino settings (admin only)
 */
export async function PATCH(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody<UpdateCasinoSettingsDTO>(request);

    const input = updateCasinoSettingsSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const casinoId = mwCtx.rlsContext!.casinoId;

        const { data, error } = await mwCtx.supabase
          .from('casino_settings')
          .update(input)
          .eq('casino_id', casinoId)
          .select(SETTINGS_SELECT)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            throw new Error('CASINO_SETTINGS_NOT_FOUND');
          }
          throw error;
        }

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

SUCCESS SIGNAL:
Output "WS3-B-COMPLETE: Settings route created" when done.
```

### WS3-C: Staff Routes

**Duration**: 2 hours
**Files**: `app/api/v1/casino/staff/route.ts`

```
TASK: Implement Staff Route Handlers

SPEC REFERENCE: docs/20-architecture/specs/PRD-000/SPEC-PRD-000-casino-foundation.md §5.2.8-5.2.9

DELIVERABLE: app/api/v1/casino/staff/route.ts

```typescript
import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import type { StaffDTO, CreateStaffDTO } from '@/services/casino/dtos';
import { createStaffSchema, staffListQuerySchema } from '@/services/casino/schemas';

const STAFF_SELECT = 'id, first_name, last_name, role, status, employee_id, casino_id';

/**
 * GET /api/v1/casino/staff
 * List staff for authenticated user's casino
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const params = staffListQuerySchema.parse({
      status: searchParams.get('status') ?? undefined,
      role: searchParams.get('role') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const casinoId = mwCtx.rlsContext!.casinoId;

        let query = mwCtx.supabase
          .from('staff')
          .select(STAFF_SELECT)
          .eq('casino_id', casinoId)
          .order('created_at', { ascending: false })
          .limit(params.limit);

        if (params.status) {
          query = query.eq('status', params.status);
        }

        if (params.role) {
          query = query.eq('role', params.role);
        }

        if (params.cursor) {
          query = query.lt('created_at', params.cursor);
        }

        const { data, error } = await query;

        if (error) throw error;

        const items = data as StaffDTO[];
        const cursor = items.length === params.limit
          ? items[items.length - 1].id  // Using id as cursor since staff might not have created_at exposed
          : null;

        return {
          ok: true as const,
          code: 'OK' as const,
          data: { items, cursor },
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'casino',
        action: 'staff.list',
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

/**
 * POST /api/v1/casino/staff
 * Create staff member (admin only)
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody<CreateStaffDTO>(request);

    // Validate input including role constraint
    const input = createStaffSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const casinoId = mwCtx.rlsContext!.casinoId;

        // Ensure casino_id matches authenticated user's casino
        const staffInput = {
          ...input,
          casino_id: casinoId,
        };

        const { data, error } = await mwCtx.supabase
          .from('staff')
          .insert(staffInput)
          .select(STAFF_SELECT)
          .single();

        if (error) {
          // Handle constraint violation for role/user_id
          if (error.code === '23514') {
            throw new Error('STAFF_ROLE_CONSTRAINT_VIOLATION');
          }
          if (error.code === '23505') {
            throw new Error('STAFF_ALREADY_EXISTS');
          }
          throw error;
        }

        return {
          ok: true as const,
          code: 'OK' as const,
          data: data as StaffDTO,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'casino',
        action: 'staff.create',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse(ctx, result.data, 201);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
```

SUCCESS SIGNAL:
Output "WS3-C-COMPLETE: Staff routes created" when done.
```

### WS3-D: Gaming Day Route

**Duration**: 1 hour
**Files**: `app/api/v1/casino/gaming-day/route.ts`

```
TASK: Implement Gaming Day Route Handler

SPEC REFERENCE: docs/20-architecture/specs/PRD-000/SPEC-PRD-000-casino-foundation.md §5.2.10, §7.2

PREREQUISITE: WS1 migration must be applied (compute_gaming_day RPC exists)

DELIVERABLE: app/api/v1/casino/gaming-day/route.ts

```typescript
import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import type { GamingDayDTO } from '@/services/casino/dtos';
import { gamingDayQuerySchema } from '@/services/casino/schemas';

/**
 * GET /api/v1/casino/gaming-day
 * Compute gaming day for given timestamp
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();

    // Parse query params
    const { searchParams } = new URL(request.url);
    const params = gamingDayQuerySchema.parse({
      timestamp: searchParams.get('timestamp') ?? undefined,
    });

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const casinoId = mwCtx.rlsContext!.casinoId;

        // Call compute_gaming_day RPC
        const { data: gamingDay, error: rpcError } = await mwCtx.supabase
          .rpc('compute_gaming_day', {
            p_casino_id: casinoId,
            p_timestamp: params.timestamp ?? new Date().toISOString(),
          });

        if (rpcError) {
          // Handle P0002 (no_data_found) from RPC
          if (rpcError.message?.includes('CASINO_SETTINGS_NOT_FOUND')) {
            throw new Error('CASINO_SETTINGS_NOT_FOUND');
          }
          throw rpcError;
        }

        // Get timezone for response
        const { data: settings } = await mwCtx.supabase
          .from('casino_settings')
          .select('timezone')
          .eq('casino_id', casinoId)
          .single();

        const responseData: GamingDayDTO = {
          gaming_day: gamingDay,
          casino_id: casinoId,
          computed_at: new Date().toISOString(),
          timezone: settings?.timezone ?? 'America/Los_Angeles',
        };

        return {
          ok: true as const,
          code: 'OK' as const,
          data: responseData,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'casino',
        action: 'gaming-day.compute',
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

VALIDATION:
- Verify compute_gaming_day RPC exists in types/database.types.ts
- Run: npm run type-check
- Run: npm run build

SUCCESS SIGNAL:
Output "WS3-D-COMPLETE: Gaming day route created" when done.
```

---

## WS4: Testing (Split into 2 Parallel Sub-tasks)

**Agent Type**: `pt2-service-implementer`
**Priority**: 1 (After WS3)
**Total Duration**: 8 hours
**Dependencies**: WS3 (route handlers)

### WS4-A: Unit Tests

**Duration**: 2 hours
**Files**: `services/casino/gaming-day.test.ts`, `services/casino/schemas.test.ts`

```
TASK: Create Unit Tests for CasinoService

SPEC REFERENCE: docs/20-architecture/specs/PRD-000/SPEC-PRD-000-casino-foundation.md §8.1

DELIVERABLES:
1. services/casino/gaming-day.test.ts - Gaming day computation logic tests
2. services/casino/schemas.test.ts - Zod schema validation tests

FILE 1: services/casino/gaming-day.test.ts

```typescript
import { describe, it, expect } from 'vitest';

/**
 * Unit tests for gaming day computation logic
 * Note: The actual RPC is tested in integration tests
 * These tests verify the algorithm independently
 */
describe('compute_gaming_day logic', () => {
  // Pure function implementation matching RPC logic
  const computeGamingDay = (
    localTimeStr: string,
    startTimeStr: string,
    dateStr: string
  ): string => {
    const [hours, minutes] = localTimeStr.split(':').map(Number);
    const [startHours, startMinutes] = startTimeStr.split(':').map(Number);

    const currentMinutes = hours * 60 + minutes;
    const startMinutesTotal = startHours * 60 + startMinutes;

    // Parse date
    const [year, month, day] = dateStr.split('-').map(Number);
    const today = new Date(year, month - 1, day);

    // If before start time, return previous day
    if (currentMinutes < startMinutesTotal) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toISOString().split('T')[0];
    }

    return dateStr;
  };

  describe('basic scenarios', () => {
    it('returns current day when time is after gaming day start', () => {
      expect(computeGamingDay('10:00', '06:00', '2025-11-29')).toBe('2025-11-29');
    });

    it('returns previous day when time is before gaming day start', () => {
      expect(computeGamingDay('05:30', '06:00', '2025-11-29')).toBe('2025-11-28');
    });

    it('returns current day when time equals gaming day start', () => {
      expect(computeGamingDay('06:00', '06:00', '2025-11-29')).toBe('2025-11-29');
    });

    it('handles midnight gaming day start', () => {
      expect(computeGamingDay('23:59', '00:00', '2025-11-29')).toBe('2025-11-29');
      expect(computeGamingDay('00:01', '00:00', '2025-11-29')).toBe('2025-11-29');
    });
  });

  describe('edge cases', () => {
    it('handles late night gaming day start (e.g., 4am)', () => {
      expect(computeGamingDay('03:00', '04:00', '2025-11-29')).toBe('2025-11-28');
      expect(computeGamingDay('04:00', '04:00', '2025-11-29')).toBe('2025-11-29');
      expect(computeGamingDay('05:00', '04:00', '2025-11-29')).toBe('2025-11-29');
    });

    it('handles early morning gaming day start (e.g., 2am)', () => {
      expect(computeGamingDay('01:59', '02:00', '2025-11-29')).toBe('2025-11-28');
      expect(computeGamingDay('02:00', '02:00', '2025-11-29')).toBe('2025-11-29');
    });

    it('handles month boundary', () => {
      expect(computeGamingDay('05:00', '06:00', '2025-12-01')).toBe('2025-11-30');
    });

    it('handles year boundary', () => {
      expect(computeGamingDay('05:00', '06:00', '2025-01-01')).toBe('2024-12-31');
    });
  });
});
```

FILE 2: services/casino/schemas.test.ts

```typescript
import { describe, it, expect } from 'vitest';
import {
  createCasinoSchema,
  updateCasinoSettingsSchema,
  createStaffSchema,
  gamingDayQuerySchema,
} from './schemas';

describe('createCasinoSchema', () => {
  it('accepts valid casino input', () => {
    const result = createCasinoSchema.parse({
      name: 'Test Casino',
      location: 'Las Vegas',
    });
    expect(result.name).toBe('Test Casino');
  });

  it('rejects empty name', () => {
    expect(() => createCasinoSchema.parse({ name: '' }))
      .toThrow();
  });

  it('accepts optional fields as null', () => {
    const result = createCasinoSchema.parse({
      name: 'Test Casino',
      location: null,
      company_id: null,
    });
    expect(result.location).toBeNull();
  });
});

describe('updateCasinoSettingsSchema', () => {
  it('accepts valid time format HH:MM', () => {
    const result = updateCasinoSettingsSchema.parse({
      gaming_day_start_time: '06:00',
    });
    expect(result.gaming_day_start_time).toBe('06:00');
  });

  it('accepts valid time format HH:MM:SS', () => {
    const result = updateCasinoSettingsSchema.parse({
      gaming_day_start_time: '06:00:00',
    });
    expect(result.gaming_day_start_time).toBe('06:00:00');
  });

  it('rejects invalid time format', () => {
    expect(() => updateCasinoSettingsSchema.parse({
      gaming_day_start_time: '6:00',
    })).toThrow('Must be HH:MM or HH:MM:SS format');
  });

  it('accepts valid timezone', () => {
    const result = updateCasinoSettingsSchema.parse({
      timezone: 'America/New_York',
    });
    expect(result.timezone).toBe('America/New_York');
  });

  it('accepts positive thresholds', () => {
    const result = updateCasinoSettingsSchema.parse({
      watchlist_floor: 5000,
      ctr_threshold: 10000,
    });
    expect(result.watchlist_floor).toBe(5000);
  });

  it('rejects negative thresholds', () => {
    expect(() => updateCasinoSettingsSchema.parse({
      watchlist_floor: -100,
    })).toThrow();
  });
});

describe('createStaffSchema', () => {
  describe('dealer role', () => {
    it('accepts dealer without user_id', () => {
      const result = createStaffSchema.parse({
        first_name: 'John',
        last_name: 'Doe',
        role: 'dealer',
        user_id: null,
      });
      expect(result.role).toBe('dealer');
    });

    it('rejects dealer with user_id', () => {
      expect(() => createStaffSchema.parse({
        first_name: 'John',
        last_name: 'Doe',
        role: 'dealer',
        user_id: '550e8400-e29b-41d4-a716-446655440000',
      })).toThrow('Dealer role cannot have user_id');
    });
  });

  describe('pit_boss role', () => {
    it('accepts pit_boss with user_id', () => {
      const result = createStaffSchema.parse({
        first_name: 'Jane',
        last_name: 'Smith',
        role: 'pit_boss',
        user_id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.role).toBe('pit_boss');
    });

    it('rejects pit_boss without user_id', () => {
      expect(() => createStaffSchema.parse({
        first_name: 'Jane',
        last_name: 'Smith',
        role: 'pit_boss',
        user_id: null,
      })).toThrow('pit_boss/admin must have user_id');
    });
  });

  describe('admin role', () => {
    it('accepts admin with user_id', () => {
      const result = createStaffSchema.parse({
        first_name: 'Admin',
        last_name: 'User',
        role: 'admin',
        user_id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.role).toBe('admin');
    });

    it('rejects admin without user_id', () => {
      expect(() => createStaffSchema.parse({
        first_name: 'Admin',
        last_name: 'User',
        role: 'admin',
      })).toThrow('pit_boss/admin must have user_id');
    });
  });
});

describe('gamingDayQuerySchema', () => {
  it('accepts valid ISO timestamp', () => {
    const result = gamingDayQuerySchema.parse({
      timestamp: '2025-11-29T14:30:00Z',
    });
    expect(result.timestamp).toBe('2025-11-29T14:30:00Z');
  });

  it('accepts undefined timestamp', () => {
    const result = gamingDayQuerySchema.parse({});
    expect(result.timestamp).toBeUndefined();
  });

  it('rejects invalid timestamp format', () => {
    expect(() => gamingDayQuerySchema.parse({
      timestamp: 'invalid-date',
    })).toThrow();
  });
});
```

VALIDATION:
- Run: npm test services/casino/

SUCCESS SIGNAL:
Output "WS4-A-COMPLETE: Unit tests created and passing" when done.
```

### WS4-B: Integration Tests

**Duration**: 6 hours
**Files**: `services/casino/casino.integration.test.ts`

```
TASK: Create Integration Tests for CasinoService

SPEC REFERENCE: docs/20-architecture/specs/PRD-000/SPEC-PRD-000-casino-foundation.md §8.2

PREREQUISITE: WS1 migration applied, WS3 routes created

DELIVERABLE: services/casino/casino.integration.test.ts

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

/**
 * Integration tests for CasinoService
 * Tests against local Supabase instance
 */
describe('Casino Integration Tests', () => {
  let supabase: ReturnType<typeof createClient<Database>>;
  let testCasinoId: string;

  beforeAll(async () => {
    supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role for test setup
    );

    // Get or create test casino
    const { data: casino } = await supabase
      .from('casino')
      .select('id')
      .eq('name', 'Integration Test Casino')
      .single();

    if (casino) {
      testCasinoId = casino.id;
    } else {
      const { data: newCasino } = await supabase
        .from('casino')
        .insert({ name: 'Integration Test Casino' })
        .select('id')
        .single();
      testCasinoId = newCasino!.id;
    }

    // Ensure casino_settings exists
    await supabase
      .from('casino_settings')
      .upsert({
        casino_id: testCasinoId,
        gaming_day_start_time: '06:00:00',
        timezone: 'America/Los_Angeles',
        watchlist_floor: 3000,
        ctr_threshold: 10000,
      });
  });

  describe('compute_gaming_day RPC', () => {
    it('returns correct day for timestamp after gaming day start', async () => {
      const { data, error } = await supabase.rpc('compute_gaming_day', {
        p_casino_id: testCasinoId,
        p_timestamp: '2025-01-15T14:30:00-08:00', // 2:30 PM PST
      });

      expect(error).toBeNull();
      expect(data).toBe('2025-01-15');
    });

    it('returns previous day for timestamp before gaming day start', async () => {
      const { data, error } = await supabase.rpc('compute_gaming_day', {
        p_casino_id: testCasinoId,
        p_timestamp: '2025-01-15T05:30:00-08:00', // 5:30 AM PST
      });

      expect(error).toBeNull();
      expect(data).toBe('2025-01-14');
    });

    it('returns current day for timestamp at exact gaming day start', async () => {
      const { data, error } = await supabase.rpc('compute_gaming_day', {
        p_casino_id: testCasinoId,
        p_timestamp: '2025-01-15T06:00:00-08:00', // Exactly 6:00 AM PST
      });

      expect(error).toBeNull();
      expect(data).toBe('2025-01-15');
    });

    it('handles non-existent casino', async () => {
      const { error } = await supabase.rpc('compute_gaming_day', {
        p_casino_id: '00000000-0000-0000-0000-000000000000',
        p_timestamp: '2025-01-15T14:30:00Z',
      });

      expect(error).not.toBeNull();
      expect(error?.message).toContain('CASINO_SETTINGS_NOT_FOUND');
    });

    describe('DST transitions', () => {
      it('handles DST spring forward correctly (March)', async () => {
        // March 9, 2025 - DST transition in America/Los_Angeles
        // At 2:00 AM, clocks spring forward to 3:00 AM
        const { data, error } = await supabase.rpc('compute_gaming_day', {
          p_casino_id: testCasinoId,
          p_timestamp: '2025-03-09T10:00:00-07:00', // After DST (PDT)
        });

        expect(error).toBeNull();
        expect(data).toBe('2025-03-09');
      });

      it('handles DST fall back correctly (November)', async () => {
        // November 2, 2025 - DST transition in America/Los_Angeles
        // At 2:00 AM, clocks fall back to 1:00 AM
        const { data, error } = await supabase.rpc('compute_gaming_day', {
          p_casino_id: testCasinoId,
          p_timestamp: '2025-11-02T01:30:00-08:00', // After fall back (PST)
        });

        expect(error).toBeNull();
        // 1:30 AM is before 6:00 AM start, so returns previous day
        expect(data).toBe('2025-11-01');
      });

      it('handles ambiguous time during fall back', async () => {
        // The hour between 1:00-2:00 AM occurs twice during fall back
        // Test both interpretations
        const { data: data1 } = await supabase.rpc('compute_gaming_day', {
          p_casino_id: testCasinoId,
          p_timestamp: '2025-11-02T01:30:00-07:00', // First 1:30 AM (PDT)
        });

        const { data: data2 } = await supabase.rpc('compute_gaming_day', {
          p_casino_id: testCasinoId,
          p_timestamp: '2025-11-02T01:30:00-08:00', // Second 1:30 AM (PST)
        });

        // Both should return 2025-11-01 since 1:30 AM < 6:00 AM start
        expect(data1).toBe('2025-11-01');
        expect(data2).toBe('2025-11-01');
      });
    });
  });

  describe('Staff role constraints', () => {
    it('allows dealer without user_id', async () => {
      const { data, error } = await supabase.from('staff').insert({
        first_name: 'Test',
        last_name: 'Dealer',
        role: 'dealer',
        casino_id: testCasinoId,
        user_id: null,
      }).select().single();

      expect(error).toBeNull();
      expect(data?.role).toBe('dealer');

      // Cleanup
      if (data) {
        await supabase.from('staff').delete().eq('id', data.id);
      }
    });

    it('rejects dealer with user_id', async () => {
      const { error } = await supabase.from('staff').insert({
        first_name: 'Test',
        last_name: 'Dealer',
        role: 'dealer',
        casino_id: testCasinoId,
        user_id: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23514'); // Check constraint violation
    });

    it('rejects pit_boss without user_id', async () => {
      const { error } = await supabase.from('staff').insert({
        first_name: 'Test',
        last_name: 'PitBoss',
        role: 'pit_boss',
        casino_id: testCasinoId,
        user_id: null,
      });

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23514'); // Check constraint violation
    });

    it('rejects admin without user_id', async () => {
      const { error } = await supabase.from('staff').insert({
        first_name: 'Test',
        last_name: 'Admin',
        role: 'admin',
        casino_id: testCasinoId,
        user_id: null,
      });

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23514'); // Check constraint violation
    });
  });

  describe('Casino settings', () => {
    it('reads casino settings', async () => {
      const { data, error } = await supabase
        .from('casino_settings')
        .select('*')
        .eq('casino_id', testCasinoId)
        .single();

      expect(error).toBeNull();
      expect(data?.timezone).toBe('America/Los_Angeles');
      expect(data?.gaming_day_start_time).toBe('06:00:00');
    });

    it('updates casino settings', async () => {
      const { data, error } = await supabase
        .from('casino_settings')
        .update({ watchlist_floor: 5000 })
        .eq('casino_id', testCasinoId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.watchlist_floor).toBe(5000);

      // Restore
      await supabase
        .from('casino_settings')
        .update({ watchlist_floor: 3000 })
        .eq('casino_id', testCasinoId);
    });
  });

  describe('Gaming day with different timezones', () => {
    it('handles Eastern timezone correctly', async () => {
      // Temporarily change timezone
      await supabase
        .from('casino_settings')
        .update({ timezone: 'America/New_York' })
        .eq('casino_id', testCasinoId);

      const { data, error } = await supabase.rpc('compute_gaming_day', {
        p_casino_id: testCasinoId,
        p_timestamp: '2025-01-15T14:30:00Z', // 9:30 AM EST
      });

      expect(error).toBeNull();
      expect(data).toBe('2025-01-15');

      // Restore
      await supabase
        .from('casino_settings')
        .update({ timezone: 'America/Los_Angeles' })
        .eq('casino_id', testCasinoId);
    });
  });
});
```

VALIDATION:
- Run: npm test services/casino/casino.integration.test.ts
- Ensure all DST tests pass

SUCCESS SIGNAL:
Output "WS4-B-COMPLETE: Integration tests created and passing" when done.
```

---

## WS5: Cleanup (Split into 2 Sequential Sub-tasks)

**Agent Type**: `pt2-service-implementer`
**Priority**: 1
**Total Duration**: 4.25 hours

### WS5-A: Audit Legacy Callers (Can Run in Phase 1)

**Duration**: 1 hour
**Dependencies**: None

```
TASK: Audit legacy casino.ts callers

PURPOSE: Identify all files importing from legacy app/actions/casino.ts before deletion

DELIVERABLE: Audit report listing all callers with line numbers

STEPS:

1. Run grep to find all imports:
   grep -rn "from '@/app/actions/casino'" --include="*.ts" --include="*.tsx" .

2. Run grep for relative imports:
   grep -rn "from '.*app/actions/casino'" --include="*.ts" --include="*.tsx" .

3. Document each caller:
   - File path
   - Line number
   - Which function(s) imported
   - Required migration action

4. Create audit report in: docs/20-architecture/specs/PRD-000/AUDIT-legacy-casino-callers.md

AUDIT REPORT TEMPLATE:

```markdown
# Legacy Casino Actions Audit

## Summary
- Total files: X
- Total imports: Y
- Migration complexity: LOW/MEDIUM/HIGH

## Callers

### Component: [filename]
- **Path**: [full path]
- **Line**: [line number]
- **Imports**: [function names]
- **Migration**: [required action]

## Migration Plan
1. [File 1] - [action]
2. [File 2] - [action]
...
```

SUCCESS SIGNAL:
Output "WS5-A-COMPLETE: Audit complete, X files identified" when done.
```

### WS5-B: Delete Legacy + Update UI (After WS3)

**Duration**: 3.25 hours
**Dependencies**: WS3 complete, WS5-A complete

```
TASK: Delete legacy code and update UI components

PREREQUISITE:
- WS3 route handlers deployed
- WS5-A audit complete (review audit report first)

STEPS:

1. For each caller in audit report:
   a. Update import to use new service/hook
   b. Update function calls to use new API
   c. Verify component still works

2. Update React Query hooks if needed:
   - Create hooks/casino/use-casino-settings.ts
   - Create hooks/casino/use-gaming-day.ts
   - Use casinoKeys from services/casino/keys.ts

3. Delete legacy files:
   - rm app/actions/casino.ts
   - rm services/casino/casino.test.ts (if outdated)

4. Run full test suite:
   - npm run type-check
   - npm run lint
   - npm test
   - npm run build

MIGRATION EXAMPLE:

BEFORE (legacy):
```typescript
import { getCasinoSettings } from '@/app/actions/casino';

const settings = await getCasinoSettings(casinoId);
```

AFTER (new):
```typescript
import { useQuery } from '@tanstack/react-query';
import { casinoKeys } from '@/services/casino/keys';
import { getCasinoSettings } from '@/services/casino/http';

const { data: settings } = useQuery({
  queryKey: casinoKeys.settings(),
  queryFn: getCasinoSettings,
});
```

VALIDATION:
- All imports from legacy file removed
- No TypeScript errors
- All tests pass
- Build succeeds
- UI components render correctly

SUCCESS SIGNAL:
Output "WS5-B-COMPLETE: Legacy code deleted, UI updated" when done.
```

---

## Coordination Protocol

### Handoff Signals

Each agent MUST output a completion signal that includes:

```
{WORKSTREAM}-COMPLETE: {summary}
FILES_CREATED: [list]
FILES_MODIFIED: [list]
TESTS_PASSING: yes/no
BLOCKING_ISSUES: none / [list]
```

### Dependency Resolution

| If Agent | Needs | Wait For |
|----------|-------|----------|
| WS3-* | DTOs, schemas | WS2-COMPLETE |
| WS3-D | compute_gaming_day RPC | WS1-COMPLETE |
| WS4-* | Route handlers | WS3-*-COMPLETE |
| WS5-B | Routes deployed | WS3-COMPLETE + WS5-A-COMPLETE |

### Conflict Resolution

If multiple agents modify the same file:

1. **keys.ts**: Only WS2 creates; others import
2. **dtos.ts**: Only WS2 creates; others import
3. **Tests**: Each WS creates separate test files

### Failure Recovery

If an agent fails:

1. Check BLOCKING_ISSUES in completion signal
2. Address blocking issue
3. Re-run failed agent with `--continue` flag
4. Verify downstream agents can proceed

---

## Estimated Timeline

| Phase | Workstreams | Duration | Cumulative |
|-------|-------------|----------|------------|
| 1 | WS1 + WS2 + WS5-A (parallel) | 4h | 4h |
| 2 | WS3-A + WS3-B + WS3-C + WS3-D (parallel) | 4h | 8h |
| 3 | WS4-A + WS4-B + WS5-B (parallel) | 6h | 14h |

**Total with parallelization**: ~14 hours
**Total sequential**: ~28.5 hours
**Parallelization savings**: 51%

---

## Post-Implementation Checklist

Before marking PRD-000 complete:

- [ ] WS1: Migration applied, types regenerated
- [ ] WS2: All service layer files created
- [ ] WS3: All 10 route handlers deployed
- [ ] WS4: All tests passing (unit + integration)
- [ ] WS5: Legacy code deleted, UI updated
- [ ] Build: `npm run build` succeeds
- [ ] Types: `npm run type-check` succeeds
- [ ] Lint: `npm run lint` passes
- [ ] Tests: `npm test` exits 0

---

**End of Parallel Execution Workflows**
