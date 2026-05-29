---
id: ARCH-SRM
title: Service Responsibility Matrix - Bounded Context Registry
nsversion: 4.27.0
status: CANONICAL
effective: 2026-05-29
schema_sha: efd5cd6d079a9a794e72bcf1348e9ef6cb1753e6
source_of_truth:
  - database schema (supabase/migrations/)
  - docs/30-security/SEC-001-rls-policy-matrix.md
  - docs/30-security/SEC-002-casino-scoped-security-model.md
  - docs/25-api-data/DTO_CANONICAL_STANDARD.md
  - docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md
  - docs/70-governance/ERROR_HANDLING_STANDARD.md
  - docs/20-architecture/EDGE_TRANSPORT_POLICY.md
  - docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md
  - docs/80-adrs/ADR-017-cashier-role-implementation.md
  - docs/80-adrs/ADR-018-security-definer-governance.md
  - docs/80-adrs/ADR-023-multi-tenancy-storage-model-selection.md
  - docs/80-adrs/ADR-030-auth-system-hardening.md
  - docs/80-adrs/ADR-032-frontend-error-boundary-architecture.md
  - docs/80-adrs/ADR-035-client-state-lifecycle-auth-transitions.md
  - docs/80-adrs/ADR-039-measurement-layer.md
  - docs/80-adrs/ADR-042-player-exclusion-architecture.md
  - docs/80-adrs/ADR-052-financial-fact-model-dual-layer.md
  - docs/80-adrs/ADR-053-financial-system-scope-boundary.md
  - docs/80-adrs/ADR-054-financial-event-propagation-surface-contract.md
  - docs/80-adrs/ADR-055-cross-class-authoring-parity.md
  - docs/80-adrs/ADR-056-relay-worker-execution-environment.md
  - docs/archive/player-enrollment-specs/ADR-022_Player_Identity_Enrollment_ARCH_v7.md
  - docs/80-adrs/ADR-022_Player_Identity_Enrollment_DECISIONS.md
  - docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md
changelog: docs/20-architecture/SRM-CHANGE-LOG.md
---

# Service Responsibility Matrix - Bounded Context Registry (CANONICAL)

> **Version**: 4.27.0 (SRL companion reference)
> **Date**: 2026-05-29
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

**Semantic Responsibility Reference:**
Semantic authority is governed by the companion Semantic Responsibility Layer (SRL)
at `docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md`. SRL entries must bind to
an SRM-owned service, bounded context, or subdomain. A canonical term without an SRM
owner is invalid. SRM does not inline full semantic responsibility records; it registers
admitted semantic extensions by reference only.

---

## Change Log

See [SRM-CHANGE-LOG.md](SRM-CHANGE-LOG.md) for full version history (v3.0.2 → current).

---

## Contract Policy (Canonical)

| Policy              | Requirement                                            | Reference                                             |
| ------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| **Source of truth** | This SRM for ownership; migrations for DDL             | `supabase/migrations/`                                |
| **Naming**          | `lower_snake_case` for tables/columns/enums            | —                                                     |
| **Identifiers**     | `uuid` for all PKs/FKs                                 | —                                                     |
| **JSON**            | Allowed only for extensible metadata                   | See JSON Exceptions below                             |
| **Ownership**       | `casino_id` required on all operational tables         | —                                                     |
| **RLS**             | Policies derive from SRM ownership                     | `docs/30-security/SEC-001-rls-policy-matrix.md`       |
| **Edge transport**  | Server Actions/Route Handlers via `withServerAction()` | `docs/20-architecture/EDGE_TRANSPORT_POLICY.md`       |
| **DTOs**            | Contract-first with mappers for Pattern A              | `docs/25-api-data/DTO_CANONICAL_STANDARD.md`          |
| **Error handling**  | Domain errors, no Postgres leakage                     | `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md` |
| **Idempotency**     | `x-idempotency-key` required on mutations              | `docs/20-architecture/EDGE_TRANSPORT_POLICY.md`       |

### JSON Metadata Exceptions

Approved JSON blobs (all others require first-class columns):

- `table_*` chipset payloads
- `rating_slip.policy_snapshot`
- `rating_slip.game_settings`
- `floor_layout*` geometry/metadata
- `player_loyalty.preferences`

---

## Service Responsibility Overview

| Domain           | Service                 | Owns Tables                                                                                                                | Bounded Context                                             |
| ---------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Foundational** | CasinoService           | casino, casino_settings, company, staff, game_settings, audit_log, report, **player_casino**, gaming_day_lifecycle ¹¹, _staff_pin_attempts_ ⁴ | Root temporal authority, global policy, & player enrollment |
| **Identity**     | PlayerService           | player, **player_exclusion** ⁶, _player_identity_ ², _player_note_ ³, _player_tag_ ³                                       | Identity management & collaboration artifacts               |
| **Analytics**    | PlayerTimelineService ³ | (read-only view across all services)                                                                                       | Unified player interaction timeline                         |
| **Operational**  | TableContextService     | gaming_table, gaming_table_settings, dealer_rotation, table_inventory_snapshot, table_fill, table_credit, table_drop_event, table_session, table_opening_attestation, table_rundown_report, shift_checkpoint | Table lifecycle & operational telemetry                     |
| **Operational**  | FloorLayoutService      | floor_layout, floor_layout_version, floor_pit, floor_table_slot, floor_layout_activation                                   | Floor design & activation                                   |
| **Operational**  | VisitService            | visit                                                                                                                      | Session lifecycle (3 archetypes)                            |
| **Operational**  | ShiftIntelligenceService | table_metric_baseline, shift_alert, alert_acknowledgment                                                                  | Shift anomaly detection, rolling baselines & alert maturity |
| **Telemetry**    | RatingSlipService       | rating_slip, rating_slip_pause, pit_cash_observation                                                                       | Gameplay measurement                                        |
| **Reward**       | LoyaltyService          | player_loyalty, loyalty_ledger, loyalty_outbox, promo_program, promo_coupon, reward_catalog, reward_price_points, reward_entitlement_tier, reward_limits, reward_eligibility, loyalty_earn_config | Reward policy & assignment                                  |
| **Finance**      | PlayerFinancialService  | player_financial_transaction, finance_outbox ¹, processed_messages ¹², visit_class_a_projection ¹³, shift_operational_projection ¹⁰ | Financial ledger (SoT) + Wave 2 transport/projection infrastructure |
| **Compliance**   | MTLService              | mtl_entry, mtl_audit_note                                                                                                  | AML/CTR compliance                                          |
| **Onboarding**   | PlayerImportService     | import_batch, import_row                                                                                                   | CSV player import & staging ⁵                               |
| **Analytics**    | Player360DashboardService ⁷ | (read-only aggregation across LoyaltyService + PromoService)                                                          | Player 360 dashboard data aggregation                       |
| **Operational**  | EmailService ⁸          | email_send_attempt                                                                                                         | Pilot email delivery & send attempt logging                 |
| **Access Governance** | PilotContainmentService ⁹ | pilot_access_requests, approved_email_allowlist                                                                       | Pilot access governance — allowlist-gated magic-link auth   |

> ¹ `finance_outbox` is Wave 2 Projection Input transport infrastructure governed by ADR-052 through ADR-056. It stores immutable semantic envelopes for finance-owned propagation; it is not an external payment/event-bus boundary. The prior ADR-016 post-MVP placeholder is superseded.
> ² `player_identity` is **planned (MVP)** per ADR-022 v7.1. `player_tax_identity` and scanner integration (`player_identity_scan`) are **deferred post-MVP**.
> ³ `player_note`, `player_tag`, and `PlayerTimelineService` are **planned (MVP)** per ADR-029. These enable the Player 360° Dashboard CRM timeline.
> ⁴ `staff_pin_attempts` is **planned (MVP)** per GAP-SIGN-OUT. Operational rate-limit state for staff PIN verification. Follows `audit_log` precedent: cross-cutting operational data owned by foundational context. Both FKs reference CasinoService tables (`staff`, `casino`).
> ⁵ PlayerImportService owns staging tables only. Cross-context writes to `player` (PlayerService) and `player_casino` (CasinoService) via `rpc_import_execute` SECURITY DEFINER RPC. See ADR-036.
> ⁶ `player_exclusion` — Source-of-truth for exclusion/ban/watchlist records (ADR-042). Critical table per ADR-030 D4 (session-var-only writes). Enforcement delegated to downstream consumers. Property-scoped MVP; company-wide deferred.
> ⁷ `Player360DashboardService` is a read-only aggregation service (follows `PlayerTimelineService` precedent). Owns no tables; reads from LoyaltyService (`loyalty_ledger`, `promo_coupon`) for reward history display. See PRD-052.
> ⁸ `EmailService` is a pilot-scoped utility service. Owns `email_send_attempt` (append-only send log). May be absorbed into a broader operational context if email scope grows post-pilot. See PRD-062.
> ⁹ `PilotContainmentService` is a pilot containment primitive. Owns `pilot_access_requests` and `approved_email_allowlist`. All allowlist reads are server-only (service_role) — never exposed to client-side queries. Admin operations guarded by `PILOT_ADMIN_EMAILS` env var. Scope is strictly containment; expansion requires a separate FIB (FIB-S RULE-9). See PRD-083.
> ¹⁰ `shift_operational_projection` is a Wave 2 projection store populated from `finance_outbox` operational events (`grind.observed`, `fill.recorded`, `credit.recorded`). It is not an authoring table and is service-role-only. TableContextService remains source-of-truth owner for operational authoring tables; PlayerFinancialService owns the outbox consumer projection boundary.
> ¹¹ `gaming_day_lifecycle` is a foundational temporal close-signal store. Finance projections may consume it for completeness derivation, but PlayerFinancialService does not own the gaming-day lifecycle authority.
> ¹² `processed_messages` is the Wave 2 consumer idempotency store for `finance_outbox`. It is service-role-only and records relay receipt atomicity; it is not domain authoring state.
> ¹³ `visit_class_a_projection` is a Wave 2 projection artifact derived from Class A ledger Projection Inputs. It is rebuildable projection state and does not supersede `player_financial_transaction` as source of truth.

