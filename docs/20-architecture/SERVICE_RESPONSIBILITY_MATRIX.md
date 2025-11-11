# Service Responsibility Matrix - Bounded Context Integrity (CANONICAL)

> **Version**: 3.0.2 (Rating Slip Mid-Session Rewards) - PATCHED
> **Date**: 2025-10-21
> **Status**: CANONICAL - Contract-First, snake_case, UUID-based
> **Purpose**: Maintain bounded context integrity across all service domains

> **Contract Policy (Canonical)**
> - Source of truth: **This SRM** (matrix-first). Schema MUST mirror this document.
> - Naming: **lower_snake_case** for tables/columns/enums; no quoted CamelCase.
> - IDs: **uuid** for all PKs/FKs. Text IDs allowed only as secondary business keys.
> - JSON: allowed only for **extensible metadata**; anything used in FKs/RLS/analytics must be a first-class column.
> - Ownership: Records that depend on casino policy MUST carry `casino_id` and (where applicable) `gaming_day`.
> - RLS: Policies derive from ownership in this SRM and must be shipped with each schema change.
> - Edge transport: First-party reads/writes enter via **Server Actions** wrapped by `withServerAction()` (auth → `SET LOCAL app.casino_id` → RLS scope → idempotency → audit). Route Handlers are reserved for 3rd-party/webhook/file-upload ingress and must reuse the same service DTO contracts. (See `docs/20-architecture/EDGE_TRANSPORT_POLICY.md` for the detailed middleware contract.)
> - Headers: `x-correlation-id` required on **all** edge calls; `x-idempotency-key` required on **mutations** and persisted by the owning service (Finance, Loyalty, etc.).
> - DTOs: Contract-first DTOs live beside each service, validated with shared zod schemas that are also imported by tests.
> - Service layer boundaries: Cross-context consumers interact via DTO-level APIs, service factories, or RPCs declared in this SRM—never by reaching into another service's tables/views directly.
> - Observability & audit: Correlation IDs are injected at the edge and propagated through every service call/RPC (`SET LOCAL application_name = correlation_id`). All contexts emit rows to the canonical audit shape (`{ts, actor_id, casino_id, domain, action, dto_before, dto_after, correlation_id}`) and expose SLO budgets.

> **Conventions**
> **Identifiers**
> - All primary keys are `uuid default gen_random_uuid()`; all foreign keys reference `uuid`.
> - Business keys (`employee_id`, `table_label`, etc.) are `text` with unique constraints as needed.

---

## DTO Contract Policy (Type System Integrity)

> **Canonical Reference**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
> **Enforcement**: ESLint + Pre-commit hooks + CI gates
> **Status**: MANDATORY (Effective 2025-10-22)

### 1. **Table Ownership → DTO Ownership**

**Rule**: A service that OWNS a table in this SRM MUST provide canonical DTOs for that table.

| Service | Owns Tables | MUST Export DTOs |
|---------|-------------|------------------|
| **Casino** | `casino`, `casino_settings`, `company`, `staff`, `game_settings` | `CasinoDTO`, `CasinoSettingsDTO`, `StaffDTO`, `GameSettingsDTO` |
| **Player** | `player`, `player_casino` | `PlayerDTO`, `PlayerEnrollmentDTO` |
| **Visit** | `visit` | `VisitDTO` |
| **Loyalty** | `player_loyalty`, `loyalty_ledger` | `PlayerLoyaltyDTO`, `LoyaltyLedgerEntryDTO` |
| **RatingSlip** | `rating_slip` | `RatingSlipDTO`, `RatingSlipTelemetryDTO` |
| **Finance** | `player_financial_transaction` | `FinancialTransactionDTO` |
| **MTL** | `mtl_entry`, `mtl_audit_note` | `MTLEntryDTO`, `MTLAuditNoteDTO` |
| **TableContext** | `gaming_table`, `gaming_table_settings`, `dealer_rotation`, chip custody tables | `GamingTableDTO`, `DealerRotationDTO`, `TableInventoryDTO`, `TableFillDTO`, `TableCreditDTO`, `TableDropDTO` |
| **FloorLayout** | `floor_layout`, `floor_layout_version`, `floor_pit`, `floor_table_slot`, `floor_layout_activation` | `FloorLayoutDTO`, `FloorLayoutVersionDTO`, `FloorPitDTO`, `FloorTableSlotDTO`, `FloorLayoutActivationDTO` |

**File Location**: `services/{service}/dtos.ts` (REQUIRED for all services)

---

### 2. **Bounded Context DTO Access Rules**

**Rule**: Services MUST NOT directly access `Database['public']['Tables']['X']` for tables they don't own.

**Enforcement**: ESLint rule `no-cross-context-db-imports` (see DTO_CANONICAL_STANDARD.md:176-243)

#### Cross-Context DTO Consumption (Allowed Patterns)

| Consumer Service | Can Import DTOs From | Use Case | SRM Reference |
|------------------|---------------------|----------|---------------|
| **Loyalty** | RatingSlip (`RatingSlipTelemetryDTO`) | Calculate mid-session rewards | SRM:358-373 |
| **Loyalty** | Visit (`VisitDTO`) | Session context for ledger entries | SRM:358 |
| **Finance** | Visit (`VisitDTO`) | Associate transactions with sessions | SRM:1122 |
| **Finance** | RatingSlip (`RatingSlipDTO`) | Legacy compat FK (`rating_slip_id`) | SRM:1123 |
| **MTL** | RatingSlip (`RatingSlipDTO`) | Optional FK for compliance tracking | SRM:1295 |
| **MTL** | Visit (`VisitDTO`) | Optional FK for compliance tracking | SRM:1297 |
| **TableContext** | Casino (`CasinoSettingsDTO`) | Gaming day temporal authority | SRM:569 |
| **RatingSlip** | TableContext (`GamingTableDTO`) | Table assignment FK | SRM:1044-1045 |
| **All Services** | Casino (`CasinoDTO`, `StaffDTO`) | `casino_id` FK, staff references | SRM:148 |

**Example (CORRECT)**:
```typescript
// services/loyalty/mid-session-reward.ts
import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos';
// ✅ Consumes published DTO from owning service

function calculateReward(telemetry: RatingSlipTelemetryDTO): number {
  return telemetry.average_bet * telemetry.duration_seconds * 0.01;
}
```

**Example (FORBIDDEN)**:
```typescript
// services/loyalty/telemetry.ts
import type { Database } from '@/types/database.types';
type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];
// ❌ ESLint error: BOUNDED CONTEXT VIOLATION
// Service "loyalty" cannot directly access table "rating_slip"
```

---

### 3. **DTO Derivation Patterns (By Service Type)**

#### A. **Bounded Context Services** (Complex Business Logic)

**Services**: Loyalty, Finance, MTL, TableContext

**Pattern**: Contract-First DTOs (SRM-aligned interfaces + mappers)

```typescript
// services/loyalty/dtos.ts
/**
 * PlayerLoyaltyDTO - Public loyalty balance
 *
 * Exposure: UI, external APIs
 * Excludes: preferences (internal-only)
 * Owner: LoyaltyService (SRM:343-373)
 */
export interface PlayerLoyaltyDTO {
  player_id: string;
  casino_id: string;
  balance: number;
  tier: string | null;
}

// services/loyalty/mappers.ts (INTERNAL USE ONLY)
import type { Database } from '@/types/database.types';

type LoyaltyRow = Database['public']['Tables']['player_loyalty']['Row'];

export function toPlayerLoyaltyDTO(row: LoyaltyRow): PlayerLoyaltyDTO {
  return {
    player_id: row.player_id,
    casino_id: row.casino_id,
    balance: row.balance,
    tier: row.tier,
    // Omit: preferences (internal field)
  };
}
```

**Rationale**:
- Decouples domain contracts from schema evolution
- Enforces explicit control over field exposure
- Prevents internal columns from leaking to public APIs

---

#### B. **Thin CRUD Services** (Simple Data Access)

**Services**: Player, Visit, Casino

**Pattern**: Canonical DTOs (Pick/Omit from Database types with allowlist enforcement)

```typescript
// services/player/dtos.ts
import type { Database } from '@/types/database.types';

/**
 * PlayerDTO - Public player profile
 *
 * Exposure: UI, external APIs
 * Excludes: birth_date (PII), internal_notes (staff-only)
 * Owner: PlayerService (SRM:149)
 */
export type PlayerDTO = Pick<
  Database['public']['Tables']['player']['Row'],
  'id' | 'first_name' | 'last_name' | 'created_at'
>;

export type PlayerCreateDTO = Pick<
  Database['public']['Tables']['player']['Insert'],
  'first_name' | 'last_name' | 'birth_date'
>;
```

**Rationale**:
- Minimal boilerplate for simple CRUD
- Automatic schema sync via `npm run db:types`
- Allowlist enforcement prevents PII leakage (ESLint rule: `dto-column-allowlist`)

---

#### C. **Hybrid Services** (Mixed Complexity)

**Services**: RatingSlip (owns telemetry, publishes to Loyalty/Finance)

**Pattern**: Canonical DTOs for owned data + mapper functions for cross-context publishing

```typescript
// services/rating-slip/dtos.ts
import type { Database } from '@/types/database.types';

// Internal DTO (full row)
export type RatingSlipDTO = Database['public']['Tables']['rating_slip']['Row'];

// Published DTO (cross-context contract)
export interface RatingSlipTelemetryDTO {
  id: string;
  player_id: string;
  casino_id: string;
  average_bet: number | null;
  duration_seconds: number;
  game_type: 'blackjack' | 'poker' | 'roulette' | 'baccarat';
  // Omit: policy_snapshot (internal), visit_id (FK not needed by consumers)
}

// services/rating-slip/mappers.ts
export function toTelemetryDTO(slip: RatingSlipDTO): RatingSlipTelemetryDTO {
  return {
    id: slip.id,
    player_id: slip.player_id,
    casino_id: slip.casino_id,
    average_bet: slip.average_bet,
    duration_seconds: calculateDuration(slip),
    game_type: slip.game_settings?.type || 'blackjack',
  };
}
```

---

### 4. **Column Exposure Policy**

**Rule**: DTOs MUST document exposure scope and excluded fields.

**Required JSDoc Template**:
```typescript
/**
 * {ServiceName}DTO - {Purpose}
 *
 * Exposure: {UI | Admin UI | External API | Internal only}
 * Excludes: {field1 (reason), field2 (reason), ...}
 * Owner: {ServiceName} (SRM:{line-ref})
 */
```

**Sensitive Tables** (MUST use allowlist):
- `player`: Exclude `birth_date`, `ssn`, `internal_notes`, `risk_score`
- `staff`: Exclude `employee_id`, `email`, `ssn`
- `player_financial_transaction`: Exclude `idempotency_key` (internal-only)
- `loyalty_ledger`: Exclude `idempotency_key` (internal-only)

**Enforcement**: ESLint rule `dto-column-allowlist` (DTO_CANONICAL_STANDARD.md:246-305)

