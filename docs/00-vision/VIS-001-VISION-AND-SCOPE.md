# Vision & Scope (V&S)

**ID Prefix**: `VIS-###`
**Owner**: Product
**Phase**: Inception, Discovery, Evolve

```yaml
---
id: VIS-001
title: PT-2 Casino Management Platform Vision
owner: Product
status: Active
created: 2025-10-25
last_review: 2025-11-10
version: 2.0.0
canonical_srm_version: 3.0.2
---
```

## Purpose

Aligns direction and guards against scope creep with clear problem statements, goals, non-goals, and stakeholder identification. This document derives from and maintains parity with the **Canonical Service Responsibility Matrix (SRM v3.0.2)**.

---

## Vision Brief (One-Pager)

**North Star**: *Matrix-first, table-centric player tracking with compliant session logging, chip custody telemetry, and idempotent mid-session rewards—production-ready for single-casino pilot.*

**Problem**
Pit operations struggle with fragmented tools, manual workflows, and error-prone mid-session rewards. Player time is miscounted, chip custody is poorly tracked, compliance context is hard to reconstruct, and floor layout changes require system downtime. This creates revenue leakage, audit risk, operational friction, and operator fatigue.

**Solution Approach**
A pit-friendly, operator-first platform built on **9 bounded-context services** with matrix-first contracts (SRM ↔ schema ↔ RLS ↔ DTOs). Core workflows: open/close tables with chip custody tracking, draft/review/activate floor layouts without downtime, start/pause/resume/close rating slips with accurate timekeeping, and award **idempotent mid-session rewards** safely. Compliance signals are ambient and built-in. Gaming day temporal authority is centralized. Error taxonomy prevents infrastructure leaks. RLS-by-default security with no service keys in runtime.

**Definition of Success (qualitative)**
One casino runs a full shift—table opens with inventory counts, dealers rotate cleanly, players earn rewards mid-session without duplicates, fills and credits are logged with dual signatures, compliance thresholds are monitored in real-time, and the shift closes with reconcilable audit trails—and asks us back tomorrow.

---

## Success Metrics (KPIs & Measurable Outcomes)

### Performance
- **Latency/UX**: p95 session creation < **2s**; pit dashboard LCP ≤ **2.5s**; reward issuance < **80ms**.
- **Reliability**: Zero "stuck" rating slips; idempotent mid-session rewards (no duplicates); **100% RLS policy coverage** on tenant-scoped tables.
- **Operability**: Operator completes 3 key flows (open table → start slip → issue reward) in **< 2 minutes** during pilot.

### Security & Compliance
- **RLS Coverage**: All tables with `casino_id` have RLS policies enabled; no service key usage in runtime.
- **Idempotency**: 100% of mutations enforce idempotency keys (`x-idempotency-key` header required).
- **Audit Trail**: Every mutation writes to canonical audit shape with `correlation_id` propagation.
- **MTL Compliance**: Threshold detection within **5 seconds** of transaction; CTR export < **1 minute** on-demand.

### Operational Excellence
- **Chip Custody**: Time-to-fill < **3 minutes**; zero-discrepancy table closes > **95%**.
- **Floor Layout**: Draft → approval → activation workflow < **24 hours**; zero-downtime activation.
- **Gaming Day**: Temporal authority centralized; **zero gaming day mismatches** across Finance/MTL domains.

### Observability
- **Dashboards**: Live metrics for **Active tables**, **Open slips**, **Rewards/hour**, **Chip custody events**, **MTL threshold proximity**, error rates.
- **Alerting**: Actionable alerts for stuck slips, failed reward issuance, chip discrepancies, MTL threshold breaches.
- **SLO Budgets**: Each service domain publishes SLO targets; p95 latency, error rate, and throughput tracked per endpoint.

---

## Out-of-Scope (MVP)

