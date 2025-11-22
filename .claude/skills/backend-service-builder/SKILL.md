---
name: backend-service-builder
description: Build PT-2 service layer modules following bounded context rules, service patterns, and DTO standards. This skill should be used when implementing new backend services, database migrations, or service refactoring. Validates implementation against governance documents and flags documentation inconsistencies.
allowed-tools: SlashCommand, context7, mcp__sequential-thinking__sequentialthinking, supabase, Read, Write, Edit, Glob, Bash, TodoWrite, BashOutput, KillShell, Task, mcp__tavily-remote__tavily_extract
---

# Backend Service Builder

## Overview

This skill guides implementation of PT-2 backend services following established architecture patterns. It provides:

1. **Pattern-based service creation** (Contract-First, Canonical CRUD, or Hybrid)
2. **Database migration workflow** with RLS policy enforcement
3. **DTO standards compliance** (Pattern A vs Pattern B rules)
4. **Bounded context validation** (SRM ownership enforcement)
5. **Documentation consistency checking** (flags drift between docs and code)

**Use this skill when:**
- Creating a new service module (e.g., "Create a GameSession service")
- Adding database migrations with new tables
- Refactoring existing services to match governance standards
- Validating service implementation before merge

**Do NOT use for:**
- Frontend development (use `frontend-design` skill)
- API endpoint creation (separate concern - future `api-builder` skill)
- Simple code fixes without architectural changes

---

## How to Use This Skill

### Quick Start Examples

**Example 1: Create new service**
```
User: "Create a new achievements service to track player milestones"

Process:
1. Determine pattern (likely Pattern A: Contract-First)
2. Create database migration for player_achievements table
3. Generate service structure with keys.ts, achievement.ts, tests, README
4. Validate against governance docs
5. Flag any inconsistencies found
```

**Example 2: Add migration**
```
User: "Add a migration for session_snapshots table with RLS policies"

Process:
1. Use create_migration.sh script to generate timestamped file
2. Write migration SQL with table, RLS policies, indexes
3. Apply migration and regenerate types
4. Validate RLS coverage
5. Update relevant services
```

**Example 3: Validate existing service**
```
User: "Check if the loyalty service follows current standards"

Process:
1. Run validate_service_structure.py on services/loyalty/
2. Run detect_cross_context_violations.ts
3. Run check_doc_consistency.py
4. Report findings and suggest fixes
```

---

## Memory Recording Protocol 🧠

This skill automatically tracks execution outcomes to build pattern knowledge and improve over time.

### Skill Execution Tracking

Record complete execution outcomes after service creation:

```python
from lib.memori import create_memori_client, SkillContext

# Initialize Memori for this skill
memori = create_memori_client("skill:backend-service-builder")
context = SkillContext(memori)

# Record skill execution outcome
context.record_skill_execution(
    skill_name="backend-service-builder",
    task="Create LoyaltyService",
    outcome="success",  # or "failure", "partial"
    pattern_used="Pattern A (Contract-First)",
    validation_results={
        "structure_valid": True,
        "doc_consistency": True,
        "cross_context_violations": 0,
        "anti_patterns_detected": 0
    },
    files_created=[
        "services/loyalty/keys.ts",
        "services/loyalty/loyalty.ts",
        "services/loyalty/loyalty.test.ts",
        "services/loyalty/README.md"
    ],
    issues_encountered=[
        "Initially violated bounded context (fixed)",
        "README missing SRM reference (added)"
    ],
    duration_seconds=180,
    lessons_learned=[
        "Loyalty domain requires Pattern A due to business logic complexity",
        "SRM reference critical for cross-service coordination"
    ]
)
```

### Query Past Patterns Before Starting

Before implementing a service, check what worked before:

```python
# Search for similar past service creations
past_executions = memori.search_learnings(
    query="create service for loyalty domain",
    namespace="skill:backend-service-builder",
    tags=["service-creation", "loyalty"],
    limit=5
)

if past_executions:
    print(f"\n📚 Learning from {len(past_executions)} past executions:\n")
    for execution in past_executions:
        print(f"  Task: {execution['task']}")
        print(f"  Pattern Used: {execution['pattern_used']}")
        print(f"  Outcome: {execution['outcome']}")
        print(f"  Issues: {execution['issues_encountered']}")
        print()

    # Analyze patterns
    successful = [e for e in past_executions if e['outcome'] == 'success']
    if successful:
        # Recommend most successful pattern
        patterns = [e['pattern_used'] for e in successful]
        recommended = max(set(patterns), key=patterns.count)
        print(f"💡 Recommendation: Use {recommended} (highest success rate)\n")
```

### Validation Script Integration

The validation scripts (`validate_service_structure.py`, `check_doc_consistency.py`) automatically record findings to Memori:

- **Anti-pattern detections** (ReturnType inference, class-based services, etc.)
- **Validation failures** with historical context
- **Fix suggestions** based on past resolutions

When running validation, scripts will:
1. Query past violations for context
2. Run validation checks
3. Record findings to Memori
4. Suggest fixes based on historical resolutions

**Example Output**:
```
⚠️  Historical Context: 12 past validation issues found

Running validation checks...
❌ services/loyalty/loyalty.ts: ReturnType inference detected

💡 Suggested fix for 'ReturnType inference':
   Based on 8 past resolutions:
   - Replace ReturnType<typeof createLoyaltyService> with explicit interface
   - Define LoyaltyService interface with all method signatures
```

### When to Record Manually

Record execution outcomes at these key moments:

- [ ] **After service creation** (pattern used, files created, validation results)
- [ ] **After migration execution** (tables created, RLS policies applied)
- [ ] **After validation failures** (issues found, how resolved)
- [ ] **After user corrections** (learn from feedback)
- [ ] **After discovering patterns** (bounded context insights, DTO decisions)

### Analytics Available

Query skill effectiveness:

```python
# Service pattern success rates
pattern_a_executions = memori.search_learnings(
    query="Pattern A service creation",
    namespace="skill:backend-service-builder",
    tags=["Pattern-A"],
    limit=50
)

success_count = sum(1 for e in pattern_a_executions if e['outcome'] == 'success')
success_rate = (success_count / len(pattern_a_executions)) * 100

print(f"Pattern A success rate: {success_rate}%")
print(f"Total executions: {len(pattern_a_executions)}")

# Common validation violations
violations = memori.search_learnings(
    namespace="skill:backend-service-builder",
    tags=["validation", "error"],
    limit=200
)

# Analyze trends
violation_counts = {}
for v in violations:
    pattern = v.get('pattern_violated', 'Unknown')
    violation_counts[pattern] = violation_counts.get(pattern, 0) + 1

print("\nTop violations:")
for pattern, count in sorted(violation_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
    print(f"  {pattern}: {count} occurrences")
```

**Note**: Validation scripts automatically record findings. Manual recording needed only for execution outcomes and lessons learned.

---

## Service Implementation Workflow

Follow these steps when building a new service. Reference the bundled resources for detailed patterns.

### Step 1: Pattern Selection

**Read**: `references/service-patterns.md` for complete decision tree

**Decision Tree**:
```
Is this complex business logic with domain contracts?
(Loyalty points, Financial transactions, Compliance workflows)
└─> Pattern A: Contract-First
    Files: keys.ts, {feature}.ts, {feature}.test.ts, README.md
    DTOs: Manual interfaces with inline mappers
    Focus: Domain contracts, business logic

Is this simple CRUD over database tables?
(Player identity, Visit sessions, Casino config)
└─> Pattern B: Canonical CRUD
    Files: keys.ts, README.md
    DTOs: Pick/Omit from Database types (documented in README)
    Focus: Minimal structure, type derivation

Mixed complexity?
(State machine + CRUD, some domain logic)
└─> Pattern C: Hybrid
    Files: Mix of Pattern A and B files as appropriate
    DTOs: Both manual and derived as needed
```

