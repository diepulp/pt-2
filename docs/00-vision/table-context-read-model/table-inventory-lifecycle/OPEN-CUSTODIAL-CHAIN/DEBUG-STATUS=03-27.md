## OPEN/CLOSE Custody Chain — System Posture Report

### Test Results Summary

I tested the full cycle: **OPEN → Activate → Rundown → Close (with snapshot) → Re-open** via Playwright against the live dev server on the `table-lifecycle-recovery` branch.

---

### Root Cause Found: Broken Chain Is Real

The DB tells the story:

```
Snapshot 71729574:  snapshot_type = 'close',  total_cents = NULL
```

The closing inventory snapshot exists and is correctly linked between sessions, but **`total_cents` is NULL**. The activation drawer checks `predecessorCloseTotalCents !== null` to decide Condition A (valid chain) vs Condition B (broken chain). Since the snapshot has no dollar value, every re-open falls into "Broken Custody Chain" — even when the snapshot was explicitly selected during close.

**This is the GAP-CLOSING-SNAPSHOT-ENFORCEMENT issue** already documented in commit `e991d2c`. The close dialog allows attaching a snapshot that has no `total_cents`, creating a custody artifact that looks linked but carries no value.

---

### What Works (Verified via Playwright)

| Flow | Status | Evidence |
|------|--------|----------|
| OPEN → ACTIVE two-step custody gate | **Working** | Activation drawer appears, form validates, table transitions to "In Play" |
| Broken chain detection | **Working** | Drawer correctly shows warning when predecessor snapshot has no total |
| Non-dismissible drawer | **Working** | Only Cancel Opening exits; Escape/outside-click blocked |
| Dealer confirmation required | **Working** | Button disabled until checkbox checked |
| Note required on broken chain | **Working** | "Required" badge, form won't submit without note |
| ACTIVE → RUNDOWN | **Working** | One-click, toast confirms |
| RUNDOWN → CLOSED with reason + snapshot | **Working** | Dialog with auto-enabled snapshot, reason dropdown, close succeeds |
| Session-gated seating (UI badge) | **Working** | Badge transitions: Open → In Play → Rundown → Closed → No Session |
| Cache invalidation on close | **Working** | Badge updates immediately, no stale state |
| Re-open links predecessor | **Working** | DB shows correct `predecessor_session_id` and `opening_inventory_snapshot_id` FK |

### What's Broken (Gaps Found)

#### GAP 1 (P0): Custody Chain Never Achieves Condition A
**The `total_cents` on closing snapshots is NULL**, so every subsequent open falls into "Broken Custody Chain" even when the operator explicitly attached a snapshot during close. The close dialog doesn't enforce or populate `total_cents`. The "Close - $100" label shown in the dropdown is misleading — the actual DB value is NULL.

**Impact**: The entire custody chain is structurally linked but **informationally empty**. No opening attestation will ever show a valid predecessor closing total. The pit boss can never visually compare opening vs closing amounts — the core purpose of the custody gate.

**Root cause**: The `table_inventory_snapshot` row (seed data UUID `5a000000...`) was inserted without a `total_cents` value. The close dialog's "Take New Chip Count" button exists but was never used to create a fresh snapshot with an actual dollar amount. The existing snapshot selection path doesn't validate that `total_cents` is populated.

#### GAP 2 (P1): Snapshot Consumption Guard Not Firing
The DB shows `consumed_by_session_id = NULL` and `consumed_at = NULL` on the snapshot, even after it was used as a predecessor. The `rpc_activate_table_session` should stamp these columns (SEC Note C5 — guarded single-write), but the activation drawer shows the snapshot was successfully used by session `d20d6569` AND session `316c1a92`. Either:
- The consumption guard ran but found a NULL to overwrite (first use), or
- The same snapshot is being reused across multiple sessions without consumption tracking

This means the **chain fork detection (P0011)** may not be working — the same closing snapshot could theoretically be consumed by two concurrent opens.

#### GAP 3 (P1): `cancelled` Sessions Pollute Predecessor Chain
The DB shows this chain:
```
316c (OPEN) → e215 (CLOSED, end_of_shift) → 76e4 (CLOSED, cancelled) → d20d (CLOSED, cancelled) → 6823 (CLOSED, end_of_shift)
```
Cancelled sessions (from OPEN cancellation via ADR-048 D2) sit between real gameplay sessions. The predecessor lookup finds the **most recent CLOSED session** regardless of whether it had actual gameplay. The cancel → reopen → cancel → reopen chain means cancelled intermediate sessions with no closing snapshot break the chain for the next real open.

#### GAP 4 (P2): Close Dialog Snapshot Label Shows "$100" but DB Has NULL
The close dialog shows "Close - $100" for snapshot `5a000000...`. This label is either hardcoded, derived from a stale `chipset` JSONB, or coming from a different field than `total_cents`. The operator sees a dollar value that doesn't exist in the column the activation drawer reads. This is a **display/data source divergence**.

#### GAP 5 (P2): Console Errors on Session Operations
3 failed resource loads appear on page load (likely rating slip queries for the table), and additional errors on open/close operations. These don't block functionality but indicate API routes returning errors for expected queries.

---

### FIB-OPEN-CUSTODIAL-CHAIN-PILOT-LITE Gap Matrix

| FIB Requirement | Status | Gap |
|----------------|--------|-----|
| **F1**: Table cannot reach ACTIVE without opening attestation | **MET** | Activation drawer enforces form completion |
| **F2**: Every ACTIVE session has provenance source (predecessor or par) | **STRUCTURALLY MET, INFORMATIONALLY BROKEN** | Predecessor FK exists but `total_cents` is NULL — no actual dollar comparison possible |
| **F3**: OPEN tables reject rating slips/seating | **MET** | PRD-059 fixes exclude OPEN from allowed statuses |
| **F4**: Opening attestation is separate record from closing snapshot | **MET** | `table_opening_attestation` table, 1:1 with session |
| **F5**: Dealer participation recorded on every attestation | **MET** | NOT NULL constraint + P0008 error |
| **F6**: Prior close total displayed alongside opening total | **NOT MET** | `total_cents` is always NULL → no comparison value shown |
| **F7**: Absent/broken predecessor warns + requires note | **MET** | Three-condition display works correctly |
| **E1 (exclusion)**: No denomination grid | **MET** | Total-cents only |
| **E2 (exclusion)**: No variance policy thresholds | **MET** | Visual comparison only |
| **E3 (scope)**: Close-side consumption tracking columns | **PARTIALLY MET** | Columns exist but consumption guard may not be stamping correctly |

---

### Recommended Next Steps

1. **P0 — Fix snapshot `total_cents` population**: Either the "Take New Chip Count" flow must populate `total_cents`, or the close dialog must write the operator-entered amount to a new snapshot. Without this, the custody chain is ceremonial.

2. **P1 — Verify consumption guard**: Confirm `rpc_activate_table_session` actually stamps `consumed_by_session_id`/`consumed_at` and that P0011 fires on double-consumption.

3. **P1 — Skip cancelled predecessors**: The predecessor lookup in `rpc_open_table_session` should skip sessions with `close_reason = 'cancelled'` (no gameplay occurred, no custody to chain).

4. **P2 — Reconcile snapshot label vs DB value**: Ensure the close dialog snapshot dropdown shows the actual `total_cents` from the DB, not a derived/stale value.