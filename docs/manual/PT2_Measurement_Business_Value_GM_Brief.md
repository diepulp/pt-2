# PT‑2 Measurement Surfaces --- Business Value Explained

## A Plain‑Language Brief for General Managers

------------------------------------------------------------------------

# Purpose

PT‑2 introduces **measurement surfaces** that expose the financial
reality of table operations.

These measurements are not abstract technical features.\
They answer practical management questions:

-   Are we comping players accurately?
-   Can we trace financial events for regulators?
-   How much of our floor activity is actually visible?
-   How much reward liability are we carrying?

Together these measurements convert PT‑2 from a **transaction system**
into an **operational intelligence system**.

------------------------------------------------------------------------

# 1. Theo Integrity

### What it measures

Whether the **theoretical win calculation** is correct and transparent.

Theo determines:

-   comp budgets
-   player value
-   marketing reinvestment
-   host incentives

If theo is wrong, the entire reinvestment model becomes distorted.

------------------------------------------------------------------------

### What happens in many legacy systems

Most legacy platforms compute theo using:

-   hidden formulas
-   vendor assumptions
-   rounding rules

Operators see the final number but **cannot reproduce how it was
calculated**.

------------------------------------------------------------------------

### What PT‑2 does

PT‑2 calculates theoretical win deterministically.

During migration, PT‑2 can compare:

  Slip   Legacy Theo   PT‑2 Theo
  ------ ------------- -----------
  #321   \$184         \$148

Differences reveal:

-   incorrect house edge assumptions
-   rounding inflation
-   time calculation errors
-   vendor formula drift

------------------------------------------------------------------------

### Economic value

Theo drives comp reinvestment.

Example:

Annual table theo: \$12,000,000

Comp reinvestment rate: 30%

Comp budget: \$3,600,000

If theo is inflated by only **5%**, that creates:

\$600,000 artificial theo\
≈ \$180,000 excess comps

**Theo integrity protects comp economics.**

------------------------------------------------------------------------

# 2. Audit Traceability

### What it measures

The ability to trace a financial event from origin to ledger.

Example event chain:

Rating Slip\
↓\
Financial Transaction\
↓\
MTL Entry\
↓\
Loyalty Accrual\
↓\
Audit Log

------------------------------------------------------------------------

### What happens today

In many casinos, investigating a discrepancy requires:

-   multiple system exports
-   spreadsheet reconciliation
-   manual investigation

A simple question like:

"Why did this player receive \$400 in comps?"

can take **hours to answer**.

------------------------------------------------------------------------

### What PT‑2 provides

PT‑2 exposes a complete trace instantly.

Example:

Slip #123 closed by Dealer #45\
↓\
Financial transaction created\
↓\
MTL entry triggered\
↓\
Loyalty points issued

------------------------------------------------------------------------

### Economic value

Compliance investigations consume significant labor.

Example property:

2 compliance staff\
\$90k salary each

If traceability reduces investigation time by 50%:

\$180k payroll\
→ \$90k operational savings

More importantly:

**Regulatory risk is reduced.**

Regulatory findings can lead to:

-   fines
-   operational restrictions
-   license scrutiny

Traceability protects the property.

------------------------------------------------------------------------

# 3. Telemetry Coverage

### What it measures

How much **table time actually has rating data**.

Example:

Table open: 8 hours

Rated play: 5 hours

Coverage: 62%

Meaning **38% of table time produced no rating telemetry**.

------------------------------------------------------------------------

### Why this matters

Unrated play creates two problems:

1.  Valuable players go unrecognized.
2.  Management reports become inaccurate.

Hosts and marketing cannot reward players they cannot see.

------------------------------------------------------------------------

### Example economic impact

Example card room:

25 tables\
\$400 average drop per hour

If 20% of table time is unrated:

25 tables\
× \$400/hr\
× 6 unrated hours

≈ \$60,000 daily play without visibility

Even partial recovery of that insight dramatically improves player
development.

**Telemetry coverage reveals invisible revenue.**

------------------------------------------------------------------------

# 4. Loyalty Liability

### What it measures

The total number of loyalty points owed to players.

Points represent **financial obligations**.

------------------------------------------------------------------------

### What happens in many casinos

Loyalty liability is often estimated through:

-   spreadsheets
-   periodic exports
-   manual reconciliation

Meaning management does not know the exact exposure on any given day.

------------------------------------------------------------------------

### What PT‑2 provides

Because loyalty is tracked as an **append‑only ledger**, PT‑2 can
compute liability instantly.

Example snapshot:

  Date    Outstanding Points   Estimated Value
  ------- -------------------- -----------------
  Mar 1   472,000              \$47,200
  Mar 8   521,000              \$52,100

This allows management to see:

-   liability growth
-   promotional impact
-   comp exposure trends

------------------------------------------------------------------------

### Economic value

Points are deferred revenue.

Example:

1,200,000 points outstanding\
≈ \$120,000 liability

Without visibility, marketing promotions can unintentionally double
exposure.

Daily liability tracking keeps the loyalty program financially balanced.

------------------------------------------------------------------------

# The Big Picture

Each measurement surface protects a different part of the business.

  Measurement          Protects
  -------------------- --------------------
  Theo Integrity       comp accuracy
  Audit Traceability   regulatory risk
  Telemetry Coverage   revenue visibility
  Loyalty Liability    reward exposure

Together they allow PT‑2 to answer the most important operational
question:

**"What is actually happening financially on the casino floor?"**

------------------------------------------------------------------------

# The Simple Explanation

For a General Manager, PT‑2 ultimately provides this:

> A system that shows exactly how much money the tables generate, how
> much is reinvested into players, how much activity is invisible, and
> whether the property can withstand regulatory scrutiny.

That clarity is where the real value lies.