**Key Questions**:
- Does this service have complex business rules? → Pattern A
- Is it just CRUD operations on tables? → Pattern B
- Does it have varying complexity across features? → Pattern C

**Record the decision** for Step 6 (README documentation).

---

### Step 2: Database Migration (If Required)

**Read**: `references/migration-workflow.md` for complete workflow

**2a. Create Migration File**

Use the provided script for proper timestamp naming:

```bash
# From project root
.claude/skills/backend-service-builder/scripts/create_migration.sh add_achievements_table

# Output: supabase/migrations/20251121143052_add_achievements_table.sql
```

**Critical**: MUST use YYYYMMDDHHMMSS format (14 digits). No shortcuts.

**2b. Write Migration SQL**

Include ALL of these components:

1. **Table Definition**
```sql
CREATE TABLE IF NOT EXISTS player_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  casino_id uuid NOT NULL REFERENCES casino(id) ON DELETE CASCADE,
  achievement_type text NOT NULL,
  achieved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
```

2. **RLS Policies** (REQUIRED - use references/migration-workflow.md patterns)
```sql
ALTER TABLE player_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "casino_staff_view_achievements"
  ON player_achievements FOR SELECT TO authenticated
  USING (casino_id IN (SELECT casino_id FROM staff WHERE id = auth.uid()));
```

3. **Indexes** (for foreign keys and query performance)
```sql
CREATE INDEX idx_player_achievements_player_id ON player_achievements(player_id);
CREATE INDEX idx_player_achievements_casino_id ON player_achievements(casino_id);
```

**2c. Apply Migration**

```bash
# Apply migration
npx supabase migration up

# CRITICAL: Regenerate types
npm run db:types

# Verify schema alignment
npm test -- schema-verification
```

**2d. Validate RLS Coverage**

```bash
# Run RLS validation
.claude/skills/backend-service-builder/scripts/validate_rls_coverage.ts

# Fix any missing policies before proceeding
```

---

### Step 3: Create Service Directory Structure

**3a. Create Directory**

```bash
mkdir -p services/{domain}
```

**3b. Create keys.ts (REQUIRED for ALL patterns)**

Read `references/service-patterns.md` § React Query Keys Pattern

```typescript
// services/{domain}/keys.ts
import { serializeKeyFilters } from '@/services/shared/key-utils';

export type {Domain}Filters = {
  casinoId?: string;
  // Add relevant filter fields
  cursor?: string;
  limit?: number;
};

const ROOT = ['{domain}'] as const;
const serialize = (filters: {Domain}Filters = {}) =>
  serializeKeyFilters(filters);

export const {domain}Keys = {
  root: ROOT,
  list: Object.assign(
    (filters: {Domain}Filters = {}) =>
      [...ROOT, 'list', serialize(filters)] as const,
    { scope: [...ROOT, 'list'] as const },
  ),
  detail: (id: string) => [...ROOT, 'detail', id] as const,
};
```

**3c. Create Feature File (Pattern A only)**

```typescript
// services/{domain}/{feature}.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

// Inline DTO definition
export interface {Feature}Input {
  // Domain contract fields
}

// Inline mapper
export function build{Feature}RpcInput(input: {Feature}Input) {
  return {
    // Map to RPC parameters
  };
}

// Business logic
export async function {featureAction}(
  supabase: SupabaseClient<Database>,
  input: {Feature}Input
): Promise<ServiceResult<{Feature}DTO>> {
  // Implementation
}
```

**Critical Type Safety Rules** (see references/service-patterns.md § Anti-Patterns):
- ✅ Type `supabase` as `SupabaseClient<Database>` (never `any`)
- ✅ Use explicit return types (never `ReturnType` inference)
- ✅ Export interfaces explicitly (never class-based services)

**3d. Create Tests (Pattern A required, Pattern B optional)**

```typescript
// services/{domain}/{feature}.test.ts
import { describe, it, expect } from 'vitest';
import { {featureAction} } from './{feature}';

describe('{Domain}.{feature}', () => {
  it('should handle happy path', async () => {
    // Test implementation
  });

  it('should validate input', async () => {
    // Test validation
  });
});
```

