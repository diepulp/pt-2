# Phase 6 Implementation Plan (Loyalty + RatingSlip + MTL)

> **Date**: 2025-10-13
> **Scope**: Deliver RatingSlip Phase 6 with Loyalty service prerequisite and mid-session rewards
> **References**: [codex/LOYALTY_SERVICE_HANDOFF.md](./codex/LOYALTY_SERVICE_HANDOFF.md), [codex/LOYALTY_MID_SESSION_REWARD.md](./codex/LOYALTY_MID_SESSION_REWARD.md), [codex/RATINGSLIP_SCHEMA_AUDIT.md](./codex/RATINGSLIP_SCHEMA_AUDIT.md)

---

## 1. Objectives
- Preserve canonical bounded-context separation: RatingSlip gathers telemetry, Loyalty evaluates reward value.
- Enable both end-of-session accrual and mid-session adjustments (`manualReward`, `POINTS_UPDATE_REQUESTED`).
- Replace legacy schema artifacts that couple domains.
- Provide a clear wave-based execution model with quality gates and ownership.

---

## 2. Guiding Principles (from Canonical Docs)
- **Single Authoritative Mutator**: LoyaltyService is the only layer that changes point balances or writes to `loyalty_ledger`.
- **Event-Triggered Policy**: Domains emit telemetry events (`RATINGS_SLIP_COMPLETED`, `POINTS_UPDATE_REQUESTED`); Loyalty executes policy.
- **Idempotency First**: Use composite keys and soft-success semantics so duplicate rewards do not produce additional points.
- **Auditability**: Every reward delta is captured with `session_id`, `transaction_type`, `event_type`, `reason`, `source`.
- **Testable Modules**: RatingSlip closure and loyalty accrual must be testable in isolation.

---

## 3. Wave 0 – Mandatory Schema Corrections (Prerequisite)
Owner: Database/Platform (2.5h)

1. Apply `phase_6_wave_0_bounded_context_corrections.sql`:
   - Drop `ratingslip.points` column.
   - Drop `accrual_history` table.
   - Rebuild `close_player_session()` without loyalty parameters or updates.
   - Create enhanced `loyalty_ledger`:
     ```sql
     CREATE TABLE loyalty_ledger (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       player_id UUID NOT NULL REFERENCES player(id),
       rating_slip_id UUID REFERENCES ratingslip(id),
       visit_id UUID REFERENCES visit(id),
       session_id UUID,
       transaction_type TEXT NOT NULL,           -- 'GAMEPLAY', 'MANUAL_BONUS', 'PROMOTION', 'ADJUSTMENT'
       event_type TEXT,                          -- 'RATINGS_SLIP_COMPLETED', 'POINTS_UPDATE_REQUESTED', etc.
       points_change INTEGER NOT NULL,
       reason TEXT,
       source TEXT NOT NULL DEFAULT 'system',    -- 'system', 'manual', 'promotion'
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     ```
   - Add idempotency index *(aligning both docs)*: `CREATE UNIQUE INDEX idx_loyalty_ledger_session_type_source ON loyalty_ledger (session_id, transaction_type, source) WHERE session_id IS NOT NULL;`
2. Update `player_loyalty` to canonical shape:
   ```sql
   CREATE TABLE player_loyalty (
     player_id UUID PRIMARY KEY REFERENCES player(id),
     current_balance INTEGER NOT NULL DEFAULT 0,
     lifetime_points INTEGER NOT NULL DEFAULT 0,
     tier TEXT NOT NULL DEFAULT 'BRONZE',
     tier_progress INTEGER DEFAULT 0,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     CONSTRAINT chk_tier_progress_percent CHECK (tier_progress BETWEEN 0 AND 100)
   );
   ```
3. Seed `loyalty_tier` table and ensure it is referenced by RPC.
4. Grant permissions for LoyaltyService (supabase roles) to `loyalty_ledger`, `player_loyalty`, `loyalty_tier`.
5. Backfill: migrate historical points from legacy tables into the new ledger using signed deltas (single script).

**Exit Criteria**
- Legacy columns/tables removed.
- New ledger schema and indexes present.
- `close_player_session()` no longer references points.
- Backfill verified via spot checks.

---

## 4. Track Overview & Timeline (18–21h parallelized)

| Track | Focus | Prereq | Waves |
| ----- | ----- | ------ | ----- |
| **T0** | Loyalty horizontal | Wave 0 complete | Waves 1–2 |
| **T1** | RatingSlip integration | After T0.Wave1 API ready | Waves 2–3 |
| **T2** | MTL vertical | After Wave 0 (independent) | Waves 1–3 |

---

## 5. Wave Breakdown

