---
id: EXEC-086
title: Wave 2 Phase 2.3a — Operational Outbox Observability
prd: PRD-086
prd_path: docs/10-prd/PRD-086-wave2-phase-2.3a-operational-outbox-observability-v0.md
fib_h: FIB-H-W2-OUTBOX-OBS-001
fib_s: null
status: pending
created: 2026-05-19
complexity_prescreen: full
fib_s_loaded: false
write_path_classification: none
gov010_check: "waived:wave-2-phase-2.3a-continuation-governing-adrs-in-affects-field"
workstreams:
  WS1_MIGRATION:
    name: "Admin Read RPCs + DTO Additions (rpc_get_outbox_relay_health + rpc_get_outbox_event_page)"
    executor: backend-service-builder
    executor_type: skill
    bounded_context: PlayerFinancialService
    depends_on: []
    traces_to: [infrastructure]
    estimated_complexity: medium
    outputs:
      - supabase/migrations/20260519010436_wave2_outbox_admin_read_rpcs.sql
      - services/player-financial/dtos.ts
    gate: schema-validation

  WS2_API:
    name: "Internal Admin API Route — GET /api/internal/outbox-observability"
    executor: api-builder
    executor_type: skill
    bounded_context: PlayerFinancialService / AdminBoundary
    depends_on: [WS1_MIGRATION]
    traces_to: [infrastructure]
    estimated_complexity: small
    outputs:
      - app/api/internal/outbox-observability/route.ts
    gate: test-pass

  WS3_FRONTEND:
    name: "Admin Outbox Observability Page — /admin/outbox-observability"
    executor: frontend-design-pt-2
    executor_type: skill
    bounded_context: AdminUI
    depends_on: [WS2_API]
    traces_to: [infrastructure]
    estimated_complexity: medium
    outputs:
      - app/(dashboard)/admin/outbox-observability/page.tsx
      - app/(dashboard)/admin/outbox-observability/OutboxObservabilityClient.tsx
      - components/layout/app-sidebar.tsx
    gate: build

  WS4_GOVERNANCE:
    name: "Wave Tracker Update — Phase 2.3a Entry + Cursor Advance"
    executor: lead-architect
    executor_type: skill
    bounded_context: governance
    depends_on: [WS3_FRONTEND]
    traces_to: [infrastructure]
    estimated_complexity: small
    outputs:
      - docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-TRACKER.json
      - docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-PROGRESS-TRACKER.md
    gate: build

execution_phases:
  - phase: 1
    parallel: [WS1_MIGRATION]
    description: SQL migration — two read-only SECURITY DEFINER RPCs + OutboxAdminEventDTO / OutboxRelayHealthDTO additions to player-financial DTOs
  - phase: 2
    parallel: [WS2_API]
    description: Internal admin API route with admin session auth, service-role client, and both RPC calls
  - phase: 3
    parallel: [WS3_FRONTEND]
    description: Admin observability page with relay health summary card, event table, filters, row-expand, and sidebar link
  - phase: 4
    parallel: [WS4_GOVERNANCE]
    description: WAVE-2-TRACKER.json Phase 2.3a entry + cursor.active_phase advance from 2.2 to 2.3a; WAVE-2-PROGRESS-TRACKER.md sync

gates:
  schema-validation:
    type: migration
    commands:
      - "npm run db:types-local"
      - "npm run type-check"
      - "npm run lint"
    passing_criteria: "db:types-local exit 0; OutboxAdminEventDTO and OutboxRelayHealthDTO added and resolve from database.types.ts; both new RPCs present in generated types under Database['public']['Functions']; type-check exit 0; lint exit 0"
  test-pass:
    type: test
    commands:
      - "npm run test -- --testPathPattern=outbox-observability --silent > /tmp/outbox-obs-api.log 2>&1"
      - "npm run type-check"
      - "npm run lint"
    passing_criteria: "401 unit test passes; 403 non-admin unit test passes; 200 shape unit test (mocked admin session + mocked RPC responses) passes; type-check exit 0; lint exit 0"
  build:
    type: build
    commands:
      - "npm run type-check"
      - "npm run lint"
      - "npm run build"
    passing_criteria: "All exit 0; no new TypeScript errors; Next.js build succeeds with outbox-observability page in output"
---

# EXEC-086 — Wave 2 Phase 2.3a: Operational Outbox Observability

## Overview

