---
id: PRD-004
title: Loyalty Service - Ledger-Based Points System
owner: Product
status: Proposed
affects: [ADR-019, ADR-015, SEC-003, SRM-4.4.0, PRD-002, PRD-003, PRD-008]
created: 2025-12-12
last_review: 2025-12-12
phase: Phase 3 (Rewards)
pattern: A
http_boundary: true
version: 3.0.0
---

# PRD-004 — Loyalty Service: Ledger-Based Points System

## 1. Overview

- **Owner:** Product
- **Status:** Proposed (v3.0.0)
- **Summary:** LoyaltyService implements an append-only ledger-based points system with **four distinct paths**: (1) deterministic base accrual on rating slip close, (2) promotional overlays, (3) comp issuance/redemption (debits), and (4) manual credits/corrections. This version corrects the semantic confusion between "mid-session rewards" (which were actually comp issuance debits) and true accrual (which happens only on slip close). The service enforces DB-authoritative minting, controlled overdraw with role gates, and full audit provenance per ADR-019 v2.

**Policy Authority:** `docs/00-vision/LoyaltyService_Points_Policy_PT-2.md`
**Architecture Decision:** `docs/80-adrs/ADR-019-loyalty-points-policy_v2.md`

---

## 2. Problem & Goals

### 2.1 Problem

The prior loyalty implementation conflated credits and debits:
- "Mid-session rewards" were actually **comp issuance** (debits from player balance), not credits
- Base accrual lacked deterministic theo-based calculation
- Caller-supplied point values bypassed policy enforcement
- Insufficient audit provenance for compliance and dispute resolution
- No controlled overdraw policy for exceptional comps

Casino operations need clear semantics: players **earn** points through gameplay (credits) and **spend** points on comps (debits). These are fundamentally different operations that must never be conflated.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Deterministic base accrual | Points = f(theo) computed from snapshot; same inputs always produce same output |
| **G2**: Clear credit/debit separation | Comp issuance creates negative ledger entries (reason=`redeem`), never positive |
| **G3**: Full audit provenance | Every ledger entry explainable from its record alone (metadata captures calculation) |
| **G4**: Controlled overdraw | Balance can go negative only with role-authorized approval + documented reason |
| **G5**: Idempotent operations | Duplicate requests with same idempotency_key return existing entry (no double-mint/spend) |

### 2.3 Non-Goals

- **Tier progression rules** — Future enhancement
- **Point expiration policies** — Future enhancement
- **External reward program integrations** — Out of scope
- **Promotional campaign management UI** — Post-MVP (API support only)
- **Seat bonus in base accrual** — Excluded per policy; becomes promotion if needed
- **"Flat points" awards** — Not part of base policy; use manual_reward path

---

## 3. Users & Use Cases

- **Primary users:** Pit Boss, Floor Supervisor, Cashier

**Top Jobs:**

- As a **Pit Boss**, I need to see a player's current point balance during a session so that I can make comp decisions proportional to their play.
- As a **Pit Boss**, I need to issue a comp (meal, show, etc.) and have the point cost automatically debited so that the player can receive the benefit and the system tracks the redemption.
- As a **Pit Boss**, I need to award manual credit points (service recovery, high-value player appreciation) so that I can handle exceptional situations with documented justification.
- As a **Floor Supervisor**, I need to review the player's ledger history so that I can understand their earn/burn patterns and identify potential issues.
- As an **Admin**, I need to reverse or adjust prior entries so that I can correct mistakes while maintaining audit trail.

---

## 4. Scope & Feature List

### 4.1 In Scope (MVP)

**Path 1: Base Accrual (Deterministic Credit)**
- Trigger on rating slip close (status transition to `closed`)
- Compute theo from snapshotted values: `average_bet`, `duration`, `house_edge`, `decisions_per_hour`, `points_conversion_rate`
- Formula: `base_points = round(theo * points_conversion_rate)` where `theo = (average_bet * house_edge/100) * (duration_hours * decisions_per_hour)`
- Mint single ledger entry with `reason='base_accrual'`
- Idempotent: duplicate calls return existing entry

**Path 2: Promotions (Overlay Credit)** — API only, no management UI
- Accept campaign_id, multiplier or bonus_points
- Mint separate ledger entry with `reason='promotion'`
- Idempotent per (campaign_id, source_id)

**Path 3: Comp Issuance / Redemption (Debit)**
- Pit boss selects comp with point cost X
- System debits balance: `points_delta = -X`
- Ledger entry with `reason='redeem'`
- Requires: `staff_id`, mandatory `note`, optional `reward_id`/`reference`
- Controlled overdraw: role-gated approval if balance would go negative

