# ADR-029: Player 360° Dashboard — Canonical Interaction Event Taxonomy

**Status:** Proposed
**Date:** 2026-01-21
**Revision:** 7 (Audit fixes: NULLIF guard, cursor pagination, SECURITY DEFINER guardrails, enum appendix, scoped joins, phased indexes, CTR wording, amount semantics, phase markers, uuid-ossp dep, actor_id docs)
**Authors:** Lead Architect
**PRD Reference:** Player 360° Dashboard MVP (docs/00-vision/player-dashboard/player-360-dashboard-mvp-outline.md)

---

## Context

The Player 360° Dashboard is an MVP-scoped CRM that provides a single source of truth for player interactions and history. The dashboard requires:

1. **Unified Timeline** — A sortable, filterable feed of all player interactions
2. **Facts vs Derived Metrics** — Clear separation of append-only events from computed aggregates
3. **Cross-Dashboard Portability** — Same player snapshot usable by shift reports, loyalty views, compliance panels

The vision document specifies: *"Everything becomes an event: visits, rating slips, rewards, notes, transactions, incidents, exclusions, communications"* and *"If it doesn't land into the timeline as an event, it probably doesn't belong yet."*

### Problem Statement

PT-2 currently has operational data spread across multiple tables with different structures:
- `visit` — Session lifecycle events
- `rating_slip` / `rating_slip_pause` — Gaming telemetry
- `loyalty_ledger` — Points transactions
- `player_financial_transaction` — Financial movements
- `mtl_entry` — Compliance observations
- `pit_cash_observation` — Cash telemetry
- `audit_log` — System audit trail

**Challenge:** No unified view exists for displaying all player interactions in a single chronological timeline. Each table has its own shape, making a polymorphic timeline difficult without a canonical abstraction.

---

## Decision

### D1: Interaction Event Taxonomy (Enum-Based Classification)

Define a canonical `interaction_event_type` enum that classifies all player-relevant events:

```sql
CREATE TYPE interaction_event_type AS ENUM (
  -- Session & Presence
  'visit_start',           -- Player checked in (visit created)
  'visit_end',             -- Player checked out (visit closed)
  'visit_resume',          -- Same-day visit resumed (ADR-026)

  -- Gaming Activity
  'rating_start',          -- Rating slip opened
  'rating_pause',          -- Rating slip paused
  'rating_resume',         -- Rating slip resumed from pause
  'rating_close',          -- Rating slip closed (final duration)
  -- NOTE: 'rating_move' removed - UI infers move from consecutive slips with different tables

  -- Financial
  'cash_in',               -- Money in (buy-in)
  'cash_out',              -- Money out (cashout)
  'cash_observation',      -- Pit observation (telemetry)
  'financial_adjustment',  -- Correction to financial record

  -- Loyalty & Rewards
  'points_earned',         -- Base accrual or promotion credit
  'points_redeemed',       -- Comp issuance (debit)
  'points_adjusted',       -- Manual credit/adjustment
  'promo_issued',          -- Promotional coupon issued
  'promo_redeemed',        -- Promotional coupon redeemed

  -- Staff Interactions
  'note_added',            -- Staff note recorded
  'tag_applied',           -- Player flag/tag applied
  'tag_removed',           -- Player flag/tag removed

  -- Compliance
  'mtl_recorded',          -- MTL entry logged
  -- NOTE: CTR threshold alerts are NOT timeline events; they are computed
  --       aggregates displayed in compliance panel (see D8)

  -- Identity & Enrollment
  'player_enrolled',       -- Player enrolled at casino
  'identity_verified'      -- ID document verified
);
```

**Removed from original:**
- `rating_move` — UI derives move when consecutive slips change tables (avoids 2-3 event duplication)
- `ctr_threshold` — CTR is an aggregate over gaming_day transactions, not a single-row event. Moved to compliance metrics panel.

### D2: Read-Only Projection Pattern (No Physical Event Store)

**Decision:** Use a SQL VIEW or RPC that UNION ALLs across source tables, NOT a separate event store.

**Rationale:**
- MVP scope — Avoid event sourcing complexity
- Source tables are the append-only facts (ledger pattern already enforced)
- View/RPC provides the unified timeline without data duplication
- Future migration path: Can materialize as table if performance requires

### D3: Canonical Event Shape (Projection Type)