---

### 5. **Type Import Restrictions**

**Rule**: `types/database.types.ts` MUST only be imported in:
1. Service-owned `mappers.ts` files (internal use)
2. Service-owned `dtos.ts` files (for canonical pattern services)
3. RPC parameter builders

**Forbidden Locations**:
- ❌ `app/` directory (route handlers, server actions)
- ❌ `components/` directory (UI components)
- ❌ `lib/` directory (shared utilities)
- ❌ Cross-service imports (e.g., loyalty importing from `services/rating-slip/mappers.ts`)

**Enforcement**: ESLint import restrictions (DTO_CANONICAL_STANDARD.md:176-243)

---

### 6. **CI Validation Requirements**

All DTO changes MUST pass:

1. **Syntax Check**: No manual `interface` DTOs (ESLint: `no-manual-dto-interfaces`)
2. **Bounded Context Check**: No cross-service table access (ESLint: `no-cross-context-db-imports`)
3. **Column Allowlist Check**: Sensitive fields not exposed (ESLint: `dto-column-allowlist`)
4. **Ownership Check**: All SRM-owned tables have published DTOs
5. **Documentation Check**: All DTOs have exposure JSDoc

**CI Gate** (GitHub Actions):
```yaml
- name: Validate DTO Compliance
  run: |
    npx eslint services/**/*.ts --max-warnings 0
    node scripts/validate-srm-ownership.js
    node scripts/validate-dto-fields.js
```

---

### 7. **Migration Workflow**

When adding/modifying a table:

1. **Update SRM**: Document table in ownership matrix
2. **Run Migration**: `npx supabase migration new {description}`
3. **Regenerate Types**: `npm run db:types` (CRITICAL)
4. **Create/Update DTOs**: In owning service's `dtos.ts`
5. **Add Mappers** (if bounded context): In owning service's `mappers.ts`
6. **Run Type Check**: `npm run type-check` (must pass)
7. **Run ESLint**: `npx eslint services/{service}/` (must pass)
8. **Update Tests**: Use same DTOs in test fixtures

**Enforcement**: Pre-commit hook validates steps 6-7 (DTO_CANONICAL_STANDARD.md:309-327)

---

## CI Validation Catalogs

### Centralized Enum Catalog

```sql
create type staff_role as enum ('dealer','pit_boss','admin');
create type staff_status as enum ('active','inactive');
create type game_type as enum ('blackjack','poker','roulette','baccarat');
create type table_status as enum ('inactive','active','closed');
create type loyalty_reason as enum ('mid_session','session_end','manual_adjustment','promotion','correction');
-- Optional (declare when standardized)
-- create type mtl_direction as enum ('in','out');
```
- Migration order: enums first, then tables that consume them.
- Change policy: additive values only; removals require deprecation plus data rewrite.

### Event / Telemetry Notes

**rating_slip.events** (reference, non-persistent)
```json
{
  "event": "rating_slip.updated",
  "rating_slip_id": "uuid",
  "player_id": "uuid",
  "casino_id": "uuid",
  "average_bet": 25.0,
  "minutes_played": 42,
  "game_type": "blackjack",
  "at": "2025-10-21T19:15:00Z"
}
```

**loyalty.ledger_appended**
```json
{
  "event": "loyalty.ledger_appended",
  "ledger_id": "uuid",
  "player_id": "uuid",
  "points_earned": 120,
  "reason": "session_end",
  "rating_slip_id": "uuid|null",
  "at": "2025-10-21T19:16:00Z"
}
```
- Contract: event keys mirror table FKs and types in this SRM; no ad-hoc string keys.

### Index Strategy Stubs

```sql
-- Loyalty lookups
create index if not exists ix_loyalty_ledger_player_time
  on loyalty_ledger (player_id, created_at desc);

create index if not exists ix_loyalty_ledger_rating_slip_time
  on loyalty_ledger (rating_slip_id, created_at desc);

-- Game settings uniqueness
create unique index if not exists ux_game_settings_casino_type
  on game_settings (casino_id, game_type);

-- Table rotations (recent first)
create index if not exists ix_dealer_rotation_table_time
  on dealer_rotation (table_id, started_at desc);

-- Finance reporting
create index if not exists ix_fin_txn_player_time
  on player_financial_transaction (player_id, created_at desc);

create index if not exists ix_fin_txn_casino_gaming_day
  on player_financial_transaction (casino_id, gaming_day);

-- MTL compliance scans
create index if not exists ix_mtl_casino_time
  on mtl_entry (casino_id, created_at desc);
```

### Edge Transport Compliance *(see `docs/20-architecture/EDGE_TRANSPORT_POLICY.md` for full detail)*

- `withServerAction()` MUST be the canonical entry point for first-party mutations/reads so CI can verify the wrapper sets `app.casino_id`, enforces auth, and writes to `audit_log` with the provided `x-correlation-id`.
- Server Actions and Route Handlers share a single zod schema per DTO; CI fails if UI imports database types directly or if tests do not reuse the contract schema.
- Each mutation action documents how it persists `x-idempotency-key` inside the owning service (e.g., `loyalty_ledger`, `player_financial_transaction`) and CI asserts the persistence path exists before deploy.
- `withServerAction()` is composed from independently tested middlewares: `withAuth()` → `withRLS()` → `withRateLimit()` → `withIdempotency()` → `withAudit()` → `withTracing()`. Each middleware stays <100 LOC, exposes a deterministic contract, and has unit tests so we can evolve concerns independently instead of accreting "god" wrappers.
- Domain errors raised inside services are mapped once (inside the middleware chain) to canonical HTTP codes; Postgres errors must never escape to the UI directly.

### Error Taxonomy & Resilience *(see `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md` for full detail)*

**Status**: MANDATORY (Effective 2025-11-09)

**Purpose**: Prevent Postgres errors from leaking to UI, implement retry policies with idempotency, and protect hot paths via rate limiting.

#### Pitfalls (Before)

1. **UI couples to Postgres codes**: Error messages expose database implementation
   - User sees: `"error": "23505: duplicate key violation"`
   - Should see: `"error": "REWARD_ALREADY_ISSUED"`

2. **Retries cause duplicates**: No idempotency enforcement leads to double-spend
   - Retry without idempotency key → duplicate financial transaction
   - User charged twice

3. **User-visible 500s**: Generic errors don't provide actionable feedback
   - All errors return HTTP 500
   - No distinction between client errors (400) and server errors (500)

#### Upgrades (Now)

1. **Domain Error Catalog**: Service-specific error codes that hide infrastructure details
   ```typescript
   // ❌ BEFORE
   catch (error) {
     return { error: '23505: duplicate key' }; // Postgres code leaks
   }

   // ✅ AFTER
   throw new DomainError('REWARD_ALREADY_ISSUED', 'Reward has already been issued');
   ```

2. **Retry Policy**: Only retry idempotent operations with exponential backoff
   ```typescript
   // ❌ BEFORE
   for (let i = 0; i < 3; i++) {
     await createTransaction(data); // No idempotency!
   }

   // ✅ AFTER
   await withIdempotentRetry({
     execute: () => createTransaction(data),
     idempotencyKey: requestId,
     checkDuplicate: () => findExisting(requestId),
   });
   ```

3. **Rate Limiting**: Multi-level limits (actor, casino) to protect hot paths
   ```typescript
   // ✅ Rate limiting at edge
   await withServerAction(handler, {
     endpoint: 'loyalty.issue-reward',
     actorId: staffId,
     casinoId,
   });
   ```

4. **Circuit Breaking**: Fail-fast for noisy endpoints to prevent cascade failures
   ```typescript
   const breaker = new CircuitBreaker('finance.create-transaction', {
     failureThreshold: 5,
     resetTimeoutMs: 60000,
   });
   ```

#### Domain Error Codes by Service

**Visit Domain:**
- `VISIT_NOT_FOUND`, `VISIT_NOT_OPEN`, `VISIT_ALREADY_CLOSED`
- `VISIT_PLAYER_MISMATCH`, `VISIT_CASINO_MISMATCH`, `VISIT_CONCURRENT_MODIFICATION`

**Loyalty Domain:**
- `INSUFFICIENT_BALANCE`, `REWARD_ALREADY_ISSUED`, `LOYALTY_ACCOUNT_NOT_FOUND`
- `LOYALTY_TIER_INVALID`, `LOYALTY_REDEMPTION_FAILED`, `LOYALTY_POINTS_NEGATIVE`
- `LOYALTY_POLICY_VIOLATION`

**Rating Slip Domain:**
- `RATING_SLIP_NOT_FOUND`, `RATING_SLIP_NOT_OPEN`, `RATING_SLIP_ALREADY_CLOSED`
- `RATING_SLIP_INVALID_STATE`, `RATING_SLIP_MISSING_REQUIRED_DATA`, `RATING_SLIP_CONCURRENT_UPDATE`

**Finance Domain:**
- `TRANSACTION_NOT_FOUND`, `TRANSACTION_ALREADY_PROCESSED`, `TRANSACTION_AMOUNT_INVALID`
- `TRANSACTION_INSUFFICIENT_FUNDS`, `TRANSACTION_CANCELLED`, `TRANSACTION_VOIDED`
- `GAMING_DAY_MISMATCH`

**MTL Domain:**
- `MTL_ENTRY_NOT_FOUND`, `MTL_THRESHOLD_EXCEEDED`, `MTL_WATCHLIST_HIT`
- `MTL_CTR_REQUIRED`, `MTL_IMMUTABLE_ENTRY`, `MTL_MISSING_COMPLIANCE_DATA`

**Table Context Domain:**
- `TABLE_NOT_FOUND`, `TABLE_NOT_ACTIVE`, `TABLE_ALREADY_ACTIVE`
- `TABLE_OCCUPIED`, `TABLE_DEALER_CONFLICT`, `TABLE_SETTINGS_INVALID`
- `TABLE_FILL_REJECTED`, `TABLE_CREDIT_REJECTED`

**Player Domain:**
- `PLAYER_NOT_FOUND`, `PLAYER_ALREADY_EXISTS`, `PLAYER_NOT_ENROLLED`
- `PLAYER_ENROLLMENT_DUPLICATE`, `PLAYER_SUSPENDED`, `PLAYER_SELF_EXCLUDED`

**Casino Domain:**
- `CASINO_NOT_FOUND`, `CASINO_SETTINGS_NOT_FOUND`, `CASINO_INACTIVE`
- `STAFF_NOT_FOUND`, `STAFF_UNAUTHORIZED`, `STAFF_CASINO_MISMATCH`

**Floor Layout Domain:**
- `LAYOUT_NOT_FOUND`, `LAYOUT_VERSION_NOT_FOUND`, `LAYOUT_NOT_APPROVED`
- `LAYOUT_ALREADY_ACTIVE`, `LAYOUT_IMMUTABLE`, `LAYOUT_VALIDATION_FAILED`

#### HTTP Status Code Mapping

