# PRD-009 Addendum: Cashier Workflows – MVP Skeleton for Player Financial Service

**Doc Type:** Addendum / High-Level Design  
**Parent:** PRD-009 – Player Financial Service (Finance)  
**Status:** Draft  
**Scope Change:** MVP expanded to include **cashier workflows** for recording cash-outs, marker settlements, and related financial transactions. (Cage buy-ins excluded per SRM v4.2.0 — not standard casino workflow.)

---

## 1. Purpose & Goals

Introduce **cashier-facing workflows** into the Player Financial Service so that:

1. **MTL** (Money Tracking & Logging) can rely on **accurate, system-of-record cash movements**, not inferred approximations.
2. **Finance / Accounting** can see:
   - Table buy-ins (cash/chips/markers into play) — recorded by pit boss,
   - Cash-outs (chips converted to cash at cage) — recorded by cashier,
   - Marker issuance and settlement — recorded by cashier.
3. **Operational consumers** (e.g., Loyalty, Performance Analytics) can safely derive:
   - Net cash result per visit (within the limits of table play vs. other spend),
   - High-level cash exposure and risk.

This addendum **does not fully design** an MTL system; it focuses on **cashier workflows** within Finance. Any overlap with MTL is **noted and deferred** for later evaluation.

---

## 2. Roles & Permissions (Refined)

### 2.1 Role Matrix (Finance Context)

| Role        | Read Transactions | Create Transaction (RPC)                             | View Aggregations |
|-------------|-------------------|------------------------------------------------------|-------------------|
| Admin       | ✅                 | ✅ (all transaction types)                           | ✅                 |
| Pit Boss    | ✅                 | ✅ (table buy-ins only, as previously scoped)        | ✅                 |
| Cashier     | ✅                 | ✅ (cash-outs, marker settlements, cage operations)  | ✅                 |
| Compliance  | ✅                 | ❌                                                   | ✅                 |

**Out-of-scope for this doc:** exact RLS policy SQL.  
**In-scope:** conceptual boundaries.

---

## 3. Core Cashier Use Cases

### 3.1 Record Cash-Out for a Visit

**Primary purpose:** Accurately log when a player converts chips/markers to cash at the cage.

**Narrative:**

1. Player arrives at the cage with chips and/or a marker to settle.
2. Cashier searches for the **active (or recently closed) visit**:
   - By player name / player ID,
   - By rating slip / table info (optional),
   - Or by visit ID, if provided by the floor.
3. Cashier enters a **cash-out transaction**:
   - `direction = 'out'`
   - `tender_type = 'cash'` (primary), and optionally `marker` if settling credit.
   - Associates with `visit_id` (if known and valid).
4. System persists a `player_financial_transaction` row and updates any derived aggregates (or marks them for recomputation).

**Edge Cases:**

- **Unknown visit**: Cashier may not know the correct `visit_id`.
  - MVP decision: require visit search & selection to **avoid orphan transactions**.
- **Multiple concurrent visits**: If you allow this later, cashier must pick the correct one. MVP may assume **one open visit per player per casino** to keep it simple.

---

### 3.2 ~~Buy-In at Cage~~ — OUT OF MVP SCOPE

> **⚠️ SCOPE EXCLUSION (v4.2.0)**: This section describes a use case that does not reflect casino operational reality. Players do NOT "buy-in" at the cage—buy-ins occur at the gaming table with a pit boss. Cage operations are limited to:
> - **Cash-outs**: Converting chips to cash
> - **Marker settlements**: Settling outstanding credit
> - Credit card withdrawals (post-MVP)
>
> The original "cage buy-in" scenario is **removed from MVP scope**. If future operational requirements emerge, they will be addressed in a separate PRD.

**Status**: DEFERRED / OUT OF SCOPE

**Original content preserved for reference:**
- ~~Player buys chips at the cage (not at the table)~~ — This is not standard casino workflow
- All financial transactions in MVP require `visit_id` (prevents orphan transactions)

---

### 3.3 Marker Issuance (Credit Extension)

**Purpose:** Track when the casino extends credit (marker) to the player.

1. Cashier (or credit officer) issues a marker:
   - `direction = 'in'` (value of funds entering play),
   - `tender_type = 'marker'`,
   - Linked to `visit_id` (if play-oriented) or player only (if generic credit).
2. Paper/physical marker still exists; system transaction is a **digital ledger representation**.

