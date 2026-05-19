---
id: PRD-086
title: Wave 2 Phase 2.3a — Operational Outbox Observability
owner: Engineering
status: Draft
affects: [ADR-052, ADR-054, ADR-056, PRD-081, PRD-085]
created: 2026-05-19
last_review: 2026-05-19
phase: Wave 2 Phase 2.3a (Operational Observability)
pattern: A
http_boundary: true
fib: FIB-H-W2-OUTBOX-OBS-001
fib_version: v0
fib_frozen: 2026-05-19
fib_signoff: Vladimir Ivanov
---

# PRD-086 — Wave 2 Phase 2.3a: Operational Outbox Observability

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Phase slot:** Phase 2.3a — inserted after Phase 2.2 exit (2026-05-19) and before Phase 2.3 (First Consumer Slice)
- **Governing FIB:** FIB-H-W2-OUTBOX-OBS-001 v0 (frozen 2026-05-19, signed by Vladimir Ivanov)
- **Boundary statement:** This PRD makes `finance_outbox` and relay delivery state readable at an internal admin boundary; it does not build projection consumers, write to any authoring store, or process events.

**Summary:** By Phase 2.2's close all five producer paths are wired — `buyin.recorded`, `cashout.recorded`, `adjustment.recorded`, `grind.observed`, `fill.recorded`, and `credit.recorded` all emit atomically to `finance_outbox`. The transport substrate is architecturally proven and I1–I4 certified. What is missing is operational visibility: a technical admin cannot confirm that events are flowing, inspect their semantic labels, or detect stuck rows during live pilot workflows without raw SQL access. This slice builds a read-only internal admin surface that makes the relay state and outbox contents visible, enabling field validation of Phase 2.2 producer behavior before the first projection consumer (Phase 2.3) is built on top of it.

---

## 2. Problem & Goals

### 2.1 Problem

After Phase 2.2, the outbox transport is proven by governance artifacts, migration proofs, and test harness results. But there is no way to confirm it is working correctly during a real pilot workflow without opening a database console. When a fill request is made, a buy-in is recorded, or an adjustment is posted, the `finance_outbox` row exists — but only to `psql`. A technical admin who opens the pilot application and performs a workflow cannot:

- Confirm that the outbox row was emitted with the correct semantic labels (`fact_class`, `origin_label`)
- See whether the relay processed it or if it is stuck with a delivery failure
- Identify rows that are repeatedly retried and approaching poison status
- Verify that `player_id` is NULL on Dependency Events and NOT NULL on Class A events — as the authoring contract requires

This gap means Phase 2.2 producer behavior can only be validated via test-harness assertions, not by observing the system under real operational workflows. Phase 2.3a closes this by delivering a minimal read-only surface that makes authored event state and relay delivery status directly inspectable.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1** — Relay liveness is visible without SQL | A technical admin can confirm the relay is alive, stalled, or accumulating retry pressure from the admin surface alone |
| **G2** — Semantic propagation is visible per event | Any authored event can be inspected to verify `fact_class`, `origin_label`, `table_id`, `player_id`, and `event_type` exactly as stored — no inferred reconstruction |
| **G3** — Stuck and failing events are surfaced | Events with `delivery_attempts >= 3` and `processed_at IS NULL` are visibly classified; a technical admin can see the last error without a DB query |
| **G4** — Phase 2.2 producer behavior is field-validatable | A technical admin can perform a real workflow action (buy-in, fill, adjustment) and immediately see the corresponding authored outbox event in the surface |

### 2.3 Non-Goals

- No dead-letter queue routing or implementation — this slice observes and labels poison candidates only
- No manual replay, repair, retry, or event mutation of any kind
- No write path to `finance_outbox`, `processed_messages`, or any authoring table
- No external notification channel (email, Slack, log aggregation)
- No public API contract for outbox events
- No projection drift repair or reconciliation
- No operator-facing casino floor dashboard changes
- No cross-property or multi-casino observability product
- No analytics platform, charts package, or generalized telemetry framework
- Log-line relay metrics (`outbox_backlog_size`, `processing_lag_ms`) are explicitly deferred to Phase 2.5; this slice delivers an interactive surface, not log output

---

## 3. Users & Use Cases

- **Primary users:** Technical admin / product owner (internal, pilot environment only)

**Top Jobs:**