| Error Pattern | HTTP Status | Retryable | Example |
|---------------|-------------|-----------|---------|
| `*_NOT_FOUND` | 404 | No | `VISIT_NOT_FOUND` |
| `*_INVALID`, `*_MISSING`, `*_MISMATCH` | 400 | No | `TABLE_SETTINGS_INVALID` |
| `*_ALREADY_*`, `*_DUPLICATE` | 409 | No | `REWARD_ALREADY_ISSUED` |
| `*_CONCURRENT_*` | 409 | Yes | `VISIT_CONCURRENT_MODIFICATION` |
| `INSUFFICIENT_*`, `*_EXCEEDED`, `*_VIOLATION`, `*_REJECTED` | 422 | No | `INSUFFICIENT_BALANCE` |
| `UNAUTHORIZED` | 401 | No | `UNAUTHORIZED` |
| `FORBIDDEN`, `*_UNAUTHORIZED` | 403 | No | `STAFF_UNAUTHORIZED` |
| `RATE_LIMIT_EXCEEDED` | 429 | Yes | Rate limit hit |
| `INTERNAL_ERROR` | 500 | Yes | Unexpected failures |

#### Rate Limit Rules by Service

| Endpoint | Per Actor | Per Casino | Notes |
|----------|-----------|------------|-------|
| `finance.create-transaction` | 10/min | 100/min | Strict (high-value) |
| `loyalty.issue-reward` | 20/min | 200/min | Moderate |
| `mtl.create-entry` | 30/min | 500/min | Moderate |
| `visit.check-in` | — | 1000/min | Generous (high volume) |
| `*.read` | 100/min | 5000/min | Very generous |

#### Retry Policies by Operation

| Operation | Max Retries | Initial Delay | Max Delay | Backoff |
|-----------|-------------|---------------|-----------|---------|
| `finance.create-transaction` | 5 | 200ms | 10s | 2x |
| `loyalty.issue-reward` | 3 | 150ms | 5s | 2x |
| `*.read` | 2 | 50ms | 1s | 2x |
| Default | 3 | 100ms | 5s | 2x |

**Retry Policy Rules:**
- **ONLY retry idempotent operations** (must have `idempotencyKey`)
- Use exponential backoff with jitter (10% randomness)
- Check for duplicate before retry (query by `idempotency_key`)
- Circuit break after threshold failures (default: 5)
- Never retry validation errors (400, 404, 422)

#### Audit & SRM Updates Required

**Per Service:**
- [ ] Define domain error codes in `services/{service}/errors.ts`
- [ ] Document error codes in service README
- [ ] Map Postgres errors to domain errors
- [ ] Add error scenarios to integration tests
- [ ] Update SRM with service-specific error codes

**SRM Validation (CI):**
```bash
# Error taxonomy validation
node scripts/validate-error-taxonomy.js

# Assertions:
# 1. All services have domain error codes defined
# 2. Error codes follow naming convention (*_NOT_FOUND, *_INVALID, etc.)
# 3. All domain errors mapped to HTTP status codes
# 4. Retry policies defined for mutation endpoints
# 5. Rate limits configured for hot paths
```

**Migration Checklist:**
- [ ] Loyalty: Map `REWARD_ALREADY_ISSUED` (replaces 23505)
- [ ] Finance: Map `TRANSACTION_ALREADY_PROCESSED` (replaces idempotency checks)
- [ ] Visit: Map `VISIT_NOT_OPEN` (replaces status check)
- [ ] RatingSlip: Map `RATING_SLIP_NOT_OPEN` (replaces status check)
- [ ] MTL: Map `MTL_THRESHOLD_EXCEEDED` (replaces threshold validation)
- [ ] TableContext: Map `TABLE_NOT_ACTIVE` (replaces status check)

**References:**
- Error Taxonomy Spec: `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md`
- Domain Errors: `lib/errors/domain-errors.ts`
- Retry Policy: `lib/errors/retry-policy.ts`
- Rate Limiter: `lib/errors/rate-limiter.ts`
- Error Mapping: `lib/server-actions/error-map.ts`

### Security & Tenancy *(see `docs/30-security/SECURITY_TENANCY_UPGRADE.md` for full detail)*

**Status**: MANDATORY (Effective 2025-11-09)

**Purpose**: Eliminate privilege escalation via service keys; enforce multi-tenant isolation via canonical RLS pattern.

#### Pitfalls (Before)

1. **Complex OR trees in RLS**: Hard to audit, prone to logic errors
   ```sql
   -- ❌ BEFORE: 6-way OR with nested conditions
   using (
     (auth.jwt() ->> 'casino_id')::uuid = casino_id
     OR auth.jwt() ->> 'role' = 'admin'
     OR auth.jwt() ->> 'permissions' @> '["global.read"]'
   )
   ```
   **Risk**: Accidental bypass, incomplete conditions, hard to validate

2. **Accidental privilege via service keys**: Server actions with elevated permissions
   ```typescript
   // ❌ BEFORE: Service key bypasses RLS
   const supabase = createClient(url, SERVICE_ROLE_KEY);
   await supabase.from('visit').select('*'); // Reads ALL casinos!
   ```
   **Risk**: Cross-tenant data leakage, privilege escalation

3. **JWT claim overload**: Auth tokens carry business logic
   ```sql
   -- ❌ BEFORE: Stale claims, token bloat
   using (auth.jwt() ->> 'casino_id' = casino_id::text)
   ```
   **Risk**: Token size bloat, stale claims, inconsistent state

#### Upgrades (Now)

1. **No service keys in runtime**: Every call uses anon key + user context
   ```typescript
   // ✅ AFTER: Anon key only
   const supabase = createClient(url, ANON_KEY);
   // User context from cookies → auth.uid()
   ```

2. **WRAPPER asserts and injects**: `actor_id` + `casino_id` injected via `SET LOCAL`
   ```typescript
   // ✅ WRAPPER flow
   const rlsContext = await getAuthContext(supabase); // auth.uid() → staff
   await injectRLSContext(supabase, rlsContext);      // SET LOCAL app.*
   ```

3. **Canonical RLS pattern**: Single deterministic path
   ```sql
   -- ✅ AFTER: No OR trees, uses current_setting()
   create policy "visit_read_same_casino"
     on visit for select using (
       auth.uid() = (select user_id from staff where id = current_setting('app.actor_id')::uuid)
       AND casino_id = current_setting('app.casino_id')::uuid
     );
   ```

#### RLS Context Injection

**Implementation** (`lib/supabase/rls-context.ts`):

```typescript
export interface RLSContext {
  actorId: string;  // staff.id
  casinoId: string; // staff.casino_id
  staffRole: string; // staff.role
}

// Flow:
// 1. auth.getUser() → user_id
// 2. Query staff: user_id → staff.id, casino_id, role
// 3. Validate active staff with casino assignment
export async function getAuthContext(supabase): Promise<RLSContext> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: staff } = await supabase
    .from('staff')
    .select('id, casino_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  return {
    actorId: staff.id,
    casinoId: staff.casino_id,
    staffRole: staff.role,
  };
}

// Inject via SET LOCAL
export async function injectRLSContext(supabase, context, correlationId): Promise<void> {
  await supabase.rpc('exec_sql', {
    sql: `
      SET LOCAL app.actor_id = '${context.actorId}';
      SET LOCAL app.casino_id = '${context.casinoId}';
      SET LOCAL app.staff_role = '${context.staffRole}';
      SET LOCAL application_name = '${correlationId}';
    `
  });
}
```

#### RLS Policy Templates

**Template 1: Read Access (Casino-Scoped)**
```sql
create policy "{table}_read_same_casino"
  on {table} for select using (
    auth.uid() = (
      select user_id
      from staff
      where id = current_setting('app.actor_id')::uuid
    )
    AND casino_id = current_setting('app.casino_id')::uuid
  );
```

**Template 2: Write Access (Role-Gated)**
```sql
create policy "{table}_insert_authorized"
  on {table} for insert with check (
    auth.uid() = (
      select user_id
      from staff
      where id = current_setting('app.actor_id')::uuid
      and role in ('pit_boss', 'admin')
    )
    AND casino_id = current_setting('app.casino_id')::uuid
  );
```

**Template 3: Append-Only Ledger**
```sql
-- Insert only
create policy "{table}_append_authorized"
  on {table} for insert with check (
    auth.uid() = (select user_id from staff where id = current_setting('app.actor_id')::uuid)
    AND casino_id = current_setting('app.casino_id')::uuid
  );

-- Deny updates/deletes
create policy "{table}_no_updates" on {table} for update using (false);
create policy "{table}_no_deletes" on {table} for delete using (false);
```

#### RLS Policy Matrix

| Service | Tables | Read Policy | Write Policy | Template |
|---------|--------|-------------|--------------|----------|
| **Casino** | `staff`, `casino_settings` | Same casino | Admin only | Template 2 (admin role) |
| **Player** | `player_casino` | Same casino | Enrollment service | Template 2 (enrollment role) |
| **Visit** | `visit` | Same casino | Pit boss, admin | Template 2 (pit_boss, admin) |
| **Loyalty** | `player_loyalty`, `loyalty_ledger` | Same casino | RPC only | Template 3 (append-only) |
| **Finance** | `player_financial_transaction` | Same casino | RPC only | Template 3 (append-only) |
| **MTL** | `mtl_entry`, `mtl_audit_note` | Compliance roles | Cashier, compliance | Template 3 (append-only) |
| **Table Context** | `gaming_table`, `dealer_rotation` | Operations staff | Pit boss, admin | Template 2 (pit_boss, admin) |
| **Rating Slip** | `rating_slip` | Same casino | Telemetry service | Template 2 (telemetry role) |
| **Floor Layout** | `floor_layout`, `floor_pit` | Same casino | Admin only | Template 2 (admin role) |

#### Migration Checklist

**Database:**
- [ ] Add `user_id uuid references auth.users(id)` to `staff` table
- [ ] Create `exec_sql(text)` RPC for `SET LOCAL` commands
- [ ] Apply RLS policies per template (table by table)
- [ ] Enable RLS on all casino-scoped tables
- [ ] Deny direct table access (force RPC for mutations)

**Application:**
- [ ] Remove all `SERVICE_ROLE_KEY` usage from runtime code
- [ ] Update `withServerAction` to inject RLS context
- [ ] Validate `auth.uid()` → `staff.user_id` link
- [ ] Test cross-casino isolation
- [ ] Audit admin override policies

**CI Validation:**
```bash
# Security audit script
node scripts/validate-rls-policies.js

# Assertions:
# 1. All tables with casino_id have RLS enabled
# 2. No service key usage in runtime (grep SERVICE_ROLE_KEY)
# 3. All policies use current_setting() pattern
# 4. staff.user_id column exists and is unique
# 5. exec_sql RPC exists and is secured
```

#### Anti-Patterns

**❌ DON'T: Complex OR trees**
```sql
-- ❌ BAD: Hard to audit
using (
  casino_id = current_setting('app.casino_id')::uuid
  OR current_setting('app.staff_role') = 'admin'
  OR ...
)
```

