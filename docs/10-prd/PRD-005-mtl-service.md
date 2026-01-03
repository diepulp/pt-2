---
id: PRD-005
title: MTL Service - AML/CTR Compliance Tracking
owner: Product
status: Proposed
affects: [ADR-015, ADR-020, SEC-001, SEC-003, SRM-4.9.0, PRD-009]
created: 2026-01-02
last_review: 2026-01-02
phase: Phase 3 (Compliance)
pattern: A
http_boundary: true
version: 1.1.3
---

# PRD-005 — MTL Service: AML/CTR Compliance Tracking

## 1. Overview

- **Owner:** Product
- **Status:** Proposed (v1.1.3)
- **Summary:** MTLService (Monetary Transaction Log) implements an append-only compliance ledger for AML (Anti-Money Laundering) and CTR (Currency Transaction Report) tracking. The service logs all cash-equivalent transactions, applies **two-tier threshold detection** (entry-level badges for UX, daily aggregate badges for compliance), and maintains an immutable audit trail. CTR regulations require aggregating multiple transactions per patron per gaming day (> $10k, "more than"), with cash-in and cash-out tracked separately per FinCEN/IRS guidance.

**Architecture Pattern:** Pattern A (Contract-First) — Manual DTOs for compliance reporting contracts
**Database Access:** ADR-015 Pattern C (Hybrid Pooling + RLS context injection)
> Note: Pattern A refers to service contract/DTOs; Pattern C refers to database access + RLS pooling strategy.

**Bounded Context:** "What cash/monetary transactions occurred for AML/CTR compliance?"

**Key Compliance Insight:** Single-transaction badges are UX conveniences. The **Gaming Day Summary** with daily aggregate badges is the authoritative compliance trigger surface per 31 CFR § 1021.311.

**Threshold Semantics:** CTR obligation triggers when cash-in OR cash-out exceeds (strictly **>**) $10,000 in a gaming day — not ">=" per regulatory text ("more than $10,000").

---

## 2. Problem & Goals

### 2.1 Problem

Casino operations must track cash transactions for federal compliance:
- **CTR Requirement**: Report cash transactions aggregating **> $10,000** ("more than") in a gaming day per 31 CFR § 1021.311
- **Watchlist**: Internal threshold (>= $3,000) triggers enhanced scrutiny
- **Audit Trail**: Every compliance annotation must be immutable and attributable

Current state:
- Database schema exists (`mtl_entry`, `mtl_audit_note` tables)
- Route handlers are scaffolded with TODOs
- No service layer implementation
- No UI for compliance monitoring

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Log all cash transactions | Every buy-in, cash-out, marker recorded with amount, direction, txn_type, source, timestamp |
| **G2**: Two-tier threshold detection | Entry badges (UX) + Daily aggregate badges (compliance authority) |
| **G3**: Separate in/out aggregation | Cash-in and cash-out totals tracked separately per patron per gaming day (per IRS guidance) |
| **G4**: Immutable audit trail | Audit notes append-only; no UPDATE/DELETE on entries or notes |
| **G5**: Idempotent writes | Duplicate transactions with same `idempotency_key` return existing entry |
| **G6**: Gaming day aggregation | Authoritative aggregate view with total_in, total_out, count, max_single per patron |

### 2.3 Non-Goals

- **SAR (Suspicious Activity Report) workflows** — Post-MVP (requires external system integration)
- **Automatic CTR generation/filing** — Post-MVP (depends on SAR infrastructure)
- **Tax ID verification** — Post-MVP (depends on ADR-022 tax identity implementation)
- **Finance-to-MTL automatic streaming** — Post-MVP (ADR-016 outbox pattern)
- **Real-time alerts/notifications** — Post-MVP (requires notification infrastructure)
- **Player aggregation across casinos** — Out of scope (single-tenant per casino)

---

## 3. Users & Use Cases

- **Primary users:** Compliance Officer, Pit Boss, Casino Admin

**Top Jobs:**

- As a **Compliance Officer**, I need to view all transactions meeting watchlist/CTR thresholds so I can assess reporting requirements.
- As a **Compliance Officer**, I need to add audit notes to transactions so I can document compliance decisions and observations.
- As a **Pit Boss**, I need to see a player's current gaming day transaction total so I can make informed decisions about large cash-outs.
- As a **Pit Boss**, I need to log cash transactions immediately as they occur so the compliance record is complete.
- As a **Casino Admin**, I need to review the MTL audit trail for a specific player so I can respond to regulatory inquiries.
- As a **Casino Admin**, I need to configure casino-specific thresholds so I can adjust to local regulations.

---

## 4. Scope & Feature List

### 4.1 In Scope (MVP)

