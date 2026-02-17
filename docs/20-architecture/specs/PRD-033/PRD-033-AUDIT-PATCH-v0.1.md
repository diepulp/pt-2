# PRD-033 Audit Patch — Cashier Workflow MVP Corrections v0.1

**Applies to:** `EXECUTION-SPEC-PRD-033.md`  
**Goal:** Fold audit corrections into an implementable, MVP-scoped spec without drifting into accounting.

---

## Summary of Key Corrections

### ✅ Keep (already good)
- Cashier workflow is **operational attestations**, not accounting.
- Fill/Credit uses **two-step custody** (`requested → confirmed`).
- Drop workflow uses a **minimal cage “received” stamp**.
- Cage buy-ins remain **optional, but ready** (out of PRD-033 scope).

### 🔧 Fix (required for correctness / MVP viability)
1) **Cash-out “void + replacement” is underspecified**
2) **Dependency contract on PRD-009 cash-out RPC is missing**
3) **Drop pending queue indexing should include `gaming_day`**
4) **Immutability needs explicit enforcement (not just implied)**
5) **Anonymous/walk-in handling must be explicitly decided**
6) **Idempotency key must be backed by real enforcement**
7) **Server-side validation needs hardening (not only zod)**

---

## Patch Instructions (Concrete Inserts / Edits)

### A) Add a “PRD-009 Dependency Contract” section (NEW)

Insert a section near the top (after “Context” / “Goals”):

#### **PRD-009 Dependency Contract: `rpc_create_financial_txn`**
PRD-033 assumes PRD-009 provides a stable API for cashier-confirmed patron transactions.

**Must be true in PRD-009 for PRD-033 to ship:**
- Role gate: only `cashier`/`admin` can create `CASH_OUT_CONFIRMED` (and optional `CAGE_CHIP_PURCHASE_CONFIRMED` if later enabled).
- Context derivation: `casino_id` and `gaming_day` are derived from `set_rls_context_from_staff()` (no client-supplied casino_id).
- `external_ref` (receipt/ticket) is supported (nullable).
- Idempotency is enforced (header or payload key maps to stored constraint; duplicates return the original txn).
- Corrections are supported via **void + replacement** (see section B), or the spec explicitly downgrades void semantics.

**If any of the above are not true:** PRD-033 must **not** claim cash-out void/correction as DoD.

---

### B) Make cash-out correction semantics real (choose ONE option)

You currently claim:
- “Void/correction workflow for cash-outs”
- “Void workflow creates reversal linked to original”

That requires schema support or a clarified minimal alternative.

#### Option B1 (Preferred): Add explicit void/reversal linkage fields (WS1)
Add columns to `player_financial_transaction` (or your canonical txn table):

- `voided_at timestamptz null`
- `voided_by uuid null` (FK staff)
- `void_reason text null` (bounded length, e.g. 500)
- `reversal_of uuid null` (FK to original txn)
- `idempotency_key text null` (if enforced at DB level; see section F)
- Add index: `idx_pft_reversal_of (reversal_of)` where not null
- Add index/constraint for idempotency per `(casino_id, idempotency_key)` if used

Update DoD to require:
- A void action that sets `voided_*` OR inserts a reversal row with `reversal_of`.

#### Option B2 (MVP-minimal): Downgrade promise to “adjustment entry”
If you do not want schema changes now:
- Remove language “linked reversal” from DoD.
- Replace with: “Cashiers may record a correcting adjustment txn (negative amount) with a reference in `notes`/`external_ref`.”

**Be honest:** this is weaker auditability than B1.

---

### C) Enforce “confirmed rows are immutable” (NEW)

Right now immutability is implied via RPC behavior. Make it explicit and enforceable.

Add one of the following:

#### Option C1: Trigger-based immutability (DB)
- Create a trigger preventing updates to rows where `status='confirmed'` except allowed columns (e.g., none, or only `notes`).

