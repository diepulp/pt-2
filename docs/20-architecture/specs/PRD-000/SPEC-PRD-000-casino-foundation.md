# SPEC-PRD-000: Casino Foundation Service Architecture

---
id: SPEC-PRD-000
title: Casino Foundation Service Architecture Specification
prd: PRD-000-casino-foundation.md
version: 1.0.0
status: Draft
effective: 2025-11-29
owner: Lead Architect
affects: [CasinoService, PlayerService, VisitService, TableContextService, RatingSlipService, LoyaltyService, FinanceService, MTLService]
---

## 1. Executive Summary

This specification details the complete architecture for implementing PRD-000 Casino Foundation Service. It defines:

- **Database Schema**: `compute_gaming_day` RPC, staff role constraints, RLS policies
- **API Contracts**: 10 Route Handler endpoints replacing legacy Server Actions
- **Data Flow**: withServerAction middleware integration patterns
- **Cross-Context Dependencies**: How downstream services consume CasinoService

**Key Decision**: Replace legacy `app/actions/casino.ts` (222 lines, 9 critical/high regressions) with properly architected Route Handlers at `app/api/v1/casino/`.

---

## 2. Context & Scope

### 2.1 Problem Statement

The existing `app/actions/casino.ts` predates Phase 0 horizontal infrastructure and contains:

| Regression | Severity | Impact |
|------------|----------|--------|
| No `withServerAction` wrapper | CRITICAL | No auth, RLS, audit |
| Raw `throw new Error()` | HIGH | Postgres codes leak to UI |
| Client-side gaming day | CRITICAL | Temporal drift across services |
| No idempotency | MEDIUM | Duplicate creation possible |
| No correlation ID | MEDIUM | Untraceable requests |

### 2.2 Scope

**In Scope (MVP)**:
- Database RPC: `compute_gaming_day(casino_id, timestamp)`
- 10 Route Handler endpoints (see §5)
- RLS policies for `casino_settings` and `staff`
- Staff role constraint (dealer vs authenticated roles)
- React Query key factories
- Integration tests

**Out of Scope**:
- Casino UI dashboard (Phase 2)
- Game configuration management UI
- Multi-casino corporate hierarchy
- Staff scheduling/shift management

### 2.3 Bounded Context Position

```
┌──────────────────────────────────────────────────────────────────┐
│                    CasinoService (Root Authority)                │
│  OWNS: casino, casino_settings, staff, game_settings             │
│  PROVIDES: gaming_day, timezone, compliance thresholds           │
└──────────────────────────────────────────────────────────────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       ▼                      ▼                      ▼
┌─────────────┐    ┌───────────────────┐    ┌───────────────┐
│ PlayerService│    │ TableContextService│    │ FinanceService│
│ (Identity)   │    │ (Operational)      │    │ (Ledger)      │
└─────────────┘    └───────────────────┘    └───────────────┘
       │                      │                      │
       ▼                      ▼                      ▼
┌─────────────┐    ┌───────────────────┐    ┌───────────────┐
│ VisitService │    │ RatingSlipService │    │ MTLService    │
│ (Session)    │    │ (Telemetry)       │    │ (Compliance)  │
└─────────────┘    └───────────────────┘    └───────────────┘
                              │
                              ▼
                   ┌───────────────────┐
                   │ LoyaltyService    │
                   │ (Rewards)         │
                   └───────────────────┘
```

**Temporal Authority**: CasinoService is the **single source of truth** for gaming day computation. All downstream services MUST consume via the `compute_gaming_day` RPC or published DTOs.

---

## 3. Database Schema

### 3.1 Existing Schema (Verified)

The `casino_settings` table already exists with required columns:

```sql
-- types/database.types.ts:120-159 (verified)
casino_settings: {
  Row: {
    casino_id: string;
    gaming_day_start_time: string;  -- time type stored as string
    timezone: string;               -- default: 'America/Los_Angeles'
    watchlist_floor: number;        -- default: 3000
    ctr_threshold: number;          -- default: 10000
    -- ...
  }
}
```