---

## CasinoService (Foundational Context)

**Owns**: `casino`, `casino_settings`, `company`, `staff`, `game_settings`, `audit_log`, `report`, `player_casino`, `gaming_day_lifecycle` ¹¹

**Planned (MVP)** per GAP-SIGN-OUT: `staff_pin_attempts`

**Bounded Context**: "What are the operational parameters and policy boundaries of this casino property? Which players are enrolled?"

**Note**: Player enrollment (`player_casino`) is owned by CasinoService per ADR-022 D5.
**Note**: `staff_pin_attempts` is operational rate-limit state for staff PIN verification. Follows `audit_log` precedent — cross-cutting operational data owned by foundational context.

### Schema Invariants

| Table                  | Column                           | Constraint                | Notes                                     |
| ---------------------- | -------------------------------- | ------------------------- | ----------------------------------------- |
| `casino_settings`      | `casino_id`                      | NOT NULL, UNIQUE          | 1:1 with casino                           |
| `casino_settings`      | `gaming_day_start_time`          | NOT NULL, default '06:00' | Temporal authority                        |
| `casino_settings`      | `timezone`                       | NOT NULL                  | Required for gaming day calc              |
| `casino_settings`      | `promo_require_exact_match`      | NOT NULL, default true    | Promo policy control                      |
| `casino_settings`      | `promo_allow_anonymous_issuance` | NOT NULL, default true    | Promo policy control                      |
| `staff`                | `user_id`                        | references auth.users(id) | Auth linkage (NULL for dealers)           |
| `staff`                | `role`                           | NOT NULL, enum            | No default; explicit assignment           |
| `staff`                | `casino_id`                      | references casino(id)     | Casino scoping                            |
| `staff_pin_attempts` ⁴ | `casino_id`                      | NOT NULL, FK to casino    | Casino scoping                            |
| `staff_pin_attempts` ⁴ | `staff_id`                       | NOT NULL, FK to staff     | Staff reference                           |
| `staff_pin_attempts` ⁴ | `window_start`                   | NOT NULL                  | 15-min bucketed window (computed by RPC)  |
| `staff_pin_attempts` ⁴ | —                                | UNIQUE                    | (`casino_id`, `staff_id`, `window_start`) |
| `gaming_day_lifecycle` ¹¹ | `(casino_id, gaming_day)`      | PRIMARY KEY               | One close signal per casino gaming day    |
| `gaming_day_lifecycle` ¹¹ | `closed_at`                    | NOT NULL                  | Permanent close timestamp for projection completeness |

### Contracts

- **Audit**: `audit_log` for cross-domain event logging (canonical shape: `{ts, actor_id, casino_id, domain, action, dto_before, dto_after, correlation_id}`)
- **Auth**: `staff.user_id` column enables RLS via `auth.uid()` (dealers stay NULL)
- **Temporal close signal**: `gaming_day_lifecycle` records closed gaming days; consuming services may read the signal for completeness, but may not redefine gaming-day lifecycle ownership.

### Cross-Context Consumption

| Consumer     | Consumes Via                                      |
| ------------ | ------------------------------------------------- |
| All services | `getCasinoSettings()` DTO, staff roster endpoints |
| TableContext | Game config templates via DTOs                    |
| MTL          | `gaming_day_start_time`, compliance thresholds    |

**Full Schema**: `supabase/migrations/` (search: `create table casino`)
**RLS Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md#casino`

---

## PlayerService (Identity Context)

**Owns**: `player`, `player_exclusion` ⁶

**Planned (MVP)** per ADR-022 v7.1: `player_identity`

**Note**: `player_casino` enrollment is owned by CasinoService (ADR-022 D5).

**Deferred (Post-MVP)**: `player_tax_identity`, `player_identity_scan`

**Bounded Context**: "Who is this player, where are they enrolled, what is their verified identity, and are they excluded or restricted?"

### Schema Invariants (Implemented)

| Table           | Column                    | Constraint                 | Notes             |
| --------------- | ------------------------- | -------------------------- | ----------------- |
| `player`        | `id`                      | PK, uuid                   | Immutable         |
| `player`        | `first_name`, `last_name` | NOT NULL                   | Required identity |
| `player_casino` | PK                        | (`player_id`, `casino_id`) | Composite key     |
| `player_casino` | `status`                  | default 'active'           | Enrollment status |

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

**MVP (ADR-042):**

- Source-of-truth for exclusion/ban/watchlist records via `player_exclusion`
- Canonical SQL functions: `is_exclusion_active()`, `get_player_exclusion_status()`
- RPC: `rpc_get_player_exclusion_status(p_player_id)` — SECURITY DEFINER, derives casino_id from context (ADR-024)
- Enforcement delegated to downstream consumers at their write boundaries

**Deferred (Post-MVP — Tax Identity):**

- `player_has_tax_id_on_file(player_id)` — Boolean contract for Finance/MTL
- `reveal_tax_id(player_id, reason_code, request_id)` — Audited SSN reveal
- CTR threshold enforcement via Finance/MTL

### Cross-Context Consumption

| Consumer       | Consumes Via                                                   |
| -------------- | -------------------------------------------------------------- |
| VisitService   | Player DTOs for session creation; exclusion status for visit enforcement (ADR-042) |
| LoyaltyService | Player identity for rewards                                    |
| FinanceService | Player identity for transactions                               |
| MTLService     | `player_has_tax_id_on_file` contract (**post-MVP**)            |

**Full Schema**: `supabase/migrations/` (search: `create table player`)
**RLS Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md#player-visit`
**ADR**: `docs/80-adrs/ADR-022_Player_Identity_Enrollment_DECISIONS.md`, `docs/80-adrs/ADR-042-player-exclusion-architecture.md`
**Exec Spec**: `docs/20-architecture/specs/ADR-022/EXEC-SPEC-022.md`, `docs/21-exec-spec/EXEC-050-player-exclusion-watchlist.md`
**DoD Gates**: `docs/20-architecture/specs/ADR-022/DOD-022.md`

---

## PlayerTimelineService (Analytics Context) — PLANNED

**Owns**: `player_note`, `player_tag` (tables), `rpc_get_player_timeline` (RPC)

**Reads From**: All services (via UNION ALL view)

**Bounded Context**: "What is the complete history of interactions for this player?"

**Implementation Status**: Planned (ADR-029, Player 360° Dashboard MVP)

### New Tables (Planned)

| Table         | Column         | Constraint      | Notes                                   |
| ------------- | -------------- | --------------- | --------------------------------------- |
| `player_note` | `casino_id`    | NOT NULL        | Casino scoping                          |
| `player_note` | `player_id`    | NOT NULL, FK    | Player reference                        |
| `player_note` | `created_by`   | NOT NULL, FK    | Staff author                            |
| `player_note` | `content`      | NOT NULL        | Note text                               |
| `player_note` | `visibility`   | NOT NULL, CHECK | 'private', 'team', 'all'                |
| `player_tag`  | `casino_id`    | NOT NULL        | Casino scoping                          |
| `player_tag`  | `player_id`    | NOT NULL, FK    | Player reference                        |
| `player_tag`  | `tag_name`     | NOT NULL        | Tag identifier                          |
| `player_tag`  | `tag_category` | NOT NULL, CHECK | 'vip', 'attention', 'service', 'custom' |
| `player_tag`  | `applied_by`   | NOT NULL, FK    | Staff who applied                       |
| `player_tag`  | `removed_at`   | NULLABLE        | Soft-delete timestamp                   |

### Event Types (interaction_event_type enum)

Session: `visit_start`, `visit_end`, `visit_resume`
Gaming: `rating_start`, `rating_pause`, `rating_resume`, `rating_close`, `rating_move`
Financial: `cash_in`, `cash_out`, `cash_observation`, `financial_adjustment`
Loyalty: `points_earned`, `points_redeemed`, `points_adjusted`, `promo_issued`, `promo_redeemed`
Collaboration: `note_added`, `tag_applied`, `tag_removed`
Compliance: `mtl_recorded`, `ctr_threshold`
Identity: `player_enrolled`, `identity_verified`

### Contracts

- **RPC**: `rpc_get_player_timeline` — Unified timeline with keyset pagination
- **Read-only**: This service reads from all other services; no cross-service writes
- **Event Taxonomy**: See `docs/25-api-data/PLAYER_360_EVENT_TAXONOMY.md`

### Cross-Context Consumption

