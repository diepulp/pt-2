# Agent 1 — Valuation Authority & Retroactive Re-Valuation

**Domain:** Loyalty (split-brain remediation surface §2.2)
**Angle:** Valuation authority & retroactive re-valuation of held/accrued points.
**Date:** 2026-06-21 · **Branch:** `epson` · **Mode:** read-only diagnosis
**Framework:** split-brain-authority (10-fracture taxonomy, S0–S5, cure A/B/C)

---

## 1. Angle Summary

PT-2 has **two distinct point↔money conversion rates** that the codebase does not name distinctly:

1. **Accrual conversion rate** (`points_conversion_rate`) — converts a slip's theo (dollars) → points *minted*. This rate **is correctly pinned** at slip close into `rating_slip.policy_snapshot` and stamped onto the ledger row's `metadata.calc.conversion_rate`. Earned points are immutable history. This obeys the vision-doc snapshot rule.

2. **Valuation rate** (`cents_per_point`, `loyalty_valuation_policy`, PRD-053/ADR-039) — converts *existing held points* → dollars, for (a) comp redemption pricing and (b) outstanding-liability reporting. This rate is **never pinned**. Every consumer reads only the `is_active = true` row.

The confirmed symptom — editing the rate at `/admin/loyalty/economics` retroactively changes the dollar value of points already accrued/held — is real and originates entirely in concept (2). The `loyalty_valuation_policy` table *is* versioned (`effective_date`, `version_identifier`, `is_active`, append-via-rotate RPC), but **every projection ignores the version axis and reads only `is_active`**. Authority is versioned; the projection is point-in-time-blind. That is the split.

