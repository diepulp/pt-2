# ADR-044 Audit Delta

## Scope of Audit

This audit checks whether **ADR-044: Cross-Property Player Recognition and Loyalty Entitlement** is a faithful architectural result of the supporting Phase 2 direction artifact, **PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION**.

Verdict: **approved with corrections**.

The ADR preserves the core Phase 2 narrowing move, but a few decisions are either over-hardened, under-specified, or internally inconsistent.

---

## Executive Verdict

The ADR is **directionally sound and materially aligned** with the Phase 2 support artifact.

Its architectural spine is intact:

- Phase 2 remains intentionally narrow.
- Company-scoped read broadening is limited to `player_casino` and `player_loyalty`.
- `visit` and `player_exclusion` remain behind SECURITY DEFINER scalar extraction.
- Staff context remains single-casino.
- Loyalty entitlement crosses the company boundary; raw accounting provenance does not.

That matches the support artifact’s central optimization thesis.

What weakens the ADR is not major directional drift, but three more pedestrian sins:

1. it hardens at least one previously open product decision into accepted architectural law,
2. it leaves redemption mechanics semantically incomplete at the exact point where value is consumed,
3. it contains at least one stale internal inconsistency.

So no, the thing is not broken. It is just pretending to be slightly more finished than it really is.

---

## What the ADR Gets Right

### 1. The Phase 2 optimization survived translation

The support artifact argues that the recognition + entitlement workflow only needs:

- **two RLS policy changes**: `player_casino`, `player_loyalty`
- **scalar extraction** for sensitive host-context and safety data
- **no broadening of operational/compliance/financial table RLS**

ADR-044 preserves exactly that architectural move.

### 2. The entitlement boundary is held correctly

The support artifact draws a clean line:

- `player_loyalty` = entitlement state
- `loyalty_ledger` = accounting/provenance

ADR-044 keeps that distinction intact.

That is one of the most important soundness checks in the whole document, and it passes.

### 3. Staff context remains single-casino

The Phase 2 direction explicitly avoids casino switching or multi-casino staff operations. ADR-044 respects that boundary. The company scope is used for recognition and entitlement visibility only, not for shifting operator context.

Good. The tenant model remains controlled instead of metastasizing into “everyone can see everything because portfolio.”

### 4. The fail-closed company path is clearer in the ADR

The support artifact’s policy pattern implies a fail-closed company path through the `EXISTS` clause and `NULLIF(current_setting(...), '')::uuid` pattern.

ADR-044 makes that control more explicit in its security framing. That is a legitimate improvement over the support text, not drift.

---

## Material Issues

## Issue 1 — D5 hardens a previously open product-policy decision

The support artifact treats sister-property exclusion handling as a **required safety signal**, but leaves the actual UX/policy response as an open business/product decision:

- block,
- warn,
- require override,
- or some severity-based handling.

ADR-044 freezes this into **D5: Severity-Based Exclusion Policy** and presents it as accepted decision law.

That is not automatically wrong. It may even be the right policy. But it is a real change in status.

### Why this matters

The ADR is supposed to be the result of the direction outline. Here, it goes beyond narrowing architecture and starts freezing workflow policy.

### Correction

Choose one of these explicitly:

**Option A — Keep D5 in ADR-044, but say so honestly**

> D5 intentionally freezes a previously open product-policy decision because activation and redemption enforcement must be server-side and cannot remain undefined at implementation time.

**Option B — Downgrade D5**

Reframe it as:

> Default policy proposal pending PRD confirmation.

Right now the text quietly promotes itself from architecture to operations policy without admitting that promotion.

---

## Issue 2 — D6 is under-specified where the debit actually happens

This is the biggest substantive problem.

ADR-044 says redemption is local, company-visible entitlement is debited atomically, and the current balance guard is:

```sql
UPDATE player_loyalty
SET current_balance = current_balance - p_amount
WHERE current_balance >= p_amount
```

That is not enough as written if the visible entitlement is a **company total aggregated across multiple property rows**.

ADR-044 D7 explicitly presents a hybrid entitlement surface with:

- `company_total`
- optional per-property breakdown

So the obvious question is: **which row gets debited when Casino B redeems points earned across Casino A + Casino B?**

### Missing decision

The ADR does not specify the debit-allocation model:

- debit only the local property row,
- debit a designated primary row,
- debit by priority order across company rows,
- debit proportionally across rows,
- or treat company entitlement as a separate canonical balance abstraction.

### Why this matters

Without that decision, the redemption contract is not actually semantically complete. It says “atomic” while leaving ambiguous what balance is being consumed.

That is fine for a brainstorm note. It is not fine for an accepted ADR involving value movement.

### Correction

Add one explicit decision under D6:

