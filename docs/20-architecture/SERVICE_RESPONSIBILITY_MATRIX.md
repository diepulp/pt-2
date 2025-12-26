---
id: ARCH-SRM
title: Service Responsibility Matrix - Bounded Context Registry
nsversion: 4.9.0
status: CANONICAL
effective: 2025-12-25
schema_sha: efd5cd6d079a9a794e72bcf1348e9ef6cb1753e6
source_of_truth:
  - database schema (supabase/migrations/)
  - docs/30-security/SEC-001-rls-policy-matrix.md
  - docs/30-security/SEC-002-casino-scoped-security-model.md
  - docs/25-api-data/DTO_CANONICAL_STANDARD.md
  - docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md
  - docs/20-architecture/EDGE_TRANSPORT_POLICY.md
  - docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md
  - docs/80-adrs/ADR-017-cashier-role-implementation.md
  - docs/80-adrs/ADR-018-security-definer-governance.md
  - docs/80-adrs/ADR-023-multi-tenancy-storage-model-selection.md
  - docs/archive/player-enrollment-specs/ADR-022_Player_Identity_Enrollment_ARCH_v7.md
  - docs/80-adrs/ADR-022_Player_Identity_Enrollment_DECISIONS.md
  - docs/20-architecture/specs/ADR-022/EXEC-SPEC-022.md
  - docs/20-architecture/specs/ADR-022/DOD-022.md
---

# Service Responsibility Matrix - Bounded Context Registry (CANONICAL)

> **Version**: 4.9.0 (ADR-023 Multi-Tenancy: Pool Primary; Silo Optional)
> **Date**: 2025-12-25
> **Status**: CANONICAL - Contract-First, snake_case, UUID-based
> **Purpose**: Bounded context registry with schema invariants. Implementation patterns live in SLAD.

## Document Scope

**This SRM defines:**
- Bounded context ownership (service → tables mapping)
- Schema invariants (NOT NULL, immutable columns, constraints)
- Cross-context DTO consumption rules
- Contract summaries (outbox, CQRS, RPC requirements)

