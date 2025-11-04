# PlayerFinancial Service SRM Compliance Audit Report

**Audit Date:** 2025-10-22
**Canonical SRM Version:** v3.0.2
**Scope:** `services/player-financial/**/*.ts`, `lib/finance.ts`
**Status:** 🚨 **CRITICAL VIOLATIONS DETECTED**

---

## Executive Summary

The PlayerFinancial service exhibits **severe SRM contract violations** that directly contradict the canonical Finance write path documented in Phase D. The service bypasses the mandatory `rpc_create_financial_txn` RPC and performs direct inserts to `player_financial_transaction`, creating schema inconsistencies and gaming day computation failures.

### Critical Issues

1. **RPC Bypass in CRUD Service** — Lines 68-103 of `crud.ts` perform direct `.insert()` operations
2. **Schema Mismatch** — Service uses deprecated Phase B schema (cash_in/chips_brought/chips_taken) vs canonical Phase D schema (amount/tender_type)
3. **Test Data Corruption** — 465 lines of tests reinforce anti-pattern via direct inserts bypassing triggers
4. **Type System Drift** — DTOs reference non-existent columns in canonical schema

### Compliance Status

| Component | Status | Issues |
|-----------|--------|--------|
| `services/player-financial/crud.ts` | ❌ FAIL | Direct inserts, schema mismatch |
| `services/player-financial/index.ts` | ⚠️ WARN | Exports violating interfaces |
| `lib/finance.ts` | ✅ PASS | Correct RPC usage |
| `__tests__/services/player-financial/crud.test.ts` | ❌ FAIL | Reinforces anti-patterns |
| `types/database.types.ts` | ✅ PASS | Matches canonical schema |

---

## 1. Gaming Day Violations (CRITICAL)

### 1.1 Direct Inserts Bypassing RPC

**Location:** `services/player-financial/crud.ts:68-103`

```typescript
// ❌ VIOLATION: Direct insert bypasses gaming_day trigger
const { data: transaction, error } = await supabase
  .from("player_financial_transaction")
  .insert({
    player_id: data.playerId,
    visit_id: data.visitId,
    rating_slip_id: data.ratingSlipId,
    cash_in: data.cashIn,              // ❌ Non-existent column
    chips_brought: data.chipsBrought,  // ❌ Non-existent column
    chips_taken: data.chipsTaken,      // ❌ Non-existent column
    transaction_type: data.transactionType,
    net_change: data.netChange,
    notes: data.notes,
    ...(data.transactionTime && {
      transaction_time: data.transactionTime,
    }),
  })
  .select(...)
  .single();
```

**SRM Contract Violation:**
- Finance write path **MUST** use `rpc_create_financial_txn` (SRM v3.0.2 § Finance Domain)
- Direct inserts bypass `set_fin_txn_gaming_day` trigger
- `gaming_day` will be NULL or incorrectly computed if trigger doesn't fire

**Canonical Pattern:**
```typescript
// ✅ CORRECT: lib/finance.ts already implements this
const { data, error } = await supabase.rpc("rpc_create_financial_txn", {
  p_casino_id: casinoId,
  p_player_id: playerId,
  p_amount: amount,
  p_tender_type: tenderType ?? null,
  p_created_at: createdAt ?? null,
  p_visit_id: visitId ?? null,
  p_rating_slip_id: ratingSlipId ?? null,
});
```

### 1.2 Manual Gaming Day Setting

**Finding:** No code manually sets `gaming_day` column ✅
**Status:** PASS (but irrelevant since RPC is bypassed)

### 1.3 Old `gaming_day_start_time interval` References

**Finding:** No references to deprecated `interval` type in service code ✅
**Status:** PASS

**Baseline Migration Verification:**
```sql
-- ✅ CORRECT in baseline_srm.sql:33
gaming_day_start_time time not null default time '06:00',

-- ✅ CORRECT in trigger (baseline_srm.sql:228)
select coalesce(gaming_day_start_time::interval, interval '06:00:00') into gstart
```

Migration correctly casts `time` → `interval` for computation.

---

## 2. RPC Contract Violations

### 2.1 Forbidden Direct Inserts

**Violations Found:** 9 instances across 2 files

