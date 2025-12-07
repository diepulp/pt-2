# Visit Service Enhancement Plan (Corrected & Simplified)

**Status:** Draft v2 (Corrected)  
**Date:** 2025-12-05  
**Context:** PT-2 – VisitService, RatingSlip, Loyalty, Finance, MTL  
**Supersedes:** Visit Service Enhancement Plan v1 (pre-audit)

---

## 0. Purpose of this Revision

This document is a **corrected and simplified** version of the original Visit Service Enhancement Plan. It:

- Preserves the original intent (support ghost gaming, reward-only visits, and rated gaming).  
- Aligns fully with the **Ghost Gaming ADR** and the **SRM**.  
- **Removes internal contradictions** (e.g., “slips without visits” for ghost play).  
- **Simplifies the schema** by using a single `visit_kind` enum instead of three orthogonal enums, while still keeping the rich domain model for documentation and analytics.

The target is a **KISS-aligned, internally consistent baseline** for PT-2, suitable for implementation and later refinement.

---

## 1. Problem Recap & Goals

### 1.1. Problem Recap

We need VisitService to support three distinct business scenarios:

1. **Reward-only, identified** – Player exists, no gaming, loyalty redemptions/comps only.  
2. **Gaming, identified, rated** – Player exists, plays rated gaming that feeds loyalty.  
3. **Gaming, unregistered / ghost** – No Player record; gaming must be tracked for **Finance** and **Compliance**, but is **unrated** for loyalty.

Previous attempts to extend the model introduced:

- Multiple enums (`identity_scope`, `engagement_mode`, `loyalty_rating`) with partial constraints.  
- A suggestion that `rating_slip` might exist without `visit` for ghost gaming.  
- An overloaded concept of “unrated” that conflated reward-only and ghost gaming.

This led to inconsistencies and unnecessary complexity for PT-2.

### 1.2. Goals

1. **Visit as universal session grain**: Every gaming session (rated or ghost) is anchored by a `visit` row.  
2. **Three clear visit archetypes** for PT-2:
   - Reward-only identified,
   - Gaming identified rated,
   - Gaming ghost unrated (compliance-only).  
3. **Loyalty remains an opt-in layer** on top of identified, explicitly rated visits.  
4. **Ghost gaming is fully tracked** for Finance and MTL, without leaking into loyalty.  
5. Keep the physical schema **as simple as possible** while preserving the conceptual richness in docs.

---

## 2. Conceptual Model (Domain)

### 2.1. Conceptual Dimensions

For reasoning, we still use three conceptual dimensions:

1. **Identity scope** – `identified` vs `ghost`.  
2. **Engagement mode** – `reward` vs `gaming`.  
3. **Loyalty eligibility** – `rated` vs `unrated`.

However, instead of materializing three separate enums in the database, we **collapse them into a single `visit_kind` enum** that expresses only the combinations we actually support in PT-2.

### 2.2. Supported Visit Archetypes (PT-2)

We support three **archetypes**, each represented by a value of `visit_kind`:

| `visit_kind`                 | Identity scope | Engagement | Loyalty rating | Description                                   |
|-----------------------------|----------------|-----------|----------------|-----------------------------------------------|
| `reward_identified`         | identified     | reward    | n/a (no play)  | Reward-only visits; no gaming, loyalty only.  |
| `gaming_identified_rated`   | identified     | gaming    | rated          | Standard rated gaming visits.                 |
| `gaming_ghost_unrated`      | ghost          | gaming    | unrated        | Ghost gaming, compliance-only; no loyalty.    |

Any other combination is considered **out of scope for PT-2** and is **not representable** by the schema. Analytics and documentation can still describe the conceptual dimensions, but the physical schema stays small and self-consistent.

### 2.3. High-Level Invariants

- **All gaming activity has a visit**:  
  - Table gaming is always tied to a `visit` (identified or ghost).  
  - There are no “rating-only” table slips without a visit.

- **Reward-only vs gaming**:  
  - `reward_identified` visits **must not** have gaming telemetry (`rating_slip`).  
  - Both `gaming_identified_rated` and `gaming_ghost_unrated` may have gaming telemetry.

