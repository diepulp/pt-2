# Agent 5 — Loyalty Downstream Consumers & Render Surfaces

**Angle:** Surface Misrepresentation & Projection Drift across loyalty render boundaries.
**Mode:** Read-only diagnosis (split-brain-authority). Branch `epson`. 2026-06-21.
**Governing test (provenance test, applied at every render boundary):** *"Where did the number on this screen come from, and does the operator know its authority / as-of / completeness?"*

---

## 1. Angle Summary

The loyalty domain has three concurrently-rendered representations of "the same" player value:

1. **Minted / accrued** — `loyalty_ledger` → `player_loyalty.current_balance` cache (authority fact; `PlayerLoyaltyDTO.currentBalance`).
2. **Live suggestion / preview** — `SessionRewardSuggestionOutput.suggestedPoints` / `suggestedTheo` (read-only, **non-minted estimate**, recomputed per request from current session activity; never written).
3. **Surface-recomputed** — points cost and post-debit balance computed **client-side** inside `CompConfirmPanel` from `amountCents / centsPerPoint`.

The arithmetic is mostly correct. The fractures are semantic: surfaces present a **default / estimate / stale** value as if it were authoritative and complete, and one surface (CompConfirmPanel) **owns a recompute it should not own** (cure principle: "a surface that recomputes a value it does not own is a split-brain in waiting").

The two most dangerous, operator-trust-facing findings:

- **F1 (S3):** The Player-360 header mounts `IssueRewardButton` with **no `currentBalance`** (defaults to `0`) and passes the **enrollment status string in place of `currentTier`**. The comp confirm drawer then renders "Current balance 0 pts / After issuance −N pts" and flips into the insufficient-balance / overdraw path for players who actually have points. Same component, two call sites, two truths — **Projection Drift** between the rating-slip modal (correct source) and the header (default-zero source).
- **F2 (S3):** `CompConfirmPanel` recomputes `pointsCost = ceil(amountCents / centsPerPoint)` and `postDebitBalance = currentBalance − pointsCost` client-side. This duplicates the server's authoritative redeem formula (`rpc_redeem` returns `pointsDebited` / `balanceAfter`). The preview the operator confirms against is a **second brain** that can diverge from the server result (rounding, rate change mid-drawer, overdraw rules). Directly the "live recompute rendered as if settled" pattern named in the brief.

---

## 2. Consumer Audit Table

| Consumer (file) | Value rendered | Source read | Recomputes value it doesn't own? | Provenance / as-of shown? | Fracture |
|---|---|---|---|---|---|
| `components/player-360/header/issue-reward-button.tsx:64-80,125-140` | balance, tier (pass-through to drawer) | **props only — default `currentBalance=0`, `currentTier=''`** | No (passes through) | No | Projection Drift (feeds F1) |
| `components/player-360/header/player-360-header-content.tsx:539-551` | — (mounts button) | **omits balance; passes `enrollment.status` ('enrolled'/'') as `currentTier`** | No | No | **F1** Surface Misrepresentation + Vocabulary Overload |
| `components/loyalty/comp-confirm-panel.tsx:82-89,178-200,237-247` | comp $, points cost, current+post-debit balance | `centsPerPoint` (DB), `currentBalance` (prop) → **client recompute** | **Yes — `ceil(amount/centsPerPoint)`, `balance−cost`** | Rate shown ("at $x/pt"); balance preview unlabeled as estimate | **F2** Surface Misrepresentation (recompute) |
| `components/loyalty/issuance-result-panel.tsx:378-399` | points debited, **balance after** (post-mint) | `IssuanceResultDTO` (server `rpc_redeem`) | No (renders server truth) | "Issued at" timestamp shown; balance authoritative — OK | Clean (authoritative) |
| `components/loyalty/entitlement-confirm-panel.tsx:103-135` | face value, match wager | `reward.metadata` (catalog) via `FinancialValue` envelope | No | **Yes** — `type:'compliance', source:'reward_catalog', completeness:'complete'` + "Values shown are from the reward catalog configuration." | Clean (exemplar of correct provenance) |
| `components/loyalty/reward-selector.tsx:139-180` | entitlement face value; comp shows literal "Points" | `reward.metadata` | No | Catalog-sourced, static | Minor Vocabulary (comp card hides cost) |
| `components/modals/rating-slip/rating-slip-modal.tsx:573-574,795,815-816,833-852` | balance, **session reward estimate**, tier | `modalData.loyalty.currentBalance` (cache), `suggestion.suggestedPoints` (live), real `tier` | No | **Partial good** — "Session Reward **Estimate**", "(frozen)" when paused, "Based on current session activity". Balance itself unlabeled/no as-of | Vocabulary Overload (estimate vs balance proximity); reference call site for F1 |
| `components/player-dashboard/loyalty-panel.tsx:141,146,193,214,219` | tier badge, points balance | `usePlayerLoyalty` cache | **Yes — fabricates tier**: `loyalty.tier?.toLowerCase() \|\| 'bronze'` | No as-of on balance; null tier → 'bronze' rendered as authoritative | **F3** Surface Misrepresentation (fabricated tier) |
| `components/measurement/loyalty-liability-widget.tsx:55-89` | **estimated** $ liability, total points, players, rate | `LoyaltyLiabilityDto` (periodic snapshot) | No | **Good** — "Estimated Liability" label + FreshnessBadge "As of [snapshot_date]" (line 49) | Clean (model surface) |
| `services/reporting/shift-report/pdf/sections/loyalty-liability.tsx:51-64` | **"Dollar Liability"**, points, rate | `LoyaltyLiabilitySection` (snapshot) | No | **No as-of in section**; "Dollar Liability" label drops the "Estimated" qualifier the widget carries | **F4** Surface Misrepresentation (label downgrade in export) |
| `components/admin/valuation-settings-form.tsx:186-188,216-221,266-274` | current rate, "1 pt = $x", "$1 = N pts" | `ValuationPolicyDTO` (DB) + client preview math | Client preview only (input echo, not a domain fact) | Effective date + last-updated shown — OK | Minor (preview math local to admin input) |
| `app/api/v1/loyalty/suggestion/route.ts` | returns `SessionRewardSuggestionOutput` | service (read-only RPC) | No | DTO carries `policyVersion`, `notes`; **but `suggestedTheo` is a bare number, completeness deferred** (dtos.ts:356-383) | Authority Ambiguity (deferred envelope) |
| `app/api/v1/players/[playerId]/loyalty/route.ts` | returns balance DTO | `service.getBalance` (cache) | No | DTO has `updatedAt` but **no authority/completeness fields**; consumers drop `updatedAt` | Authority Ambiguity (no as-of carried to UI) |