Delivers a read-only internal admin surface at `/admin/outbox-observability` that makes `finance_outbox` relay delivery state and event semantic envelopes directly inspectable without raw SQL access. This closes the operational visibility gap after Phase 2.2's six-producer rollout: all producer paths are wired and I1–I4 certified, but field validation still requires a database console.

**No write path exists in this slice.** The surface, its API route, and both RPCs perform zero writes to `finance_outbox`, `processed_messages`, or any other table. This is enforced by implementation contract (GET-only route, read-only RPCs), DoD checklist, and code review gate.

**Phase 2.3a authorization:** Phase 2.2 exit — PRD-085/EXEC-085 complete, 2026-05-19.

**Architecture authority:**
- ADR-052: Financial Fact Model (discriminator fields, class attribution rules)
- ADR-054: Financial Event Propagation & Surface Contract (`origin_label` immutability D5, surface contract)
- ADR-056: Outbox write-path governance (SECURITY DEFINER enforcement, service-role gating)

---

## Workstream 1: Admin Read RPCs + DTO Additions (WS1_MIGRATION)

**Executor:** `backend-service-builder`

### Context

All `finance_outbox` Wave 2 DDL fields are confirmed live (`delivery_attempts`, `last_attempted_at`, `last_error` from migration `20260511134129`; `rpc_acknowledge_outbox_delivery` from migration `20260518014252`). The relay correctly populates these fields. This workstream adds two read-only SECURITY DEFINER RPCs that expose relay health and event queue state, and extends `services/player-financial/dtos.ts` with the admin-specific DTO types.

### Pre-State Assertions (include in migration)

```sql
-- 1. finance_outbox exists with Wave 2 relay lifecycle fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'finance_outbox'
      AND a.attname = 'delivery_attempts'
      AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'PRE-STATE FAIL: finance_outbox.delivery_attempts not found. Apply Wave 2 transform migration first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'finance_outbox'
      AND a.attname = 'last_error'
      AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'PRE-STATE FAIL: finance_outbox.last_error not found. Apply Wave 2 transform migration first.';
  END IF;
END $$;
```

### RPC 1: `rpc_get_outbox_relay_health`

```sql
CREATE OR REPLACE FUNCTION public.rpc_get_outbox_relay_health(
  p_casino_id UUID
)
RETURNS TABLE (
  pending_count          BIGINT,
  oldest_pending_age_seconds DOUBLE PRECISION,
  retry_row_count        BIGINT,
  poison_candidate_count BIGINT,
  processed_count_24h    BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE fo.processed_at IS NULL)::BIGINT,
    EXTRACT(EPOCH FROM (NOW() - MIN(fo.created_at) FILTER (WHERE fo.processed_at IS NULL))),
    COUNT(*) FILTER (WHERE fo.delivery_attempts >= 1 AND fo.processed_at IS NULL)::BIGINT,
    COUNT(*) FILTER (WHERE fo.delivery_attempts >= 3 AND fo.processed_at IS NULL)::BIGINT,
    COUNT(*) FILTER (WHERE fo.processed_at IS NOT NULL AND fo.processed_at > NOW() - INTERVAL '24 hours')::BIGINT
  FROM public.finance_outbox fo
  WHERE fo.casino_id = p_casino_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_outbox_relay_health(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_outbox_relay_health(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_get_outbox_relay_health(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_outbox_relay_health(UUID) TO service_role;
```

### RPC 2: `rpc_get_outbox_event_page`