| Consumer              | Consumes Via                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PlayerTimelineService | Reads from: visit, rating_slip, loyalty_ledger, player_financial_transaction, mtl_entry, pit_cash_observation, promo_coupon, player_casino, player_identity |

**ADR**: `docs/80-adrs/ADR-029-player-360-interaction-event-taxonomy.md`
**Event Taxonomy**: `docs/25-api-data/PLAYER_360_EVENT_TAXONOMY.md`

---

## VisitService (Operational Session Context)

**Owns**: `visit`

**Bounded Context**: "What is this patron doing at the casino right now?"

### Visit Archetypes

| `visit_kind`              | Identity      | Gaming | Loyalty          | Use Case                     |
| ------------------------- | ------------- | ------ | ---------------- | ---------------------------- |
| `reward_identified`       | Player exists | No     | Redemptions only | Comps, vouchers              |
| `gaming_identified_rated` | Player exists | Yes    | Accrual eligible | Standard rated play          |
| `gaming_ghost_unrated`    | No player     | Yes    | Compliance only  | Ghost gaming for finance/MTL |

### Schema Invariants

| Table   | Column       | Constraint       | Notes                                                            |
| ------- | ------------ | ---------------- | ---------------------------------------------------------------- |
| `visit` | `casino_id`  | NOT NULL         | Casino scoping                                                   |
| `visit` | `player_id`  | NULLABLE         | NULL only for ghost visits                                       |
| `visit` | `visit_kind` | NOT NULL, enum   | Determines player_id requirement                                 |
| `visit` | —            | CHECK constraint | `chk_visit_kind_player_presence` enforces ghost/player invariant |

### Contracts

- **Partial unique index**: `uq_visit_single_active_identified` ensures one active visit per identified player per casino

### Cross-Context Consumption

| Consumer          | Consumes Via                                     |
| ----------------- | ------------------------------------------------ |
| RatingSlipService | `visit_id` FK (NOT NULL)                         |
| LoyaltyService    | Visit DTOs, `visit_kind` for accrual eligibility |
| FinanceService    | `visit_id` FK (**required for MVP**)             |
| MTLService        | `visit_id` FK (optional)                         |

**Full Schema**: `supabase/migrations/` (search: `create table visit`)
**RLS Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md#player-visit`

---

## RatingSlipService (Telemetry Context)

**Owns**: `rating_slip`, `rating_slip_pause`, `pit_cash_observation`

**Bounded Context**: "What gameplay activity occurred?"

### Schema Invariants (CRITICAL)

| Table                  | Column                | Constraint               | Notes                                       |
| ---------------------- | --------------------- | ------------------------ | ------------------------------------------- |
| `rating_slip`          | `casino_id`           | NOT NULL, immutable      | Casino scoping                              |
| `rating_slip`          | `visit_id`            | NOT NULL, immutable      | **Always anchored to visit**                |
| `rating_slip`          | `table_id`            | NOT NULL, immutable      | **Always at a table**                       |
| `rating_slip`          | `status`              | NOT NULL, default 'open' | Lifecycle state                             |
| `rating_slip`          | `policy_snapshot`     | JSON                     | Reward policy at creation (immutable)       |
| `rating_slip`          | `start_time`          | NOT NULL, immutable      | Session start                               |
| `rating_slip_pause`    | `rating_slip_id`      | NOT NULL, FK             | Parent slip reference                       |
| `rating_slip_pause`    | `casino_id`           | NOT NULL, FK             | Casino scoping (RLS)                        |
| `rating_slip_pause`    | `started_at`          | NOT NULL, default now()  | Pause start timestamp                       |
| `rating_slip_pause`    | `ended_at`            | NULLABLE                 | NULL = currently paused                     |
| `rating_slip_pause`    | `created_by`          | FK to staff              | Actor tracking                              |
| `rating_slip_pause`    | —                     | CHECK constraint         | `ended_at IS NULL OR ended_at > started_at` |
| `pit_cash_observation` | `casino_id`           | NOT NULL, immutable      | Casino scoping                              |
| `pit_cash_observation` | `visit_id`            | NOT NULL, immutable      | Visit-scoped telemetry                      |
| `pit_cash_observation` | `observed_at`         | NOT NULL                 | Observation timestamp                       |
| `pit_cash_observation` | `amount`              | CHECK constraint         | `amount > 0`                                |
| `pit_cash_observation` | `created_by_staff_id` | FK to staff              | Actor tracking                              |
| `rating_slip`          | `legacy_theo_cents`   | NULLABLE bigint          | ADR-039: Legacy-reported theo in cents. Set once at import, immutable. Transitional. |
| `rating_slip`          | `computed_theo_cents`  | NULLABLE bigint          | ADR-039 D3: Deterministic theo in cents via `calculate_theo_from_snapshot`. Set once at close, immutable. |
| `rating_slip`          | —                     | CHECK (NOT VALID)        | `chk_closed_slip_has_theo`: `status != 'closed' OR computed_theo_cents IS NOT NULL` |

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

| Consumer       | Consumes Via                        |
| -------------- | ----------------------------------- |
| LoyaltyService | `rating_slip_id` FK, telemetry DTOs |
| FinanceService | `rating_slip_id` FK (optional)      |
| MTLService     | `rating_slip_id` FK (optional)      |

**Full Schema**: `supabase/migrations/` (search: `create table rating_slip`)
**RLS Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md#ratingslipservice`

---

## LoyaltyService (Reward Context)

**Owns**: `player_loyalty`, `loyalty_ledger`, `loyalty_outbox`, `promo_program`, `promo_coupon`, `loyalty_valuation_policy`, `loyalty_liability_snapshot`, `reward_catalog`, `reward_price_points`, `reward_entitlement_tier`, `reward_limits`, `reward_eligibility`, `loyalty_earn_config`

**Bounded Context**: "What is this gameplay worth in rewards, and what promotional instruments have been issued?"

**Canonical Stance**: Loyalty is the sole source of truth for rewards. RatingSlip stores telemetry only.

### Schema Invariants

| Table            | Column            | Constraint                 | Notes                 |
| ---------------- | ----------------- | -------------------------- | --------------------- |
| `player_loyalty` | PK                | (`player_id`, `casino_id`) | Composite key         |
| `player_loyalty` | `balance`         | NOT NULL, default 0        | Current points        |
| `loyalty_ledger` | `casino_id`       | NOT NULL                   | Casino scoping        |
| `loyalty_ledger` | `player_id`       | NOT NULL                   | Who earned points     |
| `loyalty_ledger` | `idempotency_key` | UNIQUE (partial)           | Prevents double-spend |
| `loyalty_ledger` | `points_earned`   | NOT NULL                   | Amount issued         |
| `loyalty_ledger` | `reason`          | NOT NULL, enum             | `loyalty_reason` type |
| `loyalty_valuation_policy` | `casino_id`   | NOT NULL, FK          | Casino scoping        |
| `loyalty_valuation_policy` | `cents_per_point` | NOT NULL, CHECK > 0 | Valuation rate        |
| `loyalty_valuation_policy` | `effective_date` | NOT NULL             | Policy effective date |
| `loyalty_valuation_policy` | `is_active`   | NOT NULL, default false    | One active per casino (partial unique index) |
| `loyalty_liability_snapshot` | `casino_id` | NOT NULL, FK           | Casino scoping        |
| `loyalty_liability_snapshot` | `snapshot_date` | NOT NULL            | UNIQUE with casino_id |
| `loyalty_liability_snapshot` | `total_outstanding_points` | NOT NULL bigint | Aggregate points |
| `loyalty_liability_snapshot` | `estimated_monetary_value_cents` | NOT NULL bigint | ADR-031 cents |

### Contracts

- **RPC**: `rpc_issue_mid_session_reward` - atomic ledger + balance update
- **RPC**: `rpc_snapshot_loyalty_liability` - SECURITY DEFINER (ADR-024), idempotent UPSERT per (casino_id, snapshot_date)
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

**Owns**: `gaming_table`, `gaming_table_settings`, `dealer_rotation`, `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_drop_event`, `table_session`, `table_opening_attestation`, `table_rundown_report`, `shift_checkpoint`

**Bounded Context**: "What is the operational state and chip custody posture of this gaming table?"

### Service Layer Modules

| Module             | Purpose                                                              | ADR Reference                   |
| ------------------ | -------------------------------------------------------------------- | ------------------------------- |
| `dtos.ts`          | Type aliases: `TableAvailability`, `SessionPhase`, `TableSessionDTO` | ADR-028 D5                      |
| `labels.ts`        | UI label/color constants for status enums                            | ADR-028 D6                      |
| `table-session.ts` | Session lifecycle operations (OPEN→ACTIVE→RUNDOWN→CLOSED)            | PRD-TABLE-SESSION-LIFECYCLE-MVP |

### Type Aliases (ADR-028 D5)

```typescript
/** Physical table availability (gaming_table.status) */
export type TableAvailability = Database['public']['Enums']['table_status'];
// Values: 'inactive' | 'active' | 'closed'

/** Session lifecycle phase (table_session.status) */
export type SessionPhase = Database['public']['Enums']['table_session_status'];
// Values: 'OPEN' | 'ACTIVE' | 'RUNDOWN' | 'CLOSED'
```

### UI Labels (ADR-028 D6)