```sql
-- Canonical interaction event shape (projection)
-- NOTE: event_id is synthetic (deterministic), source_id is the actual row PK
CREATE TYPE interaction_event AS (
  event_id     uuid,              -- Synthetic: uuid_generate_v5(namespace, source_table:source_id:event_type)
  player_id    uuid,              -- Player (NOT NULL for MVP; ghost visit timeline deferred)
  casino_id    uuid,              -- Tenant scope (derived from RLS context)
  visit_id     uuid,              -- Visit context (nullable)
  event_type   interaction_event_type,
  occurred_at  timestamptz,       -- When the event happened
  actor_id     uuid,              -- Staff who performed action (nullable: system/player-initiated events have no actor)
  source_table text,              -- Origin table for drilling down
  source_id    uuid,              -- Actual row PK for joins
  summary      text,              -- Human-readable one-liner
  amount       numeric,           -- Monetary or points amount ONLY (nullable); gameplay metrics go in metadata
  metadata     jsonb              -- Event-specific details (typed per event_type)
);
```

**Event ID Strategy:**
- `event_id` = `uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', source_table || ':' || source_id || ':' || event_type)`
- Deterministic = cacheable, stable for UI keys
- `source_id` = actual row PK for drilldown queries

### D4: Schema Validation (Canonical Source Tables)

**Verified against:** `types/remote/database.types.ts` @ commit `67c8efb`

| Source Table | Exists in Canonical Schema? | Timestamp Column | Owner Service |
|--------------|----------------------------|------------------|---------------|
| `visit` | ✅ Verified | `started_at`, `ended_at` | VisitService |
| `rating_slip` | ✅ Verified | `start_time`, `end_time` | RatingSlipService |
| `rating_slip_pause` | ✅ Verified | `started_at`, `ended_at` | RatingSlipService |
| `player_financial_transaction` | ✅ Verified | `created_at` | PlayerFinancialService |
| `pit_cash_observation` | ✅ Verified | `observed_at` | RatingSlipService |
| `loyalty_ledger` | ✅ Verified | `created_at` | LoyaltyService |
| `promo_coupon` | ✅ Verified | `created_at`, `redeemed_at` | LoyaltyService |
| `mtl_entry` | ✅ Verified | `occurred_at` | MTLService |
| `player_casino` | ✅ Verified | `enrolled_at` | CasinoService |
| `player_identity` | ✅ Verified | `verified_at` | PlayerService |
| `player_note` | ⏳ Phase 1 | `created_at` | PlayerService |
| `player_tag` | ⏳ Phase 1 | `created_at`, `removed_at` | PlayerService |

**Phase 1 Migrations Required:**
- `player_note` — Staff notes on players (owned by PlayerService)
- `player_tag` — Player flags/tags (owned by PlayerService)

**Re-verification required** when database.types.ts is regenerated after Phase 1 migrations.

### D5: Source Table → Event Type Mapping

**Phase Legend:** 🟢 = Phase 1 (MVP RPC), 🟡 = Phase 2 (post-MVP)

| Source Table | Event Type(s) | Derivation Logic | Phase |
|--------------|---------------|------------------|-------|
| `visit` | `visit_start` | Each row emits on `started_at` | 🟢 |
| `visit` | `visit_end` | When `ended_at IS NOT NULL` | 🟢 |
| `visit` | `visit_resume` | When `started_at` AND visit was resumed same gaming day (ADR-026 `resumed` flag) | 🟡 |
| `rating_slip` | `rating_start` | Each row emits on `start_time` | 🟢 |
| `rating_slip` | `rating_close` | When `status = 'closed'` AND `end_time IS NOT NULL` | 🟢 |
| `rating_slip_pause` | `rating_pause` | Each row emits on `started_at` | 🟡 |
| `rating_slip_pause` | `rating_resume` | When `ended_at IS NOT NULL` | 🟡 |
| `player_financial_transaction` | `cash_in` | `direction = 'in'` AND `txn_kind = 'original'` | 🟢 |
| `player_financial_transaction` | `cash_out` | `direction = 'out'` AND `txn_kind = 'original'` | 🟢 |
| `player_financial_transaction` | `financial_adjustment` | `txn_kind IN ('adjustment', 'reversal')` | 🟡 |
| `pit_cash_observation` | `cash_observation` | Each row emits on `observed_at` | 🟡 |
| `loyalty_ledger` | `points_earned` | `reason IN ('base_accrual', 'promotion')` AND `points_delta > 0` | 🟢 |
| `loyalty_ledger` | `points_redeemed` | `reason = 'redeem'` | 🟢 |
| `loyalty_ledger` | `points_adjusted` | `reason IN ('manual_reward', 'adjustment', 'reversal')` | 🟡 |
| `promo_coupon` | `promo_issued` | Each row emits on `created_at` | 🟡 |
| `promo_coupon` | `promo_redeemed` | When `redeemed_at IS NOT NULL` | 🟡 |
| `mtl_entry` | `mtl_recorded` | Each row emits on `occurred_at` | 🟢 |
| `player_casino` | `player_enrolled` | Each row emits on `enrolled_at` | 🟡 |
| `player_identity` | `identity_verified` | When `verified_at IS NOT NULL` | 🟡 |
| `player_note` | `note_added` | Each row emits on `created_at` | 🟡 |
| `player_tag` | `tag_applied` | Each row emits on `created_at` | 🟡 |
| `player_tag` | `tag_removed` | When `removed_at IS NOT NULL` | 🟡 |