**✅ DO: Single path**
```sql
-- ✅ GOOD: Deterministic
using (
  auth.uid() = (select user_id from staff where id = current_setting('app.actor_id')::uuid)
  AND casino_id = current_setting('app.casino_id')::uuid
)
```

**❌ DON'T: Service keys in runtime**
```typescript
// ❌ BAD
const supabase = createClient(url, SERVICE_ROLE_KEY);
```

**✅ DO: Anon key + user context**
```typescript
// ✅ GOOD
const supabase = createClient(url, ANON_KEY);
```

**❌ DON'T: JWT claim logic**
```sql
-- ❌ BAD
using (auth.jwt() ->> 'casino_id' = casino_id::text)
```

**✅ DO: Database session context**
```sql
-- ✅ GOOD
using (casino_id = current_setting('app.casino_id')::uuid)
```

**References:**
- Security Upgrade Spec: `docs/30-security/SECURITY_TENANCY_UPGRADE.md`
- RLS Context: `lib/supabase/rls-context.ts`
- WRAPPER Integration: `lib/server-actions/with-server-action-wrapper.ts`
- Policy Matrix: `docs/30-security/SEC-001-rls-policy-matrix.md`

### Client Cache & Realtime Discipline *(aligns with `context/state-management.context.md`)*

- React Query is the single source of truth for server data. Query keys follow `[domain, operation, scope?, ...params]` (e.g., `['rating-slip','detail',slip_id]`) so mutation invalidation and realtime reconciliation remain deterministic.
- Every mutation declares the SRM domain events it emits (`ratingSlip.updated`, `loyalty.ledger_appended`, etc). The same event payload is published via Edge (Server Action) and consumed by Supabase Realtime so UI caches can reconcile without streaming raw row-level changes.
- Implement a shared `invalidateByDomainEvent(event, payload)` helper that maps SRM events to React Query keys; use it in both mutation success handlers and realtime listeners.
- Realtime channels are scoped by casino and resource: `{casino_id}` for collection/list feeds; `{casino_id}:{resource_id}` for detail views. Hot domains (RatingSlip, TableContext telemetry) broadcast state transitions or periodic snapshots (1–5s) instead of every row mutation to avoid over-subscription.
- Realtime subscriptions include predicates on `casino_id` **and role**; channel joins are denied unless the caller's role matches the SRM RLS policy (e.g., pit boss vs cage). For high-cardinality dashboards, prefer **poll + ETag** refresh (React Query refetch with `If-None-Match`) rather than realtime streams.

### UX & Data Fetching Patterns *(see `docs/70-governance/UX_DATA_FETCHING_PATTERNS.md` for full detail)*

**Status**: MANDATORY (Effective 2025-11-09)

**Purpose**: Prevent UI jank from large lists and real-time updates; optimize perceived performance.

#### Upgrades

1. **Windowed Lists + Skeletons**: Lists > 100 items MUST use `@tanstack/react-virtual`; all async loads show skeletons (not spinners).

2. **Stale-While-Revalidate**: Non-critical reads use stale data while fetching fresh in background. Configure `staleTime` by data type:
   - **Hot** (table status): 30s stale, 2m cache, 10s poll
   - **Warm** (players): 5m stale, 30m cache
   - **Cold** (settings): 1h stale, 24h cache
   - **Critical** (balances): 0s stale (always fresh)

3. **Background Prefetch**: Prefetch on hover (detail views) + route navigation (SSR hydration).

4. **Optimistic Updates Policy**: ONLY where idempotency is guaranteed AND conflicts are rare.
   - ✅ **Safe**: Toggle flags, update text fields (idempotent, low conflict)
   - ❌ **Unsafe**: Financial transactions, loyalty rewards, rating slip closure (non-idempotent or state machines)

**References:**
- UX Patterns Spec: `docs/70-governance/UX_DATA_FETCHING_PATTERNS.md`
- TanStack Virtual: `https://tanstack.com/virtual/latest`
- Frontend Canonical Standard: `docs/70-governance/FRONT_END_CANONICAL_STANDARD.md`

### Service Layer Isolation & CQRS Guidance

- Each bounded context exposes **DTO-level service APIs** (_service factories, RPCs, server actions_) defined in this SRM. Other contexts consume those APIs; direct table/view reads across contexts are prohibited (e.g., Loyalty never joins `rating_slip`, it calls `rpc_issue_mid_session_reward`).
- Cross-context write paths occur via RPCs owned by the target service. WRAPPER code must not fan out into multiple services when a single domain orchestration suffices—push orchestration into service-level factories to avoid N+1 RPCs.
- Hot telemetry domains (RatingSlip, TableContext) follow a CQRS-light pattern: append-only write models optimized for ingest plus projection jobs/materialized views for read models. Projection cadence and ownership are documented per service section.

### Financial & Reward Correctness

- **Idempotency first**: Financial and Loyalty ledgers MUST include nullable `idempotency_key text` columns plus partial unique indexes on `(casino_id, idempotency_key)` to prevent double-spend/replay. Mutating RPCs require callers to supply a stable key per user intent; duplicates return the original identifiers.
- **Outbox reliability**: Finance and Loyalty own dedicated outbox tables (`finance_outbox`, `loyalty_outbox`) for side effects (emails, webhooks, projections). Background workers drain these tables using `FOR UPDATE SKIP LOCKED`, mark `processed_at`, and emit downstream events exactly once.
- **Pure policy evaluation**: Reward policy evaluation remains a pure function (no writes) that can be re-run safely. Reward issuance stays inside stateful RPCs that append ledger rows + outbox entries atomically.

### Deprecation Policy

```md
**DEPRECATIONS**
- `rating_slip.points` — deprecated in v3.0.0, EOL v3.2.0. Replace with `player_loyalty.balance`.
- `dealer_rotation.table_string_id` (legacy alias `tableStringId`) — deprecated in v3.0.0, EOL v3.1.0. Use FK `dealer_rotation.table_id`.
```
- CI rule: fail when an EOL item exists past its target version (5 business day grace max).
- Every deprecation must name rationale, migration/backfill plan, owner, and EOL release.

---

## Service Responsibility Matrix

| Domain | Service | Owns | References | Aggregates | Responsibilities |
|--------|---------|------|------------|------------|------------------|
| **Foundational** | `CasinoService` | • Casino registry<br>• **casino_settings** (EXCLUSIVE WRITE)<br>• **Timezone & gaming day** (temporal authority)<br>• **Compliance thresholds** (CTR, watchlist)<br>• Game config templates<br>• Staff & access control<br>• Corporate grouping<br>• Audit logs<br>• Reports | • Company (FK, corporate parent) | • All operational domains<br>• Policy inheritance<br>• Configuration distribution | **Root temporal authority & global policy** |
| **Identity** | `PlayerService` | • Player profile<br>• Contact info<br>• Identity data | • Casino (FK, enrollment) | • Visits<br>• rating_slips<br>• Loyalty | Identity management |
| **Operational** | `TableContextService` | • Gaming tables<br>• Table settings<br>• Dealer rotations<br>• Fills/drops/chips (chip custody telemetry)<br>• Inventory slips<br>• Break alerts<br>• Key control logs | • Casino (FK)<br>• Staff (FK, dealers) | • Performance metrics<br>• MTL events<br>• Table snapshots | **Table lifecycle & operational telemetry** |
| **Operational** | `FloorLayoutService` | • Floor layout drafts & approvals<br>• Layout versions (immutable snapshots)<br>• Pit definitions & sections<br>• Table slot placements<br>• Layout activation log/events | • Casino (FK)<br>• Staff (FK, admins)<br>• TableContext (event consumers) | • Activation history<br>• Layout review queues | **Design & activate gaming floor layouts** |
| **Session** | `VisitService` | • Visit sessions<br>• Check-in/out<br>• Visit status | • Player (FK)<br>• Casino (FK) | • rating_slips<br>• Financials<br>• MTL entries | Session lifecycle |
| **Telemetry** | `RatingSlipService` | • Average bet<br>• Time played<br>• Game settings<br>• Seat number<br>• `status`/`policy_snapshot` | • Player (FK)<br>• Visit (FK)<br>• Gaming Table (FK) | – | **Gameplay measurement** |
| **Reward** | `LoyaltyService` | • **Points calculation logic**<br>• Loyalty ledger<br>• Tier status<br>• Tier rules<br>• Preferences | • Player (FK)<br>• rating_slip (FK)<br>• Visit (FK) | • Points history<br>• Tier progression | **Reward policy & assignment** |
| **Finance** | `PlayerFinancialService` | • `player_financial_transaction` (OWNS - append-only)<br>• **Financial event types**<br>• Idempotency enforcement<br>• **PROVIDES**: 3 aggregation views | • Player (FK)<br>• Visit (FK - READ-ONLY)<br>• rating_slip (FK - compat)<br>• Casino (FK - temporal) | • Visit consumes summaries (READ)<br>• MTL refs gaming-day aggs | **Financial ledger (SoT)** |
| **Compliance** | `MTLService` | • **Cash transaction log**<br>• `mtl_entry` (immutable)<br>• `mtl_audit_note` (append)<br>• Gaming day calc (trigger)<br>• Threshold detection<br>• Compliance exports | • `casino_settings` (READ-ONLY)<br>• Player (FK, optional)<br>• Casino (FK)<br>• Staff (FK)<br>• rating_slip (FK, optional)<br>• Visit (FK, optional) | • Daily aggregates<br>• Threshold monitoring<br>• CTR/Watchlist detection | **AML/CTR compliance** |
| **Observability** | `PerformanceService` | • `performance_metrics`<br>• `performance_alerts`<br>• `performance_thresholds`<br>• `performance_config`<br>• Alert generation | • No FK dependencies<br>• Metadata correlation<br>• Observes all (read-only) | • MTL transaction volume<br>• System performance<br>• Threshold breaches | **Real-time monitoring** |

---

## Casino Service - Foundational Context

### ✅ CasinoService (Root Authority & Global Policy)

**OWNS:**
- **Casino registry** (master records for licensed gaming establishments)
- **casino_settings** table (EXCLUSIVE WRITE - Single temporal authority)
- `casino` table (canonical casino identity)
- `company` table (corporate ownership hierarchy)
- `game_settings` table (game configuration templates)
- `staff` table (staff registry and access control)
- `player_casino` table (player enrollment associations)
- `audit_log` table (cross-domain event logging)
- `report` table (administrative reports)

**PROVIDES TO (All Downstream Contexts):**
- **TableContext**: Casino ID linkage, game config templates, staff authorization
- **Visit**: Casino jurisdiction, timezone, gaming day boundaries
- **RatingSlip**: Casino settings for gameplay telemetry normalization
- **MTL**: Gaming day start time, compliance thresholds, timezone
- **Loyalty**: Casino-specific tier rules (future)
- **Performance**: Timezone and threshold normalization
- **Audit/Compliance**: Centralized audit logging and regulatory reporting

**BOUNDED CONTEXT**: "What are the operational parameters and policy boundaries of this casino property?"