| Enum                   | DB Value   | UI Label         | Color |
| ---------------------- | ---------- | ---------------- | ----- |
| `table_status`         | `inactive` | "Idle"           | Gray  |
| `table_status`         | `active`   | "Available"      | Green |
| `table_status`         | `closed`   | "Decommissioned" | Red   |
| `table_session_status` | `OPEN`     | "Opening"        | Blue  |
| `table_session_status` | `ACTIVE`   | "In Play"        | Green |
| `table_session_status` | `RUNDOWN`  | "Rundown"        | Amber |
| `table_session_status` | `CLOSED`   | "Closed"         | Gray  |

### Schema Invariants

| Table           | Column            | Constraint     | Notes                                         |
| --------------- | ----------------- | -------------- | --------------------------------------------- |
| `gaming_table`  | `casino_id`       | NOT NULL       | Casino scoping                                |
| `gaming_table`  | `label`           | NOT NULL       | Table identifier                              |
| `gaming_table`  | `type`            | NOT NULL, enum | `game_type`                                   |
| `gaming_table`  | `status`          | NOT NULL, enum | `table_status`                                |
| `table_fill`    | `request_id`      | NOT NULL       | Idempotency key                               |
| `table_fill`    | —                 | UNIQUE         | (`casino_id`, `request_id`)                   |
| `table_credit`  | `request_id`      | NOT NULL       | Idempotency key                               |
| `table_credit`  | —                 | UNIQUE         | (`casino_id`, `request_id`)                   |
| `table_session` | `casino_id`       | NOT NULL       | Casino scoping                                |
| `table_session` | `gaming_table_id` | NOT NULL       | Table reference                               |
| `table_session` | `status`          | NOT NULL, enum | `table_session_status`                        |
| `table_session` | `drop_posted_at`  | NULLABLE       | Timestamp when soft count posted (ADR-028 D7) |
| `table_session` | `close_reason`    | NULLABLE, enum | `close_reason_type` (PRD-038A Gap B)          |
| `table_session` | `close_note`      | NULLABLE       | Free-text note (required when close_reason='other') |
| `table_session` | `has_unresolved_items` | NOT NULL DEFAULT false | Write: Finance/MTL only. Read: TableContext (PRD-038A Gap A) |
| `table_session` | `requires_reconciliation` | NOT NULL DEFAULT false | Set by `rpc_force_close_table_session` only (PRD-038A) |
| `table_session` | `activated_by_staff_id` | NULLABLE, FK | Deferred until activate RPC exists (PRD-038A Gap C) |
| `table_session` | `paused_by_staff_id` | NULLABLE, FK | Forward-compatible (PRD-038A Gap C)           |
| `table_session` | `resumed_by_staff_id` | NULLABLE, FK | Forward-compatible (PRD-038A Gap C)           |
| `table_session` | `rolled_over_by_staff_id` | NULLABLE, FK | Forward-compatible (PRD-038A Gap C)           |
| `table_session` | `crossed_gaming_day` | NOT NULL DEFAULT false | Rollover provenance flag (PRD-038A Gap E)     |
| `table_session` | —                 | CHECK          | `close_reason IS DISTINCT FROM 'other' OR length(trim(close_note)) > 0` |
| `table_fill`    | `status`          | NOT NULL, CHECK | `'requested'` / `'confirmed'` (PRD-033)       |
| `table_fill`    | `confirmed_at`    | NULLABLE       | Cashier confirmation timestamp (PRD-033)      |
| `table_fill`    | `confirmed_by`    | NULLABLE, FK   | Staff who confirmed (PRD-033)                 |
| `table_fill`    | `confirmed_amount_cents` | NULLABLE | Actual amount confirmed (PRD-033)             |
| `table_fill`    | `discrepancy_note`| NULLABLE       | Note when amounts differ (PRD-033)            |
| `table_credit`  | `status`          | NOT NULL, CHECK | `'requested'` / `'confirmed'` (PRD-033)       |
| `table_credit`  | `confirmed_at`    | NULLABLE       | Cashier confirmation timestamp (PRD-033)      |
| `table_credit`  | `confirmed_by`    | NULLABLE, FK   | Staff who confirmed (PRD-033)                 |
| `table_credit`  | `confirmed_amount_cents` | NULLABLE | Actual amount confirmed (PRD-033)             |
| `table_credit`  | `discrepancy_note`| NULLABLE       | Note when amounts differ (PRD-033)            |
| `table_drop_event` | `cage_received_at` | NULLABLE    | Cage receipt timestamp (PRD-033)              |
| `table_drop_event` | `cage_received_by` | NULLABLE, FK | Staff who acknowledged (PRD-033)              |

### Cashier Confirmation RPCs (PRD-033)

| RPC | Security | Role Gate | Description |
| --- | -------- | --------- | ----------- |
| `rpc_confirm_table_fill` | SECURITY DEFINER, ADR-024 | cashier, admin | Transition fill `requested` → `confirmed` |
| `rpc_confirm_table_credit` | SECURITY DEFINER, ADR-024 | cashier, admin | Transition credit `requested` → `confirmed` |
| `rpc_acknowledge_drop_received` | SECURITY DEFINER, ADR-024 | cashier, admin | Stamp drop `cage_received_at` |

### Close Guardrail RPCs (PRD-038A)

| RPC | Security | Role Gate | Description |
| --- | -------- | --------- | ----------- |
| `rpc_close_table_session` | SECURITY DEFINER, ADR-024 | pit_boss, admin | Close with guardrail: blocks if `has_unresolved_items=true`. Accepts `close_reason`/`close_note`. |
| `rpc_force_close_table_session` | SECURITY DEFINER, ADR-024 | pit_boss, admin | Privileged force-close: skips unresolved check, sets `requires_reconciliation=true`, emits `audit_log`. |
| `_persist_inline_rundown` | SECURITY INVOKER (internal) | N/A | Shared rundown persistence helper. REVOKE'd from public/anon/authenticated. |

### Cashier Confirmation Routes (PRD-033)

| Method | Path | Description |
| ------ | ---- | ----------- |
| PATCH | `/api/v1/table-context/fills/[id]/confirm` | Confirm fill fulfillment |
| PATCH | `/api/v1/table-context/credits/[id]/confirm` | Confirm credit receipt |
| PATCH | `/api/v1/table-context/drop-events/[id]/acknowledge` | Stamp drop received |
| GET | `/api/v1/table-context/fills?status=&gaming_day=` | List fills with filters |
| GET | `/api/v1/table-context/credits?status=&gaming_day=` | List credits with filters |
| GET | `/api/v1/table-context/drop-events?cage_received=&gaming_day=` | List drops with filters |

### Contracts

- **Availability Gate (ADR-028 D3)**: `rpc_open_table_session` requires `gaming_table.status = 'active'`

- **Chip custody**: Non-monetary tracking (Finance owns monetary ledgers)
- **Layout sync**: Listens for `floor_layout.activated` events
- **Casino validation**: Trigger `assert_table_context_casino()` on settings/rotations
- **Rating slip guard**: Consumes RatingSlipService `hasOpenSlipsForTable` published query for deactivate checks (bounded-context allowlisted)

### Does NOT Own

- Monetary ledgers (Finance)
- CTR/SAR thresholds (MTL)
- Reward ledger (Loyalty)
- Floor design (FloorLayoutService)

### Semantic Extension Reference

TableContextService has one admitted semantic extension:

| ID | Bound Subdomain | Role | Full Record |
|---|---|---|---|
| SRL-TIA-001 | TableContextService.TableInventoryAccounting | Read-time derived semantic authority for table-result values | `docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml` |

**Basis:** ADR-059 (ownership + formula), ADR-060 (drop taxonomy), ADR-061 (session scope)

⚠ `table_buyin_telemetry` is consumed by TableInventoryAccounting as its primary telemetry
input table but is not yet listed in the main Service Responsibility Overview `Owns Tables`
column. This ownership gap must be resolved at TIA PRD preflight or in the PRD itself. Not
blocking for SRL admission.

SRM owns the service/subdomain boundary. SRL owns the semantic records.

**Full Schema**: `supabase/migrations/` (search: `create table gaming_table`)
**RLS Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md#tablecontextservice`
**Post-MVP Extensions**: `docs/20-architecture/SRM_Addendum_TableContext_PostMVP.md`

---

## FloorLayoutService (Design & Activation Context)

**Owns**: `floor_layout`, `floor_layout_version`, `floor_pit`, `floor_table_slot`, `floor_layout_activation`

**Bounded Context**: "What does the gaming floor look like, and which layout is currently active?"

**Security Status (SEC-006)**: ✅ Full RLS coverage implemented (2025-12-12). See ADR-018 for SECURITY DEFINER governance.

### Schema Invariants

| Table                     | Column                  | Constraint     | Notes                                  |
| ------------------------- | ----------------------- | -------------- | -------------------------------------- |
| `floor_layout`            | `casino_id`             | NOT NULL       | Casino scoping                         |
| `floor_layout`            | `status`                | NOT NULL, enum | `floor_layout_status`                  |
| `floor_layout`            | `created_by`            | NOT NULL       | Staff audit                            |
| `floor_layout_version`    | `version_no`            | NOT NULL       | Version number                         |
| `floor_layout_version`    | —                       | UNIQUE         | (`layout_id`, `version_no`)            |
| `floor_layout_activation` | `activation_request_id` | NOT NULL       | Idempotency                            |
| `floor_layout_activation` | —                       | UNIQUE         | (`casino_id`, `activation_request_id`) |

