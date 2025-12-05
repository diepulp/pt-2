# EXECUTION-SPEC: PRD-002 Rating Slip Service

**PRD:** PRD-002-rating-slip-service.md
**Generated:** 2025-12-03
**Status:** Ready for Execution

---

```yaml
# Machine-parseable workstream definitions
meta:
  prd_id: PRD-002
  prd_title: Rating Slip Service
  total_workstreams: 6
  parallelization_phases: 3
  estimated_complexity: medium

workstreams:
  - id: WS1
    name: DTOs and Type Foundations
    agent: typescript-pro
    phase: 1
    depends_on: []
    outputs:
      - services/rating-slip/dtos.ts
      - services/rating-slip/selects.ts
    gate: types-compile

  - id: WS2
    name: Zod Validation Schemas
    agent: typescript-pro
    phase: 1
    depends_on: []
    outputs:
      - services/rating-slip/schemas.ts
    gate: schemas-valid

  - id: WS3
    name: React Query Keys and HTTP Layer
    agent: typescript-pro
    phase: 1
    depends_on: []
    outputs:
      - services/rating-slip/keys.ts
      - services/rating-slip/http.ts
    gate: keys-compile

  - id: WS4
    name: Mappers and CRUD Operations
    agent: pt2-service-implementer
    phase: 2
    depends_on: [WS1]
    outputs:
      - services/rating-slip/mappers.ts
      - services/rating-slip/crud.ts
    gate: crud-compile

  - id: WS5
    name: Service Factory and Index
    agent: pt2-service-implementer
    phase: 2
    depends_on: [WS1, WS4]
    outputs:
      - services/rating-slip/index.ts
      - services/rating-slip/README.md
    gate: service-exports

  - id: WS6
    name: Unit and Integration Tests
    agent: backend-architect
    phase: 3
    depends_on: [WS4, WS5]
    outputs:
      - services/rating-slip/__tests__/rating-slip.service.test.ts
    gate: tests-pass

phases:
  - phase: 1
    name: Foundations (Parallel)
    workstreams: [WS1, WS2, WS3]
    can_parallelize: true

  - phase: 2
    name: Core Implementation (Parallel after Phase 1)
    workstreams: [WS4, WS5]
    can_parallelize: true

  - phase: 3
    name: Validation
    workstreams: [WS6]
    can_parallelize: false

validation_gates:
  types-compile: "npx tsc --noEmit services/rating-slip/dtos.ts services/rating-slip/selects.ts"
  schemas-valid: "npx tsc --noEmit services/rating-slip/schemas.ts"
  keys-compile: "npx tsc --noEmit services/rating-slip/keys.ts"
  crud-compile: "npx tsc --noEmit services/rating-slip/crud.ts services/rating-slip/mappers.ts"
  service-exports: "npx tsc --noEmit services/rating-slip/index.ts"
  tests-pass: "npm test -- services/rating-slip/__tests__"
```

---

## Phase 1: Foundations (Parallel)

All three workstreams can execute simultaneously with no dependencies.

### WS1: DTOs and Type Foundations

**Agent:** `typescript-pro`
**Priority:** P0
**Outputs:** `dtos.ts`, `selects.ts`

#### Task Description

Create the DTO type definitions and SQL select projections for RatingSlipService following Pattern B (Pick/Omit from Database types).

#### Input Context

**Database Schema** (from `types/database.types.ts:1087-1205`):

```typescript
// rating_slip table
Row: {
  id: string;
  casino_id: string;
  player_id: string;
  visit_id: string | null;
  table_id: string | null;
  seat_number: string | null;
  status: "open" | "paused" | "closed" | "archived";
  start_time: string;
  end_time: string | null;
  average_bet: number | null;
  game_settings: Json | null;
  policy_snapshot: Json | null;
}

// rating_slip_pause table
Row: {
  id: string;
  casino_id: string;
  rating_slip_id: string;
  started_at: string;
  ended_at: string | null;
  created_by: string | null;
}
```

#### Deliverables

