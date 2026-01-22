# Player 360° Dashboard — Event Taxonomy Quick Reference

> **Version:** 1.1.0 (Audit fixes applied)
> **Status:** CANONICAL
> **ADR:** ADR-029-player-360-interaction-event-taxonomy.md

---

## Event Types (Enum)

```typescript
type InteractionEventType =
  // Session & Presence
  | 'visit_start'           // Player checked in
  | 'visit_end'             // Player checked out
  | 'visit_resume'          // Same-day visit resumed

  // Gaming Activity
  | 'rating_start'          // Rating slip opened
  | 'rating_pause'          // Rating slip paused
  | 'rating_resume'         // Rating slip resumed
  | 'rating_close'          // Rating slip closed
  // NOTE: 'rating_move' removed - UI infers from previousSlipId in metadata

  // Financial
  | 'cash_in'               // Money in (buy-in)
  | 'cash_out'              // Money out (cashout)
  | 'cash_observation'      // Pit observation
  | 'financial_adjustment'  // Correction

  // Loyalty
  | 'points_earned'         // Accrual/promo credit
  | 'points_redeemed'       // Comp debit
  | 'points_adjusted'       // Manual adjustment
  | 'promo_issued'          // Coupon issued
  | 'promo_redeemed'        // Coupon used

  // Staff Interactions
  | 'note_added'            // Staff note
  | 'tag_applied'           // Flag applied
  | 'tag_removed'           // Flag removed

  // Compliance
  | 'mtl_recorded'          // MTL entry
  // NOTE: CTR threshold is a METRIC, not an event (see D8 in ADR-029)

  // Identity
  | 'player_enrolled'       // Casino enrollment
  | 'identity_verified';    // ID verified
```

**Removed:**
- `rating_move` — UI infers move from `previousSlipId` in metadata (avoids event duplication)
- `ctr_threshold` — CTR is an aggregate metric, not a row-level event (compliance panel only)

---

## Schema Validation (Canonical Source Tables)

| Source Table | Exists? | Timestamp Column | Owner Service |
|--------------|---------|------------------|---------------|
| `visit` | ✅ Yes | `started_at`, `ended_at` | VisitService |
| `rating_slip` | ✅ Yes | `start_time`, `end_time` | RatingSlipService |
| `rating_slip_pause` | ✅ Yes | `started_at`, `ended_at` | RatingSlipService |
| `player_financial_transaction` | ✅ Yes | `created_at` | PlayerFinancialService |
| `pit_cash_observation` | ✅ Yes | `observed_at` | RatingSlipService |
| `loyalty_ledger` | ✅ Yes | `created_at` | LoyaltyService |
| `promo_coupon` | ✅ Yes | `created_at`, `redeemed_at` | LoyaltyService |
| `mtl_entry` | ✅ Yes | `occurred_at` | MTLService |
| `player_casino` | ✅ Yes | `enrolled_at` | CasinoService |
| `player_identity` | ✅ Yes | `verified_at` | PlayerService |
| `player_note` | ✅ **Phase 1 migration (EXEC-SPEC-029 WS1-B)** | `created_at` | PlayerService |
| `player_tag` | ✅ **Phase 1 migration (EXEC-SPEC-029 WS1-C)** | `created_at`, `removed_at` | PlayerService |

---

## Source Table → Event Mapping

| Source Table | Event Type(s) | Derivation Logic |
|--------------|---------------|------------------|
| `visit` | `visit_start` | Each row emits on `started_at` |
| `visit` | `visit_end` | When `ended_at IS NOT NULL` |
| `visit` | `visit_resume` | When ADR-026 `resumed` flag is true |
| `rating_slip` | `rating_start` | Each row emits on `start_time` |
| `rating_slip` | `rating_close` | When `status = 'closed'` AND `end_time IS NOT NULL` |
| `rating_slip_pause` | `rating_pause` | Each row emits on `started_at` |
| `rating_slip_pause` | `rating_resume` | When `ended_at IS NOT NULL` |
| `player_financial_transaction` | `cash_in` | `direction = 'in'` AND `txn_kind = 'original'` |
| `player_financial_transaction` | `cash_out` | `direction = 'out'` AND `txn_kind = 'original'` |
| `player_financial_transaction` | `financial_adjustment` | `txn_kind IN ('adjustment', 'reversal')` |
| `pit_cash_observation` | `cash_observation` | Each row emits on `observed_at` |
| `loyalty_ledger` | `points_earned` | `reason IN ('base_accrual', 'promotion')` AND `points_delta > 0` |
| `loyalty_ledger` | `points_redeemed` | `reason = 'redeem'` |
| `loyalty_ledger` | `points_adjusted` | `reason IN ('manual_reward', 'adjustment', 'reversal')` |
| `promo_coupon` | `promo_issued` | Each row emits on `created_at` |
| `promo_coupon` | `promo_redeemed` | When `redeemed_at IS NOT NULL` |
| `mtl_entry` | `mtl_recorded` | Each row emits on `occurred_at` |
| `player_casino` | `player_enrolled` | Each row emits on `enrolled_at` |
| `player_identity` | `identity_verified` | When `verified_at IS NOT NULL` |
| `player_note` (NEW) | `note_added` | Each row emits on `created_at` |
| `player_tag` (NEW) | `tag_applied` | Each row emits on `created_at` |
| `player_tag` (NEW) | `tag_removed` | When `removed_at IS NOT NULL` |