**Phase 1 MVP scope (10 event types):** visit_start, visit_end, rating_start, rating_close, cash_in, cash_out, points_earned, points_redeemed, mtl_recorded

**Phase 2 additions (12 event types):** visit_resume, rating_pause, rating_resume, financial_adjustment, cash_observation, points_adjusted, promo_issued, promo_redeemed, player_enrolled, identity_verified, note_added, tag_applied, tag_removed

### D6: Timeline RPC Design (ADR-015/ADR-024 Compliant)

**CRITICAL:** RPC derives `casino_id` from RLS context — NO client-provided casino_id parameter.

```sql
-- RPC: Get player interaction timeline with keyset pagination
-- Security: SECURITY DEFINER with set_rls_context_from_staff() pattern
CREATE OR REPLACE FUNCTION rpc_get_player_timeline(
  p_player_id uuid,
  p_event_types interaction_event_type[] DEFAULT NULL,
  p_from_date timestamptz DEFAULT NULL,
  p_to_date timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50,
  -- Keyset pagination cursor (tuple)
  p_cursor_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  event_id uuid,
  event_type interaction_event_type,
  occurred_at timestamptz,
  actor_id uuid,
  actor_name text,
  source_table text,
  source_id uuid,
  summary text,
  amount numeric,
  metadata jsonb,
  -- Pagination fields
  has_more boolean,           -- True if more pages exist
  next_cursor_at timestamptz, -- Cursor for next page (only set on last row when has_more)
  next_cursor_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET default_transaction_read_only = on  -- Guardrail: prevent accidental writes in definer context
AS $$
DECLARE
  v_casino_id uuid;
BEGIN
  -- Cursor validation: require both fields or neither (partial cursor = silent page 1 bug)
  IF (p_cursor_at IS NULL) <> (p_cursor_id IS NULL) THEN
    RAISE EXCEPTION 'Cursor must include both cursor_at and cursor_id, or neither';
  END IF;

  -- ADR-024: Derive casino context from RLS session
  PERFORM set_rls_context_from_staff();
  -- NULLIF guards against empty string before uuid cast (empty string cast throws)
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'Casino context not established';
  END IF;

  RETURN QUERY
  WITH timeline_events AS (
    -- Visit start events
    SELECT
      uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        'visit:' || v.id::text || ':visit_start') as event_id,
      'visit_start'::interaction_event_type as event_type,
      v.started_at as occurred_at,
      NULL::uuid as actor_id,
      'visit' as source_table,
      v.id as source_id,
      'Checked in' as summary,
      NULL::numeric as amount,
      jsonb_build_object(
        'visitKind', v.visit_kind,
        'gamingDay', v.gaming_day
      ) as metadata
    FROM visit v
    WHERE v.player_id = p_player_id
      AND v.casino_id = v_casino_id

    UNION ALL

    -- Visit end events
    SELECT
      uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        'visit:' || v.id::text || ':visit_end'),
      'visit_end'::interaction_event_type,
      v.ended_at,
      NULL::uuid,
      'visit',
      v.id,
      'Checked out',
      NULL::numeric,
      jsonb_build_object('visitKind', v.visit_kind)
    FROM visit v
    WHERE v.player_id = p_player_id
      AND v.casino_id = v_casino_id
      AND v.ended_at IS NOT NULL

    UNION ALL

    -- Rating slip start events
    SELECT
      uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        'rating_slip:' || rs.id::text || ':rating_start'),
      'rating_start'::interaction_event_type,
      rs.start_time,
      rs.created_by,
      'rating_slip',
      rs.id,
      'Started play at ' || gt.label,
      NULL::numeric,
      jsonb_build_object(
        'tableId', rs.table_id,
        'tableName', gt.label,
        'seatNumber', rs.seat_number,
        'previousSlipId', rs.previous_slip_id
      )
    FROM rating_slip rs
    JOIN visit v ON v.id = rs.visit_id
    JOIN gaming_table gt ON gt.id = rs.table_id AND gt.casino_id = v_casino_id  -- Scoped join
    WHERE v.player_id = p_player_id
      AND rs.casino_id = v_casino_id

    UNION ALL

    -- Rating slip close events
    SELECT
      uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        'rating_slip:' || rs.id::text || ':rating_close'),
      'rating_close'::interaction_event_type,
      rs.end_time,
      NULL::uuid,
      'rating_slip',
      rs.id,
      'Ended play at ' || gt.label,
      NULL::numeric,  -- amount is money/points only; averageBet is gameplay metric in metadata
      jsonb_build_object(
        'tableId', rs.table_id,
        'tableName', gt.label,
        'durationSeconds', rs.final_duration_seconds,
        'averageBet', rs.average_bet
      )
    FROM rating_slip rs
    JOIN visit v ON v.id = rs.visit_id
    JOIN gaming_table gt ON gt.id = rs.table_id AND gt.casino_id = v_casino_id  -- Scoped join
    WHERE v.player_id = p_player_id
      AND rs.casino_id = v_casino_id
      AND rs.status = 'closed'
      AND rs.end_time IS NOT NULL

    UNION ALL

    -- Financial cash_in events
    SELECT
      uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        'player_financial_transaction:' || pft.id::text || ':cash_in'),
      'cash_in'::interaction_event_type,
      pft.created_at,
      pft.created_by_staff_id,
      'player_financial_transaction',
      pft.id,
      'Buy-in: $' || pft.amount::text,
      pft.amount,
      jsonb_build_object(
        'direction', pft.direction,
        'source', pft.source,
        'tenderType', pft.tender_type,
        'visitId', pft.visit_id
      )
    FROM player_financial_transaction pft
    WHERE pft.player_id = p_player_id
      AND pft.casino_id = v_casino_id
      AND pft.direction = 'in'
      AND pft.txn_kind = 'original'

    UNION ALL

    -- Financial cash_out events
    SELECT
      uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        'player_financial_transaction:' || pft.id::text || ':cash_out'),
      'cash_out'::interaction_event_type,
      pft.created_at,
      pft.created_by_staff_id,
      'player_financial_transaction',
      pft.id,
      'Cash-out: $' || pft.amount::text,
      pft.amount,
      jsonb_build_object(
        'direction', pft.direction,
        'source', pft.source,
        'tenderType', pft.tender_type,
        'visitId', pft.visit_id
      )
    FROM player_financial_transaction pft
    WHERE pft.player_id = p_player_id
      AND pft.casino_id = v_casino_id
      AND pft.direction = 'out'
      AND pft.txn_kind = 'original'

    UNION ALL

    -- Loyalty points_earned events
    SELECT
      uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        'loyalty_ledger:' || ll.id::text || ':points_earned'),
      'points_earned'::interaction_event_type,
      ll.created_at,
      ll.staff_id,
      'loyalty_ledger',
      ll.id,
      'Earned ' || ll.points_delta::text || ' points',
      ll.points_delta,
      jsonb_build_object(
        'reason', ll.reason,
        'ratingSlipId', ll.rating_slip_id,
        'visitId', ll.visit_id,
        'note', ll.note
      )
    FROM loyalty_ledger ll
    WHERE ll.player_id = p_player_id
      AND ll.casino_id = v_casino_id
      AND ll.reason IN ('base_accrual', 'promotion')
      AND ll.points_delta > 0

    UNION ALL

    -- Loyalty points_redeemed events
    SELECT
      uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        'loyalty_ledger:' || ll.id::text || ':points_redeemed'),
      'points_redeemed'::interaction_event_type,
      ll.created_at,
      ll.staff_id,
      'loyalty_ledger',
      ll.id,
      'Redeemed ' || ABS(ll.points_delta)::text || ' points',
      ABS(ll.points_delta),
      jsonb_build_object(
        'reason', ll.reason,
        'note', ll.note
      )
    FROM loyalty_ledger ll
    WHERE ll.player_id = p_player_id
      AND ll.casino_id = v_casino_id
      AND ll.reason = 'redeem'

    UNION ALL

    -- MTL recorded events
    SELECT
      uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        'mtl_entry:' || me.id::text || ':mtl_recorded'),
      'mtl_recorded'::interaction_event_type,
      me.occurred_at,
      me.staff_id,
      'mtl_entry',
      me.id,
      'MTL: $' || me.amount::text || ' ' || me.direction,
      me.amount,
      jsonb_build_object(
        'direction', me.direction,
        'txnType', me.txn_type,
        'source', me.source,
        'gamingDay', me.gaming_day
      )
    FROM mtl_entry me
    WHERE me.patron_uuid = p_player_id
      AND me.casino_id = v_casino_id

    -- Phase 2: Add UNION ALL blocks for remaining event types per D5 mapping table
    -- (visit_resume, rating_pause/resume, financial_adjustment, cash_observation,
    --  points_adjusted, promo_*, player_enrolled, identity_verified, note_*, tag_*)
  ),
  filtered_events AS (
    SELECT *
    FROM timeline_events te
    WHERE (p_cursor_at IS NULL  -- Both null or both set (validated above)
           OR (te.occurred_at, te.event_id) < (p_cursor_at, p_cursor_id))
      AND (p_event_types IS NULL OR te.event_type = ANY(p_event_types))
      AND (p_from_date IS NULL OR te.occurred_at >= p_from_date)
      AND (p_to_date IS NULL OR te.occurred_at <= p_to_date)
    ORDER BY te.occurred_at DESC, te.event_id DESC
    LIMIT p_limit + 1  -- Fetch one extra to detect hasMore
  ),
  counted AS (
    SELECT
      fe.*,
      ROW_NUMBER() OVER (ORDER BY fe.occurred_at DESC, fe.event_id DESC) as rn,
      COUNT(*) OVER () as total_fetched
    FROM filtered_events fe
  )
  SELECT
    c.event_id,
    c.event_type,
    c.occurred_at,
    c.actor_id,
    s.name as actor_name,
    c.source_table,
    c.source_id,
    c.summary,
    c.amount,
    c.metadata,
    -- Pagination: has_more true when we fetched more than requested
    (c.total_fetched > p_limit) as has_more,
    -- Next cursor: only emit on last returned row when has_more
    CASE WHEN c.total_fetched > p_limit AND c.rn = p_limit
         THEN c.occurred_at END as next_cursor_at,
    CASE WHEN c.total_fetched > p_limit AND c.rn = p_limit
         THEN c.event_id END as next_cursor_id
  FROM counted c
  LEFT JOIN staff s ON s.id = c.actor_id AND s.casino_id = v_casino_id  -- Scoped join prevents data pollution
  WHERE c.rn <= p_limit;  -- Exclude the extra row used for has_more detection
END;
$$;
```