**`services/rating-slip/selects.ts`**:
```typescript
// Named column projections for Supabase queries
export const RATING_SLIP_SELECT = `
  id,
  casino_id,
  player_id,
  visit_id,
  table_id,
  seat_number,
  status,
  start_time,
  end_time,
  average_bet,
  game_settings
` as const;

export const RATING_SLIP_WITH_PAUSES_SELECT = `
  ${RATING_SLIP_SELECT},
  rating_slip_pause (
    id,
    started_at,
    ended_at
  )
` as const;

export const RATING_SLIP_PAUSE_SELECT = `
  id,
  rating_slip_id,
  started_at,
  ended_at,
  created_by
` as const;
```

**`services/rating-slip/dtos.ts`**:
```typescript
import type { Database } from '@/types/database.types';

type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];
type RatingSlipPauseRow = Database['public']['Tables']['rating_slip_pause']['Row'];
type RatingSlipStatus = Database['public']['Enums']['rating_slip_status'];

// Core DTO - excludes policy_snapshot (internal)
export type RatingSlipDTO = Pick<
  RatingSlipRow,
  | 'id'
  | 'casino_id'
  | 'player_id'
  | 'visit_id'
  | 'table_id'
  | 'seat_number'
  | 'status'
  | 'start_time'
  | 'end_time'
  | 'average_bet'
  | 'game_settings'
> & {
  duration_seconds: number | null; // Calculated field
};

// Pause record DTO
export type RatingSlipPauseDTO = Pick<
  RatingSlipPauseRow,
  'id' | 'rating_slip_id' | 'started_at' | 'ended_at'
>;

// Slip with pause history
export type RatingSlipWithPausesDTO = RatingSlipDTO & {
  pauses: RatingSlipPauseDTO[];
};

// Create input (what API accepts)
export type CreateRatingSlipInput = {
  player_id: string;
  visit_id: string;
  table_id: string;
  seat_number: string;
  game_settings_id?: string;
};

// Close input
export type CloseRatingSlipInput = {
  average_bet?: number;
};

// List filters
export type RatingSlipListFilters = {
  visit_id?: string;
  player_id?: string;
  table_id?: string;
  status?: RatingSlipStatus;
  limit?: number;
  offset?: number;
};

// Re-export status enum for consumers
export type { RatingSlipStatus };
```

#### Validation Gate

```bash
npx tsc --noEmit services/rating-slip/dtos.ts services/rating-slip/selects.ts
```

---

### WS2: Zod Validation Schemas

**Agent:** `typescript-pro`
**Priority:** P0
**Outputs:** `schemas.ts`

#### Task Description

Create Zod validation schemas for HTTP request validation per ADR-013. Schemas validate request bodies and query parameters at the API boundary.

#### Deliverables

**`services/rating-slip/schemas.ts`**:
```typescript
import { z } from 'zod';

// Create rating slip request
export const createRatingSlipSchema = z.object({
  player_id: z.string().uuid('Invalid player_id format'),
  visit_id: z.string().uuid('Invalid visit_id format'),
  table_id: z.string().uuid('Invalid table_id format'),
  seat_number: z.string().min(1, 'Seat number required').max(10),
  game_settings_id: z.string().uuid().optional(),
});
export type CreateRatingSlipInput = z.infer<typeof createRatingSlipSchema>;

// Close rating slip request
export const closeRatingSlipSchema = z.object({
  average_bet: z.number().positive().optional(),
});
export type CloseRatingSlipInput = z.infer<typeof closeRatingSlipSchema>;

// List query parameters
export const ratingSlipListQuerySchema = z.object({
  visit_id: z.string().uuid().optional(),
  player_id: z.string().uuid().optional(),
  table_id: z.string().uuid().optional(),
  status: z.enum(['open', 'paused', 'closed', 'archived']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type RatingSlipListQuery = z.infer<typeof ratingSlipListQuerySchema>;

// Path parameter validation
export const ratingSlipIdSchema = z.object({
  id: z.string().uuid('Invalid rating slip ID'),
});
```

#### Validation Gate

```bash
npx tsc --noEmit services/rating-slip/schemas.ts
```

---

### WS3: React Query Keys and HTTP Layer

