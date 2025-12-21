# Lead Architect - Quick Start

**Purpose**: Single entry point for PT-2 architectural design.
**Read this first**, then reference other docs only as needed.

---

## Step 0: Balanced Architecture Decision

**Reference**: `docs/20-architecture/BALANCED_ARCHITECTURE_QUICK.md`

```
+- Scope?
|
+- Single domain -> User-facing? -> YES -> VERTICAL (1 week)
|                               -> NO  -> SERVICE (2-4 hours)
|
+- ALL domains (>5) --------------------> HORIZONTAL (1-3 days)
|
+- 2-3 domains -------------------------> HYBRID/ACTION (2-3 days)
```

| Approach | What It Means | Timeline |
|----------|---------------|----------|
| **VERTICAL** | DB -> Service -> Route -> Hook -> UI (single domain, user-facing) | 1 week |
| **HORIZONTAL** | Apply pattern to ALL services (infrastructure/cross-cutting) | 1-3 days |
| **HYBRID/ACTION** | Route/action orchestrates 2-3 bounded contexts | 2-3 days |
| **SERVICE** | Service layer only, not user-facing | 2-4 hours |

**Default**: When in doubt -> VERTICAL (ship features, defer abstractions)

**Transport Rule**:
- React Query mutations -> Route Handlers (`app/api/**/route.ts`)
- Form/RSC flows -> Server Actions (`app/actions/**`)

---

## Step 1: Determine Your Task Type

```
+- New Feature Design?
|  +-> Follow: Discovery -> Domain Model -> Architecture -> Artifacts -> Validate
|
+- Refactor/Patch existing system?
|  +-> Load current state -> Propose minimal change -> Update affected docs
|
+- Documentation Validation?
|  +-> Cross-reference SRM + SLAD + schema -> Detect drift -> Rectify
|
+- Tech Debt Evaluation?
|  +-> Assess current state -> Categorize debt -> Propose remediation
|
+- Compliance/Audit Design?
   +-> Identify requirements -> Design RLS/RBAC -> Document audit trails
```

---

## Step 2: Types Source of Truth

`types/database.types.ts` is the single source of truth for all database types.

```
types/database.types.ts  <- AUTHORITATIVE (auto-generated from schema)
+-- All table Row types
+-- All Enum types
+-- All function/RPC types

After any schema change:
  npm run db:types  <- Run this
```

**Guidelines**:
- Import types from `types/database.types.ts`
- Use `Pick`, `Omit`, `Partial` for derived types
- Avoid manually redefining table types
- Avoid `as any` to bypass type errors

---

## Step 3: Discovery-First Protocol

Start with existing documentation:

1. **Check Memori** for past architectural work (optional):
   ```python
   past_work = context.query_past_decisions(query="[domain] architecture", limit=5)
   ```

2. **Locate existing docs** via SDLC taxonomy:
   | Need | Location |
   |------|----------|
   | **Database types (SOT)** | `types/database.types.ts` |
   | RLS/RBAC policies | `docs/30-security/` |
   | Past decisions | `docs/80-adrs/` |
   | API contracts | `docs/25-api-data/` |
   | Architecture patterns | `docs/20-architecture/` |
   | Service boundaries | SRM in `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` |

3. **Cross-reference core docs**:
   - **SRM** -> Service boundaries and ownership
   - **SLAD** -> Patterns (A/B/C), transport, RLS

**Key principle**: Reference and extend what exists rather than designing from scratch. Surface incongruencies and provide plausible avenues to resolve inconcistencies and regressions found in the canonical documentation

---

## Step 4: Key Lookups

### Service Ownership (from SRM)

| Domain | Key Tables | Pattern | Status |
|--------|-----------|---------|--------|
| casino | `casino`, `company`, `staff`, `game_settings` | B (Canonical) | ✅ Deployed |
| player | `player`, `player_casino` | B (Canonical) | ✅ Deployed |
| visit | `visit` (3 archetypes via `visit_kind`) | B (Canonical) | ✅ Deployed + EXEC-VSE-001 |
| loyalty | `player_loyalty`, `loyalty_ledger` | A (Contract-First) | Planned |
| rating-slip | `rating_slip` (`visit_id`/`table_id` NOT NULL) | C (Hybrid) | REMOVED (rebuild per PRD-002) |
| finance | `player_financial_transaction` | A (Contract-First) | Planned |
| mtl | `mtl_entry`, `mtl_audit_note` | A (Contract-First) | Planned |
| table-context | `gaming_table`, `dealer_rotation` | C (Hybrid) | REMOVED (rebuild per PRD-006) |
| floor-layout | `floor_layout`, `floor_pit` | B (Canonical) | ✅ Deployed |

