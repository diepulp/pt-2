# PRD-004 — Mid-Session Loyalty

## 1. Overview
- **Owner:** Product
- **Status:** Draft
- **Summary:** Enable pit supervisors to issue loyalty rewards to players during active play. This is the core value proposition for players—recognition while they're still at the table, not hours later. Rewards must be idempotent (no duplicates on retry) and auditable (who issued what, when, why).

## 2. Problem & Goals

### 2.1 Problem
Players currently receive no in-session recognition for their play. Rewards are batched and issued after the fact, missing the psychological moment when players feel valued. Additionally, manual reward processes risk duplicate issuance, creating accounting discrepancies and player confusion.

### 2.2 Goals
- Supervisors can issue points to players with active rating slips
- Rewards are idempotent (same request = same result, no duplicates)
- Reward history visible on slip UI (who/when/why/amount)
- Player's loyalty balance updates atomically with reward issuance
- All rewards auditable with full context (slip, visit, staff, reason)

### 2.3 Non-Goals
- Points calculation formulas or theo-based auto-rewards (manual entry only for MVP)
- Points redemption or conversion to comps/cash
- Tier progression or tier-based multipliers
- Loyalty program configuration UI
- Reward notifications or player-facing alerts

## 3. Users & Use Cases
- **Primary users:** Pit Boss / Floor Supervisor

**Top Jobs:**
- As a Pit Boss, I need to issue a reward so that the player feels recognized during play.
- As a Pit Boss, I need to see rewards already issued to this slip so I don't over-reward.
- As a Pit Boss, I need confidence that retrying a failed request won't create duplicates.
- As a Pit Boss, I need to record why I issued a reward for audit purposes.

## 4. Scope & Feature List

**Reward Issuance:**
- Issue points via `rpc_issue_mid_session_reward` RPC
- Requires: `casino_id`, `player_id`, `rating_slip_id`, `staff_id`, `points`, `idempotency_key`, `reason`
- Atomically appends to `loyalty_ledger` and updates `player_loyalty` balance
- Returns existing record if idempotency key matches (no duplicate)

**Reward Display:**
- Show rewards issued to current slip (from `loyalty_ledger`)
- Display: points, staff name, timestamp, reason
- Show player's current balance (from `player_loyalty`)

**Validation:**
- Slip must be `open` or `paused` (not `closed`)
- Casino alignment: slip's casino must match reward request
- Player alignment: slip's player must match reward request

## 5. Requirements

### 5.1 Functional Requirements
- RPC enforces idempotency via unique constraint on `idempotency_key`
- Ledger entry captures: `player_id`, `casino_id`, `visit_id`, `rating_slip_id`, `staff_id`, `points`, `reason`, `created_at`
- Balance update is atomic with ledger append (single transaction)
- Reward rejected if slip status is `closed`
- `loyalty_reason` enum values: `mid_session_bonus`, `supervisor_discretion`, `promotion`, `correction`

### 5.2 Non-Functional Requirements
- Reward RPC latency p95 < 500ms
- Idempotent replay returns within 200ms (cache hit)
- UI reflects new reward within 2s

> Architecture details: see `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (LoyaltyService section)

## 6. UX / Flow Overview
1. Supervisor views active slip → sees player info and any prior rewards
2. Taps "Issue Reward" → enters points amount and selects reason
3. Confirms → RPC called with generated idempotency key
4. Success → reward appears in slip's reward list, balance updates
5. Network retry → same idempotency key → no duplicate, same response

## 7. Dependencies & Risks

### 7.1 Dependencies
- RatingSlipService: Active slip required (PRD-002)
- VisitService: Visit context for ledger entry (PRD-003)
- CasinoService: Staff auth, casino alignment validation
- Schema: `loyalty_ledger`, `player_loyalty` tables with idempotency index

### 7.2 Risks & Open Questions
- **Risk:** RPC failure mid-transaction — Mitigate with DB transaction; idempotency handles retry
- **Risk:** Stale balance display — Use React Query invalidation on mutation success
- **Open:** Cap on points per issuance? — Recommend: Soft cap with override, not hard block

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Supervisor can issue reward to active slip via UI
- [ ] Reward appears in slip's reward list immediately
- [ ] Player balance updates atomically
- [ ] Duplicate requests (same idempotency key) return existing record

**Data & Integrity**
- [ ] Ledger entries are append-only (no updates/deletes)
- [ ] Balance always equals sum of ledger entries for player/casino
- [ ] Idempotency key uniqueness enforced at DB level

**Security & Access**
- [ ] RLS: Only pit_boss/admin can call reward RPC
- [ ] RLS: Staff can only issue rewards for own casino
- [ ] Direct INSERT to `loyalty_ledger` blocked (RPC only)

**Testing**
- [ ] Unit test: idempotency returns existing record
- [ ] Integration test: ledger + balance atomic update
- [ ] Integration test: closed slip rejection
- [ ] One E2E test: issue reward → see in list → verify balance

**Operational Readiness**
- [ ] Structured logs for reward issuance (including idempotency hits)
- [ ] Alert on RPC failure rate > threshold

**Documentation**
- [ ] RPC contract documented with all parameters
- [ ] Idempotency key generation pattern documented

## 9. Related Documents
- Vision / Strategy: `docs/00-vision/VIS-001-VISION-AND-SCOPE.md`
- Architecture / SRM: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- Schema / Types: `types/database.types.ts`
- QA Standards: `docs/40-quality/QA-001-service-testing-strategy.md`
- Service README: `services/loyalty/README.md`
- Depends on: PRD-002 (Rating Slips), PRD-003 (Visits)