```sql
CREATE OR REPLACE FUNCTION public.rpc_get_outbox_event_page(
  p_casino_id  UUID,
  p_event_type TEXT    DEFAULT NULL,
  p_status     TEXT    DEFAULT 'all',
  p_search_id  UUID    DEFAULT NULL,
  p_limit      INTEGER DEFAULT 100
)
RETURNS TABLE (
  event_id          UUID,
  event_type        TEXT,
  fact_class        TEXT,
  origin_label      TEXT,
  casino_id         UUID,
  table_id          UUID,
  player_id         UUID,
  aggregate_id      UUID,
  payload           JSONB,
  created_at        TIMESTAMPTZ,
  processed_at      TIMESTAMPTZ,
  delivery_attempts INTEGER,
  last_attempted_at TIMESTAMPTZ,
  last_error        VARCHAR(2000)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 100), 100));
BEGIN
  -- Reject unrecognized status values at the SQL boundary as a second line of defence.
  -- The API route validates first and returns 400; this guard prevents misuse
  -- if the RPC is ever called directly (e.g., via service-role tooling or tests).
  IF p_status NOT IN ('all', 'pending', 'processed', 'failing', 'poison') THEN
    RAISE EXCEPTION 'Invalid p_status value: %. Must be one of: all, pending, processed, failing, poison', p_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN QUERY
  SELECT
    fo.event_id,
    fo.event_type,
    fo.fact_class,
    fo.origin_label,
    fo.casino_id,
    fo.table_id,
    fo.player_id,
    fo.aggregate_id,
    fo.payload,
    fo.created_at,
    fo.processed_at,
    fo.delivery_attempts,
    fo.last_attempted_at,
    fo.last_error
  FROM public.finance_outbox fo
  WHERE fo.casino_id = p_casino_id
    AND (p_event_type IS NULL OR fo.event_type = p_event_type)
    AND (
      p_status = 'all'
      OR (p_status = 'pending'   AND fo.processed_at IS NULL AND fo.delivery_attempts < 3)
      OR (p_status = 'processed' AND fo.processed_at IS NOT NULL)
      OR (p_status = 'failing'   AND fo.processed_at IS NULL AND fo.delivery_attempts >= 1 AND fo.delivery_attempts < 3)
      OR (p_status = 'poison'    AND fo.processed_at IS NULL AND fo.delivery_attempts >= 3)
    )
    AND (
      p_search_id IS NULL
      OR fo.event_id      = p_search_id
      OR fo.aggregate_id  = p_search_id
      OR fo.table_id      = p_search_id
    )
  ORDER BY fo.created_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_outbox_event_page(UUID, TEXT, TEXT, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_outbox_event_page(UUID, TEXT, TEXT, UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_get_outbox_event_page(UUID, TEXT, TEXT, UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_outbox_event_page(UUID, TEXT, TEXT, UUID, INTEGER) TO service_role;
```

### DTO Additions: `services/player-financial/dtos.ts`

Add alongside (not extending) existing `FinancialOutboxEventDTO`:

```ts
// Standalone — does not extend FinancialOutboxEventDTO.
// FinancialOutboxEventDTO is the frozen consumer contract; OutboxAdminEventDTO is
// the observability contract. Both derive from the same DB row type but evolve independently.
type FinancialOutboxRow = Database['public']['Tables']['finance_outbox']['Row'];

export type OutboxAdminEventDTO = Pick<
  FinancialOutboxRow,
  | 'event_id'
  | 'event_type'
  | 'casino_id'
  | 'table_id'
  | 'player_id'
  | 'aggregate_id'
  | 'created_at'
  | 'processed_at'
  | 'delivery_attempts'
  | 'last_attempted_at'
  | 'last_error'
> & {
  fact_class: 'ledger' | 'operational';
  origin_label: 'actual' | 'estimated' | 'observed' | 'compliance';
  payload: Record<string, unknown>;
};

export type OutboxRelayHealthDTO = {
  pending_count: number;
  oldest_pending_age_seconds: number | null;
  retry_row_count: number;
  poison_candidate_count: number;
  processed_count_24h: number;
};
```

### Acceptance Criteria (WS1)

- [ ] Migration file timestamp via `date +"%Y%m%d%H%M%S"`, not fabricated — sorts after all existing migrations
- [ ] Pre-state assertions block the migration if Wave 2 DDL is absent
- [ ] Both RPCs: `SECURITY DEFINER`, `SET search_path = ''`, `REVOKE ALL FROM PUBLIC/anon/authenticated`, `GRANT EXECUTE TO service_role`
- [ ] `rpc_get_outbox_relay_health` returns exactly the five `OutboxRelayHealthDTO` columns; `oldest_pending_age_seconds` is NULL when no pending rows
- [ ] `rpc_get_outbox_event_page` hard-caps result rows at 100 (`GREATEST(1, LEAST(COALESCE(p_limit, 100), 100))`)
- [ ] `'failing'` filter: `processed_at IS NULL AND delivery_attempts >= 1 AND delivery_attempts < 3` — does not include poison candidates (no overlap with `'poison'`)
- [ ] `'poison'` filter: `processed_at IS NULL AND delivery_attempts >= 3`
- [ ] Invalid `p_status` raises `invalid_parameter_value` exception — SQL-level guard independent of API validation
- [ ] `npm run db:types-local` exits 0 after migration
- [ ] `OutboxAdminEventDTO` includes `delivery_attempts`, `last_attempted_at`, `last_error`; these fields are absent from `FinancialOutboxEventDTO`
- [ ] `OutboxAdminEventDTO` does NOT extend or intersect `FinancialOutboxEventDTO`
- [ ] Unit test: `OutboxAdminEventDTO` passes through `origin_label` and `fact_class` unchanged from DB row — no synthetic values
- [ ] `type-check` and `lint` exit 0