**Path 4: Manual Credits / Corrections**
- `manual_reward`: Goodwill credit with `awarded_by_staff_id` + mandatory `note`
- `adjustment`: Admin correction (may be +/-)
- `reversal`: Reversal of prior entry (references original `ledger_id`)

**Balance Management**
- Get player loyalty balance (per casino)
- Initialize player loyalty record on first transaction (upsert pattern)
- Row locking for concurrent balance updates (`SELECT ... FOR UPDATE`)

**Ledger Operations**
- List ledger entries with cursor pagination (by casino, player, rating_slip, date range)
- Immutable: no UPDATE or DELETE on ledger entries
- All entries carry `casino_id`, `idempotency_key`, full metadata

**Suggestion Helper (UI Support)**
- `evaluate_session_reward_suggestion`: Returns estimated theo/points for current session state
- Pure read-only function (no minting, no balance changes)
- Used by UI to show "suggested comp value" during active sessions

### 4.2 Out of Scope

- Promotional campaign management UI (post-MVP)
- Tier progression and level-up workflows
- Point expiration and decay policies
- External loyalty program integrations
- `loyalty_outbox` worker processing (deferred)
- Seat bonus calculation (becomes promotion if needed)

---

## 5. Requirements

### 5.1 Functional Requirements

**Base Accrual (Path 1)**
- FR-1: On rating slip close, system MUST compute theo from `policy_snapshot.loyalty` fields
- FR-2: Base accrual MUST be idempotent per rating slip (one entry per slip)
- FR-3: Base accrual MUST NOT mint negative points (`theo <= 0` → `base_points = 0`)
- FR-4: Base accrual MUST store calculation inputs in ledger `metadata` for audit

**Comp Issuance (Path 3)**
- FR-5: Redemption MUST create ledger entry with `points_delta < 0` (negative)
- FR-6: Redemption MUST return `balance_before`, `balance_after`, `overdraw_applied`
- FR-7: Redemption without sufficient balance MUST be rejected unless `allow_overdraw=true` AND caller has authority
- FR-8: Overdraw MUST be capped at `max_overdraw_points_per_redeem` (default: 5000)
- FR-9: Redemption MUST require `issued_by_staff_id` and mandatory `note`

**Manual Credits (Path 4)**
- FR-10: Manual credit MUST require `awarded_by_staff_id` and mandatory `note`
- FR-11: Adjustments/reversals MUST be admin-only (role-gated)

**Idempotency & Concurrency**
- FR-12: All mutating RPCs MUST accept `idempotency_key` parameter
- FR-13: Duplicate `idempotency_key` MUST return existing entry without re-execution
- FR-14: Balance updates MUST use row-level locking to prevent race conditions

**Authorization**
- FR-15: All loyalty RPCs MUST be `SECURITY INVOKER` (no `SECURITY DEFINER`)
- FR-16: RLS policies MUST enforce casino-scoped isolation
- FR-17: Comp issuance (redeem): `pit_boss`, `cashier`, `admin` roles only
- FR-18: Overdraw approval: `pit_boss`, `admin` roles only
- FR-19: Manual credit: `pit_boss`, `admin` roles only
- FR-20: Adjustment/reversal: `admin` role only

### 5.2 Non-Functional Requirements

- **NFR-1**: Ledger writes must complete within 200ms p99
- **NFR-2**: Balance reads must complete within 50ms p99
- **NFR-3**: All ledger entries immutable (append-only; no UPDATE/DELETE)
- **NFR-4**: Audit compliance: every entry traceable to staff + reason

> Architecture details: See ADR-019 v2, SRM v4.4.0 (LoyaltyService), ADR-015 Pattern C

---

## 6. UX / Flow Overview

**Flow 1: Base Accrual on Slip Close**
1. Pit boss closes rating slip (sets end_time, status='closed')
2. System reads `policy_snapshot.loyalty` from slip
3. System computes theo and base_points
4. System inserts ledger entry (`reason='base_accrual'`)
5. System updates `player_loyalty.current_balance`
6. UI shows updated balance on player card

**Flow 2: Comp Issuance (Debit)**
1. Pit boss opens comp issuance modal for player
2. UI calls `evaluate_session_reward_suggestion` to show estimated session value
3. Pit boss selects comp type (e.g., "Meal - 500 points")
4. Pit boss enters required note ("High-value player, first visit")
5. System calls `rpc_redeem` with point cost, staff_id, note
6. If balance insufficient and `allow_overdraw=false`: reject with message
7. If overdraw approved: record approval, proceed with debit
8. System returns `balance_before`, `balance_after`
9. UI shows confirmation with new balance

