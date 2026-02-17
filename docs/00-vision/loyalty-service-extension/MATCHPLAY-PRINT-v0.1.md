---
id: EXEC-SPEC-MATCHPLAY-PRINT-v0.1
title: Match Play One-Click Issue-and-Print (Iframe Template)
status: draft
version: 0.1
date: 2026-02-03
owner: LoyaltyService
scope: v0
---

# Match Play One-Click Issue-and-Print (Iframe Template)

## Goal

Provide a **single “Print Match Play” button** (in Rating Slip and Player Dash) that:

1. **Derives** the player’s *current* match play entitlement from tier/policy.
2. **Issues** (or reuses/replaces) the authoritative match play coupon in the DB.
3. **Prints** a pre-filled match play template reliably **without navigation** and **without multi-screen workflows**.

No floor-entered values. The floor’s only action is **click → print dialog**.

---

## Non-goals (v0)

- No manual issuance UI.
- No staff editing of match play amounts/constraints.
- No “template designer” or WYSIWYG.
- No silent/background printing (kiosk/native print integrations are out of scope).

---

## Data model assumptions

- A match play “on file” is represented as an issued coupon record (e.g., `promo_coupon`) with:
  - unique `validation_number`
  - `face_value_amount`
  - `required_match_wager_amount`
  - `expires_at` (valid per gaming day only)
  - lifecycle status (`issued`, `voided`, `expired`, `replaced`)
  - `metadata` JSON (print channel/batch, etc.)
- Match play policy is represented as an active promo program (e.g., `promo_program`) with:
  - `constraints` JSON containing tier ladder / entitlement logic (and any other rule inputs needed).

> If tier is stored in `player_loyalty`, `player`, or `player_casino`, the RPC reads it from the canonical source—UI does not provide tier.

---

## Primary UX flow (single screen)

### Entry points
- Rating Slip view: `Print Match Play`
- Player Dash view: `Print Match Play`

### User interaction
- User clicks `Print Match Play`
- The app fetches/creates the match play coupon via a single RPC
- The app prints via a hidden iframe containing a dedicated HTML document
- The app logs a print event (best-effort; printing is not blocked on logging)

---

## Server contract

### RPC: `rpc_issue_current_match_play`
**Purpose:** return the match play coupon that should be printed *right now* for the player, based on tier and current policy.

**Signature (proposed):**
- Inputs:
  - `p_player_id uuid`
  - `p_visit_id uuid` (optional; include if you want per-visit scoping)
- Output:
  - `promo_coupon` row (or a typed record matching the printed fields)

**Responsibilities:**
1. Resolve player’s current tier (canonical source).
2. Select active match play program:
   - “the current active match play `promo_program` for this casino”
3. Compute entitlement:
   - `face_value_amount`
   - `required_match_wager_amount`
   - `expires_at` (optional; policy-driven)
4. Enforce **idempotency** (no duplicates on spam clicking):
   - If an eligible coupon exists “on file”, return it.
   - Else issue a new coupon and return it.
5. Optionally enforce **auto-replacement** if policy changed:
   - If an eligible coupon exists but differs from computed entitlement, replace it and return the new one.

### “On file” definition (v0 recommendation)
A coupon is considered “on file” if:
- `issued_to_player_id = p_player_id`
- status is `issued`
- not expired
- belongs to the active match play program
- is within the chosen window:
  - **Option A (gaming-day scope):** one outstanding MP per player per gaming day
  - **Option B (visit scope):** one outstanding MP per visit (requires `p_visit_id`)

Pick one. Don’t do both in v0.

### Replacement rule (when MPs change frequently)

Two valid behaviors:

- **Behavior 1 (default):** honor issued coupons; apply policy changes on next issuance window  
  - If coupon exists → return it
- **Behavior 2 (strict current entitlement):** replace coupon if entitlement differs from current policy  
  - If coupon exists and differs → `replace` then return new coupon

**Recommendation:** start with Behavior 1 unless ops explicitly demand “always current”.