- Full cashier workflows; automated watchlist writes; points→cash conversions.
- Advanced analytics/forecasting; multi-property roll-ups; player marketing campaigns.
- Non-table games and kiosk integrations; sports betting; slot machine telemetry.
- Complex dealer rotation exceptions beyond happy-path scenarios.
- Dispute resolution workflows; marker issuance; credit line management.
- Third-party loyalty integrations (deferred to Phase 2).

---

## Stakeholder Map

- **Pit Boss / Floor Supervisor** — *Primary*: Run the pit, resolve edge cases, approve fills/credits, activate layouts.
- **Dealer** — *Primary*: Record clean begins/pauses/resumes/ends; log rotations; report chip discrepancies.
- **Cage/Accounting** — *Secondary*: Verify in-session rewards; reconcile fills/credits/drops; generate end-of-day reports.
- **Compliance Analyst** — *Secondary*: Review MTL entries, threshold proximity, and audit context; export CTR filings.
- **Casino Admin** — *Enabler*: Configure casino settings, manage staff, design floor layouts, set game parameters.
- **Engineering / Architecture** — *Enablers*: Uphold SRM↔schema↔RLS↔DTO integrity; ensure idempotency, performance budgets, and error taxonomy.
- **Product / Leadership** — *Sponsors*: Define scope, outcomes, and pilot success criteria; approve architecture decisions.

---

## Market Analysis (Lightweight, MVP-relevant)

- **Status quo**: Manual logs or legacy trackers with weak mid-session reward controls, no chip custody telemetry, and poor audit trails lead to double-count risk, compliance exposure, and operational inefficiency.
- **Differentiators (PT-2)**:
  1. **Operator-first ergonomics** (2–3 steps per core action)
  2. **Matrix-first contracts** (SRM → schema → RLS → DTOs stay in lockstep)
  3. **RLS-by-default security** (no service keys; multi-tenant isolation via canonical RLS pattern)
  4. **Idempotent-first** (all mutations require idempotency keys; no duplicate rewards/transactions)
  5. **Chip custody telemetry** (fills, credits, inventory, drop events with dual signatures)
  6. **Built-in observability** (correlation IDs, domain events, SLO budgets from day one)
  7. **Error taxonomy** (domain errors hide infrastructure details; retry policies with exponential backoff)
  8. **Zero-downtime floor layouts** (draft → review → approve → activate workflow)

---

## Product Pillars (Design Principles)

1. **Operator-first ergonomics** — Minimal taps, clear states, forgiving flows; skeletons over spinners.
2. **Matrix-first contracts** — SRM mirrors schema, RLS, and DTOs; OpenAPI/Zod schemas stay in lockstep.
3. **RLS-by-default** — Deny-all first; narrow allow paths by `casino_id` + role; no service keys in runtime.
4. **Idempotent-first** — Natural keys, RPCs, and `x-idempotency-key` headers prevent duplicate rewards/transactions.
5. **Bounded context integrity** — Services own tables; cross-context access via DTOs/RPCs only; ESLint enforced.
6. **Error taxonomy** — Domain errors (e.g., `REWARD_ALREADY_ISSUED`) hide Postgres codes; retry policies with backoff.
7. **Observability by default** — Correlate by `{casino_id, staff_id, rating_slip_id, visit_id}`; emit domain events; SLO budgets.
8. **Temporal authority** — Gaming day calculation centralized in `casino_settings`; Finance/MTL derive from single source.

---

## In-Scope (MVP Capabilities)

### 1. CasinoService - Foundational Context
**Responsibilities**: Root temporal authority, global policy, staff registry, audit logs.

**Capabilities**:
- Casino registry (licensed gaming establishments)
- `casino_settings` (EXCLUSIVE WRITE): gaming day start time, timezone, compliance thresholds (CTR, watchlist)
- Staff management: authentication, role assignment (`dealer`, `pit_boss`, `admin`), status tracking
- Game configuration templates (min/max bets, rotation intervals per game type)
- Centralized audit logging (cross-domain event capture)
- Administrative reporting

