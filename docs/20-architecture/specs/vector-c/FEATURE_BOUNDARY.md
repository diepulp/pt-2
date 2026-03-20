# Feature Boundary: Reward Instrument Fulfillment (Vector C)

> **Ownership Sentence:** This feature belongs to **LoyaltyService** (fulfillment sub-domain) and introduces `lib/print/` (client-side print infrastructure with no table ownership); it consumes the **frozen `FulfillmentPayload` discriminated union** from `services/loyalty/dtos.ts` — all context (casino name, player name, staff name, amounts, references) is **pre-resolved in the payload** with zero cross-context reads required. The only future write is `promo_coupon.metadata` (print history append, P2 — GAP-C0 migration, not blocking core print).

---

## Bounded Context

- **Owner service(s):**
  - **LoyaltyService** — fulfillment sub-domain: print artifact production for issued rewards. The `lib/print/` client-side module is authored under loyalty's bounded context because fulfillment is a loyalty concern per `REWARD_FULFILLMENT_POLICY.md`.

- **Writes:**
  - `promo_coupon.metadata` (append to `print_history[]` — **P2, requires GAP-C0 migration**, not blocking core print delivery)

- **Reads:**
  - **None at query time.** All fields are pre-resolved in the `FulfillmentPayload` assembled by `IssuanceResultPanel` before reaching Vector C's entry point (`onFulfillmentReady` callback). Vector C is a pure rendering consumer.

- **Consumed contracts (FROZEN, verified 2026-03-19):**
  - `CompFulfillmentPayload` — `services/loyalty/dtos.ts:488-503` (comp slip fields including `ledger_id`, `face_value_cents`, `points_redeemed`, `balance_after`)
  - `EntitlementFulfillmentPayload` — `services/loyalty/dtos.ts:512-529` (coupon fields including `validation_number`, `required_match_wager_cents`, `player_tier`, `expires_at`)
  - `FulfillmentPayload` — `services/loyalty/dtos.ts:536-538` (discriminated union: `family: 'points_comp' | 'entitlement'`)

- **Cross-context contracts:**
  - None. All cross-context data (casino name, player display name, staff name, tier) is resolved upstream by `IssuanceResultPanel` and embedded in the frozen payload before Vector C receives it.

---

**Gate:** If you can't write the ownership sentence, you're not ready to design.