- As a **technical admin**, I need to see how many outbox events are pending and whether any have failed, so that I can confirm the relay is alive after a deployment or workflow run without opening a database console.
- As a **technical admin**, I need to inspect an individual authored event's semantic envelope (`fact_class`, `origin_label`, `table_id`, `player_id`), so that I can verify the producing RPC set the correct labels as required by ADR-052 and ADR-054.
- As a **technical admin**, I need to see events that are stuck or repeatedly retried alongside their last error, so that I can diagnose a delivery failure without needing raw SQL access.
- As a **technical admin**, I need to search for an event by `event_id`, `aggregate_id`, or `table_id`, so that I can trace a specific workflow action through to its outbox emission and confirm authored propagation and relay processing behavior during field validation.

---

## 4. Scope & Feature List

### 4.1 In Scope

**Relay health summary:**
- Count of pending (unprocessed) outbox rows
- Oldest pending row age (elapsed since `created_at` for oldest `processed_at IS NULL` row)
- Processed row count within the last 24h
- Count of rows with `delivery_attempts >= 1` — proxy for retry pressure
- Count of rows classified as poison candidates (`delivery_attempts >= 3 AND processed_at IS NULL`)

> **Poison candidate classification note:** The `delivery_attempts >= 3` threshold is a pilot operational heuristic only. It is intentionally non-authoritative and may change in later reliability slices (e.g., when a dead-letter queue or bounded retry policy is formally introduced). Do not treat it as a guaranteed failure boundary.

**Event queue display:**
- Tabular view of recent and pending/failing events with columns: `event_type`, `fact_class`, `origin_label`, `table_id`, `player_id` (nullable — shown as "—" for Class B / Dependency Events), `aggregate_id`, `created_at`, `processed_at` (null = pending), `delivery_attempts`, `last_error`
- Poison candidate rows are visually labeled — no routing action, label only
- Events filtered to the authenticated admin's casino scope (casino_id from session)

**Per-event inspection:**
- Full event envelope visible on row selection: all fields including `payload` content as formatted JSON
- `fact_class` and `origin_label` rendered exactly as stored — no upgrade, no inference

**Search / filter:**
- Filter by `event_type` (dropdown from known catalog values)
- Filter by status: all / pending / processed / failing / poison candidate
- Search by `event_id`, `aggregate_id`, or `table_id` (exact match)

**Access control:**
- Surface is internal/admin-only — accessible only within the existing `(dashboard)/admin` area
- API route is service-role, protected by admin session check

### 4.2 Out of Scope

- Any write, replay, retry, or mutation action on `finance_outbox`
- Dead-letter queue routing
- Projection consumers (Phase 2.3)
- External monitoring or alerting integration
- Cross-casino or platform-wide observability
- Log-line relay metrics (`outbox_backlog_size`, `processing_lag_ms`) — Phase 2.5

---

## 5. Requirements

### 5.1 Functional Requirements

- A technical admin can view relay health (pending count, oldest age, retry pressure, poison count) without a database query
- A technical admin can view all recent `finance_outbox` events including their full semantic envelope and relay delivery state
- A technical admin can filter events by type, status, and search by `event_id`, `aggregate_id`, or `table_id`
- Each event row displays `delivery_attempts`, `last_attempted_at`, and `last_error` when present
- Events with `delivery_attempts >= 3 AND processed_at IS NULL` are labeled as poison candidates
- `origin_label` and `fact_class` are rendered exactly as stored — no upgrade, no synthetic reconstruction is permitted at any layer
- `player_id` is rendered as null/absent for Class B events (grind, fill, credit) and as present for Class A events — the NULL attribution rule is visibly enforced
- The surface and its API route perform zero writes to `finance_outbox` or any other table
- The surface is accessible only to authenticated admin sessions; unauthenticated requests return 401

### 5.2 Non-Functional Requirements

- The admin page is protected by the existing `(dashboard)/admin` session boundary — no new auth mechanism
- The `finance_outbox` read path must route through a SECURITY DEFINER RPC — no direct PostgREST DML against `finance_outbox` from the authenticated role (ADR-054 R3, ADR-056)
- The API route uses the service-role Supabase client (same pattern as `outbox-relay/route.ts`) — not the authenticated client
- The surface renders at most 100 events per query to prevent large read pressure in the pilot DB; pagination is not required but a hard limit is
- `origin_label` immutability (ADR-054 D5) applies to the display layer: no component may apply conditional formatting that implies an upgrade from `'estimated'` to `'actual'`
- Page response time < 2s for the relay health summary under typical pilot load (< 1000 rows in `finance_outbox`)