> **EXEC-VSE-001 Note**: VisitService supports 3 archetypes via `visit_kind` enum:
> - `reward_identified`: Player exists, no gaming, redemptions only
> - `gaming_identified_rated`: Player exists, gaming, loyalty eligible
> - `gaming_ghost_unrated`: No player (`player_id` NULL), compliance only

### Pattern Selection

```
+- Complex business logic with domain contracts?
|  +-> Pattern A: Contract-First (explicit DTOs, mappers)
|
+- Simple CRUD over database tables?
|  +-> Pattern B: Canonical (Pick/Omit from Row types)
|
+- Mixed complexity?
   +-> Pattern C: Hybrid (start B, extract DTOs when needed)
```

### PT-2 Anti-Patterns (Avoid)

**Service Layer**:
- Class-based services
- `ReturnType<typeof createXService>`
- Global singletons or stateful factories
- `as any` type casting
- Over-engineered abstractions

**DTO Anti-Patterns (CRITICAL)** - See `references/dto-compliance.md`:
- Manual `interface` for Pattern B services (schema evolution blindness)
- Raw `Row` type exports (exposes internal fields)
- Missing `dtos.ts` in Pattern B services (CI gate failure)
- `as` casting on RPC responses (type safety bypass)
- Cross-context direct table access (bounded context violation)

---

## Step 5: Required Outputs

Every architectural task produces:

### 1. Architecture Brief
- Context & scope (in/out of scope)
- High-level design (text + mermaid diagram)
- Invariants (what should remain true)
- Alternatives considered with rejection rationale

### 2. Canonical Doc Updates
- **SRM** -> Service responsibilities and boundaries
- **API Contracts** -> Routes, payloads, status codes
- **Schema** -> Migrations, RLS policies
- **ADR** -> If significant tradeoff exists

### 3. Implementation Plan
- Database layer tasks
- Service layer tasks
- API layer tasks
- Frontend tasks
- Documentation tasks
- Definition of Done

---

## Step 6: Validate

Before completing, run validation checklist:

- [ ] SRM entries accurate for affected services
- [ ] Schema types match (`npm run db:types` shows no diff)
- [ ] RLS policies exist for user-facing tables
- [ ] No anti-patterns introduced
- [ ] ADRs don't contradict each other
- [ ] All affected docs updated atomically
- [ ] **DTO compliance verified** (see below)
- [ ] **OE-01 Check passed** (see below)
- [ ] **Testing strategy defined** (see below)

### DTO Compliance Check (MANDATORY)

**Reference**: `references/dto-compliance.md`, `docs/25-api-data/DTO_CANONICAL_STANDARD.md`

```markdown
### Pattern B Services (casino, player, visit, floor-layout)
- [ ] Has `dtos.ts` with Pick/Omit types
- [ ] Has `selects.ts` with named column sets
- [ ] Has `keys.ts` with React Query key factories
- [ ] Has `crud.ts` with CRUD operations
- [ ] NO manual `interface` declarations
- [ ] NO raw `Row` type exports

### Pattern A Services (loyalty, finance, mtl)
- [ ] DTOs extracted to `dtos.ts` if consumed by 2+ services
- [ ] Has `mappers.ts` with typed input (REQUIRED)
- [ ] Cross-context DTOs published for consumers

### Pattern C Services (table-context, rating-slip) - REMOVED
> When rebuilt per PRD-002/PRD-006, follow `dto-compliance.md` Pattern C section

### All Services
- [ ] NO `as` casting on RPC responses
- [ ] NO cross-context `Database['...']['Tables']['foreign']` access
```

### OE-01 Over-Engineering Check

**Reference**: `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`

```markdown
### OE-01 Check (Over-Engineering Guardrail)

- [ ] A section 6 trigger exists (second consumer, SLO breach, compliance, scale)?
- [ ] Measured evidence attached (profile, incident, mandate)?
- [ ] Idempotency handled at DB (UNIQUE key), not re-implemented elsewhere?
- [ ] Single service mutates the domain (no cross-writes)?
- [ ] Infra-only change <=150 LOC; if not, Mini-ADR attached?

**Result:** [ ] Proceed  [ ] Needs Mini-ADR  [ ] Reject (remove complexity)
```

**If Yes >= 2 on Red-Flag Checklist -> Consider Mini-ADR or removing the layer.**