**This SRM does NOT contain:**
- Full schema DDL → See `supabase/migrations/`
- DTO patterns → See `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- Error codes → See `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md`
- Middleware chain → See `docs/20-architecture/EDGE_TRANSPORT_POLICY.md`
- RLS templates → See `docs/30-security/SEC-001-rls-policy-matrix.md`
- Implementation patterns → See `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`

---

## Change Log

- **4.9.0 (2025-12-25)** – **ADR-023 Multi-Tenancy Formalization**: Official tenancy stance declared: Pool Primary; Silo Optional. Added SEC-002 and ADR-023 to source_of_truth. SEC-001/SEC-002 updated with tenancy cross-references. See `docs/80-adrs/ADR-023-multi-tenancy-storage-model-selection.md`.
- **4.8.0 (2025-12-23)** – **ADR-022 v7.1 MVP Scope (Security Audited)**: Adopted production-ready MVP scope with 7-agent security audit. `player_identity` table planned with scanner-shaped schema. Key security fixes: auth.uid() guard (INV-7), actor binding (INV-9), key immutability (INV-10), document hash storage. Tax identity deferred post-MVP. See `docs/archive/player-enrollment-specs/ADR-022_Player_Identity_Enrollment_ARCH_v7.md`.
- **4.4.0 (2025-12-12)** – **SEC-006 RLS Hardening**: FloorLayoutService full RLS coverage (5 tables). All 7 SECURITY DEFINER RPCs hardened with Template 5 context validation (ADR-018). Append-only denial policies added to ledger tables. See `docs/80-adrs/ADR-018-security-definer-governance.md` and migration `20251212080915_sec006_rls_hardening.sql`.
- **4.3.0 (2025-12-11)** – **PlayerFinancialService IMPLEMENTED** (PRD-009): Full Pattern A implementation with 78 tests. Service layer: DTOs, schemas, keys, mappers, crud, http. Transport: 3 Route Handlers + 4 React Query hooks. Enums: `financial_direction` ('in'|'out'), `financial_source` ('pit'|'cage'|'system'), `tender_type`. RLS: Hybrid policies per ADR-015. Commits: 5f4522b, ccf9e98, 3ec0caf.
- **4.2.1 (2025-12-11)** – Finance outbox deferred: Removed `finance_outbox` from current ownership (post-MVP per ADR-016). Added MVP Egress contract: synchronous only, no external side effects. MTLService integration via triggers remains in scope.
- **4.2.0 (2025-12-11)** – Finance scope alignment: `visit_id` changed from optional to **required** for FinanceService consumption. Added `visit_id NOT NULL` to PlayerFinancialService schema invariants. Removed "buy-ins" from cashier cage operations (incorrect terminology - players cash out at cage, not buy-in). Cashier workflows limited to: cash-outs and marker settlements.
- **4.1.0 (2025-12-10)** – ADR-017 compliance: Added `cashier` to `staff_role` enum. Documented cashier role capabilities in PlayerFinancialService section. Updated cross-context consumption rules.
- **4.0.0 (2025-12-06)** – Major reduction per SRM/SLAD audit. Removed full DDL, error codes, middleware details, and RLS templates. Now a registry + invariants document only. Implementation patterns moved to SLAD. References canonical docs for all duplicated content.
- **3.1.1 (2025-12-06)** – RatingSlip `player_id` removal per EXEC-VSE-001.
- **3.1.0 (2025-11-13)** – Security & tenancy upgrade landed.
- **3.0.2 (2025-10-21)** – Rating Slip Mid-Session Rewards patch.

---

## Contract Policy (Canonical)

| Policy | Requirement | Reference |
|--------|-------------|-----------|
| **Source of truth** | This SRM for ownership; migrations for DDL | `supabase/migrations/` |
| **Naming** | `lower_snake_case` for tables/columns/enums | — |
| **Identifiers** | `uuid` for all PKs/FKs | — |
| **JSON** | Allowed only for extensible metadata | See JSON Exceptions below |
| **Ownership** | `casino_id` required on all operational tables | — |
| **RLS** | Policies derive from SRM ownership | `docs/30-security/SEC-001-rls-policy-matrix.md` |
| **Edge transport** | Server Actions/Route Handlers via `withServerAction()` | `docs/20-architecture/EDGE_TRANSPORT_POLICY.md` |
| **DTOs** | Contract-first with mappers for Pattern A | `docs/25-api-data/DTO_CANONICAL_STANDARD.md` |
| **Error handling** | Domain errors, no Postgres leakage | `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md` |
| **Idempotency** | `x-idempotency-key` required on mutations | `docs/20-architecture/EDGE_TRANSPORT_POLICY.md` |

### JSON Metadata Exceptions

Approved JSON blobs (all others require first-class columns):
- `table_*` chipset payloads
- `rating_slip.policy_snapshot`
- `rating_slip.game_settings`
- `floor_layout*` geometry/metadata
- `player_loyalty.preferences`

---

## Service Responsibility Overview

| Domain | Service | Owns Tables | Bounded Context |
|--------|---------|-------------|-----------------|
| **Foundational** | CasinoService | casino, casino_settings, company, staff, game_settings, audit_log, report, **player_casino** | Root temporal authority, global policy, & player enrollment |
| **Identity** | PlayerService | player, *player_identity* ² | Identity management |
| **Operational** | TableContextService | gaming_table, gaming_table_settings, dealer_rotation, table_inventory_snapshot, table_fill, table_credit, table_drop_event | Table lifecycle & operational telemetry |
| **Operational** | FloorLayoutService | floor_layout, floor_layout_version, floor_pit, floor_table_slot, floor_layout_activation | Floor design & activation |
| **Operational** | VisitService | visit | Session lifecycle (3 archetypes) |
| **Telemetry** | RatingSlipService | rating_slip, rating_slip_pause | Gameplay measurement |
| **Reward** | LoyaltyService | player_loyalty, loyalty_ledger, loyalty_outbox | Reward policy & assignment |
| **Finance** | PlayerFinancialService | player_financial_transaction | Financial ledger (SoT) ¹ |
| **Compliance** | MTLService | mtl_entry, mtl_audit_note | AML/CTR compliance |

> ¹ `finance_outbox` is **post-MVP** (ADR-016 planned for payment gateway integration). MVP uses synchronous processing only.
> ² `player_identity` is **planned (MVP)** per ADR-022 v7.1. `player_tax_identity` and scanner integration (`player_identity_scan`) are **deferred post-MVP**.

---

## CasinoService (Foundational Context)

**Owns**: `casino`, `casino_settings`, `company`, `staff`, `game_settings`, `audit_log`, `report`, `player_casino`

**Bounded Context**: "What are the operational parameters and policy boundaries of this casino property? Which players are enrolled?"

**Note**: Player enrollment (`player_casino`) is owned by CasinoService per ADR-022 D5.

### Schema Invariants

| Table | Column | Constraint | Notes |
|-------|--------|------------|-------|
| `casino_settings` | `casino_id` | NOT NULL, UNIQUE | 1:1 with casino |
| `casino_settings` | `gaming_day_start_time` | NOT NULL, default '06:00' | Temporal authority |
| `casino_settings` | `timezone` | NOT NULL | Required for gaming day calc |
| `staff` | `user_id` | references auth.users(id) | Auth linkage (NULL for dealers) |
| `staff` | `role` | NOT NULL, enum | No default; explicit assignment |
| `staff` | `casino_id` | references casino(id) | Casino scoping |

### Contracts

- **Audit**: `audit_log` for cross-domain event logging (canonical shape: `{ts, actor_id, casino_id, domain, action, dto_before, dto_after, correlation_id}`)
- **Auth**: `staff.user_id` column enables RLS via `auth.uid()` (dealers stay NULL)

### Cross-Context Consumption

| Consumer | Consumes Via |
|----------|--------------|
| All services | `getCasinoSettings()` DTO, staff roster endpoints |
| TableContext | Game config templates via DTOs |
| MTL | `gaming_day_start_time`, compliance thresholds |

**Full Schema**: `supabase/migrations/` (search: `create table casino`)
**RLS Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md#casino`

