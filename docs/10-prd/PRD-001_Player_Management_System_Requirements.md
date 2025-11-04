# Product Requirements (PRD)

**ID Prefix**: `PRD-###`  
**Owner**: Product  
**Phase**: Inception, Discovery, Design, Test, Release, Evolve

```yaml
---
id: PRD-001
title: Player Management System Requirements (MVP Pilot)
owner: Product
status: Draft
affects: [ARCH-012, API-005, QA-008, SEC-010, OPS-006, REL-003]
created: 2025-11-04
last_review: 2025-11-04
---
```

> **Scope note:** Although titled “Player Management,” this MVP PRD covers the minimal cross-domain features needed to run a single-casino pilot: Casino, Table Context, Player & Visit, Rating Slip, Loyalty (mid-session reward), minimal Finance, and read-only MTL.

---

## 1) Purpose & Release Goal

Drive a pilot-ready vertical slice that enables **table-centric player tracking** with **compliant session logging** and **basic mid-session loyalty accrual**, operable by pit staff with minimal training.

**Pilot Go/No-Go:** A single casino completes a full shift with zero “stuck” rating slips, accurate accrued seconds, idempotent mid-session rewards, and auditable trails.

---

## 2) Personas & JTBD

- **Pit Boss / Floor Supervisor** — run pit, open/close tables, monitor state, resolve issues.  
- **Dealer** — start/pause/resume/close rating slips as part of normal workflow.  
- **Cage/Accounting (read-only)** — verify in-session rewards, reconcile at day end.  
- **Compliance (read-only)** — review threshold proximity and session context.

**JTBD:** “Keep tables and player sessions clean, timely, and compliant — with minimal taps and zero ambiguity.”

---

## 3) MVP Feature Set (In-Scope)

### 3.1 Casino
- Staff authentication and role assignment.
- Casino settings including **gaming day** parameters.

### 3.2 Table Context
- Open/close table; show status on pit dashboard.
- Dealer rotation (happy path).

### 3.3 Player & Visit
- Enroll player; start/stop visit; seat player at table.

### 3.4 Rating Slip (Telemetry)
- Start, pause, resume, close slip.
- Accurate **accumulated_seconds** and AOV visibility.
- Prevent overlapping active slips for the same player/table.

### 3.5 Loyalty
- Issue **mid-session reward** via RPC; persist to **loyalty_ledger** and show within the slip/session.
- Enforce **idempotency** (no duplicate issuance).

### 3.6 Finance (Minimal, Feature-Flagged)
- Manual **deposit/withdrawal** entry to support reconciliation scenarios.

### 3.7 MTL (Read-Only)
- Display threshold proximity badge and recent loyalty activity in context.

---

## 4) Out of Scope (MVP)

- Full cashier workflows; automated watchlist writes; points→cash conversions.  
- Advanced analytics/forecasting; multi-property roll-ups.  
- Non-table games and kiosk integrations.  
- Complex exception processing beyond happy-path dealer rotation.

---

## 5) User Stories & Acceptance Criteria

> Format uses Gherkin-style acceptance tests (can be automated as E2E).

### US-001 Open a Table
**As** a Pit Boss **I want** to open a table **so that** dealers can seat players.  
**Acceptance:**
- **Given** the table is closed  
  **When** I Open Table  
  **Then** table status becomes `open` and is visible on the pit dashboard within 2s.

### US-002 Start a Rating Slip
**As** a Supervisor **I want** to start a rating slip **so that** player time accrues.  
**Acceptance:**
- **Given** player is seated at an open table and has no active slip at that table  
  **When** I Start Slip  
  **Then** a slip is created with `status=active` and a start timestamp, and the pit dashboard shows the active slip within 2s.

### US-003 Pause/Resume Slip
**As** a Supervisor **I want** to pause and resume a slip **so that** time tracking remains accurate when the player steps away.  
**Acceptance:**
- **Given** an active slip  
  **When** I Pause Slip  
  **Then** a pause interval is recorded and `accumulated_seconds` stops increasing.  