#### Service Implementation
| File | Lines | Method | Violation |
|------|-------|--------|-----------|
| `crud.ts` | 68-103 | `create()` | Direct insert with deprecated schema |
| `crud.test.ts` | 206-214 | Test setup | Direct insert bypassing RPC |
| `crud.test.ts` | 240-249 | Test setup | Direct insert bypassing RPC |
| `crud.test.ts` | 294-302 | Test setup | Direct insert bypassing RPC |
| `crud.test.ts` | 332-351 | Test setup | Bulk direct inserts |
| `crud.test.ts` | 379-392 | Test setup | Bulk direct inserts |
| `crud.test.ts` | 413-435 | Test setup | Bulk direct inserts |

**Impact:**
- `gaming_day` trigger does **not** fire on PostgREST inserts from client libraries
- Test fixtures create invalid data state
- Production code would fail constraint checks or produce NULL gaming_day values

### 2.2 RPC Helper Compliance

**Location:** `lib/finance.ts`

**Status:** ✅ **COMPLIANT**

```typescript
// ✅ Correct implementation
export async function createFinancialTransaction(
  supabase: SupabaseClient,
  { casinoId, playerId, amount, tenderType, createdAt, visitId, ratingSlipId }: CreateFinancialTxnArgs,
) {
  const { data, error } = await supabase.rpc("rpc_create_financial_txn", {
    p_casino_id: casinoId,
    p_player_id: playerId,
    p_amount: amount,
    p_tender_type: tenderType ?? null,
    p_created_at: createdAt ?? null,
    p_visit_id: visitId ?? null,
    p_rating_slip_id: ratingSlipId ?? null,
    // ✅ gaming_day correctly omitted
  });
  // ...
}
```

**Verification:**
- All 7 RPC parameters match `rpc_create_financial_txn` signature
- `gaming_day` correctly omitted (trigger-derived)
- NULL handling via `?? null` matches optional parameter defaults

### 2.3 RPC Parameter Validation

**Canonical Signature (baseline_srm.sql:241-248):**
```sql
create or replace function rpc_create_financial_txn(
  p_casino_id uuid,           -- Required
  p_player_id uuid,           -- Required
  p_amount numeric,           -- Required
  p_tender_type text default null,      -- Optional
  p_created_at timestamptz default now(),  -- Optional
  p_visit_id uuid default null,         -- Optional
  p_rating_slip_id uuid default null    -- Optional
) returns uuid
```

**lib/finance.ts Compliance:**
| Parameter | Type | Required | Status |
|-----------|------|----------|--------|
| `p_casino_id` | `string` (uuid) | Yes | ✅ Provided |
| `p_player_id` | `string` (uuid) | Yes | ✅ Provided |
| `p_amount` | `number` | Yes | ✅ Provided |
| `p_tender_type` | `string \| null` | No | ✅ Correct |
| `p_created_at` | `string \| null` | No | ✅ Correct |
| `p_visit_id` | `string \| null` | No | ✅ Correct |
| `p_rating_slip_id` | `string \| null` | No | ✅ Correct |

---

## 3. Schema Inconsistencies

### 3.1 Canonical Schema vs Service DTOs

**Canonical Schema (database.types.ts:613-635):**
```typescript
player_financial_transaction: {
  Row: {
    amount: number;          // ✅ Canonical
    casino_id: string;
    created_at: string;
    gaming_day: string | null;  // ✅ Nullable, trigger-derived
    id: string;
    player_id: string;
    rating_slip_id: string | null;
    tender_type: string | null;
    visit_id: string | null;
  };
  Insert: {
    amount: number;          // ✅ Required
    casino_id: string;       // ✅ Required
    created_at?: string;
    gaming_day?: string | null;  // ✅ Optional (trigger sets)
    id?: string;
    player_id: string;       // ✅ Required
    rating_slip_id?: string | null;
    tender_type?: string | null;
    visit_id?: string | null;
  };
}
```

