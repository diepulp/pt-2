# ADR-045 Patch Delta — Remove Runtime `10`, Move Default to Onboarding Data

## Why this patch exists

ADR-045 still preserves `10` as a runtime escape hatch in two places:

- D4: service fallback to `10` when no active `loyalty_valuation_policy` row exists
- D5: `IssueRewardDrawer` optional prop defaulting to `10`

That contradicts the ADR’s own claim that only two persisted knobs are canonical.

It is also economically indefensible under the current pilot earn seed:
- `points_conversion_rate = 10`
- `cents_per_point = 10`
- implied reinvestment = `10 × 10 / 100 = 100%`

That is placeholder scaffolding, not a vendor-facing loyalty posture.

This patch moves the “default” out of runtime code and into **bootstrap/onboarding data**, where it belongs.

---

## Recommended doctrinal shift

### Before
- Missing valuation policy row → silently use `10`
- Missing UI prop → silently use `10`

### After
- Missing valuation policy row → **configuration error, fail closed**
- New casino bootstrap → insert a **seeded active valuation policy row**
- Runtime code never invents a conversion rate 

---

## Recommended sensible bootstrap default

### Chosen default
**Target bootstrap reinvestment:** **20% of theo**

This is a defensible middle-ground starting posture:
- not miserly
- not suicidal
- consistent with common industry examples that frame comps/reinvestment around roughly **20% of theoretical win**, while acknowledging actual programs vary by market and segment.

### With current pilot earn seed
If the current pilot earn seed remains:

- `points_conversion_rate = 10` points / $1 theo

then the bootstrap valuation seed should be:

- `cents_per_point = 2`

because:

```text
reinvestment_rate = points_conversion_rate × cents_per_point / 100
                   = 10 × 2 / 100
                   = 0.20 = 20%
```

### Practical interpretation
- 10 points earned per $1 theo
- 1 point worth $0.02
- $1 theo generates $0.20 redeemable loyalty value

That is vastly less ridiculous than the current 100% clown setting.

### Optional operator presets
If you want a simple calibration ladder for onboarding:

- **Tight / conservative:** `cents_per_point = 1` → 10% reinvestment at earn rate 10
- **Balanced default:** `cents_per_point = 2` → 20% reinvestment at earn rate 10
- **Aggressive / competitive:** `cents_per_point = 3` → 30% reinvestment at earn rate 10

Do **not** encode this ladder as runtime fallback logic. It belongs in onboarding/admin UX only.

---

## ADR replacement blocks

## 1) Context — add explicit seed disclaimer

### Add to Context (after reinvestment formula discussion)

> Seed values are bootstrap data only and are not normative.  
> A seed-era placeholder such as `points_conversion_rate = 10` and `cents_per_point = 10` implies `100%` reinvestment and must not be treated as a valid operating default. Runtime code may not infer valuation policy from placeholder seeds or hardcoded constants.

---

## 2) Replace D4 completely

### Existing D4
> **Pilot bootstrap fallback (transitional):** If no active `loyalty_valuation_policy` row exists for a casino, the system falls back to `10` ...

### Replacement D4

```md
### D4: Variable-amount comp conversion reads `cents_per_point` from DB and fails closed if missing

When a pit boss enters a dollar amount for a comp:

points_to_debit = ceil(face_value_cents / cents_per_point)

`cents_per_point` is read from `loyalty_valuation_policy` for the current casino. The hardcoded `CENTS_PER_POINT = 10` constant is removed from both backend and frontend.

If no active `loyalty_valuation_policy` row exists for the casino, variable-amount comp issuance fails closed with a configuration error. Missing valuation policy is an onboarding / setup defect, not a condition to be masked by runtime fallback logic.

Bootstrap and onboarding must create an active valuation policy row before variable-amount comp issuance is enabled.
```

---

## 3) Replace D5 threading/default language

### Existing problem
D5 still says the drawer prop defaults to `10` for backward compatibility.

### Replacement D5 tail

```md
**Threading:** The page-level component that owns the casino context (Player 360 page, RatingSlipModal) calls the hook and passes the result as a prop through the chain:

useValuationRate(casinoId) → IssueRewardButton prop → IssueRewardDrawer prop → CompConfirmPanel prop

The `IssueRewardDrawer` does not query the database and does not define a fallback default. `centsPerPoint` is required for variable-amount comp confirmation. If valuation policy cannot be loaded, the caller must surface a configuration error state and block confirmation.
```

---

## 4) Add a new decision item for onboarding/bootstrap policy

### New D6

```md
### D6: Bootstrap default is data, not code

New casinos must receive an active `loyalty_valuation_policy` row during bootstrap / onboarding. The system default is expressed as seeded data, not as a runtime constant.

Initial bootstrap target: **20% implied reinvestment**.

Given the current pilot earn seed of `points_conversion_rate = 10`, the bootstrap valuation seed is:

- `cents_per_point = 2`

This is a starting operator posture, not a normative permanent recommendation. Operators may tighten or loosen the program by changing either canonical knob through approved admin/configuration surfaces.
```

---

## 5) Amend consequences/risk

### Replace Risk section with

```md
### Risk

- A casino with no active `loyalty_valuation_policy` row cannot issue variable-amount comps until setup is corrected. This is intentional: the system fails closed rather than inventing value.
- If bootstrap/onboarding forgets to create the policy row, the defect is immediately visible instead of silently distorting redemption economics.
```

---

## 6) Required implementation amendment outside ADR text

The ADR patch should be paired with one execution note:

```md
Implementation note:
- remove all runtime `?? 10` and `= 10` fallback behavior from variable-comp backend and UI
- seed / bootstrap `loyalty_valuation_policy.cents_per_point = 2` for pilot casinos while `game_settings.points_conversion_rate = 10`
- add a test: missing active valuation policy row blocks variable-amount comp issuance with explicit configuration error
```

---

## Bottom line

The ADR should stop pretending `10` is a respectable pilot default.

The sane posture is:

- **Canonical runtime sources only:** `game_settings.points_conversion_rate` + `loyalty_valuation_policy.cents_per_point`
- **No runtime fallback**
- **Bootstrap seed row required**
- **Balanced bootstrap default:** `cents_per_point = 2` when `points_conversion_rate = 10`, implying **20% reinvestment**