### Acceptance Checklist (CI)
- [ ] **Tables present:** `company`, `casino`, `casino_settings`, `staff`
- [ ] **PK/FK types:** all `uuid`; `casino_settings.casino_id` is `uuid unique not null`
- [ ] **Temporal config:** `casino_settings.gaming_day_start_time time not null default '06:00'`
- [ ] **Ownership:** `casino_id` on `staff`
- [ ] **Constraints:** `casino_settings` 1:1 via unique `(casino_id)`
- [ ] **RLS:** staff read/write scoped to their `casino_id` (admins write)
- [ ] **Access paths:** `casino_settings` by `casino_id`; `staff` by `casino_id`, `employee_id`

**RLS (excerpt)**
- Tables owned by casino scope (`casino_id` present) MUST include:
  - Read: staff of same `casino_id` (role-gated).
  - Write: admins of same `casino_id`.
- Cross-domain joins must rely on declared FKs (no implicit string keys).

### Service Boundary Notes
- Downstream services consume CasinoService facts via exposed DTOs/RPCs (`getCasinoSettings`, staff roster endpoints) or denormalized projections; they **never** join directly against `casino`, `staff`, or `casino_settings` tables.
- Cross-context writes targeting CasinoService tables must invoke the sanctioned RPC/service factory so audit, idempotency, and RLS constraints remain consistent.

### Transport & Edge Rules
- First-party mutations (staff management, casino settings, audit writes) MUST enter via Server Actions wrapped with `withServerAction()` so auth, `SET LOCAL app.casino_id`, idempotency enforcement, and audit logging remain centralized.
- Route Handlers are restricted to enterprise imports/webhooks and must reuse the same DTOs, schemas, and audit contract defined for the Server Actions.
- DTO payloads are validated with shared zod schemas; specs/tests import the same schema to prevent drift.

### Schema (Core Entities)

```sql
create table company (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  created_at timestamptz not null default now()
);

create table casino (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references company(id) on delete cascade,
  name text not null,
  location text,
  address jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table casino_settings (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null unique references casino(id) on delete cascade,
  gaming_day_start_time time not null default time '06:00',
  timezone text not null default 'America/Los_Angeles',
  watchlist_floor numeric(12,2) not null default 3000,
  ctr_threshold numeric(12,2) not null default 10000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table staff (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid references casino(id) on delete set null,
  employee_id text unique,
  first_name text not null,
  last_name text not null,
  email text unique,
  role staff_role not null default 'dealer',
  status staff_status not null default 'active',
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid references casino(id) on delete set null,
  domain text not null,
  actor_id uuid references staff(id) on delete set null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create table report (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid references casino(id) on delete cascade,
  name text not null,
  payload jsonb not null,
  generated_at timestamptz not null default now()
);
```

### Sample Code

```typescript
// Casino settings (by casino)
const { data, error } = await supabase
  .from('casino_settings')
  .select('*')
  .eq('casino_id', casino_id)
  .single();
```

---

## Player & Visit - Identity & Session Context

### Player & Visit Acceptance Checklist (CI)
- [ ] **Tables present:** `player`, `player_casino`, `visit`
- [ ] **PK/FK types:** all `uuid`; `player_casino` PK `(player_id, casino_id)`
- [ ] **Constraints:** `player_casino.status default 'active'`
- [ ] **RLS:** membership reads within same `casino_id`; writes by enrollment service
- [ ] **Access paths:** membership by `(player_id, casino_id)`; visits by `(player_id, started_at desc)`

**RLS (excerpt)**
- Tables owned by casino scope (`casino_id` present) MUST include:
  - Read: staff of same `casino_id` (role-gated).
  - Write: admins of same `casino_id`.
- Cross-domain joins must rely on declared FKs (no implicit string keys).

### Service Boundary Notes
- Loyalty never reads RatingSlip tables directly; it ingests gameplay facts via `rpc_issue_mid_session_reward` inputs or dedicated DTOs (e.g., telemetry projections). Any cross-context read must come from a published API/projection, not raw joins.
- When Loyalty needs casino/staff metadata it calls the owning service’s RPCs; direct foreign reads are forbidden to keep bounded contexts isolated.

### Transport & Edge Rules
- Mid-session rewards, manual adjustments, and preference updates are invoked via Server Actions that wrap `rpc_issue_mid_session_reward`/companion RPCs with `withServerAction()`; the wrapper enforces auth, sets `app.casino_id`, logs `x-correlation-id`, and requires `x-idempotency-key` for every ledger mutation.
- Route Handlers exist only for third-party loyalty integrations and must reuse the same DTO schema + audit contract defined for Server Actions.
- DTOs/zod schemas live with LoyaltyService and are re-imported by UI/tests to prove parity with the SRM.

### Schema

```sql
create table player (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  birth_date date,
  created_at timestamptz not null default now()
);

create table player_casino (
  player_id uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  status text not null default 'active',
  enrolled_at timestamptz not null default now(),
  primary key (player_id, casino_id)
);

create table visit (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
```

---

## Loyalty Service - Reward Context

### ✅ LoyaltyService (Reward Policy Engine)

**OWNS:**
- **Point calculation logic** (business rules, formula, multipliers)
- `loyalty_ledger` table (source of truth for all points transactions)
- `player_loyalty` table (per-casino balance, tier status)
- Tier progression rules
- Point multipliers and conversion rates
- Reward preferences

**REFERENCES:**
- `casino_id` - Casino-scoped ownership and RLS anchor
- `player_id` - Who earned the points
- `rating_slip_id` - Source of gameplay telemetry
- `visit_id` - Session context
- `staff_id` - Who issued the reward

**BOUNDED CONTEXT**: "What is this gameplay worth in rewards?"

**Canonical stance:** **Loyalty is the sole source of truth for rewards.**
`rating_slip` stores telemetry only (time, average_bet, policy snapshot, state) and never caches reward balances. Mid-session rewards are issued via `rpc_issue_mid_session_reward`, which appends to `loyalty_ledger` and updates `player_loyalty` in one transaction.

### Acceptance Checklist (CI)
- [ ] **Tables present:** `player_loyalty`, `loyalty_ledger`
- [ ] **Ownership:** both tables include `casino_id uuid references casino(id)`; `player_loyalty` primary key `(player_id, casino_id)`
- [ ] **Ledger columns:** `staff_id`, `rating_slip_id`, `reason loyalty_reason`, `idempotency_key`
- [ ] **Indices:** `ux_loyalty_ledger_idem` partial unique on `idempotency_key`; `ix_loyalty_ledger_player_time`; `ix_loyalty_ledger_rating_slip_time`
- [ ] **PK/FK types:** all `uuid`; ledger FKs resolve to `casino`, `player`, `rating_slip`, `staff`
- [ ] **Atomic issuance:** `rpc_issue_mid_session_reward` exists and updates ledger + `player_loyalty` balance in one transaction
- [ ] **RLS:** append-only inserts by authorized roles; reads scoped to same `casino_id`
- [ ] **Outbox:** `loyalty_outbox` table captures downstream side effects; worker documented
- [ ] **Policy evaluation function:** pure, side-effect-free function published for re-evaluation (see below)

**RLS (excerpt)**
- Tables owned by casino scope (`casino_id` present) MUST include:
  - Read: staff of same `casino_id` (role-gated).
  - Write: admins of same `casino_id`.
- Cross-domain joins must rely on declared FKs (no implicit string keys).

### Service Boundary Notes
- RatingSlipService owns telemetry ingest; downstream consumers read via events/DTOs or dedicated projections, not by querying `rating_slip` directly. Loyalty and Finance interact through RPCs (`rpc_issue_mid_session_reward`) or read models.
- WRAPPER code must call RatingSlip service factories/RPCs instead of chaining multiple service writes per request to avoid WRAPPER-level fan-out.

### Transport & Edge Rules
- Mid-session rewards, manual adjustments, and preference updates are invoked via Server Actions that wrap `rpc_issue_mid_session_reward`/related RPCs with `withServerAction()`; the wrapper enforces auth, sets `app.casino_id`, logs `x-correlation-id`, and requires `x-idempotency-key` for every ledger mutation.
- Route Handlers exist only for third-party loyalty integrations/webhooks and must reuse the same DTO schema + audit contract defined for Server Actions.
- DTO/zod schemas live with LoyaltyService and are re-imported by UI/tests to guarantee SRM conformance.

### Schema

```sql
create table player_loyalty (
  player_id uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  balance int not null default 0,
  tier text,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (player_id, casino_id)
);

create type loyalty_reason as enum ('mid_session','session_end','manual_adjustment','promotion','correction');

create table loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  player_id uuid not null references player(id) on delete cascade,
  rating_slip_id uuid references rating_slip(id) on delete set null,
  visit_id uuid references visit(id) on delete set null,
  staff_id uuid references staff(id) on delete set null,
  points_earned int not null,
  reason loyalty_reason not null default 'mid_session',
  idempotency_key text,
  average_bet numeric,
  duration_seconds int,
  game_type game_type,
  created_at timestamptz not null default now()
);
create unique index if not exists ux_loyalty_ledger_idem on loyalty_ledger (idempotency_key) where idempotency_key is not null;
create index if not exists ix_loyalty_ledger_player_time on loyalty_ledger (player_id, created_at desc);
create index if not exists ix_loyalty_ledger_rating_slip_time on loyalty_ledger (rating_slip_id, created_at desc);

create table loyalty_outbox (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  ledger_id uuid not null references loyalty_ledger(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempt_count int not null default 0
);

create index if not exists ix_loyalty_outbox_unprocessed
  on loyalty_outbox (casino_id, created_at desc)
  where processed_at is null;
```

### Mid-Session Reward RPC (Atomic Issuance)

```sql
create or replace function rpc_issue_mid_session_reward(
  p_casino_id uuid,
  p_player_id uuid,
  p_rating_slip_id uuid,
  p_staff_id uuid,
  p_points int,
  p_idempotency_key text default null,
  p_reason loyalty_reason default 'mid_session'
) returns table (ledger_id uuid, balance_after int)
language plpgsql
as $$
declare
  v_ledger_id uuid;
  v_balance_after int;
  v_now timestamptz := now();
begin
  if p_points <= 0 then
    raise exception 'Points must be positive';
  end if;

  perform 1
    from rating_slip
   where id = p_rating_slip_id
     and player_id = p_player_id
     and casino_id = p_casino_id
     and status in ('open','paused');

  if not found then
    raise exception 'Rating slip not eligible for mid-session reward';
  end if;

  if p_idempotency_key is not null then
    if exists (
      select 1
        from loyalty_ledger
       where idempotency_key = p_idempotency_key
         and casino_id = p_casino_id
    ) then
      return query
        select id,
               (
                 select balance
                   from player_loyalty
                  where player_id = p_player_id
                    and casino_id = p_casino_id
               )
          from loyalty_ledger
         where idempotency_key = p_idempotency_key
           and casino_id = p_casino_id;
      return;
    end if;
  end if;

  insert into loyalty_ledger (
    casino_id,
    player_id,
    rating_slip_id,
    staff_id,
    points_earned,
    reason,
    idempotency_key,
    created_at
  )
  values (
    p_casino_id,
    p_player_id,
    p_rating_slip_id,
    p_staff_id,
    p_points,
    coalesce(p_reason, 'mid_session'),
    p_idempotency_key,
    v_now
  )
  returning id into v_ledger_id;

  update player_loyalty
     set balance = balance + p_points,
         updated_at = v_now
   where player_id = p_player_id
     and casino_id = p_casino_id
  returning balance into v_balance_after;

  return query select v_ledger_id, v_balance_after;
end $$;
```