### Contracts

- **Events**: `floor_layout.activated` emitted with layout + version metadata
- **Consumer**: TableContext listens and reconciles table activation state
- **RPCs**: `rpc_create_floor_layout`, `rpc_activate_floor_layout` — SECURITY DEFINER with Template 5 context validation (ADR-018); `rpc_bootstrap_casino_pit_layout` (PRD-068) — SECURITY DEFINER, admin-gated, ADR-024 INV-8 (zero-param, context from JWT via `set_rls_context_from_staff`); see **Onboarding Bootstrap (PRD-068)** below.

### RLS Policy Architecture (SEC-006)

| Table                     | Pattern                               | Notes                                           |
| ------------------------- | ------------------------------------- | ----------------------------------------------- |
| `floor_layout`            | Template 1 (direct `casino_id`)       | Standard hybrid policy                          |
| `floor_layout_activation` | Template 1 (direct `casino_id`)       | Standard hybrid policy                          |
| `floor_layout_version`    | Template 6 (subquery via `layout_id`) | Derives casino from parent                      |
| `floor_pit`               | Template 6 (2-level subquery)         | `layout_version_id` → `layout_id` → `casino_id` |
| `floor_table_slot`        | Template 6 (2-level subquery)         | `layout_version_id` → `layout_id` → `casino_id` |

**Full Schema**: `supabase/migrations/` (search: `create table floor_layout`)
**RLS Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md#floorlayoutservice`
**RLS Migration**: `supabase/migrations/20251212080915_sec006_rls_hardening.sql`

### Onboarding Bootstrap (PRD-068)

**Published method**: `FloorLayoutService.bootstrapCasinoPitLayout()` — zero-param, idempotent materialization of the onboarding pit layout. Returns `BootstrapResult` with `outcome: 'success' | 'already_bootstrapped'`. Invoked from `app/(onboarding)/setup/_actions.ts completeSetupAction` after `rpc_complete_casino_setup` succeeds.

**RPC**: `rpc_bootstrap_casino_pit_layout` — SECURITY DEFINER, admin-role gated. Context derived from JWT via `set_rls_context_from_staff()` (ADR-024 INV-8); no casino/actor params accepted. Uses fixed `activation_request_id = 'prd068_pit_bootstrap_v1'` as a secondary idempotency guard behind the partial unique index on `floor_layout_activation(casino_id) WHERE deactivated_at IS NULL`.

**Schema invariants added (migration `20260422183640`)**:

| Index                                             | Target                                                                    | Enforces                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------- |
| `ux_floor_layout_activation_active_per_casino`    | `floor_layout_activation(casino_id) WHERE deactivated_at IS NULL`         | Exactly one active activation per casino (RULE-7) |
| `ux_floor_pit_layout_version_label_lower`         | `floor_pit(layout_version_id, lower(label))`                              | Deterministic pit-label normalization (RULE-2)    |

**OnboardingService containment**: **OnboardingService is a trigger host, not a bounded context.** The onboarding setup server action composes `bootstrapCasinoPitLayout` (this service) and `rpc_complete_casino_setup` (CasinoService) as post-setup side effects. There is **no `services/onboarding/` directory** — PRD-068 §2.3 and FIB-S `zachman.where.bounded_contexts` both label it as a trigger host. Introducing an SRM service entry for onboarding wiring would create a phantom bounded context and violate PRD §2.3 ("no new bounded context").

**Observability**: The RPC emits `RAISE LOG 'PRD-068 bootstrap (<outcome>): casino=... version=... pits=... slots=... unassigned=...'` on both success and `already_bootstrapped` paths. The server action also emits a structured `[PRD-068:bootstrap]` console event for Vercel log aggregation. Bootstrap counts appear in logs only — `CompleteSetupResult` is byte-identical pre/post this hook (DEC-004).

**References**: `docs/10-prd/PRD-068-pit-bootstrap-onboarding-materialization-v0.md`, `docs/21-exec-spec/EXEC-068-pit-bootstrap-onboarding-materialization.md`.

---

## PlayerFinancialService (Finance Context) ✅ IMPLEMENTED

**Owns**: `player_financial_transaction`, `finance_outbox` ¹, `processed_messages` ¹², `visit_class_a_projection` ¹³, `shift_operational_projection` ¹⁰

**Bounded Context**: "Which monetary authority facts exist, and how do finance-owned Projection Inputs and projection artifacts propagate to internal surfaces?"

**Implementation Status** (PRD-009, 2025-12-11):

- **Pattern**: A (Contract-First with manual DTOs)
- **Service Layer**: `services/player-financial/` (dtos, schemas, keys, mappers, crud, http, index)
- **Transport**: 3 Route Handlers (`/api/v1/financial-transactions/**`, `/api/v1/visits/[visitId]/financial-summary`)
- **Hooks**: 4 React Query hooks (`hooks/player-financial/`)
- **Tests**: 78 tests (mappers: 44, service: 17, RLS integration: 17)

### Role Capabilities (ADR-017)

| Role         | Read | Write (via RPC) | Constraints                                                                                  |
| ------------ | ---- | --------------- | -------------------------------------------------------------------------------------------- |
| `admin`      | ✅   | ✅ Full access  | —                                                                                            |
| `cashier`    | ✅   | ✅ Full access  | Cage operations: cash-outs, marker settlements                                               |
| `pit_boss`   | ✅   | ⚠️ Limited      | Table buy-ins only: `direction='in'`, `tender_type IN ('cash','chips')`, `visit_id` required |
| `compliance` | ✅   | ❌              | Read-only for audit                                                                          |
| `dealer`     | ❌   | ❌              | No access                                                                                    |

### Schema Invariants

| Table                          | Column                   | Constraint          | Notes                                               |
| ------------------------------ | ------------------------ | ------------------- | --------------------------------------------------- |
| `player_financial_transaction` | `player_id`              | NOT NULL            | Transaction owner                                   |
| `player_financial_transaction` | `casino_id`              | NOT NULL            | Casino scoping                                      |
| `player_financial_transaction` | `visit_id`               | **NOT NULL**        | **Required for MVP** (prevents orphan transactions) |
| `player_financial_transaction` | `amount`                 | NOT NULL, CHECK > 0 | Always positive                                     |
| `player_financial_transaction` | `direction`              | NOT NULL, enum      | `financial_direction` ('in'\|'out')                 |
| `player_financial_transaction` | `source`                 | NOT NULL, enum      | `financial_source` ('pit'\|'cage'\|'system')        |
| `player_financial_transaction` | `tender_type`            | NOT NULL, enum      | `tender_type` ('cash'\|'chips'\|'marker')           |
| `player_financial_transaction` | `gaming_day`             | Trigger-derived     | From `casino_settings.gaming_day_start_time`        |
| `player_financial_transaction` | `idempotency_key`        | UNIQUE (partial)    | Casino-scoped, prevents duplicates                  |
| `player_financial_transaction` | `created_by`             | NOT NULL, FK        | Staff who created transaction                       |
| `player_financial_transaction` | `notes`                  | NULLABLE            | Optional transaction notes                          |
| `player_financial_transaction` | `related_transaction_id` | NULLABLE, FK        | Self-reference for voids/adjustments                |
| `finance_outbox`              | `event_id`               | PRIMARY KEY         | UUIDv7 generated by authoring boundary; relay/replay ordering authority |
| `finance_outbox`              | `fact_class`             | CHECK               | `ledger` or `operational` per ADR-052 classification |
| `finance_outbox`              | `origin_label`           | CHECK, immutable    | `actual`, `estimated`, `observed`, or `compliance`; no downstream upgrade |
| `finance_outbox`              | `table_id`               | NOT NULL, FK        | Table anchor required for all Wave 2 Projection Inputs |
| `finance_outbox`              | `player_id`              | NULLABLE            | Present only where required by the producing fact class |
| `finance_outbox`              | relay lifecycle columns  | UPDATE-only by relay | `processed_at`, `delivery_attempts`, `last_attempted_at`, `last_error` |
| `processed_messages`          | `message_id`             | PRIMARY KEY         | Matches `finance_outbox.event_id`; global single-consumer idempotency |
| `processed_messages`          | `casino_id`              | NOT NULL, FK        | Casino-scoped receipt; service-role-only access     |
| `visit_class_a_projection`    | `(casino_id, visit_id, gaming_day)` | PRIMARY KEY | One Class A projection artifact row per visit per gaming day |
| `visit_class_a_projection`    | amount columns           | BIGINT NOT NULL DEFAULT 0 | Integer cents only; no floating-point accumulation |
| `shift_operational_projection` | `(casino_id, gaming_day, table_id)` | PRIMARY KEY | One operational projection row per table per gaming day |
| `shift_operational_projection` | `casino_id`              | NOT NULL, FK        | Casino scoping; service-role-only access            |
| `shift_operational_projection` | `table_id`               | NOT NULL, FK        | Table anchor for operational projection             |
| `shift_operational_projection` | amount columns           | BIGINT NOT NULL DEFAULT 0 | Integer cents only; no floating-point accumulation |