**Flow 3: Manual Credit (Service Recovery)**
1. Pit boss opens manual award panel
2. Pit boss enters points amount and mandatory note
3. System calls `rpc_manual_credit` with points, staff_id, note
4. System inserts ledger entry (`reason='manual_reward'`)
5. System updates balance
6. UI shows confirmation

**Flow 4: View Ledger History**
1. Floor supervisor opens player detail panel
2. UI fetches paginated ledger entries
3. Each entry shows: date, reason, points_delta, staff who issued, note
4. Entries are immutable; reversals shown as separate entries

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **PRD-HZ-001 (withServerAction middleware)** — COMPLETE; provides auth, RLS, idempotency
- **PRD-002 (RatingSlipService)** — COMPLETE; slip close triggers base accrual
- **PRD-003 (VisitService)** — COMPLETE; visit context for ledger entries
- **ADR-015 (RLS Connection Pooling)** — COMPLETE; Pattern C hybrid context injection
- **ADR-019 v2 (Loyalty Points Policy)** — ACCEPTED; authoritative policy document

### 7.2 Risks & Open Questions

- **Risk: Snapshot population gaps** — If `policy_snapshot.loyalty` is null at slip close, base accrual fails. **Mitigation:** Validate snapshot completeness at slip creation; alert on missing snapshots.
- **Risk: Concurrent redemptions** — Two pit bosses redeeming simultaneously could cause race conditions. **Mitigation:** Row-level locking on `player_loyalty` (`SELECT FOR UPDATE`).
- **Risk: Overdraw abuse** — Staff could approve excessive overdraw. **Mitigation:** Caps (`max_overdraw_points_per_redeem`) + audit logging + supervisor review.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Base accrual mints correct points for known golden fixtures (theo + conversion)
- [ ] Base accrual is idempotent (double call does not double-mint)
- [ ] Comp issuance creates negative ledger entry and updates balance
- [ ] Redemption returns `balance_before`, `balance_after`, `overdraw_applied`
- [ ] Manual credit requires staff + note and mints positive entry
- [ ] Promotions add separate ledger entry (do not modify base accrual)
- [ ] `evaluate_session_reward_suggestion` returns estimated values without minting

**Data & Integrity**
- [ ] `policy_snapshot.loyalty` is sole input for deterministic minting
- [ ] No duplicate ledger entries for same `(casino_id, idempotency_key)`
- [ ] Balance equals SUM(points_delta) from ledger at all times
- [ ] Changing `game_settings` after slip close does not affect historical points (snapshot test)
- [ ] Append-only enforced: UPDATE/DELETE blocked by RLS

**Security & Access**
- [ ] All loyalty RPCs are `SECURITY INVOKER` (no `SECURITY DEFINER`)
- [ ] RLS enforces casino-scoped isolation
- [ ] Comp issuance requires `pit_boss|cashier|admin` role
- [ ] Overdraw requires `pit_boss|admin` role + caps enforced
- [ ] Manual credit requires `pit_boss|admin` role
- [ ] Adjustment/reversal requires `admin` role
- [ ] No cross-casino data leakage in integration tests

**Testing**
- [ ] Unit tests for mappers (Row -> DTO transformations)
- [ ] Integration tests for RPC idempotency behavior
- [ ] RLS policy enforcement tests (cross-casino isolation)
- [ ] Concurrent redemption test (no race conditions)
- [ ] Golden fixtures: TS reference formula matches DB RPC outputs

**Operational Readiness**
- [ ] Error responses include actionable messages
- [ ] Key operations logged with correlation IDs
- [ ] Rollback path: can soft-disable loyalty features via feature flag

**Documentation**
- [ ] Service README updated with pattern and usage
- [ ] Known limitations documented (e.g., no tier progression)
- [ ] ADR-019 validation checklist items addressed

---

## 9. Related Documents

- **Vision / Strategy**: `docs/00-vision/LoyaltyService_Points_Policy_PT-2.md`
- **Architecture / SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (LoyaltyService section)
- **ADR**: `docs/80-adrs/ADR-019-loyalty-points-policy_v2.md`
- **Schema / Types**: `types/database.types.ts` (player_loyalty, loyalty_ledger)
- **Security / RLS**: `docs/30-security/` (SEC-003 reward_issuer claim)
- **Prerequisite PRDs**: PRD-002 (RatingSlip), PRD-003 (Visit), PRD-HZ-001 (Infrastructure)
- **Downstream PRDs**: PRD-008 (Rating Slip Modal rewards section)