### Metadata writes (server-side)
On issuance (and replacement), populate metadata with:
- `channel`: `"rating_slip_print_button"` or `"player_dash_print_button"`
- `tier`: resolved tier at time of issue
- `policy_version`: identifier/hash/timestamp of the policy used
- `computed_at`: timestamp

Example:
```json
{
  "channel": "rating_slip_print_button",
  "tier": "gold",
  "policy_version": "mp_program_2026-02-01",
  "computed_at": "2026-02-03T10:25:00Z"
}
```

---

## Client printing design (iframe)

### Why iframe
Printing the *app screen* is fragile (layout, hydration timing, CSS bleed). Instead we print a **tiny, deterministic HTML document** inside a hidden iframe.

### Requirements
- No navigation to a new route.
- No extra screens.
- Works with the browser print dialog reliably.
- Template uses minimal CSS and system fonts.
- Wait for fonts/layout before calling `print()`.

### Implementation outline
1. Button click (user gesture)
2. Call `rpc_issue_current_match_play(...)` → returns coupon
3. Build printable HTML string from coupon + player fields
4. Create hidden iframe
5. Write HTML into iframe document
6. Wait for readiness (fonts + 2× animation frame)
7. Call `iframeWindow.print()`
8. Cleanup iframe after print (best-effort)

### Template design (v0)
- Keep it **simple and tolerant**:
  - large amounts, generous spacing
  - avoid complex flex/grid edge cases
  - no fragile absolute positioning
- Include:
  - Casino name (optional)
  - Player display name (from player record)
  - Face value
  - Required match wager
  - Validation number (prefer monospaced)
  - Expiry (if present)
  - Issued timestamp
- Optional:
  - QR/barcode for validation number (adds scan speed; implement if your floor benefits)

---

## Print logging and audit posture

### Print history
After printing is initiated, log a best-effort event:

- Update `promo_coupon.metadata.print_history[]` append:
  - `printed_at`
  - `printed_by_staff_id` (from RLS context)
  - `channel`
  - (optional) `device_hint` or `browser_hint`

**Important:** do **not** block printing on this write. If the print dialog is open and the logging fails, you still printed. Capture failures in an app log if needed.

### Reprints
- Reprinting the same coupon should not create new coupons.
- Reprints should append to print history.

### No “editable amounts”
- Floors do not edit entitlement.
- If operationally you later need “display overrides” (name/note), store only those in metadata and never mutate the coupon’s core accounting fields.

---

## Definition of Done (v0)

### Functional
- [ ] `rpc_issue_current_match_play` returns a coupon that matches tier/policy.
- [ ] Button exists in Rating Slip and Player Dash.
- [ ] One click prints a match play template via iframe without navigation.
- [ ] Spam clicking does not create duplicate coupons (idempotency enforced).
- [ ] Reprint prints the same coupon (no new issuance).

### Data integrity
- [ ] Coupon has unique validation number.
- [ ] Status lifecycle is respected (`issued`, `expired`, `replaced`, etc.).
- [ ] Replacement (if enabled) marks old coupon as replaced and links new coupon.

### Audit/ops
- [ ] Print history is recorded (best-effort append).
- [ ] Printed output contains validation number and amounts.
- [ ] Printing works on the floor’s primary browser/printer combo (smoke-tested).

### UX
- [ ] No multi-screen workflows.
- [ ] No required staff input for issuance.
- [ ] Print output is readable and tolerant of minor scaling.

---

## Open decisions (keep small)

1. **Scope window:** gaming-day vs visit-level “one outstanding MP”.
2. **Policy-change behavior:** honor issued vs auto-replace.
3. **QR/barcode:** required in v0 or deferred.

---

## Notes on drift mitigation (HTML print)

To reduce drift without moving to PDFs:
- Use minimal CSS and system fonts.
- Set `@page` margins explicitly.
- Avoid complex layout that depends on exact pixel widths.
- Design template to tolerate 95–105% scaling.

If drift is unacceptable in real floor testing, revisit a PDF renderer later—but keep the same button + RPC contract.
