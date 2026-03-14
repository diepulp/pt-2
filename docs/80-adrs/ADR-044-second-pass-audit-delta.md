# ADR-044 Second-Pass Audit Delta

## Verdict

**Approved after delta, with one wording refinement recommended.**

The revised ADR is now materially sound and aligned with the Phase 2 direction artifact. The earlier structural concerns have been addressed:

- D5 is now explicitly frozen intentionally rather than appearing to silently promote a product-policy question into an architectural fact.
- D6 now freezes a concrete debit model instead of leaving redemption semantics vague.
- D7 is better aligned with D6 by separating what is visible company-wide from what is redeemable at the acting property.
- The stale consequences count is corrected to reflect **3 new SECURITY DEFINER RPCs**.

This is no longer a structural audit failure. The remaining issue is semantic precision.

---

## What is now sound

### 1. Phase 2 scope discipline survived translation into the ADR

The ADR still preserves the intended narrowed direction:

- widened RLS reads only for `player_casino` and `player_loyalty`
- scalar extraction for `visit` and `player_exclusion`
- single-casino staff context preserved
- local activation and local redemption remain the mutation model

That keeps the company boundary from leaking into operational tables.

### 2. D5 is no longer an audit objection

Because D5 was intentionally frozen, the earlier complaint is resolved.

The document now properly presents exclusion handling as a consciously frozen decision from the support artifact lineage, rather than an accidental architectural overreach.

### 3. D6 is properly frozen now

The earlier version described “atomic redemption” without clearly specifying **which balance is actually consumed**.

The revised ADR now states a **local-row-only debit model**, which makes the rule operationally legible:

- redemption at Casino B consumes Casino B’s local balance only
- cross-property pooled debiting is explicitly rejected
- provenance remains local
- the mutation boundary remains aligned with the Phase 2 narrowing goal

That is a real correction, not a cosmetic one.

### 4. D7 is materially better aligned

The ADR now distinguishes between:

- a company-visible / cross-property total
- the amount redeemable at the acting property

That prevents the UI surface from implying “everything visible is spendable here.”

### 5. Consequences section is now factually consistent

The prior mismatch around RPC count is fixed.

The revised ADR correctly states that **3 new SECURITY DEFINER RPCs** require review/governance treatment.

---

## Remaining issue

## Terminology risk around `company_total`

The ADR is now internally coherent in behavior, but one phrase still risks misleading future readers and implementers.

### Current tension

The document now freezes:

- company-wide visibility across properties
- local-row-only redemption semantics

That means staff may see something like:

- `company_total = 12,500`
- `redeemable_here = 4,500`

That is valid.

But the term **`company_total`** can still imply a pooled, economically spendable balance unless the reader is paying close attention.

In other words:

- the implementation says: **visible across company, not pooled for redemption**
- the label risks implying: **pooled and company-usable**

That is the only remaining wrinkle.

---

## Recommended refinement

Rename or explicitly qualify `company_total` wherever it may sound pooled.

Preferred alternatives:

- `portfolio_total`
- `company_visible_total`
- `cross_property_total`

If the existing term is retained, the ADR should add one blunt sentence near its first definition:

> `company_total` is a visibility aggregate across sister properties and is **not** itself a pooled redeemable balance.

That single line would kill the ambiguity cleanly.

---

## Final assessment

**Approved after delta.**

The ADR now faithfully expresses the Phase 2 optimized direction and cleanly freezes the previously open D5/D6/D7 questions.

The remaining concern is not architectural drift or execution unsoundness. It is a terminology hazard that could confuse future UI, PRD, or implementation work if left unqualified.

That should be tightened, but it does **not** block approval.
