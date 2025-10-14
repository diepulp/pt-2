# Wave 2 Pre-Implementation Verification Checklist

**Date**: 2025-10-13
**Status**: 🔴 **NOT READY** (hardening not yet implemented)
**Purpose**: Verify database schema and code infrastructure before Wave 2 execution

---

## Current State (Baseline)

### ✅ What EXISTS (Wave 0 Complete)

| Component | Status | Evidence |
|-----------|--------|----------|
| **loyalty_ledger base table** | ✅ EXISTS | 11 columns including session_id |
| **Idempotency unique index** | ✅ EXISTS | `idx_loyalty_ledger_session_type_source` on (session_id, transaction_type, source) |
| **increment_player_loyalty RPC** | ✅ EXISTS | Returns 6 columns (player_id, current_balance, lifetime_points, tier, tier_progress, updated_at) |
| **RPC row locking** | ✅ EXISTS | Function body contains `FOR UPDATE` |
| **player_loyalty table** | ✅ EXISTS | Denormalized aggregate with tier tracking |
| **loyalty_tier reference** | ✅ EXISTS | Tier thresholds (BRONZE/SILVER/GOLD/PLATINUM) |

### ❌ What is MISSING (Wave 2 Hardening Required)

| Component | Status | Required By |
|-----------|--------|-------------|
| **loyalty_ledger.staff_id** | ❌ MISSING | Manual reward audit trail |
| **loyalty_ledger.balance_before** | ❌ MISSING | Verification & saga recovery |
| **loyalty_ledger.balance_after** | ❌ MISSING | Verification & saga recovery |
| **loyalty_ledger.tier_before** | ❌ MISSING | Tier change alerts |
| **loyalty_ledger.tier_after** | ❌ MISSING | Tier change alerts |
| **loyalty_ledger.correlation_id** | ❌ MISSING | Distributed tracing |
| **idx_loyalty_ledger_correlation** | ❌ MISSING | Correlation ID lookups |
| **idx_loyalty_ledger_staff** | ❌ MISSING | Staff audit queries |
| **RPC enhanced return** | ❌ MISSING | RPC needs to return balance_before/after, tier_before/after, row_locked |
| **lib/correlation.ts** | ❌ MISSING | Request-scoped correlation IDs |
| **lib/idempotency.ts** | ❌ MISSING | Deterministic key hashing |
| **lib/rate-limiter.ts** | ❌ MISSING | In-memory rate limiting |
| **app/actions/loyalty-actions.ts** | ❌ MISSING | manualReward server action |
| **app/actions/ratingslip-actions.ts** | ❌ MISSING | completeRatingSlip + recoverSlipLoyalty actions |

---

## Wave 2 Implementation Blockers

### 🚨 CRITICAL (Must Be Fixed Before Production)

1. **Schema Missing Audit Columns**
   - **Impact**: Cannot verify balance changes, no staff audit trail, no correlation tracing
   - **Fix**: Apply migration `20251013_wave_2_schema_hardening.sql`
   - **Verification**: Run `WAVE_2_VERIFICATION_SCRIPT.sql` and check all 6 hardening columns exist

2. **RPC Returns Insufficient Data**
   - **Impact**: Cannot populate balance_before/after in ledger, no way to verify tier changes
   - **Fix**: Update RPC to return 9 columns (add balance_before, balance_after, tier_before, tier_after, row_locked)
   - **Verification**: Run verification script CHECK 6, ensure "balance_before" in return type

3. **No Recovery Path for Partial Failures**
   - **Impact**: If slip closes but loyalty fails, no way to recover (data loss)
   - **Fix**: Implement `recoverSlipLoyalty` action that queries ledger first (idempotent)
   - **Verification**: Integration test "Saga Recovery" must pass

4. **Idempotency Keys Not Deterministic**
   - **Impact**: Manual rewards can be duplicated (staff clicks twice → double award)
   - **Fix**: Implement `hashIdempotencyKey` with date bucketing
   - **Verification**: Integration test "Idempotency: Manual reward same day → single entry" must pass

5. **No Correlation Tracing**
   - **Impact**: Cannot trace partial failures across services (debugging impossible)
   - **Fix**: Implement AsyncLocalStorage-based correlation infrastructure
   - **Verification**: All server action logs include `correlation_id` field