---

## 3. Findings Table

| ID | Title | Fracture type | Severity + rationale | Evidence (file:line) | Cure | Route-to |
|---|---|---|---|---|---|---|
| **F1** | Header issues comp against a phantom **0 balance** + enrollment-as-tier | Surface Misrepresentation + Projection Drift + Vocabulary Overload | **S3** — propagating; operator confirms/overdraws against a wrong-by-default balance on the primary Player-360 issue path. Same component renders truthfully in the rating-slip modal and falsely in the header → visible divergence under one UI. | `components/player-360/header/player-360-header-content.tsx:539-551` (no `currentBalance`; `currentTier={enrollment...==='active' ? 'enrolled' : ''}`); default at `issue-reward-button.tsx:73`; contrast correct call site `rating-slip-modal.tsx:815-816` | Carry the canonical projection to the boundary: header must read `usePlayerLoyalty(playerId, casinoId)` and pass real `currentBalance`/`tier`; never default balance to 0. Single source = balance cache. | loyalty owner |
| **F2** | Comp confirm **recomputes** points cost + post-debit balance client-side | Surface Misrepresentation (surface-owned recompute) | **S3** — the number the operator confirms is a second derivation of the server's authoritative redeem math; diverges on rounding / mid-drawer rate change / overdraw policy. "Estimate rendered as if settled." | `components/loyalty/comp-confirm-panel.tsx:88` (`pointsCost = Math.ceil(amountCents / centsPerPoint)`), `:89` (`postDebitBalance = currentBalance - pointsCost`), `:178-200` render | Single-formula-owner: server owns redeem math; surface should label the pre-confirm number "estimated" OR fetch a server preview. At minimum render-only the projection; do not present recompute as the post-issuance balance. | financial-model-authority (surface rendering contract) + loyalty owner |
| **F3** | Loyalty panel **fabricates `bronze` tier** for null-tier players | Surface Misrepresentation (fabricated completeness) | **S2** — contained (one panel), but renders a derived default as an authoritative tier badge (icon, color, "bronze Member"); operator cannot tell "no tier" from "bronze". | `components/player-dashboard/loyalty-panel.tsx:141` (`loyalty.tier?.toLowerCase() \|\| 'bronze'`), rendered `:193,214` | Distinct null/zero semantics: null tier must render "—"/"unassigned", not a fabricated bronze. | loyalty owner |
| **F4** | Shift-report PDF labels snapshot liability "**Dollar Liability**" with **no as-of**, dropping the "Estimated" qualifier the widget carries | Surface Misrepresentation (Reconciliation-Leak-adjacent) | **S2** — export is a durable, sharable artifact; an estimated periodic snapshot reads as a settled dollar liability with no snapshot date. Lower propagation than F1/F2 but harder to retract (printed). | `services/reporting/shift-report/pdf/sections/loyalty-liability.tsx:51-56` ("Dollar Liability", `estimatedMonetaryValueCents`); contrast widget label "Estimated Liability" + FreshnessBadge `loyalty-liability-widget.tsx:59,49` | Carry provenance to the export boundary: label "Estimated Loyalty Liability" + render the snapshot/as-of date in the section. | financial-model-authority (surface rendering contract) |
| **F5** | Balance / suggestion DTOs do not carry authority/as-of to UI | Authority Ambiguity | **S2** — `PlayerLoyaltyDTO.updatedAt` and suggestion `policyVersion` exist server-side but are dropped before render; balance is a cache (drift-detected, not drift-prevented per remediation-surface §2.2) yet shown as live truth with a manual refresh button only. | `services/loyalty/dtos.ts:103-121` (`PlayerLoyaltyDTO`, no authority field), `:356-383` (`suggestedTheo` bare, completeness deferred); render drops `updatedAt` (`rating-slip-modal.tsx:795`, `loyalty-panel.tsx:219`) | Carry `updatedAt`/as-of to the balance render; classify suggestion as `estimated/partial` (the deferred PRD-070 Phase 1.2 envelope). | financial-model-authority + loyalty owner |
| **F6** | "Estimate" vs "balance" vs "liability" rendered adjacently with overloaded value vocabulary | Vocabulary Overload | **S1** — named ambiguity; the modal does label "Session Reward Estimate" well, but "points", "balance", "value", "liability", "comp", "reward", "entitlement", "theo" are used across surfaces with no shared glossary at the boundary. | inventory in §4 | SRL semantic root: bind loyalty surface terms to owner + epistemic claim; closed label allow-list. | SRL / loyalty owner |