- **Loyalty accrual**:  
  - Only `gaming_identified_rated` visits are eligible for automated loyalty accrual.  
  - `reward_identified` may be used for redemptions, adjustments, and comps.  
  - `gaming_ghost_unrated` is compliance-/finance-only; any comps are manual and supervised.

---

## 3. Schema Changes (High-Level)

### 3.1. `visit` Table – Add `visit_kind`

**New enum:**

```sql
CREATE TYPE visit_kind AS ENUM (
  'reward_identified',
  'gaming_identified_rated',
  'gaming_ghost_unrated'
);
```

**Changes to `public.visit`:**

- Add `visit_kind` (required):  
  ```sql
  ALTER TABLE public.visit
  ADD COLUMN visit_kind visit_kind NOT NULL;
  ```

- Ensure existing visits are safely backfilled. For PT-2 we assume that **all existing visits** represent standard rated gaming visits; therefore:  
  ```sql
  UPDATE public.visit
  SET visit_kind = 'gaming_identified_rated'
  WHERE visit_kind IS NULL;
  ```

- Add NOT NULL constraint:  
  ```sql
  ALTER TABLE public.visit
  ALTER COLUMN visit_kind SET NOT NULL;
  ```

### 3.2. `visit` Table – Invariants via Constraints

We encode identity requirements in terms of `visit_kind`:

1. **Player presence for identified visits**

   ```sql
   ALTER TABLE public.visit
   ADD CONSTRAINT chk_visit_kind_player_presence
   CHECK (
     (visit_kind = 'gaming_ghost_unrated' AND player_id IS NULL)
     OR (visit_kind <> 'gaming_ghost_unrated' AND player_id IS NOT NULL)
   );
   ```

   - Ghost visits must have `player_id IS NULL`.  
   - Identified visits must have `player_id NOT NULL`.

2. **Gaming vs reward-only telemetry**

   We do not encode this as a hard DB constraint (because it crosses tables), but we treat it as a **service-level invariant**:

   - `reward_identified` → no `rating_slip` rows may reference this `visit_id`.  
   - `gaming_identified_rated` / `gaming_ghost_unrated` may have `rating_slip` rows.

   This invariant will be enforced by VisitService and RatingSlipService. If needed later, we can introduce triggers/checks, but for PT-2 we keep the DB layer simple.

### 3.3. `rating_slip` Table – Visit & Table Requirements

To align with “Visit is the universal session grain” and our PT-2 focus on table games:

1. **`visit_id` is required for table gaming telemetry**

   ```sql
   ALTER TABLE public.rating_slip
   ALTER COLUMN visit_id SET NOT NULL;
   ```

   - Every table rating slip **must** reference a `visit`.  
   - Ghost gaming is represented by `visit.visit_kind = 'gaming_ghost_unrated'`, not by `visit_id IS NULL`.

2. **`table_id` is required for table rating slips**

   ```sql
   ALTER TABLE public.rating_slip
   ALTER COLUMN table_id SET NOT NULL;
   ```

   - PT-2 explicitly scopes rating slips to **table games**.  
   - If we introduce slots or non-table stations later, we can split or relax this.

3. **Consistency with `visit_kind`** (service-level invariant)

   - If a `rating_slip` exists for a given `visit_id`, that visit’s `visit_kind` must be either:
     - `gaming_identified_rated` or  
     - `gaming_ghost_unrated`.

   VisitService/RatingSlipService will enforce this rule. It can later be codified as a trigger if needed.

---

## 4. VisitService Behavior (High-Level, No Code)

### 4.1. Creation Flows

VisitService exposes three primary creation flows, corresponding to the three `visit_kind` values:

1. **Reward-only visit (identified)** – `visit_kind = 'reward_identified'`  
   - Inputs: `casino_id`, `player_id`, `staff_id` (and standard metadata).  
   - Behavior:
     - Opens a visit for loyalty redemptions / service interactions with **no gaming**.  
     - May support point redemptions, comps, and adjustments.  
     - Must not be used as a parent for `rating_slip` rows.