**Entry Creation**
- Log cash transaction with: amount, direction ('in'/'out'), patron, casino, staff
- Transaction typing: `txn_type` (buy_in, cash_out, marker, front_money, chip_fill)
- Source channel: `source` (table, cage, kiosk, other) — enables route anomaly detection
- Optional links: visit_id, rating_slip_id (for lineage tracking)
- Idempotency via `idempotency_key` column
- Gaming day auto-computed via database trigger

**Entry Listing**
- Filter by casino, patron, date range, amount range, txn_type, source
- Cursor-based pagination (keyset pagination)
  - **Cursor format:** `(created_at, id)` tuple encoded as opaque string
  - **Ordering:** Stable descending by `(created_at DESC, id DESC)` — newest first
- Include entry-level threshold badge in response

**Entry Retrieval**
- Get single entry by ID
- Include associated audit notes
- Include computed entry-level threshold badge

**Audit Notes**
- Append note to existing entry
- Immutable (no UPDATE/DELETE)
- Staff attribution required

**Two-Tier Threshold Detection**

*Tier 1: Entry Badge (UX convenience)*
- Watchlist badge: single txn amount >= `casino_settings.watchlist_floor` (default $3,000)
- CTR near badge: single txn amount > 90% of `casino_settings.ctr_threshold`
- CTR met badge: single txn amount **>** `casino_settings.ctr_threshold` (default $10,000) — strictly greater per 31 CFR § 1021.311
- Badge computed at read time (not stored)

*Tier 2: Daily Aggregate Badge (AUTHORITATIVE for compliance)*
- Aggregate per patron + gaming_day + direction (in/out tracked separately per IRS)
- `agg_watchlist`: daily total (in OR out) >= watchlist_floor
- `agg_ctr_near`: daily total (in OR out) > 90% of ctr_threshold
- `agg_ctr_met`: daily total (in OR out) **>** ctr_threshold — strictly greater ("more than $10,000")
- **This is the compliance trigger surface** — Gaming Day Summary is authoritative

**Gaming Day Summary View**
- Per patron + gaming_day aggregate:
  - `total_in`, `total_out`, `net_amount`
  - `count_in`, `count_out`
  - `max_single_in`, `max_single_out`
  - `first_seen_at`, `last_seen_at`
  - `agg_badge_in`, `agg_badge_out` (separate badges per direction)
- Drill-down to individual entries

**UI Dashboard**
- Entry list with entry-level badges
- **Gaming Day Summary** with aggregate badges (compliance authority)
- Filter by threshold level (entry or aggregate)
- Audit note viewer/editor

### 4.2 Telemetry Layer (Post-MVP, Architecturally Planned)

MTL is a **fact table** for cash-equivalent movement + human annotations. From this, derived signals can be computed:

**Planned Signal Types (Post-MVP):**
- **Structuring detection**: Many transactions just under thresholds (classic AML pattern)
- **Velocity flags**: Rapid cash-in → cash-out sequences; high frequency within short windows
- **In/out asymmetry**: Large cash-out with minimal cash-in that day; oscillation patterns
- **Route anomalies**: Buy-in at table/area A, cash-out at cage quickly (uses `source` field)
- **Network signals**: Repeated shared staff across multiple flagged patrons

**Implementation Pattern:**
- Keep `mtl_entry` immutable (record of truth)
- Add `mtl_signal` table (or materialized view) with: `signal_type`, `severity`, `computed_at`, `inputs_hash`, `mtl_entry_id`, `patron_uuid`, `gaming_day`, `details jsonb`
- Signals are **derived telemetry**, not the record of truth

**Data Guardrail:** `details` jsonb must NOT store raw identity documents, PII, or sensitive patron data. Store references/IDs only (e.g., `mtl_entry_id`, `patron_uuid`). Respect casino retention policy; signals inherit TTL from source entries.

### 4.3 Out of Scope

- SAR workflow automation (post-MVP)
- CTR form generation (post-MVP)
- Tax ID lookup integration (post-MVP per ADR-022)
- Finance-to-MTL event streaming (post-MVP per ADR-016)
- Cross-casino aggregation
- Real-time threshold alerts
- Signal generation (post-MVP per §4.2)

---

## 5. Requirements

### 5.1 Functional Requirements

**Entry Management**
- FR-1: System MUST log cash transactions with amount, direction, patron_uuid, casino_id
- FR-2: System MUST capture `txn_type` (buy_in, cash_out, marker, front_money, chip_fill)
- FR-3: System MUST capture `source` channel (table, cage, kiosk, other)
- FR-4: System MUST auto-compute gaming_day via database trigger from `casino_settings`
- FR-5: System MUST enforce idempotency via casino-scoped partial unique index on `(casino_id, idempotency_key)`
- FR-6: Entry creation MUST be append-only via belt+suspenders: no RLS policies + revoked privileges + BEFORE triggers
- FR-7: System MUST support optional FKs to visit, rating_slip, staff for lineage