> Architecture authority: ADR-054 (propagation + surface contract), ADR-052 (discriminator fields), ADR-056 (write-path governance). Schema: `types/database.types.ts` (`finance_outbox`, `processed_messages`).

---

## 6. UX / Flow Overview

**Flow 1: Relay health check after deployment**
1. Technical admin navigates to `/admin/outbox-observability` in the existing admin area
2. Page loads relay health summary card: pending count, oldest pending age, retry row count, poison candidate count
3. Admin confirms relay is alive (pending count low, no poison candidates) or identifies a stall (pending count growing, oldest age high)
4. No action required — admin reads, does not interact beyond inspection

**Flow 2: Field validation after a real workflow action**
1. Technical admin performs a workflow action in the pilot app: a buy-in, fill, adjustment, or grind observation
2. Admin navigates to `/admin/outbox-observability` and sees the new outbox row appear in the queue with correct `event_type`, `fact_class`, `origin_label`, `table_id`
3. Admin confirms `player_id` is NULL for fill/credit/grind and NOT NULL for buy-in/adjustment
4. Admin sees `processed_at` set after the next relay cycle (Vercel cron, every minute)

**Flow 3: Diagnosing a stuck event**
1. Admin opens the event queue and filters by status = "failing" or "poison candidate"
2. Rows with `delivery_attempts >= 3` and `last_error` are visible with error detail
3. Admin reads `last_error` to identify the root cause (e.g., consumer exception, RPC error)
4. Admin records the finding — no repair action available in this slice

**Flow 4: Tracing a specific event**
1. Admin searches by `aggregate_id` (PFT row id or fill row id) retrieved from another admin tool or log
2. Surface shows the single matching outbox row with full semantic envelope including `payload`
3. Admin confirms the event was authored correctly and the relay processed it

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **Phase 2.2 exit** — All six producers wired (`buyin.recorded`, `cashout.recorded`, `adjustment.recorded`, `grind.observed`, `fill.recorded`, `credit.recorded`). This slice is only meaningful once producers exist. Met 2026-05-19.
- **`finance_outbox` Wave 2 DDL** — Fields `delivery_attempts`, `last_attempted_at`, `last_error` must be present. Confirmed in migration `20260511134129` (Wave 2 transform).
- **`rpc_acknowledge_outbox_delivery`** — This RPC populates `last_error` and `processed_at`. Must be live before the surface has meaningful failure state to display. Confirmed in migration `20260518014252`.
- **Existing admin route boundary** — `app/(dashboard)/admin/` area and its session protection must be in place. Confirmed as live (anomaly-detection, alerts, loyalty, reports, settings all present).
- **`CRON_SECRET` env var** — Used for the relay route pattern; the new admin API route will use admin session auth instead (not CRON_SECRET), but the service client pattern is identical.

### 7.2 Risks & Open Questions

- **RPC result shape** — `rpc_get_outbox_admin_status` is a new DB function; its SETOF return type and column set must be defined precisely so `npm run db:types-local` generates correct TypeScript types. Resolved in WS1.
- **Casino scoping** — The surface must only show events for the admin's casino. The RPC must accept `p_casino_id` derived from the session (not spoofable). Resolved by having the API route derive casino_id from the session context, consistent with ADR-024.
- **Payload display** — `finance_outbox.payload` is JSONB. Large payloads could be unwieldy. The surface renders payload as formatted JSON, limited to the first 2000 characters with a truncation note — consistent with `last_error`'s `VARCHAR(2000)` bound.
- **Phase 2.5 boundary** — Phase 2.5 delivers log-line observability in the relay worker (`outbox_backlog_size`, `processing_lag_ms` log lines). This PRD delivers an interactive admin surface. The two do not conflict. The relay route's existing `{processed, failed, backlog}` JSON response is the relay-cycle summary; this surface reads DB state directly. The PRD and Phase 2.5 must not duplicate deliverables.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] A technical admin can navigate to `/admin/outbox-observability` and see relay health summary (pending count, oldest pending age, retry pressure, poison candidate count) without a database query
- [ ] A technical admin can perform a real workflow action (buy-in, fill, or adjustment in the pilot UI) and see the corresponding `finance_outbox` row appear in the surface with correct `event_type`, `fact_class`, `origin_label`, `table_id`, and `player_id`
- [ ] Events with `delivery_attempts >= 3 AND processed_at IS NULL` are visibly labeled as poison candidates
- [ ] A row with `last_error` set displays the error detail in the surface
- [ ] Search by `event_id`, `aggregate_id`, or `table_id` returns the matching row(s)
- [ ] `player_id` is rendered as absent/null for Class B events (`grind.observed`, `fill.recorded`, `credit.recorded`) and present for Class A events (`buyin.recorded`, `cashout.recorded`, `adjustment.recorded`)