- **Given** a paused slip  
  **When** I Resume Slip  
  **Then** a resume time is recorded and seconds begin accruing again.

### US-004 Close Slip
**As** a Dealer/Pit Boss **I want** to close a slip **so that** the session is finalized.  
**Acceptance:**
- **Given** an active or paused slip  
  **When** I Close Slip  
  **Then** final `accumulated_seconds` is persisted, `status=closed`, and the slip disappears from “Active” lists within 2s.

### US-005 Mid-Session Reward
**As** a Pit Boss **I want** to issue a mid-session reward **so that** loyalty can be recognized during play.  
**Acceptance:**
- **Given** an active slip with sufficient criteria  
  **When** I Issue Reward  
  **Then** an entry appears in `loyalty_ledger` linked to the slip/visit, and the slip UI reflects the reward within 2s.  
- **And** if the same request is retried with the same idempotency key  
  **Then** no duplicate ledger entry is created (idempotent behavior).

### US-006 Basic Finance Entry (Feature-Flag)
**As** Accounting **I want** to record a manual deposit/withdraw **so that** reconciliation can be tested during pilot.  
**Acceptance:**
- **Given** feature flag is ON  
  **When** I create a finance entry via RPC  
  **Then** record persists with derived `gaming_day` and appears in relevant views.

---

## 6) Functional Requirements (by Domain)

### Casino
- Roles: `pit_boss`, `dealer`, `compliance_read`, `accounting_read` (minimum set).  
- Settings: `gaming_day_start`, timezone; must drive `compute_gaming_day` derivations.

### Table Context
- States: `open`, `closed`.  
- Dealer rotation: happy-path logging for audit; optional read-only view for MVP.

### Player & Visit
- Prevent multiple concurrent **visits** for same player at the same casino unless explicitly allowed.  
- Seat mapping: a player must be seated at a specific table to start a slip.

### Rating Slip
- State machine: `active` ↔ `paused` → `closed`.  
- **accumulated_seconds** derived from start/pause/resume/close events (server-trusted clock).  
- No overlapping **active** slip for {player, table}.

### Loyalty
- RPC: `rpc_issue_mid_session_reward(sl i p_id, amount, reason, idempotency_key)` writes to `loyalty_ledger`.  
- Display rewards inline on slip; include who/when/why; audit fields present.

### Finance
- RPC: `rpc_create_financial_txn(...)` must derive `gaming_day` server-side.  
- Minimal UI for pilot; behind feature flag.

### MTL
- Read-only surface showing threshold proximity and recent loyalty actions; no writes in MVP.

---

## 7) Data Contracts & Schema Touchpoints

- **Tables (public):** `casino`, `casino_settings`, `staff`, `gaming_table`, `gaming_table_settings`, `player`, `visit`, `rating_slip`, `player_loyalty`, `loyalty_ledger`, `player_financial_transaction`, `mtl_entry`, `audit_log`.  
- **RPC/Functions:** `compute_gaming_day`, `rpc_issue_mid_session_reward`, `rpc_create_financial_txn`.  
- **Events (audit):** Actions on table open/close, slip lifecycle, reward issuance, finance entry.

> Naming conventions are **lower_snake_case** with UUID ids; JSON only for metadata.

---

## 8) Security & Access (RLS/RBAC)

- **Deny-all** baseline; role- and casino-scoped allow paths.  
- Row ownership includes `{casino_id, gaming_day}` where applicable.  
- No service keys in app runtime; all access through PostgREST/server actions with RLS.  
- Audit every state change (who/when/what).

---

## 9) Performance & UX KPIs

- Pit dashboard LCP ≤ **2.5s**.  
- Start/Pause/Resume/Close actions reflect in UI within **2s**.  
- p95 server action latency for slip ops < **400ms** in pilot environment.  
- Zero duplicate rewards under retry scenarios.

