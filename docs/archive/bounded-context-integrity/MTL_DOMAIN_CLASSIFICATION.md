## Compliance / AML – Multiple Transaction Log (MTL) Service

### Domain Classification
**Type:** Compliance / Regulatory  
**Context Kind:** Bounded Context (Core–Supporting Hybrid)  
**Primary Role:** Monitor and aggregate **cash-in / cash-out transactions** for anti-money-laundering (AML) and **Currency Transaction Reporting (CTR)** compliance.  
**Data Sensitivity:** High (monetary and personally identifiable transaction data).  
**Primary Consumers:** Compliance Officers, Accounting, Gaming Supervisors, System Auditors.  

---

### 1. Purpose & Responsibilities

The **MTL Service** is the casino’s core compliance subsystem responsible for maintaining **immutable, auditable records of monetary movement** within the gaming floor and cage operations.  
Its purpose is to **detect structuring**, **support CTR filings**, and **enrich compliance investigations** with precise transaction timelines tied to both patrons and staff activity.

**Key responsibilities:**

| Responsibility | Description |
|----------------|-------------|
| **Transaction Logging** | Record all reportable patron cash-in and cash-out transactions above the operational threshold (typically $2,500–$3,000). |
| **Aggregation** | Aggregate transactions per patron and gaming day for CTR threshold detection (≥ $10,000) and watchlist floor alerts (≥ $3,000). |
| **Gaming Day Normalization** | Derive and stamp each transaction with the casino’s configured gaming day boundary (e.g., 06:00 local). |
| **Threshold Detection** | Classify daily patron totals into *normal*, *watchlist*, or *CTR* categories and surface alerts. |
| **Compliance Reporting** | Generate immutable daily exports for Accounting and AML filing systems (CTR/structuring). |
| **Audit Trail & Retention** | Maintain 5+ year retention with full immutability; edits limited to appended audit notes. |
| **Cross-Domain Correlation (Read-Only)** | Read from Loyalty, RatingSlip, and Casino Settings for contextual enrichment of cases (never writes back). |

---

### 2. Relationships to Other Domains

#### a) **Casino / Core Settings**
- **Dependency Type:** Configuration source.
- **Reads:** `CasinoSettings` (timezone, gamingDayStart, thresholds).
- **Purpose:** To compute `gaming_day` consistently across systems.

#### b) **Player / Patron Domain**
- **Dependency Type:** Referential (identity correlation).
- **Reads:** `player.id`, `player.name` (when carded).
- **Writes:** None.
- **Purpose:** Link cash transactions to a patron profile or anonymous descriptor.

#### c) **Staff / Authentication**
- **Dependency Type:** Referential + Access Control.
- **Reads:** `staff.id`, `staff.role`, `staff.signature`.
- **Writes:** None.
- **Purpose:** Enforce accountability for who recorded each transaction.

#### d) **RatingSlip Domain**
- **Dependency Type:** Referential (session context).
- **Reads:** `rating_slip.id`, `visit_id`, `gaming_table_id`.
- **Purpose:** Associate MTL entries to a gaming session for behavioral reconstruction.

#### e) **Loyalty Service**
- **Dependency Type:** **Read-only contextual enrichment** (see below).
- **Reads:**  
  From `loyalty_ledger`:  
  - `player_id`  
  - `rating_slip_id` / `session_id`  
  - `transaction_type` (GAMEPLAY | MANUAL_BONUS | PROMOTION)  
  - `points_change`, `created_at`, `staff_id`, `reason`, `source`  
  - `correlation_id`, `idempotency_key`  

  Optionally from `player_loyalty`:  
  - `tier` (descriptive only)  

- **Writes:** None (strictly prohibited).  
- **Purpose:** Provide **contextual insight** for compliance analysts reviewing monetary patterns.

**Why MTL reads Loyalty (read-only, contextual):**
- **Correlation & audit:** Cross-reference `rating_slip_id` and `player_id` to align cash/chip transactions with loyalty events (bonuses, comps).  
- **Staff oversight:** Identify abnormal manual bonus frequency or timing near cash spikes (potential collusion).  
- **Case enrichment:** When reviewing a suspicious pattern, display nearby Loyalty events in the same timeline.  
- **Operational triage:** Assess whether bonuses coincided with threshold breaches for narrative building.

