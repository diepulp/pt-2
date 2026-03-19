# SEC Note: Loyalty Operator Issuance

**Feature:** loyalty-operator-issuance
**Date:** 2026-03-18
**Author:** agent/feature-pipeline
**Status:** Draft

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|-------|----------------|---------------|
| `loyalty_ledger` debit records | Financial | Direct monetary impact — points have cash-equivalent value via `loyalty_valuation_policy.cents_per_point` |
| `player_loyalty.balance` | Financial | Represents accumulated loyalty value; unauthorized modification = financial loss |
| `promo_coupon` records | Financial | Coupons are redeemable instruments with face value (match play, free play) |
| `promo_coupon.validation_number` | Operational | Bearer-like token — possession of the number + printed artifact allows redemption |
| Actor attribution (issued_by) | Audit | Non-repudiation — must prove which staff member issued the reward |
| Player identity context | PII | Player name, tier, balance displayed in issuance UI — existing PII, no new storage |

---

## Threats (What Could Go Wrong)

| Threat | Impact | Likelihood | Priority |
|--------|--------|------------|----------|
| T1: Cross-casino issuance | High | Low | P1 |
| T2: Balance manipulation (overdraw exploit) | High | Medium | P1 |
| T3: Unauthorized role issuing rewards | High | Medium | P1 |
| T4: Duplicate issuance (replay/race) | Medium | Medium | P1 |
| T5: Actor attribution spoofing | Medium | Low | P2 |
| T6: Coupon validation number prediction | Medium | Low | P2 |
| T7: Inactive/deactivated reward issuance | Low | Medium | P3 |

### Threat Details

**T1: Cross-casino issuance**
- **Description:** Staff from Casino A issues a reward against Casino B's catalog or to Casino B's player
- **Attack vector:** Manipulate casino_id in request payload
- **Impact:** Financial loss to wrong casino, tenancy violation

**T2: Balance manipulation (overdraw exploit)**
- **Description:** Attacker issues comps exceeding player's balance by bypassing overdraw controls
- **Attack vector:** Modify `p_allow_overdraw` parameter or race condition between balance check and debit
- **Impact:** Negative loyalty balance beyond allowed threshold, financial loss

**T3: Unauthorized role issuing rewards**
- **Description:** Dealer or other non-authorized role issues rewards
- **Attack vector:** Direct RPC call bypassing UI role checks
- **Impact:** Unauthorized financial transactions, policy violation

**T4: Duplicate issuance (replay/race)**
- **Description:** Same reward issued twice via concurrent requests or replayed idempotency key
- **Attack vector:** Double-click, network retry, or intentional replay
- **Impact:** Double financial impact (double debit or double coupon)

**T5: Actor attribution spoofing**
- **Description:** Staff forges `issued_by` to attribute issuance to another employee
- **Attack vector:** Supply different staff_id in request
- **Impact:** Audit trail corruption, non-repudiation failure

**T6: Coupon validation number prediction**
- **Description:** Attacker predicts or enumerates validation numbers to forge coupons
- **Attack vector:** Sequential or predictable validation number generation
- **Impact:** Fraudulent coupon presentation at tables/cage

---

## Controls (How We Mitigate)

| Threat | Control | Implementation |
|--------|---------|----------------|
| T1 | RLS casino_id binding | `set_rls_context_from_staff()` derives casino from JWT — not spoofable (ADR-024) |
| T2 | Balance lock + role gate | `rpc_redeem` uses `SELECT ... FOR UPDATE` row lock; overdraw requires pit_boss/admin role |
| T3 | RPC role gate | `rpc_redeem` checks `app.staff_role IN ('pit_boss', 'cashier', 'admin')`; `rpc_issue_promo_coupon` is SECURITY DEFINER with context validation |
| T4 | Idempotency key | Both RPCs enforce UNIQUE idempotency_key — returns existing record on duplicate |
| T5 | Actor binding (ADR-024) | `app.actor_id` derived from JWT via `set_rls_context_from_staff()` — cannot be spoofed |
| T6 | Caller-generated validation number | Validation numbers generated client-side as UUID v4 — not sequential, not predictable |
| T7 | Active status check | RPCs validate reward/program `is_active` and date range before issuance |