**Two-Tier Threshold Detection**

*Tier 1: Entry Badge (UX)*
- FR-8: System MUST compute entry-level badge at read time based on single txn amount
- FR-9: Entry badges MUST be: `none`, `watchlist_near`, `ctr_near`, `ctr_met`
- FR-10: Entry badge logic MUST use casino-specific settings, not hardcoded values

*Tier 2: Daily Aggregate Badge (Compliance Authority)*
- FR-11: System MUST provide aggregate view per patron + gaming_day
- FR-12: Aggregates MUST track cash-in and cash-out **separately** (per IRS guidance)
- FR-13: Aggregate badges MUST be computed per direction: `agg_badge_in`, `agg_badge_out`
- FR-14: Aggregate badge types MUST be: `none`, `agg_watchlist`, `agg_ctr_near`, `agg_ctr_met`
- FR-15: Gaming Day Summary MUST be the authoritative compliance trigger surface

**Audit Notes**
- FR-16: Audit notes MUST be append-only (no UPDATE/DELETE)
- FR-17: Audit notes MUST require staff_id attribution
- FR-18: Audit notes MUST include note text (NOT NULL)
- FR-19: System MUST return audit notes with entry detail queries

**Querying**
- FR-20: List endpoint MUST support filters: casino_id, patron_uuid, date range, amount range, txn_type, source
- FR-21: List endpoint MUST use cursor-based pagination (keyset pagination)
- FR-22: Detail endpoint MUST include entry badge and audit notes
- FR-23: System MUST support filtering by entry badge level
- FR-24: Gaming Day Summary endpoint MUST return aggregate data with agg_badges per direction

**Authorization**
> Note: Uses `staff_role` enum only (`dealer`, `pit_boss`, `admin`, `cashier`). No separate compliance claim for MVP.

- FR-25: All MTL routes MUST require authentication
- FR-26: RLS MUST enforce casino-scoped isolation
- FR-27: Entry creation: `pit_boss`, `cashier`, `admin` roles
- FR-28: Audit note creation: `admin` role only
- FR-29: Entry viewing: `pit_boss`, `cashier`, `admin` roles
- FR-30: Gaming Day Summary viewing: `pit_boss`, `admin` roles

### 5.2 Non-Functional Requirements

- **NFR-1**: Entry writes must complete within 200ms p99
- **NFR-2**: Entry reads must complete within 100ms p99
- **NFR-3**: List queries with 100 items must complete within 300ms p99
- **NFR-4**: All entries immutable (append-only; no UPDATE/DELETE)
- **NFR-5**: Audit compliance: every entry/note traceable to staff + timestamp

> Architecture details: See SRM §MTLService, ADR-015 Pattern C, SEC-001

---

## 6. UX / Flow Overview

**Flow 1: Log Cash Transaction**
1. Pit boss processes cash buy-in/cash-out at table
2. System receives transaction details (amount, direction, patron)
3. System validates idempotency key
4. System inserts entry with auto-computed gaming_day
5. System returns entry with threshold badge
6. If threshold met, UI highlights for compliance awareness

**Flow 2: View Transaction with Threshold Badge**
1. Compliance officer opens MTL dashboard
2. System loads entries filtered by casino and date range
3. Each entry displays: amount, direction, patron, timestamp, threshold badge
4. High-threshold entries (ctr_met, ctr_near) visually distinguished
5. Compliance officer can click entry for detail view

**Flow 3: Add Audit Note**
1. Compliance officer views transaction detail
2. Compliance officer clicks "Add Note"
3. System presents note entry form
4. Compliance officer enters note text
5. System appends note with staff_id and timestamp
6. UI shows updated audit trail (newest first)

**Flow 4: Gaming Day Summary**
1. Compliance officer selects "Gaming Day Summary" view
2. System aggregates transactions by patron for selected gaming day
3. System displays per patron: total_in, total_out, net, **agg_badge_in**, **agg_badge_out** (separate badges per direction)
4. Compliance officer identifies patrons where either badge shows `agg_ctr_met` or `agg_ctr_near`
5. Compliance officer can drill down to individual transactions for any patron

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **PRD-HZ-001 (withServerAction middleware)** — COMPLETE; provides auth, RLS
- **PRD-000 (CasinoService)** — COMPLETE; provides `casino_settings` thresholds
- **PRD-003 (PlayerService)** — COMPLETE; provides patron identity
- **PRD-009 (PlayerFinancialService)** — COMPLETE; provides financial context (MVP: manual MTL entry creation; Post-MVP: automatic streaming via ADR-016 outbox)
- **ADR-015 (RLS Connection Pooling)** — COMPLETE; Pattern C hybrid context injection
- **ADR-020 (Track A Hybrid RLS)** — COMPLETE; MVP RLS architecture