### Contracts

- **RPC**: `rpc_create_financial_txn` - canonical write path with idempotency support
- **Role validation**: Hybrid per ADR-015 — RLS policies check `COALESCE(current_setting('app.staff_role', true), auth.jwt()->>'staff_role')` and `COALESCE(current_setting('app.casino_id', true), (auth.jwt()->>'casino_id')::uuid)` to remain pooling-safe. Application layer MUST inject context via transaction-wrapped RPC (or JWT claims) before writes.
- **Trigger**: `trg_fin_gaming_day` populates `gaming_day` (callers MUST omit)
- **Immutability**: Append-only ledger; no deletes
- **View**: `visit_financial_summary` - Aggregated totals per visit (total_in, total_out, net_amount)
- **Internal propagation**: Synchronous ledger writes remain authoritative; Wave 2 internal propagation uses `finance_outbox` Projection Inputs. MTLService integration via triggers.
- **Outbox**: `finance_outbox` stores immutable semantic envelopes governed by ADR-052 through ADR-056. Consumers must treat `origin_label` as immutable and must not collapse ledger and operational facts into a generic financial-event class.
- **Consumer idempotency**: `processed_messages` is the relay receipt store. Consumer side effects and receipt insertion must share the same durable boundary.
- **Projection artifacts**: `visit_class_a_projection` and `shift_operational_projection` are rebuildable projection stores. Consumers may write only projection artifacts and `processed_messages`, not authoring tables.
- **Scope boundary**: Finance projections do not create authoritative totals, reconciliation ledgers, or customer-visible balance authority; `player_financial_transaction` remains the monetary source of truth.

### DTOs (Pattern A - Manual)

| DTO                        | Purpose                            | Location                            |
| -------------------------- | ---------------------------------- | ----------------------------------- |
| `FinancialTransactionDTO`  | Read DTO for transaction details   | `services/player-financial/dtos.ts` |
| `CreateFinancialTxnInput`  | Write DTO for transaction creation | `services/player-financial/dtos.ts` |
| `VisitFinancialSummaryDTO` | Aggregated visit totals            | `services/player-financial/dtos.ts` |
| `ListFinancialTxnFilters`  | Query filters for list operations  | `services/player-financial/dtos.ts` |

**Full Schema**: `supabase/migrations/` (search: `player_financial_transaction`, `finance_outbox`, `processed_messages`, `visit_class_a_projection`, `shift_operational_projection`)
**RLS Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md#playerfinancialservice`

---

## MTLService (Compliance Context)

**Owns**: `mtl_entry`, `mtl_audit_note`

**Bounded Context**: "What cash/monetary transactions occurred for AML/CTR compliance?"

### Schema Invariants

| Table            | Column            | Constraint       | Notes               |
| ---------------- | ----------------- | ---------------- | ------------------- |
| `mtl_entry`      | `patron_uuid`     | NOT NULL         | Player reference    |
| `mtl_entry`      | `casino_id`       | NOT NULL         | Casino scoping      |
| `mtl_entry`      | `amount`          | NOT NULL         | Transaction amount  |
| `mtl_entry`      | `direction`       | NOT NULL         | 'in' or 'out'       |
| `mtl_entry`      | `idempotency_key` | UNIQUE (partial) | Prevents duplicates |
| `mtl_audit_note` | `note`            | NOT NULL         | Audit content       |

### Contracts

- **Immutability**: `mtl_entry` is write-once (append-only)
- **Thresholds**: Watchlist >= $3k, CTR >= $10k (from `casino_settings`)
- **Gaming day**: Computed via trigger from `casino_settings`

**Full Schema**: `supabase/migrations/` (search: `create table mtl_entry`)
**RLS Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md#mtlservice`

---

## PlayerImportService (Onboarding Context)

**Owns**: `import_batch`, `import_row`

**Bounded Context**: "What vendor CSV data has been staged for import, and what was the outcome of the merge?"

### Schema Invariants

| Table          | Column                | Constraint          | Notes                                         |
| -------------- | --------------------- | ------------------- | --------------------------------------------- |
| `import_batch` | `casino_id`           | NOT NULL, FK        | Casino scoping                                |
| `import_batch` | `created_by_staff_id` | NOT NULL, FK        | Actor attribution                             |
| `import_batch` | `idempotency_key`     | NOT NULL            | Idempotency control                           |
| `import_batch` | —                     | UNIQUE              | (`casino_id`, `idempotency_key`)              |
| `import_batch` | `status`              | NOT NULL, enum      | `import_batch_status`                         |
| `import_batch` | `column_mapping`      | jsonb, NOT NULL     | Vendor-to-canonical column mapping            |
| `import_batch` | `report_summary`      | jsonb, NULLABLE     | Populated after execute                       |
| `import_row`   | `batch_id`            | NOT NULL, FK CASCADE| Parent batch reference                        |
| `import_row`   | `casino_id`           | NOT NULL, FK        | Casino scoping                                |
| `import_row`   | —                     | UNIQUE              | (`batch_id`, `row_number`)                    |
| `import_row`   | `status`              | NOT NULL, enum      | `import_row_status`                           |
| `import_row`   | `matched_player_id`   | NULLABLE, FK        | Set for created/linked rows                   |

### RPCs (SECURITY DEFINER, ADR-024)

| RPC | Role Gate | Description |
| --- | --------- | ----------- |
| `rpc_import_create_batch` | admin, pit_boss | Create batch or return existing on idempotency match |
| `rpc_import_stage_rows` | admin, pit_boss | Stage rows with FOR UPDATE lock, 10k cap, ON CONFLICT DO NOTHING |
| `rpc_import_execute` | admin, pit_boss | Execute merge: create/link/conflict with two-phase error pattern |

### Cross-Context Writes

`rpc_import_execute` performs schema-qualified writes to:
- `public.player` (PlayerService) — INSERT new player records
- `public.player_casino` (CasinoService) — INSERT enrollment records

These are the only cross-context writes, performed within a SECURITY DEFINER RPC with full context derivation.

### Contracts

- **Idempotency**: Batch creation idempotent via `(casino_id, idempotency_key)` UNIQUE
- **Staging immutability**: Staged rows are immutable; to correct, create a new batch
- **Execute idempotency**: Re-executing a completed/failed batch returns existing state
- **Batch row limit**: Server-enforced 10,000 row maximum per batch
- **Statement timeout**: Execute RPC bounded at 120s

### Cross-Context Consumption

| Consumer             | Consumes Via                                                |
| -------------------- | ----------------------------------------------------------- |
| PlayerImportService  | `player` (PlayerService) — identifier resolution reads      |
| PlayerImportService  | `player_casino` (CasinoService) — enrollment lookup + write |

**Full Schema**: `supabase/migrations/20260223021214_prd037_csv_player_import_schema.sql`
**RLS Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md#playerimportservice`
**ADR**: `docs/00-vision/csv-import/ADR-036-csv-player-import-strategy.PATCH-DELTA.md`

---

## ShiftIntelligenceService (Operational Context)

**Owns**: `table_metric_baseline`, `shift_alert`, `alert_acknowledgment`

**Bounded Context**: "Are current shift metrics anomalous relative to historical baselines? Are alerts persisted, deduplicated, and acknowledged?"

**Responsibility**: Shift anomaly detection — rolling baselines, persistent alerts, acknowledgment audit trail, alert quality telemetry.

### Schema Invariants

| Table                   | Column      | Constraint | Notes                          |
| ----------------------- | ----------- | ---------- | ------------------------------ |
| `table_metric_baseline` | `casino_id` | NOT NULL   | Casino scoping                 |
| `shift_alert`           | `casino_id` | NOT NULL   | Casino scoping                 |
| `shift_alert`           | `status`    | NOT NULL, CHECK | `open`, `acknowledged`, `resolved` |
| `alert_acknowledgment`  | `casino_id` | NOT NULL   | Casino scoping                 |
| `alert_acknowledgment`  | `alert_id`  | NOT NULL, FK | References shift_alert(id)    |

### RPCs

| RPC                            | Security                     | Description                                           |
| ------------------------------ | ---------------------------- | ----------------------------------------------------- |
| `rpc_compute_rolling_baseline` | SECURITY DEFINER, ADR-024    | Compute rolling baselines from source metric RPCs     |
| `rpc_get_anomaly_alerts`       | SECURITY INVOKER             | Evaluate current metrics against baselines for alerts |
| `rpc_persist_anomaly_alerts`   | SECURITY DEFINER, ADR-024    | UPSERT anomaly alerts with dedup + cooldown           |
| `rpc_acknowledge_alert`        | SECURITY DEFINER, ADR-024    | Role-gated atomic alert acknowledgment                |
| `rpc_get_alert_quality`        | SECURITY INVOKER             | Alert quality telemetry (aggregate stats)             |

### API Surface

| Method | Path                                                | Description                         |
| ------ | --------------------------------------------------- | ----------------------------------- |
| POST   | `/api/v1/shift-intelligence/compute-baselines`      | Trigger baseline computation        |
| GET    | `/api/v1/shift-intelligence/anomaly-alerts`         | Retrieve current anomaly alerts     |
| POST   | `/api/v1/shift-intelligence/persist-alerts`         | Persist anomaly alerts to DB        |
| POST   | `/api/v1/shift-intelligence/acknowledge-alert`      | Acknowledge an alert                |
| GET    | `/api/v1/shift-intelligence/alerts`                 | Retrieve persistent alerts          |

