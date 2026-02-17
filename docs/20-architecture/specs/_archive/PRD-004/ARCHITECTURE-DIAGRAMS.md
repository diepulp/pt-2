---
id: PRD-004-DIAGRAMS
title: LoyaltyService Architecture Diagrams
owner: Backend Architect
status: Proposed
relates_to: [PRD-004, IDEMPOTENCY-AND-DRIFT-DETECTION-SPEC]
created: 2025-12-13
---

# LoyaltyService Architecture Diagrams

Visual representations of idempotency constraints and drift detection mechanisms.

---

## Diagram 1: Idempotency Index Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                      loyalty_ledger Table                       │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                         │
│ casino_id (FK)                                                  │
│ player_id (FK)                                                  │
│ points_delta (int, allows negative)                            │
│ reason (enum: base_accrual, promotion, redeem, ...)            │
│ source_kind (text: 'rating_slip', 'campaign', 'manual')        │
│ source_id (uuid: reference to source entity)                   │
│ idempotency_key (uuid: caller-supplied)                        │
│ metadata (jsonb: calculation provenance)                        │
│ note (text: staff notes for redemptions/manual ops)            │
│ created_at (timestamptz)                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
                    ┌─────────┴──────────┐
                    │  Unique Indexes    │
                    │  (Multi-Tier)      │
                    └─────────┬──────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Index 1     │    │  Index 2     │    │  Index 3     │
│ Base Accrual │    │  Promotion   │    │ Idempotency  │
│  Natural Key │    │  Natural Key │    │  Universal   │
└──────────────┘    └──────────────┘    └──────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ (casino_id,  │    │ (casino_id,  │    │ (casino_id,  │
│  source_kind,│    │  source_kind,│    │  idempotency_│
│  source_id,  │    │  source_id,  │    │  key)        │
│  reason)     │    │  campaign_id)│    │              │
│              │    │              │    │ WHERE        │
│ WHERE        │    │ WHERE        │    │ idempotency_ │
│ reason =     │    │ reason =     │    │ key IS NOT   │
│ 'base_       │    │ 'promotion'  │    │ NULL         │
│ accrual'     │    │              │    │              │
└──────────────┘    └──────────────┘    └──────────────┘

Protects:              Protects:         Protects:
✓ Double-minting       ✓ Duplicate       ✓ All operation
  base points            campaigns         types
✓ One per slip         ✓ Additive        ✓ HTTP retries
                         promos OK       ✓ Client crashes
```

---

## Diagram 2: Idempotent RPC Flow

```
┌────────────┐
│   Client   │
│  (Browser, │
│   Mobile)  │
└─────┬──────┘
      │ 1. Generate idempotency_key = uuidv4()
      │
      ▼
┌────────────────────────────────────────────┐
│  POST /api/v1/loyalty/accrue               │
│  {                                         │
│    rating_slip_id: "uuid",                 │
│    idempotency_key: "abc-123-def"          │
│  }                                         │
└─────┬──────────────────────────────────────┘
      │ 2. withServerAction middleware
      │
      ▼
┌────────────────────────────────────────────┐
│  LoyaltyService.accrueOnClose()            │
└─────┬──────────────────────────────────────┘
      │ 3. Call RPC
      │
      ▼
