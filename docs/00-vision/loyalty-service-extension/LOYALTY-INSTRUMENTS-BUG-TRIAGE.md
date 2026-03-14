---
title: "Loyalty Instruments — Bug Triage Report"
status: triage-complete
date: 2026-03-09
source: LOYALTY-INTSRUMENTS-SYSTEM-POSTURE-AUDIT.md §6
references:
  - LOYALTY_PROMO_INSTRUMENTS_EXTENSION_v0.1_REDACTED.md
  - LOYALTY-INTSRUMENTS-SYSTEM-POSTURE-AUDIT.md
  - MATCHPLAY-PRINT-READINESS-REPORT.md
---

# Loyalty Instruments — Bug Triage Report

Parallel domain-expert investigation of the 5 bugs surfaced in the
[System Posture Audit](LOYALTY-INTSRUMENTS-SYSTEM-POSTURE-AUDIT.md) §6.

---

## Disposition Summary

| # | Issue | Audit Sev | Verdict | Action |
|---|-------|-----------|---------|--------|
| 1 | Missing inventory API route | P2 | **Confirmed — fix required** | Ship now |
| 2 | ManualRewardDialog stub | P3 | **Confirmed — design gap** | Defer to Phase 1 admin UI |
| 3 | loyalty_outbox missing types | P3 | **False positive — close** | Update audit doc |
| 4 | promo_type_enum incomplete | P3 | **Confirmed — safe fix** | Ship now |
| 5 | promo_program.status mismatch | P3 | **Confirmed — intentional divergence** | Document in ADR addendum |

---

## Bug #1 — Missing Inventory API Route

**Severity**: P2 | **Verdict**: Confirmed | **Action**: Ship now

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

**Severity**: P3 | **Verdict**: Confirmed — design gap | **Action**: Defer to Phase 1

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

---

## Bug #3 — loyalty_outbox Missing from Generated Types

**Severity**: P3 | **Verdict**: FALSE POSITIVE | **Action**: Close

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

**Severity**: P3 | **Verdict**: Confirmed | **Action**: Ship now

### Finding

Migration `20260106235611_loyalty_promo_instruments.sql:26` creates:

```sql
CREATE TYPE public.promo_type_enum AS ENUM ('match_play');
```

The spec (`LOYALTY_PROMO_INSTRUMENTS_EXTENSION_v0.1_REDACTED.md:72,145`) requires:
`match_play`, `nonnegotiable`, `free_bet`, `other`.

### Impact Analysis

| File | Current | After Fix |
|------|---------|-----------|
| `dtos.ts:16` | `type PromoType = 'match_play'` | `'match_play' \| 'nonnegotiable' \| 'free_bet' \| 'other'` |
| `schemas.ts:27` | `z.enum(['match_play'])` | `z.enum(['match_play', 'nonnegotiable', 'free_bet', 'other'])` |
| `database.types.ts` | Auto-generated | Auto-updated via `npm run db:types-local` |
| Tests | 40+ references to `'match_play'` | No changes needed (backward compatible) |
| CRUD default | `'match_play'` | Still valid |

**Breaking changes**: None. `ALTER TYPE ADD VALUE` is safe and forward-compatible in
PostgreSQL. No existing data uses the missing values.

### Fix

New migration:

```sql
ALTER TYPE public.promo_type_enum ADD VALUE IF NOT EXISTS 'nonnegotiable';
ALTER TYPE public.promo_type_enum ADD VALUE IF NOT EXISTS 'free_bet';
ALTER TYPE public.promo_type_enum ADD VALUE IF NOT EXISTS 'other';
```

Then update `dtos.ts` and `schemas.ts` to reflect expanded union. Run `npm run db:types-local`.

---

## Bug #5 — promo_program.status Constraint Mismatch

**Severity**: P3 | **Verdict**: Confirmed — intentional divergence | **Action**: Document

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

---

## Implementation Order

```
1. Bug #1  →  Create inventory route handler         (~40 lines, P2)
2. Bug #4  →  Migration: ALTER TYPE ADD VALUE x3      (~20 lines, P3)
3. Bug #3  →  Update audit doc: mark resolved         (1 line edit)
4. Bug #5  →  ADR addendum: document status model     (doc only)
5. Bug #2  →  Defer to Phase 1 admin UI               (blocked on GAP-1)
```