---

### Step 4: Define DTOs (Pattern-Specific)

**Read**: `references/dto-standards.md` for complete rules

**Pattern A (Contract-First): Manual Interfaces Allowed**

```typescript
// Inline in services/{domain}/{feature}.ts
export interface PlayerLoyaltyDTO {
  player_id: string;
  casino_id: string;
  balance: number;
  tier: string | null;
}

// Mapper function (provides compile-time safety)
export function toPlayerLoyaltyDTO(row: LoyaltyRow): PlayerLoyaltyDTO {
  return {
    player_id: row.player_id,
    casino_id: row.casino_id,
    balance: row.balance,
    tier: row.tier,
  };
}
```

**Why safe**: Mappers enforce boundary. Schema changes break mapper at compile time.

**Pattern B (Canonical CRUD): MUST Use Pick/Omit**

```typescript
// Documented in services/{domain}/README.md
export type PlayerDTO = Pick<
  Database['public']['Tables']['player']['Row'],
  'id' | 'first_name' | 'last_name' | 'created_at'
>;

export type PlayerCreateDTO = Pick<
  Database['public']['Tables']['player']['Insert'],
  'first_name' | 'last_name' | 'birth_date'
>;
```

**Why required**: Auto-syncs with schema changes. Manual interfaces cause drift.

**Common Mistakes**:
- ❌ Using `Row` for create DTOs (use `Insert`)
- ❌ Manual `interface` for Pattern B (use `type` with `Pick`)
- ❌ Not omitting auto-generated fields (`id`, `created_at`)

---

### Step 5: Validate Bounded Context Integrity

**Read**: `references/bounded-contexts.md` for SRM ownership rules

**5a. Check Table Ownership**

Ensure service only accesses tables it owns per SRM:

| Service | Owned Tables |
|---------|--------------|
| casino | casino, casino_settings, company, staff, game_settings, audit_log, report |
| player | player, player_casino |
| loyalty | player_loyalty, loyalty_ledger, loyalty_outbox |
| ... | (see references/bounded-contexts.md for full list) |

**5b. Run Cross-Context Violation Detection**

```bash
.claude/skills/backend-service-builder/scripts/detect_cross_context_violations.ts services/{domain}
```

**Fix violations** by:
1. Removing direct `Database['public']['Tables']['foreign_table']` access
2. Importing published DTOs from owning service instead

**Example Fix**:
```typescript
// ❌ BEFORE (violation)
type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];

// ✅ AFTER (correct)
import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos';
```

---

### Step 6: Create Service README.md

**Read**: `references/service-patterns.md` § Service README.md

**Required Template**:

```markdown
# {ServiceName} - {Bounded Context}

> **Bounded Context**: "One-sentence description of service responsibility"
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §X-Y](../../docs/...)
> **Status**: Implemented / In Progress

## Ownership

**Tables**: `table1`, `table2`, `table3`

**DTOs**:
- `ServiceDTO` - Public interface for X
- `ServiceDetailDTO` - Detailed view for Y

**RPCs**: `rpc_function_name` (if any)

## Pattern

Pattern A: Contract-First

**Rationale**: This service has complex business logic for [specific reason].
Requires domain contracts that are intentionally decoupled from database schema.

## Dependencies

**Consumes**:
- Player service: `PlayerDTO`
- Visit service: `VisitDTO`

**Consumed By**:
- Loyalty service
- Finance service

## References

- [SRM §X-Y](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- [SERVICE_TEMPLATE.md](../../docs/70-governance/SERVICE_TEMPLATE.md)
- [DTO_CANONICAL_STANDARD.md](../../docs/25-api-data/DTO_CANONICAL_STANDARD.md)
```

**Update SRM**: Add service entry to SERVICE_RESPONSIBILITY_MATRIX.md

---

### Step 7: Validate Implementation

**Read**: `references/validation-checklist.md` for complete checklist