┌────────────────────────────────────────────┐
│  rpc_accrue_on_close(slip_id, idem_key)    │
│                                            │
│  Step 1: Check existing entry             │
│  ─────────────────────────────             │
│  SELECT id, points_delta                   │
│    FROM loyalty_ledger                     │
│   WHERE casino_id = auth.casino_id()       │
│     AND (                                  │
│       (source_kind = 'rating_slip'         │
│        AND source_id = p_rating_slip_id    │
│        AND reason = 'base_accrual')        │ ◄── Natural key
│       OR                                   │
│       (idempotency_key = p_idem_key)       │ ◄── Idempotency key
│     )                                      │
│   LIMIT 1;                                 │
│                                            │
│  IF FOUND:                                 │
│    RETURN {                                │
│      ledger_id: existing.id,               │
│      is_existing: true  ◄────────────────────── Idempotent return
│    }                                       │
│  END IF;                                   │
│                                            │
│  Step 2: Compute points                   │
│  ───────────────────────                   │
│  [Read policy_snapshot.loyalty]            │
│  [Compute theo, base_points]               │
│                                            │
│  Step 3: INSERT with idempotency           │
│  ────────────────────────────              │
│  INSERT INTO loyalty_ledger (...)          │
│  VALUES (..., p_idem_key, ...)             │
│  ON CONFLICT (casino_id, idempotency_key)  │
│    WHERE idempotency_key IS NOT NULL       │
│  DO NOTHING                                │ ◄── Conflict handling
│  RETURNING id INTO v_ledger_id;            │
│                                            │
│  IF v_ledger_id IS NULL:                   │
│    -- Conflict occurred, fetch existing   │
│    SELECT id INTO v_ledger_id              │
│      FROM loyalty_ledger                   │
│     WHERE idempotency_key = p_idem_key;    │
│                                            │
│    RETURN { ledger_id: v_ledger_id,        │
│             is_existing: true }            │
│  END IF;                                   │
│                                            │
│  Step 4: Update balance                   │
│  ───────────────────────                   │
│  UPDATE player_loyalty                     │
│     SET current_balance += points_delta    │
│                                            │
│  RETURN {                                  │
│    ledger_id: v_ledger_id,                 │
│    points_delta: ...,                      │
│    balance_after: ...,                     │
│    is_existing: false  ◄────────────────────── New entry
│  }                                         │
└────────────────────────────────────────────┘
```

**Key Properties:**
- ✅ First call creates entry, returns `is_existing: false`
- ✅ Duplicate calls return existing entry, `is_existing: true`
- ✅ No double-minting regardless of retry count
- ✅ Race-safe: database unique constraint is authoritative

---

## Diagram 3: Balance Drift Detection Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                  Drift Detection Layers                       │
└───────────────────────────────────────────────────────────────┘

TIER 1: PREVENTION (Transactional Integrity)
══════════════════════════════════════════════
┌────────────────────────────────────────────┐
│  Mutating RPC (redeem, accrue, etc.)       │
│                                            │
│  BEGIN TRANSACTION;                        │
│                                            │
│  1. Lock player_loyalty row                │
│     SELECT current_balance                 │
│       FROM player_loyalty                  │
│      WHERE player_id = ...                 │
│        FOR UPDATE;  ◄──────────────────────── Row lock
│                                            │
│  2. Insert ledger entry                    │
│     INSERT INTO loyalty_ledger (...)       │
│     VALUES (...);                          │
│                                            │
│  3. Update balance (same transaction)      │
│     UPDATE player_loyalty                  │
│        SET current_balance += delta;       │
│                                            │
│  COMMIT;  ◄────────────────────────────────── Atomic commit
│                                            │
│  Result: Both succeed or both fail         │
│          No partial writes possible        │
└────────────────────────────────────────────┘


TIER 2: DETECTION (Scheduled Reconciliation)
═════════════════════════════════════════════
┌────────────────────────────────────────────┐
│  check_loyalty_balance_drift()             │
│                                            │
│  WITH ledger_sums AS (                     │
│    SELECT player_id,                       │
│           SUM(points_delta) AS computed    │
│      FROM loyalty_ledger                   │
│     GROUP BY player_id                     │
│  )                                         │
│  SELECT pl.player_id,                      │
│         pl.current_balance,                │
│         ls.computed,                       │
│         (pl.current_balance -              │
│          ls.computed) AS drift  ◄──────────── Difference
│    FROM player_loyalty pl                  │
│    LEFT JOIN ledger_sums ls                │
│      ON pl.player_id = ls.player_id        │
│   WHERE ABS(drift) > threshold;            │
└────────────────────────────────────────────┘
                    │
                    │ Scheduled execution
                    ▼
┌────────────────────────────────────────────┐
│  Cron Job (pg_cron or Vercel Cron)        │
│                                            │
│  Schedule: 0 3 * * * (3 AM daily)          │
│                                            │
│  Action:                                   │
│    results = check_loyalty_balance_drift() │
│                                            │
│    if results.length > 0:                  │
│      insert into audit_log (...)           │
│      send_alert(results)                   │
└────────────────────────────────────────────┘


TIER 3: ALERTING (Operational Response)
════════════════════════════════════════
┌────────────────────────────────────────────┐
│  Drift Detected                            │
│                                            │
│  Player: alice-uuid                        │
│  Current Balance: 10,000                   │
│  Computed Balance: 8,500                   │
│  Drift: +1,500                             │
│  Severity: CRITICAL (>1000)                │
└────────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────┐
│  Alert Routing                             │
│                                            │
│  if ABS(drift) > 1000:                     │
│    → PagerDuty: Page on-call engineer      │
│                                            │
│  else if ABS(drift) > 100:                 │
│    → Slack: Notify ops channel             │
│                                            │
│  else:                                     │
│    → Audit log only                        │
└────────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────┐
│  Manual Reconciliation                     │
│                                            │
│  UPDATE player_loyalty                     │
│     SET current_balance = (                │
│       SELECT SUM(points_delta)             │
│         FROM loyalty_ledger                │
│        WHERE player_id = 'alice-uuid'      │
│     )                                      │
│   WHERE player_id = 'alice-uuid';          │
│                                            │
│  [Log reconciliation to audit_log]         │
└────────────────────────────────────────────┘
```