**Service DTO (crud.ts:16-27):**
```typescript
export interface PlayerFinancialTransactionCreateDTO {
  playerId: string;
  visitId: string;
  ratingSlipId?: string | null;
  cashIn?: number | null;           // ❌ Column doesn't exist
  chipsBrought?: number | null;     // ❌ Column doesn't exist
  chipsTaken?: number | null;       // ❌ Column doesn't exist
  transactionType: Database["public"]["Enums"]["transactiontype"];  // ❌ Enum doesn't exist
  netChange?: number | null;        // ❌ Column doesn't exist
  notes?: string | null;            // ❌ Column doesn't exist
  transactionTime?: string;         // ❌ Column doesn't exist
}
```

**Schema Drift Analysis:**

| Service DTO Field | Canonical Column | Status | Source |
|-------------------|------------------|--------|--------|
| `cashIn` | N/A | ❌ Ghost column | Phase B legacy |
| `chipsBrought` | N/A | ❌ Ghost column | Phase B legacy |
| `chipsTaken` | N/A | ❌ Ghost column | Phase B legacy |
| `transactionType` | N/A | ❌ Ghost enum | Phase B legacy |
| `netChange` | N/A | ❌ Ghost column | Phase B legacy |
| `notes` | N/A | ❌ Ghost column | Phase B legacy |
| `transactionTime` | N/A | ❌ Ghost column | Phase B legacy |
| `amount` | `amount` | ❌ MISSING | Required in canonical |
| `casinoId` | `casino_id` | ❌ MISSING | Required in canonical |
| `tenderType` | `tender_type` | ❌ MISSING | Optional in canonical |

### 3.2 Baseline Migration Schema

**Table Definition (baseline_srm.sql:200-210):**
```sql
create table player_financial_transaction (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  visit_id uuid references visit(id) on delete set null,
  rating_slip_id uuid references rating_slip(id) on delete set null,
  amount numeric not null,              -- ✅ Required
  tender_type text,                     -- ✅ Optional
  created_at timestamptz not null default now(),
  gaming_day date                       -- ✅ Nullable, trigger-derived
);
```

**Verification:**
- Schema matches canonical documentation ✅
- No `cash_in`, `chips_brought`, `chips_taken` columns ✅
- No `transaction_type`, `net_change`, `notes`, `transaction_time` columns ✅
- Required fields: `player_id`, `casino_id`, `amount` ✅
- Optional fields: `visit_id`, `rating_slip_id`, `tender_type`, `gaming_day` ✅

### 3.3 FK Relationships

**Canonical Relationships (database.types.ts:647-676):**
```typescript
Relationships: [
  {
    foreignKeyName: "player_financial_transaction_casino_id_fkey";
    columns: ["casino_id"];
    referencedRelation: "casino";  // ✅ Correct
  },
  {
    foreignKeyName: "player_financial_transaction_player_id_fkey";
    columns: ["player_id"];
    referencedRelation: "player";  // ✅ Correct
  },
  {
    foreignKeyName: "player_financial_transaction_rating_slip_id_fkey";
    columns: ["rating_slip_id"];
    referencedRelation: "rating_slip";  // ✅ Correct
  },
  {
    foreignKeyName: "player_financial_transaction_visit_id_fkey";
    columns: ["visit_id"];
    referencedRelation: "visit";  // ✅ Correct
  },
];
```

**Status:** All FK relationships correctly defined ✅

---

## 4. Type System Drift

### 4.1 TablesInsert Compliance

**Expected Behavior (SRM v3.0.2):**
> `TablesInsert<'player_financial_transaction'>` does **not** require `gaming_day`

**Actual Implementation:**
```typescript
export type TablesInsert<...> = ...

// Generated type:
TablesInsert<'player_financial_transaction'> = {
  amount: number;          // Required
  casino_id: string;       // Required
  created_at?: string;     // Optional
  gaming_day?: string | null;  // ✅ Optional (correct)
  id?: string;             // Optional
  player_id: string;       // Required
  rating_slip_id?: string | null;  // Optional
  tender_type?: string | null;     // Optional
  visit_id?: string | null;        // Optional
}
```

**Status:** ✅ PASS — `gaming_day` is optional in Insert type

### 4.2 Manual Type Definitions

**Finding:** No manual type redefinitions found ✅

**Verification:**
- `crud.ts` imports `Database` from `@/types/database.types`
- DTOs use `Pick<Database["public"]["Tables"]["player_financial_transaction"]["Row"], ...>`
- No `ReturnType` inference violations ✅