**7a. Run Structure Validation**

```bash
.claude/skills/backend-service-builder/scripts/validate_service_structure.py services/{domain}
```

Checks for:
- Required files (keys.ts, README.md)
- No class-based services
- Proper SupabaseClient typing
- Pattern-appropriate structure

**7b. Run ESLint Validation**

```bash
npx eslint services/{domain}/*.ts --max-warnings 0
```

Checks for:
- Manual DTO interfaces in Pattern B services (banned)
- Cross-context Database type access (banned)

**7c. Run Type Check**

```bash
npm run type-check
```

Ensures TypeScript compilation succeeds.

**7d. Run Tests**

```bash
npm test services/{domain}/
```

Pattern A services should have ~80% coverage.

---

### Step 8: Documentation Consistency Validation (INNOVATION!)

**This is the extended hybrid approach the user requested.**

**8a. Run Consistency Checker**

```bash
.claude/skills/backend-service-builder/scripts/check_doc_consistency.py
```

**This script detects**:
1. **SERVICE_TEMPLATE drift**: Implementation doesn't match declared pattern
2. **SRM ownership conflicts**: README claims tables not listed in SRM
3. **Migration naming violations**: Files not following YYYYMMDDHHMMSS format
4. **DTO standard violations**: Pattern B using manual interfaces
5. **README incompleteness**: Missing required sections

**8b. Review Flagged Inconsistencies**

The script categorizes findings:
- **ERRORS**: Must fix before merge
- **WARNINGS**: Should investigate and address
- **INFO**: Minor items for consideration

**Example Output**:
```
ERRORS (2):
  ❌ [SRM_OWNERSHIP] Service claims ownership of 'rating_slip' but SRM doesn't list it
     Location: services/loyalty/README.md
     Reference: SERVICE_RESPONSIBILITY_MATRIX.md

  ❌ [MIGRATION_NAMING] Migration doesn't follow YYYYMMDDHHMMSS_description.sql pattern
     Location: supabase/migrations/20251014_add_table.sql
     Reference: CLAUDE.md § Migration Naming Convention
```

**8c. Resolve Inconsistencies**

For each flagged item, determine:
1. Is the documentation correct? → Update implementation
2. Is the implementation correct? → Update documentation
3. Is there conflicting guidance? → Flag for user review

**Surface for User Review**:
```
FINDING: SERVICE_TEMPLATE.md (v2.0.3) says mappers.ts is REQUIRED for Pattern A,
but actual Pattern A services (loyalty, finance, mtl) have 0% adoption (inline mappers).

RECOMMENDATION:
Option 1: Update implementations to extract mappers (breaking change)
Option 2: Update SERVICE_TEMPLATE.md to reflect "inline mappers" as current standard
Option 3: Document as planned future enhancement (mark PLANNED in template)
```

This surfaces documentation drift proactively instead of silently following outdated patterns.

---

## Pattern Selection Guide

### When to Use Pattern A (Contract-First)

**Use when:**
- Complex business logic (multi-step workflows, state machines)
- Domain contracts that should remain stable despite schema changes
- Cross-context boundaries (service publishes DTOs to consumers)
- Requires mappers to decouple domain from database

**Examples**: Loyalty, Finance, MTL, TableContext

**Characteristics**:
- Manual DTO interfaces (decoupled from schema)
- Inline mapper functions (or extracted mappers.ts)
- Business logic in feature files
- Tests required (~80% coverage)

---

### When to Use Pattern B (Canonical CRUD)

**Use when:**
- Simple CRUD operations on tables
- No complex business rules
- DTOs mirror database schema 1:1
- Logic handled in Server Actions or hooks

**Examples**: Player, Visit, Casino, FloorLayout

**Characteristics**:
- DTOs use Pick/Omit from Database types
- No business logic files (minimal structure)
- Keys.ts + README.md only
- Tests optional

**Critical**: MUST use type derivation (Pick/Omit). Manual interfaces banned for Pattern B.

---

