---
title: "Loyalty Instruments — Bug Triage Report"
status: triage-refreshed
date: 2026-03-18
original_date: 2026-03-09
source: LOYALTY-INTSRUMENTS-SYSTEM-POSTURE-AUDIT.md §6
references:
  - LOYALTY_PROMO_INSTRUMENTS_EXTENSION_v0.1_REDACTED.md
  - LOYALTY-INTSRUMENTS-SYSTEM-POSTURE-AUDIT.md
  - MATCHPLAY-PRINT-READINESS-REPORT.md
  - REWARD_FULFILLMENT_POLICY.md
  - ../../../10-prd/PRD-LOYALTY-ADMIN-CATALOG-v0.md
---

# Loyalty Instruments — Bug Triage Report

Parallel domain-expert investigation of the 5 bugs surfaced in the
[System Posture Audit](LOYALTY-INTSRUMENTS-SYSTEM-POSTURE-AUDIT.md) §6.

> **2026-03-18 Refresh**: Re-assessed against [Reward Fulfillment Policy](REWARD_FULFILLMENT_POLICY.md) (written after initial triage) and [PRD-LOYALTY-ADMIN-CATALOG-v0](../../../10-prd/PRD-LOYALTY-ADMIN-CATALOG-v0.md) (Vector A, in progress). Blocking/non-blocking classification added. Terminology correction applied: `free_bet` → `free_play` per fulfillment policy authority.

---

## Disposition Summary

| # | Issue | Sev | Verdict | Action | Vector A |
|---|-------|-----|---------|--------|----------|
| 1 | Missing inventory API route | P2 | **Confirmed — fix required** | Ship in slice | **BLOCKER** |
| 2 | ManualRewardDialog stub | P3 | **Confirmed — design gap** | Defer to Vector B | Not blocking |
| 3 | loyalty_outbox missing types | — | **False positive — CLOSED** | No action | Not blocking |
| 4 | promo_type_enum incomplete | P3 | **Confirmed — severity reduced** | Ship `free_play` for pilot; defer rest | Partial blocker |
| 5 | promo_program.status mismatch | P3 | **Confirmed — intentional divergence** | Document in ADR addendum | Not blocking |

---

## Bug #1 — Missing Inventory API Route

**Severity**: P2 | **Verdict**: Confirmed | **Action**: Ship in Vector A slice | **BLOCKER**

### Finding

`services/loyalty/promo/http.ts:178-196` calls `GET /api/v1/promo-coupons/inventory`
but no route handler exists at `app/api/v1/promo-coupons/inventory/route.ts`.

The full supporting stack is operational:

| Layer | Asset | Status |
|-------|-------|--------|
| RPC | `rpc_promo_coupon_inventory` (SECURITY INVOKER) | Deployed |
| Service | `getCouponInventory()` in `crud.ts:477-498` | Operational |
| Schema | `couponInventoryQuerySchema` in `schemas.ts` | Operational |
| DTO | `CouponInventoryQuery`, `CouponInventoryOutput` in `dtos.ts:361-392` | Operational |
| Hook | `usePromoCouponInventory()` in `use-promo-coupons.ts:151-162` | Operational |
| **Route** | **`app/api/v1/promo-coupons/inventory/route.ts`** | **Missing** |

### Fix

Create `app/api/v1/promo-coupons/inventory/route.ts` with a GET handler:
- Use `withServerAction` middleware (matches sibling routes)
- Parse query with `couponInventoryQuerySchema` (`promoProgramId?`, `status?`)
- Delegate to `service.getCouponInventory(query)`
- Return `CouponInventoryOutput`

Estimated: ~40 lines, following existing patterns in `app/api/v1/promo-coupons/route.ts`.

> **Vector A dependency**: PRD-LOYALTY-ADMIN-CATALOG-v0 §4 line 64 explicitly includes this route. DoD §8 requires "Admin can view coupon inventory per program." This is the only code blocker for the admin-catalog slice.

### Route Tree After Fix

```
app/api/v1/promo-coupons/
├── route.ts                 (existing: GET list, POST issue)
├── inventory/
│   └── route.ts             ← NEW: GET inventory summary
└── [id]/
    ├── route.ts             (existing: GET detail)
    ├── void/route.ts        (existing: POST void)
    └── replace/route.ts     (existing: POST replace)
```

---

## Bug #2 — ManualRewardDialog Does Not Call Backend

**Severity**: P3 | **Verdict**: Confirmed — design gap | **Action**: Defer to Vector B | **Not blocking Vector A**

### Finding

`components/loyalty/manual-reward-dialog.tsx` collects "points" and "reason" then
fires `onSuccess` with client-side math (`currentBalance + awardedPoints`). Zero
network calls. The `reason` field is collected but never used.

**Semantic mismatch**: The form collects "loyalty points" but the backend expects
coupon issuance parameters:

| Dialog Collects | Backend Expects (`IssueCouponInput`) |
|-----------------|--------------------------------------|
| `points` (number) | `promoProgramId` (UUID) |
| `reason` (string, unused) | `validationNumber` (string) |
| — | `idempotencyKey` (string) |
| `playerId` (prop) | `playerId` (optional) |
| — | `visitId`, `expiresAt`, `correlationId` |

The mutation hook (`useIssueCoupon()`) exists and is fully functional but is never
imported or called.

### Assessment

This is not a simple wiring fix — the form UI needs redesign to collect promo
program selection and validation number. The dialog was stubbed as a placeholder
for Phase 1 admin UI work (GAP-1 in the posture audit).

**Options**:
- **A**: Re-design to wire to `useIssueCoupon()` with program selector — proper fix, ~100 lines
- **B**: Disable the dialog with `enabled=false` like `IssueRewardButton` does — honest stub
- **C**: Leave as-is — current state is misleading (looks functional, persists nothing)

**Recommendation**: Option A when Phase 1 admin UI begins. Until then, Option B
prevents false confidence.

> **2026-03-18 Fulfillment Policy note**: The structural mismatch is deeper than originally assessed. The dialog conflates `points_comp` semantics (loyalty points) with `entitlement` mechanics (coupon issuance). The [Reward Fulfillment Policy](REWARD_FULFILLMENT_POLICY.md) §"Implementation consequences" explicitly forbids unifying slips and coupons into one storage concept. The eventual fix (Vector B) must split into two paths or select one family — not wire "points" into `useIssueCoupon()`.
>
> **PRD alignment**: PRD-LOYALTY-ADMIN-CATALOG-v0 §2.3 excludes operator issuance ("Coupon issuance from admin is operator-side"). This is Vector B scope.

---

## Bug #3 — loyalty_outbox Missing from Generated Types

**Severity**: — | **Verdict**: FALSE POSITIVE — CLOSED | **Action**: No action required

### Finding

`loyalty_outbox` **IS present** in `types/database.types.ts` at line 1126 with
complete Row, Insert, Update, and Relationships interfaces.

**Root cause of false flag**: The readiness report (`MATCHPLAY-PRINT-READINESS-REPORT.md`)
was written 2026-02-04, two days *before* the migration was committed (2026-02-06,
commit `facb844`). The report's concern was conditional: "verify with `npm run db:types`."
The posture audit propagated this pre-flight concern without re-verification.

**Evidence**:
- Type definition present at `database.types.ts:1126-1180`
- Migration deployed: `20260206005335_prd028_restore_loyalty_outbox.sql` (140 lines)
- Types regenerated in same commit `facb844`
- 5 integration tests validate schema contract (`promo-outbox-contract.int.test.ts`)
- All 3 promo RPCs write to the table successfully

### Action

No code changes. Update the posture audit §6 to mark Bug #3 as resolved.

---

## Bug #4 — promo_type_enum Incomplete

**Severity**: P3 (reduced) | **Verdict**: Confirmed — severity reduced | **Action**: Ship `free_play` for pilot; defer remainder | **Partial Vector A blocker**

### Finding

Migration `20260106235611_loyalty_promo_instruments.sql:26` creates:

```sql
CREATE TYPE public.promo_type_enum AS ENUM ('match_play');
```

The spec (`LOYALTY_PROMO_INSTRUMENTS_EXTENSION_v0.1_REDACTED.md:72,145`) proposed:
`match_play`, `nonnegotiable`, `free_bet`, `other`.

### 2026-03-18 Terminology Correction

**The spec's `free_bet` is superseded by `free_play`.** The [Reward Fulfillment Policy](REWARD_FULFILLMENT_POLICY.md) (written after this triage, authoritative) uses `free_play` exclusively. All operational documents — ADR-033, seed data, pilot slice boundary, all 5 vector investigations, and the reward catalog reality doc — converge on `free_play`. Code contains zero references to `free_bet`. The dissonance was purely documentary, originating in the v0.1 spec and propagated by audit/triage reports that parroted it uncritically.

**Resolution**: `free_play` is the canonical term per fulfillment policy authority.

### Revised Severity Assessment

The original triage treated all four missing values as equivalent. They are not:

**Two-level extensibility model** (per ADR-033 + pilot slice boundary):
- **`reward_catalog.kind`** → `text` column, admin-configurable, any string. New comp types (meal, beverage, custom) require zero schema work.
- **`promo_type_enum`** → PostgreSQL ENUM, developer-controlled, requires migration to extend.

**Pilot instrument set** (frozen per LOYALTY_PILOT_SLICE_BOUNDARY.md §2): match play, free play, meal comps, floor comps. Only `match_play` and `free_play` need enum values for pilot completeness.

