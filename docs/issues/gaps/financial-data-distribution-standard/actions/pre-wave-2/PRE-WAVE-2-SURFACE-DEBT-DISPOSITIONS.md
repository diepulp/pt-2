# Pre-Wave-2 Surface Debt — Field Dispositions

---

status: complete
date: 2026-05-06
authority: financial-model-authority
parent: wave-2/pre-phase-2-surface-debt-initiation-directive.md
inventory: PRE-WAVE-2-SURFACE-DEBT-INVENTORY.md

---

## Disposition key

| Code | Meaning |
|---|---|
| **A** | Wrap as `FinancialValue` — integer cents, canonical envelope |
| **B** | Retire or replace — has a documented replacement path |
| **C** | Internal BFF carve-out — bare-number permitted if UI labels are proven |
| **D** | Compliance-parallel — `type: 'compliance'`, rendered separately, never merged with A/B authority |

---

## Minimum required (6 fields)

### `GET /api/v1/visits/[visitId]/financial-summary` — `VisitFinancialSummaryDTO`

| Field | Disposition | Authority | Source | Completeness |
|---|---|---|---|---|
| `total_in` | **A** | `actual` | `"PFT"` | `'partial'` (visit OPEN) / `'complete'` (visit CLOSED) / `'unknown'` (lifecycle ambiguous) |
| `total_out` | **A** | `actual` | `"PFT"` | same lifecycle rule |
| `net_amount` | **A** | `actual` | `"PFT"` | same lifecycle rule |

**Rationale:** These are Class A (Ledger) aggregates directly from `player_financial_transaction`. The directive explicitly disallows a BFF carve-out for the visit financial summary — "it smells like a public-ish summary contract, and bare-number money there is exactly how semantic rot crawls back under the door." The standalone `/financial-summary` route has multiple consumers beyond the modal BFF (player360-dashboard mappers, MTL hooks), confirming it is not an internal-only surface.

**Completeness implementation rule:** The `toVisitFinancialSummaryDTO` mapper shall emit `completeness: { status: 'unknown' }` by default. The modal-data BFF route, which has access to slip status, must override completeness contextually when building `FinancialSectionDTO`. The standalone `/financial-summary` route emits `'unknown'`; this is correct and honest until Wave 2 provides lifecycle-aware projection infrastructure. Recorded as a Wave 2 refinement candidate in the deferred register.

---

### `GET /api/v1/rating-slips/[id]/modal-data` — `FinancialSectionDTO` (nested in `RatingSlipModalDTO.financial`)

| Field | Disposition | Authority | Source | Completeness |
|---|---|---|---|---|
| `totalCashIn` | **A** | `actual` | `"PFT"` | inherited from `VisitFinancialSummaryDTO.total_in` |
| `totalCashOut` | **A** | `actual` | `"PFT"` | inherited from `VisitFinancialSummaryDTO.total_out` |
| `netPosition` | **A** | `actual` | `"PFT"` | inherited from `VisitFinancialSummaryDTO.net_amount` |

**Rationale for not granting BFF carve-out (Disposition C):** The directive allows C only when the UI component provably renders source/authority/completeness labels. The current `rating-slip-modal.tsx` renders bare `$X.XX` values (line 718, 119) with no authority label — it would require meaningful UI work to add labels for a C disposition. That work is equivalent to the wrap in scope. Given that the modal is where pit bosses make real-time buy-in decisions, authority context is operationally relevant (partial vs complete completeness tells the operator whether the total is current). Full wrap (A) is cheaper, more honest, and consistent with the Wave 1 parity principle.

**Implementation dependency:** `FinancialSectionDTO.totalCashIn/totalCashOut/netPosition` are populated directly from `VisitFinancialSummaryDTO.total_in/total_out/net_amount` in the route handler (lines 302–305). If `VisitFinancialSummaryDTO` fields are wrapped first, the modal-data route handler becomes a pass-through with minimal change. EXEC-SPEC should sequence VisitFinancialSummaryDTO wrap (WS2) before FinancialSectionDTO update (WS3).

**UI arithmetic note:** `rating-slip-modal.tsx:560` adds `pendingChipsTaken * 100` to `totalCashOut` to compute `computedChipsOut`. After wrap, this becomes `totalCashOut.value + pendingChipsTaken * 100`. The result is a local derived number (not emitted as FinancialValue). The render path for `computedChipsOut` and `computedNetPosition` is local UI arithmetic — it remains a bare number, not a FinancialValue, and this is correct per §6.1 (operator-input-derived local arithmetic is not an emitted financial fact).

---

## Recommended full residual (6 fields)

### `MtlEntryDTO.amount`

| Field | Disposition | Authority | Source | Completeness |
|---|---|---|---|---|
| `amount` | **D** | `compliance` | `"mtl_entry"` | `'complete'` per row |