### When to Use Pattern C (Hybrid)

**Use when:**
- Service has mixed complexity
- Some features need domain contracts (Pattern A)
- Other features are simple CRUD (Pattern B)

**Example**: RatingSlip (state machine + CRUD)

**Characteristics**:
- Mix of manual and derived DTOs
- Some features have business logic, others don't
- Flexible file structure

---

## Common Patterns

### Pattern: RPC-Based Business Logic

```typescript
// services/loyalty/mid-session-reward.ts
export interface MidSessionRewardInput {
  casinoId: string;
  playerId: string;
  points: number;
  idempotencyKey: string;
}

export function buildMidSessionRewardRpcInput(
  input: MidSessionRewardInput
): MidSessionRewardRpcInput {
  return {
    p_casino_id: input.casinoId,
    p_player_id: input.playerId,
    p_points: input.points,
    p_idempotency_key: input.idempotencyKey,
  };
}

export async function rewardPlayer(
  supabase: SupabaseClient<Database>,
  input: MidSessionRewardInput
): Promise<ServiceResult<RewardDTO>> {
  const rpcInput = buildMidSessionRewardRpcInput(input);
  const { data, error } = await supabase.rpc('issue_mid_session_reward', rpcInput);

  if (error) {
    return { success: false, error: { code: 'RPC_ERROR', message: error.message } };
  }

  return { success: true, data: mapToRewardDTO(data) };
}
```

---

### Pattern: Cross-Context DTO Consumption

```typescript
// Step 1: Owning service publishes DTO
// services/rating-slip/dtos.ts
export interface RatingSlipTelemetryDTO {
  id: string;
  player_id: string;
  average_bet: number | null;
  duration_seconds: number;
}

// Step 2: Consuming service imports DTO
// services/loyalty/mid-session-reward.ts
import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos';

function calculateReward(telemetry: RatingSlipTelemetryDTO): number {
  return telemetry.average_bet * telemetry.duration_seconds * 0.01;
}
```

---

### Pattern: React Query Key Hierarchies

```typescript
// services/loyalty/keys.ts
export const loyaltyKeys = {
  root: ['loyalty'] as const,

  // Detail key
  playerBalance: (playerId: string, casinoId: string) =>
    [...ROOT, 'balance', playerId, casinoId] as const,

  // List key with scope for invalidation
  ledger: Object.assign(
    (filters: LoyaltyLedgerFilters = {}) =>
      [...ROOT, 'ledger', serialize(filters)] as const,
    { scope: [...ROOT, 'ledger'] as const },  // Invalidate all ledger queries
  ),
};

// Usage: Invalidate all ledger queries
queryClient.invalidateQueries({ queryKey: loyaltyKeys.ledger.scope });
```

---

## Troubleshooting

### Issue: ESLint Error - Manual DTO Interface

**Error**:
```
services/player/crud.ts:15:8 error
ANTI-PATTERN: Manual DTO interface 'PlayerCreateDTO' violates SRM canonical standard
```

**Cause**: Pattern B service using manual `interface` instead of `Pick/Omit`

**Fix**:
```typescript
// ❌ Before
export interface PlayerCreateDTO {
  first_name: string;
  last_name: string;
}

// ✅ After
export type PlayerCreateDTO = Pick<
  Database['public']['Tables']['player']['Insert'],
  'first_name' | 'last_name' | 'birth_date'
>;
```

---

### Issue: Cross-Context Violation

**Error**:
```
❌ [BOUNDED CONTEXT VIOLATION]
Service "loyalty" cannot directly access table "rating_slip"
Must consume via published DTO from owning service
```

**Fix**:
1. Remove direct Database type access
2. Import published DTO from rating-slip service
3. Update service dependencies in README

---

### Issue: Migration Not Applied

**Symptom**: Types not updated after migration

**Fix**:
```bash
# 1. Verify migration applied
npx supabase migration up

# 2. Regenerate types
npm run db:types

# 3. Verify types updated
git status types/database.types.ts  # Should show modifications
```