**Provides To**: All downstream contexts (temporal authority, staff authorization, policy boundaries).

---

### 2. PlayerService - Identity Context
**Responsibilities**: Player profile, contact info, enrollment.

**Capabilities**:
- Player profile management (first/last name, identity data)
- Multi-casino enrollment via `player_casino` (status tracking per casino)
- PII protection (birth_date, SSN excluded from public DTOs)

**Provides To**: Visit, Loyalty, Finance, RatingSlip, MTL (player identity FKs).

---

### 3. VisitService - Session Context
**Responsibilities**: Session lifecycle (check-in/out).

**Capabilities**:
- Start/stop visit sessions
- Visit status tracking (`open`, `closed`)
- Session-scoped aggregations (consumed by Loyalty, Finance, MTL)

**Provides To**: RatingSlip, Loyalty, Finance, MTL (session context FK).

---

### 4. TableContextService - Operational Telemetry Context
**Responsibilities**: Table lifecycle, dealer rotations, chip custody telemetry.

**Capabilities**:
- Gaming table registry (provision, activate, deactivate)
- Table settings (min/max bets, rotation intervals)
- **Dealer rotations** (happy path: dealer assignments with start/end timestamps)
- **Chip custody telemetry** (non-monetary):
  - **Inventory snapshots** (open/close/rundown with dual signers, discrepancy tracking)
  - **Table fills** (chip replenishment from cage; idempotent by `request_id`)
  - **Table credits** (chip returns to cage; idempotent by `request_id`)
  - **Drop events** (drop box removal/delivery timeline; seal numbers, custody chain)
- Break alerts and key control logs (deferred to Phase 2)

**Consumes**: `floor_layout.activated` events from FloorLayoutService to sync table assignments.

**Provides To**: RatingSlip (table FK), Finance (operational context), MTL (compliance metadata), Performance (KPIs).

---

### 5. FloorLayoutService - Design & Activation Context
**Responsibilities**: Floor design, versioning, approval workflow, activation.

**Capabilities**:
- **Layout drafting**: Create pit definitions, table slot placements, game type assignments
- **Versioning**: Immutable layout snapshots with version numbers
- **Review workflow**: Draft → Review → Approved → Archived states
- **Activation**: Zero-downtime layout activation via `rpc_activate_floor_layout`
  - Idempotent by `activation_request_id`
  - Emits `floor_layout.activated` events consumed by TableContext
- **Audit trail**: Track `created_by`, `reviewed_by`, `approved_by`, activation timestamps

**Provides To**: TableContext (active layout assignment), Performance (layout metadata), Reporting (activation lineage).

---

### 6. RatingSlipService - Gameplay Telemetry Context
**Responsibilities**: Gameplay measurement (DOES NOT STORE REWARDS).

**Capabilities**:
- Start/pause/resume/close rating slips
- Telemetry capture:
  - Average bet (INPUT for Loyalty points calculation)
  - Time played (start/end timestamps)
  - Game settings (game type, table FK)
  - Seat number, status (`open`, `paused`, `closed`)
  - Policy snapshot (reward policy at time of play for audit)
- Move player between tables
- **Mid-session reward eligibility**: Slips with `status = 'open'` can trigger rewards (via Loyalty RPC)

**DOES NOT OWN**: Reward balances or points (Loyalty is sole source of truth).

**Provides To**: Loyalty (telemetry DTOs for mid-session rewards), Finance (session context), MTL (optional FK).

**Realtime**: CQRS-light read model; broadcasts state transitions; 1–5s snapshots for dashboards.

---

### 7. LoyaltyService - Reward Context
**Responsibilities**: Reward policy engine, points calculation, mid-session issuance.

