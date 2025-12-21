---
id: INT-002
title: Event Catalog
version: 1.1.0
status: Active
effective: 2025-12-20
cross_references: [ARCH-SRM, ADR-004]
---

# INT-002 Event Catalog

**Status**: Active (updated for EXEC-VSE-001)
**Effective**: 2025-12-20
**Cross-Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md), [REAL_TIME_EVENTS_MAP.md](../25-api-data/REAL_TIME_EVENTS_MAP.md), [ADR-004-real-time-strategy.md](../80-adrs/ADR-004-real-time-strategy.md)

> **Updated 2025-12-06**: Visit Service Evolution changes
> - RatingSlip events: `visit_id` is now required (NOT NULL), `player_id` removed (derived from visit)
> - Added VisitService events for visit lifecycle

## Purpose

Centralize domain event contracts, channel naming, payload schemas, and ownership across services. Events enable real-time UI updates, cross-service coordination, and audit trails while maintaining bounded context integrity.

---

## Channel Naming Convention

**Pattern**: `{casino_id}` for collection/list feeds; `{casino_id}:{resource_id}` for detail views

**Scoping Rules**:
- Realtime predicates MUST include `casino_id` and role checks
- Channel joins are denied unless the caller's role matches the SRM RLS policy (e.g., pit_boss, admin)
- Hot domains (RatingSlip, TableContext telemetry) broadcast state transitions or periodic snapshots (1-5s) instead of every row mutation to avoid over-subscription

**Reference**: [SEC-001-rls-policy-matrix.md](../30-security/SEC-001-rls-policy-matrix.md)

---

## Event Contract Policy

**Rules**:
- Event keys MUST mirror table FKs and types in the SRM (no ad-hoc string keys)
- Payload structure MUST be stable across emit points (Server Actions + Realtime)
- Event names follow `{domain}.{action}` pattern (e.g., `rating_slip.updated`, `loyalty.ledger_appended`)
- All events include `casino_id`, relevant IDs, and `at` timestamp
- Idempotent payloads required (safe for replay/duplicate delivery)

**Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md) (Cross-Context Consumption Rules)

---

## Event Catalog by Service

### VisitService Events

> **NEW in EXEC-VSE-001**: Visit lifecycle events for real-time dashboard updates.

#### `visit.created`

**Producer**: VisitService
**Trigger**: New visit started (any visit_kind)
**Channel**: `{casino_id}` (list feed)

**Payload Schema**:
```typescript
{
  event: "visit.created",
  visit_id: string,        // uuid
  casino_id: string,       // uuid
  player_id: string | null, // uuid (NULL for ghost visits)
  visit_kind: "reward_identified" | "gaming_identified_rated" | "gaming_ghost_unrated",
  started_at: string,      // ISO 8601 timestamp
  at: string               // ISO 8601 timestamp
}
```

**Consumers**:
- UI (visit list refresh, floor dashboard)

---

#### `visit.closed`

**Producer**: VisitService
**Trigger**: Visit ended via Server Action
**Channel**: `{casino_id}` (list feed), `{casino_id}:{visit_id}` (detail view)

**Payload Schema**:
```typescript
{
  event: "visit.closed",
  visit_id: string,        // uuid
  casino_id: string,       // uuid
  player_id: string | null, // uuid (NULL for ghost visits)
  visit_kind: "reward_identified" | "gaming_identified_rated" | "gaming_ghost_unrated",
  ended_at: string,        // ISO 8601 timestamp
  at: string               // ISO 8601 timestamp
}
```

**Consumers**:
- UI (visit status update)
- Loyalty (session-end reward trigger for gaming_identified_rated)

---

#### `visit.converted`

**Producer**: VisitService
**Trigger**: Reward visit converted to gaming visit
**Channel**: `{casino_id}` (list feed), `{casino_id}:{visit_id}` (detail view)

**Payload Schema**:
```typescript
{
  event: "visit.converted",
  visit_id: string,        // uuid
  casino_id: string,       // uuid
  player_id: string,       // uuid (always identified for conversion)
  from_kind: "reward_identified",
  to_kind: "gaming_identified_rated",
  at: string               // ISO 8601 timestamp
}
```

**Consumers**:
- UI (visit status update)

---

### RatingSlipService Events

> **Updated EXEC-VSE-001**: `visit_id` is now required (NOT NULL). `player_id` removed - derive from visit.