---

## PlayerService (Identity Context)

**Owns**: `player`

**Planned (MVP)** per ADR-022 v7.1: `player_identity`

**Note**: `player_casino` enrollment is owned by CasinoService (ADR-022 D5).

**Deferred (Post-MVP)**: `player_tax_identity`, `player_identity_scan`

**Bounded Context**: "Who is this player, where are they enrolled, and what is their verified identity?"

### Schema Invariants (Implemented)

| Table | Column | Constraint | Notes |
|-------|--------|------------|-------|
| `player` | `id` | PK, uuid | Immutable |
| `player` | `first_name`, `last_name` | NOT NULL | Required identity |
| `player_casino` | PK | (`player_id`, `casino_id`) | Composite key |
| `player_casino` | `status` | default 'active' | Enrollment status |

### Identity Tables (Planned — ADR-022 v7.1)

**MVP Scope:**
- **`player_identity`** — ID document metadata (DOB, address, issuing state, expiration, document number). Casino-scoped with `UNIQUE (casino_id, player_id)`. FK to `player_casino` enforces enrollment prerequisite.

**Deferred (Post-MVP):**
- **`player_tax_identity`** — Tax identifiers (SSN/TIN). Ultra-restricted RPC-only access.
- **`player_identity_scan`** — Raw scanner payload for future integration.

**Security Invariants (MVP)** from ADR-022 v7.1:
- **INV-1**: Casino context binding — derive `casino_id` from session/JWT, never trust caller-provided
- **INV-2**: Enrollment prerequisite — identity rows require matching `player_casino` enrollment
- **INV-6**: UPDATE policies require WITH CHECK

**Deferred Invariants (Post-MVP):**
- INV-3: Least privilege separation (tax identity)
- INV-4: Tax ID reveal auditing
- INV-5: Key management (encryption)

### Access Control (MVP — ADR-022 v7.1)

**player_identity** (ID document metadata):
| Role | Read | Write | Notes |
|------|------|-------|-------|
| `pit_boss` | ✅ | ✅ | Primary enrollment role |
| `admin` | ✅ | ✅ | Full access |
| `cashier` | ✅ | ❌ | Read-only (verification) |
| `dealer` | ❌ | ❌ | No PII access |

**Note:** `compliance` role gating deferred to post-MVP (when tax identity is implemented).

### Contracts