**Capabilities**:
- **Points calculation logic** (business rules, formula, multipliers)
- `loyalty_ledger` (source of truth for all points transactions)
- `player_loyalty` (per-casino balance, tier status)
- **Mid-session reward RPC**: `rpc_issue_mid_session_reward`
  - Idempotent by `idempotency_key`
  - Validates slip `status = 'open'`, casino alignment, policy caps
  - Appends ledger entry + updates balance atomically
  - Returns existing record if idempotency key matches
- Tier progression rules (deferred to Phase 2)
- **Outbox pattern**: `loyalty_outbox` for async side effects (emails, webhooks)

**References**: Casino, Player, Visit, RatingSlip (telemetry input), Staff (who issued).

**Provides To**: UI (balance display), Audit (reward lineage).

---

### 8. PlayerFinancialService - Finance Context
**Responsibilities**: Financial ledger (source of truth), gaming day derivation.

**Capabilities**:
- `player_financial_transaction` (append-only ledger)
- Financial event types (deposit, withdraw, marker, etc.)
- **Gaming day derivation**: Automated via trigger (`compute_gaming_day` + `casino_settings`)
- Idempotency enforcement (`idempotency_key` with partial unique index)
- **Outbox pattern**: `finance_outbox` for side effects
- Aggregation views (consumed by Visit, MTL for summaries)

**References**: Player, Visit (session context), RatingSlip (legacy compat FK), Casino (temporal authority).

**Provides To**: MTL (financial aggregates), Reporting (daily/shift summaries).

**Transport**: Cashier mutations via Server Actions with `x-idempotency-key` required.

---

### 9. MTLService - Compliance Context
**Responsibilities**: AML/CTR compliance, threshold detection, regulatory exports.

**Capabilities**:
- `mtl_entry` (immutable cash transaction log)
- `mtl_audit_note` (append-only compliance annotations)
- **Gaming day calculation**: Automated via trigger (same `compute_gaming_day` as Finance)
- **Threshold detection**: Real-time monitoring against `casino_settings` (watchlist floor, CTR threshold)
- **Compliance exports**: CTR/SAR report generation
- **Proximity badges**: UI indicators for threshold proximity (e.g., "within $500 of watchlist floor")

**References**: Casino (settings, policy), Player (optional), Staff, Visit (optional), RatingSlip (optional).

**Provides To**: Compliance dashboards, regulatory filings, audit trails.

**Transport**: Read-only for most roles; writes restricted to cashier/compliance staff with same-casino RLS.

---

## Key User Journeys (Happy Paths)

### Journey 1: Shift Open → Table Activation → Player Seating → Reward
1. **Pit Boss activates floor layout** (via approved layout version; zero downtime)
2. **Dealer opens table** → logs inventory snapshot (chipset count, dual signers)
3. **Player checks in** (Visit created; enrollment verified)
4. **Player seated** → Rating Slip started (table FK, game settings captured)
5. **Mid-session reward issued** (Loyalty RPC called with idempotency key; ledger appended; balance updated)
6. **Player moves tables** → Rating Slip paused/resumed
7. **Session ends** → Rating Slip closed; Visit closed
8. **End-of-shift inventory** → Closing snapshot logged; discrepancies noted

---

### Journey 2: Chip Custody Workflow
1. **Dealer requests fill** (table needs chips) → `rpc_request_table_fill` called with `request_id`
2. **Cage prepares fill** → chipset + amount logged; dual signatures (requested_by, delivered_by, received_by)
3. **Fill recorded** → idempotent by `(casino_id, request_id)`; audit trail created
4. **Dealer returns excess chips** → `rpc_request_table_credit` (same idempotency pattern)
5. **Drop box removed** → `rpc_log_table_drop` (seal number, custody chain, gaming day, sequence)
6. **Drop delivered to count room** → timestamp updated; compliance scan recorded

---