#### Option C2: Privilege + RLS enforcement (Preferred in your posture)
- Ensure direct UPDATE privileges are not granted to app roles.
- Writes occur only through SECURITY DEFINER RPCs.
- RLS blocks updates by default; only RPC can update `requested → confirmed`.

Add a sentence in the spec:
> “Confirmed events are immutable; corrections occur via void + replacement only.”

---

### D) Fix drop pending queue index to avoid infinite backlog scan

Current index:
- `idx_drop_event_cage_received ON table_drop_event (casino_id) WHERE cage_received_at IS NULL`

Patch it to include gaming day:

- `idx_drop_event_pending ON table_drop_event (casino_id, gaming_day) WHERE cage_received_at IS NULL`

And in UI/query requirements:
- default filter = **current gaming_day only**
- allow “show older pending” behind a filter, not default

---

### E) Add an explicit “Anonymous / Walk-in” policy (NEW)

Insert a short section under Patron Transactions:

#### Anonymous Handling (MVP Decision)
Choose and document one:

- **Allow Anonymous:** permit `player_id = NULL` for cash-out confirmation with required `notes` and optional `external_ref`.
- **Disallow Anonymous:** cashier must select an existing player; otherwise they cannot record the cash-out in PT-2 (and shift telemetry stays incomplete).

**Recommendation:** allow anonymous, because ops reality includes walk-ins and refused-ID patrons.

---

### F) Make idempotency real (not just a header)

You require `Idempotency-Key`, but the spec must state where it is enforced.

Add one approach:

#### Option F1: DB-level idempotency (recommended)
- Add `idempotency_key text not null` on confirmation rows (or nullable but enforced by RPC)
- Add unique constraint:  
  `unique (casino_id, idempotency_key, txn_type)`  
  (or scope by request_id for fill/credit confirmations)

#### Option F2: Service-layer store (acceptable)
- Use a dedicated idempotency table keyed by `(casino_id, idempotency_key)` storing response payload.
- Document retention policy (e.g., 7 days) to prevent unbounded growth.

---

### G) Harden server-side validation (NEW)

Zod checks are good, but add DB/RPC constraints too:
- amount must be `> 0` (except reversal/adjustment)
- max caps (optional) to prevent fat-finger catastrophes
- `discrepancy_note` length bound enforced in DB or RPC
- ensure request/table belongs to the same `casino_id` derived from context

---

## Updated MVP Rollout Order (No Change, but make it explicit)

1) Cash-out confirmed (required)
2) Fill/Credit confirmed (required)
3) Drop received stamp (required)
4) Cage chip purchase (optional but ready; NOT in PRD-033 MVP)

---

## Definition of Done (Replace / Amend)

**Must ship:**
- Cashier can confirm cash-outs (create + correction path as chosen in B1/B2).
- Cashier can confirm fill/credit requests with discrepancy note.
- Cashier can acknowledge drop received.
- UI defaults filter by current gaming_day; pending queues don’t surface entire history by default.
- Confirmed records are immutable (enforced).
- Idempotency is actually enforced (DB or service).

**Must NOT ship:**
- Drawer balancing, cage close, reconciliation, GL posting, denomination breakdowns.

---

## Notes on Cage Buy-In (Keep Optional)

Cage chip purchase remains:
> **Optional, but ready** — model/UI can support it later, but it is not required for PRD-033 MVP.

If it is enabled later, it must follow the same rules:
- cashier/admin-only write
- idempotent create
- immutable confirmation
- void + replacement correction path

---

## Suggested “Small Patch” Checklist

If you want the minimum changes that remove the biggest risks:

- [ ] Add PRD-009 dependency contract section (A)
- [ ] Choose B1 or B2 and update DoD accordingly (B)
- [ ] Enforce immutability (C2 preferred)
- [ ] Fix drop pending index + default filters (D)
- [ ] Decide anonymous handling (E)
- [ ] Implement idempotency enforcement (F1 preferred)
- [ ] Add RPC-side validation checks (G)

---

**End state:** PRD-033 remains MVP-scoped, supports the inventory lifecycle and shift truth, and avoids accidental scope creep into accounting.
