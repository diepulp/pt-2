# RatingSlip Service SRM Compliance Audit Report

**Audit Date**: 2025-10-22
**Canonical Contract**: Service Responsibility Matrix v3.0.2
**Scope**: `services/ratingslip/**/*.ts`
**Auditor**: TypeScript Pro Agent

---

## Executive Summary

**CRITICAL SCHEMA MISMATCH DETECTED**

The RatingSlip service layer is consuming **STALE TYPE DEFINITIONS** from `/types/database.types.ts` (local baseline) while the actual deployed schema (reflected in `/types/remote/database.types.ts`) contains **significantly different column definitions**.

**Status**: ⚠️ **MODERATE VIOLATIONS** - Service logic is SRM-compliant, but type system is out of sync with deployed schema.

---

## 1. Boundary Violations (CRITICAL)

### ✅ NO POINTS COLUMN VIOLATION DETECTED
**Status**: COMPLIANT

**Evidence**:
- Line 43 (crud.ts): `// REMOVED: "points" - loyalty concern, handled by LoyaltyService`
- Line 35 (crud.ts): `// ✅ Phase 6: Pure telemetry - NO loyalty concerns (points removed)`
- No `points` field in RatingSlipDTO Pick type (lines 36-51)

**Analysis**: RatingSlip correctly delegated points/rewards storage to Loyalty bounded context as of v3.0.0.

---

### ✅ NO LOYALTY CACHE VIOLATION DETECTED
**Status**: COMPLIANT

**Evidence**:
- No `balance`, `loyalty`, or ledger-related fields in service DTOs
- No imports or references to loyalty balance caching
- grep results: Zero matches for `loyalty|balance|ledger` in service code

**Analysis**: Service does not maintain local copies of loyalty state.

---

### ✅ NO DIRECT LEDGER WRITE VIOLATION DETECTED
**Status**: COMPLIANT

**Evidence**:
- No RPC calls to `rpc_issue_mid_session_reward` found in service code
- No direct `loyalty_ledger` table insertions
- grep results: Zero matches for `rpc_issue_mid_session|award.*points|issue.*reward`

**Analysis**: Service correctly delegates reward issuance to Loyalty RPC layer per SRM contract.

---

## 2. Lifecycle Violations

### ⚠️ STATUS TRANSITION ENFORCEMENT - PARTIAL COMPLIANCE
**Status**: NEEDS IMPROVEMENT

**Current Implementation** (crud.ts:149-151):
```typescript
if (data.status !== undefined) {
  updateData.status = data.status;
}
```

**Issues**:
1. **No lifecycle validation**: Service accepts any status string without enforcing the canonical state machine:
   - `created → open → closed` (primary path)
   - `open → paused → resumed → open` (pause cycle)
   - `closed → archived` (archival)

2. **Type mismatch**:
   - Local types define `status: string` (database.types.ts:730)
   - Remote types define `status: Database["public"]["Enums"]["RatingSlipStatus"]` (remote/database.types.ts:1376)
   - Enum values: `"OPEN" | "CLOSED" | "PAUSED"` (remote/database.types.ts:2359)

3. **Missing status enum in migration**: Baseline migration (00000000000000_baseline_srm.sql:158) defines:
   ```sql
   status text not null default 'open'
   ```
   This contradicts remote schema which expects an enum type.

**SRM Contract Violation**: Mid-session reward RPC (migration line 367) expects `status in ('open','paused')` (lowercase), but remote enum uses `'OPEN' | 'CLOSED' | 'PAUSED'` (uppercase).

**Recommendation**:
- Create migration to convert `status` from `text` to proper enum type
- Add lifecycle validation logic in service layer to enforce state transitions
- Align baseline migration with deployed remote schema

---

### ✅ IMMUTABILITY OF CORE FIELDS - COMPLIANT
**Status**: COMPLIANT

**Evidence**:
- `RatingSlipUpdateDTO` (lines 26-32) does NOT include:
  - `playerId` (cannot be changed post-creation)
  - `casino_id` (cannot be changed post-creation)
  - `start_time` (cannot be changed post-creation)
- Update logic (lines 136-181) only processes whitelisted mutable fields

