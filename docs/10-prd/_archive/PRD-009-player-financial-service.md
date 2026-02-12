---
id: PRD-009
title: Player Financial Service
owner: Product
status: Proposed
affects: [PRD-008, ARCH-SRM, ADR-015, ADR-017, SEC-001, SEC-003, SEC-005]
created: 2025-12-10
last_review: 2025-12-11
phase: Phase 3 (Rewards & Compliance)
pattern: A
http_boundary: true
---

# PRD-009 — Player Financial Service

## 1. Overview

- **Owner:** Product
- **Status:** Proposed
- **Summary:** Implement the PlayerFinancialService to manage monetary transactions during player sessions. This service owns the `player_financial_transaction` ledger and provides idempotent transaction creation for buy-ins, cash-outs, and marker operations. Staff (pit bosses at tables, cashiers at cage) record financial events linked to player visits, enabling accurate compliance reporting and session analytics.

**Addendum Reference:** See `docs/10-prd/PRD-009-cashier-workflows-addendum.md` for detailed cashier workflow specifications.

> **Note:** Addendum relocated from `docs/00-vision/` per SDLC taxonomy (Vision is not for feature addenda).

---

## 2. Problem & Goals

### 2.1 Problem

The rating slip modal (PRD-008) includes a cash-in section that currently has no backend service. Financial transactions must be:
- Recorded with idempotency guarantees (prevent double-entry)
- Linked to visits to prevent orphan transactions
- Auditable for compliance (Finance provides data; MTLService evaluates thresholds)
- Assigned gaming days automatically per casino settings

Without this service, cash-in events entered by pit bosses are not persisted, and there is no foundation for cashier workflows or compliance reporting.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Idempotent transaction creation | Duplicate requests with same idempotency_key return existing record, no double-entry |
| **G2**: Gaming day auto-assignment | All transactions have `gaming_day` populated by DB trigger (never client-set) |
| **G3**: Visit-linked audit trail | All transactions include `casino_id`, `player_id`, `visit_id` linkage |
| **G4**: PRD-008 unblock | Cash-in form section wired to service, saves transaction on submit |

### 2.3 Non-Goals

- Payment gateway integration (future ADR-016)
- Marker credit limit management
- Marker aging and bad debt tracking
- Multi-currency support
- Financial reconciliation reports
- Deep MTL integration (separate PRD for MTLService)
- Non-gaming cash flows (hotel, F&B)
- `finance_outbox` implementation (post-MVP per SRM v4.2.1)
- **Cage buy-ins** — Players do not buy-in at the cage; buy-ins occur at gaming tables with pit bosses. Cage operations are limited to cash-outs and marker settlements (SRM v4.2.0).

---

## 3. Users & Use Cases

- **Primary users:** Pit Boss, Cashier, Floor Supervisor, Compliance Officer, Admin

**Top Jobs:**

- As a **Pit Boss**, I need to record table-side buy-ins when a player purchases chips so that the transaction is linked to their visit and available for compliance review.
- As a **Cashier**, I need to record cash-outs when a player exchanges chips for cash at the cage so that the session financial summary is accurate.
- As a **Cashier**, I need to record marker issuance and settlements so that credit extensions are tracked with proper references.
- As a **Compliance Officer**, I need to query transactions by gaming day and source so that I can review financial activity for MTL threshold evaluation (performed by MTLService).

---

## 4. Scope & Feature List

### 4.1 In Scope (MVP)

**Core Transaction Management:**
- Create financial transaction (idempotent via RPC)
- List transactions with pagination (by casino, player, gaming_day, source)
- Get transaction by ID
- Calculate session total (sum by visit_id with direction breakdown)
- Gaming day trigger (auto-populate from casino_settings)

**Pit Boss Workflows:**
- Table-side buy-in recording (direction='in', tender_type='cash'/'chips')
- PRD-008 cash-in form integration

**Cashier Workflows:**
- Cash-out recording (direction='out')
- Marker issuance (direction='in', tender_type='marker')
- Marker settlement (direction='out', with related_transaction_id reference)

**Source Tracking:**
- Transaction source field distinguishes 'pit' vs 'cage' vs 'system'

### 4.2 Out of Scope

See Section 2.3 Non-Goals.

### 4.3 MVP Decisions (Governance Aligned)