---

## Appendix A: Schema Reference

### Tables

```sql
-- player_loyalty (balance tracking)
-- PK: (player_id, casino_id) composite key
CREATE TABLE player_loyalty (
  player_id uuid NOT NULL REFERENCES player(id),
  casino_id uuid NOT NULL REFERENCES casino(id),
  current_balance int NOT NULL DEFAULT 0,  -- can go negative with overdraw
  tier text,
  preferences jsonb DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, casino_id)
);

-- loyalty_ledger (append-only transaction log)
-- Immutable: no UPDATE or DELETE allowed
CREATE TABLE loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES casino(id),
  player_id uuid NOT NULL REFERENCES player(id),
  rating_slip_id uuid REFERENCES rating_slip(id),
  visit_id uuid REFERENCES visit(id),
  staff_id uuid REFERENCES staff(id),
  points_delta int NOT NULL,  -- positive=credit, negative=debit
  reason loyalty_reason NOT NULL,
  idempotency_key uuid,  -- for deduplication
  source_kind text,      -- 'rating_slip', 'campaign', 'manual', etc.
  source_id uuid,        -- reference to source entity
  metadata jsonb NOT NULL DEFAULT '{}',  -- calculation provenance
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency enforcement (partial unique index)
CREATE UNIQUE INDEX ux_loyalty_ledger_idem
  ON loyalty_ledger (casino_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Base accrual uniqueness (one per rating slip)
CREATE UNIQUE INDEX ux_loyalty_ledger_base_accrual
  ON loyalty_ledger (casino_id, source_kind, source_id, reason)
  WHERE reason = 'base_accrual';
```

### Enum (Strategy B: Additive)

```sql
-- Canonical reason codes per ADR-019 v2
-- Legacy values may exist but are write-prohibited
CREATE TYPE loyalty_reason AS ENUM (
  'base_accrual',    -- deterministic slip close credit
  'promotion',       -- campaign/offer overlay credit
  'manual_reward',   -- pit boss discretion credit
  'redeem',          -- comp issuance debit
  'adjustment',      -- admin correction (+/-)
  'reversal'         -- reversal of prior entry
);

-- Migration: add new values if enum exists with old values
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'base_accrual';
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'promotion';
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'redeem';
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'manual_reward';
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'adjustment';
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'reversal';
```

### Snapshot Schema (in rating_slip.policy_snapshot)

```json
{
  "loyalty": {
    "house_edge": 1.5,
    "decisions_per_hour": 70,
    "points_conversion_rate": 10,
    "policy_version": "loyalty_points_v1"
  }
}
```

---

## Appendix B: RPC Contracts (Authoritative)

### 1) `rpc_accrue_on_close` (deterministic credit)

**Input:**
```typescript
{
  p_rating_slip_id: uuid,
  p_idempotency_key: uuid
}
```

**Output:**
```typescript
{
  ledger_id: uuid,
  points_delta: int,     // positive
  theo: numeric,
  balance_after: int,
  is_existing: boolean   // true if idempotent hit
}
```

**Behavior:** Computes theo/points from `policy_snapshot.loyalty`, inserts `base_accrual` entry if absent, updates balance. Returns existing entry if already accrued.

### 2) `rpc_redeem` (comp issuance / debit)

**Input:**
```typescript
{
  p_player_id: uuid,
  p_casino_id: uuid,
  p_points: int,               // comp cost (positive input)
  p_issued_by_staff_id: uuid,
  p_note: text,                // mandatory
  p_idempotency_key: uuid,
  p_allow_overdraw?: boolean,  // default false
  p_reward_id?: uuid,          // optional catalog item
  p_reference?: text           // receipt/voucher id
}
```

**Output:**
```typescript
{
  ledger_id: uuid,
  points_delta: int,           // negative
  balance_before: int,
  balance_after: int,
  overdraw_applied: boolean
}
```

**Behavior:** Validates sufficient balance (or overdraw approval), row-locks `player_loyalty`, inserts `redeem` entry with negative `points_delta`, updates balance.

### 3) `rpc_manual_credit` (service recovery credit)

**Input:**
```typescript
{
  p_player_id: uuid,
  p_casino_id: uuid,
  p_points: int,                // positive only
  p_awarded_by_staff_id: uuid,
  p_note: text,                 // mandatory
  p_idempotency_key: uuid,
  p_suggested_points?: int      // for audit context
}
```

