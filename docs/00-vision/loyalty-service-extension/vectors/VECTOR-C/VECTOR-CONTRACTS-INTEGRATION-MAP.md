# Cross-Vector Contracts & Integration Map

**Project:** Casino Player Tracker
**Purpose:** Map contract boundaries between the three loyalty pilot vectors for contract-first parallel execution
**Status:** Investigation complete — companion to vector handoff artifacts
**Date:** 2026-03-18
**Governing artifact:** `loyalty_pilot_implementation_structuring_memo.md` (§Required contract freezes)

---

## Why this document exists

The implementation structuring memo requires contract freezes before parallel work proceeds. Without frozen contracts, parallel development becomes mutual sabotage.

This document maps:
1. What contracts must be frozen between vectors
2. What data shapes cross vector boundaries
3. What integration sequence is correct
4. Where coupling risks exist

---

## Vector dependency graph

```
Vector A (Admin Catalog)
    │
    │ freezes: configuration contract
    │ (reward definitions, activation, pricing/entitlement fields)
    │
    ▼
Vector B (Operator Issuance)
    │
    │ freezes: issuance contract
    │ (issuance record shape, fulfillment payload)
    │
    ▼
Vector C (Instrument Fulfillment)
    │
    │ produces: printed artifact
    │
    ▼
  [Floor]
```

**Development may overlap, but integration order matters.**

---

## Contract 1: Configuration → Issuance

### What issuance depends on from admin configuration

#### For `points_comp` family
| Field | Table | Purpose |
|-------|-------|---------|
| `reward_catalog.id` | reward_catalog | Identifies which comp is being issued |
| `reward_catalog.family` | reward_catalog | Must be `points_comp` — gates issuance path |
| `reward_catalog.kind` | reward_catalog | Free-text label (meal, beverage, misc) |
| `reward_catalog.is_active` | reward_catalog | Must be `true` for issuance |
| `reward_catalog.face_value` | reward_catalog | Dollar amount of the comp |
| `reward_price_points.points_cost` | reward_price_points | Points to debit from player balance |

#### For `entitlement` family
| Field | Table | Purpose |
|-------|-------|---------|
| `promo_program.id` | promo_program | Identifies the active entitlement program |
| `promo_program.promo_type` | promo_program | `match_play`, `free_play`, etc. |
| `promo_program.status` | promo_program | Must be `active` for issuance |
| Tier-to-entitlement mapping | **TBD** (JSONB on promo_program or join table) | Maps player tier → face_value + match_wager |

### Freeze requirements
- [ ] `reward_catalog` active/inactive semantics are defined (what "active" means for issuance filtering)
- [ ] `reward_price_points` schema is stable (points_cost field exists and is populated)
- [ ] Tier-to-entitlement mapping mechanism is decided (GAP-A5 / Decision D1)
- [ ] `promo_program.status` values are frozen (`active`/`inactive`/`archived`)
- [ ] No FK between `reward_catalog` and `promo_program` is confirmed (separate domains)

---

## Contract 2: Issuance → Fulfillment

### What fulfillment receives from issuance

#### Comp slip fulfillment payload (points_comp family)
```typescript
// Produced by issuance mutation's onSuccess callback
interface CompSlipPayload {
  // From casino context
  casinoName: string;

  // From player context
  playerDisplayName: string;

  // From issuance result
  compType: string;           // reward_catalog.kind
  faceValue: number;          // dollar amount
  pointsRedeemed: number;     // absolute points_delta
  postBalance: number;        // balance after debit
  referenceNumber: string;    // traceable reference

  // From auth/RLS context
  issuedByStaffName: string;

  // From server
  issuedAt: string;           // ISO 8601
}
```

#### Coupon fulfillment payload (entitlement family)
```typescript
// Produced by issuance mutation's onSuccess callback
interface CouponPayload {
  // From casino context
  casinoName: string;

  // From player context
  playerDisplayName: string;

  // From issuance result (promo_coupon row)
  rewardType: string;         // match_play | free_play
  faceValue: number;          // face_value_amount
  requiredMatchWager?: number; // match play only
  validationNumber: string;   // unique, monospaced on print
  expiresAt?: string;         // ISO 8601 if applicable

  // From player_loyalty at issuance time
  tierBasis: string;          // tier used for entitlement calculation

  // From auth/RLS context
  issuedByStaffName: string;

  // From server
  issuedAt: string;           // ISO 8601
}
```