| Decision | Choice | Reference |
|----------|--------|-----------|
| `visit_id` requirement | **Required (NOT NULL)** for all transactions | SRM v4.2.0 |
| Cage buy-ins | **Out of scope** — not standard casino workflow | SRM v4.2.0, Addendum |
| Cashier workflows | Cash-outs and marker settlements only | ADR-017, Addendum |
| `finance_outbox` | **Deferred to post-MVP** — synchronous only | SRM v4.2.1 |
| MTL compliance | Finance provides data; **MTLService owns threshold logic** | SRM v4.2.1 |
| Cashier role | `staff_role` enum (not JWT claim) | ADR-017 |

---

## 5. Requirements

### 5.1 Functional Requirements

- Create transaction with `idempotency_key` returns existing record or creates new (no duplicates)
- **`visit_id` is required** (NOT NULL) for all transactions — prevents orphan transactions (SRM v4.2.0)
- `gaming_day` auto-populated by trigger; callers must omit this field
- List transactions requires `casino_id` filter; optional filters for `player_id`, `gaming_day`, `visit_id`, `source`
- Calculate visit total returns `totalIn`, `totalOut`, `netAmount`, `transactionCount`
- Pit boss transactions constrained to: `direction='in'`, `tender_type IN ('cash','chips')`, `source='pit'`
- Cashier transactions constrained to: `source='cage'`, `direction='out'` OR `tender_type='marker'` (no cage buy-ins)

### 5.2 Non-Functional Requirements

- RLS enforces casino-scoped access (Pattern C per ADR-015)
- Append-only ledger: no UPDATE or DELETE operations permitted
- Idempotency via partial unique index on `(casino_id, idempotency_key)`
- Create operation p95 latency < 200ms