**Note:** Overlaps heavily with MTL and credit risk workflows.  
For MVP, **keep it simple**:

- Model as a **financial transaction**,
- Defer full credit workflow (limits, aging, bad debt) to a future PRD.

---

### 3.4 Marker Settlement (Credit Pay-Down / Closure)

**Purpose:** Record when an outstanding marker is settled (typically cash-out or direct payment).

1. Cashier selects a previously issued marker / marker transaction.
2. Records a **settlement**:
   - `direction = 'out'` (funds leaving casino to “extinguish” credit), or
   - A separate “settlement” transaction type that neutralizes prior marker.
3. Associates with a visit (if appropriate) and optionally notes partial vs full settlement.

**MVP Simplification:**

- Treat settlement as a **cash-out** reference to a previous marker transaction.  
- Deep accounting logic (aged balances, interest, etc.) is out of scope.

**MTL Note:**  
Markers as credit instruments are prime MTL territory.  
→ **Note for later:** formalize markers as a separate bounded context or as part of Finance+MTL hybrid design.

---

## 4. High-Level Workflow Skeletons

### 4.1 Cash-Out Workflow (Primary MVP Path)

**Actors:** Cashier, Player  
**Preconditions:**
- Player has chips or a marker to redeem.
- Player has an active or recently closed visit.

**Steps:**

1. **Search Player / Visit**
   - Cashier opens “Cash-Out” screen.
   - Searches by player name / ID / loyalty number.
   - System lists:
     - Active visits,
     - Recently closed visits (within configurable time window).

2. **Select Visit**
   - Cashier selects the relevant visit.
   - System shows:
     - Visit details (tables, time window),
     - Known buy-ins (pit boss Finance entries),
     - **Non-authoritative** rating slip “chips taken” as a hint (optional).

3. **Enter Cash-Out Details**
   - Input fields:
     - Amount being cashed out,
     - Tender type: `cash`, optionally `marker` if settling credit,
     - Optional notes (e.g., partial settlement).
   - System validates:
     - `amount > 0`,
     - `tender_type` allowed for cashier,
     - `visit_id` is valid and in same casino as cashier.

4. **Confirm & Persist**
   - Cashier confirms (with optional double-confirm for large amounts).
   - System calls `rpc_create_financial_txn` (or similar) as cashier.
   - Transaction is stored in `player_financial_transaction` with:
     - `direction = 'out'`,
     - `tender_type`,
     - `visit_id`, `casino_id`, `player_id` (if available),
     - `created_by_staff_id`.

5. **Post-Conditions**
   - MTL and other consumers can now:
     - See exact cash-out for that visit,
     - Compute net cash flow for that visit:  
       `net = sum(in) - sum(out)` across all financial transactions.

---

### 4.2 Marker Issue Workflow (Simple MVP Path)

**Actors:** Cashier / Credit  
**Steps:**

1. Search player & visit.
2. Choose “Issue Marker”.
3. Enter amount (credit extended).
4. Persist as:
   - `direction = 'in'`,
   - `tender_type = 'marker'`,
   - Linked to visit and staff.

**MTL Note:**  
Marker issue/settlement events are strong candidates to be mirrored into MTL tables later, or to be driven by an MTL-owned service with Finance as a consumer. For MVP, keep them **Finance-owned** but mark for **future refactor**.

---

### 4.3 Marker Settlement Workflow (Simple MVP Path)

**Actors:** Cashier / Credit  
**Steps:**

1. Search player, visit, or marker reference.
2. View outstanding marker(s).
3. Choose “Settle Marker” (partial or full).
4. Enter settlement amount and actual tender (`cash`, `chip`, etc.).
5. Persist as:
   - `direction = 'out'` (from the casino’s balance perspective),
   - `tender_type` (likely `cash`),
   - Reference to original marker transaction (e.g., `related_transaction_id`).

**MTL Note:**  
Settlement data may be required by compliance; mark this for **MTL integration** once MTL domain is formally scoped.

---

## 5. Data Model Touchpoints (Conceptual)

The following points assume existing `player_financial_transaction` table (per SRM) and JWT claims.

### 5.1 Transaction-Level Fields (Relevance for Cashier)