### Journey 3: Compliance Monitoring
1. **Player buys in** (Finance transaction recorded; gaming day auto-calculated)
2. **MTL entry created** (threshold detection runs; watchlist proximity calculated)
3. **Proximity badge shown** (UI indicator: "Within $500 of watchlist floor")
4. **Threshold exceeded** → Compliance alert triggered; `mtl_audit_note` appended by analyst
5. **End-of-day CTR export** → Batch job queries MTL entries by gaming day; generates regulatory report

---

### Journey 4: Floor Layout Update (Zero Downtime)
1. **Admin drafts new layout** → `rpc_create_floor_layout` (pits, table slots defined)
2. **Layout versioned** → Immutable snapshot created
3. **Layout submitted for review** → Status: Draft → Review
4. **Pit Boss approves** → Status: Review → Approved
5. **Admin activates layout** → `rpc_activate_floor_layout` (idempotent by `activation_request_id`)
6. **Event emitted** → `floor_layout.activated` broadcast
7. **TableContext syncs** → Gaming tables updated with new pit assignments; no downtime

---

## Architecture Foundations (SRM-Aligned)

### DTO Contract Policy
**Enforcement**: ESLint + Pre-commit hooks + CI gates

**Rules**:
1. **Table Ownership → DTO Ownership**: Service that OWNS a table MUST provide canonical DTOs
2. **Bounded Context Access**: Services MUST NOT directly access `Database['public']['Tables']['X']` for tables they don't own
3. **Cross-Context Consumption**: Use published DTOs only (e.g., Loyalty imports `RatingSlipTelemetryDTO` from RatingSlip)
4. **Column Exposure Policy**: DTOs MUST document exposure scope and excluded fields (JSDoc required)
5. **Type Import Restrictions**: `types/database.types.ts` ONLY imported in service-owned `mappers.ts`/`dtos.ts` files

**Patterns**:
- **Contract-First DTOs** (Loyalty, Finance, MTL, TableContext): Explicit interfaces + mappers
- **Canonical DTOs** (Player, Visit, Casino): `Pick<Database['public']['Tables'][...]>` with allowlist
- **Hybrid** (RatingSlip): Internal DTO = full row; Published DTO = cross-context contract

---

### Error Taxonomy & Resilience
**Status**: MANDATORY (Effective 2025-11-09)

**Principles**:
1. **Domain errors hide infrastructure**: `REWARD_ALREADY_ISSUED` instead of Postgres `23505`
2. **Retry policies with idempotency**: Only retry idempotent operations; exponential backoff + jitter
3. **HTTP status code mapping**:
   - `*_NOT_FOUND` → 404
   - `*_INVALID`, `*_MISMATCH` → 400
   - `*_ALREADY_*`, `*_DUPLICATE` → 409
   - `INSUFFICIENT_*`, `*_EXCEEDED` → 422
   - `UNAUTHORIZED` → 401
   - `FORBIDDEN`, `*_UNAUTHORIZED` → 403
4. **Circuit breaking**: Fail-fast for noisy endpoints; prevent cascade failures

**Examples by Domain**:
- **Loyalty**: `INSUFFICIENT_BALANCE`, `REWARD_ALREADY_ISSUED`, `LOYALTY_POLICY_VIOLATION`
- **Finance**: `TRANSACTION_ALREADY_PROCESSED`, `TRANSACTION_INSUFFICIENT_FUNDS`, `GAMING_DAY_MISMATCH`
- **RatingSlip**: `RATING_SLIP_NOT_OPEN`, `RATING_SLIP_CONCURRENT_UPDATE`
- **TableContext**: `TABLE_NOT_ACTIVE`, `TABLE_DEALER_CONFLICT`, `TABLE_FILL_REJECTED`

---

### Security & Tenancy
**Status**: MANDATORY (Effective 2025-11-09)

