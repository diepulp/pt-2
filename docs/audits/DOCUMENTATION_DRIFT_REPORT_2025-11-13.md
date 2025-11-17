# Documentation Drift Analysis Report

**Date**: 2025-11-13
**Analyst**: Claude Code (pt2-complex-service-builder audit)
**Scope**: Cross-document consistency analysis
**Status**: 🔴 CRITICAL DRIFT DETECTED

---

## Executive Summary

Critical inconsistencies detected between three canonical architecture documents:

1. **SERVICE_RESPONSIBILITY_MATRIX.md** (SRM) v3.0.2 - 2025-10-21 - CANONICAL
2. **docs/70-governance/SERVICE_TEMPLATE.md** (ST) v1.2 - No date
3. **docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md** (SLAD) v1.0 - 2025-10-25 - CANONICAL

**Impact**: Developers following SERVICE_TEMPLATE.md will create services incompatible with SRM v3.0.2 contracts.

**Root Cause**: SERVICE_TEMPLATE.md predates SRM v3.0.2 DTO contract policy changes and has not been updated.

---

## Critical Drifts (Breaking Changes)

### CRITICAL-001: DTO File Naming Convention

| Document | File Name | Line Reference | Status |
|----------|-----------|----------------|--------|
| **SRM v3.0.2** | `dtos.ts` (plural) | Line 50 | ✅ CANONICAL |
| **SLAD v1.0** | Mixed: `dtos.ts` (L76) but `dto.ts` in examples (L294) | Lines 76, 294 | ⚠️ INCONSISTENT |
| **ST v1.2** | `dto.ts` (singular) | Lines 52, 62, 74 | ❌ NON-COMPLIANT |

**Evidence**:

```typescript
// SRM v3.0.2 Line 50 (CANONICAL)
**File Location**: `services/{service}/dtos.ts` (REQUIRED for all services)

// SERVICE_TEMPLATE.md v1.2 Line 52 (WRONG)
├── dto.ts      # ⬅️ DTO schemas (Zod) + inferred types
```

**Impact**:
- Services created with ST will fail SRM compliance checks
- ESLint rules expect `dtos.ts`
- Cross-team confusion on correct file name

**Severity**: 🔴 CRITICAL - Breaking change

---

### CRITICAL-002: DTO Derivation Strategy Conflict

| Document | Strategy | Validation | Line Reference |
|----------|----------|------------|----------------|
| **SRM v3.0.2** | Three patterns: Contract-First, Canonical (Pick/Omit), Hybrid | Zod mentioned for validation but NOT mandatory for DTOs | Lines 96-200 |
| **SLAD v1.0** | Canonical (Pick/Omit) with explicit anti-pattern rules | No Zod requirement | Lines 360-390 |
| **ST v1.2** | Zod-first for ALL DTOs | Mandatory Zod schemas | Lines 68-98 |

**Evidence**:

```typescript
// SRM v3.0.2 Lines 96-134 (CANONICAL - Contract-First Pattern)
export interface PlayerLoyaltyDTO {
  player_id: string;
  casino_id: string;
  balance: number;
  tier: string | null;
}
// NO Zod schema required

// SRM v3.0.2 Lines 143-169 (CANONICAL - Canonical Pattern)
export type PlayerDTO = Pick<
  Database['public']['Tables']['player']['Row'],
  'id' | 'first_name' | 'last_name' | 'created_at'
>;
// NO Zod schema required

// SERVICE_TEMPLATE.md Lines 69-82 (WRONG - Mandates Zod)
// Define **Zod** schemas in `dto.ts`. Export both schemas and inferred types.
export const CreatePlayerSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
});
export type CreatePlayerDTO = z.infer<typeof CreatePlayerSchema>;
// ❌ CONTRADICTS SRM's Canonical DTO pattern

// SLAD Lines 387-390 (Aligned with SRM)
- ❌ NEVER use `interface` for DTOs
- ✅ ALWAYS derive from `Database` types
```

**Impact**:
- Complex services (Loyalty, Finance, MTL) require Contract-First DTOs per SRM
- Simple services (Player, Visit) should use Canonical Pick/Omit per SRM
- ST's Zod-first approach conflicts with both patterns
- Zod validation should be at edge (route handlers), not in DTO definitions

**Severity**: 🔴 CRITICAL - Architectural pattern violation

---

### CRITICAL-003: Missing Mapper Pattern (Complex Services)