### Sample Code

```typescript
// Loyalty balance (single source of truth)
const { data: loyalty } = await supabase
  .from('player_loyalty')
  .select('balance, tier')
  .eq('player_id', player_id)
  .eq('casino_id', casino_id)
  .single();

// Mid-session reward (server-side; supply a stable idempotency key)
const { data: ledger, error: reward_error } = await supabase
  .rpc('rpc_issue_mid_session_reward', {
    p_casino_id: casino_id,
    p_player_id: player_id,
    p_rating_slip_id: rating_slip_id,
    p_staff_id: staff_id,
    p_points: calculated_points,
    p_idempotency_key: request_id
  });
```

---

## TableContextService

### ✅ TableContextService (Operational Telemetry & Lifecycle)

**OWNS:**
- **Table lifecycle management** (provision, activate, deactivate)
- `gaming_table` table (canonical registry)
- `gaming_table_settings` table (configuration history)
- `dealer_rotation` table (dealer assignments and rotations)
- **Chip custody telemetry** for fills, credits, inventory snapshots, and drop custody events (non-monetary)

**PROVIDES TO:** Visit, RatingSlip, Loyalty, Finance, and Compliance contexts that need authoritative table metadata and casino alignment. Consumes `floor_layout.activated` events from FloorLayoutService to keep live tables aligned with the approved floor design.

**BOUNDED CONTEXT**: "What is the operational state and chip custody posture of this gaming table?"

- [ ] **Tables present:** `game_settings`, `gaming_table`, `gaming_table_settings`, `dealer_rotation`, `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_drop_event`
- [ ] **PK/FK types:** all `uuid`; chip custody tables reference `gaming_table.id`
- [ ] **Ownership:** `casino_id` required on all tables (legacy + chip custody)
- [ ] **Constraints:** `ux_game_settings_casino_type` unique index; bet range checks; `assert_table_context_casino` trigger on `gaming_table_settings` + `dealer_rotation`; custody tables require `request_id not null` for idempotency
- [ ] **RLS:** read for staff of same casino; writes by admins/pit bosses; custody tables extend to cage/count team roles
- [ ] **Access paths:** tables by `casino_id`; rotations by `(table_id, started_at desc)`; custody events by `(casino_id, table_id, created_at desc)`
- [ ] **Layout sync:** TableContext ingestion job listens for `floor_layout.activated` events and reconciles `gaming_table.pit` / activation state accordingly

**RLS (excerpt)**
- Tables owned by casino scope (`casino_id` present) MUST include:
  - Read: staff of same `casino_id` (role-gated).
  - Write: admins of same `casino_id`.
- Cross-domain joins must rely on declared FKs (no implicit string keys).

### Core Schema (Lifecycle & Settings)

```sql
create table game_settings (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  game_type game_type not null,
  min_bet numeric,
  max_bet numeric,
  rotation_interval_minutes int,
  constraint chk_game_bet_range check (
    min_bet is null or max_bet is null or min_bet <= max_bet
  )
);

create unique index if not exists ux_game_settings_casino_type
  on game_settings (casino_id, game_type);

create type table_status as enum ('inactive','active','closed');

create table gaming_table (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  label text not null,
  pit text,
  type game_type not null,
  status table_status not null default 'inactive',
  created_at timestamptz not null default now()
);

create table gaming_table_settings (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  table_id uuid not null references gaming_table(id) on delete cascade,
  active_from timestamptz not null default now(),
  active_to timestamptz,
  min_bet numeric,
  max_bet numeric,
  rotation_interval_minutes int,
  constraint chk_table_bet_range check (
    min_bet is null or max_bet is null or min_bet <= max_bet
  )
);

create table dealer_rotation (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  table_id uuid not null references gaming_table(id) on delete cascade,
  staff_id uuid references staff(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists ix_dealer_rotation_table_time
  on dealer_rotation (table_id, started_at desc);

create or replace function assert_table_context_casino()
returns trigger
language plpgsql
as $$
declare
  v_table_casino uuid;
begin
  select casino_id into v_table_casino
    from gaming_table
   where id = new.table_id;

  if v_table_casino is null then
    raise exception 'Gaming table % not found', new.table_id;
  end if;

  if new.casino_id <> v_table_casino then
    raise exception 'Casino mismatch for table % (expected %, got %)',
      new.table_id, v_table_casino, new.casino_id;
  end if;

  return new;
end $$;

create trigger trg_gaming_table_settings_casino
before insert or update on gaming_table_settings
for each row execute function assert_table_context_casino();

create trigger trg_dealer_rotation_casino
before insert or update on dealer_rotation
for each row execute function assert_table_context_casino();
```

### Chip Custody Extensions (Non-Monetary)

**Responsibility:** Capture operational custody of chips (inventory, fills, credits, drop movement) without storing monetary ledgers. Monetary counting remains with `PlayerFinancialService`.

#### Owns (Data)
- `table_inventory_snapshot` — opening/closing/rundown counts; dual signers; discrepancies
- `table_fill` — chip replenishment to table (idempotent by request id)
- `table_credit` — chips returned from table to cage (idempotent by request id)
- `table_drop_event` — drop box removal/delivery; custody timeline (`gaming_day`, `drop_box_id`, `seq_no`, `delivered_scan_at`)

#### References (Read-Only)
- `casino`, `gaming_table`, `staff`, `report`, `floor_layout_activation`, `floor_layout_version`

#### Does Not Own
- **Finance**: monetary ledgers, drop count sheets, marker workflows
- **Compliance/MTL**: CTR/SAR thresholds and filings
- **Loyalty**: reward ledger/balance
- **Floor design**: layout drafting/versioning/approval (handled by FloorLayoutService; TableContext only consumes activations)

#### Extended Schema
```sql
-- inventory snapshots (open/close/rundown)
create table if not exists table_inventory_snapshot (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  table_id uuid not null references gaming_table(id) on delete cascade,
  snapshot_type text not null check (snapshot_type in ('open','close','rundown')),
  chipset jsonb not null,
  counted_by uuid references staff(id),
  verified_by uuid references staff(id),
  discrepancy_cents int default 0,
  note text,
  created_at timestamptz not null default now()
);

-- fills (chips to table)
create table if not exists table_fill (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  table_id uuid not null references gaming_table(id) on delete cascade,
  request_id text not null,
  chipset jsonb not null,
  amount_cents int not null,
  requested_by uuid references staff(id),
  delivered_by uuid references staff(id),
  received_by uuid references staff(id),
  slip_no text,
  created_at timestamptz not null default now(),
  unique (casino_id, request_id)
);

-- credits (chips to cage)
create table if not exists table_credit (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  table_id uuid not null references gaming_table(id) on delete cascade,
  request_id text not null,
  chipset jsonb not null,
  amount_cents int not null,
  authorized_by uuid references staff(id),
  sent_by uuid references staff(id),
  received_by uuid references staff(id),
  slip_no text,
  created_at timestamptz not null default now(),
  unique (casino_id, request_id)
);

-- drop custody events (no money here)
create table if not exists table_drop_event (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  table_id uuid not null references gaming_table(id) on delete cascade,
  seal_no text,
  drop_box_id text,
  gaming_day date,
  seq_no int,
  removed_by uuid references staff(id),
  witnessed_by uuid references staff(id),
  removed_at timestamptz not null default now(),
  delivered_at timestamptz,
  delivered_scan_at timestamptz,
  note text
);
```

#### RPC (canonical write paths)
```sql
-- inventory snapshots
create or replace function rpc_log_table_inventory_snapshot(
  p_casino_id uuid,
  p_table_id uuid,
  p_snapshot_type text,
  p_chipset jsonb,
  p_counted_by uuid default null,
  p_verified_by uuid default null,
  p_discrepancy_cents int default 0,
  p_note text default null
) returns table_inventory_snapshot language sql security definer as $$
  insert into table_inventory_snapshot (
    casino_id, table_id, snapshot_type, chipset,
    counted_by, verified_by, discrepancy_cents, note
  ) values (
    p_casino_id, p_table_id, p_snapshot_type, p_chipset,
    p_counted_by, p_verified_by, coalesce(p_discrepancy_cents, 0), p_note
  )
  returning *;
$$;

-- idempotent fills
create or replace function rpc_request_table_fill(
  p_casino_id uuid, p_table_id uuid, p_chipset jsonb, p_amount_cents int,
  p_requested_by uuid, p_delivered_by uuid, p_received_by uuid,
  p_slip_no text, p_request_id text
) returns table_fill language sql security definer as $$
  insert into table_fill (casino_id, table_id, chipset, amount_cents,
    requested_by, delivered_by, received_by, slip_no, request_id)
  values (p_casino_id, p_table_id, p_chipset, p_amount_cents,
    p_requested_by, p_delivered_by, p_received_by, p_slip_no, p_request_id)
  on conflict (casino_id, request_id) do update
    set delivered_by = excluded.delivered_by,
        received_by = excluded.received_by,
        amount_cents = excluded.amount_cents
  returning *;
$$;

-- idempotent credits
create or replace function rpc_request_table_credit(
  p_casino_id uuid, p_table_id uuid, p_chipset jsonb, p_amount_cents int,
  p_authorized_by uuid, p_sent_by uuid, p_received_by uuid,
  p_slip_no text, p_request_id text
) returns table_credit language sql security definer as $$
  insert into table_credit (casino_id, table_id, chipset, amount_cents,
    authorized_by, sent_by, received_by, slip_no, request_id)
  values (p_casino_id, p_table_id, p_chipset, p_amount_cents,
    p_authorized_by, p_sent_by, p_received_by, p_slip_no, p_request_id)
  on conflict (casino_id, request_id) do update
    set received_by = excluded.received_by,
        amount_cents = excluded.amount_cents
  returning *;
$$;

-- drop custody event
create or replace function rpc_log_table_drop(
  p_casino_id uuid,
  p_table_id uuid,
  p_drop_box_id text,
  p_seal_no text,
  p_removed_by uuid,
  p_witnessed_by uuid,
  p_removed_at timestamptz default now(),
  p_delivered_at timestamptz default null,
  p_delivered_scan_at timestamptz default null,
  p_gaming_day date default null,
  p_seq_no int default null,
  p_note text default null
) returns table_drop_event language sql security definer as $$
  insert into table_drop_event (casino_id, table_id, drop_box_id, seal_no,
    removed_by, witnessed_by, removed_at, delivered_at, delivered_scan_at,
    gaming_day, seq_no, note)
  values (p_casino_id, p_table_id, p_drop_box_id, p_seal_no,
    p_removed_by, p_witnessed_by, coalesce(p_removed_at, now()), p_delivered_at, p_delivered_scan_at,
    p_gaming_day, p_seq_no, p_note)
  returning *;
$$;
```