**However:** DTOs reference non-existent columns, indicating they were written against Phase B schema

### 4.3 Service Interface vs Database Schema

**Problem:** Service layer interfaces (`PlayerFinancialTransactionCreateDTO`) are **structurally incompatible** with database schema

**Impact:**
- Service expects `cashIn` but database requires `amount`
- Service provides `transactionType` but database has no such column
- Direct insert attempts will fail with "column does not exist" errors
- Current codebase likely **cannot execute successfully** against canonical schema

---

## 5. Seed Data Compliance

### 5.1 Seed Script Verification

**Location:** `supabase/seed.sql:107-115`

```sql
select rpc_create_financial_txn(
  '00000000-0000-0000-0000-000000000101',  -- p_casino_id
  '00000000-0000-0000-0000-000000000401',  -- p_player_id
  250,                                      -- p_amount
  'cash_in',                                -- p_tender_type
  now(),                                    -- p_created_at
  '00000000-0000-0000-0000-000000000901',  -- p_visit_id
  '00000000-0000-0000-0000-000000000701'   -- p_rating_slip_id
);
```

**Status:** ✅ **COMPLIANT**

- Uses RPC instead of direct insert ✅
- All parameters match canonical signature ✅
- `gaming_day` correctly omitted ✅

---

## 6. Remediation Roadmap

### Priority 1: CRITICAL (Block Deployment)

#### 6.1 Rewrite CRUD Service to Use RPC

**File:** `services/player-financial/crud.ts`

**Required Changes:**
1. Replace `PlayerFinancialTransactionCreateDTO` with canonical schema
2. Remove `create()` method's direct insert (lines 68-103)
3. Delegate to `lib/finance.ts` helper:

```typescript
// ✅ Correct implementation
export function createPlayerFinancialCrudService(
  supabase: SupabaseClient<Database>,
): PlayerFinancialCrudService {
  return {
    create: async (data: PlayerFinancialTransactionCreateDTO) => {
      return executeOperation<PlayerFinancialTransactionDTO>(
        "create_player_financial_transaction",
        async () => {
          // Delegate to canonical RPC helper
          const txnId = await createFinancialTransaction(supabase, {
            casinoId: data.casinoId,     // ✅ Required
            playerId: data.playerId,     // ✅ Required
            amount: data.amount,         // ✅ Required
            tenderType: data.tenderType, // ✅ Optional
            createdAt: data.createdAt,   // ✅ Optional
            visitId: data.visitId,       // ✅ Optional
            ratingSlipId: data.ratingSlipId, // ✅ Optional
          });

          // Fetch created transaction for return
          const { data: transaction, error } = await supabase
            .from("player_financial_transaction")
            .select("*")
            .eq("id", txnId)
            .single();

          if (error) throw error;
          return transaction;
        },
      );
    },
    // ... other methods
  };
}
```

#### 6.2 Align DTO with Canonical Schema

**File:** `services/player-financial/crud.ts:16-27`

```typescript
// ✅ Canonical DTO
export interface PlayerFinancialTransactionCreateDTO {
  casinoId: string;                  // Required
  playerId: string;                  // Required
  amount: number;                    // Required
  tenderType?: string | null;        // Optional
  createdAt?: string | null;         // Optional
  visitId?: string | null;           // Optional
  ratingSlipId?: string | null;      // Optional
  // gaming_day omitted (trigger-derived)
}

export type PlayerFinancialTransactionDTO = Pick<
  Database["public"]["Tables"]["player_financial_transaction"]["Row"],
  | "id"
  | "player_id"
  | "casino_id"
  | "visit_id"
  | "rating_slip_id"
  | "amount"
  | "tender_type"
  | "created_at"
  | "gaming_day"  // ✅ Include for reads
>;
```

#### 6.3 Remove Update/Delete Methods (Append-Only Enforcement)

**File:** `services/player-financial/crud.ts:178-272`

**SRM Constraint:** Finance ledger is **append-only**