| Document | Mapper Support | File Structure | Line Reference |
|----------|----------------|----------------|----------------|
| **SRM v3.0.2** | ✅ Defines `mappers.ts` for Contract-First DTOs | Lines 120-134 | ✅ REQUIRED |
| **SLAD v1.0** | ❌ Not mentioned | Lines 292-319 | ❌ MISSING |
| **ST v1.2** | ❌ Not mentioned | Lines 43-59 | ❌ MISSING |

**Evidence**:

```typescript
// SRM v3.0.2 Lines 120-134 (CANONICAL - Required for Complex Services)
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

// SERVICE_TEMPLATE.md Lines 43-59 - File structure
services/{domain}/
    ├── dto.ts
    ├── selects.ts
    ├── index.ts
    ├── crud.ts
    ├── business.ts     # (if needed)
    ├── queries.ts      # (if needed)
// ❌ NO mappers.ts file
```

**Impact**:
- Complex services cannot implement Contract-First DTO pattern without mappers
- Internal fields leak to public APIs
- No separation between database schema and domain contracts

**Severity**: 🔴 CRITICAL - Missing required pattern for Loyalty, Finance, MTL services

---

### CRITICAL-004: Cross-Context Access Rules Vagueness

| Document | Specificity | ESLint Enforcement | Line Reference |
|----------|-------------|-------------------|----------------|
| **SRM v3.0.2** | ✅ Explicit consumption matrix with 9 allowed patterns | ✅ `no-cross-context-db-imports` rule | Lines 54-92 |
| **SLAD v1.0** | ⚠️ Descriptive but no consumption matrix | ⚠️ Mentions anti-patterns | Lines 949-997 |
| **ST v1.2** | ❌ Vague: "published view/service" | ❌ No enforcement mentioned | Lines 10, 32 |

**Evidence**:

```typescript
// SRM v3.0.2 Lines 60-72 (CANONICAL - Explicit Matrix)
| Consumer Service | Can Import DTOs From | Use Case | SRM Reference |
|------------------|---------------------|----------|---------------|
| **Loyalty** | RatingSlip (`RatingSlipTelemetryDTO`) | Calculate mid-session rewards | SRM:358-373 |
| **Loyalty** | Visit (`VisitDTO`) | Session context for ledger entries | SRM:358 |
| **Finance** | Visit (`VisitDTO`) | Associate transactions with sessions | SRM:1122 |
// ... 9 total allowed patterns

// SRM Lines 85-92 (CANONICAL - Explicit Violation Example)
// services/loyalty/telemetry.ts
import type { Database } from '@/types/database.types';
type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];
// ❌ ESLint error: BOUNDED CONTEXT VIOLATION

// SERVICE_TEMPLATE.md Line 10 (VAGUE)
- **Bounded Contexts:** Each folder under `services/` = one bounded context.
  No cross-context imports except public DTOs/APIs or published **views**.
// ❌ Doesn't specify WHICH DTOs, WHICH services, or HOW to import
```

**Impact**:
- Developers don't know which cross-context imports are allowed
- "Published views" concept not defined in SRM
- ESLint rule exists but not documented in ST
- Risk of bounded context violations

**Severity**: 🔴 CRITICAL - Enforcement mechanism missing from ST

---

## High-Priority Drifts

### HIGH-001: File Structure Additions (React Query Integration)

| Document | Files Documented | Frontend Integration | Line Reference |
|----------|------------------|---------------------|----------------|
| **SRM v3.0.2** | Focused on `dtos.ts` only | ❌ Not covered | Line 50 |
| **SLAD v1.0** | ✅ `keys.ts`, `http.ts` + complete React Query patterns | ✅ Extensive (Lines 677-851) | Lines 292-319, 677-851 |
| **ST v1.2** | ❌ Basic backend files only | ❌ Not covered | Lines 43-59 |

**Evidence**:

```typescript
// SLAD Lines 292-319 (Full-Stack Architecture)
services/{domain}/
├── dto.ts              # ✅ Zod schemas + inferred types
├── selects.ts
├── keys.ts             # ✅ React Query key factories (with .scope)
├── http.ts             # ✅ HTTP fetchers (thin wrappers to API routes)
├── index.ts
├── crud.ts
├── business.ts
└── queries.ts

// SERVICE_TEMPLATE.md Lines 43-59 (Backend-Only)
services/{domain}/
    ├── dto.ts
    ├── selects.ts
    ├── index.ts
    ├── crud.ts
    ├── business.ts     # (if needed)
    ├── queries.ts      # (if needed)
// ❌ Missing keys.ts and http.ts
```