**Agent:** `typescript-pro`
**Priority:** P0
**Outputs:** `keys.ts`, `http.ts`

#### Task Description

Create React Query key factories and HTTP fetcher functions for client-side data fetching.

#### Deliverables

**`services/rating-slip/keys.ts`**:
```typescript
import type { RatingSlipListFilters } from './dtos';

const assign = <T extends object, U extends object>(target: T, source: U): T & U =>
  Object.assign(target, source);

export const ratingSlipKeys = {
  root: ['rating-slips'] as const,

  lists: () => assign([...ratingSlipKeys.root, 'list'] as const, {
    scope: 'rating-slip-lists',
  }),

  list: (filters: RatingSlipListFilters) => assign(
    [...ratingSlipKeys.lists(), filters] as const,
    { scope: 'rating-slip-list' }
  ),

  details: () => assign([...ratingSlipKeys.root, 'detail'] as const, {
    scope: 'rating-slip-details',
  }),

  detail: (id: string) => assign(
    [...ratingSlipKeys.details(), id] as const,
    { scope: 'rating-slip-detail' }
  ),

  byTable: (tableId: string) => assign(
    [...ratingSlipKeys.root, 'by-table', tableId] as const,
    { scope: 'rating-slip-by-table' }
  ),

  byVisit: (visitId: string) => assign(
    [...ratingSlipKeys.root, 'by-visit', visitId] as const,
    { scope: 'rating-slip-by-visit' }
  ),
};
```

**`services/rating-slip/http.ts`**:
```typescript
import type {
  RatingSlipDTO,
  RatingSlipWithPausesDTO,
  RatingSlipListFilters,
  CreateRatingSlipInput,
  CloseRatingSlipInput,
} from './dtos';

const BASE_URL = '/api/v1/rating-slips';

export async function fetchRatingSlip(id: string): Promise<RatingSlipDTO> {
  const res = await fetch(`${BASE_URL}/${id}`);
  if (!res.ok) throw new Error('Failed to fetch rating slip');
  const json = await res.json();
  return json.data;
}

export async function fetchRatingSlips(
  filters: RatingSlipListFilters
): Promise<RatingSlipDTO[]> {
  const params = new URLSearchParams();
  if (filters.visit_id) params.set('visit_id', filters.visit_id);
  if (filters.player_id) params.set('player_id', filters.player_id);
  if (filters.table_id) params.set('table_id', filters.table_id);
  if (filters.status) params.set('status', filters.status);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.offset) params.set('offset', String(filters.offset));

  const res = await fetch(`${BASE_URL}?${params}`);
  if (!res.ok) throw new Error('Failed to fetch rating slips');
  const json = await res.json();
  return json.data;
}

export async function createRatingSlip(
  input: CreateRatingSlipInput
): Promise<RatingSlipDTO> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to create rating slip');
  const json = await res.json();
  return json.data;
}

export async function pauseRatingSlip(id: string): Promise<RatingSlipDTO> {
  const res = await fetch(`${BASE_URL}/${id}/pause`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to pause rating slip');
  const json = await res.json();
  return json.data;
}

export async function resumeRatingSlip(id: string): Promise<RatingSlipDTO> {
  const res = await fetch(`${BASE_URL}/${id}/resume`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to resume rating slip');
  const json = await res.json();
  return json.data;
}

export async function closeRatingSlip(
  id: string,
  input?: CloseRatingSlipInput
): Promise<RatingSlipDTO> {
  const res = await fetch(`${BASE_URL}/${id}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input ?? {}),
  });
  if (!res.ok) throw new Error('Failed to close rating slip');
  const json = await res.json();
  return json.data;
}
```

#### Validation Gate

```bash
npx tsc --noEmit services/rating-slip/keys.ts services/rating-slip/http.ts
```

---

## Phase 2: Core Implementation (Parallel after Phase 1)

Both workstreams can execute in parallel once Phase 1 completes.

### WS4: Mappers and CRUD Operations

**Agent:** `pt2-service-implementer`
**Priority:** P0
**Depends On:** WS1
**Outputs:** `mappers.ts`, `crud.ts`

#### Task Description

Implement type-safe Row→DTO mappers and CRUD database operations. Mappers eliminate `as` casting. CRUD operations throw `DomainError` on failure.

#### Reference Implementation

Use `services/casino/mappers.ts` and `services/casino/crud.ts` as canonical examples.

#### Deliverables

**`services/rating-slip/mappers.ts`**:
```typescript
import type { Database } from '@/types/database.types';
import type {
  RatingSlipDTO,
  RatingSlipPauseDTO,
  RatingSlipWithPausesDTO,
} from './dtos';