**Analysis**: Service correctly enforces immutability of identity and temporal anchors.

---

### ✅ END_TIME REQUIRED AT CLOSE - COMPLIANT
**Status**: COMPLIANT

**Evidence**:
- `RatingSlipUpdateDTO` allows `endTime?: string` (line 29)
- No server-side enforcement currently, but:
  - Application layer would set `endTime` before transitioning to 'closed' status
  - Database schema allows null `end_time` for open slips (migration line 157)

**Recommendation**: Add database constraint or service-level validation:
```typescript
if (data.status === 'closed' && !data.endTime) {
  throw new Error('end_time required when closing rating slip');
}
```

---

### ❌ MID-SESSION REWARD ELIGIBILITY - NOT CHECKED IN SERVICE
**Status**: NON-COMPLIANT (Delegation Assumed)

**Evidence**:
- RatingSlip service has NO methods to issue mid-session rewards
- Eligibility check exists in database RPC (migration lines 362-371):
  ```sql
  perform 1
    from rating_slip
   where id = p_rating_slip_id
     and player_id = p_player_id
     and casino_id = p_casino_id
     and status in ('open','paused');
  ```

**Analysis**: Service correctly delegates this to database-enforced RPC, but lacks convenience methods. This is acceptable if higher-level orchestration service handles reward issuance.

**Recommendation**: If RatingSlip service is expected to expose reward eligibility checks, add:
```typescript
async isEligibleForReward(id: string): Promise<boolean> {
  const { data } = await this.getById(id);
  return data.status === 'open' || data.status === 'paused';
}
```

---

## 3. Schema Inconsistencies

### ❌ CRITICAL: LOCAL vs REMOTE TYPE DRIFT
**Status**: SCHEMA MISMATCH

**Schema Comparison**:

| Field | Local (`database.types.ts`) | Remote (`remote/database.types.ts`) | Migration (baseline_srm.sql) |
|-------|---------------------------|-----------------------------------|------------------------------|
| `player_id` | `player_id: string` | `playerId: string` | `player_id uuid` |
| `gaming_table_id` | `table_id: string \| null` | `gaming_table_id: string \| null` | `table_id uuid` |
| `seat_number` | ❌ NOT PRESENT | ✅ `seat_number: number \| null` | ❌ NOT PRESENT |
| `accumulated_seconds` | ❌ NOT PRESENT | ✅ `accumulated_seconds: number` | ❌ NOT PRESENT |
| `policy_snapshot` | ✅ `policy_snapshot: Json \| null` | ❌ NOT PRESENT | ✅ `policy_snapshot jsonb` |
| `status` | `status: string` | `status: RatingSlipStatus` (enum) | `status text` |
| `game_settings_id` | ❌ NOT PRESENT | ✅ `game_settings_id: string \| null` | ❌ NOT PRESENT |
| `version` | ❌ NOT PRESENT | ✅ `version: number` | ❌ NOT PRESENT |
| `pause_intervals` | ❌ NOT PRESENT | ✅ `pause_intervals: Json \| null` | ❌ NOT PRESENT |

**Root Cause**:
1. **Local types generated from baseline migration** (matches 00000000000000_baseline_srm.sql)
2. **Remote types generated from deployed database** (reflects actual Supabase schema)
3. **Baseline migration is OUT OF SYNC** with deployed schema

**Service Code Issues**:
- Line 18 (crud.ts): References `Database["public"]["Tables"]["ratingslip"]["Insert"]["game_settings"]` - correct path, wrong table name (`ratingslip` vs `rating_slip`)
- Lines 38-48 (crud.ts): RatingSlipDTO uses fields that don't exist in local schema:
  - `seat_number` (present in remote, missing in local/migration)
  - `accumulated_seconds` (present in remote, missing in local/migration)
- Line 28 (crud.ts): References `Database["public"]["Enums"]["RatingSlipStatus"]` which doesn't exist in local types

**Impact**:
- TypeScript compilation may fail or produce incorrect runtime behavior
- Database queries may fail due to column name mismatches (`table_id` vs `gaming_table_id`, `playerId` vs `player_id`)
- Service expects fields that don't exist in local schema definition