### Freeze requirements
- [ ] Issuance response includes all fields needed for template rendering (no additional API call required)
- [ ] Family discriminator is available to route to correct template
- [ ] Fulfillment is triggered by mutation hook `onSuccess` callback (not a separate event system)
- [ ] Fulfillment payload types are published from issuance layer for template consumption

---

## Contract 3: Fulfillment → Audit

### What audit receives from fulfillment

```typescript
// Best-effort append to promo_coupon.metadata.print_history[]
interface PrintHistoryEntry {
  printed_at: string;         // ISO 8601
  printed_by_staff_id: string; // UUID
  channel: string;            // "rating_slip_print_button" | "player_dash_print_button" | "reprint"
  device_hint?: string;       // browser/OS hint
}
```

### Freeze requirements
- [ ] `promo_coupon.metadata` JSONB structure for `print_history[]` is defined
- [ ] Comp slip audit equivalent is defined (loyalty_ledger metadata extension or separate mechanism)
- [ ] Print logging is explicitly non-blocking (fire-and-forget)

---

## Cross-context dependencies

### Loyalty ← Player context
| What | Where | Access pattern |
|------|-------|---------------|
| Player display name | `player_casino.display_name` | DTO import from player bounded context |
| Player ID (casino-scoped) | `player_casino.id` | FK on `loyalty_ledger`, `promo_coupon` |
| Player tier | `player_loyalty.tier` | Own table (loyalty context owns this) |
| Player balance | `player_loyalty.current_balance` | Own table |

### Loyalty ← Visit context
| What | Where | Access pattern |
|------|-------|---------------|
| Active visit ID | `visits.id` | Optional param for visit-scoped idempotency |
| Visit status | `visits.status` | Used by `rpc_accrue_on_close` (ghost visit guard) |

### Loyalty ← Casino context
| What | Where | Access pattern |
|------|-------|---------------|
| Casino name | `casinos.name` | Read for print templates |
| Casino ID | `app.casino_id` session variable | RLS scoping |
| Promo settings | `casino_settings.promo_require_exact_match`, etc. | Policy enforcement |

### Loyalty ← Staff context
| What | Where | Access pattern |
|------|-------|---------------|
| Staff ID | `app.actor_id` session variable | Derived from JWT (ADR-024) |
| Staff name | `staff.display_name` or `staff.first_name/last_name` | "Issued by" on print artifacts |
| Staff role | `app.staff_role` session variable | Role-based access control |

---

## RLS implications

All loyalty operations are casino-scoped via Pattern C hybrid RLS (ADR-015/020).

| Operation | RLS pattern | Notes |
|-----------|------------|-------|
| Reward catalog read | INVOKER + RLS | Standard casino-scoped SELECT |
| Promo program read | INVOKER + RLS | Standard casino-scoped SELECT |
| Comp issuance (ledger write) | DEFINER + `set_rls_context_from_staff()` | ADR-024 authoritative context |
| Coupon issuance | DEFINER + `set_rls_context_from_staff()` | ADR-024 authoritative context |
| Print history logging | DEFINER or client-side metadata update | TBD — metadata append approach |
| Admin catalog CRUD | INVOKER + RLS | Role-gated (admin only) |

**No new RLS patterns required.** All three vectors use established ADR-024 patterns.

---

## Integration risks

### Risk 1: Configuration instability during parallel development
**Scenario:** Vector B builds issuance against reward_catalog schema that Vector A modifies.
**Mitigation:** Freeze ADR-033 schema as-is. Vector A adds UI for existing schema, not new columns.

### Risk 2: Issuance response shape drift
**Scenario:** Vector C builds templates against a payload shape that Vector B changes.
**Mitigation:** Freeze payload types (CompSlipPayload, CouponPayload) in shared types file before implementation.