---

## Canonical Event Shape (DTO)

```typescript
interface InteractionEventDTO {
  /** Synthetic event ID (deterministic: uuid_generate_v5) */
  eventId: string;

  /** Player ID (null for ghost visits) */
  playerId: string | null;

  /** Casino tenant scope (derived from RLS context) */
  casinoId: string;

  /** Visit context (null for enrollment events) */
  visitId: string | null;

  /** Classified event type */
  eventType: InteractionEventType;

  /** When event occurred (ISO 8601) */
  occurredAt: string;

  /** Staff who performed action (null for system events) */
  actorId: string | null;

  /** Actor display name (for UI) */
  actorName: string | null;

  /** Source table for drilldown */
  sourceTable: string;

  /** Actual row PK for joins */
  sourceId: string;

  /** Human-readable summary */
  summary: string;

  /** Monetary or points amount (null if N/A) */
  amount: number | null;

  /** Event-specific payload (typed per eventType) */
  metadata: InteractionEventMetadata;
}
```

**Event ID Strategy:**
- `eventId` = `uuid_generate_v5(namespace, sourceTable:sourceId:eventType)`
- Deterministic = cacheable, stable for React keys
- `sourceId` = actual row PK for drilldown queries

---

## Metadata Type Contracts (Discriminated Union)

```typescript
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
  previousSlipId?: string; // UI infers move when present
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

## Timeline Query (RPC)

**CRITICAL:** No client-provided `casino_id` — derived from RLS context per ADR-024.

```typescript
interface TimelineQuery {
  playerId: string;           // Required
  // casinoId: REMOVED - derived from RLS context
  eventTypes?: InteractionEventType[];  // Filter
  fromDate?: string;          // ISO date
  toDate?: string;            // ISO date
  limit?: number;             // Default 50
  // Keyset pagination (tuple)
  cursorAt?: string;          // ISO timestamp
  cursorId?: string;          // Event ID
}

interface TimelineResponse {
  events: InteractionEventDTO[];
  nextCursorAt: string | null;
  nextCursorId: string | null;
  hasMore: boolean;
}
```

**Pagination:** Uses `(occurredAt, eventId)` tuple for stable keyset pagination.

---

## CTR/Compliance (NOT Timeline Events)

CTR threshold crossing is a **computed aggregate**, not a timeline event.

**Why:**
- CTR triggers on aggregate transactions within gaming day (typically 24h)
- Per-row threshold checks create false positives/negatives
- Would train staff incorrectly

**FinCEN Threshold (31 CFR 1021.311):**
- CTR required when cash transactions **exceed $10,000** (strictly > $10,000, not >=)

**Implementation:**
- Compliance panel computes: `SUM(amount) WHERE gaming_day = current` (by direction)
- Watchlist alert: aggregate >= $3k (casino policy, `casino_settings.watchlist_floor`)
- CTR alert: aggregate > $10k (FinCEN mandatory, `casino_settings.ctr_threshold`)
- Displayed as metric, not event

---

## MVP Minimum Metrics

### Recency & Frequency
| Metric | Type | Derived From |
|--------|------|--------------|
| `lastVisitAt` | timestamp | MAX(visit.started_at) |
| `visitCount30d` | number | COUNT(visit) in 30d window |
| `daysSinceLastVisit` | number | Computed |
| `engagementBand` | 'active' \| 'cooling' \| 'dormant' | Rules on daysSinceLastVisit |

### Financial
| Metric | Type | Derived From |
|--------|------|--------------|
| `totalCashIn30d` | money | SUM(txn.amount WHERE in) |
| `totalCashOut30d` | money | SUM(txn.amount WHERE out) |
| `netAmount30d` | money | in - out |
| `avgBuyIn` | money | AVG(buy-in amounts) |

### Play Activity
| Metric | Type | Derived From |
|--------|------|--------------|
| `totalPlayTime30d` | seconds | SUM(slip.final_duration_seconds) |
| `avgSessionMinutes` | number | AVG duration / 60 |
| `avgBet` | money | AVG(slip.average_bet) |
| `theo30d` | money | SUM(computed theo) |
| `preferredGame` | game_type | MODE(table.type) |

### Loyalty
| Metric | Type | Derived From |
|--------|------|--------------|
| `currentBalance` | points | player_loyalty.balance |
| `pointsEarned30d` | points | SUM(positive deltas) |
| `pointsRedeemed30d` | points | ABS(SUM negative deltas) |
| `tier` | string | player_loyalty.tier |

---

## Required Indexes (Performance)

**Target:** < 500ms latency for 500 events, 1 year of data. Follow EXEC-SPEC-029 phasing so we only index sources present in the current UNION blocks.

### Phase 1 (MVP RPC sources only)

```sql
-- Composite indexes for keyset pagination (casino_id, player_id, timestamp DESC, id DESC)
CREATE INDEX idx_visit_player_timeline
  ON visit (casino_id, player_id, started_at DESC, id DESC);