---

## Workstream 2: Internal Admin API Route (WS2_API)

**Executor:** `api-builder`

### Context

Route: `app/api/internal/outbox-observability/route.ts` — GET only, read-only.

Pattern reference: `app/api/v1/outbox-relay/route.ts` for service-role client construction. Admin session guard pattern from existing `(dashboard)/admin` routes.

Casino ID derivation: The API route must derive `casino_id` from the authenticated admin session — never from query params or request body. This follows ADR-024 authoritative context derivation.

### Route Contract

```
GET /api/internal/outbox-observability
  Query params (all optional):
    ?event_type=buyin.recorded   (filter)
    ?status=all|pending|processed|failing|poison
    ?search_id=<uuid>            (exact match: event_id | aggregate_id | table_id)

Response 200:
  {
    "health": OutboxRelayHealthDTO,
    "events": OutboxAdminEventDTO[]
  }

Response 401: { "error": "Unauthorized" }         (missing/invalid session)
Response 403: { "error": "Forbidden" }             (authenticated but non-admin role)
Response 400: { "error": "Invalid search_id" }    (non-UUID search_id value)
Response 400: { "error": "Invalid status" }       (unrecognized status value)
```

### Implementation Requirements

**Two-client pattern — do not blur auth semantics:**

1. **User/session client** (`createClient()` — the standard server client, uses browser session cookies):
   - Call `supabase.auth.getUser()` — returns 401 if no valid session
   - Query `staff` table directly: `select('role, casino_id').eq('user_id', user.id).eq('status', 'active').single()`
   - If staff row absent or `staff.role !== 'admin'` → return 403
   - Derive `casino_id` from the confirmed `staff` row — never from query params or request body

2. **Service-role client** (separate instance with service-role key — same pattern as `app/api/v1/outbox-relay/route.ts`):
   - Created only after authorization succeeds
   - Used exclusively for RPC calls (`rpc_get_outbox_relay_health`, `rpc_get_outbox_event_page`)

The route must enforce authorization independently — the `(dashboard)/admin` layout guard applies only to RSC page rendering and cannot be relied on for API route protection.

**Input validation (before RPC calls):**
- Validate `search_id` as UUID format if present — return 400 if invalid (use existing UUID validation pattern)
- Validate `status` against the known set: `'all' | 'pending' | 'processed' | 'failing' | 'poison'` — return 400 for any other value
- Pass `casino_id` derived from the `staff` row, never from request input

**RPC calls:** invoke both in parallel (`Promise.all`) after authorization + validation succeed.

**Error handling:** propagate Supabase errors as 500 with safe error details (`safeErrorDetails` from `@/lib/errors/safe-error-details`). No writes to any table at any point.

### Acceptance Criteria (WS2)

- [ ] Route file is at `app/api/internal/outbox-observability/route.ts`
- [ ] GET handler only — no POST/PUT/PATCH/DELETE exports
- [ ] Returns 401 when session is absent or invalid
- [ ] Returns 403 for authenticated session where `staff.role !== 'admin'` — route enforces this independently of the layout guard
- [ ] Returns 400 for malformed (non-UUID) `search_id`
- [ ] Returns 400 for unrecognized `status` value
- [ ] `casino_id` is derived from the authenticated `staff` row — not from any request query param
- [ ] Two distinct clients: session client for auth/role check; service-role client for RPC calls
- [ ] Both RPCs called in parallel after auth succeeds; response shape matches contract above
- [ ] Unit test: 401 path (mocked missing session)
- [ ] Unit test: 403 path (mocked non-admin authenticated session)
- [ ] Unit test: 200 shape with mocked RPC responses (`health` + `events` present, mocked admin session)
- [ ] No `console.*` calls; no `as any`; no raw `Error` objects in `DomainError` — use `safeErrorDetails`
- [ ] `type-check` and `lint` exit 0

---

## Workstream 3: Admin Outbox Observability Page (WS3_FRONTEND)

**Executor:** `frontend-design-pt-2`

### Context

Route: `app/(dashboard)/admin/outbox-observability/page.tsx`