type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];
type RatingSlipPauseRow = Database['public']['Tables']['rating_slip_pause']['Row'];

// Calculate duration excluding pauses
function calculateDuration(
  startTime: string,
  endTime: string | null,
  pauses: Array<{ started_at: string; ended_at: string | null }>
): number | null {
  if (!endTime) return null;

  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  const totalPauseMs = pauses.reduce((sum, pause) => {
    const pauseStart = new Date(pause.started_at).getTime();
    const pauseEnd = pause.ended_at
      ? new Date(pause.ended_at).getTime()
      : end; // If pause not ended, assume ended at slip close
    return sum + (pauseEnd - pauseStart);
  }, 0);

  return Math.floor((end - start - totalPauseMs) / 1000);
}

// Single slip mapper (no pauses loaded)
export function toRatingSlipDTO(row: RatingSlipRow): RatingSlipDTO {
  return {
    id: row.id,
    casino_id: row.casino_id,
    player_id: row.player_id,
    visit_id: row.visit_id,
    table_id: row.table_id,
    seat_number: row.seat_number,
    status: row.status,
    start_time: row.start_time,
    end_time: row.end_time,
    average_bet: row.average_bet,
    game_settings: row.game_settings,
    duration_seconds: null, // Requires pauses to calculate
  };
}

// Pause mapper
export function toRatingSlipPauseDTO(row: RatingSlipPauseRow): RatingSlipPauseDTO {
  return {
    id: row.id,
    rating_slip_id: row.rating_slip_id,
    started_at: row.started_at,
    ended_at: row.ended_at,
  };
}

// Slip with pauses and calculated duration
export function toRatingSlipWithPausesDTO(
  row: RatingSlipRow,
  pauseRows: RatingSlipPauseRow[]
): RatingSlipWithPausesDTO {
  const pauses = pauseRows.map(toRatingSlipPauseDTO);
  const duration_seconds = calculateDuration(
    row.start_time,
    row.end_time,
    pauses
  );

  return {
    id: row.id,
    casino_id: row.casino_id,
    player_id: row.player_id,
    visit_id: row.visit_id,
    table_id: row.table_id,
    seat_number: row.seat_number,
    status: row.status,
    start_time: row.start_time,
    end_time: row.end_time,
    average_bet: row.average_bet,
    game_settings: row.game_settings,
    duration_seconds,
    pauses,
  };
}

// List mapper
export function toRatingSlipDTOList(rows: RatingSlipRow[]): RatingSlipDTO[] {
  return rows.map(toRatingSlipDTO);
}
```

**`services/rating-slip/crud.ts`**:
```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { DomainError } from '@/lib/errors/domain-error';
import type {
  RatingSlipDTO,
  RatingSlipWithPausesDTO,
  RatingSlipListFilters,
  CreateRatingSlipInput,
  CloseRatingSlipInput,
} from './dtos';
import {
  toRatingSlipDTO,
  toRatingSlipWithPausesDTO,
  toRatingSlipDTOList,
} from './mappers';
import { RATING_SLIP_SELECT, RATING_SLIP_PAUSE_SELECT } from './selects';

type Client = SupabaseClient<Database>;

// Domain error codes
const SLIP_NOT_FOUND = 'RATING_SLIP_NOT_FOUND';
const SLIP_NOT_OPEN = 'RATING_SLIP_NOT_OPEN';
const SLIP_NOT_PAUSED = 'RATING_SLIP_NOT_PAUSED';
const SLIP_ALREADY_CLOSED = 'RATING_SLIP_ALREADY_CLOSED';
const SLIP_DUPLICATE_ACTIVE = 'RATING_SLIP_DUPLICATE_ACTIVE';