> **Architecture details** (schema, RPC, DTOs, RLS policies, service structure) live in:
> - `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (SRM v4.2.1)
> - `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` (SLAD)
> - `docs/20-architecture/specs/PRD-009/EXECUTION-SPEC-PRD-009.md` (to be generated via `/prd-execute PRD-009`)

---

## 6. Service Implementation Pattern

### 6.1 Pattern Selection

- **Pattern:** A (Contract-First)
- **HTTP Boundary:** Yes (RPC via Route Handlers)
- **Justification:** Finance domain has complex business logic (idempotency, direction constraints, role-based validation) requiring explicit domain contracts. Cross-context consumption by Loyalty and MTL services requires published DTOs.

### 6.2 Required Files

Per [DTO_CANONICAL_STANDARD.md v2.1.0](../../docs/25-api-data/DTO_CANONICAL_STANDARD.md):

| File | Required | Purpose |
|------|----------|---------|
| `dtos.ts` | ✅ | Manual interfaces for domain contracts (consumed by Loyalty, MTL) |
| `schemas.ts` | ✅ | Zod validation for RPC inputs (ADR-013) |
| `mappers.ts` | ✅ | Row → DTO transformations with typed input |
| `keys.ts` | ✅ | React Query key factories |
| `http.ts` | ✅ | HTTP fetchers for client-side |
| `index.ts` | ✅ | Service factory (functional) |

### 6.3 Cross-Context Dependencies

| Direction | Service | DTO | Purpose |
|-----------|---------|-----|---------|
| Consumes | VisitService | VisitDTO | Validate visit exists and belongs to player |
| Consumes | CasinoService | CasinoSettingsDTO | Gaming day calculation |
| Publishes | PlayerFinancialService | FinancialTransactionDTO | For Loyalty points calculation |
| Publishes | PlayerFinancialService | VisitFinancialSummaryDTO | For MTL threshold evaluation |

### 6.4 Schema Invariants Check

**SRM v4.2.1 Invariants Verified:**
- `player_financial_transaction.visit_id` NOT NULL (prevents orphan transactions)
- `player_financial_transaction.amount` > 0 (direction indicates flow)
- `player_financial_transaction.gaming_day` set by trigger (never client-set)
- Append-only ledger (no UPDATE/DELETE)

**Compatibility:** ✅ Compatible with SRM v4.2.1

### 6.5 Zod Schemas Required (ADR-013)

| Schema | Purpose |
|--------|---------|
| `createFinancialTxnSchema` | Validate RPC input (amount, direction, tender_type, idempotency_key) |
| `financialTxnListQuerySchema` | Validate list query params (casino_id, filters, pagination) |
| `visitTotalQuerySchema` | Validate visit total query params |

**Complex Validations:**
- `.refine()` for pit boss constraint: `direction='in'` when `source='pit'`
- `.refine()` for cashier constraint: `source='cage'` implies `direction='out'` OR `tender_type='marker'`

---

## 7. UX / Flow Overview

**Pit Boss Flow (Table-Side Buy-In):**
1. Open rating slip modal for active session (PRD-008)
2. Navigate to cash-in form section
3. Enter buy-in amount and tender type (cash/chips)
4. Submit → Transaction saved linked to current visit
5. Visit total updates in modal

**Cashier Flow (Cash-Out):**
1. Search for player by name, ID, or loyalty number
2. Select active or recently closed visit
3. Enter cash-out amount
4. Confirm → Transaction saved with `direction='out'`, `source='cage'`

**Cashier Flow (Marker Settlement):**
1. Search for player with outstanding marker
2. Select original marker transaction
3. Enter settlement amount
4. Confirm → Settlement saved with `related_transaction_id` reference

---

## 8. Dependencies & Risks

### 8.1 Dependencies

| Dependency | Actual State | SRM Contract | Gap |
|------------|--------------|--------------|-----|
| `player_financial_transaction` table | Exists | SRM v4.2.1 | Missing: `direction`, `source`, `created_by_staff_id`, `related_transaction_id` columns; `visit_id` nullable |
| `set_fin_txn_gaming_day` trigger | Pending verification | Required | Needs confirmation |
| `rpc_create_financial_txn` RPC | **Not implemented** | SRM Contracts | Core write path |
| RLS policies (Pattern C) | **Not implemented** | SEC-001 | Must be created per ADR-015 |
| `cashier` role in `staff_role` enum | **Implemented** | ADR-017 | Migration deployed |
| PRD-008 rating slip modal | In progress | — | Consumer of this service |

> **Note:** SRM v4.2.1 defines the canonical contract (schema invariants, RPC, RLS). The database schema has not yet been migrated to match. Migration is WS1 in EXECUTION-SPEC.

### 8.2 Risks & Open Questions

| Risk | Impact | Mitigation |
|------|--------|------------|
| Schema migration breaks existing data | High | Add columns with defaults; test migration on staging first |
| Idempotency edge cases | Medium | Integration tests for concurrent duplicate submissions |
| RLS policy complexity | Medium | Follow ADR-015 Pattern C; test cross-casino isolation |

---

## 9. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Create transaction via RPC works end-to-end with idempotency
- [ ] Gaming day auto-populated by trigger (never client-set)
- [ ] List transactions returns paginated results filtered by casino
- [ ] Visit total calculation returns correct breakdown
- [ ] Pit boss constraint validation enforced at RPC level
- [ ] Cashier constraint validation enforced at RPC level

**Data & Integrity**
- [ ] No duplicate transactions created for same `casino_id + idempotency_key`
- [ ] All transactions have valid `visit_id` (no orphans)
- [ ] Amount is always positive with direction indicating cash flow
- [ ] Append-only enforced (UPDATE/DELETE blocked by RLS)

**Security & Access**
- [ ] RLS policies enforce casino-scoped isolation (Pattern C)
- [ ] Pit boss can only create buy-ins (`direction='in'`, `source='pit'`)
- [ ] Cashier can only create cash-outs (`direction='out'`) or marker operations (`tender_type='marker'`) with `source='cage'`
- [ ] Compliance officer has read-only access
- [ ] No cross-casino data leakage in tests

**Testing**
- [ ] Unit tests for mappers and DTOs
- [ ] Integration tests for RPC idempotency behavior
- [ ] RLS policy enforcement tests (cross-casino isolation)
- [ ] Constraint violation tests (invalid direction/tender_type/amount)

**Operational Readiness**
- [ ] Migration rollback script tested
- [ ] Error responses include actionable messages for constraint violations
- [ ] Key operations logged with correlation IDs

**Documentation**
- [ ] SRM updated with schema invariants (if changed)
- [ ] EXECUTION-SPEC generated and validated
- [ ] Known limitations documented in changelog

---

## 10. Related Documents

### Vision & Strategy (V&S)
| Document | Purpose |
|----------|---------|
| `docs/00-vision/VIS-001-VISION-AND-SCOPE.md` | Project context |

### Product Requirements (PRD)
| Document | Purpose |
|----------|---------|
| `docs/10-prd/PRD-009-cashier-workflows-addendum.md` | Cashier workflow details |
| `docs/10-prd/PRD-008-rating-slip-modal-integration.md` | Consumer of this service |

### Architecture (ARCH)
| Document | Purpose |
|----------|---------|
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | Finance bounded context (v4.2.1) |
| `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` | Pattern A implementation |
| `docs/20-architecture/specs/PRD-009/EXECUTION-SPEC-PRD-009.md` | Implementation spec (to be generated) |

### API & Data (API/DATA)
| Document | Purpose |
|----------|---------|
| `docs/25-api-data/DTO_CANONICAL_STANDARD.md` | DTO patterns |
| `docs/25-api-data/DTO_CATALOG.md` | DTO ownership matrix |
| `types/database.types.ts` | Generated schema types |

### Security (SEC/RBAC)
| Document | Purpose |
|----------|---------|
| `docs/30-security/SEC-001-rls-policy-matrix.md` | RLS templates |
| `docs/30-security/SEC-003-rbac-matrix.md` | Role permissions |
| `docs/30-security/SEC-005-role-taxonomy.md` | Cashier role definition |

### Quality (DEL/QA)
| Document | Purpose |
|----------|---------|
| `docs/40-quality/QA-001-service-testing-strategy.md` | Testing standards |
| `docs/40-quality/QA-004-tdd-standard.md` | TDD workflow |

### Operations (OPS/SRE)
| Document | Purpose |
|----------|---------|
| `docs/50-ops/` | Observability standards (to be created) |
| N/A | SLOs not yet defined for this service |

### Release (REL)
| Document | Purpose |
|----------|---------|
| `docs/60-release/` | Rollout plan (to be created with EXECUTION-SPEC) |
| N/A | Backout procedure defined in EXECUTION-SPEC |

### Architecture Decision Records (ADR)
| Document | Purpose |
|----------|---------|
| `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` | Pattern C (Hybrid) |
| `docs/80-adrs/ADR-017-cashier-role-implementation.md` | Cashier as staff_role enum |

---

## 11. Changelog

| Date | Version | Status | Changes |
|------|---------|--------|---------|
| 2025-12-11 | 1.0.0 | Proposed | **PRD-STD-001 compliance v3**: Fixed YAML front-matter (`pattern: A`, added `http_boundary: true`). Added Section 6 (Service Implementation Pattern) with required files, cross-context DTOs, schema invariants, and Zod schema specs. Renumbered sections 6-10 → 7-11. |
| 2025-12-11 | 0.9.0 | Proposed | **PRD-STD-001 compliance v2**: Added YAML front-matter. Fixed status/version alignment. Fixed DoD cage workflow contradiction (cashier limited to cash-outs and markers). Relocated addendum reference. Added EXECUTION-SPEC canonical path. Reconciled dependencies with actual schema vs SRM. Added complete cross-links per SDLC taxonomy. |
| 2025-12-11 | 0.8.2 | Draft | **PRD-STD-001 compliance v1**: Re-drafted per PRD standard. Removed embedded architecture specs. Fixed DoD categories. Corrected dependency status. |
| 2025-12-11 | 0.8.1 | Draft | **Ownership clarification**: Finance provides supporting data for MTL compliance; threshold evaluation owned by MTLService. |
| 2025-12-10 | 0.8.0 | Draft | **SEC-001/SEC-003 compliance**: Added casino_id validation to RPC. |
| 2025-12-10 | 0.7.0 | Draft | **ADR-017 alignment**: Cashier as staff_role enum. |
| 2025-12-10 | 0.6.0 | Draft | Added pit_boss to RLS policies (SEC-005 v1.1.0). |
| 2025-12-10 | 0.5.0 | Draft | Fixed RLS role scoping. |
| 2025-12-10 | 0.4.0 | Draft | Fixed append-only violation. |
| 2025-12-10 | 0.3.0 | Draft | Added required idempotencyKey. |
| 2025-12-10 | 0.2.0 | Draft | Added direction field. |
| 2025-12-10 | 0.1.0 | Draft | Initial draft. |