#### RLS (sketch)
- **Read:** same-casino for `pit_boss`, `dealer`, `accounting_read`, `cage_read`, `compliance_read` (as appropriate).  
- **Write:** `pit_boss` for inventory/fill/credit/drop; `cage`/`count_team` limited to their custody flows.  
- Enforce `casino_id = current_setting('app.casino_id')::uuid` and role allow-lists.

#### Transport & Edge Rules
- All first-party table custody mutations (fills, credits, drops, alerts) go through Server Actions using `withServerAction()`; the wrapper requires `x-idempotency-key` for each custody request and persists it via `(casino_id, request_id)` partial uniques.
- Route Handlers are limited to hardware/webhook integrations (e.g., drop-box scanners) and must publish the same DTOs and schemas as the Server Action surface.
- DTOs are defined contract-first and validated with shared zod schemas that telemetry tests reuse.

#### Events & Observability
Emit: `table.inventory_open|close|rundown_recorded`, `table.fill_requested|completed`, `table.credit_requested|completed`, `table.drop_removed|delivered`.  
Payload keys: `{casino_id, table_id, staff_id[], slip_no|request_id, amount_cents, chipset, ts}`.
- Events double as cache signals: React Query invalidation (`invalidateByDomainEvent`) maps these event names to `[table-context, ...]` query keys, and realtime channels subscribe to `{casino_id}` or `{casino_id}:{table_id}` only.
- Broadcasts are throttled to custody state transitions (requested/completed, removed/delivered); high-volume counts are aggregated server-side with periodic snapshots (1–5s) or served via poll + ETag dashboards to avoid channel storms.
- Audit rows use the canonical shape `{ts, actor_id, casino_id, domain, action, dto_before, dto_after, correlation_id}`. Correlation IDs come from edge headers and propagate into RPCs via `SET LOCAL application_name`.

#### KPIs
- Time-to-fill; fills/credits per table/shift; drop removed→delivered SLA; % closes with zero discrepancy.

---

## FloorLayoutService - Design & Activation Context

### ✅ FloorLayoutService (Floor Design, Versioning, & Activation)

**Responsibility:** Create, review, version, and activate casino floor layouts (pits, sections, table placements). Produce activation events consumed by `TableContextService`, `PerformanceService`, and Reporting. Layout design lives here; runtime telemetry stays in TableContext.

**Provides To:** TableContext (active layout assignment), Performance (layout metadata for dashboards), Reporting (historical activation lineage), Governance (review/approval workflow).

**BOUNDED CONTEXT**: "What does the gaming floor look like, and which layout is currently active?"

### Acceptance Checklist (CI)
- [ ] **Tables present:** `floor_layout`, `floor_layout_version`, `floor_pit`, `floor_table_slot`, `floor_layout_activation`
- [ ] **States defined:** layout status enum (`draft`,`review`,`approved`,`archived`); version state (`draft`,`pending_activation`,`active`,`retired`)
- [ ] **Ownership:** `casino_id` on every table, enforced by RLS; staff actions recorded
- [ ] **Idempotency:** layout activation RPC keyed by `(casino_id, activation_request_id)`
- [ ] **Events:** `floor_layout.activated` emitted with layout + version metadata
- [ ] **Auditability:** `reviewed_by`, `approved_by`, and activation timestamps captured

### RLS (excerpt)
- Read/Write limited to admins of same `casino_id`; reviewers need `layout_reviewer` role.
- Layout versions immutable once submitted for review.
- Activation only allowed for `approved` layouts; ensures `casino_id` matches TableContext consumers.

### Schema

```sql
create type floor_layout_status as enum ('draft','review','approved','archived');
create type floor_layout_version_status as enum ('draft','pending_activation','active','retired');

create table floor_layout (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  name text not null,
  description text,
  status floor_layout_status not null default 'draft',
  created_by uuid not null references staff(id),
  reviewed_by uuid references staff(id),
  approved_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table floor_layout_version (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references floor_layout(id) on delete cascade,
  version_no int not null,
  status floor_layout_version_status not null default 'draft',
  layout_payload jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid not null references staff(id),
  created_at timestamptz not null default now(),
  unique (layout_id, version_no)
);

create table floor_pit (
  id uuid primary key default gen_random_uuid(),
  layout_version_id uuid not null references floor_layout_version(id) on delete cascade,
  label text not null,
  sequence int not null default 0,
  capacity int,
  geometry jsonb,
  metadata jsonb
);

create table floor_table_slot (
  id uuid primary key default gen_random_uuid(),
  layout_version_id uuid not null references floor_layout_version(id) on delete cascade,
  pit_id uuid references floor_pit(id) on delete cascade,
  slot_label text not null,
  game_type game_type not null,
  preferred_table_id uuid references gaming_table(id) on delete set null,
  coordinates jsonb,
  orientation text,
  metadata jsonb
);

create table floor_layout_activation (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  layout_version_id uuid not null references floor_layout_version(id) on delete cascade,
  activated_by uuid not null references staff(id),
  activated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  activation_request_id text not null,
  unique (casino_id, activation_request_id)
);
```

### RPC / Events (excerpt)

```sql
-- create draft layout + first version
create or replace function rpc_create_floor_layout(
  p_casino_id uuid,
  p_name text,
  p_description text,
  p_created_by uuid
) returns floor_layout language plpgsql security definer as $$
declare v_layout_id uuid;
begin
  insert into floor_layout (casino_id, name, description, created_by)
  values (p_casino_id, p_name, p_description, p_created_by)
  returning id into v_layout_id;

  insert into floor_layout_version (layout_id, version_no, created_by)
  values (v_layout_id, 1, p_created_by);

  return (select * from floor_layout where id = v_layout_id);
end;
$$;

create or replace function rpc_activate_floor_layout(
  p_casino_id uuid,
  p_layout_version_id uuid,
  p_activated_by uuid,
  p_request_id text
) returns floor_layout_activation language sql security definer as $$
  insert into floor_layout_activation (
    casino_id, layout_version_id, activated_by, activation_request_id
  ) values (
    p_casino_id, p_layout_version_id, p_activated_by, p_request_id
  )
  on conflict (casino_id, activation_request_id) do update
    set layout_version_id = excluded.layout_version_id,
        activated_by = excluded.activated_by,
        activated_at = now()
  returning *;
$$;
```

- Event `floor_layout.activated` payload: `{casino_id, layout_id, layout_version_id, activated_at, pits[], table_slots[]}`.
- TableContext listens and updates `gaming_table` state (activate/deactivate tables according to slots).

### Responsibilities & Hand-offs
- **Owns**: layout drafts, review workflow, pit definitions, table placement metadata, activation history.
- **Does Not Own**: real-time dealer assignments (TableContext), monetary data (Finance), staff registry (CasinoService).
- **Integrations**: publishes read models/API for admin UI; pushes activation events to TableContext/Performance; stores review audit trail for Governance.

---

## RatingSlip Service - Telemetry Context (Updated)

### ✅ RatingSlipService (Gameplay Telemetry)

**OWNS:**
- `average_bet` - How much player wagered (INPUT for points)
- `start_time` / `end_time` - Duration of play (INPUT for points)
- `game_settings` - Game configuration (INPUT for points calculation)
- `seat_number` - Where player sat
- `status` - Rating slip lifecycle state
- `policy_snapshot` - Reward policy at time of play

**DOES NOT STORE:**
- Reward balances or points; **Loyalty** remains the sole source of truth.

**BOUNDED CONTEXT**: "What gameplay activity occurred?"

### Acceptance Checklist (CI)
- [ ] **Table contract:** `rating_slip` excludes any points cache column
- [ ] **Columns:** `status text default 'open'`, optional `policy_snapshot jsonb`, immutable `player_id`/`casino_id`
- [ ] **States:** supports at least `open`, `closed`, optional `paused`; transitions enforced
- [ ] **Eligibility guard:** mid-session rewards only when `status` ∈ (`open`,`paused?`)
- [ ] **RLS:** same-casino read; updates restricted to authorized staff roles
- [ ] **Telemetry focus:** updates limited to gameplay metrics (`average_bet`, `start_time`, `end_time`)

**RLS (excerpt)**
- Tables owned by casino scope (`casino_id` present) MUST include:
  - Read: staff of same `casino_id` (role-gated).
  - Write: admins of same `casino_id`.
- Cross-domain joins must rely on declared FKs (no implicit string keys).

### Transport & Edge Rules
- Rating slip lifecycle changes (create/open/close/pause) flow through Server Actions wrapped with `withServerAction()` so staff auth, `SET LOCAL app.casino_id`, and `x-correlation-id` audit logging stay centralized; telemetry-only updates remain idempotent-by-field (no separate key required).
- Route Handlers are reserved for telemetry devices/3rd-party ingest and must reuse the same DTO schema so validation/audit paths match the Server Action flow.
- DTO + zod schemas for slips live with RatingSlipService and are imported by UI/tests to keep the contract aligned with this SRM.

### Schema

```sql
create table rating_slip (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  visit_id uuid references visit(id) on delete set null,
  table_id uuid references gaming_table(id) on delete set null,
  game_settings jsonb,
  average_bet numeric,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  status text not null default 'open',
  policy_snapshot jsonb
);
```

### Lifecycle & States
- `created` → `open` → (`paused`/`resumed` optional) → `closed` → `archived?`
- `player_id`, `casino_id`, and `start_time` immutable post-create; `end_time` required at close.
- `status` drives eligibility: mid-session rewards limited to slips where `status = 'open'` (or `paused` if explicitly permitted by policy).
- `policy_snapshot` captures the casino's reward thresholds at issuance time for audit.

### Mid-Session Reward Contract
- Rating Slip never issues rewards directly; it emits telemetry consumed by `rpc_issue_mid_session_reward`.
- Mid-session issuance requires `casino_id`, `rating_slip_id`, `player_id`, `staff_id`, and (optionally) an `idempotency_key`.
- The RPC enforces casino ownership alignment, slip state (`open`), configured caps, and appends ledger entries in the Loyalty context.
- Any attempt to award while `status = 'closed'` (or outside policy) must raise an error.
- **Policy evaluation vs issuance**: `evaluate_mid_session_reward_policy()` (pure function) accepts telemetry DTOs + policy snapshot and returns eligibility + recommended points. Issuance RPCs call this evaluator but never persist state themselves; they append ledger rows/outbox events and rely on idempotency to avoid duplicates. Re-running evaluation is safe for audits.

### Outbox Contract