### 7.2 Risks & Open Questions

- **Risk: Threshold configuration drift** — If `casino_settings` thresholds change, historical badge calculations may differ. **Mitigation:** Badge computed at read time; document that historical entries show current thresholds.
- **Risk: Gaming day boundary edge cases** — Transactions near midnight could be assigned to wrong gaming day. **Mitigation:** Gaming day computed via `casino_settings.gaming_day_start_time` at insert time.
- **Risk: High volume compliance review** — Large casinos may have thousands of daily transactions. **Mitigation:** Efficient pagination, threshold filtering, and summary aggregation views.
- **Open Question:** Should we store badge at write time for historical accuracy? **Decision:** No - compute at read time. Thresholds may be updated retroactively by regulators.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Entry creation stores all required fields (amount, direction, txn_type, source, patron, casino, staff)
- [ ] Gaming day auto-computed via trigger
- [ ] Idempotency prevents duplicate entries
- [ ] **Entry badges** computed correctly (single txn amount)
- [ ] **Aggregate badges** computed correctly per direction (daily total)
- [ ] Audit notes append successfully with staff attribution
- [ ] List endpoint supports all documented filters (incl. txn_type, source)
- [ ] Cursor pagination works correctly
- [ ] **Gaming Day Summary endpoint** returns aggregates with agg_badges

**Data & Integrity**
- [ ] No duplicate entries for same `(casino_id, idempotency_key)` — casino-scoped index
- [ ] Append-only enforced via belt+suspenders:
  - [ ] No UPDATE/DELETE RLS policies
  - [ ] REVOKE UPDATE, DELETE from authenticated/anon
  - [ ] BEFORE triggers raise exception on UPDATE/DELETE
- [ ] Audit notes immutable (same enforcement pattern)
- [ ] Gaming day matches `casino_settings` temporal authority
- [ ] Cash-in and cash-out tracked separately in aggregates

**Security & Access**
- [ ] RLS enforces casino-scoped isolation
- [ ] Entry creation requires authorized role (pit_boss, cashier, admin)
- [ ] Audit note creation requires admin role
- [ ] Gaming Day Summary requires pit_boss or admin role
- [ ] No cross-casino data leakage in integration tests

**Testing**
- [ ] Unit tests for mappers (Row -> DTO transformations)
- [ ] Unit tests for entry badge logic
- [ ] Unit tests for aggregate badge logic (separate in/out)
- [ ] Integration tests for RLS policy enforcement
- [ ] Integration tests for idempotency behavior
- [ ] Route handler contract tests
- [ ] Gaming Day Summary endpoint tests

**UI**
- [ ] MTL entry list with entry badges
- [ ] **Gaming Day Summary** with aggregate badges (compliance view)
- [ ] Entry detail view with audit trail
- [ ] Audit note creation form
- [ ] Filter by entry badge level
- [ ] Filter by aggregate badge level

**Operational Readiness**
- [ ] Error responses include actionable messages
- [ ] Key operations logged with correlation IDs
- [ ] Service README updated

---

## 9. Related Documents

- **Architecture / SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (MTLService section)
- **Schema / Types**: `types/database.types.ts` (mtl_entry, mtl_audit_note)
- **Security / RLS**: `docs/30-security/SEC-001-rls-policy-matrix.md#mtlservice`
- **Security / RBAC**: `docs/30-security/SEC-003-rbac-matrix.md` (role authorization)
- **Prerequisite PRDs**: PRD-000 (Casino), PRD-003 (Player), PRD-009 (Finance), PRD-HZ-001 (Infrastructure)
- **ADRs**: ADR-015 (RLS Pooling), ADR-020 (Track A Hybrid)

---

## Appendices

> **Note:** Per PRD-STD-001, appendices contain reference material for implementation planning. These specifications will be extracted to canonical docs upon PRD approval:
> - Schema DDL → `docs/25-api-data/MTL-SCHEMA.md`
> - DTOs/Contracts → `docs/25-api-data/MTL-API-SPEC.md`
> - Error codes → SRM error taxonomy update
> - Implementation plan → EXEC-SPEC-005

## Appendix A: Schema Reference

### Enums

```sql
-- Transaction type classification
CREATE TYPE mtl_txn_type AS ENUM (
  'buy_in',       -- Cash to chips at table
  'cash_out',     -- Chips to cash at cage
  'marker',       -- Credit instrument
  'front_money',  -- Deposit/withdrawal
  'chip_fill'     -- Table chip inventory
);

-- Transaction source channel
CREATE TYPE mtl_source AS ENUM (
  'table',  -- Gaming table transaction
  'cage',   -- Cashier cage
  'kiosk',  -- Self-service kiosk
  'other'   -- Other source
);
```