> **Debit allocation model:** define exactly how company-visible entitlement is consumed when represented across multiple `player_loyalty` rows.

Until that is frozen, D6 is structurally incomplete.

---

## Issue 3 — RPC count inconsistency in Consequences

The support artifact’s optimized surface comparison describes:

- recognition + entitlement RPC
- local activation RPC

ADR-044 adds a third RPC:

- `rpc_lookup_player_company`
- `rpc_activate_player_locally`
- `rpc_redeem_loyalty_locally`

Yet the ADR’s **Negative Consequences** section still says:

> 2 new SECURITY DEFINER RPCs require ADR-018 governance review

That is stale.

### Correction

Change it to:

> 3 new SECURITY DEFINER RPCs require ADR-018 governance review

Plain inconsistency. Nothing mystical. Just wrong.

---

## Issue 4 — “Accepted” is slightly more triumphant than the document warrants

The ADR status is **Accepted**, which is fine only if it means:

- the architectural direction is frozen,
- implementation must now conform to it,
- but some execution semantics are still gated.

That interpretation is defensible.

What is less defensible is reading “Accepted” as “fully semantically closed, no important implementation ambiguity remains.”

Why? Because the ADR itself still has at least two live dependency points:

- the unresolved redemption debit-allocation semantics,
- the `player_exclusion` dependency noted in consequences.

### Correction

The status can remain **Accepted**, but the wording should be tightened to something like:

> **Accepted — architectural direction frozen; implementation remains gated on redemption debit semantics and exclusion dependency closure.**

That would be honest and still decisive.

---

## Issue 5 — Exclusion handling shifts from signal-first to enforcement-first

The support artifact requires that recognition include an exclusion safety signal because recognition without safety awareness is dangerous.

ADR-044 goes further and bakes that signal into **server-side enforcement** for both activation and redemption.

Again: not necessarily wrong. Probably prudent.

But it is not neutral. It is a governance escalation.

### Correction

Make that escalation explicit in rationale:

> The support direction required an exclusion safety signal. ADR-044 freezes server-side enforcement because activation and redemption are privileged actions that cannot rely on client-only interpretation.

That would turn a quiet posture shift into an intentional one.

---

## Recommended Corrections

### Required corrections

1. **Fix RPC count inconsistency**
   - “2 new SECURITY DEFINER RPCs” → **3 new SECURITY DEFINER RPCs**

2. **Freeze debit allocation semantics under D6**
   - define exactly how company-visible balance is consumed across property rows

3. **Clarify D5 status**
   - either explicitly freeze it as an architectural-policy decision,
   - or downgrade it to a default pending product confirmation

4. **Make acceptance language more honest**
   - accepted as direction, not as fully ambiguity-free operational closure

### Strongly recommended corrections

5. **Explicitly state that server-side exclusion enforcement is an intentional escalation from the support artifact’s signal-first posture**

6. **Add one sentence clarifying whether `player_loyalty` cross-property exposure is raw-table visibility or a constrained projection contract**
   - the support artifact stresses projection constraint more explicitly than the ADR

---

## Suggested Patch Language

### Patch 1 — Consequences / Negative

Replace:

> 2 new SECURITY DEFINER RPCs require ADR-018 governance review

With:

> 3 new SECURITY DEFINER RPCs require ADR-018 governance review (`rpc_lookup_player_company`, `rpc_activate_player_locally`, `rpc_redeem_loyalty_locally`)

### Patch 2 — D6 debit semantics

Add:

> **Debit allocation rule:** Because company-visible entitlement is presented as an aggregate across property enrollments, redemption must define which underlying `player_loyalty` row(s) are debited. This ADR must explicitly freeze one model: local-row-only, ordered cross-row debit, proportional debit, or separate canonical company balance.

### Patch 3 — D5 status honesty

Add one line under D5 rationale:

> This decision intentionally freezes an open product-policy question from the Phase 2 support artifact because activation and redemption enforcement cannot be left undefined at implementation time.

### Patch 4 — Status precision

Refine status wording to:

> **Accepted** — architectural direction frozen for Phase 2 implementation; redemption debit semantics and exclusion dependency remain execution-gated.

---

## Final Verdict

**Approved with corrections.**

The ADR does, in fact, emerge from the Phase 2 general direction artifact in a substantially faithful way. The central optimization survived. The company boundary remains narrow. The operational/compliance blast radius is still controlled. The entitlement/accounting distinction holds.

So the foundation is sound.

But the document still needs cleanup before anyone should pretend it is pristine:

- one stale inconsistency,
- one materially under-specified redemption mechanic,
- one product-policy freeze that should be declared instead of quietly absorbed.

In plain terms: the ADR is good enough to keep, but not clean enough to stop auditing.