---

## 10) Observability

- Structured logs for all domain events with correlation keys: `{casino_id, staff_id, rating_slip_id, visit_id}`.  
- Dashboards: **Active tables**, **Open slips**, **Rewards/hour**, error rate.  
- Alerts: error budget burn and RPC failures (reward/financial).

---

## 11) Constraints & Dependencies

- Single-casino pilot; stable network with occasional latency spikes.  
- Schema must mirror SRM (matrix-first); migrations are gated by matrix conformance.  
- Client calls must use generated `database.types.ts` and DTOs.  
- Timekeeping is server-authoritative; client clocks are advisory only.

---

## 12) Rollout Plan (Flags & Phases)

- **Flags:** `finance_minimal_enabled`, `dealer_rotation_log_readonly`.  
- **Phases:**  
  1) Internal dogfood → 2) Limited pit shift → 3) Full-shift pilot (Go/No-Go) → 4) Stabilization.  
- **Rollback:** Disable feature flags; revert to read-only paths; database migrations forward-only with backout views.

---

## 13) Acceptance & Test Strategy

- **Contract tests** for RPCs and RLS allow-paths.  
- **E2E happy-path** for Stories US-001…US-006.  
- **Idempotency tests** for reward RPC and finance RPC.  
- **Performance tests** covering KPIs and LCP.  
- **Security tests** for least-privilege roles and casino scoping.

---

## 14) Risks & Mitigations

- **Scope creep** → enforce MVP boundaries; defer to Phase-2.  
- **RLS complexity** → test-per-role; start from deny-all.  
- **Schema drift** → CI gate on SRM↔schema conformance.  
- **Perf regressions** → perf budgets per server action; profiling required before merge.

---

## 15) Open Questions

- Do we allow multiple concurrent visits per player for special cases?  
- What is the minimal AOV calc required for MVP UI?  
- Should dealer rotation writes be part of MVP or read-only only?

---

## 16) Traceability Matrix (Feature ↔ Schema/RPC ↔ Tests)

| Feature | Tables/RPC | Primary Tests |
|---|---|---|
| Open/Close Table | `gaming_table`, `gaming_table_settings` | E2E-US-001, RLS-Table |
| Start/Pause/Resume/Close Slip | `rating_slip` | E2E-US-002/003/004, PERF-Slip |
| Mid-Session Reward | `loyalty_ledger`, `rpc_issue_mid_session_reward` | E2E-US-005, IDEMP-Reward |
| Seat Player / Visit | `player`, `visit` | E2E-Seat, RLS-Visit |
| Finance Entry (FF) | `player_financial_transaction`, `rpc_create_financial_txn` | E2E-US-006, IDEMP-Finance |
| MTL Read-Only | `mtl_entry` | VIEW-MTL |

---

## 17) Appendices

- **User Flows (Mermaid)**

```mermaid
sequenceDiagram
  participant PB as Pit Boss
  participant D as Dealer
  participant App as PT-2 App
  participant DB as Supabase (RLS)
  PB->>App: Open Table
  App->>DB: update gaming_table.status=open
  DB-->>App: ok
  D->>App: Start Slip
  App->>DB: insert rating_slip (active)
  D->>App: Issue Mid-Session Reward
  App->>DB: rpc_issue_mid_session_reward(idempotency_key)
  D->>App: Close Slip
  App->>DB: update rating_slip status=closed
```

- **MVP Scope Checklist**: All stories US-001..US-006 implemented; KPIs met; runbooks ready; flags set.

---

## Related Categories

- **V&S** (`/docs/00-vision/`): high-level vision that informs PRD.  
- **ARCH** (`/docs/20-architecture/`): technical design implementing PRD.  
- **QA** (`/docs/40-quality/`): test plans validating PRD acceptance criteria.  
- **REL** (`/docs/60-release/`): release notes tracking PRD delivery.