### D7: Bounded Context Ownership (Read-Model Exception)

**Matrix-First Discipline Exception:** `rpc_get_player_timeline` is a **read-model aggregator** that reads across bounded contexts. This is explicitly permitted for dashboard/reporting RPCs that:

1. Are read-only (no writes to any service's tables)
2. Derive tenant scope from RLS context (no spoofable params)
3. Are owned by a single service (PlayerService) for maintenance
4. Do not create cross-service dependencies for writes

**Security Posture (SECURITY DEFINER guardrails):**

| Guardrail | Implementation |
|-----------|----------------|
| Search path isolation | `SET search_path = public` — prevents schema injection |
| Read-only enforcement | `SET default_transaction_read_only = on` — prevents accidental writes |
| Function owner | **Must be `app_readonly` role** (or equivalent narrow-privilege role), NOT `postgres` or service account with write access |
| RLS context | Derived from `set_rls_context_from_staff()` — no client-spoofable params |

**Migration note:** When creating this function, explicitly set owner:
```sql
ALTER FUNCTION rpc_get_player_timeline OWNER TO app_readonly;
```

| Component | Owner Service | Notes |
|-----------|---------------|-------|
| `interaction_event_type` enum | CasinoService | Global enum, additive only |
| `rpc_get_player_timeline` | PlayerService | **Read-model aggregator** (cross-context reads allowed) |
| `player_note` table (new) | PlayerService | Staff notes on players |
| `player_tag` table (new) | PlayerService | Player flags/tags |
| Player metrics computation | PlayerService | Aggregates from all sources |
| Timeline UI components | Player Dashboard | Consumes PlayerService DTOs |

### D8: CTR/Compliance Alerts (NOT Timeline Events)

**Decision:** CTR threshold crossing is NOT a timeline event. It is a **computed aggregate** displayed in the compliance panel.

**Rationale:**
- CTR is triggered by aggregate cash transactions within a casino-defined gaming day (commonly 24h, per casino policy)
- A naive per-row threshold check creates false positives/negatives
- Encoding compliance logic in the timeline would train staff incorrectly

**FinCEN Threshold (31 CFR 1021.311):**
- CTR required when cash transactions **exceed $10,000** (strictly > $10,000, not >=)
- Aggregate of all cash-in and cash-out transactions within a gaming day

**Implementation:**
- Compliance panel computes: `SUM(amount) WHERE gaming_day = current_gaming_day` (by direction)
- Watchlist alert: aggregate >= $3,000 (casino policy, configurable via `casino_settings.watchlist_floor`)
- CTR alert: aggregate > $10,000 (FinCEN mandatory, `casino_settings.ctr_threshold`)
- This is a metric, not an event — displayed separately from timeline

### D9: Metadata Type Contracts (TypeScript Discriminated Union)

```typescript
// Event metadata is JSONB but typed per event_type
type InteractionEventMetadata =
  | VisitEventMetadata
  | RatingEventMetadata
  | FinancialEventMetadata
  | LoyaltyEventMetadata
  | NoteEventMetadata
  | TagEventMetadata
  | ComplianceEventMetadata
  | IdentityEventMetadata;

// Session events
interface VisitEventMetadata {
  visitKind: 'reward_identified' | 'gaming_identified_rated' | 'gaming_ghost_unrated';
  gamingDay: string; // YYYY-MM-DD
}

// Gaming events
interface RatingEventMetadata {
  tableId: string;
  tableName: string;
  seatNumber: string | null;
  previousSlipId?: string; // Present if this was a table move
  durationSeconds?: number; // Only on rating_close
  averageBet?: number;
}

// Financial events
interface FinancialEventMetadata {
  direction: 'in' | 'out';
  source: 'pit' | 'cage' | 'system';
  tenderType: string;
  visitId: string;
  note?: string;
}

// Loyalty events
interface LoyaltyEventMetadata {
  reason: string;
  ratingSlipId?: string;
  visitId?: string;
  note?: string;
}

// Collaboration events
interface NoteEventMetadata {
  content: string;
  visibility: 'private' | 'team' | 'all';
}

interface TagEventMetadata {
  tagName: string;
  tagCategory: 'vip' | 'attention' | 'service' | 'custom';
}

// Compliance events
interface ComplianceEventMetadata {
  direction: 'in' | 'out';
  txnType: string;
  source: string;
  gamingDay: string;
}

// Identity events
interface IdentityEventMetadata {
  documentType?: 'drivers_license' | 'passport' | 'state_id';
  issuingState?: string;
}
```

---

## D10: MVP Minimum Metric Set

The dashboard will display these derived metrics, computed from the event stream:

**Recency & Frequency:**
| Metric | Formula | Source |
|--------|---------|--------|
| `last_visit_at` | MAX(visit.started_at) | `visit` |
| `visit_count_30d` | COUNT(visit) WHERE started_at > now() - 30d | `visit` |
| `avg_visit_frequency_days` | AVG(days between consecutive visits) | `visit` |
| `days_since_last_visit` | now() - last_visit_at | Derived |

**Monetary Proxies:**
| Metric | Formula | Source |
|--------|---------|--------|
| `total_cash_in_30d` | SUM(amount) WHERE direction='in' | `player_financial_transaction` |
| `total_cash_out_30d` | SUM(amount) WHERE direction='out' | `player_financial_transaction` |
| `avg_buy_in` | AVG(amount) WHERE direction='in' | `player_financial_transaction` |
| `net_30d` | total_cash_in_30d - total_cash_out_30d | Derived |

**Play Proxies:**
| Metric | Formula | Source |
|--------|---------|--------|
| `total_play_time_30d` | SUM(final_duration_seconds) | `rating_slip` |
| `avg_session_minutes` | AVG(final_duration_seconds) / 60 | `rating_slip` |
| `avg_bet` | AVG(average_bet) | `rating_slip` |
| `theo_30d` | SUM(computed_theo) | `rating_slip.policy_snapshot` |
| `preferred_game` | MODE(gaming_table.type) | `rating_slip` → `gaming_table` |

**Loyalty:**
| Metric | Formula | Source |
|--------|---------|--------|
| `current_balance` | `player_loyalty.balance` | `player_loyalty` |
| `points_earned_30d` | SUM(points_delta) WHERE delta > 0 | `loyalty_ledger` |
| `points_redeemed_30d` | ABS(SUM(points_delta)) WHERE delta < 0 | `loyalty_ledger` |
| `tier` | `player_loyalty.tier` | `player_loyalty` |

**Engagement:**
| Metric | Formula | Source |
|--------|---------|--------|
| `staff_interaction_count_30d` | COUNT(notes + adjustments) | `player_note` + `loyalty_ledger` |
| `engagement_band` | Rules: active (<7d), cooling (7-30d), dormant (>30d) | Derived from `last_visit_at` |

---

## D11: Required Indexes (Performance)

**Target:** < 500ms latency for timeline query with 1 year of data (~500 events/player typical)

**Phasing rule:** Create indexes only for sources included in the current phase's UNION blocks. Phase 2 index creation may be deferred until Phase 2 blocks ship.

```sql
-- ============================================
-- PHASE 1 INDEXES (create with MVP migration)
-- ============================================

CREATE INDEX idx_visit_player_timeline
  ON visit (casino_id, player_id, started_at DESC, id DESC);

CREATE INDEX idx_rating_slip_player_timeline
  ON rating_slip (casino_id, start_time DESC, id DESC);

-- rating_slip join path: filtered via visit_id, needs covering index
CREATE INDEX idx_rating_slip_visit_join
  ON rating_slip (casino_id, visit_id);

CREATE INDEX idx_financial_player_timeline
  ON player_financial_transaction (casino_id, player_id, created_at DESC, id DESC);

CREATE INDEX idx_loyalty_player_timeline
  ON loyalty_ledger (casino_id, player_id, created_at DESC, id DESC);

CREATE INDEX idx_mtl_player_timeline
  ON mtl_entry (casino_id, patron_uuid, occurred_at DESC, id DESC);

-- ============================================
-- PHASE 2 INDEXES (defer until Phase 2 ships)
-- ============================================

CREATE INDEX idx_pit_obs_player_timeline
  ON pit_cash_observation (casino_id, player_id, observed_at DESC, id DESC);

CREATE INDEX idx_promo_coupon_player_timeline
  ON promo_coupon (casino_id, player_id, created_at DESC, id DESC);

-- player_note and player_tag tables created in Phase 1, but timeline
-- blocks deferred to Phase 2; index when blocks ship
CREATE INDEX idx_player_note_timeline
  ON player_note (casino_id, player_id, created_at DESC, id DESC);

CREATE INDEX idx_player_tag_timeline
  ON player_tag (casino_id, player_id, created_at DESC, id DESC);
```

---

## Consequences

### Positive

1. **Single Timeline** — One RPC call returns all player events
2. **No Event Duplication** — Source tables remain authoritative
3. **Filterable** — Event types, date ranges, amounts all queryable
4. **Extensible** — New event types added to enum, new UNION ALL block
5. **Cross-Dashboard Ready** — Same data powers shift reports, compliance views
6. **RLS Compliant** — Casino scope derived from context, not client params
7. **Stable Pagination** — (occurred_at, event_id) tuple prevents duplicates/drops

### Negative

1. **Query Complexity** — UNION ALL across 10+ tables requires careful indexing
2. **Eventual Consistency** — No real-time guarantees (acceptable for MVP)
3. **Metadata Discipline** — JSONB requires strict DTO contracts to avoid junk drawer

### Mitigations

- **Performance:** Composite indexes on all source tables; consider materialized view post-MVP
- **Type Safety:** Discriminated union DTOs per event_type with validation
- **Complexity:** Well-documented source mapping; each UNION ALL block is isolated

---

## Implementation Plan

### Phase 1: Schema & Types (Week 1)
- [ ] Migration: Ensure uuid-ossp extension enabled (`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
- [ ] Migration: Add `interaction_event_type` enum
- [ ] Migration: Create `player_note` table with RLS
- [ ] Migration: Create `player_tag` table with RLS
- [ ] Migration: Create timeline indexes **for Phase 1 sources only** (see D11)
- [ ] Migration: Create `rpc_get_player_timeline` function (SECURITY DEFINER)
- [ ] Run `npm run db:types` to regenerate types

### Phase 2: Service Layer (Week 2)
- [ ] `services/player-timeline/` — New service module
  - `dtos.ts` — InteractionEventDTO, TimelineFilters, metadata types
  - `mappers.ts` — RPC result to DTO with metadata validation
  - `crud.ts` — getPlayerTimeline function
- [ ] `services/player/metrics.ts` — Player metrics computation
- [ ] React Query hooks for timeline data

### Phase 3: Dashboard UI (Week 3-4)
- [ ] Player header + flags component
- [ ] Timeline feed component (virtualized list)
- [ ] Core metrics panel (6-10 key metrics)
- [ ] Notes + tags collaboration panel

---

## Open Questions

1. **Notes Visibility:** Should staff notes have visibility levels (private, team, all)? → **Proposed: Yes, default 'team'** - Approved
2. **Tag Taxonomy:** Pre-defined tags (VIP, attention, etc.) vs free-form? → **Proposed: category + free-form name** - Approved
3. **Real-time Updates:** Supabase Realtime subscription for live timeline? → **Post-MVP**
4. **Archival:** How long to retain timeline events for display? → **Defer to data retention policy**
5. **Ghost Visit Timeline:** MVP RPC requires `player_id`; ghost visits (unidentified players) need separate `rpc_get_visit_timeline(p_visit_id)` → **Post-MVP**

---

## Appendix A: Canonical Enum Values

**Verified against:** `types/remote/database.types.ts` @ commit `67c8efb`

These are the exact enum values used in timeline event derivation:

```typescript
// financial_txn_kind (player_financial_transaction.txn_kind)
type FinancialTxnKind = "original" | "adjustment" | "reversal";

// loyalty_reason (loyalty_ledger.reason)
type LoyaltyReason =
  | "base_accrual"   // → points_earned
  | "promotion"      // → points_earned
  | "redeem"         // → points_redeemed
  | "manual_reward"  // → points_adjusted
  | "adjustment"     // → points_adjusted
  | "reversal";      // → points_adjusted
```

**Integration test requirement:** Phase 2 must include a test that seeds one row per enum value and asserts each maps to the expected timeline event type. Test file: `services/player-timeline/__tests__/enum-coverage.test.ts`

---

## Related Documents

| Document | Relationship |
|----------|--------------|
| `docs/00-vision/player-dashboard/player-360-dashboard-mvp-outline.md` | Vision source |
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | Bounded contexts |
| `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` | RLS context derivation |
| `docs/80-adrs/ADR-024_DECISIONS.md` | set_rls_context_from_staff() pattern |
| `docs/80-adrs/ADR-026-gaming-day-scoped-visits.md` | Visit resume logic |
| `docs/80-adrs/ADR-022_Player_Identity_Enrollment_DECISIONS.md` | Identity events |

---

## Definition of Done

- [ ] `interaction_event_type` enum created in database
- [ ] `player_note` and `player_tag` tables created with RLS
- [ ] Timeline indexes created on all 10 source tables
- [ ] `rpc_get_player_timeline` returns unified events with RLS context derivation
- [ ] TypeScript types generated and DTOs defined with discriminated union metadata
- [ ] Basic timeline query works with < 500ms latency (benchmark: 500 events, 1 year)
- [ ] Unit tests for event type mapping logic
- [ ] Integration test for keyset pagination (no duplicates/drops)