The precise, defensible boundary: **redemption pricing legitimately uses the live rate** (you price a comp at today's rate at the moment you sell it). **Liability/holding valuation must be pinned** to the rate in effect when the points were held / as-of the reporting instant — and re-running the daily snapshot after a rate change silently re-values the identical outstanding-point pool.

---

## 2. Findings Table

| ID | Title | Fracture type(s) | Severity | Provenance verdict | Cure | Route-to |
|---|---|---|---|---|---|---|
| **VAL-01** | Liability snapshot recomputes `points × live_rate`; re-run after rate change re-values held points | Authority Ambiguity + Projection Drift | **S4** | FAIL — "as-of which rate?" answered by *whenever the snapshot last ran*, not by accrual epoch | B (single-formula-owner, as-of pin) | financial-model-authority |
| **VAL-02** | Liability widget surfaces pinned snapshot $ next to a separately-fetched **live** rate | Surface Misrepresentation + Authority Ambiguity | **S3** | FAIL — the displayed $ and the displayed rate can disagree by construction | B + render contract | financial-model-authority |
| **VAL-03** | Three independent `is_active`-only read sites for the same rate (service / hook / measurement query) | Projection Drift (read-side) | **S2** | PARTIAL — all read the same row, but no single owner; cache skew possible | B (one read owner) | financial-model-authority |
| **VAL-04** | Two unnamed conversion rates ("conversion_rate" vs "cents_per_point") both = "point value" | Vocabulary Overload | **S2** | FAIL — "point value" is two different facts under near-identical names | C (SRL semantic root) | split-brain SRL / financial-model-authority |
| **VAL-05** | `loyalty_ledger` stores no valuation rate; held-point $ value has no provenance anchor at all | Authority Ambiguity | **S3** | FAIL — a held point's dollar value cannot answer "as-of which rate" from any stored field | B (pin or as-of lookup) | financial-model-authority |
| **VAL-06** | Comp redemption prices at live rate (LEGITIMATE) but is not labeled as forward-priced | Authority Ambiguity (label only) | **S1** | PASS (mechanism) / weak label | label/SRL note | financial-model-authority |

---

### VAL-01 — Snapshot re-valuation (root mechanism), S4

`rpc_snapshot_loyalty_liability` reads the **current active** policy and multiplies the **entire** outstanding-point pool by it:

- `supabase/migrations/20260307115101_adr039_rpc_snapshot_loyalty_liability.sql:56-59` — `SELECT * INTO v_policy FROM loyalty_valuation_policy WHERE casino_id = v_casino_id AND is_active = true`
- `:69-77` — `SUM(current_balance)` over all `player_loyalty`, then `v_monetary_value_cents := (v_total_points * v_policy.cents_per_point)`
- `:99-104` — UPSERT is `ON CONFLICT (casino_id, snapshot_date) DO UPDATE`, so **re-running the snapshot on the same gaming-day after a rate edit overwrites the prior monetary value** with the new-rate product.

The snapshot *does* pin `valuation_policy_version` + `valuation_effective_date` (`:87-97`, schema `20260307114452_...:38-39`) — provenance is recorded — but the **value itself is computed against whatever rate is active at snapshot time**, applied uniformly to points that were accrued under many historical rates. Changing the rate today and snapshotting re-prices yesterday's liability. **Severity S4: this is the liability/holding figure that flows into the shift report (financial-adjacent surface); an authority/accuracy hazard, not merely local.**

### VAL-02 — Widget shows pinned $ beside live rate, S3

The measurement read path fetches the snapshot row **and a separate live `is_active` rate** and renders them together:

- `services/measurement/queries.ts:242-257` — `Promise.all([ snapshot (latest by snapshot_date), policy (is_active=true) ])` — two independent reads.
- `services/measurement/mappers.ts:285-292` — DTO carries `estimatedMonetaryValueCents` (from snapshot, pinned to *snapshot-time* rate) **and** `centsPerPoint: policy?.cents_per_point` (from the *current* live row).
- `components/measurement/loyalty-liability-widget.tsx:60-89` — renders `formatCents(estimatedMonetaryValueCents)` as "Estimated Liability" directly above "Valuation Rate" `centsPerPoint`.
- Identical pattern in the shift report: `components/reports/shift-report/sections/loyalty-liability.tsx:79-97` shows the snapshot $ and the rate with a "Snapshot: {date}" caption.

After a mid-day rate edit (before the next snapshot run), the operator sees a dollar figure computed at the **old** rate beside the **new** rate — a number whose two visible components contradict each other. **S3: propagating surface misrepresentation across two operator surfaces.**

### VAL-03 — Three live read sites, no single owner, S2

The same `is_active`-only rate lookup is duplicated in three places, none of which is the canonical owner of "what is a point worth":

- `services/loyalty/crud.ts:642-661` — `getActiveValuationCentsPerPoint` (used by `issueComp`, `:802-806`).
- `hooks/loyalty/use-loyalty-queries.ts:199-208` — `useValuationRate`, with `staleTime: 300_000 // 5 min cache — valuation rate changes rarely` (`:211`). A client cache further widens the window in which a stale rate prices a comp after an admin edit.
- `services/measurement/queries.ts:250-256` — third copy inside `queryLoyaltyLiability`.

All three read the same row, so they don't *disagree* structurally today, but there is no single-formula-owner; this is the read-side seedbed of drift. **S2 (contained, but a cure-B target).**

### VAL-04 — Vocabulary overload: two "point values", S2

- Accrual rate: `points_conversion_rate` (slip snapshot) → ledger `metadata.calc.conversion_rate` (`supabase/migrations/20251213010000_prd004_loyalty_rpcs.sql:166,201`).
- Valuation rate: `cents_per_point` (`loyalty_valuation_policy`).

Both are "how many points equal a dollar," carried under different names, owned by different lifecycles, and neither SRL-bound. An operator/engineer reading "point value" cannot tell which fact is meant. This is the documentation-layer mirror of the disease (taxonomy §Vocabulary Overload). **S2.**

### VAL-05 — Held points have no stored valuation provenance, S3

`loyalty_ledger` (`types/database.types.ts:1176-1210`) has `points_delta` and `metadata` only — **no valuation-rate column**. `player_loyalty.current_balance` is a points-only cache (`20251213003000_...:157-178`). Therefore the dollar value of any held point exists **only** as a live recompute; there is no field anywhere that answers "as-of which rate is this balance worth $X." The accrual `conversion_rate` in metadata pins the *minting* math, not the *valuation* math. **S3 — provenance is structurally absent for the valued figure.**

### VAL-06 — Redemption is legitimately live-priced (label gap), S1

`issueComp` computes `pointsCost = ceil(faceValueCents / centsPerPoint)` at issuance time using the live rate (`services/loyalty/crud.ts:865-866`; mirrored in the UI preview `components/loyalty/comp-confirm-panel.tsx:88,178-179`). **This is correct**: a comp is priced and sold at the rate in effect at the moment of sale (forward-looking, like a register price). The only gap is that this value is not *labeled* as "priced at today's rate," leaving it semantically adjacent to the (incorrectly) live-valued liability. **S1 — keep the mechanism, add a label.**

---

## 3. Root Cause (stated precisely)

> `loyalty_valuation_policy` is a **versioned authority** (append-on-rotate via `rpc_update_valuation_policy`, which deactivates the prior active row and inserts a new one — `20260320173525_...:98-121`), but **every consumer projects it through a single `is_active = true` lookup**, discarding the `effective_date` / `version_identifier` version axis. Liability and held-point valuation therefore bind to *the currently active rate* rather than *the rate as-of the points' accrual/holding epoch*. Because the daily snapshot RPC recomputes `SUM(balance) × active_rate` and UPSERTs on `(casino_id, snapshot_date)`, editing the rate and re-snapshotting **retroactively re-prices the identical outstanding-point pool**. The arithmetic is correct; the **authority of the rate is mislabeled** — a live operational rate is being presented as the historical valuation of already-held points. This is "most issues are semantic, not computational" in its textbook form.

The project already knows the cure: the vision doc states the **snapshot rule** — *"Do not compute base accrual from live game_settings... Otherwise you'll retroactively mutate history when settings change"* (`docs/00-vision/LoyaltyService_Points_Policy_PT-2.md:38`) — and applied it to the *accrual* rate. The **valuation** rate (added later, PRD-053/ADR-039) never inherited that discipline. Classic feature-first sequencing debt.

---

## 4. Legitimately Live vs Must-Be-Pinned

| Valued number | Site | Verdict | Rationale |
|---|---|---|---|
| Comp redemption price (`pointsCost` from `faceValueCents/cents_per_point`) | `crud.ts:865`, `comp-confirm-panel.tsx:88` | **LIVE — correct** | Priced at moment of sale; forward-looking. Pinning would be wrong. Needs only a "priced at current rate" label. |
| Points *minted* on accrual | `prd004_loyalty_rpcs.sql:166` | **PINNED — correct** | Already snapshotted via `policy_snapshot.points_conversion_rate`. Do not touch. |
| Outstanding **liability** $ (`estimated_monetary_value_cents`) | snapshot RPC `:77`; widget; shift report | **MUST BE PINNED / as-of** | Re-valuing already-held points on a rate edit is the bug. Value must bind to the rate as-of the snapshot instant *and that binding must not be retroactively overwritten*. |
| Held-balance $ value (ad-hoc displays) | derived from live rate; no stored field (VAL-05) | **MUST BE as-of** | A held point's worth should resolve via an as-of versioned lookup keyed to the valuation instant, not blindly to `is_active`. |
| Valuation **rate** shown next to a pinned $ | widget `:82-89`; shift report `:90-97` | **MUST MATCH the $ it annotates** | Show the rate the displayed $ was computed at (snapshot's `valuation_policy_version`/`valuation_effective_date`, both already stored), never the live `is_active` rate. |

**Cure direction (route to financial-model-authority for the fact-class/valuation contract):** Cure B (single-formula-owner) with an **as-of versioned lookup** rather than `is_active`. Specifically: (a) the liability projection should value points against the snapshot-pinned rate and the snapshot row must be treated as immutable history (don't silently overwrite on re-run, or key on version); (b) surfaces must render the rate that produced the displayed dollar figure — the snapshot already stores `valuation_policy_version` + `valuation_effective_date`, so the data exists and is simply not surfaced; (c) collapse the three `is_active` read sites (VAL-03) to one owner; (d) bind both rates as distinct SRL terms (VAL-04). This is **not** an outbox case (Cure A) — the rate is read-time derivable from a versioned authority table; select the weakest mechanism that preserves the invariant.

---

## 5. Open Questions / For Other Angles

1. **Snapshot immutability policy** — Should `rpc_snapshot_loyalty_liability` refuse to overwrite an existing `(casino_id, snapshot_date)` row, or key snapshots on `valuation_policy_version` too? (Lifecycle question → financial-model-authority.)
2. **`effective_date` semantics** — The rate carries `effective_date` but the rotation RPC does not enforce that `is_active` ⇔ "effective today." Could a future-dated rate be marked active prematurely? (Lifecycle Ambiguity — needs Agent on lifecycle/activation.)
3. **Balance-cache vs ledger-sum drift** (remediation-surface §2.2) interacts here: if `current_balance` drifts from `SUM(points_delta)`, the liability $ inherits the drift *and* the rate error. Cross-check with the balance-projection angle.
4. **Promo coupon liability** — promo coupons (outbox-only, no ledger) are outside this rate path today; when promo liability enters financial reporting it will need its own valuation contract. (Propagation angle.)
5. **Does any export/PDF use "Total Liability" or "final" language** over the live-revalued number? (Reconciliation Leak check — Surface angle should confirm copy in `services/reporting/shift-report/pdf/sections/loyalty-liability.tsx`.)
6. **`/admin/loyalty/economics` UX** — does the rate-edit form warn the admin that the change re-prices outstanding liability? (`components/admin/valuation-settings-form.tsx` — surface angle.)