- `id`: uuid – PK
- `casino_id`: uuid – must match cashier’s casino
- `visit_id`: uuid – **required** for table play cash flows
- `player_id`: uuid – strongly preferred, but may be nullable if visit-only
- `direction`: `'in' | 'out'`
- `tender_type`: `'cash' | 'chips' | 'marker'` (MVP set)
- `amount`: numeric – positive
- `created_by_staff_id`: uuid – identifies cashier
- `created_at`: timestamptz

### 5.2 Suggested Additional Fields (Lightweight)

- `source`: `'pit' | 'cage' | 'system'`  
  - Distinguish pit boss entries (buy-ins) vs cashier entries (cash-outs / markers).
- `related_transaction_id`: uuid nullable  
  - For marker settlements referencing the original marker issue.

These are **optional for MVP**, but helpful for future MTL and audit trails.

---

## 6. Interaction with Other Consumers

### 6.1 MTL (Money Tracking & Logging)

**Potential Overlaps:**

- MTL may want:
  - Detailed chip and cash flow across:
    - Table, cage, vault, markers.
  - Auditability of:
    - Marker issuance/settlement,
    - Large cash-outs (CTR thresholds),
    - Suspicious patterns.

**MVP Position:**

- Finance holds **transaction-level** data related to:
  - Buy-ins (pit, cage),
  - Cash-outs (cage),
  - Markers (issue, settlement at a basic level).
- MTL **later** can:
  - Either own a dedicated domain (with its own tables),
  - Or consume Finance events via outbox pattern.

> **NOTE:** The design of `mtl_entry` and its relationship to Finance is **explicitly deferred** to an MTL-focused PRD/ADR.

---

### 6.2 Loyalty

Loyalty might use Finance data for:

- Determining qualifying play based on net cash or buy-ins.
- Correlating accrual with real money risk.

MVP stance:

- Loyalty may read:
  - `sum(amount) WHERE direction = 'in'` (total buy-ins),
  - Optionally net cash `sum(in) - sum(out)` if needed.
- Detailed Loyalty rules are **out of scope** here; this doc just ensures data is available.

---

### 6.3 Performance Metrics / Analytics

Performance systems may:

- Use buy-in vs cash-out data to model:
  - Player worth,
  - Hold %,
  - Risk exposure.

MVP stance:

- Ensure Finance provides stable **per-visit** financial ledger which can be aggregated.
- Detailed metric definitions live in Performance domain docs.

---

## 7. RLS & Security Considerations (Conceptual)

**No SQL policies here, just constraints:**

- **Cashier** can:
  - Insert and read all financial transactions for their `casino_id`.
  - Create both `direction = 'in'` and `direction = 'out'` transactions with any allowed `tender_type`.
- **Pit Boss**:
  - Still limited to buy-ins (`direction = 'in'`, `tender_type IN ('cash', 'chips')`) via existing logic.
- **Admin**:
  - Superset of cashier permissions within same `casino_id`.
- **Compliance**:
  - Read-only, including ability to filter by:
    - staff_id, player_id, visit_id,
    - large amounts, specific tender types, markers.

Everything filtered by `casino_id` derived from JWT claims to enforce **casino-scoped data isolation**.

---

## 8. Non-Functional Considerations

- **Auditability:**
  - Every transaction must record `created_by_staff_id` and timestamps.
  - Later, consider immutable event log or append-only semantics.

- **Idempotency:**
  - Cashier screens should guard against double-submission (e.g., retry-safe RPCs).

- **Error Handling:**
  - UI must surface when:
    - Visit-selected is invalid/closed,
    - Player does not match visit,
    - RLS blocks a transaction (role mismatch).

- **Future Outbox:**
  - When you introduce `finance_outbox`, cash-out and marker events are natural candidates for downstream MTL / accounting systems.

---

## 9. Open Questions to Resolve in Subsequent ADR

1. **Marker Modeling Depth:**
   - Are markers strictly visit-bound or can they be general credit accounts?
   - Do we need a separate `marker` table (principal, balance, status), or is `player_financial_transaction` enough for MVP?

2. **Multiple Visits per Player:**
   - Is it allowed and, if so, how does cashier disambiguate them reliably?

3. **Non-Table Cash Flows:**
   - Do we want Finance to track **non-gaming cash flows** (e.g., hotel, F&B) in future, or is it strictly table-game oriented?

4. **Integration with MTL:**
   - Does MTL own the master view of “money trail” with Finance as a feeder, or vice versa?

These should be addressed via one or more ADRs once MVP cashier workflows are validated against real operational input.