---

## Diagram 4: Operation Type Constraints Matrix

```
┌───────────────────────────────────────────────────────────────────┐
│                  Idempotency Constraint Matrix                    │
├─────────────┬────────────────┬─────────────┬─────────────────────┤
│ Operation   │ Natural Key    │ Idem Key    │ Constraint Logic    │
├─────────────┼────────────────┼─────────────┼─────────────────────┤
│ base_       │ ✅ REQUIRED    │ ✅ REQUIRED │ One per slip        │
│ accrual     │ (casino,       │             │ Double protection:  │
│             │  source_kind,  │             │ - Natural key       │
│             │  source_id,    │             │ - Idempotency key   │
│             │  reason)       │             │                     │
├─────────────┼────────────────┼─────────────┼─────────────────────┤
│ promotion   │ ✅ RECOMMENDED │ ✅ REQUIRED │ One per campaign    │
│             │ (casino,       │             │ per slip/context    │
│             │  source_kind,  │             │ Multiple campaigns  │
│             │  source_id,    │             │ on same slip OK     │
│             │  campaign_id)  │             │                     │
├─────────────┼────────────────┼─────────────┼─────────────────────┤
│ redeem      │ ❌ No natural  │ ✅ REQUIRED │ Multiple redemptions│
│             │ key            │ (only)      │ allowed per player  │
│             │                │             │ Idempotency prevents│
│             │                │             │ duplicate comp      │
├─────────────┼────────────────┼─────────────┼─────────────────────┤
│ manual_     │ ❌ No natural  │ ✅ REQUIRED │ Staff can award     │
│ reward      │ key            │ (only)      │ multiple times      │
│             │                │             │ Idempotency prevents│
│             │                │             │ double-click        │
├─────────────┼────────────────┼─────────────┼─────────────────────┤
│ adjustment  │ ❌ No natural  │ ✅ REQUIRED │ Admin corrections   │
│             │ key            │ (only)      │ Idempotency prevents│
│             │                │             │ double-apply        │
├─────────────┼────────────────┼─────────────┼─────────────────────┤
│ reversal    │ ⚠️ OPTIONAL    │ ✅ REQUIRED │ Optional: one       │
│             │ (casino,       │             │ reversal per entry  │
│             │  reversed_     │             │ Prevents double-    │
│             │  ledger_id)    │             │ reversal            │
└─────────────┴────────────────┴─────────────┴─────────────────────┘

Legend:
  ✅ REQUIRED - Must have unique index
  ✅ RECOMMENDED - Should have unique index (business logic dependent)
  ⚠️ OPTIONAL - Consider based on business rules
  ❌ No natural key - Relies solely on idempotency_key
```

---

## Diagram 5: Concurrent Redemption Safety