**Upgrades**:
1. **No service keys in runtime**: Every call uses anon key + user context
2. **RLS context injection**: `withServerAction()` wrapper sets `app.actor_id`, `app.casino_id`, `app.staff_role` via `SET LOCAL`
3. **Canonical RLS pattern**: Single deterministic path; no OR trees
   ```sql
   create policy "visit_read_same_casino"
     on visit for select using (
       auth.uid() = (select user_id from staff where id = current_setting('app.actor_id')::uuid)
       AND casino_id = current_setting('app.casino_id')::uuid
     );
   ```
4. **RLS policy matrix**: Per-service templates (read: same-casino; write: role-gated; append-only: ledgers)

---

### Edge Transport Policy
**Canonical Entry Point**: `withServerAction()` wrapper (for first-party mutations/reads)

**Middleware Chain**:
```
withAuth() → withRLS() → withRateLimit() → withIdempotency() → withAudit() → withTracing()
```

**Required Headers**:
- `x-correlation-id`: ALL edge calls
- `x-idempotency-key`: Mutations only (persisted by owning service)

**Route Handlers**: Reserved for 3rd-party/webhook/file-upload ingress; MUST reuse same DTO contracts.

---

### Client Cache & Realtime Discipline

**React Query**:
- Query keys: `[domain, operation, scope?, ...params]` (e.g., `['rating-slip','detail',slip_id]`)
- Stale-while-revalidate with tiered cache:
  - **Hot** (table status): 30s stale, 2m cache, 10s poll
  - **Warm** (players): 5m stale, 30m cache
  - **Cold** (settings): 1h stale, 24h cache
  - **Critical** (balances): 0s stale (always fresh)

**Realtime Channels**:
- Scoped by casino and resource: `{casino_id}` or `{casino_id}:{resource_id}`
- State transitions broadcast (not every row mutation)
- Hot domains (RatingSlip, TableContext): 1–5s snapshots; high-cardinality dashboards use poll + ETag

**Optimistic Updates Policy**:
- ✅ **Safe**: Toggle flags, update text fields (idempotent, low conflict)
- ❌ **Unsafe**: Financial transactions, loyalty rewards, rating slip closure (non-idempotent or state machines)

---

### UX & Data Fetching Patterns
**Status**: MANDATORY (Effective 2025-11-09)

**Upgrades**:
1. **Windowed Lists**: Lists > 100 items use `@tanstack/react-virtual`
2. **Skeletons over spinners**: All async loads show skeleton states
3. **Background prefetch**: On hover (detail views) + route navigation (SSR hydration)

---

### Outbox Pattern (Async Side Effects)
**Services**: Loyalty, Finance

**Tables**:
- `loyalty_outbox`: Ledger side effects (emails, webhooks, projections)
- `finance_outbox`: Transaction side effects

**Worker Contract**:
- Pull batches via `FOR UPDATE SKIP LOCKED`
- Emit downstream events; set `processed_at`
- Exponential backoff + dead-letter alerting on retry exhaustion
- Idempotent replays (ledger rows immutable + keyed)

---

## Constraints & Assumptions

- **Deployment**: Single-casino pilot; connectivity generally stable with occasional flakiness.
- **Security**: RLS derived from SRM; deny-all first; role-based allow paths; no service keys in runtime.
- **Data lifecycle**: Gaming-day derivation governed centrally by `casino_settings`; soft-delete where needed; log retention defined.
- **Temporal authority**: `casino_settings.gaming_day_start_time` is the single source of truth for Finance and MTL.
- **Schema evolution**: CLI migrations only (`npx supabase migration`); `npm run db:types` MUST run after every migration; PostgREST cache reload via `NOTIFY pgrst, 'reload schema'`.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Scope creep** | Enforce slice gates; defer non-MVP to Phase 2; SRM is contract. |
| **RLS complexity** | Start deny-all; add allow-paths with tests per role; no OR trees. |
| **Schema/PostgREST drift** | CLI migrations only; verify schema cache after deploy; `npm run db:types` in CI. |
| **Performance regressions** | Define p95 SLOs now; `EXPLAIN` top queries pre-merge; index strategy in SRM. |
| **Idempotency gaps** | All mutations require `x-idempotency-key`; CI enforces header presence. |
| **Cross-context leaks** | ESLint rule `no-cross-context-db-imports`; DTO contract policy enforced in CI. |
| **Error taxonomy drift** | Domain error catalog per service; CI validates error codes match SRM. |
| **Service key exposure** | Grep for `SERVICE_ROLE_KEY` in CI; fail on any runtime usage. |