**MVP (ADR-022 v7.1):**
- Standard CRUD operations via PlayerService for `player_identity`
- Enrollment flow: player → player_casino → player_identity

**Deferred (Post-MVP — Tax Identity):**
- `player_has_tax_id_on_file(player_id)` — Boolean contract for Finance/MTL
- `reveal_tax_id(player_id, reason_code, request_id)` — Audited SSN reveal
- CTR threshold enforcement via Finance/MTL

### Cross-Context Consumption

| Consumer | Consumes Via |
|----------|--------------|
| VisitService | Player DTOs for session creation |
| LoyaltyService | Player identity for rewards |
| FinanceService | Player identity for transactions |
| MTLService | `player_has_tax_id_on_file` contract (**post-MVP**) |

**Full Schema**: `supabase/migrations/` (search: `create table player`)
**RLS Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md#player-visit`
**ADR**: `docs/80-adrs/ADR-022_Player_Identity_Enrollment_DECISIONS.md`
**Exec Spec**: `docs/20-architecture/specs/ADR-022/EXEC-SPEC-022.md`
**DoD Gates**: `docs/20-architecture/specs/ADR-022/DOD-022.md`

---

## VisitService (Operational Session Context)

**Owns**: `visit`

**Bounded Context**: "What is this patron doing at the casino right now?"

### Visit Archetypes

| `visit_kind` | Identity | Gaming | Loyalty | Use Case |
|--------------|----------|--------|---------|----------|
| `reward_identified` | Player exists | No | Redemptions only | Comps, vouchers |
| `gaming_identified_rated` | Player exists | Yes | Accrual eligible | Standard rated play |
| `gaming_ghost_unrated` | No player | Yes | Compliance only | Ghost gaming for finance/MTL |

### Schema Invariants

| Table | Column | Constraint | Notes |
|-------|--------|------------|-------|
| `visit` | `casino_id` | NOT NULL | Casino scoping |
| `visit` | `player_id` | NULLABLE | NULL only for ghost visits |
| `visit` | `visit_kind` | NOT NULL, enum | Determines player_id requirement |
| `visit` | — | CHECK constraint | `chk_visit_kind_player_presence` enforces ghost/player invariant |

### Contracts

- **Partial unique index**: `uq_visit_single_active_identified` ensures one active visit per identified player per casino

### Cross-Context Consumption

| Consumer | Consumes Via |
|----------|--------------|
| RatingSlipService | `visit_id` FK (NOT NULL) |
| LoyaltyService | Visit DTOs, `visit_kind` for accrual eligibility |
| FinanceService | `visit_id` FK (**required for MVP**) |
| MTLService | `visit_id` FK (optional) |

**Full Schema**: `supabase/migrations/` (search: `create table visit`)
**RLS Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md#player-visit`

---

## RatingSlipService (Telemetry Context)

**Owns**: `rating_slip`, `rating_slip_pause`

**Bounded Context**: "What gameplay activity occurred?"

### Schema Invariants (CRITICAL)

| Table | Column | Constraint | Notes |
|-------|--------|------------|-------|
| `rating_slip` | `casino_id` | NOT NULL, immutable | Casino scoping |
| `rating_slip` | `visit_id` | NOT NULL, immutable | **Always anchored to visit** |
| `rating_slip` | `table_id` | NOT NULL, immutable | **Always at a table** |
| `rating_slip` | `status` | NOT NULL, default 'open' | Lifecycle state |
| `rating_slip` | `policy_snapshot` | JSON | Reward policy at creation (immutable) |
| `rating_slip` | `start_time` | NOT NULL, immutable | Session start |
| `rating_slip_pause` | `rating_slip_id` | NOT NULL, FK | Parent slip reference |
| `rating_slip_pause` | `casino_id` | NOT NULL, FK | Casino scoping (RLS) |
| `rating_slip_pause` | `started_at` | NOT NULL, default now() | Pause start timestamp |
| `rating_slip_pause` | `ended_at` | NULLABLE | NULL = currently paused |
| `rating_slip_pause` | `created_by` | FK to staff | Actor tracking |
| `rating_slip_pause` | — | CHECK constraint | `ended_at IS NULL OR ended_at > started_at` |

**Key Invariant**: Player identity derived from `visit.player_id`. RatingSlip does NOT have its own `player_id` column.