#### `rating_slip.created`

**Producer**: RatingSlipService
**Trigger**: New rating slip created via Server Action
**Channel**: `{casino_id}` (list feed)
**Reference**: [SRM §RatingSlipService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#ratingslipservice-telemetry-context)

**Payload Schema**:
```typescript
{
  event: "rating_slip.created",
  rating_slip_id: string,  // uuid
  casino_id: string,       // uuid
  visit_id: string,        // uuid (NOT NULL - always anchored to visit)
  table_id: string,        // uuid (NOT NULL)
  status: "open",
  at: string               // ISO 8601 timestamp
}
```

**Consumers**:
- UI (rating slip list refresh via React Query invalidation)

**Cache Invalidation**:
- Invalidate: `['rating-slip', 'list', casino_id]`
- Invalidate: `['rating-slip', 'by-visit', visit_id]` (batched, 250-500ms)

---

#### `rating_slip.updated`

**Producer**: RatingSlipService
**Trigger**: Rating slip telemetry updated (average_bet, duration, etc.)
**Channels**:
- `{casino_id}` (list feed)
- `{casino_id}:{rating_slip_id}` (detail view)
**Reference**: [SRM §RatingSlipService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#ratingslipservice-telemetry-context)

**Payload Schema**:
```typescript
{
  event: "rating_slip.updated",
  rating_slip_id: string,  // uuid
  casino_id: string,       // uuid
  visit_id: string,        // uuid (NOT NULL - for player lookup)
  average_bet: number | null,
  minutes_played: number,
  game_type: "blackjack" | "poker" | "roulette" | "baccarat",
  status: "open" | "paused" | "closed",
  at: string               // ISO 8601 timestamp
}
```

**Consumers**:
- **Loyalty** (triggers reward evaluation for mid-session rewards; must check `visit.visit_kind = 'gaming_identified_rated'`)
- UI (rating slip detail refresh, list updates)

**Cache Invalidation**:
- `setQueryData(['rating-slip', 'detail', rating_slip_id], payloadOrRefetch)`
- Invalidate: `['rating-slip', 'by-visit', visit_id]` (batched, 250-500ms, refetchType: 'active')

---

#### `rating_slip.closed`

**Producer**: RatingSlipService
**Trigger**: Rating slip closed via Server Action
**Channels**:
- `{casino_id}` (list feed)
- `{casino_id}:{rating_slip_id}` (detail view)
**Reference**: [SRM §RatingSlipService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#ratingslipservice-telemetry-context)

**Payload Schema**:
```typescript
{
  event: "rating_slip.closed",
  rating_slip_id: string,  // uuid
  casino_id: string,       // uuid
  visit_id: string,        // uuid (NOT NULL - for player lookup)
  end_time: string,        // ISO 8601 timestamp
  total_duration: number,  // seconds
  average_bet: number | null,
  status: "closed",
  at: string               // ISO 8601 timestamp
}
```

**Consumers**:
- Loyalty (triggers session-end rewards; must check `visit.visit_kind = 'gaming_identified_rated'`)
- UI (rating slip status update)

**Cache Invalidation**:
- `setQueryData(['rating-slip', 'detail', rating_slip_id], payloadOrRefetch)`
- Invalidate: `['rating-slip', 'list', casino_id]`

---

### LoyaltyService Events

#### `loyalty.ledger_appended`

**Producer**: LoyaltyService (via `rpc_issue_mid_session_reward`)
**Trigger**: Reward issued (mid-session, session-end, manual adjustment, etc.)
**Channel**: `{casino_id}` (list feed), `{casino_id}:{player_id}` (player-specific)
**Reference**: [SRM §LoyaltyService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#loyaltyservice-reward-context)

**Payload Schema**:
```typescript
{
  event: "loyalty.ledger_appended",
  ledger_id: string,           // uuid
  player_id: string,           // uuid
  casino_id: string,           // uuid
  points_earned: number,       // int (can be negative for corrections)
  reason: "mid_session" | "session_end" | "manual_adjustment" | "promotion" | "correction",
  rating_slip_id: string | null, // uuid (optional source)
  visit_id: string | null,      // uuid (optional session context)
  at: string                    // ISO 8601 timestamp
}
```

**Consumers**:
- UI (player loyalty balance update, ledger history refresh)

**Cache Invalidation**:
- Invalidate: `['loyalty', 'ledger', 'by-player', player_id]` (batched)
- `setQueryData(['player', 'loyalty', 'balance', player_id, casino_id], updater)` (if cached)

---

#### `loyalty.balance_updated`

**Producer**: LoyaltyService
**Trigger**: Player loyalty balance changed
**Channel**: `{casino_id}:{player_id}`
**Reference**: [SRM §LoyaltyService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#loyaltyservice-reward-context) (implicit from ledger operations)

**Payload Schema**:
```typescript
{
  event: "loyalty.balance_updated",
  player_id: string,        // uuid
  casino_id: string,        // uuid
  balance: number,          // int (new balance)
  balance_delta: number,    // int (change amount)
  tier: string | null,      // loyalty tier
  at: string                // ISO 8601 timestamp
}
```

**Consumers**:
- UI (real-time balance display)

**Cache Invalidation**:
- `setQueryData(['player', 'loyalty', 'balance', player_id, casino_id], payload.balance)`

---

### TableContextService Events

#### `table.inventory_open`

**Producer**: TableContextService (via `rpc_log_table_inventory_snapshot`)
**Trigger**: Table inventory opened (shift start)
**Channel**: `{casino_id}`, `{casino_id}:{table_id}`
**Reference**: [SRM §TableContextService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#tablecontextservice-operational-telemetry-context)

**Payload Schema**:
```typescript
{
  event: "table.inventory_open",
  casino_id: string,        // uuid
  table_id: string,         // uuid
  snapshot_id: string,      // uuid
  chipset: Record<string, number>, // denomination → count
  counted_by: string | null, // staff uuid
  verified_by: string | null, // staff uuid
  at: string                 // ISO 8601 timestamp
}
```

**Consumers**:
- UI (table inventory dashboard)
- Audit (custody tracking)

**Cache Invalidation**:
- Invalidate: `['table-context', 'inventory', casino_id]`
- Invalidate: `['table-context', 'table', table_id, 'inventory']`

---

#### `table.inventory_close`

**Producer**: TableContextService
**Trigger**: Table inventory closed (shift end)
**Channel**: `{casino_id}`, `{casino_id}:{table_id}`
**Reference**: [SRM §TableContextService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#tablecontextservice-operational-telemetry-context)

**Payload Schema**:
```typescript
{
  event: "table.inventory_close",
  casino_id: string,         // uuid
  table_id: string,          // uuid
  snapshot_id: string,       // uuid
  chipset: Record<string, number>,
  discrepancy_cents: number, // variance from expected
  counted_by: string | null,
  verified_by: string | null,
  at: string
}
```

**Consumers**:
- UI (table close workflow, discrepancy alerts)
- Finance (reconciliation)
- Audit (custody tracking)

**Cache Invalidation**:
- Invalidate: `['table-context', 'inventory', casino_id]`
- Invalidate: `['table-context', 'table', table_id, 'inventory']`

---

#### `table.inventory_rundown_recorded`

**Producer**: TableContextService
**Trigger**: Mid-shift inventory rundown
**Channel**: `{casino_id}:{table_id}`
**Reference**: [SRM §TableContextService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#tablecontextservice-operational-telemetry-context)

**Payload Schema**:
```typescript
{
  event: "table.inventory_rundown_recorded",
  casino_id: string,
  table_id: string,
  snapshot_id: string,
  chipset: Record<string, number>,
  note: string | null,
  at: string
}
```

**Consumers**:
- UI (rundown history)
- Audit (custody timeline)

---

#### `table.fill_requested`

**Producer**: TableContextService (via `rpc_request_table_fill`)
**Trigger**: Table fill request initiated
**Channel**: `{casino_id}`, `{casino_id}:{table_id}`
**Reference**: [SRM §TableContextService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#tablecontextservice-operational-telemetry-context)

**Payload Schema**:
```typescript
{
  event: "table.fill_requested",
  casino_id: string,
  table_id: string,
  request_id: string,        // idempotency key
  amount_cents: number,
  chipset: Record<string, number>,
  requested_by: string | null, // staff uuid
  slip_no: string | null,
  at: string
}
```

**Consumers**:
- UI (fill request queue, table status)
- Cage (fill fulfillment workflow)

**Cache Invalidation**:
- Invalidate: `['table-context', 'fills', casino_id]`
- Invalidate: `['table-context', 'table', table_id, 'custody']`

---

#### `table.fill_completed`

**Producer**: TableContextService
**Trigger**: Table fill delivered and received
**Channel**: `{casino_id}`, `{casino_id}:{table_id}`
**Reference**: [SRM §TableContextService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#tablecontextservice-operational-telemetry-context)

**Payload Schema**:
```typescript
{
  event: "table.fill_completed",
  casino_id: string,
  table_id: string,
  request_id: string,
  amount_cents: number,
  delivered_by: string | null, // staff uuid
  received_by: string | null,  // staff uuid
  at: string
}
```

**Consumers**:
- UI (fill confirmation, table inventory update)
- Audit (custody timeline)

**Cache Invalidation**:
- Invalidate: `['table-context', 'fills', casino_id]`
- Invalidate: `['table-context', 'table', table_id, 'custody']`

---

#### `table.credit_requested`

**Producer**: TableContextService (via `rpc_request_table_credit`)
**Trigger**: Table credit request initiated (chips to cage)
**Channel**: `{casino_id}`, `{casino_id}:{table_id}`
**Reference**: [SRM §TableContextService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#tablecontextservice-operational-telemetry-context)

**Payload Schema**:
```typescript
{
  event: "table.credit_requested",
  casino_id: string,
  table_id: string,
  request_id: string,
  amount_cents: number,
  chipset: Record<string, number>,
  authorized_by: string | null, // staff uuid
  at: string
}
```

**Consumers**:
- UI (credit request queue)
- Cage (credit fulfillment)

---

#### `table.credit_completed`

**Producer**: TableContextService
**Trigger**: Table credit delivered to cage
**Channel**: `{casino_id}`, `{casino_id}:{table_id}`
**Reference**: [SRM §TableContextService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#tablecontextservice-operational-telemetry-context)

**Payload Schema**:
```typescript
{
  event: "table.credit_completed",
  casino_id: string,
  table_id: string,
  request_id: string,
  amount_cents: number,
  sent_by: string | null,     // staff uuid
  received_by: string | null, // staff uuid (cage)
  at: string
}
```

**Consumers**:
- UI (credit confirmation, table inventory update)
- Audit (custody timeline)

---

#### `table.drop_removed`

**Producer**: TableContextService (via `rpc_log_table_drop`)
**Trigger**: Drop box removed from table
**Channel**: `{casino_id}`, `{casino_id}:{table_id}`
**Reference**: [SRM §TableContextService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#tablecontextservice-operational-telemetry-context)

**Payload Schema**:
```typescript
{
  event: "table.drop_removed",
  casino_id: string,
  table_id: string,
  drop_box_id: string,
  seal_no: string | null,
  gaming_day: string,        // date (YYYY-MM-DD)
  seq_no: number,
  removed_by: string | null, // staff uuid
  witnessed_by: string | null, // staff uuid
  at: string
}
```

**Consumers**:
- UI (drop tracking dashboard)
- Audit (custody timeline)
- Finance (drop count reconciliation)

---

#### `table.drop_delivered`

**Producer**: TableContextService
**Trigger**: Drop box delivered to count room
**Channel**: `{casino_id}`, `{casino_id}:{table_id}`
**Reference**: [SRM §TableContextService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#tablecontextservice-operational-telemetry-context)

**Payload Schema**:
```typescript
{
  event: "table.drop_delivered",
  casino_id: string,
  table_id: string,
  drop_box_id: string,
  delivered_at: string,      // ISO 8601 timestamp
  delivered_scan_at: string | null, // ISO 8601 timestamp
  at: string
}
```

**Consumers**:
- UI (drop custody timeline, SLA tracking)
- Finance (count room readiness)

---

#### `table.activated`

**Producer**: TableContextService
**Trigger**: Table activated (brought into service)
**Channel**: `{casino_id}`
**Reference**: [SRM §TableContextService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#tablecontextservice-operational-telemetry-context)

**Payload Schema**:
```typescript
{
  event: "table.activated",
  casino_id: string,
  table_id: string,
  label: string,
  type: "blackjack" | "poker" | "roulette" | "baccarat",
  pit: string | null,
  at: string
}
```

**Consumers**:
- UI (floor view, table management)
- FloorLayout (table status sync)

---

#### `table.deactivated`

**Producer**: TableContextService
**Trigger**: Table deactivated (taken out of service)
**Channel**: `{casino_id}`
**Reference**: [SRM §TableContextService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#tablecontextservice-operational-telemetry-context)

**Payload Schema**:
```typescript
{
  event: "table.deactivated",
  casino_id: string,
  table_id: string,
  at: string
}
```

**Consumers**:
- UI (floor view, table management)

---

### FloorLayoutService Events

#### `floor_layout.activated`

**Producer**: FloorLayoutService (via `rpc_activate_floor_layout`)
**Trigger**: Floor layout version activated
**Channel**: `{casino_id}`
**Reference**: [SRM §FloorLayoutService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#floorlayoutservice-design--activation-context)

**Payload Schema**:
```typescript
{
  event: "floor_layout.activated",
  casino_id: string,
  layout_id: string,            // uuid
  layout_version_id: string,    // uuid
  activated_by: string,          // staff uuid
  activated_at: string,          // ISO 8601 timestamp
  pits: Array<{
    pit_id: string,
    label: string,
    sequence: number
  }>,
  table_slots: Array<{
    slot_id: string,
    slot_label: string,
    game_type: "blackjack" | "poker" | "roulette" | "baccarat",
    pit_id: string | null,
    preferred_table_id: string | null
  }>,
  at: string
}
```

**Consumers**:
- **TableContext** (listens for activation to reconcile `gaming_table` state - activate/deactivate tables according to slots)
- **Performance** (layout metadata for dashboards)
- UI (floor visualization update)

**Cache Invalidation**:
- Invalidate: `['floor-layout', 'active', casino_id]`
- Invalidate: `['table-context', 'tables', casino_id]` (table-to-pit assignments)

**SRM Note**: "TableContext listens and updates `gaming_table` state (activate/deactivate tables according to slots)."

---

### PlayerFinancialService Events

#### `finance.transaction_created`

**Producer**: PlayerFinancialService (via `rpc_create_financial_txn`)
**Trigger**: Financial transaction recorded
**Channel**: `{casino_id}`, `{casino_id}:{player_id}`
**Reference**: [SRM §PlayerFinancialService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#playerfinancialservice-finance-context--implemented)

**Payload Schema**:
```typescript
{
  event: "finance.transaction_created",
  transaction_id: string,    // uuid
  player_id: string,         // uuid
  casino_id: string,         // uuid
  amount: number,            // numeric
  tender_type: string | null,
  gaming_day: string,        // date (YYYY-MM-DD)
  visit_id: string | null,
  at: string                 // ISO 8601 timestamp
}
```

**Consumers**:
- UI (player financial history)
- MTL (compliance reconciliation)
- Reports (gaming day aggregates)

**Cache Invalidation**:
- Invalidate: `['finance', 'transactions', player_id]`
- Invalidate: `['finance', 'gaming-day', casino_id, gaming_day]`

---

#### `finance.outbox_processed`

**Producer**: PlayerFinancialService background worker (post-MVP)
**Trigger**: Finance outbox event processed (webhook/email sent)
**Channel**: Internal (worker monitoring)
**Reference**: [SRM §PlayerFinancialService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#playerfinancialservice-finance-context--implemented) (outbox is post-MVP per ADR-016)

**Payload Schema**:
```typescript
{
  event: "finance.outbox_processed",
  outbox_id: string,         // uuid
  ledger_id: string,         // transaction uuid
  event_type: string,
  attempt_count: number,
  processed_at: string,
  at: string
}
```

**Consumers**:
- Observability (worker health monitoring)
- Admin UI (outbox status)

---

### VisitService Events

#### `visit.checked_in`

**Producer**: VisitService
**Trigger**: Player checked in to casino
**Channel**: `{casino_id}`
**Reference**: [SRM §VisitService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#visitservice-operational-session-context)

**Payload Schema**:
```typescript
{
  event: "visit.checked_in",
  visit_id: string,          // uuid
  player_id: string,         // uuid
  casino_id: string,         // uuid
  started_at: string,        // ISO 8601 timestamp
  at: string
}
```

**Consumers**:
- UI (active visits dashboard)
- Loyalty (session context)

---

#### `visit.checked_out`

**Producer**: VisitService
**Trigger**: Player checked out of casino
**Channel**: `{casino_id}`, `{casino_id}:{visit_id}`
**Reference**: [SRM §VisitService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#visitservice-operational-session-context)

**Payload Schema**:
```typescript
{
  event: "visit.checked_out",
  visit_id: string,
  player_id: string,
  casino_id: string,
  started_at: string,
  ended_at: string,          // ISO 8601 timestamp
  duration_minutes: number,
  at: string
}
```

**Consumers**:
- UI (visit history)
- Loyalty (session-end rewards trigger)
- Reports (visit analytics)

---

## Outbox Event Patterns

**Services with Outbox Tables**:
- **Loyalty** (`loyalty_outbox`) - [SRM §LoyaltyService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#loyaltyservice-reward-context)
- **Finance** (`finance_outbox`) - post-MVP per ADR-016 ([SRM §PlayerFinancialService](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#playerfinancialservice-finance-context--implemented))

**Purpose**: Reliable side effect execution (emails, webhooks, external integrations)

**Worker Pattern**:
- Background workers drain outbox via `FOR UPDATE SKIP LOCKED`
- Workers emit downstream events exactly once
- Workers set `processed_at` and increment `attempt_count` on failures
- Dead-letter alerting after threshold attempts (N)
- Exponential backoff with jitter for retries

**Reference**: [SRM §LoyaltyService.Contracts](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#loyaltyservice-reward-context), [OBSERVABILITY_SPEC.md](../50-ops/OBSERVABILITY_SPEC.md)

---

## Retry & Ordering Expectations

**Idempotency**:
- Outbox → realtime publish uses idempotent payloads
- Replays are safe because payloads include all necessary context
- Consumers must handle duplicate events gracefully

**Ordering**:
- Events within same `casino_id` are ordered by timestamp
- Cross-casino ordering not guaranteed
- React Query invalidation uses batching (250-500ms) to coalesce list updates

**Client Cache Reconciliation**:
- React Query is single source of truth for server data
- Shared `invalidateByDomainEvent(event, payload)` helper maps events to query keys
- Used in both mutation success handlers and realtime listeners
- Batched invalidations use `refetchType: 'active'` to avoid background refetch storms

**Reference**: [ADR-004-real-time-strategy.md](../80-adrs/ADR-004-real-time-strategy.md)

---

## Broadcast Throttling

**Hot Domains** (high-volume telemetry):
- **RatingSlip**: Broadcasts state transitions (open → paused → closed) + optional 1-5s snapshots
- **TableContext**: Broadcasts custody state transitions (requested → completed, removed → delivered) + periodic snapshots (1-5s)

**Alternative for High-Cardinality Dashboards**:
- Prefer **poll + ETag** refresh (React Query refetch with `If-None-Match`) instead of realtime streams
- Server-side aggregation reduces broadcast volume

**Reference**: [OBSERVABILITY_SPEC.md §4.4](../50-ops/OBSERVABILITY_SPEC.md#44-broadcast-throttling)

---

## Event to Cache Mapping Reference

Full mapping details live in:
- `docs/25-api-data/REAL_TIME_EVENTS_MAP.md` (cache actions, batching policy, infinite queries)
- `docs/50-ops/OBSERVABILITY_SPEC.md` §4 (event instrumentation, correlation IDs)
- `docs/80-adrs/ADR-004-real-time-strategy.md` (architecture decisions)

---

## Audit & Correlation

**Correlation IDs**:
- Injected at edge (`x-correlation-id` header required on all edge calls)
- Propagated through every service call/RPC via `SET LOCAL application_name = correlation_id`
- Included in audit log canonical shape: `{ts, actor_id, casino_id, domain, action, dto_before, dto_after, correlation_id}`

**Event Audit**:
- All events must include `at` timestamp (ISO 8601)
- Event payloads logged to `audit_log` table with correlation ID
- P95 latency budget: < 80ms for event processing

**Reference**: [OBSERVABILITY_SPEC.md §2](../50-ops/OBSERVABILITY_SPEC.md#2-audit-logging), [SRM §CasinoService.Contracts](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md#casinoservice-foundational-context)

---

## Event Catalog Summary

| Event | Producer | Consumers | Payload Keys | Channel |
|-------|----------|-----------|--------------|---------|
| `rating_slip.created` | RatingSlip | UI | rating_slip_id, visit_id, casino_id, table_id, status, at | `{casino_id}` |
| `rating_slip.updated` | RatingSlip | Loyalty, UI | rating_slip_id, visit_id, casino_id, average_bet, minutes_played, game_type, at | `{casino_id}`, `{casino_id}:{rating_slip_id}` |
| `rating_slip.closed` | RatingSlip | Loyalty, UI | rating_slip_id, visit_id, casino_id, end_time, at | `{casino_id}`, `{casino_id}:{rating_slip_id}` |
| `loyalty.ledger_appended` | Loyalty | UI | ledger_id, player_id, points_earned, reason, rating_slip_id, at | `{casino_id}`, `{casino_id}:{player_id}` |
| `loyalty.balance_updated` | Loyalty | UI | player_id, casino_id, balance, balance_delta, tier, at | `{casino_id}:{player_id}` |
| `table.inventory_open` | TableContext | UI, Audit | casino_id, table_id, snapshot_id, chipset, counted_by, at | `{casino_id}`, `{casino_id}:{table_id}` |
| `table.inventory_close` | TableContext | UI, Finance, Audit | casino_id, table_id, snapshot_id, chipset, discrepancy_cents, at | `{casino_id}`, `{casino_id}:{table_id}` |
| `table.inventory_rundown_recorded` | TableContext | UI, Audit | casino_id, table_id, snapshot_id, chipset, at | `{casino_id}:{table_id}` |
| `table.fill_requested` | TableContext | UI, Cage | casino_id, table_id, request_id, amount_cents, chipset, at | `{casino_id}`, `{casino_id}:{table_id}` |
| `table.fill_completed` | TableContext | UI, Audit | casino_id, table_id, request_id, delivered_by, received_by, at | `{casino_id}`, `{casino_id}:{table_id}` |
| `table.credit_requested` | TableContext | UI, Cage | casino_id, table_id, request_id, amount_cents, chipset, at | `{casino_id}`, `{casino_id}:{table_id}` |
| `table.credit_completed` | TableContext | UI, Audit | casino_id, table_id, request_id, sent_by, received_by, at | `{casino_id}`, `{casino_id}:{table_id}` |
| `table.drop_removed` | TableContext | UI, Audit, Finance | casino_id, table_id, drop_box_id, seal_no, gaming_day, seq_no, at | `{casino_id}`, `{casino_id}:{table_id}` |
| `table.drop_delivered` | TableContext | UI, Finance | casino_id, table_id, drop_box_id, delivered_at, at | `{casino_id}`, `{casino_id}:{table_id}` |
| `table.activated` | TableContext | UI, FloorLayout | casino_id, table_id, label, type, pit, at | `{casino_id}` |
| `table.deactivated` | TableContext | UI | casino_id, table_id, at | `{casino_id}` |
| `floor_layout.activated` | FloorLayout | **TableContext**, Performance, UI | casino_id, layout_id, layout_version_id, activated_by, pits, table_slots, at | `{casino_id}` |
| `finance.transaction_created` | PlayerFinancial | UI, MTL, Reports | transaction_id, player_id, casino_id, amount, gaming_day, at | `{casino_id}`, `{casino_id}:{player_id}` |
| `finance.outbox_processed` | PlayerFinancial (worker, post-MVP) | Observability, Admin UI | outbox_id, ledger_id, event_type, attempt_count, at | Internal |
| `visit.checked_in` | Visit | UI, Loyalty | visit_id, player_id, casino_id, started_at, at | `{casino_id}` |
| `visit.checked_out` | Visit | UI, Loyalty, Reports | visit_id, player_id, casino_id, ended_at, duration_minutes, at | `{casino_id}`, `{casino_id}:{visit_id}` |

**Total Events Documented**: 21

---

## References

- **SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **Real-time Events Map**: `docs/25-api-data/REAL_TIME_EVENTS_MAP.md`
- **ADR-003 (State Management)**: `docs/80-adrs/ADR-003-state-management-strategy.md`
- **ADR-004 (Real-time Strategy)**: `docs/80-adrs/ADR-004-real-time-strategy.md`
- **Observability Spec**: `docs/50-ops/OBSERVABILITY_SPEC.md` §4

---

**Last Updated**: 2025-12-20
**SRM Version**: 4.4.0
**Schema SHA**: efd5cd6d079a9a794e72bcf1348e9ef6cb1753e6