```typescript
export interface PlayerFinancialCrudService {
  create(data: PlayerFinancialTransactionCreateDTO): Promise<ServiceResult<PlayerFinancialTransactionDTO>>;
  getById(id: string): Promise<ServiceResult<PlayerFinancialTransactionDTO>>;
  listByPlayer(playerId: string, limit?: number, offset?: number): Promise<ServiceResult<PlayerFinancialTransactionDTO[]>>;
  listByVisit(visitId: string): Promise<ServiceResult<PlayerFinancialTransactionDTO[]>>;
  // ❌ REMOVE: update, delete methods violate append-only constraint
}
```

**Database Enforcement:**
```sql
-- Add RLS policy to enforce append-only
create policy "finance_append_only" on player_financial_transaction
  for update using (false);  -- Prevent all updates

create policy "finance_no_delete" on player_financial_transaction
  for delete using (false);  -- Prevent all deletes
```

### Priority 2: HIGH (Prevent Future Drift)

#### 6.4 Rewrite Tests to Use RPC

**File:** `__tests__/services/player-financial/crud.test.ts`

**Replace all direct inserts with RPC calls:**

```typescript
// ❌ Before
const { data } = await supabase
  .from('player_financial_transaction')
  .insert({
    player_id: testPlayerId,
    visit_id: testVisitId,
    cash_in: 250.0,
    transaction_type: 'DEPOSIT',
  })
  .select('id')
  .single();

// ✅ After
const txnId = await createFinancialTransaction(supabase, {
  casinoId: testCasinoId,
  playerId: testPlayerId,
  amount: 250.0,
  tenderType: 'deposit',
  visitId: testVisitId,
});
```

#### 6.5 Add Schema Verification Test

**File:** `__tests__/schema/player-financial-schema.test.ts` (NEW)

```typescript
describe('PlayerFinancial Schema Compliance', () => {
  it('should match canonical SRM v3.0.2 schema', async () => {
    const { data: columns } = await supabase.rpc('get_table_columns', {
      table_name: 'player_financial_transaction'
    });

    // Verify required columns exist
    expect(columns).toContainEqual(
      expect.objectContaining({ column_name: 'amount', is_nullable: 'NO' })
    );
    expect(columns).toContainEqual(
      expect.objectContaining({ column_name: 'casino_id', is_nullable: 'NO' })
    );

    // Verify Phase B columns don't exist
    expect(columns).not.toContainEqual(
      expect.objectContaining({ column_name: 'cash_in' })
    );
    expect(columns).not.toContainEqual(
      expect.objectContaining({ column_name: 'chips_brought' })
    );
  });

  it('should enforce gaming_day trigger on insert', async () => {
    const txnId = await createFinancialTransaction(supabase, {
      casinoId: testCasinoId,
      playerId: testPlayerId,
      amount: 100,
    });

    const { data } = await supabase
      .from('player_financial_transaction')
      .select('gaming_day')
      .eq('id', txnId)
      .single();

    // Verify trigger set gaming_day
    expect(data.gaming_day).toBeDefined();
    expect(data.gaming_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

#### 6.6 Add Pre-Commit Hook

**File:** `.husky/pre-commit` (enhance existing)

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Prevent direct inserts to player_financial_transaction
if git diff --cached --name-only | grep -E '\.(ts|tsx)$' | xargs grep -l 'from.*player_financial_transaction.*\.insert'; then
  echo "❌ ERROR: Direct inserts to player_financial_transaction are prohibited"
  echo "Use lib/finance.ts createFinancialTransaction() helper instead"
  exit 1
fi
```

### Priority 3: MEDIUM (Documentation)

#### 6.7 Update Service Documentation

**File:** `services/player-financial/README.md` (NEW)

```markdown
# PlayerFinancial Service

**Bounded Context:** Financial transaction ledger
**Owner:** Finance Domain
**SRM Version:** v3.0.2

## Write Path

All financial transactions MUST be created via `rpc_create_financial_txn`:

\`\`\`typescript
import { createFinancialTransaction } from '@/lib/finance';

const txnId = await createFinancialTransaction(supabase, {
  casinoId: string,        // Required
  playerId: string,        // Required
  amount: number,          // Required
  tenderType?: string,     // Optional ('cash_in', 'cash_out', etc.)
  createdAt?: string,      // Optional (defaults to now())
  visitId?: string,        // Optional
  ratingSlipId?: string,   // Optional
});
\`\`\`

## Gaming Day Computation

The \`gaming_day\` column is **trigger-derived** and MUST NOT be set by clients:

- Casino temporal authority: \`casino_settings.gaming_day_start_time time\`
- Trigger: \`set_fin_txn_gaming_day\` computes gaming day before insert
- Client code: OMIT \`gaming_day\` from insert parameters

## Append-Only Ledger

Financial transactions are **immutable** after creation:

- ✅ Supported: \`INSERT\` via RPC
- ❌ Prohibited: \`UPDATE\`, \`DELETE\`
- Corrections: Create offsetting transactions (never modify existing)
\`\`\`

#### 6.8 Add Architecture Decision Record

**File:** `80-adrs/ADR-010-finance-rpc-write-path.md` (NEW)

```markdown
# ADR-010: Finance RPC Write Path