### Lifecycle States

`open` → (`paused`/`resumed` cycles) → `closed`

- `casino_id`, `visit_id`, `table_id`, `start_time` immutable post-create
- `end_time` required at close

### Duration Calculation

**Formula**: `duration_seconds = (end_time - start_time) - SUM(pause_intervals)`

Server-authoritative calculation via `rpc_get_rating_slip_duration` and `rpc_close_rating_slip`:
- Sums all pause intervals from `rating_slip_pause` table
- Subtracts paused time from total elapsed time
- Returns active play duration in seconds

### Does NOT Store

- Reward balances or points (Loyalty is sole source of truth)

### Contracts

- **Mid-session rewards**: Via `rpc_issue_mid_session_reward` (Loyalty-owned RPC)
- **CQRS**: `rating_slip_projection` for dashboard reads
- **Eligibility**: Mid-session rewards only when `status = 'open'` and `visit_kind = 'gaming_identified_rated'`

### Cross-Context Consumption

| Consumer | Consumes Via |
|----------|--------------|
| LoyaltyService | `rating_slip_id` FK, telemetry DTOs |
| FinanceService | `rating_slip_id` FK (optional) |
| MTLService | `rating_slip_id` FK (optional) |

**Full Schema**: `supabase/migrations/` (search: `create table rating_slip`)
**RLS Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md#ratingslipservice`

---

## LoyaltyService (Reward Context)

**Owns**: `player_loyalty`, `loyalty_ledger`, `loyalty_outbox`

**Bounded Context**: "What is this gameplay worth in rewards?"

**Canonical Stance**: Loyalty is the sole source of truth for rewards. RatingSlip stores telemetry only.

### Schema Invariants

| Table | Column | Constraint | Notes |
|-------|--------|------------|-------|
| `player_loyalty` | PK | (`player_id`, `casino_id`) | Composite key |
| `player_loyalty` | `balance` | NOT NULL, default 0 | Current points |
| `loyalty_ledger` | `casino_id` | NOT NULL | Casino scoping |
| `loyalty_ledger` | `player_id` | NOT NULL | Who earned points |
| `loyalty_ledger` | `idempotency_key` | UNIQUE (partial) | Prevents double-spend |
| `loyalty_ledger` | `points_earned` | NOT NULL | Amount issued |
| `loyalty_ledger` | `reason` | NOT NULL, enum | `loyalty_reason` type |

### Contracts

- **RPC**: `rpc_issue_mid_session_reward` - atomic ledger + balance update
- **Outbox**: `loyalty_outbox` for downstream side effects
- **Visit Kind Filter**: Only `gaming_identified_rated` visits eligible for accrual

### Visit Kind Filtering

- `reward_identified`: Redemptions/adjustments only (no gaming)
- `gaming_identified_rated`: Full accrual eligible
- `gaming_ghost_unrated`: No automated accrual (manual supervisor action only)

**Full Schema**: `supabase/migrations/` (search: `create table loyalty_ledger`)
**RLS Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md#loyaltyservice`

---

## TableContextService (Operational Telemetry Context)

**Owns**: `gaming_table`, `gaming_table_settings`, `dealer_rotation`, `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_drop_event`

**Bounded Context**: "What is the operational state and chip custody posture of this gaming table?"

### Schema Invariants

| Table | Column | Constraint | Notes |
|-------|--------|------------|-------|
| `gaming_table` | `casino_id` | NOT NULL | Casino scoping |
| `gaming_table` | `label` | NOT NULL | Table identifier |
| `gaming_table` | `type` | NOT NULL, enum | `game_type` |
| `gaming_table` | `status` | NOT NULL, enum | `table_status` |
| `table_fill` | `request_id` | NOT NULL | Idempotency key |
| `table_fill` | — | UNIQUE | (`casino_id`, `request_id`) |
| `table_credit` | `request_id` | NOT NULL | Idempotency key |
| `table_credit` | — | UNIQUE | (`casino_id`, `request_id`) |

### Contracts

- **Chip custody**: Non-monetary tracking (Finance owns monetary ledgers)
- **Layout sync**: Listens for `floor_layout.activated` events
- **Casino validation**: Trigger `assert_table_context_casino()` on settings/rotations
- **Rating slip guard**: Consumes RatingSlipService `hasOpenSlipsForTable` published query for deactivate checks (bounded-context allowlisted)