**Component split (required):**
- `page.tsx` is a **Server Component** entry — handles metadata, layout shell, and initial server-side rendering. It does NOT hold filter state or make client-side fetches.
- All interactive content (filters, event table, row expand, relay health card) lives in a dedicated **Client Component** (e.g., `OutboxObservabilityClient`) marked `'use client'`. This component owns TanStack Query fetch state and filter state changes that trigger API refetch.

The page lives inside the existing `(dashboard)/admin` layout which provides the admin session boundary. The API route enforces authorization independently (WS2). No new auth mechanism is needed.

### Page Structure

**Relay Health Summary Card (top of page)**

Display five metrics from `OutboxRelayHealthDTO`:
- `pending_count` — label: "Pending"
- `oldest_pending_age_seconds` — label: "Oldest Pending Age", rendered as human-readable duration ("3 min ago", "2h 14m", "—" when null)
- `retry_row_count` — label: "Retry Pressure (≥1 attempt)"
- `poison_candidate_count` — label: "Poison Candidates (≥3 attempts)" — visually distinguished (amber/red accent) when > 0
- `processed_count_24h` — label: "Processed (24h)"

**Filter Bar**

Three controls above the event table:
1. `event_type` dropdown: All / buyin.recorded / cashout.recorded / adjustment.recorded / grind.observed / fill.recorded / credit.recorded
2. `status` dropdown: All / Pending / Processed / Failing / Poison Candidate
3. Search input: `event_id`, `aggregate_id`, or `table_id` (UUID); validated client-side before submit (UUID pattern); shows inline error "Must be a valid UUID" if invalid

**Event Table**

Columns (in order):
| Column | Notes |
|--------|-------|
| `event_type` | Text as-is |
| `fact_class` | Badge: "ledger" / "operational" |
| `origin_label` | Badge: "actual" / "estimated" / "observed" / "compliance" — no conditional color upgrade from estimated→actual |
| `table_id` | First 8 chars + "…" (full on hover/expand) |
| `player_id` | Null → "—" (em-dash); present → first 8 chars + "…" |
| `created_at` | Relative time (e.g., "3 min ago") |
| `processed_at` | "pending" badge (muted) when null; relative time when present |
| `delivery_attempts` | Number; row with ≥3 attempts and no `processed_at` gets "poison candidate" badge |
| `last_error` | Truncated to 80 chars with "…" expand inline; empty cell when null |

Rows with `delivery_attempts >= 3 AND processed_at IS NULL` are visually labeled "poison candidate" — a badge on the row, not a routing action.

**Row Expand / Detail Panel**

Clicking a row expands an inline detail section showing:
- All envelope fields: `event_id`, `event_type`, `fact_class`, `origin_label`, `casino_id`, `table_id`, `player_id`, `aggregate_id`
- All relay fields: `created_at`, `processed_at`, `delivery_attempts`, `last_attempted_at`, `last_error` (full text)
- `payload` rendered as formatted JSON (monospace `<pre>` block), limited to first 2000 characters with a truncation note: "(payload truncated at 2000 chars)"
- No action buttons — no replay, retry, repair, or mutation controls anywhere

**No action buttons anywhere on the page.** The surface is read-only. Absence of action buttons must be verified in code review.

**Sidebar / Navigation Link**

Add a link to `/admin/outbox-observability` in `components/layout/app-sidebar.tsx` within the existing admin navigation section. Label: "Outbox Observability". Icon: use an existing icon from the current icon library (e.g., `Activity` or `Radio` from lucide-react).

### Acceptance Criteria (WS3)

- [ ] `page.tsx` is a Server Component entry (no `'use client'`); all interactive content in `OutboxObservabilityClient.tsx` (marked `'use client'`)
- [ ] `OutboxObservabilityClient.tsx` owns filter state, TanStack Query fetch, relay health card, event table, and row-expand
- [ ] Page accessible under existing admin session boundary
- [ ] Relay health card displays all five `OutboxRelayHealthDTO` metrics; `oldest_pending_age_seconds` renders as human-readable duration, null renders as "—"
- [ ] `poison_candidate_count > 0` triggers visual distinction on the health card
- [ ] Event table renders all 9 columns; `player_id` null → "—"
- [ ] Rows with `delivery_attempts >= 3 AND processed_at IS NULL` display "poison candidate" badge — no action button
- [ ] `origin_label` and `fact_class` are rendered as discrete visible labels — no conditional formatting that implies upgrade from `'estimated'` to `'actual'`
- [ ] No component applies any conditional color or label based on an `origin_label` value transition (e.g., grey/amber/green progression) — immutability enforced at display layer (ADR-054 D5)
- [ ] Row expand shows full payload as formatted JSON with 2000-char truncation note
- [ ] No action buttons, replay controls, or mutation triggers anywhere in the component tree
- [ ] Filter controls (event_type, status, search) are wired and trigger API refetch on change
- [ ] Search input validates UUID client-side before submit
- [ ] Sidebar link added in `components/layout/app-sidebar.tsx`
- [ ] `type-check`, `lint`, `build` all exit 0