---

## Pre-Wave-2 Verification Procedure

### Step 1: Run Baseline Verification

```bash
cd /home/diepulp/projects/pt-2
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -f docs/phase-6/WAVE_2_VERIFICATION_SCRIPT.sql > verification_baseline.txt
```

**Expected Output (Baseline)**:
- ✗ All 6 hardening columns MISSING
- ✗ Correlation ID index MISSING
- ✗ Staff audit index MISSING
- ✗ RPC returns basic result (NOT enhanced)
- ✓ Idempotency index EXISTS
- ✓ RPC uses FOR UPDATE

### Step 2: Apply Schema Hardening Migration

```bash
# Create migration file (if not exists)
npx supabase migration new wave_2_schema_hardening

# Apply migration
npx supabase migration up

# Regenerate TypeScript types
npm run db:types
```

### Step 3: Verify Schema Changes

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -f docs/phase-6/WAVE_2_VERIFICATION_SCRIPT.sql > verification_after_migration.txt
```

**Expected Output (After Migration)**:
- ✓ All 6 hardening columns EXIST
- ✓ Correlation ID index EXISTS
- ✓ Staff audit index EXISTS
- ✓ RPC returns enhanced result (includes balance_before)
- ✓ Idempotency index EXISTS
- ✓ RPC uses FOR UPDATE

### Step 4: Implement Infrastructure Code

**Checklist**:
- [ ] `lib/correlation.ts` created (AsyncLocalStorage for correlation IDs)
- [ ] `lib/idempotency.ts` created (deterministic key hashing)
- [ ] `lib/rate-limiter.ts` created (in-memory rate limiting)
- [ ] `lib/server-actions/with-server-action-wrapper.ts` updated (correlation ID threading)

### Step 5: Implement Server Actions

**Checklist**:
- [ ] `app/actions/loyalty-actions.ts` created:
  - [ ] `manualReward` with permission checks
  - [ ] Deterministic idempotency key generation
  - [ ] Rate limiting enforcement
  - [ ] Correlation ID propagation
- [ ] `app/actions/ratingslip-actions.ts` created:
  - [ ] `completeRatingSlip` with error recovery
  - [ ] `recoverSlipLoyalty` for partial failures
  - [ ] Correlation ID logging

### Step 6: Update Loyalty Service

**Checklist**:
- [ ] `services/loyalty/crud.ts` updated:
  - [ ] `createLedgerEntry` handles 23505 conflicts (idempotency)
  - [ ] Stores balance_before/after from RPC result
  - [ ] Stores tier_before/after from RPC result
  - [ ] Stores correlation_id from context
  - [ ] Stores staff_id for manual rewards

### Step 7: Run Integration Tests

```bash
npm test -- __tests__/integration/ratingslip-loyalty.test.ts
```

**Required Tests (MUST PASS)**:
- [ ] Happy path: Complete slip → ledger entry → tier update
- [ ] Idempotency: Duplicate completion → single ledger entry
- [ ] Manual reward with rate limiting
- [ ] Performance: Completion <500ms
- [ ] 🚨 **Saga Recovery**: Slip closed, loyalty fails → recovery succeeds
- [ ] 🚨 **Concurrency**: Simultaneous operations → correct final balance
- [ ] 🚨 **Idempotency Edge Cases**: Manual reward date-bucketed keys

### Step 8: Verify Observability

**Checklist**:
- [ ] Structured logs emit for all loyalty operations
- [ ] Logs include correlation_id field
- [ ] Logs include balance_before/after values
- [ ] Logs include tier_before/after for tier changes
- [ ] Error logs include recovery instructions

---

## Ship-Blocker Verification (Run Before Production)

### Critical Verification 1: Schema Implemented

**Command**:
```sql
\d loyalty_ledger
```

**Must Have**:
- Column: `staff_id TEXT`
- Column: `balance_before INTEGER`
- Column: `balance_after INTEGER`
- Column: `tier_before TEXT`
- Column: `tier_after TEXT`
- Column: `correlation_id TEXT`

**Blocker If**: Any column missing

---

### Critical Verification 2: RPC Returns Before/After

**Command**:
```sql
\df+ increment_player_loyalty
```

**Must Return**:
```
TABLE(
  player_id uuid,
  balance_before integer,        -- NEW
  balance_after integer,          -- NEW
  tier_before text,               -- NEW
  tier_after text,                -- NEW
  tier_progress integer,
  lifetime_points integer,
  updated_at timestamptz,
  row_locked boolean              -- NEW
)
```

**Blocker If**: Return type does NOT include `balance_before`

---

### Critical Verification 3: Recovery Path Wired

**Test 1: Partial completion returns correlation_id**

```typescript
// Mock loyalty failure
const result = await completeRatingSlip(slipId);