### 3.2 New: compute_gaming_day RPC

**Purpose**: Single source of truth for gaming day calculation (TEMP-001/TEMP-002 compliance)

```sql
-- Migration: YYYYMMDDHHMMSS_compute_gaming_day_rpc.sql

-- Immutable function for deterministic gaming day computation
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
```

**Algorithm**:
1. Fetch `gaming_day_start_time` and `timezone` from `casino_settings`
2. Convert input timestamp to casino's local timezone
3. If local time is before gaming day start → return previous calendar day
4. Otherwise → return current calendar day

**Performance**: Target < 5ms p95 (simple lookup + arithmetic)

### 3.3 New: Staff Role Constraint

**Purpose**: Enforce role model (dealer = non-authenticated, pit_boss/admin = authenticated)

```sql
-- Add check constraint for staff role-user_id relationship
ALTER TABLE staff ADD CONSTRAINT chk_staff_role_user_id
  CHECK (
    (role = 'dealer' AND user_id IS NULL) OR
    (role IN ('pit_boss', 'admin') AND user_id IS NOT NULL)
  );

COMMENT ON CONSTRAINT chk_staff_role_user_id ON staff IS 'PRD-000: Dealers cannot have user_id (non-authenticated); pit_boss/admin must have user_id linked to auth.users';
```

**Rationale**:
- Dealers interact via physical table presence, not digital authentication
- Pit bosses and admins require Supabase Auth for audit trail

### 3.4 RLS Policies

> **Reference**: SEC-001-rls-policy-matrix.md

```sql
-- Enable RLS on casino_settings
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
```

---

## 4. DTO Contracts

### 4.1 Pattern Selection

CasinoService uses **Pattern B (Canonical CRUD)** per SLAD §429-471:
- Simple CRUD operations over database tables
- DTOs derived via Pick/Omit from `Database` types
- No separate `mappers.ts` required

### 4.2 DTO Definitions

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
```

### 4.3 Zod Validation Schemas

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
```

---

## 5. API Surface

### 5.1 Route Handler Directory Structure

```
app/api/v1/casino/
├── route.ts                    # GET (list), POST (create)
├── [id]/
│   └── route.ts                # GET (detail), PATCH (update), DELETE
├── settings/
│   └── route.ts                # GET, PATCH (current user's casino settings)
├── staff/
│   └── route.ts                # GET (list), POST (create)
└── gaming-day/
    └── route.ts                # GET (compute via RPC)
```

### 5.2 Endpoint Contracts

#### 5.2.1 GET /api/v1/casino

**Purpose**: List casinos (admin only, typically for multi-casino operators)

| Aspect | Value |
|--------|-------|
| Method | GET |
| Auth | Required (admin role) |
| RLS | Scoped by `casino_id` |
| Idempotency | Not required (read) |
| Response | `ServiceHttpResult<{ items: CasinoDTO[], cursor?: string }>` |

**Query Parameters**:
- `status?: 'active' | 'inactive'`
- `cursor?: string` (pagination)
- `limit?: number` (default: 20, max: 100)

**Response**:
```typescript
{
  ok: true,
  code: 'OK',
  status: 200,
  data: {
    items: CasinoDTO[],
    cursor: string | null
  },
  requestId: string,
  durationMs: number,
  timestamp: string
}
```

---

#### 5.2.2 POST /api/v1/casino

**Purpose**: Create new casino

| Aspect | Value |
|--------|-------|
| Method | POST |
| Auth | Required (admin role) |
| Idempotency | Required (`Idempotency-Key` header) |
| Request | `CreateCasinoDTO` |
| Response | `ServiceHttpResult<CasinoDTO>` |

**Headers**:
- `Idempotency-Key: <uuid>` (required)
- `Content-Type: application/json`

**Request Body**:
```typescript
{
  name: string,           // required
  location?: string,
  address?: object,
  company_id?: string     // uuid
}
```

**Response (201)**:
```typescript
{
  ok: true,
  code: 'OK',
  status: 201,
  data: CasinoDTO,
  requestId: string,
  durationMs: number,
  timestamp: string
}
```

