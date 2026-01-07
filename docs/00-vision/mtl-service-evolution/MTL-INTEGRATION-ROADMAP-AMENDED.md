# MTL Integration Roadmap (Amended / MVP-Scope)
*Status:* Draft (amended for MVP scope)  
*Last updated:* 2026-01-05  
*Primary audience:* Pit Ops (Pit Boss), Engineering, Compliance stakeholders (read-only)

---

## 0) Executive summary

This roadmap defines an **MVP-grade** approach for **MTL logging as a daily pit workflow**, comparable in operational importance to rating-slip telemetry. The system will:

- **Derive MTL entries from pit cash financial transactions** (source-of-truth: `player_financial_transaction`).
- **Link** derived MTL entries to **player + visit** (required) and to **rating slip** (optional convenience link).
- Provide **accountability** (who logged/confirmed/edited, when, and why) without building CTR filing workflows.
- Maintain space for **future CTR** workflows (identity collection, signatures, filing artifacts) as **explicitly out of scope**.

This document intentionally **removes “event bus / consumer service ceremony”** in favor of a **single-database, atomic derivation** approach.

---

## 1) Scope and boundaries

### In scope (MVP)
1. **Automated derivation**
   - On insert of eligible **pit cash** transactions, create a corresponding **derived MTL entry**.
2. **Manual MTL entries**
   - Pit boss can create an MTL entry manually (e.g., telemetry is late/missing), with a required note and audit attribution.
3. **Daily aggregation telemetry**
   - Compute per-player per-gaming-day totals for:
     - `cash_in_total_currency`
     - `cash_out_total_currency`
   - Track threshold state (e.g., 90% and >$10,000) as operational signals.
4. **Accountability**
   - Immutable creation metadata + audit trail for edits/corrections.

### Explicitly out of scope (MVP)
- **CTRC / CTR filing workflows**
  - No SSN/DOB/address collection, no signatures, no attachments, no case management, no filing/export requirements.
- **Cashier instrument workflows**
  - No wires, checks, money orders, currency exchange, front money/safekeeping cage operations, etc.
- **Distributed event architecture**
  - No outbox streams, Kafka/NATS, consumer daemons, schema registry, “Event Bus” abstraction.

---

## 2) Regulatory alignment (telemetry only; not CTR workflow)

Even though CTR filing is out of scope, the **telemetry taxonomy** is aligned to the federal definition of casino “transactions in currency” separated into **cash in** and **cash out**.

- **Cash in** examples include “purchases of chips, tokens, and other gaming instruments.”
- **Cash out** examples include “redemptions of chips, tokens, and other gaming instruments.”
- **Do not offset** cash-out against cash-in for aggregation; they are tracked separately.
- Casinos maintain **one gaming day** common across divisions to support aggregation.

> We use these as *data semantics* to keep totals and dashboards coherent, while explicitly deferring CTR filing and identity capture.

---

## 3) Data model contracts (MVP)

### 3.1 `player_financial_transaction` (source-of-truth)
MVP contract additions/requirements:

- `visit_id` **REQUIRED**
  - Rated visits, non-rated visits, and ghost visits provide sufficient containers to ensure every pit cash txn is attributable.
- `channel` / origin marker
  - Must distinguish pit-originated txns (e.g., `channel = 'pit'`), so MTL derivation stays within pit scope.
- `is_currency` **true** for pit cash txns
  - Pit handles cash only in MVP.
- `txn_type`
  - Must include at least: `chip_purchase` and `chip_redemption` (names may vary; mapping table is allowed).
- Optional convenience link: `rating_slip_id`
  - Captured because the rating slip UI is where txns are entered; **not** a trigger.

### 3.2 `mtl_entry` (derived + manual)
Required attributes:

- `casino_id`
- `gaming_day`
- `player_id`
- `visit_id` (required)
- `occurred_at` (txn timestamp or manual entry time)
- `amount` (currency amount)
- `direction` (`cash_in` | `cash_out`)
- `source` (`derived` | `manual`)
- `created_by_staff_id`
- `note` (required for manual; optional for derived)
- Derivation pointers (derived only):
  - `source_financial_txn_id`
  - `idempotency_key`

### 3.3 Idempotency & correctness invariants
- **Invariant A:** at most **one derived MTL entry per eligible financial txn**.
  - Enforce with a unique constraint on `(casino_id, idempotency_key)`, where:
    - `idempotency_key = 'fin:' || source_financial_txn_id`
- **Invariant B:** cash-in and cash-out are aggregated **separately** (no offsets).
- **Invariant C:** manual entries never mutate derived rows; corrections are **append-only** (preferred) or explicitly audited if edits allowed.

---

## 4) Derivation mapping (pit cash only)

### Eligible transaction filter
A financial txn is MTL-eligible if:

- `channel == 'pit'`
- `is_currency == true`
- `txn_type` maps to one of:
  - `cash_in` (e.g., chip purchase / buy-in)
  - `cash_out` (e.g., chip redemption / cash-out)

### Direction mapping (MVP)
- `chip_purchase` → `cash_in`
- `chip_redemption` → `cash_out`

> Anything beyond pit cash is intentionally excluded in MVP.