**Impact**:
- Frontend developers lack guidance on React Query integration
- Unclear if `keys.ts` and `http.ts` are part of service layer standard
- ST appears backend-focused while SLAD is full-stack

**Severity**: 🟡 HIGH - Scope ambiguity

**Recommendation**: Either:
1. Update ST to include frontend integration, OR
2. Create separate FRONTEND_SERVICE_INTEGRATION.md and reference from ST

---

### HIGH-002: ServiceHttpResult Envelope Not in SERVICE_TEMPLATE

| Document | ServiceResult | ServiceHttpResult | Line Reference |
|----------|---------------|-------------------|----------------|
| **SRM v3.0.2** | ❌ Not defined (policy level) | ❌ Not defined | N/A |
| **SLAD v1.0** | ✅ Defined | ✅ Defined for HTTP boundary | Lines 444-466 |
| **ST v1.2** | ✅ Defined | ❌ Not mentioned | Lines 211-220 |

**Evidence**:

```typescript
// SLAD Lines 444-466 (Complete Contract)
// ServiceResult<T> (Internal - Service Layer)
interface ServiceResult<T> {
  data: T | null;
  error: ServiceError | null;
  success: boolean;
  timestamp: string;
  requestId: string;
}

// ServiceHttpResult<T> (External - HTTP Response)
interface ServiceHttpResult<T> {
  ok: boolean;        // Different from 'success'!
  code: string;
  status: number;     // HTTP status added
  requestId: string;
  durationMs: number; // Added field
  timestamp: string;
  data?: T;           // Optional
  error?: string;
  details?: unknown;
}

// SERVICE_TEMPLATE.md Lines 211-220 (Incomplete)
export interface ServiceResult<T> {
  data: T | null;
  error: ServiceError | null;
  success: boolean;
  timestamp: string;
  requestId: string;
}
// ❌ No ServiceHttpResult defined
```

**Impact**:
- ST doesn't document HTTP boundary envelope transformation
- Unclear how ServiceResult maps to HTTP responses
- Missing guidance on `toServiceHttpResponse()` helper

**Severity**: 🟡 HIGH - Contract boundary missing

---

### HIGH-003: Idempotency Implementation Detail Gap

| Document | Idempotency Coverage | Implementation Detail | Line Reference |
|----------|---------------------|----------------------|----------------|
| **SRM v3.0.2** | ✅ Policy: `x-idempotency-key` required | ❌ Not covered | Line 16 |
| **SLAD v1.0** | ✅ Comprehensive: route, schema, service levels | ✅ Full implementation | Lines 1114-1186 |
| **ST v1.2** | ⚠️ Basic: constraint handling only | ⚠️ Inline in CRUD | Lines 155-164 |

**Evidence**:

```typescript
// SLAD Lines 1118-1136 (Comprehensive - Route Level)
export async function POST(request: NextRequest) {
  const idempotencyKey = requireIdempotencyKey(request);  // ✅ Enforced
  const result = await withServerAction(
    async () => service.appendLedger(input, { idempotencyKey }),
    { supabase, action: 'loyalty.append', idempotencyKey }
  );
}

// SLAD Lines 1138-1152 (Comprehensive - DB Schema)
CREATE UNIQUE INDEX ux_loyalty_ledger_idem
  ON loyalty_ledger (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

// SERVICE_TEMPLATE.md Lines 155-164 (Basic)
if ((error as any).code === "23505") {
  // Optional idempotency: look up existing by natural key & return it
  throw { code: PlayerError.DUPLICATE, message: "Player already exists" };
}
// ❌ No guidance on idempotency_key column, unique index, or route enforcement
```

**Impact**:
- Developers don't know how to implement full idempotency
- Missing database schema patterns
- Missing route-level enforcement

**Severity**: 🟡 HIGH - Implementation gap

---

## Medium-Priority Drifts

### MEDIUM-001: Version Management Inconsistency

| Document | Version | Date | Status Designation |
|----------|---------|------|-------------------|
| **SRM** | v3.0.2 | 2025-10-21 | CANONICAL |
| **SLAD** | v1.0 | 2025-10-25 | CANONICAL |
| **ST** | v1.2 | ❌ Not specified | ❌ Not specified |

**Impact**:
- Unclear which document is most current
- ST lacks status designation (canonical vs informative)
- Version numbers don't indicate recency (SRM v3.0.2 vs SLAD v1.0)