---

## Workstream 4: Wave Tracker Update (WS4_GOVERNANCE)

**Executor:** `lead-architect`

### Requirements

**`WAVE-2-TRACKER.json`**
- Add Phase `2.3a` entry between phases `2.2` and `2.3`
- PRD-086 build start: set `cursor.active_phase` → `"2.3a"`
- PRD-086 completion: set `cursor.active_phase` → `"2.3"`, `cursor.last_closed_phase` → `"2.3a"`, `cursor.last_closed_prd` → `"PRD-086"`, `cursor.next_action` → "Phase 2.3 PRD — Lifecycle-Aware Completeness Projection"

**`WAVE-2-PROGRESS-TRACKER.md`**
- Add Phase 2.3a row between Phase 2.2 and Phase 2.3 entries, in sync with JSON tracker

### Acceptance Criteria (WS4)

- [ ] Phase `2.3a` entry present in `WAVE-2-TRACKER.json` between `2.2` and `2.3`
- [ ] `cursor.active_phase` = `"2.3a"` at build start; = `"2.3"` at completion
- [ ] `cursor.last_closed_prd` = `"PRD-086"` on completion
- [ ] `WAVE-2-PROGRESS-TRACKER.md` updated in sync
- [ ] Phase 2.5 log-line metrics (`outbox_backlog_size`, `processing_lag_ms`) remain deferred — not added to any tracker entry

---

## DoD Validation

After all phases complete, verify against PRD-086 §8:

**Functionality**
- [ ] `/admin/outbox-observability` renders relay health summary and event table for authenticated admin
- [ ] Workflow action (buy-in, fill, or adjustment) produces a visible outbox row in the surface with correct semantic envelope
- [ ] Events with `delivery_attempts >= 3 AND processed_at IS NULL` are labeled poison candidate
- [ ] `last_error` content is visible in the surface
- [ ] Search by `event_id`, `aggregate_id`, or `table_id` returns matching rows
- [ ] `player_id` null for Class B events; present for Class A events

**Data & Integrity**
- [ ] `origin_label` and `fact_class` rendered exactly as stored (code review + unit test)
- [ ] Zero writes to `finance_outbox`, `processed_messages`, or any other table (code review + integration test)
- [ ] No display-layer `origin_label` upgrade from `'estimated'` to `'actual'`

**Security & Access**
- [ ] Admin page under `(dashboard)/admin` session boundary — unauthenticated requests redirect to login
- [ ] API route returns 401 for absent/invalid session (unit test)
- [ ] API route returns 403 for authenticated non-admin session — route enforces authorization independently of layout guard (unit test)
- [ ] Two-client pattern: session client for auth/role check; service-role client for RPC calls only
- [ ] Both RPCs are SECURITY DEFINER with `service_role`-only grant
- [ ] `casino_id` derived from authenticated `staff` row — not spoofable via query params (code review)

**Testing**
- [ ] Unit test: `OutboxAdminEventDTO` passes `origin_label` and `fact_class` through unchanged
- [ ] Unit test: API route 401 on missing session
- [ ] Unit test: API route 403 on authenticated non-admin session
- [ ] Unit test: API route 200 shape with mocked admin session + mocked RPC responses
- [ ] Integration test: relay health summary returns correct counts for the authenticated casino
- [ ] Integration test: poison candidate count increments for events with `delivery_attempts >= 3`
- [ ] Integration test: `'failing'` filter excludes poison candidates; `'poison'` filter excludes non-poison failing rows

**Operational Readiness**
- [ ] Hard 100-row limit enforced in `rpc_get_outbox_event_page` (`LEAST(p_limit, 100)`)
- [ ] No background job, cron, or relay extension introduced
- [ ] `npm run build` succeeds with no new TS errors

**Documentation**
- [ ] `WAVE-2-TRACKER.json` Phase 2.3a entry present; cursor updated
- [ ] `WAVE-2-PROGRESS-TRACKER.md` updated in sync
- [ ] Phase 2.5 deliverables (`outbox_backlog_size`, `processing_lag_ms`) confirmed absent from this slice