export async function getById(
  supabase: Client,
  id: string
): Promise<RatingSlipWithPausesDTO> {
  const { data: slip, error: slipError } = await supabase
    .from('rating_slip')
    .select(RATING_SLIP_SELECT)
    .eq('id', id)
    .single();

  if (slipError || !slip) {
    throw new DomainError(SLIP_NOT_FOUND, `Rating slip ${id} not found`);
  }

  const { data: pauses } = await supabase
    .from('rating_slip_pause')
    .select(RATING_SLIP_PAUSE_SELECT)
    .eq('rating_slip_id', id)
    .order('started_at', { ascending: true });

  return toRatingSlipWithPausesDTO(slip, pauses ?? []);
}

export async function list(
  supabase: Client,
  filters: RatingSlipListFilters
): Promise<RatingSlipDTO[]> {
  let query = supabase
    .from('rating_slip')
    .select(RATING_SLIP_SELECT)
    .order('start_time', { ascending: false });

  if (filters.visit_id) query = query.eq('visit_id', filters.visit_id);
  if (filters.player_id) query = query.eq('player_id', filters.player_id);
  if (filters.table_id) query = query.eq('table_id', filters.table_id);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.limit) query = query.limit(filters.limit);
  if (filters.offset) query = query.range(filters.offset, filters.offset + (filters.limit ?? 20) - 1);

  const { data, error } = await query;

  if (error) {
    throw new DomainError('RATING_SLIP_LIST_FAILED', error.message);
  }

  return toRatingSlipDTOList(data ?? []);
}

export async function create(
  supabase: Client,
  casinoId: string,
  input: CreateRatingSlipInput
): Promise<RatingSlipDTO> {
  // Check for duplicate active slip
  const { data: existing } = await supabase
    .from('rating_slip')
    .select('id')
    .eq('player_id', input.player_id)
    .eq('table_id', input.table_id)
    .in('status', ['open', 'paused'])
    .limit(1);

  if (existing && existing.length > 0) {
    throw new DomainError(
      SLIP_DUPLICATE_ACTIVE,
      `Player already has active slip at this table`
    );
  }

  const { data, error } = await supabase
    .from('rating_slip')
    .insert({
      casino_id: casinoId,
      player_id: input.player_id,
      visit_id: input.visit_id,
      table_id: input.table_id,
      seat_number: input.seat_number,
      status: 'open',
      start_time: new Date().toISOString(),
    })
    .select(RATING_SLIP_SELECT)
    .single();

  if (error || !data) {
    throw new DomainError('RATING_SLIP_CREATE_FAILED', error?.message ?? 'Insert failed');
  }

  return toRatingSlipDTO(data);
}

export async function pause(
  supabase: Client,
  casinoId: string,
  id: string
): Promise<RatingSlipDTO> {
  // Get current slip
  const { data: slip, error: fetchError } = await supabase
    .from('rating_slip')
    .select(RATING_SLIP_SELECT)
    .eq('id', id)
    .single();

  if (fetchError || !slip) {
    throw new DomainError(SLIP_NOT_FOUND, `Rating slip ${id} not found`);
  }

  if (slip.status !== 'open') {
    throw new DomainError(SLIP_NOT_OPEN, `Cannot pause slip with status: ${slip.status}`);
  }

  // Create pause record
  const { error: pauseError } = await supabase
    .from('rating_slip_pause')
    .insert({
      casino_id: casinoId,
      rating_slip_id: id,
      started_at: new Date().toISOString(),
    });

  if (pauseError) {
    throw new DomainError('RATING_SLIP_PAUSE_FAILED', pauseError.message);
  }

  // Update slip status
  const { data: updated, error: updateError } = await supabase
    .from('rating_slip')
    .update({ status: 'paused' })
    .eq('id', id)
    .select(RATING_SLIP_SELECT)
    .single();

  if (updateError || !updated) {
    throw new DomainError('RATING_SLIP_UPDATE_FAILED', updateError?.message ?? 'Update failed');
  }

  return toRatingSlipDTO(updated);
}