**Severity**: 🟠 MEDIUM - Governance issue

**Recommendation**: Adopt semantic versioning with dates:
- SRM: v3.0.2 (2025-10-21) - CANONICAL (Contract Policy)
- SLAD: v2.0.0 (2025-10-25) - CANONICAL (Full Architecture)
- ST: v2.0.0 (TBD) - IMPLEMENTATION GUIDE (references SRM v3.0.2)

---

### MEDIUM-002: Anti-Pattern Duplication

| Document | Anti-Pattern Coverage | Duplication |
|----------|----------------------|-------------|
| **SRM v3.0.2** | ❌ Not covered (policy level) | N/A |
| **SLAD v1.0** | ✅ Lines 854-894 | Duplicates ST |
| **ST v1.2** | ✅ Lines 17-40 | Original source |

**Impact**:
- Anti-patterns defined in two places
- Risk of divergence when one is updated
- Unclear which is canonical

**Severity**: 🟠 MEDIUM - Maintenance burden

**Recommendation**:
- Keep anti-patterns in ST (implementation guide)
- SLAD references ST anti-patterns
- Or consolidate in ANTI_PATTERN_CATALOG.md (which exists per ST line 440)

---

## Low-Priority Drifts

### LOW-001: Testing Pattern Verbosity Difference

**ST**: Concise testing policy (Lines 326-406)
**SLAD**: Extensive testing examples (Lines 1000-1073)

**Severity**: 🟢 LOW - Complementary, not conflicting

---

## Synchronization Priority Matrix

| Drift ID | Severity | Impact | Effort | Priority |
|----------|----------|--------|--------|----------|
| CRITICAL-001 | 🔴 | Breaking | Low | P0 - Immediate |
| CRITICAL-002 | 🔴 | Architectural | Medium | P0 - Immediate |
| CRITICAL-003 | 🔴 | Pattern Missing | Medium | P0 - Immediate |
| CRITICAL-004 | 🔴 | Enforcement | Low | P0 - Immediate |
| HIGH-001 | 🟡 | Scope Ambiguity | High | P1 - This Sprint |
| HIGH-002 | 🟡 | Contract | Medium | P1 - This Sprint |
| HIGH-003 | 🟡 | Implementation | Medium | P1 - This Sprint |
| MEDIUM-001 | 🟠 | Governance | Low | P2 - Next Sprint |
| MEDIUM-002 | 🟠 | Maintenance | Low | P2 - Next Sprint |
| LOW-001 | 🟢 | None | Low | P3 - Backlog |

---

## Recommended Synchronization Strategy

### Phase 1: Critical Fixes (P0 - Immediate)

**Goal**: Align SERVICE_TEMPLATE.md with SRM v3.0.2 canonical contracts

**Changes to SERVICE_TEMPLATE.md**:

1. **CRITICAL-001**: Rename `dto.ts` → `dtos.ts` throughout
   - Lines 52, 62, 74, and all examples
   - Update directory structure

2. **CRITICAL-002**: Replace Zod-first strategy with SRM's three-pattern approach
   - Lines 68-98: Rewrite DTO section
   - Add Contract-First pattern (complex services)
   - Add Canonical pattern (simple services)
   - Add Hybrid pattern (RatingSlip)
   - Keep Zod for edge validation, not DTO definition

3. **CRITICAL-003**: Add `mappers.ts` to file structure and examples
   - Lines 43-59: Add `mappers.ts` to directory structure
   - Add new section: "Mapper Functions (Complex Services)"
   - Include SRM example from lines 120-134

4. **CRITICAL-004**: Add explicit cross-context consumption matrix
   - Add new section: "Cross-Context DTO Access Rules"
   - Include SRM consumption matrix (lines 60-72)
   - Document ESLint rule `no-cross-context-db-imports`
   - Provide CORRECT and FORBIDDEN examples from SRM

**Version Update**: SERVICE_TEMPLATE.md v1.2 → v2.0.0

**Metadata Addition**:
```markdown
# PT-2 Service Standard (v2.0.0)

**Version**: 2.0.0
**Date**: 2025-11-13
**Status**: IMPLEMENTATION GUIDE (Aligned with SRM v3.0.2)
**References**:
- SRM v3.0.2 (2025-10-21) - CANONICAL contract policy
- DTO_CANONICAL_STANDARD.md - Type system integrity
```

---