### Business Rules

- **Baseline computation lifecycle**: Rolling baseline windows computed from historical source metrics
- **Anomaly evaluation**: Adaptive alerting against computed baselines
- **Alert persistence**: Forward-only state machine (open → acknowledged → resolved). Dedup via UPSERT on (casino, table, metric, gaming_day). Cooldown suppression (configurable, 5-min floor)
- **Acknowledgment**: Role-gated (pit_boss/admin). Append-only audit trail with actor attribution (ADR-024 INV-8). Idempotent re-ack
- **Alert quality**: Aggregate telemetry (total, acknowledged, false positive, median ack latency)

### Dependencies

| Dependency        | Consumes Via                                                     |
| ----------------- | ---------------------------------------------------------------- |
| TableContextService | `rpc_shift_table_metrics`, `rpc_shift_cash_obs_table` (source metric RPCs) |
| CasinoService     | `casino_settings` (operational config)                           |
| TemporalAuthority | `compute_gaming_day` (gaming day derivation)                     |

### Cross-Context Consumption

| Direction | Context            | Access                                                          |
| --------- | ------------------ | --------------------------------------------------------------- |
| **Reads** | TableContextService | Source metric RPCs (`rpc_shift_table_metrics`, `rpc_shift_cash_obs_table`) |
| **Reads** | CasinoService      | `casino_settings` config                                        |
| **Writes** | (own tables only) | `table_metric_baseline`                                         |

---

## EmailService (Operational Context — Pilot)

**Bounded Context**: "How are business emails (shift reports) delivered and tracked?"

| Attribute | Value |
|-----------|-------|
| **Owns** | `email_send_attempt` |
| **Pattern** | B (HTTP boundary via server actions) |
| **Status** | ✅ IMPLEMENTED (PRD-062, pilot scope) |
| **PRD** | `docs/10-prd/_archive/PRD-062-pilot-smtp-email-wiring-v0.md` |
| **EXEC** | `docs/21-exec-spec/_archive/EXEC-062-pilot-smtp-email-wiring.md` |

### Service Methods

| Method | Description |
|--------|-------------|
| `sendShiftReport(input)` | Send shift report email to casino admins, log attempt |
| `getSendAttempts()` | List all send attempts for casino (RLS-scoped) |
| `getFailedAttempts()` | List actionable failed attempts |
| `getSendAttemptById(id)` | Get single attempt by ID |

### Server Actions

| Action | Location | Description |
|--------|----------|-------------|
| `sendShiftReportAction` | `app/actions/email/send-shift-report.ts` | Send shift report, log attempt |
| `retryShiftReportAction` | `app/actions/email/retry-shift-report.ts` | Retry failed attempt (admin) |
| `dismissFailedAttemptAction` | `app/actions/email/dismiss-failed-attempt.ts` | Dismiss failed attempt (admin) |

### Infrastructure

| Component | Location | Description |
|-----------|----------|-------------|
| `EmailProvider` interface | `lib/email/types.ts` | Provider-agnostic send contract |
| Resend adapter | `lib/email/resend-adapter.ts` | Resend API implementation (contained) |
| Adapter factory | `lib/email/index.ts` | `createEmailProvider()` |

### RLS Policies

| Policy | Operation | Pattern |
|--------|-----------|---------|
| `email_send_attempt_select` | SELECT | Pattern C hybrid (casino-scoped) |
| `email_send_attempt_insert` | INSERT | Pattern C hybrid (casino-scoped) |

No UPDATE or DELETE policies. Append-only log design.

### Cross-Context Dependencies

| Direction | Service | Via |
|-----------|---------|-----|
| **Reads** | CasinoService | `casino` FK on `email_send_attempt` |
| **Writes** | (own table only) | `email_send_attempt` |

---

## PilotContainmentService (Access Governance Context — Pilot)

**Bounded Context**: "Who is authorized to access the pilot, and how is that authorization enforced before and after authentication?"

| Attribute | Value |
|-----------|-------|
| **Owns** | `pilot_access_requests`, `approved_email_allowlist` |
| **Pattern** | B (server actions with service-role client; no HTTP route boundary) |
| **Status** | ✅ IMPLEMENTED (PRD-083, pilot-containment scope) |
| **PRD** | `docs/10-prd/PRD-083-pilot-auth-containment-v0.md` |
| **EXEC** | `docs/21-exec-spec/EXEC-083-pilot-auth-containment.md` |

### Schema Invariants

| Table | Invariant |
|-------|-----------|
| `pilot_access_requests.email` | `CHECK (email = lower(trim(email)))` — canonical form enforced at DB layer |
| `pilot_access_requests.status` | `CHECK (status IN ('pending','approved','rejected'))` |
| `pilot_access_requests` | Partial unique index on `(email) WHERE status = 'pending'` — prevents duplicate pending requests |
| `approved_email_allowlist.email` | `CHECK (email = lower(trim(email)))` — canonical form enforced at DB layer |
| `approved_email_allowlist.status` | `CHECK (status IN ('active','revoked'))` |
| `approved_email_allowlist.expires_at` | Stored but not enforced by application logic in this slice (DEC-3) |

### Server Actions

| Action | Location | Description |
|--------|----------|-------------|
| `sendMagicLinkAction` | `app/actions/auth/send-magic-link.ts` | Allowlist check → `signInWithOtp()`. Fail closed if not approved. Never calls `signUp()`. |
| `requestPilotAccessAction` | `app/actions/auth/request-pilot-access.ts` | Insert pending row. Safe duplicate response for existing pending email. No auth required. |
| `approvePilotAccessAction` | `app/actions/pilot/review-actions.ts` | Admin-only. Upserts allowlist entry (active) + sets request status=approved. Atomic. |
| `rejectPilotAccessAction` | `app/actions/pilot/review-actions.ts` | Admin-only. Sets request status=rejected only. No allowlist mutation. |
| `revokePilotAccessAction` | `app/actions/pilot/review-actions.ts` | Admin-only. Sets allowlist status=revoked. Blocks future OTP issuance and /start passage. |

### RLS Policies

| Table | Policy | Operation | Role | Condition |
|-------|--------|-----------|------|-----------|
| `pilot_access_requests` | `anon_insert_pilot_access_requests` | INSERT | anon | `WITH CHECK (true)` |
| `pilot_access_requests` | (none for SELECT/UPDATE) | — | — | service_role bypasses RLS |
| `approved_email_allowlist` | (none) | — | — | service_role bypasses RLS; no client access |

### Authority Model

Admin operations (`approvePilotAccessAction`, `rejectPilotAccessAction`, `revokePilotAccessAction`) require:
1. Valid authenticated Supabase session
2. Session email present in `PILOT_ADMIN_EMAILS` environment variable (server-only, comma-separated)
3. Service-role client created **only after** authority check passes

### Scope Boundary (FIB-S RULE-9)

This service is a **pilot containment primitive**, not an administrative platform. Expansion beyond:
- approve/reject/revoke pending requests
- allowlist entry management
- pending-request listing

requires a separate FIB. See FIB-H §H6 and FIB-S RULE-9.

### Cross-Context Dependencies

| Direction | Service | Via |
|-----------|---------|-----|
| **Reads** | (none — standalone containment tables) | — |
| **Writes** | (own tables only) | `pilot_access_requests`, `approved_email_allowlist` |
| **Consumed by** | `/start` gateway | Allowlist check before staff routing |
| **Consumed by** | `sendMagicLinkAction` | Pre-OTP allowlist gate |
| **Consumed by** | `registerCompanyAction`, `bootstrapAction` | `requireApprovedPilotSession()` guard |

---

## Client State Lifecycle (Platform / Frontend — ADR-035)

**Bounded Context**: "What client-side state persists across auth transitions, and how is it governed?"

ADR-035 establishes a formal **Session Reset Contract** for Zustand stores and browser storage across auth boundaries. This is the client-side counterpart to ADR-030's server-side auth pipeline hardening.

### Store Classification

| Store / Storage | Scope | Reset Requirement | Owner |
|---|---|---|---|
| `pitDashboardStore` | **Session** | Full reset of all data fields | Platform / Frontend |
| `playerDashboardStore` | **Session** | Full reset of all data fields | Platform / Frontend |
| `shiftDashboardStore` | **Session** | Full reset of all data fields | Platform / Frontend |
| `ratingSlipModalStore` | **Session** | Full reset of all data fields | Platform / Frontend |
| `lockStore` | **Session** | Unlock; `hasHydrated` excluded (persist middleware lifecycle) | Platform / Frontend |
| `uiStore` | **App** | Defensive `closeModal()` only; sidebar preference persists | Platform / Frontend |
| `player-360-recent-players` (localStorage) | **Session** | `removeItem()` — PII (player names) + casino-scoped IDs | Platform / Frontend |

### Contracts

- **Orchestrator**: `resetSessionState()` — plain synchronous function that resets all session-scoped stores + browser storage in one atomic call
- **Registration Enforcement**: New session-scoped stores MUST register with `resetSessionState()`. Contract test enforces store-inventory completeness via barrel export assertion (INV-035-4)
- **Defensive Validation**: Any "selected ID" from client state MUST be validated against loaded server data before rendering (INV-035-3)

