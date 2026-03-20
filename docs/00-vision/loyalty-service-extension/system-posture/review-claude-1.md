Confirmed. Here's the plain explanation:

---

## The Two Domains: Promo Programs vs Reward Catalog

Think of it as **templates vs menu items**.

### Promo Program
A **promo program** is a casino-scoped campaign container. It defines "we run a Match Play program" — it has a `promo_type` (match_play or free_play), a face value, and a status. When someone issues a coupon, the coupon is stamped with a `promo_program_id`. Programs are the **operational mechanism** — they generate coupons.

### Reward Catalog
A **reward** is a menu item that a pit boss picks from a drawer. It answers "what can I give this player?" Each reward has a `family`:
- **`points_comp`** — debits the player's loyalty points via `rpc_redeem`. Think: "Comp Meal for 500 points."
- **`entitlement`** — issues a promo coupon via `rpc_issue_promo_coupon`. Think: "$25 Match Play."

The reward catalog is the **presentation layer on top of programs**. When a pit boss issues an entitlement reward, the system looks up which active promo program to stamp the coupon with.

### How They Connect
```
Pit boss picks reward from catalog
  └─ family = 'points_comp'?
       → LoyaltyService.issueComp() → rpc_redeem → loyalty_ledger debit
  └─ family = 'entitlement'?
       → PromoService.issueEntitlement()
            → reads commercial values from reward.metadata
            → finds active promo_program by casino + instrument_type
            → rpc_issue_promo_coupon → promo_coupon row created
```

No FK between the two tables. The link is resolved dynamically at issuance time by querying for an active program matching the instrument type.

---

## Why Your Reward Creation Is Failing

**Found it.** There's a `fulfillment` field mismatch between the database and the application:

| Layer | Allowed Values |
|-------|---------------|
| **Database CHECK constraint** | `'immediate'`, `'voucher'`, `'external'` |
| **Zod schema + TypeScript type** | `'comp_slip'`, `'coupon'`, `'none'` |
| **UI dropdown** | `'comp_slip'`, `'coupon'`, `'none'` |

When you submit the form, the value `'comp_slip'` passes Zod validation but **violates the Postgres CHECK constraint** on insert. The error is swallowed into a generic internal error because the error mapper doesn't handle constraint code `23514`.

If you leave fulfillment blank (don't select any option), the insert should succeed because it sends `NULL` which the CHECK allows. But if you pick any option from the dropdown, it fails silently.

---

## Relationship to Player Service

The **PlayerService** owns `player_casino` (enrollment). The **LoyaltyService** owns `player_loyalty` (balance + tier). They're linked:

- `rpc_create_player` atomically creates both `player_casino` + `player_loyalty` records.
- When a pit boss issues a comp, `issueComp()` calls `getBalance(playerId, casinoId)` to read the player's current points from `player_loyalty`, then debits via `rpc_redeem`.
- The reward catalog doesn't reference the player directly. The connection happens at **issuance time** — the pit boss selects a player, then selects a reward, and the system resolves the issuance from the player's loyalty state + the catalog definition.

---

## Where Tiers Are Configured

Tiers live in **`reward_entitlement_tier`** — a child table of `reward_catalog`. Each row maps:

```
reward_id + tier → benefit { face_value_cents, instrument_type }
```

For example, a "$25 Match Play" reward might have:
| tier | face_value_cents | instrument_type |
|------|-----------------|-----------------|
| bronze | 1000 | match_play |
| silver | 2500 | match_play |
| gold | 5000 | match_play |

**However**, today `issueEntitlement()` does **not** use this table. Per PRD §7.3, Vector B reads frozen values from `reward.metadata` JSONB instead. The tier table is scaffolded for future auto-derivation (one-click: "look up player tier → find matching entitlement tier row → issue coupon with those values"). That auto-derivation RPC (`rpc_issue_current_match_play`) doesn't exist yet.

---

## Why `code`, `name`, and `kind` Exist — They're Not Redundant

Each serves a different purpose:

| Field | Purpose | Example | Constraint |
|-------|---------|---------|------------|
| **`code`** | Machine identifier, unique per casino. Used in `p_reference` fields, API lookups, idempotency. | `COMP_MEAL_25` | UNIQUE(casino_id, code), max 50 chars |
| **`name`** | Human display label shown in the UI drawer. What the pit boss reads. | `Comp Meal ($25)` | max 200 chars, no uniqueness |
| **`kind`** | Classification/grouping tag for filtering and reporting. Multiple rewards share the same kind. | `meal` | max 100 chars, no uniqueness |

Concrete example of why all three matter:

| code | name | kind |
|------|------|------|
| `COMP_MEAL_25` | Comp Meal ($25) | `meal` |
| `COMP_MEAL_50` | Comp Meal ($50) | `meal` |
| `COMP_BEV_10` | Comp Beverage ($10) | `beverage` |
| `MP_GOLD_50` | Gold Match Play $50 | `match_play` |

- **`code`** is the unique key — like a SKU. The system references it in logs and audit trails.
- **`name`** is the label — what appears in the drawer UI. Can be changed without breaking references.
- **`kind`** is the category — lets you filter "show me all meal comps" or "show me all match play entitlements" in reports. Multiple rewards share a kind.

`family` is separate from all three — it's the **behavioral discriminator** (`points_comp` vs `entitlement`) that determines which issuance path runs.

---

Want me to fix the fulfillment enum mismatch? The options are either migrate the DB constraint to match the app values, or align the app to match the DB — the app values (`comp_slip`, `coupon`, `none`) are more descriptive of the actual fulfillment semantics, so a migration to update the CHECK constraint is probably the right call.