**Output:**
```typescript
{
  ledger_id: uuid,
  points_delta: int,            // positive
  balance_after: int
}
```

### 4) `rpc_apply_promotion` (overlay credit)

**Input:**
```typescript
{
  p_rating_slip_id: uuid,
  p_campaign_id: text,
  p_promo_multiplier?: numeric,  // mutually exclusive
  p_bonus_points?: int,          // mutually exclusive
  p_idempotency_key: uuid
}
```

**Output:**
```typescript
{
  ledger_id: uuid,
  promo_points_delta: int
}
```

### 5) `evaluate_session_reward_suggestion` (read-only helper)

**Input:**
```typescript
{
  p_rating_slip_id: uuid,
  p_as_of_ts?: timestamptz       // defaults to now()
}
```

**Output:**
```typescript
{
  suggested_theo: numeric,
  suggested_points: int,
  policy_version: text,
  max_recommended_points?: int,
  notes?: text
}
```

**Behavior:** Pure read-only function. Does NOT mint, does NOT update balance. Used by UI for "suggested comp value" display.

---

## Appendix C: Error Codes

Per SRM Error Taxonomy:

**Loyalty Domain**
| Code | HTTP | Description |
|------|------|-------------|
| `LOYALTY_INSUFFICIENT_BALANCE` | 400 | Balance insufficient and overdraw not approved |
| `LOYALTY_OVERDRAW_NOT_AUTHORIZED` | 403 | Caller lacks authority to approve overdraw |
| `LOYALTY_OVERDRAW_EXCEEDS_CAP` | 400 | Overdraw amount exceeds `max_overdraw_points_per_redeem` |
| `LOYALTY_POINTS_INVALID` | 400 | Points must be positive integer (for credits) or valid cost (for debits) |
| `LOYALTY_IDEMPOTENCY_REQUIRED` | 400 | Idempotency key is required for mutations |
| `LOYALTY_NOTE_REQUIRED` | 400 | Note is required for redemptions and manual credits |
| `LOYALTY_PLAYER_NOT_FOUND` | 404 | Player loyalty record not found |
| `LOYALTY_SLIP_NOT_FOUND` | 404 | Referenced rating slip does not exist |
| `LOYALTY_SNAPSHOT_MISSING` | 400 | Rating slip lacks `policy_snapshot.loyalty` for base accrual |
| `LOYALTY_SLIP_NOT_CLOSED` | 400 | Base accrual requires slip status = 'closed' |

---

## Appendix D: Metadata Examples

### Base Accrual Metadata

```json
{
  "source": {
    "kind": "rating_slip",
    "id": "uuid",
    "casino_id": "uuid",
    "gaming_day": "2025-12-12"
  },
  "calc": {
    "average_bet": 100,
    "duration_minutes": 120,
    "house_edge_pct": 1.5,
    "decisions_per_hour": 70,
    "conversion_rate": 10,
    "theo": 210,
    "base_points": 2100,
    "rounding": "Math.round"
  },
  "policy": {
    "snapshot_ref": "rating_slip.policy_snapshot.loyalty",
    "version": "loyalty_points_v1"
  }
}
```

### Redemption Metadata

```json
{
  "redemption": {
    "reward_id": "uuid",
    "reference": "receipt/txn-id",
    "comp_type": "Meal"
  },
  "balance_before": 9000,
  "balance_after": 7000,
  "overdraw": null
}
```

### Overdraw Redemption Metadata

```json
{
  "redemption": {
    "reward_id": "uuid",
    "reference": "receipt/txn-id",
    "comp_type": "Show"
  },
  "balance_before": 500,
  "balance_after": -1500,
  "overdraw": {
    "allowed": true,
    "approved_by_staff_id": "uuid",
    "note": "VIP player service recovery"
  }
}
```

### Manual Credit Metadata

```json
{
  "awarded_by_staff_id": "uuid",
  "note": "Service recovery - dealer error on table 5",
  "suggested_points": 1500
}
```

---

## Appendix E: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-08 | Product | Initial draft |
| 2.0.0 | 2025-12-10 | Lead Architect | Added session-end reward, composite RPC |
| 2.2.0 | 2025-12-12 | Lead Architect | Clarified 4 award paths, credit/debit separation |
| 3.0.0 | 2025-12-12 | Lead Architect | **Complete rewrite** per ADR-019 v2: corrected "mid-session reward" to "comp issuance (debit)", new reason codes, snapshot canonical source, SECURITY INVOKER, controlled overdraw, idempotency_key, row locking |