- Reward issuance transactions append to `loyalty_outbox` with the same `correlation_id`/`ledger_id`. Workers drain via `FOR UPDATE SKIP LOCKED`, emit downstream notifications (emails, loyalty partner webhooks), set `processed_at`, and increment `attempt_count` on failures.
- Dead-letter queue/alert triggers when `attempt_count` exceeds threshold; replays remain idempotent because ledger rows are immutable and keyed by `idempotency_key`.

### Realtime & Cache Notes
- Server Actions that mutate rating slips emit `ratingSlip.created|updated|closed` events; realtime listeners subscribe to `{casino_id}` for list refresh and `{casino_id}:{rating_slip_id}` for detail reconciliation.
- React Query invalidation targets `['rating-slip','list',casino_id]`, `['rating-slip','detail',rating_slip_id]`, etc., via the shared `invalidateByDomainEvent` helper—no blanket invalidations.
- Optimistic UI paths must reconcile with the emitted event payload to prevent drift against the canonical telemetry snapshot.
- Realtime broadcasts cover **state transitions** (OPEN→PAUSED→CLOSED) plus optional 1–5s snapshots; high-cardinality dashboards fall back to poll + ETag rather than maintaining a feed per slip.
- Channel joins enforce casino + role predicates (e.g., pit boss, host). Non-authorized roles are rejected before subscription.
- Audit rows emitted for rating slip updates must include correlation IDs and DTO before/after snapshots (or hashes) for telemetry comparisons; p95 update latency budget: < 80 ms.

### CQRS-Light Read Model
- **Write model:** `rating_slip` remains append-only/immutable for telemetry-critical fields (average bet, durations, policy snapshot). Writes occur only via service-owned RPCs.
- **Read model:** Projection job (e.g., `rating_slip_projection`) runs every ≤5s to hydrate aggregates used by dashboards. Ownership of the projection lives within RatingSlipService, and other services consume the projection or emitted events—not the write table.
- **Backfill/resync:** Projection job supports idempotent replays keyed by `rating_slip_id` + `casino_id` to heal missed events without impacting ingest throughput.

---

## PlayerFinancial Service - Finance Context

**RLS (excerpt)**
- Tables owned by casino scope (`casino_id` present) MUST include:
  - Read: staff of same `casino_id` (role-gated).
  - Write: admins of same `casino_id`.
- Cross-domain joins must rely on declared FKs (no implicit string keys).

**RLS Expectations**
- Reads scoped by `casino_id` for finance/compliance roles.
- Inserts limited to cashier/compliance services with matching `casino_id`.
- Updates restricted to idempotent correction flows; deletes prohibited.

### Transport & Edge Rules
- Cashier/cage mutations MUST enter through Server Actions composed with `withServerAction()`; the wrapper requires `x-idempotency-key`, persists it via `player_financial_transaction`'s `(casino_id, idempotency_key)` uniqueness, and writes `audit_log` rows using the inbound `x-correlation-id`.
- Route Handlers are restricted to third-party payment gateways or webhook callbacks and must marshal through the same DTO/zod schema before invoking finance services.
- DTOs are contract-first artifacts; QA/integration tests import the same schema to assert SRM conformance.

### Acceptance Checklist (CI)
- [ ] **Table present:** `player_financial_transaction`
- [ ] **Ownership:** `casino_id` required on every row; `gaming_day` derived via trigger
- [ ] **References:** optional `visit_id` (read-only) and `rating_slip_id` (compat) FKs maintained
- [ ] **Idempotency:** nullable `idempotency_key text` column with partial unique `(casino_id, idempotency_key)`
- [ ] **Indices:** `ix_fin_txn_player_time`; `ix_fin_txn_casino_gaming_day`
- [ ] **RLS:** read/write policies enforce same-casino access; deletes disabled
- [ ] **Triggers:** `trg_fin_gaming_day` active with `set_fin_txn_gaming_day()`
- [ ] **RPC write path:** `rpc_create_financial_txn` is the supported insert interface
- [ ] **Outbox:** `finance_outbox` table exists with worker draining contract (see below)

### Schema

```sql
create table player_financial_transaction (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  visit_id uuid references visit(id) on delete set null,
  rating_slip_id uuid references rating_slip(id) on delete set null,
  amount numeric not null,
  tender_type text,
  created_at timestamptz not null default now(),
  gaming_day date,
  idempotency_key text
);

create index if not exists ix_fin_txn_player_time
  on player_financial_transaction (player_id, created_at desc);

create index if not exists ix_fin_txn_casino_gaming_day
  on player_financial_transaction (casino_id, gaming_day);

create unique index if not exists ux_fin_txn_idempotency
  on player_financial_transaction (casino_id, idempotency_key)
  where idempotency_key is not null;

create or replace function compute_gaming_day(ts timestamptz, gstart interval)
returns date language sql immutable as $$
  select (date_trunc('day', ts - gstart) + gstart)::date
$$;

create or replace function set_fin_txn_gaming_day()
returns trigger language plpgsql as $$
declare gstart interval;
begin
  select coalesce(gaming_day_start_time::interval, interval '06:00:00') into gstart
  from casino_settings where casino_id = new.casino_id;
  new.gaming_day := compute_gaming_day(coalesce(new.created_at, now()), gstart);
  return new;
end$$;

create trigger trg_fin_gaming_day
before insert or update on player_financial_transaction
for each row execute function set_fin_txn_gaming_day();

### Outbox Contract

- Finance writes external side effects to `finance_outbox` within the same transaction that inserts ledger rows. Jobs pull batches via `FOR UPDATE SKIP LOCKED`, emit webhooks/emails, set `processed_at`, and increment `attempt_count` on failure (with exponential backoff + dead-letter alerting after N attempts).
- Consumers treat outbox payloads as authoritative; reruns are safe because processed rows remain idempotent.
```

### Write Contract (Gaming Day Patch)
- `gaming_day` is derived inside the database trigger; client callers MUST omit it.
- All finance writes go through the canonical RPC so the trigger can populate `gaming_day` consistently.
-- Trigger ensures `gaming_day` populated from casino boundary; application callers MUST omit it.

```sql
create or replace function rpc_create_financial_txn(
  p_casino_id uuid,
  p_player_id uuid,
  p_amount numeric,
  p_tender_type text default null,
  p_created_at timestamptz default now(),
  p_visit_id uuid default null,
  p_rating_slip_id uuid default null,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into player_financial_transaction (
    player_id,
    casino_id,
    visit_id,
    rating_slip_id,
    amount,
    tender_type,
    created_at,
    idempotency_key
  ) values (
    p_player_id,
    p_casino_id,
    p_visit_id,
    p_rating_slip_id,
    p_amount,
    p_tender_type,
    coalesce(p_created_at, now()),
    p_idempotency_key
  )
  on conflict (casino_id, idempotency_key) where idempotency_key is not null
  do nothing
  returning id into v_id;

  if v_id is null and p_idempotency_key is not null then
    select id
      into v_id
      from player_financial_transaction
     where casino_id = p_casino_id
       and idempotency_key = p_idempotency_key;
  end if;

  return v_id;
end;
$$;

create table finance_outbox (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  ledger_id uuid not null references player_financial_transaction(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempt_count int not null default 0
);

create index if not exists ix_finance_outbox_unprocessed
  on finance_outbox (casino_id, created_at desc)
  where processed_at is null;
```

### Sample Code

```typescript
import { createFinancialTransaction } from '@/lib/finance';

await createFinancialTransaction(supabase, {
  casinoId,
  playerId,
  amount,
  tenderType,
  visitId,
  ratingSlipId,
});
```

---

## MTL Service - Compliance Context

### ✅ MTLService (AML/CTR Compliance Engine)

**OWNS:**
- **Cash transaction logging** (immutable, write-once records)
- `mtl_entry` table (source of truth for all monetary transactions)
- `mtl_audit_note` table (append-only audit trail)
- Gaming day calculation logic (trigger-based, reads from casino_settings)
- Threshold detection rules (watchlist >= $3k, CTR >= $10k)

**REFERENCES:**
- `casino_settings` - **READ-ONLY via database trigger** (temporal authority pattern)

**BOUNDED CONTEXT**: "What cash/monetary transactions occurred for AML/CTR compliance?"

### Acceptance Checklist (CI)
- [ ] **Tables present:** `player_financial_transaction`, `mtl_entry`
- [ ] **Ownership:** `casino_id` required
- [ ] **References:** optional FKs to `staff`, `rating_slip`, and `visit` maintained for lineage
- [ ] **Temporal:** `gaming_day` computed via `casino_settings.gaming_day_start_time`
- [ ] **Idempotency:** `mtl_entry.idempotency_key` unique (nullable, partial index)
- [ ] **RLS:** reads limited to compliance roles per `casino_id`; writes by cashier/compliance services
- [ ] **Access paths:** finance by `(player_id, created_at)` and `(casino_id, gaming_day)`; MTL by `(casino_id, created_at)`

**RLS (excerpt)**
- Tables owned by casino scope (`casino_id` present) MUST include:
  - Read: staff of same `casino_id` (role-gated).
  - Write: admins of same `casino_id`.
- Cross-domain joins must rely on declared FKs (no implicit string keys).

### Schema

```sql
create table mtl_entry (
  id uuid primary key default gen_random_uuid(),
  patron_uuid uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  staff_id uuid references staff(id) on delete set null,
  rating_slip_id uuid references rating_slip(id) on delete set null,
  visit_id uuid references visit(id) on delete set null,
  amount numeric not null,
  direction text not null,
  area text,
  created_at timestamptz not null default now(),
  idempotency_key text
);
create unique index if not exists ux_mtl_entry_idem on mtl_entry (idempotency_key) where idempotency_key is not null;
create index if not exists ix_mtl_casino_time on mtl_entry (casino_id, created_at desc);

create table mtl_audit_note (
  id uuid primary key default gen_random_uuid(),
  mtl_entry_id uuid not null references mtl_entry(id) on delete cascade,
  staff_id uuid references staff(id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);
```

---

## RLS Statement Template

**RLS (excerpt)**
- Tables owned by casino scope (`casino_id`) MUST include:
  - Read: staff of same `casino_id` (role-gated).
  - Write: admins of same `casino_id`.
- Cross-domain joins rely on declared FKs (no implicit string keys).

---

## Canonical Readiness Checklist

**Canonical Readiness Checklist**
- [ ] All identifiers in this doc are lower_snake_case (DDL + code samples).
- [ ] All PKs/FKs are uuid; any text IDs are documented business keys.
- [ ] Ownership (`casino_id`) appears on all casino-scoped tables.
- [ ] Finance includes `gaming_day` with trigger defined.
- [ ] Loyalty vs Rating Slip stance is singular (no cache) and mid-session RPC documented.
- [ ] RLS expectations are stated per domain (read/write ownership).
- [ ] CI catalog sections (enums, indexes, checklists, deprecations) are in sync with schema.

---

**Document Version**: 3.0.2-PATCHED
**Created**: 2025-10-21
**Status**: CANONICAL - All SRM_PATCH_PACK.md patches applied