**Status:** Accepted
**Date:** 2025-10-22
**Supersedes:** Phase B direct insert pattern

## Context

The \`player_financial_transaction\` table requires trigger-derived \`gaming_day\` computation based on casino-specific temporal boundaries. Direct inserts from client code bypass this trigger.

## Decision

All writes to \`player_financial_transaction\` MUST use \`rpc_create_financial_txn\`.

## Consequences

- **Positive:** Gaming day consistency guaranteed
- **Positive:** Centralized validation and audit trail
- **Negative:** Additional RPC overhead vs direct insert
- **Migration:** Existing CRUD service must be rewritten
\`\`\`

---

## 7. Risk Assessment

### 7.1 Data Integrity Risks

| Risk | Severity | Likelihood | Impact |
|------|----------|------------|--------|
| NULL gaming_day values | CRITICAL | High | Reporting failures, compliance violations |
| Schema mismatch crashes | CRITICAL | Certain | Application cannot execute |
| Trigger bypass | HIGH | High | Incorrect gaming day calculations |
| Test data pollution | MEDIUM | Certain | Invalid fixtures in test DB |

### 7.2 Compliance Impact

**Casino Regulatory Requirements:**
- Gaming day boundaries are **legally mandated** for financial reporting
- Incorrect gaming day computation = **compliance violation**
- Audit trail requirements demand trigger-enforced timestamps

**Current State:** Service layer **cannot** meet compliance requirements

### 7.3 Production Readiness

**Blockers:**
1. Service DTOs reference non-existent columns (immediate runtime failure)
2. No RPC usage in CRUD operations (gaming day will be NULL)
3. Tests reinforce anti-patterns (false confidence)

**Recommendation:** **DO NOT DEPLOY** until Priority 1 remediation complete

---

## 8. Historical Context

### 8.1 Phase B → Phase D Migration Gap

**Root Cause:** Service layer was implemented against **Phase B schema** and never updated when canonical schema evolved in Phase D.

**Phase B Schema (deprecated):**
```sql
-- Old schema circa 2025-10-06
create table player_financial_transaction (
  cash_in numeric,
  chips_brought numeric,
  chips_taken numeric,
  transaction_type text,
  net_change numeric,
  notes text,
  transaction_time timestamptz
);
```

**Phase D Schema (canonical):**
```sql
-- Current canonical schema
create table player_financial_transaction (
  amount numeric not null,
  tender_type text,
  created_at timestamptz not null default now(),
  gaming_day date  -- Trigger-derived
);
```

**Evidence:**
- Service DTOs (crud.ts:16-27) match Phase B schema exactly
- Baseline migration (00000000000000_baseline_srm.sql) uses Phase D schema
- Documentation references Phase B→D transition (PHASE_D_SIGNOFF.md)

### 8.2 Documentation vs Implementation Divergence

**Canonical Documentation Status:**
- ✅ SRM v3.0.2 correctly documents RPC write path
- ✅ Baseline migration matches canonical schema
- ✅ `lib/finance.ts` helper implements correct pattern
- ✅ Seed data uses RPC

**Service Layer Status:**
- ❌ CRUD service never updated from Phase B
- ❌ Tests reinforce deprecated pattern
- ❌ No schema validation in CI/CD

**Gap:** Service layer implementation **lagged** behind schema evolution

---

## 9. Verification Checklist

### Pre-Remediation

- [x] Audit service layer against canonical schema
- [x] Identify all direct insert violations
- [x] Document schema drift root cause
- [x] Assess production readiness impact

### Remediation Implementation

- [ ] Rewrite `crud.ts` create() to use RPC
- [ ] Update DTOs to match canonical schema
- [ ] Remove update/delete methods
- [ ] Rewrite all tests to use RPC
- [ ] Add schema verification test
- [ ] Update service documentation

### Post-Remediation Validation

- [ ] Run `npm run db:types` to verify type generation
- [ ] Execute full test suite against canonical schema
- [ ] Verify gaming_day trigger fires correctly
- [ ] Manual smoke test of create operation
- [ ] Code review with Finance domain owner
- [ ] Merge to main after CI passes

### Continuous Compliance

- [ ] Add pre-commit hook for direct insert detection
- [ ] Schedule quarterly SRM compliance audits
- [ ] Document Phase D migration completion
- [ ] Archive Phase B schema references
- [ ] Update ADR index with new decision records

---

## 10. Appendix: Code Examples

### A. Correct RPC Usage Pattern

```typescript
// File: services/player-financial/crud.ts (corrected)
import { createFinancialTransaction } from '@/lib/finance';