**Data & Integrity**
- [ ] `origin_label` and `fact_class` are rendered exactly as stored — no upgrade, no inference is visible in any rendered row
- [ ] The surface performs zero writes to `finance_outbox`, `processed_messages`, or any other table (verified by code review and integration test)
- [ ] No component applies conditional formatting or labeling that implies authority upgrade from `'estimated'` to `'actual'`

**Security & Access**
- [ ] The admin page is accessible only within the `(dashboard)/admin` session boundary — unauthenticated requests redirect to login
- [ ] The API route returns 401 for requests without a valid admin session
- [ ] `finance_outbox` reads route through a SECURITY DEFINER RPC — no direct PostgREST DML from the authenticated role
- [ ] The RPC accepts `p_casino_id` derived from session context — not spoofable by caller (ADR-024 pattern)

**Testing**
- [ ] Unit test: `OutboxAdminEventDTO` does not include any synthetic or inferred fields — `origin_label` and `fact_class` pass through from the DB row unchanged
- [ ] Unit test: API route returns 401 when admin session is absent
- [ ] Integration test: API route with valid admin session returns relay health summary and event rows for the correct casino
- [ ] Integration test: event with `delivery_attempts >= 3` is present in the poison candidate count

**Operational Readiness**
- [ ] The surface renders under 2 seconds for typical pilot load (< 1000 rows in `finance_outbox`)
- [ ] The query hard-limit of 100 rows is enforced in the RPC — no unbounded reads
- [ ] No new background job, cron, or relay extension introduced — surface is purely read-on-demand

**Documentation**
- [ ] `WAVE-2-TRACKER.json` updated: Phase `2.3a` entry added between `2.2` and `2.3`; `cursor.active_phase` updated to `2.3a` on start, `2.3` on completion
- [ ] `WAVE-2-PROGRESS-TRACKER.md` updated in sync
- [ ] Phase 2.5 boundary preserved: log-line relay metrics (`outbox_backlog_size`, `processing_lag_ms`) remain deferred to Phase 2.5 — no duplication in this slice

---

## 9. Related Documents

- **Governing FIB:** `docs/issues/gaps/financial-data-distribution-standard/wave-2/phase-2.3a/FIB-H-W2-OUTBOX-OBS-001-operational-outbox-observability.md`
- **Wave 2 tracker:** `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-TRACKER.json`
- **Wave 2 rollout map:** `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-ROLLOUT-MAP.md`
- **Outbox knowledge base:** `docs/issues/gaps/financial-data-distribution-standard/wave-2/outbox-knowledge-base.md`
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **Schema / Types:** `types/database.types.ts` (source of truth)
- **ADR-052:** Financial Fact Model (discriminator fields, class attribution rules)
- **ADR-054:** Financial Event Propagation & Surface Contract (`origin_label` immutability, write-path governance)
- **ADR-056:** Outbox write-path governance (SECURITY DEFINER enforcement)
- **Prerequisite PRDs:** PRD-081 (transport substrate), PRD-083 (Phase 2.1 adjustment producer), PRD-085 (Phase 2.2 fill/credit producers)
- **Next PRD:** Phase 2.3 — Lifecycle-Aware Completeness Projection (DEC-1 resolution)

---

## Appendix A: Schema Reference

### `finance_outbox` — fields used by this PRD

```sql
-- Wave 2 DDL (migration 20260511134129). Fields available to the admin surface:
-- Envelope (immutable after insert — ADR-054 D5):
--   event_id          UUID NOT NULL PRIMARY KEY  -- UUIDv7 ordering authority
--   event_type        TEXT NOT NULL              -- 'buyin.recorded', 'adjustment.recorded', etc.
--   fact_class        TEXT NOT NULL CHECK (IN ('ledger','operational'))
--   origin_label      TEXT NOT NULL CHECK (IN ('actual','estimated','observed','compliance'))
--   casino_id         UUID NOT NULL              -- casino scoping
--   table_id          UUID NOT NULL              -- table-first anchoring
--   player_id         UUID NULL                  -- NULL for Class B / Dependency Events
--   aggregate_id      UUID NOT NULL              -- PK of authoring row
--   payload           JSONB NOT NULL             -- event-specific domain content
--   created_at        TIMESTAMPTZ NOT NULL
-- Relay lifecycle (mutable by relay RPCs only):
--   processed_at      TIMESTAMPTZ NULL           -- set on successful delivery
--   delivery_attempts INTEGER NOT NULL DEFAULT 0 -- incremented by rpc_claim_outbox_batch
--   last_attempted_at TIMESTAMPTZ NULL
--   last_error        VARCHAR(2000) NULL         -- set by rpc_acknowledge_outbox_delivery on failure
```