---

### ❌ GAME_SETTINGS JSONB USAGE - TYPE MISMATCH
**Status**: INCORRECT TABLE REFERENCE

**Evidence** (crud.ts:18):
```typescript
gameSettings: Database["public"]["Tables"]["ratingslip"]["Insert"]["game_settings"];
```

**Issues**:
1. Table name should be `rating_slip` (with underscore), not `ratingslip`
2. Local schema: `rating_slip.game_settings` is `Json | null`
3. Remote schema: Expects `game_settings: Json` (non-null) and adds separate `game_settings_id` FK

**Correct Usage**:
```typescript
gameSettings: Database["public"]["Tables"]["rating_slip"]["Insert"]["game_settings"];
```

---

### ⚠️ POLICY_SNAPSHOT JSONB - SCHEMA DRIFT
**Status**: FIELD REMOVED IN REMOTE SCHEMA

**Evidence**:
- Migration line 159: `policy_snapshot jsonb` exists
- Local types line 728: `policy_snapshot: Json | null` exists
- Remote types: **FIELD DOES NOT EXIST**

**Analysis**:
- SRM v3.0.2 contract specifies `policy_snapshot` for reward thresholds at issuance time
- Remote schema has **removed** this field (possibly replaced by `game_settings_id` FK)
- Service code does NOT use `policy_snapshot` in any operations (not in DTO Pick type)

**Recommendation**: Either:
1. Add migration to restore `policy_snapshot` column per SRM contract, OR
2. Update SRM contract to replace snapshot pattern with `game_settings_id` FK pattern

---

### ✅ TABLE_ID FOREIGN KEY - MIGRATION CORRECT
**Status**: COMPLIANT (WITH CAVEAT)

**Evidence** (migration lines 148-160):
```sql
table_id uuid references gaming_table(id) on delete set null
```

**Relationships** (database.types.ts:776-780):
```typescript
foreignKeyName: "rating_slip_table_id_fkey";
columns: ["table_id"];
referencedRelation: "gaming_table";
```

**Caveat**: Remote schema uses `gaming_table_id` instead of `table_id`, indicating a column rename migration occurred that is not reflected in baseline.

---

### ✅ CASINO_ID OWNERSHIP - COMPLIANT
**Status**: COMPLIANT

**Evidence** (migration line 151):
```sql
casino_id uuid not null references casino(id) on delete cascade
```

**Analysis**: RatingSlip correctly establishes casino ownership with cascade delete.

---

## 4. Type System Drift

### ❌ CRITICAL: MANUAL TYPE DEFINITIONS vs DATABASE TYPES
**Status**: SERVICE USES DATABASE TYPES CORRECTLY, BUT WRONG FILE

**Current Implementation**:
- Lines 8 (both files): `import type { Database } from "@/types/database.types";`
- All DTOs use `Database["public"]["Tables"]["..."]` pattern (correct approach)

**Problem**: Service imports from `/types/database.types.ts` (1100 lines, baseline schema) instead of `/types/remote/database.types.ts` (2288 lines, deployed schema).

**Evidence of Drift**:
```typescript
// Local schema (database.types.ts:720-733)
rating_slip: {
  Row: {
    average_bet: number | null;
    casino_id: string;
    end_time: string | null;
    game_settings: Json | null;
    id: string;
    player_id: string;          // ← snake_case
    policy_snapshot: Json | null;
    start_time: string;
    status: string;              // ← plain string
    table_id: string | null;     // ← different name
    visit_id: string | null;
  };
  // ... Insert/Update omitted ...
}

// Remote schema (remote/database.types.ts:1365-1379)
ratingslip: {
  Row: {
    accumulated_seconds: number; // ← NEW FIELD
    average_bet: number;
    end_time: string | null;
    game_settings: Json;
    game_settings_id: string | null; // ← NEW FIELD
    gaming_table_id: string | null;   // ← renamed from table_id
    id: string;
    pause_intervals: Json | null;     // ← NEW FIELD
    playerId: string;                 // ← camelCase
    seat_number: number | null;       // ← NEW FIELD
    start_time: string;
    status: Database["public"]["Enums"]["RatingSlipStatus"]; // ← enum type
    version: number;                  // ← NEW FIELD
    visit_id: string | null;
  };
  // ... Insert/Update omitted ...
}
```