### Tables

```sql
-- mtl_entry (immutable cash transaction log)
-- Write-once: no UPDATE or DELETE allowed
CREATE TABLE mtl_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patron_uuid uuid NOT NULL REFERENCES player(id),
  casino_id uuid NOT NULL REFERENCES casino(id),
  staff_id uuid REFERENCES staff(id),
  rating_slip_id uuid REFERENCES rating_slip(id),
  visit_id uuid REFERENCES visit(id),
  amount numeric NOT NULL,
  direction text NOT NULL,                    -- 'in' or 'out'
  txn_type mtl_txn_type NOT NULL,             -- Transaction classification
  source mtl_source NOT NULL DEFAULT 'table', -- Source channel
  area text,                                  -- Optional floor area
  gaming_day date,                            -- Auto-computed via trigger
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text                        -- For deduplication
);

-- Idempotency enforcement (casino-scoped, partial unique index)
-- Scoped to casino_id to prevent cross-casino collisions
CREATE UNIQUE INDEX ux_mtl_entry_idem
  ON mtl_entry (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Query optimization
CREATE INDEX ix_mtl_casino_time
  ON mtl_entry (casino_id, created_at DESC);

CREATE INDEX ix_mtl_patron_day
  ON mtl_entry (patron_uuid, gaming_day);

CREATE INDEX ix_mtl_gaming_day_direction
  ON mtl_entry (casino_id, gaming_day, direction);
```

### Aggregate View (Gaming Day Summary)

```sql
-- mtl_gaming_day_summary (aggregates for compliance)
-- Per patron + gaming_day with separate in/out totals
CREATE VIEW mtl_gaming_day_summary AS
SELECT
  casino_id,
  patron_uuid,
  gaming_day,
  -- Cash-in aggregates
  SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END) AS total_in,
  COUNT(CASE WHEN direction = 'in' THEN 1 END) AS count_in,
  MAX(CASE WHEN direction = 'in' THEN amount END) AS max_single_in,
  MIN(CASE WHEN direction = 'in' THEN created_at END) AS first_in_at,
  MAX(CASE WHEN direction = 'in' THEN created_at END) AS last_in_at,
  -- Cash-out aggregates
  SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END) AS total_out,
  COUNT(CASE WHEN direction = 'out' THEN 1 END) AS count_out,
  MAX(CASE WHEN direction = 'out' THEN amount END) AS max_single_out,
  MIN(CASE WHEN direction = 'out' THEN created_at END) AS first_out_at,
  MAX(CASE WHEN direction = 'out' THEN created_at END) AS last_out_at,
  -- Overall
  SUM(amount) AS total_volume,
  COUNT(*) AS entry_count
FROM mtl_entry
GROUP BY casino_id, patron_uuid, gaming_day;
```

```sql
-- mtl_audit_note (append-only compliance annotations)
-- Write-once: no UPDATE or DELETE allowed
CREATE TABLE mtl_audit_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mtl_entry_id uuid NOT NULL REFERENCES mtl_entry(id),
  staff_id uuid REFERENCES staff(id),
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_mtl_note_entry
  ON mtl_audit_note (mtl_entry_id, created_at DESC);
```

### RLS Policies (Reference)

> Uses `staff_role` enum only. No compliance_officer role (use admin for compliance operations).

```sql
-- mtl_entry SELECT: casino-scoped (pit_boss, cashier, admin)
-- mtl_entry INSERT: pit_boss, cashier, admin
-- mtl_entry UPDATE: DENIED
-- mtl_entry DELETE: DENIED

-- mtl_audit_note SELECT: via parent mtl_entry casino scope
-- mtl_audit_note INSERT: admin only
-- mtl_audit_note UPDATE: DENIED
-- mtl_audit_note DELETE: DENIED
```

### Append-Only Enforcement (Belt + Suspenders)

RLS alone is **not sufficient** for append-only guarantees because:
- `service_role` bypasses RLS
- `SECURITY DEFINER` functions bypass RLS
- Privilege grants control actual access

**Required enforcement layers:**