### Does NOT Own

- Monetary ledgers (Finance)
- CTR/SAR thresholds (MTL)
- Reward ledger (Loyalty)
- Floor design (FloorLayoutService)

**Full Schema**: `supabase/migrations/` (search: `create table gaming_table`)
**RLS Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md#tablecontextservice`
**Post-MVP Extensions**: `docs/20-architecture/SRM_Addendum_TableContext_PostMVP.md`

---

## FloorLayoutService (Design & Activation Context)

**Owns**: `floor_layout`, `floor_layout_version`, `floor_pit`, `floor_table_slot`, `floor_layout_activation`

**Bounded Context**: "What does the gaming floor look like, and which layout is currently active?"

**Security Status (SEC-006)**: ✅ Full RLS coverage implemented (2025-12-12). See ADR-018 for SECURITY DEFINER governance.

### Schema Invariants

| Table | Column | Constraint | Notes |
|-------|--------|------------|-------|
| `floor_layout` | `casino_id` | NOT NULL | Casino scoping |
| `floor_layout` | `status` | NOT NULL, enum | `floor_layout_status` |
| `floor_layout` | `created_by` | NOT NULL | Staff audit |
| `floor_layout_version` | `version_no` | NOT NULL | Version number |
| `floor_layout_version` | — | UNIQUE | (`layout_id`, `version_no`) |
| `floor_layout_activation` | `activation_request_id` | NOT NULL | Idempotency |
| `floor_layout_activation` | — | UNIQUE | (`casino_id`, `activation_request_id`) |

### Contracts

- **Events**: `floor_layout.activated` emitted with layout + version metadata
- **Consumer**: TableContext listens and reconciles table activation state
- **RPCs**: `rpc_create_floor_layout`, `rpc_activate_floor_layout` — SECURITY DEFINER with Template 5 context validation (ADR-018)

### RLS Policy Architecture (SEC-006)

| Table | Pattern | Notes |
|-------|---------|-------|
| `floor_layout` | Template 1 (direct `casino_id`) | Standard hybrid policy |
| `floor_layout_activation` | Template 1 (direct `casino_id`) | Standard hybrid policy |
| `floor_layout_version` | Template 6 (subquery via `layout_id`) | Derives casino from parent |
| `floor_pit` | Template 6 (2-level subquery) | `layout_version_id` → `layout_id` → `casino_id` |
| `floor_table_slot` | Template 6 (2-level subquery) | `layout_version_id` → `layout_id` → `casino_id` |

**Full Schema**: `supabase/migrations/` (search: `create table floor_layout`)
**RLS Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md#floorlayoutservice`
**RLS Migration**: `supabase/migrations/20251212080915_sec006_rls_hardening.sql`

---

## PlayerFinancialService (Finance Context) ✅ IMPLEMENTED

**Owns**: `player_financial_transaction`

**Planned (post-MVP)**: `finance_outbox` — ADR-016 for payment gateway integration

**Bounded Context**: "What monetary transactions occurred?"

**Implementation Status** (PRD-009, 2025-12-11):
- **Pattern**: A (Contract-First with manual DTOs)
- **Service Layer**: `services/player-financial/` (dtos, schemas, keys, mappers, crud, http, index)
- **Transport**: 3 Route Handlers (`/api/v1/financial-transactions/**`, `/api/v1/visits/[visitId]/financial-summary`)
- **Hooks**: 4 React Query hooks (`hooks/player-financial/`)
- **Tests**: 78 tests (mappers: 44, service: 17, RLS integration: 17)

### Role Capabilities (ADR-017)

| Role | Read | Write (via RPC) | Constraints |
|------|------|-----------------|-------------|
| `admin` | ✅ | ✅ Full access | — |
| `cashier` | ✅ | ✅ Full access | Cage operations: cash-outs, marker settlements |
| `pit_boss` | ✅ | ⚠️ Limited | Table buy-ins only: `direction='in'`, `tender_type IN ('cash','chips')`, `visit_id` required |
| `compliance` | ✅ | ❌ | Read-only for audit |
| `dealer` | ❌ | ❌ | No access |