**Runtime Risk**:
- Service code references `playerId` (camelCase) but local types define `player_id` (snake_case)
- Service expects `seat_number` and `accumulated_seconds` which don't exist in local types
- Queries will fail at runtime due to column name mismatches

---

### ❌ STATUS FIELD TYPE - STRING vs ENUM
**Status**: TYPE SAFETY VIOLATION

**Local Types**: `status: string` (allows any string value)
**Remote Types**: `status: Database["public"]["Enums"]["RatingSlipStatus"]` (enforces `"OPEN" | "CLOSED" | "PAUSED"`)
**Migration**: `status text not null default 'open'` (lowercase)

**Conflict**:
- Migration uses lowercase default: `'open'`
- Remote enum uses uppercase: `'OPEN' | 'CLOSED' | 'PAUSED'`
- Service code doesn't enforce type safety (accepts `data.status` as `string | undefined`)

**Recommendation**:
1. Create enum type in migration:
   ```sql
   create type rating_slip_status as enum ('open', 'paused', 'resumed', 'closed', 'archived');
   alter table rating_slip alter column status type rating_slip_status using status::rating_slip_status;
   ```
2. Regenerate types: `npm run db:types`
3. Update service to use typed enum

---

### ✅ FOREIGN KEY RELATIONSHIPS - CORRECTLY TYPED
**Status**: COMPLIANT (IN LOCAL SCHEMA)

**Evidence** (database.types.ts:760-789):
```typescript
Relationships: [
  { foreignKeyName: "rating_slip_casino_id_fkey", ... },
  { foreignKeyName: "rating_slip_player_id_fkey", ... },
  { foreignKeyName: "rating_slip_table_id_fkey", ... },
  { foreignKeyName: "rating_slip_visit_id_fkey", ... }
]
```

**Analysis**: All FK relationships correctly defined, but remote schema has additional FK:
```typescript
{ foreignKeyName: "ratingslip_game_settings_id_fkey", ... } // NEW in remote
```

---

## 5. Additional Findings

### ⚠️ TABLE NAME INCONSISTENCY
**Local Schema**: `rating_slip` (snake_case with underscore)
**Remote Schema**: `ratingslip` (single word)
**Migration**: `create table rating_slip` (snake_case)

**Impact**: All service queries use `.from("ratingslip")` which will fail if connected to a database matching the baseline migration.

---

### ⚠️ COLUMN NAME CASING INCONSISTENCY
**Local Schema**: Uses `snake_case` (e.g., `player_id`, `table_id`)
**Remote Schema**: Uses `camelCase` (e.g., `playerId`, `gaming_table_id`)
**Service Code**: Uses `camelCase` in DTOs (e.g., `playerId`, `gamingTableId`)

**Impact**: Service DTOs don't match local type definitions, causing type errors during compilation.

---

### ❌ MISSING FIELDS IN SERVICE DTO
**Service DTO Includes** (lines 36-51):
- `seat_number` ← exists in remote, **missing in local**
- `accumulated_seconds` ← exists in remote, **missing in local**

**Service DTO Excludes**:
- `policy_snapshot` ← exists in local/migration, **missing in remote**
- `game_settings_id` ← exists in remote, **missing in local**
- `version` ← exists in remote, **missing in local**
- `pause_intervals` ← exists in remote, **missing in local**

**Root Cause**: Service was written against remote schema but imports local type file.

---

## 6. SRM Compliance Summary