### Risk 3: Tier mapping mechanism chosen late
**Scenario:** Vector B builds one-click RPC before Vector A decides JSONB vs join table.
**Mitigation:** GAP-A5 / Decision D1 must be resolved before Vector B RPC work begins. This is the single highest-priority decision.

### Risk 4: Fulfillment trigger coupling
**Scenario:** Vector C builds print hooks expecting a specific callback shape from Vector B.
**Mitigation:** Define fulfillment trigger contract (mutation `onSuccess` callback signature) before either vector builds.

### Risk 5: Shared state race conditions
**Scenario:** Print logging and issuance both write to `promo_coupon.metadata`.
**Mitigation:** Print history is append-only and non-blocking. Use `jsonb_set` or server-side append to avoid overwriting.

---

## Recommended integration sequence

```
1. Configuration contracts freeze
   ├── ADR-033 schema confirmed stable
   ├── reward_catalog.is_active semantics defined
   ├── Tier-to-entitlement mapping decided (GAP-A5)
   └── promo_program.status values confirmed

2. Issuance contracts freeze
   ├── CompSlipPayload type published
   ├── CouponPayload type published
   ├── Fulfillment trigger callback signature defined
   └── Print history metadata shape defined

3. Parallel development (bounded)
   ├── Vector A: admin UI (consumes existing APIs)
   ├── Vector B: issuance UI + new RPC (binds to frozen config contracts)
   └── Vector C: print utility + templates (binds to frozen issuance contracts)

4. Integration rehearsal
   ├── Admin configures a reward → issuance sees it → print renders it
   ├── End-to-end for points_comp family (comp → slip → print)
   └── End-to-end for entitlement family (coupon → coupon → print)
```

---

## Blocking decision summary

These decisions must be resolved before vectors can proceed to build:

| # | Decision | Blocks | Owner | Recommendation |
|---|----------|--------|-------|----------------|
| **D1** | Tier-to-entitlement mapping (JSONB vs join table) | Vector B RPC, Vector A admin form | Architect | JSONB on `promo_program` |
| **D2** | Idempotency scope (gaming-day vs visit) | Vector B RPC | Architect | Gaming-day |
| **D3** | Comp slip reference number format | Vector C template | Architect | Short alphanumeric code |
| **D4** | Replacement behavior (honor vs auto-replace) | Vector B RPC | Product | Honor issued (Behavior 1) |
| **D5** | Unified issue drawer vs per-family triggers | Vector B UX | Product | Unified drawer |
| **D6** | QR/barcode on coupons | Vector C template | Product | Defer for pilot |

---

## Recommended feature pipeline intake order

1. **Vector A first** — admin catalog configuration has no upstream dependencies and its output (frozen config contracts) unblocks Vector B
2. **Vector B second** — operator issuance depends on config contracts and its output (frozen issuance contracts) unblocks Vector C
3. **Vector C third or parallel** — print utility can be built in parallel; template binding requires frozen issuance contracts

**Alternative (faster but riskier):** Start all three simultaneously after freezing contracts D1-D6 upfront. This matches the memo's "bounded parallelism" posture but requires discipline.

---

## Existing artifact cross-references

| Artifact | Relevance |
|----------|-----------|
| `LOYALTY-SYSTEM-POSTURE-PRECIS.md` | Full system inventory — layer-by-layer readiness |
| `LOYALTY-INTSRUMENTS-SYSTEM-POSTURE-AUDIT.md` | Gap analysis with 6 identified gaps |
| `MATCHPLAY-PRINT-READINESS-REPORT.md` | Print-specific gap analysis (7 gaps) |
| `LOYALTY-INSTRUMENTS-BUG-TRIAGE.md` | 5 bugs triaged, 2 "ship now" |
| `REWARD_FULFILLMENT_POLICY.md` | Structural family classification |
| `rewrd_catologue_reality.md` | Two-axis schema reality |
| `MATCHPLAY-PRINT-v0.1.md` | Match play print exec spec draft |
| `SCAFFOLD-004-loyalty-pilot-slice_historical.md` | Feature scaffold with options analysis |
| `LOYALTY_PILOT_SLICE_BOUNDARY.md` | Governing boundary (7 guardrails) |
| `loyalty_pilot_implementation_structuring_memo.md` | Three-vector split rationale |