### Schema Invariants

| Table | Column | Constraint | Notes |
|-------|--------|------------|-------|
| `player_financial_transaction` | `player_id` | NOT NULL | Transaction owner |
| `player_financial_transaction` | `casino_id` | NOT NULL | Casino scoping |
| `player_financial_transaction` | `visit_id` | **NOT NULL** | **Required for MVP** (prevents orphan transactions) |
| `player_financial_transaction` | `amount` | NOT NULL, CHECK > 0 | Always positive |
| `player_financial_transaction` | `direction` | NOT NULL, enum | `financial_direction` ('in'\|'out') |
| `player_financial_transaction` | `source` | NOT NULL, enum | `financial_source` ('pit'\|'cage'\|'system') |
| `player_financial_transaction` | `tender_type` | NOT NULL, enum | `tender_type` ('cash'\|'chips'\|'marker') |
| `player_financial_transaction` | `gaming_day` | Trigger-derived | From `casino_settings.gaming_day_start_time` |
| `player_financial_transaction` | `idempotency_key` | UNIQUE (partial) | Casino-scoped, prevents duplicates |
| `player_financial_transaction` | `created_by` | NOT NULL, FK | Staff who created transaction |
| `player_financial_transaction` | `notes` | NULLABLE | Optional transaction notes |
| `player_financial_transaction` | `related_transaction_id` | NULLABLE, FK | Self-reference for voids/adjustments |

### Contracts

- **RPC**: `rpc_create_financial_txn` - canonical write path with idempotency support
- **Role validation**: Hybrid per ADR-015 — RLS policies check `COALESCE(current_setting('app.staff_role', true), auth.jwt()->>'staff_role')` and `COALESCE(current_setting('app.casino_id', true), (auth.jwt()->>'casino_id')::uuid)` to remain pooling-safe. Application layer MUST inject context via transaction-wrapped RPC (or JWT claims) before writes.
- **Trigger**: `trg_fin_gaming_day` populates `gaming_day` (callers MUST omit)
- **Immutability**: Append-only ledger; no deletes
- **View**: `visit_financial_summary` - Aggregated totals per visit (total_in, total_out, net_amount)
- **MVP Egress**: Synchronous only; no external side effects. MTLService integration via triggers.
- **Outbox (post-MVP)**: `finance_outbox` for payment gateway integration (ADR-016 planned)

### DTOs (Pattern A - Manual)

| DTO | Purpose | Location |
|-----|---------|----------|
| `FinancialTransactionDTO` | Read DTO for transaction details | `services/player-financial/dtos.ts` |
| `CreateFinancialTxnInput` | Write DTO for transaction creation | `services/player-financial/dtos.ts` |
| `VisitFinancialSummaryDTO` | Aggregated visit totals | `services/player-financial/dtos.ts` |
| `ListFinancialTxnFilters` | Query filters for list operations | `services/player-financial/dtos.ts` |

**Full Schema**: `supabase/migrations/20251211015115_prd009_player_financial_service.sql`
**RLS Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md#playerfinancialservice`

---

## MTLService (Compliance Context)

**Owns**: `mtl_entry`, `mtl_audit_note`

**Bounded Context**: "What cash/monetary transactions occurred for AML/CTR compliance?"

### Schema Invariants

| Table | Column | Constraint | Notes |
|-------|--------|------------|-------|
| `mtl_entry` | `patron_uuid` | NOT NULL | Player reference |
| `mtl_entry` | `casino_id` | NOT NULL | Casino scoping |
| `mtl_entry` | `amount` | NOT NULL | Transaction amount |
| `mtl_entry` | `direction` | NOT NULL | 'in' or 'out' |
| `mtl_entry` | `idempotency_key` | UNIQUE (partial) | Prevents duplicates |
| `mtl_audit_note` | `note` | NOT NULL | Audit content |

### Contracts

- **Immutability**: `mtl_entry` is write-once (append-only)
- **Thresholds**: Watchlist >= $3k, CTR >= $10k (from `casino_settings`)
- **Gaming day**: Computed via trigger from `casino_settings`

**Full Schema**: `supabase/migrations/` (search: `create table mtl_entry`)
**RLS Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md#mtlservice`