| SRM Requirement | Status | Notes |
|-----------------|--------|-------|
| **NO points column** | ✅ COMPLIANT | Correctly removed from v3.0.0 |
| **NO loyalty cache** | ✅ COMPLIANT | No balance caching detected |
| **Delegate reward writes** | ✅ COMPLIANT | Uses database RPC layer |
| **Status lifecycle enforcement** | ⚠️ PARTIAL | No validation logic, relies on DB RPC |
| **Immutable core fields** | ✅ COMPLIANT | player_id, casino_id, start_time protected |
| **end_time at close** | ⚠️ PARTIAL | No server-side validation |
| **Mid-session eligibility** | ✅ COMPLIANT | Enforced by DB RPC, not service |
| **game_settings jsonb** | ⚠️ TYPE ERROR | Wrong table name reference |
| **policy_snapshot jsonb** | ❌ DRIFT | Field exists in migration, missing in remote |
| **table_id FK** | ⚠️ NAME DRIFT | Renamed to gaming_table_id in remote |
| **casino_id ownership** | ✅ COMPLIANT | Correct FK with cascade |
| **Type system consistency** | ❌ CRITICAL | Using wrong type file, schema drift |
| **Status enum type** | ❌ VIOLATION | Using string instead of enum, case mismatch |

---

## 7. Critical Action Items

### 🚨 IMMEDIATE (BLOCKING)

1. **Resolve Type Import Path**
   - **Current**: `import type { Database } from "@/types/database.types";`
   - **Options**:
     - A) Point to remote types: `import type { Database } from "@/types/remote/database.types";`
     - B) Sync baseline migration to match remote schema, regenerate local types
   - **Impact**: Service will fail at runtime due to column name mismatches

2. **Fix Table/Column Name Drift**
   - Determine source of truth: Is table named `rating_slip` or `ratingslip`?
   - Determine column naming convention: `snake_case` or `camelCase`?
   - Create alignment migration or update service code
   - **Files affected**: All service queries

3. **Create Status Enum Migration**
   ```sql
   create type rating_slip_status as enum ('open', 'paused', 'resumed', 'closed', 'archived');
   alter table rating_slip alter column status type rating_slip_status using status::rating_slip_status;
   ```
   - Align with SRM contract lifecycle states
   - Resolve uppercase/lowercase conflict with RPC function

---

### ⚠️ HIGH PRIORITY

4. **Add Lifecycle Validation**
   - Implement status transition validation in service layer
   - Enforce state machine: `created → open → [paused ↔ resumed]* → closed → archived`
   - Validate `end_time` required when `status = 'closed'`

5. **Resolve policy_snapshot vs game_settings_id Pattern**
   - Decide between snapshot pattern (SRM contract) vs FK pattern (remote schema)
   - Update either SRM contract or create migration to add missing column
   - Impact: Mid-session reward calculation reproducibility

6. **Add Missing Fields to Baseline Migration**
   ```sql
   alter table rating_slip add column seat_number int;
   alter table rating_slip add column accumulated_seconds int not null default 0;
   alter table rating_slip add column game_settings_id uuid references game_settings(id);
   alter table rating_slip add column version int not null default 1;
   alter table rating_slip add column pause_intervals jsonb;
   ```
   - Match remote schema structure

---

### 📋 MEDIUM PRIORITY

7. **Add Service-Level Eligibility Check**
   ```typescript
   async isEligibleForReward(id: string): Promise<boolean>
   ```
   - Expose mid-session reward eligibility to higher-level services
   - Avoid direct database RPC calls from orchestration layer

8. **Add Schema Verification Test**
   ```typescript
   test('rating_slip schema matches SRM contract', async () => {
     const { data } = await supabase.from('rating_slip').select('*').limit(0);
     expect(data.columns).toMatchSRMContract();
   });
   ```
   - Catch schema drift before deployment

---

## 8. Root Cause Analysis

**Primary Issue**: **TWO SOURCES OF TRUTH FOR DATABASE SCHEMA**

1. **Baseline Migration** (`00000000000000_baseline_srm.sql`)
   - Defines schema as of SRM v3.0.2 contract
   - Uses `snake_case` column names
   - Missing modern fields (`seat_number`, `accumulated_seconds`, `version`, etc.)

2. **Remote Deployed Schema** (reflected in `remote/database.types.ts`)
   - Actual production database structure
   - Uses `camelCase` column names
   - Contains additional fields not in baseline

**Divergence Point**: Migrations were applied to remote database that were NOT included in baseline migration file.

