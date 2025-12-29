# Points Accrual Calculation Telemetry Report

**Issue:** ISSUE-752833A6 - Policy Snapshot Remediation
**Timestamp:** 2025-12-28T09:19:19.805Z
**Test File:** `points-accrual-calculation.integration.test.ts`

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total Tests** | 6 |
| **Passed** | 6 |
| **Failed** | 0 |
| **Pass Rate** | 100% |
| **Total Execution Time** | 23.054s |

---

## Formula Validation

The tests validated the deterministic accrual formulas from ADR-019:

```
Theo Formula:
  theo = avg_bet × (house_edge/100) × (duration_seconds/3600) × decisions_per_hour

Points Formula:
  points = ROUND(theo × points_conversion_rate)
```

---

## Test Scenarios with Minted Telemetry

### Scenario 1: 2-hour Standard Session ($50 avg bet)

| Field | Expected | Actual | Variance |
|-------|----------|--------|----------|
| **Theo** | $105.00 | $105.00 | 0.000000 |
| **Points** | 1,050 | 1,050 | 0 |
| **Balance After** | - | 1,050 | - |
| **Execution** | - | 1,688ms | - |
| **Status** | PASS | | |

**Inputs:**
- avg_bet: $50
- house_edge: 1.5%
- decisions/hr: 70
- conversion_rate: 10
- duration: 7200s (2.00h)

---

### Scenario 2: 30-minute Short Session ($50 avg bet)

| Field | Expected | Actual | Variance |
|-------|----------|--------|----------|
| **Theo** | $26.25 | $26.25 | 0.000000 |
| **Points** | 263 | 263 | 0 |
| **Balance After** | - | 263 | - |
| **Execution** | - | 1,528ms | - |
| **Status** | PASS | | |

**Inputs:**
- avg_bet: $50
- house_edge: 1.5%
- decisions/hr: 70
- conversion_rate: 10
- duration: 1800s (0.50h)

---

### Scenario 3: 4-hour High-Roller Session ($500 avg bet)

| Field | Expected | Actual | Variance |
|-------|----------|--------|----------|
| **Theo** | $2,100.00 | $2,100.00 | 0.000000 |
| **Points** | 21,000 | 21,000 | 0 |
| **Balance After** | - | 21,000 | - |
| **Execution** | - | 1,642ms | - |
| **Status** | PASS | | |

**Inputs:**
- avg_bet: $500
- house_edge: 1.5%
- decisions/hr: 70
- conversion_rate: 10
- duration: 14400s (4.00h)

---

### Scenario 4: VIP Tier Session ($100 avg bet, 2hr)

| Field | Expected | Actual | Variance |
|-------|----------|--------|----------|
| **Theo** | $210.00 | $210.00 | 0.000000 |
| **Points** | 2,100 | 2,100 | 0 |
| **Balance After** | - | 2,100 | - |
| **Execution** | - | 1,575ms | - |
| **Status** | PASS | | |

**Inputs:**
- avg_bet: $100
- house_edge: 1.5%
- decisions/hr: 70
- conversion_rate: 10
- duration: 7200s (2.00h)

---

### Scenario 5: Zero Duration Edge Case

| Field | Expected | Actual | Variance |
|-------|----------|--------|----------|
| **Theo** | $0.00 | $0.00 | 0.000000 |
| **Points** | 0 | 0 | 0 |
| **Balance After** | - | 0 | - |
| **Execution** | - | 1,611ms | - |
| **Status** | PASS | | |

**Inputs:**
- avg_bet: $100
- house_edge: 1.5%
- decisions/hr: 70
- conversion_rate: 10
- duration: 0s (0.00h)

---

### Scenario 6: Policy Snapshot Immutability

| Field | Expected | Actual | Variance |
|-------|----------|--------|----------|
| **Theo** | $105.00 | $105.00 | 0.000000 |
| **Points** | 1,050 | 1,050 | 0 |
| **Balance After** | - | 1,050 | - |
| **Execution** | - | 1,713ms | - |
| **Status** | PASS | | |

**Inputs:**
- avg_bet: $100
- house_edge: 1.5% (frozen at slip creation)
- decisions/hr: 70 (frozen at slip creation)
- conversion_rate: 10
- duration: 3600s (1.00h)

**Validation:** This test confirmed that live game_settings changes (99.9% house edge) mid-session do NOT affect closed slip accrual - the frozen `policy_snapshot.loyalty` values are used.

---

## Policy Parameters Validated

| Parameter | Value | Source |
|-----------|-------|--------|
| `house_edge` | 1.5% | game_settings -> policy_snapshot |
| `decisions_per_hour` | 70 | game_settings -> policy_snapshot |
| `points_conversion_rate` | 10.0 | game_settings -> policy_snapshot |
| `point_multiplier` | 1.0 | game_settings -> policy_snapshot |
| `policy_version` | loyalty_points_v1 | Hardcoded in RPC |

---

## Findings

1. **Theo calculation is exact** - Zero variance across all test durations (30min, 1hr, 2hr, 4hr)
2. **Points rounding is correct** - `ROUND()` applied properly
3. **Zero duration edge case handled** - Returns 0 theo/points without error
4. **Policy snapshot immutability verified** - Mid-session policy changes do not affect closed slip accrual
5. **Balance tracking accurate** - `player_loyalty.current_balance` correctly updated

---

## Related Files

- Test: `services/loyalty/__tests__/points-accrual-calculation.integration.test.ts`
- RPC: `supabase/migrations/20251227170840_harden_accrual_json_casting.sql`
- Formula: `supabase/migrations/20251213010000_prd004_loyalty_rpcs.sql`
- Issue: ISSUE-752833A6

---

## References

- ADR-019: Loyalty Points Policy
- PRD-004: Loyalty Service
- EXECUTION-SPEC WS1-WS4