**Error Codes**:
- `CASINO_ALREADY_EXISTS` (409): Duplicate name
- `VALIDATION_ERROR` (400): Invalid input

---

#### 5.2.3 GET /api/v1/casino/[id]

**Purpose**: Get casino by ID

| Aspect | Value |
|--------|-------|
| Method | GET |
| Auth | Required |
| RLS | Must match authenticated user's casino |
| Response | `ServiceHttpResult<CasinoDTO>` |

**Response (200)**:
```typescript
{
  ok: true,
  code: 'OK',
  status: 200,
  data: CasinoDTO,
  requestId: string,
  durationMs: number,
  timestamp: string
}
```

**Error Codes**:
- `CASINO_NOT_FOUND` (404): Casino doesn't exist or RLS denied

---

#### 5.2.4 PATCH /api/v1/casino/[id]

**Purpose**: Update casino

| Aspect | Value |
|--------|-------|
| Method | PATCH |
| Auth | Required (admin role) |
| Idempotency | Required |
| Request | `UpdateCasinoDTO` |
| Response | `ServiceHttpResult<CasinoDTO>` |

---

#### 5.2.5 DELETE /api/v1/casino/[id]

**Purpose**: Delete casino (soft delete recommended)

| Aspect | Value |
|--------|-------|
| Method | DELETE |
| Auth | Required (admin role) |
| Idempotency | Required |
| Response | `ServiceHttpResult<void>` |

**Note**: Consider soft delete by setting `status = 'inactive'` instead of hard delete due to FK dependencies.

---

#### 5.2.6 GET /api/v1/casino/settings

**Purpose**: Get settings for authenticated user's casino

| Aspect | Value |
|--------|-------|
| Method | GET |
| Auth | Required |
| RLS | Auto-scoped via `app.casino_id` |
| Cacheable | Yes (stale-while-revalidate, 1h) |
| Response | `ServiceHttpResult<CasinoSettingsDTO>` |

**Response (200)**:
```typescript
{
  ok: true,
  code: 'OK',
  status: 200,
  data: {
    id: string,
    casino_id: string,
    gaming_day_start_time: '06:00',
    timezone: 'America/Los_Angeles',
    watchlist_floor: 3000,
    ctr_threshold: 10000
  },
  requestId: string,
  durationMs: number,
  timestamp: string
}
```

---

#### 5.2.7 PATCH /api/v1/casino/settings

**Purpose**: Update casino settings

| Aspect | Value |
|--------|-------|
| Method | PATCH |
| Auth | Required (admin role) |
| Idempotency | Required |
| Request | `UpdateCasinoSettingsDTO` |
| Response | `ServiceHttpResult<CasinoSettingsDTO>` |

**Request Body**:
```typescript
{
  gaming_day_start_time?: '04:00',  // HH:MM format
  timezone?: 'America/New_York',
  watchlist_floor?: 5000,
  ctr_threshold?: 10000
}
```

**Important**: Changing `timezone` or `gaming_day_start_time` affects all downstream services. UI should warn operators.

---

#### 5.2.8 GET /api/v1/casino/staff

**Purpose**: List staff for authenticated user's casino

| Aspect | Value |
|--------|-------|
| Method | GET |
| Auth | Required |
| RLS | Scoped by `app.casino_id` |
| Response | `ServiceHttpResult<{ items: StaffDTO[], cursor?: string }>` |

**Query Parameters**:
- `status?: 'active' | 'inactive'`
- `role?: 'dealer' | 'pit_boss' | 'admin'`
- `cursor?: string`
- `limit?: number`

---

#### 5.2.9 POST /api/v1/casino/staff

**Purpose**: Create staff member

| Aspect | Value |
|--------|-------|
| Method | POST |
| Auth | Required (admin role) |
| Idempotency | Required |
| Request | `CreateStaffDTO` |
| Response | `ServiceHttpResult<StaffDTO>` |