---

## 5) Architecture (reduced complexity)

### MVP approach: DB-atomic derivation (choose one)
**Option A — Single RPC transaction (preferred for clarity/testing)**
- `rpc_create_financial_txn(...)`:
  1) Validates RLS context (casino_id, actor_id, staff_role)
  2) Inserts `player_financial_transaction`
  3) If eligible, inserts `mtl_entry` (derived) using `source_financial_txn_id`
  4) Returns txn (and optionally derived mtl_entry id)

**Option B — DB trigger**
- AFTER INSERT trigger on `player_financial_transaction`:
  - If eligible, inserts `mtl_entry` with idempotency protection.

> Either option avoids “event bus / consumer service” overhead while preserving correctness.

### Realtime UI (not a compliance invariant)
Realtime is a *delivery optimization*, not the core invariant.

MVP acceptable choices:
- **Polling**: refresh pit dashboards every 30–60s (simple, robust).
- **Realtime subscription**: subscribe to `mtl_entry` / `mtl_alert` inserts for faster UI updates.

**Compliance-ish invariants** (threshold crossing detection) should be computed/persisted server-side.

---

## 6) Threshold state and alerts (MVP-friendly)

We do not file CTRC, but we do want pit awareness and accountability.

### Minimal server-side alert persistence
Create either:
- a `mtl_alert` table, or
- a `mtl_state` row per (casino_id, gaming_day, player_id)

States (per direction):
- `none`
- `approaching` (>= 90% of $10,000)
- `threshold_crossed` (> $10,000)

**Important:** Evaluate and store state separately for `cash_in` and `cash_out` (no offset).

---

## 7) Roadmap phases (simplified)

### Phase 1 — Automation + linkage (MVP core)
**Deliverables**
- `player_financial_transaction.visit_id` required (and enforced)
- DB-atomic derivation (RPC or trigger)
- `mtl_entry` derived rows created for eligible pit cash txns
- Manual MTL entry endpoint + UI entry form
- Idempotency constraint in DB

**Definition of Done**
- Insert eligible txn twice (retry) → still one derived MTL entry
- Derived MTL entry always links to player + visit
- Manual entry requires note + staff attribution

### Phase 2 — Pit dashboard operationalization
**Deliverables**
- Per-player/day aggregates in UI (cash-in/out totals)
- Optional realtime delivery (subscription) or polling baseline
- Basic filtering: gaming day, table/pit area (if available), threshold state

**Definition of Done**
- Two staff users see the same updated aggregates within agreed refresh window
- No client-side threshold math required for correctness (UI is display-only)

### Phase 3 — Accountability hardening
**Deliverables**
- Audit log entries for manual entries and edits/corrections
- Append-only correction workflow recommended
- Simple “who did what” views for supervisors/compliance reviewers

**Definition of Done**
- For any MTL entry, you can reconstruct: created_by, created_at, and change history.

### Phase 4 — CTR workflow (explicit Post‑MVP)
**Deliverables (future)**
- Identity collection (SSN/DOB/address), signature capture, attachments
- Filing artifacts and compliance case management

**Note**
- This phase is intentionally removed from MVP planning to avoid scope creep.

---

## 8) Risks and mitigations

- **Risk:** treating rating slip as trigger re-couples domains  
  **Mitigation:** enforce “trigger = financial txn”; slip is a link only.
- **Risk:** missing visit_id breaks accountability  
  **Mitigation:** require visit_id; use ghost visits where necessary.
- **Risk:** realtime complexity (fragile subscriptions)  
  **Mitigation:** polling baseline; realtime is optional enhancement.
- **Risk:** corrections/editing causes compliance ambiguity  
  **Mitigation:** append-only corrections; audit everything.

---

## 9) References (telemetry semantics)

> URLs are provided as plain text inside a code block for portability.

```text
31 CFR § 1021.311 (Filing obligations; cash-in/cash-out examples)
- https://www.ecfr.gov/current/title-31/subtitle-B/chapter-X/part-1021/section-1021.311

FinCEN FAQ (Casino recordkeeping/reporting): “cash-in and cash-out aggregated separately; must not be offset”
- https://www.fincen.gov/resources/statutes-regulations/guidance/frequently-asked-questions-casino-recordkeeping-reporting

FIN-2009-G004 (single gaming day common across departments supports aggregation)
- https://www.fincen.gov/system/files/shared/fin-2009-g004.pdf

FinCEN CTRC consumer pamphlet (why casinos ask for ID for CTRC; demonstrates CTR identity collection is tied to CTR filing, not MTL telemetry)
- https://www.fincen.gov/system/files/shared/CTR-CPamphlet.pdf
```

- [PRD-005: MTL Service](../10-prd/PRD-005-mtl-service.md)
- [ADR-016: Finance Service Event Architecture](../80-adrs/ADR-016-finance-event-architecture.md)
- [COMP-002: MTL Compliance Standard](../30-security/compliance/COMP-002-mtl-compliance-standard.md)
- [31 CFR § 1021.311: Currency Transaction Reports](https://www.ecfr.gov/current/title-31/subtitle-B/chapter-X/part-1021/subpart-C/section-1021.311)