---

### Issue: RLS Policies Missing

**Error**:
```
❌ Table "player_achievements": No RLS policies defined
```

**Fix**:
Add policies to migration file:
```sql
ALTER TABLE player_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "casino_staff_view_achievements"
  ON player_achievements FOR SELECT TO authenticated
  USING (casino_id IN (SELECT casino_id FROM staff WHERE id = auth.uid()));
```

Run validation again:
```bash
.claude/skills/backend-service-builder/scripts/validate_rls_coverage.ts
```

---

## Resources

This skill includes comprehensive resources for PT-2 service implementation:

### scripts/

**Validation Scripts** (run during implementation):

- **`validate_service_structure.py`** - Checks service follows architecture patterns
  - Required files exist (keys.ts, README.md)
  - No anti-patterns (class services, ReturnType inference)
  - Proper SupabaseClient typing

- **`detect_cross_context_violations.ts`** - Validates bounded context integrity
  - Services only access owned tables per SRM
  - Flags cross-context Database type access

- **`validate_rls_coverage.ts`** - Ensures RLS policies for all tables
  - Every table has RLS enabled
  - At least one policy defined per table
  - Policies follow naming conventions

- **`check_doc_consistency.py`** - Flags documentation drift (**INNOVATION!**)
  - Detects SERVICE_TEMPLATE vs implementation mismatches
  - Validates SRM ownership claims
  - Checks migration naming compliance
  - Surfaces conflicting guidance for user review

**Utility Scripts**:

- **`create_migration.sh`** - Generate migration with proper timestamp
  - Usage: `./create_migration.sh add_achievements_table`
  - Ensures YYYYMMDDHHMMSS naming compliance

---

### references/

**Architecture Patterns** (read as needed during implementation):

- **`service-patterns.md`** - Complete service implementation patterns
  - Pattern A/B/C decision tree
  - Current implementation examples
  - React Query keys pattern
  - Anti-patterns to avoid

- **`dto-standards.md`** - DTO derivation and bounded context rules
  - Pattern A vs Pattern B DTO rules
  - Canonical derivation patterns (Pick/Omit)
  - Cross-context consumption patterns
  - Column exposure policy

- **`bounded-contexts.md`** - SRM ownership and cross-service consumption
  - Table ownership matrix
  - DTO publishing patterns
  - Cross-context violation examples
  - Service dependency documentation

- **`migration-workflow.md`** - Database migration best practices
  - Migration naming convention (CRITICAL)
  - RLS policy patterns
  - Type regeneration workflow
  - Rollback strategy

- **`validation-checklist.md`** - Comprehensive pre-merge checklist
  - Directory structure validation
  - Type safety checks
  - Bounded context integrity
  - Documentation requirements
  - Testing standards

---

## Final Checklist

Before marking service implementation complete:

- [ ] Pattern selected and justified in README.md
- [ ] Migration created with YYYYMMDDHHMMSS timestamp (if needed)
- [ ] RLS policies defined for all new tables
- [ ] Types regenerated (`npm run db:types`)
- [ ] keys.ts created with React Query key factories
- [ ] DTOs follow pattern-appropriate standards (A vs B)
- [ ] No cross-context table access (validated)
- [ ] README.md complete with all required sections
- [ ] Service added to SRM
- [ ] All validation scripts pass
- [ ] Tests written and passing (Pattern A required)
- [ ] Documentation consistency check run
- [ ] Flagged inconsistencies reviewed and resolved

---

## Notes

**Progressive Workflow**: Use this skill iteratively. Not all steps apply to every task:
- Creating new service → Full workflow
- Adding migration only → Steps 2, 8
- Refactoring existing service → Steps 4, 5, 7, 8

**Documentation First**: This skill emphasizes documentation consistency. When in doubt, surface conflicts to the user rather than silently following potentially outdated patterns. Should the documentaion be found incongruent, surface the issue to the user immediately for the review

**Validation Focus**: Run validation scripts frequently during implementation, not just at the end. Catch issues early.