```sql
-- 1. NO UPDATE/DELETE RLS policies (omit entirely, or explicit deny)
-- Already done above

-- 2. REVOKE UPDATE/DELETE privileges from app roles
REVOKE UPDATE, DELETE ON mtl_entry FROM authenticated;
REVOKE UPDATE, DELETE ON mtl_entry FROM anon;
REVOKE UPDATE, DELETE ON mtl_audit_note FROM authenticated;
REVOKE UPDATE, DELETE ON mtl_audit_note FROM anon;

-- 3. Trigger as final defense (catches service_role / SECURITY DEFINER bypass)
CREATE OR REPLACE FUNCTION trg_mtl_entry_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'mtl_entry is immutable: UPDATE/DELETE not allowed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mtl_entry_no_update
  BEFORE UPDATE ON mtl_entry
  FOR EACH ROW EXECUTE FUNCTION trg_mtl_entry_immutable();

CREATE TRIGGER trg_mtl_entry_no_delete
  BEFORE DELETE ON mtl_entry
  FOR EACH ROW EXECUTE FUNCTION trg_mtl_entry_immutable();

-- Same pattern for mtl_audit_note
CREATE TRIGGER trg_mtl_audit_note_no_update
  BEFORE UPDATE ON mtl_audit_note
  FOR EACH ROW EXECUTE FUNCTION trg_mtl_entry_immutable();

CREATE TRIGGER trg_mtl_audit_note_no_delete
  BEFORE DELETE ON mtl_audit_note
  FOR EACH ROW EXECUTE FUNCTION trg_mtl_entry_immutable();
```

**Enforcement summary:**
| Layer | Protects Against | Mechanism |
|-------|------------------|-----------|
| RLS (no policy) | Regular authenticated queries | Policy absence = deny |
| REVOKE privileges | Direct table access | Privilege removal |
| BEFORE triggers | service_role, SECURITY DEFINER | Exception on attempt |

---

## Appendix B: Service Contracts

### DTOs (Pattern A - Manual)

```typescript
// services/mtl/dtos.ts

// === Enums ===

export type MtlTxnType = 'buy_in' | 'cash_out' | 'marker' | 'front_money' | 'chip_fill';
export type MtlSource = 'table' | 'cage' | 'kiosk' | 'other';

// Entry-level badge (UX convenience)
export type EntryBadge = 'none' | 'watchlist_near' | 'ctr_near' | 'ctr_met';

// Aggregate badge (COMPLIANCE AUTHORITY)
export type AggBadge = 'none' | 'agg_watchlist' | 'agg_ctr_near' | 'agg_ctr_met';

// === Entry DTOs ===

export interface MtlEntryDTO {
  id: string;
  patron_uuid: string;
  casino_id: string;
  staff_id: string | null;
  rating_slip_id: string | null;
  visit_id: string | null;
  amount: number;
  direction: 'in' | 'out';
  txn_type: MtlTxnType;
  source: MtlSource;
  area: string | null;
  gaming_day: string | null;
  created_at: string;
  entry_badge: EntryBadge;  // Per-transaction badge (UX)
}

export interface MtlEntryWithNotesDTO extends MtlEntryDTO {
  audit_notes: MtlAuditNoteDTO[];
}

export interface MtlAuditNoteDTO {
  id: string;
  mtl_entry_id: string;
  staff_id: string | null;
  note: string;
  created_at: string;
}

// === Gaming Day Summary DTOs (Compliance Authority) ===

export interface MtlGamingDaySummaryDTO {
  casino_id: string;
  patron_uuid: string;
  gaming_day: string;
  // Cash-in aggregates
  total_in: number;
  count_in: number;
  max_single_in: number | null;
  first_in_at: string | null;
  last_in_at: string | null;
  agg_badge_in: AggBadge;  // Aggregate badge for cash-in (COMPLIANCE)
  // Cash-out aggregates
  total_out: number;
  count_out: number;
  max_single_out: number | null;
  first_out_at: string | null;
  last_out_at: string | null;
  agg_badge_out: AggBadge;  // Aggregate badge for cash-out (COMPLIANCE)
  // Overall
  total_volume: number;
  entry_count: number;
}

// === Input DTOs ===

export interface CreateMtlEntryInput {
  patron_uuid: string;
  casino_id: string;
  staff_id?: string;
  rating_slip_id?: string;
  visit_id?: string;
  amount: number;
  direction: 'in' | 'out';
  txn_type: MtlTxnType;
  source?: MtlSource;  // Defaults to 'table'
  area?: string;
  idempotency_key: string;
}

export interface CreateMtlAuditNoteInput {
  mtl_entry_id: string;
  staff_id: string;
  note: string;
}

// === Filter DTOs ===

export interface MtlEntryFilters {
  casino_id: string;
  patron_uuid?: string;
  gaming_day?: string;
  min_amount?: number;
  txn_type?: MtlTxnType;
  source?: MtlSource;
  entry_badge?: EntryBadge;
  cursor?: string;
  limit?: number;
}

export interface MtlGamingDaySummaryFilters {
  casino_id: string;
  gaming_day: string;
  patron_uuid?: string;
  agg_badge_in?: AggBadge;
  agg_badge_out?: AggBadge;
  min_total_in?: number;
  min_total_out?: number;
  cursor?: string;
  limit?: number;
}
```

