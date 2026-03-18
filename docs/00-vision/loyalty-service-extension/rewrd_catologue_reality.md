Reward Catalog Reality

  The system uses two axes, not four instrument types:

  Axis 1: family enum (structural discriminator)

  ┌─────────────┬────────────────────────────┬───────────────────────────────┬───────────────────┐
  │   Family    │       Issuance Path        │         Ledger Effect         │ Physical Artifact │
  ├─────────────┼────────────────────────────┼───────────────────────────────┼───────────────────┤
  │ points_comp │ Debit loyalty_ledger       │ Points subtracted             │ Printed comp slip │
  ├─────────────┼────────────────────────────┼───────────────────────────────┼───────────────────┤
  │ entitlement │ Create promo_coupon record │ None (tier-based, not points) │ Printed coupon    │
  └─────────────┴────────────────────────────┴───────────────────────────────┴───────────────────┘

  Axis 2: kind field (free-text, unconstrained)

  ┌────────────┬─────────────┬────────────────────────────────────────────┐
  │ Seed kind  │   Family    │                Seed Example                │
  ├────────────┼─────────────┼────────────────────────────────────────────┤
  │ meal       │ points_comp │ COMP_MEAL_25 ($25, 250 pts)                │
  ├────────────┼─────────────┼────────────────────────────────────────────┤
  │ beverage   │ points_comp │ COMP_BEVERAGE_10 ($10, 100 pts)            │
  ├────────────┼─────────────┼────────────────────────────────────────────┤
  │ misc       │ points_comp │ COMP_MISC_15 ($15, 150 pts)                │
  ├────────────┼─────────────┼────────────────────────────────────────────┤
  │ match_play │ entitlement │ MP_TIER_DAILY (silver/gold/platinum tiers) │
  ├────────────┼─────────────┼────────────────────────────────────────────┤
  │ free_play  │ entitlement │ FP_TIER_DAILY (silver/gold/platinum tiers) │
  └────────────┴─────────────┴────────────────────────────────────────────┘

  The kind field is free-text — admin can create kind='hotel', kind='spa', kind='retail' without any schema migration. The catalog is already flexible for new comp types.

  What "other comps" actually means

  "Other comps" from the boundary doc isn't a fourth structural instrument type. It's more entries in the points_comp family — beverage, misc, retail, etc. They all follow the same issuance path: debit loyalty
  points, print a comp slip.

  The real structural split is:

  Pilot instruments (structural reality):

  1. points_comp family (ledger debit → comp slip)
     - meal comp     (kind='meal')
     - beverage comp (kind='beverage')
     - misc comp     (kind='misc')
     - any future comp kind (free-text, no migration)

  2. entitlement family (coupon issuance → printed coupon)
     - match play    (kind='match_play', promo_type='match_play')
     - free play     (kind='free_play')

  Flexibility assessment

  - Adding new comp types: Zero schema work. Admin creates a new reward_catalog entry with any kind string + sets reward_price_points. Fully supported today.
  - Adding new entitlement types: Requires promo_type_enum migration (currently only match_play). Bug #4 already identified the need to add free_bet and other. Also needs corresponding reward_entitlement_tier
  rows.
  - No FK between reward_catalog and promo_program — these are separate domains. The catalog defines "what exists"; promo_program/promo_coupon handles "what was issued" for entitlements only  