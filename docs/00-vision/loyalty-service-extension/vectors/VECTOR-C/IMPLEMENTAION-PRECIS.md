## PRD-053: Reward Instrument Fulfillment — Precis

### What It Is

A **client-side print surface** for loyalty reward artifacts. When a pit boss issues a comp or entitlement coupon (via the PRD-052 issuance flow), the system renders a printable slip/coupon in a hidden iframe and invokes the browser print dialog. **Zero backend changes** — all print data comes from the pre-existing `FulfillmentPayload` returned by the issuance RPC.

### What Was Built

| Layer | Deliverable |
|---|---|
| **`lib/print/`** | 8 files — iframe print utility, HTML escape, two template builders (comp slip + coupon), `usePrintReward` hook, types |
| **Components** | Modified `IssuanceResultPanel` (Print button + auto-fire), `IssueRewardButton` (hook wiring), `IssueRewardDrawer` (prop threading) |
| **Cleanup** | Removed ~400 LOC of variable-amount comp + valuation policy code (descoped from pilot), deleted 5 orphaned migrations |
| **Tests** | 65 assertions across 8 suites — templates, iframe lifecycle, hook state machine, component integration |
| **Docs** | ADR-045, PRD-053, EXEC-053 |

### Two Print Templates

**Comp Slip** (`points_comp`) — Casino header, player name, reward name, face value (`$XX.XX`), points redeemed, balance after, staff name, timestamp, reference number (last 8 chars of `ledger_id` in large monospace, full UUID in small print).

**Coupon** (`entitlement`) — Casino header, **validation number as most prominent element** (22px monospace, bordered box), player name, tier, reward name, face value, conditional match wager, conditional expiry, staff name, timestamp.

Both are self-contained HTML documents with inline CSS, targeting 80mm thermal receipt paper (`max-width: 72mm`) and gracefully centering on letter/A4.

### Print Policy: Manual-First (ADR-045 D1A)

- **Auto-print** fires once on fresh issuance via `queueMicrotask` — best-effort only, guarded by `useRef` to prevent re-render loops
- **Manual Print button** is always available and reflects 4 states: `Print` → `Printing...` (disabled) → `Print again` / `Print failed — try again`
- Reprint works without creating a new issuance record (pure client-side re-render)

---

## How to Test in the Browser

### Prerequisites
- `npm run dev` running at `localhost:3000`
- Logged in as a staff user with an active casino context
- At least one player with an enrolled loyalty account and some point balance

### Test Flow

**1. Navigate to Player 360**
- Open any enrolled player's detail page
- Look for the **gift icon button** in the Player 360 header (top-right action bar)

**2. Open the Issue Reward Drawer**
- Click the gift icon → right-side drawer opens with reward selector

**3. Issue a Comp (points_comp family)**
- Select a comp reward from the list (e.g., "Meal Comp $25")
- Confirmation panel shows: reward name, face value, points cost, balance preview
- Click **"Confirm Comp Issuance"**
- On success: result panel shows checkmark + details
- **Auto-print should fire** — browser print dialog appears automatically
- Cancel or print → observe the Print button state update:
  - If you printed: button shows **"Print again"**
  - If dialog was dismissed: button may show **"Print failed — try again"**
- Click the Print button again → reprint fires without re-issuance

**4. Issue an Entitlement (coupon family)**
- Close drawer, reopen, select an entitlement reward (e.g., "Match Play $50")
- Confirm → result panel appears
- Auto-print fires → **verify the validation number is the most prominent element** on the coupon (large, bordered, monospace)
- Verify conditional fields: match wager only shows if applicable, expiry only shows if set

**5. Edge Cases to Verify**

| Scenario | Expected |
|---|---|
| Auto-print blocked by browser | Print button remains interactive — user can manually click "Print" |
| Click "Print again" after success | Reprints same artifact, no new issuance API call |
| Close drawer during print | Iframe cleanup fires (no orphaned iframes in DOM) |
| Re-render result panel | Auto-fire does NOT re-trigger (useRef guard) |
| SSR context (shouldn't happen in practice) | `iframePrint` returns `{ success: false }` gracefully |

**6. Inspect the Printed Artifact**
- In the print preview, verify:
  - Casino name, player name, staff name all populated (not blank)
  - Monetary values formatted as `$XX.XX`
  - Points displayed as integers (no decimals)
  - No raw HTML or unescaped characters (XSS defense)
  - Layout fits within thermal receipt width (~72mm content area)