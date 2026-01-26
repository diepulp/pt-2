# ADR-029 Implementation Status

**Last Updated:** 2026-01-21
**ADR Reference:** `docs/80-adrs/ADR-029-player-360-interaction-event-taxonomy.md`

---

## Phase Summary

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 | Schema & Types | Done |
| Phase 2 | Service Layer | Done |
| Phase 3 | Dashboard UI | Done |
| Phase 4 | Collaboration (Notes/Tags/Compliance) | Placeholder |

---

## Completed

### Phase 1: Schema & Types

- [x] `interaction_event_type` enum created
- [x] `rpc_get_player_timeline` RPC function (SECURITY DEFINER)
- [x] Phase 1 indexes on source tables
- [x] uuid-ossp extension enabled

### Phase 2: Service Layer

- [x] `services/player-timeline/dtos.ts` — InteractionEventDTO, TimelineFilters, metadata types
- [x] `services/player-timeline/mappers.ts` — RPC result to DTO with metadata validation
- [x] `services/player-timeline/crud.ts` — getPlayerTimeline function
- [x] `services/player-timeline/keys.ts` — React Query key factory
- [x] `hooks/player-timeline/use-player-timeline.ts` — Basic hook
- [x] `hooks/player-timeline/use-infinite-player-timeline.ts` — Infinite scroll hook

### Phase 3: Dashboard UI

- [x] `components/player-360/layout.tsx` — 3-panel layout system
- [x] `app/(dashboard)/players/[playerId]/timeline/` — Route and page
- [x] Timeline feed with infinite scroll
- [x] Event filtering (type, date range)
- [x] Day grouping with sticky headers
- [x] Basic metrics tiles (event counts by category)
- [x] Event card rendering with icons and metadata

---

## Remaining Work

### Event Types (12 additional UNION blocks needed in RPC)

Currently implemented: **9 event types**
- visit_start, visit_end
- rating_start, rating_close
- cash_in, cash_out
- points_earned, points_redeemed
- mtl_recorded

Missing: **12 event types**

| Event Type | Source Table | Derivation |
|------------|--------------|------------|
| `visit_resume` | `visit` | ADR-026 `resumed` flag |
| `rating_pause` | `rating_slip_pause` | `started_at` |
| `rating_resume` | `rating_slip_pause` | `ended_at IS NOT NULL` |
| `financial_adjustment` | `player_financial_transaction` | `txn_kind IN ('adjustment', 'reversal')` |
| `cash_observation` | `pit_cash_observation` | Each row on `observed_at` |
| `points_adjusted` | `loyalty_ledger` | `reason IN ('manual_reward', 'adjustment', 'reversal')` |
| `promo_issued` | `promo_coupon` | `created_at` |
| `promo_redeemed` | `promo_coupon` | `redeemed_at IS NOT NULL` |
| `player_enrolled` | `player_casino` | `enrolled_at` |
| `identity_verified` | `player_identity` | `verified_at IS NOT NULL` |
| `note_added` | `player_note` | `created_at` (table needed) |
| `tag_applied` | `player_tag` | `created_at` (table needed) |
| `tag_removed` | `player_tag` | `removed_at IS NOT NULL` (table needed) |

### Database Migrations Needed

| Migration | Description | Priority |
|-----------|-------------|----------|
| `player_note` | Staff notes on players with RLS | High (enables notes feature) |
| `player_tag` | Player flags/tags with RLS | High (enables tags feature) |
| Phase 2 indexes | 4 indexes per ADR-029 D11 | Medium |
| RPC update | Add 12 UNION ALL blocks | Medium |

**Phase 2 Indexes (D11):**
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

### Right Rail Implementation (Phase 4)

| Component | Location | Current State | Required |
|-----------|----------|---------------|----------|
| Notes tab | `timeline-content.tsx:527` | `CollaborationPlaceholder` | Note composer, list, visibility controls |
| Tags tab | `timeline-content.tsx:527` | `CollaborationPlaceholder` | Tag chips, categories, apply/remove |
| Compliance tab | `timeline-content.tsx:557` | `CompliancePlaceholder` | CTR progress bar, MTL list |

**Component library ready but not connected:**
- `components/player-360/collaboration/panel.tsx`
- `components/player-360/collaboration/note-composer.tsx`
- `components/player-360/collaboration/tag-chips.tsx`
- `components/player-360/compliance/` (CTR/MTL components)

### Metrics (D10)

Left rail has basic event counts. Missing derived metrics:

**Recency & Frequency:**
- [ ] `last_visit_at` — MAX(visit.started_at)
- [ ] `visit_count_30d` — COUNT(visit) last 30 days
- [ ] `avg_visit_frequency_days`
- [ ] `days_since_last_visit`

**Monetary Proxies:**
- [ ] `total_cash_in_30d`
- [ ] `total_cash_out_30d`
- [ ] `avg_buy_in`
- [ ] `net_30d`

**Play Proxies:**
- [ ] `total_play_time_30d`
- [ ] `avg_session_minutes`
- [ ] `avg_bet`
- [ ] `theo_30d`
- [ ] `preferred_game`

**Loyalty:**
- [x] `current_balance` — via `usePlayerLoyalty` hook (separate from timeline)
- [x] `tier` — via `usePlayerLoyalty` hook
- [ ] `points_earned_30d`
- [ ] `points_redeemed_30d`

**Engagement:**
- [ ] `staff_interaction_count_30d`
- [ ] `engagement_band` (active/cooling/dormant)

### Testing (DoD Items)

- [ ] Enum coverage test (`services/player-timeline/__tests__/enum-coverage.test.ts`)
- [ ] Keyset pagination integration test (no duplicates/drops)
- [ ] Performance benchmark: < 500ms latency with 500 events

---

## Definition of Done (ADR-029)

- [x] `interaction_event_type` enum created in database
- [ ] `player_note` and `player_tag` tables created with RLS
- [x] Timeline indexes created (Phase 1 only; Phase 2 deferred)
- [x] `rpc_get_player_timeline` returns unified events with RLS context derivation
- [x] TypeScript types generated and DTOs defined with discriminated union metadata
- [ ] Basic timeline query works with < 500ms latency (benchmark not run)
- [ ] Unit tests for event type mapping logic
- [ ] Integration test for keyset pagination

---

## Related Documents

| Document | Purpose |
|----------|---------|
| `PLAYER-360-CONSOLIDATION-STRATEGY.md` | UI consolidation plan |
| `GAP-PLAYER-360-NAVIGATION.md` | Navigation gap analysis |
| `player-360-crm-dashboard-ux-ui-baselines.md` | UX design guidelines |
| `player-360-dashboard-mvp-outline.md` | MVP scope definition |