### Auth Integration Points

`resetSessionState()` is invoked during all auth-ending paths (INV-035-2):
1. Normal sign-out (after `queryClient.clear()`)
2. Fallback/local-cleanup sign-out
3. `onAuthStateChange` `SIGNED_OUT` event

**ADR**: `docs/80-adrs/ADR-035-client-state-lifecycle-auth-transitions.md`
**Extends**: ADR-003 Section 8 (Zustand Scope)
**Complements**: ADR-030 (client-side counterpart to server-side auth hardening)

---

## Measurement Layer (Cross-Cutting Read Models — ADR-039)

**Governance**: ADR-039 — Cross-cutting read models that span bounded context boundaries.

**Artifacts are NOT owned by any single service.** They are governed by the Measurement Layer section of the SRM and must be registered here with source table provenance.

### Views (security_invoker=true)

| View | Source Tables | Purpose |
| ---- | ------------- | ------- |
| `measurement_audit_event_correlation_v` | `rating_slip`, `player_financial_transaction`, `mtl_entry`, `loyalty_ledger` | End-to-end lineage: slip → PFT → MTL → loyalty for a single rating slip |
| `measurement_rating_coverage_v` | `table_session`, `rating_slip` | Rating coverage accounting: rated vs untracked time per table session |

**Security**: `security_invoker=true` — caller's Pattern C RLS applies to all source tables. GRANT SELECT to `authenticated`.

### Registered Invariants

| Artifact | Context | Invariant |
| -------- | ------- | --------- |
| `rating_slip.computed_theo_cents` | RatingSlipService | Materialized at close by `rpc_close_rating_slip`, `rpc_move_player`, `rpc_start_or_resume_visit`. Immutable post-close. |
| `rating_slip.legacy_theo_cents` | RatingSlipService | Set once at import. Immutable. Transitional (legacy comparison). |
| `loyalty_valuation_policy` | LoyaltyService | One active policy per casino (partial unique index). |
| `loyalty_liability_snapshot` | LoyaltyService | Idempotent UPSERT per (casino_id, snapshot_date) via `rpc_snapshot_loyalty_liability`. |

### Blocked Artifacts

| Artifact | Reason | Unblock Condition |
| -------- | ------ | ----------------- |
| Audit-enriched correlation view (`audit_log` LEFT JOIN variant) | `audit_log` append-only immutability not yet enforced | Enforce append-only invariant (deny UPDATE/DELETE) |

### Governance Cross-References

The following governance artifacts constrain how measurement surfaces are built and what truth semantics they declare:

| Artifact | Path | Governs |
| -------- | ---- | ------- |
| Surface Classification Standard | `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md` | Rendering delivery + data aggregation pattern selection for surfaces consuming measurement metrics |
| Metric Provenance Matrix v2.0.0 | `docs/70-governance/METRIC_PROVENANCE_MATRIX.md` | Truth class, freshness, source tables, reconciliation for MEAS-001 through MEAS-012 |
| Slice 2 Shift Dashboard Declaration | `docs/70-governance/examples/SLICE-2-SHIFT-DASHBOARD-DECLARATION.md` | Surface classification certification for Shift Dashboard V3 (MEAS-005–012) |
| Slice 2 Metric Inventory | `docs/70-governance/audits/SLICE-2-SHIFT-METRIC-INVENTORY.md` | Component-level trace of every truth-bearing value on the shift dashboard |
| Slice 2 Consistency Audit | `docs/70-governance/audits/SLICE-2-CONSISTENCY-AUDIT.md` | Single-derivation-path verification and 6-check audit for shift dashboard metrics |

New surface EXEC-SPECs that consume measurement layer data must comply with the Surface Classification Standard and Metric Provenance Matrix. See ADR-041 for the governing decisions. Shift dashboard metrics (MEAS-005–012) are governed by the Slice 2 audit artifacts listed above.

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
-- PlayerImportService enums (PRD-037)
create type import_batch_status as enum ('staging','executing','completed','failed');
create type import_row_status as enum ('staged','created','linked','skipped','conflict','error');
```

**Change policy**: Additive values only; removals require deprecation plus data rewrite.

---

## Cross-Context Consumption Rules

| Consumer            | Producer           | Allowed Access                                               |
| ------------------- | ------------------ | ------------------------------------------------------------ |
| Any service         | CasinoService      | DTOs, RPCs (never direct table access)                       |
| RatingSlipService   | VisitService       | `visit_id` FK, Visit DTOs                                    |
| LoyaltyService      | RatingSlipService  | `rating_slip_id` FK, telemetry DTOs                          |
| LoyaltyService      | VisitService       | Visit DTOs, `visit_kind` check                               |
| FinanceService      | VisitService       | `visit_id` FK (**required for MVP**)                         |
| FinanceService      | RatingSlipService  | Narrow ADR-057 producer eligibility lookup: same-casino `rating_slip_id` → `rating_slip.table_id` only |
| MTLService          | FinanceService     | Reconciliation via triggers                                  |
| TableContextService | RatingSlipService  | Published query/DTO `hasOpenSlipsForTable` (open-slip guard) |
| TableContextService | FloorLayoutService | `floor_layout.activated` events                              |
| PlayerImportService | PlayerService      | `player` reads for identifier resolution, INSERTs via SECURITY DEFINER RPC |
| PlayerImportService | CasinoService      | `player_casino` reads for enrollment lookup, INSERTs via SECURITY DEFINER RPC |
| Measurement Layer   | RatingSlipService  | `rating_slip` columns via `measurement_audit_event_correlation_v`, `measurement_rating_coverage_v` |
| Measurement Layer   | FinanceService     | `player_financial_transaction` via `measurement_audit_event_correlation_v` |
| Measurement Layer   | MTLService         | `mtl_entry` via `measurement_audit_event_correlation_v` |
| Measurement Layer   | LoyaltyService     | `loyalty_ledger` via `measurement_audit_event_correlation_v` |
| Measurement Layer   | TableContextService | `table_session` via `measurement_rating_coverage_v` |
| ShiftIntelligenceService | TableContextService | `rpc_shift_table_metrics`, `rpc_shift_cash_obs_table` (source metric RPCs) |
| ShiftIntelligenceService | CasinoService      | `casino_settings` (operational config)               |

**Rule**: Cross-context consumers interact via DTO-level APIs, service factories, or RPCs—never by reaching into another service's tables directly.

---

## Related Documents

| Document                                                                    | Purpose                                                          |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`                | Implementation patterns, service factory wiring                  |
| `docs/25-api-data/DTO_CANONICAL_STANDARD.md`                                | DTO patterns, ESLint enforcement                                 |
| `docs/25-api-data/DTO_CATALOG.md`                                           | Complete DTO ownership matrix                                    |
| `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md`                       | Domain error codes, retry policies                               |
| `docs/20-architecture/EDGE_TRANSPORT_POLICY.md`                             | Middleware chain, header requirements                            |
| `docs/30-security/SEC-001-rls-policy-matrix.md`                             | RLS templates, policy matrix                                     |
| `docs/30-security/SEC-005-role-taxonomy.md`                                 | Role definitions, capabilities matrix                            |
| `docs/30-security/SEC-006-rls-strategy-audit-2025-12-11.md`                 | RLS audit findings and remediation                               |
| `docs/30-security/SECURITY_TENANCY_UPGRADE.md`                              | RLS context injection                                            |
| `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`                   | RLS connection pooling, Pattern C (Hybrid)                       |
| `docs/80-adrs/ADR-017-cashier-role-implementation.md`                       | Cashier role as staff_role enum                                  |
| `docs/80-adrs/ADR-018-security-definer-governance.md`                       | SECURITY DEFINER function governance                             |
| `docs/80-adrs/ADR-014-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling.md` | Visit archetype model                                            |
| `docs/80-adrs/ADR-022_Player_Identity_Enrollment_DECISIONS.md`              | Player identity decisions (frozen)                               |
| `docs/80-adrs/ADR-029-player-360-interaction-event-taxonomy.md`             | Player 360° event taxonomy                                       |
| `docs/80-adrs/ADR-030-auth-system-hardening.md`                             | Auth pipeline hardening — TOCTOU elimination, claims lifecycle   |
| `docs/80-adrs/ADR-031-financial-amount-convention.md`                       | Financial amount convention (cents storage, dollars at boundary) |
| `docs/80-adrs/ADR-032-frontend-error-boundary-architecture.md`              | Frontend error boundary three-tier hierarchy (extends ADR-012)   |
| `docs/80-adrs/ADR-035-client-state-lifecycle-auth-transitions.md`           | Client state session reset contract (extends ADR-003, complements ADR-030) |
| `docs/25-api-data/PLAYER_360_EVENT_TAXONOMY.md`                             | Event taxonomy quick reference                                   |
| `docs/80-adrs/ADR-039-measurement-layer.md`                                 | Measurement Layer governance — cross-cutting read models         |

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

**Document Version**: 4.27.0
**Created**: 2025-10-21
**Reduced**: 2025-12-06
**Updated**: 2026-05-29 (SRL companion reference + TableContextService semantic extension entry)
**Status**: CANONICAL - Registry + Invariants Only