### Phase 2: High-Priority Enhancements (P1 - This Sprint)

**Goal**: Complete implementation guidance for full-stack services

**Option A: Expand SERVICE_TEMPLATE.md (Full-Stack Approach)**

Add sections:
- Frontend Integration (keys.ts, http.ts)
- React Query Patterns (reference SLAD)
- ServiceHttpResult envelope transformation
- Complete idempotency implementation (route, schema, service)

**Option B: Keep ST Backend-Focused (Separation of Concerns)**

Create new document:
- `docs/70-governance/FRONTEND_SERVICE_INTEGRATION.md`
- Extract SLAD lines 677-851 (React Query patterns)
- Extract keys.ts and http.ts guidance
- Reference from ST: "For frontend integration, see FRONTEND_SERVICE_INTEGRATION.md"

**Recommendation**: Option B maintains clear separation

**Changes to SERVICE_TEMPLATE.md** (Option B):

1. **HIGH-002**: Add ServiceHttpResult to shared types section
   - Lines 211-220: Expand to include both envelopes
   - Add reference to edge transformation: `toServiceHttpResponse()`

2. **HIGH-003**: Expand idempotency section
   - Lines 439-442: Replace with comprehensive guidance
   - Add database schema pattern (unique index)
   - Add route-level enforcement (`requireIdempotencyKey`)
   - Add service-level check pattern

**New Document**: `docs/70-governance/FRONTEND_SERVICE_INTEGRATION.md`
- Full React Query patterns from SLAD
- keys.ts factory patterns
- http.ts fetcher patterns
- Cache management strategies

---

### Phase 3: Governance & Maintenance (P2 - Next Sprint)

**Goal**: Establish clear documentation hierarchy and version control

1. **MEDIUM-001**: Version Management
   - Add version, date, status to all three docs
   - Establish versioning convention
   - Create CHANGELOG.md for each doc

2. **MEDIUM-002**: Anti-Pattern Consolidation
   - Keep anti-patterns in SERVICE_TEMPLATE.md (single source)
   - SLAD references ST anti-patterns
   - Or consolidate in existing ANTI_PATTERN_CATALOG.md

3. **Documentation Hierarchy**:
   ```
   SRM v3.0.2 (CANONICAL - Contract Policy)
   ├── Defines: Table ownership, DTO contracts, bounded contexts
   └── Authority: Highest - all other docs must align

   SERVICE_TEMPLATE.md v2.0.0 (IMPLEMENTATION GUIDE - Backend)
   ├── Implements: SRM contracts in service layer
   ├── References: SRM v3.0.2, DTO_CANONICAL_STANDARD.md
   └── Scope: Backend service layer only

   FRONTEND_SERVICE_INTEGRATION.md v1.0.0 (IMPLEMENTATION GUIDE - Frontend)
   ├── Implements: React Query patterns, HTTP fetchers
   ├── References: SERVICE_TEMPLATE.md v2.0.0
   └── Scope: Frontend integration only

   SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md v2.0.0 (CANONICAL - Full Architecture)
   ├── Visualizes: Complete architecture (backend + frontend)
   ├── References: SRM v3.0.2, SERVICE_TEMPLATE.md v2.0.0
   └── Authority: Architecture patterns
   ```

---

## Validation Plan

### Pre-Sync Validation

1. **Run existing services against SRM v3.0.2**:
   ```bash
   # Check DTO file names
   find services -name "dto.ts" # Should return empty
   find services -name "dtos.ts" # Should list all services

   # Check for cross-context violations
   npx tsx .claude/skills/pt2-dto-validator/scripts/detect-cross-context-violations.ts
   ```

2. **Identify services requiring migration**:
   - Services using `dto.ts` (singular) → rename to `dtos.ts`
   - Services using Zod-first DTOs → migrate to appropriate pattern
   - Complex services missing `mappers.ts` → add mapper functions

### Post-Sync Validation

1. **Update validation scripts to enforce new patterns**:
   - `validate_service_structure.py`: Check for `dtos.ts` (not `dto.ts`)
   - Add check for `mappers.ts` in complex services (Loyalty, Finance, MTL)
   - Validate DTO derivation matches service type (Contract-First vs Canonical)

2. **Run against all services**:
   ```bash
   for service in services/*/; do
     python3 .claude/skills/pt2-complex-service-builder/scripts/validate_service_structure.py "$service"
   done
   ```

