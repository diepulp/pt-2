# EXEC-ADR040 Identity Provenance Implementation — Audit Addendum (Fold-In)

> This document folds audit findings into a patch-ready set of improvements for
> `EXEC-ADR040-identity-provenance-implementation.md`.

## Verdict

**Ship with amendments.** The EXEC is a solid scaffold (workstreams, sequencing, scope corrections) but needs a few explicit contracts to avoid CI false-fails and copy/paste drift.

---

## High-Value Fixes to Fold In

### 1) WS2 — Signature preservation must be strict (byte-for-byte)

WS2 indicates “DROP + CREATE” for the 4 inventory RPCs while also stating “signatures unchanged” and “copy exact signatures from PRD-041 migration.”

This is the right intent, but it must be **explicit and enforceable**, because “DROP + CREATE” risks accidental drift in:

- parameter order / names
- DEFAULTs
- return types
- SECURITY DEFINER / invoker
- `SET search_path`
- volatility (`IMMUTABLE/STABLE/VOLATILE`)
- `GRANT EXECUTE`
- comments

#### Fold-in language (WS2 Outputs / Notes)

Add:

- **Signature MUST match byte-for-byte** with the authoritative PRD-041 definitions:
  - parameter names, order, types, defaults
  - return type
  - SECURITY DEFINER (if present)
  - `SET search_path` (if present)
  - volatility
  - `GRANT EXECUTE` and any ownership/privileges
  - comments (optional but recommended)

This prevents reintroducing PostgREST ambiguity and removes “close enough” interpretation.

---

### 2) WS5 — Define precedence between Category A detection and Category B allowlist

WS5 introduces:

- **Check 4**: hard-fail Category A identity parameters (`p_%_staff_id`, `p_%_by_staff_id`)
- **Check 5**: Category B allowlist with governance metadata

But the EXEC does not define **precedence** when patterns overlap.

Even if today Category B params are `p_witnessed_by` etc., future standardization might rename them to `*_staff_id`, which would trip Check 4 unless precedence is explicit.

#### Fold-in language (WS5 Checks)

Add a precedence rule:

- If a parameter matches Category A patterns **and** is explicitly allowlisted as Category B **for that RPC + param name**, then:
  - Check 5 governs, **but only** if the allowlist entry includes:
    - rationale link
    - same-casino validation requirement
    - security test coverage reference

Otherwise it remains Category A and fails Check 4.

Alternative (simpler):

- Exclude allowlisted Category B params from Check 4 matching.

Either is acceptable; choose one and write it down.

---

### 3) WS3 — Zod “unknown key stripping” must be an explicit contract + tested

WS3 claims route changes aren’t needed because Zod parsing strips unknown fields.

That only holds if:

- schemas are not `.passthrough()`
- handlers never forward unvalidated bodies
- the parsing step is actually in the request path for those endpoints

#### Fold-in language (WS3 Validation)

Add:

- Schemas MUST be `.strip()` (default) or `.strict()` (reject unknowns).
- Schemas MUST NOT be `.passthrough()` for these endpoints.
- The handler must parse and use the parsed value (not the raw request).

#### Fold-in test requirement (WS6)

Add at least one integration test:

- send removed identity fields (e.g., `issuedByStaffId` / `awardedByStaffId`) in request body
- assert:
  - request succeeds/fails as expected
  - **no provenance changes** occur in DB/audit records due to those fields

This protects against future schema loosening.

---

### 4) Governance alignment — reconcile ADR DoD vs EXEC scope corrections

The EXEC explicitly removes `rpc_create_financial_txn` and `rpc_create_financial_adjustment` as nonexistent, but ADR-040 DoD still mentions test coverage for `rpc_create_financial_adjustment`.

#### Fold-in action item (WS0 / Scope Corrections / Notes)

Add:

- Update ADR-040 DoD to remove or amend the `rpc_create_financial_adjustment` checkbox to reflect actual scope.

Otherwise ADR and EXEC will stay inconsistent and cause recurring review churn.

---

## Optional Tightening (Nice-to-have)

### WS2 — Mention explicit `search_path` safety when using SECURITY DEFINER

If any of the rewritten RPCs are SECURITY DEFINER, require an explicit safe `SET search_path` (e.g., `public`) to avoid footguns.

---

## Summary

Apply these amendments before execution:

1. WS2: enforce signature preservation **byte-for-byte**
2. WS5: define explicit precedence between Category A detection and Category B allowlist
3. WS3: make Zod behavior an explicit contract + add an integration test for ignored removed identity fields
4. Align ADR DoD with EXEC scope corrections (`rpc_create_financial_adjustment`)

These changes reduce regression risk, prevent CI false positives, and keep enforcement aligned with the policy the ADR claims is in place.
