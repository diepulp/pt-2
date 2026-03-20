# Point Conversion Docs — Functional Precis

## What these docs are trying to achieve

These two documents are aimed at one practical outcome:

**make loyalty point valuation honest, configurable, and casino-specific, instead of relying on a hardcoded fake default in code.**

Today, variable-dollar comp issuance can silently use a buried runtime constant for point value. The docs are intended to eliminate that behavior and replace it with a canonical model where the system reads the real redemption value from the database for the current casino.

---

## The intended functionality, in plain English

### 1. The system must use the casino's actual point value
When a pit boss issues a variable-dollar comp, the system should convert the entered dollar amount into the correct number of points using the casino's configured **cents per point** value.

So instead of:

- “the code says points are always worth 10 cents”

the system becomes:

- “this casino has a configured redemption value, and that is what the comp uses”

---

### 2. Loyalty economics are controlled by two real knobs
The architecture document establishes a two-knob model:

- **Earn rate** — how many points a player earns per dollar of theo  
- **Redemption value** — how many cents each point is worth when redeemed

Together, these define the practical generosity of the loyalty program.

The key idea is that these values must come from canonical persisted data, not from random constants, stale assumptions, or side-door configuration.

---

### 3. Variable-dollar comps must stop lying
The product document narrows this into a concrete product slice:

- remove the hardcoded `CENTS_PER_POINT = 10`
- wire backend comp conversion to the database source
- wire frontend display to the same source
- show the real conversion rate in the confirmation UI
- block issuance if the casino is not configured properly

That means the point debit shown to staff and the point debit used by the backend are supposed to match the real configured policy.

---

### 4. Missing configuration must block issuance
A major behavioral change in these docs is **fail-closed** operation.

If a casino has no active valuation policy row, the system should **not** invent a fallback and continue.  
It should surface a configuration error and prevent the comp from being issued.

The intent is to expose setup defects immediately rather than silently distort loyalty economics.

---

### 5. The system needs a sane bootstrap value
The docs also define a seeded starting posture for casinos that do not yet have a valuation row.

The initial seed is:

- `cents_per_point = 2`

This is presented as bootstrap data, not a normative permanent value. It exists so the system starts from a defensible operating posture instead of the absurd placeholder combination that implied 100% reinvestment.

---

### 6. Admins must be able to change the redemption rate
The PRD does not stop at “read the DB.”  
It also intends to deliver a minimal **admin settings surface** so a casino admin can view and change the redemption value without engineering intervention.

Operationally, that means:

- casino admins can update `cents_per_point`
- pit bosses can view the setting in read-only mode
- subsequent comp issuance reflects the newly saved rate

So the slice is meant to provide actual operator agency, not just backend cleanup.

---

## What a pit boss is supposed to experience after this ships

From the floor perspective, the intended experience is:

- a pit boss enters a dollar comp amount
- the system shows the actual point conversion rate for that casino
- the system calculates the correct point debit
- the comp can be confirmed only if valuation policy exists
- if setup is broken, the system blocks issuance instead of guessing

In other words:

**the comp screen becomes economically truthful.**

---

## What these docs are *not* trying to do

This is a narrow remediation slice, not a full loyalty governance platform.

It does **not** aim to:

- deliver full loyalty admin everywhere
- provide post-setup admin for the earn-rate knob yet
- automatically reprice the reward catalog when valuation changes
- treat catalog `points_cost` as the same thing as conversion policy
- solve every downstream loyalty configuration gap in one move

The docs are intentionally trying to fix the redemption-value path first.

---

## Bottom-line precis

These docs are intended to deliver a loyalty system where:

- point redemption value is read from the database
- variable-dollar comp issuance uses the real per-casino rate
- frontend and backend use the same value
- missing valuation policy blocks issuance
- casinos get a defensible bootstrap seed
- admins can change the redemption value without code deployment

## One-sentence summary

**This slice makes comp valuation honest: the system stops faking point value with a hardcoded constant and starts using the casino's real configured redemption policy.**