### API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/mtl/entries` | Create MTL entry |
| GET | `/api/v1/mtl/entries` | List entries with filters |
| GET | `/api/v1/mtl/entries/[entryId]` | Get entry detail with notes |
| POST | `/api/v1/mtl/entries/[entryId]/audit-notes` | Add audit note |
| GET | `/api/v1/mtl/gaming-day-summary` | **Gaming Day Summary (Compliance Authority)** |

### Response Format

```typescript
// Success: Entry created (201)
{
  ok: true,
  data: MtlEntryDTO,
  requestId: string,
  timestamp: string
}

// Success: Entry exists (200) - idempotent replay
{
  ok: true,
  data: MtlEntryDTO,
  requestId: string,
  timestamp: string
}

// List response
{
  ok: true,
  data: {
    items: MtlEntryDTO[],
    next_cursor: string | null
  },
  requestId: string,
  timestamp: string
}
```

---

## Appendix C: Error Codes

Per SRM Error Taxonomy:

**MTL Domain**
| Code | HTTP | Description |
|------|------|-------------|
| `MTL_ENTRY_NOT_FOUND` | 404 | Referenced MTL entry does not exist |
| `MTL_IDEMPOTENCY_CONFLICT` | 409 | Different payload for same idempotency_key |
| `MTL_INVALID_AMOUNT` | 400 | Amount must be positive number |
| `MTL_INVALID_DIRECTION` | 400 | Direction must be 'in' or 'out' |
| `MTL_NOTE_REQUIRED` | 400 | Audit note text is required |
| `MTL_PATRON_NOT_FOUND` | 404 | Referenced patron does not exist |
| `MTL_UNAUTHORIZED_CREATE` | 403 | Caller lacks authority to create entry |
| `MTL_UNAUTHORIZED_ANNOTATE` | 403 | Caller lacks authority to add audit notes |

---

## Appendix D: Two-Tier Threshold Badge Logic

### Tier 1: Entry Badge (UX Convenience)

```typescript
// services/mtl/view-model.ts

export function deriveEntryBadge(
  amount: number,
  thresholds: CasinoThresholds,
): EntryBadge {
  // CTR: strictly > ("more than $10,000") per 31 CFR § 1021.311
  if (amount > thresholds.ctrThreshold) {
    return 'ctr_met';
  }
  if (amount > thresholds.ctrThreshold * 0.9) {
    return 'ctr_near';
  }
  // Watchlist: >= (internal threshold, not regulatory)
  if (amount >= thresholds.watchlistFloor) {
    return 'watchlist_near';
  }
  return 'none';
}
```

### Tier 2: Aggregate Badge (COMPLIANCE AUTHORITY)

```typescript
// services/mtl/view-model.ts

/**
 * Derive aggregate badge for a direction's daily total.
 * This is the AUTHORITATIVE compliance trigger per 31 CFR § 1021.311.
 * Cash-in and cash-out are evaluated SEPARATELY per IRS guidance.
 *
 * IMPORTANT: CTR uses strictly > ("more than $10,000"), NOT >=
 */
export function deriveAggBadge(
  dailyTotal: number,
  thresholds: CasinoThresholds,
): AggBadge {
  // CTR: strictly > ("more than $10,000") per 31 CFR § 1021.311
  if (dailyTotal > thresholds.ctrThreshold) {
    return 'agg_ctr_met';
  }
  if (dailyTotal > thresholds.ctrThreshold * 0.9) {
    return 'agg_ctr_near';
  }
  // Watchlist: >= (internal threshold, not regulatory)
  if (dailyTotal >= thresholds.watchlistFloor) {
    return 'agg_watchlist';
  }
  return 'none';
}

// Usage: Gaming Day Summary computes aggregate badges per direction
export function enrichGamingDaySummary(
  summary: RawGamingDaySummary,
  thresholds: CasinoThresholds,
): MtlGamingDaySummaryDTO {
  return {
    ...summary,
    agg_badge_in: deriveAggBadge(summary.total_in, thresholds),
    agg_badge_out: deriveAggBadge(summary.total_out, thresholds),
  };
}
```

**Default Thresholds (from casino_settings):**
- `watchlist_floor`: $3,000 (comparison: `>=`)
- `ctr_threshold`: $10,000 (comparison: strictly `>` — "more than")

**Compliance Note:** Single-transaction badges (Tier 1) are UX helpers. The Gaming Day Summary with aggregate badges (Tier 2) is the authoritative compliance trigger surface. CTR obligations arise when a patron's **daily aggregate** (not single transaction) **exceeds** $10,000 (strictly `>`, not `>=`), and cash-in/cash-out are tracked separately per FinCEN/IRS guidance.