**Rationale:** Each `mtl_entry` row is a committed compliance transaction. Completeness is always `'complete'` at the row level — there is no partial state for an individual MTL entry. Authority is `'compliance'` per the ADR-052 taxonomy. This value must never be aggregated with Class A or Class B operational values under any circumstances (compliance isolation rule, §3.4). The per-row wrap is straightforward; the consumer blast radius is the primary scope risk (13+ callsites across 6 files).

---

### `MtlGamingDaySummaryDTO` aggregate fields

| Field | Disposition | Authority | Source | Completeness |
|---|---|---|---|---|
| `total_in` | **D** | `compliance` | `"mtl_entry"` | `'partial'` (day open) / `'complete'` (day closed) / `'unknown'` (boundary ambiguous) |
| `total_out` | **D** | `compliance` | `"mtl_entry"` | same gaming-day lifecycle rule |
| `max_single_in` | **D** | `compliance` | `"mtl_entry"` | same gaming-day lifecycle rule |
| `max_single_out` | **D** | `compliance` | `"mtl_entry"` | same gaming-day lifecycle rule |
| `total_volume` | **D** | `compliance` | `"mtl_entry"` | same gaming-day lifecycle rule; both operands are compliance-class, no authority degradation |

**Rationale:** These are aggregate compliance values. Gaming-day completeness follows `rpc_current_gaming_day()` lifecycle: while the day is open, more entries may arrive (`'partial'`); after the day closes, the aggregate is final (`'complete'`). The `'unknown'` case applies at ambiguous gaming-day boundaries. These values are the authoritative compliance trigger surface per 31 CFR § 1021.311 and must never be merged with ledger or operational values (compliance isolation invariant).

**Compliance isolation enforcement:** After wrap, any component that currently renders MTL aggregate values adjacent to PFT/grind values must be audited to confirm they are displayed in separate sections with separate authority labels. This is not a new constraint — the compliance isolation rule already exists — but the wrap makes it enforceable by type rather than convention.

---

## Non-debt confirmation

The following fields were audited and confirmed as permanent bare-number carve-outs. They require no disposition change.

| Field | Reason | Rule |
|---|---|---|
| `SlipSectionDTO.averageBet` | Operator-supplied ratio, not a financial fact | §6.1 |
| `LoyaltySuggestionDTO.suggestedTheo` | Loyalty domain, not financial domain | Out of scope |
| `CasinoThresholds.watchlistFloor / ctrThreshold` | Policy/config thresholds | §6.2 |
| `MtlEntryFilters.min_amount` etc. | Filter thresholds | §6.2 |
| `MtlGamingDaySummaryDTO.count_in / count_out / entry_count` | Counts, not currency values | Not a financial fact |
| `hold_percent` | Dimensionless ratio | DEF-NEVER — all phases |

---

## Execution chain

Per ROLLOUT-ROADMAP.md §2.5, the execution chain from these dispositions is:

```
/prd-writer (PRD-NNN: Pre-Wave-2 Surface Debt Closure)
  → /lead-architect (EXEC-SPEC scaffold)
    → /build-pipeline
        WS1 — Inventory and classification lock
        WS2 — VisitFinancialSummaryDTO wrap (player-financial service + mapper)
        WS3 — FinancialSectionDTO pass-through update (modal-data route + DTO)
        WS4 — MtlEntryDTO.amount wrap (mtl service + mapper + UI consumers)
        WS5 — MtlGamingDaySummaryDTO wrap (mtl service + mapper + UI consumers)
        WS6 — Route/OpenAPI alignment (financial-summary + modal-data paths)
        WS7 — Rollout tracker closure + Wave 2 prerequisite update
```

**Recommended workstream sequencing:** WS2 before WS3 (FinancialSectionDTO depends on VisitFinancialSummaryDTO wrap). WS4 and WS5 are independent of WS2/WS3. WS6 follows WS2/WS3 (OpenAPI shape mirrors wrapped types). WS7 is terminal.

---

## Wave 2 prerequisite gate

This document, combined with the inventory, satisfies the pre-Wave-2 review requirement specified in ROLLOUT-ROADMAP.md §3 (Phase 1.5 "Recommended Pre-Wave-2 Surface-Debt Review") and the wave-2 initiation directive §9 items 1–5.

**Wave 2 may not begin** until:
1. All 6 minimum-review fields have `FinancialValue` wrappers in production (Disposition A fields delivered and smoke-verified).
2. All 6 compliance residual fields have `FinancialValue` D-class wrappers in production, or are formally deferred with a dated rationale entry in the rollout tracker.
3. OpenAPI entries for affected routes reflect the wrapped shapes.
4. The rollout tracker `cursor.next_action` is updated to Wave 2 entry.