### Wave 1 – Loyalty Service Foundation (T0) — 8h
Deliverables:
- `services/loyalty/index.ts` interface per handoff, with `calculateAndAssignPoints`, `manualReward`, query methods.
- `business.ts`: reuse PT-1 logic, add tier multiplier support.
- `crud.ts`: helpers for inserting ledger rows (using signed deltas) and updating balances.
- `rpc` migration: `increment_player_loyalty(player_id UUID, delta_points INTEGER)` returning `(current_balance, tier)` and locking the `player_loyalty` row (`FOR UPDATE`) to prevent concurrent balance races.
- `manualReward` implementation:
  - Writes ledger row with `transaction_type = 'MANUAL_BONUS'` or `'PROMOTION'`.
  - Uses `INSERT ... ON CONFLICT` against the composite index; on conflict returns existing balance (idempotent soft success).
  - Calls RPC and returns `(newBalance, tier)`.
- Unit tests covering calculation parity and idempotent manual reward.

Quality Gates:
- >80% coverage for `services/loyalty/business.ts` and `manualReward` path.
- Duplicate manual reward results in `success: true` with unchanged balance.
- RPC verified to update `current_balance`, `lifetime_points`, and `tier`.

### Wave 2 – Event & API Integration (T0 + T1) — 7h
Deliverables:
- Event listener registrations in LoyaltyService for:
  - `RATINGS_SLIP_COMPLETED` → `transaction_type = 'GAMEPLAY'`, `event_type = 'RATINGS_SLIP_COMPLETED'`.
  - `POINTS_UPDATE_REQUESTED` → `transaction_type = 'MANUAL_BONUS' | 'PROMOTION'`, `event_type = 'POINTS_UPDATE_REQUESTED'`.
- Event dispatcher abstraction (`emitEvent(type, payload)`) wrapping Supabase triggers today, swappable for queue workers without touching domain services.
- Server actions / mutations exposed to staff UIs:
  - `calculateAndAssignPoints` consumed by RatingSlip completion flow.
  - `manualReward` mutation for staff tools.
- RatingSlip service updates:
  - Completion path emits telemetry event then awaits loyalty response; no direct point writes.
  - `closeRatingSlip` ensures `points` removed from DB state (relies on new schema).
- API contract docs shared with MTL team (DTO schemas).

Quality Gates:
- Integration test: RatingSlip completion → ledger row with `transaction_type = 'GAMEPLAY'`.
- Integration test: manual reward via action → ledger row with `MANUAL_BONUS` and tier update.
- Event bus replay proves idempotency (duplicate event yields single ledger row).

### Wave 3 – Vertical Feature Completion (T1 + T2) — 6h
Deliverables:
- RatingSlip UI reflects loyalty response (points summary, tier, manual reward feedback).
- MTL workflows consume loyalty data via new queries (hooks).
- Analytics/marketing emit `PointsAccrued` (optional stub) per canonical handoff.
- E2E tests across RatingSlip + Loyalty + MTL flows.

Quality Gates:
- UI acceptance: mid-session reward visible within 2s (RPC + ledger update).
- E2E: mid-session bonus + end-of-session accrual accumulate correctly.
- Accessibility & localization checks for new UI surfaces.

---

## 6. Testing & Monitoring Strategy
- **Unit**: Calculation logic, ledger CRUD, RPC function (pgTAP or Supabase test harness).
- **Integration**: Supabase + server actions verifying both event-triggered and direct calls.
- **E2E**: Cypress/Playwright flow for manual reward followed by session close.
- **Observability**: Emit structured logs for each loyalty mutation using `{ event_type, player_id, session_id, delta_points, transaction_type, tier_before, tier_after }` so downstream dashboards stay consistent.
- **Backfill Validation**: SQL queries comparing legacy totals vs new `player_loyalty.current_balance` post-migration.
- **Operational Replay**: Maintain documented SQL/Supabase script to rebuild `player_loyalty` from `loyalty_ledger` for rollback drills.

---

## 7. Risk Mitigation
- **Schema Drift**: Lock migrations before Wave 1; any change requires rerunning idempotency/backfill scripts.
- **Event Ordering**: Use UPSERT + timestamps so duplicate/late events cannot double count.
- **Performance**: RPC indices on `player_loyalty.player_id`; monitor Supabase function latency during load testing.
- **Staff Tool Abuse**: Rate-limit `manualReward` action and require audit reason (enforced non-null).

---

## 8. Definition of Done (Phase 6)
1. LoyaltyService owns all point mutations and exposes `manualReward` & `calculateAndAssignPoints`.
2. RatingSlip no longer stores points data; emits telemetry event and consumes loyalty response.
3. `POINTS_UPDATE_REQUESTED` and manual pathway both produce ledger rows with correct metadata.
4. Idempotency validated for mid-session rewards (soft-success conflict handling).
5. `player_loyalty` is accurate after migrations and during real-time accruals.
6. MTL workflows operate against new loyalty APIs with automated tests in place.
7. Observability dashboards updated to monitor loyalty deltas post-launch.

---

## 9. Handoff Checklist
- [ ] Migration scripts merged and approved by DB owner.
- [ ] Loyalty service package published with documentation.
- [ ] RatingSlip + MTL teams trained on new APIs/events.
- [ ] Rollback plan documented (SQL/Supabase script to rebuild `player_loyalty` from `loyalty_ledger` deltas).
- [ ] Post-launch review scheduled (48h) to confirm zero drift between ledger and player balances.