---

## 4. Vocabulary-at-Surface Inventory

| Surface term | Where | Underlying concept | Authority as rendered | Issue |
|---|---|---|---|---|
| "Points Balance" / "points available" / "Current balance" | rating-slip-modal:792, loyalty-panel:222, comp-confirm:185 | `player_loyalty.current_balance` cache | rendered as live/authoritative | no as-of; cache, drift-detected only (F5) |
| "Balance after" / "After issuance" | issuance-result:387, comp-confirm:194 | **two different things**: result = server `balanceAfter` (minted); confirm = client recompute (estimate) | both rendered identically as authoritative | overloaded label across mint vs estimate (F2) |
| "Session Reward Estimate" / "+N pts" | rating-slip-modal:833,843 | `suggestion.suggestedPoints` (live, non-minted) | **correctly** labeled "Estimate" + "(frozen)" | exemplar of good provenance |
| "Estimated Liability" vs "Dollar Liability" | widget:59 vs pdf:53 | same snapshot `estimatedMonetaryValueCents` | widget honest; PDF drops "Estimated" | inconsistent authority label (F4) |
| "Tier" / "<tier> Member" / enrollment badge | loyalty-panel:193,214; header passes enrollment as tier | `player_loyalty.tier` (nullable) vs enrollment status | null→'bronze' fabricated; enrollment string used as tier | tier vs enrollment conflation (F1, F3) |
| "Comp" / "Entitlement" / "Reward" | reward-selector:160, drawer:152 | `points_comp` (debit) vs `entitlement` (coupon) family | consistent | OK |
| "Face value" (comp) vs "Configured face value" (entitlement) | issuance-result:392 vs entitlement-confirm:105 | `faceValueCents` | comp bare; entitlement enveloped (`completeness:'complete'`) | asymmetric provenance (comp deferred per dtos.ts:529-541) |
| "Sent to printer" / "Status unknown" / "Not sent" | print-outcome-badge:80,98,117 | `PrintResultStatus` | **deliberately bounded** ("not yet confirmed printed") | exemplar of truthful one-way provenance |

---

## 5. Open Questions

1. **F1 confirm:** Is the header's omission of `currentBalance` intentional (deferred fetch) or a regression? The button defaults to `0` silently — does any production path issue comps from the header today, or only via the modal? (Determines S3 vs S2.)
2. **F2 scope:** Does `rpc_redeem` offer a dry-run/preview, or must the surface always estimate pre-confirm? If no preview exists, the client recompute is currently unavoidable — cure is then *labeling* ("estimated post-issuance balance"), not removal.
3. **Balance authority:** Is `player_loyalty.current_balance` ever stale at render time given the 5-min `staleTime` (use-loyalty-queries.ts:54)? If drift is only detected (not prevented) per remediation-surface §2.2, should every balance render carry `updatedAt`?
4. **Suggestion vs accrual reset symptom:** The brief flags an average-bet-reset symptom. The suggestion is recomputed live (`staleTime:10s`) from session activity and is NOT minted; the modal labels it "Estimate". Need confirmation from the producer-side agent whether the *suggestion formula* itself resets on average-bet change — this surface audit confirms the UI does **not** conflate suggestion with minted balance (they are separate rows), so the symptom, if real, originates upstream of the render boundary, not here.
5. **F4 export:** Does the shift-report snapshot carry a snapshot/as-of timestamp into `LoyaltyLiabilitySection`? If not, the PDF cannot show as-of even after a label fix — escalate to the reporting DTO owner.