---

## Centralized Enum Catalog

```sql
create type staff_role as enum ('dealer','pit_boss','admin','cashier');
create type staff_status as enum ('active','inactive');
create type game_type as enum ('blackjack','poker','roulette','baccarat');
create type table_status as enum ('inactive','active','closed');
create type loyalty_reason as enum ('mid_session','session_end','manual_adjustment','promotion','correction');
create type visit_kind as enum ('reward_identified','gaming_identified_rated','gaming_ghost_unrated');
create type floor_layout_status as enum ('draft','review','approved','archived');
create type floor_layout_version_status as enum ('draft','pending_activation','active','retired');
-- PlayerFinancialService enums (PRD-009)
create type financial_direction as enum ('in','out');
create type financial_source as enum ('pit','cage','system');
create type tender_type as enum ('cash','chips','marker');
```

**Change policy**: Additive values only; removals require deprecation plus data rewrite.

---

## Cross-Context Consumption Rules

| Consumer | Producer | Allowed Access |
|----------|----------|----------------|
| Any service | CasinoService | DTOs, RPCs (never direct table access) |
| RatingSlipService | VisitService | `visit_id` FK, Visit DTOs |
| LoyaltyService | RatingSlipService | `rating_slip_id` FK, telemetry DTOs |
| LoyaltyService | VisitService | Visit DTOs, `visit_kind` check |
| FinanceService | VisitService | `visit_id` FK (**required for MVP**) |
| MTLService | FinanceService | Reconciliation via triggers |
| TableContextService | RatingSlipService | Published query/DTO `hasOpenSlipsForTable` (open-slip guard) |
| TableContextService | FloorLayoutService | `floor_layout.activated` events |

**Rule**: Cross-context consumers interact via DTO-level APIs, service factories, or RPCs—never by reaching into another service's tables directly.

---

## Related Documents

| Document | Purpose |
|----------|---------|
| `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` | Implementation patterns, service factory wiring |
| `docs/25-api-data/DTO_CANONICAL_STANDARD.md` | DTO patterns, ESLint enforcement |
| `docs/25-api-data/DTO_CATALOG.md` | Complete DTO ownership matrix |
| `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md` | Domain error codes, retry policies |
| `docs/20-architecture/EDGE_TRANSPORT_POLICY.md` | Middleware chain, header requirements |
| `docs/30-security/SEC-001-rls-policy-matrix.md` | RLS templates, policy matrix |
| `docs/30-security/SEC-005-role-taxonomy.md` | Role definitions, capabilities matrix |
| `docs/30-security/SEC-006-rls-strategy-audit-2025-12-11.md` | RLS audit findings and remediation |
| `docs/30-security/SECURITY_TENANCY_UPGRADE.md` | RLS context injection |
| `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` | RLS connection pooling, Pattern C (Hybrid) |
| `docs/80-adrs/ADR-017-cashier-role-implementation.md` | Cashier role as staff_role enum |
| `docs/80-adrs/ADR-018-security-definer-governance.md` | SECURITY DEFINER function governance |
| `docs/80-adrs/ADR-014-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling.md` | Visit archetype model |
| `docs/80-adrs/ADR-022_Player_Identity_Enrollment_DECISIONS.md` | Player identity decisions (frozen) |
| `docs/20-architecture/specs/ADR-022/EXEC-SPEC-022.md` | Player identity implementation |
| `docs/20-architecture/specs/ADR-022/DOD-022.md` | Player identity DoD gates |

---

## Canonical Readiness Checklist

- [x] All identifiers are lower_snake_case
- [x] All PKs/FKs are uuid
- [x] Ownership (`casino_id`) on all casino-scoped tables
- [x] Schema invariants documented per service
- [x] Cross-context consumption rules defined
- [x] Full DDL deferred to migrations
- [x] Implementation patterns deferred to SLAD
- [x] Error codes deferred to ERROR_TAXONOMY
- [x] RLS templates deferred to SEC-001

---

**Document Version**: 4.8.0
**Created**: 2025-10-21
**Reduced**: 2025-12-06
**Updated**: 2025-12-23 (ADR-022 v7.1 — MVP Scope, player_identity Planned)
**Status**: CANONICAL - Registry + Invariants Only