CREATE INDEX idx_rating_slip_player_timeline
  ON rating_slip (casino_id, start_time DESC, id DESC);

CREATE INDEX idx_rating_slip_visit_join
  ON rating_slip (casino_id, visit_id);

CREATE INDEX idx_financial_player_timeline
  ON player_financial_transaction (casino_id, player_id, created_at DESC, id DESC);

CREATE INDEX idx_loyalty_player_timeline
  ON loyalty_ledger (casino_id, player_id, created_at DESC, id DESC);

CREATE INDEX idx_mtl_player_timeline
  ON mtl_entry (casino_id, patron_uuid, occurred_at DESC, id DESC);
```

### Phase 2 (add when Phase 2 UNION blocks ship)

```sql
CREATE INDEX idx_pit_obs_player_timeline
  ON pit_cash_observation (casino_id, player_id, observed_at DESC, id DESC);

CREATE INDEX idx_promo_coupon_player_timeline
  ON promo_coupon (casino_id, player_id, created_at DESC, id DESC);

CREATE INDEX idx_player_note_timeline
  ON player_note (casino_id, player_id, created_at DESC, id DESC);

CREATE INDEX idx_player_tag_timeline
  ON player_tag (casino_id, player_id, created_at DESC, id DESC);
```

> NOTE: player_note/tag indexes exist only after their timeline events go live (EXEC-SPEC-029 WS1-D/Phase 2 follow-up migration).

---

## New Tables Required

### player_note
```sql
CREATE TABLE player_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES casino(id),
  player_id uuid NOT NULL REFERENCES player(id),
  created_by uuid NOT NULL REFERENCES staff(id),
  content text NOT NULL,
  visibility text NOT NULL DEFAULT 'team' CHECK (visibility IN ('private','team','all')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS policies (ADR-015 Pattern C hybrid)
```

### player_tag
```sql
CREATE TABLE player_tag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES casino(id),
  player_id uuid NOT NULL REFERENCES player(id),
  tag_name text NOT NULL,
  tag_category text NOT NULL DEFAULT 'custom' CHECK (tag_category IN ('vip','attention','service','custom')),
  applied_by uuid NOT NULL REFERENCES staff(id),
  removed_by uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  UNIQUE (casino_id, player_id, tag_name) WHERE removed_at IS NULL
);

-- RLS policies (ADR-015 Pattern C hybrid)
```

---

## Implementation Checklist

- [ ] Add `interaction_event_type` enum
- [ ] Create `player_note` table with RLS
- [ ] Create `player_tag` table with RLS
- [ ] Create timeline indexes for Phase 1 sources (visit, rating_slip, player_financial_transaction, loyalty_ledger, mtl_entry) per EXEC-SPEC-029 WS1-D
- [ ] Schedule Phase 2 timeline indexes (pit_cash_observation, promo_coupon, player_note, player_tag) once corresponding UNION blocks ship
- [ ] Implement `rpc_get_player_timeline` (SECURITY DEFINER, RLS context)
- [ ] Create `services/player-timeline/dtos.ts` with discriminated union metadata
- [ ] Create `services/player-timeline/mappers.ts` with validation
- [ ] Create `services/player-timeline/crud.ts`
- [ ] Create `services/player/metrics.ts`
- [ ] Run `npm run db:types`
- [ ] Add timeline React Query hooks
- [ ] Integration test for keyset pagination (no duplicates/drops)