**Request Body**:
```typescript
{
  first_name: 'John',
  last_name: 'Doe',
  role: 'dealer',           // dealer | pit_boss | admin
  employee_id?: 'EMP-001',
  email?: 'john@casino.com',
  user_id?: null            // required for pit_boss/admin, null for dealer
}
```

**Validation**: Role constraint enforced both in Zod schema and database constraint.

---

#### 5.2.10 GET /api/v1/casino/gaming-day

**Purpose**: Compute gaming day for given timestamp

| Aspect | Value |
|--------|-------|
| Method | GET |
| Auth | Required |
| RLS | Scoped by `app.casino_id` |
| Cacheable | Short TTL (5min) due to time sensitivity |
| Response | `ServiceHttpResult<GamingDayDTO>` |

**Query Parameters**:
- `timestamp?: string` (ISO 8601, defaults to `now()`)

**Response (200)**:
```typescript
{
  ok: true,
  code: 'OK',
  status: 200,
  data: {
    gaming_day: '2025-11-29',
    casino_id: 'uuid',
    computed_at: '2025-11-29T14:30:00Z',
    timezone: 'America/Los_Angeles'
  },
  requestId: string,
  durationMs: number,
  timestamp: string
}
```

---

## 6. React Query Integration

### 6.1 Query Key Factories

```typescript
// services/casino/keys.ts

import { serializeKeyFilters } from '@/services/shared/key-utils';

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
```

### 6.2 HTTP Fetchers

```typescript
// services/casino/http.ts

import { fetchJSON } from '@/lib/http/fetch-json';
import type {
  CasinoDTO,
  CasinoSettingsDTO,
  StaffDTO,
  GamingDayDTO,
  CreateCasinoDTO,
  UpdateCasinoSettingsDTO,
  CreateStaffDTO,
  CasinoListFilters,
  CasinoStaffFilters,
} from './dtos';

const BASE = '/api/v1/casino';

// Casino CRUD
export async function getCasinos(filters: CasinoListFilters = {}) {
  const params = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v != null)
  );
  return fetchJSON<{ items: CasinoDTO[]; cursor?: string }>(
    `${BASE}?${params}`
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

// Settings
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

// Staff
export async function getCasinoStaff(filters: CasinoStaffFilters = {}) {
  const params = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v != null)
  );
  return fetchJSON<{ items: StaffDTO[]; cursor?: string }>(
    `${BASE}/staff?${params}`
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

// Gaming Day
export async function getGamingDay(timestamp?: string) {
  const params = timestamp ? `?timestamp=${encodeURIComponent(timestamp)}` : '';
  return fetchJSON<GamingDayDTO>(`${BASE}/gaming-day${params}`);
}
```

---

## 7. Implementation Reference

### 7.1 Route Handler Template

Reference implementation based on `app/api/v1/rating-slip/start/route.ts`:

```typescript
// app/api/v1/casino/settings/route.ts

import type { NextRequest } from 'next/server';
import { z } from 'zod';

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

export async function PATCH(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody<UpdateCasinoSettingsDTO>(request);

    // Validate input
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

### 7.2 Gaming Day Route Handler

```typescript
// app/api/v1/casino/gaming-day/route.ts

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
        const { data, error } = await mwCtx.supabase
          .rpc('compute_gaming_day', {
            p_casino_id: casinoId,
            p_timestamp: params.timestamp ?? new Date().toISOString(),
          });

        if (error) throw error;

        // Get timezone for response
        const { data: settings } = await mwCtx.supabase
          .from('casino_settings')
          .select('timezone')
          .eq('casino_id', casinoId)
          .single();

        const responseData: GamingDayDTO = {
          gaming_day: data,
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

---

## 8. Testing Strategy

### 8.1 Unit Tests

```typescript
// services/casino/gaming-day.test.ts

import { describe, it, expect } from 'vitest';

describe('compute_gaming_day logic', () => {
  const computeGamingDay = (
    localTime: string,
    startTime: string
  ): string => {
    const [hours, minutes] = localTime.split(':').map(Number);
    const [startHours, startMinutes] = startTime.split(':').map(Number);

    const currentMinutes = hours * 60 + minutes;
    const startMinutesTotal = startHours * 60 + startMinutes;

    // Mock: if before start time, return yesterday
    const today = '2025-11-29';
    const yesterday = '2025-11-28';

    return currentMinutes < startMinutesTotal ? yesterday : today;
  };

  it('returns current day when time is after gaming day start', () => {
    expect(computeGamingDay('10:00', '06:00')).toBe('2025-11-29');
  });

  it('returns previous day when time is before gaming day start', () => {
    expect(computeGamingDay('05:30', '06:00')).toBe('2025-11-28');
  });

  it('returns current day when time equals gaming day start', () => {
    expect(computeGamingDay('06:00', '06:00')).toBe('2025-11-29');
  });
});
```

### 8.2 Integration Tests

```typescript
// services/casino/casino.integration.test.ts

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

describe('Casino Route Handlers (Integration)', () => {
  let supabase: ReturnType<typeof createClient>;

  beforeAll(async () => {
    supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );
  });

  describe('compute_gaming_day RPC', () => {
    it('returns correct day for timestamp after gaming day start', async () => {
      const { data, error } = await supabase.rpc('compute_gaming_day', {
        p_casino_id: process.env.TEST_CASINO_ID,
        p_timestamp: '2025-01-15T14:30:00-08:00', // 2:30 PM PST
      });

      expect(error).toBeNull();
      expect(data).toBe('2025-01-15');
    });

    it('returns previous day for timestamp before gaming day start', async () => {
      const { data, error } = await supabase.rpc('compute_gaming_day', {
        p_casino_id: process.env.TEST_CASINO_ID,
        p_timestamp: '2025-01-15T05:30:00-08:00', // 5:30 AM PST
      });

      expect(error).toBeNull();
      expect(data).toBe('2025-01-14');
    });

    it('handles DST spring forward correctly', async () => {
      // March 9, 2025 - DST transition in America/Los_Angeles
      const { data, error } = await supabase.rpc('compute_gaming_day', {
        p_casino_id: process.env.TEST_CASINO_ID,
        p_timestamp: '2025-03-09T10:00:00-07:00', // After DST
      });

      expect(error).toBeNull();
      expect(data).toBe('2025-03-09');
    });

    it('handles DST fall back correctly', async () => {
      // November 2, 2025 - DST transition in America/Los_Angeles
      const { data, error } = await supabase.rpc('compute_gaming_day', {
        p_casino_id: process.env.TEST_CASINO_ID,
        p_timestamp: '2025-11-02T01:30:00-08:00', // After fall back
      });

      expect(error).toBeNull();
      expect(data).toBe('2025-11-01'); // Before 6am = previous day
    });
  });

  describe('Staff role constraints', () => {
    it('rejects dealer with user_id', async () => {
      const { error } = await supabase.from('staff').insert({
        first_name: 'Test',
        last_name: 'Dealer',
        role: 'dealer',
        casino_id: process.env.TEST_CASINO_ID,
        user_id: 'some-uuid', // Should fail
      });

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23514'); // Check constraint violation
    });

    it('rejects pit_boss without user_id', async () => {
      const { error } = await supabase.from('staff').insert({
        first_name: 'Test',
        last_name: 'PitBoss',
        role: 'pit_boss',
        casino_id: process.env.TEST_CASINO_ID,
        user_id: null, // Should fail
      });

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23514'); // Check constraint violation
    });
  });
});
```

---

## 9. Implementation Workstreams

### WS1: Database Layer (Priority 0)

| Task | Files | Estimate |
|------|-------|----------|
| Create migration for `compute_gaming_day` RPC | `supabase/migrations/YYYYMMDDHHMMSS_compute_gaming_day.sql` | 2h |
| Add staff role constraint | Same migration | 30m |
| Add RLS policies for `casino_settings` and `staff` | Same migration | 1h |
| Run migration and regenerate types | `npm run db:types` | 15m |

### WS2: Service Layer (Priority 0)

| Task | Files | Estimate |
|------|-------|----------|
| Create DTOs | `services/casino/dtos.ts` | 1h |
| Create Zod schemas | `services/casino/schemas.ts` | 1h |
| Create query keys | `services/casino/keys.ts` | 30m |
| Create HTTP fetchers | `services/casino/http.ts` | 1h |
| Update README | `services/casino/README.md` | 30m |

### WS3: Route Handlers (Priority 0)

| Task | Files | Estimate |
|------|-------|----------|
| List/Create casino | `app/api/v1/casino/route.ts` | 2h |
| Casino detail/update/delete | `app/api/v1/casino/[id]/route.ts` | 2h |
| Settings GET/PATCH | `app/api/v1/casino/settings/route.ts` | 1.5h |
| Staff list/create | `app/api/v1/casino/staff/route.ts` | 2h |
| Gaming day compute | `app/api/v1/casino/gaming-day/route.ts` | 1h |

### WS4: Testing (Priority 1)

| Task | Files | Estimate |
|------|-------|----------|
| Unit tests for gaming day logic | `services/casino/*.test.ts` | 2h |
| Integration tests for Route Handlers | `services/casino/*.integration.test.ts` | 4h |
| DST boundary tests | Same file | 2h |

### WS5: Cleanup (Priority 1)

| Task | Files | Estimate |
|------|-------|----------|
| Audit callers of legacy code | `grep -r "from '@/app/actions/casino'"` | 1h |
| Delete legacy Server Actions | `app/actions/casino.ts` | 15m |
| Update or delete legacy tests | `services/casino/casino.test.ts` | 1h |
| Update UI to use React Query | Various components | 2h |

---

## 10. Acceptance Criteria

### Functionality

- [ ] `compute_gaming_day(casino_id, timestamp)` RPC deployed and returns correct date
- [ ] Gaming day computation works correctly for timestamps before/after gaming day start
- [ ] All 10 Route Handlers deployed at `app/api/v1/casino/`
- [ ] Staff CRUD enforces role constraints (dealer vs authenticated roles)
- [ ] Legacy `app/actions/casino.ts` deleted

### Data & Integrity

- [ ] Gaming day is consistent when computed from different services
- [ ] No orphaned `casino_settings` records (1:1 with `casino`)
- [ ] Idempotency prevents duplicate casino/staff creation

### Security & Access

- [ ] RLS prevents cross-casino settings access
- [ ] Only admin role can modify `casino_settings`
- [ ] Staff records scoped by `casino_id` in all queries
- [ ] No Postgres error codes leak to API responses

### Testing

- [ ] Integration test: `compute_gaming_day` returns correct day for multiple timezones
- [ ] Integration test: DST boundary produces correct gaming day
- [ ] Integration test: Route Handlers with `withServerAction` middleware
- [ ] Unit tests for staff role validation logic

### Operational

- [ ] All mutations logged to `audit_log` with `correlation_id`
- [ ] Errors return domain error codes (not Postgres codes)
- [ ] Request tracing via `x-request-id` header

---

## 11. Cross-References

| Document | Location | Relevance |
|----------|----------|-----------|
| PRD-000 | `docs/10-prd/PRD-000-casino-foundation.md` | Source requirements |
| SRM §659-750 | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | CasinoService bounded context |
| TEMP-001 | `docs/20-architecture/temporal-patterns/TEMP-001-gaming-day-specification.md` | Gaming day authority |
| SEC-001 | `docs/30-security/SEC-001-rls-policy-matrix.md` | RLS policy patterns |
| SLAD v2.1.2 | `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` | Service patterns |
| EDGE_TRANSPORT_POLICY | `docs/20-architecture/EDGE_TRANSPORT_POLICY.md` | withServerAction contract |
| API_SURFACE_MVP | `docs/25-api-data/API_SURFACE_MVP.md` | ServiceHttpResult envelope |
| SERVICE_TEMPLATE | `docs/70-governance/SERVICE_TEMPLATE.md` | Implementation guide |

---

## 12. Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-11-29 | Lead Architect | Initial specification |

---

**End of Specification**