export async function resume(
  supabase: Client,
  id: string
): Promise<RatingSlipDTO> {
  // Get current slip
  const { data: slip, error: fetchError } = await supabase
    .from('rating_slip')
    .select(RATING_SLIP_SELECT)
    .eq('id', id)
    .single();

  if (fetchError || !slip) {
    throw new DomainError(SLIP_NOT_FOUND, `Rating slip ${id} not found`);
  }

  if (slip.status !== 'paused') {
    throw new DomainError(SLIP_NOT_PAUSED, `Cannot resume slip with status: ${slip.status}`);
  }

  // End active pause
  const { error: pauseError } = await supabase
    .from('rating_slip_pause')
    .update({ ended_at: new Date().toISOString() })
    .eq('rating_slip_id', id)
    .is('ended_at', null);

  if (pauseError) {
    throw new DomainError('RATING_SLIP_RESUME_FAILED', pauseError.message);
  }

  // Update slip status
  const { data: updated, error: updateError } = await supabase
    .from('rating_slip')
    .update({ status: 'open' })
    .eq('id', id)
    .select(RATING_SLIP_SELECT)
    .single();

  if (updateError || !updated) {
    throw new DomainError('RATING_SLIP_UPDATE_FAILED', updateError?.message ?? 'Update failed');
  }

  return toRatingSlipDTO(updated);
}

export async function close(
  supabase: Client,
  id: string,
  input?: CloseRatingSlipInput
): Promise<RatingSlipWithPausesDTO> {
  // Get current slip
  const { data: slip, error: fetchError } = await supabase
    .from('rating_slip')
    .select(RATING_SLIP_SELECT)
    .eq('id', id)
    .single();

  if (fetchError || !slip) {
    throw new DomainError(SLIP_NOT_FOUND, `Rating slip ${id} not found`);
  }

  if (slip.status === 'closed' || slip.status === 'archived') {
    throw new DomainError(SLIP_ALREADY_CLOSED, `Slip already closed`);
  }

  const now = new Date().toISOString();

  // End any active pause
  await supabase
    .from('rating_slip_pause')
    .update({ ended_at: now })
    .eq('rating_slip_id', id)
    .is('ended_at', null);

  // Update slip
  const { data: updated, error: updateError } = await supabase
    .from('rating_slip')
    .update({
      status: 'closed',
      end_time: now,
      average_bet: input?.average_bet ?? slip.average_bet,
    })
    .eq('id', id)
    .select(RATING_SLIP_SELECT)
    .single();

  if (updateError || !updated) {
    throw new DomainError('RATING_SLIP_UPDATE_FAILED', updateError?.message ?? 'Update failed');
  }

  // Fetch pauses for duration calculation
  const { data: pauses } = await supabase
    .from('rating_slip_pause')
    .select(RATING_SLIP_PAUSE_SELECT)
    .eq('rating_slip_id', id)
    .order('started_at', { ascending: true });

  return toRatingSlipWithPausesDTO(updated, pauses ?? []);
}
```

#### Validation Gate

```bash
npx tsc --noEmit services/rating-slip/crud.ts services/rating-slip/mappers.ts
```

---

### WS5: Service Factory and Index

**Agent:** `pt2-service-implementer`
**Priority:** P0
**Depends On:** WS1, WS4
**Outputs:** `index.ts`, `README.md`

#### Task Description

Create the service factory with explicit interface following ADR-008. Factory delegates to crud.ts operations.

#### Deliverables

**`services/rating-slip/index.ts`**:
```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type {
  RatingSlipDTO,
  RatingSlipWithPausesDTO,
  RatingSlipListFilters,
  CreateRatingSlipInput,
  CloseRatingSlipInput,
} from './dtos';
import * as crud from './crud';

/**
 * RatingSlipService Interface
 *
 * Manages gameplay session tracking (rating slips) with:
 * - Lifecycle: start → pause ↔ resume → close
 * - Duration calculation excluding pauses
 * - Single active slip constraint per player-table
 */