```
Timeline: Two pit bosses redeem simultaneously
══════════════════════════════════════════════

T0: Player balance = 1000 points
    ─────────────────────────────

     Boss A                       Boss B
       │                            │
       │ Redeem 500 points          │ Redeem 300 points
       │                            │
       ▼                            ▼
T1: SELECT ... FOR UPDATE       (BLOCKED)
    ──────────────────────
    current_balance = 1000
    Row locked ◄─────────────────── Boss B waits
       │
       │
T2: INSERT ledger (-500)
    UPDATE balance = 500
    COMMIT
    ──────────────────────
    Row unlocked
       │                            │
       │                            ▼
T3:                             SELECT ... FOR UPDATE
                                ──────────────────────
                                current_balance = 500
                                Row locked
                                    │
                                    │
T4:                             INSERT ledger (-300)
                                UPDATE balance = 200
                                COMMIT
                                ──────────────────────

RESULT:
  Final balance = 200
  Ledger entries: -500, -300
  SUM(ledger) = -800
  Starting balance = 1000
  Final balance = 1000 - 800 = 200 ✅ CORRECT

WITHOUT ROW LOCKING:
  Boss A reads balance = 1000
  Boss B reads balance = 1000  ◄── RACE CONDITION
  Boss A writes balance = 500
  Boss B writes balance = 700  ◄── OVERWRITES Boss A
  Final balance = 700 ❌ WRONG (should be 200)
  DRIFT = 500 points lost
```

**Protection Mechanism:**
- `SELECT ... FOR UPDATE` acquires row-level lock
- Second transaction waits (serialized execution)
- Both transactions see correct sequential state
- Final balance matches ledger sum

---

## Diagram 6: Test Coverage Map

```
┌─────────────────────────────────────────────────────────────┐
│                     Test Coverage Layers                    │
└─────────────────────────────────────────────────────────────┘

UNIT TESTS
══════════
┌────────────────────────────────────────┐
│ Mapper Tests                           │
│ ─────────────                          │
│ ✓ Row → DTO transformations            │
│ ✓ No 'as' casting                      │
│ ✓ Null handling                        │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ Schema Validation                      │
│ ──────────────────                     │
│ ✓ Zod schemas match DTO types          │
│ ✓ Error messages actionable            │
└────────────────────────────────────────┘


INTEGRATION TESTS
═════════════════
┌────────────────────────────────────────┐
│ Idempotency Tests                      │
│ ──────────────────                     │
│ ✓ Duplicate call returns existing      │
│ ✓ is_existing: true on second call     │
│ ✓ Balance not double-updated           │
│ ✓ Ledger entry count = 1               │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ Concurrency Tests                      │
│ ──────────────────                     │
│ ✓ Parallel redemptions (no race)       │
│ ✓ Final balance = SUM(ledger)          │
│ ✓ No lost updates                      │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ RLS Policy Tests                       │
│ ───────────────                        │
│ ✓ Casino isolation (no cross-leak)     │
│ ✓ Role gates (pit_boss vs dealer)      │
│ ✓ Append-only (UPDATE/DELETE denied)   │
└────────────────────────────────────────┘


DRIFT DETECTION TESTS
═════════════════════
┌────────────────────────────────────────┐
│ SQL Assertions                         │
│ ──────────────                         │
│ ✓ Balance = SUM(points_delta)          │
│   after each operation                 │
│ ✓ Drift function detects manual edits  │
│ ✓ Reconciliation fixes drift           │
└────────────────────────────────────────┘


GOLDEN FIXTURES
═══════════════
┌────────────────────────────────────────┐
│ Reference Formula Tests                │
│ ────────────────────────               │
│ ✓ TS theo formula = DB RPC output      │
│ ✓ Same inputs → same points            │
│ ✓ Snapshot stability (history immutable)│
└────────────────────────────────────────┘
```

---

## Summary

**Idempotency Strategy:**
- Multi-tier: Natural keys (business logic) + Universal idempotency key (retry safety)
- 4 unique indexes: base_accrual, promotion, reversal, idempotency_key
- RPC pattern: Check existing → INSERT with ON CONFLICT → Handle conflict

**Drift Detection Strategy:**
- Tier 1: Prevention via transactional integrity + row locking
- Tier 2: Detection via scheduled reconciliation check
- Tier 3: Alerting via audit log + severity-based routing

**Why This Works:**
- ✅ Database constraints are authoritative (not app-level checks)
- ✅ Append-only ledger simplifies reconciliation (no UPDATE/DELETE)
- ✅ Row locking prevents race conditions
- ✅ Scheduled checks catch all drift sources
- ✅ Guardrails-compliant (no over-engineering)

---

**Full Specification**: `/home/diepulp/projects/pt-2/docs/20-architecture/specs/PRD-004/IDEMPOTENCY-AND-DRIFT-DETECTION-SPEC.md`