### New RPC: `rpc_get_outbox_admin_status`

```sql
-- New SECURITY DEFINER RPC (WS1 migration).
-- Provides two result sets in a single call is impractical via PostgREST;
-- instead, provide two separate RPCs:
--   rpc_get_outbox_relay_health(p_casino_id UUID)     → relay health summary row
--   rpc_get_outbox_event_page(p_casino_id UUID,       → paginated event rows
--     p_event_type TEXT DEFAULT NULL,
--     p_status TEXT DEFAULT 'all',                    -- 'all'|'pending'|'processed'|'failing'|'poison'
--     p_search_id UUID DEFAULT NULL,                  -- event_id | aggregate_id | table_id
--     p_limit INT DEFAULT 100)
--
-- Both: SECURITY DEFINER SET search_path = '', GRANT EXECUTE TO service_role only.
-- API route derives p_casino_id from admin session — never from caller input.
```

### New DTOs: `OutboxAdminEventDTO` and `OutboxRelayHealthDTO`

`OutboxAdminEventDTO` is defined as a **standalone type** — it does not extend or intersect `FinancialOutboxEventDTO`. The consumer-facing DTO is a frozen contract that deliberately excludes relay lifecycle fields; coupling the admin DTO to it via `&` would create a hidden dependency that could drift as the consumer contract evolves independently. The admin DTO is defined separately from the same underlying `FinancialOutboxRow` source.

```ts
// services/player-financial/dtos.ts addition
// Both DTOs derive directly from the database row type — standalone, not extending
// FinancialOutboxEventDTO. This prevents consumer/observability coupling drift:
// FinancialOutboxEventDTO is the frozen consumer contract; OutboxAdminEventDTO is
// the observability contract. They share a DB source but evolve independently.
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
  oldest_pending_age_seconds: number | null;  // null when no pending rows
  retry_row_count: number;        // delivery_attempts >= 1 AND processed_at IS NULL
  poison_candidate_count: number; // delivery_attempts >= 3 AND processed_at IS NULL
  processed_count_24h: number;    // processed_at IS NOT NULL AND processed_at > NOW() - INTERVAL '24h'
};
```

---

## Appendix B: Implementation Plan

Sequential — WS1 must complete before WS2; WS2 before WS3.

### WS1: Admin Read RPCs + DTO (P0)

Skill: `backend-service-builder`

