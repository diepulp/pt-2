Now I have a complete picture. Let me give you the operator testing walkthrough.

---

## TIA Browser Testing Walkthrough — PRD-090

### What's operationally testable right now

PRD-090 delivered its core accounting engine and API, but the **UI entry point split** is important to understand before walking to the app:

---

### Component Status Map

| Surface                   | Status                                                                                 | Where                                            |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **`RundownReportCard`**   | **Live in UI** — mounted in `InventoryPanel`                                           | Pit Dashboard → select any table → Inventory tab |
| **`RundownSummaryPanel`** | **Built but not mounted** — no active parent yet                                       | component exists, no import in any page          |
| **API endpoint**          | **Live** — `GET /api/v1/table-context/table-sessions/:sessionId/accounting-projection` | Directly callable                                |
| Suppressed legacy fields  | **Gone from DTO and serialization**                                                    | Enforced at build/type level                     |

---

### Walkthrough: What an operator can validate today

#### 1. RundownReportCard — Pit Dashboard → Inventory Tab

Navigate to **`/pit`** as a `pit_boss` or `admin` role user.

1. Select an active table from the table grid (left panel)
2. Switch to the **Inventory** tab in the right panel
3. If the session is in `ACTIVE`, `RUNDOWN`, or `CLOSED` state, the **Rundown Report** card appears at the top

What you'll see in the card:

- **Fills** and **Credits** totals — live from `table_fill_slip` / `table_credit_slip` data
- **Drop** total — from `drop_total_cents` on the session
- **Win/Loss row is intentionally absent** — replaced by the italic placeholder text: *"Table win/loss data unavailable during TIA canon migration"*
- `table_win_cents` was deprecated (`@deprecated WS4-SUPPRESSED`) — this is correct behavior
- If session is `RUNDOWN`: **Save Report** button is shown
- If session is `CLOSED` and report exists and isn't finalized: **Finalize** button appears

**What this validates:** The legacy win/loss calculation (`rpc_compute_table_rundown`) is confirmed quarantined — no number renders there. The fills/credits/drop pipeline is still live and correct.

---

#### 2. Accounting Projection API — Direct cURL / DevTools validation

The `RundownSummaryPanel` component exists and is fully implemented, but is not yet wired into any page. You can validate the three-state machine directly via the API.

In **DevTools → Network** (or cURL with a session cookie), call:

```
GET /api/v1/table-context/table-sessions/{sessionId}/accounting-projection
```

**State 1 — `telemetry_drop_formula`** (session has opener + closer snapshots + RATED_BUYIN/GRIND_BUYIN telemetry):
```json
{
  "calculation_kind": "telemetry_drop_formula",
  "projected_table_win_loss_cents": "42000",
  "partial_table_result_cents": null,
  "final_table_win_loss_cents": null,
  "custody_status": "non_custody_estimate"
}
```

**State 2 — `inventory_only`** (opener + closer present, no qualifying telemetry):
```json
{
  "calculation_kind": "inventory_only",
  "projected_table_win_loss_cents": null,
  "partial_table_result_cents": "38000",
  "final_table_win_loss_cents": null
}
```

**State 3 — `integrity_failure`** (opener or closer snapshot missing):
```json
{
  "calculation_kind": "integrity_failure",
  "projected_table_win_loss_cents": null,
  "partial_table_result_cents": null,
  "integrity_issues": ["opener snapshot not found"],
  "final_table_win_loss_cents": null
}
```

**Role guard check:** Call as a `dealer` or `cashier` role — expect `403`. Call as `pit_boss`/`admin` — expect `200` regardless of calculation state.

**Cross-casino check:** Use a `sessionId` that belongs to a different casino than the authenticated user's RLS context — expect `404`, not a `200` with `integrity_failure`.

---

#### 3. `integrity_failure` is HTTP 200 — key semantic to verify

A session with missing inventory snapshots returns **HTTP 200** with `calculation_kind: "integrity_failure"`, not a 4xx/5xx. This is the business-correct behavior per DEC-1 — it means "we computed a valid result: we don't have enough data to project." Confirm this doesn't get swallowed as an error by the client.

---

### What's NOT yet testable in the browser

- **`RundownSummaryPanel`** three-state UI rendering (green/red TrendingUp/TrendingDown icon, "Projected Win/Loss" vs "Partial Table Result" vs AlertCircle) — the component is complete but needs to be mounted on a page. No operator-facing surface renders it yet.
- **bigint values as strings** — visible in the raw API response JSON but not yet surfaced in any UI number display via this path.

---

### Quick smoke test sequence

```
1. /pit as pit_boss → select table with active session
2. Inventory tab → confirm RundownReportCard shows Fills/Credits/Drop with no Win/Loss number
3. DevTools XHR → /accounting-projection → confirm calculation_kind field and null final_table_win_loss_cents
4. Try as dealer role → confirm 403
5. Try with closed session sessionId from different casino → confirm 404
```

The service, API, hook, and suppression layer are all live. The `RundownSummaryPanel` is the one deliverable waiting for a mount point in the page tree.

Now I have everything I need. Here's the plain answer:

---

## What the system tracks and displays right now

### The core problem PRD-090 fixed

The "split brain" was this: multiple parts of the system each had their own slightly different formula for computing table win/loss. One service would show a different number than another. There was no single authority. PRD-090 created one canonical derivation — `TableInventoryAccounting` — that owns that calculation and nothing else is allowed to re-derive it.

---

### What fills and credits represent — and whether PRD-090 touched them

**Fills and credits were pre-existing, are accurately wired, and PRD-090 did not touch their capture layer.** They live in `table_fill` and `table_credit` tables and go through a two-step confirmed/pending workflow — the service only reads rows with `status = 'confirmed'`, so unconfirmed or in-flight chip movements don't pollute the calculation. That confirmation gate predates this work.

PRD-090's contribution to fills/credits was narrower: it established that they are **inputs** to the canonical formula, not outputs, and it enforced that no surface is allowed to display a win/loss number derived from them directly — only the TIA service is allowed to do the math.

The fills/credits totals you see in the `RundownReportCard` in the UI today come from `drop_total_cents`, `fills_total_cents`, and `credits_total_cents` on the rundown report record — that's a different pre-existing path (PRD-038), not the new TIA projection.

---

### What the system is currently capable of tracking and displaying

**Working and operator-visible today:**

- Fills total (confirmed chip fills into the table) — shown in Rundown Report card
- Credits total (confirmed chip credits out of the table) — shown in Rundown Report card
- Drop total (cash dropped into the drop box) — shown in Rundown Report card
- Inventory snapshots (opening and closing chip counts) — live in the Inventory panel
- No win/loss number anywhere in the UI — intentionally blank during migration

**Working but only accessible via API (not yet in UI):**

- The projected win/loss calculation itself — three states: full formula (with telemetry), partial (inventory only), or integrity failure when a snapshot is missing
- Telemetry-derived drop estimate (sum of RATED_BUYIN + GRIND_BUYIN events in the session window)

**Intentionally absent:**

- A final, settled win/loss number — the system explicitly reserves `final_table_win_loss_cents = null` always. That field requires an external custody authority (count room) that hasn't been implemented yet. The system knows it doesn't know.

---

**Short version:** The system accurately tracks all the raw ingredients — fills, credits, chip snapshots, drop events, buy-in telemetry. The remediation work was about who is allowed to combine those ingredients into a number and under what rules. That engine is built and correct; the UI surface that shows the result just hasn't been wired in yet.