---

## Appendix E: Implementation Plan

### Workstreams

**WS0: Database Migration**
- [ ] Add `mtl_txn_type` enum
- [ ] Add `mtl_source` enum
- [ ] Add `txn_type` and `source` columns to `mtl_entry`
- [ ] Fix idempotency index: `UNIQUE (casino_id, idempotency_key)` — casino-scoped
- [ ] Create `mtl_gaming_day_summary` view
- [ ] Add index for gaming_day + direction queries
- [ ] Append-only enforcement (belt+suspenders):
  - [ ] REVOKE UPDATE, DELETE on mtl_entry from authenticated/anon
  - [ ] REVOKE UPDATE, DELETE on mtl_audit_note from authenticated/anon
  - [ ] Create `trg_mtl_entry_immutable()` function
  - [ ] Create BEFORE UPDATE/DELETE triggers on mtl_entry
  - [ ] Create BEFORE UPDATE/DELETE triggers on mtl_audit_note

**WS1: Service Layer (Pattern A)**
- [ ] `services/mtl/dtos.ts` — Manual DTO interfaces (with two-tier badges)
- [ ] `services/mtl/schemas.ts` — Zod validation schemas (with txn_type, source)
- [ ] `services/mtl/selects.ts` — Named column projections
- [ ] `services/mtl/mappers.ts` — Row → DTO transformers (entry + aggregate)
- [ ] `services/mtl/crud.ts` — Database operations
- [ ] `services/mtl/index.ts` — Service factory export
- [ ] Update `view-model.ts` — Add `deriveAggBadge()`, `enrichGamingDaySummary()`

**WS2: Route Handler Integration**
- [ ] Wire POST `/entries` to `createEntry()` (with txn_type, source)
- [ ] Wire GET `/entries` to `listEntries()` (with new filters)
- [ ] Wire GET `/entries/[id]` to `getEntry()`
- [ ] Wire POST `/entries/[id]/audit-notes` to `createAuditNote()`
- [ ] **NEW** Wire GET `/gaming-day-summary` to `getGamingDaySummary()`

**WS3: Testing**
- [ ] Mapper unit tests
- [ ] Entry badge unit tests (existing, rename)
- [ ] **NEW** Aggregate badge unit tests (with separate in/out totals)
- [ ] CRUD integration tests
- [ ] RLS policy tests
- [ ] Route handler contract tests
- [ ] Gaming Day Summary endpoint tests

**WS4: UI Components**
- [ ] `components/mtl/entry-list.tsx` — Entry table with entry badges
- [ ] `components/mtl/entry-detail.tsx` — Detail view with notes
- [ ] `components/mtl/entry-badge.tsx` — Entry-level badge component (UX)
- [ ] `components/mtl/agg-badge.tsx` — **Aggregate badge component (Compliance)**
- [ ] `components/mtl/gaming-day-summary.tsx` — **Summary table with agg badges**
- [ ] `components/mtl/audit-note-form.tsx` — Note creation form
- [ ] `app/(dashboard)/compliance/page.tsx` — Dashboard with summary view

---

## Appendix F: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-02 | Lead Architect | Initial draft per lead-architect skill |
| 1.1.0 | 2026-01-02 | Lead Architect | **Critical compliance fix**: Two-tier badge system (entry vs aggregate). Added `txn_type`, `source` fields. Added `mtl_gaming_day_summary` view. Separate in/out aggregation per IRS guidance. Gaming Day Summary as authoritative compliance trigger. Telemetry layer planning (post-MVP). |
| 1.1.1 | 2026-01-02 | Lead Architect | **Regulatory accuracy fix**: CTR threshold uses strictly `>` ("more than $10,000") per 31 CFR § 1021.311, not `>=`. Updated all threshold comparisons and documentation. |
| 1.1.2 | 2026-01-02 | Lead Architect | **Schema/integrity fix**: (1) Idempotency index now casino-scoped `UNIQUE (casino_id, idempotency_key)`. (2) Append-only enforcement explicit: no RLS policies + REVOKE privileges + BEFORE triggers (belt+suspenders). |
| 1.1.3 | 2026-01-02 | Lead Architect | **Standards compliance**: (1) SRM version corrected to v4.9.0. (2) Removed `compliance_officer` role — uses `staff_role` enum only (pit_boss, cashier, admin). (3) Clarified PRD-009 dependency: manual MTL creation for MVP, automatic streaming post-MVP. (4) Added SEC-003 RBAC link. (5) Cursor format defined as `(created_at, id)` tuple. (6) Gaming Day Summary flow updated with dual badges. (7) Telemetry PII guardrail added. (8) Appendix extraction plan per PRD-STD-001. |