2. **Gaming visit (identified, rated)** – `visit_kind = 'gaming_identified_rated'`  
   - Inputs: `casino_id`, `player_id`, `staff_id`, optional `gaming_table_id`.  
   - Behavior:
     - Represents standard rated play for a known player.  
     - RatingSlipService can attach rated telemetry.  
     - Loyalty accrual logic uses this visit as the session grain.

3. **Ghost gaming visit (unrated, compliance-only)** – `visit_kind = 'gaming_ghost_unrated'`  
   - Inputs: `casino_id`, `staff_id`, `gaming_table_id`, and optional descriptive notes.  
   - Behavior:
     - Represents gaming activity for a **non-enrolled patron**.  
     - `player_id` is NULL; visit is **unrated**.  
     - Finance and MTL attach to this visit for buy-ins, cash-outs, and compliance rules.  
     - RatingSlipService may log play telemetry, but LoyaltySvc must exclude it from accrual.

### 4.2. Conversion Flows

VisitService supports two conceptually important conversions:

1. **Reward-only → Gaming (identified, rated)**  
   - Scenario: patron initially comes for redemption/service and then decides to play.  
   - Behavior:
     - Only allowed while visit is `active`.  
     - Updates `visit_kind` from `reward_identified` → `gaming_identified_rated`.  
     - After conversion, RatingSlipService may attach rated telemetry.  
     - Conversion is audited via `audit_log`.

2. **Ghost gaming → Identified (optional, back-office)**  
   - Scenario: ghost player later enrolls or is matched to a Player.  
   - Behavior:
     - This is a **manual, supervised back-office operation**.  
     - Either:
       - Attach the ghost visit to a Player and optionally convert `visit_kind` to `gaming_identified_rated`, **or**  
       - Leave it as `gaming_ghost_unrated` but link it for reference.
     - No **automatic** loyalty accrual is triggered by this association; any retroactive comps are manual.  
     - Operation must write an `audit_log` entry capturing old state, new state, supervisor, timestamp, and reason.

### 4.3. State Machine (Status vs Kind)

In addition to `visit_kind`, visits still have a lifecycle status (e.g., `active`, `on_break`, `closed`, `voided`). We keep the status machine simple and independent of `visit_kind`:

- `active → on_break → active → closed`  
- `active → voided`  
- `reward_identified` visits can go `active → closed` without ever converting to gaming.  
- `gaming_*` visits follow the same lifecycle, with RatingSlip/Finance/MTL attaching during `active` state.

---

## 5. Bounded Context Interactions

### 5.1. RatingSlipService

**Responsibilities**:

- Capture play telemetry for table gaming.  
- Attach slips to visits **via `visit_id`** (ghost or identified).  
- Distinguish between:

  - **Rated telemetry** (for `gaming_identified_rated` visits).  
  - **Compliance-only telemetry** (for `gaming_ghost_unrated` visits).

**Key rules**:

- RatingSlipService must **always** operate against a `visit_id`. It no longer creates slips that “float” without a visit.  
- Before inserting a slip, it must ensure that the parent visit has a gaming `visit_kind` (`gaming_identified_rated` or `gaming_ghost_unrated`).  
- Loyalty logic will consider only slips attached to `gaming_identified_rated` visits.

### 5.2. LoyaltyService

**Loyalty eligibility** is defined strictly in terms of `visit_kind`:

- Eligible for automated loyalty accrual:
  - `visit_kind = 'gaming_identified_rated'` only.

- Not eligible for automated accrual (but visible for audit/reporting):
  - `reward_identified` – used for redemptions and adjustments, **no gaming**.  
  - `gaming_ghost_unrated` – ghost gaming for compliance/finance, **no loyalty**.

LoyaltyService will:

- Consider `visit_kind` when selecting visits for point calculation.  
- Ignore ghost visits for automated accrual; any comps based on ghost play are manual and supervised.

### 5.3. FinanceService

FinanceService attaches monetary movements (buy-ins, cash-outs, etc.) to visits regardless of `visit_kind`:

- `reward_identified`: affects balances via redemptions/adjustments; no gaming.  
- `gaming_identified_rated`: standard rated gaming finance.  
- `gaming_ghost_unrated`: gaming finance for non-enrolled patrons (CTR-relevant).

FinanceService thus benefits from **uniform visit anchoring** across all gaming and reward flows.

### 5.4. MTL / Compliance

MTL/Compliance treats **any visit with gaming and/or significant cash movement** as in-scope:

- Can evaluate CTR, SAR, and MTL rules using `visit` as the session grain.  
- `gaming_ghost_unrated` is a first-class citizen here; identity data may be limited, but table/time/amounts/notes must be present.  
- Identified gaming (`gaming_identified_rated`) and large reward-only adjustments (`reward_identified`) are also in scope for MTL where relevant.

---

## 6. PRD & SRM Corrections (Summary)

This plan corrects and replaces the following previous positions:

1. **“Slips can exist without visits (ghost gaming)”**  
   - **Replaced with:** all table gaming slips require a `visit_id`. Ghost gaming uses `visit_kind = 'gaming_ghost_unrated'` with `player_id` NULL.

2. **Ambiguous “unrated” definition**  
   - **Clarified as:**

     - `reward_identified` → reward-only, identified, **no gaming**; relevant mainly to Loyalty and Finance.  
     - `gaming_ghost_unrated` → ghost gaming, **compliance & finance only**; no automated loyalty accrual.

3. **Multiple enums for identity/engagement/rating**  
   - **Simplified to:** a single `visit_kind` enum capturing only valid PT-2 combinations.

4. **Ghost + reward combination**  
   - **Removed:** ghost reward-only visits are **not** supported in PT-2. Ghost visits always represent gaming sessions.

5. **VisitService scope**  
   - Explicitly reaffirmed as the **universal session grain** for gaming and reward flows, with Loyalty as an optional layer on top.

---

## 7. RLS & Audit Considerations (High-Level)

- Ghost visits (`gaming_ghost_unrated`) have `player_id = NULL` and must be visible only to authorized staff (pit, cage, compliance).  
- RLS policies should:

  - Scope access by `casino_id` and staff role.  
  - Allow compliance roles broader access for MTL/CTR oversight.

- The **ghost → identified** association operation:

  - Must be exposed only via an **admin/back-office API/flow**.  
  - Must **always** write an `audit_log` record with old/new values, staff id, timestamp, and reason.  
  - Must **not** automatically trigger loyalty accrual; any retroactive rewards are separate supervisor decisions.

---

## 8. Implementation Notes (Non-Exhaustive Checklist)

1. **Migrations**

   - Add `visit_kind` enum and column to `visit`.  
   - Backfill existing rows to `gaming_identified_rated`.  
   - Make `visit_kind` NOT NULL and add `chk_visit_kind_player_presence`.  
   - Make `rating_slip.visit_id` and `rating_slip.table_id` NOT NULL.

2. **TypeScript / Supabase Types**

   - Regenerate `database.types.ts` to include `visit_kind`.  
   - Introduce a `VisitKind` TS union derived from the enum.  
   - Update service-layer types to use `visit_kind` instead of the three-enum design.

3. **VisitService**

   - Implement three creation flows (reward identified, gaming identified rated, gaming ghost unrated).  
   - Implement conversion flows (reward → gaming-rated, ghost → identified/rated) with audit logging.  
   - Enforce invariants around `visit_kind` and `player_id`.

4. **RatingSlipService**

   - Require `visit_id` for all table slips.  
   - Validate that the parent visit has a gaming `visit_kind`.  
   - Distinguish between rated and compliance-only telemetry logically, based on `visit_kind`.

5. **LoyaltyService / FinanceService / MTL**

   - Update queries and rules to use `visit_kind` to filter eligible visits.  
   - Ensure ghost visits are included in compliance and finance reports but excluded from automated loyalty accrual.

This v2 plan should be used as the canonical reference for VisitService & ghost gaming behavior in PT-2 going forward.