export interface RatingSlipService {
  /** Get a rating slip by ID with pauses and calculated duration */
  getById(id: string): Promise<RatingSlipWithPausesDTO>;

  /** List rating slips with optional filters */
  list(filters?: RatingSlipListFilters): Promise<RatingSlipDTO[]>;

  /** Start a new rating slip for a player at a table */
  start(input: CreateRatingSlipInput): Promise<RatingSlipDTO>;

  /** Pause an open rating slip */
  pause(id: string): Promise<RatingSlipDTO>;

  /** Resume a paused rating slip */
  resume(id: string): Promise<RatingSlipDTO>;

  /** Close a rating slip, calculating final duration */
  close(id: string, input?: CloseRatingSlipInput): Promise<RatingSlipWithPausesDTO>;

  /** Get active slips for a table */
  getActiveByTable(tableId: string): Promise<RatingSlipDTO[]>;

  /** Get active slip for a player (if any) */
  getActiveByPlayer(playerId: string): Promise<RatingSlipDTO | null>;
}

/**
 * Create RatingSlipService instance
 *
 * @param supabase - Typed Supabase client
 * @param casinoId - Casino context for RLS
 */
export function createRatingSlipService(
  supabase: SupabaseClient<Database>,
  casinoId: string
): RatingSlipService {
  return {
    getById: (id) => crud.getById(supabase, id),

    list: (filters = {}) => crud.list(supabase, filters),

    start: (input) => crud.create(supabase, casinoId, input),

    pause: (id) => crud.pause(supabase, casinoId, id),

    resume: (id) => crud.resume(supabase, id),

    close: (id, input) => crud.close(supabase, id, input),

    getActiveByTable: (tableId) =>
      crud.list(supabase, { table_id: tableId, status: 'open' }),

    getActiveByPlayer: async (playerId) => {
      const slips = await crud.list(supabase, { player_id: playerId, status: 'open', limit: 1 });
      return slips[0] ?? null;
    },
  };
}
```

**`services/rating-slip/README.md`**:
```markdown
# RatingSlipService

Gameplay session tracking service for PT-2.

## Overview

RatingSlipService manages rating slips—records of player gameplay sessions at gaming tables. Each slip tracks:
- Session start/end times
- Pause intervals (breaks)
- Average bet
- Seat position
- Game settings snapshot

## Architecture

**Pattern:** B (Canonical CRUD) with mappers.ts
**PRD:** PRD-002-rating-slip-service.md
**SRM Section:** RatingSlipService (Telemetry Context)

## State Machine

```
┌──────────┐    pause()    ┌──────────┐
│   open   │──────────────▶│  paused  │
└──────────┘               └──────────┘
     │                          │
     │ close()           resume()│
     │                          │
     ▼                          ▼
┌──────────┐               ┌──────────┐
│  closed  │◀──── close() ─│   open   │
└──────────┘               └──────────┘
```

## Usage

\`\`\`typescript
import { createRatingSlipService } from '@/services/rating-slip';

const service = createRatingSlipService(supabase, casinoId);

// Start a slip
const slip = await service.start({
  player_id: 'uuid',
  visit_id: 'uuid',
  table_id: 'uuid',
  seat_number: '3',
});

// Pause when player takes a break
await service.pause(slip.id);

// Resume when player returns
await service.resume(slip.id);

// Close when player leaves
const final = await service.close(slip.id, { average_bet: 25 });
console.log(final.duration_seconds); // Excludes pause time
\`\`\`

## Duration Calculation

Duration = `end_time - start_time - SUM(pause_intervals)`

All timestamps are server-derived (no client clock dependency).

## Error Codes

| Code | Description |
|------|-------------|
| `RATING_SLIP_NOT_FOUND` | Slip ID does not exist |
| `RATING_SLIP_NOT_OPEN` | Cannot pause a non-open slip |
| `RATING_SLIP_NOT_PAUSED` | Cannot resume a non-paused slip |
| `RATING_SLIP_ALREADY_CLOSED` | Slip already closed |
| `RATING_SLIP_DUPLICATE_ACTIVE` | Player already has active slip at table |

## Files

| File | Purpose |
|------|---------|
| `dtos.ts` | Type definitions (Pick/Omit from Database) |
| `schemas.ts` | Zod validation for HTTP requests |
| `selects.ts` | SQL column projections |
| `mappers.ts` | Row → DTO transformers |
| `crud.ts` | Database operations |
| `index.ts` | Service factory |
| `keys.ts` | React Query key factories |
| `http.ts` | Client-side HTTP fetchers |
\`\`\`
```