### Testing Strategy Check (QA-001 + QA-004)

**Reference**: `docs/40-quality/QA-001-service-testing-strategy.md`, `docs/40-quality/QA-004-tdd-standard.md`

Every architecture should enable testing. Verify:

- [ ] PRD traceability: Design maps to testable user stories (QA-001)
- [ ] Layer mock boundaries defined: Which layer mocks what (QA-001)
- [ ] RLS test approach: How to validate access policies (QA-004)
- [ ] Coverage achievable: Design allows 90%+ service coverage (QA-001)

### Red Flags (Stop & Escalate)

- Contradictory ADRs (not marked superseded)
- Schema completely out of sync
- SRM shows non-existent services
- RLS missing on user-facing tables
- **OE-01 violations** (premature generalization, event bus with one consumer)
- **Untestable architecture** (no clear mock boundaries, no RLS test strategy)

---

## Step 7: Check MVP Roadmap Status

**Before designing**, check current MVP implementation status:

```bash
/mvp-status   # Live status from Memori
```

Or check static memory file: `memory/phase-status.memory.md`

**MVP-ROADMAP.md** (`docs/20-architecture/MVP-ROADMAP.md`) defines the baseline:

```
Phase 0: Horizontal Infrastructure (GATE-0) ← MUST COMPLETE FIRST
├── TransportLayer (withServerAction)
├── ErrorTaxonomy
├── ServiceResultPattern
└── QueryInfra

Phase 1: Core Services (GATE-1) ← Blocked by Phase 0
├── CasinoService (PRD-000) ← ROOT AUTHORITY
├── PlayerService (PRD-003)
└── VisitService (PRD-003)

Phase 2: Session Management + UI (GATE-2)
├── TableContextService (REMOVED - rebuild per PRD-006)
├── RatingSlipService (REMOVED - rebuild per PRD-002)
└── PitDashboard

Phase 3: Rewards & Compliance (GATE-3)
├── LoyaltyService, PlayerFinancialService, MTLService
```

**Key Insight**: HORIZONTAL-FIRST order. No routes deployable until GATE-0 completes.

---

## Step 8: Record to Memori (Optional)

```python
# After architectural decisions
context.record_architectural_decision(
    decision="[What was decided]",
    rationale="[Why]",
    alternatives_considered=["Option A: rejected because..."],
    affected_services=["ServiceName"],
    pattern_used="Pattern A/B/C",
    domain="[Domain]"
)

# After finding documentation regressions
context.record_documentation_regression(
    regression_type="schema_drift | srm_conflict | adr_contradiction",
    affected_docs=["doc1.md", "doc2.md"],
    description="[What was inconsistent]",
    resolution="[How it was fixed]"
)

# After implementing a service (update MVP progress)
from lib.memori.mvp_progress_context import create_mvp_progress_context
ctx = create_mvp_progress_context()
ctx.record_service_completion(
    service_name="ServiceName",
    files_created=["path/to/file.ts"],
    test_coverage=90.0,
    implementation_notes="Notes"
)
```

---

## Quick Reference: Definition of Done

1. Problem and scope clearly stated
2. Single recommended architecture (+ alternatives)
3. Core flows described
4. Ownership boundaries defined
5. Canonical docs updated
6. Documentation consistency validated
7. Open questions/risks listed
8. Implementation plan concrete

---

## Need More Detail?

| Topic | Reference |
|-------|-----------|
| **Database types (SOT)** | `types/database.types.ts` |
| **DTO Standard (MANDATORY)** | `docs/25-api-data/DTO_CANONICAL_STANDARD.md` |
| **DTO Compliance Guide** | `references/dto-compliance.md` |
| **MVP Roadmap (baseline)** | `docs/20-architecture/MVP-ROADMAP.md` |
| **MVP Status (live)** | `/mvp-status` command |
| Output templates | `references/output-templates.md` |
| Example architectures | `references/example-architectures.md` |
| Full validation checklist | `references/validation-checklist.md` |
| Service patterns (full) | `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` |
| Service boundaries (full) | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` |
| Anti-patterns | `docs/70-governance/anti-patterns/INDEX.md` (modular) |
| Testing strategy | `docs/40-quality/QA-001-service-testing-strategy.md` |
| TDD standard | `docs/40-quality/QA-004-tdd-standard.md` |
| MVP Progress Tracker | `lib/memori/mvp_progress_context.py` |
| Memory protocol | `references/memory-protocol.md` |
| Session continuity | `references/context-management.md` |
