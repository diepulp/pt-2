# Migration Strategy: PRD-004 Loyalty Schema Evolution

**Document ID:** MIGRATION-STRATEGY-PRD-004
**Status:** Approved
**Date:** 2025-12-12
**Owner:** Lead Architect
**Relates to:** PRD-004, ADR-019 v2, WS1 (Database Layer - Schema Evolution)

---

## Executive Summary

**Schema is greenfield.** Migrations may be squashed/reset at will until first pilot data exists.

**No backward compatibility required.** Old enum values are removed.

**Seed scripts are the source of realism for testing.**

> **Note:** If/when pilot data exists, create ADR-0xx for production migration strategy.

---

## Schema Design

### Enum: `loyalty_reason`

Clean enum with canonical values only:

```sql
CREATE TYPE loyalty_reason AS ENUM (
  'base_accrual',    -- Deterministic theo-based credit on slip close
  'promotion',       -- Campaign/offer overlay credit
  'redeem',          -- Comp issuance (DEBIT, negative points_delta)
  'manual_reward',   -- Service recovery credit
  'adjustment',      -- Admin correction (can be +/-)
  'reversal'         -- Reverse a previous entry
);
```

### Table: `loyalty_ledger`

```sql
CREATE TABLE loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES casino(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  rating_slip_id uuid REFERENCES rating_slip(id) ON DELETE SET NULL,
  visit_id uuid REFERENCES visit(id) ON DELETE SET NULL,
  staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  points_delta int NOT NULL,           -- Positive=credit, negative=debit
  reason loyalty_reason NOT NULL,
  idempotency_key uuid,                -- UUID type per ADR-019
  source_kind text,                    -- 'rating_slip', 'campaign', 'manual', etc.
  source_id uuid,                      -- Reference to source entity
  metadata jsonb NOT NULL DEFAULT '{}',-- Calculation provenance
  note text,                           -- Required for redeem/adjustment (RPC-enforced)
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Casino-scoped idempotency
CREATE UNIQUE INDEX ux_loyalty_ledger_idem
  ON loyalty_ledger (casino_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Base accrual uniqueness (prevents double-minting per slip)
CREATE UNIQUE INDEX ux_loyalty_ledger_base_accrual
  ON loyalty_ledger (casino_id, source_kind, source_id, reason)
  WHERE reason = 'base_accrual';

-- Query indexes
CREATE INDEX ix_loyalty_ledger_player_time
  ON loyalty_ledger (player_id, created_at DESC);

CREATE INDEX ix_loyalty_ledger_rating_slip
  ON loyalty_ledger (rating_slip_id)
  WHERE rating_slip_id IS NOT NULL;
```

### Table: `player_loyalty`

```sql
CREATE TABLE player_loyalty (
  player_id uuid NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  casino_id uuid NOT NULL REFERENCES casino(id) ON DELETE CASCADE,
  current_balance int NOT NULL DEFAULT 0,  -- Can go negative with overdraw
  tier text,
  preferences jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, casino_id)
);
```

---

## RLS Policies

### Append-Only Enforcement

```sql
-- Deny UPDATE on loyalty_ledger (immutable)
CREATE POLICY loyalty_ledger_deny_update ON loyalty_ledger
  FOR UPDATE USING (false);

-- Deny DELETE on loyalty_ledger (immutable)
CREATE POLICY loyalty_ledger_deny_delete ON loyalty_ledger
  FOR DELETE USING (false);
```

### Casino Isolation (Hybrid per ADR-015)

```sql
-- SELECT: Casino-scoped
CREATE POLICY loyalty_ledger_select ON loyalty_ledger
  FOR SELECT USING (
    casino_id = COALESCE(
      current_setting('app.casino_id', true)::uuid,
      (auth.jwt()->>'casino_id')::uuid
    )
  );

-- INSERT: Casino-scoped + SECURITY INVOKER
CREATE POLICY loyalty_ledger_insert ON loyalty_ledger
  FOR INSERT WITH CHECK (
    casino_id = COALESCE(
      current_setting('app.casino_id', true)::uuid,
      (auth.jwt()->>'casino_id')::uuid
    )
  );
```

---

## Validation

### Balance Invariant

After any ledger operation:
```sql
SELECT
  pl.current_balance,
  COALESCE(SUM(ll.points_delta), 0) AS ledger_sum,
  pl.current_balance = COALESCE(SUM(ll.points_delta), 0) AS is_valid
FROM player_loyalty pl
LEFT JOIN loyalty_ledger ll USING (player_id, casino_id)
WHERE pl.player_id = $1 AND pl.casino_id = $2
GROUP BY pl.player_id, pl.casino_id, pl.current_balance;
```

---

## Seed Scripts

Test data for loyalty service lives in seed scripts. These provide:
- Sample players with loyalty balances
- Ledger entries covering all reason types
- Edge cases (overdraw, concurrent redemptions)
- Golden fixtures for theo calculation validation

---

## Future: Production Migration

> **If/when pilot data exists, create ADR-0xx for production migration.**
>
> That ADR will address:
> - Enum value mapping (if legacy values exist)
> - Data backfill strategies
> - Balance reconciliation
> - Rollback procedures
> - Downtime requirements