**Contributing Factors**:
1. Service code was written against remote schema (uses `playerId`, `seat_number`, etc.)
2. Service imports local types generated from baseline migration
3. No schema verification tests to catch misalignment
4. Type generation script (`npm run db:types`) only updates `remote/database.types.ts`, not local file

**Recommended Fix**:
1. **Option A (Recommended)**: Make remote schema the source of truth
   - Update all services to import from `@/types/remote/database.types`
   - Treat baseline migration as historical reference only
   - Update baseline periodically via `npx supabase db dump --schema public`

2. **Option B**: Synchronize baseline to remote
   - Export remote schema: `npx supabase db dump --schema public > new_baseline.sql`
   - Replace `00000000000000_baseline_srm.sql` with exported schema
   - Regenerate local types from new baseline
   - Risk: Loses migration history

---

## 9. Recommendations for SRM Contract Update

**Proposed Changes to Service Responsibility Matrix v3.0.2**:

### Current Contract:
```
RatingSlip OWNS: average_bet, start_time, end_time, game_settings, seat_number, status, policy_snapshot
```

### Recommended Contract:
```
RatingSlip OWNS:
  - average_bet, start_time, end_time, status, seat_number
  - game_settings (jsonb for extensible metadata)
  - game_settings_id (FK to game_settings for policy reference)
  - accumulated_seconds (computed play time)
  - pause_intervals (jsonb array of pause/resume timestamps)
  - version (optimistic locking)

RatingSlip REFERENCES: player_id, casino_id, visit_id, table_id (now gaming_table_id)

Status Lifecycle:
  'open' → 'paused'/'resumed' → 'closed' → 'archived'
  (enum type: rating_slip_status)

Mid-session eligibility: status IN ('open', 'paused')
```

**Rationale**:
- Aligns contract with deployed schema reality
- Adds versioning for concurrent update protection
- Formalizes pause/resume tracking (pause_intervals)
- Replaces policy_snapshot with game_settings_id FK (reduces duplication)

---

## 10. Testing Recommendations

**Unit Tests Needed**:
```typescript
describe('RatingSlipService SRM Compliance', () => {
  test('cannot update player_id after creation', async () => { ... });
  test('cannot update casino_id after creation', async () => { ... });
  test('cannot update start_time after creation', async () => { ... });
  test('status transitions enforce lifecycle', async () => { ... });
  test('closing slip requires end_time', async () => { ... });
  test('service does not write to loyalty_ledger', async () => { ... });
});
```

**Integration Tests Needed**:
```typescript
describe('RatingSlip Schema Integrity', () => {
  test('database schema matches imported types', async () => { ... });
  test('rating_slip table has all SRM contract fields', async () => { ... });
  test('status column is enum type not text', async () => { ... });
});
```

---

## Appendix A: File References

- **Service Implementation**: `/home/diepulp/projects/pt-2/services/ratingslip/crud.ts`
- **Service Factory**: `/home/diepulp/projects/pt-2/services/ratingslip/index.ts`
- **Local Types (Stale)**: `/home/diepulp/projects/pt-2/types/database.types.ts` (1100 lines)
- **Remote Types (Current)**: `/home/diepulp/projects/pt-2/types/remote/database.types.ts` (2288 lines)
- **Baseline Migration**: `/home/diepulp/projects/pt-2/supabase/migrations/00000000000000_baseline_srm.sql`
- **SRM Contract**: (referenced, not read during audit)

---

## Appendix B: Grep Evidence

**Boundary Compliance**:
- ✅ Zero references to `points` column in service code
- ✅ Zero references to loyalty balance caching
- ✅ Zero direct loyalty ledger writes

**Schema Fields**:
- ⚠️ `seat_number`: Present in service DTO, missing in local types, exists in remote
- ⚠️ `accumulated_seconds`: Present in service DTO, missing in local types, exists in remote
- ⚠️ `policy_snapshot`: Present in migration/local types, missing in service DTO/remote types

**Type System**:
- ⚠️ Service imports from local types, not remote types
- ⚠️ Table name inconsistency: `rating_slip` (migration) vs `ratingslip` (remote)
- ⚠️ Column casing: `player_id` (local) vs `playerId` (remote)

---

**End of Audit Report**