### Control Details

**C1: Authoritative context derivation (ADR-024)**
- **Type:** Preventive
- **Location:** Database (RPC first statement)
- **Enforcement:** Database — `set_rls_context_from_staff()` derives `app.casino_id`, `app.actor_id`, `app.staff_role` from JWT `staff_id` claim + staff table lookup
- **Tested by:** `lib/supabase/__tests__/` integration tests

**C2: Row-level locking on balance**
- **Type:** Preventive
- **Location:** Database (`rpc_redeem`)
- **Enforcement:** `SELECT balance FROM player_loyalty WHERE ... FOR UPDATE` — serializes concurrent debits
- **Tested by:** `rpc_redeem` idempotency and overdraw tests

**C3: Idempotency enforcement**
- **Type:** Preventive
- **Location:** Database (both RPCs)
- **Enforcement:** UNIQUE constraint on `idempotency_key` — duplicate request returns existing record with `is_existing = true`
- **Tested by:** Integration tests for both RPCs

**C4: SECURITY DEFINER with self-injection**
- **Type:** Preventive
- **Location:** Database (`rpc_issue_promo_coupon`)
- **Enforcement:** SECURITY DEFINER executes as owner; first statement calls `set_rls_context_from_staff()` (ADR-018 governed)
- **Tested by:** RLS policy tests

---

## Deferred Risks (Explicitly Accepted for MVP)

| Risk | Reason for Deferral | Trigger to Address |
|------|---------------------|-------------------|
| Rate limiting on issuance endpoint | Low volume in pilot (single casino, few operators) | Before multi-casino rollout |
| Issuance dollar-amount limits per staff role | Not required for pilot — trust pit boss judgment | Before compliance audit |
| Coupon revocation audit trail | `rpc_void_promo_coupon` exists but void history not surfaced in UI | Before support tooling phase |
| Validation number format hardening | UUID v4 is sufficient for pilot; no regulatory format required | Before external system integration |

---

## Data Storage Justification

| Field | Storage Form | Justification |
|-------|--------------|---------------|
| `loyalty_ledger.points_earned` | Plaintext integer | Non-sensitive operational data; must be queryable |
| `player_loyalty.balance` | Plaintext integer | Must be readable for balance checks |
| `promo_coupon.validation_number` | Plaintext text | Must be printable and matchable on redemption — not a secret per se, but combined with printed artifact forms bearer credential |
| `promo_coupon.face_value_amount` | Plaintext numeric | Financial data but not secret; must be printable |
| Actor attribution (`issued_by`) | UUID reference | Derived from JWT, immutable post-write — not sensitive |
| Player name (displayed in UI) | Existing storage | No new PII fields added — read from existing `player` table |

---

## RLS Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `reward_catalog` | All staff (same casino) | admin, pit_boss | admin, pit_boss | admin only |
| `reward_price_points` | All staff (same casino) | admin, pit_boss | admin, pit_boss | admin only |
| `loyalty_ledger` | pit_boss, admin, cashier | Via RPC only | Denied (append-only) | Denied |
| `player_loyalty` | All staff (same casino) | Via RPC only | Via RPC only | Denied |
| `promo_coupon` | pit_boss, admin, cashier | Via RPC only | Via RPC only (void/replace) | Denied |
| `loyalty_outbox` | admin only | Via RPC only | Via trigger only | Denied |

---

## Validation Gate

- [x] All assets classified
- [x] All threats have controls or explicit deferral
- [x] Sensitive fields have storage justification
- [x] RLS covers all CRUD operations
- [x] No plaintext storage of secrets
- [x] Actor attribution is authoritative (ADR-024), not spoofable
- [x] Idempotency prevents duplicate financial impact
- [x] Balance locking prevents race conditions on comp issuance