---

## Release Definition of Done (Pilot-Ready)

### Schema & Types
- [ ] All SRM tables/enums/RPCs present in `database.types.ts`
- [ ] `npm run db:types` generates zero diffs
- [ ] Schema verification test passes (tables, FKs, enums, idempotency keys)

### Security
- [ ] RLS policies for all tables with `casino_id`
- [ ] No `SERVICE_ROLE_KEY` usage in runtime (CI grep passes)
- [ ] `withServerAction()` wrapper deployed with RLS context injection
- [ ] `staff.user_id` column exists and linked to `auth.users`

### DTOs & Bounded Contexts
- [ ] All services have `dtos.ts` files with published DTOs
- [ ] ESLint rule `no-cross-context-db-imports` enabled
- [ ] CI validates SRM ownership matrix matches codebase

### Idempotency
- [ ] All mutation endpoints accept `x-idempotency-key` header
- [ ] Loyalty, Finance, MTL ledgers have partial unique indexes on `idempotency_key`
- [ ] TableContext custody tables have unique `(casino_id, request_id)`
- [ ] FloorLayout activation has unique `(casino_id, activation_request_id)`

### Error Taxonomy
- [ ] Domain error codes defined in `services/{service}/errors.ts`
- [ ] Postgres errors mapped to domain errors (no 23505 leaks to UI)
- [ ] Retry policies configured for hot paths
- [ ] Circuit breakers deployed for noisy endpoints

### Observability
- [ ] Dashboards show: Active tables, Open slips, Rewards/hour, Chip custody events, MTL proximity, error rate
- [ ] Correlation IDs propagate through all layers (`x-correlation-id` → `SET LOCAL application_name`)
- [ ] Audit rows written to canonical shape (`{ts, actor_id, casino_id, domain, action, dto_before, dto_after, correlation_id}`)
- [ ] SLO budgets defined per service (p95 latency, error rate, throughput)

### Pilot Runbook
- [ ] Feature flags configured for phased rollout
- [ ] Rollback switches documented
- [ ] Operator training materials (key flows < 2 minutes)
- [ ] Pilot sign-off with P0s resolved; P1s triaged with owners/dates

---

## Service Catalog (SRM v3.0.2)

| Service | Bounded Context | Tables Owned | Key Responsibilities |
|---------|----------------|--------------|---------------------|
| **CasinoService** | Foundational | `casino`, `company`, `casino_settings`, `staff`, `game_settings`, `player_casino`, `audit_log`, `report` | Root temporal authority, global policy, staff registry, game config templates |
| **PlayerService** | Identity | `player` | Player profile, contact info, identity data |
| **VisitService** | Session | `visit` | Session lifecycle (check-in/out, status tracking) |
| **LoyaltyService** | Reward | `player_loyalty`, `loyalty_ledger`, `loyalty_outbox` | Points calculation logic, mid-session reward RPC, tier progression, outbox side effects |
| **TableContextService** | Operational Telemetry | `gaming_table`, `gaming_table_settings`, `dealer_rotation`, `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_drop_event` | Table lifecycle, dealer rotations, chip custody telemetry (fills, credits, inventory, drops) |
| **FloorLayoutService** | Design & Activation | `floor_layout`, `floor_layout_version`, `floor_pit`, `floor_table_slot`, `floor_layout_activation` | Floor design, versioning, review workflow, zero-downtime activation |
| **RatingSlipService** | Gameplay Telemetry | `rating_slip` | Gameplay measurement (average bet, time played, game settings); DOES NOT STORE REWARDS |
| **PlayerFinancialService** | Finance | `player_financial_transaction`, `finance_outbox` | Financial ledger (source of truth), gaming day derivation, idempotency enforcement, outbox side effects |
| **MTLService** | Compliance | `mtl_entry`, `mtl_audit_note` | AML/CTR compliance, threshold detection, gaming day calculation, regulatory exports |