// MUST return
{
  success: false,
  error: {
    code: 'PARTIAL_COMPLETION',
    message: 'Slip closed but loyalty pending. Use recovery action.',
    metadata: {
      slipId: string,
      correlationId: string  // ← MUST BE PRESENT
    }
  }
}
```

**Blocker If**: `error.metadata.correlationId` is undefined

**Test 2: Recovery reuses idempotency key**

```typescript
// Recovery should check ledger first
const recovery = await recoverSlipLoyalty(slipId, correlationId);

// Query ledger
const ledger = await supabase
  .from('loyalty_ledger')
  .select('*')
  .eq('rating_slip_id', slipId)
  .single();

// MUST be idempotent
expect(ledger.session_id).toBe(slipId);  // Deterministic key
```

**Blocker If**: Recovery creates duplicate ledger entry (idempotency broken)

---

### Critical Verification 4: Idempotency Tests Green

**Run Tests**:
```bash
npm test -- __tests__/integration/ratingslip-loyalty.test.ts \
  --testNamePattern="duplicate completion|manual reward idempotency"
```

**Must Pass**:
- "Idempotency: Duplicate completion → single ledger entry"
- "Idempotency: Manual reward same day → single entry"

**Blocker If**: Either test fails (duplicate ledger entries created)

---

## Post-Implementation Hygiene

### Ongoing Monitoring (Not Ship-Blockers)

1. **Balance Verification Job**
   - **Frequency**: Daily
   - **Query**: Compare `player_loyalty.current_balance` vs `SUM(loyalty_ledger.points_change)`
   - **Alert**: If any player has mismatch >0

2. **Idempotency Monitoring**
   - **Frequency**: Hourly
   - **Query**: Check for duplicate (session_id, transaction_type, source) entries
   - **Alert**: If duplicates found (should be 0)

3. **Correlation ID Coverage**
   - **Frequency**: Weekly
   - **Query**: Check % of ledger entries with non-null correlation_id
   - **Target**: >95% coverage within 1 week

4. **Recovery Action Usage**
   - **Frequency**: Real-time
   - **Metric**: `recoverSlipLoyalty` invocation rate
   - **Target**: <0.1% of completions (if higher, investigate root cause)

---

## Summary: Go/No-Go Checklist

### ✅ Ready for Wave 2 Implementation When:

- [ ] **Schema**: All 6 hardening columns exist in loyalty_ledger
- [ ] **Indexes**: Correlation and staff indexes exist
- [ ] **RPC**: Returns 9 columns including balance_before/after and row_locked
- [ ] **Infrastructure**: correlation.ts, idempotency.ts, rate-limiter.ts implemented
- [ ] **Actions**: manualReward and completeRatingSlip/recoverSlipLoyalty implemented
- [ ] **Service**: Loyalty CRUD updated to store audit columns
- [ ] **Tests**: All 8 integration tests passing (including 3 new hardening tests)

### 🚨 Ship-Blockers (Must Fix Before Production):

- [ ] **Verification 1**: Schema columns exist (run verification script)
- [ ] **Verification 2**: RPC returns enhanced result (check return type includes balance_before)
- [ ] **Verification 3**: Recovery path wired (partial failure returns correlation_id, recovery reuses key)
- [ ] **Verification 4**: Idempotency tests green (no duplicate entries)

---

**Current Status**: 🔴 **NOT READY** (Wave 2 implementation pending)

**Next Step**: Apply `20251013_wave_2_schema_hardening.sql` migration and verify with `WAVE_2_VERIFICATION_SCRIPT.sql`