#### Validation Gate

```bash
npx tsc --noEmit services/rating-slip/index.ts
npm run lint
npm run lint-staged
```

---

## Phase 3: Validation

### WS6: Unit and Integration Tests

**Agent:** `backend-architect`
**Priority:** P0
**Depends On:** WS4, WS5
**Outputs:** `__tests__/rating-slip.service.test.ts`

#### Task Description

Create comprehensive tests for the RatingSlipService covering state machine transitions, duration calculation, and error cases.

#### Test Cases Required

1. **State Machine Tests**
   - start() creates slip with status=open
   - pause() transitions open→paused
   - resume() transitions paused→open
   - close() transitions open→closed
   - close() transitions paused→closed (ends active pause)
   - pause() on non-open throws RATING_SLIP_NOT_OPEN
   - resume() on non-paused throws RATING_SLIP_NOT_PAUSED
   - close() on closed throws RATING_SLIP_ALREADY_CLOSED

2. **Duration Calculation Tests**
   - Duration with no pauses = end_time - start_time
   - Duration with single pause excludes pause interval
   - Duration with multiple pauses excludes all intervals
   - Duration with active pause at close time handled correctly

3. **Constraint Tests**
   - Duplicate active slip for same player+table throws RATING_SLIP_DUPLICATE_ACTIVE
   - Different players can have slips at same table
   - Same player can have slips at different tables

4. **Integration Tests**
   - Full lifecycle: start → pause → resume → pause → resume → close
   - List filters work correctly
   - getById returns calculated duration

#### Validation Gate

```bash
npm test -- services/rating-slip/__tests__
```

---

## Execution Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                     PHASE 1 (PARALLEL)                          │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                     │
│  │   WS1   │    │   WS2   │    │   WS3   │                     │
│  │  DTOs   │    │ Schemas │    │  Keys   │                     │
│  │ Selects │    │  (Zod)  │    │  HTTP   │                     │
│  └────┬────┘    └────┬────┘    └────┬────┘                     │
│       │              │              │                           │
└───────┼──────────────┼──────────────┼───────────────────────────┘
        │              │              │
        ▼              │              │
┌───────────────────────────────────────────────────────────────┐
│                     PHASE 2 (PARALLEL)                         │
│  ┌─────────────────────────┐    ┌─────────────────────────┐   │
│  │          WS4            │    │          WS5            │   │
│  │   Mappers + CRUD        │    │   Factory + README      │   │
│  │   (depends: WS1)        │    │   (depends: WS1, WS4)   │   │
│  └───────────┬─────────────┘    └───────────┬─────────────┘   │
│              │                              │                  │
└──────────────┼──────────────────────────────┼──────────────────┘
               │                              │
               ▼                              ▼
┌───────────────────────────────────────────────────────────────┐
│                     PHASE 3 (SEQUENTIAL)                       │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                         WS6                              │  │
│  │                    Unit + Integration Tests              │  │
│  │                    (depends: WS4, WS5)                   │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

## Agent Assignments

| Workstream | Agent | Skills Required |
|------------|-------|-----------------|
| WS1, WS2, WS3 | `typescript-pro` | TypeScript, Zod, React Query |
| WS4, WS5 | `pt2-service-implementer` | Pattern B, Supabase, DomainError |
| WS6 | `backend-architect` | Jest, Integration testing |

## Final Validation

After all workstreams complete:

```bash
# Full type check
npx tsc --noEmit

# Run tests
npm test -- services/rating-slip/__tests__

# Lint check
npm run lint -- services/rating-slip/
```