3. **Update ESLint rules**:
   - Enforce `no-cross-context-db-imports` with SRM consumption matrix
   - Add `dto-file-naming` rule (plural required)
   - Add `dto-derivation-pattern` rule (appropriate pattern per service type)

---

## Risk Assessment

### High Risk

- **Breaking Changes**: Renaming `dto.ts` → `dtos.ts` requires code changes
- **Pattern Migration**: Existing services may use Zod-first incorrectly
- **Cross-Context Violations**: Existing services may violate SRM matrix

### Mitigation

1. **Phased Rollout**:
   - Week 1: Update docs, notify team
   - Week 2: Add new pattern support (backward compatible)
   - Week 3: Migrate existing services
   - Week 4: Deprecate old patterns

2. **Migration Script**:
   ```bash
   # Auto-rename dto.ts → dtos.ts
   find services -name "dto.ts" -execdir mv {} dtos.ts \;

   # Update imports
   find . -type f -name "*.ts" -exec sed -i 's/\/dto"/\/dtos"/g' {} \;
   ```

3. **Validation Gates**:
   - CI: Fail on `dto.ts` files
   - CI: Fail on cross-context violations
   - Pre-commit: Run structure validation

---

## Success Criteria

### Documentation Alignment

- [ ] SERVICE_TEMPLATE.md uses `dtos.ts` (plural) throughout
- [ ] SERVICE_TEMPLATE.md documents three DTO patterns per SRM
- [ ] SERVICE_TEMPLATE.md includes `mappers.ts` in file structure
- [ ] SERVICE_TEMPLATE.md includes SRM cross-context consumption matrix
- [ ] SERVICE_TEMPLATE.md references SRM v3.0.2 explicitly
- [ ] All three docs have version, date, status metadata
- [ ] Clear documentation hierarchy established

### Codebase Compliance

- [ ] All services use `dtos.ts` (not `dto.ts`)
- [ ] Complex services (Loyalty, Finance, MTL) use Contract-First pattern
- [ ] Simple services (Player, Visit, Casino) use Canonical pattern
- [ ] All cross-context imports comply with SRM matrix
- [ ] No ESLint violations for DTO patterns

### Team Readiness

- [ ] Team briefed on documentation changes
- [ ] Migration guide published
- [ ] Updated validation scripts deployed
- [ ] CI gates active

---

## Appendix A: Full Drift Inventory

1. ✅ CRITICAL-001: DTO file naming (`dto.ts` vs `dtos.ts`)
2. ✅ CRITICAL-002: DTO derivation strategy (Zod-first vs three patterns)
3. ✅ CRITICAL-003: Missing mapper pattern for complex services
4. ✅ CRITICAL-004: Cross-context access rules vagueness
5. ✅ HIGH-001: File structure additions (React Query integration)
6. ✅ HIGH-002: ServiceHttpResult envelope missing from ST
7. ✅ HIGH-003: Idempotency implementation detail gap
8. ✅ MEDIUM-001: Version management inconsistency
9. ✅ MEDIUM-002: Anti-pattern duplication
10. ✅ LOW-001: Testing pattern verbosity difference

**Total Drifts**: 10
**Critical**: 4
**High**: 3
**Medium**: 2
**Low**: 1

---

## Appendix B: Document Comparison Matrix

| Aspect | SRM v3.0.2 | SLAD v1.0 | ST v1.2 | Canonical Source |
|--------|------------|-----------|---------|------------------|
| DTO File Name | `dtos.ts` | Mixed | `dto.ts` | ✅ SRM |
| DTO Patterns | 3 patterns | Canonical only | Zod-first | ✅ SRM |
| Mappers | ✅ Required | ❌ Missing | ❌ Missing | ✅ SRM |
| Cross-Context | ✅ Matrix | ⚠️ Descriptive | ❌ Vague | ✅ SRM |
| Frontend | ❌ N/A | ✅ Full | ❌ N/A | ✅ SLAD |
| Idempotency | ✅ Policy | ✅ Full impl | ⚠️ Basic | ✅ SLAD |
| Anti-Patterns | ❌ N/A | ✅ Listed | ✅ Listed | ⚠️ Both |
| Version/Date | ✅ Yes | ✅ Yes | ❌ No | ✅ SRM, SLAD |

---

**Report Status**: READY FOR REVIEW
**Next Action**: Approve synchronization strategy and begin Phase 1

**Prepared By**: Claude Code pt2-complex-service-builder audit
**Review Required**: Architecture Team
**Approval Required**: Technical Lead