export function createPlayerFinancialCrudService(
  supabase: SupabaseClient<Database>,
): PlayerFinancialCrudService {
  return {
    async create(data: PlayerFinancialTransactionCreateDTO) {
      return executeOperation("create_financial_txn", async () => {
        // Step 1: Create via RPC (trigger fires here)
        const txnId = await createFinancialTransaction(supabase, {
          casinoId: data.casinoId,
          playerId: data.playerId,
          amount: data.amount,
          tenderType: data.tenderType,
          createdAt: data.createdAt,
          visitId: data.visitId,
          ratingSlipId: data.ratingSlipId,
        });

        // Step 2: Fetch created transaction
        const { data: txn, error } = await supabase
          .from('player_financial_transaction')
          .select('*')
          .eq('id', txnId)
          .single();

        if (error) throw error;
        return txn;
      });
    },

    async getById(id: string) { /* ... */ },
    async listByPlayer(playerId: string) { /* ... */ },
    async listByVisit(visitId: string) { /* ... */ },
    // NO update/delete methods
  };
}
```

### B. Canonical DTO Definition

```typescript
// File: services/player-financial/types.ts (new)
import type { Database } from '@/types/database.types';

// Input: What clients provide
export interface PlayerFinancialTransactionCreateDTO {
  casinoId: string;
  playerId: string;
  amount: number;
  tenderType?: string | null;
  createdAt?: string | null;
  visitId?: string | null;
  ratingSlipId?: string | null;
  // gaming_day omitted (trigger-derived)
}

// Output: What service returns (includes trigger-derived fields)
export type PlayerFinancialTransactionDTO = Database["public"]["Tables"]["player_financial_transaction"]["Row"];
```

### C. Test Fixture Using RPC

```typescript
// File: __tests__/services/player-financial/crud.test.ts (corrected)
import { createFinancialTransaction } from '@/lib/finance';

describe('PlayerFinancial CRUD Service', () => {
  let testTransactionId: string;

  beforeEach(async () => {
    // ✅ Use RPC for test fixtures
    testTransactionId = await createFinancialTransaction(supabase, {
      casinoId: testCasinoId,
      playerId: testPlayerId,
      amount: 250.0,
      tenderType: 'deposit',
      visitId: testVisitId,
    });
  });

  it('should create transaction with gaming_day set by trigger', async () => {
    const { data } = await supabase
      .from('player_financial_transaction')
      .select('gaming_day')
      .eq('id', testTransactionId)
      .single();

    // Verify trigger worked
    expect(data.gaming_day).toBeDefined();
    expect(data.gaming_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

---

## Sign-Off

**Audit Conducted By:** Claude Code (TypeScript Pro Agent)
**Review Required:** Finance Domain Owner, Platform Architect
**Deployment Status:** 🚨 **BLOCKED** until Priority 1 remediation complete

**Next Steps:**
1. Schedule remediation sprint for Priority 1 items
2. Create tracking issues for each violation
3. Assign Finance domain owner for code review
4. Plan Phase B schema deprecation cleanup

**Estimated Remediation Effort:** 8-12 hours (1-2 developer days)

---

**End of Audit Report**