**`nonnegotiable` and `other`**: Not in the frozen pilot set. Per Guardrail 5 (pilot slice boundary): "No refactor may be justified by 'future reward types' unless tied to a present pilot blocker." These are post-pilot.

### Impact Analysis (revised)

| File | Current | After Pilot Fix |
|------|---------|-----------------|
| `dtos.ts:16` | `type PromoType = 'match_play'` | `'match_play' \| 'free_play'` |
| `schemas.ts:27` | `z.enum(['match_play'])` | `z.enum(['match_play', 'free_play'])` |
| `database.types.ts` | Auto-generated | Auto-updated via `npm run db:types-local` |
| Tests | 40+ references to `'match_play'` | No changes needed (backward compatible) |
| CRUD default | `'match_play'` | Still valid |

**Breaking changes**: None. `ALTER TYPE ADD VALUE` is safe and forward-compatible.

### Fix (revised)

Pilot migration:

```sql
ALTER TYPE public.promo_type_enum ADD VALUE IF NOT EXISTS 'free_play';
```

Then update `dtos.ts` and `schemas.ts` to reflect `'match_play' | 'free_play'`. Run `npm run db:types-local`.

Post-pilot (deferred):

```sql
ALTER TYPE public.promo_type_enum ADD VALUE IF NOT EXISTS 'nonnegotiable';
ALTER TYPE public.promo_type_enum ADD VALUE IF NOT EXISTS 'other';
```

> **Fulfillment policy decision filter**: Before shipping `nonnegotiable` or `other`, the 7-question classification (REWARD_FULFILLMENT_POLICY.md §"Decision filter") must be answered for each. The policy currently classifies only `match_play` and `free_play` under the `entitlement` family.

---

## Bug #5 — promo_program.status Constraint Mismatch

**Severity**: P3 | **Verdict**: Confirmed — intentional divergence | **Action**: Document | **Not blocking Vector A**

### Finding

| Source | Values | Model |
|--------|--------|-------|
| Spec (`v0.1:78`) | `draft`, `active`, `paused`, `ended` | Lifecycle stages |
| Code (migration:54) | `active`, `inactive`, `archived` | Operational states |

Implemented as CHECK constraint, not enum:

```sql
status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived'))
```

### Why Code Model Is Preferable

The operational model maps directly to pit floor decision-making:
- `active` — can issue coupons (pit boss acts)
- `inactive` — temporarily paused (reversible hold)
- `archived` — permanently closed (audit trail retained)

The spec's lifecycle model adds ambiguity (`paused` vs `inactive`? `ended` vs `archived`?)
without operational benefit at v0.

### Code Dependency Footprint

Changing values would break:
- `rpc_issue_promo_coupon` line 308 (hardcoded `!= 'active'` check)
- `crud.ts:277` (default `status: 'active'`)
- `schemas.ts:36` (`z.enum(['active', 'inactive', 'archived'])`)
- `dtos.ts:110` (TypeScript union)
- ~8 test cases with hardcoded values

### Action

Document as intentional design choice:
- Title: "Promo Program Status: Operational Model"
- Decision: Adopt `active/inactive/archived` for v0
- Rationale: Simpler, aligns with pit floor operations, avoids lifecycle ambiguity
- Future: Revisit if fine-grained state tracking needed in Phase 2

> **PRD alignment**: PRD-LOYALTY-ADMIN-CATALOG-v0 §5.1 already uses the operational model ("status badge: active/inactive/archived"). No code change needed. ADR addendum remains a documentation task unrelated to Vector A delivery.

> **Type safety note** (discovered during refresh): `PromoProgramDTO.status` in `dtos.ts:55` is typed as `string` rather than `'active' | 'inactive' | 'archived'`. Not a functional bug — the Zod schema and CHECK constraint enforce correctness — but a type safety gap worth tightening when touching the file.

---

## Implementation Order (revised 2026-03-18)

Prioritized for Vector A (admin-catalog slice) delivery:

```
VECTOR A BLOCKERS
1. Bug #1  →  Create inventory route handler             (~40 lines, P2, BLOCKER)
2. Bug #4  →  Migration: ALTER TYPE ADD VALUE 'free_play' (~5 lines, P3, partial blocker)
              + update dtos.ts, schemas.ts

BACKGROUND / DEFERRED
3. Bug #5  →  ADR addendum: document status model         (doc only, non-blocking)
4. Bug #3  →  CLOSED — false positive, no action
5. Bug #2  →  Defer to Vector B                           (operator issuance scope)
              Fulfillment policy constrains fix: must respect points_comp / entitlement split
```

### Post-Pilot Backlog (not authorized for current slice)

```
- Bug #4 remainder  →  ALTER TYPE ADD VALUE 'nonnegotiable', 'other'
                       Requires fulfillment policy classification first (7-question filter)
```