---

## Related Documents

### Canonical References (REQUIRED)
- **SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (v3.0.2)
- **SRM Audit**: `docs/audits/SRM_AUDIT_REPORT_NOV_10.md` (✅ PRODUCTION READY)
- **Error Taxonomy**: `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md`
- **Security & Tenancy**: `docs/30-security/SECURITY_TENANCY_UPGRADE.md`
- **Edge Transport Policy**: `docs/20-architecture/EDGE_TRANSPORT_POLICY.md`
- **DTO Standard**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- **UX Patterns**: `docs/70-governance/UX_DATA_FETCHING_PATTERNS.md`

### Architecture Deep Dives
- **Patterns**: `docs/patterns/BALANCED_ARCHITECTURE_QUICK.md`
- **State Management**: `docs/adr/ADR-003-state-management-strategy.md`
- **Integrity Framework**: `docs/integrity/INTEGRITY_FRAMEWORK.md`
- **Over-Engineering Guardrail**: `docs/patterns/OVER_ENGINEERING_GUARDRAIL.md`

### Service READMEs
- `services/casino/README.md`
- `services/player/README.md`
- `services/visit/README.md`
- `services/loyalty/README.md`
- `services/table-context/README.md`
- `services/floor-layout/README.md`
- `services/rating-slip/README.md`
- `services/finance/README.md`
- `services/mtl/README.md`

### PRD & Governance
- **PRD**: `docs/10-prd/PRD-001_Player_Management_System_Requirements.md`
- **RLS Policy Matrix**: `docs/30-security/SEC-001-rls-policy-matrix.md`
- **Casino-Scoped Security**: `docs/30-security/SEC-002-casino-scoped-security-model.md`
- **Index**: `docs/INDEX.md`

---

## Appendix: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-10-25 | Product | Initial draft |
| 1.1.0 | 2025-11-03 | Product | Updated with FloorLayout scope |
| 2.0.0 | 2025-11-10 | Product + Architecture | **Major update**: Full alignment with SRM v3.0.2; added chip custody telemetry, floor layout workflow, error taxonomy, security/tenancy upgrades, edge transport policy, outbox pattern, UX patterns. Now production-ready. |

---

## Appendix: Glossary (SRM-Aligned)

- **Bounded Context**: A service domain with clear ownership boundaries (e.g., Loyalty, Finance, TableContext).
- **DTO (Data Transfer Object)**: Contract-first interfaces for cross-context communication.
- **RLS (Row-Level Security)**: Postgres policy system for multi-tenant isolation.
- **SRM (Service Responsibility Matrix)**: Canonical document defining table ownership, DTOs, RPCs, and cross-context contracts.
- **Idempotency Key**: Unique identifier (`x-idempotency-key` header) ensuring mutations can be safely retried without duplicates.
- **Gaming Day**: Casino-specific temporal boundary (e.g., 6:00 AM start); derived from `casino_settings.gaming_day_start_time`.
- **Chip Custody**: Non-monetary tracking of chip movement (fills, credits, inventory, drops); distinct from financial ledger.
- **Outbox Pattern**: Side effect isolation via append-only tables (`loyalty_outbox`, `finance_outbox`); workers drain via `FOR UPDATE SKIP LOCKED`.
- **CQRS-Light**: Write model (append-only telemetry) + Read model (projections); hot domains use this pattern to decouple ingest from dashboards.
- **Correlation ID**: UUID (`x-correlation-id` header) propagated through all layers for distributed tracing and audit linking.