- [ ] Author migration `YYYYMMDDHHMMSS_wave2_outbox_admin_read_rpcs.sql` (timestamp via `date +"%Y%m%d%H%M%S"`) containing:
  - `rpc_get_outbox_relay_health(p_casino_id UUID)` — SECURITY DEFINER, returns relay health summary (pending count, oldest pending age, retry row count, poison candidate count, processed count last 24h)
  - `rpc_get_outbox_event_page(p_casino_id UUID, p_event_type TEXT DEFAULT NULL, p_status TEXT DEFAULT 'all', p_search_id UUID DEFAULT NULL, p_limit INT DEFAULT 100)` — SECURITY DEFINER, returns ordered event rows with full envelope + relay lifecycle fields; hard-caps at 100
  - Both: `SET search_path = ''`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO service_role`
  - Poison candidate definition: `delivery_attempts >= 3 AND processed_at IS NULL`
  - Status filter mapping: `'pending'` → `processed_at IS NULL AND delivery_attempts < 3`; `'processed'` → `processed_at IS NOT NULL`; `'failing'` → `processed_at IS NULL AND delivery_attempts >= 1`; `'poison'` → `delivery_attempts >= 3 AND processed_at IS NULL`
- [ ] Run `npm run db:types-local` after migration — exit 0
- [ ] Add `OutboxAdminEventDTO` and `OutboxRelayHealthDTO` to `services/player-financial/dtos.ts`
- [ ] Unit test: `OutboxAdminEventDTO` includes `delivery_attempts`, `last_attempted_at`, `last_error` — absent from base `FinancialOutboxEventDTO`
- [ ] type-check, lint exit 0

### WS2: Internal Admin API Route (P0)

Skill: `api-builder`

- [ ] Create `app/api/internal/outbox-observability/route.ts` — GET handler (read-only)
- [ ] Auth: verify admin session via `createServerClient` + check `(dashboard)/admin` session guard (not CRON_SECRET — this is an admin browser request, not a cron job)
- [ ] Derive `casino_id` from the authenticated admin session — never from query params
- [ ] Call `rpc_get_outbox_relay_health` and `rpc_get_outbox_event_page` via service-role client
- [ ] Accept query params: `event_type` (optional), `status` (optional, default `'all'`), `search_id` (optional UUID)
- [ ] Return `{ health: OutboxRelayHealthDTO, events: OutboxAdminEventDTO[] }`
- [ ] Return 401 for missing/invalid session; return 400 for invalid `search_id` (non-UUID)
- [ ] Unit test: 401 when session absent
- [ ] Unit test: returns correct shape with mocked RPC responses
- [ ] type-check, lint exit 0

### WS3: Admin Outbox Page (P0)

Skill: `frontend-design-pt-2`

- [ ] Create `app/(dashboard)/admin/outbox-observability/page.tsx`
- [ ] Relay health summary card at top: pending count, oldest pending age (human-readable: "3 min ago"), retry row count, poison candidate count, processed count (last 24h)
- [ ] Event table with columns: `event_type`, `fact_class`, `origin_label`, `table_id` (truncated UUID), `player_id` (null → "—"), `created_at` (relative), `processed_at` ("pending" if null), `delivery_attempts`, `last_error` (truncated to 80 chars with expand)
- [ ] Poison candidate rows: visually distinguishable label (e.g., badge "poison candidate") — no action button
- [ ] `origin_label` and `fact_class` rendered as discrete visible labels — no hiding in metadata or tooltips
- [ ] Filter controls: event_type dropdown (buyin.recorded / cashout.recorded / adjustment.recorded / grind.observed / fill.recorded / credit.recorded / all), status filter (all / pending / processed / failing / poison), search input (event_id / aggregate_id / table_id — validated as UUID before submit)
- [ ] Row click / expand: shows full `payload` as formatted JSON (max 2000 chars with truncation note) and all envelope fields
- [ ] No action buttons of any kind — surface is read-only; no replay, retry, or repair UI
- [ ] Add link to `/admin/outbox-observability` in the existing admin navigation (sidebar or admin page index)
- [ ] type-check, lint, build exit 0

### WS4: Tracker Update (P1)

- [ ] Add Phase `2.3a` entry to `WAVE-2-TRACKER.json` between phases `2.2` and `2.3`
- [ ] Update `cursor.active_phase` → `"2.3a"` on PRD-086 build start
- [ ] Update `WAVE-2-PROGRESS-TRACKER.md` in sync
- [ ] On completion: update `cursor.active_phase` → `"2.3"`, `cursor.last_closed_phase` → `"2.3a"`, `cursor.last_closed_prd` → `"PRD-086"`, `cursor.next_action` → Phase 2.3 PRD

---

## Appendix C: FIB-H Compliance Checklist

| Check | Status |
|---|---|
| Primary change class: Observability (not Transport / Semantics / Presentation / Enforcement) | ✅ |
| Coverage mode: Representative — one admin route, one API endpoint, two RPCs | ✅ |
| One-line boundary present | ✅ (§1 boundary statement) |
| Adjacent consequence ledger: dead-letter, replay, projection drift repair all deferred to §J of FIB-H / §2.3 Non-Goals of this PRD | ✅ |
| Atomicity test: PRD ships coherently; deferred work (Phase 2.3 consumers, Phase 2.5 log lines) begins without amending this PRD | ✅ |
| No write path to `finance_outbox` or authoring stores | ✅ (enforced in §5.1, DoD, WS2, WS3) |
| `origin_label` immutability upheld at display layer | ✅ (§5.2 NF, DoD) |
| FIB §L open questions resolved | ✅ (surface placement → `/admin/outbox-observability`; access path → SECURITY DEFINER RPC + service-role route; poison-row → `delivery_attempts >= 3` threshold label) |

---

## Appendix D: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v0 | 2026-05-19 | Vladimir Ivanov / d3lt | Initial draft |