**What MTL does *not* do with Loyalty:**
- ❌ No monetary inference from points (points ≠ cash).  
- ❌ No AML risk scoring based on loyalty tiers or point totals.  
- ❌ No write operations to Loyalty (one-way read).  
- ✅ Read-only joins using session or rating_slip correlation IDs.

**Boundary Rule of Thumb:**  
> *Loyalty → MTL = read-only enrichment for compliance oversight;  
> MTL’s authoritative domain remains cash/chip flow, KYC, and CTR filings.*

---

### 3. Interfaces & Data Flow

| Direction | Source → Target | Purpose | Nature |
|------------|----------------|----------|--------|
| **Inbound** | Staff UI → MTL Service | Record transactions, notes, reports | Synchronous |
|  | Scheduler → MTL Service | Daily export trigger | Batch |
| **Outbound** | MTL → Accounting | CSV daily CTR/Watchlist exports | Batch |
|  | MTL → Compliance Dashboard | Aggregates, alerts, audit queries | API/View |
| **Cross-Context Reads** | MTL → Loyalty, Player, RatingSlip | Contextual correlation | Read-only |

---

### 4. Data Ownership

| Table/View | Owner | Access |
|-------------|--------|--------|
| `mtl_entry` | MTL Service | Read/Write (insert-only, immutable) |
| `casino_settings` | Casino Domain | Read-only |
| `mtl_patron_aggregates` | MTL Service | Read-only (derived view) |
| `mtl_threshold_monitor` | MTL Service | Read-only (derived view) |
| `loyalty_ledger`, `player_loyalty` | Loyalty Service | Read-only via contextual API/view |
| `rating_slip` | RatingSlip Domain | Read-only (reference only) |

---

### 5. Integration Pattern

- **Architecture Style:** *Modular Monolith* with bounded contexts.  
- **Integration Mechanism:**  
  - Internal read models (SQL joins/views) for same-DB access.  
  - REST/RPC gateway for external service data (Loyalty/Player) if isolation increases.  
  - No asynchronous coupling (no event queue) at MVP stage.  

**Future-proofing:**  
Domain events (`MtlEntryRecorded`, `MtlThresholdApproaching`, `MtlCtrCandidateDetected`) are defined but not externally published. They can later drive alerts or sync to an external AML case system.

---

### 6. Service Responsibilities (Matrix Entry)

| Layer | Responsibility | Notes |
|--------|----------------|-------|
| **Domain** | Enforce invariants (immutable entries, valid identity fields, non-negative amount). | Central MTL logic |
| **Application** | Coordinate CRUD, queries, and threshold checks. | Implements ServiceResult pattern |
| **Infrastructure** | Persist to PostgreSQL via Prisma; expose aggregation views; compute gaming day via trigger. | Minimal adapters only |
| **Integration** | Read-only enrichment from Loyalty and RatingSlip; exports to CSV. | No bidirectional coupling |
| **UI / API** | Record form, threshold dashboard, report downloads. | Lean React Query + Next.js app |

---

### 7. Data Lifecycle & Retention

- **Write-once:** `INSERT` only; no hard deletes.  
- **Mutable fields:** Only `notes` via `addAuditNote()`.  
- **Retention:** ≥ 5 years (regulatory minimum).  
- **Archival:** Nightly backup and secure WORM (Write-Once-Read-Many) storage.

---

### 8. Scale Alignment

- ~1 k transactions/day → no need for CQRS, caching, or background jobs.  
- Postgres views deliver sub-500 ms aggregation queries.  
- React Query caching covers all real-time needs.

---

### 9. Key Integration Contracts

| Service | Interface / DTO | Direction | Purpose |
|----------|----------------|------------|----------|
| Casino | `CasinoSettings` | Read | gaming day and thresholds |
| Player | `PlayerSummaryDTO` | Read | identification & correlation |
| RatingSlip | `RatingSlipSessionDTO` | Read | contextual linkage (same session) |
| Loyalty | `LoyaltyLedgerDTO` | Read | contextual enrichment |
| Staff/Auth | `StaffIdentityDTO` | Read | accountability |

---

### 10. Summary Statement

> The **MTL Service** embodies the casino’s **AML compliance core** — an immutable, time-normalized ledger of cash activity per patron and staff.  
> It correlates with RatingSlip and Loyalty data *only for contextual oversight*, never inference.  
> Its boundary discipline ensures compliance reliability without overengineering, maintaining lean MVP integrity while leaving clear seams for future scaling or event-driven expansion.
